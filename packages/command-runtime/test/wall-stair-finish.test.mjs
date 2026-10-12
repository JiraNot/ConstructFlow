import test from 'node:test'
import assert from 'node:assert/strict'
import { CommandBus } from '../dist/index.js'
import { createEmptyProjectDocument, serializeProject, deserializeProject } from '../../project-model/dist/index.js'
import { getWallSolidProfiles, wallProfileAreaMm2 } from '../../architecture-engine/dist/index.js'
import { buildProjectRepresentations3D, getRepresentationTriangles, getElevationFinishSurfaces, getPlanFinishBoundaries, clipElevationEdgeBySurfaces, getElevationVisibleWallIds, getElevationVisibleOpeningIds } from '../../representation-engine/dist/index.js'
import { calculateTakeoff } from '../../takeoff-engine/dist/index.js'

const execute = (project, name, input) => {
  const result = CommandBus.execute(project, name, input)
  assert.equal(result.result.status, 'success', JSON.stringify(result.result))
  return result.updatedProject
}
function fixture() {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  project.levels.find(l=>l.id===project.project.active_level_id).elevation_mm=0
  const type = project.types.find(t=>t.object_type==='architecture.wall')
  Object.assign(type.parameters,{thickness_mm:105,masonry_thickness_mm:75,plaster_inside_thickness_mm:15,plaster_outside_thickness_mm:15,plaster_inside_material:'cement_plaster',plaster_outside_material:'cement_plaster'})
  const wallId = crypto.randomUUID(), stairId = crypto.randomUUID()
  project = execute(project,'CreateWall',{id:wallId,type_id:type.id,mark:type.name,start_point_mm:[0,500,0],end_point_mm:[3750,500,0],thickness_mm:75,height_mm:3200,level_id:project.project.active_level_id,fit_to_stair:true})
  project = execute(project,'CreateStair',{id:stairId,mark:'ST1',stair_type:'straight',start_point_mm:[0,0,0],level_id:project.project.active_level_id,total_rise_mm:3200,num_risers:16,tread_depth_mm:250,width_mm:1000,landing_depth_mm:1000,has_handrail:false})
  return {project,wallId,stairId}
}
test('wall stair setting survives file roundtrip; canonical profile drives both mesh and phased BOQ',()=>{
  const {project,wallId}=fixture()
  const restored=deserializeProject(serializeProject(project))
  assert.equal(restored.objects[wallId].module_data.fit_to_stair,true)
  const area=wallProfileAreaMm2(getWallSolidProfiles(restored,restored.objects[wallId]))/1e6
  assert.ok(Math.abs(area-5.0765625)<1e-8)
  const representation=buildProjectRepresentations3D(restored).objects.find(o=>o.object_id===wallId)
  assert.ok(getRepresentationTriangles(representation).flat().every(p=>p[2]<=2850.001))
  const lines=calculateTakeoff(restored).lines.filter(l=>l.source_object_ids.includes(wallId))
  assert.ok(lines.filter(l=>l.unit==='m2').every(l=>Math.abs(l.quantity-area)<1e-8))
  assert.ok(Math.abs(lines.find(l=>l.unit==='m3').quantity-area*0.075)<1e-8)
})
test('editing plaster preserves the 75 mm core and the held placement face',()=>{
  const {project,wallId}=fixture()
  project.objects[wallId].module_data.placement_reference='left_face'
  const updated=execute(project,'UpdateWallDimensions',{object_id:wallId,thickness_mm:105,plaster_inside_thickness_mm:20})
  const d=updated.objects[wallId].module_data
  assert.equal(d.masonry_thickness_mm,75)
  assert.equal(d.thickness_mm,110)
  assert.equal(d.start_point_mm[1]+d.thickness_mm/2,552.5)
  assert.notEqual(CommandBus.execute(updated,'UpdateWallDimensions',{object_id:wallId,thickness_mm:110,plaster_inside_thickness_mm:-1}).result.status,'success')
})
test('equal coplanar plaster merges across walls/columns; proud columns and different phases keep edges',()=>{
  const {project,wallId}=fixture()
  const wall=project.objects[wallId]
  wall.module_data.fit_to_stair=false
  wall.module_data.start_point_mm=[0,0,0];wall.module_data.end_point_mm=[3000,0,0];wall.module_data.length_mm=3000
  const columnId=crypto.randomUUID()
  project.objects[columnId]={...wall,id:columnId,object_type:'structure.column',module_data:{mark:'C1',location_mm:[1500,-62.5,0],section_mm:[200,200],plaster_thickness_mm:15,material:'reinforced_concrete',level_id:project.project.active_level_id,height_mm:3200}}
  let surfaces=getElevationFinishSurfaces(project,'north')
  const c=surfaces.find(s=>s.object_id===columnId)
  assert.ok(c)
  assert.ok(!c.edges_mm.some(([a,b])=>a[0]===b[0] && a[1]!==b[1]),'flush column has no vertical finish seam')
  project.objects[columnId].module_data.location_mm[1]=0
  surfaces=getElevationFinishSurfaces(project,'north')
  assert.ok(surfaces.find(s=>s.object_id===columnId).edges_mm.some(([a,b])=>a[0]===b[0] && a[1]!==b[1]))
  const outlines=getPlanFinishBoundaries(project).flatMap(s=>s.segments_mm)
  assert.ok(outlines.some(([a,b])=>a[1]===115 && b[1]===115),'plan outline wraps the column plaster')
  project.objects[columnId].module_data.location_mm[1]=-62.5
  project.objects[columnId].created_phase='existing'
  surfaces=getElevationFinishSurfaces(project,'north')
  assert.ok(surfaces.find(s=>s.object_id===columnId).edges_mm.some(([a,b])=>a[0]===b[0]))
})
test('elevation edges behind a finished facade are clipped only where the facade actually exists',()=>{
  const surface={depth_mm:100,polygons_mm:[[[1000,0],[2000,0],[2000,3000],[1000,3000]]]}
  assert.deepEqual(clipElevationEdgeBySurfaces([[0,0,1000],[3000,0,1000]],'north',[surface]),
    [[[0,0,1000],[1000,0,1000]],[[2000,0,1000],[3000,0,1000]]])
  assert.deepEqual(clipElevationEdgeBySurfaces([[0,200,1000],[3000,200,1000]],'north',[surface]),
    [[[0,200,1000],[3000,200,1000]]])
})
test('plan finish outlines obey explicit sheet object scope instead of the active editing floor',()=>{
  const {project,wallId}=fixture()
  const other=structuredClone(project.objects[wallId]);other.id=crypto.randomUUID()
  other.module_data.level_id='other-floor'
  other.module_data.start_point_mm=[10000,0,0];other.module_data.end_point_mm=[14000,0,0]
  project.objects[other.id]=other
  const scoped=getPlanFinishBoundaries(project,new Set([other.id])).flatMap(b=>b.segments_mm)
  assert.ok(scoped.length)
  assert.ok(scoped.flat().every(p=>p[0]>=10000))
})
test('the void above a stair-fitted wall does not hide a rear wall or its window',()=>{
  const {project,wallId}=fixture()
  const rear=structuredClone(project.objects[wallId]);rear.id=crypto.randomUUID()
  Object.assign(rear.module_data,{fit_to_stair:false,start_point_mm:[0,-1000,0],end_point_mm:[3750,-1000,0]})
  project.objects[rear.id]=rear
  const opening={...structuredClone(rear),id:crypto.randomUUID(),object_type:'door_window.window',module_data:{
    mark:'W1',wall_id:rear.id,level_id:project.project.active_level_id,location_mm:[500,-1000,2300],offset_along_wall_mm:500,width_mm:500,height_mm:500,sill_height_mm:2300}}
  project.objects[opening.id]=opening
  assert.ok(getElevationVisibleWallIds(project,'north').has(rear.id))
  assert.ok(getElevationVisibleOpeningIds(project,'north').has(opening.id))
})
