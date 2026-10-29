import React, { useEffect, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, FolderOpen, Search, Tag } from 'lucide-react'
import type { LocalProjectLibraryEntry } from '../projectAutosave.js'
import { Dialog } from './ui/Dialog.js'

type Filter = 'active' | 'archived' | 'all'

interface LocalProjectLibraryModalProps {
  isOpen: boolean
  currentProjectId: string
  onClose: () => void
  onOpenProject: (projectId: string) => void
}

export function LocalProjectLibraryModal({ isOpen, currentProjectId, onClose, onOpenProject }: LocalProjectLibraryModalProps) {
  const [entries, setEntries] = useState<LocalProjectLibraryEntry[]>([])
  const [filter, setFilter] = useState<Filter>('active')
  const [query, setQuery] = useState('')
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const refresh = async () => {
    try {
      const { listLocalProjectLibrary } = await import('../projectAutosave.js')
      setEntries(await listLocalProjectLibrary())
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'อ่านคลังโครงการไม่สำเร็จ')
    }
  }

  useEffect(() => { if (isOpen) void refresh() }, [isOpen])

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return entries.filter(entry => (filter === 'all' || entry.archived === (filter === 'archived'))
      && (!normalizedQuery || `${entry.name} ${entry.tags.join(' ')} ${entry.project_id}`.toLocaleLowerCase().includes(normalizedQuery)))
  }, [entries, filter, query])

  const updateEntry = async (projectId: string, changes: Partial<Pick<LocalProjectLibraryEntry, 'archived' | 'tags'>>) => {
    setBusyId(projectId)
    setError('')
    try {
      const { updateLocalProjectLibraryEntry } = await import('../projectAutosave.js')
      const updated = await updateLocalProjectLibraryEntry(projectId, changes)
      setEntries(current => current.map(entry => entry.project_id === projectId ? updated : entry))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกข้อมูลโครงการไม่สำเร็จ')
    } finally {
      setBusyId('')
    }
  }

  const addTag = (entry: LocalProjectLibraryEntry) => {
    const tag = (tagDrafts[entry.project_id] ?? '').trim().replace(/\s+/g, ' ').slice(0, 32)
    if (!tag || entry.tags.some(existing => existing.toLocaleLowerCase() === tag.toLocaleLowerCase())) return
    if (entry.tags.length >= 12) { setError('โครงการหนึ่งรายการมีป้ายได้ไม่เกิน 12 ป้าย'); return }
    setTagDrafts(current => ({ ...current, [entry.project_id]: '' }))
    void updateEntry(entry.project_id, { tags: [...entry.tags, tag] })
  }

  if (!isOpen) return null

  return <Dialog title="โครงการในอุปกรณ์" subtitle="ค้นหาและจัดกลุ่มงานที่บันทึกออฟไลน์ · ป้ายและสถานะเก็บในอุปกรณ์นี้" onClose={onClose} className="cf-local-project-library-dialog">
    <div className="cf-local-project-library-toolbar">
      <label><Search size={17} aria-hidden="true" /><input autoFocus type="search" aria-label="ค้นหาโครงการในเครื่อง" placeholder="ค้นหาชื่อ ป้าย หรือ Project ID" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div role="group" aria-label="กรองโครงการ">
        {([['active', 'กำลังทำ'], ['archived', 'เก็บเข้าคลัง'], ['all', 'ทั้งหมด']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
    </div>
    {error && <p className="cf-local-project-library-error" role="alert">{error}</p>}
    <div className="cf-local-project-library-list" aria-live="polite">
      {visibleEntries.map(entry => <article className="cf-local-project-card" key={entry.project_id} data-archived={entry.archived}>
        <div className="cf-local-project-card-heading">
          <div><h3>{entry.name}</h3><p>{entry.level_count} ชั้น · {entry.object_count.toLocaleString('th-TH')} วัตถุ · บันทึกล่าสุด {new Date(entry.saved_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</p></div>
          {entry.archived && <span className="cf-local-project-archived-label"><Archive size={13} /> เก็บเข้าคลัง</span>}
          {entry.project_id === currentProjectId && <span className="cf-local-project-current-label">กำลังเปิด</span>}
        </div>
        <div className="cf-local-project-tags" aria-label={`ป้ายของ ${entry.name}`}>
          {entry.tags.map(tag => <span key={tag}><Tag size={12} />{tag}<button type="button" disabled={busyId === entry.project_id} aria-label={`ลบป้าย ${tag}`} onClick={() => void updateEntry(entry.project_id, { tags: entry.tags.filter(value => value !== tag) })}>×</button></span>)}
          {!entry.tags.length && <small>ยังไม่มีป้าย</small>}
        </div>
        <form className="cf-local-project-add-tag" onSubmit={event => { event.preventDefault(); addTag(entry) }}>
          <input aria-label={`เพิ่มป้ายให้ ${entry.name}`} maxLength={32} placeholder="เพิ่มป้าย เช่น ต่อเติม, รออนุมัติ" value={tagDrafts[entry.project_id] ?? ''} onChange={event => setTagDrafts(current => ({ ...current, [entry.project_id]: event.target.value }))} />
          <button type="submit" disabled={busyId === entry.project_id || !(tagDrafts[entry.project_id] ?? '').trim()}>เพิ่มป้าย</button>
        </form>
        <footer>
          <button type="button" className="cf-button cf-button-primary" disabled={busyId === entry.project_id} onClick={() => onOpenProject(entry.project_id)}><FolderOpen size={15} />เปิดโครงการ</button>
          <button type="button" className="cf-button cf-button-quiet" disabled={busyId === entry.project_id} onClick={() => void updateEntry(entry.project_id, { archived: !entry.archived })}>{entry.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{entry.archived ? 'นำกลับมาทำต่อ' : 'เก็บเข้าคลัง'}</button>
          <small title={entry.project_id}>ID · {entry.project_id.slice(0, 8)}</small>
        </footer>
      </article>)}
      {!visibleEntries.length && <div className="cf-local-project-library-empty"><FolderOpen size={24} /><strong>{entries.length ? 'ไม่พบโครงการที่ตรงกับตัวกรอง' : 'ยังไม่มีโครงการที่บันทึกในอุปกรณ์นี้'}</strong><span>ใช้ปุ่มบันทึกในเครื่องเพื่อเพิ่มโครงการลงในรายการนี้</span></div>}
    </div>
  </Dialog>
}
