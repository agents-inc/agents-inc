/**
 * `tools:` is an allowlist, so every compiled sub-agent needs `Skill` to invoke a skill. `"Skill"`
 * stays a literal so the assertion can fail when the renderer's constant moves.
 */

import { describe, expect, it } from "vitest"

import {
  buildAgentTemplateContext,
  renderAgent,
  type AgentFiles,
} from "./agent-source"
import { createEngineFromTemplates } from "./engine"
import { CORPUS_CLI_VERSION, CORPUS_TEMPLATES } from "./generated/corpus"
import { renderAgentFromCorpus } from "./preview"
import type { AgentConfig } from "./types"
import { typedKeys } from "./typed-object"
import {
  buildAgentConfig,
  buildSkill,
} from "./__tests__/factories/agent-config-factories"

const NO_FILES: AgentFiles = {
  identity: "",
  playbook: "",
  output: "",
  criticalRequirementsTop: "",
  criticalReminders: "",
}

const DYNAMIC_SKILL = buildSkill("meta-design-expressive-typescript", {
  preloaded: false,
})

const PRELOADED_SKILL = buildSkill("cli-framework-oclif-ink", {
  preloaded: true,
})

describe("the tools a compiled sub-agent is granted", () => {
  it("adds Skill to a definition whose metadata omits it", () => {
    const agent = buildAgentConfig("cli-developer", {
      tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
      skills: [DYNAMIC_SKILL],
    })

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
    const agent = buildAgentConfig("cli-researcher", {
      tools: ["Read", "Grep", "Glob", "Bash"],
      skills: [DYNAMIC_SKILL],
    })

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
    const agent = buildAgentConfig("cli-developer", {
      tools: ["Read", "Bash"],
      skills: [PRELOADED_SKILL],
    })

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
    const agent = buildAgentConfig("cli-developer", {
      tools: ["Read", "Bash"],
      skills: [],
    })

    const { agent: granted } = buildAgentTemplateContext(
      "cli-developer",
      agent,
      NO_FILES
    )

    expect(granted.tools).toStrictEqual(["Read", "Bash", "Skill"])
  })

  it("names Skill once and leaves the declared order alone", () => {
    const agent = buildAgentConfig("cli-developer", {
      tools: ["Read", "Skill", "Bash"],
      skills: [DYNAMIC_SKILL],
    })

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
    const agent = buildAgentConfig("cli-developer", {
      model: "opus",
      effort: "high",
      disallowedTools: ["WebFetch"],
      permissionMode: "default",
      path: "developer/cli-developer",
      tools: ["Read", "Bash"],
      skills: [DYNAMIC_SKILL],
    })

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
    const agent = buildAgentConfig("cli-developer", {
      tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
      skills: [DYNAMIC_SKILL],
    })

    const rendered = await renderAgentFromCorpus("cli-developer", agent)

    expect(rendered).toContain(
      "\ntools: Read, Write, Edit, Grep, Glob, Bash, Skill\n"
    )
  })

  it("names Skill on a read-only researcher's tools line", async () => {
    const agent = buildAgentConfig("cli-researcher", {
      tools: ["Read", "Grep", "Glob", "Bash"],
      skills: [DYNAMIC_SKILL],
    })

    const rendered = await renderAgentFromCorpus("cli-researcher", agent)

    expect(rendered).toContain("\ntools: Read, Grep, Glob, Bash, Skill\n")
  })
})

/**
 * `Required<AgentConfig>`, so a field added to the type and forgotten here fails `tsc`. Each
 * field's marker names it if its delimiters survive.
 */

const POISON_PREFIX = "POISON:"

/** Constrained to `keyof AgentConfig`, so a renamed field reddens here. */
const POISONED_AGENT_KEYS = [
  "name",
  "title",
  "description",
  "model",
  "codexModel",
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

/** Author strings inside object fields: naming `hooks` or `experimental` does not cover them. */
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

const marker = (field: PoisonedField): string => `{{${POISON_PREFIX}${field}}}`

const residue = (field: PoisonedField): string => `${POISON_PREFIX}${field}`

/** The editor's preview reaches {@link renderAgent} without the CLI's schemas. */
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

/** `custom` is a boolean, so it has no poisoned form. */
const POISONED_AGENT: Required<AgentConfig> = {
  name: poisoned("name"),
  title: poisoned("title"),
  description: poisoned("description"),
  model: poisoned("model"),
  codexModel: poisoned("codexModel"),
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

/** Any real sub-agent: it only supplies the partials wrapped around the poisoned agent. */
const PARTIALS_FROM = "cli-developer"

const holdsAuthorText = (value: unknown): boolean =>
  typeof value === "string" ||
  (Array.isArray(value) &&
    value.every((entry: unknown) => typeof entry === "string"))

// Subject guard: a render that lost its frontmatter would compare two empty lists.
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
 * The raw `hooks:` line Claude Code reads; the command stays a literal. A refusal alone cannot tell
 * a scoped guard from one that swallowed its domain, so both cases stay together.
 */

/** `Write` is what makes an agent one the gate is for. */
const WRITING_AGENT = buildAgentConfig("cli-developer", {
  tools: ["Read", "Write"],
  skills: [DYNAMIC_SKILL],
})

const READ_ONLY_AGENT = buildAgentConfig("cli-researcher", {
  tools: ["Read", "Grep"],
  skills: [DYNAMIC_SKILL],
})

const DECLARED_GATE_COMMAND = "make check"

/** A non-completion hook, which must not cost an agent its gate. */
const FORMATTER_MATCHER = "Write"
const FORMATTER_COMMAND = "prettier --write"

/** A literal: the frontmatter of every writing agent an install writes. */
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

/** A declared `PostToolUse` survives beside the gate; a declared `Stop` replaces it. */

/** Every field `sanitizeHooks` enumerates below the event key; none rides a spread uncovered. */
const SANITISED_HOOK_FIELDS: readonly PoisonedField[] = [
  "hooks.matcher",
  "hooks.action.type",
  "hooks.action.command",
  "hooks.action.script",
  "hooks.action.prompt",
]

/** Plus the event key, which only a non-completion hook can carry. */
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

/**
 * `@@SOURCE_FOLDER@@` stays a literal: it is a contract with the shipped `.md` files.
 */

const SOURCE_FOLDER_TOKEN = "@@SOURCE_FOLDER@@"
const SOURCE_FOLDER_ESCAPE = `\\${SOURCE_FOLDER_TOKEN}`

/** Test data, not the product's own constant. */
const AN_INSTALL_FOLDER = ".agents-inc/claude"

function partialsSaying(line: string): AgentFiles {
  return { ...NO_FILES, playbook: line }
}

function renderedWith(
  files: AgentFiles,
  globals: Readonly<Record<string, string>>
): Promise<string> {
  return renderAgent(
    createEngineFromTemplates(CORPUS_TEMPLATES, globals),
    buildAgentTemplateContext("cli-developer", WRITING_AGENT, files),
    CORPUS_CLI_VERSION
  )
}

describe("the source folder a partial names", () => {
  it("is the folder the engine carries", async () => {
    const rendered = await renderedWith(
      partialsSaying(`Author into \`${SOURCE_FOLDER_TOKEN}/agents/\`.`),
      { sourceFolder: AN_INSTALL_FOLDER }
    )

    expect(
      rendered,
      "the opted-in token was not substituted, so an agent is told to author into a folder no install has"
    ).toContain(`Author into \`${AN_INSTALL_FOLDER}/agents/\`.`)
  })

  it("refuses to compile when the partial asks for a folder the engine cannot name", async () => {
    await expect(
      renderedWith(
        partialsSaying(`Author into \`${SOURCE_FOLDER_TOKEN}/agents/\`.`),
        {}
      ),
      "a partial asking for the folder compiled under an engine naming none, so the name went to an empty string and the agent carries a path belonging to no installation"
    ).rejects.toThrow(SOURCE_FOLDER_TOKEN)
  })

  it("compiles an escaped token under that same engine, because it asks for no folder", async () => {
    const rendered = await renderedWith(
      partialsSaying(`The token is \`${SOURCE_FOLDER_ESCAPE}\`.`),
      {}
    )

    expect(
      rendered,
      "the escape was read as a request for the folder, so the paragraph that teaches an author to write the token cannot be written at all"
    ).toContain(`The token is \`${SOURCE_FOLDER_TOKEN}\`.`)
  })
})
