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
 * The taxonomy a known test skill carries. Fields are `string` rather than the
 * generated unions because fixtures deliberately use categories and slugs the
 * shipped catalogue has never heard of.
 */
type CanonicalTaxonomy = {
  domain: string;
  category: string;
  slug: string;
};

/**
 * Canonical taxonomy for known test skills, stated per ID — never read off the
 * ID's segments. createTestSkill() and createMockSkill() look up from here;
 * custom/novel skills must pass the fields they need in overrides, and an ID
 * that is in neither place is an error rather than a guess.
 *
 * Slugs match the shipped catalogue for IDs that exist in it, and are the
 * fixture's own value for the rest.
 *
 * Uses a lazy singleton to avoid circular initialization issues:
 * test-fixtures.ts calls createMockSkill() at module level during import,
 * and ESM hoists all imports before evaluating any `const` declarations.
 */
// eslint-disable-next-line no-var -- `var` avoids TDZ in circular ESM imports (let/const would throw)
var _canonicalSkillTaxonomy: Record<string, CanonicalTaxonomy> | undefined;
function getCanonicalSkillTaxonomy(): Record<string, CanonicalTaxonomy> {
  if (!_canonicalSkillTaxonomy) {
    _canonicalSkillTaxonomy = {
      "web-framework-react": { domain: "web", category: "web-framework", slug: "react" },
      "web-framework-vue-composition-api": {
        domain: "web",
        category: "web-framework",
        slug: "vue-composition-api",
      },
      "web-framework-original": { domain: "web", category: "web-framework", slug: "original" },
      "web-framework-simple": { domain: "web", category: "web-framework", slug: "simple" },
      "web-framework-arbitrary": { domain: "web", category: "web-framework", slug: "arbitrary" },
      "web-framework-unknown": { domain: "web", category: "web-framework", slug: "unknown" },
      "web-styling-tailwind": { domain: "web", category: "web-styling", slug: "tailwind" },
      "web-styling-scss-modules": { domain: "web", category: "web-styling", slug: "scss-modules" },
      "web-styling-custom": { domain: "web", category: "web-styling", slug: "custom" },
      "web-state-zustand": { domain: "web", category: "web-client-state", slug: "zustand" },
      "web-state-jotai": { domain: "web", category: "web-client-state", slug: "jotai" },
      "web-state-pinia": { domain: "web", category: "web-client-state", slug: "pinia" },
      "web-state-mobx": { domain: "web", category: "web-client-state", slug: "mobx" },
      "web-testing-vitest": { domain: "web", category: "web-testing", slug: "vitest" },
      "web-testing-copier": { domain: "web", category: "web-testing", slug: "copier" },
      "web-testing-metadata": { domain: "web", category: "web-testing", slug: "metadata" },
      "web-testing-playwright": { domain: "web", category: "web-testing", slug: "playwright" },
      "web-testing-cypress-e2e": { domain: "web", category: "web-e2e", slug: "cypress-e2e" },
      "web-testing-playwright-e2e": { domain: "web", category: "web-e2e", slug: "playwright-e2e" },
      "web-server-state-react-query": {
        domain: "web",
        category: "web-server-state",
        slug: "react-query",
      },
      "web-data-fetching-react-query": {
        domain: "web",
        category: "web-server-state",
        slug: "fetching-react-query",
      },
      "web-tooling-vite": { domain: "web", category: "shared-tooling", slug: "vite" },
      "web-tooling-acme": { domain: "web", category: "web-tooling", slug: "acme" },
      "web-tooling-custom": { domain: "web", category: "web-tooling", slug: "custom" },
      "web-tooling-nometadata": { domain: "web", category: "web-tooling", slug: "nometadata" },
      "web-tooling-personal": { domain: "web", category: "web-tooling", slug: "personal" },
      "web-tooling-valid": { domain: "web", category: "web-tooling", slug: "valid" },
      "web-tooling-incomplete": { domain: "web", category: "web-tooling", slug: "incomplete" },
      "web-tooling-my-skill": { domain: "web", category: "web-tooling", slug: "my-skill" },
      "web-tooling-forked-skill": { domain: "web", category: "web-tooling", slug: "forked-skill" },
      "web-tooling-test-minimal": { domain: "web", category: "web-tooling", slug: "test-minimal" },
      "web-tooling-local-skill": { domain: "web", category: "web-tooling", slug: "local-skill" },
      "web-skill-a": { domain: "web", category: "web-framework", slug: "a" },
      "web-skill-a-v": { domain: "web", category: "web-framework", slug: "a-v" },
      "web-skill-b": { domain: "web", category: "web-framework", slug: "b" },
      "web-skill-b-v": { domain: "web", category: "web-framework", slug: "b-v" },
      "web-skill-c": { domain: "web", category: "web-framework", slug: "c" },
      "web-skill-d": { domain: "web", category: "web-framework", slug: "d" },
      "web-skill-setup": { domain: "web", category: "web-framework", slug: "setup" },
      "web-skill-usage": { domain: "web", category: "web-framework", slug: "usage" },
      "web-local-skill": { domain: "web", category: "local", slug: "skill" },
      "web-custom-skill": { domain: "web", category: "web-framework", slug: "skill" },
      "web-missing-skill": { domain: "web", category: "web-framework", slug: "skill" },
      "web-unknown-skill": { domain: "web", category: "web-framework", slug: "skill" },
      "web-nonexistent-skill": { domain: "web", category: "web-framework", slug: "skill" },
      "ai-provider-cohere-sdk": { domain: "ai", category: "ai-provider", slug: "cohere-sdk" },
      "api-framework-hono": { domain: "api", category: "api-api", slug: "hono" },
      "api-framework-express": { domain: "api", category: "api-api", slug: "express" },
      "api-database-drizzle": { domain: "api", category: "api-orm", slug: "drizzle" },
      "api-queue-bullmq": { domain: "api", category: "api-queue", slug: "bullmq" },
      "api-security-auth-patterns": {
        domain: "api",
        category: "api-security",
        slug: "auth-patterns",
      },
      "shared-security-auth-security": {
        domain: "shared",
        category: "shared-security",
        slug: "auth-security",
      },
      "api-observability-datadog": {
        domain: "api",
        category: "api-observability",
        slug: "datadog",
      },
      "api-monitoring-sentry": { domain: "api", category: "api-observability", slug: "sentry" },
      "cli-framework-commander": { domain: "cli", category: "cli-framework", slug: "commander" },
      "infra-setup-env": { domain: "infra", category: "infra-config", slug: "env" },
      "infra-tooling-linter": { domain: "infra", category: "unmapped-category", slug: "linter" },
      "infra-tooling-docker": { domain: "infra", category: "shared-tooling", slug: "docker" },
      "infra-ci-cd-github-actions": {
        domain: "infra",
        category: "infra-ci-cd",
        slug: "github-actions",
      },
      "infra-ci-cd-gitlab-ci": { domain: "infra", category: "infra-ci-cd", slug: "cd-gitlab-ci" },
      "web-accessibility-a11y": { domain: "web", category: "web-accessibility", slug: "a11y" },
      "web-animation-framer": { domain: "web", category: "web-animation", slug: "framer" },
      "meta-methodology-investigation": {
        domain: "meta",
        category: "meta-methodology",
        slug: "investigation",
      },
      "meta-methodology-success-criteria": {
        domain: "meta",
        category: "meta-methodology",
        slug: "success-criteria",
      },
      "meta-methodology-investigation-requirements": {
        domain: "meta",
        category: "meta-methodology",
        slug: "investigation-requirements",
      },
      "meta-methodology-anti-over-engineering": {
        domain: "meta",
        category: "meta-methodology",
        slug: "anti-over-engineering",
      },
      "meta-methodology-write-verification": {
        domain: "meta",
        category: "meta-methodology",
        slug: "write-verification",
      },
      "meta-methodology-improvement-protocol": {
        domain: "meta",
        category: "meta-methodology",
        slug: "improvement-protocol",
      },
      "meta-methodology-context-management": {
        domain: "meta",
        category: "meta-methodology",
        slug: "context-management",
      },
      "meta-methodology-research-methodology": {
        domain: "meta",
        category: "meta-methodology",
        slug: "research-methodology",
      },
      "meta-reviewing-reviewing": { domain: "meta", category: "meta-reviewing", slug: "reviewing" },
      "meta-reviewing-cli-reviewing": {
        domain: "meta",
        category: "meta-reviewing",
        slug: "cli-reviewing",
      },
      "meta-company-patterns": { domain: "meta", category: "local", slug: "patterns" },
      "meta-test-skill": { domain: "meta", category: "meta-reviewing", slug: "skill" },
      "web-framework-nonexistent": {
        domain: "web",
        category: "web-framework",
        slug: "nonexistent",
      },
      "web-framework-react-pro": { domain: "web", category: "web-framework", slug: "react-pro" },
      "web-framework-react-strict": {
        domain: "web",
        category: "web-framework",
        slug: "react-strict",
      },
      "web-framework-react-minimal": {
        domain: "web",
        category: "web-framework",
        slug: "react-minimal",
      },
    };
  }
  return _canonicalSkillTaxonomy;
}

/** Title-case each slug segment: "react-query" -> "React Query". */
function deriveDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Creates a TestSkill for disk-based integration tests (createTestSource).
 * Takes domain, category and slug from the canonical taxonomy, or from the
 * caller when it states all three. Nothing is read off the ID's segments, so a
 * marketplace-namespaced ID is refused rather than silently split into a
 * plausible-looking taxonomy.
 */
export function createTestSkill(
  id: SkillId,
  description: string,
  overrides?: Partial<TestSkill>,
): TestSkill {
  const canonical = getCanonicalSkillTaxonomy()[id];
  const domain = overrides?.domain ?? canonical?.domain;
  const category = overrides?.category ?? canonical?.category;
  const slug = overrides?.slug ?? canonical?.slug;

  if (!domain || !category || !slug) {
    throw new Error(
      `createTestSkill: "${id}" not in canonical registry — provide { domain, category, slug } in overrides`,
    );
  }

  return {
    id,
    // Boundary cast: fixture slugs are outside the generated SkillSlug union
    slug: slug as SkillSlug,
    displayName: deriveDisplayName(slug),
    description,
    category,
    author: "@test",
    domain,
    ...overrides,
  };
}

export function createMockSkill(id: SkillId, overrides?: Partial<ResolvedSkill>): ResolvedSkill {
  const canonical = getCanonicalSkillTaxonomy()[id];
  const category = overrides?.category ?? canonical?.category;
  const slug = overrides?.slug ?? canonical?.slug;

  if (!category || !slug) {
    throw new Error(
      `createMockSkill: "${id}" not in canonical registry — provide { category, slug } in overrides`,
    );
  }

  return {
    id,
    // Boundary cast: fixture slugs are outside the generated SkillSlug union
    slug: slug as SkillSlug,
    displayName: deriveDisplayName(slug),
    description: `${id} skill`,
    // Boundary cast: fixture categories include values outside the Category union
    category: category as CategoryPath,
    author: "@test",
    conflictsWith: [],
    requires: [],
    alternatives: [],
    discourages: [],
    path: `skills/${category}/${id}/`,
    ...overrides,
  };
}

/**
 * Creates a mock ExtractedSkillMetadata for testing — what extractAllSkills()
 * returns for one skill. Takes domain, category and slug from the canonical
 * taxonomy, or from the caller when it states them. Nothing is read off the
 * ID's segments, so a marketplace-namespaced ID is refused rather than silently
 * split into a plausible-looking taxonomy.
 *
 * directoryPath is the layout createTestSource writes and extractAllSkills
 * therefore reads back — the resolved category, then the whole ID as the
 * directory name. The ID is a directory name here, not a source of fields.
 */
export function createMockExtractedSkill(
  id: SkillId,
  overrides?: Partial<ExtractedSkillMetadata>,
): ExtractedSkillMetadata {
  const canonical = getCanonicalSkillTaxonomy()[id];
  const domain = overrides?.domain ?? canonical?.domain;
  const category = overrides?.category ?? canonical?.category;
  const slug = overrides?.slug ?? canonical?.slug;

  if (!domain || !category || !slug) {
    throw new Error(
      `createMockExtractedSkill: "${id}" not in canonical registry — provide { domain, category, slug } in overrides`,
    );
  }

  const directoryPath = `${category}/${id}`;

  return {
    id,
    directoryPath,
    description: `${id} skill`,
    // Boundary cast: fixture categories include values outside the Category union
    category: category as CategoryPath,
    author: "@test",
    path: `skills/${directoryPath}/`,
    // Boundary cast: fixture domains include values outside the Domain union
    domain: domain as Domain,
    displayName: deriveDisplayName(slug),
    // Boundary cast: fixture slugs are outside the generated SkillSlug union
    slug: slug as SkillSlug,
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

/**
 * Generic over the id rather than fixed to `SkillId` so a caller keeps whatever
 * narrowness it brought: a catalogue literal still yields a `SkillAssignment`,
 * while a marketplace-namespaced fixture id — which is not a member of the
 * generated union — yields the same shape with `id: string`. Widening the
 * parameter to `string` outright would have made the return type unbuildable
 * without an `as SkillId` cast, which CLAUDE.md bans for fabricated ids.
 */
export function createMockSkillAssignment<Id extends string>(
  id: Id,
  preloaded = false,
): Omit<SkillAssignment, "id"> & { id: Id } {
  return { id, preloaded };
}

/** Terse alias of createMockSkillAssignment for stack/assignment fixtures. */
export const sa = <Id extends string>(
  id: Id,
  preloaded = false,
): Omit<SkillAssignment, "id"> & { id: Id } => createMockSkillAssignment(id, preloaded);

/**
 * An assignment that states only WHICH skill an agent gets — the built-in
 * stacks' shape, and the one a user's saved config carries for a lazy skill.
 * Distinct from `sa(id)`, which writes `preloaded: false` and is therefore
 * somebody's word for the load.
 */
export const saUnflagged = <Id extends string>(
  id: Id,
): Omit<SkillAssignment, "id"> & { id: Id } => ({
  id,
});

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
    ...(activeSource !== undefined && { activeSource }),
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
