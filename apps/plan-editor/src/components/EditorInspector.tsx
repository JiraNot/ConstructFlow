import React, { lazy, Suspense, type ComponentProps } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
import { PropertiesPanel } from './PropertiesPanel.js'
import { X } from 'lucide-react'

type InspectorTab = 'properties' | 'quantities' | 'objects' | 'ai' | 'extensions' | 'coordination'

const TakeoffPanel = lazy(() => import('./TakeoffPanel.js').then(module => ({ default: module.TakeoffPanel })))
const ProjectBrowser = lazy(() => import('./ProjectBrowser.js').then(module => ({ default: module.ProjectBrowser })))
const CoordinationPanel = lazy(() => import('./CoordinationPanel.js').then(module => ({ default: module.CoordinationPanel })))
const AICommandPanel = lazy(() => import('./AICommandPanel.js').then(module => ({ default: module.AICommandPanel })))
const ModuleExtensionsPanel = lazy(() => import('./ModuleExtensionsPanel.js').then(module => ({ default: module.ModuleExtensionsPanel })))

interface EditorInspectorProps {
  onCloseInspector?: () => void
  activeTab: InspectorTab
  onActiveTabChange: (tab: InspectorTab) => void
  project: ProjectDocument
  selectedId: string | null
  selectedIds: string[]
  properties: ComponentProps<typeof PropertiesPanel>
  onOpenConstruction: () => void
  onExportTakeoff: () => void
  onExportBOQ: () => void
  coordination: ComponentProps<typeof CoordinationPanel>
  ai: ComponentProps<typeof AICommandPanel>
  extensions: ComponentProps<typeof ModuleExtensionsPanel>
  browser: ComponentProps<typeof ProjectBrowser>
}

/** Right-side editor panels. App owns project/session orchestration; this component owns panel presentation. */
export const EditorInspector: React.FC<EditorInspectorProps> = ({
  activeTab, onActiveTabChange, onCloseInspector, project, selectedId, selectedIds, properties,
  onOpenConstruction, onExportTakeoff, onExportBOQ, coordination, ai, extensions, browser,
}) => (
  (() => {
    const section: 'edit' | 'project' | 'tools' = activeTab === 'properties' ? 'edit' : activeTab === 'objects' || activeTab === 'quantities' ? 'project' : 'tools'
    const selectSection = (next: 'edit' | 'project' | 'tools') => onActiveTabChange(next === 'edit' ? 'properties' : next === 'project' ? 'objects' : 'ai')
    const subTabs = section === 'edit'
      ? [{ id: 'properties' as const, label: 'คุณสมบัติ' }]
      : section === 'project'
        ? [{ id: 'objects' as const, label: 'รายการ' }, { id: 'quantities' as const, label: 'ปริมาณ' }]
        : [{ id: 'ai' as const, label: 'AI' }, { id: 'extensions' as const, label: 'ส่วนขยาย' }, { id: 'coordination' as const, label: 'ตรวจระยะ' }]
    return (
  <aside className="cf-inspector">
    <div className="cf-inspector-heading">
      <div><strong>แผงข้อมูล</strong><span>{selectedIds.length > 1 ? `เลือกอยู่ ${selectedIds.length} ชิ้น · เปลี่ยน Type หรือ Delete พร้อมกันได้` : selectedId ? 'คุณสมบัติวัตถุและปริมาณ' : 'เลือกวัตถุบนแปลนเพื่อแก้ไข'}</span></div>
      {onCloseInspector && <button type="button" className="cf-inspector-close" aria-label="ปิดแผงข้อมูล" onClick={onCloseInspector}><X size={17} /></button>}
    </div>
    <div className="cf-inspector-tabs" role="tablist" aria-label="หมวดแผงข้อมูล">
      <button type="button" role="tab" aria-selected={section === 'edit'} className={section === 'edit' ? 'is-active' : ''} onClick={() => selectSection('edit')}>แก้ไข</button>
      <button type="button" role="tab" aria-selected={section === 'project'} className={section === 'project' ? 'is-active' : ''} onClick={() => selectSection('project')}>โครงการ</button>
      <button type="button" role="tab" aria-selected={section === 'tools'} className={section === 'tools' ? 'is-active' : ''} onClick={() => selectSection('tools')}>เครื่องมือ</button>
    </div>
    {subTabs.length > 1 && <div className="cf-inspector-subtabs" role="tablist" aria-label={section === 'project' ? 'ข้อมูลโครงการ' : 'เครื่องมือโครงการ'}>
      {subTabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'is-active' : ''} onClick={() => onActiveTabChange(tab.id)} title={tab.id === 'ai' ? 'วางแผนคำสั่งด้วย AI แล้วตรวจสอบก่อนใช้' : tab.id === 'extensions' ? 'เรียกใช้คำสั่งจาก extension ผ่าน CommandBus' : tab.id === 'coordination' ? 'ตรวจสอบระยะชนและความสัมพันธ์ระหว่างระบบ' : undefined}>
        {tab.label}{tab.id === 'coordination' && coordination.report && coordination.report.summary.by_severity.hard > 0 ? <span className="cf-inspector-alert-count">{coordination.report.summary.by_severity.hard}</span> : null}
      </button>)}
    </div>}

    {activeTab === 'properties' && <div className="cf-inspector-content"><PropertiesPanel {...properties} /></div>}

    {activeTab === 'quantities' && <Suspense fallback={<div role="status" className="cf-inspector-content">กำลังคำนวณปริมาณ…</div>}>
      <TakeoffPanel project={project} onOpenConstruction={onOpenConstruction} onExportTakeoff={onExportTakeoff} onExportBOQ={onExportBOQ} />
    </Suspense>}

    {activeTab === 'coordination' && <Suspense fallback={<div role="status" className="cf-inspector-content">กำลังเปิดเครื่องมือตรวจระยะ…</div>}><CoordinationPanel {...coordination} /></Suspense>}
    {activeTab === 'ai' && <Suspense fallback={<div role="status" className="cf-inspector-content">กำลังเปิด AI…</div>}><AICommandPanel {...ai} /></Suspense>}
    {activeTab === 'extensions' && <Suspense fallback={<div role="status" className="cf-inspector-content">กำลังเปิดส่วนขยาย…</div>}><ModuleExtensionsPanel {...extensions} /></Suspense>}
    {activeTab === 'objects' && <Suspense fallback={<div role="status" className="cf-inspector-content">กำลังเปิดรายการวัตถุ…</div>}><ProjectBrowser {...browser} /></Suspense>}
  </aside>
    )
  })()
)
