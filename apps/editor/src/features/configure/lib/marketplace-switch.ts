import type { Matrix } from "@workspace/matrix/matrix-schema"

import { activeSkillById } from "@/stores/catalog-store"

// What a switch costs, named before it happens.
//
// The owner's ruling is that switching between saved marketplaces opens a
// dialog and the switch happens only on the CTA — and that the dialog must name
// the CONCRETE consequence rather than warn generically. The reason is that the
// consequence is knowable: the target's catalogue is fetched in order to
// describe the switch, so its ids are in hand while the current selection still
// is, and the set the target cannot carry is the whole of what is lost. A
// dialog that said "your selection may change" is one people click through.
//
// Pure in the sense everything in `derive.ts` is: it reads the SEATED catalogue
// for names and holds nothing. That direction matters — the seated catalogue is
// the one that still knows what these ids mean, and after the switch nothing
// will.

// The name the visitor picked it by. An id the seated catalogue cannot place
// either — catalogue drift, or an added skill after a reseat — is still being
// lost, and the id is the only name left for it.
const nameOf = (skillId: string) =>
  activeSkillById(skillId)?.displayName ?? skillId

const droppedBy = (target: Matrix, selectedIds: string[]) =>
  selectedIds.filter((skillId) => !(skillId in target.skills))

// One dropped skill is as common as six, and "1 skills" is the tell of a
// sentence assembled from a template rather than written.
const skillWord = (count: number) => (count === 1 ? "skill" : "skills")

const losesNothing = (marketplace: string) =>
  `Switching to ${marketplace} loses nothing — it carries every skill you have selected.`

const dropsSkills = (marketplace: string, dropped: string[], total: number) =>
  `Switching to ${marketplace} will drop ${dropped.length} of your ${total} ${skillWord(total)}: ${dropped.map(nameOf).join(", ")}.`

/**
 * What switching to this marketplace does, and what it costs, in one sentence.
 *
 * The count is against the whole selection rather than the dropped set alone,
 * because "3 of your 7" and "3 of your 3" are different decisions.
 */
export const switchConsequence = (
  marketplace: string,
  target: Matrix,
  selectedIds: string[]
): string => {
  const dropped = droppedBy(target, selectedIds)
  if (dropped.length === 0) return losesNothing(marketplace)

  return dropsSkills(marketplace, dropped, selectedIds.length)
}

/**
 * Whether seating this catalogue would cost the selection anything.
 *
 * The same question the sentence above answers, asked as a yes or a no. Two
 * controls seat a catalogue — the switcher's CTA and the marketplace dialog's
 * Load — and each has to DECIDE whether there is a consequence worth naming
 * before it can name one. Reading the sentence back to find out would make the
 * two agree by coincidence; they agree here instead, on the one fact both are
 * asking about.
 */
export const dropsSelection = (target: Matrix, selectedIds: string[]) =>
  droppedBy(target, selectedIds).length > 0
