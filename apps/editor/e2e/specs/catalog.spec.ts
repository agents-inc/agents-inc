import { expect, test } from "../fixtures"
import {
  DOMAIN_REACH,
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  INCOMPATIBLE,
  MULTI_CATEGORY,
  SINGLE_AGENT_SKILL,
  STACKS,
} from "../support/catalog"

// The catalogue is regenerated from the agents-inc CLI, so the fixed points the
// other specs lean on will drift eventually. These assertions exist so that
// drift surfaces as one failure naming the value that moved, rather than as
// every other spec going red at once.
test.describe("catalog assumptions", () => {
  test("the stacks the specs use are present", async ({ configure }) => {
    for (const name of Object.values(STACKS)) {
      await expect(configure.stack(name)).toBeVisible()
    }
  })

  test("the domains the specs use are present", async ({ configure }) => {
    for (const label of Object.values(DOMAINS)) {
      await expect(configure.domain(label)).toBeVisible()
    }
  })

  test("the exclusive category holds both skills and is tagged", async ({
    configure,
  }) => {
    const category = configure.category(DOMAINS.web, EXCLUSIVE_CATEGORY.name)

    await expect(category).toContainText(EXCLUSIVE_CATEGORY.tag)
    await expect(
      configure.skill(EXCLUSIVE_CATEGORY.first, category).root
    ).toBeVisible()
    await expect(
      configure.skill(EXCLUSIVE_CATEGORY.second, category).root
    ).toBeVisible()
  })

  test("the multi category holds both skills and is tagged", async ({
    configure,
  }) => {
    const category = configure.category(DOMAINS.web, MULTI_CATEGORY.name)

    await expect(category).toContainText(MULTI_CATEGORY.tag)
    await expect(
      configure.skill(MULTI_CATEGORY.first, category).root
    ).toBeVisible()
    await expect(
      configure.skill(MULTI_CATEGORY.second, category).root
    ).toBeVisible()
  })

  // A stack skill reaching exactly ONE sub-agent is the fixed point that lets a
  // spec build a project-scoped configuration and then resolve it (EDITOR-08).
  // Both halves are upstream: which skill reaches one agent, and which one.
  //
  // Asserted through the STACK rather than a fresh pick, and that is the fact
  // itself rather than a detail of the setup: a hand-picked skill takes the
  // shared relevance rule and reaches its whole domain, while a stack skill
  // takes the stack author's own word. Only the second of those is one.
  test("the single-agent stack skill still reaches exactly one sub-agent", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    const skill = configure.skillIn(
      DOMAINS.web,
      SINGLE_AGENT_SKILL.category,
      SINGLE_AGENT_SKILL.name
    )

    await expect(skill.agentCount).toHaveText("1 agent")
    await expect(
      configure.roster.skillRow(
        SINGLE_AGENT_SKILL.name,
        SINGLE_AGENT_SKILL.agentId
      )
    ).toBeVisible()
  })

  // The roster is upstream data as well, and the relevance rule reaches a
  // whole domain of it, so every agent count in the suite moves the moment a
  // domain gains or loses an agent. This is the one failure that names the
  // number rather than the six specs that lean on it.
  test("a domain skill reaches as many agents as the specs expect", async ({
    configure,
  }) => {
    const skill = configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      EXCLUSIVE_CATEGORY.first
    )
    await skill.toggle()

    await expect(skill.agentCount).toHaveText(`${DOMAIN_REACH.web} agents`)
  })

  // The relationship data is upstream and can be re-authored, so the pair the
  // incompatibility spec leans on gets its own guard: if the requirement chain
  // is ever rewritten, this names it rather than the eight specs downstream.
  test("the incompatible pair still is one", async ({ configure }) => {
    const trigger = configure.skillIn(
      DOMAINS.web,
      INCOMPATIBLE.triggerCategory,
      INCOMPATIBLE.trigger
    )
    const blocked = configure.skillIn(
      DOMAINS.web,
      INCOMPATIBLE.blockedCategory,
      INCOMPATIBLE.blocked
    )

    await expect(blocked.root).toBeEnabled()
    await trigger.toggle()

    await expect(blocked.root).toBeDisabled()
    expect(await blocked.incompatibleReason()).toBe(INCOMPATIBLE.reason)
  })
})
