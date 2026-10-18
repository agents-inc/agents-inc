import { describe, expect, it } from "vitest"

import { splitConfigByScope } from "./seed-to-config"
import {
  buildAgentScopeConfig,
  buildProjectConfig,
  buildSkillConfig,
} from "./__tests__/factories/config-factories"

const REACT = "web-framework-react"
const TAILWIND = "web-styling-tailwind"
const VITEST = "web-testing-vitest"

const GLOBAL_REACT = buildSkillConfig(REACT, { scope: "global" })
const PROJECT_VITEST = buildSkillConfig(VITEST, { scope: "project" })
const TAILWIND_TOMBSTONE = buildSkillConfig(TAILWIND, {
  scope: "global",
  excluded: true,
})

const GLOBAL_WEB_DEVELOPER = buildAgentScopeConfig("web-developer", {
  scope: "global",
})
const GLOBAL_API_DEVELOPER = buildAgentScopeConfig("api-developer", {
  scope: "global",
})
const PROJECT_WEB_TESTER = buildAgentScopeConfig("web-tester", {
  scope: "project",
})
const PM_TOMBSTONE = buildAgentScopeConfig("pm", {
  scope: "global",
  excluded: true,
})

describe("splitConfigByScope", () => {
  const config = buildProjectConfig({
    name: "my-app",
    skills: [GLOBAL_REACT, PROJECT_VITEST, TAILWIND_TOMBSTONE],
    agents: [
      GLOBAL_WEB_DEVELOPER,
      GLOBAL_API_DEVELOPER,
      PROJECT_WEB_TESTER,
      PM_TOMBSTONE,
    ],
    selectedDomains: ["web"],
    marketplace: "github:acme/skills",
    branding: { name: "Acme" },
    skillsDir: "skills",
    stack: {
      "web-developer": {
        "web-framework": [{ id: REACT, preloaded: true }],
        "web-testing": [{ id: VITEST }],
      },
      "web-tester": { "web-framework": [{ id: REACT }] },
      pm: { "web-testing": [{ id: VITEST }] },
    },
  })

  it("sends a global sub-agent's global skills to the global config and its project skills to the project", () => {
    expect(splitConfigByScope(config)).toStrictEqual({
      global: {
        name: "global",
        skills: [GLOBAL_REACT],
        agents: [GLOBAL_WEB_DEVELOPER, GLOBAL_API_DEVELOPER],
        selectedDomains: ["web"],
        marketplace: "github:acme/skills",
        stack: {
          "web-developer": {
            "web-framework": [{ id: REACT, preloaded: true }],
          },
        },
      },
      project: {
        name: "my-app",
        skills: [PROJECT_VITEST, TAILWIND_TOMBSTONE],
        agents: [PROJECT_WEB_TESTER, PM_TOMBSTONE],
        selectedDomains: ["web"],
        marketplace: "github:acme/skills",
        branding: { name: "Acme" },
        skillsDir: "skills",
        stack: {
          "web-developer": { "web-testing": [{ id: VITEST }] },
          "web-tester": { "web-framework": [{ id: REACT }] },
          pm: { "web-testing": [{ id: VITEST }] },
        },
      },
    })
  })

  it("writes an empty stack on both sides when the config has none", () => {
    const { global, project } = splitConfigByScope(
      buildProjectConfig({
        name: "my-app",
        skills: [GLOBAL_REACT],
        agents: [GLOBAL_WEB_DEVELOPER, PROJECT_WEB_TESTER],
      })
    )

    expect({ global: global.stack, project: project.stack }).toStrictEqual({
      global: {},
      project: {},
    })
  })

  it("keeps a global sub-agent holding only project skills out of the global config's stack", () => {
    const { global } = splitConfigByScope(
      buildProjectConfig({
        name: "my-app",
        skills: [PROJECT_VITEST],
        agents: [GLOBAL_WEB_DEVELOPER],
        stack: { "web-developer": { "web-testing": [{ id: VITEST }] } },
      })
    )

    expect(global.stack).toStrictEqual({})
  })

  it("keeps a global sub-agent holding only global skills out of the project's stack", () => {
    const { project } = splitConfigByScope(
      buildProjectConfig({
        name: "my-app",
        skills: [GLOBAL_REACT],
        agents: [GLOBAL_WEB_DEVELOPER],
        stack: { "web-developer": { "web-framework": [{ id: REACT }] } },
      })
    )

    expect(project.stack).toStrictEqual({})
  })
})
