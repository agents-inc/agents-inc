import { Command } from "@oclif/core";

import chalk from "chalk";
import { unique } from "remeda";

import { CLI_COLORS, DEFAULT_BRANDING, MIN_TERMINAL_SIZE } from "./consts.js";
import { getErrorMessage } from "./utils/errors.js";
import { verbose } from "./utils/logger.js";
import {
  completedWithFailures,
  installationConfigsUnreadable,
  type IncompleteWork,
  pluginsInstalled,
  propagatedRecompileSummary,
  registeredProjectConfigUnreadable,
  registeredProjectGone,
  registeredProjectOnAnotherProvider,
  savedSkillMetadataUnusableError,
  scopeBlockedStackAssignment,
  sharedConfigProjectScopeAtHome,
  skillAssignedToNoAgent,
  skillMetadataUnusableDetail,
  STATUS_MESSAGES,
} from "./utils/messages.js";
import {
  clearTerminalScreen,
  formatTerminalTooSmallMessage,
  isTerminalLargeEnough,
} from "./utils/terminal.js";
import { EXIT_CODES } from "./lib/exit-codes.js";
import { isActiveAt } from "./lib/configuration/scope-predicates.js";
import { resolveBranding } from "./lib/configuration/config.js";
import { isHomeDirectory, refuseUnofferedStack } from "./lib/installation/index.js";
import type { InstallSelection } from "@workspace/compile/seed-to-config";
import { getStackSkillIds } from "./lib/stacks/index.js";
import type {
  AgentName,
  MergedSkillsMatrix,
  ProjectConfig,
  SelectionValidation,
  SkillConfig,
  SkillId,
} from "./types/index.js";
import { findConfigLoadFailures } from "./lib/configuration/project-config.js";
import { findUnusableSavedSkillMetadata } from "./lib/skills/index.js";
import type { PluginHost } from "./lib/hosts/plugin-host.js";
import { hostAt } from "./lib/hosts/host-for.js";
import { refuseUnofferedPlacements } from "./lib/hosts/offered-placements.js";
import {
  refuseUncarriedDestinations,
  type ExternalSkillInstall,
} from "./lib/seed/external-skills.js";
import { refuseUnwritableStack } from "@workspace/compile/config-source";
import { requireMarketplace } from "./lib/operations/source/require-marketplace.js";
import {
  installPluginSkills,
  pluginInstallFailureError,
  unbackedPluginInstallError,
  unbackedPluginSkillIds,
  type PluginInstallResult,
} from "./lib/operations/skills/install-plugin-skills.js";
import type { GateReport } from "./lib/config-gate/index.js";
import type { SourceLoadResult } from "./lib/loading/source-loader.js";
import type { UnusableSkillMetadata } from "./lib/loading/index.js";

/** Polled because some terminals and multiplexers resize without emitting `resize`. */
const TERMINAL_RESIZE_POLL_MS = 500;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @types/node declares this as `number`; it is undefined whenever stdout is not a TTY
const terminalColumns = (): number => process.stdout.columns ?? MIN_TERMINAL_SIZE.COLS;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @types/node declares this as `number`; it is undefined whenever stdout is not a TTY
const terminalRows = (): number => process.stdout.rows ?? MIN_TERMINAL_SIZE.ROWS;

function isTerminalBigEnough(): boolean {
  return isTerminalLargeEnough(terminalColumns(), terminalRows());
}

function waitForTerminal(isSatisfied: () => boolean): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (!isSatisfied()) return;
      clearInterval(interval);
      process.stdout.off("resize", check);
      resolve();
    };
    const interval = setInterval(check, TERMINAL_RESIZE_POLL_MS);
    process.stdout.on("resize", check);
  });
}

type UnassignedSkill = { skillId: SkillId; blockedBy: AgentName[] };

/**
 * Only the selection is judged: inherited global skills are absent from this stack without being
 * unassigned. `blockedBy` is empty for a global-scoped skill, since the scope rule is not why.
 */
function findUnassignedSkills(
  config: ProjectConfig,
  selected: readonly SkillConfig[],
): UnassignedSkill[] {
  const assignedIds = new Set(config.stack ? getStackSkillIds(config.stack) : []);
  const selectedIds = new Set(selected.map((skill) => skill.id));
  const globalAgentNames = config.agents
    .filter((agent) => isActiveAt(agent, "global"))
    .map((agent) => agent.name);

  const unassignedIds = unique(
    config.skills
      .filter((skill) => !skill.excluded && selectedIds.has(skill.id))
      .map((skill) => skill.id)
      .filter((skillId) => !assignedIds.has(skillId)),
  );

  return unassignedIds.map((skillId) => ({
    skillId,
    blockedBy: hasActiveProjectEntry(config.skills, skillId) ? globalAgentNames : [],
  }));
}

function hasActiveProjectEntry(skills: readonly SkillConfig[], skillId: SkillId): boolean {
  return skills.some((skill) => skill.id === skillId && isActiveAt(skill, "project"));
}

/** Split by kind: skill and sub-agent scopes are independent, so the refusal names each. */
function projectScopedContent(result: InstallSelection): {
  skillIds: SkillId[];
  agentNames: AgentName[];
} {
  return {
    skillIds: result.skills
      .filter((skill) => isActiveAt(skill, "project"))
      .map((skill) => skill.id),
    agentNames: result.agentConfigs
      .filter((agent) => isActiveAt(agent, "project"))
      .map((agent) => agent.name),
  };
}

export abstract class BaseCommand extends Command {
  /** Non-empty decides the exit code; see {@link exitIfWorkIncomplete}. */
  private readonly incompleteWork: IncompleteWork[] = [];

  async init(): Promise<void> {
    await super.init();
    await this.ensureTerminalSize();
  }

  protected async ensureTerminalSize(): Promise<void> {
    if (isTerminalBigEnough()) return;

    this.clearTerminal();
    this.log(chalk.hex(CLI_COLORS.WARNING)(formatTerminalTooSmallMessage(terminalColumns())));

    await waitForTerminal(isTerminalBigEnough);
  }

  protected handleError(error: unknown): never {
    const message = getErrorMessage(error);
    this.error(message, { exit: EXIT_CODES.ERROR });
  }

  /**
   * Degrades on an unreadable config: `doctor` and `uninstall` must survive one, and a heading is
   * not worth refusing over. The command's own config reader reports the cause.
   */
  protected async resolveBrandingName(projectDir: string): Promise<string> {
    try {
      const branding = await resolveBranding(projectDir);
      return branding.name;
    } catch (error) {
      verbose(`Could not read branding from the config: ${getErrorMessage(error)}`);
      return DEFAULT_BRANDING.NAME;
    }
  }

  protected logSuccess(message: string): void {
    this.log(`✓ ${message}`);
  }

  protected logWarning(message: string): void {
    this.warn(message);
  }

  protected logInfo(message: string): void {
    this.log(message);
  }

  protected clearTerminal(): void {
    clearTerminalScreen();
  }

  /** `onRegistered` fires only when the marketplace had to be registered. */
  protected async requireMarketplaceOrExit(
    sourceResult: SourceLoadResult,
    purpose: string,
    host: PluginHost,
    onRegistered?: (marketplace: string) => void,
  ): Promise<string> {
    const required = await requireMarketplace(sourceResult, purpose, host);
    if (!required.ok) {
      this.error(required.error, { exit: EXIT_CODES.ERROR });
    }
    if (required.registered) {
      onRegistered?.(required.marketplace);
    }
    return required.marketplace;
  }

  /** Advisory: the selection installs either way, so these are warnings. */
  protected reportValidationErrors(validation: SelectionValidation): void {
    for (const error of validation.errors) {
      this.warn(error.message);
    }
  }

  /** Refuses skills no marketplace carries before the host's CLI is asked. */
  protected async installPluginSkillsReported(
    skills: SkillConfig[],
    marketplace: string,
    projectDir: string,
    matrix: MergedSkillsMatrix,
  ): Promise<PluginInstallResult> {
    const unbacked = unbackedPluginSkillIds(skills, matrix);
    if (unbacked.length > 0) {
      this.error(unbackedPluginInstallError(unbacked), { exit: EXIT_CODES.ERROR });
    }

    this.announcePluginInstall();
    const result = await installPluginSkills(skills, marketplace, projectDir);
    this.reportPluginInstalls(result);
    return result;
  }

  /** Split out for the eject-to-plugin migration, which runs its own installs. */
  protected announcePluginInstall(): void {
    this.log(STATUS_MESSAGES.INSTALLING_PLUGINS);
  }

  /** Hard-errors on any failure, before a config can record an origin for an uninstalled plugin. */
  protected reportPluginInstalls(result: PluginInstallResult): void {
    for (const item of result.installed) {
      this.log(`  Installed ${item.ref}`);
    }
    for (const item of result.failed) {
      this.warn(`Failed to install plugin ${item.id}: ${item.error}`);
    }
    if (result.failed.length > 0) {
      this.error(pluginInstallFailureError(result.failed.length), { exit: EXIT_CODES.ERROR });
    }
    this.log(`${pluginsInstalled(result.installed.length)}\n`);
  }

  protected reportFanOut(report: GateReport): void {
    for (const projectPath of report.propagated.unreadable) {
      this.warn(registeredProjectConfigUnreadable(projectPath));
    }
    this.reportPropagatedRecompile(report);
  }

  protected reportProjectsOutOfReach(propagated: GateReport["propagated"]): void {
    for (const projectPath of propagated.gone) {
      this.warn(registeredProjectGone(projectPath));
    }
    for (const projectPath of propagated.notOurs) {
      this.warn(registeredProjectOnAnotherProvider(projectPath));
    }
  }

  protected reportPropagatedRecompile(report: GateReport): void {
    if (report.propagated.updated.length === 0) return;

    const { rewrittenCount, unchangedCount, failedCount, warnings } = report.recompile;
    for (const warning of warnings) {
      this.warn(warning);
    }
    this.log(propagatedRecompileSummary(rewrittenCount, unchangedCount, failedCount));
  }

  protected reportUnassignedSkills(config: ProjectConfig, selected: readonly SkillConfig[]): void {
    for (const { skillId, blockedBy } of findUnassignedSkills(config, selected)) {
      this.warn(skillAssignedToNoAgent(skillId));
      if (blockedBy.length > 0) {
        this.warn(scopeBlockedStackAssignment(blockedBy, skillId));
      }
    }
  }

  /**
   * Aborts up front when the project or global config exists but cannot be loaded, so nothing is
   * installed before the config write fails. A missing config passes.
   */
  protected async ensureConfigReadable(projectDir: string): Promise<void> {
    const failures = await findConfigLoadFailures(projectDir);
    if (failures.length > 0) {
      this.error(installationConfigsUnreadable(failures), { exit: EXIT_CODES.ERROR });
    }
  }

  /** Only entries the catalogue lacks are checked; one whose files are gone is not refused. */
  protected async ensureSavedSkillsReadable(
    savedSkills: readonly SkillConfig[],
    matrix: MergedSkillsMatrix,
    projectDir: string,
  ): Promise<void> {
    const unresolved = savedSkills.filter((saved) => !matrix.skills[saved.id]);
    await this.refuseUnusableSavedSkillMetadata(
      unresolved,
      projectDir,
      savedSkillMetadataUnusableError,
    );
  }

  protected async refuseUnusableSavedSkillMetadata(
    savedSkills: readonly SkillConfig[],
    projectDir: string,
    refusal: (unusable: UnusableSkillMetadata[]) => string,
  ): Promise<void> {
    const unusable = await findUnusableSavedSkillMetadata(savedSkills, projectDir);
    if (unusable.length === 0) return;

    // Logged, not raised: oclif hard-wraps error text, which breaks copyable paths.
    for (const entry of unusable) {
      this.log(skillMetadataUnusableDetail(entry));
    }
    this.error(refusal(unusable), { exit: EXIT_CODES.ERROR });
  }

  /**
   * The home directory is the global scope, so project-scoped content there would land in the
   * global config mislabelled. Needs the decoded selection; callers run it before any write.
   */
  protected refuseProjectScopedContentAtHome(result: InstallSelection, projectDir: string): void {
    if (!isHomeDirectory(projectDir)) return;

    const { skillIds, agentNames } = projectScopedContent(result);
    if (skillIds.length === 0 && agentNames.length === 0) return;

    this.error(sharedConfigProjectScopeAtHome(skillIds, agentNames), { exit: EXIT_CODES.ERROR });
  }

  /** The `--from` refusals that need the decoded selection, asked before the confirm. */
  protected async refuseSharedConfigBeforeAsking(
    selection: InstallSelection,
    carried: ExternalSkillInstall[],
    root: string,
    sourceResult: SourceLoadResult,
  ): Promise<void> {
    this.refuseUnofferablePlacementsBeforeWriting(selection.skills, root);
    try {
      await refuseUnofferedStack(selection.selectedStackId, sourceResult);
      await refuseUncarriedDestinations(carried);
      refuseUnwritableStack(selection.assignedStack, sourceResult.matrix);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Pre-flight over every row, ejected included: the per-plugin guard in `installPlugin` fires
   * mid-loop, after earlier plugins are already installed.
   */
  protected refuseUnofferablePlacementsBeforeWriting(
    skills: readonly SkillConfig[],
    root: string,
  ): void {
    try {
      refuseUnofferedPlacements(skills, hostAt(root));
    } catch (error) {
      this.error(getErrorMessage(error), { exit: EXIT_CODES.ERROR });
    }
  }

  protected get hasIncompleteWork(): boolean {
    return this.incompleteWork.length > 0;
  }

  /** Never aborts: every caller is past a mutation that has already landed. */
  protected reportIncompleteWork(what: string, recovery: string): void {
    this.warn(what);
    this.recordIncompleteWork(what, recovery);
  }

  /** For a caller that has already warned. */
  protected recordIncompleteWork(what: string, recovery: string): void {
    this.incompleteWork.push({ what, recovery });
  }

  /** Every command that records must call this; `this.exit` skips the `Error:` framing. */
  protected exitIfWorkIncomplete(): void {
    if (!this.hasIncompleteWork) return;

    this.log(`\n${chalk.hex(CLI_COLORS.WARNING)(completedWithFailures(this.incompleteWork))}\n`);
    this.exit(EXIT_CODES.COMPLETED_WITH_FAILURES);
  }
}
