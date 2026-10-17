import type { Meta, StoryObj } from "@storybook/react-vite"

import { Chip } from "@workspace/ui/components/chip"

import { expectVisibleFocusRing } from "../../.storybook/focus-ring"

const meta = {
  title: "Components/Chip",
  component: Chip,
  args: { children: "web" },
} satisfies Meta<typeof Chip>

export default meta
type Story = StoryObj<typeof meta>

export const Filter: Story = {}

export const FilterActive: Story = {
  args: { active: true },
}

export const Segment: Story = {
  args: { size: "segment", children: "plugin", className: "w-32" },
}

export const Stage: Story = {
  args: { size: "stage", children: "staged" },
}

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

// Axe cannot check focus indicators.
export const FocusDrawsTheRing: Story = {
  play: async ({ canvas }) => {
    const chip = canvas.getByRole("button", { name: "web" })

    chip.focus()

    await expectVisibleFocusRing(chip)
  },
}
