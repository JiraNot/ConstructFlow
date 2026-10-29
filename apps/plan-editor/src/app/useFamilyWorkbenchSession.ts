import { useState } from 'react'
import { availableFamilies, createFamilyTemplate, objectFamily } from '@constructflow/family-engine'
import { legacyTypeUuid, resolveFamilyParameters, type DoorHanding, type FamilyDefinition, type InteriorFurnitureKind, type ProjectDocument } from '@constructflow/project-model'
import type { CommandBatchResult, CommandRequest } from '@constructflow/command-schema'
import type { ToolType } from '../components/Toolbar.js'

export function useFamilyWorkbenchSession({project,selectedId,onExecute,onSelect,onTool,onViewPlan,onSetOpeningType,onFeedback}:{project:ProjectDocument;selectedId:string|null;onExecute:(commands:CommandRequest[])=>CommandBatchResult;onSelect:(id:string)=>void;onTool:(tool:ToolType)=>void;onViewPlan:()=>void;onSetOpeningType:(category:'door'|'window',name:string)=>void;onFeedback:(message:string)=>void}) {
  const [open,setOpen]=useState(false),[seed,setSeed]=useState<FamilyDefinition|undefined>(),[active,setActive]=useState<{id:string;typeId?:string;definition?:FamilyDefinition}|null>(null)
  const activeFamily=active?(availableFamilies(project).find(family=>family.id===active.id)??active.definition):undefined
  const show=(fromSelection=false)=>{
    const object=fromSelection&&selectedId?project.objects[selectedId]:undefined
    if(object){const existing=objectFamily(project,object);if(existing)setSeed(existing);else{void import('../cad/captureObjectFamily.js').then(module=>module.captureObjectFamily(project,object)).then(family=>{setSeed(family);setOpen(true)}).catch(error=>onFeedback(error instanceof Error?error.message:String(error)));return}}else setSeed(undefined)
    setOpen(true)
  }
  const place=(id:string,typeId?:string,savedFamily?:FamilyDefinition)=>{
    const family=availableFamilies(project).find(family=>family.id===id) ?? savedFamily
    if(!family)return
    if(family.category==='door'||family.category==='window'){
      const values=resolveFamilyParameters(family,typeId),objectType=family.category==='door'?'door_window.door':'door_window.window',typeUuid=legacyTypeUuid(objectType,id,typeId??'default')
      const type=project.types.find(type=>type.id===typeUuid)
      const result=onExecute([{name:type?'UpdateStructuralTypeDimensions':'DefineStructuralType',input:type?{type_id_or_name:typeUuid,object_type:objectType,parameters:{width_mm:values.W,height_mm:values.H}}:{id:typeUuid,name:family.name+(family.types.find(type=>type.id===typeId)?` · ${family.types.find(type=>type.id===typeId)!.name}`:''),object_type:objectType,parameters:{width_mm:values.W,height_mm:values.H,family_id:id,family_type_id:typeId}}}])
      if(result.status!=='success'){onFeedback(result.errors?.join(' · ')??'ตั้ง Type ไม่สำเร็จ');return}
      onSetOpeningType(family.category,type?.name??String(result.updatedProject.types.find(type=>type.id===typeUuid)?.name))
    }
    setActive({id,typeId,definition:family});onTool(family.category==='door'?'door':family.category==='window'?'window':'furniture');onViewPlan();setOpen(false);onFeedback(`เลือก ${family.name} แล้ว · แตะตำแหน่งกึ่งกลางเพื่อวาง และแตะซ้ำเพื่อวางต่อ`)
  }
  const selectCreated=(result:CommandBatchResult)=>{if(result.status!=='success'){onFeedback(result.errors?.join(' · ')??'วาง Family ไม่สำเร็จ');return}const id=result.results.flatMap(result=>result.created_object_ids??result.affected_object_ids)[0];if(id)onSelect(id)}
  const placeFurniture=(start:[number,number],end:[number,number],_kind:InteriorFurnitureKind)=>{
    if(!activeFamily||!active||activeFamily.category==='door'||activeFamily.category==='window')return false
    const level=project.levels.find(level=>level.id===project.project.active_level_id),width=Math.hypot(end[0]-start[0],end[1]-start[1]);if(!level||width<1)return true
    const overrides=activeFamily.parameters.some(parameter=>parameter.name==='W'&&parameter.scope==='instance'&&!parameter.formula)?{W:width}:{}
    selectCreated(onExecute([{name:'PlaceFamilyInstance',input:{id:crypto.randomUUID(),family_id:activeFamily.id,family_type_id:active.typeId,family_parameters:overrides,mark:activeFamily.name,location_mm:[...start,level.elevation_mm],rotation_deg:Math.atan2(end[1]-start[1],end[0]-start[0])*180/Math.PI,level_id:level.id,created_phase:project.project.active_phase}}]));return true
  }
  const placeFurnitureAt=(center:[number,number])=>{
    if(!activeFamily||!active||activeFamily.category==='door'||activeFamily.category==='window')return false
    const level=project.levels.find(level=>level.id===project.project.active_level_id)
    if(!level)return true
    const values=resolveFamilyParameters(activeFamily,active.typeId),angle=0
    // Families are authored from their lower-left local origin; translate that origin
    // so a tablet tap places the evaluated footprint around the point under the finger.
    const location:[number,number,number]=[center[0]-(values.W??0)/2,center[1]-(values.D??0)/2,level.elevation_mm]
    selectCreated(onExecute([{name:'PlaceFamilyInstance',input:{id:crypto.randomUUID(),family_id:activeFamily.id,family_type_id:active.typeId,mark:activeFamily.name,location_mm:location,rotation_deg:angle,level_id:level.id,created_phase:project.project.active_phase}}]));return true
  }
  const placeOpening=(category:'door'|'window',wallId:string,point:[number,number],offset:number,handing:DoorHanding='left_in')=>{
    if(!activeFamily||!active||activeFamily.category!==category)return false
    const values=resolveFamilyParameters(activeFamily,active.typeId),id=crypto.randomUUID(),wall=project.objects[wallId]?.module_data as Record<string,unknown>|undefined
    selectCreated(onExecute([{name:category==='door'?'CreateDoor':'CreateWindow',input:{id,type_id:legacyTypeUuid(category==='door'?'door_window.door':'door_window.window',activeFamily.id,active.typeId??'default'),mark:activeFamily.name,wall_id:wallId,level_id:wall?.level_id,location_mm:[...point,0],offset_along_wall_mm:offset,width_mm:values.W,height_mm:values.H,sill_height_mm:category==='door'?0:900,handing,phase:project.project.active_phase}}, {name:'AttachFamily',input:{object_id:id,family_id:activeFamily.id,family_type_id:active.typeId}}]));return true
  }
  return {open,show,close:()=>setOpen(false),seed,activeFamily,activeTypeId:active?.typeId,families:availableFamilies(project),place,placeFurniture,placeFurnitureAt,placeOpening,clear:()=>setActive(null)}
}
