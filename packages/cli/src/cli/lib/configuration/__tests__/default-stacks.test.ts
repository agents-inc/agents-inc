import { describe, it, expect } from "vitest";
import { typedEntries } from "../../../utils/typed-object";
import { defaultStacks } from "../default-stacks";
import { BUILT_IN_MATRIX } from "../../../types/generated/matrix";
import type { ResolvedSkill } from "../../../types";

const EXPECTED_STACK_COUNT = 17;

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

describe("defaultStacks", () => {
  it("has the expected number of stacks", () => {
    expect(defaultStacks).toHaveLength(EXPECTED_STACK_COUNT);
  });

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
