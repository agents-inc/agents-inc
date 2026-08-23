import { describe, it, expect } from "vitest";
import { defaultRules } from "../default-rules";
import { BUILT_IN_MATRIX } from "../../../types/generated/matrix";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { validateSelection } from "../../matrix/matrix-resolver";
import { typedKeys } from "../../../utils/typed-object";
import type { RelationshipDefinitions, SkillId, SkillSlug } from "../../../types";

/**
 * The quantities `.ai-docs/reference/features/built-in-catalogue.md` § "`defaultRules`" states
 * about this module, and which the count-ownership rule makes that document's alone.
 *
 * The docblock is the point of them. Three of these were already pinned here as bare literals
 * carrying no reference to that page, which is the arrangement that guarantees drift rather than
 * catching it: a rule added or removed reddens this file, the repair is a one-digit edit, and
 * nothing puts the person making it in front of the table stating the same number elsewhere. The
 * sibling `defaultStacks` suite had the pointer and this one did not.
 */
const EXPECTED_CONFLICT_GROUP_COUNT = 12;
const EXPECTED_REQUIRES_COUNT = 98;
const EXPECTED_ALTERNATIVES_COUNT = 42;
const EXPECTED_NEEDS_ANY_COUNT = 61;
const EXPECTED_DISTINCT_SLUG_COUNT = 176;

/**
 * Every slug a rule set names, whichever kind names it, deduplicated. A `requires` rule
 * contributes its own `skill` as well as its `needs` — the reading the document's total counts,
 * and the one `relationshipsForSource` narrows against.
 */
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

  // A group and its category would then state one fence twice, and the two spellings
  // can drift apart; the category is the one the picker renders.
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

  // Better Auth needs Drizzle, BullMQ needs Redis or Upstash. While one pick-one
  // category held all three, satisfying both rules at once was impossible and the
  // wizard offered no way through.
  it("lets a selection satisfy an auth rule and a queue rule at the same time", () => {
    initializeMatrix(BUILT_IN_MATRIX);
    const selection: SkillId[] = [
      "api-auth-better-auth-drizzle-hono",
      "api-queue-bullmq",
      "api-database-drizzle",
      "api-database-redis",
      "api-framework-hono",
    ];

    expect(validateSelection(selection).errors).toStrictEqual([]);
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

  // Plain `needs` is AND, so one rule says both — a second rule for the same
  // skill would be an OR-group's shape and would let either half stand alone.
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

  // A one-option choice and a plain need fence identically, so the file writes
  // the plain form and a single-member `needsAny` list never appears.
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
    // Expo requires React Native, which requires React — but nothing computes
    // that closure yet, so a rule naming only Expo would strand every bare
    // React Native app. Each list carries every framework that satisfies it.
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

    expect(
      choices,
      "built-in-catalogue.md states how many requires rules take the OR reading — move the number there in the same change",
    ).toHaveLength(EXPECTED_NEEDS_ANY_COUNT);
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

  // The two assertions guard each other and belong in one spec. The total alone cannot see a
  // slug swapped for another, and the resolution check alone is satisfied for free by an empty
  // list — which is what a broken collector above would hand it. The total is deliberately a
  // count rather than 176 literals: a swap that still resolves is a legitimate catalogue edit,
  // and the rules' contents are pinned entry-by-entry above only where they carry meaning.
  it("names only slugs the vendored catalogue can resolve", () => {
    const unresolvable = everyRuleSlug.filter(
      (slug) => BUILT_IN_MATRIX.slugMap.slugToId[slug] === undefined,
    );

    expect(
      everyRuleSlug,
      "built-in-catalogue.md states how many distinct slugs the built-in rules name",
    ).toHaveLength(EXPECTED_DISTINCT_SLUG_COUNT);
    expect(
      unresolvable,
      "a built-in slug naming nothing is narrowed out before resolution and warns about nothing, so this is the only place it is ever reported",
    ).toStrictEqual([]);
  });
});
