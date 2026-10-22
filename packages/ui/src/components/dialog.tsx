import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
  useState,
  type ComponentProps,
  type PointerEvent,
  type ReactNode,
} from "react"

import { Glyph } from "@workspace/ui/components/glyph"
import { cn } from "@workspace/ui/lib/utils"

// Pinned 96px from the top, never centred, so a tall dialog grows downward. `✕` stays a text
// glyph: the icon set has no close mark.

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
        // Fullscreen goes after `className` so call-site widths cannot beat it; `inset-6` keeps the
        // footer on screen.
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

// `onToggleFullscreen` rather than a boolean draws the maximise button, so it can never be inert.
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
          // Names `esc`, which exits fullscreen before it closes.
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
        // Flush right unless the maximise glyph already pushes the pair there.
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

function DialogPanes({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-panes"
      className={cn("flex min-h-0 flex-1 overflow-auto", className)}
      {...props}
    />
  )
}

const PANE_SIDES = {
  left: "flex-1 border-r border-hairline",
  right: "w-[12.25rem] flex-none",
  tree: "w-[15.625rem] flex-none border-r border-tree-border",
  content: "flex-1",
} as const

// In design pixels, before `:root`'s sizing knob scales them.
const TREE_WIDTH_DEFAULT_PX = 250
const TREE_WIDTH_MIN_PX = 180
const TREE_WIDTH_MAX_PX = 560

const clampTreeWidth = (width: number) =>
  Math.min(TREE_WIDTH_MAX_PX, Math.max(TREE_WIDTH_MIN_PX, width))

const DRAG_END_EVENTS = ["pointerup", "pointercancel"] as const

// The rem scale is read once per drag: a layout read, and the sizing knob can move.
const dragFrom = (startX: number, startWidth: number) => {
  const remScale =
    parseFloat(getComputedStyle(document.documentElement).fontSize) / 16

  return (clientX: number) =>
    clampTreeWidth(startWidth + (clientX - startX) / remScale)
}

/**
 * Pointer capture keeps the drag alive over the scrolling code pane and ends it on cancel, so no
 * listener can leak.
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
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the file tree"
      aria-valuenow={Math.round(width)}
      aria-valuemin={TREE_WIDTH_MIN_PX}
      aria-valuemax={TREE_WIDTH_MAX_PX}
      onPointerDown={beginDrag}
      className={cn(
        "relative z-[2] -mx-0.5 w-[0.3125rem] flex-none cursor-col-resize",
        // A hairline: stays 1px at every scale.
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
