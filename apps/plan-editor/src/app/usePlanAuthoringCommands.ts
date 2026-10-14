import type { CommandBatchResult, CommandRequest } from '@constructflow/command-schema'
import type {
  DoorHanding,
  ProjectDocument,
  StairModuleData,
} from '@constructflow/project-model'
import { validatePolygonWithVoids } from '@constructflow/geometry-kernel'
import { getRoofEaveBoundary } from '@constructflow/roof-engine'

type PipeSystem = 'waste' | 'soil' | 'rainwater' | 'vent' | 'cold_water' | 'hot_water'
type FixtureKind = 'light' | 'switch' | 'outlet' | 'panel'

interface UsePlanAuthoringCommandsOptions {
  project: ProjectDocument
  activeDoorType: string
  activeWindowType: string
  dispatchCommandBatch: (commands: CommandRequest[]) => CommandBatchResult
  setSelectedId: (id: string | null) => void
  setSelectedIds: (ids: string[]) => void
  setFileFeedback: (message: string) => void
}

/** Builds semantic authoring commands beside the editor session boundary, not in App's view orchestration. */
export function usePlanAuthoringCommands({
  project,
  activeDoorType,
  activeWindowType,
  dispatchCommandBatch,
  setSelectedId,
  setSelectedIds,
  setFileFeedback,
}: UsePlanAuthoringCommandsOptions) {
  const runArchitectureCommand = (name: string, input: Record<string, unknown>) => {
    const result = dispatchCommandBatch([{ name, input }])
    if (result.status === 'success') {
      const created = result.results[0]?.created_object_ids?.[0] ?? result.results[0]?.affected_object_ids[0]
      if (created) {
        setSelectedId(created)
        setSelectedIds([created])
      }
    } else {
      setFileFeedback(result.errors?.join(' · ') ?? 'คำสั่งไม่สำเร็จ')
    }
    return result
  }

  const handleCommitPipeRoute = (start: [number, number], end: [number, number], system: PipeSystem) => {
    const level = project.levels.find(item => item.id === project.project.active_level_id)
    const runMm = Math.hypot(end[0] - start[0], end[1] - start[1])
    if (!level || runMm < 50) return
    const gravity = ['waste', 'soil', 'rainwater'].includes(system)
    const startZ = system === 'rainwater' || system === 'vent'
      ? level.elevation_mm + Number(level.height_mm ?? 2800)
      : gravity ? level.elevation_mm - 300 : level.elevation_mm + 2200
    const endZ = gravity ? startZ - runMm * 0.01 : startZ
    runArchitectureCommand('CreatePipeRoute', {
      id: crypto.randomUUID(), mark: ({ waste: 'WST1', soil: 'ST1', rainwater: 'RW1', vent: 'V1', cold_water: 'CW1', hot_water: 'HW1' } as const)[system],
      level_id: level.id, created_phase: 'new_construction', system,
      nodes_mm: [[start[0], start[1], startZ], [end[0], end[1], endZ]],
      diameter_mm: ({ waste: 50, soil: 100, rainwater: 75, vent: 50, cold_water: 20, hot_water: 20 } as const)[system],
      start_invert_mm: gravity ? startZ : null,
      end_invert_mm: gravity ? endZ : null, minimum_slope_ratio: gravity ? 0.01 : 0,
      material: system === 'cold_water' || system === 'hot_water' ? 'PPR' : 'PVC',
    })
  }

  const handleCommitFixture = (point: [number, number], kind: FixtureKind) => {
    const level = project.levels.find(item => item.id === project.project.active_level_id)
    if (!level) return
    const zOffset = kind === 'light' ? Number(level.height_mm ?? 2800) - 100 : kind === 'panel' ? 1500 : kind === 'outlet' ? 300 : 1100
    runArchitectureCommand('PlaceElectricalFixture', {
      id: crypto.randomUUID(), mark: ({ light: 'L1', switch: 'S1', outlet: 'O1', panel: 'DB1' } as const)[kind],
      level_id: level.id, created_phase: 'new_construction', location_mm: [point[0], point[1], level.elevation_mm + zOffset],
      kind, watts: kind === 'light' ? 12 : 0, controlled_ids: [], switch_ways: 1, grounded: kind === 'outlet' || kind === 'panel',
    })
  }

  const handleCommitCabinet = (start: [number, number], end: [number, number]) => {
    const level = project.levels.find(item => item.id === project.project.active_level_id)
    const width = Math.hypot(end[0] - start[0], end[1] - start[1])
    if (!level || width < 100) return
    runArchitectureCommand('CreateCabinetRun', {
      id: crypto.randomUUID(), mark: 'CB1', level_id: level.id, created_phase: 'new_construction',
      location_mm: [start[0], start[1], level.elevation_mm], width_mm: width, height_mm: 850, depth_mm: 600,
      board_mm: 18, back_mm: 6, plinth_mm: 100, rotation_deg: Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI,
      modules_mm: [width], shelves: 2, drawers: 0, front: 'solid', carcass_material: 'plywood', front_material: 'laminate',
      back_material: 'plywood', countertop_material: 'quartz', countertop_mm: 30,
    })
  }

  const handleCommitMoulding = (start: [number, number], end: [number, number]) => {
    const level = project.levels.find(item => item.id === project.project.active_level_id)
    if (!level || Math.hypot(end[0] - start[0], end[1] - start[1]) < 50) return
    const z = level.elevation_mm + Number(level.height_mm ?? 2800) - 100
    runArchitectureCommand('CreateMouldingRun', {
      id: crypto.randomUUID(), mark: 'SK1', level_id: level.id, created_phase: 'new_construction',
      path_mm: [[start[0], start[1], z], [end[0], end[1], z]],
      profile_mm: [[0, 0], [15, 0], [15, 80], [0, 80]], closed: false, miter_limit: 4, material: 'painted_wood',
    })
  }

  const handleCommitArchitecturalFloor = (boundary_mm: [number, number][]) => {
    const level = project.levels.find(item => item.id === project.project.active_level_id)
    if (!level) return
    runArchitectureCommand('CreateArchitecturalFloor', {
      id: crypto.randomUUID(), mark: 'AF1', level_id: level.id, boundary_mm,
      elevation_mm: level.elevation_mm, elevation_reference: 'level', elevation_offset_mm: 0, thickness_mm: 50,
      finish_layers: [{ material: 'tile', thickness_mm: 10, mark: 'Tile' }], voids_mm: [], follows_room_boundary: false,
    })
  }

  const handleCommitCeiling = (boundary_mm: [number, number][]) => {
    const level = project.levels.find(item => item.id === project.project.active_level_id)
    if (!level) return
    const offset = Number(level.height_mm ?? 2800)
    runArchitectureCommand('CreateCeiling', {
      id: crypto.randomUUID(), mark: 'CL1', level_id: level.id, boundary_mm,
      elevation_mm: level.elevation_mm + offset, elevation_reference: 'level', elevation_offset_mm: offset,
      thickness_mm: 12, voids_mm: [], grid_mm: [600, 600], follows_room_boundary: false,
    })
  }

  const handleCommitRoomSeparator = (start_point_mm: [number, number], end_point_mm: [number, number]) =>
    runArchitectureCommand('CreateRoomSeparator', {
      id: crypto.randomUUID(), mark: 'RS', level_id: project.project.active_level_id, start_point_mm, end_point_mm,
    })

  const handleDetectRooms = () => runArchitectureCommand('DetectRooms', {
    level_id: project.project.active_level_id, default_name: 'Room',
  })

  const handleCreateRoomFinish = (kind: 'floor' | 'ceiling', roomId: string) => {
    const room = project.objects[roomId]
    if (!room || room.object_type !== 'architecture.room') return
    const data = room.module_data as Record<string, unknown>
    if (data.boundary_status === 'unclosed') {
      setFileFeedback('วงผนังห้องยังเปิดอยู่ · ปิดวงและตรวจพื้นที่ก่อนสร้างพื้นหรือฝ้าตามห้อง')
      return
    }
    const level = project.levels.find(item => item.id === data.level_id)
    if (!level) return
    const offset = Number(level.height_mm ?? 2800)
    if (kind === 'floor') {
      runArchitectureCommand('CreateArchitecturalFloor', {
        id: crypto.randomUUID(), mark: 'AF1', level_id: level.id, room_id: roomId,
        elevation_mm: level.elevation_mm, elevation_reference: 'level', elevation_offset_mm: 0, thickness_mm: 50,
        finish_layers: [{ material: 'tile', thickness_mm: 10, mark: 'Tile' }], voids_mm: [], follows_room_boundary: true,
      })
    } else {
      runArchitectureCommand('CreateCeiling', {
        id: crypto.randomUUID(), mark: 'CL1', level_id: level.id, room_id: roomId,
        elevation_mm: level.elevation_mm + offset, elevation_reference: 'level', elevation_offset_mm: offset,
        thickness_mm: 12, voids_mm: [], grid_mm: [600, 600], follows_room_boundary: true,
      })
    }
  }

  const handleCommitSurfaceVoid = (hostId: string, boundary_mm: [number, number][]) => {
    const host = project.objects[hostId]
    if (!host || !['structure.slab', 'architecture.floor', 'architecture.ceiling', 'roof.system'].includes(host.object_type) || boundary_mm.length < 3) return
    const data = host.module_data as Record<string, unknown>
    const boundary = data.boundary_mm as [number, number][] | undefined
    if (!boundary || boundary.length < 3) return
    const voids = Array.isArray(data.voids_mm) ? data.voids_mm as [number, number][][] : []
    let hostBoundary = boundary
    try {
      if (host.object_type === 'roof.system') {
        hostBoundary = getRoofEaveBoundary({ boundary_mm: boundary, eaves_overhang_mm: Number(data.eaves_overhang_mm ?? 0) })
      }
    } catch {
      setFileFeedback('ขอบเขตชายคาหลังคาไม่ถูกต้อง จึงวาดช่องเจาะไม่ได้')
      return
    }
    const validation = validatePolygonWithVoids(hostBoundary, [...voids, boundary_mm])
    if (!validation.valid) {
      setFileFeedback(`ช่องเจาะต้องอยู่ภายในขอบเขตและไม่ทับช่องเดิม: ${validation.reason}`)
      return
    }
    const command = host.object_type === 'structure.slab'
      ? 'UpdateSlab'
      : host.object_type === 'architecture.floor' ? 'UpdateArchitecturalFloor'
        : host.object_type === 'architecture.ceiling' ? 'UpdateCeiling' : 'UpdateRoof'
    const result = dispatchCommandBatch([{ name: command, input: { ...data, id: hostId, voids_mm: [...voids, boundary_mm] } }])
    if (result.status === 'success') {
      setSelectedId(hostId)
      setFileFeedback('')
    } else {
      setFileFeedback(result.errors?.join(' · ') ?? 'เพิ่มช่องเจาะไม่สำเร็จ')
    }
  }

  const handleCommitDoor = (wallId: string, point_mm: [number, number], offset_mm: number, handing: DoorHanding) => {
    const doorId = crypto.randomUUID()
    const activeType = project.types.find(type => type.object_type === 'door_window.door' && type.name.toLowerCase() === activeDoorType.toLowerCase())
    const result = dispatchCommandBatch([{ name: 'CreateDoor', input: {
      id: doorId, mark: activeDoorType, wall_id: wallId, offset_along_wall_mm: offset_mm,
      location_mm: [point_mm[0], point_mm[1], 0], width_mm: activeType?.parameters.width_mm || 800,
      height_mm: activeType?.parameters.height_mm || 2000, handing,
    } }])
    if (result.status === 'success') {
      setSelectedId(doorId)
      setSelectedIds([doorId])
    } else setFileFeedback(result.errors?.join(' · ') ?? 'วางประตูไม่สำเร็จ')
  }

  const handleCommitWindow = (wallId: string, point_mm: [number, number], offset_mm: number) => {
    const windowId = crypto.randomUUID()
    const activeType = project.types.find(type => type.object_type === 'door_window.window' && type.name.toLowerCase() === activeWindowType.toLowerCase())
    const result = dispatchCommandBatch([{ name: 'CreateWindow', input: {
      id: windowId, mark: activeWindowType, wall_id: wallId, offset_along_wall_mm: offset_mm,
      location_mm: [point_mm[0], point_mm[1], 0], width_mm: activeType?.parameters.width_mm || 1200,
      height_mm: activeType?.parameters.height_mm || 1200, sill_height_mm: activeType?.parameters.sill_height_mm || 900,
    } }])
    if (result.status === 'success') {
      setSelectedId(windowId)
      setSelectedIds([windowId])
    } else setFileFeedback(result.errors?.join(' · ') ?? 'วางหน้าต่างไม่สำเร็จ')
  }

  const handleCommitStair = (stair: StairModuleData): boolean => {
    const stairId = crypto.randomUUID()
    const result = dispatchCommandBatch([{ name: 'CreateStair', input: {
      ...stair, id: stairId, created_phase: project.project.active_phase || 'new_construction',
    } }])
    if (result.status !== 'success') {
      setFileFeedback(result.errors?.join(' · ') ?? 'วางบันไดไม่สำเร็จ')
      return false
    }
    setSelectedId(stairId)
    setSelectedIds([stairId])
    return true
  }

  const handleFlipDoorHanding = (doorId: string) => {
    const result = dispatchCommandBatch([{ name: 'FlipDoorHanding', input: { object_id: doorId } }])
    if (result.status !== 'success') setFileFeedback(result.errors?.join(' · ') ?? 'กลับทิศประตูไม่สำเร็จ')
  }

  return {
    runArchitectureCommand,
    handleCommitPipeRoute,
    handleCommitFixture,
    handleCommitCabinet,
    handleCommitMoulding,
    handleCommitArchitecturalFloor,
    handleCommitCeiling,
    handleCommitRoomSeparator,
    handleDetectRooms,
    handleCreateRoomFinish,
    handleCommitSurfaceVoid,
    handleCommitDoor,
    handleCommitWindow,
    handleCommitStair,
    handleFlipDoorHanding,
  }
}
