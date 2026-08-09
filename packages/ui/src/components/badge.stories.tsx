import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect } from "storybook/test"

import { Badge } from "@workspace/ui/components/badge"

// What the skill cell gives its flippable badges, so the name says the value
// rather than announcing "plugin, button".
const INSTALL_LABEL = "Install mode: plugin"

const meta = {
  title: "Components/Badge",
  component: Badge,
  args: { children: "plugin" },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

// The install-mode badge on a skill cell, holding its default value.
export const State: Story = {}

// The same badge holding a non-default value. Going amber here is the design's
// whole accent rule: amber marks what the user deliberately chose.
export const StateAlt: Story = {
  args: { alt: true, children: "eject" },
}

export const Tag: Story = {
  args: { variant: "tag", children: "added" },
}

export const Outline: Story = {
  args: { variant: "outline", children: "one of" },
}

// The one render path that takes focus: the skill cell flips both of its state
// badges, so both are real buttons. The package draws one focus ring on every
// button it ships, and axe cannot check a focus indicator — it is not
// machine-decidable — so this is the only thing holding the badge to that ring.
export const InteractiveFocusDrawsTheRing: Story = {
  args: {
    interactive: true,
    render: <button type="button" aria-label={INSTALL_LABEL} />,
  },
  play: async ({ canvas }) => {
    const badge = canvas.getByRole("button", { name: INSTALL_LABEL })

    badge.focus()

    await expect(getComputedStyle(badge).boxShadow).not.toBe("none")
  },
}
