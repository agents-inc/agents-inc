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

/**
 * Everything that turns a resolved sub-agent into the markdown an install writes,
 * with two things left behind in the CLI because they read the machine: the five
 * `readFile`s that fetch an agent's partials off disk, and `cliVersion()`, which
 * reads the CLI's own manifest. Both arrive here as data — {@link AgentFiles} and
 * the `version` argument of {@link renderAgent} — which is what lets a browser
 * render the same bytes from the vendored corpus.
 *
 * **The Codex provider's renderer is re-exported from here, and the reason is the package's own
 * `exports` map.** `providers/codex/` has no entry of its own, so this module — the one whose
 * subject is "how a resolved sub-agent becomes the file a host reads" — is where a CLI-side
 * caller reaches it. The modules themselves stay separate: the TOML writer imports nothing from
 * here, so the dependency runs one way and neither the root barrel nor the editor's first-paint
 * budget acquires anything new.
 */
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

/**
 * Hook definitions with every author-supplied string stripped of Liquid syntax.
 *
 * These are the only fields on an agent that render as an EXECUTABLE: a `Stop` hook's
 * `command` is a shell line Claude Code runs when the sub-agent finishes. An agent definition
 * can arrive from a marketplace, so the strings here are as author-controlled as `agent.name`
 * beside them — and they were the one part of the definition the sanitiser did not cover,
 * because until this release nothing rendered them.
 *
 * Sanitising is not a substitute for trusting the source: a marketplace whose agents you compile
 * can name any command it likes, and that is a property of installing an agent rather than of
 * this function. What this closes is the narrower hole of a hook string carrying template syntax
 * into a render.
 */
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

/**
 * One definition from {@link sanitizeHooks}: its matcher, and every action it fires.
 *
 * `hooks` is spread unconditionally where `matcher` beside it is guarded, because the two are
 * not both optional: a definition carrying no actions fires nothing, so `AgentHookDefinition`
 * requires the array and every schema that reads an agent refuses a definition without it.
 */
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

/** One action a hook definition fires: its type, and whichever of command, script and prompt it holds. */
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

/**
 * Experimental frontmatter options with their author-supplied value stripped of
 * Liquid syntax.
 *
 * Here for the same reason {@link sanitizeHooks} is: the template renders the
 * field, and being rendered is what puts a field in this enumeration. That
 * `cacheTtl` is a closed vocabulary does not exempt it — `model`, `effort`,
 * `permissionMode` and `isolation` are closed vocabularies too and are all
 * sanitised, because a type says nothing about what reached the renderer.
 * {@link renderAgent} is also the editor's preview path, which arrives from a
 * browser without the CLI's Zod loader having parsed anything.
 */
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
 * Sanitizes user-controlled metadata fields in compiled agent data to prevent
 * Liquid template injection. Strips `{{`, `}}`, `{%`, `%}` from agent
 * metadata and skill metadata before template rendering.
 *
 * Content fields (identity, playbook, output, criticalRequirementsTop,
 * criticalReminders) are passed through unchanged, because they are not
 * metadata reaching a template — they are PROSE, inlined verbatim, and nothing
 * evaluates them: see {@link SOURCE_FOLDER_PLACEHOLDER} for the one token in a
 * partial that is substituted and why it is a token rather than a render.
 * Stripping the delimiters here would silently rewrite an author's prose — a
 * GitHub Actions example that says `${{ secrets.X }}` means that, and compiles
 * saying that.
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
    ...(data.agent.isolation !== undefined && {
      isolation: sanitizeLiquidSyntax(data.agent.isolation, "agent.isolation"),
    }),
    ...(data.agent.experimental !== undefined && {
      experimental: sanitizeExperimental(data.agent.experimental),
    }),
    ...(data.agent.hooks !== undefined && {
      hooks: sanitizeHooks(data.agent.hooks),
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
 * after the frontmatter, naming the generator and the fact that the file is rewritten
 * rather than edited.
 *
 * **A body comment, deliberately not a frontmatter field.** Claude Code documents its
 * supported frontmatter keys and says nothing about how it treats an unknown one, so a
 * stricter release could reject every agent this CLI has ever written. The body is free-form
 * by contract, which makes a marker there safe, greppable, and the do-not-edit notice at the
 * same time.
 *
 * **Its bytes are constant across releases, and that is the point.** A compiled agent IS a
 * sub-agent's system prompt, so this line is the first cacheable byte of every invocation of
 * it — and while it carried the CLI's version it moved on every release, invalidating the
 * whole prompt prefix of all eighteen agents for a string nothing reads back. The version
 * still travels, in the trailing volatile block where a change to it costs nothing.
 *
 * {@link hasProvenanceMarker} matched on SHAPE while the text varied and still does, so an
 * agent compiled by any release — before this change or after it — is recognised by any other.
 */
const MARKER_OPEN = `<!-- Generated by ${DEFAULT_PLUGIN_NAME}`
const MARKER_NOTICE = " — do not edit; compile rewrites this file"
const MARKER_CLOSE = " -->"

const FRONTMATTER_FENCE = "---"

export function provenanceMarker(): string {
  return `${MARKER_OPEN}${MARKER_NOTICE}${MARKER_CLOSE}`
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
 * The same question for a Codex agent ROLE DEFINITION, where the prose lives inside a TOML key
 * rather than under a frontmatter fence.
 *
 * The marker's POSITION is the claim here too — the line immediately after
 * {@link CODEX_DEVELOPER_INSTRUCTIONS_OPENER} — so a role whose own prose quotes the line further
 * down is the user's, and a sweep reading that as provenance would delete a file nothing here
 * wrote. Same shape match as {@link hasProvenanceMarker}, so a role compiled by any release is
 * recognised by any other.
 */
export function hasCodexRoleMarker(content: string): boolean {
  const lines = content.split("\n")
  const opener = lines.indexOf(CODEX_DEVELOPER_INSTRUCTIONS_OPENER)
  const markerLine = opener === -1 ? undefined : lines[opener + 1]

  return markerLine !== undefined && isProvenanceMarker(markerLine)
}

/**
 * The same content carrying exactly one provenance marker, on the first line after the
 * frontmatter.
 *
 * Idempotent by replacement rather than by insertion: content that already carries a marker
 * has that line rewritten rather than a second one stacked beside it. Since the marker's text
 * became constant that replacement is a no-op on anything this release wrote — but it is what
 * upgrades an agent stamped by a release that still spelled the version into the line.
 */
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

/** The template every compiled sub-agent is rendered from, by name rather than by path. */
const AGENT_TEMPLATE = "agent"

/**
 * The template holding everything AFTER the frontmatter fence, which {@link AGENT_TEMPLATE}
 * `{% include %}`s as its own last line.
 *
 * **A host whose sub-agent file has no frontmatter needs the body and only the body.** A Codex
 * agent ROLE DEFINITION carries the compiled prose in one `developer_instructions` key against a
 * deserializer that drops the whole file on an unlisted one, so a Claude-shaped `---` block
 * reaching that renderer is either quoted in as noise or emits keys that lose all sixteen
 * sub-agents at once.
 *
 * **`include` rather than `render`, and rather than concatenating two renders in code.** `include`
 * shares the parent's scope, so the partial reads `agent`, `identity` and the rest exactly as it
 * did when it was one file; and an installation that ejected a whole `agent.liquid` before the
 * split still renders through its own copy rather than having this body appended to it twice.
 */
const AGENT_BODY_TEMPLATE = "agent-body"

/**
 * The one token in a partial that is not prose.
 *
 * **A partial's text reaches the compiled agent byte for byte.** Anything in one that looks like
 * template syntax — `${{ secrets.X }}` in a GitHub Actions example, `{{ user.name }}`,
 * `{% if x %}` — IS text, in a bundled partial and in a user-authored one alike. An agent
 * definition can arrive from a marketplace or be written by hand in a consuming project, and a
 * partial that reached the Liquid engine would be both a silent rewrite of that author's prose and
 * the template-injection boundary {@link sanitizeLiquidSyntax} exists to hold, gone.
 *
 * One value still has to be install-specific, which is what this token is for: `agent-summoner`'s
 * playbook tells an agent where to author a new sub-agent, and the answer is the source folder THIS
 * installation uses — `.agents-inc/claude/` for one created now, `.claude-src/` for one created
 * before the rename and not yet migrated. A literal is right for one of those and wrong for the
 * other, and the wrong one sends an agent to author into a folder the CLI does not read.
 *
 * So the substitution is an OPT-IN of exactly one token rather than a render of the whole file.
 * Spelled with delimiters no template language in this repository uses and no prose reaches by
 * accident, so a partial that does not carry it is returned by identity and cannot be rewritten by
 * anything here. The repository's own partials that want it are found with:
 *
 * ```
 * grep -rn '@@SOURCE_FOLDER@@' packages/cli/src/agents
 * ```
 *
 * A partial that wants to NAME this token rather than ask for the folder writes
 * {@link SOURCE_FOLDER_ESCAPE}.
 */
const SOURCE_FOLDER_PLACEHOLDER = "@@SOURCE_FOLDER@@"

/**
 * {@link SOURCE_FOLDER_PLACEHOLDER} with a backslash in front of it, which compiles to the token
 * itself.
 *
 * **A substitution with no escape eats the one lesson that teaches it.** `agent-summoner`'s
 * playbook is where an agent learns to write the token, and the paragraph saying so spelled the
 * token — so every compiled copy read "the one exception is `.agents-inc/claude`" and named the
 * token nowhere, teaching the folder literal the token exists to prevent. The escape is what lets
 * a partial say the token's name out loud.
 *
 * A backslash because it is the escape every author already reaches for, and because it composes:
 * the escape is stripped from the text around it, so `\\` in front of the token compiles to a
 * backslash and the token — which is how a partial teaches the escape itself. There is no way to
 * write a literal backslash immediately before a SUBSTITUTED token, and nothing needs one.
 */
const SOURCE_FOLDER_ESCAPE = `\\${SOURCE_FOLDER_PLACEHOLDER}`

/**
 * The product-authored expression that asks an engine for the install's source folder.
 *
 * A constant this file owns, so the only thing the Liquid engine is ever handed here is this
 * string — never a partial. The engine is still what carries the value, because `globals` is where
 * both front doors put it: `createLiquidEngine` in the CLI, over the project it is compiling for,
 * and `createEngineFromTemplates` in the browser, over the layout a new installation gets.
 */
const SOURCE_FOLDER_EXPRESSION = "{{ sourceFolder }}"

/** The refusal when a partial asks for the source folder and the engine cannot name one. */
const NO_SOURCE_FOLDER =
  `A partial names the install's source folder (${SOURCE_FOLDER_PLACEHOLDER}) and the engine ` +
  `rendering it carries no 'sourceFolder' global, so the name would compile away to nothing.`

/** The source folder this engine was built for, asked for through the engine's own globals. */
function sourceFolderOf(engine: Liquid): Promise<string> {
  // Boundary cast: liquidjs types parseAndRender as `Promise<any>` because a template can render
  // to any value. This one renders a global declared `string` by both engine builders.
  return engine.parseAndRender(SOURCE_FOLDER_EXPRESSION) as Promise<string>
}

/**
 * One partial with every unescaped {@link SOURCE_FOLDER_PLACEHOLDER} replaced by `folder`, every
 * {@link SOURCE_FOLDER_ESCAPE} left naming the token, and every other byte of it untouched.
 *
 * A partial that did not opt in is returned by identity, so nothing here can reach an author's
 * prose. One that ASKS for the folder, in an engine naming no folder, is a refusal rather than a
 * substitution: `strictVariables` is off in both engines — that is what lets a template reference a
 * field an agent omits — so a missing global renders to an empty string, and the partial would
 * compile to `/agents/`, a path that names no installation, in a file nobody reads back. One that
 * only NAMES the token asks for no folder, so it is not held to that.
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

/**
 * The same context with each of its five partials carrying this install's source folder.
 *
 * The five are listed as an {@link AgentFiles} literal rather than spread one by one over `data`,
 * which is what makes the enumeration exhaustive: a sixth partial added to that type and forgotten
 * here fails `tsc` on the missing property, where the spread alone would pass it through untouched
 * and silently.
 */
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
 * The deterministic completion gate every writing sub-agent stops against.
 *
 * A `SubagentStop` hook rather than a sentence in the prompt, because the two are different
 * kinds of claim: "check your work before stopping" is advice a model may decline to take, and
 * this is a process that runs whether it does or not. Exit 2 is the documented way to BLOCK the
 * stop, and the command's captured output goes to stderr, which is what Claude Code returns to
 * the sub-agent — so a failing typecheck comes back as the compiler's own output and the
 * agent iterates rather than reporting done.
 *
 * **Inert where it cannot be right.** A compiled agent is installed into someone else's
 * repository, and a gate that hard-blocks in a project with no npm — or no `typecheck` script —
 * would make every sub-agent unstoppable. So the first clause exits 0 unless there is both an
 * npm and a `package.json`, and `--if-present` exits 0 for a script the project does not
 * define. What is left is exactly the case the gate is for: a project that declares these
 * checks, failing one of them.
 *
 * **Typecheck only.** The gate runs the project's typecheck script; lint and test are
 * deliberately not in it. A type error means the work does not compile, which is the one
 * failure a stopping agent must not report as done. A lint finding or a failing test is the
 * project's own judgement to gate on, and a project that wants either declares its own `Stop`
 * hook — see {@link declaresOwnGate} — which replaces this one entirely rather than running
 * beside it.
 *
 * Composed for agents holding `Write` or `Edit` by {@link withCompletionGate}, which merges it
 * with whatever the agent declared rather than losing to it.
 */
const COMPLETION_GATE_COMMAND =
  "command -v npm >/dev/null 2>&1 && [ -f package.json ] || exit 0; " +
  "out=$(npm run --if-present --silent typecheck 2>&1) " +
  "|| { printf '%s\\n' \"$out\" >&2; exit 2; }"

/** The tools whose presence makes an agent one the gate is for. */
const WRITING_TOOLS = ["Write", "Edit"]

/**
 * The frontmatter spelling of the completion event, which is not the spelling that fires.
 *
 * Claude Code registers a sub-agent's frontmatter hooks through a function that walks its
 * event vocabulary and rewrites exactly one key — `Stop` becomes `SubagentStop`, logged as
 * "Converting Stop hook to SubagentStop for agent X (subagents trigger SubagentStop)". The
 * vocabulary contains `SubagentStop` verbatim, so EITHER spelling works when the agent is
 * invoked as a sub-agent.
 *
 * They diverge on the other path. An agent run as the main session through `--agent` has its
 * frontmatter hooks stored raw, with no such rewrite, and every dispatch looks the record up
 * by the event's own name — so a `SubagentStop` key is consulted only for an event a main
 * session never fires, while `Stop` fires natively. `Stop` is therefore correct in both modes
 * and `SubagentStop` in one, which is why this emits `Stop`.
 *
 * Read from the shipped binary at version 2.1.259 on 2026-09-03 rather than from published
 * documentation. Compiled agents written before that release carry `SubagentStop`; both are
 * live, and a reader seeing `Stop:` in frontmatter and `SubagentStop` in a log is seeing the
 * conversion rather than a mismatch.
 */
const GATE_EVENT = "Stop"

/** The runtime spelling of {@link GATE_EVENT} — what a sub-agent's registration is rewritten to. */
const CONVERTED_GATE_EVENT = "SubagentStop"

/**
 * The gate as its own hooks record — a fresh one per call.
 *
 * A factory rather than a const because the record is spread into an agent's own
 * hooks and the arrays inside it would otherwise be shared, by identity, with every
 * agent ever compiled in the process; `validResult()` in the CLI's
 * `lib/validation-result.ts` is the same shape for the same reason.
 */
function completionGateHooks(): NonNullable<AgentConfig["hooks"]> {
  return {
    [GATE_EVENT]: [
      { hooks: [{ type: "command", command: COMPLETION_GATE_COMMAND }] },
    ],
  }
}

/**
 * Whether the definition states a completion gate of its own, under either spelling.
 *
 * Both count, because the two ARE one event on the path a compiled agent is normally
 * invoked on — see {@link GATE_EVENT}. Keying only on `Stop` would emit this gate beside a
 * project's `SubagentStop`, and a sub-agent would then run both, which is the opposite of
 * the rule that a project's completion gate is its own to state. `SubagentStop` is also the
 * spelling every agent compiled before 2026-09-03 carries, so it is what a project that
 * copied its gate out of a compiled agent will have written.
 */
function declaresOwnGate(hooks: AgentConfig["hooks"]): boolean {
  if (hooks === undefined) return false
  const stated = [GATE_EVENT, CONVERTED_GATE_EVENT]
  return stated.some((event) => (hooks[event]?.length ?? 0) > 0)
}

/**
 * The same definition carrying the completion gate alongside whatever it declared.
 *
 * **Composition, not exclusion.** The template used to decide this with an
 * `{% if agent.hooks %}` / `{% elsif tools contains Write %}` pair, so an agent
 * declaring any hook at all — a `PostToolUse` formatter, say — silently lost the
 * completion gate, with nothing reporting it.
 *
 * Merged per EVENT: a declared completion gate replaces this one, because a project stating
 * its own is the rule this product has always documented; every other event is added beside
 * it. An agent holding neither `Write` nor `Edit` is returned unchanged, so the gate is still
 * emitted only where it can mean something.
 *
 * The gate is spread LAST rather than first, which matters only for the degenerate declaration
 * `Stop: []`. {@link declaresOwnGate} reads that as stating no gate, correctly — and spreading
 * the declared record over the gate would then let an empty array clobber it, emitting
 * `hooks: {"Stop":[]}` and losing the gate to a key that says nothing. Gate-last cannot lose to
 * a declaration this function has already established is not one.
 *
 * **Composed before the sanitiser, for a narrower reason than that ordering used to claim.** The
 * only value whose sanitisation depends on it is {@link COMPLETION_GATE_COMMAND}, a constant this
 * product authors. An author's own hooks are stripped under either order, because
 * {@link sanitizeCompiledAgentData} walks `agent.hooks` whether or not the gate has been composed
 * into them — measured by rendering a writing agent whose declared hook was poisoned in every
 * field, under both orders: one line of the two renders differed, and the marker in it was the
 * gate's own.
 *
 * Which is a rule nothing can hold, since no fixture can reach that constant. So it is structural
 * instead of remembered: this function is private, {@link prepareForRender} is the one expression
 * that composes with the sanitiser, and {@link renderAgent} has no order left to state.
 */
function withCompletionGate(agent: AgentConfig): AgentConfig {
  const writes = WRITING_TOOLS.some((tool) => agent.tools.includes(tool))
  if (!writes || declaresOwnGate(agent.hooks)) return agent
  return { ...agent, hooks: { ...agent.hooks, ...completionGateHooks() } }
}

/**
 * The whole of what a render is handed: the completion gate composed into the
 * definition's own hooks, and every author-supplied string stripped of Liquid
 * syntax.
 *
 * The two steps have an order and this is the only expression allowed to state
 * it — written as one nested call rather than two statements, so getting it
 * wrong takes rewriting the expression rather than moving a line. That is worth
 * the indirection because the ordering is unfalsifiable: {@link withCompletionGate}
 * is the reason, and it explains which single value the order decides.
 */
function prepareForRender(data: CompiledAgentData): CompiledAgentData {
  return sanitizeCompiledAgentData({
    ...data,
    agent: withCompletionGate(data.agent),
  })
}

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
 * vendored at. It reaches the template as `generatorVersion` and renders inside the trailing
 * volatile block rather than into the provenance marker, so a release bump no longer rewrites
 * the first cacheable byte of every compiled agent.
 *
 * The completion gate is composed into the agent's own hooks before the render rather than
 * branched on in the template — see {@link prepareForRender} — so the template holds one
 * unconditional `hooks:` emission and the gate reaches `sanitizeHooks` like any other hook.
 *
 * The five partials are inlined verbatim but for one opted-in token — see
 * {@link SOURCE_FOLDER_PLACEHOLDER} — so an agent whose own text names the install's source folder
 * names the one this engine was built for, and every other byte of an author's prose survives.
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
 * The same sub-agent WITHOUT its frontmatter — the prose alone, carrying the provenance marker on
 * its first line.
 *
 * It is exactly the tail of {@link renderAgent}, and that is the invariant rather than a golden
 * file: `agent.liquid` ends by including {@link AGENT_BODY_TEMPLATE}, so a body that moved one
 * byte would move the Claude render with it. `agent-body-split.test.ts` asserts the suffix
 * relation over three shipped sub-agents rather than recording the bytes, because a golden the
 * implementing pass can regenerate is a golden the implementing pass will regenerate.
 *
 * The marker is stamped here for the same reason `renderAgent` stamps it: a body with no frontmatter
 * fence takes it on line one, which is where {@link hasProvenanceMarker} looks and where the Codex
 * role renderer expects to find it inside `developer_instructions`.
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

/** The render both doors share: the same prepared context, against whichever template is named. */
async function renderFromTemplate(
  engine: Liquid,
  template: string,
  data: CompiledAgentData,
  version: string
): Promise<string> {
  const prepared = await withSourceFolder(engine, prepareForRender(data))

  // Boundary cast: liquidjs types renderFile as `Promise<any>` because a template
  // can render to any value. The agent template renders a markdown file, and both
  // callers have declared `Promise<string>` since they were written.
  return (await engine.renderFile(template, {
    ...prepared,
    generatorVersion: sanitizeLiquidSyntax(version, "generatorVersion"),
  })) as string
}
