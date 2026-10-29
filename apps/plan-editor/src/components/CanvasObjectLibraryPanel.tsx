import React, { useMemo, useState } from 'react'
import { BookOpen, Check, Search, X } from 'lucide-react'
import type { FamilyDefinition, TypeDefinition } from '@constructflow/project-model'
import { resolveFamilyParameters } from '@constructflow/project-model'
import { typeDescription, typeSizeLabel, TypeThumbnail } from './catalogPresentation.js'
import { FamilyThumbnail } from './FamilyThumbnail.js'

export type CanvasLibraryCategory = 'door' | 'window' | 'furniture'

const categoryLabels: Record<CanvasLibraryCategory, string> = {
  door: 'ประตู', window: 'หน้าต่าง', furniture: 'เฟอร์นิเจอร์',
}

export function CanvasObjectLibraryPanel({
  category,
  types,
  families,
  activeDoorType,
  activeWindowType,
  activeFamilyId,
  displayUnit,
  onSelectType,
  onSelectFamily,
  onOpenFamilyStudio,
  onOpenTypeCatalog,
  onClose,
  embedded = false,
}: {
  category: CanvasLibraryCategory
  types: TypeDefinition[]
  families: FamilyDefinition[]
  activeDoorType: string
  activeWindowType: string
  activeFamilyId?: string
  displayUnit: import('@constructflow/project-model').DisplayLengthUnit
  onSelectType: (category: 'door' | 'window', type: TypeDefinition) => void
  onSelectFamily: (family: FamilyDefinition, typeId?: string) => void
  onOpenFamilyStudio: () => void
  onOpenTypeCatalog: () => void
  onClose: () => void
  embedded?: boolean
}) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredTypes = useMemo(() => types.filter(type => !normalizedQuery ||
    `${type.name} ${typeDescription(type)} ${typeSizeLabel(type, displayUnit)}`.toLocaleLowerCase().includes(normalizedQuery)), [types, normalizedQuery, displayUnit])
  const filteredFamilies = useMemo(() => families.filter(family => !normalizedQuery || family.name.toLocaleLowerCase().includes(normalizedQuery)), [families, normalizedQuery])
  const activeTypeName = category === 'door' ? activeDoorType : activeWindowType
  const title = categoryLabels[category]

  return <div className={`cf-canvas-library${embedded ? ' is-embedded' : ''}`} role="region" aria-label={`คลัง${categoryLabels[category]}`} onPointerDown={event => event.stopPropagation()}>
    <header className="cf-canvas-library-header cf-canvas-library-compact-header">
      <div><h2>คลัง{title}</h2></div>
      <button type="button" className="cf-canvas-library-close" aria-label={`ปิดคลัง${title}`} title="ปิดคลัง · กลับไปวางบนแปลน" onClick={onClose}><X size={18} /></button>
    </header>
    <label className="cf-canvas-library-search"><Search size={17} aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={`ค้นหา${categoryLabels[category]}...`} aria-label={`ค้นหา${categoryLabels[category]}`} />{query && <button type="button" aria-label="ล้างคำค้น" onClick={() => setQuery('')}><X size={15} /></button>}</label>
    <div className="cf-canvas-library-results" aria-live="polite">
      {category !== 'furniture' ? <>
        <div className="cf-canvas-library-count">{query ? `พบ ${filteredTypes.length} แบบ` : `${types.length} แบบ`}</div>
        <div className="cf-canvas-library-grid">
          {filteredTypes.map(type => {
            const selected = type.name === activeTypeName
            return <button key={type.id} type="button" className={`cf-canvas-library-card${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={() => onSelectType(category, type)}>
              <span className="cf-canvas-library-art"><TypeThumbnail type={type} /></span>
              <span className="cf-canvas-library-card-title"><strong>{type.name}</strong>{selected && <Check size={14} aria-label="เลือกอยู่" />}</span>
              <span className="cf-canvas-library-size">{typeSizeLabel(type, displayUnit)}</span>
              <span className="cf-canvas-library-description">{typeDescription(type)}</span>
            </button>
          })}
          {!filteredTypes.length && <p className="cf-canvas-library-empty">ไม่พบแบบ ลองค้นหาด้วยชื่อหรือขนาด</p>}
        </div>
      </> : <>
        <div className="cf-canvas-library-count">{query ? `พบ ${filteredFamilies.length} family` : `${families.length} family`}</div>
        <div className="cf-canvas-library-grid">
          {filteredFamilies.map(family => {
            const selected = family.id === activeFamilyId
            const type = family.types[0]
            let dimensions = ''
            try {
              const values = resolveFamilyParameters(family, type?.id)
              dimensions = [values.W, values.D].filter(Number.isFinite).map(value => `${(value! / 1000).toFixed(2)} m`).join(' × ')
            } catch { /* Invalid imported families remain discoverable and editable in Family Studio. */ }
            return <button key={family.id} type="button" className={`cf-canvas-library-card${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={() => onSelectFamily(family, type?.id)}>
              <span className="cf-canvas-library-art"><FamilyThumbnail family={family} /></span>
              <span className="cf-canvas-library-card-title"><strong>{family.name}</strong>{selected && <Check size={14} aria-label="เลือกอยู่" />}</span>
              <span className="cf-canvas-library-size">{dimensions || 'Family BIM'}{family.types.length > 1 ? ` · ${family.types.length} แบบ` : ''}</span>
              <span className="cf-canvas-library-description">{type?.name ?? 'Family ที่แก้ไขพารามิเตอร์ได้'}</span>
            </button>
          })}
          {!filteredFamilies.length && <p className="cf-canvas-library-empty">ยังไม่มี Family นี้ ลองสร้างหรือนำเข้าจาก Family Studio</p>}
        </div>
      </>}
    </div>
    <footer className="cf-canvas-library-footer">
      <span>{category === 'furniture' ? 'แตะตำแหน่งกึ่งกลางเพื่อวาง · แตะซ้ำเพื่อวางต่อ' : 'เลือกแบบแล้วแตะผนังเพื่อวางต่อ'}</span>
      <div>
        {category === 'furniture'
          ? <button type="button" onClick={onOpenFamilyStudio}><BookOpen size={15} /> Family Studio</button>
          : <button type="button" onClick={onOpenTypeCatalog}><BookOpen size={15} /> จัดการแบบ</button>}
      </div>
    </footer>
  </div>
}
