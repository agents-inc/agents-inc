/**
 * The template split C5 needs, and the one claim that makes it safe: **the
 * Claude render does not move a byte.**
 *
 * C5 splits `src/agents/_templates/agent.liquid` into a frontmatter part and a
 * body part, because Codex's agent ROLE DEFINITION file has no frontmatter — its
 * `developer_instructions` key carries the body alone, and a Claude-shaped
 * frontmatter block reaching a TOML renderer would either be quoted into the
 * instructions as noise or emit keys the strict deserializer drops the whole
 * file for.
 *
 * **Why the invariant here is composition rather than a golden.** A recorded
 * golden of today's Claude output would pass on the day it is written and say
 * nothing about the split: it can only fail AFTER the split lands, and a golden
 * the implementing pass can regenerate is a golden the implementing pass will
 * regenerate. Asserting instead that {@link renderAgentBody} is exactly the tail
 * of {@link renderAgent} makes `renderAgent` itself the reference — so a body
 * renderer that changed one byte of the Claude output cannot satisfy it, and
 * `renderAgent`'s own bytes stay pinned where they already are: the recorded
 * trees in `e2e/lifecycle/claude-install-byte-identity.e2e.test.ts`, the corpus
 * goldens, and `scripts/generate-compile-package.test.ts`.
 *
 * **The frontmatter half is asserted as an absence, deliberately named.** The
 * body must not open with the `---` fence, and its opening lines must not hold
 * `tools:`, `disallowedTools:`, `permissionMode:` or `model:` — Claude
 * frontmatter keys that, left at the head of a body, would be carried into
 * `developer_instructions` as prose, where Codex reads none of them as a
 * setting. Only the opening lines are read: that is where a frontmatter the
 * split failed to remove would sit, and a body's own prose may name these keys
 * further down — `agent-summoner`'s names all four in a `metadata.yaml`
 * example (measured 2026-09-26). Each is first shown to be IN the frontmatter,
 * because the absence of a key the render never wrote proves nothing about
 * where it went.
 *
 * Written before `renderAgentBody` existed and red on the missing export.
 */

import { describe, expect, it } from "vitest"

import {
  buildAgentTemplateContext,
  renderAgent,
  renderAgentBody,
} from "./agent-source"
import { createEngineFromTemplates } from "./engine"
import {
  AGENT_CORPUS,
  CORPUS_CLI_VERSION,
  CORPUS_TEMPLATES,
} from "./generated/corpus"
import { sourceDirName } from "./source-layout"
import type { AgentConfig, AgentName } from "./types"
import {
  buildAgentConfig,
  buildSkill,
} from "./__tests__/factories/agent-config-factories"

/** The frontmatter fence, as the template writes it. Kept a literal on purpose. */
const FENCE = "---"

/** A grant holding `Write`, which is what earns a sub-agent the completion gate's `hooks:` line. */
const WRITER_TOOLS = ["Read", "Write", "Edit", "Grep", "Glob", "Bash"]

/** A grant with no writing tool, so the frontmatter the split leaves behind carries no `hooks:`. */
const READER_TOOLS = ["Read", "Grep", "Glob", "Bash"]

/**
 * Three shipped sub-agents covering the shapes the split has to survive: a
 * writer with a completion gate, a reader without one, and a second writer —
 * each rendered carrying both a preloaded and a dynamic skill.
 *
 * Named members rather than "some agent", because the risk is a body renderer
 * that is correct for the simple shape and drops a section for the others. The
 * grant is stated per subject because it is what decides the shape: every
 * subject was rendered with a writer's tools until 2026-09-26, so the reader
 * this names was never rendered as one.
 */
const SUBJECTS = [
  ["web-developer", WRITER_TOOLS],
  ["web-researcher", READER_TOOLS],
  ["cli-developer", WRITER_TOOLS],
] as const

const DYNAMIC_SKILL = buildSkill("meta-design-expressive-typescript", {
  preloaded: false,
})

const PRELOADED_SKILL = buildSkill("web-framework-react", { preloaded: true })

/**
 * The frontmatter keys a body must not open with. The template writes `tools`,
 * `model` and `permissionMode` into every agent's frontmatter — the last two
 * through a default when the definition sets none — and `disallowedTools` only
 * when it is set, which is why the spec reading this list sets one.
 */
const FRONTMATTER_ONLY_KEYS = [
  "tools:",
  "permissionMode:",
  "model:",
  "disallowedTools:",
]

/** The engine a corpus render uses, built for a Claude installation. */
function claudeEngine() {
  return createEngineFromTemplates(CORPUS_TEMPLATES, {
    sourceFolder: sourceDirName("claude"),
  })
}

async function renderBoth(
  name: AgentName,
  fields: Pick<AgentConfig, "tools" | "skills"> &
    Pick<Partial<AgentConfig>, "disallowedTools">
): Promise<{ whole: string; body: string }> {
  const context = buildAgentTemplateContext(
    name,
    buildAgentConfig(name, { model: "opus", ...fields }),
    AGENT_CORPUS[name]
  )

  return {
    whole: await renderAgent(claudeEngine(), context, CORPUS_CLI_VERSION),
    body: await renderAgentBody(claudeEngine(), context, CORPUS_CLI_VERSION),
  }
}

describe("the body render against the whole Claude render", () => {
  for (const [name, tools] of SUBJECTS) {
    it(`is exactly the tail of ${name}'s compiled markdown`, async () => {
      const { whole, body } = await renderBoth(name, {
        tools,
        skills: [PRELOADED_SKILL, DYNAMIC_SKILL],
      })

      expect(
        whole.endsWith(body),
        `${name}'s body render is not a suffix of its Claude render — the split moved a byte`
      ).toBe(true)
    })

    it(`leaves only ${name}'s frontmatter in front of it`, async () => {
      const { whole, body } = await renderBoth(name, {
        tools,
        skills: [PRELOADED_SKILL, DYNAMIC_SKILL],
      })
      const frontmatter = whole.slice(0, whole.length - body.length)

      expect(
        frontmatter.includes("\nhooks:"),
        `${name} is not the shape it was chosen for — a writer carries the completion gate and a reader does not`
      ).toBe(tools.includes("Write"))
      expect(frontmatter.startsWith(`${FENCE}\n`)).toBe(true)
      expect(frontmatter.trimEnd().endsWith(FENCE)).toBe(true)
    })
  }

  it("is the tail for an agent carrying no skills at all", async () => {
    const { whole, body } = await renderBoth("reviewer", {
      tools: WRITER_TOOLS,
      skills: [],
    })
    const frontmatter = whole.slice(0, whole.length - body.length)

    expect(whole.endsWith(body)).toBe(true)
    // The empty string is a suffix of every render, so the comparison above holds for a body
    // renderer that dropped everything. What stands in front of the body has to be the
    // frontmatter and nothing else, which an empty or truncated body cannot leave.
    expect(
      frontmatter.trimEnd().endsWith(FENCE),
      "the body is not the whole of what follows the frontmatter"
    ).toBe(true)
  })
})

describe("what the body must not carry into a Codex role file", () => {
  it("does not open with the frontmatter fence", async () => {
    const { body } = await renderBoth("web-developer", {
      tools: WRITER_TOOLS,
      skills: [DYNAMIC_SKILL],
    })

    expect(body.startsWith(FENCE)).toBe(false)
  })

  it("opens with none of tools, disallowedTools, permissionMode or model, which Codex would read as prose", async () => {
    const { whole, body } = await renderBoth("web-developer", {
      tools: WRITER_TOOLS,
      disallowedTools: ["WebFetch"],
      skills: [PRELOADED_SKILL, DYNAMIC_SKILL],
    })
    const frontmatter = whole.slice(0, whole.length - body.length)
    const head = body.split("\n").slice(0, 4).join("\n")

    for (const key of FRONTMATTER_ONLY_KEYS) {
      expect(
        frontmatter,
        `the frontmatter carries no ${key}, so its absence from the body proves nothing`
      ).toContain(`\n${key}`)
      expect(
        head,
        `the body opens with ${key}, which belongs to the frontmatter`
      ).not.toContain(key)
    }
  })

  it("still carries the provenance marker, which Codex reads back as ours", async () => {
    const { body } = await renderBoth("web-developer", {
      tools: WRITER_TOOLS,
      skills: [DYNAMIC_SKILL],
    })

    expect(body).toContain("Generated by")
  })
})

describe("the Claude frontmatter the split leaves behind", () => {
  it("still grants the Skill tool, whatever moved out of the context builder", async () => {
    const { whole, body } = await renderBoth("web-developer", {
      tools: WRITER_TOOLS,
      skills: [DYNAMIC_SKILL],
    })
    const frontmatter = whole.slice(0, whole.length - body.length)

    expect(frontmatter).toContain("Skill")
  })

  it("still lists a preloaded skill, which Codex has no key for", async () => {
    const { whole, body } = await renderBoth("web-developer", {
      tools: WRITER_TOOLS,
      skills: [PRELOADED_SKILL],
    })
    const frontmatter = whole.slice(0, whole.length - body.length)

    expect(frontmatter).toContain(PRELOADED_SKILL.id)
  })
})
