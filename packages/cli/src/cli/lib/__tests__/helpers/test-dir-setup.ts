import path from "path";
import { mkdir } from "fs/promises";
import { CLAUDE_DIR, PLUGINS_SUBDIR, DEFAULT_PLUGIN_NAME, STANDARD_DIRS } from "../../../consts";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";

export interface PluginTestDirs {
  tempDir: string;
  projectDir: string;
  pluginDir: string;
  skillsDir: string;
  agentsDir: string;
}

export async function createTestDirs(prefix = "ai-test-"): Promise<PluginTestDirs> {
  const tempDir = await createTempDir(prefix);
  const projectDir = path.join(tempDir, "project");
  const pluginDir = path.join(projectDir, CLAUDE_DIR, PLUGINS_SUBDIR, DEFAULT_PLUGIN_NAME);
  const skillsDir = path.join(pluginDir, STANDARD_DIRS.SKILLS);
  const agentsDir = path.join(pluginDir, "agents");

  await mkdir(skillsDir, { recursive: true });
  await mkdir(agentsDir, { recursive: true });

  return { tempDir, projectDir, pluginDir, skillsDir, agentsDir };
}

export async function cleanupTestDirs(dirs: PluginTestDirs): Promise<void> {
  await cleanupTempDir(dirs.tempDir);
}
