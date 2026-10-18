import {test,expect,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {createEmptyProjectDocument,serializeProject} from '@constructflow/project-model'
import {CommandBus} from '@constructflow/command-runtime'
import {createFamilyTemplate} from '@constructflow/family-engine'
import {importDxfDrawing} from '../src/cad/importDxfUnderlay.mjs'
async function stored(page:Page){return page.evaluate(()=>new Promise<any>((resolve,reject)=>{const req=indexedDB.open('constructflow-local-projects',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,read=db.transaction('snapshots').objectStore('snapshots').get('active-project');read.onsuccess=()=>{db.close();resolve(read.result?.projectJson?JSON.parse(read.result.projectJson):null)}}}))}
async function start(page:Page){page.on('dialog',dialog=>dialog.accept());await page.goto('/');await page.locator('#cfproj-open').setInputFiles({name:'family.cfproj',mimeType:'application/json',buffer:Buffer.from(serializeProject(createEmptyProjectDocument(randomUUID(),'Family acceptance')))});await page.getByRole('button',{name:'▱ Family / CAD',exact:true}).click();return page.getByRole('dialog',{name:'คลังและตัวแก้ไข Family'})}
test.use({viewport:{width:1440,height:960}})

test('author one parametric 2D/3D family, import PAT, place, undo and reopen',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 const dialog=await start(page)
 await dialog.getByRole('button',{name:'+ สร้าง Family',exact:true}).click()
 await dialog.getByLabel('ชื่อ Family',{exact:true}).fill('โต๊ะของฉัน')
 await dialog.getByRole('button',{name:'แปลน',exact:true}).click()
 await dialog.getByRole('button',{name:'สี่เหลี่ยม',exact:true}).click()
 const editor=dialog.getByLabel('เขียนและแก้เส้น Family'),bounds=(await editor.boundingBox())!
 await editor.click({position:{x:bounds.width*.3,y:bounds.height*.25}});await page.keyboard.press('Escape');await expect(dialog).toBeVisible()
 await editor.click({position:{x:bounds.width*.3,y:bounds.height*.25}});await editor.click({position:{x:bounds.width*.55,y:bounds.height*.5}})
 await dialog.getByRole('button',{name:'+ Extrusion จากเส้นปิดที่เลือก',exact:true}).click()
 await dialog.getByLabel('เลือกชิ้นส่วน Family').selectOption('outline')
 await dialog.locator('input[accept=".pat,text/plain"]').setInputFiles({name:'custom.pat',mimeType:'text/plain',buffer:Buffer.from('*CUSTOM,Pattern\n0,0,0,0,150\n90,0,0,150,300,150,-150\n')})
 await expect(dialog.getByLabel('ลาย Hatch ของเส้นปิด')).toHaveValue('custom')
 await dialog.getByRole('button',{name:'พารามิเตอร์',exact:true}).click()
 await dialog.getByLabel('ค่าเริ่มต้น W',{exact:true}).fill('1.8')
 await dialog.getByRole('button',{name:'บันทึกและวาง',exact:true}).click();await expect(dialog).not.toBeVisible()
 await expect.poll(async()=>{const p=await stored(page);return p?.families?.find((f:any)=>f.name==='โต๊ะของฉัน')?.parameters[0].value}).toBe(1800)
 const canvas=page.locator('.cf-plan-canvas').first(),box=(await canvas.boundingBox())!
 await canvas.click({position:{x:box.width*.3,y:box.height*.35}});await canvas.click({position:{x:box.width*.55,y:box.height*.35}})
 await expect.poll(async()=>Object.values((await stored(page))?.objects??{}).filter((o:any)=>o.object_type==='family.instance').length).toBe(1)
 const before=await stored(page),instance:any=Object.values(before.objects).find((o:any)=>o.object_type==='family.instance')
 expect(instance.module_data.family_id).toBe(before.families.find((f:any)=>f.name==='โต๊ะของฉัน').id)
 await page.getByRole('button',{name:'ย้อนกลับ',exact:true}).click()
 await expect.poll(async()=>Object.values((await stored(page))?.objects??{}).filter((o:any)=>o.object_type==='family.instance').length).toBe(0)
 await page.getByRole('button',{name:'ทำซ้ำ',exact:true}).click()
 await expect.poll(async()=>!!(await stored(page))?.objects[instance.id]).toBe(true)
 await page.reload();await expect.poll(async()=>!!(await stored(page))?.objects[instance.id]).toBe(true)
 await page.getByRole('button',{name:'▱ Family / CAD',exact:true}).click()
 await page.getByRole('dialog').getByRole('button',{name:/โต๊ะของฉัน.*โมเดลทั่วไป/}).click()
 await page.getByRole('dialog').getByRole('button',{name:'2D + 3D',exact:true}).click()
 await page.screenshot({path:info.outputPath('family-studio.png'),fullPage:true})
 expect(errors).toEqual([])
})

test('open real DWG as editable vectors, modify layer, export DXF and attach 3D',async({page},info)=>{
 const dialog=await start(page)
 await dialog.locator('input[accept=".dwg,.dxf"]').setInputFiles('e2e/fixtures/libredwg-sample-2000.dwg')
 await expect(dialog.getByLabel('ชื่อ Family',{exact:true})).toHaveValue('libredwg-sample-2000',{timeout:30000})
 await dialog.getByLabel('เลือกชิ้นส่วน Family').selectOption('cad-0')
 await dialog.locator('.cf-family-inspector').getByLabel('Layer',{exact:true}).fill('A-CUSTOM')
 const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'ส่งออก DXF ที่แก้แล้ว',exact:true}).click();const download=await pending
 const source=await readFile((await download.path())!,'utf8'),drawing=importDxfDrawing(source)
 expect(drawing.paths.some(path=>path.layer==='A-CUSTOM')).toBe(true)
 const obj='v 0 0 0\nv 1000 0 0\nv 1000 600 0\nv 0 600 0\nv 0 0 800\nv 1000 0 800\nv 1000 600 800\nv 0 600 800\nf 1 3 2\nf 1 4 3\nf 5 6 7\nf 5 7 8\nf 1 2 6\nf 1 6 5\nf 2 3 7\nf 2 7 6\nf 3 4 8\nf 3 8 7\nf 4 1 5\nf 4 5 8\n'
 await dialog.locator('input[accept=".glb,.obj"]').setInputFiles({name:'model.obj',mimeType:'text/plain',buffer:Buffer.from(obj)})
 await expect(dialog.getByText(/Mesh · 12/)).toBeVisible()
 await dialog.getByRole('button',{name:'บันทึก Family',exact:true}).click()
 await expect.poll(async()=>{const f=(await stored(page))?.families?.find((f:any)=>f.name==='libredwg-sample-2000');return f?.paths.length===6&&f?.meshes.length>0}).toBe(true)
 await page.screenshot({path:info.outputPath('cad-and-3d.png'),fullPage:true})
})

test('Family editor fits mobile screen, scrolls and returns focus on Escape',async({page},info)=>{
 await page.setViewportSize({width:390,height:844})
 const dialog=await start(page)
 await expect(dialog).toBeVisible()
 expect(await dialog.evaluate(element=>element.scrollWidth)).toBeLessThanOrEqual(390)
 await dialog.getByRole('button',{name:'พารามิเตอร์',exact:true}).click();await expect(dialog.getByLabel('ชื่อพารามิเตอร์ 1')).toBeVisible()
 await page.screenshot({path:info.outputPath('family-mobile.png'),fullPage:true})
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:'▱ Family / CAD',exact:true})).toBeFocused()
})

test('portable GLB keeps texture and UVs while attaching editable CAD to the same family',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 const dialog=await start(page);await dialog.getByRole('button',{name:'+ สร้าง Family',exact:true}).click();await dialog.getByLabel('ชื่อ Family',{exact:true}).fill('Textured asset')
 const png=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=2;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#d97706';ctx.fillRect(0,0,2,2);return Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0))}))
 const positions=Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,1]).buffer),uvs=Buffer.from(new Float32Array([0,0,1,0,0,1]).buffer),indices=Buffer.from(new Uint16Array([0,1,2]).buffer),padding=(4-indices.length%4)%4
 const imageOffset=positions.length+uvs.length+indices.length+padding,binaryRaw=Buffer.concat([positions,uvs,indices,Buffer.alloc(padding),png]),binary=Buffer.concat([binaryRaw,Buffer.alloc((4-binaryRaw.length%4)%4)])
 const document={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'door-leaf',mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},indices:2,material:0}]}],buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.length},{buffer:0,byteOffset:positions.length,byteLength:uvs.length},{buffer:0,byteOffset:positions.length+uvs.length,byteLength:indices.length},{buffer:0,byteOffset:imageOffset,byteLength:png.length}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,1]},{bufferView:1,componentType:5126,count:3,type:'VEC2'},{bufferView:2,componentType:5123,count:3,type:'SCALAR'}],images:[{bufferView:3,mimeType:'image/png'}],textures:[{source:0}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:.8}}]}
 let json=Buffer.from(JSON.stringify(document));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4)
 await dialog.locator('input[accept=".glb,.obj"]').setInputFiles({name:'asset.glb',mimeType:'model/gltf-binary',buffer:Buffer.concat([header,json,binHeader,binary])})
 await expect(dialog.getByText(/Mesh · 1 หน้า/)).toBeVisible()
 await dialog.locator('summary').filter({hasText:'วิธีเตรียมโมเดล'}).click()
 await expect(dialog.getByText(/แกนโมเดล.*แดง X = กว้าง/)).toBeVisible()
 await expect(dialog.getByRole('status').filter({hasText:'พบ Mesh เดียว'})).toBeVisible()
 await dialog.locator('summary').filter({hasText:'วิธีเตรียมโมเดล'}).click()
 await dialog.locator('summary').filter({hasText:'Mesh · 1 หน้า'}).click()
 await expect(dialog.locator('summary').filter({hasText:'door-leaf'})).toBeVisible()
 await dialog.getByLabel('ชื่อชิ้นส่วน Mesh').fill('บานประตู')
 await dialog.getByLabel('Mesh X scale formula').fill('1')
 await dialog.getByLabel('Mesh X offset formula').fill('W-1000')
 await dialog.locator('summary').filter({hasText:'การปรับขนาดและลวดลาย'}).click()
 await dialog.getByLabel('บานประตู X การปรับขนาด').selectOption('repeat')
 await dialog.getByLabel('บานประตู X ช่องไฟซ้ำ').fill('120')
 const chooser=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:'แนบ CAD ให้ Family',exact:true}).click();await(await chooser).setFiles({name:'plan.dxf',mimeType:'application/dxf',buffer:Buffer.from('0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nCUSTOM-SYMBOL\n10\n0\n20\n0\n11\n1000\n21\n1000\n0\nENDSEC\n0\nEOF\n')})
 await expect(dialog.getByLabel('เลือกชิ้นส่วน Family')).toContainText('CUSTOM-SYMBOL')
 await dialog.getByRole('button',{name:'บันทึก Family',exact:true}).click()
 await expect.poll(async()=>{const family=(await stored(page))?.families?.find((f:any)=>f.name==='Textured asset');return !!family?.meshes[0]?.texture_data_url&&family?.meshes[0]?.uvs.length===3&&family.meshes[0].name==='บานประตู'&&family.meshes[0].scale[0]==='1'&&family.meshes[0].offset[0]==='W-1000'&&family.meshes[0].reference_size_mm?.length===3&&family.meshes[0].resize_behavior?.[0]==='repeat'&&family.meshes[0].repeat_spacing_mm?.[0]===120&&family?.paths.some((p:any)=>p.layer==='CUSTOM-SYMBOL'&&typeof p.points[1][0]==='string')}).toBe(true)
 expect(errors).toEqual([])
})


test('Family parameters and selection stay linked between plan and elevation',async({page},info)=>{
 const family=createFamilyTemplate(randomUUID(),'โต๊ะปรับขนาด','furniture'),id=randomUUID()
 family.paths.push({id:'front',view:'front',closed:true,points:[[0,0],['W',0],['W','H'],[0,'H']],layer:'ด้านหน้า',color:'#475569',lineweight_mm:.25})
 let project=createEmptyProjectDocument(randomUUID(),'Cross view Family')
 for(const command of [{name:'SaveFamily',input:{family}},{name:'PlaceFamilyInstance',input:{id,family_id:family.id,mark:'โต๊ะหนึ่ง',location_mm:[0,0,0],rotation_deg:0}}]){
  const result=CommandBus.execute(project,command.name,command.input);expect(result.result.status).toBe('success');project=result.updatedProject
 }
 page.on('dialog',dialog=>dialog.accept());await page.goto('/')
 await page.locator('#cfproj-open').setInputFiles({name:'cross-view.cfproj',mimeType:'application/json',buffer:Buffer.from(serializeProject(project))})
 const plan=page.locator('.cf-plan-canvas').first()
 const point=await plan.evaluate(element=>({x:Number(element.getAttribute('data-viewport-pan-x'))+500*Number(element.getAttribute('data-viewport-zoom')),y:Number(element.getAttribute('data-viewport-pan-y'))+250*Number(element.getAttribute('data-viewport-zoom'))}))
 await page.keyboard.press('s');await plan.locator('canvas').first().click({position:point})
 await expect(page.getByTestId('properties-selection')).toHaveAttribute('data-object-id',id)
 await page.getByLabel('Family W',{exact:true}).fill('1.8')
 await expect.poll(async()=>Number((await stored(page))?.objects[id]?.module_data.family_parameters.W)).toBe(1800)
 await page.locator('.cf-current-view').click();await page.getByRole('button',{name:'รูปด้านเหนือ',exact:true}).click()
 const elevation=page.getByTestId('elevation-canvas');await expect(elevation).toHaveAttribute('data-elevation-direction','north')
 await expect.poll(async()=>elevation.locator('canvas').evaluate(canvas=>{const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]===2&&pixels[i+1]===132&&pixels[i+2]===199)count++;return count})).toBeGreaterThan(50)
 await page.screenshot({path:info.outputPath('family-elevation.png'),fullPage:true})
 await page.getByRole('button',{name:'ย้อนกลับ',exact:true}).click();await expect.poll(async()=>Number((await stored(page))?.objects[id]?.module_data.width_mm)).toBe(family.parameters[0].value)
 await page.getByRole('button',{name:'ทำซ้ำ',exact:true}).click();await expect.poll(async()=>Number((await stored(page))?.objects[id]?.module_data.width_mm)).toBe(1800)
 await page.reload();await expect.poll(async()=>Number((await stored(page))?.objects[id]?.module_data.width_mm)).toBe(1800)
})

test('capture an existing door as a Family and place another hosted instance without replacing UUIDs',async({page})=>{
 test.setTimeout(60000)
 const wallId=randomUUID(),doorId=randomUUID()
 let project=createEmptyProjectDocument(randomUUID(),'Hosted Family')
 for(const command of [{name:'CreateWall',input:{id:wallId,mark:'W1',start_point_mm:[0,0],end_point_mm:[5000,0],thickness_mm:100,height_mm:2800}},{name:'CreateDoor',input:{id:doorId,mark:'D1',wall_id:wallId,location_mm:[1500,0,0],offset_along_wall_mm:1500,width_mm:900,height_mm:2100,handing:'right_out'}}]){
  const result=CommandBus.execute(project,command.name,command.input);expect(result.result.status).toBe('success');project=result.updatedProject
 }
 page.on('dialog',dialog=>dialog.accept());await page.goto('/')
 await page.locator('#cfproj-open').setInputFiles({name:'hosted.cfproj',mimeType:'application/json',buffer:Buffer.from(serializeProject(project))})
 await page.getByRole('tab',{name:'โครงการ',exact:true}).click();await page.getByRole('tab',{name:'รายการ',exact:true}).click()
 await page.locator(`li[data-object-id="${doorId}"] .cf-browser-object`).click()
 await page.getByRole('tab',{name:'แก้ไข',exact:true}).click()
 await page.getByRole('button',{name:'สร้าง Family จากวัตถุ',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'คลังและตัวแก้ไข Family'})
 await dialog.getByLabel('ชื่อ Family',{exact:true}).fill('ประตูส่วนตัว')
 await dialog.getByRole('button',{name:'ใช้กับที่เลือก',exact:true}).click()
 await expect.poll(async()=>!!(await stored(page))?.objects[doorId]?.module_data.family_id).toBe(true)
 const familyId=(await stored(page)).objects[doorId].module_data.family_id
 expect((await stored(page)).families.find((f:any)=>f.id===familyId).source.door_handing).toBe('right_out')
 await dialog.getByRole('button',{name:'บันทึกและวาง',exact:true}).click();await expect(dialog).not.toBeVisible()
 const plan=page.locator('.cf-plan-canvas').first(),point=await plan.evaluate(element=>({x:Number(element.getAttribute('data-viewport-pan-x'))+3500*Number(element.getAttribute('data-viewport-zoom')),y:Number(element.getAttribute('data-viewport-pan-y'))}))
 await plan.locator('canvas').first().click({position:point})
 const doors=async()=>Object.values((await stored(page))?.objects??{}).filter((o:any)=>o.object_type==='door_window.door') as any[]
 await expect.poll(async()=>(await doors()).length).toBe(2)
 const placed=(await doors()).find(o=>o.id!==doorId)
 expect(placed.module_data.family_id).toBe(familyId);expect(placed.host_refs).toEqual([wallId])
 await page.getByRole('button',{name:'ย้อนกลับ',exact:true}).click();await expect.poll(async()=>(await doors()).length).toBe(1)
 expect((await doors())[0].id).toBe(doorId)
 await page.getByRole('button',{name:'ทำซ้ำ',exact:true}).click();await expect.poll(async()=>(await doors()).some(o=>o.id===placed.id)).toBe(true)
 await page.reload();await expect.poll(async()=>(await doors()).some(o=>o.id===doorId&&o.module_data.family_id===familyId)).toBe(true)
})
