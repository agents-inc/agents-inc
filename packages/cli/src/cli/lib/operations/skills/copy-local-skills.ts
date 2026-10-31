import path from "path";
import { resolveInstallPaths } from "../../installation/index.js";
import { copySkillsToLocalFlattened, type CopiedSkill } from "../../skills/index.js";
import { ensureDir, listDirectories, remove } from "../../../utils/fs.js";
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

/** Every skill folder at both scopes, as a full path. */
export async function skillFoldersAt(projectDir: string): Promise<ReadonlySet<string>> {
  const skillsDirs = [
    resolveInstallPaths(projectDir, "project").skillsDir,
    resolveInstallPaths(projectDir, "global").skillsDir,
  ];
  const folders = await Promise.all(skillsDirs.map(foldersIn));
  return new Set(folders.flat());
}

async function foldersIn(dir: string): Promise<string[]> {
  return (await listDirectories(dir)).map((name) => path.join(dir, name));
}

/** A folder already in `before` stays, whatever was written into it since. */
export async function removeSkillFoldersCreatedSince(
  before: ReadonlySet<string>,
  projectDir: string,
): Promise<ReadonlySet<string>> {
  const created = [...(await skillFoldersAt(projectDir))].filter((folder) => !before.has(folder));
  await Promise.all(created.map(remove));
  return new Set(created);
}
