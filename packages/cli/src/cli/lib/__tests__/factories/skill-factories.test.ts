import { describe, expect, it } from "vitest";
import type { CategoryPath, SkillId, SkillSlug } from "../../../types";
import { createMockExtractedSkill, createMockSkill, createTestSkill } from "./skill-factories.js";

const DESCRIPTION = "A skill used by the factory tests";

/** In the canonical taxonomy, and its trailing segments happen to equal its slug. */
const CANONICAL_ID: SkillId = "web-framework-react";

/**
 * In the canonical taxonomy, and its trailing segments do NOT equal its slug:
 * the catalogue's slug is "react-query", while the id's segments after the
 * domain and category read "state-react-query".
 */
const SLUG_UNLIKE_ID: SkillId = "web-server-state-react-query";

/**
 * In the canonical taxonomy, and its first two segments do NOT equal its
 * category: the shipped catalogue files it under "api-orm", while the id reads
 * "api" then "database".
 */
const CATEGORY_UNLIKE_ID: SkillId = "api-database-drizzle";

/**
 * Same, on the domain axis's neighbour: the catalogue files this under
 * "web-client-state" while the id's first two segments read "web-state".
 */
const CLIENT_STATE_ID: SkillId = "web-state-zustand";

// Boundary cast: a marketplace-namespaced id is not a member of the generated
// union, and this is the error path — the factory must refuse it rather than
// read a taxonomy off its segments.
const NAMESPACED_ID = "e2e-web-framework-react" as SkillId;

// Boundary cast: an id no registry knows, for the error path.
const UNREGISTERED_ID = "web-nonsuch-thing" as SkillId;

describe("createTestSkill", () => {
  it("takes the whole taxonomy from the canonical registry for a known id", () => {
    expect(createTestSkill(CANONICAL_ID, DESCRIPTION)).toStrictEqual({
      id: CANONICAL_ID,
      slug: "react",
      displayName: "React",
      description: DESCRIPTION,
      category: "web-framework",
      author: "@test",
      domain: "web",
    });
  });

  it("reads slug from the registry rather than from the id's trailing segments", () => {
    const skill = createTestSkill(SLUG_UNLIKE_ID, DESCRIPTION);

    expect(skill.slug).toBe("react-query");
    expect(skill.displayName).toBe("React Query");
  });

  it("refuses a namespaced id rather than splitting it into a taxonomy", () => {
    expect(() => createTestSkill(NAMESPACED_ID, DESCRIPTION)).toThrow(
      'createTestSkill: "e2e-web-framework-react" not in canonical registry',
    );
  });

  it("refuses an id absent from the registry rather than fabricating a category", () => {
    expect(() => createTestSkill(UNREGISTERED_ID, DESCRIPTION)).toThrow(
      'createTestSkill: "web-nonsuch-thing" not in canonical registry',
    );
  });

  it("accepts an unknown id when the caller states domain, category and slug", () => {
    expect(
      createTestSkill(NAMESPACED_ID, DESCRIPTION, {
        domain: "web",
        category: "web-framework",
        slug: "react" as SkillSlug,
        displayName: "React",
      }),
    ).toStrictEqual({
      id: NAMESPACED_ID,
      slug: "react",
      displayName: "React",
      description: DESCRIPTION,
      category: "web-framework",
      author: "@test",
      domain: "web",
    });
  });

  it("lets a stated slug override the canonical one", () => {
    const skill = createTestSkill(CANONICAL_ID, DESCRIPTION, { slug: "preact" as SkillSlug });

    expect(skill.slug).toBe("preact");
    expect(skill.displayName).toBe("Preact");
  });
});

describe("createMockSkill", () => {
  it("takes category and slug from the canonical registry for a known id", () => {
    expect(createMockSkill(CANONICAL_ID)).toStrictEqual({
      id: CANONICAL_ID,
      slug: "react",
      displayName: "React",
      description: "web-framework-react skill",
      category: "web-framework",
      author: "@test",
      conflictsWith: [],
      requires: [],
      alternatives: [],
      discourages: [],
      path: "skills/web-framework/web-framework-react/",
    });
  });

  it("reads slug from the registry rather than from the id's trailing segments", () => {
    const skill = createMockSkill(SLUG_UNLIKE_ID);

    expect(skill.slug).toBe("react-query");
    expect(skill.displayName).toBe("React Query");
  });

  it("refuses a namespaced id rather than splitting it into a slug", () => {
    expect(() => createMockSkill(NAMESPACED_ID)).toThrow(
      'createMockSkill: "e2e-web-framework-react" not in canonical registry',
    );
  });

  it("refuses an unknown id carrying only a stated category", () => {
    expect(() => createMockSkill(UNREGISTERED_ID, { category: "web-framework" })).toThrow(
      'createMockSkill: "web-nonsuch-thing" not in canonical registry',
    );
  });

  it("accepts an unknown id when the caller states category and slug", () => {
    const skill = createMockSkill(UNREGISTERED_ID, {
      category: "web-framework",
      slug: "nonsuch" as SkillSlug,
    });

    expect(skill.category).toBe("web-framework");
    expect(skill.slug).toBe("nonsuch");
    expect(skill.displayName).toBe("Nonsuch");
  });
});

describe("createMockExtractedSkill", () => {
  it("takes the whole taxonomy from the canonical registry for a known id", () => {
    expect(createMockExtractedSkill(CANONICAL_ID)).toStrictEqual({
      id: CANONICAL_ID,
      slug: "react",
      displayName: "React",
      description: "web-framework-react skill",
      category: "web-framework",
      author: "@test",
      domain: "web",
      directoryPath: "web-framework/web-framework-react",
      path: "skills/web-framework/web-framework-react/",
    });
  });

  it("reads slug from the registry rather than from the id's trailing segments", () => {
    const skill = createMockExtractedSkill(SLUG_UNLIKE_ID);

    expect(skill.slug).toBe("react-query");
    expect(skill.displayName).toBe("React Query");
  });

  it("reads category from the registry rather than joining the id's first two segments", () => {
    const skill = createMockExtractedSkill(CATEGORY_UNLIKE_ID);

    expect(skill.category).toBe("api-orm");
    expect(skill.domain).toBe("api");
  });

  it("locates the skill by its resolved category and whole id, never by split segments", () => {
    const skill = createMockExtractedSkill(CLIENT_STATE_ID);

    expect(skill.directoryPath).toBe("web-client-state/web-state-zustand");
    expect(skill.path).toBe("skills/web-client-state/web-state-zustand/");
  });

  it("refuses a namespaced id rather than splitting it into a taxonomy", () => {
    expect(() => createMockExtractedSkill(NAMESPACED_ID)).toThrow(
      'createMockExtractedSkill: "e2e-web-framework-react" not in canonical registry',
    );
  });

  it("refuses an id absent from the registry rather than fabricating one", () => {
    expect(() => createMockExtractedSkill(UNREGISTERED_ID)).toThrow(
      'createMockExtractedSkill: "web-nonsuch-thing" not in canonical registry',
    );
  });

  it("refuses an unknown id carrying only a stated category", () => {
    expect(() => createMockExtractedSkill(UNREGISTERED_ID, { category: "web-framework" })).toThrow(
      'createMockExtractedSkill: "web-nonsuch-thing" not in canonical registry',
    );
  });

  it("accepts an unknown id when the caller states domain, category and slug", () => {
    expect(
      createMockExtractedSkill(NAMESPACED_ID, {
        domain: "web",
        category: "web-framework",
        slug: "react" as SkillSlug,
      }),
    ).toStrictEqual({
      id: NAMESPACED_ID,
      slug: "react",
      displayName: "React",
      description: "e2e-web-framework-react skill",
      category: "web-framework",
      author: "@test",
      domain: "web",
      directoryPath: "web-framework/e2e-web-framework-react",
      path: "skills/web-framework/e2e-web-framework-react/",
    });
  });

  it("lets a stated taxonomy override the canonical one", () => {
    const skill = createMockExtractedSkill(CANONICAL_ID, {
      // Boundary cast: a category the generated union has never heard of
      category: "devops-iac" as CategoryPath,
      domain: "cli",
      slug: "preact" as SkillSlug,
    });

    expect(skill.category).toBe("devops-iac");
    expect(skill.domain).toBe("cli");
    expect(skill.slug).toBe("preact");
    expect(skill.displayName).toBe("Preact");
    expect(skill.directoryPath).toBe("devops-iac/web-framework-react");
  });

  it("lets a stated path stand rather than composing one", () => {
    const skill = createMockExtractedSkill(CANONICAL_ID, { path: "skills/react-copy/" });

    expect(skill.path).toBe("skills/react-copy/");
  });
});
