import { E2E_AGENT_TITLES, E2E_SKILL_TITLES, e2eSkillId } from "../helpers/create-e2e-source.js";
import type { AgentName, ModelName, SkillSlug } from "../../src/cli/types/index.js";

/**
 * Agent display titles as the wizard renders them in the agents step — the
 * strings `toggleAgent` / `navigateCursorToAgent` match against. Re-exported
 * under the name specs use; create-e2e-source.ts owns the values because it
 * writes them into each agent's metadata yaml.
 */
export { E2E_AGENT_TITLES as E2E_AGENT_DISPLAY } from "../helpers/create-e2e-source.js";

/**
 * Stack display name as the wizard renders it — in the stack list, in the
 * confirm step's "Ready to install <stack>" dropdown, and in the summary
 * panel's Stack row. Re-exported under the name specs use;
 * create-e2e-source.ts owns the value because it writes it into the source's
 * `config/stacks.ts`.
 */
export { E2E_STACK_NAME as E2E_STACK_DISPLAY } from "../helpers/create-e2e-source.js";

/**
 * Stack id and description as the source declares them. `E2E_STACK_ID` is what a shared
 * configuration's `stackId` must name; `E2E_STACK_DESCRIPTION` is what the installed config.ts
 * records for that stack, since the config has no `stackId` field of its own.
 */
export { E2E_STACK_ID, E2E_STACK_DESCRIPTION } from "../helpers/create-e2e-source.js";

/**
 * The sub-agent roster the E2E stack declares, derived from the stack object
 * itself. This is the expected value for "selecting a stack installs exactly
 * the sub-agents it declares" — unlike `E2E_AGENTS` below, which is a
 * hand-written list that a roster change would leave silently stale.
 */
export { E2E_STACK_AGENTS } from "../helpers/create-e2e-source.js";

/**
 * The skills the E2E stack assigns across its agents, derived from the stack
 * object itself. The expected value for "selecting a stack installs exactly the
 * skills it declares" — the skill-side counterpart of `E2E_STACK_AGENTS`.
 */
export { E2E_STACK_SKILL_IDS } from "../helpers/create-e2e-source.js";

/**
 * The sub-agent name the `withUndeclaredStackAgent` source writes into its stack, and which the
 * CLI does not declare. The expected value for "a stack may only name sub-agents that exist" —
 * derived from the fixture that puts it on disk, so the spec and the source cannot disagree
 * about which name is the unknown one.
 */
export { UNDECLARED_STACK_AGENT } from "../helpers/create-e2e-source.js";

/**
 * The sub-agents the wizard preselects for a Web-only build — the whole roster a
 * scratch init installs when Web is the one domain selected, sorted the way the
 * installed roster is.
 *
 * Spelled out rather than read off the store's own `DOMAIN_AGENTS` map: an
 * expectation derived from the mapping under test agrees with it however it
 * changes.
 */
export const WEB_DOMAIN_AGENTS = [
  "pm",
  "reviewer",
  "web-developer",
  "web-researcher",
  "web-tester",
] as const satisfies readonly AgentName[];

/**
 * A built-in stack's name as the wizard paints it — `nextjs-fullstack`, the
 * first entry of the CLI's own `defaultStacks`.
 *
 * The built-in catalogue stands in for the DEFAULT public marketplace and no
 * other, so this string on the stack step is that catalogue's signature: its
 * presence proves the default source still offers the built-ins, and its
 * absence against a custom source proves nothing was substituted. Spelled out
 * rather than imported from `src/cli/`, so a rename fails the assertion instead
 * of moving both sides together.
 */
export const BUILT_IN_STACK_DISPLAY = "Next.js Full-Stack";

/**
 * Every skill id an E2E source writes, derived from the skill set
 * create-e2e-source.ts writes to disk and sorted the way a directory listing is.
 * The expected value for "the install wrote exactly these skills" — it was a
 * hand-written second copy of that set until it became a derivation, the same
 * treatment `E2E_STACK_AGENTS` and `E2E_STACK_SKILL_IDS` already had.
 */
export { E2E_SKILL_IDS } from "../helpers/create-e2e-source.js";

/**
 * The fixture marketplace's name and the builder that composes a skill id inside
 * its namespace. A marketplace's name IS its skills' id prefix, so the writer and
 * every assertion on a published identity read one constant.
 */
export { E2E_MARKETPLACE_NAME } from "../pages/constants.js";
export { e2eSkillId } from "../helpers/create-e2e-source.js";

/**
 * Per-skill identifiers for the E2E source, keyed by slug.
 *
 * Specs address the same skill three ways depending on the step under test: by
 * id (config assertions), by slug (source paths, skill lookups) and by display
 * title (what the wizard renders, so what `selectSkill` matches). This map is
 * the slug↔id join; `display` is read from create-e2e-source.ts rather than
 * re-typed, so a title change there cannot silently desync from assertions.
 *
 * `id` is composed by `e2eSkillId` and typed `string`, not `SkillId`: the fixture
 * publishes under its own marketplace, so its ids live in that marketplace's
 * namespace rather than in the public catalogue's union. Slugs and titles are NOT
 * namespaced — a slug names the skill inside its own source, and a title is what
 * the wizard paints.
 */
export const E2E_SKILL = {
  react: {
    id: e2eSkillId("web-framework-react"),
    slug: "react",
    display: E2E_SKILL_TITLES.react,
  },
  vitest: {
    id: e2eSkillId("web-testing-vitest"),
    slug: "vitest",
    display: E2E_SKILL_TITLES.vitest,
  },
  zustand: {
    id: e2eSkillId("web-state-zustand"),
    slug: "zustand",
    display: E2E_SKILL_TITLES.zustand,
  },
  hono: {
    id: e2eSkillId("api-framework-hono"),
    slug: "hono",
    display: E2E_SKILL_TITLES.hono,
  },
  pinia: {
    id: e2eSkillId("web-state-pinia"),
    slug: "pinia",
    display: E2E_SKILL_TITLES.pinia,
  },
  "research-methodology": {
    id: e2eSkillId("meta-methodology-research-methodology"),
    slug: "research-methodology",
    display: E2E_SKILL_TITLES["research-methodology"],
  },
  reviewing: {
    id: e2eSkillId("meta-reviewing-reviewing"),
    slug: "reviewing",
    display: E2E_SKILL_TITLES.reviewing,
  },
  "cli-reviewing": {
    id: e2eSkillId("meta-reviewing-cli-reviewing"),
    slug: "cli-reviewing",
    display: E2E_SKILL_TITLES["cli-reviewing"],
  },
  "vue-composition-api": {
    id: e2eSkillId("web-framework-vue-composition-api"),
    slug: "vue-composition-api",
    display: E2E_SKILL_TITLES["vue-composition-api"],
  },
  /** The source's spare — assigned to no agent by the stack, so an edit can ADD it. */
  "visual-regression": {
    id: e2eSkillId("web-testing-visual-regression"),
    slug: "visual-regression",
    display: E2E_SKILL_TITLES["visual-regression"],
  },
} as const satisfies Partial<Record<SkillSlug, { id: string; slug: SkillSlug; display: string }>>;

/**
 * A skill the user wrote in their own project rather than fetched — no marketplace
 * carries it, so eject is the only install it can have.
 *
 * Its taxonomy is REAL (`web-tooling`, in the `web` domain): a custom skill is placed
 * alongside its related skills like any other, which is what lets it reach a sub-agent.
 * The id wears the `external-` namespace a skill answering to no marketplace takes.
 *
 * Every field is `string`, deliberately un-narrowed: the id belongs to no marketplace, so
 * it is not a member of the public catalogue's `SkillId` union and must compare against
 * one without TypeScript ruling the comparison impossible.
 */
export const E2E_CUSTOM_SKILL = {
  id: "external-web-tooling-house",
  slug: "house-tooling",
  display: "House Tooling",
  category: "web-tooling",
  domain: "web",
  /** The `origin` its config entry must carry — the project's own copy. */
  origin: "eject",
};

/**
 * Per-agent identifiers for the E2E source, keyed by agent name.
 *
 * Specs address the same agent two ways depending on what they assert: by bare
 * name (compiled `<name>.md` filenames, config.ts `agents` entries) and by
 * display title (what the agents step renders, so what `toggleAgent` /
 * `navigateCursorToAgent` match). `display` is read from create-e2e-source.ts
 * rather than re-typed, so a title change there cannot silently desync from
 * assertions.
 *
 * Unlike `E2E_AGENTS` below this object has no accessor, so the `satisfies`
 * clause can sit on the object without widening anything.
 */
export const E2E_AGENT = {
  "web-developer": {
    name: "web-developer",
    display: E2E_AGENT_TITLES["web-developer"],
  },
  "api-developer": {
    name: "api-developer",
    display: E2E_AGENT_TITLES["api-developer"],
  },
} as const satisfies Partial<Record<AgentName, { name: AgentName; display: string }>>;

/**
 * Sub-agents that reach a compiled file from the CLI's OWN bundled definitions (`src/agents/`),
 * not from anything `createE2ESource` writes.
 *
 * A shared configuration may name any sub-agent in the CLI's vocabulary, and the compiler resolves
 * it from the bundled definitions — which is what lets one install cover four models or five
 * efforts at once rather than needing one install per value. `defaultModel` is the value that
 * agent's bundled `metadata.yaml` declares, so a spec asserting "no override, so the metadata
 * default survives" has an authoritative expected value instead of a guess. `api-tester` is the
 * one whose default is NOT `opus`, which is why the default-preserving specs use it: an assertion
 * of `opus` there would pass on a hardcoded fallback.
 */
export const E2E_BUILTIN_AGENT = {
  "web-tester": { name: "web-tester", defaultModel: "opus" },
  reviewer: { name: "reviewer", defaultModel: "opus" },
  "cli-developer": { name: "cli-developer", defaultModel: "opus" },
  "api-tester": { name: "api-tester", defaultModel: "sonnet" },
} as const satisfies Partial<Record<AgentName, { name: AgentName; defaultModel: ModelName }>>;

// Derive from E2E source agent definitions (create-e2e-source.ts).
// The `satisfies` clauses sit on the member arrays rather than on the whole
// object: constraining the object would contextually type the getter too,
// widening its return from the two literals it actually yields to the full
// AgentName union.
export const E2E_AGENTS = {
  WEB: ["web-developer"] as const satisfies readonly AgentName[],
  API: ["api-developer"] as const satisfies readonly AgentName[],
  get WEB_AND_API() {
    return [...this.API, ...this.WEB].sort();
  },
} as const;
