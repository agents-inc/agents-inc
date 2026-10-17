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
 * Template roots, first match wins: the project source folder's `agents/_templates/`, legacy
 * `.claude/templates/`, then the built-ins. The options mirror `createEngineFromTemplates` in
 * `@workspace/compile/engine`; keep the two in sync.
 */
export async function createLiquidEngine(projectDir?: string): Promise<Liquid> {
  const roots: string[] = [];
  // One read for both: template overrides and source folder must name one installation.
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

/** Both hosts render from one template context; only the wrapper differs (markdown or TOML). */
export async function compileAgentForHost(
  provider: Provider,
  name: AgentName,
  agent: AgentConfig,
  fallbackRoot: string,
  engine: Liquid,
): Promise<string> {
  verbose(`Compiling agent: ${name} (${provider})`);

  const files = await readAgentFiles(name, agent, fallbackRoot);

  // Each skill's own `source` decides `${id}:${id}` versus a bare id; no `source` means bare.
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
