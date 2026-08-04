import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

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
  ...props
}: ComponentProps<"div"> & {
  // Whole-block click-to-copy. A prop rather than classes at the call site,
  // so the affordance cannot drift between the blocks that have it.
  copyable?: boolean
}) {
  return (
    <div
      data-slot="command-block"
      data-copyable={copyable || undefined}
      className={cn(
        "border border-hairline bg-code px-[0.6875rem] py-[0.5rem] font-mono text-11_5 font-medium text-ink",
        copyable && "cursor-pointer hover:border-rule",
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

export { CommandBlock }
