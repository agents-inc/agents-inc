/**
 * Generates TypeScript types from skills source and agent metadata.
 * Run: bun run generate:types [skills-source-path]
 *
 * Phase 1: Write source-types.ts (unions, SKILL_MAP, const arrays)
 * Phase 2: Write matrix.ts (full MergedSkillsMatrix + derived lookup maps)
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

// Phase 2 imports — pure logic, no circular dependencies
import { defaultCategories } from "../src/cli/lib/configuration/default-categories";
import { defaultRules } from "../src/cli/lib/configuration/default-rules";
import { defaultStacks } from "../src/cli/lib/configuration/default-stacks";
import { mergeMatrixWithSkills } from "../src/cli/lib/matrix/skill-resolution";

import type { ExtractedSkillMetadata, ResolvedStack, SkillId } from "../src/cli/types";

const cliRoot = path.resolve(import.meta.dirname, "..");
const monorepoRoot = path.resolve(cliRoot, "../..");

// Accept skills source path as CLI arg (default: skills repo sibling to the monorepo root)
const skillsSource = process.argv[2] || path.resolve(monorepoRoot, "../skills");

export type AgentEntry = {
  id: string;
  domain?: string;
};

/**
 * What this generator reads is hand-authored in the skills repository, so it is
 * the least trustworthy input in the package — and `parseYaml` types it `any`,
 * which made every field below an unchecked read. These schemas are the parse
 * boundary: deliberately loose, because the generator's own `throw`s already
 * name the two fields a skill cannot ship without, and the id-shaped fields are
 * cast to their unions further down where the vocabulary is known.
 */
const skillMetadataSchema = z.object({
  custom: z.boolean().optional(),
  slug: z.string().optional(),
  category: z.string().optional(),
  domain: z.string().optional(),
  displayName: z.string().optional(),
  cliDescription: z.string().optional(),
  usageGuidance: z.string().optional(),
  author: z.string().optional(),
});

/** `name` is required: a SKILL.md without one has no id, and an id of
 * `undefined` written into the generated unions is a compile error a long way
 * from its cause. */
const skillFrontmatterSchema = z.object({ name: z.string() });

const agentMetadataSchema = z.object({
  custom: z.boolean().optional(),
  id: z.string().optional(),
  domain: z.string().optional(),
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

export function generatePhase1(
  skills: ExtractedSkillMetadata[],
  agentEntries: AgentEntry[],
  outDir: string,
): {
  outPath: string;
  skillIdSet: Set<string>;
} {
  assertUnique(
    skills.map((s) => s.slug),
    "slugs",
  );
  assertUnique(
    skills.map((s) => s.id),
    "skill IDs",
  );

  const sortedBySlug = [...skills].sort((a, b) => a.slug.localeCompare(b.slug));
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

  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "source-types.ts");
  writeFileSync(outPath, lines.join("\n"));

  console.log(`  ✓ ${outPath}`);
  console.log(
    `\n  Generated: ${skills.length} skills, ${categories.length} categories, ${domains.length} domains, ${agentNames.length} agents\n`,
  );

  return { outPath, skillIdSet: new Set(skills.map((s) => s.id)) };
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
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, ids]) => [key, ids.sort()]),
  );
}

// -- Phase 2: Generate matrix.ts ---------------------------------------------

export function generatePhase2(
  skills: ExtractedSkillMetadata[],
  agentEntries: AgentEntry[],
  skillIdSet: Set<string>,
  outDir: string,
): void {
  console.log("Generating matrix...\n");

  // Call the pure resolution function
  const matrix = mergeMatrixWithSkills(defaultCategories, defaultRules.relationships, skills);

  // Override generatedAt with fixed string to avoid unnecessary diffs
  matrix.generatedAt = "build";

  // Resolve stacks from defaultStacks
  matrix.suggestedStacks = defaultStacks.map((stack) => resolveStack(stack, skillIdSet));

  // Build agentDefinedDomains from agent metadata
  const agentDefinedDomains = Object.fromEntries(
    agentEntries.flatMap((a) => (a.domain === undefined ? [] : [[a.id, a.domain] as const])),
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

  const outPath = path.join(outDir, "matrix.ts");
  writeFileSync(outPath, lines.join("\n"));

  const skillCount = Object.keys(matrix.skills).length;
  const catCount = Object.keys(matrix.categories).length;
  const stackCount = matrix.suggestedStacks.length;

  console.log(`  ✓ ${outPath}`);
  console.log(`\n  Matrix: ${skillCount} skills, ${catCount} categories, ${stackCount} stacks\n`);
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

// -- Main --------------------------------------------------------------------

function generate(): void {
  console.log("Generating source types...\n");

  const skills = extractSkills(skillsSource);
  const agentEntries = extractAgents(cliRoot);
  const outDir = path.join(cliRoot, "src/cli/types/generated");

  // Phase 1: Generate source-types.ts
  const { skillIdSet } = generatePhase1(skills, agentEntries, outDir);

  // Phase 2: Generate matrix.ts
  generatePhase2(skills, agentEntries, skillIdSet, outDir);

  // Format generated files with prettier
  console.log("Formatting generated files...\n");
  execSync(`bunx prettier --write "${outDir}/"`, { stdio: "inherit" });
}

// Only run when executed directly (not when imported by tests)
const isDirectRun = process.argv[1] && import.meta.filename === process.argv[1];
if (isDirectRun) {
  generate();
}
