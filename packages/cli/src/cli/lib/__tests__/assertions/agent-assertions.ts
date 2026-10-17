import { expect } from "vitest";

import { parseCompiledAgentSections } from "../helpers/compiled-agent-sections.js";

/** Verify preloaded vs dynamic skill placement in compiled agent output. */
export function expectAgentCompilation(
  content: string,
  expectations: {
    name?: string;
    preloadedSkills?: string[];
    dynamicSkills?: string[];
    noPreloadedSkills?: string[];
    noDynamicSkills?: string[];
  },
): void {
  const { frontmatter, preloadedRefs, dynamicEntries } = parseCompiledAgentSections(content);
  const dynamicSkillIds = dynamicEntries.map((entry) => entry.id);

  if (expectations.name) {
    expect(frontmatter?.name).toBe(expectations.name);
  }
  if (expectations.preloadedSkills) {
    expect([...preloadedRefs].sort()).toStrictEqual([...expectations.preloadedSkills].sort());
  }
  if (expectations.dynamicSkills) {
    expect([...dynamicSkillIds].sort()).toStrictEqual([...expectations.dynamicSkills].sort());
  }
  if (expectations.noPreloadedSkills) {
    for (const id of expectations.noPreloadedSkills) {
      expect(preloadedRefs).not.toContain(id);
    }
  }
  if (expectations.noDynamicSkills) {
    for (const id of expectations.noDynamicSkills) {
      expect(dynamicSkillIds).not.toContain(id);
    }
  }
}

export function expectValidAgentMarkdown(content: string, agentName: string): void {
  expect(content).toMatch(/^---\n/);
  expect(content).toContain(`name: ${agentName}`);
  expect(content).toContain("description:");
  expect(content).toContain("<operating_principles>");
  expect(content).toContain("<system-reminder>");
}
