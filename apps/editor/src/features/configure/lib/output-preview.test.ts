import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_CATALOG,
} from "@workspace/api-mocks"
import { generateConfigSource } from "@workspace/compile/config-source"
import { seatedCatalog } from "@workspace/compile"
import { CORPUS_CLI_VERSION } from "@workspace/compile/corpus"
import { provenanceMarker } from "@workspace/compile/agent-source"
import { SEED_VERSION, type SeedPayload } from "@workspace/matrix"
import { afterEach, describe, expect, it, vi } from "vitest"

import { activeStacks, useCatalogStore } from "@/stores/catalog-store"

import { buildOutputPreview } from "./output-preview"

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
// name. `.claude-src/` holds the config pair and `.claude/` everything else —
// C5's correction, and the reason a root is two directories rather than one.
const GLOBAL_BASE = "~/"
const PROJECT_BASE = "./"

const CONFIG_TS = "config.ts"
const CONFIG_TYPES_TS = "config-types.ts"

/**
 * A payload with one skill, on one sub-agent, at a named scope and install
 * mode. Written out here rather than driven through the store, for the reason
 * `seed.test.ts` writes its `config()` out: this file's subject is the bytes a
 * payload produces, and a store in between would put a second thing that can
 * be wrong between the input and the assertion.
 */
const payload = (
  skills: SeedPayload["skills"],
  agents: SeedPayload["agents"] = {}
): SeedPayload => ({
  v: SEED_VERSION,
  matrixVersion: "0.0.0-test",
  stackId: null,
  skills,
  agents,
})

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
      payload({ [REACT]: skill("global", "plugin") })
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
      )
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
      )
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
   */
  it("carries the applied stack's description, which the CLI writes for one", async () => {
    const [stack] = activeStacks()

    expect(
      stack,
      "the seated catalogue offers no stack, so this assertion has no subject"
    ).toBeDefined()

    const preview = await buildOutputPreview({
      ...payload({ [REACT]: skill("global", "plugin") }),
      stackId: stack!.id,
    })
    const configTs = bodyOf(preview, GLOBAL_BASE, CONFIG_TS)

    expect(configTs, "the preview drew no global config.ts").toBeTruthy()
    expect(configTs).toContain(stack!.description)
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
      payload({ [REACT]: skill("global", "plugin") })
    )
    const configTs = bodyOf(preview, GLOBAL_BASE, CONFIG_TS)

    expect(configTs, "the preview drew no global config.ts").toBeTruthy()
    expect(configTs).not.toContain("description:")
  })
})

describe("the one line a browser cannot know", () => {
  /**
   * §B3.5 rule 2, and C2's correction: the machine-specific value that reaches
   * a real file is the project `config-types.ts`'s import specifier, which is
   * `path.relative(<project>/.claude-src, $HOME/.claude-src)` — and the CLI's
   * own contract test names it as the one thing deliberately NOT in the shared
   * package, "because a browser has no disk to probe".
   *
   * So the preview renders a NAMED PLACEHOLDER there. `../../../.claude-src` is
   * the exact failure the design's constraint names, and it is what a plausible
   * invented path looks like — hence the second assertion, which is the one
   * that catches an implementer who guessed.
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
      )
    )
    const types = bodyOf(preview, PROJECT_BASE, CONFIG_TYPES_TS)

    expect(types, "the preview drew no project config-types.ts").toBeTruthy()
    expect(types).toContain("<computed at install time>")
    expect(
      types,
      "the preview invented a relative path to the global .claude-src instead of naming it as computed"
    ).not.toContain("../")
  })

  /**
   * The other branch, and the one where the preview is exactly right: with no
   * global-scoped item there is no global root, so the project `config-types.ts`
   * takes the standalone form and has no import specifier to be unsure about.
   * A preview that showed the placeholder here would be hedging about something
   * it knows.
   */
  it("shows no placeholder when there is no global root to import from", async () => {
    const preview = await buildOutputPreview(
      payload(
        { [REACT]: skill("project", "plugin") },
        { [WEB_DEVELOPER]: { on: true, scope: "project" } }
      )
    )

    const types = bodyOf(preview, PROJECT_BASE, CONFIG_TYPES_TS)

    expect(
      rootOf(preview, GLOBAL_BASE),
      "a global root was emitted for a configuration holding nothing global"
    ).toBeUndefined()
    expect(types, "the preview drew no project config-types.ts").toBeTruthy()
    expect(types).not.toContain("<computed at install time>")
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
    const preview = await build(payload({ [REACT]: skill("global", "plugin") }))
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
   * §B3.5 rule 5. A browser cannot read the CLI's manifest, so the marker
   * carries the version the corpus was vendored at — and that is the most
   * visible line in the whole dialog, since it is a compiled agent's first body
   * line. Bound to the symbol rather than to a version string: the claim is
   * that the preview stamps THE CORPUS's version, not that it stamps a
   * particular release.
   */
  it("carries the provenance marker for the version the corpus was vendored at", async () => {
    const preview = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") })
    )
    const agent = rootOf(preview, GLOBAL_BASE)?.nodes.find((node) =>
      node.id.endsWith(`${WEB_DEVELOPER}.md`)
    )

    expect(agent?.body, "the preview drew no compiled sub-agent").toBeTruthy()
    expect(agent?.body).toContain(provenanceMarker(CORPUS_CLI_VERSION))
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
      payload({ [REACT]: skill("global", "plugin") })
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
      payload({ [REACT]: skill("global", "eject") })
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
        payload({ [REACT]: skill("global", "eject") })
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
        payload({ [ACME_SKILL]: skill("global", "eject") })
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
        payload({ [ACME_SKILL]: skill("global", "plugin") })
      )
      const asEject = await buildOutputPreview(
        payload({ [ACME_SKILL]: skill("global", "eject") })
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
        payload({ [REACT]: skill("global", "eject") })
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
      payload({ [REACT]: skill("global", "plugin") })
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

describe("which roots are emitted", () => {
  /**
   * B3.2's first rule, and it is "absent, not empty" rather than a nicety: an
   * emitted root always carries the config pair, so a root drawn for a scope
   * holding nothing would show two files an install does not write there.
   */
  it("emits no root for a scope holding neither an agent nor a skill", async () => {
    const preview = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") })
    )

    expect(preview.roots.map((root) => root.base)).toStrictEqual([GLOBAL_BASE])
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
      )
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
   * clothes.
   */
  it("counts the config pair per root and one file per compiled sub-agent", async () => {
    const preview = await buildOutputPreview(
      payload({ [REACT]: skill("global", "plugin") })
    )
    const agents = (rootOf(preview, GLOBAL_BASE)?.nodes ?? []).filter((node) =>
      node.id.endsWith(".md")
    )
    const CONFIG_FILES_PER_ROOT = 2

    expect(preview.fileCount).toStrictEqual(
      CONFIG_FILES_PER_ROOT + agents.length
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
      payload({ [REACT]: skill("global", "plugin") })
    )
    const asEject = await buildOutputPreview(
      payload({ [REACT]: skill("global", "eject") })
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
