import React from 'react'
import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'
import { objectFamily } from '@constructflow/family-engine'
import { resolveFamilyParameters, type ProjectDocument, type SmartObject } from '@constructflow/project-model'
export function FamilyInstanceProperties({project,object,onEdit,onUpdate}:{project:ProjectDocument;object:SmartObject;onEdit?:()=>void;onUpdate?:(changes:Record<string,unknown>)=>void}){
  const family=objectFamily(project,object),data=object.module_data as Record<string,unknown>
  if(!family)return <button className="cf-button" onClick={onEdit}>สร้าง Family จากวัตถุ</button>
  const overrides={...(data.family_parameters as Record<string,number>??{})}
  if(!data.family_id&&object.object_type==='interior.furniture')Object.assign(overrides,{W:data.width_mm,D:data.depth_mm,H:data.height_mm})
  let values:Record<string,number>={}
  try{values=resolveFamilyParameters(family,data.family_type_id as string|undefined,overrides)}catch{}
  const update=(changes:Record<string,unknown>)=>onUpdate?.({...changes,family_id:family.id})
  return <section style={{display:'grid',gap:7,padding:9,border:'1px solid #cbddeb',borderRadius:5}} aria-label="คุณสมบัติ Family"><strong>{family.name} · Family</strong>
    <label className="cf-property-row">Type<select value={data.family_type_id as string??family.types[0]?.id??''} onChange={event=>update({family_type_id:event.target.value,family_parameters:{}})}>{family.types.map(type=><option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
    {family.parameters.map(parameter=><label className="cf-property-row" key={parameter.name} title={parameter.formula??parameter.name}>{parameter.label}<WorkbenchNumberInput ariaLabel={`Family ${parameter.name}`} unit={['W','D','H'].includes(parameter.name)?'m':undefined} disabled={parameter.scope==='type'||!!parameter.formula?.trim()} value={values[parameter.name]??parameter.value} onChange={value=>update({family_parameters:{...overrides,[parameter.name]:value}})}/><small>{parameter.scope==='type'?'Type':parameter.formula?'สูตร':['W','D','H'].includes(parameter.name)?'m':''}</small></label>)}
    <label className="cf-property-row">หมุน °<input aria-label="หมุน Family" type="number" value={Number(data.rotation_deg??0)} disabled={object.object_type==='door_window.door'||object.object_type==='door_window.window'} onChange={e=>update({rotation_deg:Number(e.target.value)})}/></label>
    {!['door_window.door','door_window.window'].includes(object.object_type)&&(['X','Y','Z'] as const).map((axis,index)=><label className="cf-property-row" key={axis}>{axis} (m)<WorkbenchNumberInput unit="m" value={Number((data.location_mm as number[]|undefined)?.[index]??0)} onChange={value=>{const location=[...(data.location_mm as number[])];location[index]=value;update({location_mm:location})}}/></label>)}
    <button className="cf-button" onClick={onEdit}>แก้ Family · 2D / 3D / สูตร</button>
  </section>
}
