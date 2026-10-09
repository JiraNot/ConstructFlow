import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, deserializeProject, serializeProject } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'
import { detectClosedWallRooms } from '../../architecture-engine/dist/index.js'
import { resolveArchitectureSurfaceElevation } from '@constructflow/project-model'
import { calculateTakeoff } from '../../takeoff-engine/dist/index.js'

const run = (project, name, input) => {
  const result = CommandBus.execute(project, name, input)
  assert.equal(result.result.status, 'success', JSON.stringify(result.result))
  return result.updatedProject
}

test('floor and ceiling commands reject invalid boundaries and void geometry before it enters the model', () => {
  const project = createEmptyProjectDocument(crypto.randomUUID())
  project.levels = [{ id: 'L1', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 2800 }]
  const boundary_mm = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]
  const base = { level_id: 'L1', boundary_mm, thickness_mm: 50, elevation_mm: 0 }
  const cases = [
    ['CreateArchitecturalFloor', { ...base, voids_mm: [[[3500, 1000], [4500, 1000], [4500, 2000], [3500, 2000]]] }, /strictly inside/],
    ['CreateCeiling', { ...base, voids_mm: [[[500, 500], [2000, 500], [2000, 2000], [500, 2000]], [[1500, 1000], [3000, 1000], [3000, 2500], [1500, 2500]]] }, /overlaps/],
    ['CreateArchitecturalFloor', { ...base, boundary_mm: [[0, 0], [4000, 3000], [4000, 0], [0, 3000]], voids_mm: [] }, /simple/],
    ['CreateCeiling', { ...base, voids_mm: [[[500, 500], [1500, 500], [Number.NaN, 1200]]] }, /finite/],
  ]
  for (const [command, payload, reason] of cases) {
    const result = CommandBus.execute(project, command, { id: crypto.randomUUID(), ...payload })
    assert.notEqual(result.result.status, 'success', `${command} should reject invalid polygon data`)
    assert.match(JSON.stringify(result.result), reason)
    assert.deepEqual(result.updatedProject, project, 'rejected geometry must not mutate the source project')
  }
})

test('architectural floor and ceiling void edits remain valid and reduce net finish quantities', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  project.levels = [{ id: 'L1', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 2800 }]
  const boundary_mm = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]
  const void_mm = [[1000, 1000], [1500, 1000], [1500, 1500], [1000, 1500]]
  project = run(project, 'CreateArchitecturalFloor', {
    id: crypto.randomUUID(), mark: 'AF1', level_id: 'L1', boundary_mm, thickness_mm: 50,
    elevation_mm: 0, voids_mm: [], finish_layers: [{ mark: 'Tile', material: 'porcelain_tile', thickness_mm: 10, quantity_unit: 'm2' }],
  })
  project = run(project, 'CreateCeiling', {
    id: crypto.randomUUID(), mark: 'CL1', level_id: 'L1', boundary_mm, thickness_mm: 12,
    elevation_mm: 2800, voids_mm: [], grid_mm: [600, 600],
  })
  const floor = Object.values(project.objects).find(object => object.object_type === 'architecture.floor')
  const ceiling = Object.values(project.objects).find(object => object.object_type === 'architecture.ceiling')
  assert.ok(floor && ceiling)
  project = run(project, 'UpdateArchitecturalFloor', { ...floor.module_data, id: floor.id, voids_mm: [void_mm] })
  project = run(project, 'UpdateCeiling', { ...ceiling.module_data, id: ceiling.id, voids_mm: [void_mm] })
  assert.deepEqual(project.objects[floor.id].module_data.voids_mm, [void_mm])
  assert.deepEqual(project.objects[ceiling.id].module_data.voids_mm, [void_mm])
  const report = calculateTakeoff(project)
  const finish = report.lines.find(line => line.source_object_ids.includes(floor.id) && line.object_type === 'architecture.floor.finish')
  const ceilingArea = report.lines.find(line => line.source_object_ids.includes(ceiling.id) && line.object_type === 'architecture.ceiling')
  assert.equal(finish?.quantity, 11.75)
  assert.equal(ceilingArea?.quantity, 11.75)
  assert.deepEqual(report.warnings, [])
})

test('floor and ceiling catalog types cascade finish and grid data while preserving instance overrides and takeoff', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  project.levels = [{ id: 'L1', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 2800 }]
  const boundary_mm = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]]
  const floorIds = [crypto.randomUUID(), crypto.randomUUID()]
  const ceilingIds = [crypto.randomUUID(), crypto.randomUUID()]
  for (const id of floorIds) project = run(project, 'CreateArchitecturalFloor', {
    id, mark: 'AF', level_id: 'L1', boundary_mm, thickness_mm: 50, elevation_mm: 0, voids_mm: [],
    finish_layers: [{ mark: 'Original Tile', material: 'ceramic_tile', thickness_mm: 10, quantity_unit: 'm3' }],
  })
  for (const id of ceilingIds) project = run(project, 'CreateCeiling', {
    id, mark: 'CL', level_id: 'L1', boundary_mm, thickness_mm: 12, elevation_mm: 2800, voids_mm: [], grid_mm: [600, 600],
  })

  const floorTypeId = crypto.randomUUID(), ceilingTypeId = crypto.randomUUID()
  project = run(project, 'DefineStructuralType', { id: floorTypeId, object_type: 'architecture.floor', name: 'AF-TILE', parameters: {
    thickness_mm: 50, finish_layers: [{ mark: 'Catalog Tile', material: 'porcelain_tile', thickness_mm: 10, quantity_unit: 'm3' }],
    finish_pattern_mm: [600, 600], finish_pattern_origin_mm: [0, 0], finish_pattern_rotation_deg: 0,
  } })
  project = run(project, 'DefineStructuralType', { id: ceilingTypeId, object_type: 'architecture.ceiling', name: 'CL-GRID', parameters: {
    thickness_mm: 12, material: 'gypsum_board', grid_mm: [600, 600],
  } })
  for (const id of floorIds) project = run(project, 'AssignInstanceType', { object_id: id, type_id: floorTypeId })
  for (const id of ceilingIds) project = run(project, 'AssignInstanceType', { object_id: id, type_id: ceilingTypeId })

  const floorOverride = project.objects[floorIds[0]]
  project = run(project, 'UpdateArchitecturalFloor', { ...floorOverride.module_data, id: floorOverride.id,
    finish_layers: [{ mark: 'Custom Stone', material: 'stone', thickness_mm: 30, quantity_unit: 'm3' }],
  })
  const ceilingOverride = project.objects[ceilingIds[0]]
  project = run(project, 'UpdateCeiling', { ...ceilingOverride.module_data, id: ceilingOverride.id, grid_mm: [300, 300] })

  project = run(project, 'UpdateStructuralTypeDimensions', { type_id_or_name: floorTypeId, object_type: 'architecture.floor', parameters: {
    finish_layers: [{ mark: 'Updated Catalog Tile', material: 'porcelain_tile', thickness_mm: 15, quantity_unit: 'm3' }],
    finish_pattern_mm: [300, 450],
  } })
  project = run(project, 'UpdateStructuralTypeDimensions', { type_id_or_name: ceilingTypeId, object_type: 'architecture.ceiling', parameters: {
    thickness_mm: 15, grid_mm: [600, 1200],
  } })

  const overriddenFloor = project.objects[floorIds[0]].module_data
  const catalogFloor = project.objects[floorIds[1]].module_data
  assert.equal(overriddenFloor.finish_layers[0].mark, 'Custom Stone')
  assert.deepEqual(overriddenFloor.finish_pattern_mm, [300, 450])
  assert.equal(catalogFloor.finish_layers[0].mark, 'Updated Catalog Tile')
  assert.equal(catalogFloor.finish_layers[0].thickness_mm, 15)
  assert.deepEqual(catalogFloor.finish_pattern_mm, [300, 450])
  assert.deepEqual(project.objects[ceilingIds[0]].module_data.grid_mm, [300, 300])
  assert.deepEqual(project.objects[ceilingIds[1]].module_data.grid_mm, [600, 1200])
  assert.equal(project.objects[ceilingIds[1]].module_data.thickness_mm, 15)

  const report = calculateTakeoff(project)
  const updatedFinish = report.lines.find(line => line.source_object_ids.includes(floorIds[1]) && line.mark === 'Updated Catalog Tile')
  const overrideFinish = report.lines.find(line => line.source_object_ids.includes(floorIds[0]) && line.mark === 'Custom Stone')
  assert.equal(updatedFinish?.quantity, 0.18)
  assert.equal(updatedFinish?.material, 'porcelain_tile')
  assert.equal(overrideFinish?.quantity, 0.36)
  assert.deepEqual(project.objects[floorIds[0]].module_data.instance_overrides.finish_layers, [{ mark: 'Custom Stone', material: 'stone', thickness_mm: 30, quantity_unit: 'm3' }])
  assert.deepEqual(project.objects[ceilingIds[0]].module_data.instance_overrides.grid_mm, [300, 300])
  const reopened = deserializeProject(serializeProject(project))
  assert.deepEqual(reopened.objects[floorIds[1]].module_data.finish_layers, catalogFloor.finish_layers)
  assert.deepEqual(reopened.objects[floorIds[0]].module_data.instance_overrides.finish_layers, project.objects[floorIds[0]].module_data.instance_overrides.finish_layers)
  assert.equal(calculateTakeoff(reopened).lines.find(line => line.source_object_ids.includes(floorIds[1]) && line.mark === 'Updated Catalog Tile')?.quantity, 0.18)
})

test('deleting an enclosure wall marks linked room surfaces stale and excludes them from takeoff', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  project.levels = [{ id: 'L1', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 2800 }]
  const edges = [
    [[0, 0, 0], [4000, 0, 0]], [[4000, 0, 0], [4000, 3000, 0]],
    [[4000, 3000, 0], [0, 3000, 0]], [[0, 3000, 0], [0, 0, 0]],
  ]
  const wallIds = []
  for (const [start_point_mm, end_point_mm] of edges) {
    const id = crypto.randomUUID()
    wallIds.push(id)
    project = run(project, 'CreateWall', {
      id, mark: 'W1', start_point_mm, end_point_mm, thickness_mm: 100, height_mm: 2800, level_id: 'L1',
    })
  }
  project = run(project, 'DetectRooms', { level_id: 'L1' })
  const room = Object.values(project.objects).find(object => object.object_type === 'architecture.room')
  assert.ok(room)
  project = run(project, 'CreateArchitecturalFloor', {
    id: crypto.randomUUID(), mark: 'AF1', room_id: room.id, level_id: 'L1', elevation_mm: 0,
    thickness_mm: 50, voids_mm: [], finish_layers: [{ mark: 'Tile', material: 'porcelain_tile', thickness_mm: 10 }],
  })
  project = run(project, 'CreateCeiling', {
    id: crypto.randomUUID(), mark: 'CL1', room_id: room.id, level_id: 'L1', elevation_mm: 2600,
    thickness_mm: 20, voids_mm: [], grid_mm: [600, 600],
  })
  const floor = Object.values(project.objects).find(object => object.object_type === 'architecture.floor')
  const ceiling = Object.values(project.objects).find(object => object.object_type === 'architecture.ceiling')
  assert.ok(floor && ceiling)
  const deletedWallId = wallIds[1]
  const deletion = CommandBus.execute(project, 'DeleteObject', { object_id: deletedWallId })
  assert.equal(deletion.result.status, 'success', JSON.stringify(deletion.result))
  project = deletion.updatedProject

  assert.equal(project.objects[deletedWallId], undefined)
  assert.equal(project.objects[room.id].module_data.boundary_status, 'unclosed')
  assert.equal(project.objects[floor.id].module_data.room_boundary_status, 'unclosed')
  assert.equal(project.objects[ceiling.id].module_data.room_boundary_status, 'unclosed')
  assert.ok(deletion.result.updated_object_ids.includes(room.id))
  assert.ok(deletion.result.updated_object_ids.includes(floor.id))
  assert.ok(deletion.result.updated_object_ids.includes(ceiling.id))

  for (const [command, id] of [['CreateArchitecturalFloor', crypto.randomUUID()], ['CreateCeiling', crypto.randomUUID()]]) {
    const result = CommandBus.execute(project, command, { id, mark: 'STALE', room_id: room.id, thickness_mm: 20, voids_mm: [] })
    assert.notEqual(result.result.status, 'success', `${command} must not clone a stale room boundary`)
    assert.match(JSON.stringify(result.result), /room wall loop is open/)
    assert.equal(result.updatedProject, project, 'rejected room-based surface creation must leave the project unchanged')
  }

  const report = calculateTakeoff(project)
  assert.ok(!report.lines.some(line => line.source_object_ids.includes(floor.id) || line.source_object_ids.includes(ceiling.id)))
  assert.ok(report.warnings.some(warning => warning.startsWith(`${floor.id}: room boundary is unclosed`)))
  assert.ok(report.warnings.some(warning => warning.startsWith(`${ceiling.id}: room boundary is unclosed`)))

  project = run(project, 'CreateWall', {
    id: deletedWallId, mark: 'W1', start_point_mm: [4000, 0, 0], end_point_mm: [4000, 3000, 0],
    thickness_mm: 100, height_mm: 2800, level_id: 'L1',
  })
  assert.equal(project.objects[room.id].module_data.boundary_status, 'closed')
  assert.equal(project.objects[floor.id].module_data.room_boundary_status, 'closed')
  assert.equal(project.objects[ceiling.id].module_data.room_boundary_status, 'closed')
  const restoredReport = calculateTakeoff(project)
  assert.ok(restoredReport.lines.some(line => line.source_object_ids.includes(floor.id)))
  assert.ok(restoredReport.lines.some(line => line.source_object_ids.includes(ceiling.id)))
  assert.ok(!restoredReport.warnings.some(warning => warning.includes('room boundary is unclosed')))
})

test('room refresh after wall edits preserves room identity and updates associative floor/ceiling boundaries', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  project.levels = [{ id: 'L1', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 2800 }]
  const edges = [
    [[0,0,0],[4000,0,0]], [[4000,0,0],[4000,3000,0]],
    [[4000,3000,0],[0,3000,0]], [[0,3000,0],[0,0,0]],
  ]
  for (const [index, [start_point_mm,end_point_mm]] of edges.entries()) project = run(project,'CreateWall',{
    id: crypto.randomUUID(),mark:'W1',start_point_mm,end_point_mm,thickness_mm:100,height_mm:2800,level_id:'L1',
  })
  project = run(project,'DetectRooms',{level_id:'L1'})
  const room = Object.values(project.objects).find(object=>object.object_type==='architecture.room')
  assert.ok(room)
  assert.equal(room.module_data.area_mm2,11_310_000, 'detected room area is measured between the inside plaster faces, not wall axes')
  assert.deepEqual(room.module_data.boundary_mm,[[50,50],[3950,50],[3950,2950],[50,2950]])
  project = run(project,'CreateArchitecturalFloor',{id:crypto.randomUUID(),mark:'AF1',room_id:room.id,level_id:'L1',elevation_mm:0,elevation_offset_mm:0,thickness_mm:50,voids_mm:[],finish_layers:[]})
  let floor=Object.values(project.objects).find(object=>object.object_type==='architecture.floor')
  assert.equal(floor.module_data.follows_room_boundary,true)
  const invalidLayer=CommandBus.execute(project,'UpdateArchitecturalFloor',{...floor.module_data,id:floor.id,finish_layers:[{material:'tile',thickness_mm:0}]})
  assert.notEqual(invalidLayer.result.status,'success')
  assert.match(JSON.stringify(invalidLayer.result),/Floor finish layer 1 thickness must be positive/)
  const invalidPattern=CommandBus.execute(project,'UpdateArchitecturalFloor',{...floor.module_data,id:floor.id,finish_pattern_mm:[0,600]})
  assert.notEqual(invalidPattern.result.status,'success')
  assert.match(JSON.stringify(invalidPattern.result),/Floor finish pattern spacing must contain two positive values/)
  project=run(project,'UpdateArchitecturalFloor',{...floor.module_data,id:floor.id,finish_layers:[{mark:'Tile',material:'porcelain_tile',thickness_mm:10,quantity_unit:'m2'}],finish_pattern_mm:[400,600],finish_pattern_origin_mm:[125,250],finish_pattern_rotation_deg:15})
  floor=project.objects[floor.id]
  assert.equal(floor.module_data.finish_layers[0].material,'porcelain_tile')
  assert.equal(floor.module_data.finish_layers[0].quantity_unit,'m2')
  assert.deepEqual(floor.module_data.finish_pattern_mm,[400,600])
  assert.deepEqual(floor.module_data.finish_pattern_origin_mm,[125,250])
  assert.equal(floor.module_data.finish_pattern_rotation_deg,15)

  project = run(project,'CreateCeiling',{id:crypto.randomUUID(),mark:'CL1',room_id:room.id,level_id:'L1',elevation_mm:2600,elevation_offset_mm:0,thickness_mm:20,voids_mm:[],grid_mm:[600,600]})
  let ceiling=Object.values(project.objects).find(object=>object.object_type==='architecture.ceiling')
  assert.equal(ceiling.module_data.follows_room_boundary,true)
  assert.equal(ceiling.module_data.elevation_reference,'level')
  assert.equal(ceiling.module_data.elevation_offset_mm,2600)
  assert.equal(resolveArchitectureSurfaceElevation(project,ceiling),2600)
  project.levels[0].elevation_mm=400
  assert.equal(resolveArchitectureSurfaceElevation(project,project.objects[floor.id]),400)
  assert.equal(resolveArchitectureSurfaceElevation(project,project.objects[ceiling.id]),3000)
  project.levels[0].elevation_mm=0

  const rightWall=Object.values(project.objects).find(object=>object.object_type==='architecture.wall'&&object.module_data.start_point_mm[0]===4000&&object.module_data.end_point_mm[0]===4000)
  const bottomWall=Object.values(project.objects).find(object=>object.object_type==='architecture.wall'&&object.module_data.start_point_mm[1]===0&&object.module_data.end_point_mm[1]===0)
  const topWall=Object.values(project.objects).find(object=>object.object_type==='architecture.wall'&&object.module_data.start_point_mm[1]===3000&&object.module_data.end_point_mm[1]===3000)
  assert.ok(rightWall)
  assert.ok(bottomWall&&topWall)
  project=run(project,'UpdateWallEndpoints',{object_id:rightWall.id,start_point_mm:[5000,0],end_point_mm:[5000,3000]})
  project=run(project,'UpdateWallEndpoints',{object_id:bottomWall.id,start_point_mm:[0,0],end_point_mm:[5000,0]})
  assert.equal(project.objects[room.id].module_data.boundary_status,'unclosed')
  assert.equal(project.objects[floor.id].module_data.room_boundary_status,'unclosed')
  assert.equal(project.objects[ceiling.id].module_data.room_boundary_status,'unclosed')
  const closeLoop=CommandBus.execute(project,'UpdateWallEndpoints',{object_id:topWall.id,start_point_mm:[5000,3000],end_point_mm:[0,3000]})
  assert.equal(closeLoop.result.status,'success')
  assert.ok(closeLoop.result.updated_object_ids.includes(room.id))
  assert.ok(closeLoop.result.updated_object_ids.includes(floor.id))
  assert.ok(closeLoop.result.updated_object_ids.includes(ceiling.id))
  project=closeLoop.updatedProject
  assert.equal(project.objects[rightWall.id].module_data.end_point_mm[0],5000)
  assert.ok(detectClosedWallRooms(project,'L1').some(ring=>Math.abs(Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1]},0)/2)-14_210_000)<1))
  const refreshedRoom=project.objects[room.id]
  assert.equal(refreshedRoom.module_data.boundary_status,'closed')
  assert.equal(project.objects[floor.id].module_data.room_boundary_status,'closed')
  assert.equal(project.objects[ceiling.id].module_data.room_boundary_status,'closed')
  assert.equal(refreshedRoom.module_data.area_mm2,14_210_000)
  assert.equal(Object.values(project.objects).filter(object=>object.object_type==='architecture.room').length,1)
  assert.deepEqual(project.objects[floor.id].module_data.boundary_mm,refreshedRoom.module_data.boundary_mm)
  assert.deepEqual(project.objects[ceiling.id].module_data.boundary_mm,refreshedRoom.module_data.boundary_mm)

  const session=new ProjectCommandSession(project)
  const resizeBack=session.execute([
    {name:'UpdateWallEndpoints',input:{object_id:rightWall.id,start_point_mm:[4000,0],end_point_mm:[4000,3000]}},
    {name:'UpdateWallEndpoints',input:{object_id:bottomWall.id,start_point_mm:[0,0],end_point_mm:[4000,0]}},
    {name:'UpdateWallEndpoints',input:{object_id:topWall.id,start_point_mm:[4000,3000],end_point_mm:[0,3000]}},
  ])
  assert.equal(resizeBack.status,'success')
  assert.equal(resizeBack.updatedProject.objects[room.id].module_data.area_mm2,11_310_000)
  assert.equal(Math.max(...resizeBack.updatedProject.objects[floor.id].module_data.boundary_mm.map(point=>point[0])),3950)
  assert.equal(session.undo().objects[room.id].module_data.area_mm2,14_210_000)
  assert.equal(session.redo().objects[room.id].module_data.area_mm2,11_310_000)
  project=session.undo()

  const changedBoundary=[[0,0],[5000,0],[5000,3000],[0,3000]]
  project=run(project,'UpdateRoom',{...refreshedRoom.module_data,id:room.id,boundary_mm:changedBoundary})
  floor=project.objects[floor.id]
  assert.deepEqual(floor.module_data.boundary_mm,changedBoundary)
  const manualBoundary=[[0,0],[4500,0],[4500,2800],[0,2800]]
  project=run(project,'UpdateArchitecturalFloor',{...floor.module_data,id:floor.id,boundary_mm:manualBoundary})
  assert.equal(project.objects[floor.id].module_data.follows_room_boundary,false)
  project=run(project,'UpdateRoom',{...project.objects[room.id].module_data,id:room.id,boundary_mm:[[0,0],[6000,0],[6000,3000],[0,3000]]})
  assert.deepEqual(project.objects[floor.id].module_data.boundary_mm,manualBoundary)
  assert.deepEqual(project.objects[ceiling.id].module_data.boundary_mm,[[0,0],[6000,0],[6000,3000],[0,3000]])
})

test('adding a partition to an existing room creates the new enclosed room and keeps linked surfaces associative', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  project.levels = [{ id: 'L1', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 2800 }]
  const wallIds = Array.from({ length: 4 }, () => crypto.randomUUID())
  for (const [index, [start_point_mm, end_point_mm]] of [
    [[0, 0, 0], [4000, 0, 0]], [[4000, 0, 0], [4000, 3000, 0]],
    [[4000, 3000, 0], [0, 3000, 0]], [[0, 3000, 0], [0, 0, 0]],
  ].entries()) project = run(project, 'CreateWall', {
    id: wallIds[index], mark: 'W1', start_point_mm, end_point_mm,
    thickness_mm: 100, height_mm: 2800, level_id: 'L1',
  })
  project = run(project, 'DetectRooms', { level_id: 'L1' })
  const originalRoom = Object.values(project.objects).find(object => object.object_type === 'architecture.room')
  assert.ok(originalRoom)
  project.objects[originalRoom.id].module_data = { ...originalRoom.module_data, mark: 'R2', number: '2' }
  const floorId = crypto.randomUUID()
  project = run(project, 'CreateArchitecturalFloor', {
    id: floorId, mark: 'AF1', room_id: originalRoom.id, level_id: 'L1', thickness_mm: 50, voids_mm: [], finish_layers: [],
  })

  const addPartition = CommandBus.execute(project, 'CreateWall', {
    id: crypto.randomUUID(), mark: 'W1', start_point_mm: [2000, 0, 0], end_point_mm: [2000, 3000, 0],
    thickness_mm: 100, height_mm: 2800, level_id: 'L1',
  })
  assert.equal(addPartition.result.status, 'success', JSON.stringify(addPartition.result))
  const rooms = Object.values(addPartition.updatedProject.objects).filter(object => object.object_type === 'architecture.room')
  assert.equal(rooms.length, 2, `closing a new partition should create the newly enclosed room without requiring a second Detect Rooms action: ${JSON.stringify(rooms.map(room => ({ id: room.id, mark: room.module_data.mark, area: room.module_data.area_mm2, source: room.module_data.boundary_source, status: room.module_data.boundary_status, boundary: room.module_data.boundary_mm })))}`)
  assert.ok(rooms.some(room => room.id === originalRoom.id), 'an existing room UUID should survive the split')
  assert.equal(new Set(rooms.map(room => String(room.module_data.mark))).size, 2, 'automatically created room marks must not collide with user-edited marks')
  assert.equal(new Set(rooms.map(room => String(room.module_data.number))).size, 2, 'automatically created room numbers must not collide with user-edited numbers')
  const floor = addPartition.updatedProject.objects[floorId]
  const associatedRoom = rooms.find(room => room.id === floor.module_data.room_id)
  assert.ok(associatedRoom)
  assert.deepEqual(floor.module_data.boundary_mm, associatedRoom.module_data.boundary_mm)
  assert.ok(addPartition.result.affected_object_ids.includes(rooms.find(room => room.id !== originalRoom.id).id))
  assert.ok(addPartition.result.created_object_ids.includes(rooms.find(room => room.id !== originalRoom.id).id))
})

test('wall room detection returns bounded faces for joined multi-room and angled footprints', () => {
  const detect = (points) => {
    const project = createEmptyProjectDocument(crypto.randomUUID())
    project.objects = {}
    for (const [index, [start, end]] of points.entries()) project.objects[`wall-${index}`] = {
      id: `wall-${index}`, object_type: 'architecture.wall', status: 'active', removed_phase: null,
      module_data: { level_id: 'L1', start_point_mm: [...start, 0], end_point_mm: [...end, 0] },
    }
    return detectClosedWallRooms(project, 'L1')
  }
  const ringArea = (ring) => Math.abs(ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length]
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2)

  // The divider endpoints meet the middle of unsplit perimeter walls (T-junctions).
  const rectangularRooms = detect([
    [[0, 0], [8000, 0]], [[8000, 0], [8000, 3000]],
    [[8000, 3000], [0, 3000]], [[0, 3000], [0, 0]],
    [[4000, 0], [4000, 3000]],
  ])
  assert.equal(rectangularRooms.length, 2, 'do not report the whole building perimeter as a third room')
  assert.deepEqual(rectangularRooms.map(ringArea), [12_000_000, 12_000_000])
  let model = createEmptyProjectDocument(crypto.randomUUID())
  for (const [start, end] of [
    [[0, 0, 0], [8000, 0, 0]], [[8000, 0, 0], [8000, 3000, 0]],
    [[8000, 3000, 0], [0, 3000, 0]], [[0, 3000, 0], [0, 0, 0]],
    [[4000, 0, 0], [4000, 3000, 0]],
  ]) model = run(model, 'CreateWall', {
    id: crypto.randomUUID(), mark: 'W1', start_point_mm: start, end_point_mm: end,
    thickness_mm: 100, height_mm: 2800, level_id: 'L1',
  })
  model = run(model, 'DetectRooms', { level_id: 'L1' })
  const createdRooms = Object.values(model.objects).filter(object => object.object_type === 'architecture.room')
  assert.equal(createdRooms.length, 2, 'DetectRooms command should create only bounded rooms')
  assert.deepEqual(createdRooms.map(room => room.module_data.area_mm2).sort(), [11_310_000, 11_310_000])

  const deadEnd = detect([
    [[0, 0], [4000, 0]], [[4000, 0], [4000, 3000]],
    [[4000, 3000], [0, 3000]], [[0, 3000], [0, 0]],
    [[0, 1500], [2000, 1500]],
  ])
  assert.equal(deadEnd.length, 1, 'a partition stub must not create a room')
  assert.equal(deadEnd[0].length, 4, 'a dead-end branch must not be included as a self-touching room boundary')
  assert.equal(ringArea(deadEnd[0]), 12_000_000)

  // A sloped top wall creates two trapezoidal rooms and tests non-orthogonal intersections.
  const angledRooms = detect([
    [[0, 0], [8000, 0]], [[8000, 0], [7000, 3000]],
    [[7000, 3000], [1000, 3000]], [[1000, 3000], [0, 0]],
    [[4000, 0], [4000, 3000]],
  ])
  assert.equal(angledRooms.length, 2)
  assert.ok(angledRooms.every(ring => Math.abs(ringArea(ring) - 10_500_000) < 1), 'sloped joins should resolve to the expected room areas within 1 mm²')
})

test('room interior boundary offsets each bounding wall by its own finished thickness', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  for (const [start_point_mm, end_point_mm, thickness_mm] of [
    [[0, 0, 0], [4000, 0, 0], 200], [[4000, 0, 0], [4000, 3000, 0], 100],
    [[4000, 3000, 0], [0, 3000, 0], 100], [[0, 3000, 0], [0, 0, 0], 100],
  ]) project = run(project, 'CreateWall', {
    id: crypto.randomUUID(), mark: 'W1', start_point_mm, end_point_mm,
    thickness_mm, height_mm: 2800, level_id: 'L1',
  })
  project = run(project, 'DetectRooms', { level_id: 'L1' })
  const room = Object.values(project.objects).find(object => object.object_type === 'architecture.room')
  assert.ok(room)
  assert.deepEqual(room.module_data.boundary_mm, [[50, 100], [3950, 100], [3950, 2950], [50, 2950]])
  assert.equal(room.module_data.area_mm2, 11_115_000)
})

test('acute wall corners keep a finite inward finished-face room boundary', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  project.levels = [{ id: 'L1', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 2800 }]
  const vertices = [[0, 0], [10000, 0], [10000, 1000]]
  for (let index = 0; index < vertices.length; index++) {
    const start = vertices[index], end = vertices[(index + 1) % vertices.length]
    project = run(project, 'CreateWall', {
      id: crypto.randomUUID(), mark: 'W1', start_point_mm: [...start, 0], end_point_mm: [...end, 0],
      thickness_mm: 100, height_mm: 2800, level_id: 'L1',
    })
  }
  project = run(project, 'DetectRooms', { level_id: 'L1' })
  const room = Object.values(project.objects).find(object => object.object_type === 'architecture.room')
  assert.ok(room, 'the acute triangular enclosure should still produce a room')
  const boundary = room.module_data.boundary_mm
  assert.equal(boundary.length, 3)
  assert.ok(boundary.flat().every(Number.isFinite), 'acute corner offset intersections must remain finite')
  assert.ok(room.module_data.area_mm2 > 100_000 && room.module_data.area_mm2 < 5_000_000, 'finished-face area must remain positive and smaller than the centerline enclosure')
  assert.ok(boundary.every(([x, y]) => x > 0 && x < 10000 && y > 0 && y < 1000), 'finished faces must remain inside the wall centerline triangle')
})

test('concave wall enclosures create a simple interior room boundary with matching floor and ceiling areas', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  project.levels = [{ id: 'L1', name: 'Ground', elevation_mm: 0, storey_index: 0, height_mm: 2800 }]
  const vertices = [[0, 0], [4000, 0], [4000, 1000], [1000, 1000], [1000, 4000], [0, 4000]]
  for (let index = 0; index < vertices.length; index++) {
    const start = vertices[index], end = vertices[(index + 1) % vertices.length]
    project = run(project, 'CreateWall', {
      id: crypto.randomUUID(), mark: 'W1', start_point_mm: [...start, 0], end_point_mm: [...end, 0],
      thickness_mm: 100, height_mm: 2800, level_id: 'L1',
    })
  }
  project = run(project, 'DetectRooms', { level_id: 'L1' })
  const room = Object.values(project.objects).find(object => object.object_type === 'architecture.room')
  assert.ok(room, 'the concave enclosure should produce one room')
  assert.deepEqual(room.module_data.boundary_mm, [[50, 50], [3950, 50], [3950, 950], [950, 950], [950, 3950], [50, 3950]])
  assert.equal(room.module_data.area_mm2, 6_210_000)
  const floorId = crypto.randomUUID(), ceilingId = crypto.randomUUID()
  project = run(project, 'CreateArchitecturalFloor', { id: floorId, room_id: room.id, level_id: 'L1', thickness_mm: 50, voids_mm: [], finish_layers: [] })
  project = run(project, 'CreateCeiling', { id: ceilingId, room_id: room.id, level_id: 'L1', elevation_mm: 2600, thickness_mm: 12, voids_mm: [], grid_mm: [600, 600] })
  assert.deepEqual(project.objects[floorId].module_data.boundary_mm, room.module_data.boundary_mm)
  assert.deepEqual(project.objects[ceilingId].module_data.boundary_mm, room.module_data.boundary_mm)
  assert.equal(project.objects[floorId].module_data.follows_room_boundary, true)
  assert.equal(project.objects[ceilingId].module_data.follows_room_boundary, true)
})

test('room boundaries retain a step where collinear wall segments change thickness', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  for (const [start_point_mm, end_point_mm, thickness_mm] of [
    [[0, 0, 0], [2000, 0, 0], 100], [[2000, 0, 0], [4000, 0, 0], 200],
    [[4000, 0, 0], [4000, 3000, 0], 100], [[4000, 3000, 0], [0, 3000, 0], 100],
    [[0, 3000, 0], [0, 0, 0], 100],
  ]) project = run(project, 'CreateWall', {
    id: crypto.randomUUID(), mark: 'W1', start_point_mm, end_point_mm,
    thickness_mm, height_mm: 2800, level_id: 'L1',
  })
  project = run(project, 'DetectRooms', { level_id: 'L1' })
  const room = Object.values(project.objects).find(object => object.object_type === 'architecture.room')
  assert.ok(room)
  assert.ok(room.module_data.boundary_mm.some(point => point[0] === 2000 && point[1] === 50))
  assert.ok(room.module_data.boundary_mm.some(point => point[0] === 2000 && point[1] === 100))
  assert.equal(room.module_data.area_mm2, 11_212_500)
})

test('moving a shared partition preserves room identities and dependent floor/ceiling boundaries', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  const dividerId = crypto.randomUUID()
  for (const [index, [start_point_mm, end_point_mm]] of [
    [[0, 0, 0], [8000, 0, 0]], [[8000, 0, 0], [8000, 3000, 0]],
    [[8000, 3000, 0], [0, 3000, 0]], [[0, 3000, 0], [0, 0, 0]],
  ].entries()) project = run(project, 'CreateWall', {
    id: crypto.randomUUID(), mark: 'W1', start_point_mm, end_point_mm,
    thickness_mm: 100, height_mm: 2800, level_id: 'L1',
  })
  project = run(project, 'CreateWall', {
    id: dividerId, mark: 'W1', start_point_mm: [4000, 0, 0], end_point_mm: [4000, 3000, 0],
    thickness_mm: 100, height_mm: 2800, level_id: 'L1',
  })
  project = run(project, 'DetectRooms', { level_id: 'L1' })
  const roomAt = (state, side) => Object.values(state.objects).find(object => {
    if (object.object_type !== 'architecture.room') return false
    const minX = Math.min(...object.module_data.boundary_mm.map(point => point[0]))
    return side === 'left' ? minX < 4000 : minX > 4000
  })
  const leftRoom = roomAt(project, 'left'), rightRoom = roomAt(project, 'right')
  assert.ok(leftRoom && rightRoom)
  const leftFloorId = crypto.randomUUID(), rightFloorId = crypto.randomUUID()
  const leftCeilingId = crypto.randomUUID(), rightCeilingId = crypto.randomUUID()
  project = run(project, 'CreateArchitecturalFloor', { id: leftFloorId, mark: 'AF1', room_id: leftRoom.id, level_id: 'L1', thickness_mm: 50, voids_mm: [], finish_layers: [] })
  project = run(project, 'CreateArchitecturalFloor', { id: rightFloorId, mark: 'AF2', room_id: rightRoom.id, level_id: 'L1', thickness_mm: 50, voids_mm: [], finish_layers: [] })
  project = run(project, 'CreateCeiling', { id: leftCeilingId, mark: 'CL1', room_id: leftRoom.id, level_id: 'L1', elevation_mm: 2600, thickness_mm: 12, voids_mm: [], grid_mm: [600, 600] })
  project = run(project, 'CreateCeiling', { id: rightCeilingId, mark: 'CL2', room_id: rightRoom.id, level_id: 'L1', elevation_mm: 2600, thickness_mm: 12, voids_mm: [], grid_mm: [600, 600] })

  project = run(project, 'UpdateWallEndpoints', { object_id: dividerId, start_point_mm: [5000, 0], end_point_mm: [5000, 3000] })
  const movedLeft = project.objects[leftRoom.id], movedRight = project.objects[rightRoom.id]
  assert.equal(movedLeft.module_data.boundary_status, 'closed')
  assert.equal(movedRight.module_data.boundary_status, 'closed')
  assert.equal(movedLeft.module_data.area_mm2, 14_210_000)
  assert.equal(movedRight.module_data.area_mm2, 8_410_000)
  for (const [id, room] of [[leftFloorId, movedLeft], [rightFloorId, movedRight], [leftCeilingId, movedLeft], [rightCeilingId, movedRight]]) {
    assert.equal(project.objects[id].module_data.room_id, room.id)
    assert.deepEqual(project.objects[id].module_data.boundary_mm, room.module_data.boundary_mm)
    assert.equal(project.objects[id].module_data.room_boundary_status, 'closed')
  }
  assert.equal(Object.values(project.objects).filter(object => object.object_type === 'architecture.room').length, 2)
})

test('elevation-style hosted opening edits move along the host and change its vertical datum atomically', () => {
  let project=createEmptyProjectDocument(crypto.randomUUID())
  const wallId=crypto.randomUUID(),windowId=crypto.randomUUID()
  project=run(project,'CreateWall',{id:wallId,mark:'W1',start_point_mm:[0,0,0],end_point_mm:[4000,0,0],thickness_mm:100,height_mm:2800,level_id:'L1'})
  project=run(project,'CreateWindow',{id:windowId,mark:'W1',wall_id:wallId,location_mm:[1500,0,0],offset_along_wall_mm:1500,width_mm:1200,height_mm:1200,sill_height_mm:900,level_id:'L1'})
  const session=new ProjectCommandSession(project)
  const result=session.execute([
    {name:'MoveOpening',input:{object_id:windowId,offset_along_wall_mm:2200}},
    {name:'UpdateWindowDimensions',input:{object_id:windowId,width_mm:1200,height_mm:1200,sill_height_mm:1100}},
  ])
  assert.equal(result.status,'success',JSON.stringify(result.errors))
  const window=result.updatedProject.objects[windowId]
  assert.equal(window.module_data.offset_along_wall_mm,2200)
  assert.equal(window.module_data.location_mm[0],2200)
  assert.equal(window.module_data.sill_height_mm,1100)
  assert.ok(window.host_refs.includes(wallId))
  assert.equal(session.undo().objects[windowId].module_data.sill_height_mm,900)
})

test('stair width is a valid architecture property and the demo stair survives project reload', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
  project = run(project, 'CreateStair', {
    id: crypto.randomUUID(), mark: 'ST1', level_id: 'L1', stair_type: 'straight',
    structure_type: 'rc_monolithic', start_point_mm: [0, 0, 0], total_rise_mm: 3000,
    width_mm: 1000, num_risers: 17, riser_height_mm: 176.47, tread_depth_mm: 270,
    landing_depth_mm: 1000, has_handrail: true, handrail_height_mm: 900,
  })
  const reopened = deserializeProject(serializeProject(project))
  const stair = Object.values(reopened.objects).find(object => object.object_type === 'architecture.stair')
  assert.ok(stair)
  assert.equal(stair.module_data.width_mm, 1000)
})
