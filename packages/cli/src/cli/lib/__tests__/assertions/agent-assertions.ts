import { expect } from "vitest";

import { parseCompiledAgentSections } from "../helpers/compiled-agent-sections.js";

/**
 * Verify preloaded vs dynamic skill placement in compiled agent output.
 *
 * The reading is {@link parseCompiledAgentSections}'s rather than this module's own, because a
 * compiled agent is not the shape a mirror template renders: its prose is separated by `---`
 * rules, and its activation protocol demonstrates the very call the dynamic skills are named by.
 * A reader that splits on the first and scans for the second answers a truncated body and a
 * placeholder skill — both invisible under a fixture written by whoever wrote the assertion.
 */
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

/** Verify structural validity of compiled agent markdown */
export function expectValidAgentMarkdown(
  content: string,
  agentName: string,
  options?: {
    hasCorePrinciples?: boolean;
    hasMethodologies?: boolean;
  },
): void {
  expect(content).toMatch(/^---\n/);
  expect(content).toContain(`name: ${agentName}`);
  expect(content).toContain("description:");

  if (options?.hasCorePrinciples !== false) {
    expect(content).toContain("<core_principles>");
  }
  if (options?.hasMethodologies !== false) {
    expect(content).toContain("<methodologies>");
  }
}

/** Verify compiled agent name list (order-independent) */
export function expectCompiledAgents(
  result: { compiledAgents: string[] },
  expected: string[],
): void {
  expect([...result.compiledAgents].sort()).toStrictEqual([...expected].sort());
}
