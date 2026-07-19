import { expect } from "vitest";
import "../matchers/setup.js";

interface ScopeExpectation {
  skillIds: string[];
  agents: string[];
  copiedSkills?: string[];
}

interface DualScopeExpectation {
  global: ScopeExpectation;
  project: ScopeExpectation;
}

async function expectScopeInstallation(dir: string, expected: ScopeExpectation): Promise<void> {
  await expect({ dir }).toHaveConfig({
    skillIds: expected.skillIds,
    agents: expected.agents,
  });
  for (const agent of expected.agents) {
    await expect({ dir }).toHaveCompiledAgent(agent);
  }
  for (const skill of expected.copiedSkills ?? []) {
    await expect({ dir }).toHaveSkillCopied(skill);
  }
}

export async function expectDualScopeInstallation(
  globalHome: string,
  projectDir: string,
  expected: DualScopeExpectation,
): Promise<void> {
  await expectScopeInstallation(globalHome, expected.global);
  await expectScopeInstallation(projectDir, expected.project);
}
