import React, { useEffect, useRef, useState } from 'react'
import { distanceToPath2D, type Vec2 } from '@constructflow/geometry-kernel'
import type { FamilyDefinition, FamilyPath } from '@constructflow/project-model'
import { evaluateFamily, translateFamilyPath, familyCirclePoints } from '@constructflow/family-engine'
import { drawFamilyPath } from '../rendering/familyRenderer.js'

export function FamilyCanvasEditor({ family, typeId, view, selectedId, onSelect, onChange }: { family: FamilyDefinition; typeId?: string; view: 'plan'|'front'|'side'; selectedId: string|null; onSelect: (id: string|null)=>void; onChange: (family: FamilyDefinition)=>void }) {
  const canvasRef=useRef<HTMLCanvasElement>(null),hostRef=useRef<HTMLDivElement>(null)
  const [size,setSize]=useState({width:700,height:450}),[tool,setTool]=useState<'select'|'line'|'rectangle'|'circle'|'polyline'>('select'),[start,setStart]=useState<Vec2[]>([]),[cursor,setCursor]=useState<Vec2|null>(null),[zoom,setZoom]=useState(1)
  const drag=useRef<{id:string;index:number;start:Vec2;points:Vec2[];panX:number;panY:number;scale:number}|null>(null)
  const [dragPoint,setDragPoint]=useState<Vec2|null>(null)
  let geometry:ReturnType<typeof evaluateFamily>|undefined,error=''
  try{geometry=evaluateFamily(family,typeId)}catch(e){error=e instanceof Error?e.message:String(e)}
  const paths=geometry?.paths.filter(path=>path.view===view)??[], all=paths.flatMap(path=>path.points)
  const bounds=all.reduce((b,[x,y])=>[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)],[0,0,(view==='side'?geometry?.parameters.D:geometry?.parameters.W)??1200,view!=='plan'?geometry?.parameters.H??2100:geometry?.parameters.D??600])
  const verticalSign=view==='plan'?1:-1
  const scale=Math.min((size.width-90)/Math.max(100,bounds[2]-bounds[0]),(size.height-90)/Math.max(100,bounds[3]-bounds[1]))*zoom,panX=size.width/2-(bounds[0]+bounds[2])/2*scale,panY=size.height/2-(bounds[1]+bounds[3])/2*scale*verticalSign
  const screen=([x,y]:Vec2):Vec2=>[x*scale+panX,y*scale*verticalSign+panY]
  const world=(event:React.PointerEvent):Vec2=>{const rect=canvasRef.current!.getBoundingClientRect();return [(event.clientX-rect.left-panX)/scale,(event.clientY-rect.top-panY)/scale/verticalSign]}
  useEffect(()=>{const observer=new ResizeObserver(entries=>{const rect=entries[0].contentRect;setSize({width:rect.width,height:Math.max(260,rect.height)})});if(hostRef.current)observer.observe(hostRef.current);return()=>observer.disconnect()},[])
  useEffect(()=>{setStart([]);setZoom(1)},[family.id,view])
  useEffect(()=>{
    const ctx=canvasRef.current?.getContext('2d');if(!ctx)return
    ctx.clearRect(0,0,size.width,size.height);ctx.fillStyle='#fbfcfe';ctx.fillRect(0,0,size.width,size.height)
    ctx.strokeStyle='#edf1f6';ctx.lineWidth=1;const step=Math.max(20,100*scale)
    ctx.beginPath();for(let x=panX%step;x<size.width;x+=step){ctx.moveTo(x,0);ctx.lineTo(x,size.height)}for(let y=panY%step;y<size.height;y+=step){ctx.moveTo(0,y);ctx.lineTo(size.width,y)}ctx.stroke()
    ctx.strokeStyle='#94a3b8';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(panX,0);ctx.lineTo(panX,size.height);ctx.moveTo(0,panY);ctx.lineTo(size.width,panY);ctx.stroke();ctx.setLineDash([])
    for(const path of paths){
      let points=path.points,voids=path.voids
      if(drag.current?.id===path.id&&dragPoint){const d=drag.current;if(d.index>=0)points=points.map((point,index)=>index===d.index?dragPoint:point);else {points=points.map(([x,y])=>[x+dragPoint[0]-d.start[0],y+dragPoint[1]-d.start[1]]);voids=voids?.map(ring=>ring.map(([x,y])=>[x+dragPoint[0]-d.start[0],y+dragPoint[1]-d.start[1]]))}}
      drawFamilyPath(ctx,{...path,points,voids},screen,path.id===selectedId?'#0284c7':undefined)
      if(path.id===selectedId)for(const p of points.slice(0,200)){ctx.fillStyle='#fff';ctx.strokeStyle='#0284c7';ctx.lineWidth=1;ctx.beginPath();ctx.arc(...screen(p),4,0,Math.PI*2);ctx.fill();ctx.stroke()}
    }
    if(start.length&&cursor){ctx.strokeStyle='#0284c7';ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(...screen(start[0]));if(tool==='rectangle'){const a=screen(start[0]),b=screen(cursor);ctx.rect(a[0],a[1],b[0]-a[0],b[1]-a[1])}else if(tool==='circle'){const center=screen(start[0]);ctx.arc(...center,Math.hypot(cursor[0]-start[0][0],cursor[1]-start[0][1])*scale,0,Math.PI*2)}else{for(const p of [...start.slice(1),cursor])ctx.lineTo(...screen(p))}ctx.stroke();ctx.setLineDash([])}
    ctx.fillStyle='#64748b';ctx.font='11px sans-serif';ctx.fillText(`X ${((cursor?.[0]??0)/1000).toFixed(3)} m · Y ${((cursor?.[1]??0)/1000).toFixed(3)} m · ลากจุดแก้ / ลากเส้นย้าย`,12,size.height-12)
  })
  const addPath=(points:Vec2[],closed=false)=>{if(points.length<2)return;const id=crypto.randomUUID();const path:FamilyPath={id,points,closed,view,layer:'เขียนเพิ่ม',color:'#475569',lineweight_mm:.25};onChange({...family,paths:[...family.paths,path]});onSelect(id);setStart([])}
  return <div className="cf-family-canvas">
    <div className="cf-family-drawbar" role="toolbar" aria-label="เครื่องมือ Family 2D">
      {([['select','เลือก'],['line','เส้น'],['rectangle','สี่เหลี่ยม'],['circle','วงกลม'],['polyline','เส้นต่อเนื่อง']] as const).map(([value,label])=><button key={value} aria-pressed={tool===value} onClick={()=>{setTool(value);setStart([])}}>{label}</button>)}
      <button onClick={()=>setZoom(1)}>พอดีจอ</button><button aria-label="ซูมออก Family" onClick={()=>setZoom(z=>Math.max(.25,z/1.25))}>−</button><button aria-label="ซูมเข้า Family" onClick={()=>setZoom(z=>Math.min(8,z*1.25))}>+</button>
      <button disabled={!selectedId} onClick={()=>{onChange({...family,paths:family.paths.filter(path=>path.id!==selectedId),extrusions:family.extrusions.filter(form=>form.profile_id!==selectedId)});onSelect(null)}}>ลบเส้น</button>
    </div>
    <div ref={hostRef} className="cf-family-canvas-host">
      <canvas ref={canvasRef} width={size.width} height={size.height} tabIndex={0} data-modal-escape-cancel={start.length>0||dragPoint?"true":undefined} aria-label="เขียนและแก้เส้น Family" style={{touchAction:'none'}}
        onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setStart([]);drag.current=null;setDragPoint(null)}if(event.key==='Enter'&&tool==='polyline'&&start.length>1){event.preventDefault();addPath(start)}if(event.key==='Delete'&&selectedId){event.preventDefault();onChange({...family,paths:family.paths.filter(path=>path.id!==selectedId),extrusions:family.extrusions.filter(form=>form.profile_id!==selectedId)});onSelect(null)}}}
        onPointerDown={event=>{
          event.currentTarget.focus();const point=world(event)
          if(tool!=='select'){
            if(!start.length){setStart([point]);return}
            if(tool==='line')addPath([start[0],point])
            else if(tool==='rectangle'){const a=start[0];addPath([a,[point[0],a[1]],point,[a[0],point[1]]],true)}
            else if(tool==='circle'){const c=start[0],r=Math.hypot(point[0]-c[0],point[1]-c[1]);addPath(familyCirclePoints(c,r),true)}
            else if(event.detail>=2)addPath([...start,point]);else setStart([...start,point])
            return
          }
          const selected=paths.find(path=>path.id===selectedId),handle=selected?.points.findIndex(p=>Math.hypot(p[0]-point[0],p[1]-point[1])*scale<9)??-1
          const nearest=handle>=0?selected:paths.filter(path=>path.visible!==false).map(path=>({path,distance:Math.min(distanceToPath2D(point,path.points,path.closed),...(path.voids??[]).map(ring=>distanceToPath2D(point,ring,true)))*scale})).filter(item=>item.distance<9).sort((a,b)=>a.distance-b.distance)[0]?.path
          onSelect(nearest?.id??null)
          if(nearest){drag.current={id:nearest.id,index:handle,start:point,points:nearest.points,panX,panY,scale};event.currentTarget.setPointerCapture(event.pointerId)}
        }}
        onPointerMove={event=>{const d=drag.current;if(d){const rect=event.currentTarget.getBoundingClientRect();setDragPoint([(event.clientX-rect.left-d.panX)/d.scale,(event.clientY-rect.top-d.panY)/d.scale/verticalSign])}else setCursor(world(event))}}
        onPointerUp={()=>{const d=drag.current;if(d&&dragPoint){const next=family.paths.map(path=>path.id!==d.id?path:d.index>=0?{...path,points:path.points.map((point,index)=>index===d.index?dragPoint:point)}:translateFamilyPath(path,[dragPoint[0]-d.start[0],dragPoint[1]-d.start[1]]));onChange({...family,paths:next})}drag.current=null;setDragPoint(null)}}
        onPointerCancel={()=>{drag.current=null;setDragPoint(null)}}/>
      {error&&<div className="cf-family-error" role="alert">{error}</div>}
    </div>
  </div>
}
