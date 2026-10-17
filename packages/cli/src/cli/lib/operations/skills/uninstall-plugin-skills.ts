import { hostAt } from "../../hosts/host-for.js";
import { buildMarketplacePluginRef } from "../../plugins/index.js";
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
