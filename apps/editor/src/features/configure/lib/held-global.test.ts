import {
  cliMintedPayload,
  freshlyPickedSkill,
  projectMintedPayload,
  projectOwnSkill,
} from "@workspace/api-mocks"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setAnalyticsSink } from "@/lib/analytics/track"
import { useConfigStore } from "@/stores/config-store"
import { useHeldGlobalStore } from "@/stores/held-global-store"
import {
  isAgentOn,
  resolveAgentOptions,
  type PersistedConfig,
} from "@/stores/persisted-schema"

import {
  agentOptionRefusal,
  agentPinRefusal,
  assignmentRefusal,
  heldGlobalOf,
  pressOnHeldSkill,
  skillOptionRefusal,
  skillToggleRefusal,
} from "./held-global"
import { fromSeedPayload, toSeedPayload } from "./seed"

import type { AnalyticsEvent } from "@/lib/analytics/events"
import type { SeedPayload } from "@workspace/matrix"

// Driven through the store's own actions, since every door (cell, panel,
// roster, composer) reaches the selection through them.

const REACT = "web-framework-react"
const VUE = "web-framework-vue-composition-api"
const HONO = "api-framework-hono"
const TAILWIND = "web-styling-tailwind"
const WEB_DEV = "web-developer"
const API_DEV = "api-developer"
// Off in the project's link.
const CLI_DEV = "cli-developer"

// The sub-agents React's default placement reaches, all resting globally.
const REACT_AGENTS = [WEB_DEV, "web-researcher", "web-tester", "pm", "reviewer"]

const SWITCH_OFF_REFUSED =
  "Installed globally, so this project can't switch it off."
const CHANGE_REFUSED =
  "Installed globally, so this project can't change it. Switch it to project to change a copy of its own."

// React in the global install; Hono and api-developer the project's own.
const projectLink = () =>
  projectMintedPayload(
    { [REACT]: freshlyPickedSkill(REACT), [HONO]: projectOwnSkill([API_DEV]) },
    [API_DEV]
  )

// As the editor opens a shared address: the selection, then what it holds.
const open = (payload: SeedPayload): PersistedConfig => {
  const arrived = fromSeedPayload(payload)
  useConfigStore.getState().importConfig(arrived)
  useHeldGlobalStore.getState().hold(heldGlobalOf(payload, arrived))
  return arrived
}

const store = () => useConfigStore.getState()
const held = () => useHeldGlobalStore.getState().held

afterEach(() => {
  useConfigStore.getState().reset()
  useHeldGlobalStore.getState().release()
})

describe("what a link holds", () => {
  it("holds nothing for a link made anywhere but a project", () => {
    const payload = cliMintedPayload({ [REACT]: freshlyPickedSkill(REACT) })

    expect(heldGlobalOf(payload, fromSeedPayload(payload))).toBeNull()
  })

  it("holds the global skills and sub-agents a project's link arrived with, as they arrived", () => {
    const payload = projectLink()
    const arrived = fromSeedPayload(payload)

    expect(heldGlobalOf(payload, arrived)).toStrictEqual({
      skills: { [REACT]: arrived.skills[REACT] },
      agents: Object.fromEntries(
        REACT_AGENTS.map((agent) => [agent, { on: true, scope: "global" }])
      ),
    })
  })
})

describe("a global skill a project's link holds", () => {
  it("stays on when switched off, and says why", () => {
    open(projectLink())

    store().toggleSkill(REACT)

    expect(REACT in store().skills).toBe(true)
    expect(skillToggleRefusal(held(), store(), REACT)).toBe(SWITCH_OFF_REFUSED)
  })

  // The control: the guard holds the global entries, not the whole link.
  it("leaves a skill the project holds for itself free to switch off", () => {
    open(projectLink())

    expect(skillToggleRefusal(held(), store(), HONO)).toBeUndefined()
    store().toggleSkill(HONO)

    expect(HONO in store().skills).toBe(false)
  })

  it("cannot be swapped out of its one-of category, and names itself", () => {
    open(projectLink())

    store().toggleSkill(VUE)

    expect([REACT in store().skills, VUE in store().skills]).toStrictEqual([
      true,
      false,
    ])
    expect(skillToggleRefusal(held(), store(), VUE)).toBe(
      "React is installed globally, so this project can't swap it out."
    )
  })

  it("leaves a pick in a category it does not hold free", () => {
    open(projectLink())

    store().toggleSkill(TAILWIND)

    expect(TAILWIND in store().skills).toBe(true)
  })

  it("keeps its install mode", () => {
    const arrived = open(projectLink())

    store().setSkillOption(REACT, { install: "eject" })

    expect(store().skills[REACT]).toStrictEqual(arrived.skills[REACT])
    expect(
      skillOptionRefusal(held(), store(), REACT, { install: "eject" })
    ).toBe(CHANGE_REFUSED)
  })

  it("switches to project, where its copy changes freely", () => {
    open(projectLink())

    store().setSkillOption(REACT, { scope: "project" })
    store().setSkillOption(REACT, { install: "eject" })

    expect({
      install: store().skills[REACT]?.install,
      scope: store().skills[REACT]?.scope,
    }).toStrictEqual({ install: "eject", scope: "project" })
  })

  it("still cannot be switched off once its copy is the project's", () => {
    open(projectLink())

    store().setSkillOption(REACT, { scope: "project" })
    store().toggleSkill(REACT)

    expect(REACT in store().skills).toBe(true)
  })

  it("is as it arrived once switched back to global", () => {
    const arrived = open(projectLink())

    store().setSkillOption(REACT, { scope: "project" })
    store().setSkillOption(REACT, { install: "eject" })
    store().cycleAssignment(REACT, WEB_DEV)
    store().setSkillOption(REACT, { scope: "global" })

    expect(store().skills[REACT]).toStrictEqual(arrived.skills[REACT])
  })

  it("keeps its place on a global sub-agent the link holds", () => {
    const arrived = open(projectLink())

    store().cycleAssignment(REACT, WEB_DEV)
    store().toggleAssignmentEnabled(REACT, WEB_DEV)
    store().flipAssignmentLoad(REACT, WEB_DEV)

    expect(store().skills[REACT]).toStrictEqual(arrived.skills[REACT])
    expect(assignmentRefusal(held(), store(), REACT, WEB_DEV)).toBe(
      CHANGE_REFUSED
    )
  })

  // Codex offers no plugin at project, so its project copy is ejected.
  it("switches to project and its install in one press", () => {
    open(projectLink())

    expect(
      skillOptionRefusal(held(), store(), REACT, {
        scope: "project",
        install: "eject",
      })
    ).toBeUndefined()
    store().setSkillOption(REACT, { scope: "project", install: "eject" })

    expect({
      install: store().skills[REACT]?.install,
      scope: store().skills[REACT]?.scope,
    }).toStrictEqual({ install: "eject", scope: "project" })
  })

  it("lands its press to project ejected on Codex alone", () => {
    expect([
      pressOnHeldSkill("codex", { scope: "project" }),
      pressOnHeldSkill("claude", { scope: "project" }),
      pressOnHeldSkill("codex", { scope: "global" }),
    ]).toStrictEqual([
      { scope: "project", install: "eject" },
      { scope: "project" },
      { scope: "global" },
    ])
  })

  it("reaches a sub-agent the project holds for itself", () => {
    open(projectLink())

    store().cycleAssignment(REACT, API_DEV)

    expect(store().skills[REACT]?.assignments[API_DEV]).toStrictEqual({
      load: "lazy",
      enabled: true,
    })
  })
})

describe("a global sub-agent a project's link holds", () => {
  it("stays on when switched off, and says why", () => {
    open(projectLink())

    store().toggleAgentPin(WEB_DEV)

    expect(isAgentOn(store(), WEB_DEV)).toBe(true)
    expect(agentPinRefusal(held(), store(), WEB_DEV)).toBe(SWITCH_OFF_REFUSED)
  })

  it("leaves a sub-agent the project holds for itself free to switch off", () => {
    open(projectLink())

    store().toggleAgentPin(API_DEV)

    expect(isAgentOn(store(), API_DEV)).toBe(false)
  })

  it("keeps its model and effort", () => {
    open(projectLink())
    const before = resolveAgentOptions(store().agents, WEB_DEV)

    store().setAgentOption(WEB_DEV, { model: "haiku", effort: "max" })

    expect(resolveAgentOptions(store().agents, WEB_DEV)).toStrictEqual(before)
    expect(
      agentOptionRefusal(held(), store(), WEB_DEV, { model: "haiku" })
    ).toBe(CHANGE_REFUSED)
  })

  it("switches to project, where its copy changes freely", () => {
    open(projectLink())

    store().setAgentOption(WEB_DEV, { scope: "project" })
    store().setAgentOption(WEB_DEV, { model: "haiku" })

    expect(resolveAgentOptions(store().agents, WEB_DEV)).toMatchObject({
      model: "haiku",
      scope: "project",
    })
  })

  it("takes no row of a skill picked here", () => {
    open(projectLink())

    store().toggleSkill(TAILWIND)
    store().cycleAssignment(TAILWIND, WEB_DEV)

    expect(
      REACT_AGENTS.filter(
        (agentId) => store().skills[TAILWIND]?.assignments[agentId]
      )
    ).toStrictEqual([])
    expect(assignmentRefusal(held(), store(), TAILWIND, WEB_DEV)).toBe(
      CHANGE_REFUSED
    )
  })

  it("takes a skill picked here once its copy is the project's", () => {
    open(projectLink())

    store().toggleSkill(TAILWIND)
    store().setAgentOption(WEB_DEV, { scope: "project" })
    store().cycleAssignment(TAILWIND, WEB_DEV)

    expect(store().skills[TAILWIND]?.assignments[WEB_DEV]).toStrictEqual({
      load: "lazy",
      enabled: true,
    })
  })

  it("is as it arrived once switched back to global, the rows it carries included", () => {
    const arrived = open(projectLink())

    store().setAgentOption(WEB_DEV, { scope: "project" })
    store().setAgentOption(WEB_DEV, { model: "haiku" })
    store().cycleAssignment(REACT, WEB_DEV)
    store().setAgentOption(WEB_DEV, { scope: "global" })

    expect({
      agent: store().agents[WEB_DEV],
      row: store().skills[REACT]?.assignments[WEB_DEV],
    }).toStrictEqual({
      agent: arrived.agents[WEB_DEV],
      row: arrived.skills[REACT]?.assignments[WEB_DEV],
    })
  })
})

// Start from scratch, a stack, a save: each replaces the whole selection.
describe("a whole new selection on a project's link", () => {
  // Has Svelte, and gives the held sub-agents rows of its own.
  const STACK_WITHOUT_REACT = "sveltekit-fullstack"
  const STACK_WITH_VUE = "vue-modern-fullstack"

  const heldAgentsOf = (config: PersistedConfig) =>
    Object.fromEntries(
      REACT_AGENTS.map((agent) => [agent, config.agents[agent]])
    )

  const heldRowsOf = (config: PersistedConfig) =>
    Object.entries(config.skills)
      .filter(([skillId]) => skillId !== REACT)
      .flatMap(([skillId, entry]) =>
        REACT_AGENTS.filter((agent) => entry.assignments[agent]).map(
          (agent) => `${skillId} on ${agent}`
        )
      )

  it("keeps the global entries through Start from scratch", () => {
    const arrived = open(projectLink())

    store().applyStack(null)

    expect({
      skills: store().skills,
      agents: heldAgentsOf(store()),
      projectAgentOn: isAgentOn(store(), API_DEV),
    }).toStrictEqual({
      skills: { [REACT]: arrived.skills[REACT] },
      agents: heldAgentsOf(arrived),
      projectAgentOn: false,
    })
  })

  it("keeps the global entries through a stack, and its sub-agents take none of the stack's skills", () => {
    const arrived = open(projectLink())

    store().applyStack(STACK_WITHOUT_REACT)

    expect({
      stackId: store().stackId,
      react: store().skills[REACT],
      agents: heldAgentsOf(store()),
      heldRows: heldRowsOf(store()),
    }).toStrictEqual({
      stackId: STACK_WITHOUT_REACT,
      react: arrived.skills[REACT],
      agents: heldAgentsOf(arrived),
      heldRows: [],
    })
  })

  it("leaves out a stack's skill that would swap a global one out", () => {
    const arrived = open(projectLink())

    store().applyStack(STACK_WITH_VUE)

    expect([store().skills[REACT], VUE in store().skills]).toStrictEqual([
      arrived.skills[REACT],
      false,
    ])
  })

  it("keeps the global entries through a save", () => {
    const arrived = open(projectLink())

    store().applySavedStack(
      fromSeedPayload(cliMintedPayload({ [HONO]: freshlyPickedSkill(HONO) }))
    )

    expect([store().skills[REACT], HONO in store().skills]).toStrictEqual([
      arrived.skills[REACT],
      true,
    ])
  })

  it("keeps a global skill's project copy as it is", () => {
    open(projectLink())
    store().setSkillOption(REACT, { scope: "project" })
    store().setSkillOption(REACT, { install: "eject" })

    store().applyStack(null)

    expect({
      install: store().skills[REACT]?.install,
      scope: store().skills[REACT]?.scope,
    }).toStrictEqual({ install: "eject", scope: "project" })
  })

  // The control: only a project's link keeps anything.
  it("keeps nothing of a link made anywhere but a project", () => {
    open(cliMintedPayload({ [REACT]: freshlyPickedSkill(REACT) }))

    store().applyStack(null)

    expect(store().skills).toStrictEqual({})
  })
})

describe("a link made anywhere but a project", () => {
  // The same entries at the same scopes, so only the mark differs.
  it("leaves its global skill free to switch off and change", () => {
    open(cliMintedPayload({ [REACT]: freshlyPickedSkill(REACT) }))

    store().setSkillOption(REACT, { install: "eject" })
    expect(store().skills[REACT]?.install).toBe("eject")

    store().toggleSkill(REACT)
    expect(REACT in store().skills).toBe(false)
  })

  it("leaves its global sub-agent free to switch off", () => {
    open(cliMintedPayload({ [REACT]: freshlyPickedSkill(REACT) }))

    store().toggleAgentPin(WEB_DEV)

    expect(isAgentOn(store(), WEB_DEV)).toBe(false)
  })
})

// Only a bare `edit` run in a project marks a link; the editor's own Share,
// Install and Save never do.
describe("the link a held configuration mints", () => {
  it("says nothing of a project", () => {
    open(projectLink())

    expect(toSeedPayload(store())).not.toHaveProperty("fromProject")
  })

  it("opens with a skill picked while held free, since no global install holds it", () => {
    open(projectLink())
    store().toggleSkill(TAILWIND)

    open(toSeedPayload(store()))
    store().toggleSkill(TAILWIND)

    expect(TAILWIND in store().skills).toBe(false)
  })

  it("opens with a sub-agent switched on while held free, since no global install holds it", () => {
    open(projectLink())
    store().toggleAgentPin(CLI_DEV)

    open(toSeedPayload(store()))
    store().toggleAgentPin(CLI_DEV)

    expect(isAgentOn(store(), CLI_DEV)).toBe(false)
  })
})

// A refused press is no change, so nothing reaches the slot or the counts.
describe("an option press a held entry refuses", () => {
  const events: AnalyticsEvent[] = []
  const configured = () =>
    events.filter(
      (event) =>
        event.name === "skill_configured" || event.name === "agent_configured"
    )
  let writes = 0
  let unsubscribe = () => {}

  beforeEach(() => {
    setAnalyticsSink((event) => events.push(event))
    open(projectLink())
    writes = 0
    unsubscribe = useConfigStore.subscribe(() => {
      writes += 1
    })
  })

  afterEach(() => {
    unsubscribe()
    setAnalyticsSink(() => undefined)
    events.length = 0
  })

  it("writes and counts nothing for a held skill's install mode", () => {
    store().setSkillOption(REACT, { install: "eject" })

    expect({ writes, configured: configured() }).toStrictEqual({
      writes: 0,
      configured: [],
    })
  })

  it("writes and counts nothing for a held sub-agent's model", () => {
    store().setAgentOption(WEB_DEV, { model: "haiku" })

    expect({ writes, configured: configured() }).toStrictEqual({
      writes: 0,
      configured: [],
    })
  })

  // The control: the scope press on the same entries goes through.
  it("writes and counts a held skill's switch to project", () => {
    store().setSkillOption(REACT, { scope: "project" })

    expect({ writes, configured: configured() }).toStrictEqual({
      writes: 1,
      configured: [
        {
          name: "skill_configured",
          skillId: REACT,
          field: "scope",
          value: "project",
        },
      ],
    })
  })

  it("writes and counts a held sub-agent's switch to project", () => {
    store().setAgentOption(WEB_DEV, { scope: "project" })

    expect({ writes, configured: configured() }).toStrictEqual({
      writes: 1,
      configured: [
        {
          name: "agent_configured",
          agentId: WEB_DEV,
          field: "scope",
          value: "project",
        },
      ],
    })
  })
})
