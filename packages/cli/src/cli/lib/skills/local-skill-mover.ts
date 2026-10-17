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

/** Runtime check: template literal types do not stop malformed ids arriving from YAML/JSON. */
function validateSkillId(skillId: SkillId): boolean {
  return !(
    skillId.length === 0 ||
    skillId.includes("\0") ||
    skillId.includes("..") ||
    skillId.includes("/") ||
    skillId.includes("\\")
  );
}

/** Deletes `<skillsDir>/<skill-id>/`, with `skillsDir` resolved per host as the copy side does. */
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

  // The host's directory above stays: removing it is uninstall's decision.
  await removeDirIfEmpty(skillsDir);

  verbose(`Deleted local skill '${skillId}'`);
}

/** P→G removes the project copy; G→P overrides, keeping the global one. No-op when absent. */
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
  // Resolves `os.homedir()` at call time, so test home-dir mocks apply.
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

  if (fromScope === "project") {
    await remove(fromPath);
  }

  verbose(`Migrated skill '${skillId}' from ${fromScope} to ${toScope}`);
}
