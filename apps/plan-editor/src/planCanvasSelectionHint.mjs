import {
  isBeamObject,
  isColumnObject,
  isDoorObject,
  isFoundationObject,
  isGridObject,
  isWallObject,
  isWindowObject,
} from '@constructflow/project-model'

const ADDITIONAL_GRIP_FAMILIES = new Set([
  'structure.slab',
  'architecture.floor',
  'architecture.ceiling',
  'roof.system',
  'architecture.room_separator',
  'drainage.pipe_route',
  'plumbing.pipe_route',
  'decorative.moulding_run',
  'interior.cabinet_run',
])

export function hasPlanCanvasSelectionGrip(project, ids) {
  return ids.some(id => {
    const object = project.objects[id]
    return !!object && (
      isColumnObject(object) || isFoundationObject(object) || isWallObject(object) ||
      isBeamObject(object) || isGridObject(object) || isDoorObject(object) ||
      isWindowObject(object) || ADDITIONAL_GRIP_FAMILIES.has(object.object_type)
    )
  })
}
