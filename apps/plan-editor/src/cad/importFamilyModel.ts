import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import type { FamilyDefinition, FamilyMesh } from '@constructflow/project-model'

/** Flatten a portable model into editable, parameter-bound family mesh parts. */
export async function importFamilyModel(file: File, family: FamilyDefinition, unitScaleMm?: number): Promise<FamilyDefinition> {
  if (!file.size || file.size > 50*1024*1024) throw new Error('โมเดลต้องมีขนาดไม่เกิน 50 MB')
  const manager = new THREE.LoadingManager()
  const failedResources: string[] = []
  manager.onError = url => failedResources.push(url)
  manager.setURLModifier(url => { if (!url.startsWith('data:') && !url.startsWith('blob:')) throw new Error('กรุณาฝัง texture ใน GLB ก่อนนำเข้า'); return url })
  const isGlb=/\.glb$/i.test(file.name), scale=unitScaleMm ?? (isGlb?1000:1)
  let root: THREE.Object3D
  if(isGlb) root=(await new GLTFLoader(manager).parseAsync(await file.arrayBuffer(), '')).scene
  else if(/\.obj$/i.test(file.name)) root=new OBJLoader(manager).parse(await file.text())
  else throw new Error('เลือกโมเดล GLB หรือ OBJ หรือใช้คำสั่งส่งออก Family ใน SketchUp')
  if (failedResources.length) throw new Error('อ่าน texture ของโมเดลไม่สำเร็จ กรุณาฝังรูปใน GLB และลองใหม่')
  root.updateMatrixWorld(true)
  const parts: FamilyMesh[]=[], bounds=new THREE.Box3(), point=new THREE.Vector3()
  let count=0
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return
    const geometry=object.geometry,positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),indices=geometry.getIndex(),materials=Array.isArray(object.material)?object.material:[object.material]
    if(!positions)return
    count+=positions.count
    if(count>300000)throw new Error('โมเดลเกิน 300,000 จุด กรุณาลดจำนวน polygon')
    const vertices: [number,number,number][]=[],uvs:[number,number][]=[]
    for(let index=0;index<positions.count;index++){
      point.fromBufferAttribute(positions,index).applyMatrix4(object.matrixWorld)
      const v:[number,number,number]=isGlb?[point.x*scale,-point.z*scale,point.y*scale]:[point.x*scale,point.y*scale,point.z*scale]
      vertices.push(v);bounds.expandByPoint(new THREE.Vector3(...v));if(uv)uvs.push([uv.getX(index),uv.getY(index)])
    }
    const groups=geometry.groups.length?geometry.groups:[{start:0,count:indices?.count??positions.count,materialIndex:0}]
    for(const group of groups){
      const material=materials[group.materialIndex??0] as THREE.MeshStandardMaterial
      const faces:[number,number,number][]=[]
      for(let cursor=group.start;cursor+2<group.start+group.count;cursor+=3)faces.push([indices?.getX(cursor)??cursor,indices?.getX(cursor+1)??cursor+1,indices?.getX(cursor+2)??cursor+2])
      let texture_data_url:string|undefined
      if(material.map?.image){const source=material.map.image as CanvasImageSource & {width:number;height:number};const canvas=document.createElement('canvas');const factor=Math.min(1,2048/Math.max(source.width,source.height));canvas.width=source.width*factor;canvas.height=source.height*factor;canvas.getContext('2d')?.drawImage(source,0,0,canvas.width,canvas.height);texture_data_url=canvas.toDataURL('image/png')}
      const name=[object.name,material.name].filter(Boolean).join(' · ').slice(0,120)
      parts.push({id:crypto.randomUUID(),...(name?{name}:{}),vertices,faces,scale:[1,1,1],offset:[0,0,0],color:'#'+(material.color?.getHexString()??'cbd5e1'),...(uvs.length?{uvs}:{}),...(texture_data_url?{texture_data_url}:{}),roughness:material.roughness??.7,metalness:material.metalness??0})
    }
  })
  if(!parts.length)throw new Error('โมเดลไม่มี Mesh')
  const size=bounds.getSize(new THREE.Vector3())
  if(Math.min(size.x,size.y,size.z)<.001)throw new Error('โมเดลต้องมีขนาดครบทั้งสามแกน')
  for(const part of parts){part.vertices=part.vertices.map(([x,y,z])=>[x-bounds.min.x,y-bounds.min.y,z-bounds.min.z]);part.scale=[`W/${size.x}`,`D/${size.y}`,`H/${size.z}`];part.reference_size_mm=[size.x,size.y,size.z]}
  const next=structuredClone(family);next.meshes=parts;next.extrusions=[]
  for(const [name,value]of [['W',size.x],['D',size.y],['H',size.z]] as const){const parameter=next.parameters.find(parameter=>parameter.name===name);if(parameter)parameter.value=value}
  for(const type of next.types)for(const name of ['W','D','H'])delete type.values[name]
  next.source={filename:file.name,format:isGlb?'GLB':'OBJ',skipped_entities:0,notes:['โมเดลที่นำเข้าเป็น Mesh; ผูกสเกลกับ W/D/H และสร้าง Extrusion เพิ่มได้']}
  root.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose()}})
  return next
}
