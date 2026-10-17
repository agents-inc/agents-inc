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

// Fixed points the other specs lean on, so catalogue drift fails here by name.
test.describe("catalog assumptions", () => {
  // `clearScratch` is the first cell's other name, worn only once something is
  // selected.
  test("the stacks the specs use are present", async ({ configure }) => {
    for (const [key, name] of Object.entries(STACKS)) {
      if (key === "clearScratch") continue
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

  // A stack skill reaching exactly one sub-agent, so a spec can build a scope
  // error and resolve it.
  test("the single-agent stack skill still reaches exactly one sub-agent", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)

    // Counted off the roster: how many rows the skill has, and that its one row
    // is the named agent.
    await expect(
      configure.roster.skillRowsFor(SINGLE_AGENT_SKILL.name)
    ).toHaveCount(1)
    await expect(
      configure.roster.skillRow(
        SINGLE_AGENT_SKILL.name,
        SINGLE_AGENT_SKILL.agentId
      )
    ).toBeVisible()
  })

  // The roster is upstream data, so every agent count in the suite moves with
  // it.
  test("a domain skill reaches as many agents as the specs expect", async ({
    configure,
  }) => {
    const skill = configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      EXCLUSIVE_CATEGORY.first
    )
    await skill.toggle()

    await expect(
      configure.roster.skillRowsFor(EXCLUSIVE_CATEGORY.first)
    ).toHaveCount(DOMAIN_REACH.web)
  })

  // Relationships are upstream, so the incompatibility spec's pair gets its own
  // guard.
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
