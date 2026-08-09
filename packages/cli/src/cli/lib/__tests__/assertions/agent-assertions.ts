import { expect } from "vitest";
import { parse as parseYaml } from "yaml";

export interface ParsedAgentOutput {
  raw: string;
  frontmatter: Record<string, unknown>;
  body: string;
  preloadedSkillIds: string[];
  dynamicSkillIds: string[];
}

/**
 * Parses compiled-agent frontmatter with the real YAML parser. Compiled agents
 * are consumed by Claude Code itself, so their frontmatter is guaranteed valid
 * YAML; unparseable or non-object frontmatter degrades to an empty record.
 */
function parseFrontmatterYaml(yaml: string): Record<string, unknown> {
  try {
    const parsed: unknown = parseYaml(yaml);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Parse compiled agent content into structured frontmatter + body sections */
export function parseCompiledAgent(content: string): ParsedAgentOutput {
  const [, frontmatterYaml] = content.match(/^---\n([\s\S]*?)\n---/) ?? [];
  const frontmatter = frontmatterYaml === undefined ? {} : parseFrontmatterYaml(frontmatterYaml);
  const body = content.split(/^---\n[\s\S]*?\n---\n/m)[1] ?? content;

  const preloadedSkillIds = Array.isArray(frontmatter.skills) ? frontmatter.skills.map(String) : [];
  const dynamicSkillIds = [...body.matchAll(/skill:\s*"([^"]+)"/g)].flatMap(([, id]) =>
    id === undefined ? [] : [id],
  );

  return { raw: content, frontmatter, body, preloadedSkillIds, dynamicSkillIds };
}

/** Verify preloaded vs dynamic skill placement in compiled agent output */
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
  const parsed = parseCompiledAgent(content);

  if (expectations.name) {
    expect(parsed.frontmatter.name).toBe(expectations.name);
  }
  if (expectations.preloadedSkills) {
    expect(parsed.preloadedSkillIds.sort()).toStrictEqual([...expectations.preloadedSkills].sort());
  }
  if (expectations.dynamicSkills) {
    expect(parsed.dynamicSkillIds.sort()).toStrictEqual([...expectations.dynamicSkills].sort());
  }
  if (expectations.noPreloadedSkills) {
    for (const id of expectations.noPreloadedSkills) {
      expect(parsed.preloadedSkillIds).not.toContain(id);
    }
  }
  if (expectations.noDynamicSkills) {
    for (const id of expectations.noDynamicSkills) {
      expect(parsed.dynamicSkillIds).not.toContain(id);
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
    hasSkillActivation?: boolean;
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
  if (options?.hasSkillActivation) {
    const hasProtocol = content.includes("<skill_activation_protocol>");
    const hasNote = content.includes("<skills_note>");
    expect(hasProtocol || hasNote).toBe(true);
  }
}

/** Verify compiled agent name list (order-independent) */
export function expectCompiledAgents(
  result: { compiledAgents: string[] },
  expected: string[],
): void {
  expect([...result.compiledAgents].sort()).toStrictEqual([...expected].sort());
}
