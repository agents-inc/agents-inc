/**
 * `generateProjectConfigFromSkills` against a seated catalogue small enough to read. Targeting and
 * load states are the shared resolvers' (`@workspace/matrix`), so each expected placement follows
 * from the real roster: a web skill reaches the web sub-agents, pm and reviewer.
 */

import { MATRIX } from "@workspace/matrix"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { seatCatalog } from "./catalog-seat"
import { seatDiagnostics } from "./diagnostics"
import {
  generateProjectConfigFromSkills,
  isScopePairCompatible,
  scopeEligibilityKey,
} from "./seed-to-config"
import {
  buildCatalog,
  buildCatalogCategory,
  buildCatalogSkill,
} from "./__tests__/factories/catalog-factories"
import type { SkillConfig, SkillId } from "./types"
import {
  buildAgentScopeConfig,
  buildSkillConfig,
} from "./__tests__/factories/config-factories"

const REACT = "web-framework-react"
const TAILWIND = "web-styling-tailwind"
const VITEST = "web-testing-vitest"
const HONO = "api-framework-hono"
const ZUSTAND = "web-state-zustand"
const MINE = "meta-design-expressive-typescript"
const VUE = "web-framework-vue-composition-api"
const PLAYWRIGHT = "web-testing-playwright-e2e"

// Boundary cast: a marketplace skill outside the generated union, as the CLI's loader hands it on.
const WIDGET = "acme-web-widget" as SkillId

/** Declared in this order, which is the order a sub-agent's categories are built in. */
const CATALOG = buildCatalog(
  {
    "web-framework": buildCatalogCategory({
      displayName: "Framework",
      domain: "web",
    }),
    "web-styling": buildCatalogCategory({
      displayName: "Styling",
      domain: "web",
    }),
    "web-testing": buildCatalogCategory({
      displayName: "Testing",
      domain: "web",
    }),
    "api-api": buildCatalogCategory({ displayName: "API", domain: "api" }),
    "shared-tooling": buildCatalogCategory({ displayName: "Tooling" }),
  },
  [
    buildCatalogSkill(REACT, {
      displayName: "React",
      category: "web-framework",
    }),
    buildCatalogSkill(TAILWIND, {
      displayName: "Tailwind",
      category: "web-styling",
    }),
    buildCatalogSkill(VITEST, {
      displayName: "Vitest",
      category: "web-testing",
    }),
    buildCatalogSkill(HONO, { displayName: "Hono", category: "api-api" }),
    // A real web skill seated in a category no domain claims.
    buildCatalogSkill(ZUSTAND, {
      displayName: "Zustand",
      category: "shared-tooling",
    }),
    buildCatalogSkill(MINE, { displayName: "Mine", category: "local" }),
    buildCatalogSkill(PLAYWRIGHT, {
      displayName: "Playwright",
      category: "web-testing",
    }),
    buildCatalogSkill(WIDGET, {
      displayName: "Widget",
      category: "web-styling",
    }),
  ]
)

const globalSkills = (...ids: SkillId[]): SkillConfig[] =>
  ids.map((id) => buildSkillConfig(id, { scope: "global" }))

const WEB_DEVELOPER = buildAgentScopeConfig("web-developer", {
  scope: "global",
})
const WEB_TESTER = buildAgentScopeConfig("web-tester", { scope: "global" })
const API_DEVELOPER = buildAgentScopeConfig("api-developer", {
  scope: "global",
})

let warnings: string[]
let verbose: string[]

beforeEach(() => {
  warnings = []
  verbose = []
  seatCatalog(CATALOG)
  seatDiagnostics({
    warn: (message) => warnings.push(message),
    verbose: (message) => verbose.push(message),
  })
})

afterEach(() => {
  seatCatalog(MATRIX)
  seatDiagnostics({ warn: () => undefined, verbose: () => undefined })
})

describe("a selection with no sub-agents", () => {
  it("records each skill as the project's own copy and leaves the stack alone", () => {
    expect(
      generateProjectConfigFromSkills("my-app", [REACT, TAILWIND])
    ).toStrictEqual({
      name: "my-app",
      agents: [],
      skills: [
        { id: REACT, scope: "project", origin: "eject" },
        { id: TAILWIND, scope: "project", origin: "eject" },
      ],
    })
  })

  it("carries a description and an author when given", () => {
    expect(
      generateProjectConfigFromSkills("my-app", [], {
        description: "A web app",
        author: "@vince",
      })
    ).toStrictEqual({
      name: "my-app",
      agents: [],
      skills: [],
      description: "A web app",
      author: "@vince",
    })
  })

  it("reports what it was given and that it built no stack", () => {
    generateProjectConfigFromSkills("my-app", [REACT, TAILWIND])

    expect(verbose).toStrictEqual([
      "generateProjectConfigFromSkills: 2 skills, matrix has 8 entries, agents=[]",
      "generateProjectConfigFromSkills: 2 found, 0 not found, 0 agents in stack",
      "buildStackForSelection: no agents — returning undefined (stack untouched)",
    ])
  })
})

describe("a selection naming sub-agents without their scopes", () => {
  it("is refused without skill configs", () => {
    expect(() =>
      generateProjectConfigFromSkills("my-app", [REACT], {
        selectedAgents: ["web-developer"],
        agentConfigs: [WEB_DEVELOPER],
      })
    ).toThrow(
      "generateProjectConfigFromSkills: selectedAgents was passed without skillConfigs. " +
        "Callers must pass a SkillConfig for every selected skill."
    )
  })

  it("is refused without agent configs", () => {
    expect(() =>
      generateProjectConfigFromSkills("my-app", [REACT], {
        selectedAgents: ["web-developer"],
        skillConfigs: globalSkills(REACT),
      })
    ).toThrow(
      "generateProjectConfigFromSkills: selectedAgents was passed without agentConfigs. " +
        "Callers must pass an AgentScopeConfig for every selected agent."
    )
  })

  it("is refused when a selected skill has no config", () => {
    expect(() =>
      generateProjectConfigFromSkills("my-app", [REACT], {
        selectedAgents: ["web-developer"],
        skillConfigs: [],
        agentConfigs: [WEB_DEVELOPER],
      })
    ).toThrow(
      "generateProjectConfigFromSkills: skill 'web-framework-react' missing from skillConfigs. " +
        "Caller must pass a SkillConfig for every selected skill."
    )
  })

  it("is refused when a selected sub-agent's only config is excluded", () => {
    const excluded = { ...WEB_DEVELOPER, excluded: true }

    expect(() =>
      generateProjectConfigFromSkills("my-app", [REACT], {
        selectedAgents: ["web-developer"],
        skillConfigs: globalSkills(REACT),
        agentConfigs: [excluded],
      })
    ).toThrow(
      "generateProjectConfigFromSkills: agent 'web-developer' missing from agentConfigs. " +
        "Caller must pass a AgentScopeConfig for every selected agent."
    )
  })

  it("is refused when a selected sub-agent has no active config even with no skill to place", () => {
    expect(() =>
      generateProjectConfigFromSkills("my-app", [], {
        selectedAgents: ["web-developer"],
        skillConfigs: [],
        agentConfigs: [{ ...WEB_DEVELOPER, excluded: true }],
      })
    ).toThrow(
      "generateProjectConfigFromSkills: selected agent 'web-developer' has no " +
        "non-excluded AgentScopeConfig in agentConfigs."
    )
  })
})

describe("the stack a selection builds", () => {
  const generated = () =>
    generateProjectConfigFromSkills("my-app", [VITEST, REACT, TAILWIND, HONO], {
      selectedAgents: ["web-tester", "web-developer", "api-developer"],
      skillConfigs: globalSkills(VITEST, REACT, TAILWIND, HONO),
      agentConfigs: [WEB_TESTER, WEB_DEVELOPER, API_DEVELOPER],
    })

  it("places each skill on the sub-agents its domain reaches, at the shared mapping's load", () => {
    expect(generated()).toStrictEqual({
      name: "my-app",
      agents: [API_DEVELOPER, WEB_DEVELOPER, WEB_TESTER],
      skills: globalSkills(VITEST, REACT, TAILWIND, HONO),
      stack: {
        "api-developer": { "api-api": [{ id: HONO, preloaded: true }] },
        "web-developer": {
          "web-framework": [{ id: REACT, preloaded: true }],
          "web-styling": [{ id: TAILWIND, preloaded: true }],
          "web-testing": [{ id: VITEST }],
        },
        "web-tester": {
          "web-framework": [{ id: REACT, preloaded: true }],
          "web-styling": [{ id: TAILWIND }],
          "web-testing": [{ id: VITEST, preloaded: true }],
        },
      },
    })
  })

  it("orders each sub-agent's categories by declaration, not by selection", () => {
    expect(
      Object.keys(generated().stack?.["web-developer"] ?? {})
    ).toStrictEqual(["web-framework", "web-styling", "web-testing"])
  })

  it("targets a skill whose seated category names no domain by its id's own taxonomy", () => {
    const config = generateProjectConfigFromSkills("my-app", [ZUSTAND], {
      selectedAgents: ["web-developer"],
      skillConfigs: globalSkills(ZUSTAND),
      agentConfigs: [WEB_DEVELOPER],
    })

    expect(config.stack).toStrictEqual({
      "web-developer": { "shared-tooling": [{ id: ZUSTAND, preloaded: true }] },
    })
  })

  it("loads a marketplace skill the shared table does not know lazily", () => {
    const config = generateProjectConfigFromSkills("my-app", [WIDGET], {
      selectedAgents: ["web-developer"],
      skillConfigs: globalSkills(WIDGET),
      agentConfigs: [WEB_DEVELOPER],
    })

    expect(config.stack).toStrictEqual({
      "web-developer": { "web-styling": [{ id: WIDGET }] },
    })
  })

  it("names every sub-agent in play in its verbose report", () => {
    generateProjectConfigFromSkills("my-app", [], {
      selectedAgents: ["web-tester", "web-developer"],
      skillConfigs: [],
      agentConfigs: [WEB_TESTER, WEB_DEVELOPER],
    })

    expect(verbose[0]).toBe(
      "generateProjectConfigFromSkills: 0 skills, matrix has 8 entries, agents=[web-developer, web-tester]"
    )
  })

  it("is empty rather than absent when sub-agents are in play and nothing reaches them", () => {
    const config = generateProjectConfigFromSkills("my-app", [HONO], {
      selectedAgents: ["web-developer"],
      skillConfigs: globalSkills(HONO),
      agentConfigs: [WEB_DEVELOPER],
    })

    expect(config.stack).toStrictEqual({})
  })

  it("leaves out a local skill and one whose every entry is excluded", () => {
    const config = generateProjectConfigFromSkills(
      "my-app",
      [MINE, REACT, TAILWIND],
      {
        selectedAgents: ["web-developer"],
        skillConfigs: [
          ...globalSkills(MINE, REACT),
          buildSkillConfig(TAILWIND, { scope: "global", excluded: true }),
        ],
        agentConfigs: [WEB_DEVELOPER],
      }
    )

    expect(config.stack).toStrictEqual({
      "web-developer": { "web-framework": [{ id: REACT, preloaded: true }] },
    })
  })
})

describe("the scopes a stack respects", () => {
  it("keeps a project skill off a global sub-agent and lets a global skill reach a project one", () => {
    const projectTester = buildAgentScopeConfig("web-tester", {
      scope: "project",
    })

    const config = generateProjectConfigFromSkills(
      "my-app",
      [REACT, TAILWIND],
      {
        selectedAgents: ["web-developer", "web-tester"],
        skillConfigs: [
          buildSkillConfig(REACT, { scope: "project" }),
          buildSkillConfig(TAILWIND, { scope: "global" }),
        ],
        agentConfigs: [WEB_DEVELOPER, projectTester],
      }
    )

    expect(config.stack).toStrictEqual({
      "web-developer": { "web-styling": [{ id: TAILWIND, preloaded: true }] },
      "web-tester": {
        "web-framework": [{ id: REACT, preloaded: true }],
        "web-styling": [{ id: TAILWIND }],
      },
    })
  })

  it("reads a skill by its active entry when an excluded one sits beside it", () => {
    const config = generateProjectConfigFromSkills("my-app", [REACT], {
      selectedAgents: ["web-developer"],
      skillConfigs: [
        buildSkillConfig(REACT, { scope: "project" }),
        buildSkillConfig(REACT, { scope: "global", excluded: true }),
      ],
      agentConfigs: [WEB_DEVELOPER],
    })

    expect(config.stack).toStrictEqual({})
  })

  it("lists the active sub-agents in name order, then the excluded ones", () => {
    const excludedPm = buildAgentScopeConfig("pm", {
      scope: "global",
      excluded: true,
    })

    const config = generateProjectConfigFromSkills("my-app", [], {
      selectedAgents: ["web-tester", "web-developer"],
      skillConfigs: [],
      agentConfigs: [excludedPm, WEB_TESTER, WEB_DEVELOPER],
    })

    expect(config.agents).toStrictEqual([WEB_DEVELOPER, WEB_TESTER, excludedPm])
  })

  it("answers whether a skill at one scope can reach a sub-agent at another", () => {
    expect([
      isScopePairCompatible("project", "global"),
      isScopePairCompatible("global", "project"),
      isScopePairCompatible("project", "project"),
      isScopePairCompatible("global", "global"),
    ]).toStrictEqual([false, true, true, true])
  })
})

describe("a skill this marketplace does not carry", () => {
  it("stays in the configuration, reaches no sub-agent, and is named in a warning", () => {
    const config = generateProjectConfigFromSkills("my-app", [VUE, REACT], {
      selectedAgents: ["web-developer"],
      skillConfigs: globalSkills(VUE, REACT),
      agentConfigs: [WEB_DEVELOPER],
    })

    expect(config.skills).toStrictEqual(globalSkills(VUE, REACT))
    expect(config.stack).toStrictEqual({
      "web-developer": { "web-framework": [{ id: REACT, preloaded: true }] },
    })
    expect(warnings).toStrictEqual([
      `Skill '${VUE}' is not in this marketplace — it stays in the configuration and no ` +
        "sub-agent is given it. Run 'npx agents-inc update' to refresh the marketplace, or " +
        "remove it with 'npx agents-inc edit'.",
    ])
  })

  it("is counted in verbose diagnostics beside a sample of five catalogue keys", () => {
    generateProjectConfigFromSkills("my-app", [VUE], {
      selectedAgents: ["web-developer"],
      skillConfigs: globalSkills(VUE),
      agentConfigs: [WEB_DEVELOPER],
    })

    expect(verbose).toStrictEqual([
      "generateProjectConfigFromSkills: 1 skills, matrix has 8 entries, agents=[web-developer]",
      `1 skills absent from the matrix. Matrix keys sample: [${REACT}, ${TAILWIND}, ${VITEST}, ${HONO}, ${ZUSTAND}]`,
      "generateProjectConfigFromSkills: 0 found, 1 not found, 1 agents in stack",
    ])
  })
})

describe("a prior stack", () => {
  it("keeps its triples where they sit and the load each was saved with", () => {
    const config = generateProjectConfigFromSkills(
      "my-app",
      [TAILWIND, HONO, VITEST],
      {
        selectedAgents: ["web-developer"],
        skillConfigs: globalSkills(TAILWIND, HONO, VITEST),
        agentConfigs: [WEB_DEVELOPER],
        existingStack: {
          "web-developer": {
            "web-styling": [{ id: TAILWIND }],
            "api-api": [{ id: HONO }],
            "web-testing": [{ id: VITEST, preloaded: true }],
          },
        },
      }
    )

    expect(config.stack).toStrictEqual({
      "web-developer": {
        "web-styling": [{ id: TAILWIND }],
        "web-testing": [{ id: VITEST, preloaded: true }],
        "api-api": [{ id: HONO }],
      },
    })
  })

  it("reads each skill's own saved load, not its neighbour's in the same category", () => {
    const config = generateProjectConfigFromSkills(
      "my-app",
      [VITEST, PLAYWRIGHT],
      {
        selectedAgents: ["web-developer"],
        skillConfigs: globalSkills(VITEST, PLAYWRIGHT),
        agentConfigs: [WEB_DEVELOPER],
        existingStack: {
          "web-developer": {
            "web-testing": [
              { id: PLAYWRIGHT },
              { id: VITEST, preloaded: true },
            ],
          },
        },
      }
    )

    expect(config.stack).toStrictEqual({
      "web-developer": {
        "web-testing": [{ id: VITEST, preloaded: true }, { id: PLAYWRIGHT }],
      },
    })
  })

  it("under curation, keeps every skill a category already held", () => {
    const config = generateProjectConfigFromSkills(
      "my-app",
      [VITEST, PLAYWRIGHT],
      {
        selectedAgents: ["web-developer"],
        skillConfigs: globalSkills(VITEST, PLAYWRIGHT),
        agentConfigs: [WEB_DEVELOPER],
        existingStack: {
          "web-developer": {
            "web-testing": [{ id: PLAYWRIGHT }, { id: VITEST }],
          },
        },
        newlyAddedSkillIds: [],
      }
    )

    expect(config.stack).toStrictEqual({
      "web-developer": { "web-testing": [{ id: VITEST }, { id: PLAYWRIGHT }] },
    })
  })

  it("under curation, does not let a category's other skill bring a removed one back", () => {
    const config = generateProjectConfigFromSkills(
      "my-app",
      [VITEST, PLAYWRIGHT],
      {
        selectedAgents: ["web-developer"],
        skillConfigs: globalSkills(VITEST, PLAYWRIGHT),
        agentConfigs: [WEB_DEVELOPER],
        existingStack: {
          "web-developer": { "web-testing": [{ id: PLAYWRIGHT }] },
        },
        newlyAddedSkillIds: [],
      }
    )

    expect(config.stack).toStrictEqual({
      "web-developer": { "web-testing": [{ id: PLAYWRIGHT }] },
    })
  })

  it("under curation, keeps an existing sub-agent's picks, adds what is new and drops what the user removed", () => {
    const config = generateProjectConfigFromSkills(
      "my-app",
      [REACT, TAILWIND, VITEST],
      {
        selectedAgents: ["web-developer", "web-tester"],
        skillConfigs: globalSkills(REACT, TAILWIND, VITEST),
        agentConfigs: [WEB_DEVELOPER, WEB_TESTER],
        existingStack: {
          "web-developer": { "web-framework": [{ id: REACT }] },
        },
        newlyAddedSkillIds: [VITEST],
      }
    )

    expect(config.stack).toStrictEqual({
      "web-developer": {
        "web-framework": [{ id: REACT }],
        "web-testing": [{ id: VITEST }],
      },
      "web-tester": {
        "web-framework": [{ id: REACT, preloaded: true }],
        "web-styling": [{ id: TAILWIND }],
        "web-testing": [{ id: VITEST, preloaded: true }],
      },
    })
  })

  it("under curation, admits a pair whose scope compatibility was gained this session", () => {
    const config = generateProjectConfigFromSkills(
      "my-app",
      [REACT, TAILWIND],
      {
        selectedAgents: ["web-developer"],
        skillConfigs: globalSkills(REACT, TAILWIND),
        agentConfigs: [WEB_DEVELOPER],
        existingStack: {
          "web-developer": { "web-framework": [{ id: REACT }] },
        },
        newlyAddedSkillIds: [],
        scopeEligibilityGained: new Set([
          scopeEligibilityKey("web-developer", TAILWIND),
        ]),
      }
    )

    expect(config.stack).toStrictEqual({
      "web-developer": {
        "web-framework": [{ id: REACT }],
        "web-styling": [{ id: TAILWIND, preloaded: true }],
      },
    })
  })

  it("under curation, admits only the gained pair: not its skill on another sub-agent, nor another skill on its own", () => {
    const config = generateProjectConfigFromSkills(
      "my-app",
      [REACT, TAILWIND, VITEST],
      {
        selectedAgents: ["web-developer", "web-tester"],
        skillConfigs: globalSkills(REACT, TAILWIND, VITEST),
        agentConfigs: [WEB_DEVELOPER, WEB_TESTER],
        existingStack: {
          "web-developer": { "web-framework": [{ id: REACT }] },
          "web-tester": { "web-framework": [{ id: REACT }] },
        },
        newlyAddedSkillIds: [],
        scopeEligibilityGained: new Set([
          scopeEligibilityKey("web-developer", TAILWIND),
        ]),
      }
    )

    expect(config.stack).toStrictEqual({
      "web-developer": {
        "web-framework": [{ id: REACT }],
        "web-styling": [{ id: TAILWIND, preloaded: true }],
      },
      "web-tester": { "web-framework": [{ id: REACT }] },
    })
  })
})
