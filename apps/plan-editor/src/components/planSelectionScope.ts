import type { SmartObject } from '@constructflow/project-model'
import type { ToolType } from './Toolbar.js'

/** Maps authoring tools to the saved object families they can select in isolation. */
const SELECTION_SCOPE_TYPES: Partial<Record<ToolType, readonly string[]>> = {
  wall: ['architecture.wall'],
  door: ['door_window.door'],
  window: ['door_window.window'],
  column: ['structure.column'],
  foundation: ['structure.foundation'],
  beam: ['structure.beam'],
  slab: ['structure.slab'],
  archFloor: ['architecture.floor'],
  ceiling: ['architecture.ceiling'],
  roof: ['roof.system'],
  // The slab-void tool edits a cutout stored on its host surface, so its
  // selection scope is the same set of surfaces that can receive that cutout.
  slabVoid: ['structure.slab', 'architecture.floor', 'architecture.ceiling', 'roof.system'],
  pipe: ['plumbing.pipe_route', 'drainage.pipe_route'],
  fixture: ['electrical.fixture'],
  cabinet: ['interior.cabinet_run'],
  furniture: ['interior.furniture', 'family.instance'],
  moulding: ['decorative.moulding_run', 'architecture.moulding_run'],
  roomSeparator: ['architecture.room_separator'],
  stair: ['architecture.stair'],
  grid: ['structure.grid', 'reference.grid'],
  gridSystem: ['structure.grid'],
  gridCopy: ['structure.grid', 'reference.grid'],
  bundle: ['supplier.bundle_instance'],
  fill: ['architecture.floor', 'architecture.ceiling', 'structure.slab', 'roof.system'],
}

export function canSelectToolScope(tool: ToolType): boolean {
  return Boolean(SELECTION_SCOPE_TYPES[tool]?.length)
}

export function matchesPlanSelectionScope(object: SmartObject | undefined, tool: ToolType | null | undefined): boolean {
  if (!tool) return true
  const allowedTypes = SELECTION_SCOPE_TYPES[tool]
  if (!allowedTypes?.includes(object?.object_type ?? '')) return false
  if (tool === 'gridSystem') {
    return Boolean((object?.module_data as Record<string, unknown> | undefined)?.system_id)
  }
  if (tool === 'grid') {
    return !(object?.module_data as Record<string, unknown> | undefined)?.system_id
  }
  return true
}
