import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import type { ComponentProps, ReactNode } from "react"

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
// `✕` is a text glyph, not an icon — the design ships no icon set beyond the
// GitHub mark.

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
  ...props
}: DialogPrimitive.Popup.Props & { wide?: boolean }) {
  return (
    <DialogPortal>
      <DialogBackdrop />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-24 left-1/2 z-[200] flex max-h-[calc(100vh-10rem)] max-w-[calc(100vw-2.5rem)] -translate-x-1/2 flex-col border border-dialog-border bg-cell shadow-dialog outline-none",
          wide ? "w-[38.75rem]" : "w-[35rem]",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

// Title · subtitle · ✕, on one baseline.
function DialogHeader({
  className,
  title,
  subtitle,
  ...props
}: Omit<ComponentProps<"div">, "title"> & {
  title: string
  subtitle?: ReactNode
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
      <DialogPrimitive.Close
        aria-label="Close"
        // The package's one focus ring. The glyph has no box of its own, so
        // the ring is the only thing that says the keyboard is on it.
        className="ml-auto cursor-pointer font-mono text-13 leading-none font-normal text-faint outline-none hover:text-ink focus-visible:ring-1 focus-visible:ring-ring"
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

function DialogPane({
  className,
  side = "left",
  ...props
}: ComponentProps<"div"> & { side?: "left" | "right" }) {
  return (
    <div
      data-slot="dialog-pane"
      className={cn(
        "min-w-0 px-5 pt-4 pb-5",
        side === "left"
          ? "flex-1 border-r border-hairline"
          : "w-[12.25rem] flex-none",
        className
      )}
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
  DialogPanes,
  DialogPortal,
  DialogRule,
  DialogTrigger,
}
