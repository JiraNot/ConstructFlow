import { isBeamObject, isColumnObject, isDoorObject, isWallObject, isWindowObject } from '@constructflow/project-model'
import type { ProjectDocument } from '@constructflow/project-model'
import type { CommandRequest } from '@constructflow/command-schema'
import { buildDirectManipulationCommands } from './directManipulation.mjs'

export function buildElevationManipulationCommands(project: ProjectDocument, viewMode: string, objectId: string, deltaWorldMm: [number, number], deltaZMm: number, verticalIntent: 'move' | 'top' | 'base', gripIndex?: number): CommandRequest[] {
    const object = project.objects[objectId]
    if (!object) return []
    if (object.object_type==='family.instance' || object.object_type==='interior.furniture' || object.object_type==='interior.cabinet_run') {
      const data=object.module_data as Record<string,unknown>,position=data.location_mm as number[]
      if (!position) return []
      if (data.family_id) return [{name:'UpdateFamilyInstance',input:{object_id:object.id,location_mm:[position[0]+deltaWorldMm[0],position[1]+deltaWorldMm[1],position[2]+deltaZMm]}}]
      if (object.object_type==='family.instance') return []
      return [{name:object.object_type==='interior.furniture'?'UpdateInteriorFurniture':'UpdateCabinetRun',input:{...data,id:object.id,location_mm:[position[0]+deltaWorldMm[0],position[1]+deltaWorldMm[1],position[2]+deltaZMm]}}]
    }
    const [dx,dy]=deltaWorldMm,commands:CommandRequest[]=[]
    const sideGrip=gripIndex===3||gripIndex===4
    const horizontalAxis=viewMode==='east'||viewMode==='west'?1:0
    const horizontalDelta=horizontalAxis===0?dx:dy
    const effectiveHorizontalDelta=gripIndex===undefined||sideGrip?horizontalDelta:0
    if(sideGrip){
      const reversed=viewMode==='south'||viewMode==='west'
      const sign=(gripIndex===3?-1:1)*(reversed?-1:1)
      if(object.object_type==='architecture.wall'){
        const data=object.module_data as Record<string,any>,coordinates=[data.start_point_mm[horizontalAxis],data.end_point_mm[horizontalAxis]]
        const leftIndex=(coordinates[0]===coordinates[1]?0:((coordinates[0]<coordinates[1])!==reversed?0:1))
        const endpointIndex=gripIndex===3?leftIndex:1-leftIndex
        const start:[number,number]=[data.start_point_mm[0],data.start_point_mm[1]],end:[number,number]=[data.end_point_mm[0],data.end_point_mm[1]]
        const target=endpointIndex===0?start:end;target[horizontalAxis]+=effectiveHorizontalDelta
        commands.push({name:'UpdateWallEndpoints',input:{object_id:object.id,start_point_mm:start,end_point_mm:end}})
      }else if(isDoorObject(object)||isWindowObject(object)){
        const wall=project.objects[object.module_data.wall_id]
        if(!wall||!isWallObject(wall))return []
        const wallStart=wall.module_data.start_point_mm,wallEnd=wall.module_data.end_point_mm
        const wallLength=Math.hypot(wallEnd[0]-wallStart[0],wallEnd[1]-wallStart[1])
        if(wallLength<1)return []
        const tangent:[number,number]=[(wallEnd[0]-wallStart[0])/wallLength,(wallEnd[1]-wallStart[1])/wallLength]
        const projectedDirection=tangent[horizontalAxis]*(viewMode==='south'||viewMode==='west'?-1:1)
        if(Math.abs(projectedDirection)<0.01)return []
        const startSide=(gripIndex===3)===(projectedDirection>0)
        const deltaAlong=effectiveHorizontalDelta/(horizontalAxis===0?tangent[0]:tangent[1])
        const width=object.module_data.width_mm,offset=object.module_data.offset_along_wall_mm
        const change=startSide?-deltaAlong:deltaAlong
        const nextWidth=Math.max(100,width+change),actualChange=nextWidth-width,nextOffset=offset+(startSide?-actualChange/2:actualChange/2)
        commands.push({name:isDoorObject(object)?'UpdateDoorDimensions':'UpdateWindowDimensions',input:{object_id:object.id,width_mm:nextWidth,height_mm:object.module_data.height_mm,offset_along_wall_mm:nextOffset,...(isDoorObject(object)?{sill_height_mm:Number(object.module_data.sill_height_mm??0)}:{sill_height_mm:object.module_data.sill_height_mm}),...(object.module_data.vertical_constraint==='head_level'?{head_level_id:object.module_data.head_level_id,head_offset_mm:object.module_data.head_offset_mm,vertical_constraint:'head_level'}:{vertical_constraint:'fixed_height'})}})
      }else if(isBeamObject(object)){
        const d=object.module_data,coordinates=[d.start_point_mm[horizontalAxis],d.end_point_mm[horizontalAxis]],leftIndex=(coordinates[0]===coordinates[1]?0:((coordinates[0]<coordinates[1])!==reversed?0:1)),endpointIndex=gripIndex===3?leftIndex:1-leftIndex
        const start:[number,number]=[d.start_point_mm[0],d.start_point_mm[1]],end:[number,number]=[d.end_point_mm[0],d.end_point_mm[1]]
        const target=endpointIndex===0?start:end;target[horizontalAxis]+=effectiveHorizontalDelta
        commands.push({name:'UpdateBeamEndpoints',input:{object_id:object.id,start_point_mm:start,end_point_mm:end,start_column_id:endpointIndex===0?null:d.start_column_id??null,end_column_id:endpointIndex===1?null:d.end_column_id??null}})
      }else if(isColumnObject(object)){
        const d=object.module_data,angle=((d.rotation_deg%180)+180)%180
        if(Math.min(angle,Math.abs(angle-90),180-angle)>1)return []
        const sectionIndex=horizontalAxis===(angle===0?0:1)?0:1
        const section:[number,number]=[...d.section_mm] as [number,number]
        const nextSection=Math.max(100,section[sectionIndex]+sign*effectiveHorizontalDelta)
        const actualEdgeMove=(nextSection-section[sectionIndex])/sign
        section[sectionIndex]=nextSection
        const location:[number,number,number]=[...d.location_mm]
        location[horizontalAxis]+=actualEdgeMove/2
        commands.push({name:'MoveColumn',input:{object_id:object.id,location_mm:location}},{name:'UpdateColumnDimensions',input:{object_id:object.id,section_mm:section}})
      }else if(['structure.slab','architecture.floor','architecture.ceiling','roof.system','architecture.room'].includes(object.object_type)){
        const d=object.module_data as Record<string,any>,boundary=d.boundary_mm as [number,number][]
        if(!boundary?.length)return []
        const min=Math.min(...boundary.map(point=>point[horizontalAxis])),max=Math.max(...boundary.map(point=>point[horizontalAxis])),leftAtMin=!reversed,moveMin=(gripIndex===3)===leftAtMin,edge=moveMin?min:max,next=boundary.map(point=>{const updated:[number,number]=[...point];if(Math.abs(point[horizontalAxis]-edge)<1)updated[horizontalAxis]+=effectiveHorizontalDelta;return updated})
        const command=object.object_type==='structure.slab'?'UpdateSlab':object.object_type==='architecture.floor'?'UpdateArchitecturalFloor':object.object_type==='architecture.ceiling'?'UpdateCeiling':object.object_type==='roof.system'?'UpdateRoof':'UpdateRoom'
        commands.push({name:command,input:{...d,id:object.id,boundary_mm:next,...(command==='UpdateArchitecturalFloor'||command==='UpdateCeiling'?{follows_room_boundary:false}:{})}})
      }
    }else if(gripIndex===undefined&&Math.hypot(dx,dy)>0.1){
      const movement=buildDirectManipulationCommands(project,{id:objectId,kind:'object-move',startWorldMm:[0,0],startScreenPx:[0,0]},deltaWorldMm)
      commands.push(...movement)
    }
    const effectiveDeltaZMm=gripIndex===undefined||gripIndex===1||gripIndex===6?deltaZMm:0
    if(Math.abs(effectiveDeltaZMm)>0.1){
      const d=object.module_data as Record<string,any>,top=verticalIntent==='top',base=verticalIntent==='base'
      if(isWallObject(object)){
        if(d.vertical_constraint==='top_level'){
          commands.push({name:'UpdateWallDimensions',input:{object_id:objectId,thickness_mm:d.thickness_mm,...(top?{top_level_id:d.top_level_id,top_offset_mm:Number(d.top_offset_mm??0)+deltaZMm,vertical_constraint:'top_level'}:base?{top_level_id:d.top_level_id,base_offset_mm:Number(d.base_offset_mm??0)+deltaZMm,top_offset_mm:Number(d.top_offset_mm??0),vertical_constraint:'top_level'}:{top_level_id:d.top_level_id,base_offset_mm:Number(d.base_offset_mm??0)+deltaZMm,top_offset_mm:Number(d.top_offset_mm??0)+deltaZMm,vertical_constraint:'top_level'})}})
        }else commands.push({name:'UpdateWallDimensions',input:{object_id:objectId,thickness_mm:d.thickness_mm,height_mm:Math.max(100,Number(d.height_mm)+(top?deltaZMm:base?-deltaZMm:0)),base_offset_mm:Number(d.base_offset_mm??0)+(base||!top?deltaZMm:0),vertical_constraint:'fixed_height'}})
      }else if(isDoorObject(object)||isWindowObject(object)){
        const oldSill=Number(d.sill_height_mm??0),oldHeight=Number(d.height_mm??2000)
        let sill=oldSill,height=oldHeight
        let vertical:Record<string,unknown>
        if(top){
          vertical=d.vertical_constraint==='head_level'
            ?{head_level_id:d.head_level_id,head_offset_mm:Number(d.head_offset_mm??0)+deltaZMm,vertical_constraint:'head_level'}
            :{vertical_constraint:'fixed_height'}
          if(d.vertical_constraint!=='head_level')height=Math.max(100,oldHeight+deltaZMm)
        }else if(base){
          const proposedSill=Math.max(0,oldSill+deltaZMm)
          const actualSillDelta=Math.min(proposedSill-oldSill,Math.max(0,oldHeight-100))
          sill=oldSill+actualSillDelta;height=oldHeight-actualSillDelta
          vertical=d.vertical_constraint==='head_level'
            ?{head_level_id:d.head_level_id,head_offset_mm:Number(d.head_offset_mm??0),vertical_constraint:'head_level'}
            :{vertical_constraint:'fixed_height'}
        }else{
          sill=Math.max(0,oldSill+deltaZMm)
          const actualSillDelta=sill-oldSill
          vertical=d.vertical_constraint==='head_level'
            ?{head_level_id:d.head_level_id,head_offset_mm:Number(d.head_offset_mm??0)+actualSillDelta,vertical_constraint:'head_level'}
            :{vertical_constraint:'fixed_height'}
        }
        commands.push({name:isDoorObject(object)?'UpdateDoorDimensions':'UpdateWindowDimensions',input:{object_id:objectId,width_mm:d.width_mm,height_mm:height,sill_height_mm:sill,...vertical}})
      }else if(isColumnObject(object)){
        const baseOffset=Number(d.base_offset_mm??0),topOffset=Number(d.top_offset_mm??0)
        commands.push({name:'UpdateColumnVerticalReference',input:{object_id:objectId,...(d.top_level_id?{top_level_id:d.top_level_id}:{}),base_offset_mm:baseOffset+(base||(!top&&!base)?deltaZMm:0),top_offset_mm:topOffset+(top||(!top&&!base)?deltaZMm:0)}})
      }else if(isBeamObject(object)){
        const section:[number,number]=[...d.section_mm] as [number,number]
        if(top){
          const oldDepth=section[1]
          section[1]=Math.max(100,oldDepth+deltaZMm)
          const actualTopDelta=section[1]-oldDepth
          commands.push({name:'UpdateBeamDimensions',input:{object_id:objectId,section_mm:section}},{name:'UpdateBeamVerticalReference',input:{object_id:objectId,level_id:d.level_id,base_offset_mm:Number(d.base_offset_mm??0)+actualTopDelta}})
        }else if(base){section[1]=Math.max(100,section[1]-deltaZMm);commands.push({name:'UpdateBeamDimensions',input:{object_id:objectId,section_mm:section}})}
        else commands.push({name:'UpdateBeamVerticalReference',input:{object_id:objectId,level_id:d.level_id,base_offset_mm:Number(d.base_offset_mm??0)+deltaZMm}})
      }else if(object.object_type==='structure.slab'){
        const thickness=Math.max(25,Number(d.thickness_mm)+(top?deltaZMm:base?-deltaZMm:0)),moveTop=top||(!top&&!base),elevation=Number(d.elevation_mm??0)+(moveTop?deltaZMm:0)
        commands.push({name:'UpdateSlab',input:{...d,id:objectId,thickness_mm:thickness,elevation_mm:elevation,...(d.elevation_offset_mm!==undefined?{elevation_offset_mm:Number(d.elevation_offset_mm)+(moveTop?deltaZMm:0)}:{})}})
      }else if(object.object_type==='architecture.floor'||object.object_type==='architecture.ceiling'){
        const thickness=Math.max(25,Number(d.thickness_mm)+(top?deltaZMm:base?-deltaZMm:0)),moveTop=top||(!top&&!base),offset=d.elevation_offset_mm===undefined?undefined:Number(d.elevation_offset_mm)+(moveTop?deltaZMm:0)
        commands.push({name:object.object_type==='architecture.floor'?'UpdateArchitecturalFloor':'UpdateCeiling',input:{...d,id:objectId,thickness_mm:thickness,elevation_mm:Number(d.elevation_mm??0)+(moveTop?deltaZMm:0),...(offset!==undefined?{elevation_offset_mm:offset}:{})}})
      }else if(object.object_type==='roof.system')commands.push({name:'UpdateRoof',input:{...d,id:objectId,elevation_mm:Number(d.elevation_mm??0)+deltaZMm}})
      else if(object.object_type==='architecture.stair')commands.push({name:'UpdateStair',input:{...d,id:objectId,base_offset_mm:Number(d.base_offset_mm??0)+deltaZMm,...(d.top_level_id?{top_offset_mm:Number(d.top_offset_mm??0)+deltaZMm}:{}),start_point_mm:[d.start_point_mm[0],d.start_point_mm[1],Number(d.start_point_mm[2]??0)+deltaZMm]}})
    }
    return commands
  }
