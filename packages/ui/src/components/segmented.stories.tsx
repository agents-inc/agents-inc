import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent } from "storybook/test"

import {
  FieldLabel,
  Segmented,
  SegmentedItem,
} from "@workspace/ui/components/segmented"

const INSTALL_MODES = ["plugin", "eject"] as const

// The panel this row lives in is 210px wide, and the segments divide it evenly.
const meta = {
  title: "Components/Segmented",
  component: Segmented,
  decorators: [
    (Story) => (
      <div className="w-[13.125rem] bg-cell py-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Segmented>

export default meta
type Story = StoryObj<typeof meta>

export const InstallMode: Story = {
  args: {
    children: INSTALL_MODES.map((mode) => (
      <SegmentedItem key={mode} active={mode === "plugin"}>
        {mode}
      </SegmentedItem>
    )),
  },
}

// The uppercase mono caption above a row.
export const WithFieldLabel: Story = {
  render: () => (
    <>
      <FieldLabel first>install mode</FieldLabel>
      <Segmented>
        {INSTALL_MODES.map((mode) => (
          <SegmentedItem key={mode} active={mode === "plugin"}>
            {mode}
          </SegmentedItem>
        ))}
      </Segmented>
    </>
  ),
}

// `Segmented` holds no state — the caller owns which item is active, exactly as
// the skill options panel does, where one store field decides the whole row. So
// every story that moves the choice has to hold it.
function ControlledRow() {
  const [selected, setSelected] = useState<string>("plugin")

  return (
    <Segmented>
      {INSTALL_MODES.map((mode) => (
        <SegmentedItem
          key={mode}
          active={mode === selected}
          onClick={() => {
            setSelected(mode)
          }}
        >
          {mode}
        </SegmentedItem>
      ))}
    </Segmented>
  )
}

// What the component owes is that a click reaches the caller and that `active`
// reads back as checked.
export const ClickMovesTheActiveSegment: Story = {
  render: () => <ControlledRow />,
  play: async ({ canvas }) => {
    const plugin = canvas.getByRole("radio", { name: "plugin" })
    const eject = canvas.getByRole("radio", { name: "eject" })

    await expect(plugin).toHaveAttribute("aria-checked", "true")

    await userEvent.click(eject)

    await expect(eject).toHaveAttribute("aria-checked", "true")
    await expect(plugin).toHaveAttribute("aria-checked", "false")
  },
}

// The row is one choice, not several independent toggles — and the grouping is
// the only thing that says so to a screen reader.
export const TheRowAnnouncesOneExclusiveChoice: Story = {
  render: () => <ControlledRow />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("radiogroup")).toContainElement(
      canvas.getByRole("radio", { name: "plugin" })
    )
  },
}

// One tab stop for the row rather than one per segment: only the active segment
// is tabbable, and the arrows move within the row from there.
export const OnlyTheActiveSegmentIsATabStop: Story = {
  render: () => <ControlledRow />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("radio", { name: "eject" })).toHaveAttribute(
      "tabindex",
      "-1"
    )
  },
}

// Selection follows focus, as it does in a native radio group — and it goes
// through the segment's own click, so the caller's handler stays the only place
// a choice is ever made.
export const ArrowKeysMoveTheActiveSegment: Story = {
  render: () => <ControlledRow />,
  play: async ({ canvas }) => {
    canvas.getByRole("radio", { name: "plugin" }).focus()

    await userEvent.keyboard("{ArrowRight}")

    await expect(canvas.getByRole("radio", { name: "eject" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
  },
}
