import { expect } from "vitest";
import { EXIT_CODES } from "../pages/constants.js";
import "../matchers/setup.js";

/** Verify a wizard/command phase completed successfully with expected state */
export async function expectPhaseSuccess(
  result: { project: { dir: string }; exitCode: number | Promise<number> },
  expectations: {
    skillIds?: readonly string[];
    agents?: readonly string[];
    source?: string;
    compiledAgents?: readonly string[];
    copiedSkills?: readonly string[];
    noLocalSkills?: boolean;
  },
): Promise<void> {
  expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

  if (expectations.skillIds || expectations.agents || expectations.source) {
    await expect(result.project).toHaveConfig({
      skillIds: expectations.skillIds,
      agents: expectations.agents,
      source: expectations.source,
    });
  }
  for (const agent of expectations.compiledAgents ?? expectations.agents ?? []) {
    await expect(result.project).toHaveCompiledAgent(agent);
  }
  for (const skill of expectations.copiedSkills ?? []) {
    await expect(result.project).toHaveSkillCopied(skill);
  }
  if (expectations.noLocalSkills) {
    await expect(result.project).toHaveNoLocalSkills();
  }
}

/** Verify complete installation state (config + agents + skills) in one call */
export async function expectFullInstallation(
  project: { dir: string },
  expectations: {
    skillIds: readonly string[];
    agents: readonly string[];
    source?: string;
    verifyAgentContent?: boolean;
    verifySkillsCopied?: boolean;
  },
): Promise<void> {
  await expect(project).toHaveConfig({
    skillIds: expectations.skillIds,
    agents: expectations.agents,
    source: expectations.source,
  });
  for (const agent of expectations.agents) {
    await expect(project).toHaveCompiledAgent(agent);
    if (expectations.verifyAgentContent) {
      await expect(project).toHaveCompiledAgentContent(agent, {
        contains: [`name: ${agent}`],
      });
    }
  }
  if (expectations.verifySkillsCopied) {
    for (const skill of expectations.skillIds) {
      await expect(project).toHaveSkillCopied(skill);
    }
  }
}
