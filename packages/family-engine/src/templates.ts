import { legacyTypeUuid, type FamilyDefinition, type FamilyPath, type FamilyCategory, type InteriorFurnitureKind } from '@constructflow/project-model'
const names: Record<InteriorFurnitureKind, string> = { sofa: 'โซฟา', chair: 'เก้าอี้', dining_table: 'โต๊ะอาหาร', coffee_table: 'โต๊ะกลาง', desk: 'โต๊ะทำงาน', bed_single: 'เตียงเดี่ยว', bed_double: 'เตียงคู่', toilet: 'โถสุขภัณฑ์', washbasin: 'อ่างล้างหน้า', bathtub: 'อ่างอาบน้ำ' }
export function createFamilyTemplate(id: string, name = 'Family ใหม่', category: FamilyCategory = 'generic'): FamilyDefinition {
  return { schema_version: 1, id, name, category, parameters: [
    { name: 'W', label: 'กว้าง', value: category === 'door' ? 900 : 1200, scope: 'instance', min: 1 },
    { name: 'D', label: 'ลึก', value: category === 'door' || category === 'window' ? 100 : 600, scope: 'instance', min: 1 },
    { name: 'H', label: 'สูง', value: category === 'door' ? 2100 : 750, scope: 'instance', min: 1 },
  ], types: [{ id: legacyTypeUuid('family.type', id, 'standard'), name: 'มาตรฐาน', values: {} }], paths: [{ id: 'outline', points: [[0, 0], ['W', 0], ['W', 'D'], [0, 'D']], closed: true, layer: 'ตัววัตถุ', view: 'plan', color: '#475569', lineweight_mm: 0.25 }], extrusions: [{ id: 'body', profile_id: 'outline', plane: 'xy', start: 0, end: 'H', color: '#c6b59e' }], meshes: [] }
}
export const builtInFurnitureFamilies: FamilyDefinition[] = (Object.keys(names) as InteriorFurnitureKind[]).map(kind => {
  const family = createFamilyTemplate(legacyTypeUuid('interior.furniture', kind, kind), names[kind], 'furniture')
  const dims: Record<InteriorFurnitureKind, [number, number, number]> = { sofa: [2100,900,850], chair: [500,550,850], dining_table: [1600,900,750], coffee_table: [1000,600,450], desk: [1200,700,750], bed_single: [1000,2000,500], bed_double: [1800,2000,500], toilet: [400,700,400], washbasin: [600,500,850], bathtub: [1700,750,550] }
  family.parameters.forEach((parameter, index) => parameter.value = dims[kind][index])
  family.paths = []; family.extrusions = []
  const rect = (id: string, x: number, y: number, w: number, d: number, start: string, end: string, color: string, visible = true, round = 0) => {
    const points: [number, number][] = []
    if (round) {
      const r = Math.min(w / 2, d / 2, round)
      for (const [cx, cy, base] of [[x+w-r,y+r,-90],[x+w-r,y+d-r,0],[x+r,y+d-r,90],[x+r,y+r,180]]) for (let i=0;i<=4;i++) { const a=(base+i*22.5)*Math.PI/180;points.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]) }
    } else points.push([x,y],[x+w,y],[x+w,y+d],[x,y+d])
    family.paths.push({ id, points: points.map(([u,v]) => [`W*${u}`, `D*${v}`]), closed: true, view: 'plan', layer: 'ตัววัตถุ', color: '#64748b', lineweight_mm: 0.2, visible })
    if (end) family.extrusions.push({ id: `3d-${id}`, profile_id: id, plane: 'xy', start, end, color })
  }
  if (kind === 'sofa') {
    rect('base',0,0,1,1,'H*.12','H*.46','#c5b9aa',true,.05)
    rect('back',.035,.03,.93,.18,'H*.46','H','#b4a38e',true,.035)
    rect('left-arm',.02,.08,.07,.85,'H*.46','H*.8','#b4a38e',true,.025)
    rect('right-arm',.91,.08,.07,.85,'H*.46','H*.8','#b4a38e',true,.025)
    for(let i=0;i<3;i++) rect(`cushion-${i}`,.105+i*.27,.24,.25,.65,'H*.46','H*.58','#e5ddd0',true,.025)
  } else if (kind.startsWith('bed_')) {
    rect('frame',0,0,1,1,'H*.1','H*.7','#bfa383',true,.025)
    rect('head',0,0,1,.05,'0','H*1.6','#aa8968')
    rect('mattress',.04,.07,.92,.89,'H*.7','H','#f5efe5',true,.025)
    const count=kind==='bed_single'?1:2
    for(let i=0;i<count;i++) rect(`pillow-${i}`,.12+i*.42,.1,count===1?.76:.34,.15,'H','H*1.12','#fffdf7',true,.035)
    family.paths.push({id:'blanket',points:[['W*.04','D*.4'],['W*.96','D*.4']],closed:false,view:'plan',layer:'รายละเอียด',color:'#94a3b8',lineweight_mm:.18})
  } else if (kind==='dining_table'||kind==='coffee_table'||kind==='desk'||kind==='chair') {
    rect('top',0,0,1,1,'H*.92','H','#d3b995',true,.035)
    for(const [i,[x,y]] of [[.06,.08],[.88,.08],[.88,.82],[.06,.82]].entries()) rect(`leg-${i}`,x,y,.06,.1,'0','H*.92','#92765c',false)
    if(kind==='chair') rect('back',0,0,1,.12,'H','H*1.8','#bca080',true,.025)
    if(kind==='desk') rect('drawer',.72,.14,.22,.7,'H*.6','H*.92','#c5ae8e')
  } else {
    rect('outer',0,0,1,1,'0','H','#e7ecef',true,.12)
    rect('inner',.12,.16,.76,.72,'H*.94','H','#f9fbfc',true,.17)
    if(kind==='toilet') rect('cistern',.12,.02,.76,.22,'H','H*1.9','#f3f6f8',true,.03)
  }
  return family
})
