import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Every drawn glyph, at Lucide geometry and one stroke: 1.75, `butt` caps, `miter` joins (round
 * caps clash with a radius-free design). The GitHub mark is brand artwork and lives where it is used.
 */

const PATHS = {
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  enter: ["M20 6v6a2 2 0 0 1-2 2H4", "M8 10l-4 4 4 4"],
  code: ["M16 18l6-6-6-6", "M8 6l-6 6 6 6"],
  chevronDown: ["M6 9l6 6 6-6"],
  chevronRight: ["M9 6l6 6-6 6"],
  expand: ["M4 10V4h6", "M20 14v6h-6", "M4 4l6 6", "M20 20l-6-6"],
  shrink: ["M10 4v6H4", "M14 20v-6h6", "M10 10L4 4", "M14 14l6 6"],
  // Separate paths: one path of subpaths renders the same only while caps are `butt`.
  sun: [
    "M12 3v2",
    "M12 19v2",
    "M5 12H3",
    "M21 12h-2",
    "M6.3 6.3 4.9 4.9",
    "M19.1 19.1l-1.4-1.4",
    "M6.3 17.7 4.9 19.1",
    "M19.1 4.9l-1.4 1.4",
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  ],
  moon: ["M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"],
  // The same drawing inverted; named for what they say.
  info: ["M12 11v5.5", "M12 7.6v.1"],
  warning: ["M12 7v5.5", "M12 16.3v.1"],
} as const

export type GlyphName = keyof typeof PATHS

const RINGED = new Set<GlyphName>(["info", "warning"])

/** Hidden by default: every glyph sits in a control that already names itself. */
function Glyph({
  name,
  size = 13,
  className,
  ...props
}: Omit<ComponentProps<"svg">, "children"> & {
  name: GlyphName
  /** Design px, drawn in rem so the root's 110% scales it like every length. */
  size?: number
}) {
  const side = `${size / 16}rem`

  return (
    <svg
      data-slot="glyph"
      data-glyph={name}
      width={side}
      height={side}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden
      // `block` removes the inline baseline gap.
      className={cn("block shrink-0", className)}
      {...props}
    >
      {RINGED.has(name) && <circle cx="12" cy="12" r="9.25" />}
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

export { Glyph, PATHS as GLYPH_PATHS }
