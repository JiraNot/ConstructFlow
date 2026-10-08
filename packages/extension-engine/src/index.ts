import { createEmptyProjectDocument, type ProjectDocument } from '@constructflow/project-model'
import type { CommandRequest, ExtensionPresetInput, CommandActorKind, CommandBatchResult } from '@constructflow/command-schema'
import { CommandBus } from '@constructflow/command-runtime'
export * from './phaseProof.js'

/** Compile public domain commands; no state or geometry is mutated during planning. */
export function planExtensionPreset(project: ProjectDocument, options: ExtensionPresetInput): CommandRequest[] {
  const { preset: activePreset, posX_m, posY_m, width_m, length_m } = options
  if (!['carport', 'kitchen', 'terrace'].includes(activePreset)) throw new Error('Unknown extension preset')
  for (const [name,value] of Object.entries({posX_m,posY_m,width_m,length_m})) {
    if (!Number.isFinite(value)) throw new Error(name + ' must be finite')
  }
  if (width_m < 0.001 || length_m < 0.001) throw new Error('Extension dimensions must be at least 0.001 m')
  const W_mm = Math.round(width_m * 1000)
  const L_mm = Math.round(length_m * 1000)
  const X_mm = Math.round(posX_m * 1000)
  const Y_mm = Math.round(posY_m * 1000)
  const carportColumnType = options.carportColumnType ?? 'SC1'
  const kitchenWallHeight_m = options.kitchenWallHeight_m ?? 2.8
  const kitchenWallSides = options.kitchenWallSides ?? 3
  const kitchenIncludeDoor = options.kitchenIncludeDoor ?? true
  const kitchenIncludeWindow = options.kitchenIncludeWindow ?? true
  const terraceElevation_m = options.terraceElevation_m ?? 0.45
  if (activePreset === 'kitchen') {
    if (!Number.isFinite(kitchenWallHeight_m) || kitchenWallHeight_m <= 0) throw new Error('Kitchen wall height must be positive')
    if (![3,4].includes(kitchenWallSides)) throw new Error('Kitchen must have 3 or 4 wall sides')
    if (kitchenIncludeDoor && (W_mm < 900 || kitchenWallHeight_m * 1000 < 2000)) throw new Error('Door does not fit the kitchen wall')
    if (kitchenIncludeWindow && (W_mm < 1200 || kitchenWallHeight_m * 1000 < 2100)) throw new Error('Window does not fit the kitchen wall')
  }
  if (activePreset === 'terrace' && (!Number.isFinite(terraceElevation_m) || terraceElevation_m <= 0)) throw new Error('Terrace elevation must be positive')
  const commands: CommandRequest[] = []
  const queueCreate = (name: string, input: Record<string, unknown>): string => {
    const id = crypto.randomUUID()
    commands.push({name, input: {...input, id}})
    return id
  }
  if (activePreset === 'carport') {
    // 1. Four Columns at corners
    const c1Id = queueCreate('CreateColumn', {
      mark: carportColumnType,
      material: carportColumnType === 'SC1' ? 'steel' : 'reinforced_concrete',
      location_mm: [X_mm, Y_mm, 0],
      section_mm: carportColumnType === 'SC1' ? [150, 150] : [200, 200],
      phase: 'new_construction',
    })
    const c2Id = queueCreate('CreateColumn', {
      mark: carportColumnType,
      material: carportColumnType === 'SC1' ? 'steel' : 'reinforced_concrete',
      location_mm: [X_mm + W_mm, Y_mm, 0],
      section_mm: carportColumnType === 'SC1' ? [150, 150] : [200, 200],
      phase: 'new_construction',
    })
    const c3Id = queueCreate('CreateColumn', {
      mark: carportColumnType,
      material: carportColumnType === 'SC1' ? 'steel' : 'reinforced_concrete',
      location_mm: [X_mm + W_mm, Y_mm + L_mm, 0],
      section_mm: carportColumnType === 'SC1' ? [150, 150] : [200, 200],
      phase: 'new_construction',
    })
    const c4Id = queueCreate('CreateColumn', {
      mark: carportColumnType,
      material: carportColumnType === 'SC1' ? 'steel' : 'reinforced_concrete',
      location_mm: [X_mm, Y_mm + L_mm, 0],
      section_mm: carportColumnType === 'SC1' ? [150, 150] : [200, 200],
      phase: 'new_construction',
    })

    // 2. Four Footings
    if (c1Id) queueCreate('CreateFoundation', { mark: 'F1', center_mm: [X_mm, Y_mm, 0], size_mm: [800, 800, 300], supported_column_id: c1Id, phase: 'new_construction' })
    if (c2Id) queueCreate('CreateFoundation', { mark: 'F1', center_mm: [X_mm + W_mm, Y_mm, 0], size_mm: [800, 800, 300], supported_column_id: c2Id, phase: 'new_construction' })
    if (c3Id) queueCreate('CreateFoundation', { mark: 'F1', center_mm: [X_mm + W_mm, Y_mm + L_mm, 0], size_mm: [800, 800, 300], supported_column_id: c3Id, phase: 'new_construction' })
    if (c4Id) queueCreate('CreateFoundation', { mark: 'F1', center_mm: [X_mm, Y_mm + L_mm, 0], size_mm: [800, 800, 300], supported_column_id: c4Id, phase: 'new_construction' })

    // 3. Perimeter Framing Beams
    queueCreate('CreateBeam', { mark: 'B1', material: 'steel', start_point_mm: [X_mm, Y_mm, 3000], end_point_mm: [X_mm + W_mm, Y_mm, 3000], start_column_id: c1Id, end_column_id: c2Id, section_mm: [200, 400], phase: 'new_construction' })
    queueCreate('CreateBeam', { mark: 'B1', material: 'steel', start_point_mm: [X_mm + W_mm, Y_mm, 3000], end_point_mm: [X_mm + W_mm, Y_mm + L_mm, 3000], start_column_id: c2Id, end_column_id: c3Id, section_mm: [200, 400], phase: 'new_construction' })
    queueCreate('CreateBeam', { mark: 'B1', material: 'steel', start_point_mm: [X_mm + W_mm, Y_mm + L_mm, 3000], end_point_mm: [X_mm, Y_mm + L_mm, 3000], start_column_id: c3Id, end_column_id: c4Id, section_mm: [200, 400], phase: 'new_construction' })
    queueCreate('CreateBeam', { mark: 'B1', material: 'steel', start_point_mm: [X_mm, Y_mm + L_mm, 3000], end_point_mm: [X_mm, Y_mm, 3000], start_column_id: c4Id, end_column_id: c1Id, section_mm: [200, 400], phase: 'new_construction' })

    // Middle Rafter if wide
    if (W_mm >= 4500) {
      queueCreate('CreateBeam', { mark: 'B2', material: 'steel', start_point_mm: [X_mm + Math.round(W_mm / 2), Y_mm, 3000], end_point_mm: [X_mm + Math.round(W_mm / 2), Y_mm + L_mm, 3000], section_mm: [150, 350], phase: 'new_construction' })
    }
  } else if (activePreset === 'kitchen') {
    const H_mm = Math.round(kitchenWallHeight_m * 1000)
    const baseLevel = project.levels.find(level => level.id === project.project.active_level_id)
    const baseElevation_mm = baseLevel?.elevation_mm ?? 0
    const topLevel = project.levels
      .filter(level => level.elevation_mm > baseElevation_mm)
      .sort((a, b) => a.elevation_mm - b.elevation_mm)[0]
    const beamElevation_mm = topLevel?.elevation_mm ?? baseElevation_mm + 3000
    const columnLevels = {
      base_level_id: project.project.active_level_id,
      ...(topLevel ? { top_level_id: topLevel.id } : {}),
    }
    const kitchenPileCap = {
      foundation_type: 'pile_cap' as const,
      pile_type: 'micro_pile_i18' as const,
      // Preliminary 2×2 concept; actual pile layout and length require engineering input.
      pile_offsets_mm: [[-200, -200], [200, -200], [200, 200], [-200, 200]] as [number, number][],
    }

    // 1. Four Columns
    const c1Id = queueCreate('CreateColumn', { mark: 'C1', location_mm: [X_mm, Y_mm, baseElevation_mm], section_mm: [200, 200], ...columnLevels, phase: 'new_construction' })
    const c2Id = queueCreate('CreateColumn', { mark: 'C1', location_mm: [X_mm + W_mm, Y_mm, baseElevation_mm], section_mm: [200, 200], ...columnLevels, phase: 'new_construction' })
    const c3Id = queueCreate('CreateColumn', { mark: 'C1', location_mm: [X_mm + W_mm, Y_mm + L_mm, baseElevation_mm], section_mm: [200, 200], ...columnLevels, phase: 'new_construction' })
    const c4Id = queueCreate('CreateColumn', { mark: 'C1', location_mm: [X_mm, Y_mm + L_mm, baseElevation_mm], section_mm: [200, 200], ...columnLevels, phase: 'new_construction' })

    // 2. Four Footings
    if (c1Id) queueCreate('CreateFoundation', { mark: 'F1', center_mm: [X_mm, Y_mm, baseElevation_mm], size_mm: [800, 800, 300], supported_column_id: c1Id, ...kitchenPileCap, phase: 'new_construction' })
    if (c2Id) queueCreate('CreateFoundation', { mark: 'F1', center_mm: [X_mm + W_mm, Y_mm, baseElevation_mm], size_mm: [800, 800, 300], supported_column_id: c2Id, ...kitchenPileCap, phase: 'new_construction' })
    if (c3Id) queueCreate('CreateFoundation', { mark: 'F1', center_mm: [X_mm + W_mm, Y_mm + L_mm, baseElevation_mm], size_mm: [800, 800, 300], supported_column_id: c3Id, ...kitchenPileCap, phase: 'new_construction' })
    if (c4Id) queueCreate('CreateFoundation', { mark: 'F1', center_mm: [X_mm, Y_mm + L_mm, baseElevation_mm], size_mm: [800, 800, 300], supported_column_id: c4Id, ...kitchenPileCap, phase: 'new_construction' })

    // 3. Four Perimeter Beams
    const beamLevelId = topLevel?.id ?? project.project.active_level_id
    queueCreate('CreateBeam', { mark: 'B1', start_point_mm: [X_mm, Y_mm, beamElevation_mm], end_point_mm: [X_mm + W_mm, Y_mm, beamElevation_mm], start_column_id: c1Id, end_column_id: c2Id, section_mm: [200, 400], level_id: beamLevelId, phase: 'new_construction' })
    queueCreate('CreateBeam', { mark: 'B1', start_point_mm: [X_mm + W_mm, Y_mm, beamElevation_mm], end_point_mm: [X_mm + W_mm, Y_mm + L_mm, beamElevation_mm], start_column_id: c2Id, end_column_id: c3Id, section_mm: [200, 400], level_id: beamLevelId, phase: 'new_construction' })
    queueCreate('CreateBeam', { mark: 'B1', start_point_mm: [X_mm + W_mm, Y_mm + L_mm, beamElevation_mm], end_point_mm: [X_mm, Y_mm + L_mm, beamElevation_mm], start_column_id: c3Id, end_column_id: c4Id, section_mm: [200, 400], level_id: beamLevelId, phase: 'new_construction' })
    queueCreate('CreateBeam', { mark: 'B1', start_point_mm: [X_mm, Y_mm + L_mm, beamElevation_mm], end_point_mm: [X_mm, Y_mm, beamElevation_mm], start_column_id: c4Id, end_column_id: c1Id, section_mm: [200, 400], level_id: beamLevelId, phase: 'new_construction' })

    // 4. AAC Lightweight Walls
    // South Wall (Front exit)
    const w1Id = queueCreate('CreateWall', {
      mark: 'AAC 100 mm',
      material: 'lightweight_block',
      start_point_mm: [X_mm, Y_mm, baseElevation_mm],
      end_point_mm: [X_mm + W_mm, Y_mm, baseElevation_mm],
      thickness_mm: 100,
      height_mm: H_mm,
      level_id: project.project.active_level_id,
      phase: 'new_construction',
    })

    // East Wall (Right)
    queueCreate('CreateWall', {
      mark: 'AAC 100 mm',
      material: 'lightweight_block',
      start_point_mm: [X_mm + W_mm, Y_mm, baseElevation_mm],
      end_point_mm: [X_mm + W_mm, Y_mm + L_mm, baseElevation_mm],
      thickness_mm: 100,
      height_mm: H_mm,
      level_id: project.project.active_level_id,
      phase: 'new_construction',
    })

    // North Wall (Back)
    const w3Id = queueCreate('CreateWall', {
      mark: 'AAC 100 mm',
      material: 'lightweight_block',
      start_point_mm: [X_mm + W_mm, Y_mm + L_mm, baseElevation_mm],
      end_point_mm: [X_mm, Y_mm + L_mm, baseElevation_mm],
      thickness_mm: 100,
      height_mm: H_mm,
      level_id: project.project.active_level_id,
      phase: 'new_construction',
    })

    // West Wall (if 4 sides selected)
    if (kitchenWallSides === 4) {
      queueCreate('CreateWall', {
        mark: 'AAC 100 mm',
        material: 'lightweight_block',
        start_point_mm: [X_mm, Y_mm + L_mm, baseElevation_mm],
        end_point_mm: [X_mm, Y_mm, baseElevation_mm],
        thickness_mm: 100,
        height_mm: H_mm,
        level_id: project.project.active_level_id,
        phase: 'new_construction',
      })
    }

    // 5. Openings
    if (w1Id && kitchenIncludeDoor) {
      queueCreate('CreateDoor', {
        wall_id: w1Id,
        location_mm: [X_mm + Math.round(W_mm / 2), Y_mm, baseElevation_mm],
        mark: 'D1',
        width_mm: 900,
        height_mm: 2000,
        offset_along_wall_mm: Math.round(W_mm / 2),
        handing: 'left_out',
        level_id: project.project.active_level_id,
        phase: 'new_construction',
      })
    }

    if (w3Id && kitchenIncludeWindow) {
      queueCreate('CreateWindow', {
        wall_id: w3Id,
        location_mm: [X_mm + Math.round(W_mm / 2), Y_mm + L_mm, baseElevation_mm],
        mark: 'AAC 100 mm',
        width_mm: 1200,
        height_mm: 1200,
        sill_height_mm: 900,
        offset_along_wall_mm: Math.round(W_mm / 2),
        level_id: project.project.active_level_id,
        phase: 'new_construction',
      })
    }
  } else if (activePreset === 'terrace') {
    // 1. Six Columns / Concrete Piers (4 corners + 2 center supports)
    const midY = Y_mm + Math.round(L_mm / 2)

    const colLocs: [number, number][] = [
      [X_mm, Y_mm],
      [X_mm + W_mm, Y_mm],
      [X_mm, midY],
      [X_mm + W_mm, midY],
      [X_mm, Y_mm + L_mm],
      [X_mm + W_mm, Y_mm + L_mm],
    ]

    colLocs.forEach(([cx, cy]) => {
      const cId = queueCreate('CreateColumn', {
        mark: 'C1',
        location_mm: [cx, cy, 0],
        section_mm: [200, 200],
        phase: 'new_construction',
      })
      if (cId) {
        queueCreate('CreateFoundation', {
          mark: 'F1',
          center_mm: [cx, cy, 0],
          size_mm: [600, 600, 250],
          supported_column_id: cId,
          phase: 'new_construction',
        })
      }
    })

    // 2. Support Joists & Beams
    queueCreate('CreateBeam', { mark: 'B1', material: 'steel', start_point_mm: [X_mm, Y_mm, Math.round(terraceElevation_m * 1000)], end_point_mm: [X_mm + W_mm, Y_mm, Math.round(terraceElevation_m * 1000)], section_mm: [150, 300], phase: 'new_construction' })
    queueCreate('CreateBeam', { mark: 'B1', material: 'steel', start_point_mm: [X_mm, midY, Math.round(terraceElevation_m * 1000)], end_point_mm: [X_mm + W_mm, midY, Math.round(terraceElevation_m * 1000)], section_mm: [150, 300], phase: 'new_construction' })
    queueCreate('CreateBeam', { mark: 'B1', material: 'steel', start_point_mm: [X_mm, Y_mm + L_mm, Math.round(terraceElevation_m * 1000)], end_point_mm: [X_mm + W_mm, Y_mm + L_mm, Math.round(terraceElevation_m * 1000)], section_mm: [150, 300], phase: 'new_construction' })
    queueCreate('CreateBeam', { mark: 'B2', material: 'steel', start_point_mm: [X_mm, Y_mm, Math.round(terraceElevation_m * 1000)], end_point_mm: [X_mm, Y_mm + L_mm, Math.round(terraceElevation_m * 1000)], section_mm: [150, 300], phase: 'new_construction' })
    queueCreate('CreateBeam', { mark: 'B2', material: 'steel', start_point_mm: [X_mm + W_mm, Y_mm, Math.round(terraceElevation_m * 1000)], end_point_mm: [X_mm + W_mm, Y_mm + L_mm, Math.round(terraceElevation_m * 1000)], section_mm: [150, 300], phase: 'new_construction' })
  }

  return commands
}

export function applyExtensionPreset(project: ProjectDocument, options: ExtensionPresetInput, actorKind: CommandActorKind = 'human'): CommandBatchResult {
  try {
    return CommandBus.executeBatch(project, planExtensionPreset(project, options), actorKind)
  } catch (error: unknown) {
    return {transaction_id: crypto.randomUUID(), status: 'rejected', updatedProject: project, results: [], emittedEnvelopes: [], errors: [error instanceof Error ? error.message : String(error)]}
  }
}

/** Build the first standalone acceptance model as one atomic Existing + New transaction. */
export function createKitchenProofProject(actorKind: CommandActorKind = 'human'): CommandBatchResult {
  const seed = createEmptyProjectDocument('CF-KITCHEN-PROOF-001', 'Kitchen Extension Proof · 4.00 × 2.50 m')
  seed.levels = [
    { id: 'GF', name: 'Ground Floor', elevation_mm: 0, storey_index: 1, height_mm: 3000 },
    { id: 'L2', name: 'First Floor', elevation_mm: 3000, storey_index: 2, height_mm: 3000 },
  ]
  seed.project.active_level_id = 'GF'
  try {
    const extensionCommands = planExtensionPreset(seed, {
        preset: 'kitchen', posX_m: 0, posY_m: 0, width_m: 4, length_m: 2.5,
        kitchenWallHeight_m: 2.8, kitchenWallSides: 3, kitchenIncludeDoor: true, kitchenIncludeWindow: true,
      })
    const extensionWalls = extensionCommands.filter(command => command.name === 'CreateWall')
    const southWallId = extensionWalls[0]?.input.id
    const northWallId = extensionWalls.at(-1)?.input.id
    if (typeof southWallId !== 'string' || typeof northWallId !== 'string') throw new Error('Kitchen extension did not produce its expected interface walls')
    const commands: CommandRequest[] = [
      ...extensionCommands,
      {
        name: 'CreateWall',
        input: {
          id: crypto.randomUUID(), mark: 'AAC 150 mm', phase: 'existing', material: 'brick_masonry',
          start_point_mm: [0, 0, 0], end_point_mm: [0, 2500, 0],
          thickness_mm: 150, height_mm: 2800, level_id: 'GF',
          interface_treatments: [{
            id: crypto.randomUUID(),
            kind: 'expansion_joint_sealant',
            target_object_ids: [southWallId, northWallId],
            material: 'joint_sealant',
          }],
        },
      },
    ]
    return CommandBus.executeBatch(seed, commands, actorKind)
  } catch (error: unknown) {
    return {
      transaction_id: crypto.randomUUID(), status: 'rejected', updatedProject: seed,
      results: [], emittedEnvelopes: [], errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}
