import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent } from "storybook/test"

import { Input } from "@workspace/ui/components/input"

const SEARCH_TERM = "react"

// Both search fields are borderless — the border belongs to the bar or field
// wrapping them — so the stories supply the wrapper the input expects.
const meta = {
  title: "Components/Input",
  component: Input,
  args: { placeholder: "search skills" },
  decorators: [
    (Story) => (
      <div className="flex w-80 border border-rule bg-cell px-3 py-2">
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
      <div className="flex w-80 bg-ink px-3 py-2">
        <Story />
      </div>
    ),
  ],
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
