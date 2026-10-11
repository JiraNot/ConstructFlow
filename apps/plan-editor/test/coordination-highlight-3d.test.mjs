import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import {
  buildCoordinationHighlightGroup,
  COORDINATION_HIGHLIGHT_3D_NAME,
  disposeCoordinationHighlightGroup,
} from '../src/rendering/coordinationHighlight3d.mjs'

function finding(id, severity, highlight) {
  return { id, rule_id: `RULE-${id}`, severity, highlight }
}

test('3D coordination impact boxes convert world millimeters to translucent meter volumes', () => {
  const group = buildCoordinationHighlightGroup([
    finding('impact', 'hard', [{ kind: 'box', tone: 'impact', min: [1000, 2000, 0], max: [1500, 3000, 500] }]),
  ])
  const mesh = group.children[0]

  assert.equal(group.name, COORDINATION_HIGHLIGHT_3D_NAME)
  assert.ok(mesh instanceof THREE.Mesh)
  assert.deepEqual(mesh.position.toArray(), [1.25, 2.5, 0.25])
  assert.deepEqual(mesh.geometry.parameters, { width: 0.5, height: 1, depth: 0.5, widthSegments: 1, heightSegments: 1, depthSegments: 1 })
  assert.equal(mesh.material.color.getHex(), 0xef4444)
  assert.equal(mesh.material.transparent, true)
  assert.equal(mesh.material.opacity, 0.32)
  assert.deepEqual(mesh.userData, { coordinationRuleId: 'RULE-impact', markerTone: 'impact' })
})

test('3D coordination subject boxes render as severity-colored wireframe extents', () => {
  const group = buildCoordinationHighlightGroup([
    finding('extent', 'clearance', [{ kind: 'box', tone: 'subject_b', min: [0, 0, 0], max: [0, 0, 0] }]),
  ])
  const wire = group.children[0]

  assert.ok(wire instanceof THREE.LineSegments)
  assert.equal(wire.geometry.getAttribute('position').count, 24)
  assert.deepEqual(wire.position.toArray(), [0, 0, 0])
  assert.equal(wire.material.color.getHex(), 0xf59e0b)
  assert.equal(wire.material.transparent, true)
  assert.deepEqual(wire.userData, { coordinationRuleId: 'RULE-extent', markerTone: 'subject_b' })
})

test('3D coordination measurements render as dashed meter-scaled segments', () => {
  const group = buildCoordinationHighlightGroup([
    finding('distance', 'soft', [{ kind: 'segment', tone: 'measure', from: [0, 0, 0], to: [0, 0, 1250] }]),
  ])
  const line = group.children[0]

  assert.ok(line instanceof THREE.Line)
  assert.deepEqual([...line.geometry.getAttribute('position').array], [0, 0, 0, 0, 0, 1.25])
  assert.equal(line.material.color.getHex(), 0x0ea5e9)
  assert.equal(line.material.dashSize, 0.08)
  assert.equal(line.material.gapSize, 0.05)
  assert.deepEqual(line.geometry.getAttribute('lineDistance').array, new Float32Array([0, 1.25]))
})

test('3D highlights ignore measure boxes, apply severity filters and cap worst findings first', () => {
  const findings = [
    finding('z-soft', 'soft', [{ kind: 'box', tone: 'impact', min: [0, 0, 0], max: [100, 100, 100] }]),
    finding('b-clearance', 'clearance', [{ kind: 'box', tone: 'impact', min: [0, 0, 0], max: [100, 100, 100] }]),
    finding('z-hard', 'hard', [{ kind: 'box', tone: 'impact', min: [0, 0, 0], max: [100, 100, 100] }]),
    finding('a-hard', 'hard', [
      { kind: 'box', tone: 'measure', min: [0, 0, 0], max: [100, 100, 100] },
      { kind: 'box', tone: 'impact', min: [0, 0, 0], max: [100, 100, 100] },
    ]),
  ]

  const limited = buildCoordinationHighlightGroup(findings, { maxFindings: 2 })
  assert.deepEqual(limited.children.map(child => child.userData.coordinationRuleId), ['RULE-a-hard', 'RULE-z-hard'])

  const filtered = buildCoordinationHighlightGroup(findings, { severities: ['clearance'] })
  assert.deepEqual(filtered.children.map(child => child.userData.coordinationRuleId), ['RULE-b-clearance'])

  const none = buildCoordinationHighlightGroup(findings, { maxFindings: 0 })
  assert.equal(none.children.length, 0)
})

test('disposing a 3D coordination group releases each geometry and material', () => {
  const group = buildCoordinationHighlightGroup([
    finding('impact', 'hard', [
      { kind: 'box', tone: 'impact', min: [0, 0, 0], max: [100, 100, 100] },
      { kind: 'segment', tone: 'measure', from: [0, 0, 0], to: [100, 0, 0] },
    ]),
  ])
  let disposedGeometries = 0
  let disposedMaterials = 0
  group.traverse(child => {
    child.geometry?.addEventListener('dispose', () => disposedGeometries++)
    child.material?.addEventListener('dispose', () => disposedMaterials++)
  })

  disposeCoordinationHighlightGroup(group)

  assert.equal(disposedGeometries, 2)
  assert.equal(disposedMaterials, 2)
  assert.equal(group.children.length, 0)
})
