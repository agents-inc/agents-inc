import type { Liquid } from "liquidjs"

import { diagnostics } from "./diagnostics.js"
import { DEFAULT_PLUGIN_NAME, EJECT_SOURCE } from "./paths.js"
import type {
  AgentConfig,
  CompiledAgentData,
  PluginSkillRef,
  Skill,
} from "./types.js"

/**
 * Everything that turns a resolved sub-agent into the markdown an install writes,
 * with two things left behind in the CLI because they read the machine: the five
 * `readFile`s that fetch an agent's partials off disk, and `cliVersion()`, which
 * reads the CLI's own manifest. Both arrive here as data — {@link AgentFiles} and
 * the `version` argument of {@link renderAgent} — which is what lets a browser
 * render the same bytes from the vendored corpus.
 */

/** Pattern matching Liquid template delimiters that could enable template injection */
const LIQUID_SYNTAX_PATTERN = /\{\{|\}\}|\{%|%\}/g

/**
 * Strips Liquid template syntax (`{{`, `}}`, `{%`, `%}`) from a string value.
 * Prevents template injection when user-controlled data is passed to the Liquid engine.
 *
 * @param value - Input string that may contain Liquid syntax
 * @param fieldName - Name of the field (for warning messages)
 * @returns Sanitized string with Liquid delimiters removed
 */
export function sanitizeLiquidSyntax<T extends string>(
  value: T,
  fieldName: string
): T {
  if (!LIQUID_SYNTAX_PATTERN.test(value)) return value
  LIQUID_SYNTAX_PATTERN.lastIndex = 0
  const sanitized = value.replace(LIQUID_SYNTAX_PATTERN, "")
  diagnostics().warn(
    `Stripped Liquid template syntax from '${fieldName}' — possible template injection attempt`
  )
  // Boundary cast: .replace() widens the branded string T; stripping characters keeps it in T's domain
  return sanitized as T
}

function sanitizeStringArray(values: string[], fieldName: string): string[] {
  return values.map((v) => sanitizeLiquidSyntax(v, fieldName))
}

function sanitizeSkills(skills: Skill[]): Skill[] {
  return skills.map((s) => ({
    ...s,
    id: sanitizeLiquidSyntax(s.id, "skill.id"),
    description: sanitizeLiquidSyntax(s.description, "skill.description"),
    usage: sanitizeLiquidSyntax(s.usage, "skill.usage"),
    ...(s.pluginRef !== undefined && {
      pluginRef: sanitizeLiquidSyntax(s.pluginRef, "skill.pluginRef"),
    }),
  }))
}

/**
 * Sanitizes user-controlled metadata fields in compiled agent data to prevent
 * Liquid template injection. Strips `{{`, `}}`, `{%`, `%}` from agent
 * metadata and skill metadata before template rendering.
 *
 * Content fields (identity, playbook, output, criticalRequirementsTop,
 * criticalReminders) are passed through unchanged — LiquidJS does not
 * re-evaluate template syntax inside variable values, so double-curlies
 * in content (e.g. GitHub Actions `${{ secrets.X }}`) are safe.
 */
export function sanitizeCompiledAgentData(
  data: CompiledAgentData
): CompiledAgentData {
  const sanitizedAgent: AgentConfig = {
    ...data.agent,
    name: sanitizeLiquidSyntax(data.agent.name, "agent.name"),
    title: sanitizeLiquidSyntax(data.agent.title, "agent.title"),
    description: sanitizeLiquidSyntax(
      data.agent.description,
      "agent.description"
    ),
    tools: sanitizeStringArray(data.agent.tools, "agent.tools"),
    ...(data.agent.disallowedTools !== undefined && {
      disallowedTools: sanitizeStringArray(
        data.agent.disallowedTools,
        "agent.disallowedTools"
      ),
    }),
    ...(data.agent.model !== undefined && {
      model: sanitizeLiquidSyntax(data.agent.model, "agent.model"),
    }),
    ...(data.agent.effort !== undefined && {
      effort: sanitizeLiquidSyntax(data.agent.effort, "agent.effort"),
    }),
    ...(data.agent.permissionMode !== undefined && {
      permissionMode: sanitizeLiquidSyntax(
        data.agent.permissionMode,
        "agent.permissionMode"
      ),
    }),
  }

  const sanitizedSkills = sanitizeSkills(data.skills)
  const sanitizedPreloaded = sanitizeSkills(data.preloadedSkills)
  const sanitizedDynamic = sanitizeSkills(data.dynamicSkills)
  const sanitizedPreloadedIds = data.preloadedSkillIds.map((id) =>
    sanitizeLiquidSyntax(id, "preloadedSkillId")
  )

  return {
    agent: sanitizedAgent,
    identity: data.identity,
    playbook: data.playbook,
    output: data.output,
    criticalRequirementsTop: data.criticalRequirementsTop,
    criticalReminders: data.criticalReminders,
    skills: sanitizedSkills,
    preloadedSkills: sanitizedPreloaded,
    dynamicSkills: sanitizedDynamic,
    preloadedSkillIds: sanitizedPreloadedIds,
  }
}

/**
 * The tool that loads a skill.
 *
 * A sub-agent's `tools:` frontmatter is an ALLOWLIST: an agent that declares one
 * gets exactly what it names, where an agent that omits the key inherits every
 * tool the session has. Every agent compiled here declares one, and no
 * `metadata.yaml` names this — so every agent this product had ever written was
 * unable to invoke a skill, while being instructed in the strongest terms the
 * template can manage to do exactly that.
 *
 * The `skills:` key does not close that gap, which is the non-obvious half and
 * the reason the defect survived: it preloads skill content into the agent's
 * startup context and grants no tool, so a compiled agent can list skills, carry
 * the activation protocol, and still have no way to load one.
 *
 * Granted to every agent rather than only to those with dynamic skills. Skills
 * are this product's atom: an agent has to be able to reach one a user adds
 * after it was compiled, and one its own playbook names in prose. It is a
 * read-only capability — it loads instructions and grants no write access — so
 * the deliberately read-only researchers take it on the same terms.
 */
const SKILL_TOOL = "Skill"

/**
 * The same definition with {@link SKILL_TOOL} among its tools exactly once.
 *
 * Idempotent and order-stable: a definition already naming it is returned
 * unchanged, by identity, and everything else keeps its declared order with the
 * grant appended. Both halves are about the next compile — a second entry, or a
 * reordered list, would diff the frontmatter of every agent on disk.
 */
function withSkillTool(agent: AgentConfig): AgentConfig {
  if (agent.tools.includes(SKILL_TOOL)) return agent
  return { ...agent, tools: [...agent.tools, SKILL_TOOL] }
}

/** The five markdown partials a sub-agent is assembled from, however they were fetched. */
export type AgentFiles = Pick<
  CompiledAgentData,
  | "identity"
  | "playbook"
  | "output"
  | "criticalRequirementsTop"
  | "criticalReminders"
>

/**
 * The template context for one sub-agent.
 *
 * The single assembly point for both front doors — the CLI's write path and the
 * editor's output preview — which is why {@link withSkillTool} is applied here
 * rather than in the eighteen `metadata.yaml` files: a user-authored agent gets
 * the grant on the same terms as a shipped one.
 *
 * The preloaded/dynamic split PRESERVES the order `agent.skills` arrives in, and
 * that order is `config.ts`'s stack key order — so the emitted rows of the
 * sub-agent's skill-activation table are decided by the config writer's
 * canonicalisation rather than by anything here.
 */
export function buildAgentTemplateContext(
  name: string,
  agent: AgentConfig,
  files: AgentFiles,
  mapSkill: (skill: Skill) => Skill = (skill) => skill
): CompiledAgentData {
  const skills = agent.skills.map(mapSkill)
  const preloadedSkills = skills.filter((s) => s.preloaded)
  const dynamicSkills = skills.filter((s) => !s.preloaded)
  const preloadedSkillIds = preloadedSkills.map((s) => s.pluginRef ?? s.id)

  diagnostics().verbose(
    `Skills for ${name}: ${preloadedSkills.length} preloaded, ${dynamicSkills.length} dynamic`
  )

  return {
    agent: withSkillTool(agent),
    ...files,
    skills,
    preloadedSkills,
    dynamicSkills,
    preloadedSkillIds,
  }
}

/**
 * The per-skill pluginRef decision. A skill renders as `${id}:${id}` only
 * when it has an explicit non-eject source on its SkillReference — i.e. it was
 * installed from a marketplace. `undefined` source (user-authored local skills
 * with no SkillConfig entry) and `"eject"` both fall through to bare id.
 */
export function pluginRefFor(skill: Skill): { pluginRef?: PluginSkillRef } {
  if (skill.source === undefined || skill.source === EJECT_SOURCE) return {}
  return { pluginRef: `${skill.id}:${skill.id}` as const }
}

/**
 * The provenance marker every compiled agent carries: an HTML comment on the first line
 * after the frontmatter, naming the generator, its version, and the fact that the file is
 * rewritten rather than edited.
 *
 * **A body comment, deliberately not a frontmatter field.** Claude Code documents sixteen
 * supported frontmatter keys and says nothing about how it treats an unknown one, so a
 * stricter release could reject every agent this CLI has ever written. The body is free-form
 * by contract, which makes a marker there safe, greppable, versioned, and the do-not-edit
 * notice at the same time.
 *
 * The version is informational — {@link hasProvenanceMarker} matches on the marker's SHAPE,
 * so an agent compiled by any release is recognised by any other. Matching the exact text
 * would sweep only the agents the running version happened to write.
 */
const MARKER_OPEN = `<!-- Generated by ${DEFAULT_PLUGIN_NAME} v`
const MARKER_NOTICE = " — do not edit; compile rewrites this file"
const MARKER_CLOSE = " -->"

const FRONTMATTER_FENCE = "---"

export function provenanceMarker(version: string): string {
  return `${MARKER_OPEN}${version}${MARKER_NOTICE}${MARKER_CLOSE}`
}

/** Whether a line is a marker this CLI wrote, at any version and under any wording. */
function isProvenanceMarker(line: string): boolean {
  return line.startsWith(MARKER_OPEN) && line.endsWith(MARKER_CLOSE)
}

/**
 * The index of the first body line: past the closing frontmatter fence when there is one,
 * and the top of the file when there is not — a template override may render no frontmatter,
 * and the marker still needs a defined home.
 */
function bodyStartIndex(lines: readonly string[]): number {
  if (lines[0] !== FRONTMATTER_FENCE) return 0
  const closingFence = lines.indexOf(FRONTMATTER_FENCE, 1)
  if (closingFence === -1) return 0
  return closingFence + 1
}

/**
 * Whether this CLI compiled the agent file this content came from.
 *
 * The marker's POSITION is part of the claim: an agent that merely quotes the line further
 * down (a prompt about this very feature, say) is the user's, and a sweep reading that as
 * provenance would delete a file nothing here wrote.
 */
export function hasProvenanceMarker(content: string): boolean {
  const lines = content.split("\n")
  const firstBodyLine = lines[bodyStartIndex(lines)]
  return firstBodyLine !== undefined && isProvenanceMarker(firstBodyLine)
}

/**
 * The same content carrying exactly one provenance marker, on the first line after the
 * frontmatter.
 *
 * Idempotent by replacement rather than by insertion: content that already carries a marker
 * has that line rewritten, so stamping twice at one version is a fixed point and a version
 * bump moves the line instead of stacking a second one beside it.
 */
export function stampProvenanceMarker(
  content: string,
  version: string
): string {
  const lines = content.split("\n")
  const bodyStart = bodyStartIndex(lines)
  const replacedLines = hasProvenanceMarker(content) ? 1 : 0

  return [
    ...lines.slice(0, bodyStart),
    provenanceMarker(version),
    ...lines.slice(bodyStart + replacedLines),
  ].join("\n")
}

/** The template every compiled sub-agent is rendered from, by name rather than by path. */
const AGENT_TEMPLATE = "agent"

/**
 * Renders the agent template and stamps the result with the provenance marker.
 *
 * Every compile entry point renders through here, so there is no path that writes a compiled
 * agent this CLI cannot later recognise as its own — which is what `uninstall` reads back
 * when the configuration naming the agents is gone. The stamp replaces rather than inserts,
 * so a template that emits the marker itself still produces exactly one.
 *
 * `version` is an argument because the CLI reads it from its own `package.json` and a browser
 * has no manifest to read; the editor passes `CORPUS_CLI_VERSION`, the release the corpus was
 * vendored at.
 */
export async function renderAgent(
  engine: Liquid,
  data: CompiledAgentData,
  version: string
): Promise<string> {
  // Boundary cast: liquidjs types renderFile as `Promise<any>` because a template
  // can render to any value. The agent template renders a markdown file, and both
  // callers have declared `Promise<string>` since they were written.
  const rendered = (await engine.renderFile(
    AGENT_TEMPLATE,
    sanitizeCompiledAgentData(data)
  )) as string
  return stampProvenanceMarker(rendered, version)
}
