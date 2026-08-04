import { CATALOG } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { addedSkillId, categoriseRepo, monogramFor } from "./added-skills-store"

// The design is explicit that an added skill's category comes from the
// marketplace index and is *not* editable, so this matching is the only thing
// deciding where a skill lands. Getting it wrong silently files a skill under
// the wrong category, which nothing else in the app would flag.

const KNOWN = Object.values(CATALOG.skillsById)[0]!

describe("addedSkillId", () => {
  it("namespaces the repo so it cannot collide with a catalog id", () => {
    expect(addedSkillId("acme/widget")).toBe("github:acme/widget")
    expect(addedSkillId("acme/widget")).not.toBe("acme/widget")
  })
})

describe("monogramFor", () => {
  it.each([
    ["react-native-reanimated", "RN"],
    ["motion", "MO"],
    ["react_spring", "RS"],
    ["anime", "AN"],
  ])("reduces %s to %s", (name, expected) => {
    expect(monogramFor(name)).toBe(expected)
  })
})

describe("categoriseRepo", () => {
  it("files a repo whose name matches a catalog slug", () => {
    expect(categoriseRepo(`owner/${KNOWN.slug}`)).toEqual({
      categoryId: KNOWN.categoryId,
      domainId: KNOWN.domainId,
    })
  })

  it("matches regardless of punctuation and case", () => {
    const noisy = KNOWN.slug.toUpperCase().replace(/-/g, ".")
    expect(categoriseRepo(`owner/${noisy}`).categoryId).toBe(KNOWN.categoryId)
  })

  // Unmatched is a real outcome the dialog names, not a failure.
  it("leaves an unknown repo uncategorised", () => {
    expect(categoriseRepo("acme/entirely-unknown-thing")).toEqual({
      categoryId: null,
      domainId: null,
    })
  })

  it("ignores the owner when matching", () => {
    expect(
      categoriseRepo(`totally-different-owner/${KNOWN.slug}`).categoryId
    ).toBe(KNOWN.categoryId)
  })
})
