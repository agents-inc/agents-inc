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

async function copyScopedLocalSkills(
  scopeSkills: SkillConfig[],
  skillsDir: string,
  sourceResult: SourceLoadResult,
): Promise<CopiedSkill[]> {
  if (scopeSkills.length === 0) return [];

  await ensureDir(skillsDir);

  return copySkillsToLocalFlattened(
    scopeSkills.map((s) => s.id),
    skillsDir,
    sourceResult,
  );
}

export async function copyLocalSkills(
  skills: SkillConfig[],
  projectDir: string,
  sourceResult: SourceLoadResult,
): Promise<SkillCopyResult> {
  const projectLocalSkills = skills.filter((s) => s.scope !== "global");
  const globalLocalSkills = skills.filter((s) => s.scope === "global");

  const projectPaths = resolveInstallPaths(projectDir, "project");
  const globalPaths = resolveInstallPaths(projectDir, "global");

  const projectCopied = await copyScopedLocalSkills(
    projectLocalSkills,
    projectPaths.skillsDir,
    sourceResult,
  );
  const globalCopied = await copyScopedLocalSkills(
    globalLocalSkills,
    globalPaths.skillsDir,
    sourceResult,
  );

  return {
    projectCopied,
    globalCopied,
    totalCopied: projectCopied.length + globalCopied.length,
  };
}
