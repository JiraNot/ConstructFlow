/** Transfer decoded DWG entities to the same native CAD import path used by DXF. */
export function dwgDatabaseToDxf(database) {
  const pairs = [], pair = (code, value) => { if (value !== undefined && value !== null) pairs.push(String(code), String(value)) }
  const point = (code, p) => { pair(code, p?.x ?? 0); pair(code+10, p?.y ?? 0); pair(code+20,p?.z ?? 0) }
  let skipped = 0
  const entity = e => {
    if (e.isInPaperSpace) return
    const supported = ['LINE','LWPOLYLINE','POLYLINE2D','ARC','CIRCLE','ELLIPSE','SPLINE','INSERT','TEXT','MTEXT','HATCH']
    if (!supported.includes(e.type)) { skipped++; return }
    pair(0,e.type==='POLYLINE2D'?'LWPOLYLINE':e.type); pair(8,e.layer ?? '0');pair(62,e.colorIndex);pair(420,e.color);pair(370,e.lineweight);pair(6,e.lineType)
    if(e.type==='LINE') { point(10,e.startPoint);point(11,e.endPoint) }
    else if(e.type==='LWPOLYLINE'||e.type==='POLYLINE2D') {pair(90,e.vertices.length);pair(70,e.flag);for(const v of e.vertices){point(10,v.location ?? v);pair(42,v.bulge)}}
    else if(e.type==='CIRCLE'||e.type==='ARC') {point(10,e.center);pair(40,e.radius);if(e.type==='ARC'){pair(50,e.startAngle);pair(51,e.endAngle)}}
    else if(e.type==='ELLIPSE') {point(10,e.center);point(11,e.majorAxisEndPoint ?? e.majorAxis);pair(40,e.axisRatio ?? e.ratio);pair(41,e.startAngle ?? 0);pair(42,e.endAngle ?? Math.PI*2)}
    else if(e.type==='SPLINE') {pair(70,e.flag ?? 0);pair(71,e.degree);pair(72,e.knots?.length ?? 0);pair(73,e.controlPoints?.length ?? 0);for(const k of e.knots ?? [])pair(40,k);for(const p of e.controlPoints ?? [])point(10,p);for(const w of e.weights??[])pair(41,w)}
    else if(e.type==='INSERT') {pair(2,e.name);point(10,e.insertionPoint);pair(41,e.xScale);pair(42,e.yScale);pair(43,e.zScale);pair(50,e.rotation);pair(70,e.columnCount);pair(71,e.rowCount);pair(44,e.columnSpacing);pair(45,e.rowSpacing)}
    else if(e.type==='TEXT'||e.type==='MTEXT') {point(10,e.startPoint ?? e.insertionPoint);pair(1,e.text);pair(40,e.textHeight ?? e.height);pair(50,e.rotation)}
    else if(e.type==='HATCH') {
      pair(2,e.patternName);pair(70,e.solidFill);pair(71,0);pair(91,e.boundaryPaths.length)
      for(const path of e.boundaryPaths){
        if(path.vertices){pair(92,2);pair(72,1);pair(73,path.isClosed?1:0);pair(93,path.vertices.length);for(const v of path.vertices){pair(10,v.x);pair(20,v.y);pair(42,v.bulge ?? 0)}}
        else {pair(92,0);pair(93,path.edges?.length ?? 0);for(const edge of path.edges ?? []){pair(72,edge.type);if(edge.type===1){point(10,edge.start);point(11,edge.end)}else if(edge.type===2){point(10,edge.center);pair(40,edge.radius);pair(50,edge.startAngle);pair(51,edge.endAngle);pair(73,edge.isCCW?1:0)}else {skipped++}}}
        pair(97,0)
      }
      pair(75,e.hatchStyle ?? 0);pair(76,e.patternType ?? 1);pair(52,e.patternAngle ?? 0);pair(41,e.patternScale ?? 1)
      const lines=e.definitionLines??[];pair(78,lines.length)
      for(const line of lines){pair(53,line.angle);pair(43,line.base?.x??0);pair(44,line.base?.y??0);pair(45,line.offset?.x??0);pair(46,line.offset?.y??0);pair(79,line.dashLengths?.length??0);for(const dash of line.dashLengths??[])pair(49,dash)}pair(98,0)
    }
  }
  pair(0,'SECTION');pair(2,'HEADER');pair(9,'$INSUNITS');pair(70,database.header.INSUNITS ?? 0);pair(0,'ENDSEC')
  pair(0,'SECTION');pair(2,'BLOCKS')
  for(const block of database.tables.BLOCK_RECORD.entries ?? []) {if(block.name.startsWith('*Model')||block.name.startsWith('*Paper'))continue;pair(0,'BLOCK');pair(2,block.name);point(10,block.basePoint);for(const e of block.entities ?? [])entity(e);pair(0,'ENDBLK')}
  pair(0,'ENDSEC');pair(0,'SECTION');pair(2,'ENTITIES');for(const e of database.entities)entity(e);pair(0,'ENDSEC');pair(0,'EOF')
  return { dxf: pairs.join('\n')+'\n', skipped }
}
