import { CODEX_MODEL_NAMES, MATRIX, SEED_VERSION } from "@workspace/matrix"
import type { SeedAgent, SeedPayload } from "@workspace/matrix"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { seatDiagnostics } from "./diagnostics"
import { seedToInstallSelection } from "./seed-to-config"
import {
  buildCatalog,
  buildCatalogCategory,
  buildCatalogSkill,
} from "./__tests__/factories/catalog-factories"
import { buildSeedPayload } from "./__tests__/factories/seed-factories"

const WEB_DEV = "web-developer"
const REACT = "web-framework-react"
const PINNED_CODEX_MODEL = "gpt-5.6-terra"
/** A real Codex id this CLI does not offer. */
const NOT_OFFERED = "gpt-4o"

/** One global skill on web-developer, whose own entry is `agent`. */
function payloadFor(agent: SeedAgent): SeedPayload {
  return {
    v: SEED_VERSION,
    matrixVersion: "1.0.0",
    stackId: null,
    skills: {
      [REACT]: {
        install: "eject",
        scope: "global",
        assignments: { [WEB_DEV]: "lazy" },
      },
    },
    agents: { [WEB_DEV]: agent },
  }
}

// An unknown Codex id is dropped with a warning; the sub-agent runs on the session's model.
describe("a sub-agent's Codex model, decoded", () => {
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

  it("lands on the sub-agent's row beside its Claude model", () => {
    const { result } = seedToInstallSelection(
      payloadFor({ model: "haiku", codexModel: PINNED_CODEX_MODEL }),
      MATRIX
    )

    expect(result.agentConfigs).toStrictEqual([
      {
        name: WEB_DEV,
        scope: "global",
        model: "haiku",
        codexModel: PINNED_CODEX_MODEL,
      },
    ])
    expect(warnings).toStrictEqual([])
  })

  it("decodes every id this CLI offers", () => {
    for (const codexModel of CODEX_MODEL_NAMES) {
      const { result } = seedToInstallSelection(
        payloadFor({ codexModel }),
        MATRIX
      )

      expect(result.agentConfigs, codexModel).toStrictEqual([
        { name: WEB_DEV, scope: "global", codexModel },
      ])
    }
  })

  it("drops an id this CLI does not offer and names it, keeping the rest of the row", () => {
    const { result } = seedToInstallSelection(
      payloadFor({ model: "haiku", effort: "high", codexModel: NOT_OFFERED }),
      MATRIX
    )

    expect(result.agentConfigs).toStrictEqual([
      { name: WEB_DEV, scope: "global", model: "haiku", effort: "high" },
    ])
    expect(warnings).toStrictEqual([
      "Sub-agent 'web-developer' asks for Codex model 'gpt-4o', which this version of the CLI " +
        "does not offer, so it runs on the session's model. Offered: gpt-6-astra, gpt-5.6-sol, " +
        "gpt-5.6-terra and gpt-5.6-luna.",
    ])
  })

  it("says nothing about a sub-agent that names no Codex model", () => {
    const { result } = seedToInstallSelection(
      payloadFor({ model: "haiku" }),
      MATRIX
    )

    expect(result.agentConfigs).toStrictEqual([
      { name: WEB_DEV, scope: "global", model: "haiku" },
    ])
    expect(warnings).toStrictEqual([])
  })
})

const TAILWIND = "web-styling-tailwind"
const HONO = "api-framework-hono"
const SVELTE = "web-framework-svelte"
const ACME_DEPLOY = "acme-pipeline-deploy"
const ZETA_RUNBOOK = "zeta-ops-runbook"

/** Two categories in domains no built-in list holds, and one no domain claims. */
const SEED_CATALOG = buildCatalog(
  {
    "web-framework": buildCatalogCategory({
      displayName: "Framework",
      domain: "web",
      exclusive: true,
    }),
    "web-styling": buildCatalogCategory({
      displayName: "Styling",
      domain: "web",
    }),
    "api-api": buildCatalogCategory({ displayName: "API", domain: "api" }),
    "acme-pipeline": buildCatalogCategory({
      displayName: "Pipeline",
      domain: "acme",
    }),
    "zeta-ops": buildCatalogCategory({ displayName: "Ops", domain: "zeta" }),
    "shared-tooling": buildCatalogCategory({ displayName: "Tooling" }),
  },
  [
    buildCatalogSkill(REACT, {
      displayName: "React",
      category: "web-framework",
      availableSources: [
        { name: "agents-inc" },
        { name: "acme-market", primary: true },
      ],
    }),
    buildCatalogSkill(SVELTE, {
      displayName: "Svelte",
      category: "web-framework",
    }),
    buildCatalogSkill(TAILWIND, {
      displayName: "Tailwind",
      category: "web-styling",
    }),
    buildCatalogSkill(HONO, {
      displayName: "Hono",
      category: "api-api",
      availableSources: [{ name: "acme-market" }],
    }),
    buildCatalogSkill(ACME_DEPLOY, {
      displayName: "Deploy",
      category: "acme-pipeline",
    }),
    buildCatalogSkill(ZETA_RUNBOOK, {
      displayName: "Runbook",
      category: "zeta-ops",
    }),
    buildCatalogSkill("shared-tooling-misc", {
      displayName: "Misc",
      category: "shared-tooling",
    }),
  ]
)

describe("a shared configuration, decoded into the install it describes", () => {
  it("installs each skill from its primary marketplace or as a copy, and each assignment at its load", () => {
    const decoded = seedToInstallSelection(
      buildSeedPayload({
        stackId: "web-stack",
        description: "Shared web setup",
        skills: {
          [REACT]: {
            install: "plugin",
            scope: "global",
            assignments: { [WEB_DEV]: "preloaded", "web-tester": "lazy" },
          },
          [TAILWIND]: {
            install: "eject",
            scope: "project",
            assignments: { "web-tester": "lazy" },
          },
        },
        agents: { "web-tester": { scope: "project", model: "haiku" } },
      }),
      SEED_CATALOG
    )

    expect(decoded).toStrictEqual({
      result: {
        skills: [
          {
            id: REACT,
            scope: "global",
            origin: "acme-market",
            displayName: "React",
          },
          {
            id: TAILWIND,
            scope: "project",
            origin: "eject",
            displayName: "Tailwind",
          },
        ],
        selectedAgents: [WEB_DEV, "web-tester"],
        agentConfigs: [
          { name: WEB_DEV, scope: "global" },
          { name: "web-tester", scope: "project", model: "haiku" },
        ],
        assignedStack: {
          [WEB_DEV]: { "web-framework": [{ id: REACT, preloaded: true }] },
          "web-tester": {
            "web-framework": [{ id: REACT, preloaded: false }],
            "web-styling": [{ id: TAILWIND, preloaded: false }],
          },
        },
        selectedStackId: "web-stack",
        description: "Shared web setup",
        selectedDomains: ["web"],
        validation: { valid: true, errors: [] },
      },
      skippedSkillIds: [],
      skippedAgentNames: [],
      agentsOnlySkippedSkillsCarried: [],
    })
  })

  it("installs a marketplace skill with no primary source from the public marketplace, and carries no absent description", () => {
    const { result } = seedToInstallSelection(
      buildSeedPayload({
        skills: {
          [TAILWIND]: { install: "plugin", scope: "global", assignments: {} },
          [HONO]: { install: "plugin", scope: "global", assignments: {} },
        },
        agents: {},
      }),
      SEED_CATALOG
    )

    expect(result).toStrictEqual({
      skills: [
        {
          id: TAILWIND,
          scope: "global",
          origin: "agents-inc",
          displayName: "Tailwind",
        },
        {
          id: HONO,
          scope: "global",
          origin: "agents-inc",
          displayName: "Hono",
        },
      ],
      selectedAgents: [],
      agentConfigs: [],
      assignedStack: {},
      selectedStackId: null,
      selectedDomains: ["web", "api"],
      validation: { valid: true, errors: [] },
    })
  })

  it("orders domains no built-in list holds first, alphabetically, then the built-in ones in their order", () => {
    const { result } = seedToInstallSelection(
      buildSeedPayload({
        skills: {
          [HONO]: { install: "plugin", scope: "global", assignments: {} },
          [ZETA_RUNBOOK]: {
            install: "plugin",
            scope: "global",
            assignments: {},
          },
          [REACT]: { install: "plugin", scope: "global", assignments: {} },
          [ACME_DEPLOY]: {
            install: "plugin",
            scope: "global",
            assignments: {},
          },
        },
        agents: {},
      }),
      SEED_CATALOG
    )

    expect(result.selectedDomains).toStrictEqual(["acme", "zeta", "web", "api"])
  })

  it("revalidates the selection against this catalogue", () => {
    const { result } = seedToInstallSelection(
      buildSeedPayload({
        skills: {
          [REACT]: { install: "plugin", scope: "global", assignments: {} },
          [SVELTE]: { install: "plugin", scope: "global", assignments: {} },
        },
        agents: {},
      }),
      SEED_CATALOG
    )

    expect(result.validation).toStrictEqual({
      valid: false,
      errors: [
        {
          type: "categoryExclusive",
          message:
            'Category "Framework" only allows one selection, but multiple selected: React, Svelte',
          skills: [REACT, SVELTE],
        },
      ],
    })
  })
})

/** Names no shipped catalogue gives these ids, so only the catalogue handed in can supply them. */
const RENAMED_CATALOG = buildCatalog(
  {
    "web-framework": buildCatalogCategory({
      displayName: "Framework",
      domain: "web",
      exclusive: true,
    }),
    "web-styling": buildCatalogCategory({
      displayName: "Styling",
      domain: "web",
    }),
    "api-api": buildCatalogCategory({ displayName: "API", domain: "api" }),
    "acme-pipeline": buildCatalogCategory({
      displayName: "Pipeline",
      domain: "acme",
    }),
  },
  [
    buildCatalogSkill(REACT, {
      displayName: "Acme React",
      category: "web-framework",
      availableSources: [{ name: "acme-market", primary: true }],
    }),
    buildCatalogSkill(TAILWIND, {
      displayName: "Acme Tailwind",
      category: "web-styling",
    }),
    buildCatalogSkill(HONO, {
      displayName: "Acme Hono",
      category: "api-api",
      availableSources: [{ name: "acme-market", primary: true }],
    }),
    buildCatalogSkill(ACME_DEPLOY, {
      displayName: "Acme Deploy",
      category: "acme-pipeline",
    }),
  ]
)

describe("the name each skill entry records", () => {
  it("is the catalogue's display name, for a plugin and a copy at either scope", () => {
    const { result } = seedToInstallSelection(
      buildSeedPayload({
        skills: {
          [REACT]: { install: "plugin", scope: "global", assignments: {} },
          [TAILWIND]: { install: "eject", scope: "global", assignments: {} },
          [HONO]: { install: "plugin", scope: "project", assignments: {} },
          [ACME_DEPLOY]: {
            install: "eject",
            scope: "project",
            assignments: {},
          },
        },
        agents: {},
      }),
      RENAMED_CATALOG
    )

    expect(
      result.skills,
      "each entry records the name the catalogue it was installed from gives it"
    ).toStrictEqual([
      {
        id: REACT,
        scope: "global",
        origin: "acme-market",
        displayName: "Acme React",
      },
      {
        id: TAILWIND,
        scope: "global",
        origin: "eject",
        displayName: "Acme Tailwind",
      },
      {
        id: HONO,
        scope: "project",
        origin: "acme-market",
        displayName: "Acme Hono",
      },
      {
        id: ACME_DEPLOY,
        scope: "project",
        origin: "eject",
        displayName: "Acme Deploy",
      },
    ])
  })
})

describe("what a shared configuration names that this install cannot", () => {
  it("skips a skill this catalogue lacks or places in no domain, and a sub-agent nobody ships", () => {
    const decoded = seedToInstallSelection(
      buildSeedPayload({
        skills: {
          "nope-skill": {
            install: "plugin",
            scope: "global",
            assignments: { "ghost-from-a-skipped-skill": "lazy" },
          },
          "shared-tooling-misc": {
            install: "plugin",
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          },
          [REACT]: {
            install: "plugin",
            scope: "global",
            assignments: { "acme-deployer": "lazy", [WEB_DEV]: "lazy" },
          },
        },
        agents: { "ghost-agent": { on: true } },
      }),
      SEED_CATALOG
    )

    expect({
      skills: decoded.result.skills,
      selectedAgents: decoded.result.selectedAgents,
      assignedStack: decoded.result.assignedStack,
      skippedSkillIds: decoded.skippedSkillIds,
      skippedAgentNames: decoded.skippedAgentNames,
    }).toStrictEqual({
      skills: [
        {
          id: REACT,
          scope: "global",
          origin: "acme-market",
          displayName: "React",
        },
      ],
      selectedAgents: [WEB_DEV],
      assignedStack: {
        [WEB_DEV]: { "web-framework": [{ id: REACT, preloaded: false }] },
      },
      skippedSkillIds: ["nope-skill", "shared-tooling-misc"],
      skippedAgentNames: ["ghost-agent", "acme-deployer"],
    })
  })
})

describe("the sub-agents a skipped skill names", () => {
  const SKIPPED = "nope-skill"
  const onWebDeveloper = {
    install: "plugin",
    scope: "global",
    assignments: { [WEB_DEV]: "lazy" },
  } as const
  const agents = {
    [WEB_DEV]: { scope: "global" },
    "web-tester": { scope: "global" },
    pm: { scope: "global" },
    reviewer: { on: true, scope: "global" },
    "api-developer": { on: false },
  } as const
  const withSkipped = buildSeedPayload({
    skills: {
      [REACT]: onWebDeveloper,
      [SKIPPED]: {
        install: "plugin",
        scope: "global",
        assignments: {
          [WEB_DEV]: "lazy",
          "web-tester": "lazy",
          pm: "preloaded",
          reviewer: "lazy",
          "api-developer": "lazy",
          "ghost-agent": "lazy",
        },
      },
    },
    agents,
  })

  it("names each one under the skill, leaving out a sub-agent placed, switched on, switched off or unknown", () => {
    expect(
      seedToInstallSelection(withSkipped, SEED_CATALOG)
        .agentsOnlySkippedSkillsCarried
    ).toStrictEqual([{ skillId: SKIPPED, agentNames: ["web-tester", "pm"] }])
  })

  it("installs each one it names without it, and none switched off or unknown", () => {
    expect(
      seedToInstallSelection(withSkipped, SEED_CATALOG).result
    ).toStrictEqual({
      skills: [
        {
          id: REACT,
          scope: "global",
          origin: "acme-market",
          displayName: "React",
        },
      ],
      selectedAgents: [WEB_DEV, "reviewer", "web-tester", "pm"],
      agentConfigs: [
        { name: WEB_DEV, scope: "global" },
        { name: "reviewer", scope: "global" },
        { name: "web-tester", scope: "global" },
        { name: "pm", scope: "global" },
      ],
      assignedStack: {
        [WEB_DEV]: { "web-framework": [{ id: REACT, preloaded: false }] },
      },
      selectedStackId: null,
      selectedDomains: ["web"],
      validation: { valid: true, errors: [] },
    })
  })

  it("installs the sub-agents it names when no skill in the configuration installs", () => {
    const { result } = seedToInstallSelection(
      buildSeedPayload({
        skills: {
          [SKIPPED]: {
            install: "eject",
            scope: "global",
            assignments: { [WEB_DEV]: "lazy", "web-tester": "preloaded" },
          },
        },
        agents: { "web-tester": { scope: "global", model: "haiku" } },
      }),
      SEED_CATALOG
    )

    expect({
      skills: result.skills,
      selectedAgents: result.selectedAgents,
      agentConfigs: result.agentConfigs,
      assignedStack: result.assignedStack,
    }).toStrictEqual({
      skills: [],
      selectedAgents: [WEB_DEV, "web-tester"],
      agentConfigs: [
        { name: WEB_DEV, scope: "global" },
        { name: "web-tester", scope: "global", model: "haiku" },
      ],
      assignedStack: {},
    })
  })

  it("names nothing when every skill places", () => {
    const decoded = seedToInstallSelection(
      buildSeedPayload({ skills: { [REACT]: onWebDeveloper }, agents }),
      SEED_CATALOG
    )

    expect(decoded.agentsOnlySkippedSkillsCarried).toStrictEqual([])
  })
})

describe("the sub-agents a shared configuration switches", () => {
  it("drops a switched-off sub-agent with its assignments", () => {
    const { result } = seedToInstallSelection(
      buildSeedPayload({
        skills: {
          [REACT]: {
            install: "plugin",
            scope: "global",
            assignments: { [WEB_DEV]: "lazy", "web-tester": "preloaded" },
          },
        },
        agents: { "web-tester": { on: false } },
      }),
      SEED_CATALOG
    )

    expect({
      selectedAgents: result.selectedAgents,
      agentConfigs: result.agentConfigs,
      assignedStack: result.assignedStack,
    }).toStrictEqual({
      selectedAgents: [WEB_DEV],
      agentConfigs: [{ name: WEB_DEV, scope: "global" }],
      assignedStack: {
        [WEB_DEV]: { "web-framework": [{ id: REACT, preloaded: false }] },
      },
    })
  })

  it("installs a sub-agent switched on with no skill, and not one merely described", () => {
    const { result } = seedToInstallSelection(
      buildSeedPayload({
        skills: {},
        agents: {
          pm: { on: true, effort: "high" },
          reviewer: { model: "opus" },
        },
      }),
      SEED_CATALOG
    )

    expect({
      selectedAgents: result.selectedAgents,
      agentConfigs: result.agentConfigs,
    }).toStrictEqual({
      selectedAgents: ["pm"],
      agentConfigs: [{ name: "pm", scope: "global", effort: "high" }],
    })
  })
})

describe("a shared configuration with nowhere to write an assignment", () => {
  it("is refused, naming every project skill assigned to a global sub-agent", () => {
    expect(() =>
      seedToInstallSelection(
        buildSeedPayload({
          skills: {
            [REACT]: {
              install: "plugin",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy", "web-tester": "lazy" },
            },
            [TAILWIND]: {
              install: "plugin",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            },
          },
          agents: { "web-tester": { scope: "project" } },
        }),
        SEED_CATALOG
      )
    ).toThrow(
      [
        "This configuration cannot be installed: a project-scoped skill never reaches a sub-agent " +
          "that rests at global scope, so these assignments have nowhere to be written:",
        `  ${REACT} -> ${WEB_DEV}`,
        `  ${TAILWIND} -> ${WEB_DEV}`,
        "Re-share it with each sub-agent above pinned to the project, or each skill above at global scope.",
      ].join("\n")
    )
  })

  // A skill whose metadata.yaml will not load never reaches the catalogue, so here it is one the
  // catalogue lacks: the pair is the payload's, whatever this catalogue can install.
  const UNLOADED = "nope-skill"

  it("is refused when the project skill is one this catalogue cannot install, naming its pair", () => {
    expect(() =>
      seedToInstallSelection(
        buildSeedPayload({
          skills: {
            [UNLOADED]: {
              install: "eject",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            },
          },
          agents: {},
        }),
        SEED_CATALOG
      )
    ).toThrow(
      [
        "This configuration cannot be installed: a project-scoped skill never reaches a sub-agent " +
          "that rests at global scope, so these assignments have nowhere to be written:",
        `  ${UNLOADED} -> ${WEB_DEV}`,
        "Re-share it with each sub-agent above pinned to the project, or each skill above at global scope.",
      ].join("\n")
    )
  })

  it("names the pair of a skill it cannot install beside the pair of one it can", () => {
    expect(() =>
      seedToInstallSelection(
        buildSeedPayload({
          skills: {
            [REACT]: {
              install: "plugin",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            },
            [UNLOADED]: {
              install: "eject",
              scope: "project",
              assignments: { "web-tester": "lazy" },
            },
          },
          agents: {},
        }),
        SEED_CATALOG
      )
    ).toThrow(
      [
        "This configuration cannot be installed: a project-scoped skill never reaches a sub-agent " +
          "that rests at global scope, so these assignments have nowhere to be written:",
        `  ${REACT} -> ${WEB_DEV}`,
        `  ${UNLOADED} -> web-tester`,
        "Re-share it with each sub-agent above pinned to the project, or each skill above at global scope.",
      ].join("\n")
    )
  })

  it("control: installs, without it, a project sub-agent that a project skill it cannot install names", () => {
    const decoded = seedToInstallSelection(
      buildSeedPayload({
        skills: {
          [UNLOADED]: {
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          },
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
      SEED_CATALOG
    )

    expect({
      skills: decoded.result.skills,
      agentConfigs: decoded.result.agentConfigs,
      assignedStack: decoded.result.assignedStack,
      skippedSkillIds: decoded.skippedSkillIds,
    }).toStrictEqual({
      skills: [],
      agentConfigs: [{ name: WEB_DEV, scope: "project" }],
      assignedStack: {},
      skippedSkillIds: [UNLOADED],
    })
  })

  it("control: is not refused for a project skill it cannot install on a sub-agent nobody ships or one switched off", () => {
    const decoded = seedToInstallSelection(
      buildSeedPayload({
        skills: {
          [UNLOADED]: {
            install: "eject",
            scope: "project",
            assignments: { "ghost-agent": "lazy", "api-developer": "lazy" },
          },
        },
        agents: { "api-developer": { on: false } },
      }),
      SEED_CATALOG
    )

    expect({
      selectedAgents: decoded.result.selectedAgents,
      skippedSkillIds: decoded.skippedSkillIds,
    }).toStrictEqual({
      selectedAgents: [],
      skippedSkillIds: [UNLOADED],
    })
  })
})
