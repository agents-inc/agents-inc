import { mkdir } from "fs/promises";
import path from "path";
import { expect } from "vitest";
import {
  createPermissionsFile,
  createTempDir,
  readInstallTree,
  type InstallTree,
} from "../helpers/test-utils.js";
import { loadInstalledConfig } from "../../src/cli/lib/configuration/project-config.js";
import { activeAgentNames } from "../../src/cli/lib/configuration/scope-predicates.js";
import type { AgentName, AgentScopeConfig, SkillConfig } from "../../src/cli/types/index.js";

export type DualScopeEnv = {
  fakeHome: string;
  projectDir: string;
  destroy: () => Promise<void>;
};

// Sorted by scope, then excluded flag, so assertions are order-independent.
export async function readSkillEntries(
  projectDir: string,
  skillId: string,
): Promise<SkillConfig[]> {
  const loaded = await loadInstalledConfig(projectDir);
  expect(loaded, `project config.ts must exist at ${projectDir}`).not.toBeNull();
  if (!loaded) return [];
  return loaded.config.skills
    .filter((sc) => sc.id === skillId)
    .sort((a, b) => scopeOrderKey(a).localeCompare(scopeOrderKey(b)));
}

function scopeOrderKey(entry: SkillConfig): string {
  return `${entry.scope}${entry.excluded ? "-excluded" : ""}`;
}

export async function readAgentEntries(dir: string): Promise<AgentScopeConfig[]> {
  const loaded = await loadInstalledConfig(dir);
  expect(loaded, `config.ts must exist at ${dir}`).not.toBeNull();
  return loaded ? loaded.config.agents : [];
}

export async function readActiveAgentNames(dir: string): Promise<AgentName[]> {
  const loaded = await loadInstalledConfig(dir);
  expect(loaded, `config.ts must exist at ${dir}`).not.toBeNull();
  return activeAgentNames(loaded?.config.agents ?? []);
}

export async function readAllSkillEntries(dir: string): Promise<SkillConfig[]> {
  const loaded = await loadInstalledConfig(dir);
  expect(loaded, `config.ts must exist at ${dir}`).not.toBeNull();
  return loaded ? loaded.config.skills : [];
}

export async function readConfigSkillIds(dir: string): Promise<string[]> {
  return (await readAllSkillEntries(dir)).map((sc) => sc.id);
}

export type TestEnvironment = {
  tempDir: string;
  fakeHome: string;
  projectDir: string;
};

// `projectDir` sits inside `fakeHome`; `permissions: false` skips both settings.json files.
export async function createTestEnvironment(options?: {
  permissions?: boolean;
}): Promise<TestEnvironment> {
  const tempDir = await createTempDir();
  const fakeHome = path.join(tempDir, "fake-home");
  const projectDir = path.join(fakeHome, "project");

  await mkdir(fakeHome, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  if (options?.permissions !== false) {
    await createPermissionsFile(fakeHome);
    await createPermissionsFile(projectDir);
  }

  return { tempDir, fakeHome, projectDir };
}

/** Files and empty folders, so a folder a run made and left empty is seen. */
export type HomeAndProjectTrees = { home: InstallTree; project: InstallTree };

// The home's tree leaves the project, which sits inside it, to the project's.
export async function homeAndProjectTrees(
  environment: TestEnvironment,
): Promise<HomeAndProjectTrees> {
  return {
    home: await readInstallTree(environment.fakeHome, {
      skip: [path.relative(environment.fakeHome, environment.projectDir)],
    }),
    project: await readInstallTree(environment.projectDir),
  };
}
