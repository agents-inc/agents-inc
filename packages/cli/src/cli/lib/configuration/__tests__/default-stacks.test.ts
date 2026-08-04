import { describe, it, expect } from "vitest";
import { typedEntries } from "../../../utils/typed-object";
import { defaultStacks } from "../default-stacks";

const EXPECTED_STACK_COUNT = 17;

/** Flat list of every (stack, agent, category) combination for parameterized tests */
const agentCategoryCases = defaultStacks.flatMap((stack) =>
  typedEntries(stack.agents).flatMap(([agentName, agentConfig]) => {
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
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            preloaded: expect.any(Boolean),
          }),
        ]),
      );
    },
  );

  it("nextjs-fullstack has web-developer with preloaded react framework", () => {
    const stack = defaultStacks.find((s) => s.id === "nextjs-fullstack")!;
    const webDev = stack.agents["web-developer"]!;
    expect(webDev["web-framework"]).toStrictEqual([{ id: "web-framework-react", preloaded: true }]);
  });
});
