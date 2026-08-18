import { describe, expect, it } from "vitest"

import {
  MAX_EXTERNAL_SKILL_BYTES,
  SEED_VERSION,
  seedExternalSkillSchema,
  seedPayloadSchema,
} from "./seed"

// The external half of the wire contract, which is the only part of the payload
// that carries CONTENT rather than a reference. Everything else in the payload
// is a list of ids a consumer resolves against a catalogue it already has; an
// external skill answers to no catalogue, so its bytes travel with it.
//
// Tested here rather than only in the editor because the schema is where both
// ends meet: the editor mints these, the worker stores them, and `--from`
// writes them to disk. A rule that only one of the three enforces is not a rule.

const SKILL_MD = "SKILL.md"

const files = (over: Record<string, string> = {}) => ({
  [SKILL_MD]: "# House React\n\nWhat this skill is for.\n",
  "metadata.yaml": "slug: house-react\n",
  ...over,
})

const external = (over: Record<string, unknown> = {}) => ({
  displayName: "House React",
  description: "The house React skill.",
  categoryId: "web-framework",
  repo: "acme/skills",
  path: "skills/house-react",
  files: files(),
  ...over,
})

const payload = (over: Record<string, unknown> = {}) => ({
  v: SEED_VERSION,
  matrixVersion: "1.0.0",
  stackId: null,
  skills: {},
  agents: {},
  ...over,
})

describe("seedExternalSkillSchema", () => {
  it("carries the whole skill directory, not a single file", () => {
    const parsed = seedExternalSkillSchema.parse(external())

    expect(Object.keys(parsed.files)).toStrictEqual([SKILL_MD, "metadata.yaml"])
  })

  it("keeps nested paths, so a reference/ directory survives the trip", () => {
    const nested = files({ "reference/api.md": "# API\n" })
    const parsed = seedExternalSkillSchema.parse(external({ files: nested }))

    expect(parsed.files["reference/api.md"]).toBe("# API\n")
  })

  // A directory with no SKILL.md is not a skill: Claude Code reads that file to
  // learn the skill exists at all, so installing the rest of the tree would
  // write a folder nothing can load.
  it("refuses a tree with no SKILL.md", () => {
    const orphaned = { "reference/api.md": "# API\n" }

    expect(
      seedExternalSkillSchema.safeParse(external({ files: orphaned })).success
    ).toBe(false)
  })

  it("refuses an empty tree", () => {
    expect(
      seedExternalSkillSchema.safeParse(external({ files: {} })).success
    ).toBe(false)
  })

  // The cap is measured rather than guessed: the largest real documentation
  // skill on the allowlisted repositories is 78 KB across 8 files, and our own
  // are 60-75 KB. A directory several times that is a code library wearing a
  // SKILL.md — `anthropics/skills/skills/docx` is 1.1 MB, almost all of it XML
  // schemas — and inlining one into a share link is what this refuses.
  it("refuses a directory past the cap", () => {
    const huge = files({
      "reference/big.md": "x".repeat(MAX_EXTERNAL_SKILL_BYTES),
    })

    expect(
      seedExternalSkillSchema.safeParse(external({ files: huge })).success
    ).toBe(false)
  })

  it("accepts a directory at the cap", () => {
    const atCap = { [SKILL_MD]: "x".repeat(MAX_EXTERNAL_SKILL_BYTES) }

    expect(
      seedExternalSkillSchema.safeParse(external({ files: atCap })).success
    ).toBe(true)
  })

  // Bytes rather than characters, because what lands in KV and on disk is
  // UTF-8: a tree of multi-byte characters is bigger than its length says.
  it("counts UTF-8 bytes rather than characters", () => {
    const multibyte = { [SKILL_MD]: "€".repeat(MAX_EXTERNAL_SKILL_BYTES / 2) }

    expect(
      seedExternalSkillSchema.safeParse(external({ files: multibyte })).success
    ).toBe(false)
  })

  it("names where the skill came from, so a reader can go and look", () => {
    const parsed = seedExternalSkillSchema.parse(external())

    expect(parsed.repo).toBe("acme/skills")
    expect(parsed.path).toBe("skills/house-react")
  })

  // The category is the placement the user confirmed at add time. Without it
  // the skill has nowhere to render and no sub-agent reach — which is the whole
  // difference between a real catalogue entry and an orphan section.
  it("requires the confirmed category", () => {
    expect(
      seedExternalSkillSchema.safeParse(external({ categoryId: "" })).success
    ).toBe(false)
  })
})

describe("seedPayloadSchema with external skills", () => {
  it("carries them keyed by the id the selection names", () => {
    const parsed = seedPayloadSchema.parse(
      payload({
        external: { "external-web-framework-house-react": external() },
      })
    )

    expect(parsed.external?.["external-web-framework-house-react"]?.repo).toBe(
      "acme/skills"
    )
  })

  // Absent is the ordinary case — every payload minted from the catalogue alone
  // — so one that names no external skill looks exactly as it did before this
  // field existed.
  it("leaves the field off a payload with nothing external in it", () => {
    expect(seedPayloadSchema.parse(payload())).not.toHaveProperty("external")
  })

  it("refuses an external entry that is not a skill directory", () => {
    const result = seedPayloadSchema.safeParse(
      payload({ external: { "external-x": external({ files: {} }) } })
    )

    expect(result.success).toBe(false)
  })
})

describe("the version", () => {
  // Content-bearing is not an additive change a consumer may ignore: a build
  // parsing with v4's schema STRIPS `external`, and would install a
  // configuration quietly missing the skills the sharer picked. The literal is
  // what turns that into a refusal.
  it("moved past the last content-free payload", () => {
    expect(SEED_VERSION).toBeGreaterThan(4)
  })

  it("refuses a payload minted against the previous version", () => {
    const result = seedPayloadSchema.safeParse(payload({ v: 4 }))

    expect(result.success).toBe(false)
  })
})
