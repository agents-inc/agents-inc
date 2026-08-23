import { describe, it, expect } from "vitest";
import { typedEntries, typedFromEntries, typedKeys } from "../../../utils/typed-object";
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
 * The sub-agents the whole catalogue assigns to, and how many stacks each one appears on — which
 * the document states as a count and then as a sentence ("six appear in all 17, two in 16 …").
 *
 * One constant for both halves, keyed by name rather than counted: a count cannot tell a retired
 * agent from a swapped one, and the two retired names this list once carried were exactly that
 * shape. The tally is the half that had nothing holding it at all, and it is the half that says
 * whether a stack quietly stopped assigning to an agent it still declares elsewhere.
 *
 * Fewer than `AGENT_NAMES` on purpose — five built-ins sit on no stack at all, which is the
 * document's own claim in the same paragraph.
 */
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

/**
 * How many sub-agents each stack assigns to. The document states the distinct values ("8, 9, 10
 * or 12") and names two of them in its stack table, and nothing held either reading — the table's
 * `cli-ink-oclif` note said 10 against a stack of 9 until an audit read it by hand.
 *
 * Keyed by stack id, so the keys are also the stack roster the document lists rather than counts.
 */
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

/**
 * The (stack, sub-agent) pairs where a stack names an agent and files nothing under it.
 *
 * Named rather than absorbed. The tally above counts DECLARED slots, which is the reading the
 * document's own invocation takes, and under it `cli-developer` and `cli-tester` sit on "the same
 * 8" — while seven of `cli-tester`'s eight are `{}`, so `cli-ink-oclif` is the only stack that
 * hands it a skill. A count cannot say which of the two readings it is, and an empty slot is the
 * only shape that makes them differ, so the difference is pinned by name instead of averaged away.
 */
const EXPECTED_EMPTY_AGENT_SLOTS = [
  "expo-mobile-fullstack > cli-tester",
  "nextjs-ai-saas > cli-tester",
  "nextjs-fullstack > cli-tester",
  "nextjs-saas-starter > cli-tester",
  "nextjs-supabase-fullstack > cli-tester",
  "nextjs-turborepo-fullstack > cli-tester",
  "react-hono-fullstack > cli-tester",
] as const;

/**
 * Every category the catalogue files an assignment under, which the document states as a count.
 * Members rather than the count, for the reason the roster above is: two categories exchanged
 * leave 35 intact, and a stack keyed under a category its skill has left is the stale-key shape
 * that goes schema-invalid the moment the enum regenerates.
 */
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
 * Every skill the catalogue names, which the document states as a count. Members again, and here
 * the members buy a second thing the count cannot: the clause binds each id to the generated
 * `SkillId` union, so a marketplace retiring a skill reddens the line that owns its name rather
 * than scattering unassignable-union errors across the consumers of an inferred type.
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

/**
 * How a (stack, sub-agent) pair is spelled. One definition because two derivations below must
 * agree on it, and a failure prints it — so it reads the way the misfiling spec's message does.
 */
function agentSlotLabel(stackId: string, agentName: AgentName): string {
  return `${stackId} > ${agentName}`;
}

/** Every sub-agent name the catalogue declares, once per stack that declares it. */
const declaredAgentNames = defaultStacks.flatMap((stack) => typedKeys(stack.agents));

/** How many stacks declare one sub-agent, whether or not they file anything under it. */
function stacksDeclaring(agentName: AgentName): number {
  return declaredAgentNames.filter((name) => name === agentName).length;
}

/** The document's per-agent tally: each declared sub-agent against the stacks naming it. */
const stacksPerAgent = typedFromEntries(
  [...new Set(declaredAgentNames)].map(
    (agentName) => [agentName, stacksDeclaring(agentName)] as const,
  ),
);

/** The document's per-stack tally, keyed by the stack ids its table lists. */
const agentCountPerStack = Object.fromEntries(
  defaultStacks.map((stack) => [stack.id, typedKeys(stack.agents).length]),
);

/** Every (stack, sub-agent) pair the catalogue declares. */
const declaredAgentSlots = defaultStacks.flatMap((stack) =>
  typedKeys(stack.agents).map((agentName) => agentSlotLabel(stack.id, agentName)),
);

/** The same pairs, restricted to those filing at least one category — what the cases above visit. */
const filledAgentSlots = new Set(
  agentCategoryCases.map((slot) => agentSlotLabel(slot.stackId, slot.agentName)),
);

/** Declared and unfilled: the pairs where the two tallies above disagree. */
const emptyAgentSlots = declaredAgentSlots.filter((slot) => !filledAgentSlots.has(slot)).sort();

/** Every category the catalogue files an assignment under. */
const assignedCategories = [...new Set(agentCategoryCases.map((slot) => slot.category))].sort();

/** Every skill the catalogue names, whichever slot names it. */
const assignedSkillIds = [...new Set(everyAssignment.map((assignment) => assignment.id))].sort();

describe("defaultStacks", () => {
  it("has the expected number of stacks", () => {
    expect(defaultStacks).toHaveLength(EXPECTED_STACK_COUNT);
  });

  it("reaches the sub-agents the catalogue document names, on the stack counts it states", () => {
    expect(
      stacksPerAgent,
      "built-in-catalogue.md names which sub-agents the catalogue reaches, which built-ins it leaves empty, and how many stacks each one appears on",
    ).toStrictEqual(EXPECTED_STACKS_PER_AGENT);
  });

  it("gives each stack the number of sub-agents the catalogue document states", () => {
    expect(
      agentCountPerStack,
      "built-in-catalogue.md states the distinct per-stack agent counts, and names two of them in its stack table",
    ).toStrictEqual(EXPECTED_AGENT_COUNT_PER_STACK);
  });

  // The pin needs the filled case beside it: an empty list and a catalogue that files nothing at
  // all read identically here, and only `cli-ink-oclif` keeps `cli-tester` from being the second.
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

  it("files assignments under exactly the categories the catalogue document names", () => {
    expect(
      assignedCategories,
      "built-in-catalogue.md states how many distinct categories this catalogue assigns under",
    ).toStrictEqual([...EXPECTED_ASSIGNED_CATEGORIES]);
  });

  // The misfiling spec below reads the matrix too, but its lookup drops an id the matrix does
  // not carry — so a stale id passes that spec rather than failing it. This is where one fails.
  // Both assertions belong here together: the roster alone cannot say the ids are real, and the
  // membership check alone is satisfied for free by the empty list a broken derivation hands it.
  it("names exactly the skills the catalogue document states, all of them in the vendored matrix", () => {
    const absent = assignedSkillIds.filter((id) => !(id in BUILT_IN_MATRIX.skills));

    expect(
      assignedSkillIds,
      "built-in-catalogue.md states how many distinct skill ids this catalogue names",
    ).toStrictEqual([...EXPECTED_ASSIGNED_SKILL_IDS]);
    expect(
      absent,
      "a stack naming a skill the matrix does not carry is dropped silently at generation and warns once per occurrence at runtime, so this is the only place it fails",
    ).toStrictEqual([]);
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
