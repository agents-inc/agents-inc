import type { Meta, StoryObj } from "@storybook/react-vite"

import { Hinge, Rule } from "@workspace/ui/components/divider"

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

// The unlabelled full-bleed rule, used only between domain sections.
export const PlainRule: Story = {
  render: () => <Rule />,
}
