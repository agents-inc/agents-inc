import { readFileSync, writeFileSync } from "node:fs"

/**
 * Rewrites Terrazzo's `rgb(100% 100% 100%)` output as `#ffffff`.
 *
 * A post-step rather than the CSS plugin's own `transform`, and that is a
 * concession rather than a preference: the hook exists, its signature is
 * documented two different ways across versions, and the one this version wants
 * did not fire. Rather than guess at an undocumented shape, this transforms the
 * emitted file, which is deterministic and obvious when it breaks.
 *
 * Why bother at all: the design is written in hex, every comment in globals.css
 * quotes hex, and hex is what devtools shows. Percent triplets would make each
 * of those a translation exercise for whoever is looking something up.
 *
 * Alpha values become `rgb(r g b / a)` with 0-255 channels — still not hex,
 * because there is no hex spelling of an alpha that reads better, but at least
 * the channels match every other value in the file.
 */
const FILE = "src/styles/tokens.css"

const to255 = (percent: string) => Math.round((Number(percent) / 100) * 255)

const toHex = (percent: string) => to255(percent).toString(16).padStart(2, "0")

/**
 * Guards the dark media block so an explicit LIGHT choice beats a dark OS.
 *
 * Terrazzo emits `@media (prefers-color-scheme: dark) { :root { … } }`
 * unguarded, and `[data-theme="dark"] { … }` beside it. That covers two of the
 * three states and gets the third wrong: stamping `data-theme="light"` does
 * nothing on a machine set to dark, because the media block still matches
 * `:root`. Storybook's light pin was silently not pinning, and a reader who
 * chose light in the app would have got dark.
 *
 * `:root:not([data-theme="light"])` is the whole fix: system preference still
 * decides when nobody has chosen, and a choice wins in BOTH directions.
 */
const guardDarkMedia = (css: string) =>
  css.replace(
    /(@media \(prefers-color-scheme: dark\) \{\s*):root/g,
    '$1:root:not([data-theme="light"])'
  )

const hexified = readFileSync(FILE, "utf8")
  .replace(
    /rgb\(([\d.]+)% ([\d.]+)% ([\d.]+)%\)/g,
    (_, r: string, g: string, b: string) => `#${toHex(r)}${toHex(g)}${toHex(b)}`
  )
  .replace(
    /rgb\(([\d.]+)% ([\d.]+)% ([\d.]+)% \/ ([\d.]+)\)/g,
    (_, r: string, g: string, b: string, a: string) =>
      `rgb(${to255(r)} ${to255(g)} ${to255(b)} / ${a})`
  )

writeFileSync(FILE, guardDarkMedia(hexified))
