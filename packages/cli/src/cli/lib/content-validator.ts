import os from "os";
import path from "path";
import { getErrorMessage } from "../utils/errors.js";
import { PLUGIN_MANIFEST_DIR, STANDARD_FILES } from "../consts.js";
import { directoryExists, fileExists, listDirectories } from "../utils/fs.js";
import { listAgentMdFiles } from "./agents/index.js";
import { readSkillMetadata } from "./loading/index.js";
import {
  configDirsInPlay,
  findConfigLoadFailures,
  getProjectConfigPath,
  isLocalSource,
  resolvePrimarySourceEntry,
  type ConfigLoadError,
  type SourceEntry,
} from "./configuration/index.js";
import { isHomeDirectory, resolveInstallPaths } from "./installation/index.js";
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
import { isSourceRepo, validateSource } from "./source-validator.js";
import type { ValidationResult } from "../types/index.js";

/** How a source repository under the cwd is labelled when it is not a registered source. */
const CWD_SOURCE_NAME = "current directory";

export type ContentIssue = {
  severity: "error" | "warning";
  /** The file or directory a reader has to open to fix the issue. */
  file: string;
  message: string;
};

/**
 * One content pass: what it walked, what it found, and what it deliberately did
 * not check. `notes` carries neither errors nor warnings — it is the record of
 * which sources were reached and which were skipped.
 */
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

/** Render an absolute path with a `~/` prefix when it's under the user's home directory. */
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

/** Says which of the three load outcomes a config file is in, without restating the loader. */
const CONFIG_UNREADABLE = "exists but could not be loaded";

/**
 * Validates the config files this run reads: the project's own and the global one it inlines.
 *
 * A config that exists and cannot be parsed is reported here rather than left to the operational
 * layer, for the reason that layer exists to be gated on — every operational row is read OUT of
 * this file, so each would be a cascade of the same fault. It is also the only report that can
 * carry the loader's reason: the layers below re-read the file per check, and their own
 * diagnostics for it are what used to arrive spliced between the rows.
 *
 * An ABSENT config is not a finding here. It is the legitimate state `init` exists for, and the
 * operational layer already names it and offers the remedy that fits it.
 */
export async function validateProjectConfigFile(projectDir: string): Promise<ContentValidation> {
  const [present, failures] = await Promise.all([
    countExistingConfigs(projectDir),
    findConfigLoadFailures(projectDir),
  ]);

  return { count: present, issues: failures.map(toUnreadableConfigIssue), notes: [] };
}

function toUnreadableConfigIssue(failure: ConfigLoadError): ContentIssue {
  return {
    severity: "error",
    file: displayDir(failure.configPath),
    message: `${CONFIG_UNREADABLE}: ${failure.reason}`,
  };
}

async function countExistingConfigs(projectDir: string): Promise<number> {
  const present = await Promise.all(
    configDirsInPlay(projectDir).map((dir) => fileExists(getProjectConfigPath(dir))),
  );
  return present.filter(Boolean).length;
}

/**
 * Validates the marketplace this installation reads from when it is local, plus the current
 * directory when that is itself a skills source repository — that repository is the content a
 * marketplace author runs this against, and it is not the source they read skills from (D-210).
 * A remote marketplace is recorded as skipped rather than fetched.
 */
export async function validateRegisteredSources(projectDir: string): Promise<ContentValidation> {
  const primary = await resolvePrimarySourceEntry(projectDir);
  const registered = [primary];
  const remote = registered.filter((source) => !isLocalSource(source.url));
  const local = await localSourcesToValidate(projectDir, registered);

  const outcomes = await Promise.all(local.map(validateOneSource));

  return {
    count: local.length,
    issues: outcomes.flatMap((outcome) => outcome.issues),
    notes: [
      ...outcomes.map((outcome) => outcome.note),
      ...remote.map((source) => `${source.name} (${source.url}) — skipped (remote source)`),
    ],
  };
}

async function localSourcesToValidate(
  projectDir: string,
  registered: SourceEntry[],
): Promise<SourceEntry[]> {
  const local = registered.filter((source) => isLocalSource(source.url));
  const alreadyCovered = local.some(
    (source) => path.resolve(projectDir, source.url) === projectDir,
  );

  if (alreadyCovered || !(await isSourceRepo(projectDir))) return local;

  return [...local, { name: CWD_SOURCE_NAME, url: projectDir }];
}

type SourceOutcome = { note: string; issues: ContentIssue[] };

async function validateOneSource(source: SourceEntry): Promise<SourceOutcome> {
  const label = `${source.name} (${source.url})`;
  try {
    const result = await validateSource(source.url);
    return { note: `${label} — ${result.skillCount} skills`, issues: result.issues };
  } catch (error) {
    return {
      note: `${label} — failed`,
      issues: [{ severity: "error", file: source.url, message: getErrorMessage(error) }],
    };
  }
}

/** Validates every installed plugin bundle in the global and project plugin directories. */
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

/**
 * Validates the installs recorded in the plugins directory's `installed_plugins.json`
 * (claude CLI >=2.1.220 cache layout). Returns undefined when the registry records no
 * installs so the caller can fall back to the direct-children scan (older/manual layouts).
 */
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

  // A recorded installPath that no longer exists surfaces as an invalid plugin
  // via validatePlugin's structure check, not a crash.
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

/** Validates the SKILL.md and metadata.yaml of every installed skill, both scopes. */
export async function validateInstalledSkills(projectDir: string): Promise<ContentValidation> {
  return mergeValidations(
    await Promise.all(installedDirs(projectDir, "skillsDir").map(validateSkillsDirectory)),
  );
}

/** Validates the frontmatter of every compiled agent file, both scopes. */
export async function validateInstalledAgents(projectDir: string): Promise<ContentValidation> {
  return mergeValidations(
    await Promise.all(installedDirs(projectDir, "agentsDir").map(validateAgentsDirectory)),
  );
}

/**
 * The directories to walk for an installed-content pass. At the home directory both
 * scopes resolve to the same place, so it is walked once instead of twice.
 */
function installedDirs(projectDir: string, key: "skillsDir" | "agentsDir"): string[] {
  const global = resolveInstallPaths(projectDir, "global")[key];
  if (isHomeDirectory(projectDir)) return [global];
  return [global, resolveInstallPaths(projectDir, "project")[key]];
}

/** What an installed-content pass walked, named rather than validated. */
export type InstalledArtifacts = {
  /** Every installed skill directory, both scopes, as display paths. */
  skills: string[];
  /** Every compiled agent file, both scopes, as display paths. */
  agents: string[];
};

/**
 * The same two walks {@link validateInstalledSkills} and {@link validateInstalledAgents} count,
 * listing what they found instead of judging it. `doctor` reports this when no configuration
 * exists to compare the installation against: there is nothing to validate the files AGAINST,
 * and naming them is the whole finding.
 */
export async function listInstalledArtifacts(projectDir: string): Promise<InstalledArtifacts> {
  const [skills, agents] = await Promise.all([
    listAcrossScopes(installedDirs(projectDir, "skillsDir"), listDirectories),
    listAcrossScopes(installedDirs(projectDir, "agentsDir"), listAgentMdFiles),
  ]);
  return { skills, agents };
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

async function validateSkillsDirectory(skillsDir: string): Promise<ContentValidation> {
  if (!(await directoryExists(skillsDir))) return NOTHING_VALIDATED;

  const skillDirs = await listDirectories(skillsDir);
  if (skillDirs.length === 0) return NOTHING_VALIDATED;

  const results = await Promise.all(
    skillDirs.map(async (name) => {
      const skillDir = path.join(skillsDir, name);
      return toIssues(displayDir(skillDir), await validateInstalledSkill(skillDir));
    }),
  );

  return { count: skillDirs.length, issues: results.flat(), notes: [] };
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
  const skillMdPath = path.join(skillDir, STANDARD_FILES.SKILL_MD);
  const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!(await fileExists(skillMdPath))) {
    errors.push(`Missing ${STANDARD_FILES.SKILL_MD}`);
  } else {
    const frontmatterResult = await validateSkillFrontmatter(skillMdPath);
    errors.push(...frontmatterResult.errors);
    warnings.push(...frontmatterResult.warnings);
  }

  if (!(await fileExists(metadataPath))) {
    errors.push(`Missing ${STANDARD_FILES.METADATA_YAML}`);
  } else {
    const metadataResult = await validateInstalledSkillMetadata(metadataPath);
    errors.push(...metadataResult.errors);
    warnings.push(...metadataResult.warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function validateInstalledSkillMetadata(metadataPath: string): Promise<ValidationResult> {
  // Same judgment `compile` refuses on and local-skill discovery skips on: a file
  // that describes no skill is reported here as the error it is. The strict
  // published-skill checks below are layered on top of that verdict, never against
  // it — doctor reports what the other two passes refuse, and then some.
  const read = await readSkillMetadata(metadataPath);
  if (!read.usable) {
    return {
      valid: false,
      errors: [`${STANDARD_FILES.METADATA_YAML}: ${read.reason}`],
      warnings: [],
    };
  }

  const metadata = read.metadata;
  const result = validateSkillMetadata(metadata);
  if (result.success) {
    return { valid: true, errors: [], warnings: [] };
  }

  // Over-length cliDescription is advisory — only hard schema violations invalidate the skill
  const { errors, warnings } = splitMetadataValidationIssues(result.error, metadata);
  return {
    valid: errors.length === 0,
    errors: errors.map((e) => `${STANDARD_FILES.METADATA_YAML}: ${e}`),
    warnings: warnings.map((w) => `${STANDARD_FILES.METADATA_YAML}: ${w}`),
  };
}
