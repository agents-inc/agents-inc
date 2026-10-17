import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent } from "storybook/test"

import {
  FieldLabel,
  Segmented,
  SegmentedItem,
} from "@workspace/ui/components/segmented"

const INSTALL_MODES = ["plugin", "eject"] as const

// The panel is 210px wide.
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

// `Segmented` holds no state, so stories that move the choice hold it.
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

export const TheRowAnnouncesOneExclusiveChoice: Story = {
  render: () => <ControlledRow />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("radiogroup")).toContainElement(
      canvas.getByRole("radio", { name: "plugin" })
    )
  },
}

export const OnlyTheActiveSegmentIsATabStop: Story = {
  render: () => <ControlledRow />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("radio", { name: "eject" })).toHaveAttribute(
      "tabindex",
      "-1"
    )
  },
}

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
