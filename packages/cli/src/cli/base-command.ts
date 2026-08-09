import { Command } from "@oclif/core";

import chalk from "chalk";

import { CLI_COLORS, MIN_TERMINAL_SIZE } from "./consts.js";
import { getErrorMessage } from "./utils/errors.js";
import {
  configUnreadableError,
  pluginsInstalled,
  propagatedRecompileSummary,
  savedSkillMetadataUnusableError,
  skillMetadataUnusableDetail,
  STATUS_MESSAGES,
} from "./utils/messages.js";
import {
  clearTerminalScreen,
  formatTerminalTooSmallMessage,
  isTerminalLargeEnough,
} from "./utils/terminal.js";
import { EXIT_CODES } from "./lib/exit-codes.js";
import type { ResolvedConfig } from "./lib/configuration/index.js";
import type { MergedSkillsMatrix, SelectionValidation, SkillConfig } from "./types/index.js";
import { findConfigLoadFailures } from "./lib/configuration/project-config.js";
import { findUnusableSavedSkillMetadata } from "./lib/skills/index.js";
import { requireMarketplace } from "./lib/operations/source/require-marketplace.js";
import {
  installPluginSkills,
  pluginInstallFailureError,
  type PluginInstallResult,
} from "./lib/operations/skills/install-plugin-skills.js";
import type { GateReport } from "./lib/config-gate/index.js";
import type { SourceLoadResult } from "./lib/loading/source-loader.js";

/** Narrow interface for the sourceConfig we attach to oclif's Config in the init hook. */
export interface ConfigWithSource {
  sourceConfig?: ResolvedConfig;
}

/**
 * How often the size gate re-reads the terminal while it is blocked. `resize` is what normally
 * ends the wait; the poll is the belt for the terminals and multiplexers that resize without
 * ever emitting one, and it is the only reason a blocked command is not a hung one there.
 */
const TERMINAL_RESIZE_POLL_MS = 500;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @types/node declares this as `number`; it is undefined whenever stdout is not a TTY
const terminalColumns = (): number => process.stdout.columns ?? MIN_TERMINAL_SIZE.COLS;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @types/node declares this as `number`; it is undefined whenever stdout is not a TTY
const terminalRows = (): number => process.stdout.rows ?? MIN_TERMINAL_SIZE.ROWS;

function isTerminalBigEnough(): boolean {
  return isTerminalLargeEnough(terminalColumns(), terminalRows());
}

/**
 * Resolves the moment the terminal satisfies `isSatisfied` — on the resize event where there is
 * one, on the poll where there is not. Both listeners are torn down before resolving, so a
 * command that got past the gate leaves nothing behind holding the process open.
 */
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

/**
 * Nothing is inherited by every command, so this class declares no `baseFlags`.
 *
 * There was one — `--source` — until naming a source became `init`'s decision alone
 * (owner ruling 2026-08-09). Six commands were already opting out of it through an
 * exported empty-object cast; a flag one command wants is that command's flag, so it
 * is declared in `init` and the six opt-outs went with it.
 */
export abstract class BaseCommand extends Command {
  async init(): Promise<void> {
    await super.init();
    await this.ensureTerminalSize();
  }

  public get sourceConfig(): ResolvedConfig | undefined {
    // Boundary cast: oclif Config is a class (not augmentable); we attach sourceConfig in the init hook
    return (this.config as unknown as ConfigWithSource).sourceConfig;
  }

  /**
   * Blocks the command from launching in a terminal below
   * {@link MIN_TERMINAL_SIZE}. This runs once, before Ink mounts; the terminal
   * shrinking mid-session is caught by the matching guard in `WizardLayout`.
   */
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

  /**
   * Resolves the marketplace required for a plugin operation, or hard-exits with
   * an actionable error when it cannot be resolved. `onRegistered` is invoked
   * (when provided) if the marketplace had to be registered — init uses it to log.
   */
  protected async requireMarketplaceOrExit(
    sourceResult: SourceLoadResult,
    purpose: string,
    onRegistered?: (marketplace: string) => void,
  ): Promise<string> {
    const required = await requireMarketplace(sourceResult, purpose);
    if (!required.ok) {
      this.error(required.error, { exit: EXIT_CODES.ERROR });
    }
    if (required.registered) {
      onRegistered?.(required.marketplace);
    }
    return required.marketplace;
  }

  /**
   * Reports every constraint a completed selection breaks — a conflicting pair, an unmet
   * requirement, an exclusive category with two picks.
   *
   * Shared by `init` and `edit` so one selection cannot be reported two ways. Both commands ask
   * the same question of the same matrix, so a roster that draws a warning through one must draw
   * the same warning through the other; `init` used to compute the answer and drop it, which is
   * the whole reason this lives here rather than on either command.
   *
   * These are advisory (`ValidationError` in types/matrix.ts): the selection is installed either
   * way and neither command's exit code turns on them, so they are warnings and not errors. The
   * loop is its own guard — an accepted selection carries no errors and says nothing.
   */
  protected reportValidationErrors(validation: SelectionValidation): void {
    for (const error of validation.errors) {
      this.warn(error.message);
    }
  }

  /**
   * Installs skill plugins and narrates the operation.
   *
   * Shared by `init` and `edit` for the same reason as {@link reportValidationErrors}:
   * both run the SAME install against the same marketplace, so a line one prints about
   * it the other owes. `edit` used to run it in silence — a real `claude plugin install`
   * was indistinguishable in the output from nothing having happened.
   */
  protected async installPluginSkillsReported(
    skills: SkillConfig[],
    marketplace: string,
    projectDir: string,
  ): Promise<PluginInstallResult> {
    this.announcePluginInstall();
    const result = await installPluginSkills(skills, marketplace, projectDir);
    this.reportPluginInstalls(result);
    return result;
  }

  /**
   * The opening half of the narration above, exposed for the one caller that cannot
   * use the whole of it: an eject→plugin migration installs each plugin and deletes
   * that skill's working copy in the same step (see `executeMigration`), so the
   * install it performs is not this command's to run.
   */
  protected announcePluginInstall(): void {
    this.log(STATUS_MESSAGES.INSTALLING_PLUGINS);
  }

  /**
   * The closing half: what was installed, what was not, and the refusal to continue
   * past a failure.
   *
   * The hard-error is part of the report rather than each caller's own postscript
   * because it is the same rule everywhere — plugin install intent is inviolable, so
   * a run that could not honor it must stop BEFORE any config records a marketplace
   * `source` for a skill with no plugin registration.
   */
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

  /**
   * Renders the recompile a gated write already performed on every OTHER registered
   * project this run's global change was propagated into.
   *
   * Shared by all four commands that fan out — the count and its wording are one
   * statement about one operation, and four copies of it had already drifted into two
   * spellings of the same sentence.
   */
  protected reportPropagatedRecompile(report: GateReport): void {
    if (report.propagated.updated.length === 0) return;

    const { rewrittenCount, unchangedCount, failedCount, warnings } = report.recompile;
    for (const warning of warnings) {
      this.warn(warning);
    }
    this.log(propagatedRecompileSummary(rewrittenCount, unchangedCount, failedCount));
  }

  /**
   * Refuses to run when a config file exists but cannot be loaded.
   *
   * Both configs this run would read are checked, because both are read on the way through: a
   * project's own `config.ts` and the global one every project write inlines. Checking up
   * front is the whole point — an unreadable GLOBAL config otherwise surfaced only at the
   * config write, after the wizard had copied skills and installed plugins, as a warning that
   * the write never happened.
   *
   * A MISSING config is not a corrupt one and passes here untouched: it is the legitimate
   * state `init` exists for, and the state `edit` reports as "no installation".
   */
  protected async ensureConfigReadable(projectDir: string): Promise<void> {
    const [failure] = await findConfigLoadFailures(projectDir);
    if (failure) {
      this.error(configUnreadableError(failure.message), { exit: EXIT_CODES.ERROR });
    }
  }

  /**
   * Refuses to run when a saved skill entry names a local skill that IS installed and whose
   * metadata.yaml describes no skill.
   *
   * One layer below {@link ensureConfigReadable} and for the same reason: the config parses,
   * and a file it points at does not. Both wizards resolve their saved roster against the
   * loaded catalogue, and an id nothing can be loaded for reaches no screen — so without this
   * the entry is dropped and reported as a skill the marketplace no longer carries, which is a
   * removal the user never asked for and a sentence blaming the wrong thing.
   *
   * Only entries the catalogue does not carry are looked at, so a healthy install pays a
   * filesystem read for nothing. An entry whose files are simply GONE is not refused — there
   * is no file to repair, so it is removed with a reason that says so
   * (`unresolvedSkillRemovalReasons`).
   *
   * Runs before the wizard mounts, which is the whole point: past that, a refusal costs the
   * user the session they had already spent, and everything this protects has been rewritten.
   */
  protected async ensureSavedSkillsReadable(
    savedSkills: readonly SkillConfig[],
    matrix: MergedSkillsMatrix,
    projectDir: string,
  ): Promise<void> {
    const unresolved = savedSkills
      .filter((saved) => !saved.excluded && !matrix.skills[saved.id])
      .map((saved) => saved.id);
    if (unresolved.length === 0) return;

    const unusable = await findUnusableSavedSkillMetadata(unresolved, savedSkills, projectDir);
    if (unusable.length === 0) return;

    // The detail is LOGGED and only the refusal is raised — oclif hard-wraps error text at the
    // terminal width, and a path broken across two lines is one nobody can copy. Same split
    // `compile` makes over the same verdict.
    for (const entry of unusable) {
      this.log(skillMetadataUnusableDetail(entry));
    }
    this.error(savedSkillMetadataUnusableError(unusable), { exit: EXIT_CODES.ERROR });
  }
}
