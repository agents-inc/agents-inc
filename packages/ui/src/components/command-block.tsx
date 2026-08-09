import type { ComponentProps, KeyboardEvent } from "react"

import { cn } from "@workspace/ui/lib/utils"

const ACTIVATION_KEYS = ["Enter", " "]

// A shell command the user is expected to copy — the install dialog's whole
// point, since installing is a CLI action and the dialog deliberately has no
// Install button.
//
// The `$` is decoration, not content: it is marked `aria-hidden` and sits
// outside the `<code>` so selecting the line copies only the command.
function CommandBlock({
  className,
  copyable = false,
  children,
  onKeyDown,
  ...props
}: ComponentProps<"div"> & {
  // Whole-block click-to-copy. A prop rather than classes at the call site,
  // so the affordance cannot drift between the blocks that have it — which
  // means the semantics as well as the look: a copyable block is announced as
  // a button, takes focus, and answers Enter and Space.
  //
  // It still buys the affordance rather than the copying. The clipboard write
  // is the caller's `onClick`, and the keyboard path below routes through that
  // same handler rather than a second one that could drift from it.
  copyable?: boolean
}) {
  return (
    <div
      data-slot="command-block"
      data-copyable={copyable || undefined}
      role={copyable ? "button" : undefined}
      tabIndex={copyable ? 0 : undefined}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (copyable) activateOnEnterOrSpace(event)
      }}
      className={cn(
        "border border-hairline bg-code px-[0.6875rem] py-[0.5rem] font-mono text-11_5 font-medium text-ink",
        copyable &&
          "cursor-pointer outline-none hover:border-rule focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
      {...props}
    >
      <span aria-hidden className="pr-[0.4375rem] text-brand select-none">
        $
      </span>
      <code className="font-mono">{children}</code>
    </div>
  )
}

// A real click rather than a call to `onClick`: it is what a native button does
// with these two keys, and it keeps the pointer and the keyboard on one handler.
function activateOnEnterOrSpace(event: KeyboardEvent<HTMLDivElement>) {
  if (!ACTIVATION_KEYS.includes(event.key)) return

  // Space would scroll the dialog otherwise.
  event.preventDefault()
  event.currentTarget.click()
}

export { CommandBlock }
