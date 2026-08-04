import os from "os";
import path from "path";
import type { SkillScope } from "../../../types/config.js";
import { fileExists, listDirectories } from "../../../utils/fs.js";
import { isHomeDirectory } from "../../installation/is-home-directory.js";
import { LOCAL_SKILLS_PATH } from "../../../consts.js";

export type ScopedSkillDir = {
  dirName: string;
  localSkillsPath: string;
  scope: SkillScope;
};

export type ScopedSkillDirsResult = {
  dirs: ScopedSkillDir[];
  hasProject: boolean;
  hasGlobal: boolean;
  projectLocalPath: string;
  globalLocalPath: string;
};

/**
 * Collects local skill directories from both project and global scopes.
 * Project-scoped dirs take precedence over global on name conflict.
 *
 * @returns directories with scope annotations, plus path/existence metadata
 */
export async function collectScopedSkillDirs(projectDir: string): Promise<ScopedSkillDirsResult> {
  const homeDir = os.homedir();
  const projectLocalPath = path.join(projectDir, LOCAL_SKILLS_PATH);
  const globalLocalPath = path.join(homeDir, LOCAL_SKILLS_PATH);
  const hasProject = await fileExists(projectLocalPath);
  const hasGlobal = !isHomeDirectory(projectDir) && (await fileExists(globalLocalPath));

  const dirs: ScopedSkillDir[] = [];

  if (hasProject) {
    for (const dirName of await listDirectories(projectLocalPath)) {
      dirs.push({ dirName, localSkillsPath: projectLocalPath, scope: "project" });
    }
  }

  if (hasGlobal) {
    const projectDirNames = new Set(dirs.map((d) => d.dirName));
    for (const dirName of await listDirectories(globalLocalPath)) {
      if (!projectDirNames.has(dirName)) {
        dirs.push({ dirName, localSkillsPath: globalLocalPath, scope: "global" });
      }
    }
  }

  return { dirs, hasProject, hasGlobal, projectLocalPath, globalLocalPath };
}
