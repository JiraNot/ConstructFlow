import assert from 'node:assert/strict'
import test from 'node:test'
import { DOOR_FACE_DESIGNS, validateDoorFaceComponents } from '../dist/index.js'

test('door face recipes fit their leaf and use stable component identity', () => {
  assert.equal(DOOR_FACE_DESIGNS.length, 12)
  const ids = new Set()
  for (const recipe of DOOR_FACE_DESIGNS) {
    validateDoorFaceComponents(recipe.components)
    for (const component of recipe.components) {
      assert.equal(ids.has(component.id), false, `${recipe.key} should have independent component identity`)
      ids.add(component.id)
      assert.ok(component.x >= 0 && component.y >= 0)
      assert.ok(component.x + component.width <= 1)
      assert.ok(component.y + component.height <= 1)
    }
  }
})

test('door face validation rejects overlap outside the leaf and duplicate ids', () => {
  const base = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'panel', contour: 'arch', x: 0, y: 0, width: 1, height: 1 }
  assert.throws(() => validateDoorFaceComponents([{ ...base, x: 0.2, width: 1 }]))
  assert.throws(() => validateDoorFaceComponents([base, base]))
})
