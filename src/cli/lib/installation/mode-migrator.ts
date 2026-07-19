import os from "os";
import path from "path";
import type { SkillId } from "../../types";
import type { SkillConfig } from "../../types/config";
import type { SourceLoadResult } from "../loading";
import { deleteLocalSkill, copySkillsToLocalFlattened } from "../skills";
import { claudePluginInstall, claudePluginUninstallBestEffort } from "../../utils/exec";
import { buildMarketplacePluginRef, toClaudePluginScope } from "../plugins/plugin-ref";
import { installBaseDir, resolveInstallPaths } from "./install-base-dir";
import { verbose, warn } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { LOCAL_SKILLS_PATH, EJECT_SOURCE } from "../../consts";

export type SkillMigration = {
  id: SkillId;
  oldSource: string;
  newSource: string;
  oldScope: "project" | "global";
  newScope: "project" | "global";
};

export type MigrationPlan = {
  toEject: SkillMigration[];
  toPlugin: SkillMigration[];
  scopeChanges: SkillMigration[];
};

export type MigrationResult = {
  ejectedSkills: SkillId[];
  pluginizedSkills: SkillId[];
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
  const pluginizedSkills: SkillId[] = [];

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
          const pluginScope = toClaudePluginScope(migration.oldScope);
          const pluginRef = buildMarketplacePluginRef(migration.id, sourceResult.marketplace);
          await claudePluginUninstallBestEffort(pluginRef, pluginScope, projectDir);
          verbose(`Uninstalled plugin for ${migration.id}`);
        }
      }
    } catch (error) {
      warnings.push(`Could not copy skills for eject: ${getErrorMessage(error)}`);
    }
  }

  // Migrate skills from eject to plugin
  if (plan.toPlugin.length > 0) {
    // Delete local copies from the scope-appropriate directory
    for (const migration of plan.toPlugin) {
      // Don't delete global local skills when migrating to project scope —
      // the global local copy must remain for other projects.
      if (migration.oldScope === "global" && migration.newScope === "project") {
        verbose(`Keeping global local skill for ${migration.id} (migrated to project-plugin)`);
        continue;
      }
      const baseDir = installBaseDir(projectDir, migration.oldScope);
      await deleteLocalSkill(baseDir, migration.id);
    }

    // Install as plugins using per-skill scope
    if (sourceResult.marketplace) {
      for (const migration of plan.toPlugin) {
        try {
          const pluginScope = toClaudePluginScope(migration.newScope);
          const pluginRef = buildMarketplacePluginRef(migration.id, sourceResult.marketplace);
          await claudePluginInstall(pluginRef, pluginScope, projectDir);
          pluginizedSkills.push(migration.id);
          verbose(`Installed plugin for ${migration.id}`);
        } catch (error) {
          warnings.push(`Could not install plugin for ${migration.id}: ${getErrorMessage(error)}`);
        }
      }
    } else {
      warnings.push(
        "No marketplace configured — cannot install skills as plugins. Skills deleted but not plugin-installed.",
      );
    }
  }

  return { ejectedSkills, pluginizedSkills, warnings };
}
