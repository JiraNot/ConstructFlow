import assert from 'node:assert/strict'
import test from 'node:test'
import { createKitchenProofProject } from '@constructflow/extension-engine'
import { getPlanViewProject, getPlanVisibleObjects } from '@constructflow/representation-engine'
import { isDoorObject } from '@constructflow/project-model'
import { findPlanHitObject } from '../src/components/planHitTesting.mjs'

test('plan hit testing prioritizes hosted openings and can target their wall', () => {
  const result = createKitchenProofProject('human')
  assert.equal(result.status, 'success')
  const project = result.updatedProject
  const door = Object.values(project.objects).find(isDoorObject)
  assert.ok(door)
  const plan = getPlanViewProject(project, getPlanVisibleObjects(project, 'architecture'))
  const point = door.module_data.location_mm

  assert.equal(findPlanHitObject(point, plan, project, 0.08), door.id)
  assert.equal(findPlanHitObject(point, plan, project, 0.08, true), door.module_data.wall_id)
  assert.equal(findPlanHitObject([1e9, 1e9], plan, project, 0.08), null)
})
