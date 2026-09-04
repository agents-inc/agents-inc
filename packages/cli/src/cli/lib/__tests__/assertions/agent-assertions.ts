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

/**
 * Verify structural validity of compiled agent markdown.
 *
 * Every section is checked unconditionally. An `options` bag carrying `hasCorePrinciples` and
 * `hasMethodologies` sat here until 2026-08-23 and nothing could reach it: all eight call sites
 * pass two arguments, both flags defaulted to running their check, and so the opt-out existed only
 * as a signature promising a discrimination no caller made. Same shape as the `hasSkillActivation`
 * disjunction deleted beside it. A compiled agent that legitimately lacks one of these sections
 * needs its own named assertion, not a flag on this one.
 */
export function expectValidAgentMarkdown(content: string, agentName: string): void {
  expect(content).toMatch(/^---\n/);
  expect(content).toContain(`name: ${agentName}`);
  expect(content).toContain("description:");
  expect(content).toContain("<operating_principles>");
  expect(content).toContain("<system-reminder>");
}
