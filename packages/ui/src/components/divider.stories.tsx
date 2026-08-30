import type { Meta, StoryObj } from "@storybook/react-vite"

import { Hinge, HingeButton, Rule } from "@workspace/ui/components/divider"

// Both dividers bleed out of the main column's gutter with `-mx-gutter`, so
// they need a gutter to bleed out of or they render off the canvas.
const meta = {
  title: "Components/Divider",
  component: Hinge,
  args: { label: "web" },
  decorators: [
    (Story) => (
      <div className="w-[40rem] px-gutter">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Hinge>

export default meta
type Story = StoryObj<typeof meta>

export const LabelledHinge: Story = {}

// The tail of the label set in ink rather than muted.
export const HingeWithEmphasis: Story = {
  args: { label: "selected", emphasis: "12 skills" },
}

// The 24px square on the content edge, painted over the trailing rule — the
// fill is the main column's own background, which is what masks the line
// behind the glyph. Only the `column` arm has this slot.
export const HingeWithAction: Story = {
  args: {
    label: "choose your stack",
    action: <HingeButton aria-label="Hide stacks">−</HingeButton>,
  },
}

// The roster's arm: no leading stub, so the label starts on the panel's flush
// left edge, and the control is a flow child between the label and the rule.
export const HingePanelVariant: Story = {
  args: {
    variant: "panel",
    label: "Sub-agents grouped by",
    control: <span className="font-mono text-9_5 text-ink">domain ▾</span>,
  },
}

// The unlabelled full-bleed rule, used only between domain sections.
export const PlainRule: Story = {
  render: () => <Rule />,
}
