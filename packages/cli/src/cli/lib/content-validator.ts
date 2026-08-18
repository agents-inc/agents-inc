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
  getProjectConfigPath,
  isLocalSource,
  loadProjectConfigFromDir,
  resolvePrimarySourceEntry,
  type ConfigLoadError,
  type LoadedProjectConfig,
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
import { readForkedFromMetadata } from "./skills/index.js";
import { isSourceRepo, validateSource, type MarketplaceReader } from "./source-validator.js";
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
 *
 * Each one is validated as the reader's own or as someone else's — see {@link readerFor}.
 */
export async function validateRegisteredSources(projectDir: string): Promise<ContentValidation> {
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

/**
 * Where this layer decides what the reader's relationship to a marketplace is — the one place
 * that holds both the directory the command ran in and the path of each marketplace it validates.
 * The appended `CWD_SOURCE_NAME` entry answers `"author"` by construction, which is the whole of
 * why a marketplace author's own repository is judged the way they need it to be.
 */
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

/**
 * Validates the SKILL.md and metadata.yaml of every installed skill this installation owns, both
 * scopes.
 *
 * Ownership has to be asked because `~/.claude/skills/` is CLAUDE CODE's directory, shared with
 * everything else that installs a skill there — not this CLI's private space. Judging every
 * directory in it against this CLI's schema reported a skill some other tool put there as a fault
 * in the user's install, in a file they never wrote and cannot fix from here.
 *
 * Two claims make a directory this installation's, and either is enough:
 *
 * - **The configuration in play names its id.** Both configs a run reads, because both scopes are
 *   walked. This is the claim that keeps `doctor` loud where it matters most: the provenance
 *   marker lives INSIDE metadata.yaml, so a skill whose metadata is missing or unparseable — the
 *   plainest breakage there is — can carry no marker to be recognised by.
 * - **The directory carries `forkedFrom`.** The marker this CLI stamps into every skill directory
 *   it writes, and the same question `uninstall` asks before removing anything. It answers for the
 *   skills a configuration has stopped naming, or never got the chance to.
 *
 * A directory neither claim reaches is not judged and not counted. It IS named — see
 * {@link foreignSkillNote}: a check that quietly walks past a directory is indistinguishable from
 * one that missed it.
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
  const loaded = await Promise.all(configDirsInPlay(projectDir).map(loadProjectConfigFromDir));
  return new Set(loaded.flatMap(configuredIdsOf));
}

function configuredIdsOf(loaded: LoadedProjectConfig | null): string[] {
  if (!loaded) return [];
  return loaded.config.skills.map((skill) => skill.id);
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
  /** Every skill directory this CLI can prove it wrote, both scopes, as display paths. */
  skills: string[];
  /** Every compiled agent file this CLI can prove it wrote, both scopes, as display paths. */
  agents: string[];
};

/**
 * The same two walks {@link validateInstalledSkills} and {@link validateInstalledAgents} count,
 * naming what belongs to this installation instead of judging it. `doctor` reports this when no
 * configuration exists to compare the installation against: there is nothing to validate the
 * files AGAINST, and naming them is the whole finding.
 *
 * Each walk applies the same ownership question its own pass asks, minus the half that needs a
 * config to answer — see {@link listSkillDirsWithOurProvenance} and
 * {@link listAgentFilesWithOurProvenance}. Both are the question the command this row sends the
 * reader to asks before it removes anything, so what is named here is what `uninstall` takes.
 */
export async function listInstalledArtifacts(projectDir: string): Promise<InstalledArtifacts> {
  const [skills, agents] = await Promise.all([
    listAcrossScopes(installedDirs(projectDir, "skillsDir"), listSkillDirsWithOurProvenance),
    listAcrossScopes(installedDirs(projectDir, "agentsDir"), listAgentFilesWithOurProvenance),
  ]);
  return { skills, agents };
}

/**
 * The compiled agent files in one tree that this CLI can prove it wrote.
 *
 * The agent axis's counterpart to {@link listSkillDirsWithOurProvenance}, and deliberately
 * `splitAgentsByProvenance` rather than a second reading of the same marker: `uninstall` decides
 * what to remove with no configuration by asking that function, so a listing built any other way
 * could offer a file it then refused. It did — every `*.md` in the directory was named here while
 * the remover took only the marked ones, so a hand-authored agent was offered by one screen and
 * declined by the next.
 *
 * A file that cannot be read carries no marker and is not listed, which is that function's own
 * rule: "cannot prove it is ours" and "is not ours" call for the same answer. Nothing goes
 * unmentioned either way — {@link validateInstalledAgents} walks every agent file whatever state
 * the config is in.
 */
async function listAgentFilesWithOurProvenance(agentsDir: string): Promise<string[]> {
  const { marked } = await splitAgentsByProvenance(agentsDir);
  return marked.map((name) => `${name}${AGENT_FILE_EXTENSION}`);
}

/**
 * The skill directories in one tree that this CLI can prove it wrote.
 *
 * With no configuration left to name an id, the provenance marker is the only claim a directory
 * can carry — and it is the claim `uninstall` reads before removing anything, so every directory
 * listed here is one that command would actually remove. Listing a directory it would refuse is
 * the CLI recommending what it then declines to do.
 *
 * The marker lives INSIDE `metadata.yaml`, so a directory whose metadata is missing or unreadable
 * can carry no marker and is not listed. That is deliberate rather than a gap: "cannot prove it is
 * ours" and "is not ours" call for the same answer — leave it alone — which is the rule
 * `splitAgentsByProvenance` already applies to compiled agents. Nothing goes unmentioned either
 * way: {@link validateInstalledSkills} runs whatever state the config is in, and names every
 * directory it stepped over.
 */
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

/** Either claim this installation has on a skill directory — see {@link validateInstalledSkills}. */
async function isOurSkillDirectory(
  skillsDir: string,
  name: string,
  configuredIds: ReadonlySet<string>,
): Promise<boolean> {
  if (configuredIds.has(name)) return true;
  return carriesOurProvenance(skillsDir, name);
}

/**
 * The claim a skill directory carries on its own, independent of any configuration: the
 * `forkedFrom` block the copier stamps into every directory this CLI writes. One definition,
 * because the union above and the no-config listing are the same judgement with and without its
 * other half — and `uninstall` decides what to remove by asking exactly this.
 */
async function carriesOurProvenance(skillsDir: string, name: string): Promise<boolean> {
  return (await readForkedFromMetadata(path.join(skillsDir, name))) !== null;
}

/**
 * A directory this pass declined to judge, named so the count and the directory listing do not
 * silently disagree. Not a warning: nothing here is wrong, and a reader sent to fix a skill they
 * did not install is worse off than one told plainly that it is not this CLI's to police.
 */
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
