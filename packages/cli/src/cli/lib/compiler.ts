import { Liquid } from "liquidjs";
import path from "path";
import {
  buildAgentTemplateContext,
  pluginRefFor,
  renderAgent,
  type AgentFiles,
} from "@workspace/compile/agent-source";
import { readFile, readFileOptional, directoryExists } from "../utils/fs";
import { verbose } from "../utils/logger";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  DIRS,
  PROJECT_ROOT,
  STANDARD_FILES,
  STANDARD_DIRS,
} from "../consts";
import { cliVersion } from "./agents/agent-provenance";
import "./compile-seat.js";
import type { AgentConfig, AgentName } from "../types";

/**
 * What survives here is the half of a compile that reads the machine: the five `readFile`s that
 * fetch an agent's partials off disk, and the layered template roots a project can override. The
 * rendering itself — the template context, the injection sanitiser and the provenance stamp — is
 * `@workspace/compile/agent-source`, so the editor's output preview draws the bytes this writes
 * rather than a second implementation of them.
 */
export {
  buildAgentTemplateContext,
  sanitizeCompiledAgentData,
  sanitizeLiquidSyntax,
} from "@workspace/compile/agent-source";

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

/**
 * Creates a Liquid template engine with a layered template root hierarchy.
 *
 * Template resolution order (first match wins):
 * 1. Project-local templates: `{projectDir}/.claude-src/agents/_templates/`
 * 2. Legacy templates: `{projectDir}/.claude/templates/`
 * 3. Built-in templates: `{PROJECT_ROOT}/src/agents/_templates/`
 *
 * The browser-side twin is `createEngineFromTemplates` in `@workspace/compile/engine`, which
 * builds the same engine over the vendored corpus instead of over directories. Every option
 * below is duplicated there, because a render that resolved filters or variables differently
 * would produce a different file from the same data.
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

  return renderAgent(engine, data, await cliVersion());
}
