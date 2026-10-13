import { useCallback } from 'react'
import { hasPendingToolStep, resolveEscapeAction, resolveToolInteractionStatus } from '../app/toolInteractionStatus.mjs'
import type { ToolInteractionStatus } from '../app/toolInteractionStatus.mjs'
import type { ToolType } from './Toolbar.js'

type InteractionState = Record<string, unknown>

interface UsePlanCanvasToolInteractionOptions {
  activeTool: ToolType
  selectionHint: string
  interactionState: InteractionState
  hasSelection: boolean
  onActivateTool?: (tool: ToolType) => void
  onSelectionChange?: (ids: string[], primaryId: string | null) => void
  onSelectObject: (id: string | null) => void
  closeObjectContextMenu: () => void
  clearPointerDrag: () => void
  resetPlacementDrafts: () => void
}

export function usePlanCanvasToolInteraction({
  activeTool,
  selectionHint,
  interactionState,
  hasSelection,
  onActivateTool,
  onSelectionChange,
  onSelectObject,
  closeObjectContextMenu,
  clearPointerDrag,
  resetPlacementDrafts,
}: UsePlanCanvasToolInteractionOptions) {
  const placementStatus: ToolInteractionStatus | null = resolveToolInteractionStatus(activeTool, {
    ...interactionState,
    selectionHint,
  })
  const pendingPlacementStep = hasPendingToolStep(interactionState)
  const escapeAction = resolveEscapeAction(activeTool, pendingPlacementStep, hasSelection)
  const escapeLabel = escapeAction === 'cancel-step' ? 'Esc ยกเลิกขั้นตอนนี้'
    : escapeAction === 'clear-selection' ? 'Esc ล้างการเลือก'
      : escapeAction === 'exit-tool' ? 'Esc ออกจากเครื่องมือ' : ''

  const cancelCurrentPlacement = useCallback(() => {
    const action = resolveEscapeAction(activeTool, hasPendingToolStep(interactionState), hasSelection)
    closeObjectContextMenu()
    clearPointerDrag()
    resetPlacementDrafts()
    if (action === 'exit-tool') onActivateTool?.('select')
    else if (action === 'clear-selection') {
      if (onSelectionChange) onSelectionChange([], null)
      else onSelectObject(null)
    }
  }, [activeTool, interactionState, hasSelection, closeObjectContextMenu, clearPointerDrag,
    resetPlacementDrafts, onActivateTool, onSelectionChange, onSelectObject])

  return {
    placementStatus,
    placementHint: placementStatus?.instruction ?? null,
    escapeLabel,
    cancelCurrentPlacement,
  }
}
