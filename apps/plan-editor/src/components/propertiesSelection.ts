import {
  ProjectDocument,
  SmartObject,
  FoundationModuleData,
  isBeamObject,
  isColumnObject,
  isDoorObject,
  isFoundationObject,
  isGridObject,
  isWallObject,
  isWindowObject,
} from '@constructflow/project-model'

export function resolvePropertiesSelection(project: ProjectDocument, selectedId: string | null, selectedIds: string[]) {
  const selectedObject = selectedId ? project.objects[selectedId] ?? null : null
  const selectedObjects = [...new Set(selectedIds)]
    .map(id => project.objects[id])
    .filter((object): object is SmartObject => Boolean(object))
  const family = selectedObjects.length > 1 && selectedObjects.every(object => object.object_type === selectedObjects[0].object_type)
    ? selectedObjects[0].object_type
    : null
  const familyTypes = family ? project.types.filter(type => type.object_type === family) : []
  const resolvedTypeIds = selectedObjects.map(object => {
    const data = object.module_data as Record<string, unknown>
    return project.types.find(type => type.object_type === object.object_type && (type.id === data.type_id || type.name === data.mark))?.id ?? ''
  })
  const commonTypeId = selectedObjects.length > 1 && resolvedTypeIds[0] && resolvedTypeIds.every(id => id === resolvedTypeIds[0])
    ? resolvedTypeIds[0]
    : ''
  const canBulkUpdateLevel = selectedObjects.length > 1 && selectedObjects.every(object =>
    isBeamObject(object) || isColumnObject(object) || object.object_type === 'structure.slab' || object.object_type === 'architecture.floor' || object.object_type === 'architecture.ceiling'
  )

  if (!selectedObject) {
    return {
      selectedObject, selectedObjects, family, familyTypes, commonTypeId, canBulkUpdateLevel,
      column: null, foundation: null, beam: null, wall: null, door: null, window: null, grid: null,
      slab: null, architectureSurface: null, room: null, roof: null, pipe: null, fixture: null,
      cabinet: null, moulding: null, currentMark: '', hostedFoundation: undefined,
    }
  }

  const column = isColumnObject(selectedObject) ? selectedObject : null
  const foundation = isFoundationObject(selectedObject) ? selectedObject : null
  const beam = isBeamObject(selectedObject) ? selectedObject : null
  const wall = isWallObject(selectedObject) ? selectedObject : null
  const door = isDoorObject(selectedObject) ? selectedObject : null
  const window = isWindowObject(selectedObject) ? selectedObject : null
  const grid = isGridObject(selectedObject) ? selectedObject : null
  const slab = selectedObject.object_type === 'structure.slab' ? selectedObject : null
  const architectureSurface = selectedObject.object_type === 'architecture.floor' || selectedObject.object_type === 'architecture.ceiling' ? selectedObject : null
  const room = selectedObject.object_type === 'architecture.room' ? selectedObject : null
  const roof = selectedObject.object_type.startsWith('roof.') ? selectedObject : null
  const pipe = ['plumbing.pipe_route', 'drainage.pipe_route'].includes(selectedObject.object_type) ? selectedObject : null
  const fixture = selectedObject.object_type === 'electrical.fixture' ? selectedObject : null
  const cabinet = selectedObject.object_type === 'interior.cabinet_run' ? selectedObject : null
  const moulding = selectedObject.object_type === 'decorative.moulding_run' ? selectedObject : null
  const currentMark = column?.module_data.mark ?? foundation?.module_data.mark ?? beam?.module_data.mark ?? wall?.module_data.mark
    ?? door?.module_data.mark ?? window?.module_data.mark ?? grid?.module_data.tag ?? ''
  const hostedFoundation = column
    ? Object.values(project.objects).find(object => isFoundationObject(object) && (object.module_data.supported_column_id === column.id || object.host_refs?.includes(column.id))) as SmartObject<FoundationModuleData> | undefined
    : undefined

  return {
    selectedObject, selectedObjects, family, familyTypes, commonTypeId, canBulkUpdateLevel,
    column, foundation, beam, wall, door, window, grid, slab, architectureSurface, room, roof, pipe, fixture, cabinet, moulding,
    currentMark, hostedFoundation,
  }
}
