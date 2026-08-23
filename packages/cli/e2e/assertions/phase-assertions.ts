import { expect } from "vitest";
import { EXIT_CODES, type WizardType } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * Verify an aborted wizard session exited as CANCELLED.
 *
 * Called from inside `InitWizard.abortAndDestroy` / `EditWizard.abortAndDestroy`
 * rather than from the 35 sites that abort, because only 5 of those ever captured
 * the exit code at all and only 2 pinned this value — the rest ran the abort and
 * checked nothing about it. There is no SIGINT handler anywhere in the product:
 * Ink resolves its render on Ctrl+C and the command then sets the code itself, so
 * every aborted session owes exactly this one. `SUCCESS` would mean the abort was
 * recorded as a completed run, and 130 would mean the signal killed the process
 * before the command could set anything.
 *
 * The message names the wizard because this fires during TEARDOWN, where the
 * failure it reports may not be the failure worth reading: `getScopeBadgesForSkill`
 * in `fixtures/dual-scope-helpers.ts` aborts inside a `finally`, so a throw here
 * replaces whatever the `try` was already failing on.
 */
export function expectCancelledExit(exitCode: number, wizard: WizardType): void {
  expect(
    exitCode,
    `the ${wizard} wizard's Ctrl+C abort must exit CANCELLED (${EXIT_CODES.CANCELLED}), ` +
      `got ${exitCode} — raised by abortAndDestroy during teardown, so if this call sits ` +
      `in a finally or an afterAll, look for a failure it may have replaced`,
  ).toBe(EXIT_CODES.CANCELLED);
}

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
