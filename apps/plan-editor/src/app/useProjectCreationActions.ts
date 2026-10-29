import type { Dispatch, SetStateAction } from 'react'
import {
  createDefaultResidentialProjectDocument,
  serializeProject,
  type ProjectDocument,
} from '@constructflow/project-model'
import type { CommandEnvelope } from '@constructflow/command-schema'
import type { EditorViewMode } from './useMultiViewPreferences.js'
import type { ToolType } from '../components/Toolbar.js'
import type { LocalProjectFileHandle } from '../projectFileIO.js'

interface UseProjectCreationActionsOptions {
  confirmReplaceUnsavedProject: () => boolean
  resetProjectSession: (project: ProjectDocument) => void
  updateActiveProjectFileHandle: (handle: LocalProjectFileHandle | null) => void
  setProjectState: (project: ProjectDocument) => void
  setSavedProjectJson: Dispatch<SetStateAction<string | null>>
  setReplacementBaselineJson: Dispatch<SetStateAction<string | null>>
  setFileFeedback: (message: string) => void
  setSelectedId: (id: string | null) => void
  setSelectedIds: (ids: string[]) => void
  setCommandQueue: Dispatch<SetStateAction<CommandEnvelope[]>>
  setActiveTool: (tool: ToolType) => void
  setViewMode: (mode: EditorViewMode) => void
}

/** Owns replace-project flows so fixture and blank-project paths reset the same session state. */
export function useProjectCreationActions({
  confirmReplaceUnsavedProject,
  resetProjectSession,
  updateActiveProjectFileHandle,
  setProjectState,
  setSavedProjectJson,
  setReplacementBaselineJson,
  setFileFeedback,
  setSelectedId,
  setSelectedIds,
  setCommandQueue,
  setActiveTool,
  setViewMode,
}: UseProjectCreationActionsOptions) {
  const replaceProject = (project: ProjectDocument, message: string, envelopes: CommandEnvelope[] = []) => {
    resetProjectSession(project)
    updateActiveProjectFileHandle(null)
    setProjectState(project)
    setSavedProjectJson(null)
    setReplacementBaselineJson(serializeProject(project))
    setFileFeedback(message)
    setSelectedId(null)
    setSelectedIds([])
    setCommandQueue(envelopes)
    setActiveTool('select')
    setViewMode('plan')
  }

  const handleStartKitchenProof = async () => {
    if (!confirmReplaceUnsavedProject()) return
    try {
      const { createKitchenProofProject } = await import('@constructflow/extension-engine')
      const generated = createKitchenProofProject()
      if (generated.status !== 'success') {
        window.alert(`สร้างโมเดลครัวพิสูจน์ไม่สำเร็จ: ${generated.errors?.join('; ') ?? 'unknown error'}`)
        return
      }
      replaceProject(generated.updatedProject, 'สร้างโมเดลครัวพิสูจน์แล้ว', generated.emittedEnvelopes)
    } catch (error) {
      window.alert(`โหลดโครงการตัวอย่างครัวไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleStartHouseDemo = async () => {
    if (!confirmReplaceUnsavedProject()) return
    try {
      const { loadHouseDemoRaw } = await import('./houseDemo.js')
      const { deserializeProject } = await import('@constructflow/project-model')
      replaceProject(deserializeProject(loadHouseDemoRaw()), 'เปิดแบบบ้านเดโม 2 ชั้นแล้ว')
    } catch (error) {
      window.alert(`เปิดแบบบ้านเดโมไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleNewBlankProject = () => {
    if (!confirmReplaceUnsavedProject()) return
    if (!window.confirm('สร้างโครงการใหม่แบบว่างหรือไม่? งานที่เปิดอยู่จะถูกแทนที่ด้วยโครงการค่าเริ่มต้น')) return
    const blank = createDefaultResidentialProjectDocument(crypto.randomUUID(), 'โครงการใหม่')
    replaceProject(blank, 'สร้างโครงการใหม่แบบว่างแล้ว')
  }

  return { handleStartKitchenProof, handleStartHouseDemo, handleNewBlankProject }
}
