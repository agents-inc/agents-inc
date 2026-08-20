import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent } from "storybook/test"

import {
  Lattice,
  LatticeCell,
  LatticeRow,
  LatticeRows,
} from "@workspace/ui/components/lattice"

// Cells are pulled back 1px so every shared edge lands on one physical line.
// That only reads correctly against the page ground, so the stories carry it.
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

// A partial row — the case the design file's grid-level border gets wrong, and
// the reason the border lives on the cell here.
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

// Selected is an amber outline; incompatible is dimmed but never hidden, and
// deliberately still hoverable so its tooltip can explain why.
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

const ROW = "agents-inc/skills"
const SELECTED_ROW = "agents-inc/cli"

// The row variant: full-width cells rather than grid columns.
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

// The add-skill dialog's result row is the only way to stage a skill, and a
// hand cursor is a picture of an affordance rather than one. This is the claim
// that the row is reachable without a pointer at all.
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

// Enter reaches the caller's `onClick` — the same handler the pointer path
// uses, so the two devices cannot drift into meaning different things.
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

// Space is the other half of what a native button answers, and the row claims
// to be one. It is the key a screen reader user reaches for first.
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

// The package draws one focus ring on every focusable control it ships. Axe
// cannot check a focus indicator — it is not machine-decidable — so this is the
// only thing holding the row to that ring.
export const RowFocusDrawsTheRing: Story = {
  render: () => (
    <LatticeRows>
      <LatticeRow className="font-mono text-11">{ROW}</LatticeRow>
    </LatticeRows>
  ),
  play: async ({ canvas }) => {
    const row = canvas.getByRole("button", { name: ROW })

    row.focus()

    await expect(getComputedStyle(row).boxShadow).not.toBe("none")
  },
}

// Selected is the row's state rather than its look, so it is on the element as
// well as in the classes — a staged row that only goes amber says nothing to a
// screen reader.
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

// The focus ring is drawn with `ring`, and the selection with `outline` — so
// the row's `outline-none` sits in the UNSELECTED branch rather than the cva
// base. Tailwind emits `.outline-none` after `.outline-1`, at equal
// specificity, so a base `outline-none` would silently erase the amber
// selection every staged row is recognised by. This is the story that says so.
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
