import { offsetPolygonEdge } from '@constructflow/geometry-kernel'
import { moveEditableRoofRidge, moveRoofSeam } from '@constructflow/roof-engine'
import { stairFlightGripPoints } from './components/stairFlightGripPoints.mjs'

const point2 = (point) => [Number(point?.[0] ?? 0), Number(point?.[1] ?? 0)]
const point3 = (point) => [Number(point?.[0] ?? 0), Number(point?.[1] ?? 0), Number(point?.[2] ?? 0)]
const input = (name, values) => ({ name, input: values })

export function resizeOrientedRectangle(center, size, rotationDeg, cornerIndex, cursor) {
  const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]][cornerIndex]
  if (!signs) return null
  const angle = Number(rotationDeg ?? 0) * Math.PI / 180
  const dx = cursor[0] - center[0], dy = cursor[1] - center[1]
  const local = [dx * Math.cos(angle) + dy * Math.sin(angle), -dx * Math.sin(angle) + dy * Math.cos(angle)]
  const anchor = [-signs[0] * size[0] / 2, -signs[1] * size[1] / 2]
  // Keep the opposite corner fixed while enforcing the model's 100 mm minimum.
  const next = [
    signs[0] * (local[0] - anchor[0]),
    signs[1] * (local[1] - anchor[1]),
  ].map(value => Math.max(100, Math.abs(value)))
  const nextLocalCenter = [(anchor[0] + signs[0] * next[0] / 2), (anchor[1] + signs[1] * next[1] / 2)]
  const worldCenter = [
    center[0] + nextLocalCenter[0] * Math.cos(angle) - nextLocalCenter[1] * Math.sin(angle),
    center[1] + nextLocalCenter[0] * Math.sin(angle) + nextLocalCenter[1] * Math.cos(angle),
  ]
  return { center_mm: worldCenter, size_mm: next }
}

function fullObjectUpdate(object, commandName, changes) {
  return input(commandName, { ...structuredClone(object.module_data), ...changes, id: object.id })
}

function moveSingleObject(project, object, dx, dy) {
  const data = object.module_data
  switch (object.object_type) {
    case 'architecture.wall':
      return input('MoveWall', { object_id: object.id, delta_mm: [dx, dy] })
    case 'structure.column': {
      const [x, y, z] = point3(data.location_mm)
      return input('MoveColumn', { object_id: object.id, location_mm: [x + dx, y + dy, z] })
    }
    case 'structure.foundation': {
      const hostedColumnId = data.supported_column_id ?? object.host_refs?.find(id => project.objects[id]?.object_type === 'structure.column')
      const column = hostedColumnId ? project.objects[hostedColumnId] : undefined
      if (column?.object_type === 'structure.column') {
        const [x, y, z] = point3(column.module_data.location_mm)
        return input('MoveColumn', { object_id: column.id, location_mm: [x + dx, y + dy, z] })
      }
      const [x, y, z] = point3(data.center_mm)
      return input('MoveFoundation', { object_id: object.id, center_mm: [x + dx, y + dy, z] })
    }
    case 'door_window.door':
    case 'door_window.window': {
      const host = project.objects[data.wall_id]
      if (host?.object_type !== 'architecture.wall') return null
      const [a, b] = [host.module_data.start_point_mm, host.module_data.end_point_mm]
      const length = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (length < 1) return null
      const along = (dx * (b[0] - a[0]) + dy * (b[1] - a[1])) / length
      return input('MoveOpening', { object_id: object.id, offset_along_wall_mm: Number(data.offset_along_wall_mm) + along })
    }
    case 'structure.beam': {
      // Keep endpoint associations intact; attached beams are stretched by moving their columns or grips.
      if (data.start_column_id || data.end_column_id) return null
      const a = point3(data.start_point_mm), b = point3(data.end_point_mm)
      return input('UpdateBeamEndpoints', {
        object_id: object.id,
        start_point_mm: [a[0] + dx, a[1] + dy],
        end_point_mm: [b[0] + dx, b[1] + dy],
        start_column_id: null,
        end_column_id: null,
      })
    }
    case 'structure.grid':
    case 'reference.grid': {
      if (data.system_id) return input('ModifyGrid', { object_id: object.id, position_mm: Number(data.position_mm) + (data.orientation === 'vertical' ? dx : dy) })
      if (data.start_point_mm && data.end_point_mm) {
        const a = point2(data.start_point_mm), b = point2(data.end_point_mm)
        return input('ModifyGrid', { object_id: object.id, start_point_mm: [a[0] + dx, a[1] + dy], end_point_mm: [b[0] + dx, b[1] + dy] })
      }
      return input('ModifyGrid', { object_id: object.id, position_mm: Number(data.position_mm) + (data.orientation === 'vertical' ? dx : dy), extent_mm: [Number(data.extent_mm?.[0]) + (data.orientation === 'vertical' ? dy : dx), Number(data.extent_mm?.[1]) + (data.orientation === 'vertical' ? dy : dx)] })
    }
    case 'architecture.room_separator': {
      const a = point2(data.start_point_mm), b = point2(data.end_point_mm)
      return fullObjectUpdate(object, 'UpdateRoomSeparator', { start_point_mm: [a[0] + dx, a[1] + dy], end_point_mm: [b[0] + dx, b[1] + dy] })
    }
    case 'structure.slab':
      return fullObjectUpdate(object, 'UpdateSlab', { boundary_mm: translateRing(data.boundary_mm, dx, dy), voids_mm: translateRings(data.voids_mm, dx, dy) })
    case 'architecture.floor':
      return fullObjectUpdate(object, 'UpdateArchitecturalFloor', { boundary_mm: translateRing(data.boundary_mm, dx, dy), voids_mm: translateRings(data.voids_mm, dx, dy), follows_room_boundary: false })
    case 'architecture.ceiling':
      return fullObjectUpdate(object, 'UpdateCeiling', { boundary_mm: translateRing(data.boundary_mm, dx, dy), voids_mm: translateRings(data.voids_mm, dx, dy), follows_room_boundary: false })
    case 'roof.system':
      return fullObjectUpdate(object, 'UpdateRoof', { boundary_mm: translateRing(data.boundary_mm, dx, dy) })
    case 'architecture.room':
      return fullObjectUpdate(object, 'UpdateRoom', { boundary_mm: translateRing(data.boundary_mm, dx, dy) })
    case 'architecture.stair': {
      const start = point3(data.start_point_mm)
      return fullObjectUpdate(object, 'UpdateStair', { start_point_mm: [start[0] + dx, start[1] + dy, start[2] ] })
    }
    case 'electrical.fixture': {
      const location = point3(data.location_mm)
      return fullObjectUpdate(object, 'UpdateElectricalFixture', { location_mm: [location[0] + dx, location[1] + dy, location[2]] })
    }
    case 'interior.cabinet_run': {
      const location = point3(data.location_mm)
      return fullObjectUpdate(object, 'UpdateCabinetRun', { location_mm: [location[0] + dx, location[1] + dy, location[2]] })
    }
    case 'interior.furniture': {
      const location = point3(data.location_mm)
      return fullObjectUpdate(object, 'UpdateInteriorFurniture', { location_mm: [location[0] + dx, location[1] + dy, location[2]] })
    }
    case 'decorative.moulding_run':
      return fullObjectUpdate(object, 'UpdateMouldingRun', { path_mm: (data.path_mm ?? []).map(point => [point[0] + dx, point[1] + dy, point[2]]) })
    case 'drainage.pipe_route':
    case 'plumbing.pipe_route':
      return fullObjectUpdate(object, 'EditPipeRoute', { nodes_mm: (data.nodes_mm ?? []).map(point => [point[0] + dx, point[1] + dy, point[2]]) })
    case 'drainage.manhole': {
      const location = point3(data.location_mm)
      return fullObjectUpdate(object, 'UpdateManhole', { location_mm: [location[0] + dx, location[1] + dy, location[2]] })
    }
    case 'drainage.septic_tank': {
      const location = point3(data.location_mm)
      return fullObjectUpdate(object, 'UpdateSepticTank', { location_mm: [location[0] + dx, location[1] + dy, location[2]] })
    }
    case 'plumbing.pump_bypass': {
      const location = point3(data.location_mm)
      return fullObjectUpdate(object, 'UpdatePumpBypass', { location_mm: [location[0] + dx, location[1] + dy, location[2]] })
    }
    case 'lighting.led_run':
      return fullObjectUpdate(object, 'UpdateLEDRun', { path_mm: (data.path_mm ?? []).map(point => [point[0] + dx, point[1] + dy, point[2]]) })
    case 'architecture.bathroom':
      return fullObjectUpdate(object, 'UpdateBathroom', { boundary_mm: translateRing(data.boundary_mm, dx, dy), drain_mm: point2(data.drain_mm).map((value, index) => value + (index === 0 ? dx : dy)) })
    default:
      return null
  }
}

function translateRing(ring, dx, dy) {
  return Array.isArray(ring) ? ring.map(point => [point[0] + dx, point[1] + dy]) : ring
}
function translateRings(rings, dx, dy) {
  return Array.isArray(rings) ? rings.map(ring => translateRing(ring, dx, dy)) : rings
}

function polygonCommand(object, boundary) {
  const data = object.module_data
  const command = object.object_type === 'structure.slab' ? 'UpdateSlab'
    : object.object_type === 'architecture.floor' ? 'UpdateArchitecturalFloor'
      : object.object_type === 'architecture.ceiling' ? 'UpdateCeiling'
        : object.object_type === 'roof.system' ? 'UpdateRoof'
          : object.object_type === 'architecture.room' ? 'UpdateRoom' : null
  if (!command) return null
  return fullObjectUpdate(object, command, {
    boundary_mm: boundary,
    ...(command === 'UpdateArchitecturalFloor' || command === 'UpdateCeiling' ? { follows_room_boundary: false } : {}),
    ...(Array.isArray(data.voids_mm) ? { voids_mm: structuredClone(data.voids_mm) } : {}),
  })
}

function openingDimensions(object, width, offset) {
  const data = object.module_data
  const command = object.object_type === 'door_window.door' ? 'UpdateDoorDimensions' : 'UpdateWindowDimensions'
  return input(command, {
    object_id: object.id,
    width_mm: width,
    offset_along_wall_mm: offset,
    height_mm: data.height_mm,
    ...(object.object_type === 'door_window.door' ? { sill_height_mm: Number(data.sill_height_mm ?? 0) } : { sill_height_mm: Number(data.sill_height_mm ?? 900) }),
    ...(data.vertical_constraint === 'head_level'
      ? { head_level_id: data.head_level_id, head_offset_mm: data.head_offset_mm, vertical_constraint: 'head_level' }
      : { vertical_constraint: 'fixed_height' }),
  })
}

function moveCommandFor(project, id, delta) {
  const object = project.objects[id]
  return object ? moveSingleObject(project, object, delta[0], delta[1]) : null
}

export function buildDirectManipulationCommands(project, gesture, point, options = {}) {
  const object = project.objects[gesture.id]
  if (!object) return []
  const data = object.module_data
  const endpoint = gesture.endpointIndex
  let command = null

  if (gesture.kind === 'column-corner' || gesture.kind === 'foundation-corner') {
    const center = gesture.centerMm ?? point2(object.object_type === 'structure.column' ? data.location_mm : data.center_mm)
    const size = gesture.sectionMm ?? point2(object.object_type === 'structure.column' ? data.section_mm : data.size_mm)
    const resized = resizeOrientedRectangle(center, size, Number(gesture.rotationDeg ?? data.rotation_deg ?? 0), Number(endpoint ?? 0), point)
    if (!resized) return []
    if (object.object_type === 'structure.column') {
      const location = point3(data.location_mm)
      const commands = []
      if (Math.hypot(resized.center_mm[0] - center[0], resized.center_mm[1] - center[1]) > 0.1)
        commands.push(input('MoveColumn', { object_id: object.id, location_mm: [resized.center_mm[0], resized.center_mm[1], location[2]] }))
      commands.push(input('UpdateColumnDimensions', { object_id: object.id, section_mm: resized.size_mm }))
      return commands
    }
    const commands = []
    const hostedColumnId = data.supported_column_id ?? object.host_refs?.find(id => project.objects[id]?.object_type === 'structure.column')
    const column = hostedColumnId ? project.objects[hostedColumnId] : undefined
    if (column?.object_type === 'structure.column') {
      const loc = point3(column.module_data.location_mm)
      if (Math.hypot(resized.center_mm[0] - center[0], resized.center_mm[1] - center[1]) > 0.1)
        commands.push(input('MoveColumn', { object_id: column.id, location_mm: [loc[0] + resized.center_mm[0] - center[0], loc[1] + resized.center_mm[1] - center[1], loc[2]] }))
    } else if (Math.hypot(resized.center_mm[0] - center[0], resized.center_mm[1] - center[1]) > 0.1) {
      const center3 = point3(data.center_mm)
      commands.push(input('MoveFoundation', { object_id: object.id, center_mm: [center3[0] + resized.center_mm[0] - center[0], center3[1] + resized.center_mm[1] - center[1], center3[2]] }))
    }
    const currentSize = point3(data.size_mm)
    commands.push(input('UpdateFoundationDimensions', { object_id: object.id, size_mm: [resized.size_mm[0], resized.size_mm[1], currentSize[2]] }))
    return commands
  }

  if (gesture.kind === 'stair-width' || gesture.kind === 'stair-run' || gesture.kind === 'stair-landing' || gesture.kind === 'stair-first-flight' || gesture.kind === 'stair-second-flight') {
    if (object.object_type !== 'architecture.stair') return []
    const start = point2(data.start_point_mm), angle = Number(data.rotation_deg ?? 0) * Math.PI / 180
    if (gesture.kind === 'stair-width') {
      const side = data.turn_direction === 'left' && data.stair_type !== 'straight' ? -1 : 1
      const width = Math.max(600, (point[0] - start[0]) * -Math.sin(angle) * side + (point[1] - start[1]) * Math.cos(angle) * side)
      return [fullObjectUpdate(object, 'UpdateStair', { width_mm: width })]
    }
    if (gesture.kind === 'stair-landing') {
      if (data.stair_type === 'straight') return []
      const landingDepth = Number(data.landing_depth_mm ?? data.width_mm)
      const deltaX = point[0] - gesture.startWorldMm[0], deltaY = point[1] - gesture.startWorldMm[1]
      const nextLandingDepth = landingDepth + deltaX * Math.cos(angle) + deltaY * Math.sin(angle)
      return [fullObjectUpdate(object, 'UpdateStair', { landing_depth_mm: nextLandingDepth })]
    }
    if (gesture.kind === 'stair-first-flight' || gesture.kind === 'stair-second-flight') {
      if (data.stair_type === 'straight') return []
      const flight = gesture.kind === 'stair-first-flight' ? 'first' : 'second'
      const grip = stairFlightGripPoints(data).find(item => item.flight === flight)
      if (!grip) return []
      const run = grip.run + (point[0] - grip.point[0]) * grip.direction[0] + (point[1] - grip.point[1]) * grip.direction[1]
      const risers = Number(data.num_risers)
      const firstRisers = Number(data.first_flight_risers ?? Math.floor(risers / 2))
      const flightRisers = flight === 'first' ? firstRisers : risers - firstRisers
      const tread = run / Math.max(1, flightRisers - 1)
      return [fullObjectUpdate(object, 'UpdateStair', flight === 'first'
        ? { tread_depth_mm: tread, second_tread_depth_mm: Number(data.second_tread_depth_mm ?? data.tread_depth_mm) }
        : { second_tread_depth_mm: tread })]
    }
    if (data.stair_type !== 'straight') return []
    const run = Math.max(220 * Math.max(1, Number(data.num_risers) - 1), (point[0] - start[0]) * Math.cos(angle) + (point[1] - start[1]) * Math.sin(angle))
    return [fullObjectUpdate(object, 'UpdateStair', { tread_depth_mm: run / Math.max(1, Number(data.num_risers) - 1) })]
  }

  if (gesture.kind === 'slab-edge') {
    if (object.object_type !== 'structure.slab' || endpoint === undefined || !gesture.edgeStartMm || !gesture.edgeNormalMm) return []
    const dx = point[0] - gesture.edgeStartMm[0], dy = point[1] - gesture.edgeStartMm[1]
    const offset = dx * gesture.edgeNormalMm[0] + dy * gesture.edgeNormalMm[1]
    const boundary = offsetPolygonEdge(gesture.boundaryPointsMm ?? data.boundary_mm ?? [], endpoint, offset)
    return boundary ? [fullObjectUpdate(object, 'UpdateSlab', { boundary_mm: boundary })] : []
  }

  if (gesture.kind === 'slab-slope') {
    if (object.object_type !== 'structure.slab' || !gesture.edgeStartMm) return []
    const angle = (Math.atan2(point[1] - gesture.edgeStartMm[1], point[0] - gesture.edgeStartMm[0]) * 180 / Math.PI + 360) % 360
    return [fullObjectUpdate(object, 'UpdateSlab', { drain_direction_deg: angle })]
  }

  if (gesture.kind === 'roof-ridge') {
    if (object.object_type !== 'roof.system') return []
    const edges = moveEditableRoofRidge(data, point2(point))
    return edges ? [fullObjectUpdate(object, 'UpdateRoof', { edges })] : []
  }

  if (gesture.kind === 'roof-seam') {
    if (object.object_type !== 'roof.system' || !Array.isArray(gesture.roofSeamEdgeIndices) || gesture.roofSeamEdgeIndices.length !== 2) return []
    const edges = moveRoofSeam(data, gesture.roofSeamEdgeIndices, point2(point), gesture.roofSeamGripMm ? point2(gesture.roofSeamGripMm) : undefined)
    return edges ? [fullObjectUpdate(object, 'UpdateRoof', { edges })] : []
  }

  if (gesture.kind === 'polygon-vertex') {
    const boundary = structuredClone(gesture.boundaryPointsMm ?? data.boundary_mm ?? [])
    if (endpoint === undefined || !boundary[endpoint]) return []
    boundary[endpoint] = point2(point)
    command = polygonCommand(object, boundary)
  } else if (gesture.kind === 'wall-endpoint') {
    const start = point2(gesture.startPointMm), end = point2(gesture.endPointMm)
    if (endpoint === 0) start.splice(0, 2, point[0], point[1]); else end.splice(0, 2, point[0], point[1])
    command = input('UpdateWallEndpoints', { object_id: object.id, start_point_mm: start, end_point_mm: end })
  } else if (gesture.kind === 'beam-endpoint') {
    const start = point2(gesture.startPointMm), end = point2(gesture.endPointMm)
    const beam = object
    const columnId = options.targetColumnId ?? null
    const nextPoint = options.targetColumnId && project.objects[options.targetColumnId]?.object_type === 'structure.column'
      ? point2(project.objects[options.targetColumnId].module_data.location_mm) : point
    if (endpoint === 0) start.splice(0, 2, nextPoint[0], nextPoint[1]); else end.splice(0, 2, nextPoint[0], nextPoint[1])
    command = input('UpdateBeamEndpoints', {
      object_id: object.id, start_point_mm: start, end_point_mm: end,
      start_column_id: endpoint === 0 ? columnId : beam.module_data.start_column_id ?? null,
      end_column_id: endpoint === 1 ? columnId : beam.module_data.end_column_id ?? null,
    })
  } else if (gesture.kind === 'grid-endpoint') {
    const start = point2(gesture.startPointMm), end = point2(gesture.endPointMm)
    if (endpoint === 0) start.splice(0, 2, point[0], point[1]); else end.splice(0, 2, point[0], point[1])
    command = input('ModifyGrid', { object_id: object.id, start_point_mm: start, end_point_mm: end })
  } else if (gesture.kind === 'separator-endpoint') {
    const start = point2(gesture.startPointMm), end = point2(gesture.endPointMm)
    if (endpoint === 0) start.splice(0, 2, point[0], point[1]); else end.splice(0, 2, point[0], point[1])
    command = fullObjectUpdate(object, 'UpdateRoomSeparator', { start_point_mm: start, end_point_mm: end })
  } else if (gesture.kind === 'pipe-endpoint') {
    const route = structuredClone(gesture.pipeRouteData ?? data)
    const index = endpoint === 0 ? 0 : route.nodes_mm.length - 1
    if (!route.nodes_mm[index]) return []
    route.nodes_mm[index][0] = point[0]; route.nodes_mm[index][1] = point[1]
    command = fullObjectUpdate(object, 'EditPipeRoute', route)
  } else if (gesture.kind === 'pipe-node') {
    const route = structuredClone(gesture.pipeRouteData ?? data)
    const index = endpoint
    if (index === undefined || index <= 0 || index >= route.nodes_mm.length - 1 || !route.nodes_mm[index]) return []
    route.nodes_mm[index][0] = point[0]; route.nodes_mm[index][1] = point[1]
    command = fullObjectUpdate(object, 'EditPipeRoute', route)
  } else if (gesture.kind === 'moulding-endpoint') {
    const path = structuredClone(gesture.mouldingData?.path_mm ?? data.path_mm ?? [])
    if (endpoint === undefined || !path[endpoint]) return []
    path[endpoint][0] = point[0]; path[endpoint][1] = point[1]
    command = fullObjectUpdate(object, 'UpdateMouldingRun', { path_mm: path })
  } else if (gesture.kind === 'cabinet-rotation') {
    const cabinet = gesture.cabinetData ?? data
    const angle = options.cabinetRotationDeg ?? (Math.atan2(point[1] - cabinet.location_mm[1], point[0] - cabinet.location_mm[0]) * 180 / Math.PI + 360) % 360
    if (angle !== null) command = fullObjectUpdate(object, 'UpdateCabinetRun', { rotation_deg: angle })
  } else if (gesture.kind === 'opening-edge') {
    const width = gesture.openingWidthMm ?? data.width_mm
    const offset = options.openingOffsetMm ?? data.offset_along_wall_mm
    const resized = options.openingResize ?? { width_mm: width, offset_along_wall_mm: offset }
    command = openingDimensions(object, resized.width_mm, resized.offset_along_wall_mm)
  } else if (gesture.kind === 'column') {
    const location = point3(data.location_mm)
    command = input('MoveColumn', { object_id: object.id, location_mm: [point[0], point[1], location[2]] })
  } else if (gesture.kind === 'wall') {
    const delta = [point[0] - gesture.startWorldMm[0], point[1] - gesture.startWorldMm[1]]
    if (Math.hypot(...delta) > 0.1) command = input('MoveWall', { object_id: object.id, delta_mm: delta })
  } else if (gesture.kind === 'grid') {
    const delta = [point[0] - gesture.startWorldMm[0], point[1] - gesture.startWorldMm[1]]
    if (data.system_id) return [input('ModifyGrid', { object_id: object.id, position_mm: Number(data.position_mm) + (data.orientation === 'vertical' ? delta[0] : delta[1]) })]
    const start = point2(gesture.gridStartMm), end = point2(gesture.gridEndMm)
    command = input('ModifyGrid', { object_id: object.id, start_point_mm: [start[0] + delta[0], start[1] + delta[1]], end_point_mm: [end[0] + delta[0], end[1] + delta[1]] })
  } else if (gesture.kind === 'opening' || gesture.kind === 'opening-center') {
    const hostStart = point2(gesture.hostStartMm), hostEnd = point2(gesture.hostEndMm)
    const dx = hostEnd[0] - hostStart[0], dy = hostEnd[1] - hostStart[1], length = Math.hypot(dx, dy)
    if (length < 1) return []
    const offset = options.openingOffsetMm ?? ((point[0] - hostStart[0]) * dx + (point[1] - hostStart[1]) * dy) / length
    command = input('MoveOpening', { object_id: object.id, offset_along_wall_mm: offset })
  } else if (gesture.kind === 'object-move') {
    const delta = [point[0] - gesture.startWorldMm[0], point[1] - gesture.startWorldMm[1]]
    command = moveSingleObject(project, object, delta[0], delta[1])
  } else if (gesture.kind === 'group-move') {
    const delta = [point[0] - gesture.startWorldMm[0], point[1] - gesture.startWorldMm[1]]
    const ids = [...new Set(gesture.objectIds ?? [object.id])].filter(id => project.objects[id])
    const idSet = new Set(ids)
    const effective = ids.filter(id => {
      const item = project.objects[id]
      const d = item.module_data
      if ((item.object_type === 'door_window.door' || item.object_type === 'door_window.window') && idSet.has(d.wall_id)) return false
      if (item.object_type === 'structure.foundation') {
        const colId = d.supported_column_id ?? item.host_refs?.find(hostId => project.objects[hostId]?.object_type === 'structure.column')
        if (colId && idSet.has(colId)) return false
      }
      return true
    })
    return effective.map(id => moveCommandFor(project, id, delta)).filter(Boolean)
  } else {
    return []
  }

  return command ? [command] : []
}

/** Apply the candidate geometry even when domain validation rejects it, for a red drag ghost. */
export function optimisticManipulationProject(project, commands) {
  const candidate = structuredClone(project)
  for (const command of commands) {
    const { name, input: payload } = command
    const objectId = String(payload.object_id ?? payload.id ?? '')
    const object = candidate.objects[objectId]
    if (!object) continue
    const data = object.module_data
    if (name === 'MoveWall') {
      const [dx, dy] = payload.delta_mm
      for (const wallPointField of ['start_point_mm', 'end_point_mm']) data[wallPointField] = [data[wallPointField][0] + dx, data[wallPointField][1] + dy, data[wallPointField][2] ?? 0]
      for (const opening of Object.values(candidate.objects)) if ((opening.object_type === 'door_window.door' || opening.object_type === 'door_window.window') && opening.module_data.wall_id === objectId) {
        opening.module_data.location_mm = [opening.module_data.location_mm[0] + dx, opening.module_data.location_mm[1] + dy, opening.module_data.location_mm[2] ?? 0]
      }
    } else if (name === 'MoveColumn') {
      data.location_mm = [...payload.location_mm]
      for (const beam of Object.values(candidate.objects)) if (beam.object_type === 'structure.beam') {
        for (const key of ['start', 'end']) if (beam.module_data[`${key}_column_id`] === objectId) {
          const point = beam.module_data[`${key}_point_mm`]
          beam.module_data[`${key}_point_mm`] = [payload.location_mm[0], payload.location_mm[1], point[2] ?? 0]
        }
      }
      for (const foundation of Object.values(candidate.objects)) if (foundation.object_type === 'structure.foundation' && (foundation.module_data.supported_column_id === objectId || foundation.host_refs?.includes(objectId))) foundation.module_data.center_mm = [...payload.location_mm]
    } else if (name === 'MoveFoundation') {
      data.center_mm = [...payload.center_mm]
    } else if (name === 'MoveOpening') {
      const wall = candidate.objects[data.wall_id]
      if (wall?.object_type === 'architecture.wall') {
        const a = wall.module_data.start_point_mm, b = wall.module_data.end_point_mm
        const length = Math.hypot(b[0] - a[0], b[1] - a[1])
        data.offset_along_wall_mm = payload.offset_along_wall_mm
        data.location_mm = [a[0] + (b[0] - a[0]) * payload.offset_along_wall_mm / length, a[1] + (b[1] - a[1]) * payload.offset_along_wall_mm / length, data.location_mm[2] ?? 0]
      }
    } else if (name === 'UpdateWallEndpoints') {
      data.start_point_mm = [...payload.start_point_mm, data.start_point_mm[2] ?? 0]
      data.end_point_mm = [...payload.end_point_mm, data.end_point_mm[2] ?? 0]
      const dx = payload.end_point_mm[0] - payload.start_point_mm[0], dy = payload.end_point_mm[1] - payload.start_point_mm[1]
      const length = Math.hypot(dx, dy)
      for (const opening of Object.values(candidate.objects)) if ((opening.object_type === 'door_window.door' || opening.object_type === 'door_window.window') && opening.module_data.wall_id === objectId && length > 0) {
        const offset = Number(opening.module_data.offset_along_wall_mm)
        opening.module_data.location_mm = [payload.start_point_mm[0] + dx * offset / length, payload.start_point_mm[1] + dy * offset / length, opening.module_data.location_mm[2] ?? 0]
      }
    } else if (name === 'UpdateBeamEndpoints') {
      data.start_point_mm = [...payload.start_point_mm, data.start_point_mm[2] ?? 0]
      data.end_point_mm = [...payload.end_point_mm, data.end_point_mm[2] ?? 0]
      data.start_column_id = payload.start_column_id || undefined; data.end_column_id = payload.end_column_id || undefined
    } else if (name === 'UpdateDoorDimensions' || name === 'UpdateWindowDimensions') {
      for (const [key, value] of Object.entries(payload)) if (key !== 'object_id' && key in data) data[key] = structuredClone(value)
      const host = candidate.objects[data.wall_id]
      if (host?.object_type === 'architecture.wall') {
        const a = host.module_data.start_point_mm, b = host.module_data.end_point_mm
        const length = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (length > 0) data.location_mm = [a[0] + (b[0] - a[0]) * Number(data.offset_along_wall_mm) / length, a[1] + (b[1] - a[1]) * Number(data.offset_along_wall_mm) / length, data.location_mm[2] ?? 0]
      }
    } else if (name === 'UpdateColumnDimensions') data.section_mm = [...payload.section_mm]
    else if (name === 'UpdateFoundationDimensions') data.size_mm = [...payload.size_mm]
    else if (name === 'MoveFoundation') data.center_mm = [...payload.center_mm]
    else if (name === 'ModifyGrid' || name === 'UpdateRoomSeparator' || name.startsWith('Update')) {
      const omit = new Set(['id', 'object_id'])
      for (const [key, value] of Object.entries(payload)) if (!omit.has(key) && key in data) data[key] = structuredClone(value)
    } else if (name === 'EditPipeRoute' || name === 'UpdateMouldingRun' || name === 'UpdateCabinetRun') {
      for (const [key, value] of Object.entries(payload)) if (key !== 'id') data[key] = structuredClone(value)
    }
    candidate.objects[objectId].module_data = data
  }
  return candidate
}
