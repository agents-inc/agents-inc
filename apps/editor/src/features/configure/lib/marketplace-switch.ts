import type { Matrix } from "@workspace/matrix/matrix-schema"

import { displayNameOf } from "./derive"

// What a switch costs, named before it happens. Names come from the SEATED
// catalogue, the only one that still knows these ids. Every control that seats
// a catalogue names the cost here, then applies it with `pruneToCatalog`.

const droppedBy = (target: Matrix, selectedIds: string[]) =>
  selectedIds.filter((skillId) => !(skillId in target.skills))

const skillWord = (count: number) => (count === 1 ? "skill" : "skills")

const losesNothing = (marketplace: string) =>
  `Switching to ${marketplace} loses nothing — it carries every skill you have selected.`

const dropsSkills = (marketplace: string, dropped: string[], total: number) =>
  `Switching to ${marketplace} will drop ${dropped.length} of your ${total} ${skillWord(total)}: ${dropped.map(displayNameOf).join(", ")}.`

// Counted against the whole selection: "3 of 7" differs from "3 of 3".
export const switchConsequence = (
  marketplace: string,
  target: Matrix,
  selectedIds: string[]
): string => {
  const dropped = droppedBy(target, selectedIds)
  if (dropped.length === 0) return losesNothing(marketplace)

  return dropsSkills(marketplace, dropped, selectedIds.length)
}

export const dropsSelection = (target: Matrix, selectedIds: string[]) =>
  droppedBy(target, selectedIds).length > 0
