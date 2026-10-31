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
import {
  FailedLeavingPluginsSwitchedOnError,
  PluginsLeftSwitchedOnError,
  type PluginLeftSwitchedOn,
} from "../lib/hosts/codex-plugin-switch.js";
import { buildMarketplacePluginRef } from "../lib/plugins/plugin-ref.js";
import { getErrorMessage } from "../utils/errors.js";
import {
  ERROR_MESSAGES,
  INFO_MESSAGES,
  codexPluginLeftSwitchedOn,
  hostCliNotFound,
  marketplaceRefreshFailed,
  marketplacesRefreshFailed,
  pluginsLeftSwitchedOn,
} from "../utils/messages.js";
import { plural } from "../utils/string.js";
import type { SkillConfig, SkillScope } from "../types/index.js";

type InstalledPlugin = { ref: string; scope: SkillScope };

function isEjected(skill: SkillConfig): boolean {
  return skill.origin === EJECT_SOURCE;
}

/** An excluded entry is a tombstone, not an install. */
function activeSkills(skills: SkillConfig[]): SkillConfig[] {
  return skills.filter((skill) => !skill.excluded);
}

function pluginSkills(skills: SkillConfig[]): SkillConfig[] {
  return skills.filter((skill) => !isEjected(skill));
}

function marketplacesOf(plugins: SkillConfig[]): string[] {
  return unique(plugins.map((skill) => skill.origin));
}

function installedPlugin(skill: SkillConfig): InstalledPlugin {
  return { ref: buildMarketplacePluginRef(skill.id, skill.origin), scope: skill.scope };
}

function pluginUpdateFailed(pluginRef: string, reason: string): string {
  return `Could not update plugin ${pluginRef}: ${reason}`;
}

function pluginsUpdateFailed(pluginRefs: string[]): string {
  return `${plural(pluginRefs.length, "plugin")} could not be updated: ${pluginRefs.join(", ")}`;
}

type StepOutcome = { readonly leftOn: readonly PluginLeftSwitchedOn[] } & (
  { readonly kind: "done" } | { readonly kind: "failed"; readonly reason: string }
);

type PluginUpdates = { failed: string[]; leftOn: PluginLeftSwitchedOn[] };

/** A step whose only shortfall is a switch Codex turned back on still did its work. */
async function outcomeOf(step: () => Promise<void>): Promise<StepOutcome> {
  try {
    await step();
    return { kind: "done", leftOn: [] };
  } catch (error) {
    if (error instanceof PluginsLeftSwitchedOnError) return { kind: "done", leftOn: error.leftOn };
    if (error instanceof FailedLeavingPluginsSwitchedOnError) {
      return { kind: "failed", reason: getErrorMessage(error.failure), leftOn: error.leftOn };
    }
    return { kind: "failed", reason: getErrorMessage(error), leftOn: [] };
  }
}

function switchedOnAgain(leftOn: readonly PluginLeftSwitchedOn[]): string[] {
  if (leftOn.length === 0) return [];
  return [pluginsLeftSwitchedOn(leftOn.map(({ pluginKey }) => pluginKey))];
}

function refreshedAndUpdated(marketplaceCount: number, pluginCount: number): string {
  return `Refreshed ${plural(marketplaceCount, "marketplace listing")} and updated ${plural(pluginCount, "installed plugin")}.`;
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

    const plugins = pluginSkills(skills);
    const marketplaces = marketplacesOf(plugins);
    if (marketplaces.length === 0) {
      this.log(INFO_MESSAGES.NO_PLUGIN_MARKETPLACES);
      return;
    }

    // The read installation's tool, not the cwd's: a leftover folder there would name another.
    const host = hostFor(installed.provider);
    await this.requireHost(host);
    // Every listing first: a plugin updated against a stale listing stays where it is.
    const leftOnByRefresh = await this.refreshMarketplaces(marketplaces, host);
    const updated = await this.updatePlugins(plugins.map(installedPlugin), host);
    this.failUnlessEveryPluginLanded(updated.failed, [...leftOnByRefresh, ...updated.leftOn]);
    this.logSuccess(refreshedAndUpdated(marketplaces.length, plugins.length));
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

  /**
   * Sequential, as they share one registry; failures are collected so one cannot hide the rest.
   * Answers the plugins a refresh left switched on, which do not stop the updates.
   */
  private async refreshMarketplaces(
    marketplaces: string[],
    host: PluginHost,
  ): Promise<PluginLeftSwitchedOn[]> {
    const failed: string[] = [];
    const leftOn: PluginLeftSwitchedOn[] = [];

    for (const marketplace of marketplaces) {
      this.log(`Refreshing marketplace ${marketplace}...`);
      const outcome = await outcomeOf(() => host.refreshMarketplace(marketplace));
      if (outcome.kind === "failed") {
        failed.push(marketplace);
        this.warn(marketplaceRefreshFailed(marketplace, outcome.reason));
      } else {
        this.log(`  Updated marketplace ${marketplace}`);
      }
      this.warnOfSwitchesLeftOn(outcome.leftOn);
      leftOn.push(...outcome.leftOn);
    }

    if (failed.length > 0) {
      this.error([marketplacesRefreshFailed(failed), ...switchedOnAgain(leftOn)].join("\n"), {
        exit: EXIT_CODES.ERROR,
      });
    }
    return leftOn;
  }

  /** Sequential and collecting, for the same reasons as the refresh. */
  private async updatePlugins(
    plugins: InstalledPlugin[],
    host: PluginHost,
  ): Promise<PluginUpdates> {
    const failed: string[] = [];
    const leftOn: PluginLeftSwitchedOn[] = [];

    for (const { ref, scope } of plugins) {
      this.log(`Updating plugin ${ref}...`);
      const outcome = await outcomeOf(() => host.updatePlugin(ref, scope, process.cwd()));
      if (outcome.kind === "failed") {
        failed.push(ref);
        this.warn(pluginUpdateFailed(ref, outcome.reason));
      } else {
        this.log(`  Updated plugin ${ref}`);
      }
      this.warnOfSwitchesLeftOn(outcome.leftOn);
      leftOn.push(...outcome.leftOn);
    }

    return { failed, leftOn };
  }

  private warnOfSwitchesLeftOn(leftOn: readonly PluginLeftSwitchedOn[]): void {
    for (const { pluginKey, configFile, reason } of leftOn) {
      this.warn(codexPluginLeftSwitchedOn(pluginKey, configFile, reason));
    }
  }

  private failUnlessEveryPluginLanded(failed: string[], leftOn: PluginLeftSwitchedOn[]): void {
    const shortfalls = [
      ...(failed.length > 0 ? [pluginsUpdateFailed(failed)] : []),
      ...switchedOnAgain(leftOn),
    ];
    if (shortfalls.length > 0) this.error(shortfalls.join("\n"), { exit: EXIT_CODES.ERROR });
  }
}
