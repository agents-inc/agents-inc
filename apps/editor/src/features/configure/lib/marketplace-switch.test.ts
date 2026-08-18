import { MARKETPLACE_CATALOG, MARKETPLACE_REF } from "@workspace/api-mocks"
import { CATALOG, MATRIX } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { dropsSelection, switchConsequence } from "./marketplace-switch"

// What a switch costs, named before it happens.
//
// The owner's ruling is that switching opens a dialog and the switch happens
// only on the CTA — and that the dialog must name the CONCRETE consequence
// rather than warn generically, because the set of skills the target does not
// carry is computable before the switch and is the whole of what is lost. A
// generic warning is a dialog people click through.
//
// Computable, and this is why: the target's catalogue is fetched to describe
// the switch, so its ids are in hand while the current selection still is. The
// names come off the SEATED catalogue, which is the one that still knows what
// these ids mean — after the switch nothing would.

const [FIRST, SECOND] = Object.keys(CATALOG.skillsById) as [string, string]

const nameOf = (skillId: string) => CATALOG.skillsById[skillId]!.displayName

describe("switchConsequence", () => {
  // Every marketplace's ids carry its own name (CLI-498), so two catalogues
  // share no ids at all and a real switch drops the whole selection. The
  // sentence has to say so in the terms the visitor picked them in — display
  // names, not ids.
  it("names the skills the target does not carry", () => {
    const said = switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [
      FIRST,
      SECOND,
    ])

    expect(said).toContain(MARKETPLACE_REF)
    expect(said).toContain("2 of your 2 skills")
    expect(said).toContain(nameOf(FIRST))
    expect(said).toContain(nameOf(SECOND))
  })

  it("counts only what is dropped, against everything selected", () => {
    const target = {
      ...MARKETPLACE_CATALOG,
      skills: { ...MARKETPLACE_CATALOG.skills, [FIRST]: MATRIX.skills[FIRST]! },
    }

    const said = switchConsequence(MARKETPLACE_REF, target, [FIRST, SECOND])

    expect(said).toContain("1 of your 2 skills")
    expect(said).toContain(nameOf(SECOND))
    expect(said).not.toContain(nameOf(FIRST))
  })

  // A catalogue that carries everything selected costs nothing, and saying so
  // is what keeps the sentence readable as a fact rather than as a warning
  // template — a dialog that always says "may change" is one people click past.
  it("says so plainly when the target carries every selected skill", () => {
    const said = switchConsequence(MARKETPLACE_REF, MATRIX, [FIRST, SECOND])

    expect(said).toContain("loses nothing")
    expect(said).not.toContain(nameOf(FIRST))
  })

  it("says so plainly when nothing is selected", () => {
    const said = switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [])

    expect(said).toContain("loses nothing")
  })

  // One dropped skill is as common as six, and "1 skills" is the tell of a
  // sentence built by a template rather than written.
  it("counts one skill in the singular", () => {
    const said = switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [
      FIRST,
    ])

    expect(said).toContain("1 of your 1 skill:")
  })

  // An id the seated catalogue cannot place either — an added skill after a
  // reseat, or catalogue drift — still has to be named, because it is still
  // being lost. The id is the only name left for it.
  it("falls back to the id when nothing can name the skill", () => {
    const said = switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [
      "external-web-framework-mystery",
    ])

    expect(said).toContain("external-web-framework-mystery")
  })
})

// The same question the sentence answers, asked as a yes or a no.
//
// Two controls seat a catalogue — the switcher's CTA and the marketplace
// dialog's Load — and both have to pair naming a consequence with actually
// dropping the skills they named. Deciding whether there IS one by reading the
// sentence back would make the two doors agree by coincidence; they agree here
// instead, on the one fact both are asking about.
describe("dropsSelection", () => {
  it("is true when the target cannot carry a selected skill", () => {
    expect(dropsSelection(MARKETPLACE_CATALOG, [FIRST, SECOND])).toBe(true)
  })

  it("is true when the target carries only some of them", () => {
    const target = {
      ...MARKETPLACE_CATALOG,
      skills: { ...MARKETPLACE_CATALOG.skills, [FIRST]: MATRIX.skills[FIRST]! },
    }

    expect(dropsSelection(target, [FIRST, SECOND])).toBe(true)
  })

  // The load that must not grow a second press: nothing is at stake, so there
  // is nothing to name and nothing to confirm.
  it("is false when the target carries every selected skill", () => {
    expect(dropsSelection(MATRIX, [FIRST, SECOND])).toBe(false)
  })

  // The first load of every session, and the one every spec written before
  // this rests on.
  it("is false for a selection with nothing in it", () => {
    expect(dropsSelection(MARKETPLACE_CATALOG, [])).toBe(false)
  })
})
