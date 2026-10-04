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

/**
 * WHAT THIS FILE IS FOR, IN ONE SENTENCE: the preview must not invent bytes.
 *
 * The design file states the constraint the whole dialog exists to satisfy —
 * "the moment someone diffs it against reality and it is off, they stop
 * trusting the configurator" — so every assertion below binds the pane's text
 * to what `@workspace/compile` RETURNS rather than to a string typed here. A
 * transcribed literal would be a second implementation of the renderer, and a
 * second implementation is the defect this phase removes.
 *
 * THE CATALOGUE IS THE SEATED ONE, read back through `seatedCatalog()` rather
 * than named. That is not convenience: the preview is drawn against the seated
 * catalogue by decision (§B3.5 rule 3, "the preview is drawn against the seated
 * catalogue, and the footer says so"), so an expectation that named a different
 * one would be asserting about a preview nobody ships.
 *
 * WHAT IS NOT HERE. Every claim about what is on SCREEN — rows, labels, the
 * header subtitle, the footer, keyboard reach — is in
 * `e2e/specs/output-preview.spec.ts`. `@workspace/vitest-config` is for pure
 * logic and says so in as many words ("anything that renders is covered
 * end-to-end in a real browser instead"), and this suite's environment is
 * `node` with no DOM. Rendering assertions belong where a browser is.
 */

// A catalogue skill in an exclusive category, and one in a multi category, so a
// two-skill configuration is expressible without a conflict standing in the way.
const REACT = "web-framework-react"
const TAILWIND = "web-styling-tailwind"

// The seated-marketplace fixture's own skill. CLI-498 prefixes every custom
// marketplace's ids with its own name, so this one is in `MARKETPLACE_CATALOG`
// and in no other catalogue — which is what makes "the seat was read" provable
// rather than a matter of counting.
const ACME_SKILL = "acme-web-widgets"

// The five sub-agents the shared resolver targets for a web skill: the domain's
// three role flavours plus the two cross-domain roles.
const WEB_DEVELOPER = "web-developer"

// Emission order is global first, then project, and a base is the root's own
// name. The source folder holds the config pair and `.claude/` everything else
// — C5's correction, and the reason a root is two directories rather than one.
const GLOBAL_BASE = "~/"
const PROJECT_BASE = "./"

const CONFIG_TS = "config.ts"
const CONFIG_TYPES_TS = "config-types.ts"

// The source folder the config pair is written into, mirrored rather than
// imported: it is text the preview renders and a path on people's disks, so an
// assertion reading the constant the product writes would move with it.
const SOURCE_DIR = ".agents-inc/claude/"

/**
 * THE PREMISE EVERY ROOT BELOW IS DRAWN UNDER: `init --from` run from a project
 * directory on a machine with nothing installed. The Install dialog sends the
 * visitor there first (`cd ~/code/your-project`), and §B3.5 rule 1 has the
 * footer say the project root is drawn as an install into a project directory.
 *
 * From there `writeProjectConfig` in the CLI writes BOTH pairs, whatever the
 * configuration holds: `ensureBlankPair` writes the global one before anything
 * else, and `projectInstallationExists: isProjectContext` makes
 * `writeProjectPairWhenOwed` write the project one. So a root's config pair is
 * owed whether or not the root holds an agent or a skill — measured by running
 * `agents-inc init --from` over the payloads this file builds, from a project
 * directory in a fresh HOME.
 */
const configPairIn = (base: string) => [
  `${base}${SOURCE_DIR}${CONFIG_TS}`,
  `${base}${SOURCE_DIR}${CONFIG_TYPES_TS}`,
]

/**
 * A payload holding exactly these skills and sub-agent entries — no sub-agent
 * entry unless a spec names one. Built on `seedPayload` rather than driven
 * through the store, for the reason `seed.test.ts` writes its `config()` out:
 * this file's subject is the bytes a payload produces, and a store in between
 * would put a second thing that can be wrong between the input and the
 * assertion.
 */
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
  // `as const` on the pair, not on the map: `Object.fromEntries` widens a
  // `[string, string]` tuple to a `string` value type, and the payload's own
  // load state is a two-member union.
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
  /**
   * §B3.5 rule 1, and C1's correction to it: TWO writer variants are reachable
   * in production, not three. A global root renders standalone.
   *
   * The expectation calls the renderer with the root's OWN config rather than
   * one rebuilt here. Rebuilding it would make this a test of two
   * payload-to-config translations agreeing, which is a different claim and a
   * weaker one — what has to hold is that the pane shows the renderer's answer
   * for the configuration the preview says it is drawing.
   */
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

  /**
   * The other half of C1: a project root renders the INLINED-GLOBAL form, with
   * the global config the preview itself just produced. The two forms differ in
   * their `export default` ordering as well as their contents, so a preview
   * that drew both roots standalone would be wrong about a file it shows
   * side-by-side with the right one.
   */
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

  /**
   * The two forms really are different bytes. Without this the two assertions
   * above could both pass against one writer used twice — the preview would be
   * consistent with itself and wrong about the project root, which is exactly
   * the failure that is invisible from inside a single installation.
   */
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

  /**
   * `description` IS the second member of `CANONICAL_FIELD_ORDER`, so a
   * configuration that applied a stack loses a line near the top of the most
   * read file in the dialog.
   *
   * The CLI's `buildInstallConfig` writes it through
   * `resolveDescription(loadedStack, wizardResult.description)`, which answers
   * the STACK's own description whenever the payload named a stack — and a
   * payload minted here always does, because `toSeedPayload` sets
   * `stackId: config.stackId`. `resolveDescription`'s docblock explains why
   * nothing had noticed: it says `configToSeedPayload` writes `stackId: null`
   * "on purpose", which is true of the CLI's share payload and is exactly what
   * the editor's is not. So the preview reads `payload.description` alone, the
   * editor never mints one, and the line is silently absent.
   *
   * The expected sentence is read off the SEATED catalogue rather than typed
   * out, for this file's stated reason: a transcribed literal would be a second
   * copy of a stack's own metadata, and a marketplace ships its own stacks.
   *
   * THE PROJECT'S `config.ts` IS WHERE THE LINE LANDS, for a configuration
   * that is wholly global too. Run from a project directory, the CLI writes the
   * project pair whatever the project holds (see {@link configPairIn}), and the
   * description travels on the project split into that file — the global one
   * is rebuilt without it, which the spec below holds.
   */
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

  /**
   * THE GLOBAL `config.ts` CARRIES NO DESCRIPTION, because the CLI never
   * writes the global split as it stands. A project install resolves the
   * global config through `resolveEffectiveGlobalConfig`, and on a clean
   * machine that is `mergeGlobalConfigs` over the blank pair `ensureBlankPair`
   * has just written: the merge spreads the EXISTING config and carries only
   * skills, agents, stack, domains and the marketplace identity across, so the
   * split's `description` never reaches the file. Installing this very payload
   * from a project directory wrote the stack's sentence into the project
   * `config.ts` and no `description` line into the global one.
   *
   * A mixed configuration on purpose: both roots are drawn already, so the
   * only thing that can make this red is the line itself — the subject guard
   * says the sentence reached the configuration at all, which is what stops
   * the absence below passing on a preview that lost it everywhere.
   *
   * `description:` is written out rather than imported from the writer, for
   * the reason the spec below gives: it is TEXT the product emits.
   */
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

  /**
   * The other side of the same line, and the half that keeps the one above
   * honest: with no stack applied there is no stack to describe, and the CLI's
   * `resolveDescription` returns `undefined` — so an unconditional description
   * would satisfy the assertion above while writing a field no install emits.
   *
   * `description:` is written out rather than imported from the writer, because
   * it is TEXT the product emits and an assertion importing the very constant
   * it checks cannot fail.
   */
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

/**
 * THE MARKETPLACE A CONFIGURATION NAMING NONE IS INSTALLED FROM — which is
 * every configuration minted on the public catalogue, because `toSeedPayload`
 * stamps a marketplace only once one is loaded. `init --from` hands
 * `payload.marketplace` to the install as its flag; with none, `resolveSource`
 * falls through to the CLI's default on a machine that sets no
 * `CC_MARKETPLACE` and holds no config, which is the premise every root here is
 * drawn under. `setConfigMetadata` records it in the project's `config.ts`,
 * and the global merge carries it into the global one whenever the global
 * holds anything — measured by `init --from` from a project directory in a
 * fresh HOME, which wrote this line into both.
 *
 * The line is written out rather than built from the CLI's constant, because
 * it is TEXT the install wrote: an expectation reading the value under test
 * would move with it.
 */
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

  /**
   * The other half, which keeps the one above honest: a configuration holding
   * nothing global leaves the blank global pair exactly as `ensureBlankPair`
   * wrote it, so an unconditional line would pass above and draw a field the
   * install does not write here.
   */
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
    // A separate needle, because `marketplace:` is not a substring of
    // `marketplaceName:` — a project install leaves the global name alone too.
    expect(bodyOf(preview, GLOBAL_BASE, CONFIG_TS)).not.toContain(
      "marketplaceName:"
    )
  })

  /**
   * An install holding a plugin registers the marketplace with Claude Code,
   * reading the name its manifest gives it, and `setConfigMetadata` records
   * that name beside the ref — in both files, as `init --from` writes them on
   * a clean machine. Held to the line after the ref, because that is where the
   * writer puts it and a line drawn anywhere else is a different file.
   */
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

/**
 * An install from a marketplace other than the public one reads that
 * marketplace's manifest whatever it installs — `resolveMarketplaceLabels` in
 * the CLI's source loader refuses a fetch without a named one — and records
 * the name beside the ref. The seat here is a catalogue and nothing else, so
 * no name is readable: the line is drawn with the placeholder, as the
 * project's name is, and never left out.
 *
 * `MARKETPLACE_CANONICAL_REF` is bound rather than written out because it is
 * this test's own input: the store is seated with it and the payload names it.
 */
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
  /**
   * §B3.5 rule 2, and C2's correction: the machine-specific value that reaches
   * a real file is the project `config-types.ts`'s import specifier, which is
   * `path.relative(<project source folder>, <global source folder>)` — and the
   * CLI's own contract test names it as the one thing deliberately NOT in the
   * shared package, "because a browser has no disk to probe".
   *
   * So the preview renders a NAMED PLACEHOLDER there. A ready-made `../../../…`
   * is the exact failure the design's constraint names, and it is what a
   * plausible invented path looks like — hence the second assertion, which is
   * the one that catches an implementer who guessed. The rename gives that
   * assertion a second reason to exist: each scope can be on either layout
   * independently, so even the number of `../` segments is now a fact about the
   * disk rather than a constant.
   *
   * The placeholder text is written out here rather than imported from the
   * product, the same discipline `e2e/pages` follows: an assertion that reads
   * the very constant it is checking cannot fail.
   */
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

  /**
   * The branch §B3.5 rule 2 called exactly right, and it is not: with no
   * global-scoped item the CLI still writes the global pair first —
   * `ensureBlankPair` runs before the project write — so the project
   * `config-types.ts` finds a global one on disk and takes the IMPORT form, the
   * placeholder's line included. Installing this very payload from a project
   * directory wrote `SkillId as GlobalSkillId` and a relative specifier into
   * it; the standalone form drawn for it is a file no install writes.
   */
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
  /**
   * THE MECHANISM, and the name says so because the mock is what makes it
   * checkable: with `renderAgentFromCorpus` replaced by a sentinel, the only
   * thing this can observe is whether the preview passes the renderer's answer
   * through untouched. It says nothing about whether those bytes are right —
   * `packages/cli/e2e/lifecycle/preview-matches-install.e2e.test.ts` is what
   * holds them against a real install, and this is the link in that chain that
   * lives on the editor's side.
   *
   * Worth having on its own: a wrapper, a trim, a "…" truncation or a
   * re-indent applied on the way to the pane are all invisible to a byte
   * comparison run on the other side of the seam.
   */
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

  /**
   * §B3.5 rule 5, as it reads since the marker stopped carrying a version.
   *
   * THIS CHECKS PROVENANCE AND NOTHING ELSE, and this docblock claimed a
   * version check until 2026-09-03. `provenanceMarker()` takes no argument and
   * returns a compile-time constant: its bytes are deliberately identical
   * across releases, because a compiled sub-agent IS a system prompt and this
   * line is the first cacheable byte of every invocation of it. So what holds
   * is that the preview stamps the line the CLI writes, byte for byte, and a
   * body drawn here is recognisable as this CLI's — which is what makes it the
   * subject guard for every other claim about a compiled body.
   *
   * NO VERSION ASSERTION BELONGS HERE. The release travels in the trailing
   * `<system-reminder>` block, and the editor reaches `renderAgentFromCorpus`
   * with two arguments, so the version it renders comes from that function's
   * own default parameter and cannot diverge from the corpus it renders off.
   * The drift check that CAN fail is the one against bytes on a disk, in
   * `packages/cli/e2e/lifecycle/preview-matches-install.e2e.test.ts` — and the
   * gutting of that check is what
   * `.ai-docs/agent-findings/2026-09-03-a-signature-change-was-patched-to-compile-and-a-tests-version-check-silently-stopped-checking-version.md`
   * records.
   */
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

  /**
   * THE FRONTMATTER FIELD THE PREVIEW DROPPED, and the arm no shipped roster
   * can reach on its own.
   *
   * `resolveAgents` in the CLI's `lib/resolver.ts` composes
   * `agentConfig.effort ?? definition.effort`, and the preview forwarded
   * `agent.effort` alone — so a `metadata.yaml` declaring `effort: high` with
   * no config override wrote the line into a real install's frontmatter and
   * drew nothing here. `effort` is rendered: `agent.liquid` in the vendored
   * corpus branches on `{% if agent.effort %}`, and `agent-source.test.ts`
   * names it in `FIELDS_THE_TEMPLATE_RENDERS`.
   *
   * THE DEFINITION IS MOCKED BECAUSE NO SHIPPED ONE DECLARES AN EFFORT, so
   * the arm has no subject otherwise — this is how to check that:
   *
   *     grep -c "effort:" packages/matrix/src/generated/agents.ts
   *
   * What the mock supplies is the INPUT a `metadata.yaml` supplies; the
   * composition around it and the real Liquid render off the corpus are
   * untouched, which is the opposite of mocking away the thing under test.
   *
   * Its control is the spec below — the same payload with the roster left
   * alone. A mock that never took reddens the pair rather than passing it,
   * because the two specs disagree about one line.
   */
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

      // `@workspace/matrix` is a STATIC import of the module under test, so
      // its already-evaluated instance holds the real roster and a bare
      // `doMock` would leave this measuring nothing. The corpus mock above
      // needs no such reset because `@workspace/compile/preview` is reached
      // through `import()` at call time.
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

    /**
     * The control, and an honest negative rather than a pinned gap: with the
     * roster left alone nothing declares an effort and this payload names no
     * override, so a real install writes no `effort:` line either — the
     * template branches on presence. It is what stops the spec above passing
     * on a mock that never took, and what stops the fix becoming an
     * unconditional line.
     */
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

  /**
   * THE ONLY SENTENCE IN A COMPILED SUB-AGENT THAT SAYS WHEN TO LOAD A SKILL,
   * and it had no coverage on either side of the seam while it was wrong.
   *
   * `agent.liquid` renders it as a bullet of its own under each dynamic
   * skill's heading, so the assertions below bind to `\n- <sentence>\n`: the
   * bullet IS the contract, and a sentence that reached some other line would
   * satisfy a bare `toContain`.
   *
   * The stated sentence is read off the seated catalogue rather than typed
   * out — it is a skill's own metadata and a marketplace ships its own, the
   * same reason the stack-description spec reads `activeStacks()`. The
   * FALLBACK sentence is written out, because it is TEXT the product emits
   * and must stay byte-identical to `statedUsageFor` in the CLI's
   * `lib/stacks/stacks-loader.ts`, capital and full stop included; only the
   * category it interpolates is read off the seat.
   *
   * `activeMatrix()` rather than `seatedCatalog()`: the compile package's
   * `CompileCatalog` names neither `usageGuidance` nor `description`, which is
   * why `resolveSkill` looks a skill up in the wire catalogue too.
   */
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

    /**
     * The fallback arm, and its subject is the seated marketplace rather than
     * the public catalogue: `acme-web-widgets` states no guidance, where the
     * vendored catalogue's skills state their own. Which fixture can carry
     * the claim is a question these two answer:
     *
     *     grep -c usageGuidance packages/api-mocks/src/fixtures.ts
     *     grep -c usageGuidance packages/matrix/src/vendor/generated/matrix.ts
     */
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

    /**
     * The hole the `??` leaves open: it guards a MISSING skill, and
     * `usageGuidance` is `z.string().exactOptional()` on both
     * `matrix-schema.ts` and `built-in-matrix.ts`, so a catalogue may state an
     * empty sentence and be valid. That renders `- ` and nothing after it —
     * a bullet in the activation protocol saying nothing, which is worse than
     * the category sentence it displaced.
     *
     * The seat is the shared marketplace fixture with one field changed,
     * because no published catalogue carries an empty one to seat and
     * `packages/api-mocks` belongs to another lane.
     */
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

/**
 * CLI-898, found by Codex's end-to-end run 2026-09-26: the preview's role file
 * differed from the installed one in exactly the skill descriptions. The
 * install reads each skill's SKILL.md description; the preview read the
 * catalogue's `description`, which is the wizard's short `cliDescription`.
 * The catalogue now carries both, and the preview draws the install's.
 */
describe("the description a skill is listed under", () => {
  afterEach(() => {
    useCatalogStore.getState().reset()
  })

  const WIZARD_LABEL = "A short wizard label"
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

  it("draws the SKILL.md description, never the wizard's label", async () => {
    seatAcmeWith({
      description: WIZARD_LABEL,
      activationDescription: SKILL_MD_DESCRIPTION,
    })

    const body = await acmeBody()

    expect(body, "the preview drew no compiled sub-agent").toBeTruthy()
    expect(body).toContain(SKILL_MD_DESCRIPTION)
    expect(body).not.toContain(WIZARD_LABEL)
  })

  it("draws the label from a catalogue built before it carried the SKILL.md one", async () => {
    seatAcmeWith({ description: WIZARD_LABEL })

    expect(await acmeBody()).toContain(WIZARD_LABEL)
  })

  /**
   * The vendored catalogue is the seat every visitor starts on, and the specs
   * above cannot reach it: they seat a marketplace that carries the field,
   * while the vendored one is read at import and asks the network for nothing,
   * so no rebuilt catalog.json changes what it says. Its `description` is the
   * wizard's label and an install writes the skill's SKILL.md sentence there
   * instead, so the label is read off the seat rather than typed here, and the
   * negative is held to the one row whose presence the line before it proves.
   *
   * The positive half is the sentence the vendored table holds for THIS id:
   * `generate:types` copies it out of the skill's own SKILL.md, so it is what
   * an install of the public catalogue writes. A row merely differing from the
   * label would pass on a lookup that answered some other skill's sentence.
   * The table is imported only once the negative has held, so a tree that
   * predates it fails on the label it draws rather than on the import.
   */
  it("draws no wizard label on the vendored catalogue, the seat every visitor starts on", async () => {
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
  /**
   * §0's second divergence, and the strongest argument the design makes for the
   * whole dialog: the plugin/eject decision made visible. `installPluginSkills`
   * shells out to `claude plugin install`, so the destination belongs to Claude
   * Code and drawing `~/.claude/skills/<id>` for one names a directory that will
   * not exist — which `packages/cli/CLAUDE.md` forbids by name.
   *
   * Both directions are pinned because either alone is satisfiable by a bug:
   * "never `new`" passes on a preview that omits plugin skills entirely, and
   * "no skills/ path" passes on one that labels them `new` somewhere else.
   */
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

  /**
   * The flip, which is the same skill and a different decision. An ejected
   * catalogue skill IS a directory the install creates, so it takes a path and
   * the amber label — and its children are deliberately absent, because the
   * preview cannot know the directory's file list without a network call.
   */
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

  /**
   * THE COORDINATE THE PREVIEW MUST NOT INVENT, and it is the one place in the
   * dialog that names a repository a visitor could go and open.
   *
   * `ejectedCatalogueNote` is reached only through
   * `skills.filter((skill) => !isPluginSkill(skill))`, and `isPluginSkill` is
   * `skill.origin !== EJECT_SOURCE` — so every skill that reaches the note has
   * `origin === "eject"` by the predicate's own definition, and interpolating
   * that field yields `Source: eject/src/skills/<id>`. There is no such
   * repository. `eject` is a SYNTHETIC source name meaning "copied rather than
   * installed as a plugin"; it is not a marketplace and never was.
   *
   * WHY THIS IS TWO TESTS AND WHY NEITHER READS THE CONFIG'S `origin`. The
   * claim was previously held against `origin` off the PLUGIN variant of the
   * same skill — on the reasoning that flipping install mode changes where the
   * bytes land, never where they come from. The reasoning is sound and the
   * assertion was still vacuous: `origin` is written by `sourceForSkill` off
   * `skill.availableSources`, which the CLI's multi-source loader populates and
   * nothing a browser runs does —
   *
   *     grep -c availableSources packages/matrix/src/vendor/generated/matrix.ts
   *     grep -c availableSources packages/api-mocks/src/fixtures.ts
   *
   * both answer 0. So `origin` collapsed to the public default, the note's own
   * source collapsed to the same public default by the same empty field, and
   * the two sides of the comparison moved together. The assertion could not
   * fail — which is the shape `packages/cli/CLAUDE.md` names in as many words:
   * never bind an assertion to a constant that merely has the same value as
   * the literal it replaces.
   *
   * What the note can honestly answer is the SEATED marketplace, which is what
   * the plugin note beside it already says. So the pin is split by seat, and
   * the second arm is the one that can fail: it seats a marketplace that is not
   * ours and holds the note to the ref the test itself seated.
   */
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

    /**
     * The arm that must not move. A visitor who has seated nothing is looking
     * at the vendored public catalogue, whose name IS honestly reachable —
     * `agents-inc` is what the CLI records as a plugin skill's `origin` for
     * that catalogue — so this note is byte-identical before and after the fix
     * beside it, and this assertion exists to say so.
     *
     * `agents-inc/src/skills` is written out rather than imported from
     * `DEFAULT_PUBLIC_SOURCE_NAME` and `SKILLS_DIR_PATH`: it is TEXT the note
     * renders, and an assertion reading the very constants the product
     * interpolates moves with them and cannot fail.
     */
    it("names the public catalogue by name for a visitor who has seated nothing", async () => {
      const preview = await buildOutputPreview(
        payload({ [REACT]: skill("global", "eject") }),
        "claude"
      )
      const note = ejectedNote(preview, REACT)

      expect(note, "the preview drew no ejected directory row").toBeTruthy()
      expect(note).toContain(`Source: agents-inc/src/skills/${REACT}`)
    })

    /**
     * The arm that catches it. `acme-web-widgets` exists in
     * `MARKETPLACE_CATALOG` and in no other catalogue — CLI-498 prefixes every
     * custom marketplace's ids with its own name — so a row for it can only
     * have come from the seat this test installed, and the decode drops an id
     * the seated catalogue does not carry.
     *
     * `MARKETPLACE_CANONICAL_REF` is bound rather than written out because it
     * is this test's own INPUT, not text the product renders: the store is
     * seated with it two lines above, and the product reads back whatever it
     * was handed. Repoint the fixture and the assertion follows its own data.
     *
     * The negative is the defect stated exactly: `agents-inc` is the answer
     * the empty `availableSources` produced, and printing it here tells this
     * visitor their skill is copied out of our repository rather than theirs —
     * a coordinate that resolves to something rather than to nothing, which is
     * the worst way for it to be wrong.
     */
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

    /**
     * The two notes are adjacent in one pane and answer the same question, so
     * a disagreement between them is visible in a single screenshot — worse
     * than a uniform error, because it says the surface was not thought
     * through. `pluginReferenceNote` was fixed one change ago and
     * `ejectedCatalogueNote` was not, which is exactly the state this asserts
     * against.
     *
     * Both guards are load-bearing: a preview that drew neither note satisfies
     * a comparison between two absent bodies for free.
     */
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

    /**
     * The sentinel half of the original claim, kept. `eject` is read off the
     * ejected variant's own config rather than written out: a literal would go
     * stale against the constant, and importing `EJECT_SOURCE` would let the
     * assertion follow a rename it is supposed to catch.
     */
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

  /**
   * The subject guard above the claim is not ceremony: "never `new`" is a
   * NEGATIVE, and a preview that drew no row for the skill at all satisfies it
   * for free. Naming the emptiness is what stops this passing on a model that
   * lost the skill entirely — the shape `packages/cli`'s own e2e guards use
   * ("the install compiled nothing, so the assertion below has no subject").
   */
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

/**
 * A SKILL THE CONFIGURATION CARRIES rather than names — added in the editor, so
 * its whole directory travels inside the payload — is the one ejected directory
 * whose files the preview can list, and it listed them as the payload holds
 * them. The install does not write them that way. `writeExternalSkills` in the
 * CLI's `seed/external-skills.ts` renames the manifest to the id the skill
 * installs under (`withInstalledName`), writes a `metadata.yaml` beside it
 * (`registerSkillOnDisk`), and seats the skill `custom: true`
 * (`externalCatalogueEntry`), which is what files it under `// Custom` in the
 * global `config-types.ts`.
 *
 * Every expected line below is TEXT the install wrote to disk for this very
 * payload, run from a project directory, so it is written out rather than
 * rendered here — the date and the content hash in its `forkedFrom` are the
 * install's own and are deliberately not asserted.
 */
describe("a skill the configuration carries", () => {
  afterEach(() => {
    useCatalogStore.getState().reset()
  })

  const CARRIED_CATEGORY = "meta-methodology"
  const CARRIED_ID = externalSkillId(CARRIED_CATEGORY, "brainstorming")
  const CARRIED_DIR = `${GLOBAL_BASE}.claude/skills/${CARRIED_ID}/`
  const PM = "pm"

  // As its repository wrote it: a manifest naming the skill the way upstream
  // knows it, one more file, and NO metadata.yaml — which is the case the
  // obra/superpowers skill in the lane's run is.
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

  // Seated the way `adoptSeedPayload` seats a payload's carried skills, which
  // is where the add-skill dialog leaves one too: in the catalogue, before the
  // decode reads the selection that names it.
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

  /**
   * Every loader reads a skill's id off this one line, and every compiled
   * sub-agent references the minted id — so a manifest still naming the
   * upstream `brainstorming` describes a skill nothing installed. Only the
   * name moves; the rest of the file is the author's and travels untouched.
   */
  it("names its SKILL.md by the id it installs under", async () => {
    expect(
      bodyOf(await carriedPreview(), GLOBAL_BASE, `${CARRIED_DIR}SKILL.md`)
    ).toStrictEqual(
      `---\nname: ${CARRIED_ID}\ndescription: Explores user intent before implementation.\n---\n\n# Brainstorming\n`
    )
  })

  /**
   * The file the tree left out. Named rather than counted, and sorted on both
   * sides, because the claim is which files the install leaves in the
   * directory — not the order the tree lists them in.
   */
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

  /**
   * What that file has to say for the next `edit`, `compile` or `list` to find
   * the skill again: the id it answers to, the placement the visitor confirmed,
   * that it is the user's own, and where its bytes came from — the provenance
   * `uninstall` and `share` read to know the directory is the round trip's.
   *
   * The domain is read off the seated catalogue rather than written out, for
   * the reason the stack specs above read `activeStacks()`: it is the
   * catalogue's own metadata, and the install reads the same declaration.
   */
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

  /**
   * The global `config-types.ts` splits `SkillId` under `// Custom` and
   * `// Marketplace` once any member is the user's own — `isCustomSkill` in
   * `@workspace/compile` reads `custom: true` off the catalogue entry, which
   * the install seats and the preview's seat does not. The block is asserted
   * whole, ending where the union ends, because the claim is the grouping and
   * a flat union contains every one of these ids too.
   */
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
  /**
   * BOTH, ALWAYS — and B3.2's "absent, not empty" rule rested on a premise the
   * CLI contradicts. It reasoned that a root holding nothing would show "two
   * files an install does not write there"; run from a project directory, the
   * install writes exactly those two files there (see {@link configPairIn}).
   * So a wholly global configuration still writes the project's pair, and the
   * pair is all it writes there: its sub-agents and its plugins are global.
   *
   * The written files are named rather than counted, because the claim is
   * which files the install leaves on disk and a count cannot see a swap.
   */
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

  /**
   * The mirror image: a configuration written wholly into the project still
   * leaves the global pair on disk, because `ensureBlankPair` writes it before
   * the project write runs. Nothing else lands under `~/` for it.
   */
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

  /**
   * And that global pair is BLANK, which is what makes it honest to draw: the
   * configuration put nothing global in it, so the global config holds no
   * skill and no sub-agent and its unions are `never`. A preview that filled
   * the global root with the project's entries would satisfy the two specs
   * above and draw a file no install writes.
   *
   * `export type SkillId = never` is written out rather than rendered here,
   * because it is the line the install wrote — and an expectation built by the
   * renderer under test would agree with whatever it was handed.
   */
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

  /** Global first, then project — the emission order B3.2 states. */
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
  /**
   * B3.4 defines the count exactly, and the definition is what makes it worth
   * asserting: only files an install actually WRITES. The two config files per
   * emitted root, one per compiled sub-agent, and an external ejected skill's
   * real files. A plugin reference writes nothing; an ejected catalogue
   * directory is copied rather than generated and its file list is unknown to a
   * browser; roots and directories are not files.
   *
   * The expected number is arithmetic on the rows the preview itself emitted,
   * rather than a literal, because the sub-agent roster is the catalogue's and
   * moves with it — a literal here would be a catalogue fact wearing a footer's
   * clothes. That holds for the roots too: the pair is counted once per root
   * the preview drew, and WHICH roots it draws is pinned under "which roots are
   * emitted" rather than restated here as an arity.
   */
  it("counts the config pair per root and one file per compiled sub-agent", async () => {
    const preview = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") }),
      "claude"
    )
    const agents = preview.roots
      .flatMap((root) => root.nodes)
      .filter((node) => node.id.endsWith(".md"))
    const CONFIG_FILES_PER_ROOT = 2

    // The subject: a preview that compiled no sub-agent at all states a count
    // that agrees with its own rows for free — the config pair and nothing else.
    expect(
      agents,
      "the preview compiled no sub-agent, so the count below has no subject"
    ).not.toStrictEqual([])
    expect(preview.fileCount).toStrictEqual(
      CONFIG_FILES_PER_ROOT * preview.roots.length + agents.length
    )
  })

  /**
   * The negative half, and the one a plausible implementation gets wrong: an
   * ejected catalogue skill's directory row is not a file the preview can
   * count, because the preview does not know what is in it. Ejecting must move
   * the row without moving the number.
   */
  it("does not count an ejected catalogue skill's directory", async () => {
    const asPlugin = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") }),
      "claude"
    )
    const asEject = await buildOutputPreview(
      payload({ [REACT]: skill("global", "eject") }),
      "claude"
    )

    // Two guards, because an equality between two numbers is satisfied by two
    // previews that drew nothing, and by two that drew the same wrong thing.
    // The first says a file count exists at all; the second says the flip
    // really happened, so the two sides are the two states this compares.
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
