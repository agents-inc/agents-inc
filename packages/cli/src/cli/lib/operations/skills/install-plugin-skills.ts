import { claudePluginInstall } from "../../../utils/exec.js";
import { buildMarketplacePluginRef, toClaudePluginScope } from "../../plugins/index.js";
import { getErrorMessage } from "../../../utils/errors.js";
import { EJECT_SOURCE } from "../../../consts.js";
import type { SkillId } from "../../../types/index.js";
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
  return `Failed to install ${failedCount} plugin skill(s). Plugin install intent could not be honored. Verify the skill id matches the marketplace, re-run with --refresh to update the marketplace, or switch affected skills to eject mode.`;
}

/**
 * Installs skill plugins via the Claude CLI, routing by scope.
 *
 * For each skill, constructs the plugin ref as `{skillId}@{marketplace}`
 * and invokes `claudePluginInstall` with the correct scope.
 */
export async function installPluginSkills(
  skills: SkillConfig[],
  marketplace: string,
  projectDir: string,
): Promise<PluginInstallResult> {
  const pluginSkills = skills.filter((s) => s.source !== EJECT_SOURCE);
  const installed: PluginInstallResult["installed"] = [];
  const failed: PluginInstallResult["failed"] = [];

  for (const skill of pluginSkills) {
    const pluginRef = buildMarketplacePluginRef(skill.id, marketplace);
    const pluginScope = toClaudePluginScope(skill.scope);
    try {
      await claudePluginInstall(pluginRef, pluginScope, projectDir);
      installed.push({ id: skill.id, ref: pluginRef });
    } catch (error) {
      failed.push({ id: skill.id, error: getErrorMessage(error) });
    }
  }

  return { installed, failed };
}
