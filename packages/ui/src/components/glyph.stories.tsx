import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { Glyph, GLYPH_PATHS } from "@workspace/ui/components/glyph"

const meta = {
  title: "Components/Glyph",
  component: Glyph,
  args: { name: "plus" },
} satisfies Meta<typeof Glyph>

export default meta
type Story = StoryObj<typeof meta>

export const Plus: Story = {}

// The sizes the app actually draws: 13px is the default everywhere, 11px is
// the small pair (the proposal's bullets, the add-skill rows' stage marker),
// and 10px is the grouping control's caret.
export const EverySize: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-ink">
      <Glyph name="plus" size={10} />
      <Glyph name="plus" size={11} />
      <Glyph name="plus" size={13} />
      <Glyph name="plus" size={16} />
    </div>
  ),
}

export const EveryGlyph: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4 text-ink">
      {Object.keys(GLYPH_PATHS).map((name) => (
        <Glyph
          key={name}
          name={name as keyof typeof GLYPH_PATHS}
          size={16}
          data-testid={name}
        />
      ))}
    </div>
  ),
}

// THE CLAIM THE SET EXISTS FOR. Round caps against a design with no radius
// anywhere is the defect this replaced, and it is invisible at 11px until two
// glyphs sit on one row — so it is asserted rather than looked at.
export const OneGeometryForEveryGlyph: Story = {
  ...EveryGlyph,
  play: async ({ canvas }) => {
    for (const name of Object.keys(GLYPH_PATHS)) {
      const glyph = canvas.getByTestId(name)

      await expect(glyph).toHaveAttribute("stroke-width", "1.75")
      await expect(glyph).toHaveAttribute("stroke-linecap", "butt")
      await expect(glyph).toHaveAttribute("stroke-linejoin", "miter")
    }
  },
}

// Every glyph sits inside a control that already names itself, so none of them
// puts a second name into the accessible one.
export const HiddenFromTheAccessibilityTree: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector("[data-slot=glyph]")
    ).toHaveAttribute("aria-hidden", "true")
  },
}
