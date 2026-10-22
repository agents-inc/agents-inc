import type { ComponentProps } from "react"

import { activateOnEnterOrSpace } from "@workspace/ui/lib/button-role"
import { cn } from "@workspace/ui/lib/utils"

// The `$` is a CSS `::before`, so it is outside the accessibility tree, selection and
// `textContent`.
function CommandBlock({
  className,
  copyable = false,
  children,
  onKeyDown,
  ...props
}: ComponentProps<"div"> & {
  // Whole-block click-to-copy semantics; the clipboard write is the caller's `onClick`.
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
        "before:pr-[0.4375rem] before:text-brand before:content-['$']",
        copyable &&
          "cursor-pointer outline-none hover:border-rule focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
      {...props}
    >
      <code className="font-mono">{children}</code>
    </div>
  )
}

export { CommandBlock }
