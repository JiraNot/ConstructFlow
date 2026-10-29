import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, Clock3, Cloud, Download, GitCompareArrows, History, KeyRound, LoaderCircle, Save, Unplug, Upload, X } from 'lucide-react'
import type { ProjectDocument } from '@constructflow/project-model'
import {
  createLocalProjectRevision, exportLocalProjectRevisionBundle, importLocalProjectRevisionBundle,
  deleteLocalCollaborationToken, getLocalCollaborationToken, listLocalProjectRevisions, loadLocalProjectRevision,
  saveLocalCollaborationToken, type LocalProjectRevision,
} from '../projectAutosave.js'
import { syncProjectRevisionHistory } from '../revisionSync.js'
import { ProjectTeamMembers } from './ProjectTeamMembers.js'

interface ProjectVersionHistoryModalProps {
  project: ProjectDocument
  onClose: () => void
  onRestore: (revisionId: string, project: ProjectDocument) => Promise<boolean>
}

const timeLabel = (value: string) => new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
const sameSnapshot = (left: unknown, right: unknown): boolean => {
  const pending: Array<[unknown, unknown]> = [[left, right]]
  while (pending.length) {
    const [a, b] = pending.pop()!
    if (Object.is(a, b)) continue
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      for (let index = 0; index < a.length; index += 1) pending.push([a[index], b[index]])
      continue
    }
    const aRecord = a as Record<string, unknown>
    const bRecord = b as Record<string, unknown>
    const aKeys = Object.keys(aRecord), bKeys = Object.keys(bRecord)
    if (aKeys.length !== bKeys.length) return false
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bRecord, key)) return false
      pending.push([aRecord[key], bRecord[key]])
    }
  }
  return true
}

const objectDescription = (value: ProjectDocument['objects'][string], id: string) =>
  `${value.object_type} · ${id.slice(0, 8)} · ${value.created_phase}`

const levelDescription = (value: ProjectDocument['levels'][number]) =>
  `${value.name} · ${value.elevation_mm.toLocaleString('th-TH')} mm`

const projectInfoSnapshot = (project: ProjectDocument) => {
  const { updated_at: _updatedAt, ...projectInfo } = project.project
  return projectInfo
}

const changedPropertyPaths = (left: unknown, right: unknown, prefix = '', paths: string[] = [], depth = 0): string[] => {
  if (paths.length >= 5 || sameSnapshot(left, right)) return paths
  if (depth >= 6 || !left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) || Array.isArray(right)) {
    if (prefix) paths.push(prefix)
    return paths
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])
  for (const key of keys) {
    if (key === 'updated_at' || key === 'revision_meta') continue
    const path = prefix ? `${prefix}.${key}` : key
    changedPropertyPaths(leftRecord[key], rightRecord[key], path, paths, depth + 1)
    if (paths.length >= 5) break
  }
  return paths
}

export const ProjectVersionHistoryModal: React.FC<ProjectVersionHistoryModalProps> = ({ project, onClose, onRestore }) => {
  const [revisions, setRevisions] = useState<LocalProjectRevision[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [selectedProject, setSelectedProject] = useState<ProjectDocument | null>(null)
  const [label, setLabel] = useState('จุดบันทึกด้วยตนเอง')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [transferMessage, setTransferMessage] = useState('')
  const [collaborationToken, setCollaborationToken] = useState('')
  const [collaborationConfigured, setCollaborationConfigured] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = async (selectId?: string) => {
    const next = await listLocalProjectRevisions(project.project.id)
    setRevisions(next)
    const preferred = selectId ?? selectedId
    const resolved = next.some(revision => revision.id === preferred) ? preferred : next[0]?.id ?? ''
    setSelectedId(resolved)
  }

  useEffect(() => {
    let active = true
    void listLocalProjectRevisions(project.project.id).then(items => {
      if (!active) return
      setRevisions(items)
      setSelectedId(items[0]?.id ?? '')
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [project.project.id])

  useEffect(() => {
    let active = true
    void getLocalCollaborationToken().then(settings => {
      if (active && settings) { setCollaborationToken(settings.token); setCollaborationConfigured(true) }
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selectedId) { setSelectedProject(null); return }
    let active = true
    setSelectedProject(null)
    void loadLocalProjectRevision(selectedId).then(value => { if (active) setSelectedProject(value) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { active = false }
  }, [selectedId])

  const revision = revisions.find(item => item.id === selectedId) ?? null
  const comparison = useMemo(() => {
    if (!selectedProject) return null
    const current = project.objects, restored = selectedProject.objects
    const currentIds = Object.keys(current), restoredIds = Object.keys(restored)
    const restoredSet = new Set(restoredIds), currentSet = new Set(currentIds)
    const objectChanges = [
      ...restoredIds.filter(id => !currentSet.has(id)).map(id => ({ id, kind: 'added' as const, label: objectDescription(restored[id], id) })),
      ...currentIds.filter(id => !restoredSet.has(id)).map(id => ({ id, kind: 'removed' as const, label: objectDescription(current[id], id) })),
      ...restoredIds.filter(id => currentSet.has(id) && !sameSnapshot(current[id], restored[id]))
        .map(id => ({ id, kind: 'changed' as const, label: objectDescription(restored[id], id), changes: changedPropertyPaths(current[id], restored[id]) })),
    ]
    const currentLevels = new Map(project.levels.map(level => [level.id, level]))
    const restoredLevels = new Map(selectedProject.levels.map(level => [level.id, level]))
    const levelChanges = [
      ...selectedProject.levels.filter(level => !currentLevels.has(level.id)).map(level => ({ id: level.id, kind: 'added' as const, label: levelDescription(level) })),
      ...project.levels.filter(level => !restoredLevels.has(level.id)).map(level => ({ id: level.id, kind: 'removed' as const, label: levelDescription(level) })),
      ...selectedProject.levels.filter(level => {
        const currentLevel = currentLevels.get(level.id)
        return currentLevel && !sameSnapshot(currentLevel, level)
      }).map(level => ({ id: level.id, kind: 'changed' as const, label: levelDescription(level) })),
    ]
    const projectSections = [
      { key: 'project', label: 'ข้อมูลโครงการ', current: projectInfoSnapshot(project), restored: projectInfoSnapshot(selectedProject) },
      { key: 'phases', label: 'เฟสงาน', current: project.phases, restored: selectedProject.phases },
      { key: 'types', label: 'ชนิดวัตถุและ Type Catalog', current: project.types, restored: selectedProject.types },
      { key: 'relationships', label: 'ความสัมพันธ์ของวัตถุ', current: project.relationships, restored: selectedProject.relationships },
      { key: 'takeoff_rates', label: 'ราคา BOQ', current: project.takeoff_rates, restored: selectedProject.takeoff_rates },
      { key: 'commercial', label: 'ข้อเสนอ · Change Orders · ใบแจ้งหนี้', current: [project.proposal_drafts, project.change_orders, project.invoices], restored: [selectedProject.proposal_drafts, selectedProject.change_orders, selectedProject.invoices] },
      { key: 'field', label: 'แบบฟอร์มและบันทึกภาคสนาม', current: [project.field_forms, project.field_photo_inspections], restored: [selectedProject.field_forms, selectedProject.field_photo_inspections] },
      { key: 'references', label: 'แบบอ้างอิง · สำรวจ · การตั้งค่าแบบ', current: [project.underlays, project.site_survey, project.drawing_settings, project.view_settings], restored: [selectedProject.underlays, selectedProject.site_survey, selectedProject.drawing_settings, selectedProject.view_settings] },
    ].filter(section => !sameSnapshot(section.current, section.restored))
    return {
      added: objectChanges.filter(item => item.kind === 'added').length,
      removed: objectChanges.filter(item => item.kind === 'removed').length,
      changed: objectChanges.filter(item => item.kind === 'changed').length,
      objectChanges,
      levelChanges,
      projectSections,
      oldObjects: currentIds.length,
      revisionObjects: restoredIds.length,
      oldLevels: project.levels.length,
      revisionLevels: selectedProject.levels.length,
    }
  }, [project, selectedProject])

  const createCheckpoint = async () => {
    setBusy(true); setError(''); setTransferMessage(''); setConfirmRestore(false)
    try {
      const saved = await createLocalProjectRevision(project, label)
      await refresh(saved.id)
      setLabel('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  const exportHistory = async () => {
    setBusy(true); setError(''); setTransferMessage('')
    try {
      const bundle = await exportLocalProjectRevisionBundle(project.project.id)
      const content = JSON.stringify(bundle, null, 2)
      if (new Blob([content]).size > 100_000_000) throw new Error('ไฟล์ประวัติมีขนาดเกิน 100 MB')
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
      const anchor = document.createElement('a')
      const safeName = project.project.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'project'
      anchor.href = url
      anchor.download = `${safeName}.cfrevisions.json`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setTransferMessage(`ส่งออก ${bundle.revisions.length} เวอร์ชันแล้ว · ย้ายไฟล์นี้ไปยังอุปกรณ์ปลายทาง`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  const importHistory = async (file: File | null) => {
    if (!file) return
    setBusy(true); setError(''); setTransferMessage(''); setConfirmRestore(false)
    try {
      if (file.size > 100_000_000) throw new Error('ไฟล์ประวัติต้องไม่เกิน 100 MB')
      const payload: unknown = JSON.parse(await file.text())
      const result = await importLocalProjectRevisionBundle(project.project.id, payload)
      await refresh(result.revision_ids[0])
      setTransferMessage(`เพิ่ม ${result.imported} เวอร์ชัน · ซ้ำ ${result.deduplicated} · เก็บเป็น conflict ${result.conflicts} รายการ`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
      setBusy(false)
    }
  }

  const saveTeamToken = async () => {
    setError(''); setTransferMessage('')
    try {
      const saved = await saveLocalCollaborationToken(collaborationToken)
      setCollaborationToken(saved.token); setCollaborationConfigured(true)
      setTransferMessage('บันทึกโทเคนทีมไว้บนอุปกรณ์นี้แล้ว')
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const disconnectTeam = async () => {
    try {
      await deleteLocalCollaborationToken()
      setCollaborationToken(''); setCollaborationConfigured(false)
      setTransferMessage('ลบโทเคนทีมออกจากอุปกรณ์นี้แล้ว'); setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const syncWithTeam = async () => {
    if (!collaborationConfigured || !collaborationToken) { setError('บันทึกโทเคนทีมก่อนซิงค์'); return }
    setBusy(true); setError(''); setTransferMessage('')
    try {
      const result = await syncProjectRevisionHistory(project, collaborationToken)
      await refresh()
      setTransferMessage(`ซิงค์แล้ว · เพิ่มบนเซิร์ฟเวอร์ ${result.uploaded} · ซ้ำ ${result.serverDeduplicated} · conflict ${result.serverConflicts} · รับเข้าเครื่อง ${result.imported}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  const restore = async () => {
    if (!revision || !selectedProject) return
    setBusy(true); setError('')
    try {
      if (await onRestore(revision.id, selectedProject)) onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false); setConfirmRestore(false) }
  }

  return <div className="cf-version-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="cf-version-dialog" role="dialog" aria-modal="true" aria-labelledby="cf-version-title" onKeyDown={event => { if (event.key === 'Escape' && !busy) onClose() }}>
      <header className="cf-version-heading"><div><span><History size={14} /> ประวัติในเครื่อง · {project.project.name}</span><h2 id="cf-version-title">เวอร์ชันโครงการ</h2></div><button type="button" aria-label="ปิดประวัติเวอร์ชัน" disabled={busy} onClick={onClose}><X size={19} /></button></header>
      <p className="cf-version-offline-note">เก็บในเครื่อง · 30 จุดล่าสุดและเก็บ conflict ไว้ · ส่งออกไฟล์เพื่อย้ายประวัติไปอีกอุปกรณ์ได้</p>
      <div className="cf-version-transfer">
        <button type="button" disabled={busy || !revisions.length} onClick={() => void exportHistory()}><Download size={15} />ส่งออกประวัติ</button>
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={15} />นำเข้าจากอุปกรณ์</button>
        <input ref={fileRef} type="file" accept=".json,.cfrevisions.json,application/json" hidden aria-label="นำเข้าไฟล์ประวัติเวอร์ชัน" onChange={event => { void importHistory(event.currentTarget.files?.[0] ?? null) }} />
      </div>
      <section className="cf-version-team-sync" aria-label="ซิงค์ประวัติกับทีม">
        <div className="cf-version-team-heading"><strong><Cloud size={15} /> ซิงค์ประวัติกับทีม</strong><span>{collaborationConfigured ? 'เชื่อมต่อด้วยโทเคนบนอุปกรณ์นี้' : 'ใช้โทเคนที่ผู้ดูแลทีมออกให้'}</span></div>
        <div className="cf-version-team-controls"><label><KeyRound size={14} /><input type="password" autoComplete="new-password" spellCheck={false} value={collaborationToken} placeholder="Collaboration token · 32 ตัวอักษรขึ้นไป" aria-label="โทเคน collaboration ของทีม" onChange={event => { setCollaborationToken(event.target.value); setCollaborationConfigured(false) }} /></label><button type="button" disabled={busy || collaborationToken.trim().length < 32} onClick={() => void saveTeamToken()}>{collaborationConfigured ? 'บันทึกใหม่' : 'บันทึกโทเคน'}</button><button type="button" className="is-primary" disabled={busy || !collaborationConfigured} onClick={() => void syncWithTeam()}>{busy ? <LoaderCircle className="cf-version-spinner" size={15} /> : <Cloud size={15} />} ซิงค์ตอนนี้</button>{collaborationConfigured && <button type="button" className="is-quiet" disabled={busy} onClick={() => void disconnectTeam()}><Unplug size={14} /> ตัดการเชื่อมต่อ</button>}</div>
        <p>ส่งเฉพาะประวัติของโครงการ UUID นี้ผ่าน same-origin gateway · ผู้ดูแลกำหนดสิทธิ์ owner/editor/viewer · viewer ดึงประวัติได้อย่างเดียว</p>
      </section>
      <ProjectTeamMembers projectId={project.project.id} token={collaborationToken} enabled={collaborationConfigured} />
      <div className="cf-version-create"><label>ชื่อจุดบันทึก<input value={label} maxLength={120} onChange={event => setLabel(event.target.value)} placeholder="เช่น ก่อนแก้แบบครัว" /></label><button type="button" disabled={busy || !label.trim()} onClick={() => void createCheckpoint()}><Save size={16} />บันทึกเวอร์ชันนี้</button></div>
      <div className="cf-version-content">
        <div className="cf-version-list" aria-label="รายการเวอร์ชัน">
          {revisions.length === 0 ? <div className="cf-version-empty"><Clock3 size={22} /><strong>ยังไม่มีเวอร์ชันที่บันทึกไว้</strong><span>สร้าง checkpoint เพื่อเริ่มเก็บประวัติโครงการ</span></div> : revisions.map(item => <button type="button" key={item.id} aria-pressed={item.id === selectedId} className={item.id === selectedId ? 'is-selected' : ''} onClick={() => { setSelectedId(item.id); setConfirmRestore(false); setError('') }}>
            <strong>{item.label}{item.conflict_with_revision_ids?.length ? <em className="cf-version-conflict-tag">Conflict</em> : null}</strong><span>{timeLabel(item.created_at)}</span><small>{item.object_count} วัตถุ · {item.level_count} ชั้น{item.origin_device_id ? ` · ${item.origin_device_id.slice(0, 8)}` : ''}</small>
          </button>)}
        </div>
        <section className="cf-version-detail" aria-label="เปรียบเทียบเวอร์ชัน">
          {!revision ? <div className="cf-version-empty"><History size={22} /><strong>เลือกหรือสร้างเวอร์ชัน</strong></div> : <>
            <div className="cf-version-detail-heading"><div><span>จุดบันทึกที่เลือก</span><strong>{revision.label}</strong><small>{timeLabel(revision.created_at)}</small></div>{busy && <LoaderCircle className="cf-version-spinner" size={18} />}</div>
            {!comparison ? <div className="cf-version-loading" role="status">กำลังตรวจ project model…</div> : <>
              <div className="cf-version-compare-title"><GitCompareArrows size={16} /> เทียบกับแบบที่เปิดอยู่</div>
              <div className="cf-version-diff-grid"><div><strong>{comparison.added}</strong><span>เพิ่มในเวอร์ชัน</span></div><div><strong>{comparison.removed}</strong><span>ไม่มีในเวอร์ชันนี้</span></div><div><strong>{comparison.changed}</strong><span>แก้ไขวัตถุ</span></div></div>
              <div className="cf-version-model-counts"><span>วัตถุ · ปัจจุบัน {comparison.oldObjects} → เวอร์ชัน {comparison.revisionObjects}</span><span>ชั้น · ปัจจุบัน {comparison.oldLevels} → เวอร์ชัน {comparison.revisionLevels}</span></div>
              <div className="cf-version-change-groups">
                {comparison.projectSections.length > 0 && <section><h3>ข้อมูลส่วนอื่นที่เปลี่ยน</h3><ul>{comparison.projectSections.map(item => <li key={item.key}>{item.label}</li>)}</ul></section>}
                {comparison.levelChanges.length > 0 && <section><h3>ชั้นที่เปลี่ยน · {comparison.levelChanges.length}</h3><ul>{comparison.levelChanges.slice(0, 12).map(item => <li key={item.id}><span className={`cf-version-change-kind is-${item.kind}`}>{item.kind === 'added' ? 'เพิ่ม' : item.kind === 'removed' ? 'ลบ' : 'แก้ไข'}</span>{item.label}</li>)}</ul>{comparison.levelChanges.length > 12 && <small>และอีก {comparison.levelChanges.length - 12} ชั้น</small>}</section>}
                {comparison.objectChanges.length > 0 && <section><h3>วัตถุที่เปลี่ยน · {comparison.objectChanges.length}</h3><ul>{comparison.objectChanges.slice(0, 20).map(item => <li key={`${item.kind}-${item.id}`}><span className={`cf-version-change-kind is-${item.kind}`}>{item.kind === 'added' ? 'เพิ่ม' : item.kind === 'removed' ? 'ลบ' : 'แก้ไข'}</span><span className="cf-version-change-object"><strong>{item.label}</strong>{item.kind === 'changed' && item.changes.length > 0 && <small>ฟิลด์ที่เปลี่ยน: {item.changes.join(' · ')}</small>}</span></li>)}</ul>{comparison.objectChanges.length > 20 && <small>แสดง 20 รายการแรก · ยังมีอีก {comparison.objectChanges.length - 20} วัตถุ</small>}</section>}
                {comparison.projectSections.length === 0 && comparison.levelChanges.length === 0 && comparison.objectChanges.length === 0 && <p>ข้อมูลในเวอร์ชันนี้ตรงกับแบบที่เปิดอยู่</p>}
              </div>
              {confirmRestore ? <div className="cf-version-confirm" role="alert"><strong>คืนโมเดลกลับไปยังจุดบันทึกนี้?</strong><span>ระบบจะบันทึก checkpoint ของแบบปัจจุบันก่อน แล้วคืนข้อมูลผ่าน CommandBus เพื่อให้ Undo กลับได้</span><div><button type="button" disabled={busy} onClick={() => setConfirmRestore(false)}>ยกเลิก</button><button type="button" className="is-danger" disabled={busy || !selectedProject} onClick={() => void restore()}><ArrowDownToLine size={15} />ยืนยันคืนเวอร์ชัน</button></div></div> : <button type="button" className="cf-version-restore" disabled={busy || !selectedProject} onClick={() => setConfirmRestore(true)}><ArrowDownToLine size={16} />คืนเวอร์ชันนี้</button>}
            </>}
          </>}
        </section>
      </div>
      {transferMessage && <p className="cf-version-success" role="status">{transferMessage}</p>}
      {error && <p className="cf-version-error" role="alert">{error}</p>}
    </section>
  </div>
}
