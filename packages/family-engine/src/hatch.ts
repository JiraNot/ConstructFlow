import type { FamilyHatchLine } from '@constructflow/project-model'
export interface NamedFamilyPattern { name:string; description:string; lines:FamilyHatchLine[] }
export function parseFamilyPat(source:string):NamedFamilyPattern[]{
  if(source.length>2_000_000)throw new Error('ไฟล์ PAT เกิน 2 MB')
  const result:NamedFamilyPattern[]=[]
  for(const raw of source.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const text=raw.split(';')[0].trim();if(!text)continue
    if(text.startsWith('*')){const[name,...description]=text.slice(1).split(',');if(!name.trim())throw new Error('PAT ไม่มีชื่อ');result.push({name:name.trim(),description:description.join(',').trim(),lines:[]});if(result.length>200)throw new Error('PAT เกิน 200 ลาย');continue}
    const pattern=result.at(-1);if(!pattern)throw new Error('PAT ต้องเริ่มด้วย *ชื่อ,คำอธิบาย')
    const numbers=text.split(',').map(value=>Number(value.trim()))
    if(numbers.length<5||numbers.length>29||!numbers.every(Number.isFinite))throw new Error(`ข้อมูล PAT ${pattern.name} ไม่ถูกต้อง`)
    const[a,x,y,dx,dy,...dashes]=numbers,angle=a*Math.PI/180
    if(Math.abs(dy)<1e-9)throw new Error('ระยะข้ามแนว Hatch ต้องไม่เป็นศูนย์')
    pattern.lines.push({angle_deg:a,base_mm:[x,y],offset_mm:[dx*Math.cos(angle)-dy*Math.sin(angle),dx*Math.sin(angle)+dy*Math.cos(angle)],dashes_mm:dashes})
    if(pattern.lines.length>100)throw new Error('ลาย PAT เกิน 100 ชุดเส้น')
  }
  if(!result.length||result.some(pattern=>!pattern.lines.length))throw new Error('PAT ไม่มีชุดเส้น')
  return result
}

import { clippedGridSegments, clippedStaggeredPlankSegments, clippedGrassSegments, clippedMaterialPatternSegments, polygonDiagonalHatchSegments, type Vec2 } from '@constructflow/geometry-kernel'
import type { FamilyPath } from '@constructflow/project-model'
export function familyHatchSegments(boundary:Vec2[],hatch:NonNullable<FamilyPath['hatch']>,voids:Vec2[][]=[]):Array<[Vec2,Vec2]>{
  const {pattern,spacing_mm:s,rotation_deg:angle}=hatch,o=hatch.origin_mm??[0,0]
  if(pattern==='custom')return clippedMaterialPatternSegments(boundary,hatch.lines??[],hatch.pattern_scale??1,angle,o,voids)
  if(pattern==='grass')return clippedGrassSegments(boundary,s,voids,o,angle)
  if(pattern==='grid')return clippedGridSegments(boundary,s,s,voids,o,angle)
  if(pattern==='brick'||pattern==='wood')return clippedStaggeredPlankSegments(boundary,s,pattern==='wood'?s/5:s/2,voids,o,angle)
  if(pattern==='diagonal'||pattern==='cross')return [...polygonDiagonalHatchSegments(boundary,s,voids,angle+45,o),...(pattern==='cross'?polygonDiagonalHatchSegments(boundary,s,voids,angle-45,o):[])]
  return []
}
