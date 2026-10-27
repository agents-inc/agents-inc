import { unique } from "remeda";

import { BaseCommand } from "../base-command.js";
import { EJECT_SOURCE } from "../consts.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { loadConfigInPlay, type LoadedProjectConfig } from "../lib/configuration/index.js";
import { hostFor } from "../lib/hosts/host-for.js";
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
import type { SkillConfig } from "../types/index.js";

function isEjected(skill: SkillConfig): boolean {
  return skill.origin === EJECT_SOURCE;
}

/** An excluded entry is a tombstone, not an install. */
function activeSkills(skills: SkillConfig[]): SkillConfig[] {
  return skills.filter((skill) => !skill.excluded);
}

function configuredMarketplaces(skills: SkillConfig[]): string[] {
  return unique(skills.filter((skill) => !isEjected(skill)).map((skill) => skill.origin));
}

export default class Update extends BaseCommand {
  static summary = "Refresh the marketplaces this installation uses";

  static description =
    "Runs Claude's own marketplace update for every marketplace this installation's config names. Ejected skills are copies you own and are never touched.";

  static flags = { provider: providerFlag() };

  static examples = ["<%= config.bin %> <%= command.id %>"];

  async run(): Promise<void> {
    const { flags } = await this.parse(Update);
    const namedProvider = providerNamedBy(flags.provider);

    await this.sayWhenTheGlobalInstallationStandsIn(namedProvider);
    // Before the config is loaded: loading it already picks a provider by roster order.
    await refuseAnAmbiguousInstallation(process.cwd(), "update", namedProvider, (message) =>
      this.error(message, { exit: EXIT_CODES.INVALID_ARGS }),
    );
    await this.ensureConfigReadable(process.cwd());
    await this.refuseUnofferablePlacements(process.cwd());
    const installed = await this.loadInstalledConfig(process.cwd());
    if (!installed) {
      this.warn(ERROR_MESSAGES.NO_INSTALLATION);
      return;
    }

    const skills = activeSkills(installed.config.skills);
    this.reportEjectedSkills(skills);

    const marketplaces = configuredMarketplaces(skills);
    if (marketplaces.length === 0) {
      this.log(INFO_MESSAGES.NO_PLUGIN_MARKETPLACES);
      return;
    }

    // The read installation's tool, not the cwd's: a leftover folder there would name another.
    const host = hostFor(installed.provider);
    await this.requireHost(host);
    await this.refreshMarketplaces(marketplaces, host);
  }

  private async refuseUnofferablePlacements(projectDir: string): Promise<void> {
    const [finding] = await unofferablePlacementsFound(projectDir);
    if (finding !== undefined) this.error(finding, { exit: EXIT_CODES.ERROR });
  }

  /** ABORT on an unreadable config: a fault, not "not installed". */
  private async loadInstalledConfig(projectDir: string): Promise<LoadedProjectConfig | null> {
    try {
      return await loadConfigInPlay(projectDir);
    } catch (error) {
      this.error(getErrorMessage(error), { exit: EXIT_CODES.ERROR });
    }
  }

  private reportEjectedSkills(skills: SkillConfig[]): void {
    if (!skills.some(isEjected)) return;
    this.log(INFO_MESSAGES.EJECTED_SKILLS_USER_OWNED);
  }

  private async requireHost(host: PluginHost): Promise<void> {
    if (await host.isAvailable()) return;
    this.error(hostCliNotFound(host.provider), { exit: EXIT_CODES.ERROR });
  }

  /** Sequential, as they share one registry; failures are collected so one cannot hide the rest. */
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
