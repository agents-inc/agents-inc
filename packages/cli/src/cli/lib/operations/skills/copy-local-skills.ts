import os from "os";
import { resolveInstallPaths } from "../../installation/index.js";
import {
  copySkillsToLocalFlattened,
  deleteLocalSkill,
  type CopiedSkill,
} from "../../skills/index.js";
import { ensureDir } from "../../../utils/fs.js";
import { verbose } from "../../../utils/logger.js";
import { EJECT_SOURCE } from "../../../consts.js";
import type { SkillConfig } from "../../../types/config.js";
import type { SourceLoadResult } from "../../loading/source-loader.js";

export type SkillCopyResult = {
  projectCopied: CopiedSkill[];
  globalCopied: CopiedSkill[];
  totalCopied: number;
};

export type CopyLocalSkillsOptions = {
  /**
   * Before copying, delete any already-present local skill whose config names an
   * alternate (non-eject) source, so a stale ejected copy is replaced. Used by the
   * eject installer; init/edit leave it off.
   */
  deleteAlternateSourceSkills?: boolean;
};

/** Copies one scope's local skills into its skills directory, deleting stale eject copies first when requested. */
async function copyScopedLocalSkills(
  scopeSkills: SkillConfig[],
  baseDir: string,
  skillsDir: string,
  sourceResult: SourceLoadResult,
  deleteAlternateSource: boolean,
): Promise<CopiedSkill[]> {
  if (scopeSkills.length === 0) return [];

  await ensureDir(skillsDir);

  if (deleteAlternateSource) {
    for (const skill of scopeSkills) {
      if (skill.source !== EJECT_SOURCE) {
        verbose(`Using alternate source '${skill.source}' for ${skill.id}`);
        await deleteLocalSkill(baseDir, skill.id);
      }
    }
  }

  return copySkillsToLocalFlattened(
    scopeSkills.map((s) => s.id),
    skillsDir,
    sourceResult,
  );
}

/**
 * Copies local-source skills to their scope-appropriate directories.
 *
 * Splits skills by scope (project vs global), resolves install paths,
 * ensures directories exist, and copies from source. With
 * `deleteAlternateSourceSkills`, an already-present local copy of a skill now
 * sourced from a marketplace is removed before copying (eject installer).
 */
export async function copyLocalSkills(
  skills: SkillConfig[],
  projectDir: string,
  sourceResult: SourceLoadResult,
  options: CopyLocalSkillsOptions = {},
): Promise<SkillCopyResult> {
  const projectLocalSkills = skills.filter((s) => s.scope !== "global");
  const globalLocalSkills = skills.filter((s) => s.scope === "global");

  const projectPaths = resolveInstallPaths(projectDir, "project");
  const globalPaths = resolveInstallPaths(projectDir, "global");

  const deleteAlternateSource = options.deleteAlternateSourceSkills ?? false;

  const projectCopied = await copyScopedLocalSkills(
    projectLocalSkills,
    projectDir,
    projectPaths.skillsDir,
    sourceResult,
    deleteAlternateSource,
  );
  const globalCopied = await copyScopedLocalSkills(
    globalLocalSkills,
    os.homedir(),
    globalPaths.skillsDir,
    sourceResult,
    deleteAlternateSource,
  );

  return {
    projectCopied,
    globalCopied,
    totalCopied: projectCopied.length + globalCopied.length,
  };
}
