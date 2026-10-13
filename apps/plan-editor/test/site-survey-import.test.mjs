import test from 'node:test'
import assert from 'node:assert/strict'
import { importSiteSurveyCsv } from '../src/cad/importSiteSurveyCsv.mjs'

const header = 'id,name,x,y,elevation,source_status,source_reference,boundary_id,boundary_name,units,coordinate_system'

test('site survey CSV imports units, elevations, boundary order, and measured/assumed provenance', () => {
  const survey = importSiteSurveyCsv([
    header,
    'P1,"North, west",0,0,1.2,measured,"Survey crew · station A",LOT-1,Parcel,m,local-grid-01',
    'P2,North east,10,0,1.25,measured,"Survey crew · station B",LOT-1,Parcel,m,local-grid-01',
    'P3,South east,10,8,,assumed,"Deed sketch estimate",LOT-1,Parcel,m,local-grid-01',
  ].join('\n'), { fileName: 'lot.csv', id: 'survey-1', importedAt: '2026-10-14T00:00:00.000Z' })

  assert.equal(survey.name, 'lot')
  assert.equal(survey.coordinate_system, 'local-grid-01')
  assert.deepEqual(survey.points.map(point => [point.x_mm, point.y_mm]), [[0, 0], [10000, 0], [10000, 8000]])
  assert.equal(survey.points[0].name, 'North, west')
  assert.equal(survey.points[0].elevation_mm, 1200)
  assert.equal(survey.points[2].elevation_mm, undefined)
  assert.deepEqual(survey.boundaries[0].point_ids, ['P1', 'P2', 'P3'])
  assert.deepEqual(survey.points.map(point => point.source_status), ['measured', 'measured', 'assumed'])
})

test('site survey CSV requires explicit units, coordinate system, and source references', () => {
  assert.throws(() => importSiteSurveyCsv([header, 'P1,A,1,2,,measured,source,, ,yd,local'].join('\n')), /units must be mm, cm, or m/)
  assert.throws(() => importSiteSurveyCsv([header, 'P1,A,1,2,,measured,,, ,m,local'].join('\n')), /source_reference is required/)
  assert.throws(() => importSiteSurveyCsv([header, 'P1,A,1,2,,estimated,source,, ,m,local'].join('\n')), /source_status must be measured or assumed/)
  assert.throws(() => importSiteSurveyCsv([header, 'P1,A,,2,,measured,source,,,m,local'].join('\n')), /x and y must be finite numbers/)
})
