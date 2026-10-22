import type { AgentHookDefinition } from "@workspace/matrix"
import type { Liquid } from "liquidjs"

import { diagnostics } from "./diagnostics.js"
import { DEFAULT_PLUGIN_NAME, EJECT_SOURCE } from "./paths.js"
import { CODEX_DEVELOPER_INSTRUCTIONS_OPENER } from "./providers/codex/agent-role-toml.js"
import type {
  AgentConfig,
  CompiledAgentData,
  PluginSkillRef,
  Skill,
} from "./types.js"

// Turns a resolved sub-agent into installed markdown; file reads and the CLI version arrive as
// data so a browser can render the same bytes. Codex is re-exported because `providers/codex/`
// has no `exports` entry.
export {
  CODEX_DEVELOPER_INSTRUCTIONS_OPENER,
  CODEX_REJECTED_ROLE_KEYS,
  CODEX_REQUIRED_ROLE_KEYS,
  renderAgentRoleToml,
} from "./providers/codex/agent-role-toml.js"
export {
  AGENTS_NOT_ON_CODEX,
  CODEX_AGENT_ROSTER,
  UNEXPRESSIBLE_ON_CODEX,
  agentsLeftOutOfCodexMessage,
  compilesForCodex,
  unexpressibleOnCodexMessage,
} from "./providers/codex/roster.js"

const LIQUID_SYNTAX_PATTERN = /\{\{|\}\}|\{%|%\}/g

/** Strips Liquid delimiters from author-supplied metadata to prevent template injection. */
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
  // Boundary cast: .replace() widens the branded T; stripping characters keeps it in T's domain.
  return sanitized as T
}

function sanitizeStringArray(values: string[], fieldName: string): string[] {
  return values.map((v) => sanitizeLiquidSyntax(v, fieldName))
}

/** Hook strings render into an executable (a `Stop` hook's command), so they are sanitised. */
function sanitizeHooks(
  hooks: NonNullable<AgentConfig["hooks"]>
): NonNullable<AgentConfig["hooks"]> {
  return Object.fromEntries(
    Object.entries(hooks).map(([event, definitions]) => [
      sanitizeLiquidSyntax(event, "hook.event"),
      definitions.map(sanitizeHookDefinition),
    ])
  )
}

function sanitizeHookDefinition(
  definition: AgentHookDefinition
): AgentHookDefinition {
  return {
    ...definition,
    ...(definition.matcher !== undefined && {
      matcher: sanitizeLiquidSyntax(definition.matcher, "hook.matcher"),
    }),
    hooks: definition.hooks.map(sanitizeHookAction),
  }
}

function sanitizeHookAction(
  action: AgentHookDefinition["hooks"][number]
): AgentHookDefinition["hooks"][number] {
  return {
    ...action,
    type: sanitizeLiquidSyntax(action.type, "hook.type"),
    ...(action.command !== undefined && {
      command: sanitizeLiquidSyntax(action.command, "hook.command"),
    }),
    ...(action.script !== undefined && {
      script: sanitizeLiquidSyntax(action.script, "hook.script"),
    }),
    ...(action.prompt !== undefined && {
      prompt: sanitizeLiquidSyntax(action.prompt, "hook.prompt"),
    }),
  }
}

// Rendered fields are sanitised even when closed vocabularies: the editor preview reaches here
// unparsed.
function sanitizeExperimental(
  experimental: NonNullable<AgentConfig["experimental"]>
): NonNullable<AgentConfig["experimental"]> {
  return {
    ...experimental,
    ...(experimental.cacheTtl !== undefined && {
      cacheTtl: sanitizeLiquidSyntax(
        experimental.cacheTtl,
        "agent.experimental.cacheTtl"
      ),
    }),
  }
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
 * Strips Liquid delimiters from agent and skill metadata. The five prose partials pass through
 * unchanged: they are inlined verbatim, never evaluated (see {@link SOURCE_FOLDER_PLACEHOLDER}).
 */
export function sanitizeCompiledAgentData(
  data: CompiledAgentData
): CompiledAgentData {
  return {
    agent: sanitizeAgent(data.agent),
    identity: data.identity,
    playbook: data.playbook,
    output: data.output,
    criticalRequirementsTop: data.criticalRequirementsTop,
    criticalReminders: data.criticalReminders,
    skills: sanitizeSkills(data.skills),
    preloadedSkills: sanitizeSkills(data.preloadedSkills),
    dynamicSkills: sanitizeSkills(data.dynamicSkills),
    preloadedSkillIds: data.preloadedSkillIds.map((id) =>
      sanitizeLiquidSyntax(id, "preloadedSkillId")
    ),
  }
}

function sanitizeAgent(agent: AgentConfig): AgentConfig {
  return {
    ...agent,
    name: sanitizeLiquidSyntax(agent.name, "agent.name"),
    title: sanitizeLiquidSyntax(agent.title, "agent.title"),
    description: sanitizeLiquidSyntax(agent.description, "agent.description"),
    tools: sanitizeStringArray(agent.tools, "agent.tools"),
    ...(agent.disallowedTools !== undefined && {
      disallowedTools: sanitizeStringArray(
        agent.disallowedTools,
        "agent.disallowedTools"
      ),
    }),
    ...(agent.model !== undefined && {
      model: sanitizeLiquidSyntax(agent.model, "agent.model"),
    }),
    ...(agent.effort !== undefined && {
      effort: sanitizeLiquidSyntax(agent.effort, "agent.effort"),
    }),
    ...(agent.permissionMode !== undefined && {
      permissionMode: sanitizeLiquidSyntax(
        agent.permissionMode,
        "agent.permissionMode"
      ),
    }),
    ...(agent.isolation !== undefined && {
      isolation: sanitizeLiquidSyntax(agent.isolation, "agent.isolation"),
    }),
    ...(agent.experimental !== undefined && {
      experimental: sanitizeExperimental(agent.experimental),
    }),
    ...(agent.hooks !== undefined && {
      hooks: sanitizeHooks(agent.hooks),
    }),
  }
}

/**
 * `tools:` is an allowlist and `skills:` grants no tool, so without this an agent cannot load a
 * skill. Granted to every agent: it is read-only.
 */
const SKILL_TOOL = "Skill"

// Idempotent and order-stable, so recompiles do not diff frontmatter.
function withSkillTool(agent: AgentConfig): AgentConfig {
  if (agent.tools.includes(SKILL_TOOL)) return agent
  return { ...agent, tools: [...agent.tools, SKILL_TOOL] }
}

export type AgentFiles = Pick<
  CompiledAgentData,
  | "identity"
  | "playbook"
  | "output"
  | "criticalRequirementsTop"
  | "criticalReminders"
>

/**
 * The one assembly point for CLI writes and the editor preview, so user-authored agents get the
 * Skill grant too. Preserves `agent.skills` order, which decides the activation table's rows.
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

/** `${id}:${id}` only for a skill with an explicit non-eject source (a marketplace install). */
export function pluginRefFor(skill: Skill): { pluginRef?: PluginSkillRef } {
  if (skill.source === undefined || skill.source === EJECT_SOURCE) return {}
  return { pluginRef: `${skill.id}:${skill.id}` as const }
}

/**
 * A body comment, not a frontmatter field: Claude Code may reject unknown keys. Its bytes stay
 * constant across releases because it is the first cacheable byte of every sub-agent prompt; the
 * version goes in the trailing volatile block.
 */
const MARKER_OPEN = `<!-- Generated by ${DEFAULT_PLUGIN_NAME}`
const MARKER_NOTICE = " — do not edit; compile rewrites this file"
const MARKER_CLOSE = " -->"

const FRONTMATTER_FENCE = "---"

export function provenanceMarker(): string {
  return `${MARKER_OPEN}${MARKER_NOTICE}${MARKER_CLOSE}`
}

function isProvenanceMarker(line: string): boolean {
  return line.startsWith(MARKER_OPEN) && line.endsWith(MARKER_CLOSE)
}

// Top of file when there is no frontmatter (a template override may render none).
function bodyStartIndex(lines: readonly string[]): number {
  if (lines[0] !== FRONTMATTER_FENCE) return 0
  const closingFence = lines.indexOf(FRONTMATTER_FENCE, 1)
  if (closingFence === -1) return 0
  return closingFence + 1
}

/** Position is part of the claim: a marker quoted further down belongs to the user's file. */
export function hasProvenanceMarker(content: string): boolean {
  const lines = content.split("\n")
  const firstBodyLine = lines[bodyStartIndex(lines)]
  return firstBodyLine !== undefined && isProvenanceMarker(firstBodyLine)
}

/** {@link hasProvenanceMarker} for a Codex role: the marker sits right after the TOML opener. */
export function hasCodexRoleMarker(content: string): boolean {
  const lines = content.split("\n")
  const opener = lines.indexOf(CODEX_DEVELOPER_INSTRUCTIONS_OPENER)
  const markerLine = opener === -1 ? undefined : lines[opener + 1]

  return markerLine !== undefined && isProvenanceMarker(markerLine)
}

/** Replaces an existing marker rather than stacking a second, upgrading older stamps. */
export function stampProvenanceMarker(content: string): string {
  const lines = content.split("\n")
  const bodyStart = bodyStartIndex(lines)
  const replacedLines = hasProvenanceMarker(content) ? 1 : 0

  return [
    ...lines.slice(0, bodyStart),
    provenanceMarker(),
    ...lines.slice(bodyStart + replacedLines),
  ].join("\n")
}

const AGENT_TEMPLATE = "agent"

/**
 * The body after the frontmatter, which {@link AGENT_TEMPLATE} `{% include %}`s last; Codex roles
 * need it alone. `include` shares the parent's scope, and an ejected pre-split `agent.liquid` still
 * renders through its own copy.
 */
const AGENT_BODY_TEMPLATE = "agent-body"

/**
 * The one substituted token in a partial: the install's source folder, which differs per provider.
 * Partials are otherwise prose, never rendered, so a partial without the token is returned by
 * identity. Find users with `grep -rn '@@SOURCE_FOLDER@@' packages/cli/src/agents`.
 */
const SOURCE_FOLDER_PLACEHOLDER = "@@SOURCE_FOLDER@@"

/**
 * Compiles to the token itself, so a partial can name it. The backslash is stripped from the text
 * around it, so `\\` before the token yields a backslash and the token.
 */
const SOURCE_FOLDER_ESCAPE = `\\${SOURCE_FOLDER_PLACEHOLDER}`

// The only string ever handed to the engine here; both engine builders set `sourceFolder`.
const SOURCE_FOLDER_EXPRESSION = "{{ sourceFolder }}"

const NO_SOURCE_FOLDER =
  `A partial names the install's source folder (${SOURCE_FOLDER_PLACEHOLDER}) and the engine ` +
  `rendering it carries no 'sourceFolder' global, so the name would compile away to nothing.`

function sourceFolderOf(engine: Liquid): Promise<string> {
  // Boundary cast: liquidjs types parseAndRender as `Promise<any>`; this global is a `string`.
  return engine.parseAndRender(SOURCE_FOLDER_EXPRESSION) as Promise<string>
}

/**
 * Asking for the folder with none set throws: `strictVariables` is off, so it would compile to an
 * empty path. Merely naming the token (escaped) is allowed.
 */
function substituteSourceFolder(partial: string, folder: string): string {
  if (!partial.includes(SOURCE_FOLDER_PLACEHOLDER)) return partial

  const aroundEscapes = partial.split(SOURCE_FOLDER_ESCAPE)
  const asksForTheFolder = aroundEscapes.some((text) =>
    text.includes(SOURCE_FOLDER_PLACEHOLDER)
  )
  if (asksForTheFolder && folder === "") throw new Error(NO_SOURCE_FOLDER)

  const folderNamedIn = (text: string): string =>
    text.split(SOURCE_FOLDER_PLACEHOLDER).join(folder)

  return aroundEscapes.map(folderNamedIn).join(SOURCE_FOLDER_PLACEHOLDER)
}

// An `AgentFiles` literal, not a spread, so a sixth partial forgotten here fails `tsc`.
async function withSourceFolder(
  engine: Liquid,
  data: CompiledAgentData
): Promise<CompiledAgentData> {
  const folder = await sourceFolderOf(engine)
  const named = (partial: string): string =>
    substituteSourceFolder(partial, folder)

  const partials: AgentFiles = {
    identity: named(data.identity),
    playbook: named(data.playbook),
    output: named(data.output),
    criticalRequirementsTop: named(data.criticalRequirementsTop),
    criticalReminders: named(data.criticalReminders),
  }

  return { ...data, ...partials }
}

/**
 * Every compile path renders through here, so `uninstall` can always recognise its own agents.
 * `version` is an argument because a browser has no manifest to read.
 */
export async function renderAgent(
  engine: Liquid,
  data: CompiledAgentData,
  version: string
): Promise<string> {
  return stampProvenanceMarker(
    await renderFromTemplate(engine, AGENT_TEMPLATE, data, version)
  )
}

/**
 * Exactly the tail of {@link renderAgent}, since `agent.liquid` includes
 * {@link AGENT_BODY_TEMPLATE}; stamped so the marker is on line one.
 */
export async function renderAgentBody(
  engine: Liquid,
  data: CompiledAgentData,
  version: string
): Promise<string> {
  return stampProvenanceMarker(
    await renderFromTemplate(engine, AGENT_BODY_TEMPLATE, data, version)
  )
}

async function renderFromTemplate(
  engine: Liquid,
  template: string,
  data: CompiledAgentData,
  version: string
): Promise<string> {
  const prepared = await withSourceFolder(
    engine,
    sanitizeCompiledAgentData(data)
  )

  // Boundary cast: liquidjs types renderFile as `Promise<any>`; this template renders markdown.
  return (await engine.renderFile(template, {
    ...prepared,
    generatorVersion: sanitizeLiquidSyntax(version, "generatorVersion"),
  })) as string
}
