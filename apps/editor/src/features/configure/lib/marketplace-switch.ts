import type { PersistedConfig } from "@/stores/persisted-schema"
import type { Matrix } from "@workspace/matrix/matrix-schema"

import { displayNameOf } from "./derive"

// What a load costs, named before it happens. Each marketplace keeps its own
// saved configuration: another one opens its own, and the one on screen stays
// where it was saved. The one already standing is read again and keeps the
// selection, less what it no longer carries, which `pruneToCatalog` drops.
// Names come from the SEATED catalogue, the only one that still knows these
// ids.

type Selection = Pick<PersistedConfig, "stackId" | "skills" | "agents">

/**
 * `reread`: the marketplace the configuration on screen belongs to.
 * `recovery`: the one a parked configuration waits on. `another`: any other,
 * which opens its own.
 */
export type Landing = "reread" | "recovery" | "another"

/**
 * What a load lands from: where the screen's configuration belongs, `null`
 * when no saved one was read, and what is parked.
 */
type Standing = { standing: string | null; parked: string | undefined }

/**
 * What becomes of the configuration on screen. `own`: it stays saved with its
 * marketplace. `link`: a shared one, saved nowhere here. `unread`: picked
 * before the marketplace's saved one was read, so saved nowhere, while that
 * one stays saved. `name` is the marketplace as the visitor reads it.
 */
export type Leaving =
  | { kind: "own"; name: string }
  | { kind: "link" }
  | { kind: "unread"; name: string }

type Load = {
  /** The target as the visitor reads it: a ref, or the public catalogue. */
  name: string
  catalogue: Matrix
  landing: Landing
  selection: Selection
  leaving: Leaving
}

export const landingOf = (
  target: string,
  { standing, parked }: Standing
): Landing => {
  if (target === parked) return "recovery"

  return target === standing ? "reread" : "another"
}

// What the screen draws of a selection: `remembered` never shows.
const isEmptySelection = ({ stackId, skills, agents }: Selection) =>
  stackId === null &&
  Object.keys(skills).length === 0 &&
  Object.keys(agents).length === 0

const droppedBy = (target: Matrix, selectedIds: string[]) =>
  selectedIds.filter((skillId) => !(skillId in target.skills))

const skillWord = (count: number) => (count === 1 ? "skill" : "skills")

export const losesNothing = (marketplace: string) =>
  `Switching to ${marketplace} loses nothing — it carries every skill you have selected.`

const dropsSkills = (marketplace: string, dropped: string[], total: number) =>
  `Switching to ${marketplace} will drop ${dropped.length} of your ${total} ${skillWord(total)}: ${dropped.map(displayNameOf).join(", ")}.`

const opensItsOwn = (marketplace: string) =>
  `Switching to ${marketplace} opens the configuration saved with it, or a new one.`

const LINK_NOT_SAVED =
  "This shared one is not saved here; its link still opens it."

const whatBecomesOf = (leaving: Leaving) => {
  switch (leaving.kind) {
    case "own":
      return `This one stays saved with ${leaving.name} and reopens when you load it again.`
    case "link":
      return LINK_NOT_SAVED
    case "unread":
      return `What is on screen is not saved; the configuration saved with ${leaving.name} stays there.`
    default: {
      const _exhaustive: never = leaving
      return _exhaustive
    }
  }
}

const whatTheSetupBecomes = (leaving: Leaving) => {
  switch (leaving.kind) {
    case "own":
      return `Your current setup stays saved with ${leaving.name} and reopens when you load it again.`
    case "link":
      return LINK_NOT_SAVED
    // Nothing about the one saved with it: the stack may be built on it.
    case "unread":
      return "What is on screen is not saved."
    default: {
      const _exhaustive: never = leaving
      return _exhaustive
    }
  }
}

/**
 * What applying a saved stack built on another marketplace does: that
 * marketplace's saved configuration gives way to the stack, and what is on
 * screen goes as a load leaves it.
 */
export const stackElsewhere = (marketplace: string, leaving: Leaving) =>
  `Switching opens ${marketplace}, and this stack replaces the configuration saved with it. ${whatTheSetupBecomes(leaving)}`

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

const anotherCost = ({ name, selection, leaving }: Load) =>
  isEmptySelection(selection)
    ? null
    : `${opensItsOwn(name)} ${whatBecomesOf(leaving)}`

const rereadCost = ({ name, catalogue, selection }: Load) => {
  const selectedIds = Object.keys(selection.skills)

  return dropsSelection(catalogue, selectedIds)
    ? switchConsequence(name, catalogue, selectedIds)
    : null
}

/** What a load costs, said before it happens; `null` when it costs nothing. */
export const loadCost = (load: Load): string | null => {
  switch (load.landing) {
    case "another":
      return anotherCost(load)
    case "reread":
      return rereadCost(load)
    // What was parked replaces the screen, and what it replaces stays where
    // it was saved.
    case "recovery":
      return null
    default: {
      const _exhaustive: never = load.landing
      return _exhaustive
    }
  }
}
