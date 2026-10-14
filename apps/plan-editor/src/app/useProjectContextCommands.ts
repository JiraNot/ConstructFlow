import type { ProjectDocument } from '@constructflow/project-model'
import type { useProjectSession } from './useProjectSession.js'

type ProjectSession = ReturnType<typeof useProjectSession>

interface UseProjectContextCommandsOptions {
  project: ProjectDocument
  dispatchCommandBatch: ProjectSession['dispatchCommandBatch']
  nextHigherLevelId: (project: ProjectDocument, baseLevelId: string) => string
  setActiveColumnTopLevelId: (levelId: string) => void
  setFileFeedback: (message: string) => void
}

/** Owns project-wide level/phase context and small structural edit commands. */
export function useProjectContextCommands({
  project,
  dispatchCommandBatch,
  nextHigherLevelId,
  setActiveColumnTopLevelId,
  setFileFeedback,
}: UseProjectContextCommandsOptions) {
  const handleSetWorkingPhase = (phase: string) => {
    const result = dispatchCommandBatch([{ name: 'SetWorkingPhase', input: { phase } }])
    if (result.status !== 'success') setFileFeedback(result.errors?.[0] ?? 'เปลี่ยนเฟสโครงการไม่สำเร็จ')
  }

  const handleSetWorkingLevel = (levelId: string) => {
    if (project.project.active_level_id === levelId) return
    const result = dispatchCommandBatch([{ name: 'SetWorkingLevel', input: { level_id: levelId } }])
    if (result.status !== 'success') {
      setFileFeedback(result.errors?.[0] ?? 'เปลี่ยนระดับอาคารไม่สำเร็จ')
      return
    }
    setActiveColumnTopLevelId(nextHigherLevelId(result.updatedProject, levelId))
  }

  const handleUpdateStoryHeight = (height_mm: number) => {
    const result = dispatchCommandBatch([
      { name: 'UpdateLevel', input: { id: 'GF', height_mm } },
      { name: 'UpdateLevel', input: { id: 'L2', elevation_mm: height_mm } },
    ])
    if (result.status !== 'success') setFileFeedback(result.errors?.[0] ?? 'ปรับความสูงระหว่างชั้นไม่สำเร็จ')
  }

  const handleMoveColumn = (objectId: string, newLocation_mm: [number, number]): boolean => {
    const result = dispatchCommandBatch([{ name: 'MoveColumn', input: {
      object_id: objectId,
      location_mm: newLocation_mm,
    } }])
    return result.status === 'success'
  }

  return { handleSetWorkingPhase, handleSetWorkingLevel, handleUpdateStoryHeight, handleMoveColumn }
}
