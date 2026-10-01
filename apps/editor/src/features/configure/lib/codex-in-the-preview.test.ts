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

/**
 * THE PREVIEW ON CODEX, AND THE PARITY CLAIM UNDER IT.
 *
 * The dialog is worth building only if somebody can diff it against a real
 * install and have it survive — the design file's own words, "the moment
 * someone diffs it against reality and it is off, they stop trusting the
 * configurator". On Codex that claim is a LARGER one than on Claude, because
 * a Codex sub-agent is not the same FILE. It is an agent role definition —
 * `name`, `description` and `developer_instructions` in TOML, with the prose
 * carried whole inside a multi-line string — parsed by a strict deserializer
 * that drops the entire file on one unknown key and says so only in a startup
 * warning nobody is reading.
 *
 * SO THERE IS STILL ONLY ONE BUILDER. `renderAgentRoleToml` over
 * `renderAgentBody` in `@workspace/compile` is what the CLI's `compiler.ts`
 * calls on the install path; the preview has to call the same pair. A
 * hand-rolled TOML escape, a body that kept its frontmatter fence, a key
 * emitted in the wrong order relative to `[features]` — every one of those
 * shows up here as a difference in the bytes, and every one of them is a file
 * Codex would drop in silence.
 *
 * THE SECOND ARGUMENT IS THE CONTRACT THIS FILE PINS. `buildOutputPreview`
 * takes the provider beside the payload rather than reading it out of one:
 * ruling 3 keeps the provider off the wire, so the payload cannot carry it and
 * a preview of a Codex install has to be told.
 *
 * THE TWO SUB-AGENTS ARE ASSERTED WITH THEIR SIXTEEN. A preview that drew no
 * role files at all satisfies "draws no summoner" for free, which is exactly
 * what a preview still rendering Claude markdown would hand it, so every
 * absence below is paired with the presence that gives it a channel.
 */

// A read-only sub-agent: it holds neither Write nor Edit.
const READ_ONLY_AGENT = "api-researcher"

// A writing sub-agent, whose `AgentConfig` reaches the renderer with the
// writing tools the read-only one above lacks.
const WRITING_AGENT = "web-developer"

const GLOBAL_BASE = "~/"

const rootOf = (preview: OutputPreview, base: string) =>
  preview.roots.find((root) => root.base === base)

/**
 * One compiled sub-agent's row, found by the file it is written as.
 *
 * The EXTENSION is half the lookup rather than an incidental suffix: it is the
 * cheapest statement that the provider reached the tree at all, and a helper
 * that searched for `${agentName}.md` would report `undefined` for a correct
 * Codex preview — which reads as "the sub-agent is missing" rather than as
 * "looked for the wrong file".
 */
const roleNodeOf = (preview: OutputPreview, base: string, agent: string) =>
  rootOf(preview, base)?.nodes.find((node) => node.id.endsWith(`${agent}.toml`))

/** Every role file one root draws, by the sub-agent each one is for. */
const roleNamesIn = (preview: OutputPreview, base: string) =>
  (rootOf(preview, base)?.nodes ?? [])
    .filter((node) => node.id.endsWith(".toml"))
    .map((node) => node.name.replace(/\.toml$/, ""))

/**
 * What the CLI would compile for the sub-agent this root's `config.ts` lists.
 *
 * The ENGINE is built for the provider being previewed, because a compiled
 * sub-agent's prose can name the install's source folder and the answer is
 * `.agents-inc/codex/` here. A reference built on the Claude engine would agree
 * with a preview that made the same mistake.
 */
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

  // The control, and the whole reason the argument exists: the same payload
  // previews as a Claude install when that is what it is asked for. Without it
  // the assertion above is equally satisfied by a preview that had stopped
  // drawing Claude altogether.
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

  // The markdown is not merely joined by the TOML — it is REPLACED by it. A
  // tree drawing both would put two files on disk for one sub-agent and count
  // them both in the footer.
  //
  // The role file is the subject guard, asserted first: an empty list below is
  // equally what a preview that drew no root at all would hand it.
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
  // Both pinned ON, with a sub-agent beside them that Codex does compile. The
  // pins are what make this a claim about the PROVIDER: left to rest, the two
  // are off and no preview would have drawn them anyway.
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

  // The control at the other end of the same configuration: on Claude they are
  // ordinary sub-agents and the preview writes them. So the absence above is
  // the provider's doing rather than a pin that never took.
  it("draws both of them on Claude", async () => {
    const preview = await withBothSummonersPinnedOn("claude")
    const written = (rootOf(preview, GLOBAL_BASE)?.nodes ?? []).map(
      (node) => node.name
    )

    for (const present of AGENTS_NOT_ON_CODEX) {
      expect(written).toContain(`${present}.md`)
    }
  })

  /**
   * The roster the preview is filtering against is the product's, not this
   * file's.
   *
   * Asserted by MEMBERSHIP in both directions rather than by a count: a count
   * cannot tell a summoner swapped for a nineteenth sub-agent from a roster
   * that never moved, and the nineteenth is the case this spec exists to
   * survive — `CODEX_AGENT_ROSTER` is derived, so a new sub-agent is on Codex
   * the day it ships and nothing here should need editing for it.
   */
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

  /**
   * The subject guard for both above.
   *
   * Two renders that both produced nothing compare equal, and so do two that
   * both produced Claude markdown. What tells a real comparison from those is
   * that the thing compared is a TOML role: the three keys Codex requires,
   * present by name. A file missing any one of them is dropped whole with
   * `must define 'developer_instructions'` — measured on the pinned 0.155.1 —
   * so this is also the shape the install depends on.
   */
  it("compares a file that is actually an agent role definition", async () => {
    const preview = await buildOutputPreview(
      bareAgentsPayload({ [READ_ONLY_AGENT]: { on: true } }),
      "codex"
    )
    const body = roleNodeOf(preview, GLOBAL_BASE, READ_ONLY_AGENT)?.body ?? ""

    expect(body).toContain(`name = "${READ_ONLY_AGENT}"`)
    expect(body).toContain("description = ")
    expect(body).toContain('developer_instructions = """')
    // And the fence that would mean the Claude render leaked in whole.
    expect(body.startsWith("---")).toBe(false)
  })
})
