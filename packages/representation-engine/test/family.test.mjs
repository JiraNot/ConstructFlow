import test from 'node:test'
import assert from 'node:assert/strict'
import {createEmptyProjectDocument} from '../../project-model/dist/index.js'
import {createFamilyTemplate} from '../../family-engine/dist/index.js'
import {ProjectCommandSession} from '../../command-runtime/dist/index.js'
import {getPlanPickCandidates,buildProjectRepresentations3D} from '../dist/index.js'

test('rotated family voids do not block selection of objects behind the opening',()=>{
 const family=createFamilyTemplate(crypto.randomUUID()),id=crypto.randomUUID()
 family.paths[0].voids=[[[200,100],[400,100],[400,300],[200,300]]]
 const session=new ProjectCommandSession(createEmptyProjectDocument(crypto.randomUUID()))
 const result=session.execute([{name:'SaveFamily',input:{family}},{name:'PlaceFamilyInstance',input:{id,family_id:family.id,location_mm:[1000,2000,0],rotation_deg:90}}])
 assert.equal(result.status,'success',result.errors?.join())
 assert.ok(!getPlanPickCandidates(session.project,session.project,[800,2300],.1).includes(id))
 assert.ok(getPlanPickCandidates(session.project,session.project,[950,2100],.1).includes(id))
 const shape=buildProjectRepresentations3D(session.project).objects.find(object=>object.object_id===id).shape
 assert.equal(shape.kind,'triangle_mesh');assert.ok(shape.parts.length)
})
