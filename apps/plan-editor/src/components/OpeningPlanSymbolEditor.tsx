import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { makeSlidingWindowPlanSymbol, resolveOpeningPlanSymbolX, resolveOpeningPlanSymbolY } from '@constructflow/project-model'
import type { OpeningPlanSymbolLine, OpeningPlanSymbolPoint } from '@constructflow/project-model'

interface Props {
  lines: OpeningPlanSymbolLine[]
  openingWidthMm: number
  referenceDepthMm: number
  onChange: (lines: OpeningPlanSymbolLine[]) => void
  onReferenceDepthChange: (depthMm: number) => void
  onReturnToAutomatic: () => void
  viewKind?: 'plan' | 'elevation'
}

const WIDTH = 600
const HEIGHT = 180
const OPENING_LEFT = 32
const OPENING_RIGHT = 568
const CENTER_Y = 90
const DEPTH_PX = 38
const pointToSvg = (point: OpeningPlanSymbolPoint, widthMm: number, depthMm: number, viewKind: 'plan' | 'elevation'): [number, number] => [
  OPENING_LEFT + resolveOpeningPlanSymbolX(point, widthMm) / widthMm * (OPENING_RIGHT - OPENING_LEFT),
  CENTER_Y + (viewKind === 'elevation' ? resolveOpeningPlanSymbolY(point, depthMm) : point.y_mm) / Math.max(depthMm / 2, 1) * DEPTH_PX,
]
const pointerMm = (event: ReactPointerEvent<SVGElement>, widthMm: number, depthMm: number): [number, number] => {
  const target = event.currentTarget
  const svg = target instanceof SVGSVGElement ? target : target.ownerSVGElement!
  const bounds = svg.getBoundingClientRect()
  const sx = (event.clientX - bounds.left) / bounds.width * WIDTH
  const sy = (event.clientY - bounds.top) / bounds.height * HEIGHT
  const xMm = Math.max(0, Math.min(widthMm, (sx - OPENING_LEFT) / (OPENING_RIGHT - OPENING_LEFT) * widthMm))
  const yMm = Math.max(-depthMm / 2, Math.min(depthMm / 2, (sy - CENTER_Y) / DEPTH_PX * depthMm / 2))
  return [xMm, yMm]
}

function anchoredPoint(xMm: number, yMm: number, widthMm: number, depthMm: number, viewKind: 'plan' | 'elevation'): OpeningPlanSymbolPoint {
  const half = widthMm / 2
  const candidates: Array<[number, OpeningPlanSymbolPoint]> = [
    [0, { x_anchor: 'left', x_offset_mm: 0, y_mm: yMm }],
    [50, { x_anchor: 'left', x_offset_mm: 50, y_mm: yMm }],
    [half - 25, { x_anchor: 'center', x_offset_mm: -25, y_mm: yMm }],
    [half, { x_anchor: 'center', x_offset_mm: 0, y_mm: yMm }],
    [half + 25, { x_anchor: 'center', x_offset_mm: 25, y_mm: yMm }],
    [widthMm - 50, { x_anchor: 'right', x_offset_mm: -50, y_mm: yMm }],
    [widthMm, { x_anchor: 'right', x_offset_mm: 0, y_mm: yMm }],
  ]
  const near = candidates.find(([x]) => Math.abs(x - xMm) <= Math.max(12, widthMm * 0.012))
  const snappedX = near?.[0] ?? Math.round(xMm / 5) * 5
  const snappedY = Math.round(yMm / 5) * 5
  const result = near ? { ...near[1] } : { x_anchor: 'ratio' as const, x_offset_mm: 0, x_ratio: Math.max(0, Math.min(1, snappedX / widthMm)), y_mm: 0 }
  if (viewKind === 'plan') return { ...result, y_mm: Math.max(-depthMm / 2, Math.min(depthMm / 2, snappedY)) }
  const yCandidates: Array<[number, OpeningPlanSymbolPoint['y_anchor'], number, number?]> = [
    [-depthMm / 2, 'bottom', 0], [0, 'center', 0], [depthMm / 2, 'top', 0],
    [depthMm * 0.25, 'ratio', 0, 0.75], [-depthMm * 0.25, 'ratio', 0, 0.25],
  ]
  const yNear = yCandidates.find(([y]) => Math.abs(y - snappedY) <= Math.max(12, depthMm * 0.015))
  if (yNear) return { ...result, y_mm: 0, y_anchor: yNear[1], ...(yNear[3] === undefined ? {} : { y_ratio: yNear[3] }) }
  return { ...result, y_mm: Math.max(-1000, Math.min(1000, snappedY)), y_anchor: 'center' }
}

function movePoint(point: OpeningPlanSymbolPoint, xMm: number, yMm: number, widthMm: number, depthMm: number, viewKind: 'plan' | 'elevation'): OpeningPlanSymbolPoint {
  const x_offset_mm = point.x_anchor === 'right'
    ? xMm - widthMm
    : point.x_anchor === 'center'
      ? xMm - widthMm / 2
      : point.x_anchor === 'ratio'
        ? xMm - widthMm * (point.x_ratio ?? 0)
        : xMm
  const yBase = viewKind === 'elevation' ? resolveOpeningPlanSymbolY(point, depthMm) : point.y_mm
  const yOffset = viewKind === 'elevation'
    ? point.y_anchor === 'bottom' ? yMm + depthMm / 2 : point.y_anchor === 'top' ? yMm - depthMm / 2 : point.y_anchor === 'ratio' ? yMm - depthMm * ((point.y_ratio ?? 0.5) - 0.5) : yMm
    : yMm
  return { ...point, x_offset_mm, y_mm: Math.max(-1000, Math.min(1000, yOffset)), ...(point.y_anchor === 'ratio' && viewKind === 'elevation' ? { y_ratio: Math.max(0, Math.min(1, (yMm + depthMm / 2) / depthMm)) } : {}), ...(viewKind === 'elevation' && !point.y_anchor ? { y_anchor: 'center' as const } : {}) }
}

function reanchorPoint(point: OpeningPlanSymbolPoint, anchor: OpeningPlanSymbolPoint['x_anchor'], widthMm: number): OpeningPlanSymbolPoint {
  const xMm = resolveOpeningPlanSymbolX(point, widthMm)
  if (anchor === 'ratio') return { ...point, x_anchor: anchor, x_offset_mm: 0, x_ratio: Math.max(0, Math.min(1, xMm / widthMm)) }
  const x_offset_mm = anchor === 'right' ? xMm - widthMm : anchor === 'center' ? xMm - widthMm / 2 : xMm
  return { ...point, x_anchor: anchor, x_offset_mm }
}

export function OpeningPlanSymbolEditor({ lines, openingWidthMm, referenceDepthMm, onChange, onReferenceDepthChange, onReturnToAutomatic, viewKind = 'plan' }: Props) {
  const [mode, setMode] = useState<'select' | 'draw'>('select')
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<[[number, number], [number, number]] | null>(null)
  const drag = useRef<{ id: string; kind: 'line' | 'start' | 'end'; at: [number, number]; original: OpeningPlanSymbolLine } | null>(null)
  const depth = Math.max(50, referenceDepthMm || 100)
  const point = (event: ReactPointerEvent<SVGElement>) => pointerMm(event, openingWidthMm, depth)
  const setCapture = (event: ReactPointerEvent<SVGElement>) => {
    const target = event.currentTarget
    ;(target instanceof SVGSVGElement ? target : target.ownerSVGElement!).setPointerCapture(event.pointerId)
  }
  const beginDraw = (event: ReactPointerEvent<SVGElement>) => {
    if (mode !== 'draw') return
    setCapture(event)
    const at = point(event)
    setDraft([at, at])
  }
  const move = (event: ReactPointerEvent<SVGElement>) => {
    const at = point(event)
    if (draft) { setDraft([draft[0], at]); return }
    const current = drag.current
    if (!current) return
    const dx = at[0] - current.at[0], dy = at[1] - current.at[1]
    onChange(lines.map(line => {
      if (line.id !== current.id) return line
      const startX = resolveOpeningPlanSymbolX(current.original.start, openingWidthMm)
      const endX = resolveOpeningPlanSymbolX(current.original.end, openingWidthMm)
      const startY = viewKind === 'elevation' ? resolveOpeningPlanSymbolY(current.original.start, depth) : current.original.start.y_mm
      const endY = viewKind === 'elevation' ? resolveOpeningPlanSymbolY(current.original.end, depth) : current.original.end.y_mm
      const start = current.kind === 'start' || current.kind === 'line'
        ? movePoint(current.original.start, startX + dx, startY + dy, openingWidthMm, depth, viewKind)
        : current.original.start
      const end = current.kind === 'end' || current.kind === 'line'
        ? movePoint(current.original.end, endX + dx, endY + dy, openingWidthMm, depth, viewKind)
        : current.original.end
      return { ...line, start, end }
    }))
  }
  const finish = () => {
    if (draft) {
      const [[x1, y1], [x2, y2]] = draft
      if (Math.hypot(x2 - x1, y2 - y1) > 8) {
        const newLine: OpeningPlanSymbolLine = { id: crypto.randomUUID(), start: anchoredPoint(x1, y1, openingWidthMm, depth, viewKind), end: anchoredPoint(x2, y2, openingWidthMm, depth, viewKind) }
        onChange([...lines, newLine]); setSelected(newLine.id)
      }
      setDraft(null)
    }
    drag.current = null
  }
  const beginEdit = (event: ReactPointerEvent<SVGElement>, line: OpeningPlanSymbolLine, kind: 'line' | 'start' | 'end') => {
    if (mode !== 'select') return
    event.stopPropagation(); setCapture(event); setSelected(line.id)
    drag.current = { id: line.id, kind, at: point(event), original: structuredClone(line) }
  }
  const deleteSelected = () => {
    if (!selected) return
    onChange(lines.filter(line => line.id !== selected)); setSelected(null)
  }
  const selectedLine = lines.find(line => line.id === selected)
  const patchPoint = (part: 'start' | 'end', update: Partial<OpeningPlanSymbolPoint>) => {
    if (!selectedLine) return
    onChange(lines.map(line => line.id === selected ? { ...line, [part]: { ...line[part], ...update } } : line))
  }
  const [draftStartX, draftStartY] = draft ? [OPENING_LEFT + draft[0][0] / openingWidthMm * (OPENING_RIGHT - OPENING_LEFT), CENTER_Y + draft[0][1] / (depth / 2) * DEPTH_PX] : [0, 0]
  const [draftEndX, draftEndY] = draft ? [OPENING_LEFT + draft[1][0] / openingWidthMm * (OPENING_RIGHT - OPENING_LEFT), CENTER_Y + draft[1][1] / (depth / 2) * DEPTH_PX] : [0, 0]
  return <div className="cf-plan-symbol-editor">
    <div className="cf-plan-symbol-toolbar">
      <button type="button" aria-pressed={mode === 'select'} className={mode === 'select' ? 'is-active' : ''} onClick={() => setMode('select')}>เลือก / ขยับ</button>
      <button type="button" aria-pressed={mode === 'draw'} className={mode === 'draw' ? 'is-active' : ''} onClick={() => setMode('draw')}>วาดเส้น</button>
      <button type="button" disabled={!selected} onClick={deleteSelected}>ลบเส้นที่เลือก</button>
      <button type="button" disabled={!lines.length} onClick={() => { onChange(lines.slice(0, -1)); setSelected(null) }}>ย้อนเส้นล่าสุด</button>
      <button type="button" onClick={() => { onChange(makeSlidingWindowPlanSymbol()); setSelected(null) }}>เริ่มจากบานเลื่อน</button>
      <button type="button" onClick={onReturnToAutomatic}>กลับแบบอัตโนมัติ</button>
    </div>
    <label className="cf-plan-symbol-depth">{viewKind === 'elevation' ? 'ความสูงช่องเปิดอ้างอิง (มม.)' : 'ความหนาผนังอ้างอิง (มม.)'}
      <input type="number" min={50} max={1000} step={10} value={depth} onChange={event => onReferenceDepthChange(Math.max(50, Math.min(1000, Number(event.target.value) || 50)))} />
    </label>
    <svg className={`cf-plan-symbol-canvas ${mode === 'draw' ? 'is-drawing' : ''}`} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="application" aria-label="พื้นที่วาดเส้นหน้าต่าง 2D" onPointerDown={beginDraw} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
      <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="#f8fafc" />
      {viewKind === 'plan' ? <>
        <rect x={OPENING_LEFT} y="24" width={OPENING_RIGHT - OPENING_LEFT} height="28" fill="#dbe5ee" stroke="#64748b" strokeWidth="1.5" />
        <rect x={OPENING_LEFT} y="128" width={OPENING_RIGHT - OPENING_LEFT} height="28" fill="#dbe5ee" stroke="#64748b" strokeWidth="1.5" />
        <rect x={OPENING_LEFT} y="52" width={OPENING_RIGHT - OPENING_LEFT} height="76" fill="#fff" stroke="#64748b" strokeWidth="1.5" />
        <line x1={OPENING_LEFT} x2={OPENING_RIGHT} y1={CENTER_Y} y2={CENTER_Y} stroke="#cbd5e1" strokeDasharray="4 4" />
      </> : <>
        <rect x={OPENING_LEFT} y="20" width={OPENING_RIGHT - OPENING_LEFT} height="140" fill="#dbe5ee" stroke="#64748b" strokeWidth="1.5" />
        <rect x={OPENING_LEFT + 10} y="30" width={OPENING_RIGHT - OPENING_LEFT - 20} height="120" fill="#fff" stroke="#334155" strokeWidth="1.5" />
        <line x1={OPENING_LEFT + 10} x2={OPENING_RIGHT - 10} y1={CENTER_Y} y2={CENTER_Y} stroke="#cbd5e1" strokeDasharray="4 4" />
      </>}
      {lines.map(line => {
        const [x1, y1] = pointToSvg(line.start, openingWidthMm, depth, viewKind), [x2, y2] = pointToSvg(line.end, openingWidthMm, depth, viewKind)
        return <line key={line.id} x1={x1} y1={y1} x2={x2} y2={y2} className={selected === line.id ? 'is-selected' : ''} onPointerDown={event => beginEdit(event, line, 'line')} />
      })}
      {draft && <line x1={OPENING_LEFT + draftStartX - OPENING_LEFT} y1={draftStartY} x2={OPENING_LEFT + draftEndX - OPENING_LEFT} y2={draftEndY} className="cf-plan-symbol-draft" />}
      {selectedLine && (['start', 'end'] as const).map(part => {
        const [cx, cy] = pointToSvg(selectedLine[part], openingWidthMm, depth, viewKind)
        return <circle key={part} cx={cx} cy={cy} r="6" onPointerDown={event => beginEdit(event, selectedLine, part)} />
      })}
    </svg>
    {selectedLine && <div className="cf-plan-symbol-point-fields">
      {(['start', 'end'] as const).map(part => {
        const point = selectedLine[part]
        const isRatio = point.x_anchor === 'ratio'
        return <fieldset key={part}><legend>{part === 'start' ? 'ต้นเส้น' : 'ปลายเส้น'}</legend>
          <label>อ้างอิง x
            <select value={point.x_anchor} onChange={event => {
              if (!selectedLine) return
              const next = reanchorPoint(point, event.target.value as OpeningPlanSymbolPoint['x_anchor'], openingWidthMm)
              onChange(lines.map(line => line.id === selected ? { ...line, [part]: next } : line))
            }}>
              <option value="left">ขอบซ้าย</option><option value="center">กึ่งกลาง</option><option value="right">ขอบขวา</option><option value="ratio">สัดส่วนความกว้าง</option>
            </select>
          </label>
          {isRatio ? <label>ตำแหน่ง (%)<input type="number" min={0} max={100} step={1} value={Math.round((point.x_ratio ?? 0) * 100)} onChange={event => patchPoint(part, { x_ratio: Math.max(0, Math.min(1, Number(event.target.value) / 100)) })} /></label> : <label>ระยะจากจุดอ้างอิง (มม.)<input type="number" step={5} value={point.x_offset_mm} onChange={event => patchPoint(part, { x_offset_mm: Number(event.target.value) || 0 })} /></label>}
          <label>ตำแหน่ง X จากขอบซ้าย (มม.)<input type="number" min={0} max={openingWidthMm} step={5} value={Math.round(resolveOpeningPlanSymbolX(point, openingWidthMm))} onChange={event => {
            const currentY = viewKind === 'elevation' ? resolveOpeningPlanSymbolY(point, depth) : point.y_mm
            const next = movePoint(point, Math.max(0, Math.min(openingWidthMm, Number(event.target.value) || 0)), currentY, openingWidthMm, depth, viewKind)
            onChange(lines.map(line => line.id === selected ? { ...line, [part]: next } : line))
          }} /></label>
          {viewKind === 'elevation' && <label>จุดอ้างอิงแนวตั้ง
            <select value={point.y_anchor ?? 'center'} onChange={event => {
              const y = resolveOpeningPlanSymbolY(point, depth), anchor = event.target.value as NonNullable<OpeningPlanSymbolPoint['y_anchor']>
              const yBase = anchor === 'bottom' ? -depth / 2 : anchor === 'top' ? depth / 2 : anchor === 'ratio' ? y : 0
              onChange(lines.map(line => line.id === selected ? { ...line, [part]: { ...point, y_anchor: anchor, ...(anchor === 'ratio' ? { y_ratio: Math.max(0, Math.min(1, (y + depth / 2) / depth)) } : {}), y_mm: y - yBase } } : line))
            }}>
              <option value="bottom">ขอบล่าง/ธรณี</option><option value="center">กึ่งกลาง</option><option value="top">ขอบบน</option><option value="ratio">สัดส่วนความสูง</option>
            </select>
          </label>}
          {viewKind === 'elevation' && point.y_anchor === 'ratio' && <label>ตำแหน่งแนวตั้ง (%)<input type="number" min={0} max={100} value={Math.round((point.y_ratio ?? 0.5) * 100)} onChange={event => patchPoint(part, { y_ratio: Math.max(0, Math.min(1, Number(event.target.value) / 100)) })} /></label>}
          <label>{viewKind === 'elevation' ? 'ระยะจากจุดอ้างอิงแนวตั้ง (มม.)' : 'ระยะข้ามผนัง (มม.)'}<input type="number" step={5} value={point.y_mm} onChange={event => patchPoint(part, { y_mm: Number(event.target.value) || 0 })} /></label>
        </fieldset>
      })}
    </div>}
    <p className="cf-help">ลากเพื่อวาด · พิกัดเป็นมิลลิเมตร · เส้นผูกกับขอบ/กึ่งกลาง/สัดส่วนของช่องเปิด จึงปรับตามมิติโมเดลเมื่อเปลี่ยนขนาด</p>
    <small>ช่องเปิด {openingWidthMm.toLocaleString()} × {viewKind === 'elevation' ? 'สูง' : 'ผนัง'} {depth} มม. · {lines.length} เส้น</small>
  </div>
}
