import { useEffect, type RefObject } from "react"

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Trap Tab focus inside an open dialog and return focus to whatever was
 * focused before it opened. Each modal still sets its own initial focus and
 * Escape handling — this only stops Tab from leaking out behind the veil,
 * the promise `aria-modal` already makes. Call it before the modal's own
 * focus effect so it captures the real trigger element to restore to.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const container = ref.current
    if (!active || !container) return

    const restoreTo =
      document.activeElement instanceof HTMLElement &&
      !container.contains(document.activeElement)
        ? document.activeElement
        : null

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return
      const items = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.getClientRects().length > 0)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const act = document.activeElement
      if (e.shiftKey) {
        if (act === first || !container.contains(act)) {
          last.focus()
          e.preventDefault()
        }
      } else if (act === last) {
        first.focus()
        e.preventDefault()
      }
    }

    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("keydown", onKey, true)
      if (restoreTo && restoreTo.isConnected) restoreTo.focus()
    }
  }, [ref, active])
}
