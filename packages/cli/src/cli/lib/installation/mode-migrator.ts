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

/**
 * What the plugin→eject half copied, in the shape {@link PluginInstallResult} reports the
 * opposite direction, so one command surface reports both and neither can drift into a
 * private idea of what a failure looks like.
 *
 * A non-empty `failed` means this run could NOT honor the user's eject intent for those
 * skills, so the caller MUST hard-error before writing any config — otherwise config.ts
 * records `origin: "eject"` for a skill that has no local copy. The asymmetry this
 * replaces is what let that ship: the plugin half returned its failures structurally
 * while the eject half turned them into a warning string nobody could act on.
 */
export type EjectCopyResult = {
  copied: SkillId[];
  failed: Array<{ id: SkillId; error: string }>;
};

export type MigrationResult = {
  ejectCopies: EjectCopyResult;
  /**
   * What the eject→plugin half installed, in the shape a fresh install returns, so
   * one command surface reports both. The refs are built here because this is where
   * each migration's own scope and marketplace are already resolved.
   *
   * A non-empty `failed` means this run could NOT honor the user's plugin intent for
   * those skills, so the caller MUST hard-error before writing any config — otherwise
   * config.ts records a marketplace `origin` for a skill that has no plugin
   * registration.
   */
  pluginInstalls: PluginInstallResult;
  warnings: string[];
};

/**
 * Hard-error message for failed eject copies — the twin of `pluginInstallFailureError` in
 * `operations/skills/install-plugin-skills.ts`, worded from the same rule: an install intent
 * this run could not honor must stop the run BEFORE any config records it.
 */
export function ejectCopyFailureError(failedCount: number): string {
  return `Failed to copy ${failedCount} skill(s) for eject. Eject intent could not be honored. Check that the destination skills directory is writable, then run '${CLI_INVOKE_COMMAND} edit' again — or switch the affected skills back to plugin mode.`;
}

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
      oldSource: oldSkill.origin,
      newSource: newSkill.origin,
      oldScope: oldSkill.scope,
      newScope: newSkill.scope,
    };

    const wasEject = oldSkill.origin === EJECT_SOURCE;
    const isEject = newSkill.origin === EJECT_SOURCE;

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
  const pluginInstalls: PluginInstallResult = { installed: [], failed: [] };

  const ejectCopies = await copyMigratedSkillsToLocal(plan.toEject, projectDir, sourceResult);
  // Only the skills whose copy LANDED, which is the toPlugin rule below read the other way
  // round. Dropping the plugin registration of a skill that has no local copy would leave it
  // installed nowhere, so a working install must survive a failed migration exactly as the
  // ejected working copy survives a failed plugin install.
  const warnings = await uninstallMigratedPlugins(
    migrationsWhoseCopyLanded(plan.toEject, ejectCopies),
    projectDir,
    sourceResult,
  );

  // Migrate skills from eject to plugin
  if (plan.toPlugin.length > 0) {
    // Plugin install intent is inviolable: without a marketplace NO migration in
    // this list can be installed, so fail before anything is deleted. Deleting
    // first and downgrading to a warning destroys the user's editable working
    // copy and leaves config entries claiming a plugin that was never installed.
    if (!sourceResult.marketplace) {
      throw new Error(
        `Cannot install skills as plugins: marketplace could not be resolved from ` +
          `'${sourceResult.sourceConfig.source}'. Plugin install mode requires a marketplace — ` +
          `fix the marketplace or switch the affected skills to eject mode.`,
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

  return { ejectCopies, pluginInstalls, warnings };
}

/**
 * Writes the local copy each newly-ejected skill becomes, and names every one it could not
 * write.
 *
 * The mirror of the toPlugin loop in {@link executeMigration}, and per-skill for the same
 * reasons. Each migration resolves its OWN destination from its own scope, so the two scopes
 * are independent by construction rather than by pass ordering — a refused write under $HOME
 * says nothing about the project tree, and one batched `try` around both once let a single
 * project-scope failure cancel every global copy behind one warning line.
 *
 * Failures are COLLECTED rather than aborted on. The caller hard-errors on any of them before
 * writing config, so stopping at the first buys no safety and costs the user the rest of the
 * list — they would learn about the second unwritable destination only by fixing the first and
 * running again. That is the reasoning `copyEachSkill` already gives for reporting its own
 * failures by id rather than throwing on the first.
 */
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

/** The migrations that now have a local copy on disk, and so no longer need their plugin. */
function migrationsWhoseCopyLanded(
  migrations: SkillMigration[],
  copies: EjectCopyResult,
): SkillMigration[] {
  const landed = new Set(copies.copied);
  return migrations.filter((migration) => landed.has(migration.id));
}

/**
 * True when a migration must LEAVE the plugin registered: a skill moving from the global
 * install to a project-local copy keeps the global plugin for every other project, and this
 * project's config tombstone (`excluded: true`) is what keeps this project off it.
 */
function keepsGlobalPluginRegistration(migration: SkillMigration): boolean {
  return migration.oldScope === "global" && migration.newScope === "project";
}

/**
 * Drops the plugin registration each newly-ejected skill no longer needs, and names every one
 * it could not drop.
 *
 * Diagnostic-only: the local copy IS the install now, so a stale registration is untidy rather
 * than wrong and must not fail the migration. What it must not do is borrow the copy pass's
 * words — this loop lived inside the copy's `try`, so a `claude plugin uninstall` that threw
 * was reported to the user as `Could not copy skills for eject`, naming work that had in fact
 * succeeded one line above the count proving it.
 */
async function uninstallMigratedPlugins(
  migrations: SkillMigration[],
  projectDir: string,
  sourceResult: SourceLoadResult,
): Promise<string[]> {
  const warnings: string[] = [];

  for (const migration of migrations) {
    if (keepsGlobalPluginRegistration(migration)) {
      verbose(`Keeping global plugin for ${migration.id} (migrated to project-eject)`);
      continue;
    }
    if (!sourceResult.marketplace) {
      warnings.push(`Could not uninstall plugin for ${migration.id}: no marketplace configured`);
      continue;
    }

    // Scope-precise uninstall keyed to this migration's own scope. A best-effort
    // both-scopes sweep would also drop a same-id plugin registered at the OTHER Claude
    // scope (e.g. a project→eject switch uninstalling the still-needed global/user-scope
    // plugin). The registered scope is unambiguous here, so target it exactly.
    // claudePluginUninstall still swallows "not installed" / "not found".
    const pluginScope = toClaudePluginScope(migration.oldScope);
    const pluginRef = buildMarketplacePluginRef(migration.id, sourceResult.marketplace);
    try {
      await claudePluginUninstall(pluginRef, pluginScope, projectDir);
    } catch (error) {
      warnings.push(`Could not uninstall plugin for ${migration.id}: ${getErrorMessage(error)}`);
      continue;
    }
    verbose(`Uninstalled plugin for ${migration.id}`);
  }

  return warnings;
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
