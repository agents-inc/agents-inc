import { describe, it, expect } from "vitest";
import { validateSelection } from "@workspace/compile";
import { defaultRules } from "../default-rules";
import { BUILT_IN_MATRIX } from "../../../types/generated/matrix";
import { typedKeys } from "../../../utils/typed-object";
import type { RelationshipDefinitions, SkillId, SkillSlug } from "../../../types";

const EXPECTED_CONFLICT_GROUP_COUNT = 12;
const EXPECTED_REQUIRES_COUNT = 98;
const EXPECTED_ALTERNATIVES_COUNT = 42;
const EXPECTED_NEEDS_ANY_COUNT = 61;
const EXPECTED_DISTINCT_SLUG_COUNT = 176;

/** A `requires` rule contributes its own `skill` as well as its `needs`. */
function collectEveryRuleSlug({
  conflicts,
  discourages,
  requires,
  alternatives,
}: RelationshipDefinitions): SkillSlug[] {
  return [
    ...new Set<SkillSlug>([
      ...conflicts.flatMap((group) => group.skills),
      ...discourages.flatMap((group) => group.skills),
      ...requires.flatMap((rule) => [rule.skill, ...rule.needs]),
      ...alternatives.flatMap((group) => group.skills),
    ]),
  ];
}

const everyRuleSlug = collectEveryRuleSlug(defaultRules.relationships);

/** Every skill a group named before its category became the fence that states the same thing. */
const SLUGS_WHOSE_GROUP_A_RADIO_NOW_REPLACES: SkillSlug[] = [
  "graphql-apollo",
  "playwright-e2e",
  "drizzle",
  "mongodb",
  "pinecone",
  "elasticsearch",
  "payload",
  "shadcn-ui",
  "docusaurus",
  "react-hook-form",
  "vee-validate",
  "supabase",
  "redis",
  "postgresql",
  "neon",
  "websockets",
];

describe("defaultRules", () => {
  it("has version and relationships", () => {
    expect(defaultRules.version).toBe("1.0.0");
    expect(typedKeys(defaultRules.relationships).sort()).toStrictEqual([
      "alternatives",
      "conflicts",
      "discourages",
      "requires",
    ]);
  });

  it("has conflict rules", () => {
    expect(defaultRules.relationships.conflicts).toHaveLength(EXPECTED_CONFLICT_GROUP_COUNT);
    expect(
      defaultRules.relationships.conflicts.find((c) => c.skills.includes("react")),
    ).toStrictEqual({
      skills: ["react", "vue-composition-api", "angular-standalone", "solidjs", "svelte"],
      reason: "Base frameworks are mutually exclusive",
    });
  });

  it("drops every group a pick-one category now states on its own", () => {
    const survivors = SLUGS_WHOSE_GROUP_A_RADIO_NOW_REPLACES.filter((slug) =>
      defaultRules.relationships.conflicts.some((group) => group.skills.includes(slug)),
    );

    expect(survivors).toStrictEqual([]);
  });

  it("keeps the monorepo task runners in a conflicts group alongside their pick-one category", () => {
    expect(
      defaultRules.relationships.conflicts.filter((c) => c.skills.includes("turborepo")),
    ).toStrictEqual([
      {
        skills: ["turborepo", "nx"],
        reason: "Monorepo build orchestrators are mutually exclusive",
      },
    ]);
  });

  it("leaves pnpm-workspaces out of every conflicts group, since it composes with either task runner", () => {
    expect(
      defaultRules.relationships.conflicts.filter((c) => c.skills.includes("pnpm-workspaces")),
    ).toStrictEqual([]);
  });

  it("lets a selection satisfy an auth rule and a queue rule at the same time", () => {
    const selection: SkillId[] = [
      "api-auth-better-auth-drizzle-hono",
      "api-queue-bullmq",
      "api-database-drizzle",
      "api-database-redis",
      "api-framework-hono",
    ];

    expect(validateSelection(selection, BUILT_IN_MATRIX).errors).toStrictEqual([]);
  });

  it("has require rules", () => {
    expect(defaultRules.relationships.requires).toHaveLength(EXPECTED_REQUIRES_COUNT);
    expect(defaultRules.relationships.requires.find((r) => r.skill === "zustand")).toStrictEqual({
      skill: "zustand",
      needs: ["react", "nextjs", "remix", "react-native"],
      needsAny: true,
      reason: "Skill teaches React/React Native patterns",
    });
  });

  // Plain `needs` is AND; a second rule for the same skill would read as OR.
  it("names both halves of an auth skill's surface in a single AND rule", () => {
    expect(
      defaultRules.relationships.requires.filter((r) => r.skill === "better-auth-drizzle-hono"),
    ).toStrictEqual([
      {
        skill: "better-auth-drizzle-hono",
        needs: ["drizzle", "hono"],
        reason:
          "Skill teaches Better Auth with the Drizzle adapter, mounted via Hono routes and typed Hono middleware",
      },
    ]);
  });

  it("states a lone requirement as a plain need rather than a one-option choice", () => {
    expect(
      defaultRules.relationships.requires.filter((r) => r.skill === "setup-axiom-pino-sentry"),
    ).toStrictEqual([
      {
        skill: "setup-axiom-pino-sentry",
        needs: ["nextjs"],
        reason:
          "Every pattern is the Next.js wiring — next-axiom, @sentry/nextjs, next.config.ts wrapping, instrumentation.ts; strip the Next slice and nothing followable remains",
      },
    ]);
  });

  it("spells a mobile requirement out flat rather than leaning on a chain of rules", () => {
    // Nothing computes the requires-closure, so each list names every framework that satisfies it.
    const reanimated = defaultRules.relationships.requires.find((r) => r.skill === "reanimated");

    expect(reanimated).toStrictEqual({
      skill: "reanimated",
      needs: ["react-native", "expo"],
      needsAny: true,
      reason: "Reanimated animates React Native via worklets",
    });
  });

  it("gives every requires rule a reason", () => {
    const unexplained = defaultRules.relationships.requires.filter((rule) => !rule.reason);
    expect(unexplained).toStrictEqual([]);
  });

  it("states most requirements as a choice rather than a conjunction", () => {
    const choices = defaultRules.relationships.requires.filter((rule) => rule.needsAny === true);

    expect(choices, "how many requires rules take the OR reading").toHaveLength(
      EXPECTED_NEEDS_ANY_COUNT,
    );
  });

  it("has alternative groups", () => {
    expect(defaultRules.relationships.alternatives).toHaveLength(EXPECTED_ALTERNATIVES_COUNT);
    expect(
      defaultRules.relationships.alternatives.find((a) => a.purpose === "Base Framework"),
    ).toStrictEqual({
      purpose: "Base Framework",
      skills: ["react", "vue-composition-api", "angular-standalone", "solidjs", "svelte"],
    });
  });

  it("has discourage rules (currently empty — conflicts prevent co-selection)", () => {
    expect(defaultRules.relationships.discourages).toStrictEqual([]);
  });

  // The total catches a swapped slug; the resolution check alone passes on an empty list.
  it("names only slugs the vendored catalogue can resolve", () => {
    const unresolvable = everyRuleSlug.filter(
      (slug) => BUILT_IN_MATRIX.slugMap.slugToId[slug] === undefined,
    );

    expect(everyRuleSlug, "how many distinct slugs the built-in rules name").toHaveLength(
      EXPECTED_DISTINCT_SLUG_COUNT,
    );
    expect(
      unresolvable,
      "a built-in slug naming nothing is narrowed out before resolution and warns about nothing, so this is the only place it is ever reported",
    ).toStrictEqual([]);
  });
});
