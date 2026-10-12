import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { applyRepresentationTransform3D } from '../src/rendering/modelTransform3d.mjs'

test('wall extrusion keeps its base and height while rotating through all plan directions', () => {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0); shape.lineTo(4, 0); shape.lineTo(4, 2.8); shape.lineTo(0, 2.8); shape.closePath()
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4]) {
    const group = new THREE.Group()
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false })
    geometry.translate(0, 0, -0.075)
    group.add(new THREE.Mesh(geometry))
    applyRepresentationTransform3D(group, { position_mm: [2900, 5500, 400], rotation_rad: angle, shape: { kind: 'wall_extrusion' } })
    group.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(group)
    assert.ok(Math.abs(bounds.min.z - 0.4) < 1e-6, `base at ${angle}`)
    assert.ok(Math.abs(bounds.max.z - 3.2) < 1e-6, `top at ${angle}`)
    const end = group.localToWorld(new THREE.Vector3(4, 0, 0))
    assert.ok(Math.abs(end.x - (2.9 + 4 * Math.cos(angle))) < 1e-8)
    assert.ok(Math.abs(end.y - (5.5 + 4 * Math.sin(angle))) < 1e-8)
    geometry.dispose()
  }
})

test('opening and structural boxes retain their vertical axis and millimetre placement', () => {
  for (const kind of ['opening', 'box', 'triangle_mesh']) {
    const root = new THREE.Group()
    applyRepresentationTransform3D(root, { position_mm: [7500, 8800, 3800], rotation_rad: Math.PI / 2, shape: { kind } })
    root.updateMatrixWorld(true)
    const up = root.localToWorld(new THREE.Vector3(0, 0, 1))
    assert.deepEqual(root.position.toArray(), [7.5, 8.8, 3.8])
    assert.ok(Math.abs(up.z - 4.8) < 1e-8)
  }
})
