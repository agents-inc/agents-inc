import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { Chip } from "@workspace/ui/components/chip"

const meta = {
  title: "Components/Chip",
  component: Chip,
  args: { children: "web" },
} satisfies Meta<typeof Chip>

export default meta
type Story = StoryObj<typeof meta>

// The filter bar's domain chip at rest.
export const Filter: Story = {}

// On is amber ink on the accent wash. Hover only firms the border — it never
// goes amber, because amber is reserved for what the user actually chose.
export const FilterActive: Story = {
  args: { active: true },
}

// Inside the skill options panel, where the chip stretches to fill its row.
export const Segment: Story = {
  args: { size: "segment", children: "plugin", className: "w-32" },
}

// On the add-skill result rows.
export const Stage: Story = {
  args: { size: "stage", children: "staged" },
}

// The stuck filter bar: the surface turns to ink, so the border goes — the chip
// is the one thing on the band that keeps none — and it reads as ink lifted on
// a translucent white wash instead.
export const OnDarkBand: Story = {
  args: { onDark: true },
  decorators: [
    (Story) => (
      <div className="bg-ink p-4">
        <Story />
      </div>
    ),
  ],
}

// A Chip is a button, and the package draws one focus ring on every button it
// ships. Axe cannot check a focus indicator — it is not machine-decidable — so
// this is the only thing holding a Chip to that ring.
export const FocusDrawsTheRing: Story = {
  play: async ({ canvas }) => {
    const chip = canvas.getByRole("button", { name: "web" })

    chip.focus()

    await expect(getComputedStyle(chip).boxShadow).not.toBe("none")
  },
}
