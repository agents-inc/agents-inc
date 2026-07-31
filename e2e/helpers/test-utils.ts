import { execa } from "execa";
import { cp, mkdir, readdir, readFile, writeFile } from "fs/promises";
import { stripVTControlCharacters } from "node:util";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import {
  CACHE_DIR,
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../src/cli/consts.js";
import { DEFAULT_SOURCE } from "../../src/cli/lib/configuration/config.js";
import { sanitizeSourceForCache } from "../../src/cli/lib/loading/source-fetcher.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/project-config.js";
import {
  renderAgentMd,
  renderAgentYaml,
  renderConfigTs,
  renderMetadataYaml,
  renderSkillMd,
} from "../../src/cli/lib/__tests__/content-generators.js";
import { writeTestPackageJson } from "../../src/cli/lib/__tests__/helpers/config-io.js";
import { normalizeGlobalConfig } from "../../src/cli/lib/__tests__/helpers/config-comparison.js";
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
  ProjectConfig,
  SkillId,
} from "../../src/cli/types/index.js";
import type { InitWizard } from "../pages/wizards/init-wizard.js";
import type { WizardResult } from "../pages/wizard-result.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Absolute path to the repository root */
export const CLI_ROOT = path.resolve(__dirname, "../..");

/** Absolute path to the built binary (requires `npm run build` first) */
export const BIN_RUN = path.join(CLI_ROOT, "bin", "run.js");

const E2E_TEMP_PREFIX = "ai-e2e-";
const AUTO_HOME_PREFIX = "ai-e2e-home-";

/**
 * Standard forkedFrom metadata block for E2E plugin/uninstall tests.
 * Represents a skill forked from web-framework-react in the E2E source.
 */
export const FORKED_FROM_METADATA = renderMetadataYaml({
  author: "@agents-inc",
  contentHash: "e2e-hash",
  forkedFrom: { skillId: "web-framework-react", contentHash: "e2e-hash", date: "2026-01-01" },
});

export async function createTempDir(): Promise<string> {
  return createTempDirBase(E2E_TEMP_PREFIX);
}

/** Wait for the given number of milliseconds. Shared delay utility for PTY-based tests. */
export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const POLL_INTERVAL_MS = 50;

/**
 * Polls `isSatisfied` until it returns true, or throws `buildTimeoutError()`
 * once `timeoutMs` has elapsed. Shared skeleton for all PTY wait helpers.
 */
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

export {
  cleanupTempDir,
  directoryExists,
  fileExists,
  normalizeGlobalConfig,
  renderAgentMd,
  renderAgentYaml,
  renderConfigTs,
  renderMetadataYaml,
  renderSkillMd,
  writeTestPackageJson,
};

/** Write a config.ts file to the .claude-src/ directory of the given base dir. */
export async function writeProjectConfig(
  baseDir: string,
  config: Partial<ProjectConfig> & Pick<ProjectConfig, "name">,
): Promise<void> {
  const resolved: ProjectConfig = { skills: [], agents: [], ...config };
  const configDir = path.join(baseDir, CLAUDE_SRC_DIR);
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(configDir, STANDARD_FILES.CONFIG_TS), renderConfigTs(resolved));
}

/**
 * Write a minimal config-types.ts stub to the .claude-src/ directory of the given
 * base dir. `writeProjectConfig` emits only config.ts; tests that assert on the
 * companion config-types.ts (e.g. uninstall manifest removal) seed it with this.
 */
export async function writeConfigTypes(baseDir: string): Promise<void> {
  const configDir = path.join(baseDir, CLAUDE_SRC_DIR);
  await mkdir(configDir, { recursive: true });
  await writeFile(
    path.join(configDir, STANDARD_FILES.CONFIG_TYPES_TS),
    "// AUTO-GENERATED\nexport type SkillId = string;\n",
  );
}

/**
 * Write arbitrary text as `.claude-src/config.ts` — the error-path counterpart of
 * {@link writeProjectConfig}, which can only emit a well-formed config. Used to reproduce a config
 * file that EXISTS but cannot be loaded (syntax error, no default export, schema violation), the
 * state the loader reports as `ConfigLoadError` rather than as a missing file.
 */
export async function writeCorruptConfig(baseDir: string, source: string): Promise<void> {
  const configDir = path.join(baseDir, CLAUDE_SRC_DIR);
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(configDir, STANDARD_FILES.CONFIG_TS), source);
}

/** Sub-path of a source cache entry inside CACHE_DIR (mirrors getCacheDir in source-fetcher.ts). */
const SOURCE_CACHE_SUBDIR = "sources";

/**
 * Populate the CLI's source cache for `DEFAULT_SOURCE` under `homeDir` with a
 * copy of `sourceDir`, so the public-marketplace fallback in the multi-source
 * loader resolves from disk instead of hitting the network.
 *
 * The CLI derives its cache root from `os.homedir()`, which the spawned process
 * resolves from the HOME it is given — so the seed is written under the test's
 * fake home, re-rooting the production `CACHE_DIR` shape rather than restating
 * it. Returns the seeded directory so callers can assert the seed landed.
 */
export async function seedDefaultSourceCache(homeDir: string, sourceDir: string): Promise<string> {
  const cacheDir = path.join(
    homeDir,
    path.relative(os.homedir(), CACHE_DIR),
    SOURCE_CACHE_SUBDIR,
    sanitizeSourceForCache(DEFAULT_SOURCE),
  );
  await mkdir(path.dirname(cacheDir), { recursive: true });
  await cp(sourceDir, cacheDir, { recursive: true });
  return cacheDir;
}

export async function ensureBinaryExists(): Promise<void> {
  const binExists = await fileExists(BIN_RUN);
  if (!binExists) {
    throw new Error(
      `CLI binary not found at ${BIN_RUN}. Run 'npm run build' before running E2E tests.`,
    );
  }
}

/** Strip ANSI escape sequences from CLI output */
export function stripAnsi(text: string): string {
  return stripVTControlCharacters(text);
}

/**
 * Run a CLI command via the built binary and return stripped output.
 *
 * Wraps the common `execa("node", [BIN_RUN, ...args], { cwd, reject: false })`
 * pattern used across all non-interactive E2E command tests. All output fields
 * are pre-stripped of ANSI escape sequences.
 *
 * HOME defaults to a freshly-created sibling temp directory, distinct from
 * cwd, so os.homedir() never collapses onto the project directory (which would
 * silently force a project command into global scope) while still isolating
 * tests from the user's real global config (~/.claude-src/config.ts). The
 * auto-created directory is removed after the run. Callers that need a specific
 * HOME override via options.env.HOME; an explicit value always wins and is
 * never auto-removed.
 */
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
  const explicitHome = options?.env?.HOME;
  const autoHomeDir =
    typeof explicitHome === "string" ? undefined : await createTempDirBase(AUTO_HOME_PREFIX);
  const home = autoHomeDir ?? explicitHome;
  try {
    const result = await execa("node", [BIN_RUN, ...args], {
      cwd,
      reject: false,
      env: { ...options?.env, HOME: home },
    });
    return {
      exitCode: result.exitCode ?? 1,
      stdout: stripAnsi(result.stdout),
      stderr: stripAnsi(result.stderr),
      combined: stripAnsi(result.stdout + result.stderr),
    };
  } finally {
    if (autoHomeDir) {
      await cleanupTempDir(autoHomeDir);
    }
  }
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

/**
 * Reads and parses a generated marketplace.json file.
 *
 * Used by `build marketplace` / `new marketplace` E2E tests to assert on the
 * generated marketplace contents.
 */
export async function readMarketplaceJson(outputPath: string): Promise<Marketplace> {
  const content = await readFile(outputPath, "utf-8");
  // Boundary cast: JSON.parse returns `unknown`, caller consumes as Marketplace
  return JSON.parse(content) as Marketplace;
}

/**
 * Creates a local skill directory under `<projectDir>/.claude/skills/<skillId>/`
 * with SKILL.md and optional metadata.yaml.
 *
 * Returns the absolute path to the skill directory.
 */
export async function createLocalSkill(
  projectDir: string,
  skillId: SkillId,
  options?: { description?: string; body?: string; metadata?: string },
): Promise<string> {
  const skillDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, skillId);
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
  /**
   * Exact file body. Written verbatim after the frontmatter block (or as the
   * whole file when `frontmatter` is false), so callers control trailing
   * newlines themselves.
   */
  body?: string;
  /** Prefix the body with a `---\nname: <agentName>\n---\n` block. */
  frontmatter?: boolean;
};

/**
 * Write an agent .md file to `<baseDir>/.claude/agents/`, creating the
 * directory if needed.
 *
 * Defaults to a bare `# <agentName>` heading with no frontmatter, which is all
 * `doctor` and `list` need to see an agent as present.
 */
export async function writeAgentFile(
  baseDir: string,
  agentName: string,
  options?: AgentFileOptions,
): Promise<void> {
  const agentsDir = agentsPath(baseDir);
  await mkdir(agentsDir, { recursive: true });

  const body = options?.body ?? `# ${agentName}\n`;
  const content = options?.frontmatter ? `---\nname: ${agentName}\n---\n${body}` : body;

  await writeFile(path.join(agentsDir, `${agentName}.md`), content);
}

/**
 * Writes minimal compiled-agent stubs (frontmatter with name only) into
 * `<projectDir>/.claude/agents/`, as left behind by a prior compile.
 */
export async function writeAgentStubs(projectDir: string, agents: string[]): Promise<void> {
  for (const agent of agents) {
    await writeAgentFile(projectDir, agent, { frontmatter: true, body: AGENT_STUB_BODY });
  }
}

/**
 * Ensures `.claude/settings.json` grants the default allow permission.
 *
 * This works around the permission checker that renders a blocking Ink component
 * after install completes (see FINDINGS.md, Finding 7). Without this file,
 * the PTY process never exits because the permission prompt waits for input.
 *
 * MERGES rather than overwrites: when the file already exists (e.g. a plugin
 * install wrote `enabledPlugins` / `extraKnownMarketplaces` before an
 * EditWizard launch re-runs this helper), every existing field is preserved
 * and only `permissions.allow` is ensured to contain "Read(*)". A file that
 * already grants it is left byte-identical. Invalid JSON is a hard error —
 * never silently clobber a corrupt settings file.
 */
const DEFAULT_ALLOW_PERMISSION = "Read(*)";

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

/** Parses an existing settings.json, or starts from an empty object when the file is absent. */
async function readSettingsOrEmpty(settingsPath: string): Promise<Record<string, unknown>> {
  if (!(await fileExists(settingsPath))) return {};
  return JSON.parse(await readFile(settingsPath, "utf-8")) as Record<string, unknown>;
}

/** Narrows an unknown settings field to a record, treating any other shape as absent. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** Narrows an unknown settings field to an array, treating any other shape as absent. */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

/** Returns the path to compiled agents dir in a project. */
export function agentsPath(dir: string): string {
  return path.join(dir, CLAUDE_DIR, "agents");
}

/** Returns the path to installed skills dir in a project. */
export function skillsPath(dir: string): string {
  return path.join(dir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
}

/** Returns the path to config.ts in a project or global scope dir. */
export function configTsPath(dir: string): string {
  return path.join(dir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
}

/** Returns the path to config-types.ts in a project or global scope dir. */
export function configTypesTsPath(dir: string): string {
  return path.join(dir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TYPES_TS);
}

/**
 * Load a scope's config.ts structurally, throwing when it is absent or fails
 * to parse. There is no meaningful default config, so a missing one is always
 * a test bug — never silently substitute an empty config.
 */
export async function loadConfigOrFail(dir: string): Promise<ProjectConfig> {
  const loaded = await loadProjectConfigFromDir(dir);
  if (!loaded) {
    throw new Error(`config.ts must exist and be loadable at ${dir}`);
  }
  return loaded.config;
}

/** Load a scope's config.ts and return every agent entry named `agentName`. */
export async function readAgentEntriesFor(
  dir: string,
  agentName: AgentName,
): Promise<AgentScopeConfig[]> {
  const config = await loadConfigOrFail(dir);
  return config.agents.filter((agent) => agent.name === agentName);
}

/**
 * Drive the init wizard end to end with every skill source switched to local
 * (the `l` hotkey on the Sources step).
 *
 * Flow: Stack -> Domain -> Build (all domains) -> Sources -> Agents -> Confirm.
 * Without `setAllLocal()` the wizard defaults to plugin mode, so tests that
 * assert on `.claude/skills/` contents must go through this helper.
 */
export async function completeWithLocalSources(wizard: InitWizard): Promise<WizardResult> {
  const domain = await wizard.stack.selectFirstStack();
  const build = await domain.acceptDefaults();
  const sources = await build.passThroughAllDomains();
  await sources.waitForReady();
  await sources.setAllLocal();
  const agents = await sources.advance();
  const confirm = await agents.acceptDefaults("init");
  return confirm.confirm();
}

/**
 * Add forkedFrom metadata to the default `web-framework-react` skill
 * created by `ProjectBuilder.editable()`.
 *
 * This marks the skill as CLI-managed so `uninstall` will remove it
 * instead of skipping it as user-created.
 */
export async function addForkedFromMetadata(projectDir: string): Promise<void> {
  const metadataPath = path.join(
    projectDir,
    CLAUDE_DIR,
    STANDARD_DIRS.SKILLS,
    "web-framework-react",
    STANDARD_FILES.METADATA_YAML,
  );
  await writeFile(metadataPath, FORKED_FROM_METADATA);
}

/**
 * Injects a marketplace field into an existing config.ts.
 * Used by lifecycle tests that need to switch from local to plugin source.
 */
export async function injectMarketplaceIntoConfig(
  baseDir: string,
  marketplaceName: string,
): Promise<void> {
  const configPath = path.join(baseDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
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
    `\n  "marketplace": "${marketplaceName}",` +
    content.slice(insertAt);

  await writeFile(configPath, patched, "utf-8");
}

/** Returns the path to the ejected agent.liquid template in a project. */
export function getEjectedTemplatePath(projectDir: string): string {
  return path.join(projectDir, CLAUDE_SRC_DIR, "agents", "_templates", "agent.liquid");
}

export { createE2ESource, E2E_AGENT_TITLES, E2E_SKILL_TITLES } from "./create-e2e-source.js";
export type { E2ESource } from "./create-e2e-source.js";

export {
  isClaudeCLIAvailable,
  claudePluginMarketplaceAdd,
  claudePluginMarketplaceList,
  claudePluginInstall,
  claudePluginUninstall,
  execCommand,
} from "../../src/cli/utils/exec.js";
