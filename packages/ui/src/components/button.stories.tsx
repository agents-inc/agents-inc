import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent } from "storybook/test"

import { Button } from "@workspace/ui/components/button"
import { Glyph } from "@workspace/ui/components/glyph"

const meta = {
  title: "Components/Button",
  component: Button,
  args: { children: "close", onClick: fn() },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Outline: Story = {}

export const Primary: Story = {
  args: { variant: "primary", children: "add 3 skills" },
}

export const Block: Story = {
  args: {
    variant: "block",
    className: "h-11 gap-2",
    children: (
      <>
        <Glyph name="plus" />
        add skill
      </>
    ),
  },
}

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

export const Action: Story = {
  args: { variant: "action", children: "save" },
  decorators: [
    (Story) => (
      <div className="flex w-[18.75rem] gap-[0.5625rem]">
        <Story />
        <Button variant="action">share</Button>
        <Button variant="action">
          <Glyph name="code" className="text-brand" />
          <span className="min-w-0 truncate">preview</span>
        </Button>
      </div>
    ),
  ],
}

export const BlockOnDark: Story = {
  args: {
    variant: "block",
    onDark: true,
    className: "h-11 gap-2",
    children: (
      <>
        <Glyph name="plus" />
        add skill
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div className="bg-ink p-4">
        <Story />
      </div>
    ),
  ],
}

// `disabled:pointer-events-none` is styling, not a guarantee.
export const DisabledBlocksClicks: Story = {
  args: { disabled: true },
  play: async ({ args, canvas }) => {
    const button = canvas.getByRole("button", { name: "close" })

    await expect(button).toBeDisabled()
    await userEvent.click(button, { pointerEventsCheck: 0 })
    await expect(args.onClick).not.toHaveBeenCalled()
  },
}
