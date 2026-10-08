import React, { useEffect, useRef } from 'react'
import { resolveBeamBaseElevation, resolveColumnVerticalExtent, resolveOpeningVerticalExtent, resolveSlabElevation, resolveWallVerticalExtent, type ProjectDocument } from '@constructflow/project-model'
import { buildProjectRepresentations3D, getRepresentationTriangles } from '@constructflow/representation-engine'

type Vec3 = [number, number, number]
import type { UnderlayConfig } from '../rendering/planRenderer.js'

export type ElevationDirection = 'north' | 'south' | 'east' | 'west' | 'rcp'

interface Props {
  project: ProjectDocument
  direction: ElevationDirection
  selectedId: string | null
  onSelectObject: (id: string | null) => void
  underlay?: UnderlayConfig | null
  onMoveObject?: (id: string, deltaWorldMm: [number,number], deltaZMm: number, verticalIntent: 'move' | 'top') => void
}

/** Orthographic, semantic projection of the project model. The canvas never becomes an editable copy of model edges. */
export const ElevationCanvas: React.FC<Props> = ({ project, direction, selectedId, onSelectObject, underlay, onMoveObject }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitRegions = useRef<Array<{ id: string; x: number; y: number; w: number; h: number }>>([])
  const viewTransform = useRef({ scale: 0.1, reversed: false, isEastWest: false })
  const pointerDown = useRef<{ id: string | null; x: number; y: number; verticalIntent: 'move' | 'top' } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const representations = buildProjectRepresentations3D(project).objects
    const visibleObjectIds = new Set(Object.values(project.objects)
      .filter(object => object.status !== 'archived' && object.removed_phase == null)
      .map(object => object.id))
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const width = rect.width, height = rect.height
      ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, width, height)
      if (direction === 'rcp') {
        const rooms=Object.values(project.objects).filter(o=>o.object_type==='architecture.room'&&o.status!=='archived'&&!o.removed_phase)
        const ceilings=Object.values(project.objects).filter(o=>o.object_type==='architecture.ceiling'&&o.status!=='archived'&&!o.removed_phase)
        const points=[...rooms,...ceilings].flatMap(o=>(o.module_data as Record<string,unknown>).boundary_mm as number[][] ?? [])
        if(!points.length){ctx.fillStyle='#64748b';ctx.font='14px sans-serif';ctx.fillText('ยังไม่มีห้องหรือฝ้า · ใช้คำสั่งตรวจจับห้องจากผนังเพื่อเริ่มต้น',24,40);return}
        const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]))
        const pad=50,scale=Math.min((width-pad*2)/Math.max(1000,maxX-minX),(height-pad*2)/Math.max(1000,maxY-minY)),ox=(width-(maxX-minX)*scale)/2,oy=(height-(maxY-minY)*scale)/2
        const sx=(x:number)=>ox+(x-minX)*scale,sy=(y:number)=>height-(oy+(y-minY)*scale)
        if(underlay?.visible&&underlay.image){ctx.save();ctx.globalAlpha=Math.max(.05,Math.min(1,underlay.opacity));const rotation=-(underlay.rotation_deg??0)*Math.PI/180;ctx.translate(sx(underlay.origin_mm[0]),sy(underlay.origin_mm[1]));ctx.rotate(rotation);ctx.drawImage(underlay.image,0,0,underlay.image.width*underlay.scale_mm_per_px*scale,underlay.image.height*underlay.scale_mm_per_px*scale);ctx.restore()}
        hitRegions.current=[]
        for(const room of rooms){const d=room.module_data as Record<string,unknown>,ring=d.boundary_mm as number[][];ctx.beginPath();ring.forEach((p,i)=>i?ctx.lineTo(sx(p[0]),sy(p[1])):ctx.moveTo(sx(p[0]),sy(p[1])));ctx.closePath();ctx.fillStyle='rgba(148,163,184,.08)';ctx.fill();ctx.strokeStyle='#64748b';ctx.lineWidth=1.2;ctx.setLineDash([5,3]);ctx.stroke();ctx.setLineDash([]);const cx=ring.reduce((s,p)=>s+p[0],0)/ring.length,cy=ring.reduce((s,p)=>s+p[1],0)/ring.length;ctx.fillStyle='#334155';ctx.font='12px sans-serif';ctx.fillText(`${String(d.number??'')} ${String(d.name??'Room')} · ${(Number(d.area_mm2??0)/1e6).toFixed(2)} m²`,sx(cx),sy(cy));hitRegions.current.push({id:room.id,x:Math.min(...ring.map(p=>sx(p[0])),...ring.map(p=>sx(p[0]))),y:Math.min(...ring.map(p=>sy(p[1]))),w:Math.max(...ring.map(p=>sx(p[0])))-Math.min(...ring.map(p=>sx(p[0])),...ring.map(p=>sx(p[0]))),h:Math.max(...ring.map(p=>sy(p[1])))-Math.min(...ring.map(p=>sy(p[1])))})}
        for(const ceiling of ceilings){const d=ceiling.module_data as Record<string,unknown>,ring=d.boundary_mm as number[][];ctx.beginPath();ring.forEach((p,i)=>i?ctx.lineTo(sx(p[0]),sy(p[1])):ctx.moveTo(sx(p[0]),sy(p[1])));ctx.closePath();ctx.strokeStyle=selectedId===ceiling.id?'#7c3aed':'#8b5cf6';ctx.lineWidth=1.6;ctx.stroke();const grid=d.grid_mm as number[]|undefined;if(grid&&grid[0]>0&&grid[1]>0){const x0=Math.min(...ring.map(p=>p[0])),x1=Math.max(...ring.map(p=>p[0])),y0=Math.min(...ring.map(p=>p[1])),y1=Math.max(...ring.map(p=>p[1]));ctx.save();ctx.beginPath();ring.forEach((p,i)=>i?ctx.lineTo(sx(p[0]),sy(p[1])):ctx.moveTo(sx(p[0]),sy(p[1])));ctx.closePath();ctx.clip();ctx.strokeStyle='rgba(124,58,237,.36)';ctx.lineWidth=.7;for(let x=Math.ceil(x0/grid[0])*grid[0];x<x1;x+=grid[0]){ctx.beginPath();ctx.moveTo(sx(x),sy(y0));ctx.lineTo(sx(x),sy(y1));ctx.stroke()}for(let y=Math.ceil(y0/grid[1])*grid[1];y<y1;y+=grid[1]){ctx.beginPath();ctx.moveTo(sx(x0),sy(y));ctx.lineTo(sx(x1),sy(y));ctx.stroke()}ctx.restore()}hitRegions.current.push({id:ceiling.id,x:Math.min(...ring.map(p=>sx(p[0]))),y:Math.min(...ring.map(p=>sy(p[1]))),w:Math.max(...ring.map(p=>sx(p[0])))-Math.min(...ring.map(p=>sx(p[0]))),h:Math.max(...ring.map(p=>sy(p[1])))-Math.min(...ring.map(p=>sy(p[1])))})}
        ctx.fillStyle='#64748b';ctx.font='12px sans-serif';ctx.fillText('แปลนฝ้า RCP · คลิกเลือกห้องหรือฝ้า',12,20);return
      }
      const isEastWest = direction === 'east' || direction === 'west'
      const reversed = direction === 'south' || direction === 'west'
      viewTransform.current = { scale: 0.1, reversed, isEastWest }
      const horizontalCoordinate = (p: number[]) => (isEastWest ? Number(p[1] ?? 0) : Number(p[0] ?? 0)) * (reversed ? -1 : 1)
      const items = Object.values(project.objects).filter(object => object.status !== 'archived' && object.removed_phase == null)
      const bounds: number[] = [0, 10000, 0, 3000]
      for (const object of items) {
        const d = object.module_data as Record<string, unknown>
        if (object.object_type === 'architecture.wall') {
          const a = d.start_point_mm as number[], b = d.end_point_mm as number[]
          if (!a || !b) continue
          bounds[0] = Math.min(bounds[0], horizontalCoordinate(a), horizontalCoordinate(b)); bounds[1] = Math.max(bounds[1], horizontalCoordinate(a), horizontalCoordinate(b))
          const extent = resolveWallVerticalExtent(project, object)
          if (!extent) continue
          bounds[2] = Math.min(bounds[2], extent.base_elevation_mm); bounds[3] = Math.max(bounds[3], extent.top_elevation_mm)
        } else if (object.object_type === 'structure.column') {
          const p = d.location_mm as number[]; const levels = project.levels
          if (!p) continue
          const extent = resolveColumnVerticalExtent(project, object);if(!extent)continue;const base=extent.base_elevation_mm,top=extent.top_elevation_mm
          const half = Number((d.section_mm as number[] | undefined)?.[isEastWest ? 0 : 1] ?? 200) / 2
          bounds[0] = Math.min(bounds[0], horizontalCoordinate(p)-half); bounds[1] = Math.max(bounds[1], horizontalCoordinate(p)+half); bounds[2] = Math.min(bounds[2],base); bounds[3] = Math.max(bounds[3],top)
        } else if (object.object_type === 'door_window.door' || object.object_type === 'door_window.window') {
          const p = d.location_mm as number[]; if (!p) continue
          const extent = resolveOpeningVerticalExtent(project, object)
          if (!extent) continue
          bounds[0] = Math.min(bounds[0],horizontalCoordinate(p)-Number(d.width_mm ?? 900)/2); bounds[1] = Math.max(bounds[1],horizontalCoordinate(p)+Number(d.width_mm ?? 900)/2); bounds[2] = Math.min(bounds[2],extent.base_elevation_mm); bounds[3] = Math.max(bounds[3],extent.top_elevation_mm)
        } else if (object.object_type === 'structure.beam') {
          const a=d.start_point_mm as number[], b=d.end_point_mm as number[]; if (!a||!b) continue
          const z=resolveBeamBaseElevation(project,object);if(z===undefined)continue;const depth=Number((d.section_mm as number[]|undefined)?.[1]??400),drop=Number(d.drop_mm??0)
          bounds[0]=Math.min(bounds[0],horizontalCoordinate(a),horizontalCoordinate(b)); bounds[1]=Math.max(bounds[1],horizontalCoordinate(a),horizontalCoordinate(b)); bounds[2]=Math.min(bounds[2],z-drop); bounds[3]=Math.max(bounds[3],z+depth-drop)
        } else if (object.object_type === 'structure.slab') {
          const ring=d.boundary_mm as number[][]; if (!ring) continue
          for(const p of ring){bounds[0]=Math.min(bounds[0],horizontalCoordinate(p));bounds[1]=Math.max(bounds[1],horizontalCoordinate(p))}
          const z=resolveSlabElevation(project, object);if(z===undefined)continue;bounds[2]=Math.min(bounds[2],z-Number(d.thickness_mm??120));bounds[3]=Math.max(bounds[3],z)
        }
      }
      const pad = 48, spanX = Math.max(1000,bounds[1]-bounds[0]), spanZ = Math.max(1000,bounds[3]-bounds[2])
      const scale = Math.min((width-pad*2)/spanX,(height-pad*2)/spanZ)
      viewTransform.current.scale=scale
      const offsetX = (width-spanX*scale)/2, offsetY = (height-spanZ*scale)/2
      const sx=(x:number)=>offsetX+(x-bounds[0])*scale, sy=(z:number)=>height-(offsetY+(z-bounds[2])*scale)
      if(underlay?.visible&&underlay.image){ctx.save();ctx.globalAlpha=Math.max(.05,Math.min(1,underlay.opacity));const hOrigin=(isEastWest?underlay.origin_mm[1]:underlay.origin_mm[0])*(reversed?-1:1);ctx.translate(sx(hOrigin),sy(underlay.origin_mm[1]));if(reversed)ctx.scale(-1,1);ctx.rotate(-(underlay.rotation_deg??0)*Math.PI/180);ctx.drawImage(underlay.image,0,0,underlay.image.width*underlay.scale_mm_per_px*scale,underlay.image.height*underlay.scale_mm_per_px*scale);ctx.restore()}
      ctx.strokeStyle='#dbe5ef';ctx.lineWidth=1
      for(const level of project.levels){const y=sy(level.elevation_mm);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();ctx.fillStyle='#64748b';ctx.font='11px sans-serif';const value=level.elevation_mm===0?'±0.000':`${level.elevation_mm>0?'+':''}${(level.elevation_mm/1000).toFixed(3)}`;ctx.fillText(`${level.name}  ${value} m`,8,y-4)}
      ctx.strokeStyle='#94a3b8';ctx.beginPath();ctx.moveTo(0,sy(0));ctx.lineTo(width,sy(0));ctx.stroke();ctx.fillStyle='#64748b';ctx.font='10px sans-serif';ctx.fillText('ระดับอ้างอิงโครงการ ±0.000',8,sy(0)+12)
      const openings=items.filter(o=>o.object_type==='door_window.door'||o.object_type==='door_window.window')
      hitRegions.current=[]
      for(const o of items){
        const d=o.module_data as Record<string,unknown>; let left=0,right=0,bottom=0,top=0; let fill='#d8e1ea',stroke='#475569'
        if(o.object_type==='architecture.wall'){
          const a=d.start_point_mm as number[],b=d.end_point_mm as number[];if(!a||!b)continue
          const extent=resolveWallVerticalExtent(project,o);if(!extent)continue
          left=sx(Math.min(horizontalCoordinate(a),horizontalCoordinate(b)));right=sx(Math.max(horizontalCoordinate(a),horizontalCoordinate(b)))
          bottom=sy(extent.base_elevation_mm);top=sy(extent.top_elevation_mm)
          ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=1.4;ctx.fillRect(left,top,right-left,bottom-top);ctx.strokeRect(left,top,right-left,bottom-top)
          for(const op of openings.filter(op=>String((op.module_data as Record<string,unknown>).wall_id)===o.id)){
            const od=op.module_data as Record<string,unknown>,p=od.location_mm as number[];if(!p)continue
            const vertical=resolveOpeningVerticalExtent(project,op);if(!vertical)continue
            const x=sx(horizontalCoordinate(p)),w=Number(od.width_mm??900)*scale/2,h=vertical.height_mm*scale,y=sy(vertical.top_elevation_mm)
            ctx.fillStyle='#fbfdff';ctx.fillRect(x-w,y,w*2,h);ctx.strokeStyle=selectedId===op.id?'#087cf0':'#334155';ctx.lineWidth=selectedId===op.id?2:1.1;ctx.strokeRect(x-w,y,w*2,h)
            if(op.object_type==='door_window.window'){ctx.beginPath();ctx.moveTo(x-w,y+h/2);ctx.lineTo(x+w,y+h/2);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+h);ctx.stroke()}
            ctx.fillStyle='#334155';ctx.font='10px sans-serif';ctx.fillText(String(od.mark??''),x-w,y-3)
            hitRegions.current.push({id:op.id,x:x-w,y,w:w*2,h})
          }
          ctx.fillStyle='#334155';ctx.font='11px sans-serif';ctx.fillText(String(d.mark??''),left+4,top+13)
        }else if(o.object_type==='structure.column'){
          const p=d.location_mm as number[];if(!p)continue;const extent=resolveColumnVerticalExtent(project,o);if(!extent)continue;const half=Number((d.section_mm as number[]|undefined)?.[isEastWest?0:1]??200)/2,base=extent.base_elevation_mm,topElevation=extent.top_elevation_mm
          left=sx(horizontalCoordinate(p)-half);right=sx(horizontalCoordinate(p)+half);bottom=sy(topElevation);top=sy(base);fill='#b9d6e8'
          ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.fillRect(left,bottom,right-left,top-bottom);ctx.strokeRect(left,bottom,right-left,top-bottom);ctx.fillStyle='#334155';ctx.font='10px sans-serif';ctx.fillText(String(d.mark??''),left+3,bottom+12)
        }else if(o.object_type==='structure.beam'){
          const a=d.start_point_mm as number[],b=d.end_point_mm as number[];if(!a||!b)continue
          const z=resolveBeamBaseElevation(project,o);if(z===undefined)continue;const dep=Number((d.section_mm as number[]|undefined)?.[1]??400),drop=Number(d.drop_mm??0);left=sx(Math.min(horizontalCoordinate(a),horizontalCoordinate(b)));right=sx(Math.max(horizontalCoordinate(a),horizontalCoordinate(b)));top=sy(z+dep-drop);bottom=sy(z-drop);fill='#9ca3af'
          ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.fillRect(left,top,right-left,bottom-top);ctx.strokeRect(left,top,right-left,bottom-top)
        }else if(o.object_type==='structure.slab'){
          const ring=d.boundary_mm as number[][];if(!ring?.length)continue;const coords=ring.map(p=>sx(horizontalCoordinate(p)));left=Math.min(...coords);right=Math.max(...coords);const z=resolveSlabElevation(project,o);if(z===undefined)continue;top=sy(z);bottom=sy(z-Number(d.thickness_mm??120));fill='#a8b2bf';ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.fillRect(left,top,right-left,bottom-top);ctx.strokeRect(left,top,right-left,bottom-top)
        }else continue
        hitRegions.current.push({id:o.id,x:left,y:Math.min(top,bottom),w:Math.max(5,right-left),h:Math.max(5,Math.abs(bottom-top))})
      }
      // Overlay the same cutout-aware object edges used by the permit-sheet
      // compiler. Semantic fills above keep selection readable; these projected
      // edges carry actual frame, wall and structural geometry into the canvas.
      const viewDirection: Vec3 = direction === 'north' ? [0, -1, 0] : direction === 'south' ? [0, 1, 0] : direction === 'east' ? [-1, 0, 0] : [1, 0, 0]
      const edgeFaces = new Map<string, { a: Vec3; b: Vec3; normals: Vec3[]; front: boolean }>()
      const pointKey = (point: Vec3) => point.map(value => Math.round(value * 10) / 10).join(',')
      for (const representation of representations) {
        if (!visibleObjectIds.has(representation.object_id)) continue
        for (const triangle of getRepresentationTriangles(representation)) {
          const [a, b, c] = triangle
          const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
          const normal: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
          const magnitude = Math.hypot(...normal)
          if (magnitude < 1e-9) continue
          const unit: Vec3 = [normal[0] / magnitude, normal[1] / magnitude, normal[2] / magnitude]
          const front = unit[0] * viewDirection[0] + unit[1] * viewDirection[1] + unit[2] * viewDirection[2] < -0.05
          for (const [start, end] of [[a, b], [b, c], [c, a]] as Array<[Vec3, Vec3]>) {
            const ka = pointKey(start), kb = pointKey(end), key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
            const edge = edgeFaces.get(key) ?? { a: start, b: end, normals: [], front: false }
            edge.normals.push(unit); edge.front ||= front; edgeFaces.set(key, edge)
          }
        }
      }
      const drawnEdges = new Set<string>()
      for (const [key, edge] of edgeFaces) {
        const crease = edge.normals.length === 1 || edge.normals.some((normal, index) => edge.normals.slice(index + 1).some(other => normal[0] * other[0] + normal[1] * other[1] + normal[2] * other[2] < 0.995))
        if (!edge.front || !crease) continue
        const a: [number, number] = [sx(horizontalCoordinate(edge.a)), sy(edge.a[2])], b: [number, number] = [sx(horizontalCoordinate(edge.b)), sy(edge.b[2])]
        if (![...a, ...b].every(Number.isFinite)) continue
        const screenKey = [a, b].map(point => point.map(value => Math.round(value * 2) / 2).join(',')).sort().join('|')
        if (drawnEdges.has(screenKey)) continue
        drawnEdges.add(screenKey)
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.strokeStyle = '#334155'; ctx.lineWidth = 0.8; ctx.stroke()
      }
      ctx.fillStyle='#64748b';ctx.font='12px sans-serif';ctx.fillText(isEastWest?'รูปด้านตะวันออก/ตะวันตก · แกนฉาย Y':'รูปด้านเหนือ/ใต้ · แกนฉาย X',12,20)
    }
    draw()
    const observer=new ResizeObserver(draw);observer.observe(canvas)
    return ()=>observer.disconnect()
  },[project,direction,selectedId,underlay])

  return <canvas ref={canvasRef} aria-label={`มุมมอง${direction}`} style={{width:'100%',height:'100%',display:'block',touchAction:'none',cursor:'default'}} onPointerDown={event=>{
    const rect=event.currentTarget.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top
    const hit=hitRegions.current.filter(r=>x>=r.x-4&&x<=r.x+r.w+4&&y>=r.y-4&&y<=r.y+r.h+4).sort((a,b)=>a.w*a.h-b.w*b.h)[0]
    const target=hit?.id?project.objects[hit.id]:undefined
    const isVerticalShape=target?.object_type==='architecture.wall'||target?.object_type==='door_window.door'||target?.object_type==='door_window.window'
    pointerDown.current={id:hit?.id??null,x:event.clientX,y:event.clientY,verticalIntent:isVerticalShape&&hit&&Math.abs(y-hit.y)<12?'top':'move'}
    event.currentTarget.setPointerCapture(event.pointerId)
  }} onPointerUp={event=>{
    const start=pointerDown.current;pointerDown.current=null;if(!start)return
    const dx=event.clientX-start.x,dy=event.clientY-start.y
    if(start.id&&Math.hypot(dx,dy)>3&&onMoveObject){const view=viewTransform.current,horizontal=(dx/view.scale)*(view.reversed?-1:1);onMoveObject(start.id,view.isEastWest?[0,horizontal]:[horizontal,0],-dy/view.scale,start.verticalIntent);onSelectObject(start.id)}
    else onSelectObject(start.id)
  }}/>
}
