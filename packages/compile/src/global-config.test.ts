import { describe, expect, it } from "vitest"

import {
  addSessionToGlobal,
  blankGlobalConfig,
  mergeGlobalConfigs,
} from "./global-config"
import {
  buildCatalog,
  buildCatalogCategory,
  buildCatalogSkill,
} from "./__tests__/factories/catalog-factories"
import {
  buildAgentScopeConfig,
  buildProjectConfig,
  buildSkillConfig,
} from "./__tests__/factories/config-factories"

const REACT = "web-framework-react"
const TAILWIND = "web-styling-tailwind"
const HONO = "api-framework-hono"
const VITEST = "web-testing-vitest"

const GLOBAL_REACT = buildSkillConfig(REACT, { scope: "global" })
const GLOBAL_TAILWIND = buildSkillConfig(TAILWIND, { scope: "global" })
const GLOBAL_HONO = buildSkillConfig(HONO, { scope: "global" })
const WEB_DEVELOPER = buildAgentScopeConfig("web-developer", {
  scope: "global",
})
const API_DEVELOPER = buildAgentScopeConfig("api-developer", {
  scope: "global",
})

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
    "api-api": buildCatalogCategory({ displayName: "API", domain: "api" }),
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
    buildCatalogSkill(HONO, { displayName: "Hono", category: "api-api" }),
  ]
)

describe("blankGlobalConfig", () => {
  it("is the global config with nothing in it", () => {
    expect(blankGlobalConfig()).toStrictEqual({
      name: "global",
      skills: [],
      agents: [],
      selectedDomains: [],
    })
  })
})

describe("mergeGlobalConfigs", () => {
  const existing = buildProjectConfig({
    name: "global",
    skills: [GLOBAL_REACT],
    agents: [WEB_DEVELOPER],
    selectedDomains: ["web"],
  })

  it("adds the active skills and agents it does not hold, after its own", () => {
    const incoming = buildProjectConfig({
      name: "global",
      skills: [
        buildSkillConfig(REACT, { scope: "global", origin: "agents-inc" }),
        GLOBAL_HONO,
        buildSkillConfig(TAILWIND, { scope: "global", excluded: true }),
      ],
      agents: [
        WEB_DEVELOPER,
        API_DEVELOPER,
        buildAgentScopeConfig("pm", { scope: "global", excluded: true }),
      ],
    })

    expect(mergeGlobalConfigs(existing, incoming)).toStrictEqual({
      config: {
        name: "global",
        skills: [GLOBAL_REACT, GLOBAL_HONO],
        agents: [WEB_DEVELOPER, API_DEVELOPER],
        stack: {},
        selectedDomains: ["web"],
      },
      changed: true,
    })
  })

  it("changes nothing when everything arriving is already there", () => {
    const incoming = buildProjectConfig({
      name: "global",
      skills: [GLOBAL_REACT],
      agents: [WEB_DEVELOPER],
      selectedDomains: ["web"],
    })

    expect(mergeGlobalConfigs(existing, incoming)).toStrictEqual({
      config: {
        name: "global",
        skills: [GLOBAL_REACT],
        agents: [WEB_DEVELOPER],
        stack: {},
        selectedDomains: ["web"],
      },
      changed: false,
    })
  })

  it("adds a domain it does not hold, keeping its own first", () => {
    const incoming = buildProjectConfig({
      name: "global",
      skills: [],
      agents: [],
      selectedDomains: ["api", "web"],
    })

    expect(mergeGlobalConfigs(existing, incoming)).toStrictEqual({
      config: {
        name: "global",
        skills: [GLOBAL_REACT],
        agents: [WEB_DEVELOPER],
        stack: {},
        selectedDomains: ["web", "api"],
      },
      changed: true,
    })
  })

  it("reads absent domains on either side as none", () => {
    const bare = buildProjectConfig({ name: "global", skills: [], agents: [] })

    expect(mergeGlobalConfigs(bare, bare)).toStrictEqual({
      config: {
        name: "global",
        skills: [],
        agents: [],
        stack: {},
        selectedDomains: [],
      },
      changed: false,
    })
  })
})

describe("the stack a global merge writes", () => {
  const existing = buildProjectConfig({
    name: "global",
    skills: [],
    agents: [],
    stack: {
      "web-developer": {
        "web-framework": [{ id: REACT, preloaded: true }],
      },
    },
  })

  it("appends every missing triple and keeps every existing one, flags included", () => {
    const incoming = buildProjectConfig({
      name: "global",
      skills: [],
      agents: [],
      stack: {
        "web-developer": {
          "web-framework": [{ id: REACT }, { id: VITEST }, { id: VITEST }],
          "web-styling": [{ id: TAILWIND }],
        },
        "api-developer": { "api-api": [{ id: HONO }] },
      },
    })

    expect(mergeGlobalConfigs(existing, incoming)).toStrictEqual({
      config: {
        name: "global",
        skills: [],
        agents: [],
        stack: {
          "web-developer": {
            "web-framework": [{ id: REACT, preloaded: true }, { id: VITEST }],
            "web-styling": [{ id: TAILWIND }],
          },
          "api-developer": { "api-api": [{ id: HONO }] },
        },
        selectedDomains: [],
      },
      changed: true,
    })
  })

  it("counts a category gained by a sub-agent already there as a change", () => {
    const incoming = buildProjectConfig({
      name: "global",
      skills: [],
      agents: [],
      stack: { "web-developer": { "web-styling": [{ id: TAILWIND }] } },
    })

    expect(mergeGlobalConfigs(existing, incoming)).toStrictEqual({
      config: {
        name: "global",
        skills: [],
        agents: [],
        stack: {
          "web-developer": {
            "web-framework": [{ id: REACT, preloaded: true }],
            "web-styling": [{ id: TAILWIND }],
          },
        },
        selectedDomains: [],
      },
      changed: true,
    })
  })

  it("counts a skill gained by a category already there as a change", () => {
    const incoming = buildProjectConfig({
      name: "global",
      skills: [],
      agents: [],
      stack: { "web-developer": { "web-framework": [{ id: VITEST }] } },
    })

    expect(mergeGlobalConfigs(existing, incoming)).toStrictEqual({
      config: {
        name: "global",
        skills: [],
        agents: [],
        stack: {
          "web-developer": {
            "web-framework": [{ id: REACT, preloaded: true }, { id: VITEST }],
          },
        },
        selectedDomains: [],
      },
      changed: true,
    })
  })

  it("leaves the configs it was handed as they were", () => {
    const incoming = buildProjectConfig({
      name: "global",
      skills: [],
      agents: [],
      stack: {
        "web-developer": { "web-framework": [{ id: VITEST }] },
        "api-developer": { "api-api": [{ id: HONO }] },
      },
    })
    const existingBefore = structuredClone(existing)
    const incomingBefore = structuredClone(incoming)

    const { config } = mergeGlobalConfigs(existing, incoming)
    config.stack?.["api-developer"]?.["api-api"]?.push({ id: TAILWIND })

    expect({ existing, incoming }).toStrictEqual({
      existing: existingBefore,
      incoming: incomingBefore,
    })
  })

  it("changes nothing when every arriving triple is already there", () => {
    const incoming = buildProjectConfig({
      name: "global",
      skills: [],
      agents: [],
      stack: {
        "web-developer": { "web-framework": [{ id: REACT }] },
      },
    })

    expect(mergeGlobalConfigs(existing, incoming)).toStrictEqual({
      config: { ...existing, stack: existing.stack, selectedDomains: [] },
      changed: false,
    })
  })
})

describe("the marketplace a global merge records", () => {
  const SOURCE = { marketplace: "github:acme/skills", marketplaceName: "acme" }
  const existing = buildProjectConfig({
    name: "global",
    skills: [],
    agents: [],
  })

  it("is filled from a session that adds an entry", () => {
    const incoming = buildProjectConfig({
      name: "global",
      skills: [GLOBAL_HONO],
      agents: [],
      ...SOURCE,
    })

    expect(mergeGlobalConfigs(existing, incoming).config).toStrictEqual({
      name: "global",
      skills: [GLOBAL_HONO],
      agents: [],
      stack: {},
      selectedDomains: [],
      ...SOURCE,
    })
  })

  it("is filled from a session that adds only a sub-agent", () => {
    const incoming = buildProjectConfig({
      name: "global",
      skills: [],
      agents: [API_DEVELOPER],
      ...SOURCE,
    })

    expect(mergeGlobalConfigs(existing, incoming)).toStrictEqual({
      config: {
        name: "global",
        skills: [],
        agents: [API_DEVELOPER],
        stack: {},
        selectedDomains: [],
        ...SOURCE,
      },
      changed: true,
    })
  })

  it("is not filled from a session that adds nothing", () => {
    const incoming = buildProjectConfig({
      name: "global",
      skills: [],
      agents: [],
      ...SOURCE,
    })

    expect(mergeGlobalConfigs(existing, incoming).config).toStrictEqual({
      name: "global",
      skills: [],
      agents: [],
      stack: {},
      selectedDomains: [],
    })
  })

  it("is never repointed once recorded", () => {
    const recorded = buildProjectConfig({
      name: "global",
      skills: [],
      agents: [],
      marketplace: "github:first/skills",
      marketplaceName: "first",
    })
    const incoming = buildProjectConfig({
      name: "global",
      skills: [GLOBAL_HONO],
      agents: [],
      ...SOURCE,
    })

    expect(mergeGlobalConfigs(recorded, incoming).config).toStrictEqual({
      name: "global",
      skills: [GLOBAL_HONO],
      agents: [],
      stack: {},
      selectedDomains: [],
      marketplace: "github:first/skills",
      marketplaceName: "first",
    })
  })
})

describe("addSessionToGlobal", () => {
  const NOTHING_GLOBAL = buildProjectConfig({
    name: "global",
    skills: [],
    agents: [],
    selectedDomains: ["web"],
  })

  it("keeps the global config as it is for a session with nothing global", () => {
    const existing = buildProjectConfig({
      name: "global",
      skills: [GLOBAL_REACT],
      agents: [WEB_DEVELOPER],
    })

    expect(addSessionToGlobal(NOTHING_GLOBAL, existing, CATALOG)).toStrictEqual(
      {
        config: existing,
        changed: false,
      }
    )
  })

  it("answers an empty global config for a session with nothing global and nothing on disk", () => {
    expect(
      addSessionToGlobal(NOTHING_GLOBAL, undefined, CATALOG)
    ).toStrictEqual({
      config: { name: "global", skills: [], agents: [] },
      changed: false,
    })
  })

  it("counts a global skill alone as something global", () => {
    const skillOnly = buildProjectConfig({
      name: "global",
      skills: [GLOBAL_HONO],
      agents: [],
    })

    expect(addSessionToGlobal(skillOnly, undefined, CATALOG)).toStrictEqual({
      config: { ...skillOnly, selectedDomains: [] },
      changed: true,
    })
  })

  it("counts a global agent alone as something global", () => {
    const agentOnly = buildProjectConfig({
      name: "global",
      skills: [],
      agents: [WEB_DEVELOPER],
    })

    expect(addSessionToGlobal(agentOnly, undefined, CATALOG)).toStrictEqual({
      config: { ...agentOnly, selectedDomains: [] },
      changed: true,
    })
  })

  it("writes the session's global half, keeping only the domains its new skills come from", () => {
    const session = buildProjectConfig({
      name: "global",
      skills: [GLOBAL_REACT],
      agents: [WEB_DEVELOPER],
      selectedDomains: ["api", "web"],
    })

    expect(addSessionToGlobal(session, undefined, CATALOG)).toStrictEqual({
      config: { ...session, selectedDomains: ["web"] },
      changed: true,
    })
  })

  it("does not widen the domains for a skill already installed or one the session excludes", () => {
    const existing = buildProjectConfig({
      name: "global",
      skills: [GLOBAL_REACT],
      agents: [WEB_DEVELOPER],
      selectedDomains: ["web"],
    })
    const session = buildProjectConfig({
      name: "global",
      skills: [
        GLOBAL_REACT,
        buildSkillConfig(HONO, { scope: "global", excluded: true }),
        GLOBAL_TAILWIND,
      ],
      agents: [WEB_DEVELOPER],
      selectedDomains: ["api", "web"],
    })

    expect(addSessionToGlobal(session, existing, CATALOG)).toStrictEqual({
      config: {
        ...existing,
        skills: [GLOBAL_REACT, GLOBAL_TAILWIND],
        stack: {},
        selectedDomains: ["web"],
      },
      changed: true,
    })
  })
})
