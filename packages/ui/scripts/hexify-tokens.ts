import { readFileSync, writeFileSync } from "node:fs"

/**
 * Rewrites Terrazzo's percent `rgb()` output as hex (alpha as 0-255 `rgb()`), since the design and
 * devtools speak hex. A post-step because the CSS plugin's `transform` hook did not fire.
 */
const FILE = "src/styles/tokens.css"

const to255 = (percent: string) => Math.round((Number(percent) / 100) * 255)

const toHex = (percent: string) => to255(percent).toString(16).padStart(2, "0")

/** Guards the dark media block so an explicit `data-theme="light"` beats a dark OS. */
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
