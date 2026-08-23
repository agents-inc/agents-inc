import { Liquid } from "liquidjs";
import path from "path";
import { readFile, readFileOptional, directoryExists } from "../utils/fs";
import { verbose, warn } from "../utils/logger";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  DIRS,
  EJECT_SOURCE,
  PROJECT_ROOT,
  STANDARD_FILES,
  STANDARD_DIRS,
} from "../consts";
import { cliVersion, stampProvenanceMarker } from "./agents/agent-provenance";
import type { AgentConfig, AgentName, CompiledAgentData, PluginSkillRef, Skill } from "../types";

/** Pattern matching Liquid template delimiters that could enable template injection */
const LIQUID_SYNTAX_PATTERN = /\{\{|\}\}|\{%|%\}/g;

/**
 * Strips Liquid template syntax (`{{`, `}}`, `{%`, `%}`) from a string value.
 * Prevents template injection when user-controlled data is passed to the Liquid engine.
 *
 * @param value - Input string that may contain Liquid syntax
 * @param fieldName - Name of the field (for warning messages)
 * @returns Sanitized string with Liquid delimiters removed
 */
export function sanitizeLiquidSyntax<T extends string>(value: T, fieldName: string): T {
  if (!LIQUID_SYNTAX_PATTERN.test(value)) return value;
  LIQUID_SYNTAX_PATTERN.lastIndex = 0;
  const sanitized = value.replace(LIQUID_SYNTAX_PATTERN, "");
  warn(`Stripped Liquid template syntax from '${fieldName}' — possible template injection attempt`);
  // Boundary cast: .replace() widens the branded string T; stripping characters keeps it in T's domain
  return sanitized as T;
}

function sanitizeStringArray(values: string[], fieldName: string): string[] {
  return values.map((v) => sanitizeLiquidSyntax(v, fieldName));
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
  }));
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
export function sanitizeCompiledAgentData(data: CompiledAgentData): CompiledAgentData {
  const sanitizedAgent: AgentConfig = {
    ...data.agent,
    name: sanitizeLiquidSyntax(data.agent.name, "agent.name"),
    title: sanitizeLiquidSyntax(data.agent.title, "agent.title"),
    description: sanitizeLiquidSyntax(data.agent.description, "agent.description"),
    tools: sanitizeStringArray(data.agent.tools, "agent.tools"),
    ...(data.agent.disallowedTools !== undefined && {
      disallowedTools: sanitizeStringArray(data.agent.disallowedTools, "agent.disallowedTools"),
    }),
    ...(data.agent.model !== undefined && {
      model: sanitizeLiquidSyntax(data.agent.model, "agent.model"),
    }),
    ...(data.agent.effort !== undefined && {
      effort: sanitizeLiquidSyntax(data.agent.effort, "agent.effort"),
    }),
    ...(data.agent.permissionMode !== undefined && {
      permissionMode: sanitizeLiquidSyntax(data.agent.permissionMode, "agent.permissionMode"),
    }),
  };

  const sanitizedSkills = sanitizeSkills(data.skills);
  const sanitizedPreloaded = sanitizeSkills(data.preloadedSkills);
  const sanitizedDynamic = sanitizeSkills(data.dynamicSkills);
  const sanitizedPreloadedIds = data.preloadedSkillIds.map((id) =>
    sanitizeLiquidSyntax(id, "preloadedSkillId"),
  );

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
  };
}

type AgentFiles = Pick<
  CompiledAgentData,
  "identity" | "playbook" | "output" | "criticalRequirementsTop" | "criticalReminders"
>;

async function readAgentFiles(
  name: AgentName,
  agent: AgentConfig,
  projectRoot: string,
): Promise<AgentFiles> {
  const agentSourceRoot = agent.sourceRoot || projectRoot;
  const agentBaseDir = agent.agentBaseDir || DIRS.agents;
  const agentDir = path.join(agentSourceRoot, agentBaseDir, agent.path || name);

  const identity = await readFile(path.join(agentDir, STANDARD_FILES.IDENTITY_MD));
  const playbook = await readFile(path.join(agentDir, STANDARD_FILES.PLAYBOOK_MD));
  const criticalRequirementsTop = await readFileOptional(
    path.join(agentDir, STANDARD_FILES.CRITICAL_REQUIREMENTS_MD),
    "",
  );
  const criticalReminders = await readFileOptional(
    path.join(agentDir, STANDARD_FILES.CRITICAL_REMINDERS_MD),
    "",
  );

  const agentPath = agent.path || name;
  const parts = agentPath.split("/");
  const category = parts[0] || name;
  const categoryDir = path.join(agentSourceRoot, agentBaseDir, category);

  let output = await readFileOptional(path.join(agentDir, STANDARD_FILES.OUTPUT_MD), "");
  if (!output) {
    output = await readFileOptional(path.join(categoryDir, STANDARD_FILES.OUTPUT_MD), "");
  }

  return { identity, playbook, output, criticalRequirementsTop, criticalReminders };
}

export function buildAgentTemplateContext(
  name: AgentName,
  agent: AgentConfig,
  files: AgentFiles,
  mapSkill: (skill: Skill) => Skill = (skill) => skill,
): CompiledAgentData {
  const skills = agent.skills.map(mapSkill);
  const preloadedSkills = skills.filter((s) => s.preloaded);
  const dynamicSkills = skills.filter((s) => !s.preloaded);
  const preloadedSkillIds = preloadedSkills.map((s) => s.pluginRef ?? s.id);

  verbose(
    `Skills for ${name}: ${preloadedSkills.length} preloaded, ${dynamicSkills.length} dynamic`,
  );

  return {
    agent,
    ...files,
    skills,
    preloadedSkills,
    dynamicSkills,
    preloadedSkillIds,
  };
}

/**
 * Renders the agent template and stamps the result with the provenance marker.
 *
 * Both compile entry points render through here, so there is no path that writes a compiled
 * agent this CLI cannot later recognise as its own — which is what `uninstall` reads back
 * when the configuration naming the agents is gone. The stamp replaces rather than inserts,
 * so a template that emits the marker itself still produces exactly one.
 */
async function renderCompiledAgent(engine: Liquid, data: CompiledAgentData): Promise<string> {
  // Boundary cast: liquidjs types renderFile as `Promise<any>` because a template
  // can render to any value. The agent template renders a markdown file, and both
  // callers have declared `Promise<string>` since they were written.
  const rendered = (await engine.renderFile("agent", sanitizeCompiledAgentData(data))) as string;
  return stampProvenanceMarker(rendered, await cliVersion());
}

/**
 * Creates a Liquid template engine with a layered template root hierarchy.
 *
 * Template resolution order (first match wins):
 * 1. Project-local templates: `{projectDir}/.claude-src/agents/_templates/`
 * 2. Legacy templates: `{projectDir}/.claude/templates/`
 * 3. Built-in templates: `{PROJECT_ROOT}/src/agents/_templates/`
 *
 * @param projectDir - Optional project directory for local template overrides
 * @returns Configured Liquid engine with `.liquid` extension and strict filters
 */
export async function createLiquidEngine(projectDir?: string): Promise<Liquid> {
  const roots: string[] = [];

  if (projectDir) {
    const srcTemplatesDir = path.join(
      projectDir,
      CLAUDE_SRC_DIR,
      STANDARD_DIRS.AGENTS,
      path.basename(DIRS.templates),
    );
    if (await directoryExists(srcTemplatesDir)) {
      roots.push(srcTemplatesDir);
      verbose(`Using local templates from: ${srcTemplatesDir}`);
    }

    const legacyTemplatesDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.TEMPLATES);
    if (await directoryExists(legacyTemplatesDir)) {
      roots.push(legacyTemplatesDir);
      verbose(`Using legacy templates from: ${legacyTemplatesDir}`);
    }
  }

  roots.push(path.join(PROJECT_ROOT, DIRS.templates));

  return new Liquid({
    root: roots,
    extname: ".liquid",
    strictVariables: false,
    strictFilters: true,
  });
}

/**
 * The per-skill pluginRef decision. A skill renders as `${id}:${id}` only
 * when it has an explicit non-eject source on its SkillReference — i.e. it was
 * installed from a marketplace. `undefined` source (user-authored local skills
 * with no SkillConfig entry) and `"eject"` both fall through to bare id.
 */
function pluginRefFor(skill: Skill): { pluginRef?: PluginSkillRef } {
  if (skill.source === undefined || skill.source === EJECT_SOURCE) return {};
  return { pluginRef: `${skill.id}:${skill.id}` as const };
}

export async function compileAgentForPlugin(
  name: AgentName,
  agent: AgentConfig,
  fallbackRoot: string,
  engine: Liquid,
): Promise<string> {
  verbose(`Compiling agent: ${name}`);

  const files = await readAgentFiles(name, agent, fallbackRoot);

  // Per-skill pluginRef attachment. Each skill's own `source` decides
  // whether it renders as `${id}:${id}` (plugin-installed) or bare id (ejected).
  // This correctly handles mixed-mode agents where some skills are plugin and
  // others are ejected. Missing `source` (user-authored local skills with no
  // SkillConfig entry) falls through to bare id — the expected case, not a
  // silent fallback.
  const data = buildAgentTemplateContext(name, agent, files, (skill) => ({
    ...skill,
    ...pluginRefFor(skill),
  }));

  return renderCompiledAgent(engine, data);
}
