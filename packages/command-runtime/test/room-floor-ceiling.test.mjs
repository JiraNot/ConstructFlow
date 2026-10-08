import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyProjectDocument, deserializeProject, serializeProject } from '@constructflow/project-model'
import { CommandBus, ProjectCommandSession } from '../dist/index.js'

const run = (project, name, input) => {
  const result = CommandBus.execute(project, name, input)
  assert.equal(result.result.status, 'success', JSON.stringify(result.result))
  return result.updatedProject
}

test('wall loop detection, room-based floor tracking and manual detachment', () => {
  let project = createEmptyProjectDocument(crypto.randomUUID())
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
  assert.equal(room.module_data.area_mm2,12_000_000)
  project = run(project,'CreateArchitecturalFloor',{id:crypto.randomUUID(),mark:'AF1',room_id:room.id,level_id:'L1',elevation_mm:0,elevation_offset_mm:0,thickness_mm:50,voids_mm:[],finish_layers:[]})
  let floor=Object.values(project.objects).find(object=>object.object_type==='architecture.floor')
  assert.equal(floor.module_data.follows_room_boundary,true)
  const changedBoundary=[[0,0],[5000,0],[5000,3000],[0,3000]]
  project=run(project,'UpdateRoom',{...room.module_data,id:room.id,boundary_mm:changedBoundary})
  floor=project.objects[floor.id]
  assert.deepEqual(floor.module_data.boundary_mm,changedBoundary)
  const manualBoundary=[[0,0],[4500,0],[4500,2800],[0,2800]]
  project=run(project,'UpdateArchitecturalFloor',{...floor.module_data,id:floor.id,boundary_mm:manualBoundary})
  assert.equal(project.objects[floor.id].module_data.follows_room_boundary,false)
  project=run(project,'UpdateRoom',{...project.objects[room.id].module_data,id:room.id,boundary_mm:[[0,0],[6000,0],[6000,3000],[0,3000]]})
  assert.deepEqual(project.objects[floor.id].module_data.boundary_mm,manualBoundary)
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
