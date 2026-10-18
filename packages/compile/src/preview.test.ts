// The corpus names the install's source folder in prose; the preview renders it per provider.

import { describe, expect, it } from "vitest"

import { renderAgentFromCorpus, renderAgentRoleFromCorpus } from "./preview"
import { buildAgentConfig } from "./__tests__/factories/agent-config-factories"

// The one shipped sub-agent whose partials name the source folder.
const SUMMONER = buildAgentConfig("agent-summoner", {
  tools: ["Read", "Grep"],
  skills: [],
})

describe("the source folder a previewed sub-agent names", () => {
  it("is the Claude installation's for a Claude agent", async () => {
    const rendered = await renderAgentFromCorpus("agent-summoner", SUMMONER)

    expect(rendered).toContain("`.agents-inc/claude/config.ts`")
  })

  it("is the Codex installation's for a Codex role", async () => {
    const rendered = await renderAgentRoleFromCorpus("agent-summoner", SUMMONER)

    expect(rendered).toContain("`.agents-inc/codex/config.ts`")
  })
})
