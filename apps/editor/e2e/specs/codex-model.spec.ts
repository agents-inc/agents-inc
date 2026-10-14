import { SEED_VERSION } from "@workspace/matrix/seed"

import { expect, test } from "../fixtures"
import { AGENT_OPTIONS } from "../support/catalog"
import {
  STORED_ID,
  captureCreateConfig,
  captureCreateConfigBodies,
} from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"

// A per-agent Codex model travels as `codexModel` beside the Claude `model`.
// The provider never enters the payload (ruling 3), so both pins travel on
// either provider and each install reads its own.

const CONFIG_KEY = "agents-inc:config:v1"
// `PERSIST_VERSION`, mirrored: persisted-schema reaches a Vite-only module.
const CONFIG_VERSION = 8

const AGENT = "web-developer"
const SKILL_ID = "web-framework-react"
const CLAUDE_MODEL = "haiku"
const CODEX_MODEL = "gpt-5.6-terra"

const CLAUDE_COMMAND = `npx agents-inc init --from ${STORED_ID}`
const CODEX_COMMAND = `${CLAUDE_COMMAND} --provider codex`
const ROLE_FILE = `~/.codex/agents/${AGENT}.toml`

const STORED_PIN = JSON.stringify({
  state: {
    stackId: null,
    skills: {
      [SKILL_ID]: {
        install: "plugin",
        scope: "global",
        assignments: { [AGENT]: { load: "preloaded", enabled: true } },
      },
    },
    remembered: {},
    agents: { [AGENT]: { model: CLAUDE_MODEL, codexModel: CODEX_MODEL } },
  },
  version: CONFIG_VERSION,
})

const withStoredPin = async (configure: ConfigurePage) => {
  await configure.page.evaluate(
    ([key, blob]) => localStorage.setItem(key!, blob!),
    [CONFIG_KEY, STORED_PIN]
  )
  await configure.goto()
}

test.describe("a stored Codex model", () => {
  test("travels in the payload beside the Claude model", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    await withStoredPin(configure)

    await configure.roster.installButton.click()
    await expect(configure.installDialog.command(CLAUDE_COMMAND)).toBeVisible()

    expect(posted).toHaveLength(1)
    expect(posted[0]?.v).toBe(SEED_VERSION)
    expect(posted[0]?.agents).toStrictEqual({
      [AGENT]: { model: CLAUDE_MODEL, codexModel: CODEX_MODEL },
    })
  })

  test("leaves the payload byte-identical on Claude and Codex", async ({
    configure,
    page,
  }) => {
    const bodies = captureCreateConfigBodies(page)
    await withStoredPin(configure)

    await configure.roster.installButton.click()
    await expect(configure.installDialog.command(CLAUDE_COMMAND)).toBeVisible()
    await configure.installDialog.close()
    expect(bodies[0]).toContain(`"codexModel":"${CODEX_MODEL}"`)

    await configure.provider.choose("codex")
    await configure.roster.installButton.click()
    await expect(configure.installDialog.command(CODEX_COMMAND)).toBeVisible()

    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toBe(bodies[0])
  })

  test("draws its toggle pressed on Codex", async ({ configure }) => {
    const cards = configure.subAgents
    await withStoredPin(configure)
    await expect(cards.modelOption(AGENT, CLAUDE_MODEL)).toBeChecked()

    await configure.provider.choose("codex")

    for (const id of AGENT_OPTIONS.codexChoices) {
      await expect(cards.codexModelButton(AGENT, id)).toHaveAttribute(
        "aria-pressed",
        String(id === CODEX_MODEL)
      )
    }
  })

  test("pins the Codex role file in the preview", async ({ configure }) => {
    await withStoredPin(configure)
    await configure.provider.choose("codex")
    await configure.roster.previewButton.click()

    const preview = configure.outputPreviewDialog
    await preview.select(ROLE_FILE)

    await expect(preview.contentPane).toContainText(`name = "${AGENT}"`)
    await expect(preview.contentPane).toContainText(`model = "${CODEX_MODEL}"`)
    await expect(preview.contentPane).toContainText(
      `model_reasoning_effort = "medium"`
    )
  })
})
