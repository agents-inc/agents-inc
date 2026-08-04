import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"
import type { ComponentProps } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

// The confirm shell, in the same square language as `Dialog` but narrower and
// not dismissible by backdrop — the only use is the stack switch, where the
// cost of a stray click is losing the user's whole selection.
//
// This screen is designed but not mocked (README § Not designed yet), so it
// inherits the dialog metrics rather than inventing its own.

function AlertDialog(props: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger(props: AlertDialogPrimitive.Trigger.Props) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogContent({
  className,
  children,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        data-slot="alert-dialog-backdrop"
        className="fixed inset-0 z-[199] bg-veil"
      />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-24 left-1/2 z-[200] flex w-[26.25rem] max-w-[calc(100vw-2.5rem)] -translate-x-1/2 flex-col border border-dialog-border bg-cell shadow-dialog outline-none",
          className
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPrimitive.Portal>
  )
}

function AlertDialogHeader({
  className,
  title,
  ...props
}: Omit<ComponentProps<"div">, "title"> & { title: string }) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "flex flex-none items-baseline gap-2.5 border-b border-hairline px-5 pt-4 pb-3.5",
        className
      )}
      {...props}
    >
      <AlertDialogPrimitive.Title className="font-mono text-11 font-semibold tracking-[.14em] text-ink uppercase">
        {title}
      </AlertDialogPrimitive.Title>
    </div>
  )
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        "px-5 pt-4.5 pb-5 text-11 leading-normal text-ink-3",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-none items-center justify-end gap-[0.5625rem] border-t border-hairline px-5 py-[0.8125rem]",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogAction(props: ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" variant="primary" {...props} />
}

function AlertDialogCancel(props: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      render={<Button variant="outline" />}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
}
