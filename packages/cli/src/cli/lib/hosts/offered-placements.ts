/**
 * Makes {@link PluginHost.offeredPlacements} binding. Enforced once at `hostFor`'s door rather than
 * in each host, so a new host is bound without remembering to be.
 */

import { EJECT_SOURCE } from "../../consts.js";
import type { SkillConfig } from "../../types/config.js";
import type { InstallPlacement, PluginHost } from "./plugin-host.js";

function placementName(placement: InstallPlacement): string {
  return `${placement.mode}+${placement.scope}`;
}

function offersPlacement(host: PluginHost, placement: InstallPlacement): boolean {
  return host.offeredPlacements.some(
    (offered) => offered.mode === placement.mode && offered.scope === placement.scope,
  );
}

/** Exported for the install pre-flight, which must refuse before anything is written. */
export function refuseUnofferedPlacement(
  host: PluginHost,
  placement: InstallPlacement,
  subject: string,
): void {
  if (offersPlacement(host, placement)) return;

  throw new Error(
    `Refusing to install ${subject} as ${placementName(placement)}: the ${host.provider} host ` +
      `offers ${host.offeredPlacements.map(placementName).join(", ")}. Nothing has been changed.`,
  );
}

function placementAskedFor(skill: SkillConfig): InstallPlacement {
  return { mode: skill.origin === EJECT_SOURCE ? "eject" : "plugin", scope: skill.scope };
}

/**
 * For the read path too: a config copied into another provider's folder never met that host's
 * pre-flight. Excluded rows place nothing, so they are skipped.
 */
export function refuseUnofferedPlacements(skills: readonly SkillConfig[], host: PluginHost): void {
  for (const skill of skills) {
    if (skill.excluded === true) continue;
    refuseUnofferedPlacement(host, placementAskedFor(skill), skill.id);
  }
}

/** `installPlugin` only: uninstalling at an unoffered scope is an ordinary no-op sweep. */
export function bindsItsOfferedPlacements(host: PluginHost): PluginHost {
  return {
    ...host,
    // `async` so a refusal is a rejection, which `installPluginSkills` collects per skill; a
    // synchronous throw would abort the whole install.
    installPlugin: async (pluginRef, scope, projectDir, options) => {
      refuseUnofferedPlacement(host, { mode: "plugin", scope }, pluginRef);
      return host.installPlugin(pluginRef, scope, projectDir, options);
    },
  };
}
