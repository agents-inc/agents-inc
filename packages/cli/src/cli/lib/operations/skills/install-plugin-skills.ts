import { hostAt } from "../../hosts/host-for.js";
import { isLocalOnlySkill } from "../../loading/multi-source-loader.js";
import { buildMarketplacePluginRef } from "../../plugins/index.js";
import { getErrorMessage } from "../../../utils/errors.js";
import { CLI_INVOKE_COMMAND, EJECT_SOURCE } from "../../../consts.js";
import type { MergedSkillsMatrix, SkillId } from "../../../types/index.js";
import type { SkillConfig } from "../../../types/config.js";

export type PluginInstallResult = {
  installed: Array<{ id: SkillId; ref: string }>;
  failed: Array<{ id: SkillId; error: string }>;
};

/** Callers must error with this BEFORE config is written, or config.ts gains orphan entries. */
export function pluginInstallFailureError(failedCount: number): string {
  return `Failed to install ${failedCount} plugin skill(s). Plugin install intent could not be honored. Verify the skill id matches the marketplace, run '${CLI_INVOKE_COMMAND} update' to refresh the marketplace, or switch affected skills to eject mode.`;
}

/** Plugin-mode skills no marketplace carries, refusable before any install is attempted. */
export function unbackedPluginSkillIds(
  skills: SkillConfig[],
  matrix: MergedSkillsMatrix,
): SkillId[] {
  return skills
    .filter((skill) => skill.origin !== EJECT_SOURCE)
    .filter((skill) => isLocalOnlySkill(matrix.skills[skill.id]))
    .map((skill) => skill.id);
}

export function unbackedPluginInstallError(ids: SkillId[]): string {
  return `Cannot install ${ids.length} skill(s) as plugins — no marketplace carries them: ${ids.join(", ")}. A skill that exists only in this project can only be installed as a local copy. Set its Install mode to eject in the editor, or publish it to a marketplace first.`;
}

/** The host is read off the folder under `projectDir`, so that folder must already exist. */
export async function installPluginSkills(
  skills: SkillConfig[],
  marketplace: string,
  projectDir: string,
): Promise<PluginInstallResult> {
  const host = hostAt(projectDir);
  const pluginSkills = skills.filter((s) => s.origin !== EJECT_SOURCE);
  const installed: PluginInstallResult["installed"] = [];
  const failed: PluginInstallResult["failed"] = [];

  for (const skill of pluginSkills) {
    const pluginRef = buildMarketplacePluginRef(skill.id, marketplace);
    try {
      await host.installPlugin(pluginRef, skill.scope, projectDir);
      installed.push({ id: skill.id, ref: pluginRef });
    } catch (error) {
      failed.push({ id: skill.id, error: getErrorMessage(error) });
    }
  }

  return { installed, failed };
}
