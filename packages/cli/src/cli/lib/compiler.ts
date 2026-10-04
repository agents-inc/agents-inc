import { Liquid } from "liquidjs";
import path from "path";
import {
  buildAgentTemplateContext,
  pluginRefFor,
  renderAgent,
  renderAgentBody,
  renderAgentRoleToml,
  type AgentFiles,
} from "@workspace/compile/agent-source";
import { readFile, readFileOptional, directoryExists } from "../utils/fs";
import { verbose } from "../utils/logger";
import {
  CLAUDE_DIR,
  DIRS,
  PROJECT_ROOT,
  STANDARD_FILES,
  STANDARD_DIRS,
  type Provider,
} from "../consts";
import { providerInUse, sourceFolderInUse, sourceFolderName } from "./installation/install-layout";
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
  const agentPath = agent.path || name;
  const agentDir = path.join(agentSourceRoot, agentBaseDir, agentPath);

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

  const category = agentPath.split("/")[0] || name;
  const categoryDir = path.join(agentSourceRoot, agentBaseDir, category);
  const output = await readOutputPartial(agentDir, categoryDir);

  return { identity, playbook, output, criticalRequirementsTop, criticalReminders };
}

/** The agent's own `output.md`, or its category's where the agent's is absent or empty. */
async function readOutputPartial(agentDir: string, categoryDir: string): Promise<string> {
  const own = await readFileOptional(path.join(agentDir, STANDARD_FILES.OUTPUT_MD), "");
  if (own) return own;
  return readFileOptional(path.join(categoryDir, STANDARD_FILES.OUTPUT_MD), "");
}

/**
 * Creates a Liquid template engine with a layered template root hierarchy.
 *
 * Template resolution order (first match wins):
 * 1. Project-local templates: `agents/_templates/` inside the project's source folder,
 *    `.agents-inc/<provider>/`, resolved by `sourceFolderInUse`
 * 2. Legacy templates: `{projectDir}/.claude/templates/`
 * 3. Built-in templates: `{PROJECT_ROOT}/src/agents/_templates/`
 *
 * The browser-side twin is `createEngineFromTemplates` in `@workspace/compile/engine`, which
 * builds the same engine over the vendored corpus instead of over directories. Every option
 * below is duplicated there, because a render that resolved filters or variables differently
 * would produce a different file from the same data.
 *
 * `globals.sourceFolder` is what makes a compiled agent's own text install-specific. A partial is
 * never rendered through this engine — it is prose, inlined verbatim — so `renderAgent` asks the
 * engine for that global and substitutes the one opted-in token itself, which is how
 * `agent-summoner` names the folder THIS project keeps its source in rather than a literal that is
 * wrong on every install of the other layout.
 *
 * @param projectDir - Optional project directory for local template overrides
 * @returns Configured Liquid engine with `.liquid` extension and strict filters
 */
export async function createLiquidEngine(projectDir?: string): Promise<Liquid> {
  const roots: string[] = [];
  // One read for both answers below: the templates this install overrides with, and the folder
  // name a compiled `agent-summoner` is told to author into, have to name one installation.
  const provider = providerInUse(projectDir);

  if (projectDir) {
    const srcTemplatesDir = path.join(
      sourceFolderInUse(projectDir, provider).dir,
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
    globals: { sourceFolder: sourceFolderName(projectDir, provider) },
  });
}

/**
 * One resolved sub-agent as the file `provider`'s host actually reads.
 *
 * **The two hosts share every byte of the prose and disagree about everything around it.** Claude
 * reads markdown under a frontmatter block; Codex reads an agent ROLE DEFINITION — TOML, three
 * required keys, and a deserializer that drops the WHOLE file on one unlisted key. So the split is
 * at the RENDER and not at the data: both start from the same
 * {@link buildAgentTemplateContext} context, and `renderAgentBody` is by construction the tail of
 * `renderAgent`, which is what makes a Codex sub-agent's instructions its Claude twin's byte for
 * byte.
 *
 * Nothing here decides WHICH sub-agents a host gets — `hostCompilesAgent` answers that, before the
 * write pass reaches this — and nothing here decides where the file goes.
 */
export async function compileAgentForHost(
  provider: Provider,
  name: AgentName,
  agent: AgentConfig,
  fallbackRoot: string,
  engine: Liquid,
): Promise<string> {
  verbose(`Compiling agent: ${name} (${provider})`);

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
  const version = await cliVersion();

  switch (provider) {
    case "claude":
      return renderAgent(engine, data, version);
    case "codex":
      return renderAgentRoleToml(agent, await renderAgentBody(engine, data, version));
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}
