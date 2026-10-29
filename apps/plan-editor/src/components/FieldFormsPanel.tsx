import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ClipboardCheck, Cloud, Download, FilePlus2, FileSpreadsheet, LoaderCircle, MapPin, Paperclip, Plus, Trash2, Upload } from 'lucide-react'
import type { CommandBatchResult, CommandRequest } from '@constructflow/command-schema'
import { FIELD_FORM_TEMPLATES, type FieldFormCategory, type FieldFormField, type FieldFormInputType, type FieldFormRecord, type FieldFormTemplate, type FieldFormValue, type ProjectDocument } from '@constructflow/project-model'
import { deleteLocalFieldFormTemplate, getLocalCollaborationToken, listLocalFieldFormTemplates, saveLocalFieldFormTemplate, type LocalFieldFormTemplate } from '../projectAutosave.js'
import { fieldFormCsvTemplate, parseFieldFormSpreadsheet, type FieldFormSpreadsheetPreview } from '../fieldFormSpreadsheet.js'
import { syncFieldPhotoAssets } from '../fieldPhotoSync.js'

interface FieldFormsPanelProps {
  project: ProjectDocument
  selectedIds: string[]
  onExecute: (commands: CommandRequest[]) => CommandBatchResult
  onCapturePhotoDimension: () => void
  onImportSiteSurvey: () => void
}

const inputTypeOptions: Array<{ value: FieldFormInputType; label: string }> = [
  { value: 'text', label: 'ข้อความสั้น' }, { value: 'long_text', label: 'ข้อความยาว' },
  { value: 'number', label: 'ตัวเลข' }, { value: 'date', label: 'วันที่' },
  { value: 'select', label: 'รายการเลือก' }, { value: 'checkbox', label: 'ช่องทำเครื่องหมาย' },
  { value: 'section', label: 'หัวข้อแบ่งกลุ่ม' },
]

const localDate = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}
const nowIso = () => new Date().toISOString()

const categoryOptions: Array<{ value: FieldFormCategory; label: string }> = [
  { value: 'site_visit', label: 'เข้าตรวจหน้างาน' }, { value: 'quality_inspection', label: 'ตรวจงาน' },
  { value: 'safety_observation', label: 'ความปลอดภัย' }, { value: 'client_request', label: 'คำขอลูกค้า' }, { value: 'custom', label: 'กำหนดเอง' },
]

function emptyFieldFormTemplate(): FieldFormTemplate {
  return {
    id: crypto.randomUUID(), category: 'site_visit', title: '', description: '',
    fields: [{ id: `field_${crypto.randomUUID()}`, label: '', input_type: 'text', required: false }],
  }
}

function createForm(templateId: string, project: ProjectDocument, selectedIds: string[], templates: FieldFormTemplate[]): FieldFormRecord {
  const template = templates.find(item => item.id === templateId)
  const fields: FieldFormField[] = template
    ? structuredClone(template.fields)
    : [{ id: 'details', label: 'รายละเอียด', input_type: 'long_text', required: true }]
  const responses: Record<string, FieldFormValue> = {}
  for (const item of fields) if (item.input_type === 'date') responses[item.id] = localDate()
  const timestamp = nowIso()
  return {
    id: crypto.randomUUID(), template_id: template?.id ?? 'custom-v1', category: template?.category ?? 'custom',
    title: template?.title ?? 'แบบฟอร์มหน้างานใหม่', status: 'draft', created_at: timestamp, updated_at: timestamp,
    level_id: project.project.active_level_id || undefined,
    linked_object_ids: [...new Set(selectedIds.filter(id => !!project.objects[id]))], photo_inspection_ids: [], fields, responses,
  }
}

function responseForField(field: FieldFormField, value: FieldFormValue | undefined, disabled: boolean, onChange: (value: FieldFormValue) => void) {
  const common = { disabled, required: field.required, 'aria-label': field.label }
  if (field.input_type === 'long_text') return <textarea {...common} rows={3} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} />
  if (field.input_type === 'select') return <select {...common} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || null)}>
    <option value="">เลือก…</option>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}
  </select>
  if (field.input_type === 'checkbox') return <input {...common} type="checkbox" checked={typeof value === 'boolean' ? value : false} onChange={event => onChange(event.target.checked)} />
  if (field.input_type === 'number') return <input {...common} type="number" step="any" value={typeof value === 'number' ? value : ''} onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))} />
  if (field.input_type === 'section') return null
  return <input {...common} type={field.input_type === 'date' ? 'date' : 'text'} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value)} />
}

/** Offline project forms, linked to stable model/photo UUIDs and saved through the project CommandBus. */
export const FieldFormsPanel: React.FC<FieldFormsPanelProps> = ({ project, selectedIds, onExecute, onCapturePhotoDimension, onImportSiteSurvey }) => {
  const records = project.field_forms ?? []
  const [localTemplates, setLocalTemplates] = useState<LocalFieldFormTemplate[]>([])
  const availableTemplates = useMemo<FieldFormTemplate[]>(() => [...FIELD_FORM_TEMPLATES, ...localTemplates], [localTemplates])
  const [activeId, setActiveId] = useState<string | null>(records[0]?.id ?? null)
  const [templateId, setTemplateId] = useState(FIELD_FORM_TEMPLATES[0]?.id ?? '')
  const [draft, setDraft] = useState<FieldFormRecord | null>(() => records[0] ? structuredClone(records[0]) : null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState<FieldFormInputType>('text')
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false)
  const [templateEditor, setTemplateEditor] = useState<FieldFormTemplate | null>(null)
  const [gpsCaptureBusy, setGpsCaptureBusy] = useState(false)
  const [selectedManagedTemplateId, setSelectedManagedTemplateId] = useState('')
  const [templateLibraryBusy, setTemplateLibraryBusy] = useState(false)
  const [templateLibraryError, setTemplateLibraryError] = useState('')
  const [templateLibraryMessage, setTemplateLibraryMessage] = useState('')
  const spreadsheetInputRef = useRef<HTMLInputElement>(null)
  const [spreadsheetBusy, setSpreadsheetBusy] = useState(false)
  const [spreadsheetFileName, setSpreadsheetFileName] = useState('')
  const [spreadsheetPreview, setSpreadsheetPreview] = useState<FieldFormSpreadsheetPreview | null>(null)
  const [spreadsheetError, setSpreadsheetError] = useState('')
  const [photoSyncBusy, setPhotoSyncBusy] = useState(false)
  const [photoSyncMessage, setPhotoSyncMessage] = useState('')
  const [photoSyncError, setPhotoSyncError] = useState('')
  const draftRef = useRef<FieldFormRecord | null>(draft)
  const gpsCaptureTokenRef = useRef(0)
  draftRef.current = draft
  const activeRecord = useMemo(() => records.find(item => item.id === activeId) ?? null, [records, activeId])
  const isSubmitted = draft?.status === 'submitted'

  const syncPhotos = async () => {
    if (photoSyncBusy) return
    setPhotoSyncBusy(true)
    setPhotoSyncMessage('')
    setPhotoSyncError('')
    try {
      const settings = await getLocalCollaborationToken()
      if (!settings) throw new Error('ตั้งค่า Collaboration token ของทีมในประวัติเวอร์ชันก่อนซิงค์ภาพ')
      const result = await syncFieldPhotoAssets(project, settings.token)
      const parts = [
        `อัปโหลด ${result.uploaded}`,
        `ดาวน์โหลด ${result.downloaded}`,
        `ตรงกันแล้ว ${result.already_shared}`,
      ]
      if (result.missing) parts.push(`ยังไม่มีในทีม/อัปโหลดไม่ได้ ${result.missing}`)
      if (result.conflicts.length) parts.push(`UUID ชนกัน ${result.conflicts.length}`)
      setPhotoSyncMessage(parts.join(' · '))
      if (result.conflicts.length) setPhotoSyncError(`พบภาพคนละเนื้อหาที่ใช้ UUID เดียวกัน ${result.conflicts.slice(0, 3).join(', ')} · ระบบเก็บของเดิมและไม่เขียนทับ`)
    } catch (reason) {
      setPhotoSyncError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setPhotoSyncBusy(false)
    }
  }

  useEffect(() => {
    let active = true
    void listLocalFieldFormTemplates().then(templates => { if (active) setLocalTemplates(templates) })
      .catch(error => { if (active) setTemplateLibraryError(error instanceof Error ? error.message : 'อ่าน Library แบบฟอร์มไม่สำเร็จ') })
    return () => { active = false }
  }, [])

  useEffect(() => () => { gpsCaptureTokenRef.current += 1 }, [])

  useEffect(() => {
    if (!activeId) { setDraft(null); return }
    const saved = records.find(item => item.id === activeId)
    if (saved && (!draft || draft.id !== saved.id || draft.updated_at !== saved.updated_at)) setDraft(structuredClone(saved))
    else if (!saved && draft?.id !== activeId) setDraft(null)
  }, [activeId, records, draft])

  const updateDraft = (change: (current: FieldFormRecord) => FieldFormRecord) => {
    setDraft(current => current ? change(current) : current)
    setMessage('')
    setError('')
  }

  const run = (next: FieldFormRecord, name = 'SaveFieldForm') => {
    const result = onExecute([{ name, input: name === 'DeleteFieldForm' ? { form_id: next.id } : { form: next } }])
    if (result.status !== 'success') {
      setError(result.errors?.join(' · ') ?? 'บันทึกแบบฟอร์มไม่สำเร็จ')
      setMessage('')
      return false
    }
    setDraft(structuredClone(next))
    setMessage(name === 'DeleteFieldForm' ? 'ลบแบบร่างแล้ว' : next.status === 'submitted' ? 'ส่งแบบฟอร์มและบันทึกในโครงการแล้ว' : 'บันทึกร่างในโครงการแล้ว')
    setError('')
    return true
  }

  const create = () => {
    const created = createForm(templateId, project, selectedIds, availableTemplates)
    gpsCaptureTokenRef.current += 1
    setGpsCaptureBusy(false)
    if (run(created)) setActiveId(created.id)
  }

  const editFieldTemplate = (id: string) => {
    setSelectedManagedTemplateId(id)
    setSpreadsheetPreview(null)
    const template = localTemplates.find(item => item.id === id)
    setTemplateEditor(template ? structuredClone(template) : null)
    setTemplateLibraryError('')
    setTemplateLibraryMessage('')
  }

  const saveFieldTemplate = async () => {
    if (!templateEditor) return
    setTemplateLibraryBusy(true)
    setTemplateLibraryError('')
    setTemplateLibraryMessage('')
    try {
      const saved = await saveLocalFieldFormTemplate(templateEditor)
      setLocalTemplates(await listLocalFieldFormTemplates())
      setSelectedManagedTemplateId(saved.id)
      setTemplateEditor(structuredClone(saved))
      setTemplateId(saved.id)
      setTemplateLibraryMessage(`บันทึกแม่แบบ “${saved.title}” แล้ว · เลือกไว้สำหรับสร้างแบบฟอร์มครั้งถัดไป`)
    } catch (error) {
      setTemplateLibraryError(error instanceof Error ? error.message : 'บันทึกแม่แบบฟอร์มไม่สำเร็จ')
    } finally { setTemplateLibraryBusy(false) }
  }

  const deleteFieldTemplate = async () => {
    if (!selectedManagedTemplateId || !templateEditor) return
    const title = templateEditor.title
    if (!window.confirm(`ลบแม่แบบ “${title}” จาก Company Library ในอุปกรณ์นี้หรือไม่? แบบฟอร์มที่สร้างไปแล้วจะยังเก็บข้อมูลเดิม`)) return
    setTemplateLibraryBusy(true)
    setTemplateLibraryError('')
    setTemplateLibraryMessage('')
    try {
      await deleteLocalFieldFormTemplate(selectedManagedTemplateId)
      setLocalTemplates(await listLocalFieldFormTemplates())
      setTemplateEditor(null)
      setSelectedManagedTemplateId('')
      if (templateId === selectedManagedTemplateId) setTemplateId(FIELD_FORM_TEMPLATES[0]?.id ?? '')
      setTemplateLibraryMessage(`ลบแม่แบบ “${title}” แล้ว · บันทึกที่มีอยู่ไม่เปลี่ยนแปลง`)
    } catch (error) {
      setTemplateLibraryError(error instanceof Error ? error.message : 'ลบแม่แบบฟอร์มไม่สำเร็จ')
    } finally { setTemplateLibraryBusy(false) }
  }

  const updateTemplateField = (index: number, changes: Partial<FieldFormField>) => setTemplateEditor(current => {
    if (!current) return current
    const fields = current.fields.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field
      const next = { ...field, ...changes }
      if (next.input_type === 'section') { next.required = false; delete next.options }
      else if (next.input_type === 'select') next.options = changes.options ?? (field.input_type === 'select' ? field.options : ['ตัวเลือก 1', 'ตัวเลือก 2'])
      else delete next.options
      return next
    })
    return { ...current, fields }
  })

  const saveDraft = () => { if (draft) run({ ...draft, updated_at: nowIso() }) }
  const captureGpsLocation = () => {
    if (!draft || isSubmitted || gpsCaptureBusy) return
    setMessage('')
    setError('')
    if (!window.isSecureContext) { setError('การระบุตำแหน่งต้องเปิดแอปผ่าน HTTPS หรือ localhost'); return }
    if (!navigator.geolocation) { setError('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง'); return }
    const targetFormId = draft.id
    const requestToken = ++gpsCaptureTokenRef.current
    setGpsCaptureBusy(true)
    navigator.geolocation.getCurrentPosition(position => {
      if (requestToken !== gpsCaptureTokenRef.current) return
      const currentDraft = draftRef.current
      if (!currentDraft || currentDraft.id !== targetFormId) return
      const capturedAt = new Date(position.timestamp || Date.now()).toISOString()
      const next: FieldFormRecord = {
        ...currentDraft,
        gps_location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
          captured_at: capturedAt,
        },
        updated_at: nowIso(),
      }
      setGpsCaptureBusy(false)
      if (run(next)) setMessage(`บันทึกตำแหน่ง GPS แล้ว · ความแม่นยำอุปกรณ์ ±${position.coords.accuracy.toFixed(0)} ม.`)
    }, positionError => {
      if (requestToken !== gpsCaptureTokenRef.current) return
      setGpsCaptureBusy(false)
      setMessage('')
      setError(positionError.code === positionError.PERMISSION_DENIED
        ? 'ยังไม่ได้รับอนุญาตใช้ตำแหน่ง · อนุญาต Location ในการตั้งค่าอุปกรณ์แล้วลองอีกครั้ง'
        : positionError.code === positionError.TIMEOUT
          ? 'รอตำแหน่งนานเกินไป · ตรวจสัญญาณ GPS แล้วลองอีกครั้ง'
          : 'อุปกรณ์ระบุตำแหน่งไม่ได้ · ตรวจการตั้งค่า Location แล้วลองอีกครั้ง')
    }, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 })
  }
  const clearGpsLocation = () => {
    if (!draft || isSubmitted || !draft.gps_location) return
    const { gps_location: _gpsLocation, ...withoutGpsLocation } = draft
    run({ ...withoutGpsLocation, updated_at: nowIso() })
  }
  const readFieldFormSpreadsheet = async (file: File | null) => {
    if (!file) return
    setSpreadsheetBusy(true)
    setSpreadsheetError('')
    setSpreadsheetPreview(null)
    try {
      const preview = await parseFieldFormSpreadsheet(file)
      setSpreadsheetFileName(file.name)
      setSpreadsheetPreview(preview)
    } catch (error) {
      setSpreadsheetError(error instanceof Error ? error.message : 'อ่าน spreadsheet ไม่สำเร็จ')
    } finally {
      setSpreadsheetBusy(false)
      if (spreadsheetInputRef.current) spreadsheetInputRef.current.value = ''
    }
  }

  const useSpreadsheetFields = () => {
    if (!spreadsheetPreview || spreadsheetPreview.issues.length || !spreadsheetPreview.fields.length) return
    const importedName = spreadsheetFileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 200)
    setSelectedManagedTemplateId('')
    setTemplateEditor({
      id: crypto.randomUUID(), category: 'custom', title: importedName || 'แม่แบบจาก Spreadsheet',
      description: 'นำเข้า ' + spreadsheetPreview.fields.length + ' ช่องจาก ' + spreadsheetFileName,
      fields: structuredClone(spreadsheetPreview.fields),
    })
    setTemplateLibraryError('')
    setTemplateLibraryMessage('ตรวจทานชื่อและช่องข้อมูลด้านล่าง แล้วกดเพิ่มเข้า Library เพื่อบันทึก')
    setSpreadsheetPreview(null)
    setSpreadsheetError('')
  }

  const downloadFieldFormCsvTemplate = () => {
    const url = URL.createObjectURL(new Blob([fieldFormCsvTemplate()], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'constructflow-field-questions-template.csv'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const submit = () => {
    if (!draft) return
    const timestamp = nowIso()
    run({ ...draft, status: 'submitted', submitted_at: timestamp, updated_at: timestamp })
  }
  const removeDraft = () => {
    if (!draft || !window.confirm('ลบแบบร่างนี้ออกจากโครงการหรือไม่?')) return
    if (run(draft, 'DeleteFieldForm')) {
      gpsCaptureTokenRef.current += 1
      setGpsCaptureBusy(false)
      const next = records.find(item => item.id !== draft.id)
      setActiveId(next?.id ?? null)
      setDraft(next ? structuredClone(next) : null)
    }
  }

  const attachSelection = () => updateDraft(current => ({ ...current, linked_object_ids: [...new Set([...current.linked_object_ids, ...selectedIds.filter(id => !!project.objects[id])])] }))
  const togglePhoto = (photoId: string, checked: boolean) => updateDraft(current => ({
    ...current,
    photo_inspection_ids: checked ? [...new Set([...current.photo_inspection_ids, photoId])] : current.photo_inspection_ids.filter(id => id !== photoId),
  }))

  return <section className="cf-field-forms" aria-label="แบบฟอร์มหน้างาน">
    <header className="cf-field-forms-heading">
      <div><div className="cf-field-forms-title"><ClipboardCheck size={17} /><h2>บันทึกหน้างาน</h2></div><p>เก็บแบบฟอร์มไว้ในไฟล์โครงการ ใช้งานออฟไลน์ได้</p></div>
      <span className="cf-field-forms-count">{records.length}</span>
    </header>
    <nav className="cf-field-quick-actions" aria-label="ทางลัดงานสำรวจหน้างาน">
      <button type="button" onClick={onCapturePhotoDimension}><Camera size={15} /> วัดระยะจากภาพ</button>
      <button type="button" onClick={onImportSiteSurvey}><Upload size={15} /> นำเข้าจุดสำรวจ</button>
      {project.site_survey && <span title={project.site_survey.name}><MapPin size={14} /> {project.site_survey.points.length} จุด</span>}
    </nav>

    {!!project.field_photo_inspections?.length && <section className="cf-field-media-sync" aria-label="ซิงค์รูปตรวจหน้างานกับทีม">
      <div><strong><Cloud size={15} /> รูปตรวจหน้างาน · {project.field_photo_inspections.length}</strong><small>แชร์ภาพตาม UUID กับทีม · ข้อมูลยังอยู่ในอุปกรณ์เมื่อออฟไลน์</small></div>
      <button type="button" onClick={() => void syncPhotos()} disabled={photoSyncBusy}>
        {photoSyncBusy ? <LoaderCircle className="cf-integration-spin" size={15} /> : <Cloud size={15} />}
        {photoSyncBusy ? 'กำลังซิงค์…' : 'ซิงค์ภาพกับทีม'}
      </button>
      {photoSyncMessage && <p className="cf-field-form-feedback" role="status">{photoSyncMessage}</p>}
      {photoSyncError && <p className="cf-field-form-feedback is-error" role="alert">{photoSyncError}</p>}
    </section>}

      <div className="cf-field-forms-create">
      <label htmlFor="cf-field-form-template">เริ่มจากแบบฟอร์ม</label>
      <div><select id="cf-field-form-template" value={templateId} onChange={event => setTemplateId(event.target.value)}>
        {FIELD_FORM_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.title}</option>)}
        {localTemplates.map(template => <option key={template.id} value={template.id}>{template.title} · Company</option>)}
        <option value="custom">แบบฟอร์มเปล่า</option>
      </select><button type="button" className="cf-field-primary" onClick={create}><FilePlus2 size={15} /> สร้าง</button></div>
    </div>

      <button type="button" className="cf-field-template-toggle" aria-expanded={templateManagerOpen} onClick={() => setTemplateManagerOpen(open => !open)}>
        {templateManagerOpen ? 'ปิดการจัดการแม่แบบ' : `จัดการ Company Field Library · ${localTemplates.length}`}
      </button>
      {templateManagerOpen && <section className="cf-field-template-manager" aria-label="จัดการ Company Field Library">
        <div className="cf-field-template-manager-heading"><div><strong>แม่แบบฟอร์มของบริษัท</strong><small>เก็บในอุปกรณ์นี้ · ส่งต่อข้ามอุปกรณ์ได้จาก Company Library JSON · คำตอบในโครงการเดิมไม่เปลี่ยน</small></div></div>
        <section className="cf-field-spreadsheet-import" aria-label="นำเข้าคำถามจาก spreadsheet">
          <div><strong><FileSpreadsheet size={15} /> นำเข้าคำถามจาก spreadsheet</strong><small>อ่าน CSV หรือ Excel แล้วตรวจตัวอย่างก่อนสร้างแม่แบบใหม่</small></div>
          <div className="cf-field-spreadsheet-actions">
            <button type="button" onClick={downloadFieldFormCsvTemplate}><Download size={14} /> ดาวน์โหลด CSV ตัวอย่าง</button>
            <button type="button" onClick={() => spreadsheetInputRef.current?.click()} disabled={spreadsheetBusy}>
              <Upload size={14} /> {spreadsheetBusy ? 'กำลังอ่านไฟล์…' : 'เลือก CSV / Excel'}
            </button>
            <input ref={spreadsheetInputRef} type="file" hidden accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12" aria-label="เลือกไฟล์คำถาม CSV หรือ Excel" onChange={event => void readFieldFormSpreadsheet(event.currentTarget.files?.[0] ?? null)} />
          </div>
          {spreadsheetError && <p className="cf-field-form-feedback is-error" role="alert">{spreadsheetError}</p>}
          {spreadsheetPreview && <div className="cf-field-spreadsheet-preview" aria-live="polite">
            <div><strong>ตัวอย่าง · {spreadsheetFileName}</strong><small>อ่าน {spreadsheetPreview.source_rows} แถว · ได้ {spreadsheetPreview.fields.length} ช่อง</small></div>
            {spreadsheetPreview.issues.length > 0 ? <ul className="cf-field-spreadsheet-issues" role="alert">{spreadsheetPreview.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : <>
              <ul className="cf-field-spreadsheet-fields">{spreadsheetPreview.fields.slice(0, 10).map(field => <li key={field.id}><span>{field.label}</span><small>{inputTypeOptions.find(option => option.value === field.input_type)?.label}{field.required ? ' · จำเป็น' : ''}{field.options ? ' · ' + field.options.length + ' ตัวเลือก' : ''}</small></li>)}</ul>
              {spreadsheetPreview.fields.length > 10 && <small>และอีก {spreadsheetPreview.fields.length - 10} ช่อง</small>}
              <div className="cf-field-spreadsheet-preview-actions">
                <button type="button" className="cf-field-primary" onClick={useSpreadsheetFields}>นำเข้าเป็นแม่แบบใหม่</button>
                <button type="button" onClick={() => setSpreadsheetPreview(null)}>ยกเลิก</button>
              </div>
            </>}
          </div>}
        </section>
        <div className="cf-field-template-manager-actions">
          <label>เลือกแม่แบบเพื่อแก้ไข<select aria-label="เลือกแม่แบบฟอร์มบริษัทเพื่อแก้ไข" value={selectedManagedTemplateId} onChange={event => editFieldTemplate(event.target.value)} disabled={!localTemplates.length}>
            <option value="">{localTemplates.length ? 'สร้างใหม่ หรือเลือกแม่แบบ' : 'ยังไม่มีแม่แบบบริษัท'}</option>
            {localTemplates.map(template => <option key={template.id} value={template.id}>{template.title}</option>)}
          </select></label>
          <button type="button" onClick={() => { setSelectedManagedTemplateId(''); setTemplateEditor(emptyFieldFormTemplate()); setSpreadsheetPreview(null); setTemplateLibraryError(''); setTemplateLibraryMessage('') }} disabled={templateLibraryBusy}>สร้างแม่แบบใหม่</button>
        </div>
        {templateEditor && <div className="cf-field-template-editor">
          <div className="cf-field-template-meta">
            <label>ชื่อแม่แบบ<input aria-label="ชื่อแม่แบบฟอร์มบริษัท" value={templateEditor.title} maxLength={200} onChange={event => setTemplateEditor(current => current ? { ...current, title: event.target.value } : current)} /></label>
            <label>กลุ่มข้อมูล<select aria-label="กลุ่มแบบฟอร์มบริษัท" value={templateEditor.category} onChange={event => setTemplateEditor(current => current ? { ...current, category: event.target.value as FieldFormCategory } : current)}>
              {categoryOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label>
            <label className="cf-field-template-description">คำอธิบาย<textarea aria-label="คำอธิบายแม่แบบฟอร์มบริษัท" rows={2} maxLength={1000} value={templateEditor.description} onChange={event => setTemplateEditor(current => current ? { ...current, description: event.target.value } : current)} /></label>
          </div>
          <div className="cf-field-template-fields-heading"><strong>ช่องข้อมูล · {templateEditor.fields.length}/100</strong><button type="button" onClick={() => setTemplateEditor(current => current && current.fields.length < 100 ? { ...current, fields: [...current.fields, { id: `field_${crypto.randomUUID()}`, label: '', input_type: 'text', required: false }] } : current)} disabled={templateEditor.fields.length >= 100}>เพิ่มช่อง</button></div>
          <div className="cf-field-template-fields">
            {templateEditor.fields.map((field, index) => <article className="cf-field-template-field" key={field.id}>
              <div className="cf-field-template-field-row">
                <label>ชื่อช่อง<input aria-label={`ชื่อช่องแม่แบบ ${index + 1}`} value={field.label} maxLength={200} onChange={event => updateTemplateField(index, { label: event.target.value })} /></label>
                <label>ชนิดข้อมูล<select aria-label={`ชนิดข้อมูลแม่แบบ ${index + 1}`} value={field.input_type} onChange={event => updateTemplateField(index, { input_type: event.target.value as FieldFormInputType })}>
                  {inputTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select></label>
                <label className="cf-field-template-required"><input type="checkbox" checked={field.input_type !== 'section' && field.required} disabled={field.input_type === 'section'} onChange={event => updateTemplateField(index, { required: event.target.checked })} /> จำเป็น</label>
                <button type="button" aria-label={`ลบช่องแม่แบบ ${index + 1}`} onClick={() => setTemplateEditor(current => current && current.fields.length > 1 ? { ...current, fields: current.fields.filter((_item, itemIndex) => itemIndex !== index) } : current)} disabled={templateEditor.fields.length <= 1}>ลบ</button>
              </div>
              {field.input_type === 'select' && <label className="cf-field-template-options">ตัวเลือก · คั่นด้วยเครื่องหมายจุลภาค<input aria-label={`ตัวเลือกของช่องแม่แบบ ${index + 1}`} value={(field.options ?? []).join(', ')} onChange={event => updateTemplateField(index, { options: event.target.value.split(',').map(option => option.trim()) })} /></label>}
              <small>รหัสฟิลด์: <code>{field.id}</code></small>
            </article>)}
          </div>
          <div className="cf-field-template-save-row">
            <button type="button" className="cf-field-primary" onClick={() => void saveFieldTemplate()} disabled={templateLibraryBusy}>{templateLibraryBusy ? 'กำลังบันทึก…' : selectedManagedTemplateId ? 'บันทึกแม่แบบ' : 'เพิ่มเข้า Library'}</button>
            {selectedManagedTemplateId && <button type="button" className="cf-field-template-delete" onClick={() => void deleteFieldTemplate()} disabled={templateLibraryBusy}>ลบแม่แบบ</button>}
          </div>
        </div>}
        {templateLibraryError && <p className="cf-field-form-feedback is-error" role="alert">{templateLibraryError}</p>}
        {templateLibraryMessage && <p className="cf-field-form-feedback is-success" role="status">{templateLibraryMessage}</p>}
      </section>}

    {records.length > 0 && <nav className="cf-field-forms-list" aria-label="แบบฟอร์มในโครงการ">
      {records.map(record => <button key={record.id} type="button" className={record.id === activeId ? 'is-active' : ''} onClick={() => { gpsCaptureTokenRef.current += 1; setGpsCaptureBusy(false); setActiveId(record.id); setMessage(''); setError('') }}>
        <span><strong>{record.title}</strong><small>{record.category === 'site_visit' ? 'เข้าตรวจ' : record.category === 'quality_inspection' ? 'ตรวจงาน' : record.category === 'safety_observation' ? 'ความปลอดภัย' : record.category === 'client_request' ? 'คำขอลูกค้า' : 'กำหนดเอง'}</small></span>
        <em className={record.status === 'submitted' ? 'is-submitted' : ''}>{record.status === 'submitted' ? 'ส่งแล้ว' : 'ร่าง'}</em>
      </button>)}
    </nav>}

    {!draft && <div className="cf-field-forms-empty"><ClipboardCheck size={23} /><strong>ยังไม่มีบันทึกหน้างาน</strong><span>เลือกแบบฟอร์มด้านบนเพื่อเริ่มบันทึก</span></div>}

    {draft && <div className="cf-field-form-editor" key={draft.id}>
      <div className="cf-field-form-editor-heading"><div><span className={`cf-field-status ${isSubmitted ? 'is-submitted' : ''}`}>{isSubmitted ? 'ส่งแล้ว' : 'แบบร่าง'}</span><small>{activeRecord?.created_at ? new Date(activeRecord.created_at).toLocaleDateString('th-TH') : 'สร้างใหม่'}</small></div></div>
      <label className="cf-field-form-label">ชื่อบันทึก<input value={draft.title} maxLength={200} disabled={isSubmitted} onChange={event => updateDraft(current => ({ ...current, title: event.target.value }))} /></label>

      <div className="cf-field-form-fields">
        {draft.fields.map(item => <div className={item.input_type === 'section' ? 'cf-field-form-section' : 'cf-field-form-response'} key={item.id}>
          <label>{item.label}{item.required && <span aria-hidden="true"> *</span>}{responseForField(item, draft.responses[item.id], !!isSubmitted, value => updateDraft(current => ({ ...current, responses: { ...current.responses, [item.id]: value } })))}
          </label>
          {draft.category === 'custom' && !isSubmitted && draft.fields.length > 1 && <button type="button" className="cf-field-icon-button" aria-label={`ลบช่อง ${item.label}`} title="ลบช่องนี้" onClick={() => updateDraft(current => {
            const responses = { ...current.responses }; delete responses[item.id]
            return { ...current, fields: current.fields.filter(field => field.id !== item.id), responses }
          })}><Trash2 size={14} /></button>}
        </div>)}
      </div>

      {draft.category === 'custom' && !isSubmitted && <div className="cf-field-custom-add">
        <label>เพิ่มช่องข้อมูล<input value={newFieldLabel} maxLength={200} placeholder="เช่น หมายเลขเอกสาร" onChange={event => setNewFieldLabel(event.target.value)} /></label>
        <div><select aria-label="ชนิดช่องข้อมูล" value={newFieldType} onChange={event => setNewFieldType(event.target.value as FieldFormInputType)}>{inputTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" onClick={() => {
          const label = newFieldLabel.trim(); if (!label || !draft) return
          const id = `field_${crypto.randomUUID()}`
          updateDraft(current => ({ ...current, fields: [...current.fields, { id, label, input_type: newFieldType, required: false, ...(newFieldType === 'select' ? { options: ['ตัวเลือก 1', 'ตัวเลือก 2'] } : {}) }] }))
          setNewFieldLabel('')
        }}><Plus size={14} /> เพิ่มช่อง</button></div>
      </div>}

      <section className="cf-field-form-context" aria-label="ตำแหน่งและสิ่งที่เกี่ยวข้อง">
        <h3><MapPin size={15} /> ตำแหน่งและสิ่งที่เกี่ยวข้อง</h3>
        <label>ชั้น<select value={draft.level_id ?? ''} disabled={isSubmitted} onChange={event => updateDraft(current => ({ ...current, level_id: event.target.value || undefined }))}>
          <option value="">ไม่ระบุชั้น</option>{project.levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
        </select></label>
        <div className="cf-field-form-location"><span>พิกัดบนแปลน (m)</span><div>
          {(['X', 'Y'] as const).map((axis, index) => <label key={axis}>{axis}<input type="number" step="0.001" disabled={isSubmitted} aria-label={`พิกัด ${axis} เมตร`} value={draft.location_mm ? (draft.location_mm[index] / 1000).toFixed(3) : ''} placeholder="—" onChange={event => {
            const current: [number, number] = draft.location_mm ? [...draft.location_mm] : [0, 0]
            if (event.target.value === '') { updateDraft(form => ({ ...form, location_mm: undefined })); return }
            current[index] = Number(event.target.value) * 1000
            updateDraft(form => ({ ...form, location_mm: current }))
          }} /></label>)}
        </div></div>
        <div className="cf-field-gps-location">
          <div className="cf-field-gps-heading"><strong>ตำแหน่ง GPS จากอุปกรณ์</strong><button type="button" disabled={isSubmitted || gpsCaptureBusy} onClick={captureGpsLocation}><MapPin size={14} />{gpsCaptureBusy ? 'กำลังหาตำแหน่ง…' : draft.gps_location ? 'บันทึกตำแหน่งใหม่' : 'ใช้ตำแหน่งปัจจุบัน'}</button></div>
          {draft.gps_location ? <div className="cf-field-gps-data" aria-label="ตำแหน่ง GPS ที่บันทึกไว้">
            <span>Lat {draft.gps_location.latitude.toFixed(6)}° · Lon {draft.gps_location.longitude.toFixed(6)}°</span>
            <small>ความแม่นยำอุปกรณ์ ±{draft.gps_location.accuracy_m.toFixed(0)} ม. · {new Date(draft.gps_location.captured_at).toLocaleString('th-TH')}</small>
            {!isSubmitted && <button type="button" onClick={clearGpsLocation}>ล้างตำแหน่ง</button>}
          </div> : <small>บันทึกเมื่อกดปุ่มเท่านั้น · ขออนุญาต Location จากอุปกรณ์</small>}
          <small>เป็นตำแหน่งจากอุปกรณ์ ความแม่นยำขึ้นกับสัญญาณ · ไม่ใช่หมุดสำรวจแนวเขต</small>
        </div>
        <div className="cf-field-link-block"><div><strong>วัตถุที่เลือก</strong><button type="button" disabled={isSubmitted || selectedIds.length === 0} onClick={attachSelection}><Paperclip size={13} /> แนบการเลือก ({selectedIds.length})</button></div>
          {draft.linked_object_ids.length ? <ul>{draft.linked_object_ids.map(id => <li key={id}><span>{project.objects[id]?.object_type ?? 'วัตถุที่ไม่อยู่ในโมเดล'} <code>{id.slice(0, 8)}</code></span>{!isSubmitted && <button type="button" aria-label="นำวัตถุออก" onClick={() => updateDraft(current => ({ ...current, linked_object_ids: current.linked_object_ids.filter(item => item !== id) }))}>×</button>}</li>)}</ul> : <small>เลือกวัตถุบนแปลนแล้วกดแนบการเลือก</small>}
        </div>
        <div className="cf-field-link-block"><strong>ภาพตรวจหน้างาน</strong>
          {project.field_photo_inspections?.length ? <ul>{project.field_photo_inspections.map(photo => <li key={photo.id}><label><input type="checkbox" disabled={isSubmitted} checked={draft.photo_inspection_ids.includes(photo.id)} onChange={event => togglePhoto(photo.id, event.target.checked)} /><span>{photo.title}<small>{photo.room_name || 'ไม่ระบุห้อง'}</small></span></label></li>)}</ul> : <small>ยังไม่มีภาพตรวจหน้างานในโครงการ</small>}
        </div>
      </section>

      <label className="cf-field-form-label">หมายเหตุเพิ่มเติม<textarea rows={3} maxLength={4000} disabled={isSubmitted} value={draft.notes ?? ''} onChange={event => updateDraft(current => ({ ...current, notes: event.target.value }))} /></label>

      {(message || error) && <div className={`cf-field-form-feedback ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'}>{error || message}</div>}
      {!isSubmitted && <div className="cf-field-form-actions"><button type="button" className="cf-field-primary" onClick={saveDraft}>บันทึกร่าง</button><button type="button" className="cf-field-submit" onClick={submit}>ส่งแบบฟอร์ม</button><button type="button" className="cf-field-delete" aria-label="ลบแบบร่าง" onClick={removeDraft}><Trash2 size={15} /> ลบ</button></div>}
      {isSubmitted && <p className="cf-field-form-locked">แบบฟอร์มที่ส่งแล้วเปิดดูได้อย่างเดียว เพื่อเก็บประวัติเดิม</p>}
    </div>}
  </section>
}
