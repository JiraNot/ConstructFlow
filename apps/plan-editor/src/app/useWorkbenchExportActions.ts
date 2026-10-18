import type { ProjectDocument } from '@constructflow/project-model'

type ExportActionName = keyof ReturnType<typeof import('./workbenchExportHandlers.js').createWorkbenchExportActions>

/** Defers export-only handlers until the user requests an export. */
export function useWorkbenchExportActions(
  project: ProjectDocument,
  setFileFeedback: (message: string) => void,
) {
  const runExport = async (action: ExportActionName) => {
    try {
      const { createWorkbenchExportActions } = await import('./workbenchExportHandlers.js')
      await createWorkbenchExportActions(project, setFileFeedback)[action]()
    } catch (error) {
      const messages: Record<ExportActionName, string> = {
        handleExportTakeoff: 'ส่งออกปริมาณไม่สำเร็จ',
        handleExportBOQ: 'ส่งออก BOQ ไม่สำเร็จ',
        handleExportDrawingSet: 'ส่งออกชุดแบบไม่สำเร็จ',
        handleExportDxf: 'ส่งออก DXF ไม่สำเร็จ',
        handleExportIfc: 'ส่งออก IFC ไม่สำเร็จ',
      }
      setFileFeedback(`${messages[action]}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    handleExportTakeoff: () => runExport('handleExportTakeoff'),
    handleExportBOQ: () => runExport('handleExportBOQ'),
    handleExportDrawingSet: () => runExport('handleExportDrawingSet'),
    handleExportDxf: () => runExport('handleExportDxf'),
    handleExportIfc: () => runExport('handleExportIfc'),
  }
}
