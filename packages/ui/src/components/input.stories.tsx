import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent } from "storybook/test"

import { Input } from "@workspace/ui/components/input"

const SEARCH_TERM = "react"

// Both search fields are borderless — the border belongs to the bar or field
// wrapping them — so the stories supply the wrapper the input expects.
//
// THE BOX BELOW HAS NO PADDING AND THE ARGS DO. That is the arrangement every
// call site uses and it is not decoration here: a wrapper that keeps the inset
// leaves a ring between the border and the text that belongs to neither and
// takes no click, which is the whole of EDITOR-76. These stories are where a
// reader finds out what to wrap this component in, and they drew the broken
// shape until 2026-09-05.
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

// The filter bar.
export const Search: Story = {}

// The add-skill dialog's GitHub search.
export const Dialog: Story = {
  args: { variant: "dialog", placeholder: "owner/repo" },
}

// The stuck filter bar, where the surface under the input turns to ink and the
// type has to invert with it.
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

// The field fills the box it is given, on both axes, which is what makes every
// pixel inside that border take the caret. MEASURED rather than read off the
// classes, because a class in the DOM is not a class in effect — and this one is
// load-bearing enough that the note at the top of the file is a claim about it.
//
// A press in the corner is what a visitor actually does, and it is not
// expressible here: `userEvent` dispatches on an element rather than hit-testing
// a point, so what a pointer does to a padded wrapper is a browser behaviour
// only a real pointer produces. The editor's `field-hit-area.spec.ts` is where
// that press lives. This asserts the thing the press depends on, and it is the
// only thing standing between the stories above and a decorator that quietly
// takes the padding back.
export const FillsTheBoxItSitsIn: Story = {
  play: async ({ canvas }) => {
    const field = canvas.getByPlaceholderText("search skills")
    const box = field.parentElement
    if (!box) throw new Error("the story's wrapper must be drawn")

    // `client*` is the box INSIDE the border and including its padding, which is
    // exactly the area the field has to cover: a wrapper that keeps an inset
    // reports the same figures and a field that is a strip in the middle of them.
    const drawn = field.getBoundingClientRect()

    // Half a pixel of tolerance and not a pixel more: `client*` is integral
    // while a rect is sub-pixel, so the two disagree by a rounding at most. The
    // smallest inset any of these boxes could take back is `p-px`, which is two.
    await expect(drawn.width).toBeCloseTo(box.clientWidth, 0)
    await expect(drawn.height).toBeCloseTo(box.clientHeight, 0)
  },
}

// The input switches the user agent's outline off, so the ring it draws in its
// place is the only focus state it has — and the filter bar moves focus into
// one of these on its own as the bar sticks. Axe cannot check a focus
// indicator, so this is the only thing holding the field to that ring.
export const FocusDrawsTheRing: Story = {
  play: async ({ canvas }) => {
    const field = canvas.getByPlaceholderText("search skills")

    field.focus()

    await expect(getComputedStyle(field).boxShadow).not.toBe("none")
  },
}

// The one thing about this input that is behaviour rather than type: it is
// uncontrolled by default, so what the user types has to survive on its own.
export const AcceptsTyping: Story = {
  play: async ({ canvas }) => {
    const field = canvas.getByPlaceholderText("search skills")

    await userEvent.type(field, SEARCH_TERM)

    await expect(field).toHaveValue(SEARCH_TERM)
  },
}
