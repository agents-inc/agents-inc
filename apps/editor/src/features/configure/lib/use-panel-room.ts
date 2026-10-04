import { useLayoutEffect, type RefObject } from "react"

/**
 * ROOM IN THE COLUMN FOR A PANEL THAT HANGS PAST ITS END.
 *
 * A skill's options panel is absolute: it hangs from the top of its cell and
 * over the cells beside it, so nothing in the flow makes room for it. On the
 * last rows it hung past the end of the column, and the document grew to hold
 * it — but the document's scrollable area takes in an absolute box and the grid
 * the frame is drawn by does not. Scrolling down to the panel scrolled past the
 * frame's own foot, and everything sticky in it went too: the rail, the roster
 * and the dock rose together, leaving bare page under them and the panel's
 * foot drawn below the dock, outside the frame altogether.
 *
 * So the column makes the room itself, in the flow and ahead of the dock: an
 * empty block exactly as tall as the panel hangs past the catalogue's end. The
 * frame is then as tall as the page, the dock stays docked, and at the bottom
 * of the page the panel ends above the dock by the dock's own margin.
 *
 * Written straight to the element rather than through React state, for
 * `use-pinned.ts`'s reason: the room is a sibling of every domain section, and
 * a render to resize it would re-render the whole grid for a value one block
 * reads.
 */

// Where the room is: one empty block between the last domain section and the
// dock, so its top edge is where the catalogue ends.
export const PANEL_ROOM = "data-panel-room"

// How far the panel's foot hangs past the catalogue's end. Never negative: a
// panel that ends inside the catalogue needs nothing.
const overhang = (panel: HTMLElement, room: HTMLElement) =>
  Math.max(
    0,
    panel.getBoundingClientRect().bottom - room.getBoundingClientRect().top
  )

/**
 * Holds the column open beneath an open panel for as long as it is mounted.
 *
 * Re-measured whenever either side of the gap moves: the panel grows when its
 * Meta fold opens, and the catalogue between it and the room changes under an
 * open panel when a filter is typed. Measured in the frame AFTER the observer
 * reports rather than inside it, because writing the room resizes the column
 * being observed, and a resize inside the callback that reports one is a loop
 * the browser refuses.
 *
 * A layout effect for the first measurement, so the frame a panel opens in is
 * already the frame it stays in.
 */
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
