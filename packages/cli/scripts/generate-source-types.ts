/**
 * Writes `src/cli/types/generated/` from a skills checkout and this package's agent metadata.
 * Importing this file writes nothing.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import path from "path";
import { format, resolveConfig } from "prettier";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { GENERATED_AT_BUILD } from "../src/cli/consts";
import { defaultCategories } from "../src/cli/lib/configuration/default-categories";
import { defaultStacks } from "../src/cli/lib/configuration/default-stacks";
import {
  mergeMatrixWithSkills,
  relationshipsForSource,
} from "../src/cli/lib/matrix/skill-resolution";
import { bytewise } from "../src/cli/utils/string";

import type { ExtractedSkillMetadata, ResolvedStack, SkillId } from "../src/cli/types";
import type { Options as PrettierOptions } from "prettier";

const CLI_ROOT = path.resolve(import.meta.dirname, "..");

const TYPESCRIPT_PARSER = "typescript";

const SOURCE_TYPES_FILE = "source-types.ts";
const MATRIX_FILE = "matrix.ts";
const ACTIVATION_DESCRIPTIONS_FILE = "activation-descriptions.ts";

export type AgentEntry = {
  id: string;
};

/** `path` is relative to the output directory. */
type EmittedFile = { path: string; content: string };

type SourceRoots = { skillsSource: string; cliRoot?: string };

type GeneratorRoots = SourceRoots & { outDir: string };

type CatalogueCounts = { skills: number; categories: number; domains: number; agents: number };

type Emission = { files: EmittedFile[]; counts: CatalogueCounts };

/**
 * Parse boundary for hand-authored skills-repo YAML. Loose about presence; required fields are
 * checked by the throws below.
 */
const skillMetadataSchema = z.object({
  custom: z.boolean().exactOptional(),
  slug: z.string().exactOptional(),
  category: z.string().exactOptional(),
  domain: z.string().exactOptional(),
  displayName: z.string().exactOptional(),
  cliDescription: z.string().exactOptional(),
  usageGuidance: z.string().exactOptional(),
  author: z.string().exactOptional(),
});

/** `name` is the skill id; `description` feeds the compiled agent's skill-activation table. */
const skillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string().exactOptional(),
});

const agentMetadataSchema = z.object({
  custom: z.boolean().exactOptional(),
  id: z.string().exactOptional(),
  domain: z.string().exactOptional(),
});

/** Names the offending file, which a zod message cannot. */
function parseMetadata<T>(schema: z.ZodType<T>, raw: string, describe: string): T {
  const result = schema.safeParse(parseYaml(raw));
  if (!result.success) {
    throw new Error(`Invalid metadata for ${describe}: ${result.error.message}`);
  }
  return result.data;
}

export function extractSkills(skillsSourcePath: string): ExtractedSkillMetadata[] {
  const skillsDir = path.join(skillsSourcePath, "src/skills");
  const entries: ExtractedSkillMetadata[] = [];

  for (const dir of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;

    const metadataPath = path.join(skillsDir, dir.name, "metadata.yaml");
    const skillMdPath = path.join(skillsDir, dir.name, "SKILL.md");

    let metadataRaw: string;
    let skillMdRaw: string;
    try {
      metadataRaw = readFileSync(metadataPath, "utf-8");
      skillMdRaw = readFileSync(skillMdPath, "utf-8");
    } catch {
      console.warn(`  ⚠ Skipping ${dir.name}: missing metadata.yaml or SKILL.md`);
      continue;
    }

    const metadata = parseMetadata(skillMetadataSchema, metadataRaw, `${dir.name}/metadata.yaml`);
    if (metadata.custom) continue;

    const fmMatch = skillMdRaw.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      console.warn(`  ⚠ Skipping ${dir.name}: no frontmatter in SKILL.md`);
      continue;
    }
    const [, frontmatterYaml = ""] = fmMatch;
    const frontmatter = parseMetadata(
      skillFrontmatterSchema,
      frontmatterYaml,
      `${dir.name}/SKILL.md frontmatter`,
    );

    if (!metadata.cliDescription) {
      throw new Error(`Skill ${dir.name} is missing required 'cliDescription' in metadata.yaml`);
    }

    if (!metadata.displayName) {
      throw new Error(`Skill ${dir.name} is missing required 'displayName' in metadata.yaml`);
    }

    // Parse boundary: YAML strings narrowed to the generated unions.
    entries.push({
      slug: metadata.slug as ExtractedSkillMetadata["slug"],
      id: frontmatter.name as ExtractedSkillMetadata["id"],
      category: metadata.category as ExtractedSkillMetadata["category"],
      domain: metadata.domain as ExtractedSkillMetadata["domain"],
      displayName: metadata.displayName,
      description: metadata.cliDescription,
      // Same rule `extractAllSkills` applies to catalog.json.
      ...(frontmatter.description && { activationDescription: frontmatter.description }),
      ...(metadata.usageGuidance !== undefined && { usageGuidance: metadata.usageGuidance }),
      author: metadata.author || "",
      directoryPath: dir.name,
      path: `skills/${dir.name}`,
    });
  }

  return entries;
}

export function extractAgents(cliRootPath: string): AgentEntry[] {
  const agentsDir = path.join(cliRootPath, "src/agents");
  const agents: AgentEntry[] = [];

  for (const group of readdirSync(agentsDir, { withFileTypes: true })) {
    if (!group.isDirectory() || group.name === "_templates") continue;
    const groupDir = path.join(agentsDir, group.name);

    for (const agent of readdirSync(groupDir, { withFileTypes: true })) {
      if (!agent.isDirectory()) continue;
      const metadataPath = path.join(groupDir, agent.name, "metadata.yaml");

      let raw: string;
      try {
        raw = readFileSync(metadataPath, "utf-8");
      } catch {
        continue;
      }

      const metadata = parseMetadata(
        agentMetadataSchema,
        raw,
        `${group.name}/${agent.name}/metadata.yaml`,
      );
      if (metadata.custom) continue;
      if (metadata.id) {
        agents.push({ id: metadata.id });
      }
    }
  }

  return agents;
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size === values.length) return;

  const dupes = values.filter((value, index) => values.indexOf(value) !== index);
  throw new Error(`Duplicate ${label}: ${[...new Set(dupes)].join(", ")}`);
}

const quotedLines = (values: readonly string[]) => values.map((value) => `"${value}",`);

export function renderSourceTypes(
  skills: ExtractedSkillMetadata[],
  agentEntries: AgentEntry[],
): string {
  assertUnique(
    skills.map((s) => s.slug),
    "slugs",
  );
  assertUnique(
    skills.map((s) => s.id),
    "skill IDs",
  );

  const sortedBySlug = [...skills].sort((a, b) => bytewise(a.slug, b.slug));
  const agentNames = [...new Set(agentEntries.map((a) => a.id))].sort();
  const categories = [...new Set(skills.map((s) => s.category))].sort();
  const domains = [...new Set(skills.map((s) => s.domain))].sort();
  const skillIds = [...new Set(skills.map((s) => s.id))].sort();

  const lines: string[] = [
    "// AUTO-GENERATED from skills source and agent metadata — do not edit manually",
    "// Run: bun run generate:types",
    "",
    "// ── Skill Map (slug → ID) ─────────────────────────────────────",
    "",
    "export const SKILL_MAP = {",
    ...sortedBySlug.map((entry) => `"${entry.slug}": "${entry.id}",`),
    "} as const;",
    "",
    "export type SkillSlug = keyof typeof SKILL_MAP;",
    "export type SkillId = (typeof SKILL_MAP)[SkillSlug];",
    "",
    "// Derived arrays for Zod enum compatibility",
    "// (z.enum() requires a readonly tuple, not Object.keys/values)",
    "export const SKILL_SLUGS = [",
    ...quotedLines(sortedBySlug.map((entry) => entry.slug)),
    "] as const satisfies readonly SkillSlug[];",
    "",
    "export const SKILL_IDS = [",
    ...quotedLines(skillIds),
    "] as const satisfies readonly SkillId[];",
    "",
    "// ── Categories ─────────────────────────────────────────────────",
    "",
    "export const CATEGORIES = [",
    ...quotedLines(categories),
    "] as const;",
    "",
    "export type Category = (typeof CATEGORIES)[number];",
    "",
    "// ── Domains ────────────────────────────────────────────────────",
    "",
    "export const DOMAINS = [",
    ...quotedLines(domains),
    "] as const;",
    "",
    "export type Domain = (typeof DOMAINS)[number];",
    "",
    "// ── Agent Names ────────────────────────────────────────────────",
    "",
    "export const AGENT_NAMES = [",
    ...quotedLines(agentNames),
    "] as const;",
    "",
    "export type AgentName = (typeof AGENT_NAMES)[number];",
    "",
  ];

  return lines.join("\n");
}

export function sortedGroupBy<T>(
  entries: [string, T][],
  keyFn: (value: T) => string,
): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const [id, value] of entries) {
    const key = keyFn(value);
    (groups[key] ??= []).push(id);
  }
  return Object.fromEntries(
    Object.entries(groups)
      .sort(([a], [b]) => bytewise(a, b))
      .map(([key, ids]) => [key, ids.sort()]),
  );
}

/** Strips the sentence {@link renderActivationDescriptions} carries. */
const withoutActivationDescription = ({
  activationDescription: _carriedSeparately,
  ...recorded
}: ExtractedSkillMetadata): ExtractedSkillMetadata => recorded;

/** SKILL.md descriptions are emitted separately, keeping them out of the editor's first paint. */
export function renderMatrix(skills: ExtractedSkillMetadata[], skillIdSet: Set<string>): string {
  // Byte order, not readdirSync or locale order, so regeneration is machine-independent.
  const sortedSkills = skills
    .map(withoutActivationDescription)
    .sort((a, b) => bytewise(a.id, b.id));

  // Mirrors the CLI loader: rules narrowed to the slugs this catalogue ships, then merged.
  const relationships = relationshipsForSource(sortedSkills);
  const matrix = mergeMatrixWithSkills(defaultCategories, relationships, sortedSkills);

  matrix.generatedAt = GENERATED_AT_BUILD;

  matrix.suggestedStacks = defaultStacks.map((stack) => resolveStack(stack, skillIdSet));

  const sortedSkillIdsByCategory = sortedGroupBy(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops `| undefined` from the value type, but a slot can still be explicitly undefined
    Object.entries(matrix.skills).filter(([, s]) => s != null),
    (skill) => skill.category,
  );

  const sortedCategoriesByDomain = sortedGroupBy(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops `| undefined` from the value type, but a slot can still be explicitly undefined
    Object.entries(matrix.categories).filter(([, d]) => d?.domain != null),
    (cat) => cat.domain!,
  );

  const lines: string[] = [
    "// AUTO-GENERATED from skills source — do not edit manually",
    "// Run: bun run generate:types",
    "",
    "import type {",
    "  CategoryMap,",
    "  MergedSkillsMatrix,",
    "  ResolvedSkill,",
    "  ResolvedStack,",
    "  SkillSlugMap,",
    '} from "../matrix";',
    'import type { AgentName } from "../agents";',
    'import type { SkillId, SkillSlug } from "../skills";',
    'import type { Category, Domain } from "./source-types";',
    "",
    "// ── Built-in Matrix ───────────────────────────────────────────",
    "",
    `export const BUILT_IN_MATRIX: MergedSkillsMatrix = ${JSON.stringify(matrix, null, 2)} as MergedSkillsMatrix;`,
    "",
    "// ── Derived Lookup Maps ───────────────────────────────────────",
    "",
    `export const SKILL_IDS_BY_CATEGORY: Record<Category, readonly SkillId[]> = ${JSON.stringify(sortedSkillIdsByCategory, null, 2)} as Record<Category, readonly SkillId[]>;`,
    "",
    `export const CATEGORIES_BY_DOMAIN: Record<Domain, readonly Category[]> = ${JSON.stringify(sortedCategoriesByDomain, null, 2)} as Record<Domain, readonly Category[]>;`,
    "",
  ];

  return lines.join("\n");
}

const activationDescriptionEntry = ({ id, activationDescription }: ExtractedSkillMetadata) =>
  activationDescription === undefined ? [] : [[id, activationDescription] as const];

/** Each skill's SKILL.md description by id; see {@link renderMatrix}. */
function renderActivationDescriptions(skills: ExtractedSkillMetadata[]): string {
  const descriptionsById = Object.fromEntries(
    [...skills].sort((a, b) => bytewise(a.id, b.id)).flatMap(activationDescriptionEntry),
  );

  return [
    "// AUTO-GENERATED from skills source — do not edit manually",
    "// Run: bun run generate:types",
    "",
    'import type { SkillId } from "../skills";',
    "",
    `export const ACTIVATION_DESCRIPTIONS: Readonly<Partial<Record<SkillId, string>>> = ${JSON.stringify(descriptionsById, null, 2)};`,
    "",
  ].join("\n");
}

/** convertStackToResolvedStack without the schemas.ts dependency. */
export function resolveStack(
  stack: (typeof defaultStacks)[number],
  skillIdSet: Set<string>,
): ResolvedStack {
  const skills: Record<string, Record<string, string[]>> = {};

  for (const [agentId, agentConfig] of Object.entries(stack.agents)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops `| undefined` from the value type, but a slot can still be explicitly undefined
    if (!agentConfig) continue;

    const agentSkills: Record<string, string[]> = {};

    for (const [category, assignments] of Object.entries(agentConfig)) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops `| undefined` from the value type, but a slot can still be explicitly undefined
      if (!assignments || !Array.isArray(assignments) || assignments.length === 0) continue;
      const validIds = assignments
        .filter((a: { id: string }) => skillIdSet.has(a.id))
        .map((a: { id: string }) => a.id);

      if (validIds.length > 0) {
        agentSkills[category] = validIds;
      }
    }

    skills[agentId] = agentSkills;
  }

  const allSkillIds = [...new Set(Object.values(skills).flatMap((s) => Object.values(s).flat()))];

  return {
    id: stack.id,
    name: stack.name,
    description: stack.description,
    skills: skills,
    // Cast: ids were validated against skillIdSet above.
    allSkillIds: allSkillIds as SkillId[],
    philosophy: stack.philosophy || "",
  };
}

/** Resolved from this file, not the destination, so a fixture dir in os.tmpdir() formats the same. */
async function packagePrettierOptions(): Promise<PrettierOptions> {
  const options = await resolveConfig(import.meta.filename);
  if (options === null) {
    throw new Error(
      `No Prettier config resolved from ${import.meta.filename} — the emitted bytes would not ` +
        "match the committed types.",
    );
  }
  return options;
}

async function formatEmitted(files: EmittedFile[]): Promise<EmittedFile[]> {
  const options = await packagePrettierOptions();

  return Promise.all(
    files.map(async (file) => ({
      path: file.path,
      content: await format(file.content, { ...options, parser: TYPESCRIPT_PARSER }),
    })),
  );
}

async function emittedFiles({ skillsSource, cliRoot = CLI_ROOT }: SourceRoots): Promise<Emission> {
  const skills = extractSkills(skillsSource);
  const agentEntries = extractAgents(cliRoot);

  // First, because it throws on duplicate slugs and ids.
  const sourceTypes = renderSourceTypes(skills, agentEntries);
  const skillIds = new Set(skills.map((skill) => skill.id));
  const matrix = renderMatrix(skills, skillIds);

  return {
    files: await formatEmitted([
      { path: SOURCE_TYPES_FILE, content: sourceTypes },
      { path: MATRIX_FILE, content: matrix },
      { path: ACTIVATION_DESCRIPTIONS_FILE, content: renderActivationDescriptions(skills) },
    ]),
    counts: catalogueCounts(skills, agentEntries),
  };
}

function catalogueCounts(
  skills: ExtractedSkillMetadata[],
  agentEntries: AgentEntry[],
): CatalogueCounts {
  return {
    skills: skills.length,
    categories: new Set(skills.map((skill) => skill.category)).size,
    domains: new Set(skills.map((skill) => skill.domain)).size,
    agents: new Set(agentEntries.map((agent) => agent.id)).size,
  };
}

function writeEmittedFile(outDir: string, file: EmittedFile): void {
  writeFileSync(path.join(outDir, file.path), file.content);
}

function matchesCommitted(outDir: string, file: EmittedFile): boolean {
  const target = path.join(outDir, file.path);
  return existsSync(target) && readFileSync(target, "utf-8") === file.content;
}

export async function generate({ outDir, ...roots }: GeneratorRoots): Promise<{
  written: string[];
  counts: CatalogueCounts;
}> {
  const { files, counts } = await emittedFiles(roots);

  mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    writeEmittedFile(outDir, file);
  }

  return { written: files.map((file) => file.path), counts };
}

export async function check({ outDir, ...roots }: GeneratorRoots): Promise<{
  clean: boolean;
  drifted: string[];
}> {
  const { files } = await emittedFiles(roots);
  const drifted = files.filter((file) => !matchesCommitted(outDir, file)).map((file) => file.path);

  return { clean: drifted.length === 0, drifted };
}
