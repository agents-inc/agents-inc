/**
 * What an install writes, written down once, as data.
 *
 * The renderers in this package produce the two files every installed root
 * carries, and two surfaces now read them: the CLI's write path, which puts
 * them on disk, and the editor's output preview, which draws them in a browser.
 * These scenarios are what holds those two to one answer — the arrangement
 * `contract/selection-scenarios.ts` in `@workspace/matrix` already uses for the
 * selection semantics, and for the reason recorded there: two implementations
 * of one question do not stay in agreement on their own.
 *
 * Nothing here imports either side. A scenario is a configuration and the exact
 * bytes it must produce, and `emission-scenarios.test.ts` beside this file is the
 * ONE runner that maps an API onto those fields.
 *
 * One rather than two, which is worth writing down because the arrangement this
 * copies has three. `packages/cli/e2e/lifecycle/preview-matches-install.e2e.test.ts`
 * checks the same subject from the other end — it installs for real and holds what
 * landed on disk against these renderers — but it drives none of the scenarios
 * below and cannot: this module is absent from the package's `exports` map and off
 * the barrel, where `@workspace/matrix` re-exports `contract/selection-scenarios`
 * from its `src/index.ts` and three runners reach `SELECTION_SCENARIOS` through it.
 * So a scenario added below buys coverage on this side alone.
 *
 * **The expected bytes were the CLI's**, captured from `generateConfigSource`
 * and `generateConfigTypesSource` as they stood before the extraction moved
 * them here — which is what made this a contract rather than a snapshot of
 * whatever the package happens to do: the extraction was correct only if the
 * bytes did not move, and a scenario going red said they had.
 *
 * That held until 2026-08-26, when an owner ruling moved the format: both files
 * an install writes now land ALREADY FORMATTED, as a fixed point of the
 * prettier settings named in `emission-scenarios.test.ts` as
 * `INSTALLED_SOURCE_FORMAT`. The bytes below were re-captured from the
 * renderers on that date and the extraction-fidelity claim above is true up to
 * it and no further. What still keeps this from being a snapshot of itself is
 * the second property that test asserts: prettier, run over what the emitters
 * produce, has to hand it back unchanged — so a golden re-captured from a
 * renderer that has gone wrong disagrees with prettier and fails there.
 *
 * Every scenario renders against the built-in public catalogue, which both
 * sides seat — the editor draws against the catalogue it shipped with, and the
 * matrix is a parameter of every renderer here precisely so neither side can
 * silently reach a different one. A visitor's locally-authored skills are not
 * in that catalogue, and the preview says so rather than covering it.
 *
 * The scenarios deliberately do not carry a `SeedPayload`. The renderers this
 * package owns take a `ProjectConfig`; turning a payload into one runs
 * `buildInstallConfig` and `mergeWithExistingConfig`, both of which read disk
 * and both of which stay in the CLI. A payload-keyed scenario would name an
 * input this package cannot consume.
 *
 * The configurations below are written out rather than built from a factory,
 * for the reason `selection-scenarios.ts` writes its selections out: a contract
 * module IS the single declaration, so a factory between it and the reader
 * would put a second thing in the way of seeing what produced these bytes. The
 * CLI's own test factories are not reachable from here in any case — the
 * dependency runs the other way — and a copy of them in this package would be
 * exactly the second implementation the file exists to prevent.
 */

import type { AgentName, ProjectConfig } from "../index"

/**
 * Where each emitted file lands, relative to the root it is written under. A
 * root is a base directory — the user's home, or a project directory — and the
 * config pair lives in its `.claude-src/`, never in its `.claude/`.
 */
export const CONFIG_TS = ".claude-src/config.ts"
export const CONFIG_TYPES_TS = ".claude-src/config-types.ts"

export type EmissionScenario = {
  id: string
  // Phrased as the behaviour a test name would describe.
  title: string
  // Which writer the root selects. `"global"` renders standalone; `"project"`
  // renders the inlined-global form and carries the `globalConfig` it inlines.
  root: "global" | "project"
  // The configuration being written.
  config: ProjectConfig
  // The global root's configuration, for a project root that inlines it.
  globalConfig?: ProjectConfig
  // The sub-agent roster the types half is generated against. The CLI walks
  // `src/agents/` for it; a browser has no such directory, so it travels here.
  agentNames: readonly AgentName[]
  // Destination path relative to the root, mapped to the exact bytes written
  // there. This is the whole emission for the scenario: a renderer that writes
  // a third file fails it just as one that writes different bytes does.
  expected: Record<string, string>
  why: string
}

const REACT = "web-framework-react"
const TAILWIND = "web-styling-tailwind"
const ZUSTAND = "web-state-zustand"
const VITEST = "web-testing-vitest"

/** The public catalogue's own name, which is what an unejected skill's `origin` holds. */
const AGENTS_INC = "agents-inc"

const WEB_DEVELOPER = "web-developer"
const API_DEVELOPER = "api-developer"

const CONFIG_TYPES_INTERFACE = `

export interface ProjectConfig {
  /** Project/plugin name (kebab-case) */
  name: string

  /** Project description */
  description?: string

  /** Per-agent configuration with scope */
  agents: AgentScopeConfig[]

  /** Per-skill configuration with scope and provenance */
  skills: SkillConfig[]

  /** Author handle (e.g., "@vince") */
  author?: string

  /** Stack configuration: agent -> category -> skill assignment */
  stack?: Partial<Record<ProjectAgentName, StackAgentConfig>>

  /** The marketplace this install reads skills from, as a path or URL */
  marketplace?: string

  /** The name that marketplace's manifest gives it, which plugins are registered under */
  marketplaceName?: string

  /** Agents source path or URL (when agents come from a different source than skills) */
  agentsSource?: string

  /** Selected domains from the wizard */
  selectedDomains?: Domain[]

  /** Tracked project installation paths (global config only) */
  projects?: string[]
}
`

/**
 * The type import both multi-alias config.ts scenarios open with. Broken one
 * specifier per line because the single-line form is 108 columns wide, which is
 * past the print width the pair is formatted to.
 */
const FULL_TYPE_IMPORT = `import type {
  ProjectConfig,
  ProjectAgentName,
  AgentScopeConfig,
  SkillConfig,
  StackAgentConfig,
} from './config-types'`

const EMPTY_ROOT_CONFIG_TS = `import type { ProjectConfig } from './config-types'

export default {
  name: 'empty-root',
  agents: [],
  skills: [],
} satisfies ProjectConfig
`

const EMPTY_ROOT_CONFIG_TYPES_TS =
  `// AUTO-GENERATED by agents-inc — DO NOT EDIT

export type SkillId = never

export type AgentName = never

export type SelectedAgentName = AgentName

export type ProjectAgentName = SelectedAgentName

export type Domain = never

export type Category = never

export type InstallMode = 'eject' | 'plugin' | 'mixed'

export type SkillConfig = {
  id: SkillId
  scope: 'project' | 'global'
  origin: string
  excluded?: boolean
}

export type AgentScopeConfig = {
  name: AgentName
  scope: 'project' | 'global'
  model?: 'sonnet' | 'opus' | 'haiku' | 'fable' | 'inherit'
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  excluded?: boolean
}

export type SkillAssignment<S extends SkillId = SkillId> = S | { id: S; preloaded: boolean }

export type StackAgentConfig = Partial<Record<Category, SkillAssignment | SkillAssignment[]>>` +
  CONFIG_TYPES_INTERFACE

const LONG_SCALARS_CONFIG_TS = `import type { ProjectConfig } from './config-types'

export default {
  name: 'long-scalars',
  description:
    'a description written long enough that its value cannot sit beside the key naming it',
  agents: [],
  skills: [],
  marketplace: '/a/deliberately/long/marketplace/path/that/pushes/its/value/below/its/own/key',
} satisfies ProjectConfig
`

const HYPHENATED_KEYS_CONFIG_TS = `${FULL_TYPE_IMPORT}

const skills: SkillConfig[] = [{ id: 'web-framework-react', scope: 'global', origin: 'agents-inc' }]

const agents: AgentScopeConfig[] = [{ name: 'web-developer', scope: 'global' }]

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'web-developer': { 'web-framework': 'web-framework-react' },
}

export default {
  name: 'hyphenated-keys',
  agents,
  skills,
  stack,
} satisfies ProjectConfig
`

const HYPHENATED_KEYS_CONFIG_TYPES_TS =
  `// AUTO-GENERATED by agents-inc — DO NOT EDIT

export type SkillId = 'web-framework-react'

export type AgentName = 'web-developer'

export type SelectedAgentName = 'web-developer'

export type ProjectAgentName = SelectedAgentName

export type Domain = 'web'

export type Category = 'web-framework'

export type InstallMode = 'eject' | 'plugin' | 'mixed'

export type SkillConfig = {
  id: SkillId
  scope: 'project' | 'global'
  origin: string
  excluded?: boolean
}

export type AgentScopeConfig = {
  name: AgentName
  scope: 'project' | 'global'
  model?: 'sonnet' | 'opus' | 'haiku' | 'fable' | 'inherit'
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  excluded?: boolean
}

export type SkillAssignment<S extends SkillId = SkillId> = S | { id: S; preloaded: boolean }

export type StackAgentConfig = {
  'web-framework'?: SkillAssignment<'web-framework-react'>
}` + CONFIG_TYPES_INTERFACE

const STACK_ORDERING_CONFIG_TS = `${FULL_TYPE_IMPORT}

const skills: SkillConfig[] = [
  { id: 'web-framework-react', scope: 'global', origin: 'agents-inc' },
  { id: 'web-styling-tailwind', scope: 'global', origin: 'agents-inc' },
  { id: 'web-state-zustand', scope: 'global', origin: 'agents-inc' },
  { id: 'web-testing-vitest', scope: 'global', origin: 'agents-inc' },
]

const agents: AgentScopeConfig[] = [
  { name: 'web-developer', scope: 'global' },
  { name: 'api-developer', scope: 'global' },
]

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'api-developer': {
    'web-client-state': 'web-state-zustand',
    'web-testing': ['web-testing-vitest'],
  },
  'web-developer': {
    'web-framework': 'web-framework-react',
    'web-styling': ['web-styling-tailwind'],
  },
}

export default {
  name: 'stack-ordering',
  agents,
  skills,
  stack,
} satisfies ProjectConfig
`

const STACK_ORDERING_CONFIG_TYPES_TS =
  `// AUTO-GENERATED by agents-inc — DO NOT EDIT

export type SkillId =
  'web-framework-react' | 'web-state-zustand' | 'web-styling-tailwind' | 'web-testing-vitest'

export type AgentName = 'api-developer' | 'web-developer'

export type SelectedAgentName = 'web-developer' | 'api-developer'

export type ProjectAgentName = SelectedAgentName

export type Domain = 'web'

export type Category = 'web-client-state' | 'web-framework' | 'web-styling' | 'web-testing'

export type InstallMode = 'eject' | 'plugin' | 'mixed'

export type SkillConfig = {
  id: SkillId
  scope: 'project' | 'global'
  origin: string
  excluded?: boolean
}

export type AgentScopeConfig = {
  name: AgentName
  scope: 'project' | 'global'
  model?: 'sonnet' | 'opus' | 'haiku' | 'fable' | 'inherit'
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  excluded?: boolean
}

export type SkillAssignment<S extends SkillId = SkillId> = S | { id: S; preloaded: boolean }

export type StackAgentConfig = {
  'web-client-state'?: SkillAssignment<'web-state-zustand'>
  'web-framework'?: SkillAssignment<'web-framework-react'>
  'web-styling'?: SkillAssignment<'web-styling-tailwind'>[]
  'web-testing'?: SkillAssignment<'web-testing-vitest'>[]
}` + CONFIG_TYPES_INTERFACE

const EXCLUSIVE_CATEGORY_CONFIG_TS = `${FULL_TYPE_IMPORT}

const skills: SkillConfig[] = [
  { id: 'web-framework-react', scope: 'global', origin: 'agents-inc' },
  { id: 'web-styling-tailwind', scope: 'global', origin: 'agents-inc' },
]

const agents: AgentScopeConfig[] = [{ name: 'web-developer', scope: 'global' }]

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'web-developer': {
    'web-framework': 'web-framework-react',
    'web-styling': ['web-styling-tailwind'],
  },
}

export default {
  name: 'exclusive-category',
  agents,
  skills,
  stack,
} satisfies ProjectConfig
`

const EXCLUSIVE_CATEGORY_CONFIG_TYPES_TS =
  `// AUTO-GENERATED by agents-inc — DO NOT EDIT

export type SkillId = 'web-framework-react' | 'web-styling-tailwind'

export type AgentName = 'web-developer'

export type SelectedAgentName = 'web-developer'

export type ProjectAgentName = SelectedAgentName

export type Domain = 'web'

export type Category = 'web-framework' | 'web-styling'

export type InstallMode = 'eject' | 'plugin' | 'mixed'

export type SkillConfig = {
  id: SkillId
  scope: 'project' | 'global'
  origin: string
  excluded?: boolean
}

export type AgentScopeConfig = {
  name: AgentName
  scope: 'project' | 'global'
  model?: 'sonnet' | 'opus' | 'haiku' | 'fable' | 'inherit'
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  excluded?: boolean
}

export type SkillAssignment<S extends SkillId = SkillId> = S | { id: S; preloaded: boolean }

export type StackAgentConfig = {
  'web-framework'?: SkillAssignment<'web-framework-react'>
  'web-styling'?: SkillAssignment<'web-styling-tailwind'>[]
}` + CONFIG_TYPES_INTERFACE

const PRELOADED_AND_LAZY_CONFIG_TS = `${FULL_TYPE_IMPORT}

const skills: SkillConfig[] = [
  { id: 'web-styling-tailwind', scope: 'global', origin: 'agents-inc' },
  { id: 'web-testing-vitest', scope: 'global', origin: 'agents-inc' },
]

const agents: AgentScopeConfig[] = [{ name: 'web-developer', scope: 'global' }]

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'web-developer': {
    'web-styling': [{ id: 'web-styling-tailwind', preloaded: true }],
    'web-testing': ['web-testing-vitest'],
  },
}

export default {
  name: 'preloaded-and-lazy',
  agents,
  skills,
  stack,
} satisfies ProjectConfig
`

const PRELOADED_AND_LAZY_CONFIG_TYPES_TS =
  `// AUTO-GENERATED by agents-inc — DO NOT EDIT

export type SkillId = 'web-styling-tailwind' | 'web-testing-vitest'

export type AgentName = 'web-developer'

export type SelectedAgentName = 'web-developer'

export type ProjectAgentName = SelectedAgentName

export type Domain = 'web'

export type Category = 'web-styling' | 'web-testing'

export type InstallMode = 'eject' | 'plugin' | 'mixed'

export type SkillConfig = {
  id: SkillId
  scope: 'project' | 'global'
  origin: string
  excluded?: boolean
}

export type AgentScopeConfig = {
  name: AgentName
  scope: 'project' | 'global'
  model?: 'sonnet' | 'opus' | 'haiku' | 'fable' | 'inherit'
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  excluded?: boolean
}

export type SkillAssignment<S extends SkillId = SkillId> = S | { id: S; preloaded: boolean }

export type StackAgentConfig = {
  'web-styling'?: SkillAssignment<'web-styling-tailwind'>[]
  'web-testing'?: SkillAssignment<'web-testing-vitest'>[]
}` + CONFIG_TYPES_INTERFACE

const PROJECT_ROOT_INLINES_GLOBAL_CONFIG_TS = `${FULL_TYPE_IMPORT}

const skills: SkillConfig[] = [
  // global
  { id: 'web-framework-react', scope: 'global', origin: 'agents-inc' },
  // project
  { id: 'web-testing-vitest', scope: 'project', origin: 'agents-inc' },
]

const agents: AgentScopeConfig[] = [
  // global
  { name: 'web-developer', scope: 'global' },
  // project
  { name: 'api-developer', scope: 'project' },
]

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'api-developer': { 'web-testing': ['web-testing-vitest'] },
}

export default {
  name: 'project-root',
  skills,
  agents,
  stack,
} satisfies ProjectConfig
`

const PROJECT_ROOT_INLINES_GLOBAL_CONFIG_TYPES_TS =
  `// AUTO-GENERATED by agents-inc — DO NOT EDIT

export type SkillId = 'web-testing-vitest'

export type AgentName = 'api-developer'

export type SelectedAgentName = 'api-developer'

export type ProjectAgentName = 'api-developer'

export type Domain = 'web'

export type Category = 'web-testing'

export type InstallMode = 'eject' | 'plugin' | 'mixed'

export type SkillConfig = {
  id: SkillId
  scope: 'project' | 'global'
  origin: string
  excluded?: boolean
}

export type AgentScopeConfig = {
  name: AgentName
  scope: 'project' | 'global'
  model?: 'sonnet' | 'opus' | 'haiku' | 'fable' | 'inherit'
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  excluded?: boolean
}

export type SkillAssignment<S extends SkillId = SkillId> = S | { id: S; preloaded: boolean }

export type StackAgentConfig = {
  'web-testing'?: SkillAssignment<'web-testing-vitest'>[]
}` + CONFIG_TYPES_INTERFACE

/**
 * A configuration whose global root the project root below inlines. It is a
 * scenario input rather than a scenario of its own, so the two halves of one
 * installation cannot drift apart in this file.
 */
const GLOBAL_HALF: ProjectConfig = {
  name: "global",
  agents: [{ name: WEB_DEVELOPER, scope: "global" }],
  skills: [{ id: REACT, scope: "global", origin: AGENTS_INC }],
  stack: { [WEB_DEVELOPER]: { "web-framework": [{ id: REACT }] } },
}

export const EMISSION_SCENARIOS: readonly EmissionScenario[] = [
  {
    id: "empty-root",
    title: "emits an empty roster as [] and omits the stack entirely",
    root: "global",
    config: { name: "empty-root", agents: [], skills: [] },
    agentNames: [],
    expected: {
      [CONFIG_TS]: EMPTY_ROOT_CONFIG_TS,
      [CONFIG_TYPES_TS]: EMPTY_ROOT_CONFIG_TYPES_TS,
    },
    why:
      "A root holding nothing still writes both halves of the pair. `agents` and `skills` " +
      "are arrays, so empty is `[]`; `stack` is a record and is omitted rather than emitted " +
      "as `{}`; and every union in the types half collapses to `never`, which is what an " +
      "empty union is spelled as.",
  },
  {
    id: "long-scalars",
    title:
      "moves a value below the key naming it once it no longer fits beside it",
    root: "global",
    config: {
      name: "long-scalars",
      description:
        "a description written long enough that its value cannot sit beside the key naming it",
      agents: [],
      skills: [],
      marketplace:
        "/a/deliberately/long/marketplace/path/that/pushes/its/value/below/its/own/key",
    },
    agentNames: [],
    expected: {
      [CONFIG_TS]: LONG_SCALARS_CONFIG_TS,
      [CONFIG_TYPES_TS]: EMPTY_ROOT_CONFIG_TYPES_TS,
    },
    why:
      "A string cannot break inside itself, so the only shortening left to one that overruns " +
      "its line is to move below the key. `description` does and `marketplace` does not, four " +
      "columns short of the same edge, which is what makes this a width rule rather than a " +
      "rule about long values. The membership is narrower than it looks and was measured " +
      "rather than reasoned about: a `null` and an empty array move too, while a number and a " +
      "boolean stay beside their key however far past the width they run. Its types half is " +
      "the empty root's, because a config carrying no skills and no agents narrows to `never` " +
      "however much prose its scalars hold.",
  },
  {
    id: "hyphenated-keys",
    title: "quotes every emitted object key",
    root: "global",
    config: {
      name: "hyphenated-keys",
      agents: [{ name: WEB_DEVELOPER, scope: "global" }],
      skills: [{ id: REACT, scope: "global", origin: AGENTS_INC }],
      stack: { [WEB_DEVELOPER]: { "web-framework": [{ id: REACT }] } },
    },
    agentNames: [WEB_DEVELOPER],
    expected: {
      [CONFIG_TS]: HYPHENATED_KEYS_CONFIG_TS,
      [CONFIG_TYPES_TS]: HYPHENATED_KEYS_CONFIG_TYPES_TS,
    },
    why:
      "Sub-agent names and category ids are kebab-case, so no key here can go unquoted, while " +
      "`name` in the export default is an identifier and does. Both halves are the rule — the " +
      "writer quotes where it must and nowhere else — and an implementation that quoted " +
      "unconditionally would diverge on every id in the catalogue and agree on none.",
  },
  {
    id: "stack-ordering",
    title:
      "orders sub-agent keys by code unit and category keys by declaration",
    root: "global",
    config: {
      name: "stack-ordering",
      agents: [
        { name: WEB_DEVELOPER, scope: "global" },
        { name: API_DEVELOPER, scope: "global" },
      ],
      skills: [
        { id: REACT, scope: "global", origin: AGENTS_INC },
        { id: TAILWIND, scope: "global", origin: AGENTS_INC },
        { id: ZUSTAND, scope: "global", origin: AGENTS_INC },
        { id: VITEST, scope: "global", origin: AGENTS_INC },
      ],
      stack: {
        [WEB_DEVELOPER]: {
          "web-styling": [{ id: TAILWIND }],
          "web-framework": [{ id: REACT }],
        },
        [API_DEVELOPER]: {
          "web-testing": [{ id: VITEST }],
          "web-client-state": [{ id: ZUSTAND }],
        },
      },
    },
    agentNames: [WEB_DEVELOPER, API_DEVELOPER],
    expected: {
      [CONFIG_TS]: STACK_ORDERING_CONFIG_TS,
      [CONFIG_TYPES_TS]: STACK_ORDERING_CONFIG_TYPES_TS,
    },
    why:
      "Both records are written here in the order a producer would build them and both come " +
      "back reordered: sub-agents by code unit, so api-developer precedes web-developer, and " +
      "categories by the catalogue's own declaration order, so web-framework precedes " +
      "web-styling and web-client-state precedes web-testing. This is the ordering whose " +
      "absence swapped two rows of a compiled web-developer.md.",
  },
  {
    id: "exclusive-category",
    title:
      "unwraps an exclusive category's one assignment and leaves a non-exclusive one wrapped",
    root: "global",
    config: {
      name: "exclusive-category",
      agents: [{ name: WEB_DEVELOPER, scope: "global" }],
      skills: [
        { id: REACT, scope: "global", origin: AGENTS_INC },
        { id: TAILWIND, scope: "global", origin: AGENTS_INC },
      ],
      stack: {
        [WEB_DEVELOPER]: {
          "web-framework": [{ id: REACT }],
          "web-styling": [{ id: TAILWIND }],
        },
      },
    },
    agentNames: [WEB_DEVELOPER],
    expected: {
      [CONFIG_TS]: EXCLUSIVE_CATEGORY_CONFIG_TS,
      [CONFIG_TYPES_TS]: EXCLUSIVE_CATEGORY_CONFIG_TYPES_TS,
    },
    why:
      "Both categories hold exactly one skill and the two emit differently: web-framework is " +
      "exclusive, so the bare value IS the assignment, while web-styling is not, so its array " +
      "survives at length one — and the types half gives only the second a `[]` suffix. " +
      "Length cannot tell the two apart, which is why they are pinned side by side rather " +
      "than in separate scenarios.",
  },
  {
    id: "preloaded-and-lazy",
    title:
      "expands a preloaded assignment, compacts a lazy one, and preserves the key order",
    root: "global",
    config: {
      name: "preloaded-and-lazy",
      agents: [{ name: WEB_DEVELOPER, scope: "global" }],
      skills: [
        { id: TAILWIND, scope: "global", origin: AGENTS_INC },
        { id: VITEST, scope: "global", origin: AGENTS_INC },
      ],
      stack: {
        [WEB_DEVELOPER]: {
          "web-styling": [{ id: TAILWIND, preloaded: true }],
          "web-testing": [{ id: VITEST, preloaded: false }],
        },
      },
    },
    agentNames: [WEB_DEVELOPER],
    expected: {
      [CONFIG_TS]: PRELOADED_AND_LAZY_CONFIG_TS,
      [CONFIG_TYPES_TS]: PRELOADED_AND_LAZY_CONFIG_TYPES_TS,
    },
    why:
      "A preloaded assignment keeps its object form and a lazy one compacts to a bare id. The " +
      "order the stack's keys come back in is the order the compiled sub-agent's " +
      "skill-activation table is handed, because buildAgentTemplateContext splits the skills " +
      "preserving it. The agent body that consequence lands in is compared against a real " +
      "install by preview-matches-install.e2e.test.ts; what is pinned here is the config.ts " +
      "key order that decides it.",
  },
  {
    id: "project-root-inlines-global",
    title:
      "inlines the global entries into a project root and reorders its export default",
    root: "project",
    config: {
      name: "project-root",
      agents: [{ name: API_DEVELOPER, scope: "project" }],
      skills: [{ id: VITEST, scope: "project", origin: AGENTS_INC }],
      stack: { [API_DEVELOPER]: { "web-testing": [{ id: VITEST }] } },
    },
    globalConfig: GLOBAL_HALF,
    agentNames: [API_DEVELOPER],
    expected: {
      [CONFIG_TS]: PROJECT_ROOT_INLINES_GLOBAL_CONFIG_TS,
      [CONFIG_TYPES_TS]: PROJECT_ROOT_INLINES_GLOBAL_CONFIG_TYPES_TS,
    },
    why:
      "A project root takes a different writer and its bytes differ in two visible ways: " +
      "the two arrays carry `// global` and `// project` section comments, and the export " +
      "default is ordered name, skills, agents, stack rather than the canonical order. Those " +
      "comments are also what holds the arrays open at one entry per line, where the " +
      "standalone writer's single-entry array folds onto one. The stack holds the " +
      "project's own sub-agent only. Its types half is the STANDALONE form, which is the " +
      "branch the CLI takes when no global config-types.ts exists on disk — the only one a " +
      "browser can render, since the import form's specifier is path.relative() against the " +
      "visitor's own $HOME and the preview draws a placeholder for it instead.",
  },
]
