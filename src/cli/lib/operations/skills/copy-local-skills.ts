import { resolveInstallPaths } from "../../installation/index.js";
import { copySkillsToLocalFlattened, type CopiedSkill } from "../../skills/index.js";
import { ensureDir } from "../../../utils/fs.js";
import type { SkillConfig } from "../../../types/config.js";
import type { SourceLoadResult } from "../../loading/source-loader.js";

export type SkillCopyResult = {
  projectCopied: CopiedSkill[];
  globalCopied: CopiedSkill[];
  totalCopied: number;
};

/**
 * Copies local-source skills to their scope-appropriate directories.
 *
 * Splits skills by scope (project vs global), resolves install paths,
 * ensures directories exist, and copies from source.
 */
export async function copyLocalSkills(
  skills: SkillConfig[],
  projectDir: string,
  sourceResult: SourceLoadResult,
): Promise<SkillCopyResult> {
  const projectLocalSkills = skills.filter((s) => s.scope !== "global");
  const globalLocalSkills = skills.filter((s) => s.scope === "global");

  const projectPaths = resolveInstallPaths(projectDir, "project");
  const globalPaths = resolveInstallPaths(projectDir, "global");

  let projectCopied: CopiedSkill[] = [];
  if (projectLocalSkills.length > 0) {
    await ensureDir(projectPaths.skillsDir);
    projectCopied = await copySkillsToLocalFlattened(
      projectLocalSkills.map((s) => s.id),
      projectPaths.skillsDir,
      sourceResult,
    );
  }

  let globalCopied: CopiedSkill[] = [];
  if (globalLocalSkills.length > 0) {
    await ensureDir(globalPaths.skillsDir);
    globalCopied = await copySkillsToLocalFlattened(
      globalLocalSkills.map((s) => s.id),
      globalPaths.skillsDir,
      sourceResult,
    );
  }

  return {
    projectCopied,
    globalCopied,
    totalCopied: projectCopied.length + globalCopied.length,
  };
}
