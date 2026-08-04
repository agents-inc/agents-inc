import { expect } from "vitest";
import type { EjectInstallResult } from "../../installation/local-installer";

// --- Types ---

export interface ExpectedInstallResult {
  copiedSkillIds?: string[];
  compiledAgents?: string[];
  wasMerged?: boolean;
  configPathContains?: string;
}

// --- Functions ---

/** Verify installEject result shape in one call */
export function expectInstallResult(
  result: EjectInstallResult,
  expected: ExpectedInstallResult,
): void {
  if (expected.copiedSkillIds) {
    expect(result.copiedSkills.map((s) => s.skillId).sort()).toStrictEqual(
      [...expected.copiedSkillIds].sort(),
    );
  }
  if (expected.compiledAgents) {
    expect([...result.compiledAgents].sort()).toStrictEqual([...expected.compiledAgents].sort());
  }
  if (expected.wasMerged !== undefined) {
    expect(result.wasMerged).toBe(expected.wasMerged);
  }
  if (expected.configPathContains) {
    expect(result.configPath).toContain(expected.configPathContains);
  }
}
