import test from 'node:test'
import assert from 'node:assert/strict'
import {validateFamilyDefinition} from '@constructflow/project-model'
import {builtInFurnitureFamilies,evaluateFamily,projectFamilyPlan,createFamilyTemplate,parseFamilyPat} from '../dist/index.js'

test('every built-in furniture family has editable paths and parameter-driven solid parts',()=>{
 assert.equal(builtInFurnitureFamilies.length,10)
 for(const family of builtInFurnitureFamilies){
  validateFamilyDefinition(family)
  const geometry=evaluateFamily(family,undefined,{W:2400,D:1100,H:950})
  assert.ok(geometry.paths.length>1,family.name);assert.ok(geometry.parts.length>1,family.name)
  assert.ok(geometry.parts.every(part=>part.triangles.flat().flat().every(Number.isFinite)))
 }
})
test('generated plan omits coplanar cap triangulation edges and keeps parameter bindings',()=>{
 const family=createFamilyTemplate(crypto.randomUUID()),paths=projectFamilyPlan(family)
 assert.equal(paths.length,4)
 assert.ok(paths.every(path=>path.points.every(point=>point.every(value=>typeof value==='string'))))
 const [pattern]=parseFamilyPat('*SIMPLE,Simple\n45,0,0,0,100,50,-25\n')
 assert.ok(Math.abs(pattern.lines[0].offset_mm[0]+Math.sqrt(5000))<1e-6)
})
test('mesh parts can preserve a physical dimension and follow parametric offsets instead of stretching as one object',()=>{
 const family=createFamilyTemplate(crypto.randomUUID())
 family.meshes=[{id:'frame',vertices:[[0,0,0],[80,0,0],[0,100,0]],faces:[[0,1,2]],scale:['W/1000',1,1],offset:[0,0,0],color:'#ffffff'}]
 const stretched=evaluateFamily(family,undefined,{W:2000}).parts.find(part=>part.id==='frame').triangles[0][1]
 assert.equal(stretched[0],160)
 family.meshes[0].scale[0]=1
 family.meshes[0].offset[0]='W-80'
 const anchored=evaluateFamily(family,undefined,{W:2000}).parts.find(part=>part.id==='frame').triangles[0][1]
 assert.equal(anchored[0],2000,'fixed-width frame part remains 80 mm wide and its edge follows W')
})
test('resizing rules keep a repeated decorative motif at its physical size and center the array',()=>{
 const family=createFamilyTemplate(crypto.randomUUID())
 family.meshes=[{id:'round-motif',name:'วงกลม',vertices:[[0,0,0],[100,0,0],[0,20,0]],faces:[[0,1,2]],scale:['W/100','D/20','H/10'],offset:[0,0,0],reference_size_mm:[100,20,10],resize_behavior:['repeat','fixed','fixed'],repeat_spacing_mm:[20,0,0],color:'#ffffff'}]
 const triangles=evaluateFamily(family,undefined,{W:250,D:20,H:10}).parts.find(part=>part.id==='round-motif').triangles
 assert.equal(triangles.length,2)
 assert.deepEqual(triangles.map(triangle=>[Math.min(...triangle.map(point=>point[0])),Math.max(...triangle.map(point=>point[0]))]),[[15,115],[135,235]])
 assert.equal(triangles[0][1][0]-triangles[0][0][0],100,'each motif keeps its original width')
})
test('fit behavior applies a common scale factor to preserve a motif aspect ratio',()=>{
 const family=createFamilyTemplate(crypto.randomUUID())
 family.meshes=[{id:'detail',vertices:[[0,0,0],[100,0,0],[0,50,0]],faces:[[0,1,2]],scale:['W/100','D/50',1],offset:[0,0,0],reference_size_mm:[100,50,10],resize_behavior:['fit','fit','fixed'],color:'#ffffff'}]
 const triangle=evaluateFamily(family,undefined,{W:300,D:100,H:10}).parts.find(part=>part.id==='detail').triangles[0]
 assert.equal(triangle[1][0]-triangle[0][0],200)
 assert.equal(triangle[2][1]-triangle[0][1],100)
})
test('family validation rejects invalid part resizing rules',()=>{
 const family=createFamilyTemplate(crypto.randomUUID())
 family.meshes=[{id:'detail',vertices:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]],scale:[1,1,1],offset:[0,0,0],reference_size_mm:[100,100,100],resize_behavior:['repeat','stretch','stretch'],repeat_spacing_mm:[-1,0,0],color:'#ffffff'}]
 assert.throws(()=>validateFamilyDefinition(family),/ระยะซ้ำ Mesh ไม่ถูกต้อง/)
})
