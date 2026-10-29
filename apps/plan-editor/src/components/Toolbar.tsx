import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  MousePointer,
  BrickWall,
  DoorOpen,
  Shapes,
  SlidersHorizontal,
  Ruler,
  Upload,
  Eye,
  EyeOff,
  Trash2,
  Eraser,
  Layers,
  House,
  Repeat2,
  ClipboardList,
  ClipboardCheck,
  PaintBucket,
  MoreHorizontal,
  AppWindow,
  Square,
  Minus,
  Hash,
  Columns,
  Hand,
  Pencil,
} from 'lucide-react'
import { canSelectToolScope } from './planSelectionScope.js'

export type ToolType =
  | 'select'
  | 'pan'
  | 'draw'
  | 'column'
  | 'foundation'
  | 'beam'
  | 'wall'
  | 'door'
  | 'window'
  | 'slab'
  | 'slabVoid'
  | 'archFloor'
  | 'ceiling'
  | 'roof'
  | 'pipe'
  | 'fixture'
  | 'cabinet'
  | 'furniture'
  | 'moulding'
  | 'roomSeparator'
  | 'stair'
  | 'grid'
  | 'gridSystem'
  | 'gridCopy'
  | 'measure'
  | 'fill'
  | 'dimension'
  | 'calibrate'
  | 'erase'
  | 'bundle'

interface ToolbarProps {
  orientation?: 'horizontal' | 'vertical'
  activeTool: ToolType
  selectionScope?: ToolType | null
  onSelectScope?: (tool: ToolType) => void
  lastPlacementTool?: ToolType
  onSelectTool: (tool: ToolType) => void
  onRepeatLastTool?: () => void
  activeColumnType: string
  onChangeActiveColumnType: (type: string) => void
  activeFoundationType: string
  onChangeActiveFoundationType: (type: string) => void
  activeBeamType: string
  onChangeActiveBeamType: (type: string) => void
  activeWallType: string
  onChangeActiveWallType: (type: string) => void
  activeDoorType: string
  onChangeActiveDoorType: (type: string) => void
  activeWindowType: string
  onChangeActiveWindowType: (type: string) => void
  columnTypes: { name: string; section_mm?: [number, number] }[]
  foundationTypes: { name: string; size_mm?: [number, number, number] }[]
  beamTypes: { name: string; section_mm?: [number, number] }[]
  wallTypes: { name: string; thickness_mm?: number; masonry_thickness_mm?: number; plaster_inside_thickness_mm?: number; plaster_outside_thickness_mm?: number }[]
  doorTypes: { name: string; width_mm?: number; height_mm?: number; opening_operation?: string; panel_count?: number; panel_layout?: string[]; panel_width_ratios?: number[]; transom_height_mm?: number; muntin_rows?: number; muntin_columns?: number }[]
  windowTypes: { name: string; width_mm?: number; height_mm?: number; opening_operation?: string; panel_count?: number; panel_layout?: string[]; panel_width_ratios?: number[]; transom_height_mm?: number; bottom_light_height_mm?: number; muntin_rows?: number; muntin_columns?: number }[]
  underlayHasImage?: boolean
  underlayVisible?: boolean
  underlayOpacity?: number
  underlayLabel?: string
  onToggleUnderlayVisible?: () => void
  onChangeUnderlayOpacity?: (opacity: number) => void
  onUploadUnderlayImage?: (file: File) => void
  onClearUnderlay?: () => void
  onOpenTypeManager: () => void
  onOpenTakeoff: () => void
  onOpenFieldForms: () => void
  contextOpen?: boolean
  externalPanelOpen?: boolean
  onContextOpenChange?: (open: boolean) => void
  onContextCategoryChange?: (category: string) => void
}

export const Toolbar: React.FC<ToolbarProps> = ({
  orientation = 'horizontal',
  activeTool,
  selectionScope = null,
  onSelectScope,
  lastPlacementTool = 'wall',
  onSelectTool,
  onRepeatLastTool,
  underlayHasImage,
  underlayVisible,
  underlayOpacity,
  underlayLabel,
  onToggleUnderlayVisible,
  onChangeUnderlayOpacity,
  onUploadUnderlayImage,
  onClearUnderlay,
  onOpenTypeManager,
  onOpenTakeoff,
  onOpenFieldForms,
  contextOpen = false,
  externalPanelOpen = false,
  onContextOpenChange,
  onContextCategoryChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modeBubbleTimerRef = useRef<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory>(() => categoryForTool(activeTool))
  const [tabletLayout, setTabletLayout] = useState(false)
  const [modeBubbleOpen, setModeBubbleOpen] = useState(false)
  const [modeBubbleTop, setModeBubbleTop] = useState<number | null>(null)

  const clearModeBubbleTimer = () => {
    if (modeBubbleTimerRef.current !== null) {
      window.clearTimeout(modeBubbleTimerRef.current)
      modeBubbleTimerRef.current = null
    }
  }
  const dismissModeBubble = (delay = 0) => {
    clearModeBubbleTimer()
    modeBubbleTimerRef.current = window.setTimeout(() => {
      setModeBubbleOpen(false)
      modeBubbleTimerRef.current = null
    }, delay)
  }
  const revealModeBubble = (anchor: HTMLElement, tool: ToolType) => {
    clearModeBubbleTimer()
    const bounds = anchor.getBoundingClientRect()
    setModeBubbleTop(bounds.top + bounds.height / 2)
    setModeBubbleOpen(true)
    window.requestAnimationFrame(() => {
      const rail = document.querySelector<HTMLElement>('.cf-tool-secondary-rail')
      if (!rail) return
      const railHeight = rail.getBoundingClientRect().height
      const headerBottom = document.querySelector('.cf-app-header')?.getBoundingClientRect().bottom ?? 0
      const minTop = headerBottom + 10
      const maxTop = Math.max(minTop, window.innerHeight - railHeight - 10)
      const wantedTop = bounds.top + bounds.height / 2 - railHeight / 2
      const top = Math.max(minTop, Math.min(maxTop, wantedTop))
      setModeBubbleTop(top + railHeight / 2)
    })
    modeBubbleTimerRef.current = window.setTimeout(() => {
      setModeBubbleOpen(false)
      modeBubbleTimerRef.current = null
    }, 8500)
  }
  useEffect(() => () => clearModeBubbleTimer(), [])

  const tools: { id: ToolType; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'select', label: 'เลือก (S)', icon: <MousePointer size={16} />, shortcut: 'S' },
    { id: 'pan', label: 'เลื่อนมุมมอง · Pan (H)', icon: <Hand size={16} />, shortcut: 'H' },
    { id: 'draw', label: 'วาดเส้น', icon: <Pencil size={16} />, shortcut: '' },
    { id: 'erase', label: 'ยางลบ (E)', icon: <Eraser size={16} />, shortcut: 'E' },
    { id: 'column', label: 'เสา (C)', icon: <Columns size={16} />, shortcut: 'C' },
    { id: 'foundation', label: 'ฐานราก (F)', icon: <Square size={16} />, shortcut: 'F' },
    { id: 'beam', label: 'คาน (B)', icon: <Minus size={16} strokeWidth={3} />, shortcut: 'B' },
    { id: 'wall', label: 'ผนัง (W)', icon: <BrickWall size={16} />, shortcut: 'W' },
    { id: 'door', label: 'ประตู (D)', icon: <DoorOpen size={16} />, shortcut: 'D' },
    { id: 'window', label: 'หน้าต่าง (N)', icon: <AppWindow size={16} />, shortcut: 'N' },
    { id: 'slab', label: 'พื้น (P)', icon: <Layers size={16} />, shortcut: 'P' },
    { id: 'slabVoid', label: 'ช่องเปิดพื้น', icon: <Square size={16} />, shortcut: '' },
    { id: 'archFloor', label: 'พื้นสถาปัตย์ (Shift+P)', icon: <Layers size={16} />, shortcut: 'Shift+P' },
    { id: 'ceiling', label: 'ฝ้าเพดาน (Shift+C)', icon: <Layers size={16} />, shortcut: 'Shift+C' },
    { id: 'roof', label: 'หลังคา (Q)', icon: <House size={16} />, shortcut: 'Q' },
    { id: 'pipe', label: 'แนวท่อ (U)', icon: <Minus size={16} />, shortcut: 'U' },
    { id: 'fixture', label: 'อุปกรณ์ไฟฟ้า (L)', icon: <Layers size={16} />, shortcut: 'L' },
    { id: 'cabinet', label: 'บิลท์อิน (K)', icon: <Square size={16} />, shortcut: 'K' },
    { id: 'furniture', label: 'เฟอร์นิเจอร์ (V)', icon: <House size={16} />, shortcut: 'V' },
    { id: 'moulding', label: 'แนวบัว (J)', icon: <Minus size={16} />, shortcut: 'J' },
    { id: 'roomSeparator', label: 'เส้นแบ่งห้อง (Shift+R)', icon: <Minus size={16} />, shortcut: 'Shift+R' },
    {
      id: 'stair',
      label: 'บันได (T)',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19h4v-4h4v-4h4v-4h4" />
        </svg>
      ),
      shortcut: 'T',
    },
    { id: 'grid', label: 'เส้นกริด (G)', icon: <Hash size={16} />, shortcut: 'G' },
    { id: 'gridSystem', label: 'ระบบ Grid Line (Shift+G)', icon: <Layers size={16} />, shortcut: 'Shift+G' },
    { id: 'measure', label: 'ตลับเมตร (M)', icon: <Ruler size={16} />, shortcut: 'M' },
    { id: 'fill', label: 'Fill / Hatch', icon: <PaintBucket size={16} />, shortcut: '' },
    { id: 'dimension', label: 'บอกระยะ (Shift+M) · เลือกสองจุดแล้ววางเส้นระยะ', icon: <Ruler size={16} />, shortcut: 'Shift+M' },
    { id: 'calibrate', label: 'ปรับสเกลภาพ (R)', icon: <Ruler size={16} />, shortcut: 'R' },
  ]

  const availableTools = tools.filter(tool => tool.id !== 'calibrate' || (underlayHasImage && underlayVisible))
  const categories: { id: ToolCategory; label: string; icon: React.ReactNode; tools: ToolType[] }[] = [
    { id: 'select', label: 'เลือก', icon: <MousePointer size={18} />, tools: ['select', 'pan'] },
    { id: 'draw', label: 'วาด', icon: <Pencil size={18} />, tools: ['draw'] },
    { id: 'wall', label: 'ผนัง', icon: <BrickWall size={18} />, tools: ['wall'] },
    { id: 'openings', label: 'ช่องเปิด', icon: <DoorOpen size={18} />, tools: ['door', 'window'] },
    { id: 'shapes', label: 'รูปทรง', icon: <Shapes size={18} />, tools: ['archFloor', 'ceiling', 'roof', 'cabinet', 'furniture', 'moulding', 'roomSeparator', 'stair', 'slabVoid'] },
    { id: 'fill', label: 'Fill', icon: <PaintBucket size={18} />, tools: ['fill'] },
    { id: 'measure', label: 'วัด/เขียน', icon: <Ruler size={18} />, tools: ['measure', 'dimension', 'grid', 'gridSystem', 'calibrate', 'erase'] },
    { id: 'more', label: 'เพิ่มเติม', icon: <MoreHorizontal size={18} />, tools: ['column', 'foundation', 'beam', 'slab', 'pipe', 'fixture'] },
  ]
  const activeCategory = selectionScope
    ? categories.find(category => category.tools.includes(selectionScope))?.id ?? 'more'
    : categories.find(category => category.tools.includes(activeTool))?.id ?? 'more'
  const currentCategory = categories.find(category => category.id === selectedCategory) ?? categories[0]!
  const categoryTools = availableTools.filter(tool => currentCategory.tools.includes(tool.id))
  const scopeTool = selectionScope && currentCategory.tools.includes(selectionScope) && canSelectToolScope(selectionScope)
    ? selectionScope
    : currentCategory.tools.includes(activeTool) && canSelectToolScope(activeTool)
      ? activeTool
      : currentCategory.tools.find(canSelectToolScope)
  const contextTarget = typeof document === 'undefined' ? null : document.getElementById('cf-tool-category-content')
  const tabletContextTarget = typeof document === 'undefined' ? null : document.getElementById('cf-tool-category-rail-content')

  useEffect(() => { setSelectedCategory(activeCategory) }, [activeCategory])
  useEffect(() => {
    const query = window.matchMedia('(min-width: 700px)')
    const update = () => setTabletLayout(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (tabletLayout) onContextOpenChange?.(false)
    else {
      clearModeBubbleTimer()
      setModeBubbleOpen(false)
    }
  }, [tabletLayout])
  useEffect(() => {
    if (contextOpen) {
      clearModeBubbleTimer()
      setModeBubbleOpen(false)
    }
  }, [contextOpen])

  const activateCategory = (category: typeof categories[number], anchor: HTMLButtonElement) => {
    const sameCategory = selectedCategory === category.id
    if (sameCategory && (contextOpen || externalPanelOpen || modeBubbleOpen)) {
      onContextCategoryChange?.('')
      onContextOpenChange?.(false)
      clearModeBubbleTimer()
      setModeBubbleOpen(false)
      return
    }
    setSelectedCategory(category.id)
    onContextCategoryChange?.(category.id)
    const nextTool = category.tools.includes(activeTool) ? activeTool : category.tools[0]
    if (nextTool) onSelectTool(nextTool)
    if (tabletLayout) {
      onContextOpenChange?.(false)
      const hasDrawingModes = ['wall', 'draw', 'fill', 'measure'].includes(category.id)
      if ((category.tools.length > 1 || hasDrawingModes) && nextTool) revealModeBubble(anchor, nextTool)
      else dismissModeBubble()
    } else onContextOpenChange?.(true)
  }

  const selectTool = (tool: ToolType) => {
    setSelectedCategory(categoryForTool(tool))
    onSelectTool(tool)
    if (tabletLayout) {
      onContextOpenChange?.(false)
      dismissModeBubble(220)
    } else onContextOpenChange?.(true)
  }

  const selectScope = (tool: ToolType) => {
    setSelectedCategory(categoryForTool(tool))
    onSelectScope?.(tool)
    if (tabletLayout) {
      onContextOpenChange?.(false)
      dismissModeBubble(220)
    } else onContextOpenChange?.(true)
  }

  const categoryPanel = contextOpen && <div className="cf-tool-category-panel">
    <div className="cf-tool-category-heading"><strong>{currentCategory.label}</strong><span>{currentCategory.id === 'wall' ? 'เลือกรูปแบบวาดจากแถบไอคอนโหมดย่อย' : 'เลือกเครื่องมือเพื่อเริ่มทำงาน'}</span></div>
    {scopeTool && <button type="button" className={`cf-tool-category-scope${selectionScope === scopeTool ? ' is-active' : ''}`} aria-pressed={selectionScope === scopeTool} onClick={() => selectScope(scopeTool)}><MousePointer size={15} /><span>เลือกเฉพาะ{toolLabel(scopeTool)}</span></button>}
    <div className="cf-tool-category-list" role="group" aria-label={`เครื่องมือหมวด${currentCategory.label}`}>
      {categoryTools.map(tool => <button key={tool.id} type="button" className={activeTool === tool.id ? 'is-active' : ''} aria-pressed={activeTool === tool.id} onClick={() => selectTool(tool.id)}>
        {tool.icon}<span>{toolLabel(tool.id)}</span><kbd>{tool.shortcut}</kbd>
      </button>)}
      {!categoryTools.length && <p>ไม่มีเครื่องมือในหมวดนี้</p>}
    </div>
    <div className="cf-tool-category-utilities">
      {onRepeatLastTool && <button type="button" onClick={onRepeatLastTool} title={`ใช้เครื่องมือล่าสุดซ้ำ (${lastPlacementTool})`}><Repeat2 size={15} /><span>ใช้ซ้ำ</span></button>}
      <button type="button" onClick={onOpenTypeManager}><SlidersHorizontal size={15} /><span>คลังชนิด</span></button>
      <button type="button" onClick={onOpenTakeoff}><ClipboardList size={15} /><span>ปริมาณ / BOQ</span></button>
      <button type="button" onClick={onOpenFieldForms}><ClipboardCheck size={15} /><span>บันทึกหน้างาน</span></button>
    </div>
    <div className="cf-tool-category-underlay">
      <input ref={fileInputRef} type="file" accept="image/*,.pdf,application/pdf,.dxf,application/dxf,.dwg,application/acad,application/x-acad" onChange={event => {
        const file = event.target.files?.[0]
        if (file) onUploadUnderlayImage?.(file)
        event.currentTarget.value = ''
      }} />
      {!underlayHasImage
        ? <button type="button" onClick={() => fileInputRef.current?.click()}><Upload size={15} />นำเข้าแบบอ้างอิง</button>
        : <>
          <button type="button" onClick={onToggleUnderlayVisible} title={underlayLabel}>{underlayVisible ? <Eye size={15} /> : <EyeOff size={15} />}{underlayVisible ? 'ซ่อนแบบ' : 'แสดงแบบ'}</button>
          <label><span>ความทึบ {Math.round((underlayOpacity ?? .6) * 100)}%</span><input type="range" min=".1" max="1" step=".05" value={underlayOpacity ?? .6} onChange={event => onChangeUnderlayOpacity?.(Number(event.target.value))} /></label>
          <button type="button" className="is-danger" onClick={onClearUnderlay}><Trash2 size={15} />เอาออก</button>
        </>}
    </div>
  </div>

  const tabletToolModes = <div className="cf-tool-mode-rail-list" role="toolbar" aria-label={`เครื่องมือหมวด${currentCategory.label}`}>
    {scopeTool && <button
      type="button"
      className={selectionScope === scopeTool ? 'is-active' : ''}
      aria-label={`เลือกเฉพาะ${toolLabel(scopeTool)}`}
      aria-pressed={selectionScope === scopeTool}
      title={`เลือกเฉพาะ${toolLabel(scopeTool)} · ลากครอบหรือแตะเพื่อเลือก`}
      onClick={() => selectScope(scopeTool)}
    ><MousePointer size={18} /><span>เลือกเฉพาะ{toolLabel(scopeTool)}</span></button>}
    {(currentCategory.tools.length === 1 ? [] : categoryTools.filter(tool => !(activeTool === 'measure' && tool.id === 'measure'))).map(tool => <button
      key={tool.id}
      type="button"
      className={activeTool === tool.id ? 'is-active' : ''}
      aria-label={toolLabel(tool.id)}
      aria-pressed={activeTool === tool.id}
      title={`${toolLabel(tool.id)}${tool.shortcut ? ` · ${tool.shortcut}` : ''}`}
      onClick={() => selectTool(tool.id)}
    >{tool.icon}<span className="cf-visually-hidden">{toolLabel(tool.id)}</span></button>)}
    {currentCategory.id === 'openings' && categoryTools.length === 0 && <span className="cf-tool-mode-empty">—</span>}
    {currentCategory.tools.length > 1 && <details className="cf-tool-mode-utilities">
      <summary aria-label="คำสั่งเพิ่มเติม" title="คำสั่งเพิ่มเติม"><MoreHorizontal size={18} /></summary>
      <div className="cf-tool-utility-popover" aria-label="คำสั่งเพิ่มเติม">
        {onRepeatLastTool && <button type="button" aria-label="ใช้เครื่องมือล่าสุดซ้ำ" title={`ใช้เครื่องมือล่าสุดซ้ำ (${lastPlacementTool})`} onClick={onRepeatLastTool}><Repeat2 size={17} /><span>ใช้ซ้ำ</span></button>}
        <button type="button" aria-label="เปิดคลังชนิด" title="คลังชนิด" onClick={onOpenTypeManager}><SlidersHorizontal size={17} /><span>คลังชนิด</span></button>
        <button type="button" aria-label="เปิดปริมาณและ BOQ" title="ปริมาณ / BOQ" onClick={onOpenTakeoff}><ClipboardList size={17} /><span>ปริมาณ / BOQ</span></button>
        <button type="button" aria-label="เปิดบันทึกหน้างาน" title="แบบฟอร์มและสำรวจหน้างาน" onClick={onOpenFieldForms}><ClipboardCheck size={17} /><span>หน้างาน</span></button>
        <details className="cf-tool-underlay-menu">
          <summary aria-label="แบบอ้างอิง" title="แบบอ้างอิง">{underlayVisible ? <Eye size={17} /> : <Upload size={17} />}<span>แบบอ้างอิง</span></summary>
        <div className="cf-tool-underlay-menu-content">
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,application/pdf,.dxf,application/dxf,.dwg,application/acad,application/x-acad" onChange={event => {
            const file = event.target.files?.[0]
            if (file) onUploadUnderlayImage?.(file)
            event.currentTarget.value = ''
          }} />
          {!underlayHasImage
            ? <button type="button" onClick={() => fileInputRef.current?.click()}><Upload size={15} />นำเข้าแบบอ้างอิง</button>
            : <>
              <button type="button" onClick={onToggleUnderlayVisible}>{underlayVisible ? <EyeOff size={15} /> : <Eye size={15} />}{underlayVisible ? 'ซ่อนแบบ' : 'แสดงแบบ'}</button>
              <label><span>ความทึบ {Math.round((underlayOpacity ?? .6) * 100)}%</span><input type="range" min=".1" max="1" step=".05" value={underlayOpacity ?? .6} onChange={event => onChangeUnderlayOpacity?.(Number(event.target.value))} /></label>
              <button type="button" className="is-danger" onClick={onClearUnderlay}><Trash2 size={15} />เอาออก</button>
            </>}
        </div>
        </details>
      </div>
    </details>}
  </div>

  return <>
    <div className={`cf-toolbar cf-toolbar-${orientation}`} aria-label="หมวดเครื่องมือ">
      <div className="cf-tool-category-buttons">
        {categories.map(category => {
          const hasModes = ['wall', 'draw', 'fill', 'measure'].includes(category.id) || category.tools.length > 1
          const scopedTool = selectionScope && category.tools.includes(selectionScope) ? selectionScope : null
          const categoryName = scopedTool ? `เลือกเฉพาะ${toolLabel(scopedTool)}` : category.label
          const categoryHint = scopedTool
            ? `${categoryName} · ลากครอบหรือแตะเพื่อเลือก · แตะอีกครั้งเพื่อกลับไปวาด`
            : `${category.label}${hasModes ? ' · แตะเพื่อเลือกรูปแบบ' : ''}`
          return <button key={category.id} type="button" className={`${selectedCategory === category.id ? 'is-active' : ''}${scopedTool ? ' is-scoped-selection' : ''}`} data-has-modes={hasModes || undefined} aria-label={categoryHint} aria-expanded={hasModes && selectedCategory === category.id ? modeBubbleOpen : undefined} aria-pressed={selectedCategory === category.id} title={categoryHint}
          onClick={event => activateCategory(category, event.currentTarget)}
        >{scopedTool ? <MousePointer size={18} /> : category.icon}<span>{scopedTool ? `เลือก${toolLabel(scopedTool)}` : category.label}</span></button>
        })}
      </div>
      <div className={`cf-tool-secondary-rail${modeBubbleOpen ? ' is-open' : ''}`} aria-label="ตัวเลือกเครื่องมือย่อย" aria-hidden={!modeBubbleOpen} style={modeBubbleTop === null ? undefined : { top: modeBubbleTop }}
        onPointerEnter={event => { if (event.pointerType !== 'touch') clearModeBubbleTimer() }}
        onPointerLeave={event => { if (event.pointerType !== 'touch' && modeBubbleOpen) dismissModeBubble(450) }}
        onFocusCapture={clearModeBubbleTimer}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dismissModeBubble(450) }}
        onClick={event => { if ((event.target as Element).closest('button')) dismissModeBubble(220) }}
        onPointerDown={event => event.stopPropagation()}>
        <div id="cf-tool-category-rail-content" className="cf-tool-mode-rail" aria-live="polite" />
        <div id="cf-tool-draw-mode-content" className="cf-tool-draw-mode-rail" />
      </div>
    </div>
    {categoryPanel && contextTarget ? createPortal(categoryPanel, contextTarget) : null}
    {tabletLayout && tabletContextTarget ? createPortal(tabletToolModes, tabletContextTarget) : null}
  </>
}

type ToolCategory = 'select' | 'draw' | 'wall' | 'openings' | 'shapes' | 'fill' | 'measure' | 'more'

function categoryForTool(tool: ToolType): ToolCategory {
  if (tool === 'select') return 'select'
  if (tool === 'pan') return 'select'
  if (tool === 'draw') return 'draw'
  if (tool === 'wall') return 'wall'
  if (tool === 'door' || tool === 'window') return 'openings'
  if (tool === 'fill') return 'fill'
  if (tool === 'measure' || tool === 'dimension' || tool === 'grid' || tool === 'gridSystem' || tool === 'calibrate' || tool === 'erase') return 'measure'
  if (['archFloor', 'ceiling', 'roof', 'cabinet', 'furniture', 'moulding', 'roomSeparator', 'stair', 'slabVoid'].includes(tool)) return 'shapes'
  return 'more'
}

export function toolLabel(tool: ToolType) {
  return ({
    select: 'เลือกวัตถุ', pan: 'เลื่อนมุมมอง', draw: 'วาดเส้นอิสระ', wall: 'ผนัง', door: 'ประตู', window: 'หน้าต่าง', archFloor: 'พื้นสถาปัตย์', ceiling: 'ฝ้าเพดาน',
    roof: 'หลังคา', cabinet: 'บิลท์อิน', furniture: 'เฟอร์นิเจอร์', moulding: 'แนวบัว', roomSeparator: 'เส้นแบ่งห้อง',
    stair: 'บันได', fill: 'Fill / Hatch', measure: 'วัดระยะ', dimension: 'บอกระยะ', grid: 'เส้นกริด', gridSystem: 'ระบบกริด',
    calibrate: 'ปรับสเกลภาพ', erase: 'ยางลบ', column: 'เสา', foundation: 'ฐานราก', beam: 'คาน', slab: 'พื้นโครงสร้าง',
    pipe: 'แนวท่อ', fixture: 'อุปกรณ์ไฟฟ้า', slabVoid: 'ช่องเปิดพื้น', gridCopy: 'คัดลอกกริด', bundle: 'ชุดสินค้า',
  } as Record<ToolType, string>)[tool]
}
