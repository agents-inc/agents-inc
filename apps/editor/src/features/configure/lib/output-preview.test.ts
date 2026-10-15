import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_CATALOG,
  seedPayload,
} from "@workspace/api-mocks"
import { generateConfigSource } from "@workspace/compile/config-source"
import { seatedCatalog } from "@workspace/compile"
import { provenanceMarker } from "@workspace/compile/agent-source"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  activeMatrix,
  activeStacks,
  externalSkillId,
  useCatalogStore,
} from "@/stores/catalog-store"

import { buildOutputPreview } from "./output-preview"

import type { SeedExternalSkill, SeedPayload } from "@workspace/matrix"

// The preview must not invent bytes: every assertion binds the pane to what
// `@workspace/compile` returns for the seated catalogue. On-screen claims are
// in e2e/specs/output-preview.spec.ts.

// Exclusive-category and multi-category, so both can be selected at once.
const REACT = "web-framework-react"
const TAILWIND = "web-styling-tailwind"

// Only `MARKETPLACE_CATALOG` carries this id (CLI-498 prefixes custom ids).
const ACME_SKILL = "acme-web-widgets"

const WEB_DEVELOPER = "web-developer"

// Emission order is global, then project.
const GLOBAL_BASE = "~/"
const PROJECT_BASE = "./"

const CONFIG_TS = "config.ts"
const CONFIG_TYPES_TS = "config-types.ts"

// Mirrored, not imported: it is a path on people's disks.
const SOURCE_DIR = ".agents-inc/claude/"

// Every root is drawn as `init --from` from a project directory on a clean
// machine, which writes both config pairs whatever the configuration holds.
const configPairIn = (base: string) => [
  `${base}${SOURCE_DIR}${CONFIG_TS}`,
  `${base}${SOURCE_DIR}${CONFIG_TYPES_TS}`,
]

// Exactly these skills and sub-agent entries, built without the store.
const payload = (
  skills: SeedPayload["skills"],
  agents: SeedPayload["agents"] = {}
): SeedPayload => seedPayload({ skills, agents })

const skill = (
  scope: "global" | "project",
  install: "plugin" | "eject",
  agents: readonly string[] = [WEB_DEVELOPER]
): SeedPayload["skills"][string] => ({
  install,
  scope,
  // `as const` on the pair: `Object.fromEntries` would widen the load state.
  assignments: Object.fromEntries(
    agents.map((agent) => [agent, "lazy"] as const)
  ),
})

const rootOf = (
  preview: Awaited<ReturnType<typeof buildOutputPreview>>,
  base: string
) => preview.roots.find((root) => root.base === base)

const bodyOf = (
  preview: Awaited<ReturnType<typeof buildOutputPreview>>,
  base: string,
  file: string
) => rootOf(preview, base)?.nodes.find((node) => node.id.endsWith(file))?.body

/** The paths of the files one root says an install writes — its `new` rows. */
const writtenIn = (
  preview: Awaited<ReturnType<typeof buildOutputPreview>>,
  base: string
) =>
  (rootOf(preview, base)?.nodes ?? [])
    .filter((node) => node.marker === "new")
    .map((node) => node.id)

describe("the bytes the output preview draws", () => {
  // C1: a global root renders standalone, against the root's own config.
  it("draws the global root's config.ts with the standalone writer", async () => {
    const preview = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") }),
      "claude"
    )
    const root = rootOf(preview, GLOBAL_BASE)

    expect(
      root,
      "no global root was emitted for a global-scoped skill"
    ).toBeDefined()
    expect(bodyOf(preview, GLOBAL_BASE, CONFIG_TS)).toStrictEqual(
      generateConfigSource(root!.config, seatedCatalog())
    )
  })

  // C1: a project root renders the inlining form with the preview's global config.
  it("draws the project root's config.ts with the inlining writer", async () => {
    const preview = await buildOutputPreview(
      payload(
        { [REACT]: skill("global", "plugin") },
        { [WEB_DEVELOPER]: { on: true, scope: "project" } }
      ),
      "claude"
    )
    const globalRoot = rootOf(preview, GLOBAL_BASE)
    const projectRoot = rootOf(preview, PROJECT_BASE)

    expect(
      globalRoot,
      "the inlining writer needs a global root to inline, and none was emitted"
    ).toBeDefined()
    expect(
      projectRoot,
      "no project root was emitted for a project-scoped agent"
    ).toBeDefined()

    expect(bodyOf(preview, PROJECT_BASE, CONFIG_TS)).toStrictEqual(
      generateConfigSource(projectRoot!.config, seatedCatalog(), {
        isProjectConfig: true,
        globalConfig: globalRoot!.config,
      })
    )
  })

  // Without this, one writer used twice would pass both specs above.
  it("draws two different files, so the writer choice is doing work", async () => {
    const preview = await buildOutputPreview(
      payload(
        { [REACT]: skill("global", "plugin") },
        { [WEB_DEVELOPER]: { on: true, scope: "project" } }
      ),
      "claude"
    )

    expect(bodyOf(preview, PROJECT_BASE, CONFIG_TS)).not.toStrictEqual(
      bodyOf(preview, GLOBAL_BASE, CONFIG_TS)
    )
  })

  // The CLI writes the applied stack's description into the project config.ts,
  // which a project install writes whatever the configuration holds.
  it("carries the applied stack's description into the project config.ts, where the CLI writes it", async () => {
    const [stack] = activeStacks()

    expect(
      stack,
      "the seated catalogue offers no stack, so this assertion has no subject"
    ).toBeDefined()

    const preview = await buildOutputPreview(
      {
        ...payload({ [REACT]: skill("global", "plugin") }),
        stackId: stack!.id,
      },
      "claude"
    )
    const configTs = bodyOf(preview, PROJECT_BASE, CONFIG_TS)

    expect(configTs, "the preview drew no project config.ts").toBeTruthy()
    expect(configTs).toContain(stack!.description)
  })

  // The global config.ts is rebuilt from the blank pair, so it carries none.
  it("leaves the description out of the global config.ts, which the CLI rebuilds from the blank pair", async () => {
    const [stack] = activeStacks()

    expect(
      stack,
      "the seated catalogue offers no stack, so this assertion has no subject"
    ).toBeDefined()

    const preview = await buildOutputPreview(
      {
        ...payload(
          {
            [REACT]: skill("global", "plugin"),
            [TAILWIND]: skill("project", "plugin"),
          },
          { [WEB_DEVELOPER]: { on: true, scope: "project" } }
        ),
        stackId: stack!.id,
      },
      "claude"
    )
    const globalConfigTs = bodyOf(preview, GLOBAL_BASE, CONFIG_TS)

    expect(
      bodyOf(preview, PROJECT_BASE, CONFIG_TS),
      "the stack's description reached no config.ts, so its absence below has no subject"
    ).toContain(stack!.description)
    expect(globalConfigTs, "the preview drew no global config.ts").toBeTruthy()
    expect(
      globalConfigTs,
      "the global config.ts carries a description the install writes only into the project's"
    ).not.toContain("description:")
  })

  // No stack, no description: guards against an unconditional line.
  it("writes no description line for a configuration that applied no stack", async () => {
    const preview = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") }),
      "claude"
    )
    const configTs = bodyOf(preview, GLOBAL_BASE, CONFIG_TS)

    expect(configTs, "the preview drew no global config.ts").toBeTruthy()
    expect(configTs).not.toContain("description:")
  })
})

// With no marketplace in the payload, the install records the CLI's default in
// both config.ts files whenever the global one holds anything.
describe("the marketplace a configuration naming none records", () => {
  const DEFAULT_MARKETPLACE_LINE =
    "\n  marketplace: 'github:agents-inc/skills',\n"

  it("records the public catalogue in both config.ts files, as the install does", async () => {
    const preview = await buildOutputPreview(
      payload(
        {
          [REACT]: skill("global", "plugin"),
          [TAILWIND]: skill("project", "plugin"),
        },
        { [WEB_DEVELOPER]: { on: true, scope: "project" } }
      ),
      "claude"
    )

    expect(
      bodyOf(preview, PROJECT_BASE, CONFIG_TS),
      "the project config.ts names no marketplace, though the install records the one it read"
    ).toContain(DEFAULT_MARKETPLACE_LINE)
    expect(
      bodyOf(preview, GLOBAL_BASE, CONFIG_TS),
      "the global config.ts names no marketplace, though the install records the one it read"
    ).toContain(DEFAULT_MARKETPLACE_LINE)
  })

  // A configuration holding nothing global leaves the blank global pair alone.
  it("leaves the blank global config.ts without one, as the install does", async () => {
    const preview = await buildOutputPreview(
      payload(
        { [REACT]: skill("project", "plugin") },
        { [WEB_DEVELOPER]: { on: true, scope: "project" } }
      ),
      "claude"
    )

    expect(
      bodyOf(preview, PROJECT_BASE, CONFIG_TS),
      "the project config.ts names no marketplace, so the absence below has no subject"
    ).toContain(DEFAULT_MARKETPLACE_LINE)
    expect(bodyOf(preview, GLOBAL_BASE, CONFIG_TS)).not.toContain(
      "marketplace:"
    )
    // `marketplace:` is not a substring of `marketplaceName:`.
    expect(bodyOf(preview, GLOBAL_BASE, CONFIG_TS)).not.toContain(
      "marketplaceName:"
    )
  })

  // The name the manifest gives, recorded on the line after the ref.
  it("names the public catalogue as its manifest does, on the line after the ref", async () => {
    const preview = await buildOutputPreview(
      payload(
        {
          [REACT]: skill("global", "plugin"),
          [TAILWIND]: skill("project", "plugin"),
        },
        { [WEB_DEVELOPER]: { on: true, scope: "project" } }
      ),
      "claude"
    )
    const namedBesideTheRef = `${DEFAULT_MARKETPLACE_LINE}  marketplaceName: 'agents-inc',\n`

    expect(
      bodyOf(preview, PROJECT_BASE, CONFIG_TS),
      "the project config.ts leaves out the marketplace name the install records"
    ).toContain(namedBesideTheRef)
    expect(
      bodyOf(preview, GLOBAL_BASE, CONFIG_TS),
      "the global config.ts leaves out the marketplace name the install records"
    ).toContain(namedBesideTheRef)
  })
})

// A seated marketplace's name is unknown to a browser, so the line carries the
// placeholder rather than being left out.
describe("the name a seated marketplace is recorded under", () => {
  afterEach(() => {
    useCatalogStore.getState().reset()
  })

  it("names it as computed at install time, on the line after the ref, in both config.ts files", async () => {
    useCatalogStore
      .getState()
      .load(MARKETPLACE_CATALOG, MARKETPLACE_CANONICAL_REF)

    const preview = await buildOutputPreview(
      seedPayload({
        marketplace: MARKETPLACE_CANONICAL_REF,
        skills: { [ACME_SKILL]: skill("global", "plugin") },
        agents: { [WEB_DEVELOPER]: { on: true, scope: "project" } },
      }),
      "claude"
    )
    const refLine = `\n  marketplace: '${MARKETPLACE_CANONICAL_REF}',\n`
    const namedBesideTheRef = `${refLine}  marketplaceName: '<computed at install time>',\n`

    for (const base of [PROJECT_BASE, GLOBAL_BASE]) {
      const config = bodyOf(preview, base, CONFIG_TS)

      expect(
        config,
        `the ${base} config.ts records no seated marketplace, so the line after it has no subject`
      ).toContain(refLine)
      expect(
        config,
        `the ${base} config.ts leaves out the marketplace name the install records`
      ).toContain(namedBesideTheRef)
    }
  })
})

describe("the one line a browser cannot know", () => {
  // C2: the project config-types.ts import specifier depends on the disk, so the
  // preview names a placeholder; a guessed `../` path is the failure to catch.
  it("names the import path as a placeholder rather than inventing one", async () => {
    const preview = await buildOutputPreview(
      payload(
        { [REACT]: skill("global", "plugin") },
        { [WEB_DEVELOPER]: { on: true, scope: "project" } }
      ),
      "claude"
    )
    const types = bodyOf(preview, PROJECT_BASE, CONFIG_TYPES_TS)

    expect(types, "the preview drew no project config-types.ts").toBeTruthy()
    expect(types).toContain("<computed at install time>")
    expect(
      types,
      "the preview invented a relative path to the global source folder instead of naming it as computed"
    ).not.toContain("../")
  })

  // With nothing global, the install still writes the global pair first, so the
  // project config-types.ts takes the import form.
  it("imports the global unions for a configuration holding nothing global, as the install does", async () => {
    const preview = await buildOutputPreview(
      payload(
        { [REACT]: skill("project", "plugin") },
        { [WEB_DEVELOPER]: { on: true, scope: "project" } }
      ),
      "claude"
    )

    const types = bodyOf(preview, PROJECT_BASE, CONFIG_TYPES_TS)

    expect(types, "the preview drew no project config-types.ts").toBeTruthy()
    expect(
      types,
      "the project config-types.ts takes the standalone form, though the install writes a global one for it to import"
    ).toContain("SkillId as GlobalSkillId")
    expect(types).toContain("<computed at install time>")
    expect(
      types,
      "the preview invented a relative path to the global source folder instead of naming it as computed"
    ).not.toContain("../")
  })
})

describe("a compiled sub-agent's markdown", () => {
  // The mechanism only: the renderer's answer passes through untouched. Bytes
  // against a real install are preview-matches-install.e2e's.
  it("is the corpus renderer's return value, passed through untouched", async () => {
    const RENDERED = "---\nname: web-developer\n---\n\nrendered by the corpus\n"

    vi.doMock("@workspace/compile/preview", () => ({
      CORPUS_CLI_VERSION: "0.0.0-mocked",
      renderAgentFromCorpus: () => Promise.resolve(RENDERED),
    }))

    const { buildOutputPreview: build } = await import("./output-preview")
    const preview = await build(
      payload({ [REACT]: skill("global", "plugin") }),
      "claude"
    )
    const agent = rootOf(preview, GLOBAL_BASE)?.nodes.find((node) =>
      node.id.endsWith(`${WEB_DEVELOPER}.md`)
    )

    expect(
      agent,
      "no compiled sub-agent row was emitted for a selected skill"
    ).toBeDefined()
    expect(agent!.body).toStrictEqual(RENDERED)

    vi.doUnmock("@workspace/compile/preview")
  })

  // Provenance only. The marker is a constant (the first cacheable byte of a
  // sub-agent's prompt), so no version assertion belongs here.
  it("carries the provenance marker the CLI writes, byte for byte", async () => {
    const preview = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") }),
      "claude"
    )
    const agent = rootOf(preview, GLOBAL_BASE)?.nodes.find((node) =>
      node.id.endsWith(`${WEB_DEVELOPER}.md`)
    )

    expect(agent?.body, "the preview drew no compiled sub-agent").toBeTruthy()
    expect(agent?.body).toContain(provenanceMarker())
  })

  // The config's effort over the metadata's, as `resolveAgents` composes it. No
  // shipped definition declares one (`grep -c "effort:"
  // packages/matrix/src/generated/agents.ts`), so the metadata is mocked; the
  // spec after it is the control.
  describe("the effort a sub-agent runs at", () => {
    afterEach(() => {
      vi.doUnmock("@workspace/matrix")
      vi.resetModules()
    })

    const DECLARED_EFFORT = "high"

    it("renders the effort the sub-agent's own metadata declares", async () => {
      vi.doMock("@workspace/matrix", async () => {
        const actual =
          await vi.importActual<typeof import("@workspace/matrix")>(
            "@workspace/matrix"
          )

        return {
          ...actual,
          AGENT_DEFINITIONS: {
            ...actual.AGENT_DEFINITIONS,
            [WEB_DEVELOPER]: {
              ...actual.AGENT_DEFINITIONS[WEB_DEVELOPER],
              effort: DECLARED_EFFORT,
            },
          },
        }
      })

      // A static import of the module under test: reset, or the mock never takes.
      vi.resetModules()

      const { buildOutputPreview: build } = await import("./output-preview")
      const preview = await build(
        payload({ [REACT]: skill("global", "plugin") }),
        "claude"
      )
      const body = bodyOf(preview, GLOBAL_BASE, `${WEB_DEVELOPER}.md`)

      expect(body, "the preview drew no compiled sub-agent").toBeTruthy()
      expect(body).toContain(`effort: ${DECLARED_EFFORT}`)
    })

    // The control: no declared effort and no override, so no line.
    it("writes no effort line when neither the metadata nor the config names one", async () => {
      const preview = await buildOutputPreview(
        payload({ [REACT]: skill("global", "plugin") }),
        "claude"
      )
      const body = bodyOf(preview, GLOBAL_BASE, `${WEB_DEVELOPER}.md`)

      expect(body, "the preview drew no compiled sub-agent").toBeTruthy()
      expect(body).not.toContain("effort:")
    })
  })

  // The bullet telling a sub-agent when to load a skill. The fallback sentence is
  // written out: it must match `statedUsageFor` in the CLI byte for byte.
  describe("the line telling a sub-agent when to reach for a skill", () => {
    afterEach(() => {
      useCatalogStore.getState().reset()
    })

    it("carries the sentence the catalogue states for the skill", async () => {
      const preview = await buildOutputPreview(
        payload({ [REACT]: skill("global", "plugin") }),
        "claude"
      )
      const stated = activeMatrix().skills[REACT]?.usageGuidance
      const body = bodyOf(preview, GLOBAL_BASE, `${WEB_DEVELOPER}.md`)

      expect(
        stated,
        "the seated catalogue states no guidance for this skill, so the claim below has no subject"
      ).toBeTruthy()
      expect(body, "the preview drew no compiled sub-agent").toBeTruthy()
      expect(body).toContain(`\n- ${stated}\n`)
    })

    // Only the seated marketplace's fixture skill states no guidance.
    it("falls back to the category sentence for a skill stating none", async () => {
      useCatalogStore
        .getState()
        .load(MARKETPLACE_CATALOG, MARKETPLACE_CANONICAL_REF)

      const preview = await buildOutputPreview(
        payload({ [ACME_SKILL]: skill("global", "plugin") }),
        "claude"
      )
      const seated = activeMatrix().skills[ACME_SKILL]
      const body = bodyOf(preview, GLOBAL_BASE, `${WEB_DEVELOPER}.md`)

      expect(
        seated?.usageGuidance,
        "the seated skill states its own guidance, so the fallback arm has no subject"
      ).toBeUndefined()
      expect(body, "the preview drew no compiled sub-agent").toBeTruthy()
      expect(body).toContain(`\n- Use when working with ${seated?.category}.\n`)
    })

    // `usageGuidance` may be empty, which must not draw an empty bullet.
    it("falls back for a skill stating an empty sentence, rather than drawing an empty bullet", async () => {
      const acme = MARKETPLACE_CATALOG.skills[ACME_SKILL]

      expect(
        acme,
        "the marketplace fixture no longer carries the skill this seats"
      ).toBeDefined()

      useCatalogStore.getState().load(
        {
          ...MARKETPLACE_CATALOG,
          skills: {
            ...MARKETPLACE_CATALOG.skills,
            [ACME_SKILL]: { ...acme!, usageGuidance: "" },
          },
        },
        MARKETPLACE_CANONICAL_REF
      )

      const preview = await buildOutputPreview(
        payload({ [ACME_SKILL]: skill("global", "plugin") }),
        "claude"
      )
      const body = bodyOf(preview, GLOBAL_BASE, `${WEB_DEVELOPER}.md`)

      expect(body, "the preview drew no compiled sub-agent").toBeTruthy()
      expect(
        body,
        "an empty stated sentence rendered as a bullet with nothing after it"
      ).not.toContain("\n- \n")
      expect(body).toContain(`\n- Use when working with ${acme?.category}.\n`)
    })
  })
})

// A Codex role runs on the session's model unless pinned. Each provider reads
// its own pin: `codexModel` never reaches Claude's file, `model` never a role's.
describe("a Codex model pin", () => {
  const PINNED_CODEX_MODEL = "gpt-5.6-terra"
  const ROLE_FILE = `${WEB_DEVELOPER}.toml`
  const BOTH_PINS = { model: "haiku", codexModel: PINNED_CODEX_MODEL } as const

  const previewOf = (
    agent: SeedPayload["agents"][string],
    provider: "claude" | "codex"
  ) =>
    buildOutputPreview(
      payload(
        { [REACT]: skill("global", "plugin") },
        { [WEB_DEVELOPER]: agent }
      ),
      provider
    )

  const roleLines = async (agent: SeedPayload["agents"][string]) => {
    const preview = await previewOf(agent, "codex")
    const body = bodyOf(preview, GLOBAL_BASE, ROLE_FILE)

    expect(body, "the preview drew no role file").toBeTruthy()
    return body!.split("\n")
  }

  it("pins the role to the configured model at medium effort", async () => {
    const lines = await roleLines({ codexModel: PINNED_CODEX_MODEL })

    expect(lines).toContain(`model = "${PINNED_CODEX_MODEL}"`)
    expect(lines).toContain(`model_reasoning_effort = "medium"`)
  })

  it("keeps the configured effort beside the pin", async () => {
    const lines = await roleLines({
      codexModel: PINNED_CODEX_MODEL,
      effort: "high",
    })

    expect(lines).toContain(`model = "${PINNED_CODEX_MODEL}"`)
    expect(lines).toContain(`model_reasoning_effort = "high"`)
  })

  it("writes the Codex pin and not the Claude model", async () => {
    const lines = await roleLines(BOTH_PINS)

    expect(lines.filter((line) => line.startsWith("model ="))).toStrictEqual([
      `model = "${PINNED_CODEX_MODEL}"`,
    ])
  })

  // Guard: an unpinned role keeps today's bytes.
  it("writes no model line for an unpinned role", async () => {
    const lines = await roleLines({ model: "haiku" })

    expect(lines.filter((line) => line.startsWith("model ="))).toStrictEqual([])
  })

  // Guard: the AgentConfig build is shared, so the pin must not leak into it.
  it("leaves a Claude sub-agent on its Claude model", async () => {
    const preview = await previewOf(BOTH_PINS, "claude")
    const body = bodyOf(preview, GLOBAL_BASE, `${WEB_DEVELOPER}.md`)

    expect(body, "the preview drew no compiled sub-agent").toBeTruthy()
    expect(body!.split("\n")).toContain("model: haiku")
    expect(body).not.toContain(PINNED_CODEX_MODEL)
  })

  // Guard: config.ts is provider-neutral, so both pins are written either way.
  it.each(["claude", "codex"] as const)(
    "keeps both pins in config.ts on %s",
    async (provider) => {
      const preview = await previewOf(BOTH_PINS, provider)
      const configTs = bodyOf(preview, GLOBAL_BASE, CONFIG_TS)

      expect(configTs, "the preview drew no global config.ts").toBeTruthy()
      expect(configTs).toContain(
        `model: 'haiku', codexModel: '${PINNED_CODEX_MODEL}'`
      )
    }
  )
})

// CLI-898: the install writes each skill's SKILL.md description, not the
// short label.
describe("the description a skill is listed under", () => {
  afterEach(() => {
    useCatalogStore.getState().reset()
  })

  const SHORT_LABEL = "A short label"
  const SKILL_MD_DESCRIPTION = "What SKILL.md says, and what the install writes"

  const seatAcmeWith = (fields: Record<string, string>) => {
    const acme = MARKETPLACE_CATALOG.skills[ACME_SKILL]
    expect(
      acme,
      "the marketplace fixture no longer carries the skill this seats"
    ).toBeDefined()
    useCatalogStore.getState().load(
      {
        ...MARKETPLACE_CATALOG,
        skills: {
          ...MARKETPLACE_CATALOG.skills,
          [ACME_SKILL]: { ...acme!, ...fields },
        },
      },
      MARKETPLACE_CANONICAL_REF
    )
  }

  const acmeBody = async () =>
    bodyOf(
      await buildOutputPreview(
        payload({ [ACME_SKILL]: skill("global", "plugin") }),
        "claude"
      ),
      GLOBAL_BASE,
      `${WEB_DEVELOPER}.md`
    )

  it("draws the SKILL.md description, never the short label", async () => {
    seatAcmeWith({
      description: SHORT_LABEL,
      activationDescription: SKILL_MD_DESCRIPTION,
    })

    const body = await acmeBody()

    expect(body, "the preview drew no compiled sub-agent").toBeTruthy()
    expect(body).toContain(SKILL_MD_DESCRIPTION)
    expect(body).not.toContain(SHORT_LABEL)
  })

  it("draws the label from a catalogue built before it carried the SKILL.md one", async () => {
    seatAcmeWith({ description: SHORT_LABEL })

    expect(await acmeBody()).toContain(SHORT_LABEL)
  })

  // The vendored catalogue every visitor starts on. The table is imported after
  // the negative, so a tree predating it fails on the label it draws.
  it("draws no short label on the vendored catalogue, the seat every visitor starts on", async () => {
    useCatalogStore.getState().reset()
    const label = activeMatrix().skills[REACT]?.description

    expect(
      label,
      "the vendored catalogue no longer carries the skill this reads"
    ).toBeDefined()

    const body = bodyOf(
      await buildOutputPreview(
        payload({ [REACT]: skill("global", "plugin") }),
        "claude"
      ),
      GLOBAL_BASE,
      `${WEB_DEVELOPER}.md`
    )

    expect(body, "the preview drew no activation row for the skill").toContain(
      `### ${REACT}\n- Description: `
    )
    expect(body).not.toContain(`### ${REACT}\n- Description: ${label}\n`)

    const { ACTIVATION_DESCRIPTIONS } =
      await import("@workspace/matrix/activation-descriptions")
    const sentence = ACTIVATION_DESCRIPTIONS[REACT]

    expect(
      sentence,
      "the vendored table holds no SKILL.md sentence for the skill this reads"
    ).toBeDefined()
    expect(
      sentence,
      "the skill's SKILL.md sentence is its label, so nothing here can tell them apart"
    ).not.toBe(label)
    expect(body).toContain(`### ${REACT}\n- Description: ${sentence}\n`)
  })
})

describe("what the tree says about plugin skills", () => {
  // A plugin skill installs through Claude Code, so it gets no path under a
  // root. Both directions are pinned: either alone is satisfiable by a bug.
  it("labels a plugin skill `plugin` and gives it no path under a root", async () => {
    const preview = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") }),
      "claude"
    )
    const nodes = rootOf(preview, GLOBAL_BASE)?.nodes ?? []
    const react = nodes.filter((node) => node.id.includes(REACT))

    expect(react.map((node) => node.marker)).toStrictEqual(["plugin"])
    expect(
      react[0]?.id,
      "a plugin skill was given a path under .claude/skills/, which the install never creates"
    ).not.toContain(".claude/skills")
  })

  // Ejected, the same skill is a directory the install creates; its files are
  // unknown to a browser.
  it("turns the same skill into a directory under .claude/skills/ once it ejects", async () => {
    const preview = await buildOutputPreview(
      payload({ [REACT]: skill("global", "eject") }),
      "claude"
    )
    const nodes = rootOf(preview, GLOBAL_BASE)?.nodes ?? []
    const react = nodes.filter((node) => node.id.includes(REACT))

    expect(react.map((node) => node.marker)).toStrictEqual(["eject"])
    expect(react[0]?.id).toStrictEqual(`${GLOBAL_BASE}.claude/skills/${REACT}/`)
  })

  // `eject` is a synthetic source, not a repository, so the note names the
  // seated marketplace. The config's `origin` is no witness: a browser never
  // populates `availableSources`, so it always reads the public default.
  describe("the marketplace an ejected skill is copied from", () => {
    afterEach(() => {
      useCatalogStore.getState().reset()
    })

    const ejectedNote = (
      preview: Awaited<ReturnType<typeof buildOutputPreview>>,
      skillId: string
    ) =>
      rootOf(preview, GLOBAL_BASE)?.nodes.find(
        (node) => node.id === `${GLOBAL_BASE}.claude/skills/${skillId}/`
      )?.body

    const pluginNote = (
      preview: Awaited<ReturnType<typeof buildOutputPreview>>,
      skillId: string
    ) =>
      rootOf(preview, GLOBAL_BASE)?.nodes.find(
        (node) => node.marker === "plugin" && node.id.includes(skillId)
      )?.body

    // Unseated: the public catalogue by name, written out as rendered text.
    it("names the public catalogue by name for a visitor who has seated nothing", async () => {
      const preview = await buildOutputPreview(
        payload({ [REACT]: skill("global", "eject") }),
        "claude"
      )
      const note = ejectedNote(preview, REACT)

      expect(note, "the preview drew no ejected directory row").toBeTruthy()
      expect(note).toContain(`Source: agents-inc/src/skills/${REACT}`)
    })

    // Seated elsewhere: the seated ref, never ours.
    it("names the seated marketplace, never ours, for a visitor seated elsewhere", async () => {
      useCatalogStore
        .getState()
        .load(MARKETPLACE_CATALOG, MARKETPLACE_CANONICAL_REF)

      const preview = await buildOutputPreview(
        payload({ [ACME_SKILL]: skill("global", "eject") }),
        "claude"
      )
      const note = ejectedNote(preview, ACME_SKILL)

      expect(
        note,
        "the seated marketplace's skill drew no ejected directory row, so the claim below has no subject"
      ).toBeTruthy()
      expect(note).toContain(MARKETPLACE_CANONICAL_REF)
      expect(
        note,
        "the note names our marketplace to a visitor seated on somebody else's, which is a coordinate that does not exist"
      ).not.toContain("agents-inc")
    })

    // The plugin and eject notes sit side by side, so they must agree.
    it("says the same marketplace whether the skill is a plugin or ejected", async () => {
      useCatalogStore
        .getState()
        .load(MARKETPLACE_CATALOG, MARKETPLACE_CANONICAL_REF)

      const asPlugin = await buildOutputPreview(
        payload({ [ACME_SKILL]: skill("global", "plugin") }),
        "claude"
      )
      const asEject = await buildOutputPreview(
        payload({ [ACME_SKILL]: skill("global", "eject") }),
        "claude"
      )

      const plugin = pluginNote(asPlugin, ACME_SKILL)
      const ejected = ejectedNote(asEject, ACME_SKILL)

      expect(plugin, "the preview drew no plugin reference row").toBeTruthy()
      expect(ejected, "the preview drew no ejected directory row").toBeTruthy()
      expect(plugin).toContain(MARKETPLACE_CANONICAL_REF)
      expect(
        ejected,
        "the ejected note and the plugin note beside it name different marketplaces for one skill"
      ).toContain(MARKETPLACE_CANONICAL_REF)
    })

    // `eject` read off the config: a literal or `EJECT_SOURCE` would follow a
    // rename.
    it("never names the eject sentinel as a source repository", async () => {
      const preview = await buildOutputPreview(
        payload({ [REACT]: skill("global", "eject") }),
        "claude"
      )
      const sentinel = rootOf(preview, GLOBAL_BASE)?.config.skills.find(
        (entry) => entry.id === REACT
      )?.origin
      const note = ejectedNote(preview, REACT)

      expect(
        sentinel,
        "the ejected variant recorded no origin, so there is no sentinel to hold the note to"
      ).toBeTruthy()
      expect(note, "the preview drew no ejected directory row").toBeTruthy()
      expect(
        note,
        "the note names the eject sentinel as a source repository, which is a coordinate that does not exist"
      ).not.toContain(`${sentinel}/`)
    })
  })

  // Guarded: a preview that drew no row satisfies the negative for free.
  it("never labels a plugin skill `new`", async () => {
    const preview = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") }),
      "claude"
    )
    const markers = (rootOf(preview, GLOBAL_BASE)?.nodes ?? [])
      .filter((node) => node.id.includes(REACT))
      .map((node) => node.marker)

    expect(
      markers,
      "the preview drew no row for the skill at all, so the assertion below has no subject"
    ).not.toStrictEqual([])
    expect(markers).not.toContain("new")
  })
})

// A carried skill's directory as `writeExternalSkills` writes it: manifest
// renamed to the installed id, a metadata.yaml beside it, filed under Custom.
// Expected lines are what the install wrote for this payload.
describe("a skill the configuration carries", () => {
  afterEach(() => {
    useCatalogStore.getState().reset()
  })

  const CARRIED_CATEGORY = "meta-methodology"
  const CARRIED_ID = externalSkillId(CARRIED_CATEGORY, "brainstorming")
  const CARRIED_DIR = `${GLOBAL_BASE}.claude/skills/${CARRIED_ID}/`
  const PM = "pm"

  // As upstream wrote it, with no metadata.yaml.
  const CARRIED: SeedExternalSkill = {
    displayName: "brainstorming",
    description: "Explores user intent before implementation.",
    categoryId: CARRIED_CATEGORY,
    repo: "obra/superpowers",
    path: "skills/brainstorming",
    files: {
      "SKILL.md":
        "---\nname: brainstorming\ndescription: Explores user intent before implementation.\n---\n\n# Brainstorming\n",
      "visual-companion.md": "# Visual companion\n",
    },
  }

  // Seated as `adoptSeedPayload` seats a payload's carried skills.
  const carriedPreview = () => {
    useCatalogStore.getState().addExternal([{ id: CARRIED_ID, ...CARRIED }])

    return buildOutputPreview(
      seedPayload({
        skills: {
          [REACT]: skill("global", "plugin"),
          [CARRIED_ID]: skill("global", "eject", [PM]),
        },
        agents: {},
        external: { [CARRIED_ID]: CARRIED },
      }),
      "claude"
    )
  }

  // Loaders read the id off `name:`, so only that line moves.
  it("names its SKILL.md by the id it installs under", async () => {
    expect(
      bodyOf(await carriedPreview(), GLOBAL_BASE, `${CARRIED_DIR}SKILL.md`)
    ).toStrictEqual(
      `---\nname: ${CARRIED_ID}\ndescription: Explores user intent before implementation.\n---\n\n# Brainstorming\n`
    )
  })

  // Named and sorted: the claim is which files, not their order.
  it("lists the metadata.yaml the install writes beside the files it carried", async () => {
    const written = writtenIn(await carriedPreview(), GLOBAL_BASE).filter(
      (path) => path.startsWith(CARRIED_DIR)
    )

    expect([...written].sort()).toStrictEqual([
      `${CARRIED_DIR}SKILL.md`,
      `${CARRIED_DIR}metadata.yaml`,
      `${CARRIED_DIR}visual-companion.md`,
    ])
  })

  // What the next `edit`, `compile` or `list` reads back.
  it("records in that metadata.yaml what the install records", async () => {
    const domain = activeMatrix().categories[CARRIED_CATEGORY]?.domain
    const metadata = bodyOf(
      await carriedPreview(),
      GLOBAL_BASE,
      `${CARRIED_DIR}metadata.yaml`
    )

    expect(
      domain,
      "the seated catalogue does not declare the carried skill's category, so nothing would install it"
    ).toBeTruthy()
    expect(
      metadata,
      "the preview drew no metadata.yaml for the carried skill"
    ).toBeTruthy()
    expect(metadata).toContain(`\nslug: ${CARRIED_ID}\n`)
    expect(metadata).toContain(`\ncategory: ${CARRIED_CATEGORY}\n`)
    expect(metadata).toContain(`\ndomain: ${domain}\n`)
    expect(metadata).toContain("\ncustom: true\n")
    expect(metadata).toContain(`\n  source: github:${CARRIED.repo}\n`)
    expect(metadata).toContain(`\n  path: ${CARRIED.path}\n`)
  })

  // `custom: true` splits the global SkillId union under // Custom.
  it("files it under // Custom in the global config-types.ts, as the install does", async () => {
    expect(
      bodyOf(await carriedPreview(), GLOBAL_BASE, CONFIG_TYPES_TS)
    ).toContain(
      [
        "export type SkillId =",
        "  // Custom",
        `  | '${CARRIED_ID}'`,
        "  // Marketplace",
        `  | '${REACT}'`,
        "",
      ].join("\n")
    )
  })
})

describe("which roots are emitted", () => {
  // Both roots, always: a project install writes both config pairs. Named
  // rather than counted, since a count cannot see a swap.
  it("emits the project root for a wholly global configuration, holding the pair the install writes there", async () => {
    const preview = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") }),
      "claude"
    )

    expect(preview.roots.map((root) => root.base)).toStrictEqual([
      GLOBAL_BASE,
      PROJECT_BASE,
    ])
    expect(writtenIn(preview, PROJECT_BASE)).toStrictEqual(
      configPairIn(PROJECT_BASE)
    )
  })

  // `ensureBlankPair` writes the global pair before the project write.
  it("emits the global root for a wholly project configuration, holding the pair the install writes there", async () => {
    const preview = await buildOutputPreview(
      payload(
        { [REACT]: skill("project", "plugin") },
        { [WEB_DEVELOPER]: { on: true, scope: "project" } }
      ),
      "claude"
    )

    expect(preview.roots.map((root) => root.base)).toStrictEqual([
      GLOBAL_BASE,
      PROJECT_BASE,
    ])
    expect(writtenIn(preview, GLOBAL_BASE)).toStrictEqual(
      configPairIn(GLOBAL_BASE)
    )
  })

  // And that pair is blank, as the install writes it.
  it("draws that global pair blank, as the install writes it", async () => {
    const preview = await buildOutputPreview(
      payload(
        { [REACT]: skill("project", "plugin") },
        { [WEB_DEVELOPER]: { on: true, scope: "project" } }
      ),
      "claude"
    )
    const globalRoot = rootOf(preview, GLOBAL_BASE)

    expect(
      globalRoot,
      "no global root was drawn, though the install writes the global pair"
    ).toBeDefined()
    expect(globalRoot!.config.skills).toStrictEqual([])
    expect(globalRoot!.config.agents).toStrictEqual([])
    expect(bodyOf(preview, GLOBAL_BASE, CONFIG_TYPES_TS)).toContain(
      "\nexport type SkillId = never\n"
    )
  })

  // Global first, then project (B3.2).
  it("emits the global root before the project root", async () => {
    const preview = await buildOutputPreview(
      payload(
        {
          [REACT]: skill("global", "plugin"),
          [TAILWIND]: skill("project", "plugin"),
        },
        { [WEB_DEVELOPER]: { on: true, scope: "project" } }
      ),
      "claude"
    )

    expect(preview.roots.map((root) => root.base)).toStrictEqual([
      GLOBAL_BASE,
      PROJECT_BASE,
    ])
  })
})

describe("the footer's file count", () => {
  // B3.4: only files an install writes, the pair per root and one per compiled
  // sub-agent. Derived from the preview's own rows, since the roster moves.
  it("counts the config pair per root and one file per compiled sub-agent", async () => {
    const preview = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") }),
      "claude"
    )
    const agents = preview.roots
      .flatMap((root) => root.nodes)
      .filter((node) => node.id.endsWith(".md"))
    const CONFIG_FILES_PER_ROOT = 2

    // Guard: a preview with no sub-agent agrees with itself for free.
    expect(
      agents,
      "the preview compiled no sub-agent, so the count below has no subject"
    ).not.toStrictEqual([])
    expect(preview.fileCount).toStrictEqual(
      CONFIG_FILES_PER_ROOT * preview.roots.length + agents.length
    )
  })

  // An ejected catalogue directory is not countable: ejecting must not move it.
  it("does not count an ejected catalogue skill's directory", async () => {
    const asPlugin = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") }),
      "claude"
    )
    const asEject = await buildOutputPreview(
      payload({ [REACT]: skill("global", "eject") }),
      "claude"
    )

    // Guards: a count exists, and the flip really happened.
    expect(
      asPlugin.fileCount,
      "the preview counted no files, so the comparison below has no subject"
    ).toBeGreaterThan(0)
    expect(
      asEject.roots.flatMap((root) => root.nodes.map((node) => node.marker)),
      "the eject flip produced no ejected row, so both sides of the comparison are the same state"
    ).toContain("eject")

    expect(asEject.fileCount).toStrictEqual(asPlugin.fileCount)
  })
})
