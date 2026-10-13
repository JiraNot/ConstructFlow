import { useEffect } from 'react'
import type { DoorHanding } from '@constructflow/project-model'
import type { ToolType } from './Toolbar.js'

interface UsePlanCanvasGlobalShortcutsOptions {
  activeTool: ToolType
  selectedDoorId: string | null
  draggingObject: boolean
  onFlipDoorHanding?: (doorId: string) => void
  cancelCurrentPlacement: () => void
  cycleDoorHanding: () => void
  cyclePlacementReference: () => void
}

export function usePlanCanvasGlobalShortcuts({
  activeTool,
  selectedDoorId,
  draggingObject,
  onFlipDoorHanding,
  cancelCurrentPlacement,
  cycleDoorHanding,
  cyclePlacementReference,
}: UsePlanCanvasGlobalShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.key === 'Tab' && draggingObject) {
        event.preventDefault()
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.cf-manipulation-dimensions input')?.focus())
      } else if (event.code === 'Space') {
        if (activeTool === 'door') {
          event.preventDefault()
          cycleDoorHanding()
        } else if (activeTool === 'wall' || activeTool === 'beam') {
          event.preventDefault()
          cyclePlacementReference()
        } else if (selectedDoorId) {
          event.preventDefault()
          onFlipDoorHanding?.(selectedDoorId)
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        cancelCurrentPlacement()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTool, selectedDoorId, onFlipDoorHanding, draggingObject, cycleDoorHanding, cyclePlacementReference, cancelCurrentPlacement])
}

export function nextDoorHanding(current: DoorHanding): DoorHanding {
  const cycle: Record<DoorHanding, DoorHanding> = {
    left_in: 'left_out',
    left_out: 'right_out',
    right_out: 'right_in',
    right_in: 'left_in',
  }
  return cycle[current] ?? 'left_in'
}
