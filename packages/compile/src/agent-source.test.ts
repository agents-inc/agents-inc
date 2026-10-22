/**
 * `tools:` is an allowlist, so every compiled sub-agent needs `Skill` to invoke a skill. `"Skill"`
 * stays a literal so the assertion can fail when the renderer's constant moves.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  buildAgentTemplateContext,
  hasCodexRoleMarker,
  hasProvenanceMarker,
  pluginRefFor,
  provenanceMarker,
  renderAgent,
  sanitizeCompiledAgentData,
  sanitizeLiquidSyntax,
  stampProvenanceMarker,
  type AgentFiles,
} from "./agent-source"
import { seatDiagnostics } from "./diagnostics"
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
 * The raw `hooks:` line Claude Code reads. Each expected line ends at its newline, so a key composed
 * beside a declaration fails the match.
 */

const WRITING_AGENT = buildAgentConfig("cli-developer", {
  tools: ["Read", "Write"],
  skills: [DYNAMIC_SKILL],
})

const EDITING_AGENT = buildAgentConfig("cli-developer", {
  tools: ["Read", "Edit"],
  skills: [DYNAMIC_SKILL],
})

const READ_ONLY_AGENT = buildAgentConfig("cli-researcher", {
  tools: ["Read", "Grep"],
  skills: [DYNAMIC_SKILL],
})

const DECLARED_STOP_COMMAND = "make check"

const FORMATTER_MATCHER = "Write"
const FORMATTER_COMMAND = "prettier --write"

describe("the hooks a compiled sub-agent carries", () => {
  it.each([
    ["writes files", "cli-developer", WRITING_AGENT],
    ["edits files", "cli-developer", EDITING_AGENT],
    ["cannot write", "cli-researcher", READ_ONLY_AGENT],
  ] as const)(
    "are none for an agent that %s and declares none",
    async (_tools, name, agent) => {
      const rendered = await renderAgentFromCorpus(name, agent)

      expect(
        rendered,
        "the compile step adds no hook of its own: a check an agent should run is asked for in its prompt"
      ).not.toContain("\nhooks:")
    }
  )

  it("are exactly the hooks an agent declares for another event", async () => {
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
      "a Stop key composed beside a declared formatter runs a check nobody declared"
    ).toContain(
      `\nhooks: {"PostToolUse":[{"matcher":"${FORMATTER_MATCHER}","hooks":[{"type":"command","command":"${FORMATTER_COMMAND}"}]}]}\n`
    )
  })

  it.each(["Stop", "SubagentStop"])(
    "are exactly a %s hook the agent declares",
    async (event) => {
      const agent: AgentConfig = {
        ...WRITING_AGENT,
        hooks: {
          [event]: [
            { hooks: [{ type: "command", command: DECLARED_STOP_COMMAND }] },
          ],
        },
      }

      const rendered = await renderAgentFromCorpus("cli-developer", agent)

      expect(
        rendered,
        "a stop hook the agent declares reaches Claude Code as written"
      ).toContain(
        `\nhooks: {"${event}":[{"hooks":[{"type":"command","command":"${DECLARED_STOP_COMMAND}"}]}]}\n`
      )
    }
  )
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

describe("the source folder a partial asks for beside an escaped mention", () => {
  it("still refuses to compile under an engine naming no folder", async () => {
    await expect(
      renderedWith(
        partialsSaying(
          `The token is \`${SOURCE_FOLDER_ESCAPE}\`; author into \`${SOURCE_FOLDER_TOKEN}/agents/\`.`
        ),
        {}
      ),
      "one escaped mention made the whole partial read as asking for no folder"
    ).rejects.toThrow(
      "A partial names the install's source folder (@@SOURCE_FOLDER@@) and the engine rendering " +
        "it carries no 'sourceFolder' global, so the name would compile away to nothing."
    )
  })
})

/** A literal: the first body line of every compiled sub-agent. */
const PROVENANCE_MARKER =
  "<!-- Generated by agents-inc — do not edit; compile rewrites this file -->"

/** What an older compile stamped: the same opening and closing, other words between. */
const OLDER_STAMP = "<!-- Generated by agents-inc v0.1.0 -->"

const FRONTMATTER = "---\nname: cli-developer\n---"

describe("the provenance marker", () => {
  it("names the plugin and says the file is rewritten by compile", () => {
    expect(provenanceMarker()).toBe(PROVENANCE_MARKER)
  })
})

describe("hasProvenanceMarker", () => {
  it("finds the marker on the first line after the frontmatter", () => {
    expect(
      hasProvenanceMarker(`${FRONTMATTER}\n${PROVENANCE_MARKER}\n# Body`)
    ).toBe(true)
  })

  it("finds the marker on the first line of a file with no frontmatter", () => {
    expect(hasProvenanceMarker(`${PROVENANCE_MARKER}\n# Body`)).toBe(true)
  })

  it("finds the marker after an empty frontmatter", () => {
    expect(hasProvenanceMarker(`---\n---\n${PROVENANCE_MARKER}`)).toBe(true)
  })

  it("recognises an older compile's stamp", () => {
    expect(hasProvenanceMarker(`${FRONTMATTER}\n${OLDER_STAMP}`)).toBe(true)
  })

  it("does not claim a file that quotes the marker further down", () => {
    expect(
      hasProvenanceMarker(`${FRONTMATTER}\n# Body\n${PROVENANCE_MARKER}`)
    ).toBe(false)
  })

  it("does not claim a line that opens like the marker but never closes", () => {
    expect(
      hasProvenanceMarker(
        `${FRONTMATTER}\n<!-- Generated by agents-inc, by hand`
      )
    ).toBe(false)
  })

  it("does not claim a file whose frontmatter has nothing after it", () => {
    expect(hasProvenanceMarker(FRONTMATTER)).toBe(false)
  })
})

/** A literal: the line a Codex role's instructions open on. */
const CODEX_OPENER = 'developer_instructions = """'

describe("hasCodexRoleMarker", () => {
  it("finds the marker right after the instructions opener", () => {
    expect(
      hasCodexRoleMarker(
        `name = "cli-developer"\n${CODEX_OPENER}\n${PROVENANCE_MARKER}\n# Body\n"""`
      )
    ).toBe(true)
  })

  it("does not claim a role whose marker sits further down", () => {
    expect(
      hasCodexRoleMarker(
        `name = "cli-developer"\n${CODEX_OPENER}\n# Body\n${PROVENANCE_MARKER}\n"""`
      )
    ).toBe(false)
  })

  it("does not claim a file with no opener, even one that starts with the marker", () => {
    expect(
      hasCodexRoleMarker(`${PROVENANCE_MARKER}\nname = "cli-developer"`)
    ).toBe(false)
  })

  it("does not claim a role that ends at its opener", () => {
    expect(hasCodexRoleMarker(`name = "cli-developer"\n${CODEX_OPENER}`)).toBe(
      false
    )
  })
})

describe("stampProvenanceMarker", () => {
  it("puts the marker between the frontmatter and the body", () => {
    expect(stampProvenanceMarker(`${FRONTMATTER}\n# Body`)).toBe(
      `${FRONTMATTER}\n${PROVENANCE_MARKER}\n# Body`
    )
  })

  it("puts the marker on line one of a file with no frontmatter", () => {
    expect(stampProvenanceMarker("# Body")).toBe(`${PROVENANCE_MARKER}\n# Body`)
  })

  it("replaces an older stamp rather than stacking a second", () => {
    expect(
      stampProvenanceMarker(`${FRONTMATTER}\n${OLDER_STAMP}\n# Body`)
    ).toBe(`${FRONTMATTER}\n${PROVENANCE_MARKER}\n# Body`)
  })
})

const MARKETPLACE_SKILL = buildSkill("web-framework-react", {
  preloaded: true,
  source: "agents-inc",
})

describe("pluginRefFor", () => {
  it("refers to a marketplace skill through its plugin", () => {
    expect(pluginRefFor(MARKETPLACE_SKILL)).toStrictEqual({
      pluginRef: "web-framework-react:web-framework-react",
    })
  })

  it("gives an ejected skill no plugin reference", () => {
    expect(
      pluginRefFor({ ...MARKETPLACE_SKILL, source: "eject" })
    ).toStrictEqual({})
  })

  it("gives a skill with no source no plugin reference", () => {
    expect(pluginRefFor(PRELOADED_SKILL)).toStrictEqual({})
  })
})

describe("the skills a sub-agent's template is handed", () => {
  let verbose: string[]

  beforeEach(() => {
    verbose = []
    seatDiagnostics({
      warn: () => undefined,
      verbose: (message) => verbose.push(message),
    })
  })

  afterEach(() => {
    seatDiagnostics({ warn: () => undefined, verbose: () => undefined })
  })

  const PLUGIN_PRELOADED = buildSkill("web-framework-react", {
    preloaded: true,
    pluginRef: "web-framework-react:web-framework-react",
  })

  const agent = buildAgentConfig("cli-developer", {
    tools: ["Read"],
    skills: [PLUGIN_PRELOADED, DYNAMIC_SKILL, PRELOADED_SKILL],
  })

  it("splits preloaded from dynamic in declared order, naming a plugin skill by its reference", () => {
    const context = buildAgentTemplateContext("cli-developer", agent, NO_FILES)

    expect({
      preloadedSkills: context.preloadedSkills,
      dynamicSkills: context.dynamicSkills,
      preloadedSkillIds: context.preloadedSkillIds,
    }).toStrictEqual({
      preloadedSkills: [PLUGIN_PRELOADED, PRELOADED_SKILL],
      dynamicSkills: [DYNAMIC_SKILL],
      preloadedSkillIds: [
        "web-framework-react:web-framework-react",
        "cli-framework-oclif-ink",
      ],
    })
  })

  it("reports the split in verbose diagnostics", () => {
    buildAgentTemplateContext("cli-developer", agent, NO_FILES)

    expect(verbose).toStrictEqual([
      "Skills for cli-developer: 2 preloaded, 1 dynamic",
    ])
  })
})

const strippedFrom = (field: string): string =>
  `Stripped Liquid template syntax from '${field}' — possible template injection attempt`

describe("sanitizeLiquidSyntax", () => {
  let warnings: string[]

  beforeEach(() => {
    warnings = []
    seatDiagnostics({
      warn: (message) => warnings.push(message),
      verbose: () => undefined,
    })
  })

  afterEach(() => {
    seatDiagnostics({ warn: () => undefined, verbose: () => undefined })
  })

  it("hands back text with no delimiters as it came, and says nothing", () => {
    expect(sanitizeLiquidSyntax("A careful reviewer", "agent.title")).toBe(
      "A careful reviewer"
    )
    expect(warnings).toStrictEqual([])
  })

  it("removes every delimiter, keeps the words between them, and names the field", () => {
    expect(
      sanitizeLiquidSyntax("{{ title }} and {% raw %}", "agent.title")
    ).toBe(" title  and  raw ")
    expect(warnings).toStrictEqual([strippedFrom("agent.title")])
  })

  it("names each field it strips, in the order the agent's fields render", async () => {
    await renderAgentFromCorpus(PARTIALS_FROM, POISONED_AGENT)

    expect(warnings).toStrictEqual(
      [
        "agent.name",
        "agent.title",
        "agent.description",
        "agent.tools",
        "agent.disallowedTools",
        "agent.model",
        "agent.effort",
        "agent.permissionMode",
        "agent.isolation",
        "agent.experimental.cacheTtl",
        "hook.event",
        "hook.matcher",
        "hook.type",
        "hook.command",
        "hook.script",
        "hook.prompt",
      ].map(strippedFrom)
    )
  })

  it("names each skill field it strips, once for every list the skill sits in", () => {
    const injected = buildSkill(poisoned("name"), {
      preloaded: true,
      description: marker("description"),
      usage: marker("title"),
      pluginRef: poisoned("path"),
    })
    const data = buildAgentTemplateContext(
      "cli-developer",
      buildAgentConfig("cli-developer", {
        tools: ["Read"],
        skills: [injected],
      }),
      NO_FILES
    )

    const sanitized = sanitizeCompiledAgentData(data)

    expect(sanitized.preloadedSkills).toStrictEqual([
      {
        ...injected,
        id: residue("name"),
        description: residue("description"),
        usage: residue("title"),
        pluginRef: residue("path"),
      },
    ])
    expect(sanitized.preloadedSkillIds).toStrictEqual([residue("path")])
    expect(warnings).toStrictEqual(
      [
        "skill.id",
        "skill.description",
        "skill.usage",
        "skill.pluginRef",
        "skill.id",
        "skill.description",
        "skill.usage",
        "skill.pluginRef",
        "preloadedSkillId",
      ].map(strippedFrom)
    )
  })
})
