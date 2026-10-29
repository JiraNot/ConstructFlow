import type { Dispatch, SetStateAction } from 'react'
import { serializeProject, type ProjectDocument } from '@constructflow/project-model'
import type { CommandBatchResult, CommandRequest } from '@constructflow/command-schema'
import { buildProjectHistoryDeltaInput } from '../commands/CommandBus.js'
import { readProjectFile, writeProjectFile, type LocalProjectFileHandle } from '../projectFileIO.js'

export interface ProjectFileAccess {
  showOpenFilePicker?: (options: {
    multiple?: boolean
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<LocalProjectFileHandle[]>
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<LocalProjectFileHandle>
}

type ProjectSessionRef = { current: { project: ProjectDocument; reset: (project: ProjectDocument) => void } | null }

interface UseProjectFileActionsOptions {
  project: ProjectDocument
  projectJson: string
  projectFileAccess?: ProjectFileAccess
  sessionRef: ProjectSessionRef
  dispatchCommandBatch: (commands: CommandRequest[]) => CommandBatchResult
  setProjectState: Dispatch<SetStateAction<ProjectDocument>>
  setCommandQueue: Dispatch<SetStateAction<import('@constructflow/command-schema').CommandEnvelope[]>>
  setSelectedId: Dispatch<SetStateAction<string | null>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  savedProjectJson: string | null
  setSavedProjectJson: Dispatch<SetStateAction<string | null>>
  replacementBaselineJson: string | null
  setReplacementBaselineJson: Dispatch<SetStateAction<string | null>>
  activeProjectFileHandleRef: { current: LocalProjectFileHandle | null }
  updateActiveProjectFileHandle: (handle: LocalProjectFileHandle | null) => void
  setLocalAutosaveState: Dispatch<SetStateAction<'restoring' | 'saving' | 'saved' | 'error'>>
  setFileFeedback: Dispatch<SetStateAction<string>>
  recordHistoryTravel: () => void
}

function projectFileName(project: ProjectDocument) {
  const safeName = project.project.name.trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/\.cfproj$/i, '')
  return `${safeName || project.project.id || 'project'}.cfproj`
}

/** Owns .cfproj file actions while the project session remains the sole model transaction owner. */
export function useProjectFileActions(options: UseProjectFileActionsOptions) {
  const {
    project, projectJson, projectFileAccess, sessionRef, dispatchCommandBatch, setProjectState, setCommandQueue, setSelectedId, setSelectedIds,
    savedProjectJson, setSavedProjectJson, replacementBaselineJson, setReplacementBaselineJson,
    activeProjectFileHandleRef, updateActiveProjectFileHandle, setLocalAutosaveState, setFileFeedback, recordHistoryTravel,
  } = options
  const fileWindow: ProjectFileAccess = projectFileAccess ?? (window as Window & ProjectFileAccess)
  const supportsProjectFileOpen = typeof fileWindow.showOpenFilePicker === 'function'

  const confirmReplaceUnsavedProject = () => {
    const hasUnsavedProjectChanges = replacementBaselineJson !== projectJson
    return !hasUnsavedProjectChanges || window.confirm('มีการแก้ไขโครงการหลังเปิดหรือบันทึกไฟล์ครั้งล่าสุด ต้องการแทนที่โครงการปัจจุบันหรือไม่?')
  }

  const handleDownloadProjectCopy = async () => {
    const filename = projectFileName(project)
    try {
      const { createPortableProjectFileContents } = await import('../projectAutosave.js')
      const portable = await createPortableProjectFileContents(projectJson, project.project.id)
      const url = URL.createObjectURL(new Blob([portable.contents], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setSavedProjectJson(projectJson)
      setReplacementBaselineJson(projectJson)
      updateActiveProjectFileHandle(null)
      setFileFeedback(portable.missingPhotoCount
        ? `ส่งคำขอดาวน์โหลด ${filename} แล้ว · รูปถ่ายในเครื่องขาด ${portable.missingPhotoCount} รายการ`
        : `ส่งคำขอดาวน์โหลด ${filename} พร้อมรูปถ่าย ${portable.bundledPhotoCount} รายการแล้ว`)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      return true
    } catch (error) {
      setLocalAutosaveState('error')
      setFileFeedback(`เตรียมไฟล์โครงการไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  const handleSaveProject = async () => {
    setLocalAutosaveState('saving')
    const handle = activeProjectFileHandleRef.current
    try {
      if (handle) {
        const { createPortableProjectFileContents } = await import('../projectAutosave.js')
        const portable = await createPortableProjectFileContents(projectJson, project.project.id)
        await writeProjectFile(handle, portable.contents)
        setSavedProjectJson(projectJson)
        setReplacementBaselineJson(projectJson)
        setLocalAutosaveState('saved')
        setFileFeedback(portable.missingPhotoCount
          ? `บันทึกไฟล์ ${projectFileName(project)} แล้ว · รูปถ่ายในเครื่องขาด ${portable.missingPhotoCount} รายการ`
          : `บันทึกไฟล์ ${projectFileName(project)} พร้อมรูปถ่าย ${portable.bundledPhotoCount} รายการแล้ว`)
      } else {
        const { saveLocalProjectSnapshot } = await import('../projectAutosave.js')
        await saveLocalProjectSnapshot({ projectJson, savedProjectJson, replacementBaselineJson: projectJson })
        setReplacementBaselineJson(projectJson)
        setLocalAutosaveState('saved')
        setFileFeedback('บันทึกในเบราว์เซอร์เครื่องนี้แล้ว')
      }
    } catch (error) {
      console.error('Unable to save local ConstructFlow project', error)
      setLocalAutosaveState('error')
      setFileFeedback('บันทึกในเครื่องไม่สำเร็จ')
    }
  }

  const handleSaveAsProject = async () => {
    const filename = projectFileName(project)
    if (fileWindow.showSaveFilePicker) {
      try {
        const handle = await fileWindow.showSaveFilePicker.call(window, {
          suggestedName: filename,
          types: [{ description: 'ConstructFlow Project', accept: { 'application/json': ['.cfproj'] } }],
        })
        const { createPortableProjectFileContents } = await import('../projectAutosave.js')
        const portable = await createPortableProjectFileContents(projectJson, project.project.id)
        await writeProjectFile(handle, portable.contents)
        updateActiveProjectFileHandle(handle)
        setSavedProjectJson(projectJson)
        setReplacementBaselineJson(projectJson)
        setFileFeedback(portable.missingPhotoCount
          ? `บันทึกไฟล์ ${filename} แล้ว · รูปถ่ายในเครื่องขาด ${portable.missingPhotoCount} รายการ`
          : `บันทึกไฟล์ ${filename} พร้อมรูปถ่าย ${portable.bundledPhotoCount} รายการแล้ว`)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        window.alert(`บันทึกไฟล์โครงการไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
      }
      return
    }
    updateActiveProjectFileHandle(null)
    await handleDownloadProjectCopy()
  }

  const handleOpenProject = async (file?: File, fileHandle: LocalProjectFileHandle | null = null) => {
    if (!file) return
    try {
      const { project: loaded, serialized: loadedJson, mediaAssets } = await readProjectFile(file)
      if (!confirmReplaceUnsavedProject()) return
      const inspections = loaded.field_photo_inspections ?? []
      let availablePhotoCount = 0
      if (Object.keys(mediaAssets).length) {
        const { saveLocalFieldPhotoAssets } = await import('../projectAutosave.js')
        await saveLocalFieldPhotoAssets(loaded.project.id, Object.entries(mediaAssets).map(([asset_id, data_url]) => ({ asset_id, data_url })))
      }
      if (inspections.length) {
        const { listLocalFieldPhotoAssets } = await import('../projectAutosave.js')
        const localAssets = await listLocalFieldPhotoAssets(loaded.project.id)
        availablePhotoCount = inspections.filter(inspection => Boolean(localAssets[inspection.image_asset_id])).length
      }
      const currentProject = sessionRef.current!.project
      const sameProjectId = loaded.project.id === currentProject.project.id
      const sameDocument = sameProjectId && serializeProject(currentProject) === loadedJson
      let appliedAsDelta = false
      let localOnlyReason = ''
      let openedProject = loaded
      if (sameProjectId && !sameDocument) {
        try {
          const delta = buildProjectHistoryDeltaInput(currentProject, loaded)
          const result = dispatchCommandBatch([{ name: 'ApplyProjectHistoryDelta', input: delta as unknown as Record<string, unknown> }])
          if (result.status === 'success') {
            appliedAsDelta = true
            openedProject = result.updatedProject
          } else localOnlyReason = result.errors?.join(' · ') ?? 'CommandBus ปฏิเสธ delta'
        } catch (error) {
          localOnlyReason = error instanceof Error ? error.message : String(error)
        }
      }
      if (!sameDocument && !appliedAsDelta) {
        sessionRef.current!.reset(loaded)
        recordHistoryTravel()
        setProjectState(loaded)
      }
      updateActiveProjectFileHandle(fileHandle)
      const replacementBaseline = appliedAsDelta ? serializeProject(openedProject) : loadedJson
      setSavedProjectJson(loadedJson)
      setReplacementBaselineJson(replacementBaseline)
      const missingPhotoCount = inspections.length - availablePhotoCount
      const openedMessage = missingPhotoCount > 0
        ? `เปิดไฟล์ ${file.name} แล้ว · มีรูปถ่ายในเครื่อง ${availablePhotoCount} จาก ${inspections.length} รายการ`
        : availablePhotoCount > 0 ? `เปิดไฟล์ ${file.name} พร้อมรูปถ่าย ${availablePhotoCount} รายการแล้ว` : `เปิดไฟล์ ${file.name} แล้ว`
      setFileFeedback(appliedAsDelta
        ? `${openedMessage} · ส่งการเปลี่ยนแปลงเป็น delta ผ่านประวัติทีม`
        : localOnlyReason ? `${openedMessage} · live sync หยุดเพื่อเทียบ revision (${localOnlyReason})` : openedMessage)
      setCommandQueue([])
      setSelectedId(null)
      setSelectedIds([])
    } catch (error) {
      window.alert(`เปิดไฟล์โครงการไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleChooseProject = async () => {
    if (!fileWindow.showOpenFilePicker) return
    try {
      const handles = await fileWindow.showOpenFilePicker.call(window, {
        multiple: false,
        types: [{ description: 'ConstructFlow Project', accept: { 'application/json': ['.cfproj'] } }],
      })
      const handle = handles[0]
      if (handle) await handleOpenProject(await handle.getFile(), handle)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      window.alert(`เปิดไฟล์โครงการไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    supportsProjectFileOpen,
    confirmReplaceUnsavedProject,
    handleDownloadProjectCopy,
    handleSaveProject,
    handleSaveAsProject,
    handleOpenProject,
    handleChooseProject,
  }
}
