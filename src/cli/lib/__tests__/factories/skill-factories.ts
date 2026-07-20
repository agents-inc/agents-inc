import type {
  CategoryPath,
  Domain,
  ExtractedSkillMetadata,
  ResolvedSkill,
  Skill,
  SkillAssignment,
  SkillDefinition,
  SkillId,
  SkillSlug,
  SkillSource,
  SkillSourceType,
} from "../../../types";
import type { CopiedSkill } from "../../skills";
import type { TestSkill } from "../fixtures/create-test-source";

/**
 * Canonical category for known test skills.
 * createMockSkill() looks up from here when no category override is provided.
 * Custom/novel skills must pass { category } in overrides.
 *
 * Uses a lazy singleton to avoid circular initialization issues:
 * test-fixtures.ts calls createMockSkill() at module level during import,
 * and ESM hoists all imports before evaluating any `const` declarations.
 */
// eslint-disable-next-line no-var -- `var` avoids TDZ in circular ESM imports (let/const would throw)
// Boundary cast: test factory maps arbitrary skill IDs to category strings (not all are valid Category union members)
var _canonicalSkillCategories: Record<string, string> | undefined;
function getCanonicalSkillCategories(): Record<string, string> {
  if (!_canonicalSkillCategories) {
    _canonicalSkillCategories = {
      "web-framework-react": "web-framework",
      "web-framework-vue-composition-api": "web-framework",
      "web-framework-original": "web-framework",
      "web-framework-simple": "web-framework",
      "web-framework-arbitrary": "web-framework",
      "web-framework-unknown": "web-framework",
      "web-styling-tailwind": "web-styling",
      "web-styling-scss-modules": "web-styling",
      "web-styling-custom": "web-styling",
      "web-state-zustand": "web-client-state",
      "web-state-pinia": "web-client-state",
      "web-state-mobx": "web-client-state",
      "web-testing-vitest": "web-testing",
      "web-testing-copier": "web-testing",
      "web-testing-metadata": "web-testing",
      "web-testing-playwright": "web-testing",
      "web-testing-cypress-e2e": "web-testing",
      "web-testing-playwright-e2e": "web-testing",
      "web-server-state-react-query": "web-server-state",
      "web-data-fetching-react-query": "web-server-state",
      "web-tooling-vite": "shared-tooling",
      "web-tooling-acme": "web-tooling",
      "web-tooling-custom": "web-tooling",
      "web-tooling-nometadata": "web-tooling",
      "web-tooling-personal": "web-tooling",
      "web-tooling-valid": "web-tooling",
      "web-tooling-incomplete": "web-tooling",
      "web-tooling-my-skill": "web-tooling",
      "web-tooling-forked-skill": "web-tooling",
      "web-tooling-test-minimal": "web-tooling",
      "web-tooling-local-skill": "web-tooling",
      "web-skill-a": "web-framework",
      "web-skill-a-v": "web-framework",
      "web-skill-b": "web-framework",
      "web-skill-b-v": "web-framework",
      "web-skill-c": "web-framework",
      "web-skill-d": "web-framework",
      "web-skill-setup": "web-framework",
      "web-skill-usage": "web-framework",
      "web-local-skill": "local",
      "web-custom-skill": "web-framework",
      "web-missing-skill": "web-framework",
      "web-unknown-skill": "web-framework",
      "web-nonexistent-skill": "web-framework",
      "api-framework-hono": "api-api",
      "api-framework-express": "api-api",
      "api-database-drizzle": "api-database",
      "api-security-auth-patterns": "api-security",
      "api-observability-datadog": "api-observability",
      "cli-framework-commander": "cli-framework",
      "infra-setup-env": "infra-config",
      "infra-tooling-linter": "unmapped-category",
      "infra-tooling-docker": "shared-tooling",
      "infra-ci-cd-github-actions": "infra-ci-cd",
      "infra-ci-cd-gitlab-ci": "infra-ci-cd",
      "web-accessibility-a11y": "web-accessibility",
      "web-animation-framer": "web-animation",
      "meta-methodology-investigation": "meta-methodology",
      "meta-methodology-success-criteria": "meta-methodology",
      "meta-methodology-investigation-requirements": "meta-methodology",
      "meta-methodology-anti-over-engineering": "meta-methodology",
      "meta-methodology-write-verification": "meta-methodology",
      "meta-methodology-improvement-protocol": "meta-methodology",
      "meta-methodology-context-management": "meta-methodology",
      "meta-methodology-research-methodology": "meta-methodology",
      "meta-reviewing-reviewing": "meta-reviewing",
      "meta-reviewing-cli-reviewing": "meta-reviewing",
      "meta-company-patterns": "local",
      "meta-test-skill": "meta-reviewing",
      "web-framework-nonexistent": "web-framework",
      "web-framework-react-pro": "web-framework",
      "web-framework-react-strict": "web-framework",
      "web-framework-react-minimal": "web-framework",
    };
  }
  return _canonicalSkillCategories;
}

/** Maps non-domain SkillIdPrefix values to their corresponding Domain */
const DOMAIN_PREFIX_MAP: Record<string, Domain> = {
  meta: "meta",
  infra: "infra",
  security: "shared",
};

/** Strip the domain-category prefix: "web-framework-react" -> "react". */
function deriveSlugFromId(id: SkillId): SkillSlug {
  const segments = id.split("-");
  // Boundary cast: slug is derived from the ID's trailing segments
  return (segments.length >= 3 ? segments.slice(2).join("-") : id) as SkillSlug;
}

/** Title-case each slug segment: "react-query" -> "React Query". */
function deriveDisplayName(slug: SkillSlug): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Creates a TestSkill for disk-based integration tests (createTestSource).
 * Derives slug, displayName, domain, and category from the skill ID,
 * using the canonical category registry for correct category mapping.
 */
export function createTestSkill(
  id: SkillId,
  description: string,
  overrides?: Partial<TestSkill>,
): TestSkill {
  const segments = id.split("-");
  const rawPrefix = segments[0] ?? "web";
  const domain = (DOMAIN_PREFIX_MAP[rawPrefix] ?? rawPrefix) as Domain;
  const canonicalCategories = getCanonicalSkillCategories();
  // Boundary cast: category registry returns arbitrary strings for non-canonical IDs
  const category = (canonicalCategories[id] ?? `${segments[0]}-${segments[1]}`) as CategoryPath;
  const slug = deriveSlugFromId(id);
  const displayName = deriveDisplayName(slug);

  return {
    id,
    slug,
    displayName,
    description,
    category,
    author: "@test",
    domain,
    ...overrides,
  };
}

export function createMockSkill(id: SkillId, overrides?: Partial<ResolvedSkill>): ResolvedSkill {
  // Boundary cast: category registry returns arbitrary strings for non-canonical IDs
  const category = (overrides?.category ?? getCanonicalSkillCategories()[id]) as
    | CategoryPath
    | undefined;

  if (!category) {
    throw new Error(
      `createMockSkill: "${id}" not in canonical registry — provide { category } in overrides`,
    );
  }

  const defaultSlug = deriveSlugFromId(id);
  const defaultDisplayName = deriveDisplayName(defaultSlug);

  return {
    id,
    slug: defaultSlug,
    displayName: defaultDisplayName,
    description: `${id} skill`,
    category,
    author: "@test",
    conflictsWith: [],
    isRecommended: false,
    requires: [],
    alternatives: [],
    discourages: [],
    compatibleWith: [],
    path: `skills/${category}/${id}/`,
    ...overrides,
  };
}

/**
 * Creates a mock ExtractedSkillMetadata for testing.
 * Used when mocking extractAllSkills() return values.
 */
export function createMockExtractedSkill(
  id: SkillId,
  overrides?: Partial<ExtractedSkillMetadata>,
): ExtractedSkillMetadata {
  // Derive directory path and category from the skill ID convention: "domain-category-name"
  const segments = id.split("-");
  const domain = segments[0] ?? "web";
  const category = segments[1] ?? "framework";
  const name = segments.slice(2).join("-") || "skill";
  const directoryPath = `${domain}/${category}/${name}`;

  return {
    id,
    directoryPath,
    description: `${id} skill`,
    category: `${domain}-${category}` as CategoryPath,
    author: "@test",
    path: `skills/${directoryPath}/`,
    domain: domain as Domain,
    displayName: name,
    slug: name as SkillSlug,
    ...overrides,
  };
}

export function createMockSkillEntry(
  id: SkillId,
  preloaded = false,
  overrides?: Partial<Skill>,
): Skill {
  return {
    id,
    path: `skills/${id}/`,
    description: `${id} skill`,
    usage: `when working with ${id}`,
    preloaded,
    ...overrides,
  };
}

/** Convert a TestSkill (disk-based) to a ResolvedSkill (in-memory) for matrix creation. */
export function testSkillToResolvedSkill(
  skill: TestSkill,
  overrides?: Partial<ResolvedSkill>,
): ResolvedSkill {
  // Boundary cast: TestSkill.id is string, but in practice always a valid SkillId
  return createMockSkill(skill.id as SkillId, {
    description: skill.description,
    ...overrides,
  });
}

export function createMockSkillDefinition(
  id: SkillId,
  overrides?: Partial<SkillDefinition>,
): SkillDefinition {
  return {
    id,
    path: `skills/${id}/`,
    description: `${id} skill`,
    ...overrides,
  };
}

export function createMockSkillAssignment(id: SkillId, preloaded = false): SkillAssignment {
  return { id, preloaded };
}

/** Terse alias of createMockSkillAssignment for stack/assignment fixtures. */
export const sa = (id: SkillId, preloaded = false): SkillAssignment =>
  createMockSkillAssignment(id, preloaded);

/** Creates a CopiedSkill mock (the record copySkillsToLocalFlattened reports). */
export function createMockCopiedSkill(id: SkillId, overrides?: Partial<CopiedSkill>): CopiedSkill {
  return {
    skillId: id,
    contentHash: "abc123",
    sourcePath: `/source/skills/${id}`,
    destPath: `/project/.claude/skills/${id}`,
    ...overrides,
  };
}

/**
 * Creates a ResolvedSkill with availableSources annotation for multi-source testing.
 * Simulates what multi-source-loader.ts does after tagging.
 */
export function createMockMultiSourceSkill(
  id: SkillId,
  sources: SkillSource[],
  overrides?: Partial<ResolvedSkill>,
): ResolvedSkill {
  const activeSource = sources.find((s) => s.installed) ?? sources[0];
  return createMockSkill(id, {
    availableSources: sources,
    activeSource,
    ...overrides,
  });
}

export function createMockSkillSource(
  type: SkillSourceType,
  overrides?: Partial<SkillSource>,
): SkillSource {
  const defaults: Record<SkillSourceType, SkillSource> = {
    public: { name: "public", type: "public", installed: false },
    private: {
      name: "private-source",
      type: "private",
      url: "github:org/skills",
      installed: false,
    },
    local: { name: "eject", type: "local", installed: true, installMode: "eject" },
  };
  return { ...defaults[type], ...overrides };
}
