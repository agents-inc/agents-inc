import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent } from "storybook/test"

import { Input } from "@workspace/ui/components/input"

import { expectVisibleFocusRing } from "../../.storybook/focus-ring"

const SEARCH_TERM = "react"

// The fields are borderless; the wrapper carries the border and no padding (the args pad), or the
// inset takes no click.
const FIELD_INSET = "px-3 py-2"

const meta = {
  title: "Components/Input",
  component: Input,
  args: { placeholder: "search skills", className: FIELD_INSET },
  decorators: [
    (Story) => (
      <div className="flex w-80 border border-rule bg-cell">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Search: Story = {}

export const Dialog: Story = {
  args: { variant: "dialog", placeholder: "owner/repo" },
}

export const SearchOnDark: Story = {
  args: { onDark: true },
  decorators: [
    (Story) => (
      <div className="flex w-80 bg-ink">
        <Story />
      </div>
    ),
  ],
}

// Measured, because a class in the DOM is not a class in effect. The real corner press lives in
// the editor's `field-hit-area.spec.ts`; `userEvent` cannot hit-test a point.
export const FillsTheBoxItSitsIn: Story = {
  play: async ({ canvas }) => {
    const field = canvas.getByPlaceholderText("search skills")
    const box = field.parentElement
    if (!box) throw new Error("the story's wrapper must be drawn")

    // `client*` is the box inside the border, padding included: the area the field must cover.
    const drawn = field.getBoundingClientRect()

    // `client*` is integral and a rect sub-pixel; the smallest inset, `p-px`, would be two.
    await expect(drawn.width).toBeCloseTo(box.clientWidth, 0)
    await expect(drawn.height).toBeCloseTo(box.clientHeight, 0)
  },
}

// Axe cannot check focus indicators, and the UA outline is off.
export const FocusDrawsTheRing: Story = {
  play: async ({ canvas }) => {
    const field = canvas.getByPlaceholderText("search skills")

    field.focus()

    await expectVisibleFocusRing(field)
  },
}

// Uncontrolled by default, so typing must survive on its own.
export const AcceptsTyping: Story = {
  play: async ({ canvas }) => {
    const field = canvas.getByPlaceholderText("search skills")

    await userEvent.type(field, SEARCH_TERM)

    await expect(field).toHaveValue(SEARCH_TERM)
  },
}
