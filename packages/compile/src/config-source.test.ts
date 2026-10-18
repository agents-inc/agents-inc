/**
 * The writer's branches, each against a catalogue small enough to read and a configuration built
 * for the branch. Expected bytes are literals: they are the files on a user's disk. Every one is
 * also held against prettier, so a literal cannot pin a layout prettier would rewrite.
 */

import { format, type Options } from "prettier"
import { describe, expect, it } from "vitest"

import {
  generateBlankGlobalConfigSource,
  generateConfigSource,
  refuseUnwritableStack,
} from "./config-source"
import {
  buildCatalog,
  buildCatalogCategory,
} from "./__tests__/factories/catalog-factories"
import type { ProjectConfig } from "./types"
import {
  buildAgentScopeConfig,
  buildProjectConfig,
  buildSkillConfig,
} from "./__tests__/factories/config-factories"

const REACT = "web-framework-react"
const SVELTE = "web-framework-svelte"
const TAILWIND = "web-styling-tailwind"
const VITEST = "web-testing-vitest"

/** Declared in this order, which is the order a stack's categories are written in. */
const CATALOG = buildCatalog(
  {
    "web-framework": buildCatalogCategory({
      displayName: "Framework",
      exclusive: true,
    }),
    "web-styling": buildCatalogCategory({ displayName: "Styling" }),
    "web-testing": buildCatalogCategory({ displayName: "Testing" }),
  },
  []
)

const GLOBAL_IMPORT_PATH = "../../.agents-inc/claude"

/** A global config carrying every field the standalone writer treats on its own. */
const FULL_GLOBAL = buildProjectConfig({
  name: "global",
  agents: [buildAgentScopeConfig("web-developer", { scope: "global" })],
  skills: [buildSkillConfig(REACT, { scope: "global", origin: "agents-inc" })],
  selectedDomains: ["web"],
  stack: {
    "api-developer": { "web-testing": [{ id: VITEST }] },
    "web-developer": { "web-styling": [], "web-framework": [{ id: REACT }] },
    "cli-developer": { "web-testing": [] },
  },
  projects: ["/work/app"],
  branding: { name: "Acme" },
  author: "@vince",
})

const FULL_GLOBAL_SOURCE = `import type {
  Domain,
  ProjectConfig,
  ProjectAgentName,
  AgentScopeConfig,
  SkillConfig,
  StackAgentConfig,
} from './config-types'

const skills: SkillConfig[] = [{ id: 'web-framework-react', scope: 'global', origin: 'agents-inc' }]

const agents: AgentScopeConfig[] = [{ name: 'web-developer', scope: 'global' }]

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'api-developer': { 'web-testing': ['web-testing-vitest'] },
  'web-developer': { 'web-framework': 'web-framework-react' },
}

const selectedDomains: Domain[] = ['web']

export default {
  name: 'global',
  agents,
  skills,
  author: '@vince',
  selectedDomains,
  stack,
  projects: ['/work/app'],
  branding: { name: 'Acme' },
} satisfies ProjectConfig
`

const EMPTY_GLOBAL = buildProjectConfig({
  name: "global",
  agents: [],
  skills: [],
  stack: {},
  selectedDomains: [],
})

const EMPTY_GLOBAL_SOURCE = `import type { ProjectConfig } from './config-types'

export default {
  name: 'global',
  agents: [],
  skills: [],
  selectedDomains: [],
} satisfies ProjectConfig
`

/** Its stack arrives in neither sub-agent nor category order. */
const SCRAMBLED_STACK = buildProjectConfig({
  name: "global",
  agents: [],
  skills: [],
  stack: {
    "web-developer": {
      "web-styling": [
        {
          id: TAILWIND,
          local: true,
          path: ".claude/skills/web-styling-tailwind",
          preloaded: true,
        },
      ],
    },
    "cli-developer": { "web-testing": [{ id: VITEST, preloaded: false }] },
    "api-developer": { "web-testing": [{ id: VITEST }] },
  },
})

const SCRAMBLED_STACK_SOURCE = `import type { ProjectConfig, ProjectAgentName, StackAgentConfig } from './config-types'

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'api-developer': { 'web-testing': ['web-testing-vitest'] },
  'cli-developer': { 'web-testing': ['web-testing-vitest'] },
  'web-developer': {
    'web-styling': [
      {
        id: 'web-styling-tailwind',
        preloaded: true,
        local: true,
        path: '.claude/skills/web-styling-tailwind',
      },
    ],
  },
}

export default {
  name: 'global',
  agents: [],
  skills: [],
  stack,
} satisfies ProjectConfig
`

const BLANK_GLOBAL_SOURCE = `import type { ProjectConfig } from './config-types'

export default {
  name: 'global',
  skills: [],
  agents: [],
  selectedDomains: [],
} satisfies ProjectConfig
`

/** A project with its own entries and tombstones over two global ones. */
const PROJECT = buildProjectConfig({
  name: "my-app",
  agents: [
    buildAgentScopeConfig("api-developer", { scope: "project" }),
    buildAgentScopeConfig("web-developer", { scope: "global", excluded: true }),
  ],
  skills: [
    buildSkillConfig(VITEST, { scope: "project" }),
    buildSkillConfig(REACT, {
      scope: "global",
      origin: "agents-inc",
      excluded: true,
    }),
  ],
  selectedDomains: ["api", "web"],
  stack: {
    "api-developer": { "web-testing": [{ id: VITEST, preloaded: true }] },
  },
  projects: ["/should/not/emit"],
  marketplace: "github:acme/skills",
})

const PROJECT_WITH_GLOBAL_IMPORT_SOURCE = `import globalConfig from '../../.agents-inc/claude/config'
import type {
  Domain,
  ProjectConfig,
  ProjectAgentName,
  AgentScopeConfig,
  SkillConfig,
  StackAgentConfig,
} from './config-types'

const skills: SkillConfig[] = [
  ...globalConfig.skills,
  { id: 'web-testing-vitest', scope: 'project', origin: 'eject' },
  { id: 'web-framework-react', scope: 'global', origin: 'agents-inc', excluded: true },
]

const agents: AgentScopeConfig[] = [
  ...globalConfig.agents,
  { name: 'api-developer', scope: 'project' },
  { name: 'web-developer', scope: 'global', excluded: true },
]

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'api-developer': { 'web-testing': [{ id: 'web-testing-vitest', preloaded: true }] },
}

const selectedDomains: Domain[] = [...(globalConfig.selectedDomains ?? []), 'api', 'web']

export default {
  ...globalConfig,
  name: 'my-app',
  skills,
  agents,
  stack,
  selectedDomains,
  marketplace: 'github:acme/skills',
} satisfies ProjectConfig
`

/** Named like the global config, with nothing of its own. */
const BARE_PROJECT_NAMED_GLOBAL = buildProjectConfig({
  name: "global",
  agents: [],
  skills: [],
})

const BARE_PROJECT_WITH_GLOBAL_IMPORT_SOURCE = `import globalConfig from '../config'
import type { ProjectConfig, AgentScopeConfig, SkillConfig } from './config-types'

const skills: SkillConfig[] = [...globalConfig.skills]

const agents: AgentScopeConfig[] = [...globalConfig.agents]

export default {
  ...globalConfig,
  name: 'agents-inc',
  skills,
  agents,
} satisfies ProjectConfig
`

/** The project's stack also names the global sub-agent it masks, which stays in the global file. */
const PROJECT_MASKING_A_GLOBAL_STACK: ProjectConfig = {
  ...PROJECT,
  stack: {
    ...PROJECT.stack,
    "web-developer": { "web-framework": [{ id: REACT }] },
  },
}

const PROJECT_WITH_INLINED_GLOBAL_SOURCE = `import type {
  Domain,
  ProjectConfig,
  ProjectAgentName,
  AgentScopeConfig,
  SkillConfig,
  StackAgentConfig,
} from './config-types'

const skills: SkillConfig[] = [
  // global
  { id: 'web-framework-react', scope: 'global', origin: 'agents-inc', excluded: true },
  // project
  { id: 'web-testing-vitest', scope: 'project', origin: 'eject' },
]

const agents: AgentScopeConfig[] = [
  // global
  { name: 'web-developer', scope: 'global', excluded: true },
  // project
  { name: 'api-developer', scope: 'project' },
]

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'api-developer': { 'web-testing': [{ id: 'web-testing-vitest', preloaded: true }] },
}

const selectedDomains: Domain[] = ['web', 'api']

export default {
  name: 'my-app',
  author: '@vince',
  marketplace: 'github:acme/skills',
  skills,
  agents,
  stack,
  selectedDomains,
} satisfies ProjectConfig
`

const BARE_GLOBAL = buildProjectConfig({
  name: "global",
  agents: [],
  skills: [],
})

const BARE_PROJECT = buildProjectConfig({
  name: "my-app",
  agents: [],
  skills: [],
})

const ONE_ENTRY_GLOBAL = buildProjectConfig({
  name: "global",
  agents: [buildAgentScopeConfig("web-developer", { scope: "global" })],
  skills: [buildSkillConfig(REACT, { scope: "global", origin: "agents-inc" })],
})

/** Its only stack entry is for a sub-agent the project does not hold. */
const PROJECT_WITH_ONLY_ITS_OWN_ENTRIES = buildProjectConfig({
  name: "my-app",
  agents: [buildAgentScopeConfig("api-developer", { scope: "project" })],
  skills: [buildSkillConfig(VITEST, { scope: "project" })],
  stack: { "web-developer": { "web-framework": [{ id: REACT }] } },
})

const NOTHING_INLINED_SOURCE = `import type { ProjectConfig } from './config-types'

export default {
  name: 'my-app',
  skills: [],
  agents: [],
} satisfies ProjectConfig
`

const ONLY_GLOBAL_ENTRIES_INLINED_SOURCE = `import type { ProjectConfig, AgentScopeConfig, SkillConfig } from './config-types'

const skills: SkillConfig[] = [
  // global
  { id: 'web-framework-react', scope: 'global', origin: 'agents-inc' },
]

const agents: AgentScopeConfig[] = [
  // global
  { name: 'web-developer', scope: 'global' },
]

export default {
  name: 'my-app',
  skills,
  agents,
} satisfies ProjectConfig
`

const ONLY_PROJECT_ENTRIES_INLINED_SOURCE = `import type { ProjectConfig, AgentScopeConfig, SkillConfig } from './config-types'

const skills: SkillConfig[] = [
  // project
  { id: 'web-testing-vitest', scope: 'project', origin: 'eject' },
]

const agents: AgentScopeConfig[] = [
  // project
  { name: 'api-developer', scope: 'project' },
]

export default {
  name: 'my-app',
  skills,
  agents,
} satisfies ProjectConfig
`

const TWO_IN_AN_EXCLUSIVE_CATEGORY: ProjectConfig["stack"] = {
  "web-developer": { "web-framework": [{ id: REACT }, { id: SVELTE }] },
}

const TWO_IN_AN_EXCLUSIVE_CATEGORY_ERROR = `Category 'web-framework' is exclusive but holds 2 skills: ["web-framework-react","web-framework-svelte"]`

describe("a standalone config", () => {
  it("declares each extracted field above the export, which keeps every other field in schema order", () => {
    expect(generateConfigSource(FULL_GLOBAL, CATALOG)).toBe(FULL_GLOBAL_SOURCE)
  })

  it("writes empty arrays inline and leaves an empty stack out", () => {
    expect(generateConfigSource(EMPTY_GLOBAL, CATALOG)).toBe(
      EMPTY_GLOBAL_SOURCE
    )
  })

  it("orders sub-agents by code unit and writes a flagged assignment's keys in schema order", () => {
    expect(generateConfigSource(SCRAMBLED_STACK, CATALOG)).toBe(
      SCRAMBLED_STACK_SOURCE
    )
  })

  it("refuses two skills in a category that allows one", () => {
    expect(() =>
      generateConfigSource(
        buildProjectConfig({
          agents: [],
          skills: [],
          stack: TWO_IN_AN_EXCLUSIVE_CATEGORY,
        }),
        CATALOG
      )
    ).toThrow(TWO_IN_AN_EXCLUSIVE_CATEGORY_ERROR)
  })
})

describe("the blank global config", () => {
  it("names the global config and holds nothing", () => {
    expect(generateBlankGlobalConfigSource()).toBe(BLANK_GLOBAL_SOURCE)
  })
})

describe("a project config that imports its global config", () => {
  it("spreads the global arrays ahead of its own and drops the projects list", () => {
    expect(
      generateConfigSource(PROJECT, CATALOG, {
        isProjectConfig: true,
        globalImportPath: GLOBAL_IMPORT_PATH,
      })
    ).toBe(PROJECT_WITH_GLOBAL_IMPORT_SOURCE)
  })

  it("leaves out a stack that holds nothing, as the project half of a split always does", () => {
    expect(
      generateConfigSource(
        { ...BARE_PROJECT_NAMED_GLOBAL, stack: {} },
        CATALOG,
        { isProjectConfig: true, globalImportPath: ".." }
      )
    ).toBe(BARE_PROJECT_WITH_GLOBAL_IMPORT_SOURCE)
  })

  it("never takes the global config's name, and omits a stack and domains it does not hold", () => {
    expect(
      generateConfigSource(BARE_PROJECT_NAMED_GLOBAL, CATALOG, {
        isProjectConfig: true,
        globalImportPath: "..",
      })
    ).toBe(BARE_PROJECT_WITH_GLOBAL_IMPORT_SOURCE)
  })
})

describe("a project config that inlines its global config", () => {
  it("masks each global entry with the project's tombstone and keeps the global sub-agent's stack out", () => {
    expect(
      generateConfigSource(PROJECT_MASKING_A_GLOBAL_STACK, CATALOG, {
        isProjectConfig: true,
        globalConfig: FULL_GLOBAL,
      })
    ).toBe(PROJECT_WITH_INLINED_GLOBAL_SOURCE)
  })

  it("writes empty arrays when neither side holds an entry", () => {
    expect(
      generateConfigSource(BARE_PROJECT, CATALOG, {
        isProjectConfig: true,
        globalConfig: BARE_GLOBAL,
      })
    ).toBe(NOTHING_INLINED_SOURCE)
  })

  it("writes only the global section when the project holds nothing of its own", () => {
    expect(
      generateConfigSource(BARE_PROJECT, CATALOG, {
        isProjectConfig: true,
        globalConfig: ONE_ENTRY_GLOBAL,
      })
    ).toBe(ONLY_GLOBAL_ENTRIES_INLINED_SOURCE)
  })

  it("writes only the project section, and no stack, when the global holds nothing", () => {
    expect(
      generateConfigSource(PROJECT_WITH_ONLY_ITS_OWN_ENTRIES, CATALOG, {
        isProjectConfig: true,
        globalConfig: BARE_GLOBAL,
      })
    ).toBe(ONLY_PROJECT_ENTRIES_INLINED_SOURCE)
  })
})

describe("a project config given no global config", () => {
  it("is refused, naming both ways to supply one", () => {
    expect(() =>
      generateConfigSource(BARE_PROJECT, CATALOG, { isProjectConfig: true })
    ).toThrow(
      "A project config needs the global config it extends: pass `globalConfig` to inline its " +
        "entries, or `globalImportPath` to import and spread them. Neither was given, and the " +
        "standalone writer this used to fall through to emits a global-shaped config carrying " +
        "the `projects` tracking array a project root must never hold."
    )
  })
})

describe("refuseUnwritableStack", () => {
  it("refuses two skills in a category that allows one", () => {
    expect(() =>
      refuseUnwritableStack(TWO_IN_AN_EXCLUSIVE_CATEGORY, CATALOG)
    ).toThrow(TWO_IN_AN_EXCLUSIVE_CATEGORY_ERROR)
  })

  it("allows one skill in a category that allows one", () => {
    expect(() =>
      refuseUnwritableStack(
        { "web-developer": { "web-framework": [{ id: REACT }] } },
        CATALOG
      )
    ).not.toThrow()
  })

  it("allows a config with no stack", () => {
    expect(() => refuseUnwritableStack(undefined, CATALOG)).not.toThrow()
  })
})

// A user's settings, as `contract/emission-scenarios.test.ts` formats with.
const INSTALLED_SOURCE_FORMAT = {
  parser: "typescript",
  semi: false,
  singleQuote: true,
  printWidth: 100,
  trailingComma: "all",
} as const satisfies Options

const EXPECTED_SOURCES = {
  FULL_GLOBAL_SOURCE,
  EMPTY_GLOBAL_SOURCE,
  SCRAMBLED_STACK_SOURCE,
  BLANK_GLOBAL_SOURCE,
  PROJECT_WITH_GLOBAL_IMPORT_SOURCE,
  BARE_PROJECT_WITH_GLOBAL_IMPORT_SOURCE,
  PROJECT_WITH_INLINED_GLOBAL_SOURCE,
  NOTHING_INLINED_SOURCE,
  ONLY_GLOBAL_ENTRIES_INLINED_SOURCE,
  ONLY_PROJECT_ENTRIES_INLINED_SOURCE,
}

describe("the bytes pinned above", () => {
  for (const [name, source] of Object.entries(EXPECTED_SOURCES)) {
    it(`are already prettier-formatted: ${name}`, async () => {
      expect(source).toBe(await format(source, INSTALLED_SOURCE_FORMAT))
    })
  }
})
