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
import type { AgentName, Domain } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";
import type { ProjectHandle } from "../pages/wizard-result.js";

/**
 * A plugin-mode project plus the fake HOME that owns the Claude plugin
 * registry. Plugin state lives in two files the CLI reads:
 *
 *   <project>/.claude/settings.json          -> enabledPlugins
 *   <home>/.claude/plugins/installed_plugins.json -> install paths
 *
 * Writing them directly reproduces a completed `claude plugin install` without
 * requiring the Claude CLI binary, so plugin-state tests run unconditionally.
 */
export type PluginInstalledProject = {
  project: ProjectHandle;
  home: string;
  /** `<skillId>@<marketplace>` keys written to settings.json and the registry. */
  pluginKeys: string[];
};

export type PluginInstalledProjectOptions = {
  /** Built plugin output dir (`<sourceDir>/dist/plugins`); each subdir is a plugin root. */
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

function pluginKeyFor(skillId: string, marketplace: string): string {
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

/**
 * Reads a plugin-state file that a prior install must already have written.
 *
 * The object is left opaque: callers here only clear one known key and spread
 * the rest through, so modelling the remaining fields would only invite them to
 * be dropped. A missing file means install never ran — a test bug, not a state
 * to substitute an empty object for.
 *
 * `JSON.parse` returns `any`, which the return type annotation narrows without
 * a cast.
 */
async function readJsonOrFail(filePath: string): Promise<Record<string, unknown>> {
  if (!(await fileExists(filePath))) {
    throw new Error(
      `Expected plugin state at ${filePath}, but it does not exist. Plugins must be installed by createPluginInstalledProject before they can be uninstalled.`,
    );
  }
  return JSON.parse(await readTestFile(filePath));
}

/**
 * Creates a project whose skills are installed as Claude plugins: config.ts
 * declares them with the marketplace as `source`, settings.json enables the
 * plugin keys, and the registry in the fake HOME resolves them to built plugin
 * directories.
 *
 * Plugin mode never copies skills into `.claude/skills/`, so none are written.
 */
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

  await writeJson(settingsPath(projectDir), {
    permissions: { allow: ["Read(*)"] },
    enabledPlugins: Object.fromEntries(pluginKeys.map((key) => [key, true])),
  });

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

/**
 * Clears every plugin of the project the way `claude plugin uninstall` does:
 * settings.json keeps no `enabledPlugins` entries and the registry keeps no
 * plugin records.
 *
 * Both files are read-modify-written, so every key this fixture does not own
 * survives — `permissions` and `extraKnownMarketplaces` in settings.json, the
 * registry `version`. config.ts is left untouched, so it keeps declaring skills
 * that are no longer installed.
 *
 * Both files must already exist: this is an uninstall, so a missing file means
 * the project was never installed.
 */
export async function uninstallProjectPlugins(installed: PluginInstalledProject): Promise<void> {
  const settingsFile = settingsPath(installed.project.dir);
  const registryFile = registryPath(installed.home);

  const settings = await readJsonOrFail(settingsFile);
  const registry = await readJsonOrFail(registryFile);

  await writeJson(settingsFile, { ...settings, enabledPlugins: {} });
  await writeJson(registryFile, { ...registry, plugins: {} });
}
