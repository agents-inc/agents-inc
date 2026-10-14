import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent } from "storybook/test"

import {
  Lattice,
  LatticeCell,
  LatticeCellButton,
  LatticeRow,
  LatticeRows,
} from "@workspace/ui/components/lattice"

import { expectVisibleFocusRing } from "../../.storybook/focus-ring"

// The inset lines only read against the page ground.
const meta = {
  title: "Components/Lattice",
  component: Lattice,
  decorators: [
    (Story) => (
      <div className="w-[40rem] bg-background p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Lattice>

export default meta
type Story = StoryObj<typeof meta>

const SKILLS = ["react", "typescript", "tailwind", "vitest"]

export const FourColumns: Story = {
  args: {
    columns: 4,
    children: SKILLS.map((skill) => (
      <LatticeCell key={skill} className="p-3 font-mono text-11">
        {skill}
      </LatticeCell>
    )),
  },
}

export const PartialRow: Story = {
  args: {
    columns: 4,
    children: SKILLS.slice(0, 2).map((skill) => (
      <LatticeCell key={skill} className="p-3 font-mono text-11">
        {skill}
      </LatticeCell>
    )),
  },
}

export const CellStates: Story = {
  args: {
    columns: 3,
    children: [
      <LatticeCell key="plain" className="p-3 font-mono text-11">
        plain
      </LatticeCell>,
      <LatticeCell key="selected" selected className="p-3 font-mono text-11">
        selected
      </LatticeCell>,
      <LatticeCell
        key="disabled"
        disabled
        interactive={false}
        className="p-3 font-mono text-11"
      >
        incompatible
      </LatticeCell>,
    ],
  },
}

const CELL = "react"
const OPTIONS = "Options for react"
const STACK = "Next.js Full-Stack"

export const FocusableCellDrawsTheRing: Story = {
  args: {
    columns: 1,
    children: (
      <LatticeCell
        role="button"
        tabIndex={0}
        aria-label={STACK}
        className="p-3 font-mono text-11"
      >
        {STACK}
      </LatticeCell>
    ),
  },
  play: async ({ canvas }) => {
    const cell = canvas.getByRole("button", { name: STACK })

    cell.focus()

    await expectVisibleFocusRing(cell)
  },
}

export const CellButtonTakesKeyboardFocus: Story = {
  args: {
    columns: 1,
    children: (
      <LatticeCell className="p-3 font-mono text-11">
        <LatticeCellButton aria-label={CELL} />
        <span className="pointer-events-none relative z-1">{CELL}</span>
      </LatticeCell>
    ),
  },
  play: async ({ canvas }) => {
    await userEvent.tab()

    await expect(canvas.getByRole("button", { name: CELL })).toHaveFocus()
  },
}

export const CellButtonLeavesItsNeighbourReachable: Story = {
  args: {
    columns: 1,
    children: (
      <LatticeCell className="p-3 font-mono text-11">
        <LatticeCellButton aria-label={CELL} />
        <span className="pointer-events-none relative z-1">
          {CELL}
          <button
            type="button"
            aria-label={OPTIONS}
            className="pointer-events-auto ml-2"
          >
            •••
          </button>
        </span>
      </LatticeCell>
    ),
  },
  play: async ({ canvas }) => {
    await userEvent.tab()
    await userEvent.tab()

    await expect(canvas.getByRole("button", { name: OPTIONS })).toHaveFocus()
  },
}

export const CellButtonFocusDrawsTheRing: Story = {
  args: {
    columns: 1,
    children: (
      <LatticeCell className="p-3 font-mono text-11">
        <LatticeCellButton aria-label={CELL} />
        <span className="pointer-events-none relative z-1">{CELL}</span>
      </LatticeCell>
    ),
  },
  play: async ({ canvas }) => {
    const surface = canvas.getByRole("button", { name: CELL })

    surface.focus()

    await expectVisibleFocusRing(surface)
  },
}

const ROW = "agents-inc/skills"
const SELECTED_ROW = "agents-inc/cli"

export const Rows: Story = {
  render: () => (
    <LatticeRows>
      <LatticeRow className="font-mono text-11">{ROW}</LatticeRow>
      <LatticeRow selected className="font-mono text-11">
        {SELECTED_ROW}
      </LatticeRow>
    </LatticeRows>
  ),
}

export const RowTakesKeyboardFocus: Story = {
  render: () => (
    <LatticeRows>
      <LatticeRow className="font-mono text-11">{ROW}</LatticeRow>
    </LatticeRows>
  ),
  play: async ({ canvas }) => {
    await userEvent.tab()

    await expect(canvas.getByRole("button", { name: ROW })).toHaveFocus()
  },
}

export const RowEnterReachesHandler: Story = {
  args: { onClick: fn() },
  render: (args) => (
    <LatticeRows>
      <LatticeRow className="font-mono text-11" onClick={args.onClick}>
        {ROW}
      </LatticeRow>
    </LatticeRows>
  ),
  play: async ({ args }) => {
    await userEvent.tab()
    await userEvent.keyboard("{Enter}")

    await expect(args.onClick).toHaveBeenCalledTimes(1)
  },
}

export const RowSpaceReachesHandler: Story = {
  args: { onClick: fn() },
  render: (args) => (
    <LatticeRows>
      <LatticeRow className="font-mono text-11" onClick={args.onClick}>
        {ROW}
      </LatticeRow>
    </LatticeRows>
  ),
  play: async ({ args }) => {
    await userEvent.tab()
    await userEvent.keyboard(" ")

    await expect(args.onClick).toHaveBeenCalledTimes(1)
  },
}

export const RowFocusDrawsTheRing: Story = {
  render: () => (
    <LatticeRows>
      <LatticeRow className="font-mono text-11">{ROW}</LatticeRow>
    </LatticeRows>
  ),
  play: async ({ canvas }) => {
    const row = canvas.getByRole("button", { name: ROW })

    row.focus()

    await expectVisibleFocusRing(row)
  },
}

export const SelectedRowIsPressed: Story = {
  render: () => (
    <LatticeRows>
      <LatticeRow selected className="font-mono text-11">
        {SELECTED_ROW}
      </LatticeRow>
    </LatticeRows>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: SELECTED_ROW })
    ).toHaveAttribute("aria-pressed", "true")
  },
}

// Guards `outline-none` staying out of the cva base; see `latticeRowVariants`.
export const SelectedRowKeepsItsOutlineWhileFocused: Story = {
  render: () => (
    <LatticeRows>
      <LatticeRow selected className="font-mono text-11">
        {SELECTED_ROW}
      </LatticeRow>
    </LatticeRows>
  ),
  play: async ({ canvas }) => {
    const row = canvas.getByRole("button", { name: SELECTED_ROW })

    row.focus()

    await expect(getComputedStyle(row).outlineStyle).not.toBe("none")
  },
}
