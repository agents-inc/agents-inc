import os from "os";
import path from "path";
import { partition } from "remeda";
import { getErrorMessage } from "../utils/errors.js";
import { PLUGIN_MANIFEST_DIR, STANDARD_FILES } from "../consts.js";
import { directoryExists, fileExists, listDirectories } from "../utils/fs.js";
import { listAgentMdFiles, splitAgentsByProvenance } from "./agents/index.js";
import { readSkillMetadata } from "./loading/index.js";
import {
  configDirsInPlay,
  findConfigLoadFailures,
  isLocalSource,
  loadInstalledConfig,
  resolvePrimarySourceEntry,
  type ConfigLoadError,
  type LoadedProjectConfig,
  type SourceEntry,
} from "./configuration/index.js";
import { isHomeDirectory, resolveInstallPaths } from "./installation/index.js";
import { getInstalledConfigPath } from "./installation/install-base-dir.js";
import {
  getInstalledPluginsRegistryPath,
  getProjectPluginsDir,
  getUserPluginsDir,
  listRegisteredPluginInstalls,
  validateAgentFrontmatter,
  validateAllPlugins,
  validatePlugin,
  validateSkillFrontmatter,
  type ResolvedPlugin,
} from "./plugins/index.js";
import { splitMetadataValidationIssues, validateSkillMetadata } from "./schemas.js";
import { readForkedFromMetadata } from "./skills/index.js";
import { isSourceRepo, validateSource, type MarketplaceReader } from "./source-validator.js";
import { invalidResult, mergeValidationResults, validResult } from "./validation-result.js";
import { scopeLabel } from "../utils/messages.js";
import { plural } from "../utils/string.js";
import type { ValidationResult } from "../types/index.js";

/** How a source repository under the cwd is labelled when it is not a registered source. */
const CWD_SOURCE_NAME = "current directory";

/** What a compiled agent is called on disk; `splitAgentsByProvenance` answers in bare names. */
const AGENT_FILE_EXTENSION = ".md";

export type ContentIssue = {
  severity: "error" | "warning";
  /** The file or directory a reader has to open to fix the issue. */
  file: string;
  message: string;
};

/** `notes` records which sources were reached and which skipped; neither errors nor warnings. */
export type ContentValidation = {
  count: number;
  issues: ContentIssue[];
  notes: string[];
};

const NOTHING_VALIDATED: ContentValidation = { count: 0, issues: [], notes: [] };

function mergeValidations(parts: ContentValidation[]): ContentValidation {
  return parts.reduce(
    (acc, part) => ({
      count: acc.count + part.count,
      issues: [...acc.issues, ...part.issues],
      notes: [...acc.notes, ...part.notes],
    }),
    NOTHING_VALIDATED,
  );
}

function displayDir(absolutePath: string): string {
  const home = os.homedir();
  if (absolutePath === home) return "~";
  if (absolutePath.startsWith(home + path.sep)) {
    return `~${path.sep}${path.relative(home, absolutePath)}`;
  }
  return absolutePath;
}

function toIssues(file: string, result: ValidationResult): ContentIssue[] {
  return [
    ...result.errors.map((message) => ({ severity: "error" as const, file, message })),
    ...result.warnings.map((message) => ({ severity: "warning" as const, file, message })),
  ];
}

const CONFIG_UNREADABLE = "exists but could not be loaded";

/** Reported here, since every operational row reads the config; an absent one is no finding. */
export async function validateProjectConfigFile(projectDir: string): Promise<ContentValidation> {
  const [present, failures] = await Promise.all([
    countExistingConfigs(projectDir),
    findConfigLoadFailures(projectDir),
  ]);

  return { count: present, issues: failures.map(toUnreadableConfigIssue), notes: [] };
}

/** Led by whose config it is: from a project, its own or the inherited global one. */
function toUnreadableConfigIssue(failure: ConfigLoadError): ContentIssue {
  return {
    severity: "error",
    file: `${scopeLabel(failure.scope)}'s ${displayDir(failure.configPath)}`,
    message: `${CONFIG_UNREADABLE}: ${failure.reason}`,
  };
}

async function countExistingConfigs(projectDir: string): Promise<number> {
  const present = await Promise.all(
    configDirsInPlay(projectDir).map((dir) => fileExists(getInstalledConfigPath(dir))),
  );
  return present.filter(Boolean).length;
}

/** The local marketplace, plus the cwd when it is a skills source repo; remote is skipped. */
export async function validateRegisteredSources(projectDir: string): Promise<ContentValidation> {
  // Degrades on an unreadable config: `safeCheck` turns a throw into a failed row.
  const primary = await resolvePrimarySourceEntry(projectDir);
  const registered = [primary];
  const remote = registered.filter((source) => !isLocalSource(source.url));
  const local = await localSourcesToValidate(projectDir, registered);

  const outcomes = await Promise.all(
    local.map((source) => validateOneSource(source, readerFor(projectDir, source))),
  );

  return {
    count: local.length,
    issues: outcomes.flatMap((outcome) => outcome.issues),
    notes: [
      ...outcomes.map((outcome) => outcome.note),
      ...remote.map((source) => `${source.name} (${source.url}) — skipped (remote)`),
    ],
  };
}

async function localSourcesToValidate(
  projectDir: string,
  registered: SourceEntry[],
): Promise<SourceEntry[]> {
  const local = registered.filter((source) => isLocalSource(source.url));
  const alreadyCovered = local.some((source) => isCwdMarketplace(projectDir, source));

  if (alreadyCovered || !(await isSourceRepo(projectDir))) return local;

  return [...local, { name: CWD_SOURCE_NAME, url: projectDir }];
}

/** Whether this marketplace IS the directory the command ran in, however the config spells it. */
function isCwdMarketplace(projectDir: string, source: SourceEntry): boolean {
  return path.resolve(projectDir, source.url) === projectDir;
}

/** The one place knowing the cwd and each marketplace path; the cwd entry answers `"author"`. */
function readerFor(projectDir: string, source: SourceEntry): MarketplaceReader {
  return isCwdMarketplace(projectDir, source) ? "author" : "consumer";
}

type SourceOutcome = { note: string; issues: ContentIssue[] };

async function validateOneSource(
  source: SourceEntry,
  reader: MarketplaceReader,
): Promise<SourceOutcome> {
  const label = `${source.name} (${source.url})`;
  try {
    const result = await validateSource(source.url, reader);
    return { note: `${label} — ${plural(result.skillCount, "skill")}`, issues: result.issues };
  } catch (error) {
    return {
      note: `${label} — failed`,
      issues: [{ severity: "error", file: source.url, message: getErrorMessage(error) }],
    };
  }
}

export async function validateInstalledPlugins(projectDir: string): Promise<ContentValidation> {
  const dirs = [
    getUserPluginsDir(),
    ...(isHomeDirectory(projectDir) ? [] : [getProjectPluginsDir(projectDir)]),
  ];
  return mergeValidations(await Promise.all(dirs.map(validatePluginsDirectory)));
}

async function validatePluginsDirectory(pluginsDir: string): Promise<ContentValidation> {
  if (!(await directoryExists(pluginsDir))) return NOTHING_VALIDATED;

  if (await fileExists(getInstalledPluginsRegistryPath(pluginsDir))) {
    const registryValidation = await validateRegistryPlugins(pluginsDir);
    if (registryValidation !== undefined) return registryValidation;
  }

  const pluginDirs = await findPluginDirectories(pluginsDir);
  if (pluginDirs.length === 0) return NOTHING_VALIDATED;

  const { results } = await validateAllPlugins(pluginsDir);

  return {
    count: results.length,
    issues: results.flatMap(({ name, result }) => toIssues(name, result)),
    notes: [],
  };
}

/** Undefined when the registry records no installs; the caller then scans direct children. */
async function validateRegistryPlugins(pluginsDir: string): Promise<ContentValidation | undefined> {
  let installs: ResolvedPlugin[];
  try {
    installs = await listRegisteredPluginInstalls(pluginsDir);
  } catch (error) {
    return {
      count: 0,
      issues: [
        {
          severity: "error",
          file: displayDir(getInstalledPluginsRegistryPath(pluginsDir)),
          message: getErrorMessage(error),
        },
      ],
      notes: [],
    };
  }

  if (installs.length === 0) return undefined;

  // A vanished installPath fails validatePlugin's structure check rather than crashing.
  const results = await Promise.all(
    installs.map(async ({ pluginKey, installPath }) =>
      toIssues(pluginKey, await validatePlugin(installPath)),
    ),
  );

  return { count: installs.length, issues: results.flat(), notes: [] };
}

async function findPluginDirectories(pluginsDir: string): Promise<string[]> {
  const entries = await listDirectories(pluginsDir);
  const checks = await Promise.all(
    entries.map(async (name) => ({
      name,
      isPlugin: await directoryExists(path.join(pluginsDir, name, PLUGIN_MANIFEST_DIR)),
    })),
  );
  return checks.filter((check) => check.isPlugin).map((check) => check.name);
}

/**
 * Only skills this installation owns, since `~/.claude/skills/` is shared: a directory is ours when
 * a config in play names its id or it carries `forkedFrom`. Any other is named, not judged.
 */
export async function validateInstalledSkills(projectDir: string): Promise<ContentValidation> {
  const configuredIds = await configuredSkillIds(projectDir);
  return mergeValidations(
    await Promise.all(
      installedDirs(projectDir, "skillsDir").map((dir) =>
        validateSkillsDirectory(dir, configuredIds),
      ),
    ),
  );
}

/** Every skill id the configs this run reads name, across both scopes and both install modes. */
async function configuredSkillIds(projectDir: string): Promise<ReadonlySet<string>> {
  const loaded = await Promise.all(
    configDirsInPlay(projectDir).map((dir) => loadInstalledConfig(dir)),
  );
  return new Set(loaded.flatMap(configuredIdsOf));
}

function configuredIdsOf(loaded: LoadedProjectConfig | null): string[] {
  if (!loaded) return [];
  return loaded.config.skills.map((skill) => skill.id);
}

export async function validateInstalledAgents(projectDir: string): Promise<ContentValidation> {
  return mergeValidations(
    await Promise.all(installedDirs(projectDir, "agentsDir").map(validateAgentsDirectory)),
  );
}

/** At the home directory both scopes resolve to one place, walked once. */
function installedDirs(projectDir: string, key: "skillsDir" | "agentsDir"): string[] {
  const global = resolveInstallPaths(projectDir, "global")[key];
  if (isHomeDirectory(projectDir)) return [global];
  return [global, resolveInstallPaths(projectDir, "project")[key]];
}

/** What an installed-content pass walked, named rather than validated. */
export type InstalledArtifacts = {
  /** Every skill directory this CLI can prove it wrote, both scopes, as display paths. */
  skills: string[];
  /** Every compiled agent file this CLI can prove it wrote, both scopes, as display paths. */
  agents: string[];
};

/** For `doctor` with no config: names what this installation owns, as `uninstall` would take. */
export async function listInstalledArtifacts(projectDir: string): Promise<InstalledArtifacts> {
  const [skills, agents] = await Promise.all([
    listAcrossScopes(installedDirs(projectDir, "skillsDir"), listSkillDirsWithOurProvenance),
    listAcrossScopes(installedDirs(projectDir, "agentsDir"), listAgentFilesWithOurProvenance),
  ]);
  return { skills, agents };
}

/**
 * Asks `splitAgentsByProvenance`, as `uninstall` does, so this lists exactly what it would remove.
 */
async function listAgentFilesWithOurProvenance(agentsDir: string): Promise<string[]> {
  const { marked } = await splitAgentsByProvenance(agentsDir);
  return marked.map((name) => `${name}${AGENT_FILE_EXTENSION}`);
}

/** By `forkedFrom` alone, as `uninstall` reads it; unreadable metadata carries none. */
async function listSkillDirsWithOurProvenance(skillsDir: string): Promise<string[]> {
  const names = await listDirectories(skillsDir);
  const judged = await Promise.all(
    names.map(async (name) => ({ name, ours: await carriesOurProvenance(skillsDir, name) })),
  );
  return judged.filter((entry) => entry.ours).map((entry) => entry.name);
}

async function listAcrossScopes(
  dirs: string[],
  listEntries: (dir: string) => Promise<string[]>,
): Promise<string[]> {
  const perDir = await Promise.all(dirs.map((dir) => listDisplayPaths(dir, listEntries)));
  return perDir.flat();
}

/** One directory's entries as display paths, or nothing when the directory is absent. */
async function listDisplayPaths(
  dir: string,
  listEntries: (dir: string) => Promise<string[]>,
): Promise<string[]> {
  if (!(await directoryExists(dir))) return [];
  const entries = await listEntries(dir);
  return entries.map((entry) => displayDir(path.join(dir, entry)));
}

async function validateSkillsDirectory(
  skillsDir: string,
  configuredIds: ReadonlySet<string>,
): Promise<ContentValidation> {
  if (!(await directoryExists(skillsDir))) return NOTHING_VALIDATED;

  const skillDirs = await listDirectories(skillsDir);
  if (skillDirs.length === 0) return NOTHING_VALIDATED;

  const judged = await Promise.all(
    skillDirs.map(async (name) => ({
      name,
      ours: await isOurSkillDirectory(skillsDir, name, configuredIds),
    })),
  );
  const [ours, foreign] = partition(judged, (entry) => entry.ours);

  const results = await Promise.all(
    ours.map(async ({ name }) => {
      const skillDir = path.join(skillsDir, name);
      return toIssues(displayDir(skillDir), await validateInstalledSkill(skillDir));
    }),
  );

  return {
    count: ours.length,
    issues: results.flat(),
    notes: foreign.map(({ name }) => foreignSkillNote(skillsDir, name)),
  };
}

/** Either claim this installation has on a skill directory. */
async function isOurSkillDirectory(
  skillsDir: string,
  name: string,
  configuredIds: ReadonlySet<string>,
): Promise<boolean> {
  if (configuredIds.has(name)) return true;
  return carriesOurProvenance(skillsDir, name);
}

/** The `forkedFrom` block the copier stamps; `uninstall` asks exactly this. */
async function carriesOurProvenance(skillsDir: string, name: string): Promise<boolean> {
  return (await readForkedFromMetadata(path.join(skillsDir, name))) !== null;
}

/** Named so the count and the listing do not silently disagree; not a warning. */
function foreignSkillNote(skillsDir: string, name: string): string {
  return `${displayDir(path.join(skillsDir, name))} — not installed by this CLI and named by no configuration here: not validated`;
}

async function validateAgentsDirectory(agentsDir: string): Promise<ContentValidation> {
  if (!(await directoryExists(agentsDir))) return NOTHING_VALIDATED;

  const agentFiles = await listAgentMdFiles(agentsDir);
  if (agentFiles.length === 0) return NOTHING_VALIDATED;

  const results = await Promise.all(
    agentFiles.map(async (fileName) => {
      const agentPath = path.join(agentsDir, fileName);
      return toIssues(displayDir(agentPath), await validateAgentFrontmatter(agentPath));
    }),
  );

  return { count: agentFiles.length, issues: results.flat(), notes: [] };
}

async function validateInstalledSkill(skillDir: string): Promise<ValidationResult> {
  const skillMd = await validateSkillFile(
    skillDir,
    STANDARD_FILES.SKILL_MD,
    validateSkillFrontmatter,
  );
  const metadata = await validateSkillFile(
    skillDir,
    STANDARD_FILES.METADATA_YAML,
    validateInstalledSkillMetadata,
  );

  return mergeValidationResults([skillMd, metadata]);
}

/** One of an installed skill's files judged by `validate`, or the error of its absence. */
async function validateSkillFile(
  skillDir: string,
  fileName: string,
  validate: (filePath: string) => Promise<ValidationResult>,
): Promise<ValidationResult> {
  const filePath = path.join(skillDir, fileName);
  if (!(await fileExists(filePath))) return invalidResult(`Missing ${fileName}`);
  return validate(filePath);
}

async function validateInstalledSkillMetadata(metadataPath: string): Promise<ValidationResult> {
  // The same verdict compile and discovery use; the strict published-skill checks layer on top.
  const read = await readSkillMetadata(metadataPath);
  if (!read.usable) {
    return invalidResult(`${STANDARD_FILES.METADATA_YAML}: ${read.reason}`);
  }

  const metadata = read.metadata;
  const result = validateSkillMetadata(metadata);
  if (result.success) {
    return validResult();
  }

  // Over-length cliDescription is advisory — only hard schema violations invalidate the skill
  const { errors, warnings } = splitMetadataValidationIssues(result.error, metadata);
  return {
    valid: errors.length === 0,
    errors: errors.map((e) => `${STANDARD_FILES.METADATA_YAML}: ${e}`),
    warnings: warnings.map((w) => `${STANDARD_FILES.METADATA_YAML}: ${w}`),
  };
}
