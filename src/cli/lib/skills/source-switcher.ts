import path from "path";

import { copy, directoryExists, ensureDir, isPathWithin, remove } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { GLOBAL_INSTALL_ROOT, LOCAL_SKILLS_PATH } from "../../consts";
import type { SkillId } from "../../types";

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
 * Delete a local skill directory at .claude/skills/{skill-id}/
 */
export async function deleteLocalSkill(projectDir: string, skillId: SkillId): Promise<void> {
  if (!validateSkillId(skillId)) {
    warn(`Invalid skill ID for deletion: '${skillId}'`);
    return;
  }

  const skillPath = path.resolve(path.join(projectDir, LOCAL_SKILLS_PATH, skillId));
  const skillsDir = path.resolve(path.join(projectDir, LOCAL_SKILLS_PATH));

  if (!isPathWithin(skillPath, skillsDir)) {
    warn(`Skill ID '${skillId}' resolves outside the skills directory.`);
    return;
  }

  try {
    await remove(skillPath);
  } catch {
    // Skill may not exist — silently ignore
  }

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
  fromScope: "project" | "global",
  projectDir: string,
): Promise<void> {
  if (!validateSkillId(skillId)) {
    warn(`Invalid skill ID for scope migration: '${skillId}'`);
    return;
  }

  const fromBaseDir = fromScope === "global" ? GLOBAL_INSTALL_ROOT : projectDir;
  const toBaseDir = fromScope === "global" ? projectDir : GLOBAL_INSTALL_ROOT;

  const fromPath = path.resolve(path.join(fromBaseDir, LOCAL_SKILLS_PATH, skillId));
  const toPath = path.resolve(path.join(toBaseDir, LOCAL_SKILLS_PATH, skillId));

  const fromSkillsDir = path.resolve(path.join(fromBaseDir, LOCAL_SKILLS_PATH));
  const toSkillsDir = path.resolve(path.join(toBaseDir, LOCAL_SKILLS_PATH));

  if (!isPathWithin(fromPath, fromSkillsDir)) {
    warn(`Skill ID '${skillId}' resolves outside the source skills directory.`);
    return;
  }
  if (!isPathWithin(toPath, toSkillsDir)) {
    warn(`Skill ID '${skillId}' resolves outside the destination skills directory.`);
    return;
  }

  const toScope = fromScope === "global" ? "project" : "global";

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
