/** Positions are fractions of the leaf, measured from its bottom-left corner. */
export interface DoorFaceComponent {
  id: string
  kind: 'panel' | 'grooves'
  contour: 'rectangle' | 'arch' | 'capsule' | 'ellipse'
  x: number
  y: number
  width: number
  height: number
  count?: number
  direction?: 'horizontal' | 'vertical'
}

export function validateDoorFaceComponents(value: unknown): asserts value is DoorFaceComponent[] {
  if (!Array.isArray(value) || value.length > 24) throw new Error('door_face_components must contain at most 24 components')
  const ids = new Set<string>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid door face component')
    const p = raw as Record<string, unknown>
    if (typeof p.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.id) || ids.has(p.id.toLowerCase())) throw new Error('Door face component IDs must be unique UUIDs')
    ids.add(p.id.toLowerCase())
    if (!['panel', 'grooves'].includes(String(p.kind)) || !['rectangle', 'arch', 'capsule', 'ellipse'].includes(String(p.contour))) throw new Error('Invalid door face component kind or contour')
    if (!['x', 'y', 'width', 'height'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k]))) throw new Error('Door face component dimensions must be finite')
    if (Number(p.x) < 0 || Number(p.y) < 0 || Number(p.width) <= 0 || Number(p.height) <= 0 || Number(p.x) + Number(p.width) > 1.000001 || Number(p.y) + Number(p.height) > 1.000001) throw new Error('Door face components must fit within the leaf')
    if (p.count !== undefined && (!Number.isInteger(p.count) || Number(p.count) < 1 || Number(p.count) > 48)) throw new Error('Door groove count must be 1–48')
    if (p.direction !== undefined && !['horizontal', 'vertical'].includes(String(p.direction))) throw new Error('Invalid door groove direction')
    if (p.kind === 'grooves' && p.contour !== 'rectangle') throw new Error('Groove components require a rectangular region')
  }
}
