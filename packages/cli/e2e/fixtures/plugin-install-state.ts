import path from "path";
import { mkdir, writeFile } from "fs/promises";
import {
  createTempDir,
  fileExists,
  readTestFile,
  writeAgentStubs,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { DIRS, FILES } from "../pages/constants.js";
import { buildClaudeSettings } from "../../src/cli/lib/__tests__/factories/claude-settings-factories.js";
import type { AgentName, Domain } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";
import type { ProjectHandle } from "./project-handle.js";

// Writes settings.json `enabledPlugins` and the HOME's installed_plugins.json directly, reproducing
// a completed `claude plugin install` without the Claude binary.
export type PluginInstalledProject = {
  project: ProjectHandle;
  home: string;
  pluginKeys: string[];
};

export type PluginInstalledProjectOptions = {
  /** `<sourceDir>/dist/plugins`; each subdir is a plugin root. */
  pluginsDir: string;
  marketplace: string;
  skillIds: string[];
  agents: AgentName[];
  stack: Partial<Record<AgentName, FixtureStackAgentConfig>>;
  domains?: Domain[];
};

const PLUGIN_VERSION = "1.0.0";
const PLUGIN_INSTALLED_AT = "2026-01-01T00:00:00.000Z";
const REGISTRY_VERSION = 1;

export function pluginKeyFor(skillId: string, marketplace: string): string {
  return `${skillId}@${marketplace}`;
}

function settingsPath(projectDir: string): string {
  return path.join(projectDir, DIRS.CLAUDE, FILES.SETTINGS_JSON);
}

function registryPath(home: string): string {
  return path.join(home, DIRS.CLAUDE, DIRS.PLUGINS, FILES.INSTALLED_PLUGINS_JSON);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

// Opaque on purpose: callers clear one key and spread the rest through.
async function readJsonOrFail(filePath: string): Promise<Record<string, unknown>> {
  if (!(await fileExists(filePath))) {
    throw new Error(
      `Expected plugin state at ${filePath}, but it does not exist. Plugins must be installed by createPluginInstalledProject before they can be uninstalled.`,
    );
  }
  return JSON.parse(await readTestFile(filePath));
}

export type PluginRegistration = { scope: string } & Record<string, unknown>;

export async function readPluginRegistrations(
  home: string,
  pluginKey: string,
): Promise<PluginRegistration[]> {
  const registryFile = registryPath(home);
  if (!(await fileExists(registryFile))) return [];

  const registry: { plugins?: Record<string, PluginRegistration[]> } = JSON.parse(
    await readTestFile(registryFile),
  );
  return registry.plugins?.[pluginKey] ?? [];
}

// Plugin mode copies nothing into `.claude/skills/`.
export async function createPluginInstalledProject(
  options: PluginInstalledProjectOptions,
): Promise<PluginInstalledProject> {
  const tempDir = await createTempDir();
  const home = path.join(tempDir, "home");
  const projectDir = path.join(tempDir, "project");
  const pluginKeys = options.skillIds.map((id) => pluginKeyFor(id, options.marketplace));

  await writeProjectConfig(projectDir, {
    name: "plugin-installed-project",
    marketplaceName: options.marketplace,
    skills: options.skillIds.map((id) => ({
      id,
      scope: "project" as const,
      origin: options.marketplace,
    })),
    agents: options.agents.map((name) => ({ name, scope: "project" as const })),
    selectedDomains: options.domains ?? ["web"],
    stack: options.stack,
  });

  await writeAgentStubs(projectDir, options.agents);

  await writeJson(settingsPath(projectDir), buildClaudeSettings(pluginKeys));

  await writeJson(registryPath(home), {
    version: REGISTRY_VERSION,
    plugins: Object.fromEntries(
      options.skillIds.map((id) => [
        pluginKeyFor(id, options.marketplace),
        [
          {
            scope: "user",
            installPath: path.join(options.pluginsDir, id),
            version: PLUGIN_VERSION,
            installedAt: PLUGIN_INSTALLED_AT,
          },
        ],
      ]),
    ),
  });

  return { project: { dir: projectDir }, home, pluginKeys };
}

// As `claude plugin uninstall` leaves it: other keys survive, and config.ts still declares the skills.
export async function uninstallProjectPlugins(installed: PluginInstalledProject): Promise<void> {
  const settingsFile = settingsPath(installed.project.dir);
  const registryFile = registryPath(installed.home);

  const settings = await readJsonOrFail(settingsFile);
  const registry = await readJsonOrFail(registryFile);

  await writeJson(settingsFile, { ...settings, enabledPlugins: {} });
  await writeJson(registryFile, { ...registry, plugins: {} });
}
