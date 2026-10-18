import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, serializeProject, deserializeProject, evaluateFamilyExpression, resolveFamilyParameters, validateFamilyDefinition } from '@constructflow/project-model'
import { createFamilyTemplate, evaluateFamily, familyOutputs, builtInFurnitureFamilies, objectFamilyGeometry, parseFamilyPat, exportFamilyDxf } from '@constructflow/family-engine'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'
const template=()=>createFamilyTemplate(crypto.randomUUID(),'โต๊ะปรับขนาด','furniture')
const document=()=>createEmptyProjectDocument(crypto.randomUUID())
const place=(family,id=crypto.randomUUID(),values={})=>({name:'PlaceFamilyInstance',input:{id,family_id:family.id,location_mm:[100,200,0],rotation_deg:0,family_parameters:values}})

test('family expressions resolve dependent formulas, protect scopes and reject cycles/code',()=>{
 const family=template();family.parameters.push({name:'Half',label:'ครึ่งกว้าง',scope:'type',value:600,formula:'max(50, W/2-25)'})
 assert.equal(evaluateFamily(family,undefined,{W:1600}).parameters.Half,775)
 family.parameters[0].scope='type';assert.throws(()=>resolveFamilyParameters(family,undefined,{W:1800}),/Instance/)
 assert.throws(()=>evaluateFamilyExpression('globalThis.process.exit()',{}));assert.throws(()=>evaluateFamilyExpression('1 / 0',{}))
 family.parameters[0].formula='Half*2';assert.throws(()=>validateFamilyDefinition(family),/สูตร/)
})

test('same parameter controls 2D/3D, type cascades preserve UUID and history/save roundtrip',()=>{
 const family=template(),id=crypto.randomUUID(),session=new ProjectCommandSession(document())
 family.parameters[0].scope='type';family.types[0].values.W=1400
 let result=session.execute([{name:'SaveFamily',input:{family}},place(family,id)])
 assert.equal(result.status,'success',result.errors?.join())
 const geometry=objectFamilyGeometry(session.project,session.project.objects[id]);assert.equal(Math.max(...geometry.worldPaths.flatMap(path=>path.points.map(p=>p[0]))),1500)
 assert.equal(Math.max(...geometry.worldParts.flatMap(part=>part.triangles.flat().map(p=>p[0]))),1500)
 const changed=structuredClone(family);changed.types[0].values.W=1800
 assert.equal(session.execute([{name:'SaveFamily',input:{family:changed}}]).status,'success')
 assert.equal(session.project.objects[id].module_data.width_mm,1800);assert.equal(session.project.objects[id].id,id)
 assert.equal(session.undo().objects[id].module_data.width_mm,1400);assert.equal(session.redo().objects[id].module_data.width_mm,1800)
 const reopened=deserializeProject(serializeProject(session.project));assert.deepEqual(familyOutputs(reopened),familyOutputs(session.project))
 assert.notEqual(CommandBus.execute(reopened,'DeleteFamily',{family_id:family.id}).result.status,'success')
})

test('invalid instance geometry rolls back atomically and does not corrupt redo',()=>{
 const family=template();family.extrusions[0].start=100
 const session=new ProjectCommandSession(document()),id=crypto.randomUUID()
 assert.equal(session.execute([{name:'SaveFamily',input:{family}},place(family,id)]).status,'success')
 const before=serializeProject(session.project)
 const result=session.execute([{name:'UpdateFamilyInstance',input:{object_id:id,family_parameters:{H:50}}}])
 assert.notEqual(result.status,'success');assert.equal(serializeProject(session.project),before)
 assert.equal(session.execute([{name:'UpdateFamilyInstance',input:{object_id:id,location_mm:[900,500,0],rotation_deg:30}}]).status,'success')
 assert.deepEqual(session.project.objects[id].module_data.location_mm,[900,500,0]);session.undo();assert.deepEqual(session.project.objects[id].module_data.location_mm,[100,200,0])
})

test('legacy furniture uses editable built-in graphs, updates preserve Family linkage',()=>{
 const project=document(),family=structuredClone(builtInFurnitureFamilies[0]),id=crypto.randomUUID()
 const created=CommandBus.execute(project,'CreateInteriorFurniture',{id,kind:'sofa',mark:'IF1',location_mm:[0,0,0],width_mm:2200,depth_mm:950,height_mm:850,rotation_deg:0,material:'fabric'})
 assert.equal(created.result.status,'success')
 assert.ok(objectFamilyGeometry(created.updatedProject,created.updatedProject.objects[id]).parts.length>3)
 const session=new ProjectCommandSession(created.updatedProject)
 family.paths[0].color='#ff0000';assert.equal(session.execute([{name:'SaveFamily',input:{family}}]).status,'success')
 assert.equal(session.project.objects[id].module_data.family_id,family.id)
 assert.equal(objectFamilyGeometry(session.project,session.project.objects[id]).parameters.W,2200)
 const changed=session.execute([{name:'UpdateInteriorFurniture',input:{id,material:'wood'}}]);assert.equal(changed.status,'success',changed.errors?.join());assert.equal(changed.updatedProject.objects[id].module_data.family_id,family.id)
})

test('hosted door family keeps native wall cutout and rejects resize outside host',()=>{
 const family=createFamilyTemplate(crypto.randomUUID(),'ประตูของฉัน','door'),wallId=crypto.randomUUID(),id=crypto.randomUUID(),session=new ProjectCommandSession(document())
 const result=session.execute([{name:'SaveFamily',input:{family}},{name:'CreateWall',input:{id:wallId,mark:'W1',start_point_mm:[0,0],end_point_mm:[4000,0],thickness_mm:100,height_mm:2800}},{name:'CreateDoor',input:{id,mark:'D1',wall_id:wallId,location_mm:[2000,0,0],offset_along_wall_mm:2000,width_mm:900,height_mm:2100}},{name:'AttachFamily',input:{object_id:id,family_id:family.id}}])
 assert.equal(result.status,'success',result.errors?.join())
 assert.equal(session.project.objects[id].object_type,'door_window.door');assert.deepEqual(session.project.objects[id].host_refs,[wallId])
 assert.notEqual(session.execute([{name:'UpdateFamilyInstance',input:{object_id:id,family_parameters:{W:5000}}}]).status,'success')
})

test('PAT definitions remain portable through family and project serialization',()=>{
 const family=template();const [pattern]=parseFamilyPat('*CUSTOM,Custom brick\n0,0,0,0,100\n90,0,0,100,200,100,-100\n')
 family.paths[0].hatch={pattern:'custom',lines:pattern.lines,name:pattern.name,spacing_mm:100,pattern_scale:2,rotation_deg:30,color:'#334455'}
 validateFamilyDefinition(family)
 assert.ok(exportFamilyDxf(family).includes('-HATCH'))
 const session=new ProjectCommandSession(document());assert.equal(session.execute([{name:'SaveFamily',input:{family}},place(family)]).status,'success')
 assert.deepEqual(deserializeProject(serializeProject(session.project)).families[0].paths[0].hatch,family.paths[0].hatch)
})
test('moving a family profile keeps formulas and voids attached',async()=>{
 const {translateFamilyPath}=await import('@constructflow/family-engine'),family=template()
 family.paths[0].voids=[[[10,10],[20,10],[20,20],[10,20]]]
 const moved=translateFamilyPath(family.paths[0],[50,25]);family.paths[0]=moved
 const evaluated=evaluateFamily(family,undefined,{W:1600})
 assert.equal(evaluated.paths[0].points[1][0],1650);assert.deepEqual(evaluated.paths[0].voids[0][0],[60,35])
})
test('native opening resize keeps family geometry and cutout dimensions synchronized',()=>{
 const family=createFamilyTemplate(crypto.randomUUID(),'Custom door','door'),id=crypto.randomUUID(),wallId=crypto.randomUUID(),session=new ProjectCommandSession(document())
 assert.equal(session.execute([{name:'SaveFamily',input:{family}},{name:'CreateWall',input:{id:wallId,start_point_mm:[0,0],end_point_mm:[4000,0],thickness_mm:100,height_mm:2800}},{name:'CreateDoor',input:{id,mark:'D1',wall_id:wallId,location_mm:[2000,0,0],offset_along_wall_mm:2000,width_mm:900,height_mm:2100}},{name:'AttachFamily',input:{object_id:id,family_id:family.id}}]).status,'success')
 const result=session.execute([{name:'UpdateDoorDimensions',input:{object_id:id,width_mm:1100,height_mm:2300,sill_height_mm:0}}]);assert.equal(result.status,'success',result.errors?.join())
 assert.equal(objectFamilyGeometry(session.project,session.project.objects[id]).parameters.W,1100);assert.equal(objectFamilyGeometry(session.project,session.project.objects[id]).parameters.H,2300)
 assert.equal(familyOutputs(session.project).find(output=>output.object_id===id).quantities.length,0,'native doors retain their own takeoff quantity')
})
test('hosted family handing mirrors symbols and keeps linked placement catalog dimensions current',()=>{
 const family=createFamilyTemplate(crypto.randomUUID(),'Custom door','door'),id=crypto.randomUUID(),wallId=crypto.randomUUID(),typeId=crypto.randomUUID(),session=new ProjectCommandSession(document())
 family.paths.push({id:'hinge',points:[[0,0],[100,300]],closed:false,view:'plan',layer:'hinge',color:'#000000',lineweight_mm:.25})
 const initial=session.execute([{name:'SaveFamily',input:{family}},{name:'DefineStructuralType',input:{id:typeId,name:'Custom',object_type:'door_window.door',parameters:{width_mm:900,height_mm:2100,family_id:family.id}}},{name:'CreateWall',input:{id:wallId,start_point_mm:[0,0],end_point_mm:[4000,0],thickness_mm:100,height_mm:2800}},{name:'CreateDoor',input:{id,mark:'D1',wall_id:wallId,location_mm:[2000,0,0],offset_along_wall_mm:2000,width_mm:900,height_mm:2100,handing:'left_in'}},{name:'AttachFamily',input:{object_id:id,family_id:family.id}}])
 assert.equal(initial.status,'success',initial.errors?.join())
 const before=objectFamilyGeometry(session.project,session.project.objects[id]).worldPaths.find(path=>path.id==='hinge').points
 const flipped=session.execute([{name:'FlipDoorHanding',input:{object_id:id,handing:'right_out'}}]);assert.equal(flipped.status,'success',flipped.errors?.join())
 const after=objectFamilyGeometry(session.project,session.project.objects[id]).worldPaths.find(path=>path.id==='hinge').points
 assert.notDeepEqual(after,before)
 assert.equal(Math.abs(after[0][0]-before[0][0]),900)
 const changed=structuredClone(family);changed.parameters[0].value=1100
 assert.equal(session.execute([{name:'SaveFamily',input:{family:changed}}]).status,'success')
 assert.equal(session.project.types.find(type=>type.id===typeId).parameters.width_mm,1100)
})
