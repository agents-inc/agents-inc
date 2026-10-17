import { expect } from "storybook/test"

/**
 * Proves the ring reaches the screen by photographing with and without `--tw-ring-color`, since
 * a declared ring can be clipped. Any changed pixel passes. Only under Vitest browser mode
 * (`__vitest_browser__`); elsewhere just the declared ring is checked.
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
