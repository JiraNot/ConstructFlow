import { useEffect, useRef, useState } from 'react'
import type { ProjectDocument, TypeDefinition } from '@constructflow/project-model'
import type { ToolType } from '../components/Toolbar.js'
import { TOOL_FAMILIES } from '../components/catalogPresentation.js'

export interface CatalogContext {
  family?: string
  typeId?: string
  edit?: boolean
  intent: 'draw' | 'assign'
}

interface UseTypeCatalogSessionOptions {
  project: ProjectDocument
  activeTool: ToolType
  setActiveTool: (tool: ToolType) => void
  selectedId: string | null
  onAssignType: (objectId: string, typeId: string) => void
}

const initialTypeMarks: Record<string, string> = {
  column: 'C1', foundation: 'F1', beam: 'B1', wall: 'AAC 100 mm',
  door: 'D1', window: 'W1', slab: 'GS', roof: 'RF1',
}

/** Owns ephemeral catalog choices and the contextual draw/assign type-manager flow. */
export function useTypeCatalogSession({ project, activeTool, setActiveTool, selectedId, onAssignType }: UseTypeCatalogSessionOptions) {
  const [activeTypeMarks, setActiveTypeMarks] = useState(initialTypeMarks)
  const previousTypesRef = useRef(project.types)
  const [catalogContext, setCatalogContext] = useState<CatalogContext>({ intent: 'draw' })
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false)

  useEffect(() => {
    setActiveTypeMarks(current => {
      const nextMarks = { ...current }
      const familiesByTool: Record<string, string> = {
        column: 'structure.column', foundation: 'structure.foundation', beam: 'structure.beam',
        wall: 'architecture.wall', door: 'door_window.door', window: 'door_window.window',
        slab: 'structure.slab', roof: 'roof.system',
      }
      for (const [tool, family] of Object.entries(familiesByTool)) {
        const name = current[tool]!
        if (project.types.some(type => type.object_type === family && type.name === name)) continue
        const previous = previousTypesRef.current.find(type => type.object_type === family && type.name === name)
        const replacement = project.types.find(type => type.id === previous?.id)
          ?? project.types.find(type => type.object_type === family)
        if (replacement) nextMarks[tool] = replacement.name
      }
      return nextMarks
    })
    previousTypesRef.current = project.types
  }, [project.types])

  const setActiveTypeMark = (tool: string, value: string) => {
    setActiveTypeMarks(current => ({ ...current, [tool]: value }))
  }

  const syncRenamedActiveType = (type: TypeDefinition, name: string) => {
    const toolByFamily: Record<string, string> = {
      'structure.column': 'column', 'structure.foundation': 'foundation', 'structure.beam': 'beam',
      'architecture.wall': 'wall', 'door_window.door': 'door', 'door_window.window': 'window',
      'structure.slab': 'slab', 'roof.system': 'roof',
    }
    const tool = toolByFamily[type.object_type]
    if (tool && activeTypeMarks[tool] === type.name) setActiveTypeMark(tool, name)
  }

  const openCatalog = (edit = false, fromSelection = false, familyOverride?: string) => {
    const object = fromSelection && selectedId ? project.objects[selectedId] : null
    const family = familyOverride ?? object?.object_type ?? TOOL_FAMILIES[activeTool] ?? 'structure.column'
    const tool = activeTool as string
    const data = object?.module_data as Record<string, unknown> | undefined
    const type = project.types.find(candidate => candidate.object_type === family
      && (data ? candidate.id === data.type_id || candidate.name === data.mark : candidate.name === activeTypeMarks[tool]))
    setCatalogContext({ family, typeId: type?.id, edit, intent: object ? 'assign' : 'draw' })
    setIsTypeManagerOpen(true)
  }

  const chooseCatalogType = (type: TypeDefinition) => {
    if (catalogContext.intent === 'assign' && selectedId) {
      onAssignType(selectedId, type.id)
      return
    }
    const tool = Object.entries(TOOL_FAMILIES).find(([, family]) => family === type.object_type)?.[0] as string | undefined
    if (!tool || !Object.hasOwn(activeTypeMarks, tool)) return
    setActiveTypeMark(tool, type.name)
    setActiveTool(tool as ToolType)
  }

  return {
    activeTypeMarks,
    setActiveTypeMark,
    catalogContext,
    setCatalogContext,
    isTypeManagerOpen,
    setIsTypeManagerOpen,
    openCatalog,
    chooseCatalogType,
    syncRenamedActiveType,
  }
}
