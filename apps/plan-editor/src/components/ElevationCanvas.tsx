import React, { useEffect, useRef, useState } from 'react'
import { getDisplayPhase, resolveBeamBaseElevation, resolveColumnVerticalExtent, resolveOpeningVerticalExtent, resolveSlabElevation, resolveWallVerticalExtent, type ProjectDocument } from '@constructflow/project-model'
import { buildProjectRepresentations3D, getElevationVisibleOpeningIds, getElevationVisibleWallIds, getOpeningElevationLinework, getPlanVisibleObjects } from '@constructflow/representation-engine'
import { clippedGridSegments, polygonInteriorPoint } from '@constructflow/geometry-kernel'
import { getElevationWallStyle, packElevationLevelLabelCenters, panElevationView, resolveElevationWallFaceMark, zoomElevationViewAtPoint, zoomElevationViewFromCenter } from '../elevationLabelLayout.mjs'

import type { UnderlayConfig } from '../rendering/planRenderer.js'

export type ElevationDirection = 'north' | 'south' | 'east' | 'west' | 'rcp'
type ElevationViewState = { zoom: number; panX: number; panY: number }

function createElevationViewStates(): Record<ElevationDirection, ElevationViewState> {
  const fit = (): ElevationViewState => ({ zoom: 1, panX: 0, panY: 0 })
  return { north: fit(), south: fit(), east: fit(), west: fit(), rcp: fit() }
}

interface Props {
  project: ProjectDocument
  direction: ElevationDirection
  selectedId: string | null
  onSelectObject: (id: string | null) => void
  underlay?: UnderlayConfig | null
  onMoveObject?: (id: string, deltaWorldMm: [number,number], deltaZMm: number, verticalIntent: 'move' | 'top') => void
}

function drawTag(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, text: string, shape: 'hexagon' | 'circle' | 'triangle', selected: boolean) {
  if (!text) return
  ctx.save()
  ctx.font = 'bold 10px sans-serif'
  const width = Math.max(26, ctx.measureText(text).width + 12), height = 18
  ctx.beginPath()
  if (shape === 'circle') ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2)
  else if (shape === 'triangle') {
    ctx.moveTo(centerX - width / 2, centerY - height / 2)
    ctx.lineTo(centerX + width / 2, centerY - height / 2)
    ctx.lineTo(centerX, centerY + height / 2)
    ctx.closePath()
  } else {
    const chamfer = Math.min(7, width * .22)
    ctx.moveTo(centerX - width / 2 + chamfer, centerY - height / 2)
    ctx.lineTo(centerX + width / 2 - chamfer, centerY - height / 2)
    ctx.lineTo(centerX + width / 2, centerY)
    ctx.lineTo(centerX + width / 2 - chamfer, centerY + height / 2)
    ctx.lineTo(centerX - width / 2 + chamfer, centerY + height / 2)
    ctx.lineTo(centerX - width / 2, centerY)
    ctx.closePath()
  }
  ctx.fillStyle = '#fbfdff'; ctx.strokeStyle = selected ? '#0284c7' : '#8da2b8'; ctx.lineWidth = selected ? 1.5 : 1
  ctx.fill(); ctx.stroke(); ctx.fillStyle = selected ? '#0369a1' : '#334155'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, centerX, centerY + .5)
  ctx.restore()
}

/** Orthographic, semantic projection of the project model. The canvas never becomes an editable copy of model edges. */
export const ElevationCanvas: React.FC<Props> = ({ project, direction, selectedId, onSelectObject, underlay, onMoveObject }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitRegions = useRef<Array<{ id: string; x: number; y: number; w: number; h: number }>>([])
  const viewTransform = useRef({ scale: 0.1, reversed: false, isEastWest: false, panX: 0, panY: 0 })
  // Each orthographic view keeps its own navigation, as in a CAD viewport.
  // Zooming the north facade must not unexpectedly zoom the RCP or west side.
  const viewState = useRef(createElevationViewStates())
  const [viewRevision, setViewRevision] = useState(0)
  const pointerDown = useRef<{ id: string | null; x: number; y: number; verticalIntent: 'move' | 'top'; mode: 'pan' | 'object'; panX: number; panY: number; clearOnTap: boolean } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const representations = new Map(buildProjectRepresentations3D(project).objects.map(representation => [representation.object_id, representation]))
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
        const activePlanObjects=getPlanVisibleObjects(project)
        const rooms=activePlanObjects.filter(o=>o.object_type==='architecture.room'&&o.status!=='archived'&&!o.removed_phase)
        const ceilings=activePlanObjects.filter(o=>o.object_type==='architecture.ceiling'&&o.status!=='archived'&&!o.removed_phase)
        const points=[...rooms,...ceilings].flatMap(o=>(o.module_data as Record<string,unknown>).boundary_mm as number[][] ?? [])
        if(!points.length){ctx.fillStyle='#64748b';ctx.font='14px sans-serif';ctx.fillText('ยังไม่มีห้องหรือฝ้า · ใช้คำสั่งตรวจจับห้องจากผนังเพื่อเริ่มต้น',24,40);return}
        const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]))
        const view=viewState.current[direction]
        const pad=50,scale=Math.min((width-pad*2)/Math.max(1000,maxX-minX),(height-pad*2)/Math.max(1000,maxY-minY))*view.zoom,ox=(width-(maxX-minX)*scale)/2+view.panX,oy=(height-(maxY-minY)*scale)/2+view.panY
        const sx=(x:number)=>ox+(x-minX)*scale,sy=(y:number)=>height-(oy+(y-minY)*scale)
        if(underlay?.visible&&underlay.image){ctx.save();ctx.globalAlpha=Math.max(.05,Math.min(1,underlay.opacity));const rotation=-(underlay.rotation_deg??0)*Math.PI/180;ctx.translate(sx(underlay.origin_mm[0]),sy(underlay.origin_mm[1]));ctx.rotate(rotation);ctx.drawImage(underlay.image,0,0,underlay.image.width*underlay.scale_mm_per_px*scale,underlay.image.height*underlay.scale_mm_per_px*scale);ctx.restore()}
        hitRegions.current=[]
        for(const room of rooms){const d=room.module_data as Record<string,unknown>,ring=d.boundary_mm as [number,number][],boundaryOpen=d.boundary_status==='unclosed';ctx.beginPath();ring.forEach((p,i)=>i?ctx.lineTo(sx(p[0]),sy(p[1])):ctx.moveTo(sx(p[0]),sy(p[1])));ctx.closePath();ctx.fillStyle=boundaryOpen?'rgba(239,68,68,.10)':'rgba(148,163,184,.08)';ctx.fill();ctx.strokeStyle=boundaryOpen?'#dc2626':'#64748b';ctx.lineWidth=1.2;ctx.setLineDash([5,3]);ctx.stroke();ctx.setLineDash([]);const [cx,cy]=polygonInteriorPoint(ring)??[ring.reduce((s,p)=>s+p[0],0)/ring.length,ring.reduce((s,p)=>s+p[1],0)/ring.length];ctx.fillStyle=boundaryOpen?'#b91c1c':'#334155';ctx.font='12px sans-serif';ctx.fillText(`${String(d.number??'')} ${String(d.name??'Room')} · ${(Number(d.area_mm2??0)/1e6).toFixed(2)} m²${boundaryOpen?' · วงผนังเปิด':''}`,sx(cx),sy(cy));const px=ring.map(p=>sx(p[0])),py=ring.map(p=>sy(p[1])),minX=Math.min(...px),minY=Math.min(...py);hitRegions.current.push({id:room.id,x:minX,y:minY,w:Math.max(...px)-minX,h:Math.max(...py)-minY})}
        for (const ceiling of ceilings) {
          const d = ceiling.module_data as Record<string, unknown>
          const ring = d.boundary_mm as number[][] | undefined
          if (!ring || ring.length < 3) continue
          const voids = (d.voids_mm as number[][][] | undefined) ?? []
          const boundaryOpen = d.room_boundary_status === 'unclosed'
          const traceRing = (points: number[][]) => {
            points.forEach((point, index) => index ? ctx.lineTo(sx(point[0]), sy(point[1])) : ctx.moveTo(sx(point[0]), sy(point[1])))
            ctx.closePath()
          }
          ctx.beginPath(); traceRing(ring)
          ctx.strokeStyle = boundaryOpen ? '#dc2626' : selectedId === ceiling.id ? '#7c3aed' : '#8b5cf6'
          ctx.lineWidth = 1.6; ctx.setLineDash(boundaryOpen ? [5, 3] : []); ctx.stroke(); ctx.setLineDash([])
          for (const hole of voids) {
            if (!Array.isArray(hole) || hole.length < 3) continue
            ctx.beginPath(); traceRing(hole)
            ctx.strokeStyle = boundaryOpen ? '#dc2626' : '#7c3aed'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([])
          }
          const grid = d.grid_mm as number[] | undefined
          if (grid && grid[0] > 0 && grid[1] > 0) {
            ctx.beginPath()
            ctx.strokeStyle = boundaryOpen ? 'rgba(220,38,38,.38)' : 'rgba(124,58,237,.36)'; ctx.lineWidth = .7
            for (const [a, b] of clippedGridSegments(ring as [number, number][], grid[0], grid[1], voids as [number, number][][])) {
              ctx.moveTo(sx(a[0]), sy(a[1])); ctx.lineTo(sx(b[0]), sy(b[1]))
            }
            ctx.stroke()
          }
          const xs = ring.map(point => sx(point[0])), ys = ring.map(point => sy(point[1]))
          hitRegions.current.push({ id: ceiling.id, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) })
        }
        ctx.fillStyle='#64748b';ctx.font='12px sans-serif';ctx.fillText('แปลนฝ้า RCP · คลิกเลือกห้องหรือฝ้า',12,20);return
      }
      const isEastWest = direction === 'east' || direction === 'west'
      const reversed = direction === 'south' || direction === 'west'
      const initialView=viewState.current[direction]
      viewTransform.current = { scale: 0.1, reversed, isEastWest, panX: initialView.panX, panY: initialView.panY }
      const horizontalCoordinate = (p: number[]) => (isEastWest ? Number(p[1] ?? 0) : Number(p[0] ?? 0)) * (reversed ? -1 : 1)
      const visibleWallIds = getElevationVisibleWallIds(project, direction)
      const visibleOpeningIds = getElevationVisibleOpeningIds(project, direction)
      const items = Object.values(project.objects).filter(object =>
        object.status !== 'archived' && object.removed_phase == null &&
        (object.object_type !== 'architecture.wall' || visibleWallIds.has(object.id)) &&
        (!object.object_type.startsWith('door_window.') || visibleOpeningIds.has(object.id)),
      )
      const bounds: number[] = [Infinity, -Infinity, Infinity, -Infinity]
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
          const p = d.location_mm as number[]
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
      if (!Number.isFinite(bounds[0])) { ctx.fillStyle='#64748b';ctx.font='14px sans-serif';ctx.fillText('ยังไม่มีวัตถุสำหรับรูปด้านนี้',24,40);return }
      const pad = 56, spanX = Math.max(1000,bounds[1]-bounds[0]), spanZ = Math.max(1000,bounds[3]-bounds[2])
      const elevationView=viewState.current[direction]
      const scale = Math.min((width-pad*2)/spanX,(height-pad*2)/spanZ)*elevationView.zoom
      viewTransform.current={scale,reversed,isEastWest,panX:elevationView.panX,panY:elevationView.panY}
      const offsetX = (width-spanX*scale)/2+elevationView.panX, offsetY = (height-spanZ*scale)/2+elevationView.panY
      const sx=(x:number)=>offsetX+(x-bounds[0])*scale, sy=(z:number)=>height-(offsetY+(z-bounds[2])*scale)
      if(underlay?.visible&&underlay.image){ctx.save();ctx.globalAlpha=Math.max(.05,Math.min(1,underlay.opacity));const hOrigin=(isEastWest?underlay.origin_mm[1]:underlay.origin_mm[0])*(reversed?-1:1);ctx.translate(sx(hOrigin),sy(underlay.origin_mm[1]));if(reversed)ctx.scale(-1,1);ctx.rotate(-(underlay.rotation_deg??0)*Math.PI/180);ctx.drawImage(underlay.image,0,0,underlay.image.width*underlay.scale_mm_per_px*scale,underlay.image.height*underlay.scale_mm_per_px*scale);ctx.restore()}
      const levelRows=project.levels.map(level=>({level,y:sy(level.elevation_mm)})).sort((a,b)=>a.y-b.y)
      // Keep level labels inside the viewport and close to their real datum.
      // When storeys are tightly spaced, pack labels without changing their order
      // and draw a leader back to each actual level line instead of letting the
      // old cumulative offset make the text appear to belong to another level.
      const labelHalfHeight=8.5,labelYs=packElevationLevelLabelCenters(levelRows.map(({y})=>y),height,{halfHeight:labelHalfHeight})
      for(const {y} of levelRows){
        ctx.strokeStyle='#dbe5ef';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke()
      }
      const drawLevelLabels=()=>{
        for(const [index,{level,y}] of levelRows.entries()){
        const value=level.elevation_mm===0?'±0.000':`${level.elevation_mm>0?'+':''}${(level.elevation_mm/1000).toFixed(3)}`
        const label=`${level.name}  ${value} m`;ctx.font='11px sans-serif'
        const labelY=labelYs[index],labelW=ctx.measureText(label).width+12,labelRight=6+labelW
        ctx.fillStyle='rgba(251,253,255,.97)';ctx.fillRect(6,labelY-labelHalfHeight,labelW,labelHalfHeight*2)
        ctx.strokeStyle='#cbd5e1';ctx.strokeRect(6,labelY-labelHalfHeight,labelW,labelHalfHeight*2)
        if(Math.abs(labelY-(y-4))>2){
          ctx.strokeStyle='#94a3b8';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(labelRight+2,labelY);ctx.lineTo(labelRight+6,y);ctx.stroke()
          ctx.beginPath();ctx.moveTo(labelRight+3,y);ctx.lineTo(labelRight+9,y);ctx.stroke()
        }
        ctx.fillStyle='#475569';ctx.textBaseline='middle';ctx.fillText(label,12,labelY)
        }
      }
      const groundY=sy(0)
      const orderedItems=[...items].sort((a,b)=>{
        const priority=(type:string)=>type==='structure.column'||type==='structure.beam'||type==='structure.slab'?0:type==='architecture.wall'?1:(type==='door_window.door'||type==='door_window.window')?2:3
        return priority(a.object_type)-priority(b.object_type)
      })
      const elevationTags:Array<{x:number;y:number;text:string;shape:'hexagon'|'circle'|'triangle';selected:boolean}> = []
      let groundDrawn=false
      const drawGroundHatch=()=>{
        ctx.save();ctx.beginPath();ctx.rect(0,groundY,width,Math.max(0,height-groundY));ctx.clip();ctx.fillStyle='#aeb5bf';ctx.fillRect(0,groundY,width,height-groundY);ctx.strokeStyle='#858f9c';ctx.lineWidth=.7
        for(let x=-height;x<width+height;x+=9){ctx.beginPath();ctx.moveTo(x,groundY);ctx.lineTo(x-(height-groundY),height);ctx.stroke()}
        ctx.restore();ctx.strokeStyle='#64748b';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(0,groundY);ctx.lineTo(width,groundY);ctx.stroke()
      }
      hitRegions.current=[]
      for(const o of orderedItems){
        if(!groundDrawn&&o.object_type!=='structure.column'&&o.object_type!=='structure.beam'&&o.object_type!=='structure.slab'){drawGroundHatch();groundDrawn=true}
        const d=o.module_data as Record<string,unknown>; let left=0,right=0,bottom=0,top=0; let fill='#d8e1ea',stroke='#475569'
        if(o.object_type==='architecture.wall'){
          if(!groundDrawn){drawGroundHatch();groundDrawn=true}
          const a=d.start_point_mm as number[],b=d.end_point_mm as number[];if(!a||!b)continue
          const extent=resolveWallVerticalExtent(project,o);if(!extent)continue
          left=sx(Math.min(horizontalCoordinate(a),horizontalCoordinate(b)));right=sx(Math.max(horizontalCoordinate(a),horizontalCoordinate(b)))
          bottom=sy(extent.base_elevation_mm);top=sy(extent.top_elevation_mm)
          const wallStyle=getElevationWallStyle(getDisplayPhase(o),selectedId===o.id)
          fill=wallStyle.fill;ctx.fillStyle=wallStyle.fill;ctx.strokeStyle=wallStyle.stroke;ctx.lineWidth=wallStyle.lineWidth;ctx.setLineDash(wallStyle.dash);ctx.fillRect(left,top,right-left,bottom-top);ctx.strokeRect(left,top,right-left,bottom-top);ctx.setLineDash([])
          const faceMark=resolveElevationWallFaceMark(project,o,direction as Exclude<ElevationDirection,'rcp'>)
          // Place the wall-face mark in the longest uninterrupted facade span,
          // so hosted doors/windows do not cover it and it stays on the wall.
          const markText=String(faceMark??'')
          ctx.font='bold 10px sans-serif'
          const markWidth=Math.max(26,ctx.measureText(markText).width+12)
          const openings=items.filter(item=>(item.object_type==='door_window.door'||item.object_type==='door_window.window')&&(item.module_data as Record<string,unknown>).wall_id===o.id)
            .map(item=>{const opening=item.module_data as Record<string,unknown>,center=sx(horizontalCoordinate(opening.location_mm as number[])),half=Number(opening.width_mm??900)*scale/2;return [Math.max(left,center-half-5),Math.min(right,center+half+5)] as [number,number]})
            .filter(([a0,a1])=>a1>a0).sort((a0,b0)=>a0[0]-b0[0])
          let cursor=left,best:[number,number]=[left,left]
          for(const [a0,a1] of openings){if(a0-cursor>best[1]-best[0])best=[cursor,a0];cursor=Math.max(cursor,a1)}
          if(right-cursor>best[1]-best[0])best=[cursor,right]
          if(best[1]-best[0]>=markWidth+8)elevationTags.push({x:(best[0]+best[1])/2,y:(top+bottom)/2,text:markText,shape:'triangle',selected:selectedId===o.id})
        }else if(o.object_type==='structure.column'){
          const p=d.location_mm as number[];if(!p)continue;const extent=resolveColumnVerticalExtent(project,o);if(!extent)continue;const half=Number((d.section_mm as number[]|undefined)?.[isEastWest?0:1]??200)/2,base=extent.base_elevation_mm,topElevation=extent.top_elevation_mm
          left=sx(horizontalCoordinate(p)-half);right=sx(horizontalCoordinate(p)+half);bottom=sy(topElevation);top=sy(base);fill='#b9d6e8'
          ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.fillRect(left,bottom,right-left,top-bottom);ctx.strokeRect(left,bottom,right-left,top-bottom)
        }else if(o.object_type==='structure.beam'){
          const a=d.start_point_mm as number[],b=d.end_point_mm as number[];if(!a||!b)continue
          const z=resolveBeamBaseElevation(project,o);if(z===undefined)continue;const dep=Number((d.section_mm as number[]|undefined)?.[1]??400),drop=Number(d.drop_mm??0);left=sx(Math.min(horizontalCoordinate(a),horizontalCoordinate(b)));right=sx(Math.max(horizontalCoordinate(a),horizontalCoordinate(b)));top=sy(z+dep-drop);bottom=sy(z-drop);fill='#9ca3af'
          ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.fillRect(left,top,right-left,bottom-top);ctx.strokeRect(left,top,right-left,bottom-top)
        }else if(o.object_type==='structure.slab'){
          const ring=d.boundary_mm as number[][];if(!ring?.length)continue;const coords=ring.map(p=>sx(horizontalCoordinate(p)));left=Math.min(...coords);right=Math.max(...coords);const z=resolveSlabElevation(project,o);if(z===undefined)continue;top=sy(z);bottom=sy(z-Number(d.thickness_mm??120));fill='#a8b2bf';ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.fillRect(left,top,right-left,bottom-top);ctx.strokeRect(left,top,right-left,bottom-top)
        }else if(o.object_type==='door_window.door'||o.object_type==='door_window.window'){
          const p=d.location_mm as number[];if(!p)continue;const vertical=resolveOpeningVerticalExtent(project,o);if(!vertical)continue
          const representation=representations.get(o.id),shape=representation?.shape.kind==='opening'?representation.shape:undefined
          if(!shape)continue
          const center=horizontalCoordinate(p),directionSign=reversed?-1:1
          const x=sx(center),w=shape.width_mm*scale/2,h=vertical.height_mm*scale,y=sy(vertical.top_elevation_mm);left=x-w;right=x+w;top=y;bottom=y+h
          ctx.strokeStyle=selectedId===o.id?'#087cf0':'#334155';ctx.fillStyle='#fbfdff'
          for(const path of getOpeningElevationLinework(shape)){
            ctx.beginPath()
            path.points_mm.forEach(([localX,localZ],index)=>{
              const px=sx(center+(localX-shape.width_mm/2)*directionSign),py=sy(vertical.base_elevation_mm+localZ)
              if(index===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)
            })
            if(path.closed)ctx.closePath()
            if(path.fill){ctx.fillStyle=path.fill;ctx.fill()}
            ctx.lineWidth=selectedId===o.id?Math.max(1.2,path.line_width_mm*scale):Math.max(.7,path.line_width_mm*scale)
            ctx.stroke()
          }
          elevationTags.push({x,y:top-17,text:String(d.mark??''),shape:o.object_type==='door_window.window'?'hexagon':'circle',selected:selectedId===o.id})
        }else continue
        hitRegions.current.push({id:o.id,x:left,y:Math.min(top,bottom),w:Math.max(5,right-left),h:Math.max(5,Math.abs(bottom-top))})
      }
      if(!groundDrawn)drawGroundHatch()
      // Draw semantic marks after every facade fill so a coplanar/overlapping
      // wall cannot erase the finish or opening tag that belongs to another object.
      for(const tag of elevationTags)drawTag(ctx,tag.x,tag.y,tag.text,tag.shape,tag.selected)
      // Level labels are annotation, so keep them above facade fills, columns,
      // and the earth hatch. Datum lines remain behind the model geometry.
      drawLevelLabels()
      ctx.textBaseline='alphabetic'
      ctx.fillStyle='#64748b';ctx.font='12px sans-serif';ctx.fillText(`${isEastWest?'รูปด้านตะวันออก/ตะวันตก · แกนฉาย Y':'รูปด้านเหนือ/ใต้ · แกนฉาย X'} · ${Math.round(viewState.current[direction].zoom*100)}%`,12,20)
    }
    draw()
    const observer=new ResizeObserver(draw);observer.observe(canvas)
    return ()=>observer.disconnect()
  },[project,direction,selectedId,underlay,viewRevision])

  const zoomBy = (factor: number) => {
    const currentView = viewState.current[direction]
    viewState.current[direction] = zoomElevationViewFromCenter(currentView, currentView.zoom * factor)
    setViewRevision(value => value + 1)
  }
  const fitView = () => {
    viewState.current[direction] = { zoom: 1, panX: 0, panY: 0 }
    setViewRevision(value => value + 1)
  }
  const controlStyle: React.CSSProperties = {
    width: 30, height: 30, border: '1px solid #cbd5e1', borderRadius: 6,
    background: 'rgba(255,255,255,.96)', color: '#334155', fontSize: 17,
    lineHeight: '26px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(15,23,42,.12)',
  }

  return <div style={{position:'relative',width:'100%',height:'100%'}}>
    <canvas ref={canvasRef} aria-label={`มุมมอง${direction}`} title="ล้อเมาส์เพื่อซูม · ลากพื้นที่ว่างหรือกดเมาส์กลางค้างเพื่อเลื่อน · ดับเบิลคลิกเพื่อจัดภาพพอดี" style={{width:'100%',height:'100%',display:'block',touchAction:'none',cursor:pointerDown.current?.mode==='pan'?'grabbing':'default'}} onWheel={event=>{
    event.preventDefault()
    const canvas=event.currentTarget,rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top
    const currentView=viewState.current[direction],factor=Math.exp(-event.deltaY*.001)
    viewState.current[direction]=zoomElevationViewAtPoint(currentView,currentView.zoom*factor,x,y,rect.width,rect.height)
    setViewRevision(value=>value+1)
  }} onDoubleClick={()=>{viewState.current[direction]={zoom:1,panX:0,panY:0};setViewRevision(value=>value+1)}} onPointerDown={event=>{
    const rect=event.currentTarget.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top
    const hit=hitRegions.current.filter(r=>x>=r.x-4&&x<=r.x+r.w+4&&y>=r.y-4&&y<=r.y+r.h+4).sort((a,b)=>a.w*a.h-b.w*b.h)[0]
    const target=hit?.id?project.objects[hit.id]:undefined
    const isVerticalShape=target?.object_type==='architecture.wall'||target?.object_type==='door_window.door'||target?.object_type==='door_window.window'
    const panMode=event.button===1||!hit
    const view=viewState.current[direction]
    pointerDown.current={id:hit?.id??null,x:event.clientX,y:event.clientY,verticalIntent:isVerticalShape&&hit&&Math.abs(y-hit.y)<12?'top':'move',mode:panMode?'pan':'object',panX:view.panX,panY:view.panY,clearOnTap:event.button===0&&!hit}
    event.currentTarget.setPointerCapture(event.pointerId)
  }} onPointerMove={event=>{
    const start=pointerDown.current
    if(!start||start.mode!=='pan')return
    const dx=event.clientX-start.x,dy=event.clientY-start.y
    if(Math.hypot(dx,dy)<=2)return
    viewState.current[direction]=panElevationView({ ...viewState.current[direction], panX:start.panX, panY:start.panY },dx,dy)
    setViewRevision(value=>value+1)
  }} onPointerUp={event=>{
    const start=pointerDown.current;pointerDown.current=null;if(!start)return
    const dx=event.clientX-start.x,dy=event.clientY-start.y
    if(start.mode==='pan'){
      if(start.clearOnTap&&Math.hypot(dx,dy)<=3)onSelectObject(null)
      return
    }
    if(start.id&&Math.hypot(dx,dy)>3&&onMoveObject){const view=viewTransform.current,horizontal=(dx/view.scale)*(view.reversed?-1:1);onMoveObject(start.id,view.isEastWest?[0,horizontal]:[horizontal,0],-dy/view.scale,start.verticalIntent);onSelectObject(start.id)}
    else onSelectObject(start.id)
  }}/>
    <div role="group" aria-label="ควบคุมสเกลรูปด้าน" style={{position:'absolute',bottom:10,right:10,display:'flex',alignItems:'center',gap:5,padding:4,border:'1px solid #dbe3ec',borderRadius:8,background:'rgba(248,250,252,.94)',boxShadow:'0 2px 8px rgba(15,23,42,.08)'}}>
      <button type="button" aria-label="ย่อรูปด้าน" title="ย่อ" style={controlStyle} onClick={()=>zoomBy(1/1.25)}>−</button>
      <span aria-live="polite" style={{minWidth:42,textAlign:'center',fontSize:11,fontVariantNumeric:'tabular-nums',color:'#475569'}}>{Math.round(viewState.current[direction].zoom*100)}%</span>
      <button type="button" aria-label="ขยายรูปด้าน" title="ขยาย" style={controlStyle} onClick={()=>zoomBy(1.25)}>+</button>
      <button type="button" aria-label="จัดภาพให้พอดี" title="จัดภาพให้พอดี" style={{...controlStyle,width:'auto',padding:'0 8px',fontSize:11}} onClick={fitView}>พอดี</button>
    </div>
  </div>
}
