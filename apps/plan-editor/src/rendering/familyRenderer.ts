import { objectFamilyGeometry, familyHatchSegments, type EvaluatedFamilyPath } from '@constructflow/family-engine'
import type { FamilyPath, ProjectDocument, SmartObject } from '@constructflow/project-model'
import { clippedMaterialPatternSegments, clippedGridSegments, clippedStaggeredPlankSegments, clippedGrassSegments, polygonDiagonalHatchSegments, type Vec2 } from '@constructflow/geometry-kernel'
import { worldToScreen, type ViewportState } from '../viewport/viewportTransform.js'

export function drawFamilyPath(ctx: CanvasRenderingContext2D, path: EvaluatedFamilyPath, screen: (point: Vec2) => Vec2, accent?: string) {
  if (path.visible === false || !path.points.length) return
  ctx.save(); ctx.lineWidth = Math.max(.6,path.lineweight_mm * 3);ctx.strokeStyle=accent ?? path.color;ctx.setLineDash(path.dash ?? [])
  const trace = () => {ctx.beginPath();for(const ring of [path.points,...(path.voids??[])]){ring.forEach((point,index)=>index?ctx.lineTo(...screen(point)):ctx.moveTo(...screen(point)));if(path.closed)ctx.closePath()}}
  trace()
  if(path.closed){ctx.fillStyle='#ffffff';ctx.fill('evenodd');if(path.hatch?.pattern==='solid'){ctx.globalAlpha*=.2;ctx.fillStyle=path.hatch.color;ctx.fill('evenodd');ctx.globalAlpha/=.2}}
  ctx.stroke()
  if(path.hatch && path.closed && !['none','solid'].includes(path.hatch.pattern)){
    const h=path.hatch,b=path.points,s=h.spacing_mm,angle=h.rotation_deg,o=h.origin_mm??[0,0]
    const segments=familyHatchSegments(b,h,path.voids??[])
    ctx.strokeStyle=accent??h.color;ctx.lineWidth=.6;ctx.setLineDash([]);ctx.beginPath();for(const [a,b]of segments){ctx.moveTo(...screen(a));ctx.lineTo(...screen(b))}ctx.stroke()
  }
  if(path.text){const [a,b]=path.points.map(screen);ctx.fillStyle=accent??path.color;ctx.font=`${Math.max(8,Math.min(64,Math.abs(b[1]-a[1])))}px sans-serif`;ctx.fillText(path.text,a[0],a[1])}
  ctx.restore()
}
export function drawFamilyObject(ctx: CanvasRenderingContext2D, project: ProjectDocument, object: SmartObject, viewport: ViewportState, selected=false, hovered=false) {
  const geometry=objectFamilyGeometry(project,object)
  if(!geometry)return false
  const accent=object.removed_phase==='demolition'||object.created_phase==='demolition'?'#ef4444':selected?'#0284c7':hovered?'#b45309':object.created_phase==='existing'?'#94a3b8':undefined
  for(const path of geometry.paths.filter(path=>path.view==='plan'))drawFamilyPath(ctx,object.removed_phase==='demolition'||object.created_phase==='demolition'?{...path,dash:[6,3]}:path,p=>{const w=geometry.transform([p[0],p[1],0]);return worldToScreen([w[0],w[1]],viewport)},accent)
  return true
}
