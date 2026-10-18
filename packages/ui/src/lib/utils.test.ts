import { describe, expect, it } from "vitest"

import { cn } from "@workspace/ui/lib/utils"

// Mirrored as literals, not imported: globals.css declares a `--text-*` token for each.
const TYPE_SCALE = [
  "7",
  "7_5",
  "8",
  "8_5",
  "9",
  "9_5",
  "10",
  "10_5",
  "11",
  "11_5",
  "12",
  "12_5",
  "13",
  "13_5",
  "15",
  "25",
]

const TEXT_COLOUR = "text-ink"
const STOCK_TEXT_SIZE = "text-sm"

describe("cn", () => {
  describe("reads every size of the type scale as a font size", () => {
    it.each(TYPE_SCALE)("keeps a text colour beside text-%s", (size) => {
      expect(cn(TEXT_COLOUR, `text-${size}`)).toBe(
        `${TEXT_COLOUR} text-${size}`
      )
    })

    it.each(TYPE_SCALE)("lets text-%s replace an earlier text size", (size) => {
      expect(cn(STOCK_TEXT_SIZE, `text-${size}`)).toBe(`text-${size}`)
    })
  })
})
