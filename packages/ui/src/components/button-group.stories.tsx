import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent } from "storybook/test"

import {
  ButtonGroup,
  ButtonGroupItem,
} from "@workspace/ui/components/button-group"

import { resolvedColor } from "../../.storybook/resolved-color"

const INSTALL_MODES = ["plugin", "eject"] as const
const SCOPES = ["project", "global"] as const
const MODELS = ["opus", "fable", "sonnet", "haiku"] as const
const GROUPINGS = ["domain", "scope"] as const

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

export const InactiveBadgeTakesTheFieldFaintInk: Story = {
  ...InstallMode,
  play: async ({ canvas }) => {
    await expect(
      getComputedStyle(canvas.getByRole("radio", { name: "eject" })).color
    ).toBe(resolvedColor("--color-field-faint"))
  },
}

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

export const UnavailableCell: Story = {
  render: () => (
    <ButtonGroup aria-label="Scope">
      <ButtonGroupItem aria-disabled title="Codex has no project-level plugins">
        project
      </ButtonGroupItem>
      <ButtonGroupItem active>global</ButtonGroupItem>
    </ButtonGroup>
  ),
}

export const UnavailableCellTakesTheUnavailableInk: Story = {
  ...UnavailableCell,
  play: async ({ canvas }) => {
    await expect(
      getComputedStyle(canvas.getByRole("radio", { name: "project" })).color
    ).toBe(resolvedColor("--color-unavailable"))
  },
}

export const UnavailableCellRefusesThePointer: Story = {
  ...UnavailableCell,
  play: async ({ canvas }) => {
    await expect(
      getComputedStyle(canvas.getByRole("radio", { name: "project" })).cursor
    ).toBe("not-allowed")
  },
}

export const ErrorCell: Story = {
  render: () => (
    <ButtonGroup aria-label="Scope">
      <ButtonGroupItem
        active
        error
        aria-disabled
        title="Codex has no project-level plugins"
      >
        project
      </ButtonGroupItem>
      <ButtonGroupItem>global</ButtonGroupItem>
    </ButtonGroup>
  ),
}

export const ErrorCellTakesTheErrorInk: Story = {
  ...ErrorCell,
  play: async ({ canvas }) => {
    await expect(
      getComputedStyle(canvas.getByRole("radio", { name: "project" })).color
    ).toBe(resolvedColor("--color-error-ink"))
  },
}

export const ErrorCellTakesTheErrorWash: Story = {
  ...ErrorCell,
  play: async ({ canvas }) => {
    await expect(
      getComputedStyle(canvas.getByRole("radio", { name: "project" }))
        .backgroundColor
    ).toBe(resolvedColor("--color-error-wash"))
  },
}

export const CardPreset: Story = {
  args: {
    "aria-label": "Model for web-developer",
    children: MODELS.map((model) => (
      <ButtonGroupItem
        key={model}
        size="segment"
        preset="card"
        active={model === "sonnet"}
      >
        {model}
      </ButtonGroupItem>
    )),
  },
}

export const RailPreset: Story = {
  args: {
    "aria-label": "Group sub-agents by",
    children: GROUPINGS.map((grouping) => (
      <ButtonGroupItem
        key={grouping}
        size="segment"
        preset="rail"
        active={grouping === "domain"}
      >
        {grouping}
      </ButtonGroupItem>
    )),
  },
}

export const SearchPreset: Story = {
  args: {
    "aria-label": "Show only selected skills",
    children: (
      <>
        <ButtonGroupItem size="segment" preset="search" active>
          all 238
        </ButtonGroupItem>
        <ButtonGroupItem size="segment" preset="search">
          selected 14
        </ButtonGroupItem>
      </>
    ),
  },
}

export const RecedeTone: Story = {
  args: {
    "aria-label": "Model for web-developer",
    children: MODELS.map((model) => (
      <ButtonGroupItem
        key={model}
        size="segment"
        preset="card"
        tone="recede"
        active={model === "sonnet"}
      >
        {model}
      </ButtonGroupItem>
    )),
  },
}

export const OnDarkTone: Story = {
  decorators: [
    (Story) => (
      <div className="bg-ink p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    "aria-label": "Show only selected skills",
    children: (
      <>
        <ButtonGroupItem size="segment" preset="search" tone="onDark">
          all 238
        </ButtonGroupItem>
        <ButtonGroupItem size="segment" preset="search" tone="onDark" active>
          selected 14
        </ButtonGroupItem>
      </>
    ),
  },
}

// `ButtonGroup` holds no state, so a story that moves the choice has to.
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

export const TheGroupAnnouncesOneExclusiveChoice: Story = {
  render: () => <ControlledPair />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("radiogroup", { name: "Install mode" })
    ).toContainElement(canvas.getByRole("radio", { name: "plugin" }))
  },
}

export const OnlyTheActiveCellIsATabStop: Story = {
  render: () => <ControlledPair />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("radio", { name: "eject" })).toHaveAttribute(
      "tabindex",
      "-1"
    )
  },
}

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

const NEXT_CONTROL = "Next"

export const AnUndefinedTabIndexLeavesOneTabStop: Story = {
  render: () => (
    <div className="flex items-center gap-[0.625rem]">
      <ButtonGroup aria-label="Install mode">
        {INSTALL_MODES.map((mode) => (
          <ButtonGroupItem
            key={mode}
            active={mode === "plugin"}
            tabIndex={undefined}
          >
            {mode}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
      <button type="button">{NEXT_CONTROL}</button>
    </div>
  ),
  play: async ({ canvas }) => {
    await userEvent.tab()
    await userEvent.tab()

    await expect(
      canvas.getByRole("button", { name: NEXT_CONTROL })
    ).toHaveFocus()
  },
}

export const AnUndefinedTabIndexLeavesTheStopOnTheActiveCell: Story = {
  render: () => (
    <ButtonGroup aria-label="Install mode">
      {INSTALL_MODES.map((mode) => (
        <ButtonGroupItem
          key={mode}
          active={mode === "eject"}
          tabIndex={undefined}
        >
          {mode}
        </ButtonGroupItem>
      ))}
    </ButtonGroup>
  ),
  play: async ({ canvas }) => {
    await userEvent.tab()

    await expect(canvas.getByRole("radio", { name: "eject" })).toHaveFocus()
  },
}

export const ACallerTabIndexTakesTheActiveCellOutOfTheTabOrder: Story = {
  render: () => (
    <div className="flex items-center gap-[0.625rem]">
      <ButtonGroup aria-label="Install mode">
        {INSTALL_MODES.map((mode) => (
          <ButtonGroupItem key={mode} active={mode === "plugin"} tabIndex={-1}>
            {mode}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
      <button type="button">{NEXT_CONTROL}</button>
    </div>
  ),
  play: async ({ canvas }) => {
    await userEvent.tab()

    await expect(
      canvas.getByRole("button", { name: NEXT_CONTROL })
    ).toHaveFocus()
  },
}
