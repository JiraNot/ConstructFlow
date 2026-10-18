import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, deserializeProject, serializeProject } from '../dist/index.js'

test('embedded view underlays preserve calibration and visibility through .cfproj serialization', () => {
  const project=createEmptyProjectDocument(crypto.randomUUID())
  project.underlays={'plan:L1':{data_url:'data:image/png;base64,iVBORw0KGgo=',source_file:'house.dwg',source_kind:'dwg',source_layout:'A-02 Ground',source_region:[120,80,900,700],scale_source:'declared_units',origin_mm:[120,-40],scale_mm_per_px:2.5,rotation_deg:12,opacity:.35,visible:false}}
  const restored=deserializeProject(serializeProject(project))
  assert.deepEqual(restored.underlays,project.underlays)
})

test('multi-plan DWG underlays keep independent identity, source, level, and visibility', () => {
  const project=createEmptyProjectDocument(crypto.randomUUID())
  project.levels.push({ id:'L2', name:'Upper Floor', elevation_mm:3000, storey_index:2, height_mm:3000 })
  const [lower, upper] = project.levels
  project.underlays={
    'drawing:ground':{drawing_id:'ground',display_name:'แบบชั้นล่าง',view_id:'plan',level_id:lower.id,data_url:'data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E',source_file:'client.dwg',source_kind:'dwg',source_layout:'Model Space',source_region:[0,0,400,300],scale_source:'declared_units',origin_mm:[0,0],scale_mm_per_px:1,rotation_deg:0,opacity:.6,visible:true},
    'drawing:upper':{drawing_id:'upper',display_name:'แบบชั้นบน',view_id:'plan',level_id:upper.id,data_url:'data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E',source_file:'client.dwg',source_layout:'A-02 Upper',scale_source:'declared_units',origin_mm:[100,200],scale_mm_per_px:2,rotation_deg:0,opacity:.4,visible:false},
  }
  const restored=deserializeProject(serializeProject(project))
  assert.deepEqual(restored.underlays,project.underlays)
})

test('reject invalid underlay transforms rather than opening a corrupt calibration', () => {
  const project=createEmptyProjectDocument(crypto.randomUUID())
  project.underlays={'plan:L1':{data_url:'data:image/png;base64,a',origin_mm:[0,0],scale_mm_per_px:0,rotation_deg:0,opacity:.5,visible:true}}
  assert.throws(()=>deserializeProject(serializeProject(project)),/underlay .*invalid transform/)
})

test('reject malformed imported underlay source regions', () => {
  const project=createEmptyProjectDocument(crypto.randomUUID())
  project.underlays={'plan:L1':{data_url:'data:image/png;base64,a',source_region:[0,0,0,20],origin_mm:[0,0],scale_mm_per_px:1,rotation_deg:0,opacity:1,visible:true}}
  assert.throws(()=>deserializeProject(serializeProject(project)),/underlay .*invalid source metadata/)
})

test('reject a multi-plan underlay bound to a level outside its project', () => {
  const project=createEmptyProjectDocument(crypto.randomUUID())
  project.underlays={'drawing:bad':{drawing_id:'bad',view_id:'plan',level_id:'missing-level',data_url:'data:image/png;base64,iVBORw0KGgo=',origin_mm:[0,0],scale_mm_per_px:1,rotation_deg:0,opacity:.6,visible:true}}
  assert.throws(()=>deserializeProject(serializeProject(project)),/underlay .*invalid source metadata/)
})
