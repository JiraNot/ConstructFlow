// Coordination Highlight (3D half)
//
// The same findings the plan and elevation canvases draw are shown in the 3D viewport as
// translucent impact volumes, wireframe extents and measurement lines. Geometry is built here so
// the viewport component only has to add and dispose one group. This module stays JavaScript so
// Node can exercise the actual Three.js geometry without a browser renderer.

import * as THREE from 'three'

export const COORDINATION_HIGHLIGHT_3D_NAME = 'cf-coordination-highlight'

/** Same palette as the 2D overlay so a clash reads the same on screen and in the model. */
const SEVERITY_COLOR = {
  hard: 0xef4444,
  clearance: 0xf59e0b,
  soft: 0x0ea5e9,
}
const SEVERITY_ORDER = { hard: 0, clearance: 1, soft: 2 }

const mmToM = value => value / 1000

function boundsToCenterSize(marker) {
  if (!marker.min || !marker.max) return null
  const min = marker.min.map(mmToM)
  const max = marker.max.map(mmToM)
  const size = new THREE.Vector3(
    Math.max(max[0] - min[0], 0.01),
    Math.max(max[1] - min[1], 0.01),
    Math.max(max[2] - min[2], 0.01),
  )
  const center = new THREE.Vector3(
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  )
  return { center, size }
}

/**
 * Build the highlight group for the current findings. The caller owns the group: it should remove
 * the previous one and call {@link disposeCoordinationHighlightGroup} before replacing it.
 */
export function buildCoordinationHighlightGroup(findings, options = {}) {
  const group = new THREE.Group()
  group.name = COORDINATION_HIGHLIGHT_3D_NAME
  const allowed = options.severities ? new Set(options.severities) : null
  const selected = findings
    .filter(finding => !allowed || allowed.has(finding.severity))
    .sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] || left.id.localeCompare(right.id))
  const limited = options.maxFindings === undefined ? selected : selected.slice(0, Math.max(0, options.maxFindings))

  for (const finding of limited) {
    const color = SEVERITY_COLOR[finding.severity]
    for (const marker of finding.highlight) {
      if (marker.kind === 'segment' && marker.from && marker.to) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...marker.from.map(mmToM)),
          new THREE.Vector3(...marker.to.map(mmToM)),
        ])
        const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color, dashSize: 0.08, gapSize: 0.05 }))
        line.computeLineDistances()
        line.userData = { coordinationRuleId: finding.rule_id, markerTone: marker.tone }
        group.add(line)
        continue
      }
      if (marker.kind !== 'box' || marker.tone === 'measure') continue
      const box = boundsToCenterSize(marker)
      if (!box) continue
      if (marker.tone === 'impact') {
        // Translucent volume marking exactly where the two objects occupy the same space.
        const geometry = new THREE.BoxGeometry(box.size.x, box.size.y, box.size.z)
        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.copy(box.center)
        mesh.renderOrder = 5
        mesh.userData = { coordinationRuleId: finding.rule_id, markerTone: marker.tone }
        group.add(mesh)
        continue
      }
      const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(box.size.x, box.size.y, box.size.z)),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
      )
      wire.position.copy(box.center)
      wire.userData = { coordinationRuleId: finding.rule_id, markerTone: marker.tone }
      group.add(wire)
    }
  }
  return group
}

/** Release every geometry/material the group owns; forgetting this leaks GPU memory per edit. */
export function disposeCoordinationHighlightGroup(group) {
  group.traverse(child => {
    const renderable = child
    if (renderable.geometry) renderable.geometry.dispose()
    const material = renderable.material
    if (Array.isArray(material)) material.forEach(entry => entry.dispose())
    else material?.dispose()
  })
  group.clear()
}
