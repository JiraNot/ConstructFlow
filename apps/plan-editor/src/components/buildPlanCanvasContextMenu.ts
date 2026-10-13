import type { ComponentProps } from 'react'
import type { SmartObject } from '@constructflow/project-model'
import type { PlanCanvasObjectContextMenu } from './PlanCanvasObjectContextMenu.js'

export type PlanCanvasContextMenuModel = (
  Omit<ComponentProps<typeof PlanCanvasObjectContextMenu>, 'containerSize'> & { object: SmartObject }
) | null

export interface BuildPlanCanvasContextMenuOptions {
  project: { objects: Record<string, SmartObject | undefined> }
  menu: { id: string; x: number; y: number } | null
  setGridCopySourceId: (id: string) => void
  onSelectionChange?: (ids: string[], primaryId: string | null) => void
  onSelectObject: (id: string | null) => void
  onActivateTool?: (tool: 'gridCopy') => void
  onCopyObjects?: (ids: string[]) => void
  onRequestEditProperties?: () => void
  onDeleteObjects?: (ids: string[]) => void
  closeMenu: () => void
}

export function buildPlanCanvasContextMenu({
  project,
  menu,
  setGridCopySourceId,
  onSelectionChange,
  onSelectObject,
  onActivateTool,
  onCopyObjects,
  onRequestEditProperties,
  onDeleteObjects,
  closeMenu,
}: BuildPlanCanvasContextMenuOptions): PlanCanvasContextMenuModel {
  const object = menu ? project.objects[menu.id] : null
  if (!menu || !object) return null

  const select = (objectId: string) => {
    onSelectionChange?.([objectId], objectId)
    onSelectObject(objectId)
  }

  return {
    object,
    position: { x: menu.x, y: menu.y },
    onStartGridCopy: objectId => {
      setGridCopySourceId(objectId)
      select(objectId)
      onActivateTool?.('gridCopy')
      closeMenu()
    },
    onCopy: objectId => {
      select(objectId)
      onCopyObjects?.([objectId])
      closeMenu()
    },
    onEditProperties: objectId => {
      select(objectId)
      onRequestEditProperties?.()
      closeMenu()
    },
    onDelete: objectId => {
      onDeleteObjects?.([objectId])
      closeMenu()
    },
  }
}
