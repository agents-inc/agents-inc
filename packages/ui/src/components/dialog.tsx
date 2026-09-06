import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
  useState,
  type ComponentProps,
  type PointerEvent,
  type ReactNode,
} from "react"

import { Glyph } from "@workspace/ui/components/glyph"
import { cn } from "@workspace/ui/lib/utils"

// The shared dialog shell. Both dialogs (Install, Add skill) are the same
// square white sheet pinned 96px from the top of the viewport — never centred
// vertically, so a tall dialog grows downward from a fixed position rather
// than drifting as its content changes.
//
// No entrance animation: the design animates the filter bar's padding and
// nothing else. Closing is available on ✕, on the footer button and on the
// backdrop.
//
// `✕` IS A TEXT GLYPH AND STAYS ONE. The design has an icon set now, and it is
// a closed list of nine shapes with no close mark in it — the prototype draws
// this exact character in every dialog header it has. Drawing one would be
// inventing a tenth glyph, not applying the set.

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogBackdrop({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-backdrop"
      className={cn("fixed inset-0 z-[199] bg-veil", className)}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  wide = false,
  fullscreen = false,
  ...props
}: DialogPrimitive.Popup.Props & { wide?: boolean; fullscreen?: boolean }) {
  return (
    <DialogPortal>
      <DialogBackdrop />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-fullscreen={fullscreen ? "" : undefined}
        // The fullscreen arm goes LAST, after `className`, so a call site's own
        // width cannot beat it — every one of them sets one.
        //
        // `inset-6` rather than a `calc(100vw - …)` width: it sets all four
        // edges at once, so the sheet can never grow past the bottom of the
        // viewport and take its footer — and its only Close button — with it.
        // That is the design's "size against the veil, not the viewport" in the
        // one form available here, where the backdrop is a sibling rather than
        // a padded container the sheet is laid out inside.
        className={cn(
          "fixed top-24 left-1/2 z-[200] flex max-h-[calc(100vh-10rem)] max-w-[calc(100vw-2.5rem)] -translate-x-1/2 flex-col border border-dialog-border bg-cell shadow-dialog outline-none",
          wide ? "w-[38.75rem]" : "w-[35rem]",
          className,
          fullscreen &&
            "inset-6 h-auto max-h-none w-auto max-w-none translate-x-0"
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

// Title · subtitle · ✕, on one baseline — and, on a dialog that offers it, the
// maximise glyph between the subtitle and the ✕.
//
// `onToggleFullscreen` is what draws that control rather than a `fullscreen`
// boolean, so a dialog that cannot be maximised cannot accidentally render a
// button that does nothing. It is a real `<button>`: a clickable span here
// would be an unnamed control in a dialog every axe run audits.
function DialogHeader({
  className,
  title,
  subtitle,
  fullscreen = false,
  onToggleFullscreen,
  ...props
}: Omit<ComponentProps<"div">, "title"> & {
  title: string
  subtitle?: ReactNode
  fullscreen?: boolean
  onToggleFullscreen?: () => void
}) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-none items-baseline gap-2.5 border-b border-hairline px-5 pt-4 pb-3.5",
        className
      )}
      {...props}
    >
      <DialogPrimitive.Title className="font-mono text-11 font-semibold tracking-[.14em] text-ink uppercase">
        {title}
      </DialogPrimitive.Title>
      {subtitle ? (
        <DialogPrimitive.Description className="min-w-0 font-mono text-10 font-normal text-muted-foreground">
          {subtitle}
        </DialogPrimitive.Description>
      ) : null}
      {onToggleFullscreen ? (
        <button
          type="button"
          data-slot="dialog-fullscreen"
          aria-pressed={fullscreen}
          // The name says the ACTION, and the exit arm names the key as well:
          // `esc` steps out of fullscreen before it closes, and that ladder is
          // otherwise something a visitor can only discover by pressing it.
          aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          title={fullscreen ? "exit fullscreen — esc" : "fullscreen"}
          onClick={onToggleFullscreen}
          className="ml-auto flex size-5 flex-none cursor-pointer items-center justify-center text-faint outline-none hover:text-ink focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Glyph name={fullscreen ? "shrink" : "expand"} />
        </button>
      ) : null}
      <DialogPrimitive.Close
        aria-label="Close"
        // The package's one focus ring. The glyph has no box of its own, so
        // the ring is the only thing that says the keyboard is on it.
        //
        // `ml-auto` only while nothing precedes it takes that job: with the
        // maximise glyph present it is the glyph that pushes the pair right,
        // and this keeps the design's 12px between the two.
        className={cn(
          "cursor-pointer font-mono text-13 leading-none font-normal text-faint outline-none hover:text-ink focus-visible:ring-1 focus-visible:ring-ring",
          onToggleFullscreen ? "ml-3" : "ml-auto"
        )}
      >
        ✕
      </DialogPrimitive.Close>
    </div>
  )
}

function DialogBody({
  className,
  scroll = false,
  ...props
}: ComponentProps<"div"> & { scroll?: boolean }) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        "px-5 pt-4.5 pb-5",
        scroll ? "min-h-0 flex-1 overflow-auto" : "flex-none",
        className
      )}
      {...props}
    />
  )
}

// The install dialog's two-column inventory.
function DialogPanes({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-panes"
      className={cn("flex min-h-0 flex-1 overflow-auto", className)}
      {...props}
    />
  )
}

// Two splits, one component, and a `side` value belongs to one of them.
//
//   left  / right    — a flexible body with a fixed 196px sidebar after it,
//                      divided by the sheet's own hairline. The install and
//                      contents dialogs.
//   tree  / content  — the inverse: a fixed 250px column FIRST, divided by the
//                      quieter `tree-border` hairline, and the body taking
//                      whatever is left. The output preview.
//
// The second pair is here rather than spelled out at its call site because
// both halves of it are design-system decisions — the column's width, and a
// divider one hex digit lighter than the sheet's, chosen so a split inside a
// dialog reads quieter than the dialog's own rules. A className override in a
// feature file would put both somewhere nobody looking for them would find them.
const PANE_SIDES = {
  left: "flex-1 border-r border-hairline",
  right: "w-[12.25rem] flex-none",
  tree: "w-[15.625rem] flex-none border-r border-tree-border",
  content: "flex-1",
} as const

/**
 * The tree column's resting width and the bounds a drag may not leave, in
 * DESIGN pixels — the unit every dimension in this package is written in,
 * before `:root`'s sizing knob scales it.
 *
 * Clamped at both ends because neither pane may be dragged out of existence,
 * and the tension is real rather than defensive: long paths and long generated
 * lines are competing for one width, and a reader who wants all of one still
 * needs to be able to get back.
 */
const TREE_WIDTH_DEFAULT_PX = 250
const TREE_WIDTH_MIN_PX = 180
const TREE_WIDTH_MAX_PX = 560

const clampTreeWidth = (width: number) =>
  Math.min(TREE_WIDTH_MAX_PX, Math.max(TREE_WIDTH_MIN_PX, width))

// The two ways a drag ends. Named together because they are handled
// identically — a cancelled pointer leaves the pane wherever the last move put
// it, which is what a released one does too.
const DRAG_END_EVENTS = ["pointerup", "pointercancel"] as const

/**
 * A drag in progress, as a function from where the pointer is now to the width
 * the tree should take.
 *
 * The rem scale is read ONCE, as the drag starts. It is a layout read, and
 * taking it on every move would cost one per frame — and it cannot change
 * mid-drag anyway. Measured rather than assumed, because the package's sizing
 * knob is a live value and a constant here would drift the handle away from the
 * pointer the day it moved.
 */
const dragFrom = (startX: number, startWidth: number) => {
  const remScale =
    parseFloat(getComputedStyle(document.documentElement).fontSize) / 16

  return (clientX: number) =>
    clampTreeWidth(startWidth + (clientX - startX) / remScale)
}

/**
 * The handle between a `tree` pane and the `content` pane after it.
 *
 * 5px wide with -2px margins either side, so it takes the pointer across a
 * comfortable band while occupying no layout at all — the two panes sit exactly
 * as close as they did without it, and the 1px amber line it draws under the
 * pointer lands on the divider that is already there.
 *
 * POINTER CAPTURE rather than document-level listeners: the drag stays alive
 * over the code pane, which is a scroll container that would otherwise swallow
 * the move, and it ends itself if the pointer is cancelled — so there is no
 * cleanup effect that can leak a listener when the dialog closes mid-drag.
 *
 * The ratio back to design pixels is MEASURED off the document rather than
 * assumed, because the sizing knob is a live value: reading it means the handle
 * still tracks the pointer one-for-one if that knob ever moves.
 */
function DialogPaneSplitter({
  width,
  onWidth,
  className,
  ...props
}: ComponentProps<"div"> & {
  width: number
  onWidth: (width: number) => void
}) {
  const [dragging, setDragging] = useState(false)

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()

    const handle = event.currentTarget
    const widthAt = dragFrom(event.clientX, width)

    const onMove = (moved: globalThis.PointerEvent) =>
      onWidth(widthAt(moved.clientX))
    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove)
      for (const name of DRAG_END_EVENTS)
        handle.removeEventListener(name, onEnd)
      setDragging(false)
    }

    handle.setPointerCapture(event.pointerId)
    handle.addEventListener("pointermove", onMove)
    for (const name of DRAG_END_EVENTS) handle.addEventListener(name, onEnd)
    setDragging(true)
  }

  return (
    <div
      data-slot="dialog-pane-splitter"
      // A real separator with a value, so the drag is announced rather than
      // merely available: without `aria-valuenow` this is a landmark that
      // reports nothing about the thing it moves.
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the file tree"
      aria-valuenow={Math.round(width)}
      aria-valuemin={TREE_WIDTH_MIN_PX}
      aria-valuemax={TREE_WIDTH_MAX_PX}
      onPointerDown={beginDrag}
      className={cn(
        "relative z-[2] -mx-0.5 w-[0.3125rem] flex-none cursor-col-resize",
        // The line stays 1px at every scale — it is a hairline, and the
        // package's sizing knob deliberately leaves those alone.
        "after:absolute after:inset-y-0 after:left-0.5 after:w-px after:content-['']",
        dragging ? "after:bg-brand" : "hover:after:bg-brand",
        className
      )}
      {...props}
    />
  )
}

function DialogPane({
  className,
  side = "left",
  ...props
}: ComponentProps<"div"> & { side?: keyof typeof PANE_SIDES }) {
  return (
    <div
      data-slot="dialog-pane"
      className={cn("min-w-0 px-5 pt-4 pb-5", PANE_SIDES[side], className)}
      {...props}
    />
  )
}

function DialogPaneHeading({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-pane-heading"
      className={cn(
        "pb-3 font-mono text-9 font-semibold tracking-[.13em] text-ink uppercase",
        className
      )}
      {...props}
    />
  )
}

function DialogRule({
  className,
  strong = false,
  ...props
}: ComponentProps<"div"> & { strong?: boolean }) {
  return (
    <div
      data-slot="dialog-rule"
      role="separator"
      className={cn(
        "h-0 flex-none border-t",
        strong ? "border-rule" : "border-hairline",
        className
      )}
      {...props}
    />
  )
}

// Buttons never wrap; the note beside them yields space instead.
function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-none items-center gap-[0.5625rem] border-t border-hairline px-5 py-[0.8125rem]",
        className
      )}
      {...props}
    />
  )
}

function DialogFooterNote({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer-note"
      className={cn(
        "mr-auto min-w-0 font-mono text-10 font-normal text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBackdrop,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogFooterNote,
  DialogHeader,
  DialogPane,
  DialogPaneHeading,
  DialogPaneSplitter,
  DialogPanes,
  DialogPortal,
  DialogRule,
  DialogTrigger,
  TREE_WIDTH_DEFAULT_PX,
  TREE_WIDTH_MAX_PX,
  TREE_WIDTH_MIN_PX,
  clampTreeWidth,
}
