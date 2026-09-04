/**
 * The tool grant every compiled sub-agent carries.
 *
 * `tools:` in a sub-agent's frontmatter is an ALLOWLIST — an agent that
 * declares one gets exactly what it names, where an agent that omits the key
 * inherits every tool the session has. Every agent this product compiles
 * declares one, and none of the eighteen `metadata.yaml` files names `Skill`,
 * so every agent it has ever written was unable to invoke a skill.
 *
 * The `skills:` key does not close that: it preloads skill content into the
 * agent's startup context and grants no tool, so an agent can list skills and
 * still have no way to load one. That independence is why the defect survived
 * — a compiled agent looked fully skill-aware from its frontmatter — and it is
 * what these tests are really pinning.
 *
 * The two render cases go through `renderAgentFromCorpus`, which is the same
 * Liquid render an install performs, so what they assert is the literal
 * frontmatter line rather than a field on an object. They keep `"Skill"` as a
 * literal on purpose: an assertion that imported the constant the renderer
 * writes would move with it and could not fail.
 */

import { describe, expect, it } from "vitest"

import { buildAgentTemplateContext, type AgentFiles } from "./agent-source"
import { renderAgentFromCorpus } from "./preview"
import type { AgentConfig, Skill } from "./types"
import { typedKeys } from "./typed-object"

/** The partials are not this file's subject; every case renders the same empty set. */
const NO_FILES: AgentFiles = {
  identity: "",
  playbook: "",
  output: "",
  criticalRequirementsTop: "",
  criticalReminders: "",
}

const DYNAMIC_SKILL: Skill = {
  id: "meta-design-expressive-typescript",
  path: "meta/design/expressive-typescript",
  description: "Readable functional patterns",
  usage: "when shaping types",
  preloaded: false,
}

const PRELOADED_SKILL: Skill = {
  id: "cli-framework-oclif-ink",
  path: "cli/framework/oclif-ink",
  description: "oclif command structure and Ink components",
  usage: "when working with cli-framework",
  preloaded: true,
}

describe("the tools a compiled sub-agent is granted", () => {
  it("adds Skill to a definition whose metadata omits it", () => {
    const agent: AgentConfig = {
      name: "cli-developer",
      title: "CLI Developer Agent",
      description: "Implements CLI features from detailed specs",
      tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
      skills: [DYNAMIC_SKILL],
    }

    const { agent: granted } = buildAgentTemplateContext(
      "cli-developer",
      agent,
      NO_FILES
    )

    expect(
      granted.tools,
      "a tools list is an allowlist, so an agent told to invoke Skill has to name it"
    ).toStrictEqual(["Read", "Write", "Edit", "Grep", "Glob", "Bash", "Skill"])
  })

  it("adds Skill to a read-only researcher, which grants no write access", () => {
    const agent: AgentConfig = {
      name: "cli-researcher",
      title: "CLI Researcher Agent",
      description: "Read-only CLI research specialist",
      tools: ["Read", "Grep", "Glob", "Bash"],
      skills: [DYNAMIC_SKILL],
    }

    const { agent: granted } = buildAgentTemplateContext(
      "cli-researcher",
      agent,
      NO_FILES
    )

    expect(granted.tools).toStrictEqual([
      "Read",
      "Grep",
      "Glob",
      "Bash",
      "Skill",
    ])
  })

  it("adds Skill to an agent carrying no dynamic skills at all", () => {
    const agent: AgentConfig = {
      name: "cli-developer",
      title: "CLI Developer Agent",
      description: "Implements CLI features from detailed specs",
      tools: ["Read", "Bash"],
      skills: [PRELOADED_SKILL],
    }

    const context = buildAgentTemplateContext("cli-developer", agent, NO_FILES)

    expect(
      context.dynamicSkills,
      "the case is only meaningful while this agent emits no activation protocol"
    ).toStrictEqual([])
    expect(
      context.agent.tools,
      "the grant is unconditional — a user adds skills after an agent is compiled"
    ).toStrictEqual(["Read", "Bash", "Skill"])
  })

  it("adds Skill to an agent carrying no skills at all", () => {
    const agent: AgentConfig = {
      name: "cli-developer",
      title: "CLI Developer Agent",
      description: "Implements CLI features from detailed specs",
      tools: ["Read", "Bash"],
      skills: [],
    }

    const { agent: granted } = buildAgentTemplateContext(
      "cli-developer",
      agent,
      NO_FILES
    )

    expect(granted.tools).toStrictEqual(["Read", "Bash", "Skill"])
  })

  it("names Skill once and leaves the declared order alone", () => {
    const agent: AgentConfig = {
      name: "cli-developer",
      title: "CLI Developer Agent",
      description: "Implements CLI features from detailed specs",
      tools: ["Read", "Skill", "Bash"],
      skills: [DYNAMIC_SKILL],
    }

    const { agent: granted } = buildAgentTemplateContext(
      "cli-developer",
      agent,
      NO_FILES
    )

    expect(
      granted.tools,
      "a second entry, or a reordered list, diffs every compiled agent on the next compile"
    ).toStrictEqual(["Read", "Skill", "Bash"])
  })

  it("changes nothing about the definition but its tools", () => {
    const agent: AgentConfig = {
      name: "cli-developer",
      title: "CLI Developer Agent",
      description: "Implements CLI features from detailed specs",
      model: "opus",
      effort: "high",
      disallowedTools: ["WebFetch"],
      permissionMode: "default",
      path: "developer/cli-developer",
      tools: ["Read", "Bash"],
      skills: [DYNAMIC_SKILL],
    }

    const { agent: granted } = buildAgentTemplateContext(
      "cli-developer",
      agent,
      NO_FILES
    )

    expect(granted).toStrictEqual({
      ...agent,
      tools: ["Read", "Bash", "Skill"],
    })
  })
})

describe("the frontmatter an install writes", () => {
  it("names Skill on a developer's tools line", async () => {
    const agent: AgentConfig = {
      name: "cli-developer",
      title: "CLI Developer Agent",
      description: "Implements CLI features from detailed specs",
      tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
      skills: [DYNAMIC_SKILL],
    }

    const rendered = await renderAgentFromCorpus("cli-developer", agent)

    expect(rendered).toContain(
      "\ntools: Read, Write, Edit, Grep, Glob, Bash, Skill\n"
    )
  })

  it("names Skill on a read-only researcher's tools line", async () => {
    const agent: AgentConfig = {
      name: "cli-researcher",
      title: "CLI Researcher Agent",
      description: "Read-only CLI research specialist",
      tools: ["Read", "Grep", "Glob", "Bash"],
      skills: [DYNAMIC_SKILL],
    }

    const rendered = await renderAgentFromCorpus("cli-researcher", agent)

    expect(rendered).toContain("\ntools: Read, Grep, Glob, Bash, Skill\n")
  })
})

/**
 * The file's second subject: everything author-supplied that reaches the Liquid
 * engine has its delimiters stripped on the way.
 *
 * `sanitizeCompiledAgentData` covers the agent by ENUMERATION — one conditional
 * spread per field, over a leading `...data.agent` that passes everything else
 * through untouched — and an enumeration held against nothing has already fallen
 * behind the template three times: `hooks` when hooks were first rendered,
 * `experimental` when that key arrived, and `hooks[].hooks[].type`, which rode the
 * `...action` spread past `command`, `script` and `prompt` and which this gate
 * caught on its first run. All three reached the renderer unsanitised with every
 * other gate green, because nothing compared the two lists.
 *
 * So neither list is written down here. The fixture is annotated
 * `Required<AgentConfig>`, which is the COMPILER holding one side against the
 * model: a field added to `AgentConfig` and forgotten below fails `tsc` at the
 * literal, and a field removed from the type fails there too. The other side is
 * read from BEHAVIOUR — every field carries a marker built out of Liquid
 * delimiters, the agent renders through the same corpus path an install renders,
 * and a marker that comes back with its delimiters intact is a field nothing
 * stripped. The marker names its own field, so the failure names it too.
 *
 * **Why the roster is the type's rather than the template's.** Reading the
 * template would answer the narrower question directly, and the only sound reader
 * of one is `agentFieldsReadBy` in the CLI's `__tests__/helpers/template-field-reads.ts`
 * — tested, and carrying two traps (a `\b` boundary that must not split
 * `agentBaseDir`, a first-segment capture that must not read Liquid's `.size` as a
 * field) that are the argument for it having tests at all. It cannot be imported
 * here: `packages/cli` depends on this package and not the other way round.
 * Restating it inline would put an untested extractor in a spec file, which is
 * exactly what this repository's test rules forbid. `Required<AgentConfig>` also
 * covers strictly MORE than the template's roster — a template that starts
 * rendering `agent.domain` tomorrow finds `domain` already poisoned and fails on
 * the day it ships — and the one thing it cannot see, a template reading a name
 * `AgentConfig` does not carry, resolves to nothing at all under
 * `strictVariables: false` and so can carry no author string into the output.
 */

/** Distinguishes a marker from anything the vendored partials happen to contain. */
const POISON_PREFIX = "POISON:"

/**
 * The `agent.*` fields that hold author text, each named as the marker planted in
 * it reports itself.
 *
 * Constrained to `keyof AgentConfig` so a renamed or retired field reddens this
 * line rather than exporting its error to whatever reads the roster.
 */
const POISONED_AGENT_KEYS = [
  "name",
  "title",
  "description",
  "model",
  "effort",
  "tools",
  "disallowedTools",
  "permissionMode",
  "isolation",
  "outputFormat",
  "path",
  "sourceRoot",
  "agentBaseDir",
  "domain",
] as const satisfies readonly (keyof AgentConfig)[]

/**
 * The author strings that sit BELOW a field rather than in it. `hooks` and
 * `experimental` are where all three misses happened, and both are objects — the
 * field itself holds no text, so naming the field in the enumeration is not the
 * same as covering it, and the coverage question is about what is inside.
 */
const POISONED_NESTED_FIELDS = [
  "experimental.cacheTtl",
  "hooks.event",
  "hooks.matcher",
  "hooks.action.type",
  "hooks.action.command",
  "hooks.action.script",
  "hooks.action.prompt",
] as const

type PoisonedField =
  (typeof POISONED_AGENT_KEYS)[number] | (typeof POISONED_NESTED_FIELDS)[number]

const EVERY_POISONED_FIELD: readonly PoisonedField[] = [
  ...POISONED_AGENT_KEYS,
  ...POISONED_NESTED_FIELDS,
]

/** What a field carries before rendering: Liquid delimiters wrapped around its own name. */
const marker = (field: PoisonedField): string => `{{${POISON_PREFIX}${field}}}`

/** What the same marker leaves behind once `sanitizeLiquidSyntax` has taken its delimiters. */
const residue = (field: PoisonedField): string => `${POISON_PREFIX}${field}`

/**
 * {@link marker}, cast into whatever closed vocabulary the field it fills declares.
 *
 * `model`, `effort`, `permissionMode`, `isolation`, `experimental.cacheTtl` and
 * `hooks.action.type` are unions, so a value carrying Liquid syntax is by
 * construction not a member of any of them. That reads as an argument for leaving
 * them out of the sanitiser, and it is wrong in a way worth writing down here,
 * because a reader who checks only the CLI concludes this whole block is dead
 * weight and deletes it.
 *
 * **The CLI route is closed; the browser route is not, and that asymmetry is the
 * subject.** Every one of those fields is enum-validated in
 * `agentYamlConfigSchema` (the CLI's `lib/schemas.ts`), and `loadAgentsFromDir`
 * parses each `metadata.yaml` inside a `try` whose `catch` warns and skips THE
 * WHOLE FILE — so a poisoned `type` does not reach a compiled agent carrying a bad
 * value, it stops that agent being compiled at all. Demonstrated rather than
 * argued: `agentYamlConfigSchema.safeParse` of a definition whose hook action
 * declares `type: "{{POISON:hooks.action.type}}"` answers `success: false` with one
 * issue at path `hooks.SubagentStop.0.hooks.0.type` — `Invalid option: expected one
 * of "command"|"script"|"prompt"`. {@link renderAgent} is also the editor's output
 * preview, reached through `renderAgentFromCorpus` from a browser where none of
 * that has run, so the hole exists on exactly one of the two front doors.
 *
 * Which is why the closed vocabularies are the interesting half. `name`, `title`,
 * `description` and `tools` are `z.string()` on the CLI side too, so both routes
 * reach the renderer with whatever the author wrote; these six are the fields where
 * the two routes DIVERGE, and the only evidence that they diverge is a spec that
 * renders through the browser path.
 */
function poisoned<T extends string>(field: PoisonedField): T {
  // Deliberately invalid test data: the subject is a value the field's own type forbids.
  return marker(field) as T
}

type AgentHooks = NonNullable<AgentConfig["hooks"]>
type HookDefinition = NonNullable<NonNullable<AgentHooks[string]>[number]>
type HookAction = NonNullable<NonNullable<HookDefinition["hooks"]>[number]>

const POISONED_HOOK_ACTION: Required<HookAction> = {
  type: poisoned("hooks.action.type"),
  command: poisoned("hooks.action.command"),
  script: poisoned("hooks.action.script"),
  prompt: poisoned("hooks.action.prompt"),
}

const POISONED_HOOK: Required<HookDefinition> = {
  matcher: poisoned("hooks.matcher"),
  hooks: [POISONED_HOOK_ACTION],
}

const POISONED_EXPERIMENTAL: Required<
  NonNullable<AgentConfig["experimental"]>
> = { cacheTtl: poisoned("experimental.cacheTtl") }

/**
 * One agent definition with author text in every field that can hold it.
 *
 * `Required<AgentConfig>` is doing the binding, and it is the whole reason this is
 * a gate rather than a hand-kept list — the same shape the CLI's
 * `agent-template-reads-its-model.test.ts` uses to hold a roster against the model.
 * `custom` is the one field with no poisoned form: it is a boolean, so no author
 * string can reach the renderer through it.
 */
const POISONED_AGENT: Required<AgentConfig> = {
  name: poisoned("name"),
  title: poisoned("title"),
  description: poisoned("description"),
  model: poisoned("model"),
  effort: poisoned("effort"),
  tools: [poisoned("tools")],
  disallowedTools: [poisoned("disallowedTools")],
  permissionMode: poisoned("permissionMode"),
  isolation: poisoned("isolation"),
  hooks: { [marker("hooks.event")]: [POISONED_HOOK] },
  experimental: POISONED_EXPERIMENTAL,
  outputFormat: poisoned("outputFormat"),
  path: poisoned("path"),
  sourceRoot: poisoned("sourceRoot"),
  agentBaseDir: poisoned("agentBaseDir"),
  domain: poisoned("domain"),
  custom: false,
  skills: [DYNAMIC_SKILL],
}

/**
 * Which corpus entry supplies the partials. Any real sub-agent does — the agent's
 * OWN name is poisoned, and this one only selects the identity and playbook the
 * render wraps around it.
 */
const PARTIALS_FROM = "cli-developer"

/** Somewhere an author string can sit: a string, or a list of them. */
const holdsAuthorText = (value: unknown): boolean =>
  typeof value === "string" ||
  (Array.isArray(value) &&
    value.every((entry: unknown) => typeof entry === "string"))

/**
 * The fields whose markers reach the rendered file, in {@link EVERY_POISONED_FIELD}
 * order.
 *
 * This is the subject guard, and it carries the red for the failure the assertion
 * after it cannot tell from success: a render that stopped emitting the frontmatter
 * at all leaves that assertion comparing an empty list to an empty list, which is
 * the shape every vacuous gate has. The five absent from it — `outputFormat`,
 * `path`, `sourceRoot`, `agentBaseDir`, `domain` — are fields of the definition the
 * template does not read, and a template that starts reading one reddens here first.
 */
const FIELDS_THE_TEMPLATE_RENDERS: readonly PoisonedField[] = [
  "name",
  "title",
  "description",
  "model",
  "effort",
  "tools",
  "disallowedTools",
  "permissionMode",
  "isolation",
  "experimental.cacheTtl",
  "hooks.event",
  "hooks.matcher",
  "hooks.action.type",
  "hooks.action.command",
  "hooks.action.script",
  "hooks.action.prompt",
]

describe("the Liquid syntax a rendered sub-agent must not carry", () => {
  it("poisons every field of the definition that can hold author text", () => {
    const textFields = typedKeys<keyof AgentConfig>(POISONED_AGENT).filter(
      (key) => holdsAuthorText(POISONED_AGENT[key])
    )

    expect(
      [...textFields].sort(),
      "a field added to AgentConfig and filled in with a plain string below is a field this file hands the renderer and never checks"
    ).toStrictEqual([...POISONED_AGENT_KEYS].sort())
  })

  it("plants every marker it names", () => {
    const serialized = JSON.stringify(POISONED_AGENT)

    expect(
      EVERY_POISONED_FIELD.filter((field) =>
        serialized.includes(marker(field))
      ),
      "a named field with no marker in the fixture is checked for a string that was never there"
    ).toStrictEqual(EVERY_POISONED_FIELD)
  })

  it("renders the marker of every field the template reads", async () => {
    const rendered = await renderAgentFromCorpus(PARTIALS_FROM, POISONED_AGENT)

    expect(
      EVERY_POISONED_FIELD.filter((field) => rendered.includes(residue(field))),
      "the template stopped reading a field of the definition, or started reading one nothing sanitises"
    ).toStrictEqual(FIELDS_THE_TEMPLATE_RENDERS)
  })

  it("strips the delimiters off all of them", async () => {
    const rendered = await renderAgentFromCorpus(PARTIALS_FROM, POISONED_AGENT)

    expect(
      EVERY_POISONED_FIELD.filter((field) => rendered.includes(marker(field))),
      "sanitizeCompiledAgentData does not enumerate a field the template renders, so author-controlled Liquid syntax reaches the engine"
    ).toStrictEqual([])
  })
})

/**
 * The file's third subject: the completion gate a writing sub-agent stops
 * against.
 *
 * It reaches the frontmatter through `withCompletionGate` rather than through a
 * branch in the template, and every case here renders through
 * `renderAgentFromCorpus` and asserts on the raw `hooks:` line — the line IS the
 * contract, because Claude Code reads the frontmatter rather than the object the
 * renderer was handed. Nothing below picks that line out of the render: an
 * extractor living in a spec file would need tests of its own before anything it
 * returned could be believed, so the assertions are whole-line `toContain`s
 * anchored on the newline in front of `hooks:`.
 *
 * The gate's own text stays a literal rather than an import of
 * `COMPLETION_GATE_COMMAND`. An assertion that imports the constant the product
 * renders moves with it and so cannot fail; the CLI's `wizard-layout.test.tsx`
 * states that at the top of its own file for the same reason.
 *
 * **The pair that has to stay in one file** is "declares a hook for another
 * event" and "declares its own `Stop`". A refusal pinned on its own cannot tell a
 * correctly scoped guard from one that has swallowed its whole domain, and this
 * gate has already been on the wrong side of exactly that: the template decided
 * it with an `if agent.hooks` / `elsif tools contains Write` pair, so an agent
 * declaring a `PostToolUse` formatter silently lost its gate with every gate in
 * the repository green.
 */

/** A definition holding `Write`, which is the whole of what makes an agent one the gate is for. */
const WRITING_AGENT: AgentConfig = {
  name: "cli-developer",
  title: "CLI Developer Agent",
  description: "Implements CLI features from detailed specs",
  tools: ["Read", "Write"],
  skills: [DYNAMIC_SKILL],
}

/** The same shape with no writing tool — an agent the gate has nothing to say about. */
const READ_ONLY_AGENT: AgentConfig = {
  name: "cli-researcher",
  title: "CLI Researcher Agent",
  description: "Read-only CLI research specialist",
  tools: ["Read", "Grep"],
  skills: [DYNAMIC_SKILL],
}

/** A project's own completion gate: what a declared `Stop` is entitled to replace this one with. */
const DECLARED_GATE_COMMAND = "make check"

/** A hook on an event that has nothing to do with completion, which must not cost an agent its gate. */
const FORMATTER_MATCHER = "Write"
const FORMATTER_COMMAND = "prettier --write"

/**
 * The gate exactly as it renders, byte for byte.
 *
 * Kept as a literal, and deliberately not a `toMatchInlineSnapshot`: snapshotting
 * this alone would mean extracting the line out of the render first, and a
 * snapshot is also the one assertion in the suite a maintainer can retire by
 * running `vitest -u` without reading what changed. A literal has to be edited on
 * purpose. Either way the property is the same — the JSON shape of this record is
 * the frontmatter of every writing agent an install writes, so a change to it that
 * nobody intended rewrites all of them at once.
 */
const GATE_HOOKS_LINE = String.raw`hooks: {"Stop":[{"hooks":[{"type":"command","command":"command -v npm >/dev/null 2>&1 && [ -f package.json ] || exit 0; out=$(npm run --if-present --silent typecheck 2>&1) || { printf '%s\\n' \"$out\" >&2; exit 2; }"}]}]}`

describe("the completion gate a writing sub-agent stops against", () => {
  it("emits the gate for a writing agent that declares nothing", async () => {
    const rendered = await renderAgentFromCorpus("cli-developer", WRITING_AGENT)

    expect(
      rendered,
      "Claude Code converts this key to SubagentStop when it registers a sub-agent's hooks, and consults it under its own name when the agent runs as a main session"
    ).toContain('\nhooks: {"Stop":[')
    expect(
      rendered,
      "a gate that hard-blocked in a project defining no such script would make every sub-agent unstoppable"
    ).toContain("--if-present --silent typecheck")
  })

  it("keeps the gate beside a hook declared for another event", async () => {
    const agent: AgentConfig = {
      ...WRITING_AGENT,
      hooks: {
        PostToolUse: [
          {
            matcher: FORMATTER_MATCHER,
            hooks: [{ type: "command", command: FORMATTER_COMMAND }],
          },
        ],
      },
    }

    const rendered = await renderAgentFromCorpus("cli-developer", agent)

    expect(
      rendered,
      "the merge is per event: declaring a formatter is not declaring a completion gate, and it used to cost the agent one"
    ).toContain(
      `\nhooks: {"PostToolUse":[{"matcher":"${FORMATTER_MATCHER}","hooks":[{"type":"command","command":"${FORMATTER_COMMAND}"}]}],"Stop":[`
    )
    expect(
      rendered,
      "the surviving Stop key has to be the gate rather than anything else that could occupy it"
    ).toContain("--if-present --silent typecheck")
  })

  it("lets a declared Stop hook replace the gate", async () => {
    const agent: AgentConfig = {
      ...WRITING_AGENT,
      hooks: {
        Stop: [
          { hooks: [{ type: "command", command: DECLARED_GATE_COMMAND }] },
        ],
      },
    }

    const rendered = await renderAgentFromCorpus("cli-developer", agent)

    expect(
      rendered,
      "a project stating its own completion gate is the rule this product has always documented"
    ).toContain(
      `\nhooks: {"Stop":[{"hooks":[{"type":"command","command":"${DECLARED_GATE_COMMAND}"}]}]}\n`
    )
    expect(
      rendered,
      "emitting both would run both, which is the opposite of letting a project state its own"
    ).not.toContain("--if-present")
  })

  it("lets a declared SubagentStop hook replace the gate too", async () => {
    const agent: AgentConfig = {
      ...WRITING_AGENT,
      hooks: {
        SubagentStop: [
          { hooks: [{ type: "command", command: DECLARED_GATE_COMMAND }] },
        ],
      },
    }

    const rendered = await renderAgentFromCorpus("cli-developer", agent)

    expect(
      rendered,
      "SubagentStop is the spelling every agent compiled before 2026-09-03 carries, so it is what a project copying its gate out of one will have written"
    ).toContain(
      `\nhooks: {"SubagentStop":[{"hooks":[{"type":"command","command":"${DECLARED_GATE_COMMAND}"}]}]}\n`
    )
    expect(
      rendered,
      "narrowing the check to Stop alone would emit this gate beside the project's own and a sub-agent would run both"
    ).not.toContain("--if-present")
  })

  it("does not let a degenerate empty Stop displace the gate", async () => {
    const agent: AgentConfig = { ...WRITING_AGENT, hooks: { Stop: [] } }

    const rendered = await renderAgentFromCorpus("cli-developer", agent)

    expect(
      rendered,
      'an empty array states no gate, so spreading the declaration over the gate would emit hooks: {"Stop":[]} and lose it to a key that says nothing'
    ).toContain('\nhooks: {"Stop":[{')
    expect(rendered).toContain("--if-present")
  })

  it("emits no hooks key at all for an agent that cannot write", async () => {
    const rendered = await renderAgentFromCorpus(
      "cli-researcher",
      READ_ONLY_AGENT
    )

    expect(
      rendered,
      "the gate is emitted only where it can mean something, and a read-only researcher has nothing to typecheck"
    ).not.toContain("\nhooks:")
  })

  it("renders the gate byte for byte", async () => {
    const rendered = await renderAgentFromCorpus("cli-developer", WRITING_AGENT)

    expect(
      rendered,
      "this record is the hooks frontmatter of every writing agent an install writes, so an unintended change to its shape rewrites all of them at once"
    ).toContain(`\n${GATE_HOOKS_LINE}\n`)
  })
})

/**
 * The file's fourth subject, which is its second and third meeting: a writing
 * agent's OWN declared hooks, sanitised while the gate is composed beside them.
 *
 * The poison suite above cannot reach this. Its fixture's `tools` is a single
 * poisoned string, so the definition holds neither `Write` nor `Edit`,
 * `withCompletionGate` returns it untouched, and every one of its hook
 * assertions runs on the branch where no gate exists. A fixture cannot test a
 * branch it does not enter — so the composition path, which is the one every
 * shipped writing agent takes, had no coverage of its own.
 *
 * Both branches of `withCompletionGate` are pinned here because they hand the
 * sanitiser different records. A declared `PostToolUse` SURVIVES: the record
 * reaching `sanitizeHooks` is the author's entry plus the gate's, and the walk
 * has to cover both. A declared `Stop` REPLACES: the gate is never composed and
 * the record is the author's alone. Neither assertion means anything without the
 * other — one of them is a permitted case and the other a refusal, and a refusal
 * pinned by itself cannot tell a correctly scoped guard from one that swallowed
 * its domain.
 *
 * The markers, the residues and the poisoned hook fixture are the poison suite's
 * own, reused rather than restated: one vocabulary for one claim, and a hook
 * field renamed on `AgentHookAction` reddens in one place.
 */

/**
 * The hook fields `sanitizeHooks` enumerates below the event key.
 *
 * Read off the function against `AgentHookDefinition` and `AgentHookAction`
 * rather than remembered: the definition declares exactly `matcher` and `hooks`,
 * an action exactly `type`, `command`, `script` and `prompt`, and all six are
 * named in the enumeration. Nothing rides the `...definition` / `...action`
 * spreads uncovered as the types stand.
 */
const SANITISED_HOOK_FIELDS: readonly PoisonedField[] = [
  "hooks.matcher",
  "hooks.action.type",
  "hooks.action.command",
  "hooks.action.script",
  "hooks.action.prompt",
]

/**
 * The same fields plus the event key, which only a hook whose event is NOT a
 * completion event can carry — a key the sanitiser would have to repair is by
 * construction not the `Stop` that `declaresOwnGate` matches on.
 */
const SANITISED_HOOK_FIELDS_WITH_EVENT: readonly PoisonedField[] = [
  "hooks.event",
  ...SANITISED_HOOK_FIELDS,
]

describe("the Liquid syntax an author's own hooks must not carry", () => {
  it("strips a declared hook the gate is composed beside", async () => {
    const agent: AgentConfig = {
      ...WRITING_AGENT,
      hooks: { [marker("hooks.event")]: [POISONED_HOOK] },
    }

    const rendered = await renderAgentFromCorpus("cli-developer", agent)

    expect(
      rendered,
      "the case is only the composition case while the gate is actually beside the declared hook"
    ).toContain("--if-present --silent typecheck")
    expect(
      SANITISED_HOOK_FIELDS_WITH_EVENT.filter((field) =>
        rendered.includes(residue(field))
      ),
      "a declared hook that never reached the frontmatter would satisfy the assertion below for free"
    ).toStrictEqual(SANITISED_HOOK_FIELDS_WITH_EVENT)
    expect(
      SANITISED_HOOK_FIELDS_WITH_EVENT.filter((field) =>
        rendered.includes(marker(field))
      ),
      "composing the gate into an agent's hooks must not carry the author's own entries past the sanitiser"
    ).toStrictEqual([])
  })

  it("strips a declared Stop hook that replaces the gate", async () => {
    const agent: AgentConfig = {
      ...WRITING_AGENT,
      hooks: { Stop: [POISONED_HOOK] },
    }

    const rendered = await renderAgentFromCorpus("cli-developer", agent)

    expect(
      rendered,
      "the case is only the replacement case while the declared hook has actually displaced the gate"
    ).not.toContain("--if-present")
    expect(
      SANITISED_HOOK_FIELDS.filter((field) =>
        rendered.includes(residue(field))
      ),
      "a declared hook that never reached the frontmatter would satisfy the assertion below for free"
    ).toStrictEqual(SANITISED_HOOK_FIELDS)
    expect(
      SANITISED_HOOK_FIELDS.filter((field) => rendered.includes(marker(field))),
      "the branch that returns the definition untouched must still hand the author's hooks to the sanitiser"
    ).toStrictEqual([])
  })
})
