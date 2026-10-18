import React,{useMemo} from 'react'
import {evaluateFamily} from '@constructflow/family-engine'
import type {FamilyDefinition} from '@constructflow/project-model'
export function FamilyThumbnail({family}:{family:FamilyDefinition}){
 const graphic=useMemo(()=>{try{const paths=evaluateFamily(family).paths.filter(path=>path.visible!==false&&path.view==='plan').slice(0,160),bounds=paths.flatMap(path=>path.points).reduce((b,[x,y])=>[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)],[Infinity,Infinity,-Infinity,-Infinity]);return paths.length?{paths,bounds}:null}catch{return null}},[family])
 if(!graphic)return <span className="cf-family-card-icon" aria-hidden="true">▱</span>
 const{paths,bounds:[x,y,right,bottom]}=graphic,pad=Math.max(right-x,bottom-y)*.08+1
 return <svg className="cf-family-thumbnail" viewBox={`${x-pad} ${y-pad} ${Math.max(1,right-x+pad*2)} ${Math.max(1,bottom-y+pad*2)}`} aria-hidden="true">{paths.map(path=><path key={path.id} d={path.points.map(([x,y],index)=>`${index?'L':'M'}${x} ${y}`).join(' ')+(path.closed?'Z':'')} fill={path.closed?'#ece6dd':'none'} stroke={path.color} strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}</svg>
}
