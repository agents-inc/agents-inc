import React from "react";
import { partition } from "remeda";
import path from "path";

import { Flags } from "@oclif/core";
import { Box, Text, useApp } from "ink";

import { BaseCommand } from "../base-command";
import { Confirm } from "../components/common/confirm";
import { promptConfirm } from "../components/common/prompt-confirm.js";
import { getErrorMessage } from "../utils/errors";
import {
  directoryExists,
  fileExists,
  listDirectories,
  remove,
  removeDirIfEmpty,
} from "../utils/fs";
import { listAgentMdFiles } from "../lib/agents";
import { claudePluginUninstallBestEffort, isClaudeCLIAvailable } from "../utils/exec";
import {
  listPluginNames,
  getProjectPluginsDir,
  buildMarketplacePluginRef,
  parseMarketplacePluginRef,
  toClaudePluginScope,
} from "../lib/plugins/index";
import { readForkedFromMetadata } from "../lib/skills/index";
import { isHomeDirectory, resolveInstallPaths } from "../lib/installation/index";
import { lazyGateDeps, mutateGlobal, propagateGlobalRemoval } from "../lib/config-gate/index.js";
import { loadSkillsMatrixFromSource } from "../lib/loading";
import { loadAgentDefs } from "../lib/operations";
import { ConfigLoadError, loadProjectConfigFromDir } from "../lib/configuration/project-config";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  CLI_COLORS,
  DEFAULT_BRANDING,
  EJECT_SOURCE,
  STANDARD_FILES,
} from "../consts";
import { EXIT_CODES } from "../lib/exit-codes";
import {
  SUCCESS_MESSAGES,
  INFO_MESSAGES,
  UNINSTALL_PLAN,
  compiledAgentsKept,
  compiledAgentsRemoval,
  localSkillsRemoval,
  registeredProjectsUpdated,
  registeredProjectUpdateSkipped,
  registeredProjectsUpdateFailed,
} from "../utils/messages";
import type { AgentDefinition, AgentName, MergedSkillsMatrix, ProjectConfig } from "../types/index";

/** A grouped section of the uninstall removal plan (header label + item lines). */
type RemovalPlanSection = {
  label: string;
  items: string[];
};

/**
 * One removal this run promises AND makes. Each entry carries what its remover needs
 * — paths and names, never display strings — so the preview and the removal are two
 * readings of one value rather than two derivations of the same target.
 */
type RemovalEntry =
  | { kind: "plugins"; pluginsDir: string; names: string[] }
  | { kind: "skills"; skillsDir: string }
  | { kind: "agents"; agentsDir: string; agentNames: AgentName[] }
  | { kind: "config"; claudeSrcDir: string; fileNames: string[] };

/** The single entry of a kind, for the remover that consumes it. */
type PluginRemoval = Extract<RemovalEntry, { kind: "plugins" }>;
type SkillsRemoval = Extract<RemovalEntry, { kind: "skills" }>;
type AgentsRemoval = Extract<RemovalEntry, { kind: "agents" }>;
type ConfigManifestRemoval = Extract<RemovalEntry, { kind: "config" }>;

/**
 * The uninstall removal plan: what this run removes, and what it deliberately leaves
 * behind. Built once per run — the confirm UI renders it, the executor consumes the
 * same value, so the plan cannot name a removal the run declines to make.
 */
type RemovalPlan = {
  entries: RemovalEntry[];
  /** Statements naming content that stays, and why — see {@link keptStatements}. */
  kept: string[];
};

/**
 * Pure builder for the uninstall removal plan — the one place that decides what this
 * run removes. Every removal downstream is driven by an entry from here, and nothing
 * downstream re-reads the target to decide whether to act.
 */
function buildRemovalPlan(target: UninstallTarget): RemovalPlan {
  const agents = compiledAgentsEntry(target);

  return {
    entries: [
      ...pluginsEntry(target),
      ...localSkillsEntry(target),
      ...agents,
      ...configManifestEntry(target),
    ],
    kept: keptStatements(target, agents),
  };
}

/** The plan carries at least one removal — the only thing that makes this run an uninstall. */
function hasAnythingToRemove(plan: RemovalPlan): boolean {
  return plan.entries.length > 0;
}

function pluginsEntry(target: UninstallTarget): PluginRemoval[] {
  if (!target.hasPlugins) return [];
  return [{ kind: "plugins", pluginsDir: target.pluginsDir, names: [...target.cliPluginNames] }];
}

function localSkillsEntry(target: UninstallTarget): SkillsRemoval[] {
  if (!target.hasLocalSkills) return [];
  return [{ kind: "skills", skillsDir: target.skillsDir }];
}

/**
 * Removal matches on-disk agent basenames against the configured agent names, so with
 * no configuration to name them there is nothing it could match and the plan carries no
 * entry — one decision, made here, rather than a predicate mirrored into the renderer.
 */
function compiledAgentsEntry(target: UninstallTarget): AgentsRemoval[] {
  if (!target.hasLocalAgents) return [];
  if (target.configuredAgents.length === 0) return [];
  return [{ kind: "agents", agentsDir: target.agentsDir, agentNames: target.configuredAgents }];
}

/** The CLI config manifest (config.ts + config-types.ts) is always removed. */
function configManifestEntry(target: UninstallTarget): ConfigManifestRemoval[] {
  const fileNames = [
    ...(target.hasClaudeSrcConfig ? [STANDARD_FILES.CONFIG_TS] : []),
    ...(target.hasClaudeSrcConfigTypes ? [STANDARD_FILES.CONFIG_TYPES_TS] : []),
  ];
  if (fileNames.length === 0) return [];
  return [{ kind: "config", claudeSrcDir: target.claudeSrcDir, fileNames }];
}

/**
 * The plan's kept half. Compiled agents are the one thing a run cannot promise without
 * the configuration, so when they are on disk and the plan carries no removal for them,
 * it says they stay — and why — in place of the removal it would otherwise name.
 */
function keptStatements(target: UninstallTarget, agentRemovals: AgentsRemoval[]): string[] {
  if (!target.hasLocalAgents) return [];
  if (agentRemovals.length > 0) return [];
  return [compiledAgentsKept(target.agentsDir)];
}

/** The plan's entry of a kind, for the remover that consumes it. At most one exists. */
function planEntry<K extends RemovalEntry["kind"]>(
  plan: RemovalPlan,
  kind: K,
): Extract<RemovalEntry, { kind: K }> | undefined {
  return plan.entries.find(
    (entry): entry is Extract<RemovalEntry, { kind: K }> => entry.kind === kind,
  );
}

/** The heading an entry prints under, and the lines it contributes beneath it. */
function describeEntry(entry: RemovalEntry): RemovalPlanSection {
  switch (entry.kind) {
    case "plugins":
      return { label: UNINSTALL_PLAN.PLUGINS_HEADING, items: entry.names };
    case "skills":
      return {
        label: UNINSTALL_PLAN.CLI_MANAGED_FILES_HEADING,
        items: [localSkillsRemoval(entry.skillsDir)],
      };
    case "agents":
      return {
        label: UNINSTALL_PLAN.CLI_MANAGED_FILES_HEADING,
        items: [compiledAgentsRemoval(entry.agentsDir)],
      };
    case "config":
      return {
        label: UNINSTALL_PLAN.CONFIG_HEADING,
        items: entry.fileNames.map((fileName) => `${entry.claudeSrcDir}/${fileName}`),
      };
    default: {
      const _exhaustive: never = entry;
      return _exhaustive;
    }
  }
}

const PLAN_SECTION_ORDER = [
  UNINSTALL_PLAN.PLUGINS_HEADING,
  UNINSTALL_PLAN.CLI_MANAGED_FILES_HEADING,
  UNINSTALL_PLAN.CONFIG_HEADING,
] as const;

/**
 * The plan's display half: entries grouped under their heading, in printing order —
 * skills and compiled agents share one. A heading is a promise about the lines beneath
 * it, so a heading no entry contributed to is not printed at all. The single source of
 * the strings shared by printRemovalPlan (plain text) and the UninstallConfirm Ink
 * component; each renderer only adds its own indentation and styling.
 */
function planSections(entries: readonly RemovalEntry[]): RemovalPlanSection[] {
  const described = entries.map(describeEntry);

  return PLAN_SECTION_ORDER.flatMap((label) =>
    sectionWithItems(label, itemsUnder(described, label)),
  );
}

/** Every line the described entries contributed under one heading, in plan order. */
function itemsUnder(described: readonly RemovalPlanSection[], label: string): string[] {
  return described.filter((section) => section.label === label).flatMap((section) => section.items);
}

function sectionWithItems(label: string, items: string[]): RemovalPlanSection[] {
  if (items.length === 0) return [];
  return [{ label, items }];
}

type UninstallConfirmProps = {
  plan: RemovalPlan;
  onConfirm: () => void;
  onCancel: () => void;
};

const UninstallConfirm: React.FC<UninstallConfirmProps> = ({ plan, onConfirm, onCancel }) => {
  const { exit } = useApp();

  return (
    <Box flexDirection="column">
      <Text bold>{UNINSTALL_PLAN.PREVIEW_HEADING}</Text>
      <Text> </Text>

      {planSections(plan.entries).map((section) => (
        <Box key={section.label} flexDirection="column">
          <Text color={CLI_COLORS.ERROR}> {section.label}</Text>
          {section.items.map((item) => (
            <Text key={item} dimColor>
              {" "}
              {item}
            </Text>
          ))}
        </Box>
      ))}

      {plan.kept.map((statement) => (
        <Box key={statement} flexDirection="column">
          <Text> </Text>
          <Text dimColor>{statement}</Text>
        </Box>
      ))}

      <Text> </Text>
      <Confirm
        message="Are you sure you want to uninstall?"
        onConfirm={() => {
          onConfirm();
          exit();
        }}
        onCancel={() => {
          onCancel();
          exit();
        }}
        defaultValue={false}
      />
    </Box>
  );
};

export default class Uninstall extends BaseCommand {
  static summary = `Remove ${DEFAULT_BRANDING.NAME} from this project`;

  static description = `Uninstall ${DEFAULT_BRANDING.NAME} from this project. Removes CLI-managed skills (matched by source), compiled agents, plugins, and the .claude-src/ config manifest (config.ts + config-types.ts). User-created content is preserved.`;

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --yes",
  ];

  static flags = {
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Uninstall);
    const projectDir = process.cwd();

    this.printHeader();

    const target = await detectUninstallTarget(projectDir, (reason) =>
      this.warn(
        `Could not read the project config — plugins and compiled agents it lists may be left behind: ${reason}`,
      ),
    );
    const plan = buildRemovalPlan(target);
    if (!hasAnythingToRemove(plan)) {
      this.reportNothingToUninstall();
      return;
    }

    const confirmed = flags.yes ? this.printRemovalPlan(plan) : await this.confirmRemoval(plan);
    if (!confirmed) {
      this.log("");
      this.log("Uninstall cancelled");
      this.exit(EXIT_CODES.CANCELLED);
    }

    await this.executeUninstall(plan, target, projectDir);
    this.reportSuccess();
  }

  private printHeader(): void {
    this.log("");
    this.log(`${DEFAULT_BRANDING.NAME} Uninstall`);
    this.log("");
  }

  private reportNothingToUninstall(): void {
    this.warn("Nothing to uninstall.");
    this.log("");
    this.log(INFO_MESSAGES.NOT_INSTALLED);
    this.log("");
    this.log(INFO_MESSAGES.NO_CHANGES_MADE);
  }

  private printRemovalPlan(plan: RemovalPlan): true {
    this.log(UNINSTALL_PLAN.PREVIEW_HEADING);
    this.log("");

    for (const section of planSections(plan.entries)) {
      this.log(`  ${section.label}`);
      for (const item of section.items) {
        this.log(`    ${item}`);
      }
    }

    for (const statement of plan.kept) {
      this.log("");
      this.log(statement);
    }

    this.log("");
    return true;
  }

  private async confirmRemoval(plan: RemovalPlan): Promise<boolean> {
    const outcome = await promptConfirm(({ onConfirm, onCancel }) => (
      <UninstallConfirm plan={plan} onConfirm={onConfirm} onCancel={onCancel} />
    ));
    return outcome === "confirmed";
  }

  private async executeUninstall(
    plan: RemovalPlan,
    target: UninstallTarget,
    projectDir: string,
  ): Promise<void> {
    const isGlobalUninstall = isHomeDirectory(projectDir);
    // Prepared BEFORE any removal: the projects[] registry and the source used
    // to regenerate each project's config-types.ts both live in the global
    // config this uninstall is about to delete.
    const propagation = isGlobalUninstall
      ? await this.prepareGlobalPropagation(target, projectDir)
      : null;

    await this.removePlannedPlugins(planEntry(plan, "plugins"), target.config, projectDir);

    try {
      await this.removeLocalFiles(plan, target);
    } catch (error) {
      this.log("Failed to remove local files");
      this.error(getErrorMessage(error), {
        exit: EXIT_CODES.ERROR,
      });
    }

    if (isGlobalUninstall) {
      // The global manifest is gone — prune the inlined global-scoped entries the
      // registered projects still carry so they stop referencing removed content.
      if (propagation) {
        await this.updateRegisteredProjects(propagation);
      }
      return;
    }

    // Deregister this project from the global config's tracked projects so future
    // global edits stop propagating back into it. Best-effort by nature: a missing,
    // project-less, or corrupt global config (ConfigLoadError) must never fail the
    // uninstall — warn and move on.
    try {
      // Registration bookkeeping only: nothing inlines the `projects[]` list into a
      // project config, so this loads neither the matrix nor the agent definitions
      // and the uninstall stays offline.
      await mutateGlobal({ kind: "deregister-project", projectDir }, lazyGateDeps(projectDir));
    } catch (error) {
      this.warn(`Could not update the global project registry: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Loads what updating registered projects needs (global config with its
   * projects[] registry, skills matrix, agent definitions) BEFORE the global
   * .claude-src manifest is deleted — source resolution reads that config.
   * Returns null when nothing is registered or loading fails; a load failure
   * warns and never aborts the uninstall.
   *
   * `skipExtraSources: true` is NOT a divergence from the wizard's full
   * multi-source load: extra-source loading only annotates each skill's
   * `availableSources`/`activeSource` for wizard UI tagging — it never adds
   * skills or categories to the matrix, and the config-types writer never reads
   * those annotations, so the regenerated project types are byte-identical
   * either way (pinned by the skipExtraSources parity test in
   * local-installer.test.ts). Skipping avoids fetching every registered extra
   * source (network on a cold cache, plus unreachable-remote warnings) during
   * an uninstall that must never hang or noise-fail on remote state.
   */
  private async prepareGlobalPropagation(
    target: UninstallTarget,
    projectDir: string,
  ): Promise<GlobalPropagationData | null> {
    const globalConfig = target.config;
    if (!globalConfig?.projects?.length) return null;

    try {
      const [sourceResult, agentDefs] = await Promise.all([
        loadSkillsMatrixFromSource({
          projectDir,
          skipExtraSources: true,
          matrixOnly: true,
        }),
        loadAgentDefs({ projectDir }),
      ]);
      return { globalConfig, matrix: sourceResult.matrix, agents: agentDefs.agents };
    } catch (error) {
      this.warn(registeredProjectsUpdateFailed(getErrorMessage(error)));
      return null;
    }
  }

  /**
   * Prunes the inlined global-scoped config entries from every registered
   * project and regenerates its config-types.ts. Runs AFTER the global manifest
   * removal so the regenerated project types fall back to the standalone form
   * instead of importing from the deleted global config-types.ts. Best-effort:
   * unreachable projects are warned and skipped, and no failure here may abort
   * the uninstall.
   */
  private async updateRegisteredProjects(propagation: GlobalPropagationData): Promise<void> {
    try {
      const report = await propagateGlobalRemoval(propagation.globalConfig, {
        matrix: propagation.matrix,
        agents: propagation.agents,
      });
      for (const skippedPath of report.propagated.skipped) {
        this.warn(registeredProjectUpdateSkipped(skippedPath));
      }
      if (report.propagated.updated.length === 0) return;

      this.logSuccess(registeredProjectsUpdated(report.propagated.updated.length));

      // The pruned projects' compiled agents were built from the global rows this
      // uninstall just removed, so the prune owes them a recompile too.
      this.reportPropagatedRecompile(report);
    } catch (error) {
      this.warn(registeredProjectsUpdateFailed(getErrorMessage(error)));
    }
  }

  private reportSuccess(): void {
    this.log("");
    this.log(`${DEFAULT_BRANDING.NAME} has been uninstalled.`);
    this.log("");
    this.logSuccess(SUCCESS_MESSAGES.UNINSTALL_COMPLETE);
    this.log("");
  }

  /**
   * Each step acts only when the plan carries its entry, so what the user was shown and
   * what this run removes are the same list read twice.
   */
  private async removeLocalFiles(plan: RemovalPlan, target: UninstallTarget): Promise<void> {
    await this.removePlannedSkills(planEntry(plan, "skills"));
    await this.removePlannedAgents(planEntry(plan, "agents"));

    const cleanup = await cleanupEmptyDirs(target, planEntry(plan, "config"));

    if (cleanup.claudeSrcDirRemoved) {
      this.logSuccess(`Removed ${CLAUDE_SRC_DIR}/`);
    } else if (cleanup.claudeSrcManifestRemoved) {
      this.logSuccess(`Removed CLI config from ${CLAUDE_SRC_DIR}/`);
    }

    if (cleanup.claudeDirRemoved) {
      this.logSuccess(`Removed ${CLAUDE_DIR}/`);
    } else if (cleanup.claudeDirKept) {
      this.log(`Kept ${CLAUDE_DIR}/ (contains user content)`);
    }
  }

  private async removePlannedPlugins(
    entry: PluginRemoval | undefined,
    config: ProjectConfig | null,
    projectDir: string,
  ): Promise<void> {
    if (!entry) return;

    this.log("Uninstalling plugins...");

    try {
      const pluginResult = await uninstallPlugins(entry, config, projectDir, (name) =>
        this.log(`  Uninstalled plugin '${name}'`),
      );

      this.logSuccess(
        `Uninstalled ${pluginResult.totalUninstalled} ${pluginResult.totalUninstalled === 1 ? "plugin" : "plugins"}`,
      );
    } catch (error) {
      this.log("Plugin uninstall failed");
      this.error(getErrorMessage(error), {
        exit: EXIT_CODES.ERROR,
      });
    }
  }

  private async removePlannedSkills(entry: SkillsRemoval | undefined): Promise<void> {
    if (!entry) return;

    const result = await removeMatchingSkills(
      entry,
      (dirName) => this.log(`  Uninstalled skill '${dirName}'`),
      (dirName) => this.warn(`Skipping '${dirName}': not created by ${DEFAULT_BRANDING.NAME} CLI`),
    );
    if (result.removedCount === 0) return;

    this.logSuccess(
      `Removed ${result.removedCount} CLI-installed ${result.removedCount === 1 ? "skill" : "skills"}`,
    );
  }

  private async removePlannedAgents(entry: AgentsRemoval | undefined): Promise<void> {
    if (!entry) return;

    const result = await removeMatchingAgents(entry, (agentName) =>
      this.log(`  Uninstalled agent '${agentName}'`),
    );
    if (result.removedCount === 0) return;

    this.logSuccess(
      `Removed ${result.removedCount} compiled ${result.removedCount === 1 ? "agent" : "agents"}`,
    );
  }
}

/** @internal Exported for testing */
export type UninstallTarget = {
  hasPlugins: boolean;
  pluginNames: string[];
  /** Plugin names filtered to only those installed by this CLI (matched against config skills) */
  cliPluginNames: string[];
  hasLocalSkills: boolean;
  hasLocalAgents: boolean;
  hasClaudeDir: boolean;
  /** Whether .claude-src/config.ts exists (the CLI config manifest). */
  hasClaudeSrcConfig: boolean;
  /** Whether .claude-src/config-types.ts exists (companion to config.ts). */
  hasClaudeSrcConfigTypes: boolean;
  pluginsDir: string;
  skillsDir: string;
  agentsDir: string;
  claudeDir: string;
  claudeSrcDir: string;
  /** Resolved project source config from .claude-src/config.ts */
  config: ProjectConfig | null;
  /** Agent names from the generated config (e.g., ["web-developer"]) */
  configuredAgents: AgentName[];
};

/**
 * Everything a global uninstall needs to update the registered projects after
 * the global manifest is removed — captured before removal because it is
 * sourced from the config being deleted.
 */
type GlobalPropagationData = {
  globalConfig: ProjectConfig;
  matrix: MergedSkillsMatrix;
  agents: Partial<Record<AgentName, AgentDefinition>>;
};

type SkillRemovalResult = {
  removedCount: number;
  skippedCount: number;
  removedNames: string[];
  skippedNames: string[];
  /** Whether the skills directory was cleaned up (empty after removal) */
  dirCleaned: boolean;
};

type AgentRemovalResult = {
  removedCount: number;
  removedNames: string[];
  /** Whether the agents directory was cleaned up (empty after removal) */
  dirCleaned: boolean;
};

type UninstallPluginsResult = {
  uninstalledNames: string[];
  totalUninstalled: number;
};

type CleanupResult = {
  claudeDirRemoved: boolean;
  /** Whether config.ts/config-types.ts were removed from .claude-src/ */
  claudeSrcManifestRemoved: boolean;
  /** Whether the emptied .claude-src/ directory itself was removed */
  claudeSrcDirRemoved: boolean;
  /** Whether .claude/ still exists with user content after cleanup */
  claudeDirKept: boolean;
};

function collectConfiguredAgents(config: Partial<ProjectConfig> | null): AgentName[] {
  if (!config?.agents) return [];
  return config.agents.map((a) => a.name);
}

/** @internal Exported for testing */
export function getCliInstalledPluginKeys(config: Partial<ProjectConfig> | null): Set<string> {
  if (!config?.skills) return new Set();
  const { marketplace } = config;
  return new Set(
    config.skills.flatMap((skill) => [
      // Primary key: skill.id@skill.source
      buildMarketplacePluginRef(skill.id, skill.source),
      // Marketplace variant for plugins installed via marketplace where
      // skill.source may differ (e.g., "eject" vs the marketplace name)
      ...(marketplace && skill.source !== marketplace && skill.source !== EJECT_SOURCE
        ? [buildMarketplacePluginRef(skill.id, marketplace)]
        : []),
    ]),
  );
}

/**
 * Loads the config that drives the removal plan. A config file that exists but
 * cannot be parsed (`ConfigLoadError`) is reported through `onLoadFailed` and
 * then treated exactly like a missing one — an unreadable config is precisely
 * when a user needs to uninstall, so it must never fail the run. Same posture as
 * the `deregisterProjectPath` call site. Only the plan degrades: the plugins and
 * compiled agents the config named can no longer be identified, while file
 * removal proceeds. Any other failure is a real fault and still propagates.
 */
async function loadUninstallConfig(
  projectDir: string,
  onLoadFailed: (reason: string) => void,
): Promise<ProjectConfig | null> {
  try {
    const result = await loadProjectConfigFromDir(projectDir);
    return result?.config ?? null;
  } catch (error) {
    if (!(error instanceof ConfigLoadError)) throw error;
    onLoadFailed(getErrorMessage(error));
    return null;
  }
}

/**
 * Detects what's installed in a project directory for uninstallation.
 *
 * Checks for plugins, local skills, agents, config directories, and
 * resolves which plugins were installed by this CLI.
 */
async function detectUninstallTarget(
  projectDir: string,
  onConfigLoadFailed: (reason: string) => void,
): Promise<UninstallTarget> {
  const pluginsDir = getProjectPluginsDir(projectDir);
  const { skillsDir, agentsDir } = resolveInstallPaths(projectDir);
  const claudeDir = path.join(projectDir, CLAUDE_DIR);
  const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);

  const claudeSrcConfigPath = path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TS);
  const claudeSrcConfigTypesPath = path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TYPES_TS);

  const [
    hasLocalSkills,
    hasLocalAgents,
    hasClaudeDir,
    hasClaudeSrcConfig,
    hasClaudeSrcConfigTypes,
    config,
  ] = await Promise.all([
    directoryExists(skillsDir),
    directoryExists(agentsDir),
    directoryExists(claudeDir),
    fileExists(claudeSrcConfigPath),
    fileExists(claudeSrcConfigTypesPath),
    loadUninstallConfig(projectDir, onConfigLoadFailed),
  ]);

  let pluginNames: string[] = [];
  try {
    pluginNames = await listPluginNames(projectDir);
  } catch {
    // Best-effort: plugin detection may fail
  }

  const activeConfig = config
    ? {
        ...config,
        skills: config.skills.filter((s) => !s.excluded),
        agents: config.agents.filter((a) => !a.excluded),
      }
    : null;
  const configuredAgents = collectConfiguredAgents(activeConfig);
  const cliInstalledKeys = getCliInstalledPluginKeys(activeConfig);
  const cliPluginNames = pluginNames.filter((name) => cliInstalledKeys.has(name));

  return {
    hasPlugins: cliPluginNames.length > 0,
    pluginNames,
    cliPluginNames,
    hasLocalSkills,
    hasLocalAgents,
    hasClaudeDir,
    hasClaudeSrcConfig,
    hasClaudeSrcConfigTypes,
    pluginsDir,
    skillsDir,
    agentsDir,
    claudeDir,
    claudeSrcDir,
    config,
    configuredAgents,
  };
}

function shouldRemoveSkill(forkedFrom: { source?: string } | null): boolean {
  return forkedFrom !== null;
}

async function removeMatchingSkills(
  entry: SkillsRemoval,
  onRemoved?: (dirName: string) => void,
  onSkipped?: (dirName: string) => void,
): Promise<SkillRemovalResult> {
  const classified = await classifySkillDirs(entry.skillsDir);
  const removedNames = await removeClassifiedSkills(
    classified.toRemove,
    entry.skillsDir,
    onRemoved,
  );
  classified.toSkip.forEach((name) => onSkipped?.(name));
  const dirCleaned = await cleanupSkillsDir(entry.skillsDir, classified.toSkip.length === 0);

  return {
    removedCount: removedNames.length,
    skippedCount: classified.toSkip.length,
    removedNames,
    skippedNames: classified.toSkip,
    dirCleaned,
  };
}

async function classifySkillDirs(
  skillsDir: string,
): Promise<{ toRemove: string[]; toSkip: string[] }> {
  const dirNames = await listDirectories(skillsDir);
  const entries = await Promise.all(
    dirNames.map(async (name) => ({
      name,
      forkedFrom: await readForkedFromMetadata(path.join(skillsDir, name)),
    })),
  );
  const [removable, skippable] = partition(entries, (entry) => shouldRemoveSkill(entry.forkedFrom));
  return { toRemove: removable.map((e) => e.name), toSkip: skippable.map((e) => e.name) };
}

async function removeClassifiedSkills(
  names: string[],
  skillsDir: string,
  onRemoved?: (name: string) => void,
): Promise<string[]> {
  for (const name of names) {
    await remove(path.join(skillsDir, name));
    onRemoved?.(name);
  }
  return names;
}

async function cleanupSkillsDir(dir: string, allRemoved: boolean): Promise<boolean> {
  if (!allRemoved) return false;
  return removeDirIfEmpty(dir);
}

/**
 * Removes the compiled agent .md files the plan's agents entry names.
 *
 * A file is removed only when its basename matches one of the entry's agent names
 * (taken from config.agents); agents absent from config are preserved. Cleans up the
 * agents directory if empty after removal. Whether to act at all is the plan's
 * decision, not this function's — no entry, no call.
 *
 * @param onRemoved - Called for each removed agent name (for logging)
 */
async function removeMatchingAgents(
  entry: AgentsRemoval,
  onRemoved?: (agentName: string) => void,
): Promise<AgentRemovalResult> {
  const agentFiles = await listAgentFiles(entry.agentsDir);
  const removedNames = agentFiles
    .map((agentFile) => agentFile.replace(/\.md$/, ""))
    // Array<AgentName>.includes rejects a plain string; widen the configured
    // list to readonly string[] so the on-disk basename can be tested for
    // membership in config.agents.
    .filter((agentName) => (entry.agentNames as readonly string[]).includes(agentName));

  for (const agentName of removedNames) {
    await remove(path.join(entry.agentsDir, `${agentName}.md`));
    onRemoved?.(agentName);
  }

  const dirCleaned = await removeDirIfEmpty(entry.agentsDir);

  return {
    removedCount: removedNames.length,
    removedNames,
    dirCleaned,
  };
}

/**
 * Uninstalls the plugins the plan's plugins entry names, by removing them from the
 * Claude CLI and deleting their local directories. The entry decides WHICH plugins go;
 * `config` only answers HOW to ask the Claude CLI — the scope its registry filed each
 * one under, per-skill where the config says, project-level otherwise.
 *
 * @param onUninstalled - Called for each successfully uninstalled plugin name (for logging)
 * @internal Exported for testing
 */
export async function uninstallPlugins(
  entry: PluginRemoval,
  config: ProjectConfig | null,
  projectDir: string,
  onUninstalled?: (pluginName: string) => void,
): Promise<UninstallPluginsResult> {
  const cliAvailable = await isClaudeCLIAvailable();

  for (const pluginName of entry.names) {
    if (cliAvailable) {
      // Derive primary scope from per-skill config; shared helper tries both scopes
      // to handle re-scoped plugins where the registry entry may be under the
      // original scope rather than the currently-configured one.
      const skillId = parseMarketplacePluginRef(pluginName);
      const skillConfig = config?.skills.find((s) => s.id === skillId);
      const primaryScope = toClaudePluginScope(skillConfig?.scope);
      await claudePluginUninstallBestEffort(pluginName, primaryScope, projectDir);
    }

    const pluginPath = path.join(entry.pluginsDir, pluginName);
    await remove(pluginPath);
    onUninstalled?.(pluginName);
  }

  // Every iteration either completes or throws (aborting the whole uninstall),
  // so reaching this return means every plugin the plan named was removed.
  return {
    uninstalledNames: entry.names,
    totalUninstalled: entry.names.length,
  };
}

/**
 * Removes exactly the manifest files the plan's config entry names from .claude-src/,
 * then the .claude-src/ directory itself when it has nothing else left. User-owned
 * content in .claude-src/ (e.g. ejected templates) keeps the directory alive. No entry
 * means the plan promised no manifest removal, so none is made.
 */
async function removeConfigManifest(
  entry: ConfigManifestRemoval | undefined,
): Promise<{ manifestRemoved: boolean; dirRemoved: boolean }> {
  if (!entry) return { manifestRemoved: false, dirRemoved: false };

  await Promise.all(
    entry.fileNames.map((fileName) => remove(path.join(entry.claudeSrcDir, fileName))),
  );

  return { manifestRemoved: true, dirRemoved: await removeDirIfEmpty(entry.claudeSrcDir) };
}

/**
 * Removes the CLI config manifest the plan named, then cleans up the emptied .claude/
 * and .claude-src/ directories.
 *
 * The directories themselves are not plan entries — they are the user's, and are removed
 * only when nothing of theirs is left in them once the CLI-managed contents are gone.
 */
async function cleanupEmptyDirs(
  target: Pick<UninstallTarget, "hasClaudeDir" | "claudeDir">,
  manifestEntry: ConfigManifestRemoval | undefined,
): Promise<CleanupResult> {
  const manifest = await removeConfigManifest(manifestEntry);

  const claudeDirRemoved = target.hasClaudeDir && (await removeDirIfEmpty(target.claudeDir));
  // Nothing else removes .claude itself, so "kept" is exactly "present but not removed".
  const claudeDirKept =
    !claudeDirRemoved && target.hasClaudeDir && (await directoryExists(target.claudeDir));

  return {
    claudeDirRemoved,
    claudeSrcManifestRemoved: manifest.manifestRemoved,
    claudeSrcDirRemoved: manifest.dirRemoved,
    claudeDirKept,
  };
}

async function listAgentFiles(agentsDir: string): Promise<string[]> {
  try {
    return await listAgentMdFiles(agentsDir);
  } catch {
    return [];
  }
}
