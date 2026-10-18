import * as THREE from 'three'
import { createFamilyTemplate } from '@constructflow/family-engine'
import { buildOpeningRepresentationShapeFromObject, buildProjectRepresentations3D, getOpeningPlanLinework, getOpeningElevationLinework } from '@constructflow/representation-engine'
import { constructionOutputs } from '@constructflow/domain-providers'
import { resolveOpeningVerticalExtent, type ProjectDocument, type SmartObject, type FamilyMesh } from '@constructflow/project-model'
import { makeObjectMesh } from '../components/Model3DViewport.js'

/** Capture existing native graphics so upgrading to a Family does not erase the design. */
export function captureObjectFamily(project:ProjectDocument,object:SmartObject){
 const data=object.module_data as Record<string,unknown>,opening=object.object_type==='door_window.door'||object.object_type==='door_window.window'
 const family=createFamilyTemplate(crypto.randomUUID(),String(data.mark??'Family ใหม่'),object.object_type==='door_window.door'?'door':object.object_type==='door_window.window'?'window':object.object_type==='interior.cabinet_run'?'furniture':'generic')
 const W=Number(data.width_mm??1200),D=Number(data.depth_mm??100),H=Number(data.height_mm??750)
 family.parameters.forEach((p,i)=>p.value=[W,D,H][i]);family.paths=[];family.extrusions=[]
 let origin=(data.location_mm as [number,number,number])??[0,0,0],angle=Number(data.rotation_deg??0)*Math.PI/180,depth=D
 if(opening){
   const host=project.objects[String(data.wall_id)]?.module_data as Record<string,unknown>|undefined,a=host?.start_point_mm as number[]|undefined,b=host?.end_point_mm as number[]|undefined
   if(!a||!b)throw new Error('ช่องเปิดไม่มีผนังรองรับ')
   depth=Number(host?.thickness_mm??100);family.parameters[1].value=depth;angle=Math.atan2(b[1]-a[1],b[0]-a[0]);const offset=Number(data.offset_along_wall_mm)
   origin=[a[0]+Math.cos(angle)*(offset-W/2)+Math.sin(angle)*depth/2,a[1]+Math.sin(angle)*(offset-W/2)-Math.cos(angle)*depth/2,resolveOpeningVerticalExtent(project,object)?.base_elevation_mm??0]
   const shape=buildOpeningRepresentationShapeFromObject(project,object)
   if(shape){
     for(const [index,path]of getOpeningPlanLinework(shape,depth).entries()){
       const points=path.arc?Array.from({length:33},(_,i)=>{const arc=path.arc!,a=(arc.start_angle_deg+arc.sweep_angle_deg*i/32)*Math.PI/180;return [arc.center[0]+Math.cos(a)*arc.radius,arc.center[1]+Math.sin(a)*arc.radius]}):path.points_mm
       family.paths.push({id:`plan-${index}`,points:points.map(([x,y])=>[`W*${x/W}`,`D*${(y+depth/2)/depth}`]),closed:!!path.closed,view:'plan',layer:'สัญลักษณ์เดิม',color:'#475569',lineweight_mm:path.line_width_mm})
     }
     for(const[index,path]of getOpeningElevationLinework(shape).entries())family.paths.push({id:`front-${index}`,points:path.points_mm.map(([x,y])=>[`W*${x/W}`,`H*${y/H}`]),closed:path.closed,view:'front',layer:'รูปด้านเดิม',color:'#475569',lineweight_mm:path.line_width_mm})
   }
 }
 const local=new THREE.Matrix4().makeRotationZ(-angle).multiply(new THREE.Matrix4().makeTranslation(-origin[0],-origin[1],-origin[2]))
 if(!opening){const out=constructionOutputs(project).find(out=>out.object_id===object.id);for(const[index,path]of(out?.paths??[]).entries())family.paths.push({id:`plan-${index}`,points:path.map(point=>{const p=new THREE.Vector3(...point).applyMatrix4(local);return [`W*${p.x/W}`,`D*${p.y/depth}`]}),closed:false,view:'plan',layer:'เส้นเดิม',color:'#795548',lineweight_mm:.25})}
 const representation=buildProjectRepresentations3D(project).objects.find(rep=>rep.object_id===object.id)
 if(representation){
   const root=makeObjectMesh(representation);root.updateMatrixWorld(true)
   root.traverse(node=>{if(!(node instanceof THREE.Mesh))return;const geometry=node.geometry,positions=geometry.getAttribute('position'),index=geometry.getIndex(),material=(Array.isArray(node.material)?node.material[0]:node.material) as THREE.MeshStandardMaterial
     const vertices:[number,number,number][]=[];for(let i=0;i<positions.count;i++){const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld).multiplyScalar(1000).applyMatrix4(local);vertices.push([p.x,p.y,p.z])}
     const faces:[number,number,number][]=[];for(let i=0;i+2<(index?.count??positions.count);i+=3)faces.push([index?.getX(i)??i,index?.getX(i+1)??i+1,index?.getX(i+2)??i+2])
     const mesh:FamilyMesh={id:crypto.randomUUID(),vertices,faces,scale:[`W/${W}`,`D/${depth}`,`H/${H}`],offset:[0,0,0],reference_size_mm:[W,depth,H],color:'#'+(material.color?.getHexString()??'cbd5e1'),roughness:material.roughness??.7,metalness:material.metalness??0};family.meshes.push(mesh);geometry.dispose();material.dispose()
   })
 }
 family.source={filename:String(data.mark??object.id),format:'ConstructFlow native',skipped_entities:0,...(object.object_type==='door_window.door'?{door_handing:data.handing as 'left_in'|'left_out'|'right_in'|'right_out'}:{}),notes:['แปลงกราฟิกเดิมเป็น Family โดยคง UUID ของ Instance; Mesh ปรับตาม W/D/H และเพิ่ม Extrusion กับสูตรใหม่ได้']}
 return family
}
