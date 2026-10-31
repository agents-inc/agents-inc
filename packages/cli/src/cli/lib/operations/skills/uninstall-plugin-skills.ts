import { hostAt } from "../../hosts/host-for.js";
import type { PluginHost, PluginRemovalOutcome } from "../../hosts/plugin-host.js";
import { buildMarketplacePluginRef } from "../../plugins/index.js";
import { EJECT_SOURCE } from "../../../consts.js";
import { getErrorMessage } from "../../../utils/errors.js";
import type { SkillId } from "../../../types/index.js";
import type { SkillConfig, SkillScope } from "../../../types/config.js";

/** The safe default: a project removal cannot take a plugin from every project under one HOME. */
const SCOPE_OF_AN_UNRECORDED_SKILL: SkillScope = "project";

export type PluginUninstallResult = {
  /** Only plugins the host reported `removed`; an already-absent plugin is not listed. */
  uninstalled: SkillId[];
  failed: Array<{ id: SkillId; error: string }>;
};

export async function uninstallPluginSkills(
  skillIds: SkillId[],
  oldSkills: SkillConfig[],
  marketplace: string,
  projectDir: string,
): Promise<PluginUninstallResult> {
  const host = hostAt(projectDir);
  const uninstalled: SkillId[] = [];
  const failed: PluginUninstallResult["failed"] = [];

  for (const skillId of skillIds) {
    const oldSkill = oldSkills.find((s) => s.id === skillId);
    const pluginScope = oldSkill?.scope ?? SCOPE_OF_AN_UNRECORDED_SKILL;
    try {
      const outcome = await removeUnderFirstNameHeld(
        host,
        pluginRefsOf(skillId, oldSkill?.origin, marketplace),
        pluginScope,
        projectDir,
      );
      if (outcome === "removed") uninstalled.push(skillId);
    } catch (error) {
      failed.push({ id: skillId, error: getErrorMessage(error) });
    }
  }

  return { uninstalled, failed };
}

/**
 * The name its install recorded, then the installation's marketplace's, as `uninstall` asks: a
 * project can leave a plugin from its own marketplace at global scope.
 */
export function pluginRefsOf(
  skillId: SkillId,
  origin: string | undefined,
  marketplace: string,
): string[] {
  const marketplaceRef = buildMarketplacePluginRef(skillId, marketplace);
  if (origin === undefined || origin === marketplace || origin === EJECT_SOURCE) {
    return [marketplaceRef];
  }
  return [buildMarketplacePluginRef(skillId, origin), marketplaceRef];
}

/** `absent` passes the ask to the next name; a throw is a real failure and ends it. */
export async function removeUnderFirstNameHeld(
  host: PluginHost,
  pluginRefs: string[],
  scope: SkillScope,
  projectDir: string,
): Promise<PluginRemovalOutcome> {
  for (const pluginRef of pluginRefs) {
    const outcome = await host.uninstallPlugin(pluginRef, scope, projectDir);
    if (outcome === "removed") return outcome;
  }
  return "absent";
}
