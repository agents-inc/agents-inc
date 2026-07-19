/**
 * Pure content renderers for test file generation.
 * Single source of truth for all test content templates.
 */

export function renderSkillMd(id: string, description?: string, body?: string): string {
  const desc = description ?? `${id} skill`;
  const content = body ?? `# ${id}\n\n${desc}`;
  return `---
name: ${id}
description: ${desc}
---

${content}
`;
}

export function renderConfigTs(config: Record<string, unknown>): string {
  return `export default ${JSON.stringify(config, null, 2)};\n`;
}

export function renderAgentYaml(
  name: string,
  description?: string,
  options?: { title?: string; tools?: string[]; model?: string; permissionMode?: string },
): string {
  const desc = description ?? `Test ${name} agent`;
  const title = options?.title ?? `${name} Agent`;
  const tools = options?.tools ?? ["Read", "Write"];
  return [
    `id: ${name}`,
    `title: ${title}`,
    `description: ${desc}`,
    "tools:",
    ...tools.map((t) => `  - ${t}`),
    ...(options?.model ? [`model: ${options.model}`] : []),
    ...(options?.permissionMode ? [`permissionMode: ${options.permissionMode}`] : []),
  ].join("\n");
}

/**
 * Renders an installed agent markdown file with YAML frontmatter.
 * Used for `~/.claude/agents/<name>.md` or `<project>/.claude/agents/<name>.md`,
 * which is the format validated by `validateAgentFrontmatter`.
 */
export function renderAgentMd(
  name: string,
  description?: string,
  options?: { tools?: string[]; body?: string },
): string {
  const desc = description ?? `Test ${name} agent`;
  const tools = (options?.tools ?? ["Read", "Write"]).join(", ");
  const body = options?.body ?? `# ${name}\n\n${desc}`;
  return `---
name: ${name}
description: ${desc}
tools: ${tools}
---

${body}
`;
}

export interface SkillMetadataFields {
  custom?: boolean;
  domain?: string;
  author?: string;
  displayName?: string;
  category?: string;
  slug?: string;
  cliDescription?: string;
  usageGuidance?: string;
  contentHash: string;
  forkedFrom?: { skillId: string; contentHash: string; date: string };
}

/**
 * Renders a metadata.yaml for a test skill. Only the fields provided are
 * emitted, so fixtures keep control over which metadata keys exist.
 */
export function renderMetadataYaml(fields: SkillMetadataFields): string {
  const lines = [
    ...(fields.custom ? ["custom: true"] : []),
    ...(fields.domain ? [`domain: ${fields.domain}`] : []),
    `author: "${fields.author ?? "@test"}"`,
    ...(fields.displayName ? [`displayName: ${fields.displayName}`] : []),
    ...(fields.category ? [`category: ${fields.category}`] : []),
    ...(fields.slug ? [`slug: ${fields.slug}`] : []),
    ...(fields.cliDescription ? [`cliDescription: "${fields.cliDescription}"`] : []),
    ...(fields.usageGuidance ? [`usageGuidance: "${fields.usageGuidance}"`] : []),
    `contentHash: "${fields.contentHash}"`,
    ...(fields.forkedFrom
      ? [
          "forkedFrom:",
          `  skillId: ${fields.forkedFrom.skillId}`,
          `  contentHash: "${fields.forkedFrom.contentHash}"`,
          `  date: ${fields.forkedFrom.date}`,
        ]
      : []),
  ];
  return lines.join("\n") + "\n";
}

export function renderCategoriesTs(categories: Record<string, unknown>): string {
  return renderConfigTs(categories);
}

export function renderRulesTs(rules: Record<string, unknown>): string {
  return renderConfigTs(rules);
}
