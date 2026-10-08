import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, deserializeProject, serializeProject } from '../dist/index.js'

test('embedded view underlays preserve calibration and visibility through .cfproj serialization', () => {
  const project=createEmptyProjectDocument(crypto.randomUUID())
  project.underlays={'plan:L1':{data_url:'data:image/png;base64,iVBORw0KGgo=',origin_mm:[120,-40],scale_mm_per_px:2.5,rotation_deg:12,opacity:.35,visible:false}}
  const restored=deserializeProject(serializeProject(project))
  assert.deepEqual(restored.underlays,project.underlays)
})

test('reject invalid underlay transforms rather than opening a corrupt calibration', () => {
  const project=createEmptyProjectDocument(crypto.randomUUID())
  project.underlays={'plan:L1':{data_url:'data:image/png;base64,a',origin_mm:[0,0],scale_mm_per_px:0,rotation_deg:0,opacity:.5,visible:true}}
  assert.throws(()=>deserializeProject(serializeProject(project)),/underlay .*invalid transform/)
})
