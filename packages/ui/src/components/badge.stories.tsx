import type { Meta, StoryObj } from "@storybook/react-vite"

import { Badge } from "@workspace/ui/components/badge"

// So the name says the value rather than "plugin, button".
const INSTALL_LABEL = "Install mode: plugin"

const meta = {
  title: "Components/Badge",
  component: Badge,
  args: { children: "plugin" },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const State: Story = {}

export const StateAlt: Story = {
  args: { alt: true, children: "eject" },
}

export const Tag: Story = {
  args: { variant: "tag", children: "added" },
}

export const Outline: Story = {
  args: { variant: "outline", children: "one of" },
}

export const Interactive: Story = {
  args: {
    interactive: true,
    render: <button type="button" aria-label={INSTALL_LABEL} />,
  },
}
