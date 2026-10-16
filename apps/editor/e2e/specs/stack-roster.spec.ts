import { MATRIX, seedPayloadSchema } from "@workspace/matrix"

import { expect, test as base } from "../fixtures"
import { STACKS } from "../support/catalog"
import {
  buildMarketplace,
  installFrom,
  startStandIns,
} from "../support/install"
import { captureCreateConfig } from "../support/sharing"

import type { BuiltMarketplace, StandIns } from "../support/install"
import type { SeedPayload } from "@workspace/matrix"

/**
 * PICKING A STACK INSTALLS EVERY SUB-AGENT THE STACK DECLARES — one declared
 * with no skills included (journeys 2 and 12). Such a sub-agent is named by no
 * assignment, so it reaches the install only if applying the stack switches it
 * on: the Install dialog, the preview and `init --from` must each name it.
 */

type Crossing = { marketplace: BuiltMarketplace; standIns: StandIns }

// The install crossing needs the stand-ins; the other specs never touch them.
const test = base.extend<object, { crossing: Crossing }>({
  crossing: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies off this pattern, and this one has none
    async ({}, use) => {
      const marketplace = await buildMarketplace()
      const standIns = await startStandIns(marketplace)
      await use({ marketplace, standIns })
      await standIns.close()
      await marketplace.cleanup()
    },
    { scope: "worker", timeout: 60_000 },
  ],
})

const SKILL_LESS_AGENT = "cli-tester"

// Copy the product renders, mirrored rather than imported.
const BASE_AGENT = "no skills — base agent"
const SKILL_LESS_ROW = "cli · tester"

const STACK = MATRIX.suggestedStacks.find(
  (stack) => stack.name === STACKS.nextjs
)!

// The roster as the catalogue declares it — the claim is about the stack's
// own word, whatever it says.
const DECLARED_ROSTER = Object.keys(STACK.skills).sort()

const COMPILED_AGENT_FILE = /^~\/\.claude\/agents\/[^/]+\.md$/

const compiledAgentPaths = (paths: readonly (string | null)[]) =>
  paths.filter((path) => path !== null && COMPILED_AGENT_FILE.test(path)).sort()

const DECLARED_AGENT_FILES = DECLARED_ROSTER.map(
  (agentId) => `~/.claude/agents/${agentId}.md`
)

// Plugin installs reach the network through `claude plugin install`, so the
// crossing installs the same payload ejected. The install mode decides where
// a skill's files come from, never which sub-agents are compiled.
const asEjected = (payload: SeedPayload): SeedPayload => ({
  ...payload,
  skills: Object.fromEntries(
    Object.entries(payload.skills).map(([skillId, skill]) => [
      skillId,
      { ...skill, install: "eject" as const },
    ])
  ),
})

test.describe("a stack declaring a sub-agent with no skills", () => {
  test.beforeAll(() => {
    expect(STACK.skills[SKILL_LESS_AGENT]).toStrictEqual({})
  })

  test("the Install dialog lists every sub-agent it declares", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.roster.installButton).toContainText(
      `${String(DECLARED_ROSTER.length)} agents`
    )

    await configure.roster.installButton.click()
    await expect(configure.installDialog.agentRows).toHaveCount(
      DECLARED_ROSTER.length
    )
    await expect(configure.installDialog.agentsPane).toContainText(
      SKILL_LESS_ROW
    )
    await expect(configure.installDialog.agentsPane).toContainText(BASE_AGENT)

    await expect.poll(() => posted.length).toBe(1)
    expect(
      seedPayloadSchema.parse(posted[0]).agents[SKILL_LESS_AGENT]
    ).toStrictEqual({ on: true })
  })

  test("the preview draws a file for every sub-agent it declares", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure.roster.previewButton.click()

    expect(
      compiledAgentPaths(await configure.outputPreviewDialog.rowPaths())
    ).toStrictEqual(DECLARED_AGENT_FILES)
  })

  test("init --from compiles every sub-agent it declares", async ({
    configure,
    crossing,
    page,
  }) => {
    test.setTimeout(120_000)

    const posted = captureCreateConfig(page)
    await configure.chooseStack(STACKS.nextjs)
    await configure.roster.installButton.click()
    await expect.poll(() => posted.length).toBe(1)

    const id = "StkRost1"
    await crossing.standIns.publish(
      id,
      asEjected(seedPayloadSchema.parse(posted[0]))
    )
    const installed = await installFrom(crossing.standIns, id)

    expect(installed.exitCode, installed.output).toBe(0)
    expect(compiledAgentPaths(Object.keys(installed.files))).toStrictEqual(
      DECLARED_AGENT_FILES
    )
  })
})
