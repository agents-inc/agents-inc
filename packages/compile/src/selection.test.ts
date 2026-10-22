// The shared validator against a catalogue small enough to read: each spec states the relation it
// asserts on, so a message pins the words a user is shown.

import { describe, expect, it } from "vitest"

import { validateSelection } from "./selection"
import {
  buildCatalog,
  buildCatalogCategory,
  buildCatalogKeyedBy,
  buildCatalogSkill,
} from "./__tests__/factories/catalog-factories"

const REACT = "web-framework-react"
const VUE = "web-framework-vue-composition-api"
const SVELTE = "web-framework-svelte"
const ZUSTAND = "web-state-zustand"
const TAILWIND = "web-styling-tailwind"

const FRAMEWORK = buildCatalogCategory({ displayName: "Framework" })
const EXCLUSIVE_FRAMEWORK = buildCatalogCategory({
  displayName: "Framework",
  exclusive: true,
})
const STATE = buildCatalogCategory({ displayName: "Client State" })

describe("a selection with nothing wrong with it", () => {
  it("is valid and reports no errors", () => {
    const catalog = buildCatalog({ "web-framework": FRAMEWORK }, [
      buildCatalogSkill(REACT, {
        displayName: "React",
        category: "web-framework",
      }),
    ])

    expect(validateSelection([REACT], catalog)).toStrictEqual({
      valid: true,
      errors: [],
    })
  })
})

describe("a skill the catalogue does not carry", () => {
  it("is a caller bug, named in the error", () => {
    const catalog = buildCatalog({}, [])

    expect(() => validateSelection([REACT], catalog)).toThrow(
      `Skill not found: ${REACT}`
    )
  })
})

// The selection names catalogue keys; every check after resolution reads the skill's own id.
describe("a catalogue that files a skill under a key other than its own id", () => {
  it("judges nothing it cannot find under that id, rather than failing on the missing entry", () => {
    const catalog = buildCatalogKeyedBy(
      { "web-framework": EXCLUSIVE_FRAMEWORK },
      {
        [REACT]: buildCatalogSkill(VUE, {
          displayName: "React",
          category: "web-framework",
        }),
      }
    )

    expect(validateSelection([REACT], catalog)).toStrictEqual({
      valid: true,
      errors: [],
    })
  })
})

describe("two skills that conflict", () => {
  const catalog = buildCatalog({ "web-framework": FRAMEWORK }, [
    buildCatalogSkill(REACT, {
      displayName: "React",
      category: "web-framework",
      conflictsWith: [{ skillId: VUE, reason: "pick one view layer" }],
    }),
    buildCatalogSkill(VUE, {
      displayName: "Vue",
      category: "web-framework",
      conflictsWith: [{ skillId: REACT, reason: "pick one view layer" }],
    }),
  ])

  it("are reported once, from the first skill's side, with both display names and the reason", () => {
    expect(validateSelection([REACT, VUE], catalog)).toStrictEqual({
      valid: false,
      errors: [
        {
          type: "conflict",
          message: "React conflicts with Vue: pick one view layer",
          skills: [REACT, VUE],
        },
      ],
    })
  })

  it("are no error while only one of them is selected", () => {
    expect(validateSelection([VUE], catalog)).toStrictEqual({
      valid: true,
      errors: [],
    })
  })
})

describe("a skill that needs any one of several others", () => {
  const catalog = buildCatalog(
    { "web-framework": FRAMEWORK, "web-client-state": STATE },
    [
      buildCatalogSkill(ZUSTAND, {
        displayName: "Zustand",
        category: "web-client-state",
        requires: [{ skillIds: [REACT, SVELTE], needsAny: true }],
      }),
      buildCatalogSkill(REACT, {
        displayName: "React",
        category: "web-framework",
      }),
      buildCatalogSkill(SVELTE, {
        displayName: "Svelte",
        category: "web-framework",
      }),
    ]
  )

  it("is satisfied by one of them", () => {
    expect(validateSelection([ZUSTAND, SVELTE], catalog)).toStrictEqual({
      valid: true,
      errors: [],
    })
  })

  it("names every candidate when none is selected", () => {
    expect(validateSelection([ZUSTAND], catalog)).toStrictEqual({
      valid: false,
      errors: [
        {
          type: "missingRequirement",
          message: "Zustand requires one of: React, Svelte",
          skills: [ZUSTAND, REACT, SVELTE],
        },
      ],
    })
  })
})

describe("a skill that needs every one of several others", () => {
  const catalog = buildCatalog(
    { "web-framework": FRAMEWORK, "web-client-state": STATE },
    [
      buildCatalogSkill(ZUSTAND, {
        displayName: "Zustand",
        category: "web-client-state",
        requires: [{ skillIds: [REACT, TAILWIND], needsAny: false }],
      }),
      buildCatalogSkill(REACT, {
        displayName: "React",
        category: "web-framework",
      }),
      buildCatalogSkill(TAILWIND, {
        displayName: "Tailwind",
        category: "web-framework",
      }),
    ]
  )

  it("is satisfied when all of them are selected", () => {
    expect(
      validateSelection([ZUSTAND, REACT, TAILWIND], catalog)
    ).toStrictEqual({ valid: true, errors: [] })
  })

  it("names only the ones still missing", () => {
    expect(validateSelection([ZUSTAND, REACT], catalog)).toStrictEqual({
      valid: false,
      errors: [
        {
          type: "missingRequirement",
          message: "Zustand requires: Tailwind",
          skills: [ZUSTAND, TAILWIND],
        },
      ],
    })
  })

  it("lists every missing one, comma-separated", () => {
    expect(validateSelection([ZUSTAND], catalog)).toStrictEqual({
      valid: false,
      errors: [
        {
          type: "missingRequirement",
          message: "Zustand requires: React, Tailwind",
          skills: [ZUSTAND, REACT, TAILWIND],
        },
      ],
    })
  })
})

describe("a category that allows one selection", () => {
  it("reports two of its skills selected together, naming the category and both skills", () => {
    const catalog = buildCatalog({ "web-framework": EXCLUSIVE_FRAMEWORK }, [
      buildCatalogSkill(REACT, {
        displayName: "React",
        category: "web-framework",
      }),
      buildCatalogSkill(SVELTE, {
        displayName: "Svelte",
        category: "web-framework",
      }),
    ])

    expect(validateSelection([REACT, SVELTE], catalog)).toStrictEqual({
      valid: false,
      errors: [
        {
          type: "categoryExclusive",
          message:
            'Category "Framework" only allows one selection, but multiple selected: React, Svelte',
          skills: [REACT, SVELTE],
        },
      ],
    })
  })

  it("never limits the local pseudo-category, even where a catalogue declares it exclusive", () => {
    const catalog = buildCatalog(
      {
        local: buildCatalogCategory({ displayName: "Local", exclusive: true }),
      },
      [
        buildCatalogSkill(REACT, { displayName: "React", category: "local" }),
        buildCatalogSkill(SVELTE, { displayName: "Svelte", category: "local" }),
      ]
    )

    expect(validateSelection([REACT, SVELTE], catalog)).toStrictEqual({
      valid: true,
      errors: [],
    })
  })
})
