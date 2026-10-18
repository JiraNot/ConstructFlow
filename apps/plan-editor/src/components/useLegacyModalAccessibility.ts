import { useEffect } from 'react'

/** Keyboard and focus behavior shared by the remaining legacy modal layouts. */
export function useLegacyModalAccessibility(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    const overlay = document.querySelector<HTMLElement>('.cf-legacy-dialog')
    const panel = overlay?.firstElementChild as HTMLElement | null
    if (!panel) return
    const focusables = () => [...panel.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex="0"]')]
      .filter(element => !element.hasAttribute('disabled') && element.getClientRects().length > 0)
    ;(panel.querySelector<HTMLElement>('input:not([type="checkbox"])') ?? focusables()[0] ?? panel).focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // An active canvas draft consumes Escape before the surrounding dialog.
        if (event.target instanceof Element && event.target.closest('[data-modal-escape-cancel="true"]')) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      const first = items[0]
      const last = items.at(-1)
      if (!first || !last) {
        event.preventDefault()
        panel.focus()
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (previous?.isConnected && previous.getClientRects().length) previous.focus()
    }
  }, [isOpen, onClose])
}
