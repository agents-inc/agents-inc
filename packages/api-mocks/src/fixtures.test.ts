import { CATALOG, DOMAINS, createStackExpander } from "@workspace/matrix"
import { matrixSchema } from "@workspace/matrix/matrix-schema"
import { MAX_EXTERNAL_SKILL_BYTES } from "@workspace/matrix/seed"
import { describe, expect, it } from "vitest"

import {
  BIGCO_CANONICAL_REF,
  BIGCO_REF,
  BINARY_FILE_BYTES,
  COMPOSED_PROPOSAL,
  DEAD_LINK_ID,
  DRIFTED_IMPORT_ID,
  DRIFTED_MARKETPLACE_PAYLOAD,
  GITHUB_AUTHORIZE_URL,
  MALFORMED_CATALOG,
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_CATALOG,
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  MARKETPLACE_REF,
  OTHER_SAVED_STACK,
  OUT_OF_SCOPE_IMPORT_ID,
  PRIVATE_IMPORT_ID,
  PRIVATE_MARKETPLACE_CANONICAL_REF,
  PRIVATE_MARKETPLACE_PAYLOAD,
  PRIVATE_MARKETPLACE_REF,
  RETIRED_SKILL_ID,
  SAVED_STACK,
  SAVED_STACKS,
  SKILL_INDEX,
  STACK_RENAMED_AT,
  STACK_SAVED_AT,
  STORED_ID,
  STORED_PAYLOAD,
  UNREADABLE_CONFIG_ID,
  XSS_SENTINEL,
  seedPayload,
} from "./fixtures"

describe("the configuration the worker holds", () => {
  it("moves the field an override names and no other", () => {
    expect(seedPayload({ stackId: "next" })).toStrictEqual({
      ...STORED_PAYLOAD,
      stackId: "next",
    })
  })

  it("replaces a map rather than merging into it", () => {
    expect(seedPayload({ skills: {} }).skills).toStrictEqual({})
  })

  it("refuses an override the contract does not admit", () => {
    // Matched on the field so a missing builder's TypeError cannot pass.
    // @ts-expect-error the shape is what is being refused
    expect(() => seedPayload({ skills: "nope" })).toThrow(/skills/)
  })
})

// base64url, cut to the worker's `ID_LENGTH` of 8.
const MINTABLE_ID = /^[\w-]{8}$/

describe("the links the fixtures address", () => {
  it("are each an id the worker could mint", () => {
    const ids = [
      STORED_ID,
      DEAD_LINK_ID,
      UNREADABLE_CONFIG_ID,
      MARKETPLACE_IMPORT_ID,
      PRIVATE_IMPORT_ID,
      DRIFTED_IMPORT_ID,
      OUT_OF_SCOPE_IMPORT_ID,
    ]

    expect(ids.filter((id) => !MINTABLE_ID.test(id))).toStrictEqual([])
  })
})

describe("the marketplaces", () => {
  // Titled by label, not by ref: a title holding a fixture value changes under a mutant.
  it.each([
    ["public", MARKETPLACE_CANONICAL_REF, MARKETPLACE_REF],
    ["private", PRIVATE_MARKETPLACE_CANONICAL_REF, PRIVATE_MARKETPLACE_REF],
    ["second", BIGCO_CANONICAL_REF, BIGCO_REF],
  ])(
    "write the %s one's canonical ref as its bare one behind `github:`",
    (_, canonical, bare) => {
      expect(canonical).toBe(`github:${bare}`)
    }
  )

  // Prefixed, so they never collide with the public catalogue.
  it("prefix every skill id the acme marketplace ever carried", () => {
    expect(
      [...Object.keys(MARKETPLACE_CATALOG.skills), RETIRED_SKILL_ID].filter(
        (id) => !id.startsWith("acme-")
      )
    ).toStrictEqual([])
  })

  it("file every category under a domain consumers know, so none is dropped", () => {
    const known: ReadonlySet<string | undefined> = new Set(DOMAINS)

    expect(
      Object.values(MARKETPLACE_CATALOG.categories)
        .map(({ domain }) => domain)
        .filter((domain) => !known.has(domain))
    ).toStrictEqual([])
  })

  it("file every skill under a category the catalogue declares", () => {
    expect(
      Object.values(MARKETPLACE_CATALOG.skills)
        .map(({ category }) => category)
        .filter((category) => !(category in MARKETPLACE_CATALOG.categories))
    ).toStrictEqual([])
  })

  const expandMarketplaceStack = (stackId: string) => {
    const expansion = createStackExpander(MARKETPLACE_CATALOG)(stackId)
    if (!expansion) throw new Error(`No marketplace stack ${stackId}`)
    return expansion
  }

  it("build each stack from their own skills, each assigned to a sub-agent", () => {
    const expansions = MARKETPLACE_CATALOG.suggestedStacks.map(({ id }) =>
      expandMarketplaceStack(id)
    )

    expect(
      expansions.flatMap(({ skillIds }) =>
        skillIds.filter((id) => !(id in MARKETPLACE_CATALOG.skills))
      )
    ).toStrictEqual([])
    expect(
      expansions.map(({ assignmentsBySkill }) =>
        Object.keys(assignmentsBySkill)
      )
    ).toStrictEqual(expansions.map(({ skillIds }) => skillIds))
  })

  it.each([
    ["public", MARKETPLACE_PAYLOAD],
    ["private", PRIVATE_MARKETPLACE_PAYLOAD],
  ])("give the %s payload skills its catalogue carries", (_, payload) => {
    const skillIds = Object.keys(payload.skills)

    expect(skillIds).not.toStrictEqual([])
    expect(
      skillIds.filter((id) => !(id in MARKETPLACE_CATALOG.skills))
    ).toStrictEqual([])
  })

  it("give the drifted payload one skill its catalogue has since retired", () => {
    expect(
      Object.keys(DRIFTED_MARKETPLACE_PAYLOAD.skills).filter(
        (id) => !(id in MARKETPLACE_CATALOG.skills)
      )
    ).toStrictEqual([RETIRED_SKILL_ID])
  })

  // The refusal names the path it failed at, so the fixture must fail at one.
  it("hold one catalogue refused at `skills` alone", () => {
    const result = matrixSchema.safeParse(MALFORMED_CATALOG)
    if (result.success) throw new Error("MALFORMED_CATALOG parsed")

    expect(result.error.issues.map(({ path }) => path)).toStrictEqual([
      ["skills"],
    ])
  })
})

describe("the saved stacks", () => {
  it("list both, the more recently updated first", () => {
    expect(SAVED_STACKS).toStrictEqual([SAVED_STACK, OTHER_SAVED_STACK])
    expect(Date.parse(SAVED_STACK.updatedAt)).toBeGreaterThan(
      Date.parse(OTHER_SAVED_STACK.updatedAt)
    )
  })

  it("give each stack its own id", () => {
    expect(SAVED_STACK.id).not.toBe(OTHER_SAVED_STACK.id)
  })

  it("rename to a later instant than the save", () => {
    expect(Date.parse(STACK_RENAMED_AT)).toBeGreaterThan(
      Date.parse(STACK_SAVED_AT)
    )
  })
})

describe("the rest of the worker's answers", () => {
  it("send sign-in to GitHub's authorize page", () => {
    const { origin, pathname } = new URL(GITHUB_AUTHORIZE_URL)

    expect(`${origin}${pathname}`).toBe(
      "https://github.com/login/oauth/authorize"
    )
  })

  it("propose skills the catalogue holds", () => {
    expect(COMPOSED_PROPOSAL.skillIds).not.toStrictEqual([])
    expect(
      COMPOSED_PROPOSAL.skillIds.filter((id) => !(id in CATALOG.skillsById))
    ).toStrictEqual([])
  })

  it("index one skill past the carry limit, and the rest within it", () => {
    const isPastLimit = ({ bytes }: { bytes: number }) =>
      bytes > MAX_EXTERNAL_SKILL_BYTES

    expect(
      SKILL_INDEX.skills.filter(isPastLimit).map(({ name }) => name)
    ).toStrictEqual(["docx"])
    expect(
      SKILL_INDEX.skills
        .filter((skill) => !isPastLimit(skill))
        .map(({ name }) => name)
    ).toStrictEqual([
      "brainstorming",
      "code-review-and-quality",
      "webapp-testing",
    ])
  })
})

describe("the files GitHub serves", () => {
  it("hold bytes a strict UTF-8 decoder refuses", () => {
    expect(() =>
      new TextDecoder("utf-8", { fatal: true }).decode(BINARY_FILE_BYTES)
    ).toThrow(TypeError)
  })

  // An empty name would make the markup a syntax error, and its check vacuous.
  it("name a sentinel the skill's markup could set if it ran", () => {
    expect(XSS_SENTINEL).toMatch(/^[A-Za-z_$][\w$]*$/)
  })
})
