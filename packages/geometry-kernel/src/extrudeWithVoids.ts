import earcut from 'earcut'
import { validatePolygonWithVoids, type Vec2, type Vec3, type Triangle } from './index.js'
/** Closed, outward-facing extrusion including through-voids and triangulated caps. */
export function extrudeWithVoids(boundary:Vec2[],voids:Vec2[][],bottom:number,top:number):Triangle[]{
  const valid=validatePolygonWithVoids(boundary,voids)
  if(!valid.valid)throw new Error(valid.reason)
  if(!Number.isFinite(bottom)||!Number.isFinite(top)||top<=bottom)throw new Error('Invalid extrusion height')
  const normalize=(ring:Vec2[])=>{const copy=ring.map(p=>[...p] as Vec2);if(Math.hypot(copy[0][0]-copy.at(-1)![0],copy[0][1]-copy.at(-1)![1])<1e-8)copy.pop();return copy}
  const outer=normalize(boundary),holes=voids.map(normalize),points=[...outer,...holes.flat()],starts:number[]=[];let count=outer.length;for(const hole of holes){starts.push(count);count+=hole.length}
  const indices=earcut(points.flat(),starts,2),result:Triangle[]=[]
  for(let i=0;i<indices.length;i+=3){const[a,b,c]=indices.slice(i,i+3).map(index=>points[index]);const ccw=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0;const cap=(z:number):Triangle=>[[...a,z],[...b,z],[...c,z]];const upper=cap(top),lower=cap(bottom);result.push(ccw?upper:[upper[2],upper[1],upper[0]],ccw?[lower[2],lower[1],lower[0]]:lower)}
  for(const[ri,ring]of[outer,...holes].entries()){
    const area=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1]},0),reverse=(ri===0?area<0:area>0),r=reverse?[...ring].reverse():ring
    r.forEach((a,i)=>{const b=r[(i+1)%r.length],p:Vec3=[...a,bottom],q:Vec3=[...b,bottom],u:Vec3=[...a,top],v:Vec3=[...b,top];result.push([p,q,v],[p,v,u])})
  }
  return result
}
