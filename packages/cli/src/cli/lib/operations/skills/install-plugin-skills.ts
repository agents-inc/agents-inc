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

/**
 * Hard-error message for failed plugin installs. Plugin install intent is
 * inviolable (never fall back to eject) — callers MUST error with this BEFORE
 * config is written, or config.ts gains orphan entries claiming the skill
 * is installed.
 */
export function pluginInstallFailureError(failedCount: number): string {
  return `Failed to install ${failedCount} plugin skill(s). Plugin install intent could not be honored. Verify the skill id matches the marketplace, run '${CLI_INVOKE_COMMAND} update' to refresh the marketplace, or switch affected skills to eject mode.`;
}

/**
 * Skills asking to be installed as plugins that no marketplace carries.
 *
 * A skill that exists only in this project cannot be pulled from anywhere, so the ask is
 * refusable BEFORE anything is attempted — which is what separates it from an install
 * that was tried and failed. The Sources grid reads {@link isLocalOnlySkill} to decide
 * whether to offer the plugin cell at all, so this guard shares it: a caller reaching
 * past that surface must meet the same rule it did.
 */
export function unbackedPluginSkillIds(
  skills: SkillConfig[],
  matrix: MergedSkillsMatrix,
): SkillId[] {
  return skills
    .filter((skill) => skill.origin !== EJECT_SOURCE)
    .filter((skill) => isLocalOnlySkill(matrix.skills[skill.id]))
    .map((skill) => skill.id);
}

/**
 * The refusal text for {@link unbackedPluginSkillIds}. Deliberately NOT
 * {@link pluginInstallFailureError}: refreshing a marketplace and checking an id against
 * it are impossible instructions for a skill the user wrote themselves, so the two
 * failures owe different advice.
 */
export function unbackedPluginInstallError(ids: SkillId[]): string {
  return `Cannot install ${ids.length} skill(s) as plugins — no marketplace carries them: ${ids.join(", ")}. A skill that exists only in this project can only be installed as a local copy. Set it to Local on the Sources step, or publish it to a marketplace first.`;
}

/**
 * Installs skill plugins through the host this installation belongs to, routing by scope.
 *
 * For each skill, constructs the plugin ref as `{skillId}@{marketplace}` and asks the host to
 * install it at the skill's own scope. The host is read off the folder under `projectDir`,
 * because the folder is the only record of a provider — which is also the limit of it: a run
 * creating a folder that is not there yet must hand the provider down instead (C4).
 */
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
