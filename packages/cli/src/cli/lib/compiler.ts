import { Liquid } from "liquidjs";
import path from "path";
import { pipe, flatMap, filter, uniqueBy } from "remeda";
import {
  readFile,
  readFileOptional,
  writeFile,
  ensureDir,
  remove,
  copy,
  glob,
  fileExists,
  directoryExists,
} from "../utils/fs";
import { getErrorMessage } from "../utils/errors";
import { log, verbose, warn } from "../utils/logger";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  DIRS,
  EJECT_SOURCE,
  PROJECT_ROOT,
  STANDARD_FILES,
  STANDARD_DIRS,
} from "../consts";
import { resolveClaudeMd } from "./resolver";
import { validateCompiledAgent, printOutputValidationResult } from "./output-validator";
import type {
  AgentConfig,
  AgentName,
  CompiledAgentData,
  CompileContext,
  PluginSkillRef,
  Skill,
} from "../types";
import { typedEntries } from "../utils/typed-object";

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

function sanitizeString<T extends string>(value: T | undefined, fieldName: string): T | undefined {
  if (value === undefined) return undefined;
  return sanitizeLiquidSyntax(value, fieldName);
}

function sanitizeStringArray(
  values: string[] | undefined,
  fieldName: string,
): string[] | undefined {
  if (!values) return values;
  return values.map((v) => sanitizeLiquidSyntax(v, fieldName));
}

function sanitizeSkills(skills: Skill[]): Skill[] {
  return skills.map((s) => ({
    ...s,
    id: sanitizeLiquidSyntax(s.id, "skill.id"),
    description: sanitizeLiquidSyntax(s.description, "skill.description"),
    usage: sanitizeLiquidSyntax(s.usage, "skill.usage"),
    pluginRef: sanitizeString(s.pluginRef, "skill.pluginRef"),
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
    tools: sanitizeStringArray(data.agent.tools, "agent.tools") ?? data.agent.tools,
    disallowedTools: sanitizeStringArray(data.agent.disallowedTools, "agent.disallowedTools"),
    model: sanitizeString(data.agent.model, "agent.model"),
    effort: sanitizeString(data.agent.effort, "agent.effort"),
    permissionMode: sanitizeString(data.agent.permissionMode, "agent.permissionMode"),
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
 * Compiles a single agent into a rendered Markdown prompt by reading its
 * constituent files (identity, playbook, output, critical requirements/reminders)
 * and rendering them through a Liquid template.
 *
 * Skills are split into preloaded (content embedded in the compiled agent) and
 * dynamic (loaded via Skill tool at runtime). Output resolution falls back
 * from the agent-specific directory to the parent category directory.
 *
 * @param name - Agent identifier used for logging and as a directory name fallback
 * @param agent - Fully resolved agent config including skills, paths, and optional sourceRoot
 * @param projectRoot - Root directory of the project (used as base for agent file resolution)
 * @param engine - Pre-configured Liquid template engine with template roots
 * @returns Rendered Markdown string ready to be written to the output directory
 * @throws When required agent files (identity.md, playbook.md) are missing from disk
 */
async function compileAgent(
  name: AgentName,
  agent: AgentConfig,
  projectRoot: string,
  engine: Liquid,
): Promise<string> {
  verbose(`Reading agent files for ${name}...`);
  const files = await readAgentFiles(name, agent, projectRoot);
  const data = buildAgentTemplateContext(name, agent, files);

  verbose(`Rendering template for ${name}...`);
  return engine.renderFile("agent", sanitizeCompiledAgentData(data));
}

/**
 * Compiles all resolved agents into Markdown files and writes them to the output directory.
 *
 * Each agent is compiled via `compileAgent()`, validated for structural issues
 * (missing sections, placeholder text), and written to `{outputDir}/agents/{name}.md`.
 * Validation warnings are printed but do not prevent compilation.
 *
 * @param resolvedAgents - Map of agent names to fully resolved agent configs with skills
 * @param ctx - Compilation context providing projectRoot and outputDir paths
 * @param engine - Pre-configured Liquid template engine
 * @throws When any agent fails to compile (missing files, template errors)
 */
export async function compileAllAgents(
  resolvedAgents: Record<AgentName, AgentConfig>,
  ctx: CompileContext,
  engine: Liquid,
): Promise<void> {
  const outDir = path.join(ctx.outputDir, STANDARD_DIRS.AGENTS);
  await ensureDir(outDir);

  let hasValidationIssues = false;

  for (const [name, agent] of typedEntries<AgentName, AgentConfig>(resolvedAgents)) {
    try {
      const output = await compileAgent(name, agent, ctx.projectRoot, engine);
      await writeFile(path.join(outDir, `${name}.md`), output);
      log(`  ✓ ${name}.md`);

      const validationResult = validateCompiledAgent(output);
      if (!validationResult.valid || validationResult.warnings.length > 0) {
        hasValidationIssues = true;
        printOutputValidationResult(name, validationResult);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      warn(`Failed to compile '${name}': ${errorMessage}`);
      throw new Error(
        `Failed to compile agent '${name}': ${errorMessage}. Check that all required files exist in src/agents/${agent.path || name}/`,
        { cause: error },
      );
    }
  }

  if (hasValidationIssues) {
    log("");
  }
}

/**
 * Copies all skill files referenced by resolved agents into the output directory.
 *
 * Deduplicates skills across agents (by skill ID) and copies each skill's
 * content to `{outputDir}/skills/{id}/`. For folder-based skills, copies
 * SKILL.md, optional reference.md, examples/, and scripts/ subdirectories.
 * For single-file skills, copies the file as SKILL.md.
 *
 * @param resolvedAgents - Map of agent names to configs (skills extracted from all agents)
 * @param ctx - Compilation context providing projectRoot and outputDir paths
 * @throws When a skill file or directory is missing from the expected source path
 */
export async function compileAllSkills(
  resolvedAgents: Record<AgentName, AgentConfig>,
  ctx: CompileContext,
): Promise<void> {
  const allSkills = pipe(
    Object.values(resolvedAgents),
    flatMap((a) => a.skills),
    filter((s) => Boolean(s.path)),
  );

  const uniqueSkills = uniqueBy(allSkills, (s) => s.id);

  for (const skill of uniqueSkills) {
    const id = skill.id;
    const outDir = path.join(ctx.outputDir, "skills", id);
    await ensureDir(outDir);

    const sourcePath = path.join(ctx.projectRoot, skill.path);
    const isFolder = skill.path.endsWith("/");

    try {
      if (isFolder) {
        const mainContent = await readFile(path.join(sourcePath, STANDARD_FILES.SKILL_MD));
        await writeFile(path.join(outDir, STANDARD_FILES.SKILL_MD), mainContent);
        log(`  ✓ skills/${id}/${STANDARD_FILES.SKILL_MD}`);

        const referenceContent = await readFileOptional(
          path.join(sourcePath, STANDARD_FILES.REFERENCE_MD),
        );
        if (referenceContent) {
          await writeFile(path.join(outDir, STANDARD_FILES.REFERENCE_MD), referenceContent);
          log(`  ✓ skills/${id}/${STANDARD_FILES.REFERENCE_MD}`);
        }

        const examplesDir = path.join(sourcePath, STANDARD_DIRS.EXAMPLES);
        if (await fileExists(examplesDir)) {
          await copy(examplesDir, path.join(outDir, STANDARD_DIRS.EXAMPLES));
          log(`  ✓ skills/${id}/${STANDARD_DIRS.EXAMPLES}/`);
        }

        const scriptsDir = path.join(sourcePath, STANDARD_DIRS.SCRIPTS);
        if (await fileExists(scriptsDir)) {
          await copy(scriptsDir, path.join(outDir, STANDARD_DIRS.SCRIPTS));
          log(`  ✓ skills/${id}/${STANDARD_DIRS.SCRIPTS}/`);
        }
      } else {
        const content = await readFile(sourcePath);
        await writeFile(path.join(outDir, STANDARD_FILES.SKILL_MD), content);
        log(`  ✓ skills/${id}/${STANDARD_FILES.SKILL_MD}`);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      warn(`Failed to compile skill '${id}': ${errorMessage}`);
      throw new Error(
        `Failed to compile skill '${skill.id}': ${errorMessage}. Expected skill at: ${sourcePath}`,
        { cause: error },
      );
    }
  }
}

/**
 * Copies the stack-specific CLAUDE.md file to the compilation output directory.
 *
 * Resolves the CLAUDE.md path from the stack directory, reads its content, and
 * writes it to the parent of the output directory (alongside the agents/ folder).
 *
 * @param ctx - Compilation context with stackId, projectRoot, and outputDir
 * @throws When the stack's CLAUDE.md file is missing
 */
export async function copyClaudeMdToOutput(ctx: CompileContext): Promise<void> {
  const claudePath = await resolveClaudeMd(ctx.projectRoot, ctx.stackId);

  const content = await readFile(claudePath);
  const outputPath = path.join(ctx.outputDir, "..", STANDARD_FILES.CLAUDE_MD);
  await writeFile(outputPath, content);
  log(`  ✓ ${STANDARD_FILES.CLAUDE_MD} (from stack)`);
}

/**
 * Copies all custom command Markdown files from the commands source directory
 * to the compilation output directory.
 *
 * Skips gracefully if no commands directory exists or contains no .md files.
 *
 * @param ctx - Compilation context with projectRoot and outputDir
 * @throws When a command file exists but cannot be read or written
 */
export async function compileAllCommands(ctx: CompileContext): Promise<void> {
  const commandsDir = path.join(ctx.projectRoot, DIRS.commands);
  const outDir = path.join(ctx.outputDir, STANDARD_DIRS.COMMANDS);

  if (!(await fileExists(commandsDir))) {
    log("  - No commands directory found, skipping...");
    return;
  }

  const files = await glob("*.md", commandsDir);

  if (files.length === 0) {
    log("  - No commands found, skipping...");
    return;
  }

  await ensureDir(outDir);

  for (const file of files) {
    try {
      const content = await readFile(path.join(commandsDir, file));
      await writeFile(path.join(outDir, file), content);
      log(`  ✓ ${file}`);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      warn(`Failed to compile command '${file}': ${errorMessage}`);
      throw new Error(
        `Failed to compile command '${file}': ${errorMessage}. Expected at: ${path.join(commandsDir, file)}`,
        { cause: error },
      );
    }
  }
}

/**
 * Creates a Liquid template engine with a layered template root hierarchy.
 *
 * Template resolution order (first match wins):
 * 1. Project-local templates: `{projectDir}/.claude-src/agents/_templates/`
 * 2. Legacy templates: `{projectDir}/.claude/templates/`
 * 3. Built-in templates: `{PROJECT_ROOT}/templates/`
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

/** Removes the agents/, skills/, and commands/ subdirectories from the output directory. */
export async function removeCompiledOutputDirs(outputDir: string): Promise<void> {
  await remove(path.join(outputDir, STANDARD_DIRS.AGENTS));
  await remove(path.join(outputDir, STANDARD_DIRS.SKILLS));
  await remove(path.join(outputDir, STANDARD_DIRS.COMMANDS));
}

/**
 * D-217: per-skill pluginRef decision. A skill renders as `${id}:${id}` only
 * when it has an explicit non-eject source on its SkillReference — i.e. it was
 * installed from a marketplace. `undefined` source (user-authored local skills
 * with no SkillConfig entry) and `"eject"` both fall through to bare id.
 */
function derivePluginRef(skill: Skill): PluginSkillRef | undefined {
  if (skill.source === undefined || skill.source === EJECT_SOURCE) return undefined;
  return `${skill.id}:${skill.id}` as const;
}

export async function compileAgentForPlugin(
  name: AgentName,
  agent: AgentConfig,
  fallbackRoot: string,
  engine: Liquid,
): Promise<string> {
  verbose(`Compiling agent: ${name}`);

  const files = await readAgentFiles(name, agent, fallbackRoot);

  // D-217: per-skill pluginRef attachment. Each skill's own `source` decides
  // whether it renders as `${id}:${id}` (plugin-installed) or bare id (ejected).
  // This correctly handles mixed-mode agents where some skills are plugin and
  // others are ejected. Missing `source` (user-authored local skills with no
  // SkillConfig entry) falls through to bare id — the expected case, not a
  // silent fallback.
  const data = buildAgentTemplateContext(name, agent, files, (skill) => ({
    ...skill,
    pluginRef: derivePluginRef(skill),
  }));

  return engine.renderFile("agent", sanitizeCompiledAgentData(data));
}
