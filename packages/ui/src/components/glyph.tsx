import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * ONE ICON SET, ONE GEOMETRY.
 *
 * Five glyphs used to come from four different places: `＋` and `−` were
 * FULLWIDTH CJK PUNCTUATION, `↩` and `▾` were typographic characters, and only
 * the code brackets were drawn. That is why they never sat together — a text
 * glyph inherits the font's own weight and baseline and an SVG does not, so
 * two controls a row apart disagreed about where the middle of a line is.
 *
 * Everything drawn in this app now comes through here, at Lucide's geometry
 * and ONE stroke: 1.75, `butt` caps, `miter` joins. The caps are the half that
 * is easy to get wrong and impossible to unsee — round caps softened every
 * corner against a design that has no radius anywhere, and the difference is
 * visible at 11px. Mixing them across two glyphs on one row is the failure
 * this file exists to make unavailable.
 *
 * The GitHub mark is the one exception and stays where it is used: it is a
 * brand's own artwork at its own geometry, not a glyph in this set.
 */

// Path data, verbatim from the design's own `GLYPH` factory. Several of these
// differ from the shapes the README prints beside them — `enter` most visibly
// — and the assembled prototype is the spec in every such case.
const PATHS = {
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  enter: ["M20 6v6a2 2 0 0 1-2 2H4", "M8 10l-4 4 4 4"],
  code: ["M16 18l6-6-6-6", "M8 6l-6 6 6 6"],
  chevronDown: ["M6 9l6 6 6-6"],
  chevronRight: ["M9 6l6 6-6 6"],
  expand: ["M4 10V4h6", "M20 14v6h-6", "M4 4l6 6", "M20 20l-6-6"],
  shrink: ["M10 4v6H4", "M14 20v-6h6", "M10 10L4 4", "M14 14l6 6"],
  // The sun's rays are eight separate paths in the design rather than one
  // concatenated `d`, and they stay separate: a single path with eight
  // subpaths renders identically only while the caps are `butt`, which is
  // exactly the property this set is here to stop anybody assuming.
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
  // The two circled glyphs, which are the same drawing turned upside down: the
  // info dot sits above its stem, the warning dot below it. They are named for
  // what they SAY rather than for the shape, because that is the only thing
  // separating them.
  info: ["M12 11v5.5", "M12 7.6v.1"],
  warning: ["M12 7v5.5", "M12 16.3v.1"],
} as const

export type GlyphName = keyof typeof PATHS

// The circled pair carry a ring the others have no use for.
const RINGED = new Set<GlyphName>(["info", "warning"])

/**
 * `aria-hidden` by default and not by accident.
 *
 * Every glyph in this design sits inside a control that already names itself —
 * the add-skill block says "add skill", the hinge square says "Hide stacks",
 * the grouping control says which grouping it is on. A glyph that published a
 * name of its own would put a second, worse name into the accessible one.
 * Passing `aria-hidden={false}` alongside a `role`/`aria-label` is available
 * for the case that is genuinely the only content of its control, and there is
 * none today.
 */
function Glyph({
  name,
  size = 13,
  className,
  ...props
}: Omit<ComponentProps<"svg">, "children"> & {
  name: GlyphName
  size?: number
}) {
  return (
    <svg
      data-slot="glyph"
      data-glyph={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden
      // `block` kills the inline baseline gap under the box, which is what put
      // a glyph and the word beside it on two different lines in the first
      // place. `shrink-0` because every one of these sits in a flex row.
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
