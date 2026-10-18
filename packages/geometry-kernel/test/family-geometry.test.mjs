import test from 'node:test'
import assert from 'node:assert/strict'
import {extrudeWithVoids,triangleArea,clippedMaterialPatternSegments,pointInPolygon2D} from '../dist/index.js'
test('extrusion cap areas exclude voids and form inward-facing hole walls',()=>{
 const outer=[[0,0],[100,0],[100,100],[0,100]],hole=[[20,20],[40,20],[40,40],[20,40]],triangles=extrudeWithVoids(outer,[hole],0,50)
 const top=triangles.filter(t=>t.every(p=>p[2]===50)),area=top.reduce((s,t)=>s+triangleArea(t),0)
 assert.equal(area,9600)
 assert.ok(top.every(t=>!pointInPolygon2D([t.reduce((s,p)=>s+p[0],0)/3,t.reduce((s,p)=>s+p[1],0)/3],hole)))
 assert.throws(()=>extrudeWithVoids(outer,[[[90,90],[110,90],[110,110],[90,110]]],0,50),/inside|boundary/)
})
test('custom hatch origin, dashes, rotation and void clipping stay in model coordinates',()=>{
 const outer=[[0,0],[100,0],[100,100],[0,100]],hole=[[40,40],[60,40],[60,60],[40,60]]
 const lines=[{angle_deg:0,base_mm:[0,0],offset_mm:[5,10],dashes_mm:[10,-10]}]
 const segments=clippedMaterialPatternSegments(outer,lines,1,0,[0,0],[hole])
 assert.ok(segments.length>0)
 assert.ok(segments.every(([a,b])=>Math.abs(a[1]-b[1])<1e-6&&Math.hypot(b[0]-a[0],b[1]-a[1])<=10.001))
 assert.ok(segments.every(([a,b])=>{const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;return !(x>40&&x<60&&y>40&&y<60)}))
 const rotated=clippedMaterialPatternSegments(outer,lines,1,90,[0,0]);assert.ok(rotated.every(([a,b])=>Math.abs(a[0]-b[0])<1e-6))
})
