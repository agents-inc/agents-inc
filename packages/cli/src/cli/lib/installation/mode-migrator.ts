import type { SkillId } from "../../types";
import type { SkillConfig, SkillScope } from "../../types/config";
import type { SourceLoadResult } from "../loading";
// Type-only, so no module edge is created: the operations layer imports back into
// this one, and the shape a plugin install reports is defined where installs live.
import type { PluginInstallResult } from "../operations/skills/install-plugin-skills";
import { deleteLocalSkill, copySkillsToLocalFlattened } from "../skills";
import { claudePluginInstall, claudePluginUninstall } from "../../utils/exec";
import { buildMarketplacePluginRef, toClaudePluginScope } from "../plugins/plugin-ref";
import { installBaseDir, resolveInstallPaths } from "./install-base-dir";
import { verbose } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { EJECT_SOURCE } from "../../consts";

export type SkillMigration = {
  id: SkillId;
  oldSource: string;
  newSource: string;
  oldScope: SkillScope;
  newScope: SkillScope;
};

export type MigrationPlan = {
  toEject: SkillMigration[];
  toPlugin: SkillMigration[];
  scopeChanges: SkillMigration[];
};

export type MigrationResult = {
  ejectedSkills: SkillId[];
  /**
   * What the eject→plugin half installed, in the shape a fresh install returns, so
   * one command surface reports both. The refs are built here because this is where
   * each migration's own scope and marketplace are already resolved.
   *
   * A non-empty `failed` means this run could NOT honor the user's plugin intent for
   * those skills, so the caller MUST hard-error before writing any config — otherwise
   * config.ts records a marketplace `source` for a skill that has no plugin
   * registration.
   */
  pluginInstalls: PluginInstallResult;
  warnings: string[];
};

/**
 * Detect which skills changed source or scope between old and new configs
 * by comparing SkillConfig[] entries by ID.
 */
export function detectMigrations(
  oldSkills: SkillConfig[],
  newSkills: SkillConfig[],
): MigrationPlan {
  const toEject: SkillMigration[] = [];
  const toPlugin: SkillMigration[] = [];
  const scopeChanges: SkillMigration[] = [];

  const oldById = new Map(oldSkills.map((s) => [s.id, s]));

  for (const newSkill of newSkills) {
    const oldSkill = oldById.get(newSkill.id);
    if (!oldSkill) continue;

    const migration: SkillMigration = {
      id: newSkill.id,
      oldSource: oldSkill.source,
      newSource: newSkill.source,
      oldScope: oldSkill.scope,
      newScope: newSkill.scope,
    };

    const wasEject = oldSkill.source === EJECT_SOURCE;
    const isEject = newSkill.source === EJECT_SOURCE;

    if (wasEject && !isEject) {
      toPlugin.push(migration);
    } else if (!wasEject && isEject) {
      toEject.push(migration);
    }

    // Detect scope changes (independent of source changes)
    if (oldSkill.scope !== newSkill.scope && wasEject === isEject) {
      scopeChanges.push(migration);
    }
  }

  return { toEject, toPlugin, scopeChanges };
}

/**
 * Execute per-skill migration: delete locals that switch to plugin,
 * copy to local for skills that switch from plugin.
 * Uses per-skill scope from the migration plan.
 */
export async function executeMigration(
  plan: MigrationPlan,
  projectDir: string,
  sourceResult: SourceLoadResult,
): Promise<MigrationResult> {
  const warnings: string[] = [];
  const ejectedSkills: SkillId[] = [];
  const pluginInstalls: PluginInstallResult = { installed: [], failed: [] };

  // Migrate skills from plugin to eject, split by scope
  if (plan.toEject.length > 0) {
    try {
      const scopes = ["project", "global"] as const;
      for (const scope of scopes) {
        const migrations = plan.toEject.filter((m) =>
          scope === "global" ? m.newScope === "global" : m.newScope !== "global",
        );
        if (migrations.length === 0) continue;
        const copied = await copySkillsToLocalFlattened(
          migrations.map((m) => m.id),
          resolveInstallPaths(projectDir, scope).skillsDir,
          sourceResult,
        );
        ejectedSkills.push(...copied.map((skill) => skill.skillId));
      }

      // Uninstall plugin references using per-skill scope
      if (!sourceResult.marketplace) {
        warnings.push(
          ...plan.toEject
            .filter((m) => !(m.oldScope === "global" && m.newScope === "project"))
            .map((m) => `Could not uninstall plugin for ${m.id}: no marketplace configured`),
        );
      } else {
        for (const migration of plan.toEject) {
          // Don't uninstall global plugins when migrating to project scope —
          // the global plugin must remain for other projects. The project config
          // tombstone (excluded: true) already prevents this project from using it.
          if (migration.oldScope === "global" && migration.newScope === "project") {
            verbose(`Keeping global plugin for ${migration.id} (migrated to project-eject)`);
            continue;
          }
          // Scope-precise uninstall keyed to this migration's own scope. A best-effort
          // both-scopes sweep would also drop a same-id plugin registered at the OTHER Claude
          // scope (e.g. a project→eject switch uninstalling the still-needed global/user-scope
          // plugin). The registered scope is unambiguous here, so target it exactly.
          // claudePluginUninstall still swallows "not installed" / "not found".
          const pluginScope = toClaudePluginScope(migration.oldScope);
          const pluginRef = buildMarketplacePluginRef(migration.id, sourceResult.marketplace);
          await claudePluginUninstall(pluginRef, pluginScope, projectDir);
          verbose(`Uninstalled plugin for ${migration.id}`);
        }
      }
    } catch (error) {
      warnings.push(`Could not copy skills for eject: ${getErrorMessage(error)}`);
    }
  }

  // Migrate skills from eject to plugin
  if (plan.toPlugin.length > 0) {
    // Plugin install intent is inviolable: without a marketplace NO migration in
    // this list can be installed, so fail before anything is deleted. Deleting
    // first and downgrading to a warning destroys the user's editable working
    // copy and leaves config entries claiming a plugin that was never installed.
    if (!sourceResult.marketplace) {
      throw new Error(
        `Cannot install skills as plugins: marketplace could not be resolved from source ` +
          `'${sourceResult.sourceConfig.source}'. Plugin install mode requires a marketplace — ` +
          `fix the source or switch the affected skills to eject mode.`,
      );
    }

    // The same rule applies per skill: install FIRST and delete the ejected working
    // copy only once THAT skill's plugin is registered. A failed install then leaves
    // the skill exactly as it was, and the caller hard-errors on
    // `pluginInstalls.failed` before any config claims the plugin source.
    for (const migration of plan.toPlugin) {
      const pluginScope = toClaudePluginScope(migration.newScope);
      const pluginRef = buildMarketplacePluginRef(migration.id, sourceResult.marketplace);
      try {
        await claudePluginInstall(pluginRef, pluginScope, projectDir);
      } catch (error) {
        pluginInstalls.failed.push({ id: migration.id, error: getErrorMessage(error) });
        continue;
      }
      pluginInstalls.installed.push({ id: migration.id, ref: pluginRef });
      verbose(`Installed plugin for ${migration.id}`);
      await deleteEjectedWorkingCopy(migration, projectDir);
    }
  }

  return { ejectedSkills, pluginInstalls, warnings };
}

/**
 * Removes the local copy a now-pluginized skill no longer needs, from the scope it was
 * ejected at. A global copy is kept when the skill moves to project scope — the global
 * copy must remain for other projects.
 */
async function deleteEjectedWorkingCopy(
  migration: SkillMigration,
  projectDir: string,
): Promise<void> {
  if (migration.oldScope === "global" && migration.newScope === "project") {
    verbose(`Keeping global local skill for ${migration.id} (migrated to project-plugin)`);
    return;
  }
  await deleteLocalSkill(installBaseDir(projectDir, migration.oldScope), migration.id);
}
