import { describe, expect, it } from "vitest"

import {
  TREE_WIDTH_DEFAULT_PX,
  TREE_WIDTH_MAX_PX,
  TREE_WIDTH_MIN_PX,
  clampTreeWidth,
} from "@workspace/ui/components/dialog"

/**
 * THE ONE PIECE OF ARITHMETIC THIS PACKAGE SHIPS, so it is covered here rather
 * than through a story.
 *
 * Stories are the tests everywhere else in `packages/ui`, and rightly — a
 * component's contract is what it renders. A clamp renders nothing: it is a
 * value with no appearance, which is the exact case the `unit` project in
 * `vitest.config.ts` was added for, alongside the ink-ramp syntax theme.
 *
 * The bound is what matters rather than the numbers. Neither pane of the output
 * preview's split may be dragged out of existence, and the tension it settles is
 * real — long generated paths and long generated lines competing for one width,
 * which is why free window resizing was rejected and this was built instead.
 */
describe("clampTreeWidth", () => {
  it("leaves a width inside the bounds alone", () => {
    expect(clampTreeWidth(TREE_WIDTH_DEFAULT_PX)).toBe(TREE_WIDTH_DEFAULT_PX)
    expect(clampTreeWidth(TREE_WIDTH_MIN_PX + 1)).toBe(TREE_WIDTH_MIN_PX + 1)
    expect(clampTreeWidth(TREE_WIDTH_MAX_PX - 1)).toBe(TREE_WIDTH_MAX_PX - 1)
  })

  // A drag past either end is the ordinary case rather than the exotic one: the
  // pointer keeps moving after the pane has stopped, and every frame of that
  // arrives here.
  it("refuses to drag either pane out of existence", () => {
    expect(clampTreeWidth(0)).toBe(TREE_WIDTH_MIN_PX)
    expect(clampTreeWidth(-2000)).toBe(TREE_WIDTH_MIN_PX)
    expect(clampTreeWidth(TREE_WIDTH_MAX_PX + 1)).toBe(TREE_WIDTH_MAX_PX)
    expect(clampTreeWidth(Number.MAX_SAFE_INTEGER)).toBe(TREE_WIDTH_MAX_PX)
  })

  // The bounds are inclusive, which is what a drag held against either stop
  // settles on — so the value the separator reports is one a later restore can
  // hand straight back without moving the pane a pixel.
  it("holds the bounds themselves", () => {
    expect(clampTreeWidth(TREE_WIDTH_MIN_PX)).toBe(TREE_WIDTH_MIN_PX)
    expect(clampTreeWidth(TREE_WIDTH_MAX_PX)).toBe(TREE_WIDTH_MAX_PX)
  })

  // The default has to be a width the clamp would not move, or the pane jumps
  // the first time anything touches the splitter.
  it("rests at a width it would not itself change", () => {
    expect(TREE_WIDTH_DEFAULT_PX).toBeGreaterThanOrEqual(TREE_WIDTH_MIN_PX)
    expect(TREE_WIDTH_DEFAULT_PX).toBeLessThanOrEqual(TREE_WIDTH_MAX_PX)
  })
})
