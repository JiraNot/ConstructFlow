import fs from 'node:fs'
import { CommandBus } from '../../packages/command-runtime/dist/index.js'
import { applyExtensionPreset } from '../../packages/extension-engine/dist/index.js'

/** Rebuild a test project by making the reference house existing and adding an adjacent kitchen. */
export function createRenovationIntegrationProject() {
  const sourceProject = JSON.parse(fs.readFileSync(new URL('../../examples/constructflow-reference-house-2storey.cfproj', import.meta.url), 'utf8'))
  const sourceObjectCount = Object.keys(sourceProject.objects).length
  sourceProject.project.active_level_id = 'GF'
  const existing = CommandBus.executeBatch(sourceProject, Object.keys(sourceProject.objects).map(object_id => ({
    name: 'UpdateObjectPhase', input: { object_id, created_phase: 'existing', removed_phase: null },
  })))
  if (existing.status !== 'success') throw new Error(existing.errors?.join('; ') ?? 'Could not set existing phase')
  const demolitionObject = Object.values(existing.updatedProject.objects).find(object =>
    object.object_type === 'architecture.wall' && object.module_data.mark === 'W2' && object.module_data.level_id === 'GF')
  if (!demolitionObject) throw new Error('Could not locate interior partition for demolition intent')
  const demolition = CommandBus.execute(existing.updatedProject, 'UpdateObjectPhase', {
    object_id: demolitionObject.id, created_phase: 'existing', removed_phase: 'demolition',
  })
  if (demolition.result.status !== 'success') throw new Error(demolition.result.errors?.join('; ') ?? 'Could not mark demolition intent')
  const hostFacade = Object.values(demolition.updatedProject.objects).find(object => {
    if (object.object_type !== 'architecture.wall' || object.module_data.level_id !== 'GF') return false
    const [start, end] = [object.module_data.start_point_mm, object.module_data.end_point_mm]
    return start?.[0] === 13825 && end?.[0] === 13825 && Math.min(start[1], end[1]) <= 3275 && Math.max(start[1], end[1]) >= 5775
  })
  if (!hostFacade) throw new Error('Could not locate the existing east facade host')
  const extension = applyExtensionPreset(demolition.updatedProject, {
    preset: 'kitchen', posX_m: 13.825, posY_m: 3.275, width_m: 4, length_m: 2.5,
    kitchenWallSides: 3, kitchenIncludeDoor: true, kitchenIncludeWindow: true,
  })
  if (extension.status !== 'success') throw new Error(extension.errors?.join('; ') ?? 'Kitchen preset failed')
  return {
    project: extension.updatedProject,
    sourceObjectCount,
    demolitionObjectId: demolitionObject.id,
    hostFacadeId: hostFacade.id,
    newObjectIds: Object.values(extension.updatedProject.objects)
      .filter(object => object.created_phase === 'new_construction')
      .map(object => object.id),
  }
}
