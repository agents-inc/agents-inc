import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent } from "storybook/test"

import {
  ButtonGroup,
  ButtonGroupItem,
} from "@workspace/ui/components/button-group"

const INSTALL_MODES = ["plugin", "eject"] as const
const SCOPES = ["project", "global"] as const

// Drawn on the cell colour at `badge` scale and on the column at `field`, which
// is where each of them actually lives.
const meta = {
  title: "Components/ButtonGroup",
  component: ButtonGroup,
  decorators: [
    (Story) => (
      <div className="bg-cell p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ButtonGroup>

export default meta
type Story = StoryObj<typeof meta>

// A skill cell's install mode: both values on screen, the active one amber.
export const InstallMode: Story = {
  args: {
    "aria-label": "Install mode",
    children: INSTALL_MODES.map((mode) => (
      <ButtonGroupItem key={mode} active={mode === "plugin"}>
        {mode}
      </ButtonGroupItem>
    )),
  },
}

// THE TWO PAIRS AS A SKILL CELL DRAWS THEM. 0px inside a pair and 10px between
// them: the pair butts so it reads as one control, and the gap is what
// separates mode from scope. Getting it the other way round reads as four
// unrelated chips.
export const TwoPairsOnASkillCell: Story = {
  render: () => (
    <div className="flex items-center gap-[0.625rem]">
      <ButtonGroup aria-label="Install mode">
        {INSTALL_MODES.map((mode) => (
          <ButtonGroupItem key={mode} active={mode === "plugin"}>
            {mode}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
      <ButtonGroup aria-label="Scope">
        {SCOPES.map((scope) => (
          <ButtonGroupItem key={scope} active={scope === "project"}>
            {scope}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
    </div>
  ),
}

// The hinge filter: a bordered box sized to the accordion button opposite it,
// with a rule between the cells and both counts on screen at once.
export const FieldSize: Story = {
  args: {
    size: "field",
    "aria-label": "Show only selected skills",
    children: (
      <>
        <ButtonGroupItem size="field" active>
          all 42
        </ButtonGroupItem>
        <ButtonGroupItem size="field">selected 14</ButtonGroupItem>
      </>
    ),
  },
}

// `ButtonGroup` holds no state — the caller owns which cell is active, exactly
// as the skill cell does, where one store field decides the pair. So every
// story that moves the choice has to hold it.
function ControlledPair() {
  const [selected, setSelected] = useState<string>("plugin")

  return (
    <ButtonGroup aria-label="Install mode">
      {INSTALL_MODES.map((mode) => (
        <ButtonGroupItem
          key={mode}
          active={mode === selected}
          onClick={() => {
            setSelected(mode)
          }}
        >
          {mode}
        </ButtonGroupItem>
      ))}
    </ButtonGroup>
  )
}

// What the component owes: a click reaches the caller, and `active` reads back
// as checked.
export const ClickPicksACellDirectly: Story = {
  render: () => <ControlledPair />,
  play: async ({ canvas }) => {
    const plugin = canvas.getByRole("radio", { name: "plugin" })
    const eject = canvas.getByRole("radio", { name: "eject" })

    await expect(plugin).toHaveAttribute("aria-checked", "true")

    await userEvent.click(eject)

    await expect(eject).toHaveAttribute("aria-checked", "true")
    await expect(plugin).toHaveAttribute("aria-checked", "false")
  },
}

// THE CLAIM THE GROUP EXISTS TO MAKE. Two independent toggles say nothing about
// being alternatives; a radiogroup does, and it is the only thing that says it
// to a screen reader.
export const TheGroupAnnouncesOneExclusiveChoice: Story = {
  render: () => <ControlledPair />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("radiogroup", { name: "Install mode" })
    ).toContainElement(canvas.getByRole("radio", { name: "plugin" }))
  },
}

// One tab stop for the group rather than one per cell.
export const OnlyTheActiveCellIsATabStop: Story = {
  render: () => <ControlledPair />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("radio", { name: "eject" })).toHaveAttribute(
      "tabindex",
      "-1"
    )
  },
}

// Selection follows focus, as it does in a native radio group, and it goes
// through the cell's own click so the caller's handler stays the only place a
// choice is made.
export const ArrowKeysMoveTheChoice: Story = {
  render: () => <ControlledPair />,
  play: async ({ canvas }) => {
    canvas.getByRole("radio", { name: "plugin" }).focus()

    await userEvent.keyboard("{ArrowRight}")

    await expect(canvas.getByRole("radio", { name: "eject" })).toHaveAttribute(
      "aria-checked",
      "true"
    )
  },
}

// The focus ring, which axe cannot check — a focus indicator is not
// machine-decidable, so the assertion is the gate.
export const TheFocusedCellDrawsARing: Story = {
  render: () => <ControlledPair />,
  play: async ({ canvas }) => {
    await userEvent.tab()

    await expect(canvas.getByRole("radio", { name: "plugin" })).toHaveClass(
      /focus-visible:ring-1/
    )
  },
}
