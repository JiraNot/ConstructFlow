import assert from 'node:assert/strict'
import test from 'node:test'
import { coordinationObjectText, planCoordinationOverlay } from '../src/coordinationOverlayPlan.mjs'

test('opening clearance badges identify the actual beam instead of its projected wall', () => {
  const finding = {
    id: 'opening-beam', rule_id: 'CF-CL-OPEN-STR-005', severity: 'clearance',
    objects: [
      { object_type: 'door_window.door', object_id: 'door', mark: 'D3', label_th: 'ช่องเปิด' },
      { object_type: 'structure.beam', object_id: 'beam', mark: 'B1', label_th: 'เสา/คาน' },
    ],
    highlight: [{ kind: 'box', tone: 'impact', min: [0, 0, 0], max: [900, 150, 400] }],
    suggestion: { recommended_mm: 280, phrase_th: 'เลื่อนไปทาง +Y 280 มม.' },
  }
  const badge = planCoordinationOverlay([finding], { project: p => [p[0], p[1]] }).find(p => p.kind === 'badge')
  assert.deepEqual(badge.lines, ['ระยะไม่พอ (Clearance) · CF-CL-OPEN-STR-005', 'ประตู D3 ↔ คาน B1', 'เลื่อนไปทาง +Y 280 มม.'])
  assert.ok(badge.height >= badge.lines.length * 14)
  assert.equal(coordinationObjectText({ object_type: 'structure.column', mark: 'C1', label_th: 'เสา/คาน' }), 'เสา C1')
})
