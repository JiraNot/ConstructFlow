import test from 'node:test'
import assert from 'node:assert/strict'
import { importDxfDrawing, importDxfUnderlay } from '../src/cad/importDxfUnderlay.mjs'
import { dwgDatabaseToDxf } from '../src/cad/dwgDatabaseToDxf.mjs'
const dxf=entities=>`0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}\n0\nENDSEC\n0\nEOF\n`
test('CAD model entities stay editable with layers, lineweights, colors and text',()=>{
 const source=dxf('0\nLINE\n8\nA-FURN\n420\n16711680\n370\n35\n10\n100\n20\n200\n11\n900\n21\n700\n0\nTEXT\n8\nA-NOTE\n10\n0\n20\n0\n40\n100\n1\nChair')
 const drawing=importDxfDrawing(source)
 assert.equal(drawing.paths.length,2);assert.equal(drawing.paths[0].layer,'A-FURN');assert.equal(drawing.paths[0].color,'#ff0000');assert.equal(drawing.paths[0].lineweight_mm,.35);assert.deepEqual(drawing.paths[0].points,[[100,200],[900,700]])
 assert.equal(drawing.paths[1].text,'Chair');assert.equal(importDxfUnderlay(source).imported_entities,1)
 assert.deepEqual(importDxfDrawing(source,{unitScaleMm:10}).paths[0].points,[[1000,2000],[9000,7000]])
})
test('decoded DWG blocks and curves take the same native edit path as DXF',()=>{
 const database={header:{INSUNITS:4},tables:{BLOCK_RECORD:{entries:[{name:'Seat',basePoint:{x:0,y:0},entities:[{type:'LINE',layer:'FURN',startPoint:{x:0,y:0},endPoint:{x:500,y:0}}]}]}},entities:[{type:'INSERT',name:'Seat',insertionPoint:{x:100,y:200},xScale:2,yScale:1,rotation:0,columnCount:1,rowCount:1},{type:'CIRCLE',layer:'A-FURN',center:{x:0,y:0},radius:100},{type:'UNSUPPORTED'}]}
 const converted=dwgDatabaseToDxf(database),drawing=importDxfDrawing(converted.dxf)
 assert.equal(converted.skipped,1);assert.equal(drawing.paths.length,2);assert.deepEqual(drawing.paths[0].points,[[100,200],[1100,200]]);assert.equal(drawing.paths[1].closed,true)
})
test('HATCH inner boundaries remain true editable voids instead of being filled',()=>{
 const loop=(points)=>`92\n2\n72\n0\n73\n1\n93\n${points.length}\n`+points.map(([x,y])=>`10\n${x}\n20\n${y}\n`).join('')
 const source=dxf('0\nHATCH\n8\nA-HATCH\n2\nSOLID\n70\n1\n91\n2\n'+loop([[0,0],[100,0],[100,100],[0,100]])+loop([[20,20],[40,20],[40,40],[20,40]])+'75\n0\n76\n1')
 const result=importDxfDrawing(source);assert.equal(result.paths.length,1);assert.deepEqual(result.paths[0].voids,[[[20,20],[40,20],[40,40],[20,40]]])
})
test('edited solid hatch exports and reopens with its voids intact',async()=>{
 const {createFamilyTemplate,exportFamilyDxf}=await import('@constructflow/family-engine')
 const family=createFamilyTemplate(crypto.randomUUID()),path=family.paths[0]
 path.voids=[[[100,100],[200,100],[200,200],[100,200]]]
 path.hatch={pattern:'solid',spacing_mm:100,rotation_deg:0,color:'#aabbcc'}
 const hatch=importDxfDrawing(exportFamilyDxf(family)).paths.find(p=>p.hatch?.pattern==='solid')
 assert.deepEqual(hatch.voids,path.voids)
})
test('CAD hatch definition lines retain origin, dash spacing and block transforms',()=>{
 const loop='92\n2\n72\n0\n73\n1\n93\n4\n10\n0\n20\n0\n10\n500\n20\n0\n10\n500\n20\n500\n10\n0\n20\n500\n97\n0\n'
 const hatch='0\nHATCH\n8\nA-HATCH\n2\nCUSTOM\n70\n0\n91\n1\n'+loop+'75\n0\n76\n1\n52\n30\n41\n2\n78\n1\n53\n45\n43\n10\n44\n20\n45\n-100\n46\n100\n79\n2\n49\n50\n49\n-25\n98\n0'
 const pattern=importDxfDrawing(dxf(hatch)).paths[0].hatch
 assert.equal(pattern.pattern,'custom');assert.equal(pattern.rotation_deg,0);assert.equal(pattern.lines[0].angle_deg,45);assert.deepEqual(pattern.lines[0].base_mm,[10,20]);assert.deepEqual(pattern.lines[0].dashes_mm,[50,-25])
 const block=`0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nH\n10\n0\n20\n0\n${hatch}\n0\nENDBLK\n0\nENDSEC\n`
 const source=dxf('0\nINSERT\n2\nH\n10\n1000\n20\n2000\n41\n2\n42\n2\n50\n90').replace('0\nSECTION\n2\nENTITIES',block+'0\nSECTION\n2\nENTITIES')
 const transformed=importDxfDrawing(source).paths[0].hatch.lines[0]
 assert.ok(Math.abs(transformed.angle_deg-135)<1e-6);assert.deepEqual(transformed.base_mm,[960,2020]);assert.deepEqual(transformed.offset_mm.map(Math.round),[-200,-200]);assert.deepEqual(transformed.dashes_mm,[100,-50])
})
