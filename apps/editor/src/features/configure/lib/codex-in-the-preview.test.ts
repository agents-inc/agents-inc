import { sourceDirName } from "@workspace/compile"
import {
  AGENTS_NOT_ON_CODEX,
  CODEX_AGENT_ROSTER,
  buildAgentTemplateContext,
  renderAgentBody,
  renderAgentRoleToml,
} from "@workspace/compile/agent-source"
import {
  AGENT_CORPUS,
  CORPUS_CLI_VERSION,
  CORPUS_TEMPLATES,
} from "@workspace/compile/corpus"
import { createEngineFromTemplates } from "@workspace/compile/engine"
import { AGENT_DEFINITIONS } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { bareAgentsPayload } from "@/__tests__/factories/seed-payload-factories"

import { buildOutputPreview } from "./output-preview"

import type { OutputPreview } from "./output-preview"

// Codex drops a whole role file on one unknown key, silently, so the preview
// must match the CLI's `renderAgentRoleToml` byte for byte. Every absence is
// paired with a presence, so an empty preview cannot pass.

const READ_ONLY_AGENT = "api-researcher"
const WRITING_AGENT = "web-developer"

const GLOBAL_BASE = "~/"

const rootOf = (preview: OutputPreview, base: string) =>
  preview.roots.find((root) => root.base === base)

const roleNodeOf = (preview: OutputPreview, base: string, agent: string) =>
  rootOf(preview, base)?.nodes.find((node) => node.id.endsWith(`${agent}.toml`))

const roleNamesIn = (preview: OutputPreview, base: string) =>
  (rootOf(preview, base)?.nodes ?? [])
    .filter((node) => node.id.endsWith(".toml"))
    .map((node) => node.name.replace(/\.toml$/, ""))

// Built on the Codex engine: the prose can name the provider's source folder.
const asTheCliWouldCompileIt = async (
  preview: OutputPreview,
  base: string,
  agentName: keyof typeof AGENT_DEFINITIONS
) => {
  const root = rootOf(preview, base)
  expect(root, `the preview drew no ${base} root`).toBeDefined()

  const entry = root?.config.agents.find((agent) => agent.name === agentName)
  expect(
    entry,
    `the ${base} root's config holds no entry for ${agentName}`
  ).toBeDefined()

  const definition = AGENT_DEFINITIONS[agentName]

  const agent = {
    name: agentName,
    title: definition.title,
    description: definition.description,
    model: definition.model,
    tools: [...definition.tools],
    skills: [],
    path: definition.path,
  }

  const engine = createEngineFromTemplates(CORPUS_TEMPLATES, {
    sourceFolder: sourceDirName("codex"),
  })

  return renderAgentRoleToml(
    agent,
    await renderAgentBody(
      engine,
      buildAgentTemplateContext(agentName, agent, AGENT_CORPUS[agentName]),
      CORPUS_CLI_VERSION
    )
  )
}

describe("the tree a Codex install writes", () => {
  it("draws the config pair in the provider's own folder", async () => {
    const preview = await buildOutputPreview(
      bareAgentsPayload({ [READ_ONLY_AGENT]: { on: true } }),
      "codex"
    )

    expect(
      rootOf(preview, GLOBAL_BASE)?.nodes.map((node) => node.id)
    ).toContain(`${GLOBAL_BASE}.agents-inc/codex/`)
  })

  it("draws the Claude folder when Claude is the provider", async () => {
    const preview = await buildOutputPreview(
      bareAgentsPayload({ [READ_ONLY_AGENT]: { on: true } }),
      "claude"
    )

    expect(
      rootOf(preview, GLOBAL_BASE)?.nodes.map((node) => node.id)
    ).toContain(`${GLOBAL_BASE}.agents-inc/claude/`)
  })

  it("writes each sub-agent as an agent role file", async () => {
    const preview = await buildOutputPreview(
      bareAgentsPayload({ [READ_ONLY_AGENT]: { on: true } }),
      "codex"
    )

    expect(roleNodeOf(preview, GLOBAL_BASE, READ_ONLY_AGENT)?.id).toBe(
      `${GLOBAL_BASE}.codex/agents/${READ_ONLY_AGENT}.toml`
    )
  })

  it("writes no Claude sub-agent beside it", async () => {
    const preview = await buildOutputPreview(
      bareAgentsPayload({ [READ_ONLY_AGENT]: { on: true } }),
      "codex"
    )

    expect(
      roleNodeOf(preview, GLOBAL_BASE, READ_ONLY_AGENT),
      "the preview drew no role file, so the absence below has no subject"
    ).toBeDefined()
    expect(
      rootOf(preview, GLOBAL_BASE)!.nodes.filter((node) =>
        node.id.endsWith(".md")
      )
    ).toStrictEqual([])
  })
})

describe("the two sub-agents Codex leaves out", () => {
  // Pinned on, or they rest off and the absence proves nothing.
  const withBothSummonersPinnedOn = (provider: "claude" | "codex") =>
    buildOutputPreview(
      bareAgentsPayload({
        [AGENTS_NOT_ON_CODEX[0]]: { on: true },
        [AGENTS_NOT_ON_CODEX[1]]: { on: true },
        [READ_ONLY_AGENT]: { on: true },
      }),
      provider
    )

  it("draws neither of them, and does draw the one beside them", async () => {
    const roles = roleNamesIn(
      await withBothSummonersPinnedOn("codex"),
      GLOBAL_BASE
    )

    expect(roles).toContain(READ_ONLY_AGENT)
    for (const absent of AGENTS_NOT_ON_CODEX) {
      expect(roles).not.toContain(absent)
    }
  })

  it("draws both of them on Claude", async () => {
    const preview = await withBothSummonersPinnedOn("claude")
    const written = (rootOf(preview, GLOBAL_BASE)?.nodes ?? []).map(
      (node) => node.name
    )

    for (const present of AGENTS_NOT_ON_CODEX) {
      expect(written).toContain(`${present}.md`)
    }
  })

  // Membership, not a count: a count cannot see a swap.
  it("is filtering against the shipped Codex roster", () => {
    for (const absent of AGENTS_NOT_ON_CODEX) {
      expect(CODEX_AGENT_ROSTER).not.toContain(absent)
    }
    expect(CODEX_AGENT_ROSTER).toContain(READ_ONLY_AGENT)
  })
})

describe("the role file against the CLI's own render of it", () => {
  it("matches, byte for byte, for a read-only sub-agent", async () => {
    const preview = await buildOutputPreview(
      bareAgentsPayload({ [READ_ONLY_AGENT]: { on: true } }),
      "codex"
    )

    expect(
      roleNodeOf(preview, GLOBAL_BASE, READ_ONLY_AGENT)?.body
    ).toStrictEqual(
      await asTheCliWouldCompileIt(preview, GLOBAL_BASE, READ_ONLY_AGENT)
    )
  })

  it("matches, byte for byte, for a writing sub-agent", async () => {
    const preview = await buildOutputPreview(
      bareAgentsPayload({ [WRITING_AGENT]: { on: true } }),
      "codex"
    )

    expect(roleNodeOf(preview, GLOBAL_BASE, WRITING_AGENT)?.body).toStrictEqual(
      await asTheCliWouldCompileIt(preview, GLOBAL_BASE, WRITING_AGENT)
    )
  })

  // Subject guard for the two above: two empty renders also compare equal.
  it("compares a file that is actually an agent role definition", async () => {
    const preview = await buildOutputPreview(
      bareAgentsPayload({ [READ_ONLY_AGENT]: { on: true } }),
      "codex"
    )
    const body = roleNodeOf(preview, GLOBAL_BASE, READ_ONLY_AGENT)?.body ?? ""

    expect(body).toContain(`name = "${READ_ONLY_AGENT}"`)
    expect(body).toContain("description = ")
    expect(body).toContain('developer_instructions = """')
    expect(body.startsWith("---")).toBe(false)
  })
})
