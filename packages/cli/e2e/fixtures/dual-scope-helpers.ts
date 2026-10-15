import { mkdir } from "fs/promises";
import path from "path";
import { expect } from "vitest";
import { createPermissionsFile, createTempDir } from "../helpers/test-utils.js";
import { loadInstalledConfig } from "../../src/cli/lib/configuration/project-config.js";
import { activeAgentNames } from "../../src/cli/lib/configuration/scope-predicates.js";
import type { AgentName, AgentScopeConfig, SkillConfig } from "../../src/cli/types/index.js";

export type DualScopeEnv = {
  fakeHome: string;
  projectDir: string;
  destroy: () => Promise<void>;
};

/**
 * Read a skill's SkillConfig entries from the project's config.ts via a
 * structural load, sorted deterministically (scope, then excluded flag) so
 * assertions are order-independent.
 */
export async function readSkillEntries(
  projectDir: string,
  skillId: string,
): Promise<SkillConfig[]> {
  const loaded = await loadInstalledConfig(projectDir);
  expect(loaded, `project config.ts must exist at ${projectDir}`).not.toBeNull();
  if (!loaded) return [];
  return loaded.config.skills
    .filter((sc) => sc.id === skillId)
    .sort((a, b) => {
      const aKey = `${a.scope}${a.excluded ? "-excluded" : ""}`;
      const bKey = `${b.scope}${b.excluded ? "-excluded" : ""}`;
      return aKey.localeCompare(bKey);
    });
}

/** Load a scope's config.ts structurally and return its agents array. */
export async function readAgentEntries(dir: string): Promise<AgentScopeConfig[]> {
  const loaded = await loadInstalledConfig(dir);
  expect(loaded, `config.ts must exist at ${dir}`).not.toBeNull();
  return loaded ? loaded.config.agents : [];
}

/** Load a scope's config.ts structurally and return the names of its active agents. */
export async function readActiveAgentNames(dir: string): Promise<AgentName[]> {
  const loaded = await loadInstalledConfig(dir);
  expect(loaded, `config.ts must exist at ${dir}`).not.toBeNull();
  return activeAgentNames(loaded?.config.agents ?? []);
}

/** Load a scope's config.ts structurally and return its full skills array. */
export async function readAllSkillEntries(dir: string): Promise<SkillConfig[]> {
  const loaded = await loadInstalledConfig(dir);
  expect(loaded, `config.ts must exist at ${dir}`).not.toBeNull();
  return loaded ? loaded.config.skills : [];
}

/** Load a scope's config.ts structurally and return the ids in its skills array. */
export async function readConfigSkillIds(dir: string): Promise<string[]> {
  return (await readAllSkillEntries(dir)).map((sc) => sc.id);
}

/** The temp directory triple a dual-scope test runs against. */
export type TestEnvironment = {
  tempDir: string;
  fakeHome: string;
  projectDir: string;
};

/**
 * Creates the temp directory structure for a dual-scope test.
 *
 *   tempDir/
 *     fake-home/
 *       .claude/settings.json
 *       project/
 *         .claude/settings.json
 *
 * `permissions` (default true) writes the two `.claude/settings.json`
 * permission files. Pass `false` for flows that must start with no
 * `.claude` directory at either scope — the only on-disk difference is the
 * presence of those two settings.json files (and the `.claude` dirs holding
 * them).
 */
export async function createTestEnvironment(options?: {
  permissions?: boolean;
}): Promise<TestEnvironment> {
  const tempDir = await createTempDir();
  const fakeHome = path.join(tempDir, "fake-home");
  const projectDir = path.join(fakeHome, "project");

  await mkdir(fakeHome, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  // Create permissions files to prevent permission prompt hang
  if (options?.permissions !== false) {
    await createPermissionsFile(fakeHome);
    await createPermissionsFile(projectDir);
  }

  return { tempDir, fakeHome, projectDir };
}
