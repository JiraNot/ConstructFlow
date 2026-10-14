import test from 'node:test'
import assert from 'node:assert/strict'
import { polygonUnionBoundary, segmentOutsidePolygons } from '../dist/index.js'
const rectangle = (x0, y0, x1, y1) => [[x0,y0],[x1,y0],[x1,y1],[x0,y1]]
const length = edges => edges.reduce((s,[a,b]) => s + Math.hypot(a[0]-b[0],a[1]-b[1]),0)
test('union removes coplanar seams, duplicate faces and partial shared edges', () => {
  const edges = polygonUnionBoundary([rectangle(0,0,1000,1000),rectangle(1000,0,2000,500),rectangle(0,0,1000,1000)])
  assert.equal(length(edges),6000)
  assert.ok(!edges.some(([a,b]) => a[0] === 1000 && b[0] === 1000 && Math.max(a[1],b[1]) <= 500))
})
test('union preserves opening loops and a line is clipped against a projecting column', () => {
  const edges = polygonUnionBoundary([rectangle(0,0,100,300),rectangle(200,0,300,300),rectangle(100,0,200,100),rectangle(100,200,200,300)])
  assert.equal(length(edges),1600)
  assert.deepEqual(segmentOutsidePolygons([[0,50],[300,50]], [rectangle(100,0,200,100)]), [[[0,50],[100,50]],[[200,50],[300,50]]])
})
test('union preserves independent boundaries in a large sparse model', () => {
  const count = 4780
  const polygons = Array.from({ length: count }, (_, index) => rectangle(index * 1200, 0, index * 1200 + 1000, 3000))
  const edges = polygonUnionBoundary(polygons)
  assert.equal(edges.length, count * 4)
  assert.equal(length(edges), count * 8000)
})
