import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent } from "storybook/test"

import { Button } from "@workspace/ui/components/button"

const meta = {
  title: "Components/Button",
  component: Button,
  args: { children: "close", onClick: fn() },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

// Dialog footer buttons — Close, Cancel.
export const Outline: Story = {}

// The confirming footer button.
export const Primary: Story = {
  args: { variant: "primary", children: "add 3 skills" },
}

// `＋ add skill`, stretched to the filter bar's height.
export const Block: Story = {
  args: { variant: "block", children: "＋ add skill", className: "h-11" },
}

// Install, full width in the roster footer.
export const Full: Story = {
  args: { variant: "full", children: "install" },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
}

// The stuck filter bar: the band is already the ink this button is filled with,
// so the fill goes and a hairline takes over.
export const BlockOnDark: Story = {
  args: {
    variant: "block",
    onDark: true,
    children: "＋ add skill",
    className: "h-11",
  },
  decorators: [
    (Story) => (
      <div className="bg-ink p-4">
        <Story />
      </div>
    ),
  ],
}

// `disabled:pointer-events-none` is styling, and styling is not a guarantee —
// this is the assertion that a disabled button cannot be actioned.
export const DisabledBlocksClicks: Story = {
  args: { disabled: true },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "close" })

    await expect(button).toBeDisabled()
    await userEvent.click(button, { pointerEventsCheck: 0 })
    await expect(args.onClick).not.toHaveBeenCalled()
  },
}
