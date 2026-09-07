import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, screen } from "storybook/test"

import {
  ButtonGroup,
  ButtonGroupItem,
} from "@workspace/ui/components/button-group"
import { Hinge, HingeButton, Rule } from "@workspace/ui/components/divider"
import { Glyph } from "@workspace/ui/components/glyph"

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
    action: (
      <HingeButton aria-label="Hide stacks">
        <Glyph name="minus" />
      </HingeButton>
    ),
  },
}

// The other thing that lives in that slot: a section-level toggle that states
// its VALUE rather than its name. Same edge, same border and the same masking
// fill as the button above, because it is the same class of control — and the
// hinge takes the control's own height, or the sticky bar below paints over the
// 6px it would otherwise overhang by.
//
// The control in the slot is a `ButtonGroup` at `field` size since the
// 2026-09-06 refresh — `all 42 | selected 14`, both counts on screen. It was a
// `HingeToggle` rendering one count at a time, and that component is gone
// rather than deprecated: a chip states ONE value, which is the thing the
// refresh removed from every control in the app.
export const HingeWithToggle: Story = {
  args: {
    className: "min-h-6",
    label: "then",
    emphasis: "pick your skills",
    action: (
      <ButtonGroup size="field" aria-label="Show only selected skills">
        <ButtonGroupItem size="field" active>
          all 42
        </ButtonGroupItem>
        <ButtonGroupItem size="field">selected 14</ButtonGroupItem>
      </ButtonGroup>
    ),
  },
}

// Filtered, the other cell takes the amber pair — the design's one accent, and
// it means "not the default" rather than "active" anywhere it appears.
export const HingeWithToggleOn: Story = {
  ...HingeWithToggle,
  args: {
    ...HingeWithToggle.args,
    action: (
      <ButtonGroup size="field" aria-label="Show only selected skills">
        <ButtonGroupItem size="field">all 42</ButtonGroupItem>
        <ButtonGroupItem size="field" active>
          selected 14
        </ButtonGroupItem>
      </ButtonGroup>
    ),
  },
}

// The roster's arm: no leading stub, so the label starts on the panel's flush
// left edge, and the control is a flow child between the label and the rule.
export const HingePanelVariant: Story = {
  args: {
    variant: "panel",
    label: "Sub-agents grouped by",
    control: (
      <span className="flex items-center gap-1 bg-wash py-[0.1875rem] pr-2.5 pl-2 font-mono text-9_5 text-brand-ink">
        domain
        <Glyph name="chevronDown" size={10} className="text-brand-dim" />
      </span>
    ),
  },
}

// The unlabelled full-bleed rule, used only between domain sections.
export const PlainRule: Story = {
  render: () => <Rule />,
}

// THE PACKAGE'S ONE FOCUS TREATMENT, on the two controls this file ships. Axe
// cannot check a focus indicator — it is not machine-decidable — so a play
// function that focuses the control and reads its `box-shadow` back is the
// entire gate. Both are square controls with no box of their own beyond a
// hairline, which is exactly the shape a missing ring is invisible on.
export const AccordionButtonFocusDrawsTheRing: Story = {
  ...HingeWithAction,
  play: async () => {
    const button = screen.getByRole("button", { name: "Hide stacks" })

    button.focus()

    await expect(getComputedStyle(button).boxShadow).not.toBe("none")
  },
}

// The filter's OWN claims — the focus ring, the exclusive group, the roving tab
// stop — are `button-group.stories.tsx`'s, and they are not restated here. Two
// stories asserted them through `HingeToggle` until that component was removed
// in the 2026-09-06 refresh; a second copy of an assertion in the caller's file
// is how the two come to disagree. What the two stories above still own is the
// only thing this file can say about it: that the slot holds it, and that it
// masks the rule it interrupts rather than being struck through by it.
