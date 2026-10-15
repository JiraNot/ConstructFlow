import React from 'react'
import type { EditorViewMode } from '../app/useMultiViewPreferences.js'

type ViewModePickerProps = {
  viewMode: EditorViewMode
  onChange: (mode: EditorViewMode) => void
}

const iconPaths: Record<'framing' | 'roofplan' | 'rcp' | 'model3d', React.ReactNode> = {
  framing: <><path d="M4 7h16M4 12h16M4 17h16" /><path d="M8 5v14m8-14v14" /></>,
  roofplan: <><path d="m3 11 9-7 9 7" /><path d="M6 10v10h12V10M9 20v-6h6v6" /></>,
  rcp: <><path d="M4 4h16v16H4z" /><path d="M4 10h16M10 4v16" /></>,
  model3d: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.7 7.5 4.4 7.5-4.4M12 12v9" /></>,
}

const auxiliaryViews = [
  ['framing', 'แปลนคาน'],
  ['roofplan', 'แปลนหลังคา'],
  ['rcp', 'แปลนฝ้า RCP'],
  ['model3d', '3D ดูตัวอย่าง'],
] as const

const directions = [
  { mode: 'north', label: 'รูปด้านเหนือ', glyph: 'N', position: 'north' },
  { mode: 'east', label: 'รูปด้านตะวันออก', glyph: 'E', position: 'east' },
  { mode: 'south', label: 'รูปด้านใต้', glyph: 'S', position: 'south' },
  { mode: 'west', label: 'รูปด้านตะวันตก', glyph: 'W', position: 'west' },
] as const

const ViewIcon = ({ name }: { name: keyof typeof iconPaths }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {iconPaths[name]}
  </svg>
)

const mobileViews = [
  { mode: 'plan', label: 'แปลนพื้น', icon: <svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM9 4v7h7v9M4 11h5m7-7v3" /></svg> },
  { mode: 'framing', label: 'แปลนคาน', icon: <ViewIcon name="framing" /> },
  { mode: 'roofplan', label: 'แปลนหลังคา', icon: <ViewIcon name="roofplan" /> },
  { mode: 'north', label: 'รูปด้านเหนือ', icon: <span>↑</span> },
  { mode: 'south', label: 'รูปด้านใต้', icon: <span>↓</span> },
  { mode: 'east', label: 'รูปด้านตะวันออก', icon: <span>→</span> },
  { mode: 'west', label: 'รูปด้านตะวันตก', icon: <span>←</span> },
  { mode: 'rcp', label: 'แปลนฝ้า RCP', icon: <ViewIcon name="rcp" /> },
  { mode: 'model3d', label: '3D ดูตัวอย่าง', icon: <ViewIcon name="model3d" /> },
] as const

export const ViewModePicker: React.FC<ViewModePickerProps> = ({ viewMode, onChange }) => (
  <nav className="cf-view-switch" aria-label="เลือกมุมมอง">
    <div className="cf-view-compass" role="group" aria-label="แปลนและรูปด้าน">
      {directions.map(({ mode, label, glyph, position }) => (
        <button
          key={mode}
          type="button"
          className={`cf-view-compass-direction is-${position}${viewMode === mode ? ' is-active' : ''}`}
          aria-label={label}
          aria-pressed={viewMode === mode}
          title={label}
          onClick={() => onChange(mode)}
        >
          <span aria-hidden="true">{glyph}</span>
        </button>
      ))}
      <button
        type="button"
        className={`cf-view-compass-plan${viewMode === 'plan' ? ' is-active' : ''}`}
        aria-label="แปลนพื้น"
        aria-pressed={viewMode === 'plan'}
        title="แปลนพื้น"
        onClick={() => onChange('plan')}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16v16H4zM9 4v7h7v9M4 11h5m7-7v3" />
        </svg>
      </button>
      <span className="cf-view-compass-north-mark" aria-hidden="true">▲</span>
    </div>
    <div className="cf-view-icon-group" role="group" aria-label="มุมมองเพิ่มเติม">
      {auxiliaryViews.map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          className={`cf-view-icon-button${viewMode === mode ? ' is-active' : ''}`}
          aria-label={label}
          aria-pressed={viewMode === mode}
          title={label}
          onClick={() => onChange(mode)}
        >
          <ViewIcon name={mode} />
        </button>
      ))}
    </div>
    <div className="cf-view-mobile-list" role="group" aria-label="มุมมองทั้งหมด">
      {mobileViews.map(({ mode, label, icon }) => (
        <button
          key={mode}
          type="button"
          className={`cf-view-mobile-option${viewMode === mode ? ' is-active' : ''}`}
          aria-label={label}
          aria-pressed={viewMode === mode}
          onClick={() => onChange(mode as EditorViewMode)}
        >
          <span className="cf-view-mobile-option-icon" aria-hidden="true">{icon}</span>
          <span>{label}</span>
          {viewMode === mode && <span className="cf-view-mobile-current">ปัจจุบัน</span>}
        </button>
      ))}
    </div>
  </nav>
)
