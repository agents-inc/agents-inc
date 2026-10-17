import { describe, it, expect } from "vitest";
import { typedEntries, typedFromEntries, typedKeys } from "../../../utils/typed-object";
import { defaultStacks } from "../default-stacks";
import { BUILT_IN_MATRIX } from "../../../types/generated/matrix";
import type { AgentName, Category, ResolvedSkill, SkillAssignment, SkillId } from "../../../types";

const EXPECTED_STACK_COUNT = 17;

const EXPECTED_ASSIGNMENT_TOTAL = 1542;

/** Agent slots holding each hoisted array — one number for both. */
const EXPECTED_SHARED_ALIAS_SLOTS = 47;

/** Members rather than a count: a swap inside either array leaves every count green. */
const SHARED_ALIAS_MEMBERS = {
  "shared-tooling": ["shared-tooling-typescript-config", "shared-tooling-git-hooks"],
  "shared-lint": ["shared-tooling-eslint-prettier"],
} as const satisfies Partial<Record<Category, readonly SkillId[]>>;

const SHARED_ALIAS_CATEGORIES = typedKeys(SHARED_ALIAS_MEMBERS);

/** By name: a count cannot tell a retired agent from a swapped one. Five sit on no stack. */
const EXPECTED_STACKS_PER_AGENT = {
  "agent-summoner": 17,
  "api-developer": 15,
  "api-researcher": 15,
  "cli-developer": 8,
  "cli-researcher": 1,
  "cli-tester": 8,
  "codex-keeper": 17,
  pm: 17,
  reviewer: 17,
  "skill-summoner": 17,
  "web-developer": 16,
  "web-researcher": 17,
  "web-tester": 16,
} as const satisfies Partial<Record<AgentName, number>>;

/** How many sub-agents each stack assigns to, keyed by stack id so the keys are the roster too. */
const EXPECTED_AGENT_COUNT_PER_STACK = {
  "nextjs-fullstack": 12,
  "nextjs-t3-stack": 10,
  "nextjs-supabase-fullstack": 12,
  "nextjs-turborepo-fullstack": 12,
  "react-old-school": 8,
  "react-hono-fullstack": 12,
  "remix-fullstack": 10,
  "sveltekit-fullstack": 10,
  "solidjs-fullstack": 10,
  "astro-content-fullstack": 10,
  "vue-modern-fullstack": 10,
  "nuxt-fullstack": 10,
  "angular-modern-fullstack": 10,
  "nextjs-ai-saas": 12,
  "nextjs-saas-starter": 12,
  "expo-mobile-fullstack": 12,
  "cli-ink-oclif": 9,
} as const satisfies Record<string, number>;

/** Pairs where a stack names an agent and files nothing under it, pinned by name. */
const EXPECTED_EMPTY_AGENT_SLOTS = [
  "expo-mobile-fullstack > cli-tester",
  "nextjs-ai-saas > cli-tester",
  "nextjs-fullstack > cli-tester",
  "nextjs-saas-starter > cli-tester",
  "nextjs-supabase-fullstack > cli-tester",
  "nextjs-turborepo-fullstack > cli-tester",
  "react-hono-fullstack > cli-tester",
] as const;

/** Members rather than a count: two categories exchanged leave the count intact. */
const EXPECTED_ASSIGNED_CATEGORIES = [
  "ai-orchestration",
  "ai-patterns",
  "ai-provider",
  "api-analytics",
  "api-api",
  "api-auth",
  "api-baas",
  "api-cms",
  "api-commerce",
  "api-email",
  "api-observability",
  "api-orm",
  "api-vector-db",
  "cli-framework",
  "infra-ci-cd",
  "meta-design",
  "meta-reviewing",
  "mobile-framework",
  "shared-lint",
  "shared-monorepo",
  "shared-task-runner",
  "shared-tooling",
  "web-accessibility",
  "web-client-state",
  "web-e2e",
  "web-forms",
  "web-framework",
  "web-meta-framework",
  "web-mocking",
  "web-routing",
  "web-rpc",
  "web-server-state",
  "web-styling",
  "web-testing",
  "web-tooling",
] as const satisfies readonly Category[];

/**
 * Members bind each id to the generated `SkillId` union, so a retired skill reddens its own line.
 */
const EXPECTED_ASSIGNED_SKILL_IDS = [
  "ai-orchestration-vercel-ai-sdk",
  "ai-patterns-tool-use-patterns",
  "ai-provider-anthropic-sdk",
  "api-analytics-posthog-analytics",
  "api-auth-better-auth-drizzle-hono",
  "api-auth-nextauth",
  "api-baas-supabase",
  "api-cms-sanity",
  "api-commerce-stripe",
  "api-database-drizzle",
  "api-database-prisma",
  "api-email-resend-react-email",
  "api-flags-posthog-flags",
  "api-framework-hono",
  "api-observability-axiom-pino-sentry",
  "api-vector-db-pinecone",
  "cli-framework-oclif-ink",
  "infra-ci-cd-github-actions",
  "meta-design-expressive-typescript",
  "meta-reviewing-cli-reviewing",
  "meta-reviewing-reviewing",
  "mobile-framework-expo",
  "mobile-framework-react-native",
  "shared-monorepo-pnpm-workspaces",
  "shared-monorepo-turborepo",
  "shared-tooling-eslint-prettier",
  "shared-tooling-git-hooks",
  "shared-tooling-typescript-config",
  "web-accessibility-web-accessibility",
  "web-data-fetching-trpc",
  "web-forms-zod-validation",
  "web-framework-angular-standalone",
  "web-framework-react",
  "web-framework-solidjs",
  "web-framework-svelte",
  "web-framework-vue-composition-api",
  "web-meta-framework-astro",
  "web-meta-framework-nextjs",
  "web-meta-framework-nuxt",
  "web-meta-framework-remix",
  "web-meta-framework-sveltekit",
  "web-mocks-msw",
  "web-routing-react-router",
  "web-server-state-react-query",
  "web-state-ngrx-signalstore",
  "web-state-pinia",
  "web-state-redux-toolkit",
  "web-state-zustand",
  "web-styling-scss-modules",
  "web-styling-tailwind",
  "web-testing-playwright-e2e",
  "web-testing-vitest",
  "web-tooling-vite",
] as const satisfies readonly SkillId[];

const agentCategoryCases = defaultStacks.flatMap((stack) =>
  typedEntries(stack.agents).flatMap(([agentName, agentConfig]) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
    if (agentConfig == null) return [];
    return typedEntries(agentConfig).map(([category, assignments]) => ({
      stackId: stack.id,
      agentName,
      category,
      assignments,
    }));
  }),
);

const everyAssignment: SkillAssignment[] = agentCategoryCases.flatMap(
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
  ({ assignments }) => assignments ?? [],
);

/** The array objects filed under one category, one entry per agent slot that names it. */
function slotsFiledUnder(category: Category): SkillAssignment[][] {
  return agentCategoryCases
    .filter((slot) => slot.category === category)
    .flatMap(({ assignments }) =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
      assignments === undefined ? [] : [assignments],
    );
}

/** One spelling, shared by two derivations and the failure message. */
function agentSlotLabel(stackId: string, agentName: AgentName): string {
  return `${stackId} > ${agentName}`;
}

const declaredAgentNames = defaultStacks.flatMap((stack) => typedKeys(stack.agents));

function stacksDeclaring(agentName: AgentName): number {
  return declaredAgentNames.filter((name) => name === agentName).length;
}

const stacksPerAgent = typedFromEntries(
  [...new Set(declaredAgentNames)].map(
    (agentName) => [agentName, stacksDeclaring(agentName)] as const,
  ),
);

const agentCountPerStack = Object.fromEntries(
  defaultStacks.map((stack) => [stack.id, typedKeys(stack.agents).length]),
);

const declaredAgentSlots = defaultStacks.flatMap((stack) =>
  typedKeys(stack.agents).map((agentName) => agentSlotLabel(stack.id, agentName)),
);

/** The same pairs, restricted to those filing at least one category — what the cases above visit. */
const filledAgentSlots = new Set(
  agentCategoryCases.map((slot) => agentSlotLabel(slot.stackId, slot.agentName)),
);

/** Declared and unfilled: the pairs where the two tallies above disagree. */
const emptyAgentSlots = declaredAgentSlots.filter((slot) => !filledAgentSlots.has(slot)).sort();

const assignedCategories = [...new Set(agentCategoryCases.map((slot) => slot.category))].sort();

const assignedSkillIds = [...new Set(everyAssignment.map((assignment) => assignment.id))].sort();

describe("defaultStacks", () => {
  it("has the expected number of stacks", () => {
    expect(defaultStacks).toHaveLength(EXPECTED_STACK_COUNT);
  });

  it("reaches each sub-agent on the expected number of stacks", () => {
    expect(
      stacksPerAgent,
      "which sub-agents the catalogue reaches, and how many stacks each one appears on",
    ).toStrictEqual(EXPECTED_STACKS_PER_AGENT);
  });

  it("gives each stack the expected number of sub-agents", () => {
    expect(agentCountPerStack, "how many sub-agents each stack assigns to").toStrictEqual(
      EXPECTED_AGENT_COUNT_PER_STACK,
    );
  });

  // The filled case beside the empty one: an empty list and a catalogue filing nothing read alike.
  it("names the stacks that declare a sub-agent and then file nothing under it", () => {
    expect(
      emptyAgentSlots,
      "a declared slot holding no category is why the declared tally and the assigning one differ",
    ).toStrictEqual([...EXPECTED_EMPTY_AGENT_SLOTS]);
    expect(
      filledAgentSlots.has(agentSlotLabel("cli-ink-oclif", "cli-tester")),
      "the one stack that does hand cli-tester a skill — without it the pin above says nothing",
    ).toBe(true);
  });

  it("files assignments under exactly the expected categories", () => {
    expect(
      assignedCategories,
      "the distinct categories this catalogue assigns under",
    ).toStrictEqual([...EXPECTED_ASSIGNED_CATEGORIES]);
  });

  // The misfiling spec drops ids the matrix lacks, so a stale id fails here instead.
  it("names exactly the expected skills, all of them in the vendored matrix", () => {
    const absent = assignedSkillIds.filter((id) => !(id in BUILT_IN_MATRIX.skills));

    expect(assignedSkillIds, "the distinct skill ids this catalogue names").toStrictEqual([
      ...EXPECTED_ASSIGNED_SKILL_IDS,
    ]);
    expect(
      absent,
      "a stack naming a skill the matrix does not carry is dropped silently at generation and warns once per occurrence at runtime, so this is the only place it fails",
    ).toStrictEqual([]);
  });

  it("holds the expected assignment total", () => {
    expect(everyAssignment.length, "this catalogue's assignment total").toBe(
      EXPECTED_ASSIGNMENT_TOTAL,
    );
  });

  // Catalogue-wide: a slot the flattening misses would pass the per-slot spec unvisited.
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

      expect(slots, `how many agent slots alias the hoisted ${category} array`).toHaveLength(
        EXPECTED_SHARED_ALIAS_SLOTS,
      );
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
      const flagged = (assignments ?? []).filter((a) => a.preloaded !== undefined);

      expect(
        flagged,
        "a built-in stack says which skills an agent gets — how each loads is the shared mapping's answer",
      ).toStrictEqual([]);
    },
  );

  // A skill filed under a category it left goes schema-invalid when the enum regenerates.
  it("files every assignment under the category its skill actually sits in", () => {
    const misfiled = agentCategoryCases.flatMap(({ stackId, agentName, category, assignments }) =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
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
