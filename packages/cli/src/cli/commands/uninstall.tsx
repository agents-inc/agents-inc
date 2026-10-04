import React from "react";
import { partition } from "remeda";
import path from "path";

import { Flags } from "@oclif/core";

import { BaseCommand } from "../base-command";
import {
  RemovalPlanConfirm,
  type RemovalPlanSection,
} from "../components/common/removal-plan-confirm.js";
import { promptConfirm } from "../components/common/prompt-confirm.js";
import { getErrorMessage } from "../utils/errors";
import {
  directoryExists,
  fileExists,
  listDirectories,
  remove,
  removeDirIfEmpty,
} from "../utils/fs";
import { listAgentFilesOf, splitAgentsByProvenance } from "../lib/agents";
import { hostAt } from "../lib/hosts/host-for.js";
import type { PluginHost, PluginRemovalOutcome } from "../lib/hosts/plugin-host.js";
import {
  listPluginNames,
  getProjectPluginsDir,
  buildMarketplacePluginRef,
  parseMarketplacePluginRef,
} from "../lib/plugins/index";
import { readForkedFromMetadata } from "../lib/skills/index";
import { isHomeDirectory, resolveInstallPaths } from "../lib/installation/index";
import { lazyGateDeps, mutateGlobal, propagateGlobalRemoval } from "../lib/config-gate/index.js";
import { loadSkillsMatrixFromSource } from "../lib/loading";
import { loadAgentDefs } from "../lib/operations";
import { ConfigLoadError, loadProjectConfigAt } from "../lib/configuration/project-config";
import type { Provider } from "../consts";
import { CLAUDE_DIR, DEFAULT_BRANDING, EJECT_SOURCE, STANDARD_FILES } from "../consts";
import {
  providerInUse,
  agentCodec,
  type AgentCodec,
  sourceFolderInUse,
  sourceRootOf,
  type SourceRoot,
} from "../lib/installation/install-layout.js";
import {
  providerFlag,
  providerNamedBy,
  refuseAnAmbiguousInstallation,
} from "../lib/installation/provider-flag.js";
import { EXIT_CODES } from "../lib/exit-codes";
import {
  SUCCESS_MESSAGES,
  INFO_MESSAGES,
  UNINSTALL_PLAN,
  compiledAgentsRemoval,
  localSkillsRemoval,
  notInstalledHere,
  unmarkedAgentsKept,
  registeredProjectsUpdated,
  registeredProjectUpdateSkipped,
  registeredProjectsUpdateFailed,
  uninstallConfigUnreadable,
  uninstallNeedsTerminal,
} from "../utils/messages";
import type { AgentDefinition, AgentName, MergedSkillsMatrix, ProjectConfig } from "../types/index";
import type { SkillScope } from "../types/config";

/**
 * One removal this run promises AND makes. Each entry carries what its remover needs
 * — paths and names, never display strings — so the preview and the removal are two
 * readings of one value rather than two derivations of the same target.
 */
type RemovalEntry =
  | { kind: "plugins"; pluginsDir: string; names: string[] }
  | { kind: "skills"; skillsDir: string }
  | { kind: "agents"; agentsDir: string; agentNames: string[]; codec: AgentCodec }
  | { kind: "config"; sourceDir: string; fileNames: string[] };

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
      ...configManifestEntries(target),
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

function compiledAgentsEntry(target: UninstallTarget): AgentsRemoval[] {
  if (!target.hasLocalAgents) return [];

  const agentNames = identifiableAgents(target);
  if (agentNames.length === 0) return [];

  return [{ kind: "agents", agentsDir: target.agentsDir, agentNames, codec: target.agentCodec }];
}

/**
 * The agent files this run can say are its own, and on whose authority.
 *
 * The configuration is the first: it names the agents this install compiled, and a marker-less
 * file it names is still this CLI's — every install predating the marker is in exactly that
 * state. The provenance marker the compiler stamps into every agent is the second, reached
 * when there is no configuration left to read: provably ours, whoever lost the config. With
 * neither, nothing here is identifiable and the plan carries no removal for it.
 */
function identifiableAgents(target: UninstallTarget): string[] {
  if (target.configuredAgents.length > 0) return target.configuredAgents;
  return target.markedAgents;
}

/** The CLI config manifest (config.ts + config-types.ts) is always removed from the source folder. */
function configManifestEntries(target: UninstallTarget): ConfigManifestRemoval[] {
  const { dir, manifestFiles } = target.sourceFolder;
  if (manifestFiles.length === 0) return [];
  return [{ kind: "config", sourceDir: dir, fileNames: manifestFiles }];
}

/**
 * The plan's kept half: the agent files carrying no provenance marker that the removal above
 * does not claim anyway. Derived FROM the removal rather than from a second reading of the
 * target, so the two halves of the plan cannot contradict each other — an agent named in both
 * lists would be a promise to remove a file the same plan calls kept.
 */
function keptStatements(target: UninstallTarget, agentRemovals: AgentsRemoval[]): string[] {
  const removing = new Set(agentRemovals.flatMap((entry) => entry.agentNames));
  const kept = target.unmarkedAgents.filter((name) => !removing.has(name));
  if (kept.length === 0) return [];
  return [unmarkedAgentsKept(target.agentsDir, kept.length)];
}

/** Every entry of a kind — the config kind has one per source folder. */
function planEntries<K extends RemovalEntry["kind"]>(
  plan: RemovalPlan,
  kind: K,
): Extract<RemovalEntry, { kind: K }>[] {
  return plan.entries.filter(
    (entry): entry is Extract<RemovalEntry, { kind: K }> => entry.kind === kind,
  );
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
        items: entry.fileNames.map((fileName) => `${entry.sourceDir}/${fileName}`),
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

const UNINSTALL_CONFIRM_MESSAGE = "Are you sure you want to uninstall?";

export default class Uninstall extends BaseCommand {
  /**
   * The name this run prints itself under, resolved once in {@link run} because three separate
   * lines carry it: the heading, the sign-off, and the warning naming the tool a preserved
   * directory was not created by. The last of those sits three calls below the resolution, and
   * threading a display string through `executeUninstall` -> `removeLocalFiles` ->
   * `removePlannedSkills` would widen three signatures to deliver one word.
   *
   * A plain `string` holding the shipped default rather than an optional every reader would have
   * to answer for. `run` replaces it before the first line is printed, so what a user sees is
   * always what their configuration says.
   */
  private brandingName: string = DEFAULT_BRANDING.NAME;

  static summary = `Remove ${DEFAULT_BRANDING.NAME} from this project`;

  static description = `Uninstall ${DEFAULT_BRANDING.NAME} from this project. Removes CLI-managed skills (matched by marketplace), compiled agents, plugins, and the config manifest (config.ts + config-types.ts) this project keeps. User-created content is preserved.`;

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
    provider: providerFlag(),
  };

  /**
   * Starts at any terminal size. The size gate exists for the wizard's layout, and this command
   * draws none — a plan and a one-line confirm fit any terminal — while it is the way out of every
   * state, so a window too small to hold a wizard must not hold up an uninstall.
   */
  protected async ensureTerminalSize(): Promise<void> {
    // Nothing to wait for — see above.
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Uninstall);
    const projectDir = process.cwd();

    // Before the branding read and before anything is detected: this run is destructive, and a
    // scope holding two installations has two answers to "which one". Removing the roster's first
    // is removing a user's other installation with nothing on screen to say so.
    await refuseAnAmbiguousInstallation(
      projectDir,
      "uninstall",
      providerNamedBy(flags.provider),
      (message) => this.error(message, { exit: EXIT_CODES.INVALID_ARGS }),
    );

    this.brandingName = await this.resolveBrandingName(projectDir);

    this.printHeader();

    const target = await detectUninstallTarget(projectDir, (failure) =>
      this.warn(uninstallConfigUnreadable(failure)),
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
    this.log(`${this.brandingName} Uninstall`);
    this.log("");
  }

  private reportNothingToUninstall(): void {
    this.warn("Nothing to uninstall.");
    this.log("");
    this.log(notInstalledHere(this.brandingName));
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
    // A confirm nobody can answer must never become a yes, and mounting it here died on Ink's
    // raw-mode error — so a run with no terminal is refused before it, naming `--yes`.
    if (!process.stdin.isTTY) {
      this.error(uninstallNeedsTerminal(), { exit: EXIT_CODES.ERROR });
    }

    const outcome = await promptConfirm(({ onConfirm, onCancel }) => (
      <RemovalPlanConfirm
        heading={UNINSTALL_PLAN.PREVIEW_HEADING}
        sections={planSections(plan.entries)}
        statements={plan.kept}
        message={UNINSTALL_CONFIRM_MESSAGE}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
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
   * the config manifest is deleted — source resolution reads that config.
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
   *
   * `purpose: "upkeep"` because the prune only rewrites projects that are already installed: a
   * marketplace that has since lost its manifest must not leave every registered project naming
   * the global content this uninstall deletes.
   */
  private async prepareGlobalPropagation(
    target: UninstallTarget,
    projectDir: string,
  ): Promise<GlobalPropagationData | null> {
    if (target.config === null || target.registeredProjects.length === 0) return null;
    const globalConfig = target.config;

    try {
      const [sourceResult, agentDefs] = await Promise.all([
        loadSkillsMatrixFromSource({
          projectDir,
          purpose: "upkeep",
          skipExtraSources: true,
          matrixOnly: true,
        }),
        loadAgentDefs(),
      ]);
      return {
        globalConfig,
        matrix: sourceResult.matrix,
        agents: agentDefs.agents,
        provider: providerInUse(projectDir),
      };
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
      const report = await propagateGlobalRemoval(
        propagation.globalConfig,
        { matrix: propagation.matrix, agents: propagation.agents },
        propagation.provider,
      );
      const { updated, unreadable, failed } = report.propagated;
      this.reportProjectsOutOfReach(report.propagated);
      // Uninstall's own sentence, only where it is true: the config is there and was not pruned.
      for (const skippedPath of [...unreadable, ...failed]) {
        this.warn(registeredProjectUpdateSkipped(skippedPath));
      }
      if (updated.length === 0) return;

      this.logSuccess(registeredProjectsUpdated(updated.length));

      // The pruned projects' compiled agents were built from the global rows this
      // uninstall just removed, so the prune owes them a recompile too.
      this.reportPropagatedRecompile(report);
    } catch (error) {
      this.warn(registeredProjectsUpdateFailed(getErrorMessage(error)));
    }
  }

  private reportSuccess(): void {
    this.log("");
    this.log(`${this.brandingName} has been uninstalled.`);
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

    // The same statements the preview showed, from the same plan: what the user approved and
    // what this run reports are one value read twice, never two derivations that agree today.
    for (const statement of plan.kept) {
      this.log(statement);
    }

    const cleanup = await cleanupEmptyDirs(target, planEntries(plan, "config"));

    this.reportSourceFolderCleanup(cleanup.sourceFolder);

    this.reportSourceRootCleanup(target.sourceRoot, cleanup);

    if (cleanup.claudeDirRemoved) {
      this.logSuccess(`Removed ${CLAUDE_DIR}/`);
    } else if (cleanup.claudeDirKept) {
      this.log(`Kept ${CLAUDE_DIR}/ (contains user content)`);
    }
  }

  /** What became of one source folder: gone, emptied of the CLI's files, or kept for the user's. */
  private reportSourceFolderCleanup(folder: SourceFolderCleanup): void {
    if (folder.dirRemoved) {
      this.logSuccess(`Removed ${folder.relName}/`);
    } else if (folder.manifestRemoved) {
      this.logSuccess(`Removed CLI config from ${folder.relName}/`);
    } else if (folder.kept) {
      this.log(`Kept ${folder.relName}/ (contains user content)`);
    }
  }

  /** What became of the `.agents-inc/` parent, said out loud in both directions. */
  private reportSourceRootCleanup(sourceRoot: SourceRoot, cleanup: CleanupResult): void {
    if (cleanup.sourceRootRemoved) {
      this.logSuccess(`Removed ${sourceRoot.relName}/`);
      return;
    }
    if (cleanup.sourceRootKept) {
      this.log(`Kept ${sourceRoot.relName}/ (contains user content)`);
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

      // Silent on zero rather than "Uninstalled 0 plugins": the line's job is to account for
      // removals, and a run that observed none has nothing to account for — the plan preview has
      // already said what it expected to find. Saying "0" beside a plan that named one reads as a
      // failure, which it is not: a plugin a user removed themselves is the ordinary case.
      if (pluginResult.totalUninstalled > 0) {
        this.logSuccess(
          `Uninstalled ${pluginResult.totalUninstalled} ${pluginResult.totalUninstalled === 1 ? "plugin" : "plugins"}`,
        );
      }
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
      (dirName) => this.warn(`Skipping '${dirName}': not created by ${this.brandingName} CLI`),
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
  pluginsDir: string;
  skillsDir: string;
  agentsDir: string;
  /**
   * How this installation's host names and marks a compiled agent — `*.md` on Claude, `*.toml` on
   * Codex. Everything the plan reads or removes in `agentsDir` goes through it (CLI-896).
   */
  agentCodec: AgentCodec;
  claudeDir: string;
  /** This scope's source folder: what this run reads and removes in it. */
  sourceFolder: ScopeSourceFolder;
  /** The `.agents-inc/` parent the source folder sits under. */
  sourceRoot: SourceRoot;
  /** The source folder's config, when it is readable. */
  config: ProjectConfig | null;
  /** Every project the config registers — only a global config registers any. */
  registeredProjects: string[];
  /** Agent names the config names (e.g., ["web-developer"]) */
  configuredAgents: AgentName[];
  /** On-disk agent basenames carrying this CLI's provenance marker. */
  markedAgents: string[];
  /** On-disk agent basenames carrying no marker — the user's, unless the config claims them. */
  unmarkedAgents: string[];
};

/** The source folder of the scope being uninstalled, and what this run reads and removes in it. */
type ScopeSourceFolder = {
  dir: string;
  /** The folder as a user writes it: `.agents-inc/claude`. */
  relName: string;
  /** The manifest files on disk in it — `config.ts`, `config-types.ts` — which this run removes. */
  manifestFiles: string[];
  /** Its config, or `null` when the file is absent or unreadable — see {@link loadUninstallConfig}. */
  config: ProjectConfig | null;
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
  /**
   * Which installation is being removed.
   *
   * Captured here for the same reason everything else on this type is: by the time the prune
   * runs, the folder that says which provider this was has been deleted, so reading it then
   * would answer about whatever is left rather than about what was removed.
   */
  provider: Provider;
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

/** What a cleanup pass did with the source folder. */
type SourceFolderCleanup = {
  relName: string;
  /** Whether config.ts/config-types.ts were removed from it */
  manifestRemoved: boolean;
  /** Whether the emptied folder itself was removed */
  dirRemoved: boolean;
  /** Whether it is still there because something this CLI never wrote lives in it */
  kept: boolean;
};

type CleanupResult = {
  claudeDirRemoved: boolean;
  sourceFolder: SourceFolderCleanup;
  /** Whether the emptied `.agents-inc/` parent went with the last provider folder under it */
  sourceRootRemoved: boolean;
  /** Whether `.agents-inc/` still exists because something this CLI never wrote lives in it */
  sourceRootKept: boolean;
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
  const { marketplaceName } = config;
  return new Set(
    config.skills.flatMap((skill) => [
      // Primary key: skill.id@skill.origin
      buildMarketplacePluginRef(skill.id, skill.origin),
      // Marketplace variant for plugins installed via marketplace where
      // skill.origin may differ (e.g., "eject" vs the marketplace name)
      ...(marketplaceName && skill.origin !== marketplaceName && skill.origin !== EJECT_SOURCE
        ? [buildMarketplacePluginRef(skill.id, marketplaceName)]
        : []),
    ]),
  );
}

/**
 * Loads the config that drives the removal plan. A config file that exists but
 * cannot be parsed (`ConfigLoadError`) is handed to `onLoadFailed` and
 * then treated exactly like a missing one — an unreadable config is precisely
 * when a user needs to uninstall, so it must never fail the run. Same posture as
 * the `deregister-project` mutation's call site above. Only the plan degrades: the plugins and
 * compiled agents the config named can no longer be identified, while file
 * removal proceeds. Any other failure is a real fault and still propagates.
 */
async function loadUninstallConfig(
  configPath: string,
  projectDir: string,
  provider: Provider,
  onLoadFailed: (failure: ConfigLoadError) => void,
): Promise<ProjectConfig | null> {
  try {
    const result = await loadProjectConfigAt(configPath, projectDir, provider);
    return result?.config ?? null;
  } catch (error) {
    if (!(error instanceof ConfigLoadError)) throw error;
    onLoadFailed(error);
    return null;
  }
}

/** The folder's manifest files on disk, and its config read under uninstall's degrade posture. */
async function readSourceFolder(
  folder: Pick<ScopeSourceFolder, "dir" | "relName">,
  projectDir: string,
  provider: Provider,
  onConfigLoadFailed: (failure: ConfigLoadError) => void,
): Promise<ScopeSourceFolder> {
  const [manifestFiles, config] = await Promise.all([
    manifestFilesIn(folder.dir),
    loadUninstallConfig(
      path.join(folder.dir, STANDARD_FILES.CONFIG_TS),
      projectDir,
      provider,
      onConfigLoadFailed,
    ),
  ]);
  return { ...folder, manifestFiles, config };
}

/** The files of the CLI config manifest — `config.ts`, `config-types.ts` — that are in `dir`. */
async function manifestFilesIn(dir: string): Promise<string[]> {
  const manifest = [STANDARD_FILES.CONFIG_TS, STANDARD_FILES.CONFIG_TYPES_TS];
  const present = await Promise.all(
    manifest.map((fileName) => fileExists(path.join(dir, fileName))),
  );
  return manifest.filter((_, index) => present[index]);
}

/** A config with its excluded rows dropped — the entries an uninstall acts on. */
function activeConfigOf(config: ProjectConfig): ProjectConfig {
  return {
    ...config,
    skills: config.skills.filter((s) => !s.excluded),
    agents: config.agents.filter((a) => !a.excluded),
  };
}

/**
 * Detects what's installed in a project directory for uninstallation.
 *
 * Checks for plugins, local skills, agents, config directories, and
 * resolves which plugins were installed by this CLI.
 */
async function detectUninstallTarget(
  projectDir: string,
  onConfigLoadFailed: (failure: ConfigLoadError) => void,
): Promise<UninstallTarget> {
  const pluginsDir = getProjectPluginsDir(projectDir);
  const { skillsDir, agentsDir } = resolveInstallPaths(projectDir);
  const claudeDir = path.join(projectDir, CLAUDE_DIR);
  const provider = providerInUse(projectDir);

  const [hasLocalSkills, hasLocalAgents, hasClaudeDir, sourceFolder, agentProvenance] =
    await Promise.all([
      directoryExists(skillsDir),
      directoryExists(agentsDir),
      directoryExists(claudeDir),
      readSourceFolder(
        sourceFolderInUse(projectDir, provider),
        projectDir,
        provider,
        onConfigLoadFailed,
      ),
      splitAgentsByProvenance(agentsDir, agentCodec(provider)),
    ]);

  const { config } = sourceFolder;

  let pluginNames: string[] = [];
  try {
    pluginNames = await listPluginNames(projectDir);
  } catch {
    // Best-effort: plugin detection may fail
  }

  const activeConfig = config === null ? null : activeConfigOf(config);
  const configuredAgents = collectConfiguredAgents(activeConfig);
  const cliInstalledKeys = getCliInstalledPluginKeys(activeConfig);
  const cliPluginNames = thisRunOwnsAnyPlugin(projectDir)
    ? pluginNames.filter((name) => cliInstalledKeys.has(name))
    : [];

  return {
    hasPlugins: cliPluginNames.length > 0,
    pluginNames,
    cliPluginNames,
    hasLocalSkills,
    hasLocalAgents,
    hasClaudeDir,
    pluginsDir,
    skillsDir,
    agentsDir,
    claudeDir,
    sourceFolder,
    sourceRoot: sourceRootOf(projectDir),
    config,
    registeredProjects: config?.projects ?? [],
    configuredAgents,
    agentCodec: agentCodec(provider),
    markedAgents: agentProvenance.marked,
    unmarkedAgents: agentProvenance.unmarked,
  };
}

/**
 * Whether this run has any plugin of its own to remove.
 *
 * **A PROJECT uninstall on a host that installs no project-scoped plugin has none, and asking
 * anyway is the one operation in this step that can destroy work nobody asked about.** Codex
 * installs plugins for a MACHINE: no subcommand takes a scope, `plugin add` run inside a project
 * writes the switch to the global config and silently un-scopes it, and `plugin list` answers the
 * same set from every directory. So every plugin a Codex project can see belongs to every other
 * project on that machine, and a project uninstall that swept them would take them all away.
 *
 * Read off {@link PluginHost.installsProjectScopedPlugins} rather than written as a provider
 * check, so a host added later is covered by the flag it already has to set. Claude's answer is
 * `true`, so its sweep is unchanged at both scopes — which is deliberate: whether a Claude project
 * uninstall should drop a user-scoped registration is a separate question about a host that CAN
 * hold both, and nothing here is the place to settle it.
 *
 * A GLOBAL uninstall owns the machine's plugins whatever the host, which is the case the other
 * half of this pair rests on.
 */
function thisRunOwnsAnyPlugin(projectDir: string): boolean {
  if (isHomeDirectory(projectDir)) return true;
  return hostAt(projectDir).installsProjectScopedPlugins;
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
 * Removes the compiled agent files the plan's agents entry names — `.md` on Claude, `.toml` on
 * Codex, as the entry's codec says.
 *
 * A file is removed only when its basename is one the entry names; every other agent file
 * is preserved. Cleans up the agents directory if empty after removal. Which names those are
 * — the configured roster, or the files carrying the provenance marker — is the plan's
 * decision, not this function's, and so is whether to act at all: no entry, no call.
 *
 * @param onRemoved - Called for each removed agent name (for logging)
 */
async function removeMatchingAgents(
  entry: AgentsRemoval,
  onRemoved?: (agentName: string) => void,
): Promise<AgentRemovalResult> {
  const agentFiles = await listAgentFiles(entry.agentsDir, entry.codec);
  const removedNames = agentFiles
    .map((agentFile) => path.basename(agentFile, entry.codec.extension))
    .filter((agentName) => entry.agentNames.includes(agentName));

  for (const agentName of removedNames) {
    await remove(path.join(entry.agentsDir, `${agentName}${entry.codec.extension}`));
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
 * Where a plugin is looked for FIRST when the config has no entry naming its skill.
 *
 * The scope translation swallowed this until C3 — an absent scope and a project one mapped to
 * the same Claude scope word — so the order is unchanged and only the silence is gone.
 */
const SCOPE_OF_AN_UNRECORDED_SKILL: SkillScope = "project";

/**
 * Every scope this host installs plugins at, the config's own answer first.
 *
 * A plugin's registered scope is genuinely ambiguous here — a skill re-scoped after install is
 * filed under the scope it was installed at, not the one the config now names — so a removal
 * asks at each scope rather than trusting one. The best-effort sweep this replaces did it with
 * two hard-coded Claude scope words and no way to answer for another host; reading the roster off
 * {@link PluginHost.offeredPlacements} is the same sweep with the host deciding its width, which
 * for a host that installs plugins globally only is one scope rather than two.
 */
function pluginScopesToSweep(host: PluginHost, primary: SkillScope): SkillScope[] {
  const offered = host.offeredPlacements
    .filter((placement) => placement.mode === "plugin")
    .map((placement) => placement.scope);

  if (!offered.includes(primary)) return offered;
  return [primary, ...offered.filter((scope) => scope !== primary)];
}

/**
 * Drops a plugin's registration wherever the host filed it, and says whether one was there.
 *
 * Best-effort on the FAILURE side and unchanged by C3: the directory is deleted either way, so a
 * registration that cannot be dropped is untidy rather than wrong, and a thrown error here would
 * abort an uninstall that has already removed files. What changed is that it no longer reports
 * NOTHING — {@link PluginHost.uninstallPlugin} answers `removed` or `absent`, and that answer is
 * the only thing on this path that knows the difference.
 *
 * `removed` if ANY swept scope had one, because the sweep exists precisely for a plugin filed
 * under a scope the config no longer names: one registration dropped at either scope is one
 * removal, not two, and not none.
 */
async function removePluginWhereverItIsFiled(
  host: PluginHost,
  pluginRef: string,
  primaryScope: SkillScope,
  projectDir: string,
): Promise<PluginRemovalOutcome> {
  let outcome: PluginRemovalOutcome = "absent";

  for (const scope of pluginScopesToSweep(host, primaryScope)) {
    try {
      const swept = await host.uninstallPlugin(pluginRef, scope, projectDir);
      if (swept === "removed") outcome = "removed";
    } catch {
      // Best-effort: the plugin may not be registered at this scope. A throw is neither outcome
      // — the host reserves it for a failure that is not "there was nothing there" — so it leaves
      // `outcome` exactly as the other scopes found it rather than claiming an absence.
    }
  }

  return outcome;
}

/**
 * Uninstalls the plugins the plan's plugins entry names, by removing them from the
 * host and deleting their local directories. The entry decides WHICH plugins go;
 * `config` only answers HOW to ask the host — the scope its registry filed each
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
  const host = hostAt(projectDir);
  const hostAvailable = await host.isAvailable();
  const observed: string[] = [];

  for (const pluginName of entry.names) {
    const removal = hostAvailable
      ? await removePluginWhereverItIsFiled(
          host,
          pluginName,
          scopeThePluginIsFiledUnder(config, pluginName),
          projectDir,
        )
      : nothingWasObserved();

    await remove(path.join(entry.pluginsDir, pluginName));

    if (removal === "removed") {
      observed.push(pluginName);
      onUninstalled?.(pluginName);
    }
  }

  // What was OBSERVED, never what was asked for — D11(b), and the one Claude-visible change this
  // step signs off. On Codex `plugin remove` exits 0 and prints the same document for a plugin
  // that was never installed, one that really went and one removed twice, so a count built from
  // the plan is a count of intentions: it says "Uninstalled 1 plugin" for a plugin this command
  // did not touch. The listing the host takes BEFORE its removal is the only thing that knows.
  return {
    uninstalledNames: observed,
    totalUninstalled: observed.length,
  };
}

/**
 * The scope the host's registry most likely filed this plugin under, from the config's own row.
 *
 * The sweep beside it asks at every scope the host installs plugins at, so this is a PREFERENCE
 * rather than an answer: a skill re-scoped after install is filed under the scope it was installed
 * at, not the one the config now names.
 */
function scopeThePluginIsFiledUnder(config: ProjectConfig | null, pluginName: string): SkillScope {
  const skillId = parseMarketplacePluginRef(pluginName);
  return (
    config?.skills.find((skill) => skill.id === skillId)?.scope ?? SCOPE_OF_AN_UNRECORDED_SKILL
  );
}

/**
 * What a run with no host binary observed, which is nothing — the OTHER half of D11(b).
 *
 * This command used to count every plugin it MEANT to remove, so a machine where the host is not
 * installed reported a clean sweep of registrations nothing had touched. An unreachable host is
 * not a failure — the directory is still deleted and the uninstall still completes — so it is an
 * outcome rather than a throw, and the outcome is that nothing was seen to go.
 */
function nothingWasObserved(): PluginRemovalOutcome {
  return "absent";
}

/**
 * Removes exactly the manifest files the plan's config entry names from the source folder,
 * then the source folder itself when it has nothing else left. User-owned content in it
 * (e.g. ejected templates) keeps the directory alive. No entry
 * means the plan promised no manifest removal, so none is made.
 */
async function removeConfigManifest(
  entry: ConfigManifestRemoval | undefined,
): Promise<{ manifestRemoved: boolean; dirRemoved: boolean }> {
  if (!entry) return { manifestRemoved: false, dirRemoved: false };

  await Promise.all(
    entry.fileNames.map((fileName) => remove(path.join(entry.sourceDir, fileName))),
  );

  return { manifestRemoved: true, dirRemoved: await removeDirIfEmpty(entry.sourceDir) };
}

/**
 * Removes the CLI config manifest the plan named, then cleans up the emptied .claude/
 * directory and the emptied source folder.
 *
 * The directories themselves are not plan entries — they are the user's, and are removed
 * only when nothing of theirs is left in them once the CLI-managed contents are gone.
 */
async function cleanupEmptyDirs(
  target: Pick<UninstallTarget, "hasClaudeDir" | "claudeDir" | "sourceRoot" | "sourceFolder">,
  manifestEntries: readonly ConfigManifestRemoval[],
): Promise<CleanupResult> {
  const sourceFolder = await cleanupSourceFolder(
    target.sourceFolder,
    manifestEntries.find((entry) => entry.sourceDir === target.sourceFolder.dir),
  );
  const sourceRoot = await cleanupSourceRoot(target.sourceRoot, sourceFolder.dirRemoved);

  const claudeDirRemoved = target.hasClaudeDir && (await removeDirIfEmpty(target.claudeDir));
  // Nothing else removes .claude itself, so "kept" is exactly "present but not removed".
  const claudeDirKept =
    !claudeDirRemoved && target.hasClaudeDir && (await directoryExists(target.claudeDir));

  return {
    claudeDirRemoved,
    sourceFolder,
    sourceRootRemoved: sourceRoot.removed,
    sourceRootKept: sourceRoot.kept,
    claudeDirKept,
  };
}

/**
 * The source folder, once the plan's manifest files are out of it: removed when nothing is left,
 * kept when the user's own content is. A folder the plan named no file in is still removed when it
 * is empty — it is the product's name on a folder holding nothing.
 */
async function cleanupSourceFolder(
  folder: ScopeSourceFolder,
  entry: ConfigManifestRemoval | undefined,
): Promise<SourceFolderCleanup> {
  const manifest = await removeConfigManifest(entry);
  const dirRemoved = manifest.dirRemoved || (await removeDirIfEmpty(folder.dir));
  const kept = !dirRemoved && (await directoryExists(folder.dir));
  return {
    relName: folder.relName,
    manifestRemoved: manifest.manifestRemoved,
    dirRemoved,
    kept,
  };
}

/** What a cleanup pass did with the `.agents-inc/` parent: took it away, or deliberately left it. */
type SourceRootCleanup = { removed: boolean; kept: boolean };

/**
 * The provider folder's `.agents-inc/` parent, once the folder under it has gone.
 *
 * Cleanup above is leaf-first — `removeDirIfEmpty` on the folder the config was in — so nothing
 * looks one level up, and `.agents-inc/` left standing is a directory naming this product with
 * nothing installed under it. A later `init` and `doctor` both read that as a half-built layout.
 *
 * Only when it is empty, and only through the same `removeDirIfEmpty` the leaf uses: a consuming
 * repository keeps its own state under this parent — the gate's `baseline.json` is the live case
 * — and that state is not this CLI's to remove. Keeping it is then SAID rather than done in
 * silence, because a directory left where an install was reads as one the uninstall forgot.
 *
 * Attempted only when the provider folder itself went: while that folder is still there the
 * parent is not empty for a reason the user has already been told about, and a second line about
 * it would name the wrong cause.
 */
async function cleanupSourceRoot(
  sourceRoot: SourceRoot,
  providerDirRemoved: boolean,
): Promise<SourceRootCleanup> {
  if (!providerDirRemoved) return { removed: false, kept: false };

  const removed = await removeDirIfEmpty(sourceRoot.dir);
  return { removed, kept: !removed && (await directoryExists(sourceRoot.dir)) };
}

async function listAgentFiles(agentsDir: string, codec: AgentCodec): Promise<string[]> {
  try {
    return await listAgentFilesOf(agentsDir, codec);
  } catch {
    return [];
  }
}
