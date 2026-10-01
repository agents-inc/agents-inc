import { unique } from "remeda";

import { BaseCommand } from "../base-command.js";
import { EJECT_SOURCE } from "../consts.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { loadProjectConfig } from "../lib/configuration/index.js";
import { hostAt } from "../lib/hosts/host-for.js";
import {
  providerFlag,
  providerNamedBy,
  refuseAnAmbiguousInstallation,
} from "../lib/installation/provider-flag.js";
import { unofferablePlacementsFound } from "../lib/hosts/configured-placements.js";
import type { PluginHost } from "../lib/hosts/plugin-host.js";
import { getErrorMessage } from "../utils/errors.js";
import {
  ERROR_MESSAGES,
  INFO_MESSAGES,
  hostCliNotFound,
  marketplaceRefreshFailed,
  marketplacesRefreshFailed,
  marketplacesRefreshed,
} from "../utils/messages.js";
import type { ProjectConfig, SkillConfig } from "../types/index.js";

/** A copy the user owns rather than a plugin the marketplace serves. */
function isEjected(skill: SkillConfig): boolean {
  return skill.origin === EJECT_SOURCE;
}

/** Entries the installation actually has — an excluded entry is a tombstone, not an install. */
function activeSkills(skills: SkillConfig[]): SkillConfig[] {
  return skills.filter((skill) => !skill.excluded);
}

/** The marketplaces this installation actually uses, deduplicated, in config order. */
function configuredMarketplaces(skills: SkillConfig[]): string[] {
  return unique(skills.filter((skill) => !isEjected(skill)).map((skill) => skill.origin));
}

export default class Update extends BaseCommand {
  static summary = "Refresh the marketplaces this installation uses";

  static description =
    "Runs Claude's own marketplace update for every marketplace this installation's config names. Ejected skills are copies you own and are never touched. Sub-agents reference plugin skills by pointer, so refreshed content lands without recompiling anything.";

  static flags = { provider: providerFlag() };

  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    const { flags } = await this.parse(Update);

    // Before the config is loaded, because loading it is already an answer: `loadProjectConfig`
    // and `hostAt` both resolve the provider through `providerInUse`, which picks by ROSTER ORDER
    // where a scope holds one installation of each. So a refresh with no flag read one user's
    // Claude config, refreshed the marketplaces IT names, and reported them as refreshed with
    // nothing saying whose they were.
    await refuseAnAmbiguousInstallation(
      process.cwd(),
      "update",
      providerNamedBy(flags.provider),
      (message) => this.error(message, { exit: EXIT_CODES.INVALID_ARGS }),
    );
    await this.settleSourceLayoutBeforeWriting(process.cwd());
    await this.refuseUnofferablePlacements(process.cwd());
    const config = await this.loadInstalledConfig(process.cwd());
    if (!config) {
      this.warn(ERROR_MESSAGES.NO_INSTALLATION);
      return;
    }

    const skills = activeSkills(config.skills);
    this.reportEjectedSkills(skills);

    const marketplaces = configuredMarketplaces(skills);
    if (marketplaces.length === 0) {
      this.log(INFO_MESSAGES.NO_PLUGIN_MARKETPLACES);
      return;
    }

    const host = hostAt(process.cwd());
    await this.requireHost(host);
    await this.refreshMarketplaces(marketplaces, host);
  }

  /**
   * Refuses a configuration whose own host cannot place what it asks for.
   *
   * The same reading `compile` and `edit` make, off the same host roster. It matters here because
   * this command REFRESHES the marketplaces a configuration names — so on a configuration whose
   * plugin rows the host can never install, every refresh is work done for rows that will never
   * become an install, reported as a success.
   */
  private async refuseUnofferablePlacements(projectDir: string): Promise<void> {
    const [finding] = await unofferablePlacementsFound(projectDir);
    if (finding !== undefined) this.error(finding, { exit: EXIT_CODES.ERROR });
  }

  /**
   * The config this directory's installation runs on — the project's own, or the
   * global one it inherits from. A config file that exists but cannot be loaded is
   * a fault, not an absence, so it is reported rather than read as "not installed".
   */
  private async loadInstalledConfig(projectDir: string): Promise<ProjectConfig | null> {
    try {
      const loaded = await loadProjectConfig(projectDir);
      return loaded?.config ?? null;
    } catch (error) {
      this.error(getErrorMessage(error), { exit: EXIT_CODES.ERROR });
    }
  }

  /** States the ownership rule once, and only where there is an ejected skill it applies to. */
  private reportEjectedSkills(skills: SkillConfig[]): void {
    if (!skills.some(isEjected)) return;
    this.log(INFO_MESSAGES.EJECTED_SKILLS_USER_OWNED);
  }

  /**
   * Gated on there being a marketplace to refresh, so an eject-only installation
   * never fails on a host binary it had no reason to call.
   */
  private async requireHost(host: PluginHost): Promise<void> {
    if (await host.isAvailable()) return;
    // The host's own provider, never a constant: this command reaches either host from C4, and a
    // fixed line tells a Codex user to install Claude Code — not the binary that is missing.
    this.error(hostCliNotFound(host.provider), { exit: EXIT_CODES.ERROR });
  }

  /**
   * One marketplace refresh per marketplace, in sequence: they write
   * to the same registry, and interleaved progress lines would not say which
   * marketplace each belongs to. A failure is collected rather than thrown, so one
   * unreachable marketplace cannot hide the state of the others.
   */
  private async refreshMarketplaces(marketplaces: string[], host: PluginHost): Promise<void> {
    const failed: string[] = [];

    for (const marketplace of marketplaces) {
      this.log(`Refreshing marketplace ${marketplace}...`);
      try {
        await host.refreshMarketplace(marketplace);
        this.log(`  Updated marketplace ${marketplace}`);
      } catch (error) {
        failed.push(marketplace);
        this.warn(marketplaceRefreshFailed(marketplace, getErrorMessage(error)));
      }
    }

    if (failed.length > 0) {
      this.error(marketplacesRefreshFailed(failed), { exit: EXIT_CODES.ERROR });
    }

    this.logSuccess(marketplacesRefreshed(marketplaces.length));
  }
}
