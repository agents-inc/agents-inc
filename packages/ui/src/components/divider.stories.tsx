import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, screen, userEvent } from "storybook/test"

import { Hinge, Rule } from "@workspace/ui/components/divider"

import { expectVisibleFocusRing } from "../../.storybook/focus-ring"

// The column variant bleeds by `-mx-gutter`, so it needs a gutter to bleed into.
const meta = {
  title: "Components/Divider",
  component: Hinge,
  args: { index: "02", label: "then your", emphasis: "stack" },
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

const WORDS = "then your stack"

export const StepTitle: Story = {}

export const StepTitleDrawsItsIndex: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("02")).toBeVisible()
  },
}

export const FoldableStepTitle: Story = {
  args: { expanded: true, onToggle: fn() },
}

export const FoldedStepTitle: Story = {
  args: { expanded: false, onToggle: fn() },
}

export const FoldableStepTitleIsADisclosure: Story = {
  ...FoldableStepTitle,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: WORDS })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
  },
}

export const FoldedStepTitleSaysSo: Story = {
  ...FoldedStepTitle,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: WORDS })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
  },
}

export const PressingTheTitleReachesTheCaller: Story = {
  ...FoldableStepTitle,
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: WORDS }))

    await expect(args.onToggle).toHaveBeenCalledTimes(1)
  },
}

export const StepTitleFocusDrawsTheRing: Story = {
  ...FoldableStepTitle,
  play: async () => {
    const title = screen.getByRole("button", { name: WORDS })

    title.focus()

    await expectVisibleFocusRing(title)
  },
}

export const PanelStepTitle: Story = {
  args: {
    variant: "panel",
    index: "05",
    label: "then",
    emphasis: "assign skills",
  },
}

export const PlainRule: Story = {
  render: () => <Rule />,
}
