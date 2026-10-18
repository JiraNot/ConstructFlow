import { polygonDiagonalHatchSegments, type Vec2 } from './index.js'
export interface MaterialPatternLine { angle_deg:number; base_mm:Vec2; offset_mm:Vec2; dashes_mm:number[] }
/** PAT/DXF line families clipped in model coordinates, including phased dash origins. */
export function clippedMaterialPatternSegments(boundary:readonly Vec2[],lines:readonly MaterialPatternLine[],scale=1,rotation=0,origin:Vec2=[0,0],voids:readonly (readonly Vec2[])[]=[]):Array<[Vec2,Vec2]>{
  if(!(scale>0)||!Number.isFinite(scale)||!Number.isFinite(rotation)||lines.length>100)return []
  const result:Array<[Vec2,Vec2]>=[],rot=rotation*Math.PI/180,c=Math.cos(rot),s=Math.sin(rot)
  for(const line of lines){
    const angle=(line.angle_deg+rotation)*Math.PI/180,u:Vec2=[Math.cos(angle),Math.sin(angle)],n:Vec2=[-u[1],u[0]],b:Vec2=[origin[0]+scale*(line.base_mm[0]*c-line.base_mm[1]*s),origin[1]+scale*(line.base_mm[0]*s+line.base_mm[1]*c)],offset:Vec2=[scale*(line.offset_mm[0]*c-line.offset_mm[1]*s),scale*(line.offset_mm[0]*s+line.offset_mm[1]*c)],across=offset[0]*n[0]+offset[1]*n[1]
    if(Math.abs(across)<1e-7)continue
    const clipped=polygonDiagonalHatchSegments(boundary,Math.abs(across),voids,line.angle_deg+rotation,b)
    const dashes=line.dashes_mm.map(v=>v*scale),cycle=dashes.reduce((sum,v)=>sum+Math.max(Math.abs(v),.05),0)
    for(const[a,z]of clipped){
      if(!dashes.length||cycle<1e-8){result.push([a,z]);continue}
      const ta=(a[0]-b[0])*u[0]+(a[1]-b[1])*u[1],tz=(z[0]-b[0])*u[0]+(z[1]-b[1])*u[1],lo=Math.min(ta,tz),hi=Math.max(ta,tz),row=Math.round(((a[0]-b[0])*n[0]+(a[1]-b[1])*n[1])/across),phase=row*(offset[0]*u[0]+offset[1]*u[1]),start=Math.floor((lo-phase)/cycle)
      let cursor=phase+start*cycle,iterations=0
      while(cursor<hi&&iterations++<10000){for(const dash of dashes){const length=Math.max(Math.abs(dash),.05),left=Math.max(lo,cursor),right=Math.min(hi,cursor+length);if(dash>=0&&right>left)result.push([[a[0]+(left-ta)*u[0],a[1]+(left-ta)*u[1]],[a[0]+(right-ta)*u[0],a[1]+(right-ta)*u[1]]]);cursor+=length;if(result.length>100000)return result} }
    }
    if(result.length>100000)return result.slice(0,100000)
  }
  return result
}
