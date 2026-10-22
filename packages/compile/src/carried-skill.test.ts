// What an install writes for a skill the configuration carries whole: the renamed manifest and the
// metadata beside it, byte for byte, since the CLI writes them and the editor previews them.

import { describe, expect, it } from "vitest"

import {
  carriedSkillAuthor,
  carriedSkillMetadata,
  installedSkillTree,
  withInstalledName,
} from "./carried-skill"
import {
  buildCarriedSkillInstall,
  buildExternalSkill,
  buildSkillTree,
} from "./__tests__/factories/carried-skill-factories"

const IDENTITY = { id: "acme-docx", description: "Word documents" }

describe("withInstalledName", () => {
  it("renames the skill to the id it installs under and leaves the rest alone", () => {
    expect(
      withInstalledName(
        "---\nname: docx\ndescription: Word documents\n---\n\n# Docx\n",
        IDENTITY
      )
    ).toBe("---\nname: acme-docx\ndescription: Word documents\n---\n\n# Docx\n")
  })

  it("adds a name to frontmatter that has none", () => {
    expect(
      withInstalledName(
        "---\ndescription: Word documents\n---\n# Docx",
        IDENTITY
      )
    ).toBe("---\nname: acme-docx\ndescription: Word documents\n---\n# Docx")
  })

  it("does not take a field ending in name for the name field", () => {
    expect(
      withInstalledName(
        "---\nmetadata:\n  codename: docx\n---\n# Docx",
        IDENTITY
      )
    ).toBe("---\nname: acme-docx\nmetadata:\n  codename: docx\n---\n# Docx")
  })

  it("gives a manifest with no frontmatter one from the payload", () => {
    expect(withInstalledName("# Docx\n", IDENTITY)).toBe(
      "---\nname: acme-docx\ndescription: Word documents\n---\n\n# Docx\n"
    )
  })

  it("does not read two rules further down as frontmatter", () => {
    expect(
      withInstalledName("# Docx\n\n---\nname: rule\n---\n", IDENTITY)
    ).toBe(
      "---\nname: acme-docx\ndescription: Word documents\n---\n\n# Docx\n\n---\nname: rule\n---\n"
    )
  })
})

describe("carriedSkillAuthor", () => {
  it("credits the repository's owner", () => {
    expect(carriedSkillAuthor("acme/skills")).toBe("@acme")
  })

  it("credits a repository named without an owner by that name", () => {
    expect(carriedSkillAuthor("acme")).toBe("@acme")
  })
})

const PLACEMENT = {
  id: "acme-docx",
  skill: buildExternalSkill({ files: buildSkillTree("# Docx") }),
  domain: "shared",
  usageGuidance: "Use when the task touches a Word document.",
}

describe("carriedSkillMetadata", () => {
  it("fills what the repository did not ship from the payload and the defaults", () => {
    expect(carriedSkillMetadata({ ...PLACEMENT, shipped: null })).toStrictEqual(
      {
        author: "@acme",
        usageGuidance: "Use when the task touches a Word document.",
        displayName: "Word documents",
        slug: "acme-docx",
        category: "shared-tooling",
        domain: "shared",
        cliDescription: "Reads and writes Word documents",
        custom: true,
      }
    )
  })

  it("lets the repository's own fields beat the defaults and the payload's taxonomy beat both", () => {
    expect(
      carriedSkillMetadata({
        ...PLACEMENT,
        shipped: {
          author: "@shipper",
          usageGuidance: "Shipped guidance",
          tags: ["docs"],
          category: "web-docs",
          custom: false,
        },
      })
    ).toStrictEqual({
      author: "@shipper",
      usageGuidance: "Shipped guidance",
      tags: ["docs"],
      displayName: "Word documents",
      slug: "acme-docx",
      category: "shared-tooling",
      domain: "shared",
      cliDescription: "Reads and writes Word documents",
      custom: true,
    })
  })
})

/** Sixty characters, `doctor`'s limit for a short label. */
const SIXTY = "Reads and writes Word documents, with tracked changes and co"

const labelFor = (description: string): unknown =>
  carriedSkillMetadata({
    ...PLACEMENT,
    skill: { ...PLACEMENT.skill, description },
    shipped: null,
  }).cliDescription

describe("the short label a carried skill is listed by", () => {
  it("is the whole description when it fits the limit exactly", () => {
    expect(labelFor(SIXTY)).toBe(SIXTY)
  })

  it("is cut at the last whole word that fits, with an ellipsis", () => {
    expect(labelFor(`${SIXTY}ments kept`)).toBe(
      "Reads and writes Word documents, with tracked changes and…"
    )
  })

  it("keeps a whole word that ends exactly where the ellipsis begins", () => {
    expect(
      labelFor(
        "Reads, writes and edits Word documents with tracked changes and comments kept"
      )
    ).toBe("Reads, writes and edits Word documents with tracked changes…")
  })

  it("drops the spaces before the cut", () => {
    expect(
      labelFor(
        "Reads and writes Word documents, with tracked changes  commentary-kept"
      )
    ).toBe("Reads and writes Word documents, with tracked changes…")
  })

  it("drops the spaces before a break that falls right at the cut", () => {
    expect(
      labelFor(
        "Reads and writes Word documents, with tracked changes, and  comments kept"
      )
    ).toBe("Reads and writes Word documents, with tracked changes, and…")
  })

  it("cuts a description with no break in it mid-word", () => {
    expect(labelFor("x".repeat(70))).toBe(`${"x".repeat(59)}…`)
  })

  it("cuts mid-word when the only break leads the description", () => {
    expect(labelFor(` ${"x".repeat(70)}`)).toBe(` ${"x".repeat(58)}…`)
  })
})

const MANIFEST = "---\nname: docx\ndescription: Word documents\n---\n\n# Docx\n"

const INSTALLED_MANIFEST =
  "---\nname: acme-docx\ndescription: Word documents\n---\n\n# Docx\n"

const SCHEMA_COMMENT =
  "# yaml-language-server: $schema=https://raw.githubusercontent.com/agents-inc/agents-inc/main/packages/cli/src/schemas/metadata.schema.json"

/** The first seven hex digits of the SHA-256 of {@link INSTALLED_MANIFEST}, from `sha256sum`. */
const INSTALLED_MANIFEST_HASH = "2bb4335"

const FORKED_FROM = `forkedFrom:
  skillId: acme-docx
  contentHash: ${INSTALLED_MANIFEST_HASH}
  date: 2026-10-17
  source: github:acme/skills
  path: skills/docx
`

/** Longer than YAML's default fold width, so a folded line would show. */
const LONG_DISPLAY_NAME =
  "Word documents, read and written without leaving the terminal or the editor at all"

const DEFAULT_METADATA = `author: "@acme"
usageGuidance: Use when the task touches a Word document.
displayName: ${LONG_DISPLAY_NAME}
slug: acme-docx
category: shared-tooling
domain: shared
cliDescription: Reads and writes Word documents
custom: true
`

const installFor = (files: Record<string, string>) =>
  buildCarriedSkillInstall(
    buildExternalSkill({
      displayName: LONG_DISPLAY_NAME,
      files: buildSkillTree(MANIFEST, files),
    })
  )

describe("the directory an install writes for a carried skill", () => {
  it("keeps every file, renames the manifest and stamps where the skill was forked from", async () => {
    expect(
      await installedSkillTree(installFor({ "reference.md": "# Reference\n" }))
    ).toStrictEqual({
      "SKILL.md": INSTALLED_MANIFEST,
      "reference.md": "# Reference\n",
      "metadata.yaml": `${SCHEMA_COMMENT}\n${DEFAULT_METADATA}${FORKED_FROM}`,
    })
  })

  it("puts the stamp last, in place of the one the repository shipped", async () => {
    const tree = await installedSkillTree(
      installFor({
        "metadata.yaml":
          "author: '@shipper'\nforkedFrom:\n  skillId: docx\n  contentHash: abc1234\n  date: '2026-01-01'\n  source: github:upstream/skills\n",
      })
    )

    expect(tree["metadata.yaml"]).toBe(
      `${SCHEMA_COMMENT}\n${DEFAULT_METADATA.replace('"@acme"', '"@shipper"')}${FORKED_FROM}`
    )
  })

  it("draws the same metadata again from a directory that carries its own earlier output", async () => {
    const first = await installedSkillTree(installFor({}))

    const again = await installedSkillTree(installFor(first))

    expect(again["metadata.yaml"]).toBe(first["metadata.yaml"])
  })

  it("keeps the repository's own fields beside a stamp it did not ship", async () => {
    const tree = await installedSkillTree(
      installFor({ "metadata.yaml": "author: '@shipper'\n" })
    )

    expect(tree["metadata.yaml"]).toBe(
      `${SCHEMA_COMMENT}\n${DEFAULT_METADATA.replace('"@acme"', '"@shipper"')}${FORKED_FROM}`
    )
  })

  it("writes every byte of the content hash in two hex digits", async () => {
    const tree = await installedSkillTree(
      buildCarriedSkillInstall(
        buildExternalSkill({
          files: buildSkillTree(
            "---\nname: docx\ndescription: Word documents 0\n---\n\n# Docx\n"
          ),
        })
      )
    )

    // `sha256sum` of the installed manifest starts 0a48e8a: its first byte needs the padding.
    expect(tree["metadata.yaml"]).toContain("\n  contentHash: 0a48e8a\n")
  })

  it.each([
    ["empty", ""],
    ["unparseable", "author: [unclosed\n"],
    ["a list rather than a mapping", "- author\n"],
    ["a stamp that is not a mapping", "author: '@shipper'\nforkedFrom: docx\n"],
    [
      "a stamp missing a required field",
      "author: '@shipper'\nforkedFrom:\n  skillId: docx\n  date: '2026-01-01'\n",
    ],
    [
      "a stamp whose optional field is not text",
      "author: '@shipper'\nforkedFrom:\n  skillId: docx\n  contentHash: abc1234\n  date: '2026-01-01'\n  path: 7\n",
    ],
  ])(
    "reads shipped metadata that is %s as none at all",
    async (_shape, shipped) => {
      const tree = await installedSkillTree(
        installFor({ "metadata.yaml": shipped })
      )

      expect(tree["metadata.yaml"]).toBe(
        `${SCHEMA_COMMENT}\n${DEFAULT_METADATA}${FORKED_FROM}`
      )
    }
  )

  it("refuses a directory with no manifest", async () => {
    await expect(
      installedSkillTree(
        buildCarriedSkillInstall(
          buildExternalSkill({ files: { "reference.md": "# Reference\n" } })
        )
      )
    ).rejects.toThrow(
      "A carried skill's directory holds no SKILL.md, which seedSkillTreeSchema refuses"
    )
  })
})
