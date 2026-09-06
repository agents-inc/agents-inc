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

// Dialog footer buttons — Close, Cancel.
export const Outline: Story = {}

// The confirming footer button.
export const Primary: Story = {
  args: { variant: "primary", children: "add 3 skills" },
}

// `+ add skill`, stretched to the filter bar's height. The mark is a drawn
// glyph rather than a fullwidth plus sign, so it is a flex item and the row's
// gap is what spaces it — a text glyph carried that spacing in the font, which
// is why it never sat level with the label beside it.
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

// Save / Share / Preview: three equal cells sharing one row above Install. The
// only button in the design with no fill at all — three fills stacked over
// Install would make Install the fourth thing on the row rather than the
// panel's one filled element.
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

// The stuck filter bar: the band is already the ink this button is filled with,
// so the fill goes and a hairline takes over.
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
