import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent } from "storybook/test"

import {
  MatrixGrid,
  type LoadState,
  type MatrixRow,
} from "@workspace/ui/components/matrix-grid"

const ROLES = ["dev", "pm", "rsrch", "rev", "test"]

// No sub-agent behind the pair, unlike an unassigned `null` cell.
const ABSENT = "absent"
type Slot = LoadState | typeof ABSENT

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

export const AllStates: Story = {}

export const NothingAssigned: Story = {
  args: { rows: [row("web", [null, null, null, null, null])] },
}

export const ClickingACellCycles: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "web pm" }))

    await expect(onCycle).toHaveBeenCalledTimes(1)
  },
}

export const CellsAreKeyboardOperable: Story = {
  play: async ({ canvas }) => {
    const cell = canvas.getByRole("button", { name: "web dev" })

    cell.focus()
    await expect(cell).toHaveFocus()

    await userEvent.keyboard("{Enter}")

    await expect(onCycle).toHaveBeenCalledTimes(1)
  },
}

export const AbsentSlotsAreNotButtons: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "ai pm" })).toBeNull()
  },
}
