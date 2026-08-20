/**
 * Generates TypeScript types from skills source and agent metadata — the writer of both files in
 * `src/cli/types/generated/`.
 *
 * Phase 1: source-types.ts (unions, SKILL_MAP, const arrays)
 * Phase 2: matrix.ts (full MergedSkillsMatrix + derived lookup maps)
 *
 * Run: bun run generate:types [skills-source-path] — or generate:types:check, which reports drift
 * and writes nothing. Both go through scripts/run-generate-source-types.ts: nothing runs at module
 * scope here, so importing this file writes no files.
 *
 * Unlike its two siblings this generator reads a checkout outside the repository, which is why its
 * check runs at publish and in the catalogue-regeneration workflow rather than in ci.yml.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import path from "path";
import { format, resolveConfig } from "prettier";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

// Phase 2 imports — pure logic, no circular dependencies
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

/** Where the generator reads agent metadata from when no other root is given. */
const CLI_ROOT = path.resolve(import.meta.dirname, "..");

/** Prettier's parser for the `.ts` files this generator emits. */
const TYPESCRIPT_PARSER = "typescript";

/** Emitted paths, relative to the output directory and in emission order. */
const SOURCE_TYPES_FILE = "source-types.ts";
const MATRIX_FILE = "matrix.ts";

export type AgentEntry = {
  id: string;
  domain?: string;
};

/** One file the generator owns. `path` is relative to the output directory. */
type EmittedFile = { path: string; content: string };

/** Where the generator reads. Both are parameters so the suite can drive it against fixtures. */
type SourceRoots = { skillsSource: string; cliRoot?: string };

/** Where it reads, plus where it writes or compares. */
type GeneratorRoots = SourceRoots & { outDir: string };

/** What one generation round read, for the runner to report. */
type CatalogueCounts = { skills: number; categories: number; domains: number; agents: number };

/** Everything one round produces: the files to write or compare, and what it read to build them. */
type Emission = { files: EmittedFile[]; counts: CatalogueCounts };

/**
 * What this generator reads is hand-authored in the skills repository, so it is
 * the least trustworthy input in the package — and `parseYaml` types it `any`,
 * which made every field below an unchecked read. These schemas are the parse
 * boundary: deliberately loose, because the generator's own `throw`s already
 * name the two fields a skill cannot ship without, and the id-shaped fields are
 * cast to their unions further down where the vocabulary is known.
 *
 * Loose about which fields must be PRESENT, that is — not about a present key
 * holding `undefined`, which is why every field below is `.exactOptional()`
 * rather than the plain spelling `typescript-types-bible.md` § 4a rules out at
 * a parse boundary. It costs the loose reading nothing: YAML cannot express
 * `undefined` at all, and an empty value parses as `null`, which both
 * spellings reject alike.
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

/** `name` is required: a SKILL.md without one has no id, and an id of
 * `undefined` written into the generated unions is a compile error a long way
 * from its cause. */
const skillFrontmatterSchema = z.object({ name: z.string() });

const agentMetadataSchema = z.object({
  custom: z.boolean().exactOptional(),
  id: z.string().exactOptional(),
  domain: z.string().exactOptional(),
});

/** Parses YAML against a schema, naming the directory the bad file is in —
 * which is the one thing a zod message cannot say for itself. */
function parseMetadata<T>(schema: z.ZodType<T>, raw: string, describe: string): T {
  const result = schema.safeParse(parseYaml(raw));
  if (!result.success) {
    throw new Error(`Invalid metadata for ${describe}: ${result.error.message}`);
  }
  return result.data;
}

// -- Extract skills ----------------------------------------------------------

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
    if (metadata.custom) continue; // custom skills register at runtime

    // Extract name + description from SKILL.md frontmatter
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

    // Boundary casts: YAML strings narrowed to union types at parse boundary
    entries.push({
      slug: metadata.slug as ExtractedSkillMetadata["slug"],
      id: frontmatter.name as ExtractedSkillMetadata["id"],
      category: metadata.category as ExtractedSkillMetadata["category"],
      domain: metadata.domain as ExtractedSkillMetadata["domain"],
      displayName: metadata.displayName,
      description: metadata.cliDescription,
      ...(metadata.usageGuidance !== undefined && { usageGuidance: metadata.usageGuidance }),
      author: metadata.author || "",
      directoryPath: dir.name,
      path: `skills/${dir.name}`,
    });
  }

  return entries;
}

// -- Extract agents ----------------------------------------------------------

export function extractAgents(cliRootPath: string): AgentEntry[] {
  const agentsDir = path.join(cliRootPath, "src/agents");
  const agents: AgentEntry[] = [];

  // Walk two levels: src/agents/{group}/{agent}/metadata.yaml
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
        agents.push({
          id: metadata.id,
          ...(metadata.domain !== undefined && { domain: metadata.domain }),
        });
      }
    }
  }

  return agents;
}

// -- Phase 1: Generate source-types.ts ---------------------------------------

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size === values.length) return;

  const dupes = values.filter((value, index) => values.indexOf(value) !== index);
  throw new Error(`Duplicate ${label}: ${[...new Set(dupes)].join(", ")}`);
}

/** One quoted-and-comma'd line per value — the body of an emitted `[...]` or `{...}` literal. */
const quotedLines = (values: readonly string[]) => values.map((value) => `"${value}",`);

/** The TypeScript source of `source-types.ts`, before Prettier. */
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

  // The emitted file, top to bottom.
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

// -- Helpers ------------------------------------------------------------------

/** Groups entries by a derived key, sorting both outer keys and inner value arrays. */
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

// -- Phase 2: Generate matrix.ts ---------------------------------------------

/** The TypeScript source of `matrix.ts`, before Prettier. */
export function renderMatrix(
  skills: ExtractedSkillMetadata[],
  agentEntries: AgentEntry[],
  skillIdSet: Set<string>,
): string {
  // Emission order is a promise, not an accident. matrix.skills and
  // agentDefinedDomains take their key order from these arrays, and the arrays
  // arrive in readdirSync order — a property of the filesystem, not of the
  // marketplace. The first live CI regeneration proved it: same skills commit,
  // byte-different matrix.ts, 17,300-line pull request of pure reordering.
  // Byte-wise comparison rather than localeCompare, deliberately: localeCompare
  // with no locale argument reads the process's default collation from LC_ALL /
  // LANG, not the ICU build, so a contributor whose desktop language orders
  // these ids differently regenerates this file in a different order.
  const sortedSkills = [...skills].sort((a, b) => bytewise(a.id, b.id));
  const sortedAgentEntries = [...agentEntries].sort((a, b) => bytewise(a.id, b.id));

  // Through the same arrangement the CLI's own loader makes of these three inputs: the
  // built-in rules narrowed to the slugs this catalogue ships, then merged. Reaching
  // `defaultRules` directly instead left every rule the catalogue cannot express in the
  // emitted matrix, so a smaller catalogue than the public one generated a file recording
  // dangling slugs that the CLI, loading the very same directory, would never see.
  const relationships = relationshipsForSource(sortedSkills);
  const matrix = mergeMatrixWithSkills(defaultCategories, relationships, sortedSkills);

  // A written matrix records a build, not a moment — see GENERATED_AT_BUILD
  matrix.generatedAt = GENERATED_AT_BUILD;

  // Resolve stacks from defaultStacks
  matrix.suggestedStacks = defaultStacks.map((stack) => resolveStack(stack, skillIdSet));

  // Build agentDefinedDomains from agent metadata
  const agentDefinedDomains = Object.fromEntries(
    sortedAgentEntries.flatMap((a) => (a.domain === undefined ? [] : [[a.id, a.domain] as const])),
  );
  if (Object.keys(agentDefinedDomains).length > 0) {
    // Boundary cast: agent IDs and domains are validated by Phase 1
    matrix.agentDefinedDomains = agentDefinedDomains;
  }

  // Build derived lookup maps (grouped + sorted by key and values)
  const sortedSkillIdsByCategory = sortedGroupBy(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    Object.entries(matrix.skills).filter(([, s]) => s != null),
    (skill) => skill.category,
  );

  const sortedCategoriesByDomain = sortedGroupBy(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    Object.entries(matrix.categories).filter(([, d]) => d?.domain != null),
    (cat) => cat.domain!,
  );

  // Serialize to TypeScript
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

// -- Stack resolution --------------------------------------------------------

/**
 * Converts a Stack to a ResolvedStack, validating skill IDs against the known set.
 * Equivalent to convertStackToResolvedStack in source-loader.ts but uses skillIdSet
 * instead of isValidSkillId() from schemas.ts (no schema dependency).
 */
export function resolveStack(
  stack: (typeof defaultStacks)[number],
  skillIdSet: Set<string>,
): ResolvedStack {
  const skills: Record<string, Record<string, string[]>> = {};

  for (const [agentId, agentConfig] of Object.entries(stack.agents)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    if (!agentConfig) continue;

    const agentSkills: Record<string, string[]> = {};

    for (const [category, assignments] of Object.entries(agentConfig)) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
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
    // Boundary casts: agent/category keys come from source stack data and skill IDs
    // are validated against skillIdSet above — narrowed to the generated unions here.
    skills: skills,
    allSkillIds: allSkillIds as SkillId[],
    philosophy: stack.philosophy || "",
  };
}

// -- Emission ----------------------------------------------------------------

/**
 * This package's own Prettier settings, resolved from this file rather than from the destination.
 *
 * The emitted bytes are a property of the generator, not of where they land: resolving from the
 * output directory would give a fixture in `os.tmpdir()` a different config — or none — and the
 * check would then compare formatted committed files against unformatted emitted ones.
 */
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

/** Every file the generator owns, formatted exactly as it is committed. */
async function emittedFiles({ skillsSource, cliRoot = CLI_ROOT }: SourceRoots): Promise<Emission> {
  const skills = extractSkills(skillsSource);
  const agentEntries = extractAgents(cliRoot);

  // Phase 1 first: it is where duplicate slugs and ids throw, and phase 2 below builds the matrix
  // out of the same list.
  const sourceTypes = renderSourceTypes(skills, agentEntries);
  const skillIds = new Set(skills.map((skill) => skill.id));
  const matrix = renderMatrix(skills, agentEntries, skillIds);

  return {
    files: await formatEmitted([
      { path: SOURCE_TYPES_FILE, content: sourceTypes },
      { path: MATRIX_FILE, content: matrix },
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

/** A file that does not exist counts as drifted — the committed set is incomplete. */
function matchesCommitted(outDir: string, file: EmittedFile): boolean {
  const target = path.join(outDir, file.path);
  return existsSync(target) && readFileSync(target, "utf-8") === file.content;
}

// -- Entry points ------------------------------------------------------------

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
