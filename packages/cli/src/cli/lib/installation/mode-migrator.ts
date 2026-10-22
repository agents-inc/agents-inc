import type { SkillId } from "../../types";
import type { SkillConfig, SkillScope } from "../../types/config";
import type { SourceLoadResult } from "../loading";
// Type-only: the operations layer imports back into this module.
import type { PluginInstallResult } from "../operations/skills/install-plugin-skills";
import { deleteLocalSkill, copySkillsToLocalFlattened } from "../skills";
import { hostAt } from "../hosts/host-for";
import type { PluginHost } from "../hosts/plugin-host";
import { buildMarketplacePluginRef } from "../plugins/plugin-ref";
import { resolveInstallPaths } from "./install-base-dir";
import { verbose } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { plural } from "../../utils/string";
import { CLI_INVOKE_COMMAND, EJECT_SOURCE } from "../../consts";

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

/** A non-empty `failed` means the caller must hard-error before writing any config. */
export type EjectCopyResult = {
  copied: SkillId[];
  failed: Array<{ id: SkillId; error: string }>;
};

export type MigrationResult = {
  ejectCopies: EjectCopyResult;
  /** A non-empty `failed` means the caller must hard-error before writing any config. */
  pluginInstalls: PluginInstallResult;
  warnings: string[];
};

export function ejectCopyFailureError(failedCount: number): string {
  return `Failed to copy ${failedCount} skill(s) for eject. Eject intent could not be honored. Check that the destination skills directory is writable, then apply the same id again with '${CLI_INVOKE_COMMAND} edit --from <id>' — or switch the affected skills back to plugin mode.`;
}

/** The global plugin keeps serving every other project, so nothing switches: a copy is added. */
export function copyingBesideGlobalPlugins(count: number): string {
  const kept = count === 1 ? "the global plugin stays" : "the global plugins stay";
  return `Copying ${plural(count, "skill")} into this project (${kept})`;
}

/** The global copy keeps serving every other project, so nothing switches: a plugin is added. */
export function installingBesideGlobalCopies(count: number): string {
  const installedAs = count === 1 ? "a plugin" : "plugins";
  const kept = count === 1 ? "the global copy stays" : "the global copies stay";
  return `Installing ${plural(count, "skill")} as ${installedAs} in this project (${kept})`;
}

export function detectMigrations(
  oldSkills: SkillConfig[],
  newSkills: SkillConfig[],
): MigrationPlan {
  const oldById = new Map(oldSkills.map((s) => [s.id, s]));
  const migrations = newSkills.flatMap((newSkill) => {
    const oldSkill = oldById.get(newSkill.id);
    return oldSkill ? [migrationBetween(oldSkill, newSkill)] : [];
  });

  return {
    toEject: migrations.filter(switchesToEject),
    toPlugin: migrations.filter(switchesToPlugin),
    scopeChanges: migrations.filter(movesScopeWithoutSwitchingMode),
  };
}

function migrationBetween(oldSkill: SkillConfig, newSkill: SkillConfig): SkillMigration {
  return {
    id: newSkill.id,
    oldSource: oldSkill.origin,
    newSource: newSkill.origin,
    oldScope: oldSkill.scope,
    newScope: newSkill.scope,
  };
}

function wasEjected(migration: SkillMigration): boolean {
  return migration.oldSource === EJECT_SOURCE;
}

function isEjected(migration: SkillMigration): boolean {
  return migration.newSource === EJECT_SOURCE;
}

function switchesToEject(migration: SkillMigration): boolean {
  return !wasEjected(migration) && isEjected(migration);
}

function switchesToPlugin(migration: SkillMigration): boolean {
  return wasEjected(migration) && !isEjected(migration);
}

/** A skill that switches mode is planned as `toEject`/`toPlugin`, never also as a scope change. */
function movesScopeWithoutSwitchingMode(migration: SkillMigration): boolean {
  return (
    migration.oldScope !== migration.newScope && wasEjected(migration) === isEjected(migration)
  );
}

export async function executeMigration(
  plan: MigrationPlan,
  projectDir: string,
  sourceResult: SourceLoadResult,
): Promise<MigrationResult> {
  const host = hostAt(projectDir);

  const ejectCopies = await copyMigratedSkillsToLocal(plan.toEject, projectDir, sourceResult);
  // Only skills whose copy landed lose their plugin, so a failed copy leaves the skill installed.
  const warnings = await uninstallMigratedPlugins(
    migrationsWhoseCopyLanded(plan.toEject, ejectCopies),
    projectDir,
    sourceResult,
    host,
  );
  const pluginInstalls = await installMigratedPlugins(
    plan.toPlugin,
    projectDir,
    sourceResult,
    host,
  );

  return { ejectCopies, pluginInstalls, warnings };
}

/** Installs first and deletes a skill's ejected copy only once its plugin is registered. */
async function installMigratedPlugins(
  migrations: SkillMigration[],
  projectDir: string,
  sourceResult: SourceLoadResult,
  host: PluginHost,
): Promise<PluginInstallResult> {
  const installs: PluginInstallResult = { installed: [], failed: [] };
  if (migrations.length === 0) return installs;

  if (!sourceResult.marketplace) {
    throw new Error(
      `Cannot install skills as plugins: marketplace could not be resolved from ` +
        `'${sourceResult.sourceConfig.source}'. Plugin install mode requires a marketplace — ` +
        `fix the marketplace or switch the affected skills to eject mode.`,
    );
  }

  for (const migration of migrations) {
    const pluginRef = buildMarketplacePluginRef(migration.id, sourceResult.marketplace);
    try {
      await host.installPlugin(pluginRef, migration.newScope, projectDir);
    } catch (error) {
      installs.failed.push({ id: migration.id, error: getErrorMessage(error) });
      continue;
    }
    installs.installed.push({ id: migration.id, ref: pluginRef });
    verbose(`Installed plugin for ${migration.id}`);
    await deleteEjectedWorkingCopy(migration, projectDir);
  }

  return installs;
}

/** Per skill and per scope; failures are collected so the user sees every one at once. */
async function copyMigratedSkillsToLocal(
  migrations: SkillMigration[],
  projectDir: string,
  sourceResult: SourceLoadResult,
): Promise<EjectCopyResult> {
  const copies: EjectCopyResult = { copied: [], failed: [] };

  for (const migration of migrations) {
    const { skillsDir } = resolveInstallPaths(projectDir, migration.newScope);
    try {
      const copied = await copySkillsToLocalFlattened([migration.id], skillsDir, sourceResult);
      copies.copied.push(...copied.map((skill) => skill.skillId));
    } catch (error) {
      copies.failed.push({ id: migration.id, error: getErrorMessage(error) });
    }
  }

  return copies;
}

function migrationsWhoseCopyLanded(
  migrations: SkillMigration[],
  copies: EjectCopyResult,
): SkillMigration[] {
  const landed = new Set(copies.copied);
  return migrations.filter((migration) => landed.has(migration.id));
}

/**
 * Global→project leaves the global install, plugin or copy, serving every other project. The one
 * test both directions read, so what a run keeps and what it says it keeps cannot disagree.
 */
export function keepsGlobalInstall(migration: SkillMigration): boolean {
  return migration.oldScope === "global" && migration.newScope === "project";
}

/** Diagnostic-only: the local copy is the install now, so failures become warnings. */
async function uninstallMigratedPlugins(
  migrations: SkillMigration[],
  projectDir: string,
  sourceResult: SourceLoadResult,
  host: PluginHost,
): Promise<string[]> {
  const warnings: string[] = [];

  for (const migration of migrations) {
    if (keepsGlobalInstall(migration)) {
      verbose(`Keeping global plugin for ${migration.id} (migrated to project-eject)`);
      continue;
    }
    if (!sourceResult.marketplace) {
      warnings.push(`Could not uninstall plugin for ${migration.id}: no marketplace configured`);
      continue;
    }

    // Only the old scope, so a same-id plugin at the other scope survives.
    const pluginRef = buildMarketplacePluginRef(migration.id, sourceResult.marketplace);
    try {
      await host.uninstallPlugin(pluginRef, migration.oldScope, projectDir);
    } catch (error) {
      warnings.push(`Could not uninstall plugin for ${migration.id}: ${getErrorMessage(error)}`);
      continue;
    }
    verbose(`Uninstalled plugin for ${migration.id}`);
  }

  return warnings;
}

async function deleteEjectedWorkingCopy(
  migration: SkillMigration,
  projectDir: string,
): Promise<void> {
  if (keepsGlobalInstall(migration)) {
    verbose(`Keeping global local skill for ${migration.id} (migrated to project-plugin)`);
    return;
  }
  await deleteLocalSkill(projectDir, migration.id, migration.oldScope);
}
