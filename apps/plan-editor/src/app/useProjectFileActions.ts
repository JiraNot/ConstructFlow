import type { Dispatch, SetStateAction } from 'react'
import type { ProjectDocument } from '@constructflow/project-model'
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

type ProjectSessionRef = { current: { reset: (project: ProjectDocument) => void } | null }

interface UseProjectFileActionsOptions {
  project: ProjectDocument
  projectJson: string
  projectFileAccess?: ProjectFileAccess
  sessionRef: ProjectSessionRef
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
    project, projectJson, projectFileAccess, sessionRef, setProjectState, setCommandQueue, setSelectedId, setSelectedIds,
    savedProjectJson, setSavedProjectJson, replacementBaselineJson, setReplacementBaselineJson,
    activeProjectFileHandleRef, updateActiveProjectFileHandle, setLocalAutosaveState, setFileFeedback,
  } = options
  const fileWindow: ProjectFileAccess = projectFileAccess ?? (window as Window & ProjectFileAccess)
  const supportsProjectFileOpen = typeof fileWindow.showOpenFilePicker === 'function'

  const confirmReplaceUnsavedProject = () => {
    const hasUnsavedProjectChanges = replacementBaselineJson !== projectJson
    return !hasUnsavedProjectChanges || window.confirm('มีการแก้ไขโครงการหลังเปิดหรือบันทึกไฟล์ครั้งล่าสุด ต้องการแทนที่โครงการปัจจุบันหรือไม่?')
  }

  const handleDownloadProjectCopy = () => {
    const filename = projectFileName(project)
    const url = URL.createObjectURL(new Blob([projectJson], { type: 'application/json' }))
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
    setFileFeedback(`ส่งคำขอดาวน์โหลด ${filename} แล้ว`)
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const handleSaveProject = async () => {
    setLocalAutosaveState('saving')
    const handle = activeProjectFileHandleRef.current
    try {
      if (handle) {
        await writeProjectFile(handle, projectJson)
        setSavedProjectJson(projectJson)
        setReplacementBaselineJson(projectJson)
        setLocalAutosaveState('saved')
        setFileFeedback(`บันทึกไฟล์ ${projectFileName(project)} แล้ว`)
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
        await writeProjectFile(handle, projectJson)
        updateActiveProjectFileHandle(handle)
        setSavedProjectJson(projectJson)
        setReplacementBaselineJson(projectJson)
        setFileFeedback(`บันทึกไฟล์ ${filename} แล้ว`)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        window.alert(`บันทึกไฟล์โครงการไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
      }
      return
    }
    updateActiveProjectFileHandle(null)
    handleDownloadProjectCopy()
  }

  const handleOpenProject = async (file?: File, fileHandle: LocalProjectFileHandle | null = null) => {
    if (!file) return
    try {
      const { project: loaded, serialized: loadedJson } = await readProjectFile(file)
      if (!confirmReplaceUnsavedProject()) return
      sessionRef.current!.reset(loaded)
      updateActiveProjectFileHandle(fileHandle)
      setProjectState(loaded)
      setSavedProjectJson(loadedJson)
      setReplacementBaselineJson(loadedJson)
      setFileFeedback(`เปิดไฟล์ ${file.name} แล้ว`)
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
