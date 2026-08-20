import { describe, it, expect } from "vitest";
import { typedEntries, typedKeys } from "../../../utils/typed-object";
import { defaultStacks } from "../default-stacks";
import { BUILT_IN_MATRIX } from "../../../types/generated/matrix";
import type { AgentName, Category, ResolvedSkill, SkillAssignment, SkillId } from "../../../types";

const EXPECTED_STACK_COUNT = 17;

/**
 * The quantities `.ai-docs/reference/features/built-in-catalogue.md` § "Structural invariants"
 * states about this module, and which the count-ownership rule makes that document's alone.
 *
 * They are here because they were hand-maintained until they were not: every number in that
 * section — assignment total, alias count, agent roster — had rotted at once by the time an
 * audit read them, and nothing had gone red. `EXPECTED_STACK_COUNT` above was the only one the
 * suite held, so it was the only one still true.
 */
const EXPECTED_ASSIGNMENT_TOTAL = 1542;

/** Agent slots holding each hoisted array. One number for both, and the document says so. */
const EXPECTED_SHARED_ALIAS_SLOTS = 47;

/**
 * The two categories whose value every stack takes from one hoisted array rather than writing
 * its own, and what each array holds. Members rather than a count: a swap inside either array
 * leaves every count in this file green.
 */
const SHARED_ALIAS_MEMBERS = {
  "shared-tooling": ["shared-tooling-typescript-config", "shared-tooling-git-hooks"],
  "shared-lint": ["shared-tooling-eslint-prettier"],
} as const satisfies Partial<Record<Category, readonly SkillId[]>>;

const SHARED_ALIAS_CATEGORIES = typedKeys(SHARED_ALIAS_MEMBERS);

/**
 * The sub-agents the whole catalogue assigns to, which the document states as a count. Named
 * here instead: a count cannot tell a retired agent from a swapped one, and the two retired
 * names it once carried were exactly that shape.
 *
 * Fewer than `AGENT_NAMES` on purpose — five built-ins sit on no stack at all, which is the
 * document's own claim in the same paragraph.
 */
const EXPECTED_STACK_AGENT_NAMES = [
  "agent-summoner",
  "api-developer",
  "api-researcher",
  "cli-developer",
  "cli-researcher",
  "cli-tester",
  "codex-keeper",
  "pm",
  "reviewer",
  "skill-summoner",
  "web-developer",
  "web-researcher",
  "web-tester",
] as const satisfies readonly AgentName[];

/** Flat list of every (stack, agent, category) combination for parameterized tests */
const agentCategoryCases = defaultStacks.flatMap((stack) =>
  typedEntries(stack.agents).flatMap(([agentName, agentConfig]) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    if (agentConfig == null) return [];
    return typedEntries(agentConfig).map(([category, assignments]) => ({
      stackId: stack.id,
      agentName,
      category,
      assignments,
    }));
  }),
);

/** Every assignment the catalogue holds, in one list, whichever slot it sits in. */
const everyAssignment: SkillAssignment[] = agentCategoryCases.flatMap(
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
  ({ assignments }) => assignments ?? [],
);

/** The array objects filed under one category, one entry per agent slot that names it. */
function slotsFiledUnder(category: Category): SkillAssignment[][] {
  return agentCategoryCases
    .filter((slot) => slot.category === category)
    .flatMap(({ assignments }) =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
      assignments === undefined ? [] : [assignments],
    );
}

describe("defaultStacks", () => {
  it("has the expected number of stacks", () => {
    expect(defaultStacks).toHaveLength(EXPECTED_STACK_COUNT);
  });

  it("assigns skills to the sub-agents the catalogue document names", () => {
    const assigned = [...new Set(agentCategoryCases.map((slot) => slot.agentName))].sort();

    expect(
      assigned,
      "built-in-catalogue.md names which sub-agents the catalogue reaches and which built-ins it leaves empty",
    ).toStrictEqual([...EXPECTED_STACK_AGENT_NAMES].sort());
  });

  it("holds the assignment total the catalogue document states", () => {
    expect(
      everyAssignment.length,
      "built-in-catalogue.md states this catalogue's assignment total — move the number there in the same change",
    ).toBe(EXPECTED_ASSIGNMENT_TOTAL);
  });

  // The per-slot spec below says no INDIVIDUAL slot states a load. This says the same thing
  // about the catalogue as one body, which is the form built-in-catalogue.md states it in — a
  // slot the flattening above misses would satisfy the per-slot spec by never being visited.
  it("states no load opinion anywhere in the catalogue", () => {
    const flagged = everyAssignment.filter((assignment) => assignment.preloaded !== undefined);

    expect(
      flagged,
      "a built-in stack says which skills an agent gets — how each loads is PRELOAD_DEFAULTS' answer",
    ).toStrictEqual([]);
  });

  it.each(SHARED_ALIAS_CATEGORIES)(
    "gives every %s slot the one hoisted array rather than a copy",
    (category) => {
      const slots = slotsFiledUnder(category);
      const distinct = [...new Set(slots)];

      expect(
        slots,
        `built-in-catalogue.md states how many agent slots alias the hoisted ${category} array`,
      ).toHaveLength(EXPECTED_SHARED_ALIAS_SLOTS);
      expect(
        distinct,
        `every ${category} slot must hold the SAME array object — editing the hoisted constant is what edits all of them, and an inlined copy silently opts one stack out`,
      ).toStrictEqual([SHARED_ALIAS_MEMBERS[category].map((id) => ({ id }))]);
    },
  );

  it("includes nextjs-fullstack with correct fields", () => {
    const stack = defaultStacks.find((s) => s.id === "nextjs-fullstack")!;
    expect(stack.name).toBe("Next.js Full-Stack");
    expect(stack.description).toBe("Hono, Drizzle, Better Auth, Zustand");
    expect(stack.philosophy).toBe("Ship fast, iterate faster");
  });

  it("includes angular-modern-fullstack with correct fields", () => {
    const stack = defaultStacks.find((s) => s.id === "angular-modern-fullstack")!;
    expect(stack.name).toBe("Angular Modern Full-Stack");
    expect(stack.philosophy).toBe("Enterprise-grade and type-safe");
  });

  it("includes solidjs-fullstack", () => {
    const stack = defaultStacks.find((s) => s.id === "solidjs-fullstack")!;
    expect(stack.name).toBe("SolidJS Full-Stack");
  });

  it.each(defaultStacks)("stack $id has required fields", (stack) => {
    expect(stack.id).not.toBe("");
    expect(stack.name).not.toBe("");
    expect(stack.description).not.toBe("");
    expect(typeof stack.agents).toBe("object");
  });

  it.each(agentCategoryCases)(
    "$stackId > $agentName > $category has normalized SkillAssignment[] values",
    ({ assignments }) => {
      expect(Array.isArray(assignments)).toBe(true);
      expect(assignments).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
      );
    },
  );

  it.each(agentCategoryCases)(
    "$stackId > $agentName > $category carries no load opinion",
    ({ assignments }) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
      const flagged = (assignments ?? []).filter((a) => a.preloaded !== undefined);

      expect(
        flagged,
        "a built-in stack says which skills an agent gets — how each loads is the shared mapping's answer",
      ).toStrictEqual([]);
    },
  );

  // A stack keys by category, so a skill filed under a key it no longer belongs to
  // is the stale-key shape that goes schema-invalid the moment the enum regenerates.
  it("files every assignment under the category its skill actually sits in", () => {
    const misfiled = agentCategoryCases.flatMap(({ stackId, agentName, category, assignments }) =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
      (assignments ?? [])
        .map((assignment) => BUILT_IN_MATRIX.skills[assignment.id])
        .filter((skill): skill is ResolvedSkill => skill != null && skill.category !== category)
        .map((skill) => `${stackId} > ${agentName} > ${category} holds ${skill.id}`),
    );

    expect(misfiled).toStrictEqual([]);
  });

  it("files the browser driver apart from the unit runner it ships beside", () => {
    const testerStacks = defaultStacks.filter(
      (stack) => stack.agents["web-tester"]?.["web-e2e"] != null,
    );

    expect(testerStacks.length).toBeGreaterThan(0);
    for (const stack of testerStacks) {
      const tester = stack.agents["web-tester"]!;
      expect(tester["web-e2e"]).toStrictEqual([{ id: "web-testing-playwright-e2e" }]);
      expect(tester["web-testing"]).toStrictEqual([{ id: "web-testing-vitest" }]);
    }
  });

  it("files the ORM under the data-access category rather than the retired database bucket", () => {
    const stack = defaultStacks.find((s) => s.id === "nextjs-fullstack")!;

    expect(stack.agents["api-developer"]!["api-orm"]).toStrictEqual([
      { id: "api-database-drizzle" },
    ]);
  });

  it("files tRPC under the RPC category it no longer shares with the query caches", () => {
    const stack = defaultStacks.find((s) => s.id === "nextjs-t3-stack")!;

    expect(stack.agents["web-developer"]!["web-rpc"]).toStrictEqual([
      { id: "web-data-fetching-trpc" },
    ]);
    expect(stack.agents["web-developer"]!["web-server-state"]).toBeUndefined();
  });

  it("nextjs-fullstack gives web-developer the react framework", () => {
    const stack = defaultStacks.find((s) => s.id === "nextjs-fullstack")!;
    const webDev = stack.agents["web-developer"]!;
    expect(webDev["web-framework"]).toStrictEqual([{ id: "web-framework-react" }]);
  });
});
