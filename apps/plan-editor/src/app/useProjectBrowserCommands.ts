import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { CommandRequest } from '@constructflow/command-schema'
import type { ProjectDocument, ProjectViewTemplate } from '@constructflow/project-model'
import type { EditorViewMode } from './useMultiViewPreferences.js'
import type { useProjectSession } from './useProjectSession.js'

type ProjectSession = ReturnType<typeof useProjectSession>
type VisibilityScope = { id: string; hiddenObjectIds: ReadonlySet<string> }

interface UseProjectBrowserCommandsOptions {
  project: ProjectDocument
  selectedId: string | null
  selectedIds: string[]
  dispatchCommandBatch: ProjectSession['dispatchCommandBatch']
  setSelectedId: Dispatch<SetStateAction<string | null>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  selectObjects: (ids: string[], primaryId: string | null) => void
  visibilityScope: VisibilityScope
  setActiveLevelType: (levelId: string) => void
  activeViewId: EditorViewMode
  setActiveViewId: Dispatch<SetStateAction<EditorViewMode>>
  clearTransformPreview: () => void
  setFileFeedback: (message: string) => void
}

/** Owns browser mutations and keyboard clipboard behavior, keeping editor composition out of App. */
export function useProjectBrowserCommands({
  project,
  selectedId,
  selectedIds,
  dispatchCommandBatch,
  setSelectedId,
  setSelectedIds,
  selectObjects,
  visibilityScope,
  setActiveLevelType,
  activeViewId,
  setActiveViewId,
  clearTransformPreview,
  setFileFeedback,
}: UseProjectBrowserCommandsOptions) {
  const copiedObjectIdsRef = useRef<string[]>([])
  const pasteCountRef = useRef(0)

  const handleDeleteObjects = (objectIds: string[]) => {
    const selected = new Set([...new Set(objectIds)].filter(id => Boolean(project.objects[id])))
    if (!selected.size) return
    // Omit a selected child only when every one of its hosts is also selected. A beam
    // supported by two columns must still be explicitly deleted when only one support
    // column is in the selection; deleting that column alone preserves the beam.
    const roots = [...selected].filter(id => {
      const hosts = project.objects[id]!.host_refs
      return !hosts.length || !hosts.every(hostId => selected.has(hostId))
    })
    const commands: CommandRequest[] = roots.map(objectId => ({ name: 'DeleteObject', input: { object_id: objectId } }))
    const result = dispatchCommandBatch(commands)
    if (result.status !== 'success') {
      setFileFeedback(result.errors?.[0] ?? 'ลบชิ้นงานไม่สำเร็จ')
      return
    }
    setSelectedId(null)
    setSelectedIds([])
    setFileFeedback('')
  }

  const handleDeleteObject = (objectId: string) => handleDeleteObjects([objectId])

  const handleCopyObjects = (objectIds: string[]) => {
    const ids = [...new Set(objectIds)].filter(id => Boolean(project.objects[id]))
    if (!ids.length) return
    copiedObjectIdsRef.current = ids
    pasteCountRef.current = 0
    setFileFeedback(`คัดลอก ${ids.length} ชิ้นแล้ว · Ctrl+V เพื่อวาง`)
  }

  const handlePasteObjects = () => {
    const objectIds = copiedObjectIdsRef.current.filter(id => Boolean(project.objects[id]))
    if (!objectIds.length) return
    const id_map = Object.fromEntries(objectIds.map(id => [id, crypto.randomUUID()]))
    const distance = 500 * (pasteCountRef.current + 1)
    const result = dispatchCommandBatch([{ name: 'DuplicateObjects', input: {
      object_ids: objectIds, delta_x_mm: distance, delta_y_mm: 0, id_map,
    } }])
    if (result.status !== 'success') {
      setFileFeedback(result.errors?.[0] ?? 'คัดลอกวัตถุไม่สำเร็จ')
      return
    }
    pasteCountRef.current += 1
    const ids = result.results[0]?.affected_object_ids ?? []
    if (ids.length) selectObjects(ids, ids[0]!)
    setFileFeedback(`วางสำเนา ${ids.length} ชิ้นแล้ว · เยื้องจากชุดต้นฉบับ ${distance} มม.`)
  }

  const handleToggleObjectVisibility = (objectId: string) => {
    const next = new Set(visibilityScope.hiddenObjectIds)
    if (next.has(objectId)) next.delete(objectId)
    else next.add(objectId)
    const result = dispatchCommandBatch([{ name: 'SetViewVisibility', input: {
      scope_id: visibilityScope.id,
      hidden_object_ids: [...next],
    } }])
    if (result.status === 'success' && !visibilityScope.hiddenObjectIds.has(objectId)) {
      setSelectedIds(current => current.filter(id => id !== objectId))
      setSelectedId(current => current === objectId ? null : current)
    }
  }

  const handleShowAllObjects = () => {
    if (!visibilityScope.hiddenObjectIds.size) return
    dispatchCommandBatch([{ name: 'SetViewVisibility', input: {
      scope_id: visibilityScope.id,
      hidden_object_ids: [],
    } }])
  }

  const handleSaveViewTemplate = (name: string): boolean => {
    const result = dispatchCommandBatch([{ name: 'SaveViewTemplate', input: { template: {
      id: crypto.randomUUID(), name, view_id: activeViewId,
      level_id: project.project.active_level_id,
      hidden_object_ids: [...visibilityScope.hiddenObjectIds],
    } } }])
    if (result.status !== 'success') setFileFeedback((result.errors ?? []).join('\n'))
    return result.status === 'success'
  }

  const handleApplyViewTemplate = (template: ProjectViewTemplate): boolean => {
    const commands: CommandRequest[] = []
    if (project.project.active_level_id !== template.level_id) {
      commands.push({ name: 'SetWorkingLevel', input: { level_id: template.level_id } })
    }
    commands.push({ name: 'SetViewVisibility', input: {
      scope_id: `${template.view_id}:${template.level_id}`,
      hidden_object_ids: template.hidden_object_ids,
    } })
    const result = dispatchCommandBatch(commands)
    if (result.status !== 'success') {
      setFileFeedback((result.errors ?? []).join('\n'))
      return false
    }
    if (project.project.active_level_id !== template.level_id) {
      setActiveLevelType(template.level_id)
    }
    setActiveViewId(template.view_id)
    clearTransformPreview()
    return true
  }

  const handleDeleteViewTemplate = (templateId: string): boolean => {
    const result = dispatchCommandBatch([{ name: 'DeleteViewTemplate', input: { template_id: templateId } }])
    if (result.status !== 'success') setFileFeedback((result.errors ?? []).join('\n'))
    return result.status === 'success'
  }

  useEffect(() => {
    const isEditingText = (target: EventTarget | null) => target instanceof HTMLElement
      && (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]')))
    const handleClipboardShortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditingText(event.target) || document.querySelector('[role="dialog"]')) return
      if (event.key.toLowerCase() === 'c') {
        const ids = selectedIds.length ? selectedIds : selectedId ? [selectedId] : []
        if (!ids.length) return
        event.preventDefault()
        handleCopyObjects(ids)
      } else if (event.key.toLowerCase() === 'v' && copiedObjectIdsRef.current.length) {
        event.preventDefault()
        handlePasteObjects()
      }
    }
    window.addEventListener('keydown', handleClipboardShortcuts)
    return () => window.removeEventListener('keydown', handleClipboardShortcuts)
  }, [selectedId, selectedIds, project])

  useEffect(() => {
    const handleDeleteShortcut = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('[role="dialog"]')) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]'))) return
      if (!selectedId && selectedIds.length === 0) return
      event.preventDefault()
      handleDeleteObjects(selectedIds.length ? selectedIds : selectedId ? [selectedId] : [])
    }
    window.addEventListener('keydown', handleDeleteShortcut)
    return () => window.removeEventListener('keydown', handleDeleteShortcut)
  }, [selectedId, selectedIds, project])

  return {
    handleDeleteObjects,
    handleDeleteObject,
    handleCopyObjects,
    handlePasteObjects,
    handleToggleObjectVisibility,
    handleShowAllObjects,
    handleSaveViewTemplate,
    handleApplyViewTemplate,
    handleDeleteViewTemplate,
  }
}
