import { hostAt } from "../../hosts/host-for.js";
import { buildMarketplacePluginRef } from "../../plugins/index.js";
import { getErrorMessage } from "../../../utils/errors.js";
import type { SkillId } from "../../../types/index.js";
import type { SkillConfig, SkillScope } from "../../../types/config.js";

/**
 * Where a plugin is looked for when the old config has no entry naming the skill at all.
 *
 * The scope translation swallowed this until C3 — an absent scope and a project one mapped to the
 * same Claude scope word — so the behaviour is unchanged and only the silence is gone. It is the
 * safe direction of the two: a project-scoped removal cannot take a plugin away from every other
 * project under one HOME.
 */
const SCOPE_OF_AN_UNRECORDED_SKILL: SkillScope = "project";

export type PluginUninstallResult = {
  /**
   * The skills whose plugin registration this run really dropped.
   *
   * OBSERVED rather than asked for: a host's `uninstallPlugin` answers `removed` or
   * `absent`, and until that answer was read this list held every id the caller named — so a
   * plugin the user had already removed themselves was reported as one `edit` had just taken
   * away. Neither is a failure, which is why the distinction cannot be an exception and has to be
   * the return value.
   */
  uninstalled: SkillId[];
  failed: Array<{ id: SkillId; error: string }>;
};

/**
 * Uninstalls skill plugins through the host this installation belongs to, using the scope the
 * old config filed each one under.
 *
 * Each plugin reference is qualified as `{skillId}@{marketplace}` to match
 * the form used at install time — bare skill IDs will not match the registry.
 */
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
    const pluginRef = buildMarketplacePluginRef(skillId, marketplace);
    try {
      const outcome = await host.uninstallPlugin(pluginRef, pluginScope, projectDir);
      if (outcome === "removed") uninstalled.push(skillId);
    } catch (error) {
      failed.push({ id: skillId, error: getErrorMessage(error) });
    }
  }

  return { uninstalled, failed };
}
