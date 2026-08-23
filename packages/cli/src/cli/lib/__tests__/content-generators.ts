/**
 * Pure content renderers for test file generation.
 * Single source of truth for all test content templates.
 */
import { omit } from "remeda";

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
  /**
   * Required, so that no fixture reaches the `local` placeholder by omission.
   *
   * A skill's category is the field that decides whether it can be reached at all: local-skill
   * discovery refuses the placeholder outright, and a skill wearing it belongs to no domain, so
   * it joins no grid tab and reaches no sub-agent. A default here wrote that skill silently, and
   * a spec built on one exercised a catalogue the skill was never in. The placeholder is still
   * writable — {@link renderMetadataYaml} takes it like any other value — but only by name.
   */
  category: string;
  slug?: string;
  cliDescription?: string;
  usageGuidance?: string;
  contentHash: string;
  forkedFrom?: { skillId: string; contentHash: string; date: string };
}

/**
 * The fields `localRawMetadataSchema` requires of every registered skill — the
 * four without which no product path produces a `metadata.yaml`, and without
 * which `compile` refuses the run.
 */
export type RequiredMetadataField = "displayName" | "slug" | "category" | "domain";

/**
 * The fields as they reach the emitter: each of the four above is absent when
 * {@link renderIncompleteMetadataYaml} was asked to leave it out.
 */
type EmittedMetadataFields = Omit<SkillMetadataFields, RequiredMetadataField> &
  Partial<Pick<SkillMetadataFields, RequiredMetadataField>>;

/** Stand-in identity for a fixture that writes a skill without naming one. */
const UNNAMED_SKILL_DISPLAY_NAME = "Test Skill";
const UNNAMED_SKILL_SLUG = "test-skill";

/**
 * The domain a category belongs to, by the `<domain>-<name>` convention every
 * one of the marketplace's categories follows. A fixture that names a category
 * and no domain gets the domain that category actually belongs to, rather than a
 * constant that would contradict it.
 */
function domainOfCategory(category: string): string {
  return category.split("-")[0] ?? category;
}

/**
 * Fills the required fields a fixture left unnamed. `category` is not among them —
 * it is the one field a wrong value makes the skill unreachable through, so it is
 * asked for rather than supplied.
 */
function completeMetadata(fields: SkillMetadataFields): SkillMetadataFields {
  return {
    ...fields,
    domain: fields.domain ?? domainOfCategory(fields.category),
    displayName: fields.displayName ?? UNNAMED_SKILL_DISPLAY_NAME,
    slug: fields.slug ?? UNNAMED_SKILL_SLUG,
  };
}

/**
 * Renders a complete metadata.yaml for a test skill: every field a fixture names,
 * plus the required ones it did not. A fixture writes content the product could
 * have written — one that no product path produces cannot fail for a reason the
 * product has.
 */
export function renderMetadataYaml(fields: SkillMetadataFields): string {
  return emitMetadataYaml(completeMetadata(fields));
}

/**
 * Renders a metadata.yaml with the named required fields left out — the shape
 * `compile` refuses and `doctor` reports. Deliberately separate from
 * {@link renderMetadataYaml}: incompleteness is a thing an error-path fixture has
 * to ask for by name, never something it falls into by omission.
 */
export function renderIncompleteMetadataYaml(
  fields: SkillMetadataFields,
  omitted: readonly RequiredMetadataField[],
): string {
  return emitMetadataYaml(omit(completeMetadata(fields), [...omitted]));
}

/**
 * Renders a metadata.yaml no YAML parser can read — the other half of the class
 * {@link renderIncompleteMetadataYaml} covers. `readSkillMetadata` refuses both
 * ways of describing nothing, a file nothing parses out of and a file that
 * parses without the required fields, and an error-path fixture asks for either
 * by name rather than hand-rolling a broken string per spec.
 */
export function renderUnparseableMetadataYaml(): string {
  return `{{{ this is not: valid: yaml: "at all\n`;
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

export function renderCategoriesTs(categories: Record<string, unknown>): string {
  return renderConfigTs(categories);
}

export function renderRulesTs(rules: Record<string, unknown>): string {
  return renderConfigTs(rules);
}
