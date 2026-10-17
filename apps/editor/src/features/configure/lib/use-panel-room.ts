import { useLayoutEffect, type RefObject } from "react"

// An absolute options panel can hang past the column's end, which the frame's
// grid does not grow for, so sticky parts scroll away. An in-flow block as tall
// as the overhang makes the room; written to the DOM to avoid a grid re-render.

// The block between the last domain section and the dock.
export const PANEL_ROOM = "data-panel-room"

const overhang = (panel: HTMLElement, room: HTMLElement) =>
  Math.max(
    0,
    panel.getBoundingClientRect().bottom - room.getBoundingClientRect().top
  )

// Measured the frame after the observer reports: writing the room resizes the
// observed column, a loop the browser refuses inside the callback.
export function usePanelRoom(panelRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const panel = panelRef.current
    const room = document.querySelector<HTMLElement>(`[${PANEL_ROOM}]`)
    const column = room?.parentElement
    if (!panel || !room || !column) return

    const reserve = () => {
      room.style.height = `${overhang(panel, room)}px`
    }
    reserve()

    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(reserve)
    })
    observer.observe(panel)
    observer.observe(column)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      room.style.removeProperty("height")
    }
  }, [panelRef])
}
