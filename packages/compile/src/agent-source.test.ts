/**
 * The tool grant every compiled sub-agent carries.
 *
 * `tools:` in a sub-agent's frontmatter is an ALLOWLIST — an agent that
 * declares one gets exactly what it names, where an agent that omits the key
 * inherits every tool the session has. Every agent this product compiles
 * declares one, and none of the eighteen `metadata.yaml` files names `Skill`,
 * so every agent it has ever written was unable to invoke a skill.
 *
 * The `skills:` key does not close that: it preloads skill content into the
 * agent's startup context and grants no tool, so an agent can list skills and
 * still have no way to load one. That independence is why the defect survived
 * — a compiled agent looked fully skill-aware from its frontmatter — and it is
 * what these tests are really pinning.
 *
 * The two render cases go through `renderAgentFromCorpus`, which is the same
 * Liquid render an install performs, so what they assert is the literal
 * frontmatter line rather than a field on an object. They keep `"Skill"` as a
 * literal on purpose: an assertion that imported the constant the renderer
 * writes would move with it and could not fail.
 */

import { describe, expect, it } from "vitest"

import { buildAgentTemplateContext, type AgentFiles } from "./agent-source"
import { renderAgentFromCorpus } from "./preview"
import type { AgentConfig, Skill } from "./types"

/** The partials are not this file's subject; every case renders the same empty set. */
const NO_FILES: AgentFiles = {
  identity: "",
  playbook: "",
  output: "",
  criticalRequirementsTop: "",
  criticalReminders: "",
}

const DYNAMIC_SKILL: Skill = {
  id: "meta-design-expressive-typescript",
  path: "meta/design/expressive-typescript",
  description: "Readable functional patterns",
  usage: "when shaping types",
  preloaded: false,
}

const PRELOADED_SKILL: Skill = {
  id: "cli-framework-oclif-ink",
  path: "cli/framework/oclif-ink",
  description: "oclif command structure and Ink components",
  usage: "when working with cli-framework",
  preloaded: true,
}

describe("the tools a compiled sub-agent is granted", () => {
  it("adds Skill to a definition whose metadata omits it", () => {
    const agent: AgentConfig = {
      name: "cli-developer",
      title: "CLI Developer Agent",
      description: "Implements CLI features from detailed specs",
      tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
      skills: [DYNAMIC_SKILL],
    }

    const { agent: granted } = buildAgentTemplateContext(
      "cli-developer",
      agent,
      NO_FILES
    )

    expect(
      granted.tools,
      "a tools list is an allowlist, so an agent told to invoke Skill has to name it"
    ).toStrictEqual(["Read", "Write", "Edit", "Grep", "Glob", "Bash", "Skill"])
  })

  it("adds Skill to a read-only researcher, which grants no write access", () => {
    const agent: AgentConfig = {
      name: "cli-researcher",
      title: "CLI Researcher Agent",
      description: "Read-only CLI research specialist",
      tools: ["Read", "Grep", "Glob", "Bash"],
      skills: [DYNAMIC_SKILL],
    }

    const { agent: granted } = buildAgentTemplateContext(
      "cli-researcher",
      agent,
      NO_FILES
    )

    expect(granted.tools).toStrictEqual([
      "Read",
      "Grep",
      "Glob",
      "Bash",
      "Skill",
    ])
  })

  it("adds Skill to an agent carrying no dynamic skills at all", () => {
    const agent: AgentConfig = {
      name: "cli-developer",
      title: "CLI Developer Agent",
      description: "Implements CLI features from detailed specs",
      tools: ["Read", "Bash"],
      skills: [PRELOADED_SKILL],
    }

    const context = buildAgentTemplateContext("cli-developer", agent, NO_FILES)

    expect(
      context.dynamicSkills,
      "the case is only meaningful while this agent emits no activation protocol"
    ).toStrictEqual([])
    expect(
      context.agent.tools,
      "the grant is unconditional — a user adds skills after an agent is compiled"
    ).toStrictEqual(["Read", "Bash", "Skill"])
  })

  it("adds Skill to an agent carrying no skills at all", () => {
    const agent: AgentConfig = {
      name: "cli-developer",
      title: "CLI Developer Agent",
      description: "Implements CLI features from detailed specs",
      tools: ["Read", "Bash"],
      skills: [],
    }

    const { agent: granted } = buildAgentTemplateContext(
      "cli-developer",
      agent,
      NO_FILES
    )

    expect(granted.tools).toStrictEqual(["Read", "Bash", "Skill"])
  })

  it("names Skill once and leaves the declared order alone", () => {
    const agent: AgentConfig = {
      name: "cli-developer",
      title: "CLI Developer Agent",
      description: "Implements CLI features from detailed specs",
      tools: ["Read", "Skill", "Bash"],
      skills: [DYNAMIC_SKILL],
    }

    const { agent: granted } = buildAgentTemplateContext(
      "cli-developer",
      agent,
      NO_FILES
    )

    expect(
      granted.tools,
      "a second entry, or a reordered list, diffs every compiled agent on the next compile"
    ).toStrictEqual(["Read", "Skill", "Bash"])
  })

  it("changes nothing about the definition but its tools", () => {
    const agent: AgentConfig = {
      name: "cli-developer",
      title: "CLI Developer Agent",
      description: "Implements CLI features from detailed specs",
      model: "opus",
      effort: "high",
      disallowedTools: ["WebFetch"],
      permissionMode: "default",
      path: "developer/cli-developer",
      tools: ["Read", "Bash"],
      skills: [DYNAMIC_SKILL],
    }

    const { agent: granted } = buildAgentTemplateContext(
      "cli-developer",
      agent,
      NO_FILES
    )

    expect(granted).toStrictEqual({
      ...agent,
      tools: ["Read", "Bash", "Skill"],
    })
  })
})

describe("the frontmatter an install writes", () => {
  it("names Skill on a developer's tools line", async () => {
    const agent: AgentConfig = {
      name: "cli-developer",
      title: "CLI Developer Agent",
      description: "Implements CLI features from detailed specs",
      tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
      skills: [DYNAMIC_SKILL],
    }

    const rendered = await renderAgentFromCorpus("cli-developer", agent)

    expect(rendered).toContain(
      "\ntools: Read, Write, Edit, Grep, Glob, Bash, Skill\n"
    )
  })

  it("names Skill on a read-only researcher's tools line", async () => {
    const agent: AgentConfig = {
      name: "cli-researcher",
      title: "CLI Researcher Agent",
      description: "Read-only CLI research specialist",
      tools: ["Read", "Grep", "Glob", "Bash"],
      skills: [DYNAMIC_SKILL],
    }

    const rendered = await renderAgentFromCorpus("cli-researcher", agent)

    expect(rendered).toContain("\ntools: Read, Grep, Glob, Bash, Skill\n")
  })
})
