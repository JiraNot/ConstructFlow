import type { Dispatch, SetStateAction } from 'react'
import {
  ProjectDocument,
  isColumnObject,
  type PlacementReference,
} from '@constructflow/project-model'
import { CommandEnvelope } from '@constructflow/command-schema'
import { CommandBus } from '../commands/CommandBus.js'

interface UsePlanPlacementCommandsOptions {
  project: ProjectDocument
  activeColumnType: string
  activeColumnTopLevelId: string
  activeFoundationType: string
  activeBeamType: string
  activeWallType: string
  activeSlabType: string
  activeRoofType: string
  setProject: (project: ProjectDocument) => void
  setSelectedId: (id: string | null) => void
  setCommandQueue: Dispatch<SetStateAction<CommandEnvelope[]>>
  setFileFeedback: (message: string) => void
}

const nextHigherLevelId = (project: ProjectDocument, baseLevelId: string): string => {
  const base = project.levels.find(level => level.id === baseLevelId)
  return base ? [...project.levels]
    .filter(level => level.elevation_mm > base.elevation_mm)
    .sort((a, b) => a.elevation_mm - b.elevation_mm)[0]?.id ?? '' : ''
}

export function usePlanPlacementCommands({
  project,
  activeColumnType,
  activeColumnTopLevelId,
  activeFoundationType,
  activeBeamType,
  activeWallType,
  activeSlabType,
  activeRoofType,
  setProject,
  setSelectedId,
  setCommandQueue,
  setFileFeedback,
}: UsePlanPlacementCommandsOptions) {
  const handleCommitColumn = (location_mm: [number, number]) => {
    const colId = crypto.randomUUID()
    const baseLevelId = project.project.active_level_id
    const baseElevation = project.levels.find(level => level.id === baseLevelId)?.elevation_mm ?? -Infinity
    const topLevelId = project.levels.some(level => level.id === activeColumnTopLevelId && level.elevation_mm > baseElevation)
      ? activeColumnTopLevelId
      : nextHigherLevelId(project, baseLevelId)
    const res = CommandBus.execute(project, 'CreateColumn', {
      id: colId,
      mark: activeColumnType,
      location_mm: [location_mm[0], location_mm[1], 0],
      base_level_id: baseLevelId,
      ...(topLevelId ? { top_level_id: topLevelId } : {}),
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(colId)
      if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!])
    }
  }

  const handleCommitFoundation = (opts: { columnId?: string; location_mm?: [number, number] }) => {
    const foundationId = crypto.randomUUID()
    const res = CommandBus.execute(project, 'CreateFoundation', {
      id: foundationId,
      mark: activeFoundationType,
      supported_column_id: opts.columnId,
      location_mm: opts.location_mm ? [opts.location_mm[0], opts.location_mm[1], 0] : undefined,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(foundationId)
      if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!])
    }
  }

  const handleCommitBeam = (
    start_point_mm: [number, number],
    end_point_mm: [number, number],
    startColId?: string,
    endColId?: string,
    placementReference: PlacementReference = 'centerline',
  ) => {
    const beamId = crypto.randomUUID()
    const startColumn = startColId ? project.objects[startColId] : undefined
    const endColumn = endColId ? project.objects[endColId] : undefined
    if (startColumn && isColumnObject(startColumn)) start_point_mm = [startColumn.module_data.location_mm[0], startColumn.module_data.location_mm[1]]
    if (endColumn && isColumnObject(endColumn)) end_point_mm = [endColumn.module_data.location_mm[0], endColumn.module_data.location_mm[1]]
    const res = CommandBus.execute(project, 'CreateBeam', {
      id: beamId,
      mark: activeBeamType,
      placement_reference: placementReference,
      start_point_mm: [start_point_mm[0], start_point_mm[1], 0],
      end_point_mm: [end_point_mm[0], end_point_mm[1], 0],
      start_column_id: startColId,
      end_column_id: endColId,
      level_id: project.project.active_level_id,
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(beamId)
      if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!])
    }
  }

  const handleCommitWall = (
    start_point_mm: [number, number],
    end_point_mm: [number, number],
    placementReference: PlacementReference = 'centerline',
    verticalReference?: { level_id: string; top_level_id?: string; height_mm?: number; base_offset_mm?: number; top_offset_mm?: number },
  ) => {
    const wallId = crypto.randomUUID()
    const levelId = verticalReference?.level_id ?? project.project.active_level_id
    const res = CommandBus.execute(project, 'CreateWall', {
      id: wallId,
      mark: activeWallType,
      placement_reference: placementReference,
      start_point_mm: [start_point_mm[0], start_point_mm[1], 0],
      end_point_mm: [end_point_mm[0], end_point_mm[1], 0],
      level_id: levelId,
      ...(verticalReference?.top_level_id ? { top_level_id: verticalReference.top_level_id } : {}),
      ...(verticalReference?.height_mm !== undefined ? { height_mm: verticalReference.height_mm } : {}),
      ...(verticalReference?.base_offset_mm !== undefined ? { base_offset_mm: verticalReference.base_offset_mm } : {}),
      ...(verticalReference?.top_offset_mm !== undefined ? { top_offset_mm: verticalReference.top_offset_mm } : {}),
      ...(!verticalReference ? { inherit_joined_wall_constraint: true } : {}),
    })
    if (res.result.status === 'success') {
      setProject(res.updatedProject)
      setSelectedId(wallId)
      if (res.emittedEnvelope) setCommandQueue(queue => [...queue, res.emittedEnvelope!])
    }
  }

  const handleCommitSlab = (boundary_mm: [number, number][]) => {
    const type = project.types.find(item => item.object_type === 'structure.slab' && item.name.toLowerCase() === activeSlabType.toLowerCase())
    const level = project.levels.find(item => item.id === project.project.active_level_id)
    if (!type || !level || boundary_mm.length < 3) return
    const id = crypto.randomUUID()
    const result = CommandBus.execute(project, 'CreateSlab', {
      id,
      type_id: type.id,
      mark: type.name,
      level_id: level.id,
      boundary_mm,
      elevation_mm: level.elevation_mm,
      elevation_offset_mm: 0,
      thickness_mm: Number(type.parameters.thickness_mm ?? 120),
      topping_mm: Number(type.parameters.topping_mm ?? 0),
      slab_system: type.parameters.slab_system ?? 'slab_on_ground',
      material: String(type.parameters.material ?? 'reinforced_concrete'),
      slope_ratio: Number(type.parameters.slope_ratio ?? 0),
      drain_direction_deg: Number(type.parameters.drain_direction_deg ?? 0),
      finish_layers: Array.isArray(type.parameters.finish_layers) ? type.parameters.finish_layers : [],
      finish_pattern_mm: Array.isArray(type.parameters.finish_pattern_mm) ? type.parameters.finish_pattern_mm : [600, 600],
      finish_pattern_origin_mm: Array.isArray(type.parameters.finish_pattern_origin_mm) ? type.parameters.finish_pattern_origin_mm : [0, 0],
      finish_pattern_rotation_deg: Number(type.parameters.finish_pattern_rotation_deg ?? 0),
    })
    if (result.result.status === 'success') {
      setProject(result.updatedProject)
      setSelectedId(id)
      if (result.emittedEnvelope) setCommandQueue(queue => [...queue, result.emittedEnvelope!])
    }
  }

  const runArchitectureCommand = (name: string, input: Record<string, unknown>) => {
    const result = CommandBus.execute(project, name, input)
    if (result.result.status === 'success') {
      setProject(result.updatedProject)
      const created = result.result.created_object_ids?.[0] ?? result.result.affected_object_ids?.[0]
      if (created) setSelectedId(created)
      if (result.emittedEnvelope) setCommandQueue(queue => [...queue, result.emittedEnvelope!])
    } else setFileFeedback(result.result.errors?.join(' · ') ?? 'คำสั่งไม่สำเร็จ')
  }

  const handleCommitRoof = (
    boundary_mm: [number, number][],
    options: { shape: 'hip' | 'gable' | 'flat'; slope_deg: number; thickness_mm: number; elevation_offset_mm: number; material: string } = {
      shape: 'hip', slope_deg: 25, thickness_mm: 30, elevation_offset_mm: 2800, material: 'metal_sheet',
    },
  ) => {
    const roofType = project.types.find(type => type.object_type === 'roof.system' && type.name.toLowerCase() === activeRoofType.toLowerCase())
    const level = project.levels.find(item => item.id === project.project.active_level_id)
    if (!level || boundary_mm.length < 3) return
    if (options.shape === 'gable' && boundary_mm.length !== 4) {
      setFileFeedback('หลังคาจั่วต้องวาดขอบเขต 4 จุด · เปลี่ยนเป็นปั้นหยา/ดาดฟ้าสำหรับรูปหลายด้าน')
      return
    }
    runArchitectureCommand('GenerateRoof', {
      id: crypto.randomUUID(), mark: roofType?.name ?? 'R1', ...(roofType ? { type_id: roofType.id } : {}), level_id: level.id,
      created_phase: 'new_construction', boundary_mm, voids_mm: [],
      elevation_mm: level.elevation_mm + Number(options.elevation_offset_mm),
      edges: boundary_mm.map((_, index) => {
        const defines_slope = options.shape === 'flat' ? false : options.shape === 'gable' ? index % 2 === 0 : true
        return { defines_slope, slope_deg: defines_slope ? options.slope_deg : 0 }
      }),
      material: options.material, thickness_mm: options.thickness_mm,
    })
  }

  return { handleCommitColumn, handleCommitFoundation, handleCommitBeam, handleCommitWall, handleCommitSlab, runArchitectureCommand, handleCommitRoof }
}
