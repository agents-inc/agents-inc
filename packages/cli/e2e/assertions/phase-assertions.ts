import { expect } from "vitest";
import { EXIT_CODES } from "../pages/constants.js";
import "../matchers/setup.js";

/** Verify a wizard/command phase completed successfully with expected state */
export async function expectPhaseSuccess(
  result: { project: { dir: string }; exitCode: number | Promise<number> },
  expectations: {
    skillIds?: readonly string[];
    agents?: readonly string[];
    marketplace?: string;
    origin?: string;
    compiledAgents?: readonly string[];
    copiedSkills?: readonly string[];
    noLocalSkills?: boolean;
  },
): Promise<void> {
  expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

  if (
    expectations.skillIds ||
    expectations.agents ||
    expectations.marketplace !== undefined ||
    expectations.origin !== undefined
  ) {
    await expect(result.project).toHaveConfig({
      ...(expectations.skillIds !== undefined && { skillIds: expectations.skillIds }),
      ...(expectations.agents !== undefined && { agents: expectations.agents }),
      ...(expectations.marketplace !== undefined && { marketplace: expectations.marketplace }),
      ...(expectations.origin !== undefined && { origin: expectations.origin }),
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
