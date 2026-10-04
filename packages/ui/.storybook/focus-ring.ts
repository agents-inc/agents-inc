import { expect } from "storybook/test"

/**
 * The focused control's ring reaches the screen, not merely the stylesheet.
 *
 * A computed `box-shadow` proves a ring was declared, and a declared ring can
 * still be clipped by an `overflow-hidden` parent or painted over — which is
 * how the editor's skill cell drew none at all while the lattice story passed
 * (audit issue 23). So the page is photographed twice with focus left where it
 * is: once as drawn, once with the ring's colour made transparent. Identical
 * pictures mean the ring painted no pixel anyone could see.
 *
 * Only the ring changes between the two. Blurring instead would also undo
 * whatever else focus does — a menu's highlight, a dialog's trap — and any of
 * those would pass for a ring. `--tw-ring-color` is what
 * `focus-visible:ring-ring` sets, so a ring drawn some other way makes the
 * pictures match and fails here.
 *
 * KNOWN GAP: any changed pixel counts. The test iframe is drawn at 0.8 scale,
 * so a ring clipped along a sub-pixel edge can leak a faint one-pixel sliver,
 * and that passes as visible. A ring hidden outright, as issue 23's was, fails.
 *
 * The photographs need Vitest's browser mode — the `vitest run` gate — which
 * is told by `__vitest_browser__`, the flag Storybook's own vitest plugin
 * checks before it touches `page`. The Storybook UI and Chromatic run the same
 * play function without it, and there the declared ring is all that is
 * checked.
 */
export const expectVisibleFocusRing = async (control: HTMLElement) => {
  await expect(getComputedStyle(control).boxShadow).not.toBe("none")
  if (!("__vitest_browser__" in globalThis)) return

  const { page } = await import("vitest/browser")
  const photograph = () =>
    page.screenshot({ save: false, animations: "disabled" })

  const drawn = await photograph()
  control.style.setProperty("--tw-ring-color", "transparent")
  const withoutTheRing = await photograph()
  control.style.removeProperty("--tw-ring-color")

  await expect(
    drawn === withoutTheRing,
    "the focus ring paints no pixel the screen shows"
  ).toBe(false)
}
