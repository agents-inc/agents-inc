import { execa } from "execa";
import { realpathSync } from "fs";
import { mkdir, readdir, readFile, realpath, stat, writeFile } from "fs/promises";
import { stripVTControlCharacters } from "node:util";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import {
  CLAUDE_DIR,
  PLUGIN_MANIFEST_DIR,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../src/cli/consts.js";
import { providerInUse, sourceFolderInUse } from "../../src/cli/lib/installation/install-layout.js";
import { stampProvenanceMarker } from "../../src/cli/lib/agents/agent-provenance.js";
import { loadInstalledConfig } from "../../src/cli/lib/configuration/project-config.js";
import { matrix } from "../../src/cli/lib/matrix/matrix-provider.js";
import { generateConfigSource } from "../../src/cli/lib/configuration/config-writer.js";
import { splitConfigByScope } from "../../src/cli/lib/configuration/config-generator.js";
import {
  renderAgentMd,
  renderAgentYaml,
  renderConfigTs,
  renderIncompleteMetadataYaml,
  renderMetadataYaml,
  renderSkillMd,
  renderUnparseableMetadataYaml,
  renderUnparseableSkillMd,
} from "../../src/cli/lib/__tests__/content-generators.js";
import { writeTestPackageJson } from "../../src/cli/lib/__tests__/helpers/config-io.js";
import { normalizeGlobalConfig } from "../../src/cli/lib/__tests__/helpers/config-comparison.js";
import { parseCompiledAgentSections } from "../../src/cli/lib/__tests__/helpers/compiled-agent-sections.js";
import {
  normalizeInstallTree,
  readInstallTree,
} from "../../src/cli/lib/__tests__/helpers/golden-tree.js";
import { writeTestPluginManifest } from "../../src/cli/lib/__tests__/helpers/disk-writers.js";
import { matchedAsWritten } from "../../src/cli/lib/__tests__/helpers/matched-as-written.js";
import { compactCliOutput } from "../../src/cli/lib/__tests__/helpers/flatten-cli-output.js";
import { buildClaudeTrustState } from "../../src/cli/lib/__tests__/factories/claude-settings-factories.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  cleanupTempDir,
  createTempDir as createTempDirBase,
  directoryExists,
  fileExists,
} from "../../src/cli/lib/__tests__/test-fs-utils.js";

import type {
  AgentName,
  AgentScopeConfig,
  Marketplace,
  PluginManifest,
  ProjectConfig,
} from "../../src/cli/types/index.js";
import type { FixtureProjectConfig } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { DIRS, FILES, e2eSkillId } from "../pages/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** `packages/cli`, not the monorepo root. */
export const CLI_ROOT = path.resolve(__dirname, "../..");

// Resolve siblings of the checkout (e.g. `../skills`) from here, never from CLI_ROOT.
export const MONOREPO_ROOT = path.resolve(CLI_ROOT, "../..");

/** Requires `bun run build` first. */
export const BIN_RUN = path.join(CLI_ROOT, "bin", "run.js");

const cliManifestSchema = z.object({ version: z.string().min(1) });

/** The version the CLI under test stamps into what it compiles, read from its own manifest. */
export async function cliVersionUnderTest(): Promise<string> {
  const manifest = await readFile(path.join(CLI_ROOT, FILES.PACKAGE_JSON), "utf-8");
  return cliManifestSchema.parse(JSON.parse(manifest)).version;
}

export function sourceFolderIn(dir: string): string {
  return sourceFolderInUse(dir, providerInUse(dir)).dir;
}

/** Relative to `dir`, e.g. `.agents-inc/claude`. */
function sourceFolderRelIn(dir: string): string {
  return sourceFolderInUse(dir, providerInUse(dir)).relName;
}

// Stops oclif's update plugin spawning a detached child that writes into the fake HOME after the
// run exits. Spread first at each spawn door so a spec can still override it.
export const NO_BACKGROUND_VERSION_CHECK = { AGENTS_INC_SKIP_NEW_VERSION_CHECK: "1" };

// Unset, the product falls back to the production API; loopback port 1 fails fast instead.
export const NO_LIVE_SEED_API = { AGENTS_INC_API_URL: "http://127.0.0.1:1" };

// A worker on another machine, so printed links open the live editor; `.invalid` never resolves.
export const REMOTE_SEED_API = { AGENTS_INC_API_URL: "https://api.agentsinc.invalid" };

const E2E_TEMP_PREFIX = "ai-e2e-";
const AUTO_HOME_PREFIX = "ai-e2e-home-";

// The full field set, since doctor validates installed metadata.yaml against the strict schema.
export const FORKED_FROM_METADATA = renderMetadataYaml({
  author: "@agents-inc",
  displayName: "web-framework-react",
  category: "web-framework",
  slug: "react",
  cliDescription: "E2E forked skill",
  usageGuidance: "Use when testing fork provenance in E2E scenarios",
  contentHash: "e2eab01",
  forkedFrom: {
    skillId: e2eSkillId("web-framework-react"),
    contentHash: "e2eab01",
    date: "2026-01-01",
  },
});

export type {
  FixtureProjectConfig,
  FixtureSkillConfig,
  FixtureStackAgentConfig,
} from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
export type { InstallTree } from "../../src/cli/lib/__tests__/helpers/golden-tree.js";

export async function createTempDir(): Promise<string> {
  return createTempDirBase(E2E_TEMP_PREFIX);
}

export type IsolatedClaudeHome = {
  home: string;
  /** Pass as `CLAUDE_CONFIG_DIR` or `{ configDir }`. */
  configDir: string;
};

// `CLAUDE_CONFIG_DIR` beats `HOME`, and in-process callers have no fake HOME, so name it explicitly.
export async function createIsolatedClaudeHome(): Promise<IsolatedClaudeHome> {
  const home = await createTempDir();
  return { home, configDir: claudeConfigDir(home) };
}

export function claudeConfigDir(home: string): string {
  return path.join(home, CLAUDE_DIR);
}

// `CODEX_HOME` beats `HOME` in Codex, so every door pins it.
export function codexHome(home: string): string {
  return path.join(home, DIRS.CODEX);
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const POLL_INTERVAL_MS = 50;

export async function pollUntil(
  isSatisfied: () => boolean,
  timeoutMs: number,
  buildTimeoutError: () => Error,
): Promise<void> {
  const start = Date.now();
  while (!isSatisfied()) {
    if (Date.now() - start > timeoutMs) {
      throw buildTimeoutError();
    }
    await delay(POLL_INTERVAL_MS);
  }
}

// Tolerates `undefined`: a throwing `beforeAll` leaves the fixture unassigned.
export async function cleanupFixture(fixture: { tempDir: string } | undefined): Promise<void> {
  if (fixture !== undefined) await cleanupTempDir(fixture.tempDir);
}

export async function cleanupIsolatedClaudeHome(
  isolated: IsolatedClaudeHome | undefined,
): Promise<void> {
  if (isolated !== undefined) await cleanupTempDir(isolated.home);
}

export {
  cleanupTempDir,
  directoryExists,
  fileExists,
  matchedAsWritten,
  normalizeGlobalConfig,
  normalizeInstallTree,
  parseCompiledAgentSections,
  readInstallTree,
  renderAgentMd,
  renderAgentYaml,
  renderConfigTs,
  renderIncompleteMetadataYaml,
  renderMetadataYaml,
  renderSkillMd,
  renderUnparseableMetadataYaml,
  renderUnparseableSkillMd,
  writeTestPackageJson,
  writeTestPluginManifest,
};

// Records `source` as `init --marketplace` would, in the first config of `baseDirs` (resolution
// order). A config that already names one is left untouched.
export async function recordInstallSource(baseDirs: string[], source: string): Promise<void> {
  for (const baseDir of baseDirs) {
    const loaded = await loadInstalledConfig(baseDir);
    if (!loaded) continue;
    if (loaded.config.marketplace === undefined) {
      const { name = "e2e-project", ...rest } = loaded.config;
      await writeProjectConfig(baseDir, { ...rest, name, marketplace: source });
    }
    return;
  }

  throw new Error(
    `No config.ts in ${baseDirs.join(" or ")} to record a source in — build the install before pointing it at a source.`,
  );
}

type InlinedGlobalOptions = { isProjectConfig: true; globalConfig: ProjectConfig };

// Written through the product's own writer, so specs assert on the shape the CLI really emits.
export async function writeProjectConfig(
  baseDir: string,
  config: Partial<FixtureProjectConfig> & Pick<FixtureProjectConfig, "name">,
  options?: InlinedGlobalOptions,
): Promise<void> {
  await writeProjectConfigIn(baseDir, sourceFolderRelIn(baseDir), config, options);
}

// For specs whose subject is which folder holds the config.
export async function writeProjectConfigIn(
  baseDir: string,
  sourceFolder: string,
  config: Partial<FixtureProjectConfig> & Pick<FixtureProjectConfig, "name">,
  options?: InlinedGlobalOptions,
): Promise<void> {
  const resolved: FixtureProjectConfig = { skills: [], agents: [], ...config };
  const configDir = path.join(baseDir, sourceFolder);
  await mkdir(configDir, { recursive: true });
  // Fixture ids are `string`; the writer only serialises them.
  const source = generateConfigSource(resolved as ProjectConfig, matrix, options);
  const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
  await writeFile(configPath, source);
  await refuseUnreachableConfig(baseDir, configPath, source, options);
}

// Load-and-rewrite must round-trip byte-identically, or the fixture states something the product
// would normalise away. Skipped when the product reads a different file than the one written.
async function refuseUnreachableConfig(
  baseDir: string,
  configPath: string,
  source: string,
  options: InlinedGlobalOptions | undefined,
): Promise<void> {
  const reread = await loadInstalledConfig(baseDir);
  if (!reread || reread.configPath !== configPath) return;

  const again = generateConfigSource(withoutInlinedGlobal(reread.config, options), matrix, options);
  if (again === source) return;

  throw new Error(
    `This fixture wrote a config.ts the CLI would not have written, at ${baseDir}. Reading it ` +
      `back and writing it again gives different bytes, which means the product normalises ` +
      `something the fixture stated — most often a stack category taken from a skill id's prefix ` +
      `rather than looked up. Written:\n${source}\nRe-written after loading:\n${again}`,
  );
}

// An inlined global reads back as part of the project; the product splits it off before writing.
function withoutInlinedGlobal(
  config: ProjectConfig,
  options: InlinedGlobalOptions | undefined,
): ProjectConfig {
  return options ? splitConfigByScope(config).project : config;
}

export async function writeConfigTypes(
  baseDir: string,
  sourceFolder: string = sourceFolderRelIn(baseDir),
): Promise<void> {
  const configDir = path.join(baseDir, sourceFolder);
  await mkdir(configDir, { recursive: true });
  await writeFile(
    path.join(configDir, STANDARD_FILES.CONFIG_TYPES_TS),
    "// AUTO-GENERATED\nexport type SkillId = string;\n",
  );
}

// The folder is resolved, so an unloadable config lands where the CLI actually reads.
export async function writeCorruptConfig(baseDir: string, source: string): Promise<void> {
  const configDir = sourceFolderIn(baseDir);
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(configDir, STANDARD_FILES.CONFIG_TS), source);
}

/** What an older release left in `root`: its config pair, and an agent the user wrote there. */
export async function writeRetiredSourceFolder(root: string): Promise<void> {
  await writeProjectConfigIn(
    root,
    DIRS.RETIRED_SOURCE,
    buildProjectConfig({ name: "old-layout", skills: [], agents: [] }),
  );
  await writeConfigTypes(root, DIRS.RETIRED_SOURCE);
  const usersAgent = path.join(
    root,
    DIRS.RETIRED_SOURCE,
    DIRS.AGENTS,
    "my-agent",
    FILES.IDENTITY_MD,
  );
  await mkdir(path.dirname(usersAgent), { recursive: true });
  await writeFile(usersAgent, "An agent the user wrote under the old folder.\n");
}

export function stripAnsi(text: string): string {
  return stripVTControlCharacters(text);
}

/**
 * Leaves out the temp folder, so a negative about a folder name reads only what the CLI named. Both
 * spellings, since not every fixture resolves a temp folder that is a link.
 */
export function compactedWithoutTempFolder(output: string): string {
  return compactCliOutput(output)
    .replaceAll(compactCliOutput(realpathSync(os.tmpdir())), "<tmp>")
    .replaceAll(compactCliOutput(os.tmpdir()), "<tmp>");
}

// HOME defaults to a fresh temp dir (removed after the run), never cwd, so a project command is not
// forced into global scope. Env hygiene matches `CLI.run`; e2e-runner-environment.test.ts checks it.
export async function runCLI(
  args: string[],
  cwd: string,
  options?: { env?: Record<string, string | undefined> },
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  combined: string;
}> {
  const { home, autoCreated } = await resolveRunHome(options?.env?.HOME);
  try {
    const result = await execa("node", [BIN_RUN, ...args], {
      cwd,
      reject: false,
      env: {
        ...NO_BACKGROUND_VERSION_CHECK,
        ...NO_LIVE_SEED_API,
        CC_MARKETPLACE: undefined,
        XDG_CACHE_HOME: undefined,
        GIGET_AUTH: undefined,
        VITEST: undefined,
        ...options?.env,
        HOME: home,
        CLAUDE_CONFIG_DIR: claudeConfigDir(home),
        CODEX_HOME: codexHome(home),
      },
    });
    return {
      exitCode: result.exitCode ?? 1,
      stdout: stripAnsi(result.stdout),
      stderr: stripAnsi(result.stderr),
      combined: stripAnsi(result.stdout + result.stderr),
    };
  } finally {
    if (autoCreated) {
      await cleanupTempDir(home);
    }
  }
}

async function resolveRunHome(
  explicitHome: string | undefined,
): Promise<{ home: string; autoCreated: boolean }> {
  if (explicitHome !== undefined) return { home: explicitHome, autoCreated: false };
  return { home: await createTempDirBase(AUTO_HOME_PREFIX), autoCreated: true };
}

export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}

export async function readTestFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

export async function readMarketplaceJson(outputPath: string): Promise<Marketplace> {
  const content = await readFile(outputPath, "utf-8");
  // Boundary cast over parsed JSON.
  return JSON.parse(content) as Marketplace;
}

async function readPluginManifestJson(
  pluginsDir: string,
  pluginName: string,
): Promise<PluginManifest> {
  const manifestPath = path.join(
    pluginsDir,
    pluginName,
    PLUGIN_MANIFEST_DIR,
    STANDARD_FILES.PLUGIN_JSON,
  );
  const content = await readFile(manifestPath, "utf-8");
  // Boundary cast over parsed JSON.
  return JSON.parse(content) as PluginManifest;
}

// The whole map is the contract: a version that moved wrongly fails as much as one that did not move.
export async function readPluginVersions(
  pluginsDir: string,
  pluginNames: readonly string[],
): Promise<Record<string, string | undefined>> {
  const entries = await Promise.all(
    pluginNames.map(
      async (name) => [name, (await readPluginManifestJson(pluginsDir, name)).version] as const,
    ),
  );
  return Object.fromEntries(entries);
}

type LocalSkillOptions = { description?: string; body?: string; metadata?: string };

// Claude's `.claude/skills` layout; for another provider use `createLocalSkillIn`.
export async function createLocalSkill(
  projectDir: string,
  skillId: string,
  options?: LocalSkillOptions,
): Promise<string> {
  return createLocalSkillIn(
    path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS),
    skillId,
    options,
  );
}

export async function createLocalSkillIn(
  skillsDir: string,
  skillId: string,
  options?: LocalSkillOptions,
): Promise<string> {
  const skillDir = path.join(skillsDir, skillId);
  await mkdir(skillDir, { recursive: true });

  const description = options?.description ?? `A test skill`;
  await writeFile(
    path.join(skillDir, STANDARD_FILES.SKILL_MD),
    renderSkillMd(skillId, description, options?.body ?? `# ${skillId}`),
  );

  if (options?.metadata) {
    await writeFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), options.metadata);
  }

  return skillDir;
}

const AGENT_STUB_BODY = "Test agent content.\n";

type AgentFileOptions = {
  /** Written verbatim after the frontmatter (or as the whole file). */
  body?: string;
  frontmatter?: boolean;
  /** The marker doctor and uninstall use to tell CLI-written agents from the user's. */
  provenance?: boolean;
};

// Default is a hand-authored shape; `frontmatter: true` gives the `name` + `description` a compile writes.
export async function writeAgentFile(
  baseDir: string,
  agentName: string,
  options?: AgentFileOptions,
): Promise<void> {
  const agentsDir = agentsPath(baseDir);
  await mkdir(agentsDir, { recursive: true });

  const body = options?.body ?? `# ${agentName}\n`;
  const frontmatter = `---\nname: ${agentName}\ndescription: Test ${agentName} agent\n---\n`;
  const rendered = options?.frontmatter ? `${frontmatter}${body}` : body;
  const content = options?.provenance ? stampProvenanceMarker(rendered) : rendered;

  await writeFile(path.join(agentsDir, `${agentName}.md`), content);
}

export async function writeAgentStubs(projectDir: string, agents: string[]): Promise<void> {
  for (const agent of agents) {
    await writeAgentFile(projectDir, agent, { frontmatter: true, body: AGENT_STUB_BODY });
  }
}

const DEFAULT_ALLOW_PERMISSION = "Read(*)";

// Merges into an existing settings.json; invalid JSON is a hard error.
export async function createPermissionsFile(projectDir: string): Promise<void> {
  const claudeDir = path.join(projectDir, CLAUDE_DIR);
  await mkdir(claudeDir, { recursive: true });
  const settingsPath = path.join(claudeDir, STANDARD_FILES.SETTINGS_JSON);

  const settings = await readSettingsOrEmpty(settingsPath);
  const permissions = asRecord(settings.permissions);
  const allow = asArray(permissions.allow);
  if (allow.includes(DEFAULT_ALLOW_PERMISSION)) return;

  settings.permissions = { ...permissions, allow: [...allow, DEFAULT_ALLOW_PERMISSION] };
  await writeFile(settingsPath, JSON.stringify(settings));
}

async function readSettingsOrEmpty(settingsPath: string): Promise<Record<string, unknown>> {
  if (!(await fileExists(settingsPath))) return {};
  // Boundary cast over parsed JSON; callers narrow each field.
  return JSON.parse(await readFile(settingsPath, "utf-8")) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

// Keyed by realpath (inside a git repo Claude Code keys by the repo root, so pass that). Written under
// CLAUDE_CONFIG_DIR, which every door pins.
export async function acceptClaudeTrustPrompt(home: string, projectDir: string): Promise<void> {
  await mkdir(claudeConfigDir(home), { recursive: true });
  await writeFile(
    path.join(claudeConfigDir(home), FILES.CLAUDE_SESSION_JSON),
    JSON.stringify(buildClaudeTrustState([await realpath(projectDir)])),
  );
}

export function agentsPath(dir: string): string {
  return path.join(dir, CLAUDE_DIR, "agents");
}

export function skillsPath(dir: string): string {
  return path.join(dir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
}

// Compares bytes, not the roster. `{}` for an absent dir, so check non-empty before asserting "unchanged".
export async function readCompiledAgents(dir: string): Promise<Record<string, string>> {
  const agentDir = agentsPath(dir);
  const files = (await listFiles(agentDir)).filter((file) => file.endsWith(".md"));
  const entries = await Promise.all(
    files.map(async (file) => [file, await readFile(path.join(agentDir, file), "utf-8")] as const),
  );
  return Object.fromEntries(entries);
}

export type TreeSnapshotEntry = {
  content: string;
  modifiedAtMs: number;
};

// mtime catches a rewrite with identical bytes. `{}` for an absent dir, so check non-empty before
// asserting "unchanged".
export async function readTreeSnapshot(dir: string): Promise<Record<string, TreeSnapshotEntry>> {
  if (!(await directoryExists(dir))) return {};

  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const snapshot = await Promise.all(
    files.map(async (file) => {
      const absolute = path.join(file.parentPath, file.name);
      const [content, stats] = await Promise.all([readFile(absolute, "utf-8"), stat(absolute)]);
      return [path.relative(dir, absolute), { content, modifiedAtMs: stats.mtimeMs }] as const;
    }),
  );
  return Object.fromEntries(snapshot);
}

export function configTsPath(dir: string): string {
  return path.join(sourceFolderIn(dir), STANDARD_FILES.CONFIG_TS);
}

export function configTypesTsPath(dir: string): string {
  return path.join(sourceFolderIn(dir), STANDARD_FILES.CONFIG_TYPES_TS);
}

export async function loadConfigOrFail(dir: string): Promise<ProjectConfig> {
  const loaded = await loadInstalledConfig(dir);
  if (!loaded) {
    throw new Error(`config.ts must exist and be loadable at ${dir}`);
  }
  return loaded.config;
}

export async function readAgentEntriesFor(
  dir: string,
  agentName: AgentName,
): Promise<AgentScopeConfig[]> {
  const config = await loadConfigOrFail(dir);
  return config.agents.filter((agent) => agent.name === agentName);
}

// Marks the skill CLI-managed, so `uninstall` removes it rather than skipping it as user-created.
export async function addForkedFromMetadata(projectDir: string, skillId: string): Promise<void> {
  const metadataPath = path.join(
    projectDir,
    CLAUDE_DIR,
    STANDARD_DIRS.SKILLS,
    skillId,
    STANDARD_FILES.METADATA_YAML,
  );
  await writeFile(metadataPath, FORKED_FROM_METADATA);
}

export async function injectMarketplaceIntoConfig(
  baseDir: string,
  marketplaceName: string,
): Promise<void> {
  const configPath = configTsPath(baseDir);
  const content = await readFile(configPath, "utf-8");

  const marker = "export default {";
  const idx = content.indexOf(marker);
  if (idx === -1) {
    throw new Error(
      `Could not find "${marker}" in config.ts. Content starts with: ${content.slice(0, 200)}`,
    );
  }
  const insertAt = idx + marker.length;
  const patched =
    content.slice(0, insertAt) +
    `\n  "marketplaceName": "${marketplaceName}",` +
    content.slice(insertAt);

  await writeFile(configPath, patched, "utf-8");
}

export function getEjectedTemplatePath(projectDir: string): string {
  return path.join(sourceFolderIn(projectDir), "agents", "_templates", "agent.liquid");
}

export { HANDED_OUT_INVOCATIONS } from "../../src/cli/lib/__tests__/helpers/handed-out-invocations.js";
export {
  compactCliOutput,
  flattenCliOutput,
} from "../../src/cli/lib/__tests__/helpers/flatten-cli-output.js";

export { createE2ESource } from "./create-e2e-source.js";
export type { E2ESource } from "./create-e2e-source.js";

// Driven directly rather than through `PluginHost`: marketplace list/remove are on no host interface.
export {
  isClaudeCLIAvailable,
  claudePluginMarketplaceAdd,
  claudePluginMarketplaceList,
  claudePluginMarketplaceRemove,
  claudePluginInstall,
  claudePluginUninstall,
} from "../../src/cli/lib/hosts/claude-host.js";
export type { ClaudeConfigOptions, MarketplaceInfo } from "../../src/cli/lib/hosts/claude-host.js";
export { execCommand } from "../../src/cli/utils/exec.js";
