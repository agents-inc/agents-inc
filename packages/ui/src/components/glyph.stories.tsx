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

// Round caps are invisible at 11px until two glyphs share a row, so this is asserted. Computed on
// every drawn shape, so it holds wherever the stroke is declared and fails when CSS overrides it.
export const OneGeometryForEveryGlyph: Story = {
  ...EveryGlyph,
  play: async ({ canvas }) => {
    for (const name of Object.keys(GLYPH_PATHS)) {
      for (const shape of canvas.getByTestId(name).querySelectorAll("*")) {
        const stroke = getComputedStyle(shape)

        await expect(stroke.strokeWidth).toBe("1.75px")
        await expect(stroke.strokeLinecap).toBe("butt")
        await expect(stroke.strokeLinejoin).toBe("miter")
      }
    }
  },
}

export const HiddenFromTheAccessibilityTree: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector("[data-slot=glyph]")
    ).toHaveAttribute("aria-hidden", "true")
  },
}
