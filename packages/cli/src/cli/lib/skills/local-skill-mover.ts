import path from "path";

import {
  copy,
  directoryExists,
  ensureDir,
  isPathWithin,
  remove,
  removeDirIfEmpty,
} from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { resolveInstallPaths } from "../installation/install-base-dir";
import type { SkillId, SkillScope } from "../../types";

/**
 * Validates a skill ID is safe for use in filesystem paths.
 * Blocks null bytes and path traversal sequences at runtime
 * since TypeScript template literal types don't prevent malformed data from YAML/JSON.
 */
function validateSkillId(skillId: SkillId): boolean {
  return !(
    skillId.length === 0 ||
    skillId.includes("\0") ||
    skillId.includes("..") ||
    skillId.includes("/") ||
    skillId.includes("\\")
  );
}

/**
 * Delete an ejected skill's directory at `<skillsDir>/<skill-id>/`, where `skillsDir` is the one the
 * installation at `projectDir` keeps ejected skills in at `scope` — `.claude/skills` on Claude,
 * `$CODEX_HOME/skills` or `<repo>/.agents/skills` on Codex.
 *
 * **Resolved per host, as the copy side resolves it** (`resolveInstallPaths(...).skillsDir`).
 * _Corrected 2026-09-26 (CLI-895):_ this joined Claude's `.claude/skills` to the base directory
 * whatever the host, so on Codex a switch to plugin mode and a deselected ejected skill both left
 * the copy where Codex reads skills — and Codex then read the skill twice.
 */
export async function deleteLocalSkill(
  projectDir: string,
  skillId: SkillId,
  scope: SkillScope = "project",
): Promise<void> {
  if (!validateSkillId(skillId)) {
    warn(`Invalid skill ID for deletion: '${skillId}'`);
    return;
  }

  const skillsDir = path.resolve(resolveInstallPaths(projectDir, scope).skillsDir);
  const skillPath = path.resolve(skillsDir, skillId);

  if (!isPathWithin(skillPath, skillsDir)) {
    warn(`Skill ID '${skillId}' resolves outside the skills directory.`);
    return;
  }

  try {
    await remove(skillPath);
  } catch {
    // Skill may not exist — silently ignore
  }

  // The skills directory only — the host's directory above it stays whatever happens here.
  // Removing that one is uninstall's decision, not the edit path's.
  await removeDirIfEmpty(skillsDir);

  verbose(`Deleted local skill '${skillId}'`);
}

/**
 * Migrate a local skill's files between project and global directories.
 * Used when a skill's scope changes during edit (e.g., [P] → [G] or [G] → [P]).
 *
 * Copies the skill directory to the new location.
 * For P→G, removes the old project copy. For G→P (override model), the global copy stays untouched.
 * No-op if the source directory doesn't exist (skill may be plugin-mode).
 */
export async function migrateLocalSkillScope(
  skillId: SkillId,
  fromScope: SkillScope,
  projectDir: string,
): Promise<void> {
  if (!validateSkillId(skillId)) {
    warn(`Invalid skill ID for scope migration: '${skillId}'`);
    return;
  }

  const toScope: SkillScope = fromScope === "global" ? "project" : "global";
  // Each scope's skills directory as its host keeps it — see `deleteLocalSkill` (CLI-895). It
  // resolves `os.homedir()` at call time, so test home-dir mocks apply.
  const fromSkillsDir = path.resolve(resolveInstallPaths(projectDir, fromScope).skillsDir);
  const toSkillsDir = path.resolve(resolveInstallPaths(projectDir, toScope).skillsDir);

  const fromPath = path.resolve(fromSkillsDir, skillId);
  const toPath = path.resolve(toSkillsDir, skillId);

  if (!isPathWithin(fromPath, fromSkillsDir)) {
    warn(`Skill ID '${skillId}' resolves outside the source skills directory.`);
    return;
  }
  if (!isPathWithin(toPath, toSkillsDir)) {
    warn(`Skill ID '${skillId}' resolves outside the destination skills directory.`);
    return;
  }

  if (!(await directoryExists(fromPath))) {
    if (await directoryExists(toPath)) {
      verbose(`Skill '${skillId}' already at ${toScope} scope — no migration needed`);
      return;
    }
    warn(`Could not migrate skill '${skillId}' — not found at either scope`);
    return;
  }

  await ensureDir(toSkillsDir);
  await copy(fromPath, toPath);

  // G→P is an override — the global copy stays untouched; the project copy overrides it.
  // Only P→G should delete the old directory.
  if (fromScope === "project") {
    await remove(fromPath);
  }

  verbose(`Migrated skill '${skillId}' from ${fromScope} to ${toScope}`);
}

/**
 * Moves a project's ejected copy of a skill into the global install, in place of the global copy
 * it masked: what `s` does to a `[P][G]` pair whose halves are both Local. Every project reads the
 * global copy, so the project's edits reach them all.
 *
 * The global copy is removed first rather than copied over, because a copy merges into what is
 * there: a file the project's copy deleted would survive in the global install.
 */
export async function foldLocalSkillIntoGlobal(
  projectDir: string,
  skillId: SkillId,
): Promise<void> {
  await deleteLocalSkill(projectDir, skillId, "global");
  await migrateLocalSkillScope(skillId, "project", projectDir);
}
