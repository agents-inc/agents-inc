import { describe, expect, it } from "vitest"

import {
  TREE_WIDTH_DEFAULT_PX,
  TREE_WIDTH_MAX_PX,
  TREE_WIDTH_MIN_PX,
  clampTreeWidth,
} from "@workspace/ui/components/dialog"

// A clamp renders nothing, so it is a unit test rather than a story.
describe("clampTreeWidth", () => {
  it("leaves a width inside the bounds alone", () => {
    expect(clampTreeWidth(TREE_WIDTH_DEFAULT_PX)).toBe(TREE_WIDTH_DEFAULT_PX)
    expect(clampTreeWidth(TREE_WIDTH_MIN_PX + 1)).toBe(TREE_WIDTH_MIN_PX + 1)
    expect(clampTreeWidth(TREE_WIDTH_MAX_PX - 1)).toBe(TREE_WIDTH_MAX_PX - 1)
  })

  it("refuses to drag either pane out of existence", () => {
    expect(clampTreeWidth(0)).toBe(TREE_WIDTH_MIN_PX)
    expect(clampTreeWidth(-2000)).toBe(TREE_WIDTH_MIN_PX)
    expect(clampTreeWidth(TREE_WIDTH_MAX_PX + 1)).toBe(TREE_WIDTH_MAX_PX)
    expect(clampTreeWidth(Number.MAX_SAFE_INTEGER)).toBe(TREE_WIDTH_MAX_PX)
  })

  // Inclusive, so a reported value can be restored without moving the pane.
  it("holds the bounds themselves", () => {
    expect(clampTreeWidth(TREE_WIDTH_MIN_PX)).toBe(TREE_WIDTH_MIN_PX)
    expect(clampTreeWidth(TREE_WIDTH_MAX_PX)).toBe(TREE_WIDTH_MAX_PX)
  })

  it("rests at a width it would not itself change", () => {
    expect(TREE_WIDTH_DEFAULT_PX).toBeGreaterThanOrEqual(TREE_WIDTH_MIN_PX)
    expect(TREE_WIDTH_DEFAULT_PX).toBeLessThanOrEqual(TREE_WIDTH_MAX_PX)
  })
})
