import { MARKETPLACE_CATALOG, MARKETPLACE_REF } from "@workspace/api-mocks"
import { CATALOG, MATRIX } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { dropsSelection, switchConsequence } from "./marketplace-switch"

// The vendored catalogue holds at least two skills.
const [FIRST, SECOND] = Object.keys(CATALOG.skillsById) as [string, string]

const nameOf = (skillId: string) => CATALOG.skillsById[skillId]!.displayName

describe("switchConsequence", () => {
  // Marketplace ids carry their own name, so a real switch drops everything.
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

  it("says so plainly when the target carries every selected skill", () => {
    const said = switchConsequence(MARKETPLACE_REF, MATRIX, [FIRST, SECOND])

    expect(said).toContain("loses nothing")
    expect(said).not.toContain(nameOf(FIRST))
  })

  it("says so plainly when nothing is selected", () => {
    const said = switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [])

    expect(said).toContain("loses nothing")
  })

  it("counts one skill in the singular", () => {
    const said = switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [
      FIRST,
    ])

    expect(said).toContain("1 of your 1 skill:")
  })

  it("falls back to the id when nothing can name the skill", () => {
    const said = switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [
      "external-web-framework-mystery",
    ])

    expect(said).toContain("external-web-framework-mystery")
  })
})

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

  it("is false when the target carries every selected skill", () => {
    expect(dropsSelection(MATRIX, [FIRST, SECOND])).toBe(false)
  })

  it("is false for a selection with nothing in it", () => {
    expect(dropsSelection(MARKETPLACE_CATALOG, [])).toBe(false)
  })
})

describe("the sentence switchConsequence says", () => {
  it("lists the dropped skills by name, comma-separated, after the count", () => {
    expect(
      switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [FIRST, SECOND])
    ).toBe(
      `Switching to ${MARKETPLACE_REF} will drop 2 of your 2 skills: ${nameOf(FIRST)}, ${nameOf(SECOND)}.`
    )
  })
})
