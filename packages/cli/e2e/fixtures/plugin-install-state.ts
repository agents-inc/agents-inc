import path from "path";
import { mkdir, writeFile } from "fs/promises";
import {
  createTempDir,
  directoryExists,
  fileExists,
  readTestFile,
  writeAgentStubs,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { DIRS, FILES } from "../pages/constants.js";
import { MAX_CONFIG_FILE_SIZE } from "../../src/cli/consts.js";
import { buildClaudeSettings } from "../../src/cli/lib/__tests__/factories/claude-settings-factories.js";
import type { ClaudeLeftover } from "../../src/cli/lib/__tests__/helpers/claude-stub.js";
import type { AgentName, Domain } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";
import type { ProjectHandle } from "./project-handle.js";

// Writes settings.json and the HOME's installed_plugins.json and known_marketplaces.json directly,
// reproducing a completed `claude plugin install` or `marketplace add` without the Claude binary.
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
const MARKETPLACE_ADDED_AT = "2026-01-01T00:00:00.000Z";
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

function knownMarketplacesPath(home: string): string {
  return path.join(home, DIRS.CLAUDE, DIRS.PLUGINS, FILES.KNOWN_MARKETPLACES_JSON);
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

async function readJsonIfPresent(filePath: string): Promise<Record<string, unknown>> {
  if (!(await fileExists(filePath))) return {};
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

  await writeJson(registryPath(home), userScopedRegistry(options));

  return { project: { dir: projectDir }, home, pluginKeys };
}

type RegisteredPlugins = Pick<
  PluginInstalledProjectOptions,
  "pluginsDir" | "marketplace" | "skillIds"
>;

function userScopedRegistry({ pluginsDir, marketplace, skillIds }: RegisteredPlugins) {
  return {
    version: REGISTRY_VERSION,
    plugins: Object.fromEntries(
      skillIds.map((id) => [
        pluginKeyFor(id, marketplace),
        [
          {
            scope: "user",
            installPath: path.join(pluginsDir, id),
            version: PLUGIN_VERSION,
            installedAt: PLUGIN_INSTALLED_AT,
          },
        ],
      ]),
    ),
  };
}

/** As `claude plugin install --scope user` leaves HOME's registry, holding only these plugins. */
export async function holdPluginsForTheUser(
  home: string,
  plugins: RegisteredPlugins,
): Promise<void> {
  await writeJson(registryPath(home), userScopedRegistry(plugins));
}

/** No plugins, padded past the CLI's read cap: Claude reads it, the CLI cannot say what it holds. */
export async function holdAPluginRegistryTheCliCannotRead(home: string): Promise<void> {
  const padding = " ".repeat(MAX_CONFIG_FILE_SIZE);
  await mkdir(path.dirname(registryPath(home)), { recursive: true });
  await writeFile(registryPath(home), `{"version":2,"plugins":{}${padding}}\n`);
}

export type MarketplaceDirectory = { name: string; sourceDir: string };

type UserSettings = { extraKnownMarketplaces?: Record<string, unknown> };

/** As `claude plugin marketplace add <dir>` leaves HOME, beside what settings.json held. */
export async function registerMarketplaceForTheUser(
  home: string,
  { name, sourceDir }: MarketplaceDirectory,
): Promise<void> {
  const source = { source: "directory", path: sourceDir };
  const settings: UserSettings = await readJsonIfPresent(settingsPath(home));
  const known = await readJsonIfPresent(knownMarketplacesPath(home));

  await writeJson(settingsPath(home), {
    ...settings,
    extraKnownMarketplaces: { ...settings.extraKnownMarketplaces, [name]: { source } },
  });
  await writeJson(knownMarketplacesPath(home), {
    ...known,
    [name]: { source, installLocation: sourceDir, lastUpdated: MARKETPLACE_ADDED_AT },
  });
}

/** The files Claude's `plugin uninstall` and `plugin marketplace remove` can leave holding nothing. */
export type ClaudeFileLeftEmpty = "projectSettings" | "userSettings" | "knownMarketplaces";

export const CLAUDE_FILES_LEFT_EMPTY = [
  "projectSettings",
  "userSettings",
  "knownMarketplaces",
] as const satisfies readonly ClaudeFileLeftEmpty[];

export type ClaudeFilesPresent = Record<ClaudeFileLeftEmpty, boolean>;

function claudeFilePath(file: ClaudeFileLeftEmpty, home: string, projectDir: string): string {
  switch (file) {
    case "projectSettings":
      return settingsPath(projectDir);
    case "userSettings":
      return settingsPath(home);
    case "knownMarketplaces":
      return knownMarketplacesPath(home);
  }
}

/** Nothing but empty containers, as Claude Code 2.1.317 leaves each once it has emptied it. */
function leftEmpty(file: ClaudeFileLeftEmpty): Record<string, unknown> {
  switch (file) {
    case "projectSettings":
      return { enabledPlugins: {} };
    case "userSettings":
      return { extraKnownMarketplaces: {} };
    case "knownMarketplaces":
      return {};
  }
}

/** As a user's own file holding nothing, written before any run. */
export async function holdClaudeFilesLeftEmpty(
  home: string,
  projectDir: string,
  files: readonly ClaudeFileLeftEmpty[],
): Promise<void> {
  await Promise.all(
    files.map((file) => writeJson(claudeFilePath(file, home, projectDir), leftEmpty(file))),
  );
}

export async function claudeFilesPresent(
  home: string,
  projectDir: string,
): Promise<ClaudeFilesPresent> {
  const present = (file: ClaudeFileLeftEmpty) => fileExists(claudeFilePath(file, home, projectDir));
  return {
    projectSettings: await present("projectSettings"),
    userSettings: await present("userSettings"),
    knownMarketplaces: await present("knownMarketplaces"),
  };
}

/** Beside the three files, what Claude Code 2.1.317's plugin verbs leave under its config folder. */
export type ClaudeHomeEntry =
  "pluginRegistry" | "marketplacesFolder" | "stateFile" | "stateBackups" | "pluginCache";

/** Those a take-back can leave holding nothing: a registry with no plugins, an empty folder. */
export type ClaudeHomeEntryLeftEmpty = Extract<
  ClaudeHomeEntry,
  "pluginRegistry" | "marketplacesFolder"
>;

export type ClaudeHomeEntriesPresent = Record<ClaudeHomeEntry, boolean>;

const CLAUDE_REGISTRY_LEFT_EMPTY = { version: 2, plugins: {} };

/** Each holds something, so only a take-back deleting what it should not would remove it. */
const CLAUDE_STATE = { numStartups: 1 };
const CLAUDE_STATE_BACKUP = `${FILES.CLAUDE_SESSION_JSON}.backup.1`;
const ORPHANED_AT = ".orphaned_at";
const ORPHANED_AT_TIME = "1793727265830";

function claudeHomePath(home: string, ...segments: string[]): string {
  return path.join(home, DIRS.CLAUDE, ...segments);
}

function claudeHomeEntryPath(entry: ClaudeHomeEntry, home: string): string {
  switch (entry) {
    case "pluginRegistry":
      return registryPath(home);
    case "marketplacesFolder":
      return claudeHomePath(home, DIRS.PLUGINS, DIRS.CLAUDE_PLUGIN_MARKETPLACES);
    case "stateFile":
      return claudeHomePath(home, FILES.CLAUDE_SESSION_JSON);
    case "stateBackups":
      return claudeHomePath(home, DIRS.CLAUDE_BACKUPS);
    case "pluginCache":
      return claudeHomePath(home, DIRS.PLUGINS, DIRS.PLUGIN_CACHE);
  }
}

/** As a user's own, written before any run: a registry with no plugins, an empty folder. */
export async function holdClaudeHomeLeftEmpty(
  home: string,
  entries: readonly ClaudeHomeEntryLeftEmpty[],
): Promise<void> {
  await Promise.all(
    entries.map((entry) =>
      entry === "pluginRegistry"
        ? writeJson(registryPath(home), CLAUDE_REGISTRY_LEFT_EMPTY)
        : mkdir(claudeHomeEntryPath(entry, home), { recursive: true }),
    ),
  );
}

export async function claudeHomeEntriesPresent(home: string): Promise<ClaudeHomeEntriesPresent> {
  const file = (entry: ClaudeHomeEntry) => fileExists(claudeHomeEntryPath(entry, home));
  const folder = (entry: ClaudeHomeEntry) => directoryExists(claudeHomeEntryPath(entry, home));
  return {
    pluginRegistry: await file("pluginRegistry"),
    marketplacesFolder: await folder("marketplacesFolder"),
    stateFile: await file("stateFile"),
    stateBackups: await folder("stateBackups"),
    pluginCache: await folder("pluginCache"),
  };
}

const asWritten = (value: unknown) => JSON.stringify(value, null, 2);

/** The three files as Claude leaves each once its uninstall and marketplace remove emptied it. */
export function claudeFilesLeftEmptyByClaude(home: string, projectDir: string): ClaudeLeftover[] {
  return CLAUDE_FILES_LEFT_EMPTY.map((file) => ({
    file: claudeFilePath(file, home, projectDir),
    content: asWritten(leftEmpty(file)),
  }));
}

/**
 * The rest of what Claude leaves under its home once a plugin it installed is uninstalled and its
 * marketplace removed: an empty registry and folder, and its state, backup and orphaned cache.
 */
export function claudeHomeLeftByClaude(
  home: string,
  { skillId, marketplace }: { skillId: string; marketplace: string },
): ClaudeLeftover[] {
  return [
    { file: registryPath(home), content: asWritten(CLAUDE_REGISTRY_LEFT_EMPTY) },
    { folder: claudeHomeEntryPath("marketplacesFolder", home) },
    { file: claudeHomeEntryPath("stateFile", home), content: asWritten(CLAUDE_STATE) },
    {
      file: path.join(claudeHomeEntryPath("stateBackups", home), CLAUDE_STATE_BACKUP),
      content: asWritten(CLAUDE_STATE),
    },
    {
      file: path.join(
        claudeHomeEntryPath("pluginCache", home),
        marketplace,
        skillId,
        PLUGIN_VERSION,
        ORPHANED_AT,
      ),
      content: ORPHANED_AT_TIME,
    },
  ];
}

/** The marketplaces Claude holds for the user, by name, in each of the two files `add` writes. */
export type MarketplaceRegistrations = { known: string[]; declared: string[] };

export async function readMarketplaceRegistrations(
  home: string,
): Promise<MarketplaceRegistrations> {
  const settings: UserSettings = await readJsonIfPresent(settingsPath(home));
  return {
    known: Object.keys(await readJsonIfPresent(knownMarketplacesPath(home))),
    declared: Object.keys(settings.extraKnownMarketplaces ?? {}),
  };
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
