import { WorkbenchNumberInput } from './WorkbenchNumberInput.js'
import type { FamilyDefinition, FamilyParameter } from '@constructflow/project-model'
import { evaluateFamily, type EvaluatedFamilyPath } from '@constructflow/family-engine'

type Dimension = 'W' | 'D' | 'H'
type Values = Record<Dimension, number>

const labels: Record<Dimension, string> = { W: 'กว้าง', D: 'ลึก', H: 'สูง' }
const views = [
  { id: 'plan', title: 'แปลน', horizontal: 'W', vertical: 'D' },
  { id: 'front', title: 'รูปด้าน', horizontal: 'W', vertical: 'H' },
  { id: 'section', title: 'รูปตัดด้านข้าง', horizontal: 'D', vertical: 'H', pathView: 'side' },
] as const

function metres(value: number) { return `${(value / 1000).toFixed(2)} m` }

function DimensionView({ horizontal, vertical, values, outlines }: { horizontal: Dimension; vertical: Dimension; values: Values; outlines: EvaluatedFamilyPath[] }) {
  const h = Math.max(1, values[horizontal]), v = Math.max(1, values[vertical])
  const ratio = h / v
  const width = ratio > 2.1 ? 142 : ratio < .48 ? 64 : 142
  const height = ratio > 2.1 ? 54 : ratio < .48 ? 92 : Math.max(54, Math.min(92, 142 / ratio))
  const left = 45 + (150 - width) / 2, top = 28 + (94 - height) / 2
  const right = left + width, bottom = top + height
  const horizMid = left + width / 2, vertMid = top + height / 2
  const allPoints = outlines.flatMap(path => path.points)
  const minX = allPoints.length ? Math.min(...allPoints.map(point => point[0])) : 0
  const maxX = allPoints.length ? Math.max(...allPoints.map(point => point[0])) : h
  const minY = allPoints.length ? Math.min(...allPoints.map(point => point[1])) : 0
  const maxY = allPoints.length ? Math.max(...allPoints.map(point => point[1])) : v
  const geometryScale = Math.min(width / Math.max(1, maxX - minX), height / Math.max(1, maxY - minY))
  const geometryWidth = (maxX - minX) * geometryScale, geometryHeight = (maxY - minY) * geometryScale
  const geometryX = left + (width - geometryWidth) / 2, geometryY = top + (height - geometryHeight) / 2
  return <svg className="cf-dimension-drawing" viewBox="0 0 240 150" role="img" aria-label={`${labels[horizontal]} ${metres(h)} × ${labels[vertical]} ${metres(v)}`}>
    <defs><pattern id={`dimension-hatch-${horizontal}-${vertical}`} width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="7" stroke="#cbd5e1" strokeWidth="2"/></pattern></defs>
    {outlines.length ? outlines.map(path => <path key={path.id} d={path.points.map(([x,y],index)=>`${index?'L':'M'} ${geometryX+(x-minX)*geometryScale} ${geometryY+geometryHeight-(y-minY)*geometryScale}`).join(' ')+(path.closed?' Z':'')} fill={path.closed?'#dbeafe':'none'} fillOpacity=".72" stroke={path.color||'#334155'} strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>):<rect x={left} y={top} width={width} height={height} rx="2" fill={`url(#dimension-hatch-${horizontal}-${vertical})`} stroke="#334155" strokeWidth="2"/>}
    <line x1={left} y1="15" x2={right} y2="15" className="cf-dimension-line"/><line x1={left} y1="12" x2={left} y2={top - 3} className="cf-dimension-extension"/><line x1={right} y1="12" x2={right} y2={top - 3} className="cf-dimension-extension"/>
    <path d={`M ${left} 15 l 7 -4 v 8 z M ${right} 15 l -7 -4 v 8 z`} className="cf-dimension-arrow"/>
    <rect x={horizMid - 33} y="3" width="66" height="18" rx="4" className="cf-dimension-label-bg"/><text x={horizMid} y="16" textAnchor="middle" className="cf-dimension-label">{horizontal} · {metres(h)}</text>
    <line x1="224" y1={top} x2="224" y2={bottom} className="cf-dimension-line"/><line x1={right + 3} y1={top} x2="227" y2={top} className="cf-dimension-extension"/><line x1={right + 3} y1={bottom} x2="227" y2={bottom} className="cf-dimension-extension"/>
    <path d={`M 224 ${top} l -4 7 h 8 z M 224 ${bottom} l -4 -7 h 8 z`} className="cf-dimension-arrow"/>
    <rect x="186" y={vertMid - 9} width="55" height="18" rx="4" className="cf-dimension-label-bg"/><text x="213.5" y={vertMid + 4} textAnchor="middle" className="cf-dimension-label">{vertical} · {metres(v)}</text>
  </svg>
}

export function FamilyDimensionsEditor({ values, parameters, family, typeId, onChange }: {
  values: Values
  parameters: FamilyParameter[]
  family: FamilyDefinition
  typeId?: string
  onChange: (name: Dimension, value: number) => void
}) {
  const locked = Object.fromEntries(parameters.map(parameter => [parameter.name, !!parameter.formula?.trim()])) as Record<Dimension, boolean>
  let evaluated: ReturnType<typeof evaluateFamily> | null = null
  try { evaluated = evaluateFamily(family, typeId) } catch { /* Keep the dimension diagrams available while a draft formula is incomplete. */ }
  return <section className="cf-dimensions-editor" aria-label="ขนาดหลักของ Family">
    <header><div><strong>ขนาดหลัก</strong><small>แก้ตัวเลขแล้วดูผลในแปลน รูปด้าน และรูปตัด</small></div><span>หน่วย m</span></header>
    <div className="cf-dimensions-views">{views.map(view => <article className="cf-dimension-view" key={view.id}>
      <strong>{view.title}</strong>
      <DimensionView horizontal={view.horizontal} vertical={view.vertical} values={values} outlines={evaluated?.paths.filter(path=>path.view===(view.id==='section'?'side':view.id))??[]}/>
      <small>แนวนอน: {labels[view.horizontal]} · แนวตั้ง: {labels[view.vertical]}</small>
    </article>)}</div>
    <div className="cf-dimension-fields">{(['W', 'D', 'H'] as const).map(name => {
      const parameter = parameters.find(item => item.name === name)
      return <label className="cf-dimension-field" key={name}>
        <span><strong>{labels[name]}</strong><small>{name} · {name === 'W' ? 'แปลน / รูปด้าน' : name === 'D' ? 'แปลน / รูปตัด' : 'รูปด้าน / รูปตัด'}</small></span>
        <WorkbenchNumberInput ariaLabel={`ขนาด ${name}`} value={values[name]} unit="m" disabled={locked[name]} onChange={value => onChange(name, value)}/>
      </label>
    })}</div>
    {(['W', 'D', 'H'] as const).some(name => locked[name]) && <small className="cf-dimensions-note">ค่าที่มีสูตรจะคำนวณให้อัตโนมัติ · แก้สูตรได้ในตั้งค่าขั้นสูง</small>}
  </section>
}
