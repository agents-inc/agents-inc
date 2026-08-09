import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent } from "storybook/test"

import {
  MatrixGrid,
  type LoadState,
  type MatrixRow,
} from "@workspace/ui/components/matrix-grid"

const ROLES = ["dev", "pm", "rsrch", "rev", "test"]

// A domain × role pair with no sub-agent behind it, as distinct from a pair
// that has one and is simply unassigned (`null`, the third `LoadState`).
const ABSENT = "absent"
type Slot = LoadState | typeof ABSENT

// One spy for the whole grid — every cell reports the same way, and Storybook
// resets it between stories.
const onCycle = fn()

const row = (label: string, slots: Slot[]): MatrixRow => ({
  key: label,
  label,
  cells: slots.map((slot, index) => {
    const role = ROLES[index] ?? String(index)
    if (slot === ABSENT) return null
    return { key: `${label}-${role}`, state: slot, label: role, onCycle }
  }),
})

// The panel this grid lives in is 210px wide.
const meta = {
  title: "Components/MatrixGrid",
  component: MatrixGrid,
  args: {
    columns: ROLES,
    rows: [
      row("web", [null, "lazy", null, "preloaded", null]),
      row("api", [null, null, null, null, null]),
      row("ai", ["preloaded", ABSENT, ABSENT, null, null]),
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-[13.125rem] bg-cell p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MatrixGrid>

export default meta
type Story = StoryObj<typeof meta>

// Unassigned · lazy · preloaded, all three at once. The word in the cell *is*
// the state — the design has no legend and no icons.
export const AllStates: Story = {}

export const NothingAssigned: Story = {
  args: { rows: [row("web", [null, null, null, null, null])] },
}

// Clicking a cell cycles it. The grid does not own the state, so what it owes
// the caller is that the click arrives, addressed to the right cell.
export const ClickingACellCycles: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "web pm" }))

    await expect(onCycle).toHaveBeenCalledTimes(1)
  },
}

// Every cell is a real `<button>`, so the grid is operable without a pointer.
// This is the assertion that keeps it that way.
export const CellsAreKeyboardOperable: Story = {
  play: async ({ canvas }) => {
    const cell = canvas.getByRole("button", { name: "web dev" })

    cell.focus()
    await expect(cell).toHaveFocus()

    await userEvent.keyboard("{Enter}")

    await expect(onCycle).toHaveBeenCalledTimes(1)
  },
}

// A slot with no sub-agent behind it must not be reachable at all — it is
// `aria-hidden` and is not a button, so it is neither a tab stop nor announced.
export const AbsentSlotsAreNotButtons: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "ai pm" })).toBeNull()
  },
}

// A cell is a button, and the package draws one focus ring on every button it
// ships. Axe cannot check a focus indicator — it is not machine-decidable — so
// this is the only thing holding a cell to that ring.
export const FocusDrawsTheRing: Story = {
  play: async ({ canvas }) => {
    const cell = canvas.getByRole("button", { name: "web dev" })

    cell.focus()

    await expect(getComputedStyle(cell).boxShadow).not.toBe("none")
  },
}
