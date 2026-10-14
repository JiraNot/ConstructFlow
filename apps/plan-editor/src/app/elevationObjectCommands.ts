import {
  isColumnObject,
  isDoorObject,
  isWallObject,
  isWindowObject,
  type ProjectDocument,
} from '@constructflow/project-model'
import type { CommandBatchResult, CommandRequest } from '@constructflow/command-schema'

type DispatchCommandBatch = (commands: CommandRequest[]) => CommandBatchResult
type MoveColumn = (objectId: string, locationMm: [number, number]) => void

/** Builds the atomic commands used when a selected object is moved in an elevation view. */
export function createElevationObjectCommandHandler(
  project: ProjectDocument,
  dispatchCommandBatch: DispatchCommandBatch,
  handleMoveColumn: MoveColumn,
) {
  return (
    objectId: string,
    deltaWorldMm: [number, number],
    deltaZMm: number,
    verticalIntent: 'move' | 'top' | 'base',
  ) => {
    const object = project.objects[objectId]
    if (!object) return

    if (isWallObject(object)) {
      const commands: CommandRequest[] = []
      if (Math.hypot(...deltaWorldMm) > 0.1) {
        commands.push({ name: 'MoveWall', input: { object_id: objectId, delta_mm: deltaWorldMm } })
      }
      if (Math.abs(deltaZMm) > 0.1) {
        const data = object.module_data
        const topEdit = verticalIntent === 'top'
        commands.push({
          name: 'UpdateWallDimensions',
          input: {
            object_id: objectId,
            thickness_mm: data.thickness_mm,
            ...(topEdit
              ? data.vertical_constraint === 'top_level'
                ? { top_level_id: data.top_level_id, top_offset_mm: Number(data.top_offset_mm ?? 0) + deltaZMm, vertical_constraint: 'top_level' }
                : { height_mm: Math.max(100, Number(data.height_mm) + deltaZMm), vertical_constraint: 'fixed_height' }
              : data.vertical_constraint === 'top_level'
                ? {
                    top_level_id: data.top_level_id,
                    base_offset_mm: Number(data.base_offset_mm ?? 0) + deltaZMm,
                    top_offset_mm: Number(data.top_offset_mm ?? 0) + deltaZMm,
                    vertical_constraint: 'top_level',
                  }
                : { height_mm: data.height_mm, base_offset_mm: Number(data.base_offset_mm ?? 0) + deltaZMm, vertical_constraint: 'fixed_height' }),
          },
        })
      }
      if (commands.length) dispatchCommandBatch(commands)
      return
    }

    if (isDoorObject(object) || isWindowObject(object)) {
      const commands: CommandRequest[] = []
      if (Math.hypot(...deltaWorldMm) > 0.1) {
        const wall = project.objects[object.module_data.wall_id]
        if (isWallObject(wall)) {
          const [ax, ay] = wall.module_data.start_point_mm
          const [bx, by] = wall.module_data.end_point_mm
          const length = Math.hypot(bx - ax, by - ay)
          if (length > 0) {
            const along = (deltaWorldMm[0] * (bx - ax) + deltaWorldMm[1] * (by - ay)) / length
            commands.push({
              name: 'MoveOpening',
              input: { object_id: objectId, offset_along_wall_mm: object.module_data.offset_along_wall_mm + along },
            })
          }
        }
      }
      if (Math.abs(deltaZMm) > 0.1) {
        const data = object.module_data
        const vertical = verticalIntent === 'top'
          ? data.vertical_constraint === 'head_level'
            ? { head_level_id: data.head_level_id, head_offset_mm: Number(data.head_offset_mm ?? 0) + deltaZMm, vertical_constraint: 'head_level' }
            : { height_mm: Math.max(100, data.height_mm + deltaZMm), vertical_constraint: 'fixed_height' }
          : { sill_height_mm: Math.max(0, Number(data.sill_height_mm ?? 0) + deltaZMm) }
        commands.push({
          name: isDoorObject(object) ? 'UpdateDoorDimensions' : 'UpdateWindowDimensions',
          input: { object_id: objectId, width_mm: data.width_mm, height_mm: data.height_mm, ...vertical },
        })
      }
      if (commands.length) dispatchCommandBatch(commands)
      return
    }

    if (isColumnObject(object) && Math.hypot(...deltaWorldMm) > 0.1) {
      const [x, y] = object.module_data.location_mm
      handleMoveColumn(objectId, [x + deltaWorldMm[0], y + deltaWorldMm[1]])
    }
  }
}
