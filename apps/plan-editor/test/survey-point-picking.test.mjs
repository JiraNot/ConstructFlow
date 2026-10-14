import test from 'node:test'
import assert from 'node:assert/strict'
import { findNearestSurveyPoint } from '../src/components/surveyPointPicking.mjs'

test('survey point picking chooses the closest marker within the screen-space tolerance', () => {
  const candidates = [
    { id: 'far', point: [30, 30] },
    { id: 'second', point: [14, 10] },
    { id: 'closest', point: [11, 10] },
  ]

  assert.equal(findNearestSurveyPoint([10, 10], candidates), 'closest')
})

test('survey point picking ignores markers outside the tolerance and exactly on its boundary', () => {
  assert.equal(findNearestSurveyPoint([0, 0], [{ id: 'edge', point: [11, 0] }]), null)
  assert.equal(findNearestSurveyPoint([0, 0], [{ id: 'far', point: [11.01, 0] }]), null)
})

test('survey point picking keeps project order for equally close markers', () => {
  assert.equal(findNearestSurveyPoint([0, 0], [
    { id: 'first', point: [-1, 0] },
    { id: 'second', point: [1, 0] },
  ]), 'first')
})
