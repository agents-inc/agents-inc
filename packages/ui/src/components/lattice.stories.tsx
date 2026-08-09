import type { Meta, StoryObj } from "@storybook/react-vite"

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

// The row variant: full-width cells rather than grid columns.
export const Rows: Story = {
  render: () => (
    <LatticeRows>
      <LatticeRow className="font-mono text-11">agents-inc/skills</LatticeRow>
      <LatticeRow selected className="font-mono text-11">
        agents-inc/cli
      </LatticeRow>
    </LatticeRows>
  ),
}
