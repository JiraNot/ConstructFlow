import { familyHatchSegments } from './hatch.js'
import { evaluateFamilyExpression as scalar, resolveFamilyParameters, validateFamilyDefinition, legacyTypeUuid, resolveOpeningVerticalExtent, type FamilyDefinition, type FamilyPath, type FamilyInstanceData, type InteriorFurnitureKind, type ProjectDocument, type SmartObject } from '@constructflow/project-model'
import { extrudeWithVoids, extrude, type Triangle, type Vec3, type Vec2 } from '@constructflow/geometry-kernel'
import { domainCommand, output, type DomainOutput } from '@constructflow/module-sdk'
import type { CommandHandlerContext, CommandBusResult } from '@constructflow/command-schema'
export { builtInFurnitureFamilies, createFamilyTemplate } from './templates.js'
import { builtInFurnitureFamilies } from './templates.js'

export interface EvaluatedFamilyPath extends Omit<FamilyPath, 'points' | 'voids'> { points: Vec2[]; voids?: Vec2[][] }
export interface EvaluatedFamilyPart { id: string; color: string; triangles: Triangle[]; uvs?: [number, number][]; texture_data_url?: string; roughness?: number; metalness?: number }
export interface EvaluatedFamily { parameters: Record<string, number>; paths: EvaluatedFamilyPath[]; parts: EvaluatedFamilyPart[] }
export function evaluateFamily(family: FamilyDefinition, typeId?: string, overrides: Record<string, number> = {}): EvaluatedFamily {
  const parameters = resolveFamilyParameters(family, typeId, overrides)
  const paths = family.paths.map(path => ({ ...path, points: path.points.map(point => point.map(value => scalar(value, parameters)) as Vec2), voids:path.voids?.map(ring=>ring.map(point=>point.map(value=>scalar(value,parameters)) as Vec2)) }))
  const parts: EvaluatedFamilyPart[] = family.extrusions.map(form => {
    const profile = paths.find(path => path.id === form.profile_id)
    if (!profile?.closed || profile.points.length < 3) throw new Error('Extrusion profile ต้องเป็นเส้นปิด')
    const start = scalar(form.start, parameters), end = scalar(form.end, parameters)
    if (end <= start) throw new Error('Extrusion ต้องมีระยะปลายมากกว่าระยะเริ่ม')
    const triangles = (profile.voids?.length ? extrudeWithVoids(profile.points,profile.voids,start,end) : extrude(profile.points,start,end)).map(triangle => triangle.map(([u, v, w]) => form.plane === 'xz' ? [u, -w, v] : form.plane === 'yz' ? [w, u, v] : [u, v, w]) as Triangle)
    return { id: form.id, color: form.color, triangles }
  })
  let generatedFaceCount = parts.reduce((count, part) => count + part.triangles.length, 0)
  for (const mesh of family.meshes) {
    const dimensions = [parameters.W ?? 1, parameters.D ?? 1, parameters.H ?? 1]
    const reference = mesh.reference_size_mm ?? dimensions
    const behavior = mesh.resize_behavior ?? ['stretch', 'stretch', 'stretch']
    const ratios = dimensions.map((value, axis) => value / reference[axis])
    const fitRatios = ratios.filter((_, axis) => behavior[axis] === 'fit')
    const fitRatio = fitRatios.length ? Math.min(...fitRatios) : 1
    const scale = mesh.scale.map((value, axis) => {
      const requested = scalar(value, parameters)
      if (behavior[axis] === 'stretch') return requested
      const adjustment = behavior[axis] === 'fit' ? fitRatio / ratios[axis] : 1 / ratios[axis]
      return requested * adjustment
    })
    const offset = mesh.offset.map(value => scalar(value, parameters))
    const points = mesh.vertices.map(point => point.map((v, index) => v * scale[index] + offset[index]) as Vec3)
    const bounds = points.reduce((result, point) => ({ min: result.min.map((value, axis) => Math.min(value, point[axis])), max: result.max.map((value, axis) => Math.max(value, point[axis])) }), { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })
    const extents = bounds.max.map((value, axis) => Math.max(0.001, value - bounds.min[axis]))
    const copiesByAxis = behavior.map((mode, axis) => {
      if (mode !== 'repeat') return [0]
      const spacing = mesh.repeat_spacing_mm?.[axis] ?? 0
      const count = Math.max(1, Math.min(200, Math.floor((dimensions[axis] + spacing) / (extents[axis] + spacing))))
      const total = count * extents[axis] + (count - 1) * spacing
      const start = (dimensions[axis] - total) / 2 - bounds.min[axis]
      return Array.from({ length: count }, (_, index) => start + index * (extents[axis] + spacing))
    })
    const copyCount = copiesByAxis.reduce((count, positions) => count * positions.length, 1)
    generatedFaceCount += mesh.faces.length * copyCount
    if (generatedFaceCount > 300_000) throw new Error('ลายซ้ำสร้างรูปทรงเกิน 300,000 หน้า · ลดจำนวนหรือใช้ช่องไฟมากขึ้น')
    const triangles: Triangle[] = [], uvs: [number, number][] = []
    for (const x of copiesByAxis[0]) for (const y of copiesByAxis[1]) for (const z of copiesByAxis[2]) {
      const translate: Vec3 = [x, y, z]
      const copy = points.map(point => [point[0] + translate[0], point[1] + translate[1], point[2] + translate[2]] as Vec3)
      for (const face of mesh.faces) {
        triangles.push(face.map(index => copy[index]) as Triangle)
        if (mesh.uvs) uvs.push(...face.map(index => mesh.uvs![index]))
      }
    }
    parts.push({ id: mesh.id, color: mesh.color, triangles, ...(mesh.uvs ? { uvs } : {}), texture_data_url:mesh.texture_data_url, roughness:mesh.roughness, metalness:mesh.metalness })
  }
  return { parameters, paths, parts }
}
/** Derive an orthographic front or side elevation from a family's evaluated 3D parts. */
export function projectFamilyElevation(family: FamilyDefinition, typeId: string | undefined, view: 'front' | 'side'): EvaluatedFamilyPath[] {
  const geometry = evaluateFamily(family, typeId)
  const triangles = geometry.parts.flatMap(part => part.triangles)
  if (!triangles.length) {
    const horizontal = view === 'front' ? geometry.parameters.W : geometry.parameters.D
    const height = geometry.parameters.H
    if (horizontal === undefined || height === undefined || horizontal <= 0 || height <= 0) return []
    const corners: Vec2[] = [[0, 0], [horizontal, 0], [horizontal, height], [0, height]]
    return corners.map((point, index) => ({
      id: `elevation-${view}-${index}`,
      points: [point, corners[(index + 1) % corners.length]],
      closed: false,
      view,
      layer: 'ขอบเขตโดยประมาณ',
      color: '#94a3b8',
      lineweight_mm: 0.18,
      dash: [5, 3],
    }))
  }
  const horizontalAxis = view === 'front' ? 0 : 1
  const depthAxis = view === 'front' ? 1 : 0
  const project = (point: Vec3): Vec2 => [point[horizontalAxis], point[2]]
  const edgeMap = new Map<string, { a: Vec2; b: Vec2; normals: Vec3[] }>()
  const pointKey = (point: Vec2) => point.map(value => Math.round(value * 100) / 100).join(',')

  for (const triangle of triangles) {
    const [a, b, c] = triangle
    const ab = b.map((value, axis) => value - a[axis]) as Vec3
    const ac = c.map((value, axis) => value - a[axis]) as Vec3
    const raw: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
    const magnitude = Math.hypot(...raw)
    if (magnitude < 1e-8) continue
    const normal = raw.map(value => value / magnitude) as Vec3
    for (let index = 0; index < 3; index++) {
      const start = triangle[index], end = triangle[(index + 1) % 3]
      const p = project(start), q = project(end)
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01) continue
      const startKey = pointKey(p), endKey = pointKey(q)
      const [first, second] = [startKey, endKey].sort()
      const key = `${first}|${second}`
      const edge = edgeMap.get(key) ?? {
        a: first === startKey ? p : q,
        b: first === startKey ? q : p,
        normals: [],
      }
      edge.normals.push(normal)
      edgeMap.set(key, edge)
    }
  }

  const paths: EvaluatedFamilyPath[] = []
  for (const edge of edgeMap.values()) {
    const feature = edge.normals.length === 1 || edge.normals.slice(1).some(normal =>
      Math.abs(normal.reduce((sum, value, axis) => sum + value * edge.normals[0][axis], 0)) < 0.9999,
    )
    if (!feature) continue
    paths.push({
      id: `elevation-${view}-${paths.length}`,
      points: [edge.a, edge.b],
      closed: false,
      view,
      layer: 'รูปด้านจาก 3D',
      color: '#475569',
      lineweight_mm: 0.18,
    })
  }
  return paths
}

export function availableFamilies(project: ProjectDocument): FamilyDefinition[] {
  const all = new Map(builtInFurnitureFamilies.map(family => [family.id, family]))
  for (const family of project.families ?? []) all.set(family.id, family)
  return [...all.values()]
}
export function objectFamily(project: ProjectDocument, object: SmartObject): FamilyDefinition | undefined {
  const data = object.module_data as Record<string, unknown>
  if (typeof data.family_id === 'string') return availableFamilies(project).find(family => family.id === data.family_id)
  if (object.object_type === 'interior.furniture') return availableFamilies(project).find(family => family.id === legacyTypeUuid('interior.furniture', String(data.kind), String(data.kind)))
  return undefined
}
function computeObjectFamilyGeometry(project: ProjectDocument, object: SmartObject) {
  const family = objectFamily(project, object)
  if (!family) return undefined
  const data = object.module_data as Record<string, unknown>
  const overrides = { ...(data.family_parameters as Record<string, number> ?? {}) }
  if (!data.family_id && object.object_type === 'interior.furniture') Object.assign(overrides, { W: Number(data.width_mm), D: Number(data.depth_mm), H: Number(data.height_mm) })
  const geometry = evaluateFamily(family, data.family_type_id as string | undefined, overrides)
  let origin = (data.location_mm as Vec3 | undefined) ?? [0, 0, 0], angle = Number(data.rotation_deg ?? 0) * Math.PI / 180
  if (object.object_type === 'door_window.door' || object.object_type === 'door_window.window') {
    const host = project.objects[String(data.wall_id)]?.module_data as Record<string, unknown> | undefined
    const start = host?.start_point_mm as Vec3 | undefined, end = host?.end_point_mm as Vec3 | undefined
    if (start && end) {
      angle = Math.atan2(end[1] - start[1], end[0] - start[0])
      const offset = Number(data.offset_along_wall_mm), width = Number(data.width_mm), depth = geometry.parameters.D ?? Number(host?.thickness_mm ?? 100)
      origin = [start[0] + Math.cos(angle) * (offset - width / 2) + Math.sin(angle) * depth / 2, start[1] + Math.sin(angle) * (offset - width / 2) - Math.cos(angle) * depth / 2, resolveOpeningVerticalExtent(project, data as never)?.base_elevation_mm ?? origin[2]]
    }
  }
  const handing=String(data.handing??'left_in'),referenceHanding=family.source?.door_handing??'left_in'
  const mirrorX=object.object_type==='door_window.door'&&handing.startsWith('left')!==referenceHanding.startsWith('left')
  const mirrorY=object.object_type==='door_window.door'&&handing.endsWith('_in')!==referenceHanding.endsWith('_in')
  const transform = ([u, v, z]: Vec3): Vec3 => {const x=mirrorX?(geometry.parameters.W??0)-u:u,y=mirrorY?(geometry.parameters.D??0)-v:v;return [origin[0] + x * Math.cos(angle) - y * Math.sin(angle), origin[1] + x * Math.sin(angle) + y * Math.cos(angle), origin[2] + z]}
  return { ...geometry, family, origin, angle, transform, worldPaths: geometry.paths.filter(path => path.view === 'plan' && path.visible !== false).map(path => ({ ...path, points: path.points.map(([x, y]) => transform([x, y, 0])) })), worldParts: geometry.parts.map(part => ({ ...part, ...(part.uvs&&mirrorX!==mirrorY?{uvs:part.uvs.map((_,index,all)=>all[index-index%3+2-index%3])}:{}), triangles: part.triangles.map(triangle => (mirrorX!==mirrorY?[...triangle].reverse():triangle).map(transform) as Triangle) })) }
}
const geometryCache = new WeakMap<ProjectDocument, Map<SmartObject, ReturnType<typeof computeObjectFamilyGeometry>>>()
export function objectFamilyGeometry(project: ProjectDocument, object: SmartObject) {
  let cache = geometryCache.get(project)
  if (!cache) { cache = new Map(); geometryCache.set(project, cache) }
  if (cache.has(object)) return cache.get(object)
  const geometry = computeObjectFamilyGeometry(project, object)
  cache.set(object, geometry)
  return geometry
}
export function familyOutputs(project: ProjectDocument): DomainOutput[] {
  return Object.values(project.objects).flatMap(object => {
    const geometry = objectFamilyGeometry(project, object)
    if (!geometry) return []
    const out = output(object, object.module_data)
    out.paths = geometry.worldPaths.map(path => path.closed ? [...path.points, path.points[0]] : path.points)
    for (const path of geometry.paths) if (path.view==='plan' && path.visible!==false && path.closed && path.hatch) for (const [a,b] of familyHatchSegments(path.points,path.hatch,path.voids??[])) out.paths.push([geometry.transform([...a,0]),geometry.transform([...b,0])])
    for (const path of geometry.paths) if(path.view==='plan'&&path.visible!==false) for(const ring of path.voids??[]) out.paths.push([...ring,ring[0]].map(p=>geometry.transform([...p,0])))
    out.meshes = geometry.worldParts.flatMap(part => part.triangles)
    out.schedule = { Family: geometry.family.name, Type: geometry.family.types.find(type => type.id === (object.module_data as Record<string, unknown>).family_type_id)?.name ?? geometry.family.types[0]?.name ?? '', ...geometry.parameters }
    out.quantities = object.object_type === 'family.instance' && geometry.family.category !== 'detail' ? [{ classification: `family.${geometry.family.category}`, description: geometry.family.name, quantity: 1, unit: 'pcs', formula: '1 instance' }] : []
    return [out]
  })
}

function refreshObject(project: ProjectDocument, object: SmartObject) {
  const data = object.module_data as Record<string, unknown>
  const family = availableFamilies(project).find(family => family.id === data.family_id)
  if (!family) throw new Error('ไม่พบ Family')
  const values = resolveFamilyParameters(family, data.family_type_id as string | undefined, data.family_parameters as Record<string, number> | undefined)
  for (const [name, key] of [['W', 'width_mm'], ['D', 'depth_mm'], ['H', 'height_mm']]) if (values[name] !== undefined) data[key] = values[name]
  const evaluated = evaluateFamily(family, data.family_type_id as string | undefined, data.family_parameters as Record<string, number> | undefined)
  const points = [...evaluated.paths.filter(path=>path.view==='plan').flatMap(path=>path.points.map(([x,y])=>[x,y,0] as Vec3)), ...evaluated.parts.flatMap(part=>part.triangles.flat())]
  if (points.length) {
    const bounds=points.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])] as [number,number,number,number],[Infinity,Infinity,-Infinity,-Infinity]); data.family_bounds_mm=bounds
    data.width_mm ??= Math.max(1,bounds[2]-bounds[0]); data.depth_mm ??= Math.max(1,bounds[3]-bounds[1])
  }
  if (object.object_type === 'door_window.door' || object.object_type === 'door_window.window') {
    data.instance_overrides = {...data.instance_overrides as object, width_mm:values.W, height_mm:values.H}
    if (values.W === undefined || values.H === undefined) throw new Error('Family ประตู/หน้าต่างต้องมี W และ H')
    const host = project.objects[String(data.wall_id)]?.module_data as Record<string, unknown> | undefined
    if (!host) throw new Error('ช่องเปิดต้องมีผนังรองรับ')
    const a = host.start_point_mm as Vec3, b = host.end_point_mm as Vec3, length = Math.hypot(b[0] - a[0], b[1] - a[1]), offset = Number(data.offset_along_wall_mm)
    if (offset - values.W / 2 < 0 || offset + values.W / 2 > length) throw new Error('Family กว้างเกินตำแหน่งที่วางบนผนัง')
  }
}
export function executeFamilyCommand(context: CommandHandlerContext): CommandBusResult | undefined {
  const { updated, input, commandName, command_id, now, envelope } = context
  const success = (ids: string[] = []): CommandBusResult => ({ result: { status: 'success', command_id, command_name: commandName, affected_object_ids: ids }, updatedProject: updated, emittedEnvelope: envelope })
  if (commandName === 'SaveFamily') {
    validateFamilyDefinition(input.family)
    const family = structuredClone(input.family)
    for(const typeId of family.types.length?family.types.map(type=>type.id):[undefined]) evaluateFamily(family,typeId)
    const list = [...(updated.families ?? [])], index = list.findIndex(item => item.id === family.id)
    if (index < 0) list.push(family); else list[index] = family
    updated.families = list
    for(const type of updated.types)if(type.parameters.family_id===family.id){
      const values=resolveFamilyParameters(family,type.parameters.family_type_id as string|undefined)
      if(values.W!==undefined)type.parameters.width_mm=values.W
      if(values.H!==undefined)type.parameters.height_mm=values.H
    }
    const affected = Object.values(updated.objects).filter(object => (object.module_data as Record<string, unknown>).family_id === family.id || (object.object_type === 'interior.furniture' && !(object.module_data as Record<string, unknown>).family_id && objectFamily(updated, object)?.id === family.id))
    for (const object of affected) {
      const data = object.module_data as Record<string, unknown>
      if (!data.family_id) { data.family_id = family.id; data.family_parameters = Object.fromEntries(family.parameters.filter(parameter => parameter.scope === 'instance').map(parameter => [parameter.name, parameter.name === 'W' ? data.width_mm : parameter.name === 'D' ? data.depth_mm : parameter.name === 'H' ? data.height_mm : parameter.value])) }
      data.family_parameters = Object.fromEntries(Object.entries(data.family_parameters as Record<string, number> ?? {}).filter(([key]) => family.parameters.some(p=>p.name===key&&p.scope==='instance'&&!p.formula?.trim())))
      refreshObject(updated, object); object.updated_at = now; object.revision_meta = {...object.revision_meta, dirty_quantity:true, dirty_drawing:true}
    }
    return success(affected.map(object => object.id))
  }
  if (commandName === 'DeleteFamily') {
    if (Object.values(updated.objects).some(object => (object.module_data as Record<string, unknown>).family_id === input.family_id)) throw new Error('Family นี้ยังมี Instance ใช้งานอยู่')
    if (!updated.families?.some(family => family.id === input.family_id)) throw new Error('ไม่พบ Family ที่จะลบ')
    updated.families = updated.families.filter(family => family.id !== input.family_id)
    return success()
  }
  if (commandName === 'PlaceFamilyInstance') {
    const family = availableFamilies(updated).find(family => family.id === input.family_id)
    if (!family) throw new Error('ไม่พบ Family')
    if (family.category === 'door' || family.category === 'window') throw new Error('ใช้เครื่องมือประตู/หน้าต่างเพื่อวาง Family บนผนัง')
    if (!updated.families?.some(item => item.id === family.id)) updated.families = [...(updated.families ?? []), structuredClone(family)]
    const result = domainCommand(context, 'family.instance', 'constructflow.family', data => {
      if (!Array.isArray(data.location_mm) || data.location_mm.length !== 3 || !data.location_mm.every(Number.isFinite) || !Number.isFinite(Number(data.rotation_deg ?? 0))) throw new Error('ตำแหน่งหรือมุม Family ไม่ถูกต้อง')
      resolveFamilyParameters(family, data.family_type_id as string | undefined, data.family_parameters as Record<string, number> | undefined)
      return { family_id: family.id, family_type_id: data.family_type_id, family_parameters: data.family_parameters ?? {}, mark: String(data.mark ?? family.name), location_mm: data.location_mm, rotation_deg: Number(data.rotation_deg ?? 0), level_id: String(data.level_id ?? updated.project.active_level_id) }
    })
    for (const id of result.result.affected_object_ids) refreshObject(updated, updated.objects[id])
    return result
  }
  if (commandName === 'AttachFamily' || commandName === 'UpdateFamilyInstance') {
    const object = updated.objects[String(input.object_id)], family = availableFamilies(updated).find(family => family.id === (input.family_id ?? (object?.module_data as Record<string, unknown> | undefined)?.family_id))
    if (!object || !family) throw new Error('ไม่พบวัตถุหรือ Family')
    if ((object.object_type === 'door_window.door' && family.category !== 'door') || (object.object_type === 'door_window.window' && family.category !== 'window') || (family.category === 'door' && object.object_type !== 'door_window.door') || (family.category === 'window' && object.object_type !== 'door_window.window')) throw new Error('หมวด Family ไม่ตรงกับวัตถุ')
    if (!['family.instance', 'interior.furniture', 'interior.cabinet_run', 'door_window.door', 'door_window.window'].includes(object.object_type)) throw new Error('วัตถุหมวดนี้ยังเปลี่ยน Family ไม่ได้')
    if (!updated.families?.some(item => item.id === family.id)) updated.families = [...(updated.families ?? []), structuredClone(family)]
    const data = object.module_data as Record<string, unknown>
    const prior = data.family_id === family.id ? data.family_parameters as Record<string, number> ?? {} : {}
    Object.assign(data, { family_id: family.id, family_type_id: input.family_type_id ?? (data.family_id === family.id ? data.family_type_id : undefined), family_parameters: { ...prior, ...(input.family_parameters as object ?? {}) } })
    if (input.location_mm !== undefined) { if (!Array.isArray(input.location_mm) || input.location_mm.length !== 3 || !input.location_mm.every(Number.isFinite)) throw new Error('ตำแหน่งไม่ถูกต้อง'); data.location_mm = [...input.location_mm] }
    if (input.rotation_deg !== undefined) { if (!Number.isFinite(input.rotation_deg)) throw new Error('มุมไม่ถูกต้อง'); data.rotation_deg = input.rotation_deg }
    refreshObject(updated, object); object.updated_at = now
    return success([object.id])
  }
  return undefined
}

export function familyInstanceBounds(project: ProjectDocument, object: SmartObject): [number, number, number, number] | undefined {
  const geometry = objectFamilyGeometry(project, object)
  const points = geometry?.worldPaths.flatMap(path => path.points) ?? []
  if (!points.length) return undefined
  return points.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])] as [number, number, number, number], [Infinity, Infinity, -Infinity, -Infinity])
}


/** Editable top-facing feature edges; coplanar triangulation edges are omitted. */
export function projectFamilyPlan(family: FamilyDefinition, typeId?: string): FamilyPath[] {
  const geometry=evaluateFamily(family,typeId), edges=new Map<string,{a:Vec2;b:Vec2;normal:Vec3;count:number;feature:boolean}>()
  for(const part of geometry.parts)for(const [a,b,c]of part.triangles){
    const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]),raw:Vec3=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...raw)
    if(length<1e-8||raw[2]/length<.01)continue
    const normal=raw.map(v=>v/length) as Vec3
    for(const [p,q]of [[a,b],[b,c],[c,a]]){
      if(Math.hypot(p[0]-q[0],p[1]-q[1])<.01)continue
      const endpoints=[p.map(v=>v.toFixed(3)).join(','),q.map(v=>v.toFixed(3)).join(',')].sort(),key=endpoints.join('|'),old=edges.get(key)
      if(old){old.count++;old.feature ||= Math.abs(old.normal.reduce((s,v,i)=>s+v*normal[i],0))<.9999}
      else edges.set(key,{a:[p[0],p[1]],b:[q[0],q[1]],normal,count:1,feature:false})
    }
  }
  const w=geometry.parameters.W??1,d=geometry.parameters.D??1,seen=new Set<string>(),paths:FamilyPath[]=[]
  for(const edge of edges.values())if(edge.count===1||edge.feature){
    const key=[edge.a.map(v=>v.toFixed(2)).join(','),edge.b.map(v=>v.toFixed(2)).join(',')].sort().join('|');if(seen.has(key))continue;seen.add(key)
    paths.push({id:`projection-${paths.length}`,points:[edge.a,edge.b].map(([x,y])=>[`W*${x/w}`,`D*${y/d}`]),closed:false,view:'plan',layer:'รูปฉายจาก 3D',color:'#475569',lineweight_mm:.18})
    if(paths.length>15000)throw new Error('รูปฉายเกิน 15,000 เส้น กรุณาลดรายละเอียดโมเดล')
  }
  return paths
}

export function validateFamilyProject(project: ProjectDocument) {
  for(const family of project.families??[])for(const typeId of family.types.length?family.types.map(type=>type.id):[undefined])evaluateFamily(family,typeId)
  familyOutputs(project)
}

/** Export edited vectors as Model Space DXF at 1:1 mm. */
export function exportFamilyDxf(family: FamilyDefinition, typeId?: string, view: 'plan'|'front'|'side' = 'plan'): string {
  const geometry=evaluateFamily(family,typeId),pairs:string[]=[],pair=(code:number,value:unknown)=>pairs.push(String(code),String(value)),origin=family.category==='detail'?family.source?.origin_mm??[0,0]:[0,0]
  pair(0,'SECTION');pair(2,'HEADER');pair(9,'$INSUNITS');pair(70,4);pair(0,'ENDSEC')
  pair(0,'SECTION');pair(2,'TABLES');pair(0,'TABLE');pair(2,'LAYER')
  for(const layer of new Set(geometry.paths.flatMap(path=>[path.layer,path.layer+'-HATCH']))){pair(0,'LAYER');pair(2,layer);pair(70,0);pair(62,7);pair(6,'CONTINUOUS')}
  pair(0,'ENDTAB');pair(0,'ENDSEC');pair(0,'SECTION');pair(2,'ENTITIES')
  for(const path of geometry.paths.filter(path=>path.view===view&&path.visible!==false)){
    if(path.text){pair(0,'TEXT');pair(8,path.layer);pair(10,path.points[0][0]+origin[0]);pair(20,path.points[0][1]+origin[1]);pair(40,Math.max(1,Math.abs(path.points[1][1]-path.points[0][1])));pair(1,path.text);continue}
    pair(0,'LWPOLYLINE');pair(8,path.layer);pair(420,parseInt(path.color.slice(1),16));pair(370,Math.round(path.lineweight_mm*100));pair(90,path.points.length);pair(70,path.closed?1:0)
    for(const [x,y]of path.points){pair(10,x+origin[0]);pair(20,y+origin[1])}
    for(const hole of path.voids??[]){pair(0,'LWPOLYLINE');pair(8,path.layer);pair(90,hole.length);pair(70,1);for(const[x,y]of hole){pair(10,x+origin[0]);pair(20,y+origin[1])}}
    if(path.closed&&path.hatch&&path.hatch.pattern!=='none'&&path.hatch.pattern!=='solid'){
      for(const[a,b]of familyHatchSegments(path.points,path.hatch,path.voids??[])) {pair(0,'LINE');pair(8,path.layer+'-HATCH');pair(420,parseInt(path.hatch.color.slice(1),16));pair(10,a[0]+origin[0]);pair(20,a[1]+origin[1]);pair(11,b[0]+origin[0]);pair(21,b[1]+origin[1])}
    }
    if(path.closed&&path.hatch&&path.hatch.pattern==='solid'){
      pair(0,'HATCH');pair(8,path.layer);pair(420,parseInt(path.hatch.color.slice(1),16));pair(10,0);pair(20,0);pair(30,0);pair(210,0);pair(220,0);pair(230,1);pair(2,'SOLID');pair(70,1);pair(71,0)
      const rings=[path.points,...(path.voids??[])];pair(91,rings.length)
      for(const [index,ring]of rings.entries()){
        pair(92,index===0?3:2);pair(72,0);pair(73,1);pair(93,ring.length)
        for(const[x,y]of ring){pair(10,x+origin[0]);pair(20,y+origin[1])}pair(97,0)
      }
      pair(75,0);pair(76,1);pair(98,0)
    }
  }
  pair(0,'ENDSEC');pair(0,'EOF');return pairs.join('\n')+'\n'
}
export { parseFamilyPat, familyHatchSegments } from './hatch.js'
export type { NamedFamilyPattern } from './hatch.js'

export function translateFamilyPath(path: FamilyPath, delta: Vec2): FamilyPath {
  const move=(ring:import('@constructflow/project-model').FamilyPoint2[])=>ring.map(point=>point.map((value,axis)=>typeof value==='number'?value+delta[axis]:`(${value})+(${delta[axis]})`) as import('@constructflow/project-model').FamilyPoint2)
  return {...path,points:move(path.points),...(path.voids?{voids:path.voids.map(move)}:{})}
}
export function familyCirclePoints(center:Vec2,radius:number):Vec2[]{
  if(!Number.isFinite(radius)||radius<=0)throw new Error('วงกลมต้องมีรัศมีเป็นบวก')
  return Array.from({length:64},(_,i)=>[center[0]+Math.cos(i*Math.PI/32)*radius,center[1]+Math.sin(i*Math.PI/32)*radius])
}

/** Existing native edit tools and family parameters share one dimensional contract. */
export function reconcileFamilyDimensions(previous:ProjectDocument,project:ProjectDocument) {
  for(const object of Object.values(project.objects)){
    const data=object.module_data as Record<string,unknown>,old=previous.objects[object.id]?.module_data as Record<string,unknown>|undefined
    if(!data.family_id||!old||old.family_id!==data.family_id)continue
    const family=objectFamily(project,object);if(!family)continue
    const values=resolveFamilyParameters(family,data.family_type_id as string|undefined,data.family_parameters as Record<string,number>|undefined),overrides={...data.family_parameters as Record<string,number>??{}}
    let changed=false
    for(const[key,field]of [['W','width_mm'],['D','depth_mm'],['H','height_mm']]){
      if(data[field]===old[field]||typeof data[field]!=='number'||data[field]===values[key])continue
      const parameter=family.parameters.find(parameter=>parameter.name===key);if(!parameter)continue
      if(parameter.scope!=='instance'||parameter.formula?.trim())throw new Error(`แก้ ${parameter.label} ที่ Type/สูตรใน Family Studio`)
      overrides[key]=Number(data[field]);changed=true
    }
    if(changed){data.family_parameters=overrides;refreshObject(project,object)}
  }
}
