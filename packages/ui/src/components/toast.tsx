import { Toast as ToastPrimitive } from "@base-ui/react/toast"

import { cn } from "@workspace/ui/lib/utils"

// Made outside React, so code that is not a component can raise a toast; the `Toaster` given it
// draws what it raises.
const createToastManager = ToastPrimitive.createToastManager

type ToastManager = ReturnType<typeof createToastManager>

// Ended and limited toasts stay mounted while they animate out, so they fade rather than vanish.
function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()

  return toasts.map((toast) => (
    <ToastPrimitive.Root
      key={toast.id}
      toast={toast}
      data-slot="toast"
      className="flex items-start gap-3 border border-dialog-border bg-cell px-4 py-3 shadow-dialog transition-opacity duration-200 outline-none focus-visible:ring-1 focus-visible:ring-ring data-[ending-style]:opacity-0 data-[limited]:hidden data-[starting-style]:opacity-0"
    >
      <ToastPrimitive.Title
        data-slot="toast-title"
        className="min-w-0 flex-1 text-11_5 leading-[1.45] font-normal text-ink"
      />
      {/* Without `aria-label` the `✕` announces as "multiplication x". */}
      <ToastPrimitive.Close
        data-slot="toast-close"
        aria-label="Close"
        className="flex-none cursor-pointer font-mono text-13 leading-none font-normal text-faint outline-none hover:text-ink focus-visible:ring-1 focus-visible:ring-ring"
      >
        ✕
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  ))
}

/** The live region every toast `manager` raises is drawn in. Placed by `className`. */
function Toaster({
  manager,
  className,
  ...props
}: Omit<ToastPrimitive.Viewport.Props, "children"> & {
  manager: ToastManager
}) {
  return (
    <ToastPrimitive.Provider toastManager={manager}>
      <ToastPrimitive.Viewport
        data-slot="toast-viewport"
        className={cn("flex w-[22rem] flex-col gap-2 outline-none", className)}
        {...props}
      >
        <ToastList />
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Provider>
  )
}

export { Toaster, createToastManager, type ToastManager }
