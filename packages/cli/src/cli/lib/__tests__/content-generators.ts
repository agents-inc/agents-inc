import { omit } from "remeda";
import type { z } from "zod";
import type { skillRulesFileSchema } from "../schemas";

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
  options?: {
    title?: string;
    tools?: string[];
    model?: string;
    effort?: string;
    disallowedTools?: string[];
    permissionMode?: string;
    isolation?: string;
    /** Rendered as JSON-in-YAML, which is the form `agent.liquid` emits. */
    hooks?: Record<string, unknown>;
    experimental?: Record<string, unknown>;
    outputFormat?: string;
    domain?: string;
    custom?: boolean;
  },
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
    ...(options?.disallowedTools
      ? ["disallowedTools:", ...options.disallowedTools.map((t) => `  - ${t}`)]
      : []),
    ...(options?.model ? [`model: ${options.model}`] : []),
    ...(options?.effort ? [`effort: ${options.effort}`] : []),
    ...(options?.permissionMode ? [`permissionMode: ${options.permissionMode}`] : []),
    ...(options?.isolation ? [`isolation: ${options.isolation}`] : []),
    ...(options?.hooks ? [`hooks: ${JSON.stringify(options.hooks)}`] : []),
    ...(options?.experimental ? [`experimental: ${JSON.stringify(options.experimental)}`] : []),
    ...(options?.outputFormat ? [`outputFormat: ${options.outputFormat}`] : []),
    ...(options?.domain ? [`domain: ${options.domain}`] : []),
    ...(options?.custom !== undefined ? [`custom: ${String(options.custom)}`] : []),
  ].join("\n");
}

/** An installed agent `.md`, in the format `validateAgentFrontmatter` checks. */
export function renderAgentMd(
  name: string,
  description?: string,
  options?: { tools?: string[]; body?: string; hooks?: string },
): string {
  const desc = description ?? `Test ${name} agent`;
  const tools = (options?.tools ?? ["Read", "Write"]).join(", ");
  const body = options?.body ?? `# ${name}\n\n${desc}`;
  // Compile writes a writing sub-agent's `Stop` hook as one JSON line under this key.
  const hooks = options?.hooks === undefined ? "" : `hooks: ${options.hooks}\n`;
  return `---
name: ${name}
description: ${desc}
tools: ${tools}
${hooks}---

${body}
`;
}

export interface SkillMetadataFields {
  custom?: boolean;
  domain?: string;
  author?: string;
  displayName?: string;
  /** Required, so no fixture reaches the unreachable `local` placeholder by omission. */
  category: string;
  slug?: string;
  cliDescription?: string;
  usageGuidance?: string;
  contentHash: string;
  forkedFrom?: { skillId: string; contentHash: string; date: string };
}

/** The four fields `localRawMetadataSchema` requires; `compile` refuses a skill missing one. */
export type RequiredMetadataField = "displayName" | "slug" | "category" | "domain";

/** Each required field is absent when {@link renderIncompleteMetadataYaml} was asked to omit it. */
type EmittedMetadataFields = Omit<SkillMetadataFields, RequiredMetadataField> &
  Partial<Pick<SkillMetadataFields, RequiredMetadataField>>;

const UNNAMED_SKILL_DISPLAY_NAME = "Test Skill";
const UNNAMED_SKILL_SLUG = "test-skill";

/** By the `<domain>-<name>` category convention, so an implied domain never contradicts it. */
function domainOfCategory(category: string): string {
  return category.split("-")[0] ?? category;
}

/** `category` is not filled: a wrong value makes the skill unreachable, so it is asked for. */
function completeMetadata(fields: SkillMetadataFields): SkillMetadataFields {
  return {
    ...fields,
    domain: fields.domain ?? domainOfCategory(fields.category),
    displayName: fields.displayName ?? UNNAMED_SKILL_DISPLAY_NAME,
    slug: fields.slug ?? UNNAMED_SKILL_SLUG,
  };
}

/** Every field the fixture names plus the required ones it did not, as the product would write. */
export function renderMetadataYaml(fields: SkillMetadataFields): string {
  return emitMetadataYaml(completeMetadata(fields));
}

/** Required fields left out by name: incompleteness is asked for, never fallen into. */
export function renderIncompleteMetadataYaml(
  fields: SkillMetadataFields,
  omitted: readonly RequiredMetadataField[],
): string {
  return emitMetadataYaml(omit(completeMetadata(fields), [...omitted]));
}

/** A metadata.yaml no YAML parser can read. */
export function renderUnparseableMetadataYaml(): string {
  return `{{{ this is not: valid: yaml: "at all\n`;
}

/** A bare-string `forkedFrom`: `readLocalSkillMetadata` then refuses the whole file. */
export function renderMetadataYamlWithUnreadableProvenance(fields: SkillMetadataFields): string {
  return `${renderMetadataYaml(fields)}forkedFrom: not a mapping\n`;
}

/** Frontmatter with an unclosed flow sequence: a YAML syntax error, not a schema one. */
export function renderUnparseableSkillMd(id: string): string {
  return `---\nname: ${id}\ndescription: [never closed\n---\n\n# ${id}\n`;
}

function emitMetadataYaml(fields: EmittedMetadataFields): string {
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

/** Inferred from `skillRulesFileSchema`, so a dropped field stops compiling at every fixture. */
export type SkillRulesFile = z.infer<typeof skillRulesFileSchema>;

/** Renders a `config/skill-rules.ts` whose default export `loadSkillRules` accepts. */
export function renderRulesTs(rules: SkillRulesFile): string {
  return renderConfigTs(rules);
}
