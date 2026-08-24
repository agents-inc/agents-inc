import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { createTempDir } from "./test-utils.js";
import { sharedSourcePath } from "../../src/cli/lib/__tests__/helpers/shared-source.js";
import type { FixtureStackAgentConfig } from "./test-utils.js";
import {
  DIRS,
  SKILL_RULES_PATH,
  SKILLS_DIR_PATH,
  STACKS_FILE_PATH,
  STANDARD_FILES,
} from "../../src/cli/consts.js";
import type {
  AgentName,
  CategoryPath,
  RelationshipDefinitions,
  SkillSlug,
  Stack,
} from "../../src/cli/types/index.js";
import { e2eSkillId } from "../pages/constants.js";
import { createMockSkillAssignment } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import { typedKeys, typedValues } from "../../src/cli/utils/typed-object.js";
import {
  renderAgentYaml,
  renderConfigTs,
  renderMetadataYaml,
  renderRulesTs,
  renderSkillMd,
} from "../../src/cli/lib/__tests__/content-generators.js";

/**
 * E2E Source Creation Conventions
 *
 * **Reach for {@link E2E_SOURCE}, and build nothing.** It is the shared plain tree, written once
 * per run by `globalSetup` and frozen, and it is what a spec wants unless its subject is the
 * source itself:
 *
 *   `InitWizard.launch()`                  — the default, so nothing is named at all
 *   `EditWizard.launch({ projectDir, source: E2E_SOURCE })` — named, because `edit` RECORDS it
 *
 * `edit` takes no `--marketplace`, so its launcher writes the source into the install's config
 * before the wizard starts, and `recordInstallSource` refuses an install that has no config yet.
 * A default there would turn "this project has nothing to edit" into a throw from a fixture
 * helper, so the source stays explicit on that side. `init` names its source on the command line
 * and defaults cleanly.
 *
 * Build your own only when the shared tree is not the source under test:
 *
 *   `createE2EPluginSource()`      — a marketplace, so plugin install mode is reachable at all
 *   `createE2ESource(options)`     — a tree that differs in what it SHIPS (relationships,
 *                                    withoutStacks, withoutSkills)
 *   `createE2EPluginSource({ owned: true })` — a tree the spec WRITES into
 *
 * The pattern this replaced — a `beforeAll` calling `createE2ESource()` into two suite-level
 * `let`s and an `afterAll` cleaning them up — was in about seventy files, and every one of them
 * was building the same tree. It cost 10ms each, so nothing was gained by sharing it per file;
 * what it cost was ten lines of ceremony per spec and a `source: { sourceDir, tempDir }` object
 * assembled at every launch.
 */

/**
 * Re-exported so every surface that builds a fixture id reaches it through the
 * writer that puts those ids on disk. It is DEFINED in `pages/constants.ts`,
 * beside the marketplace name it composes from — see the note there.
 */
export { e2eSkillId };

/**
 * Display title written into each E2E source agent's metadata.yaml, and
 * therefore the text the wizard's agents step renders for that agent.
 */
export const E2E_AGENT_TITLES = {
  "web-developer": "Web Developer",
  "api-developer": "API Developer",
} as const satisfies Partial<Record<AgentName, string>>;

type E2ESkill = {
  category: CategoryPath;
  /**
   * The id the fixture publishes: its marketplace's name, then the bare id.
   *
   * Typed `string`, not `SkillId`: that union is the PUBLIC catalogue's, and this
   * source is a different marketplace, so a namespaced id is not a member of it
   * and casting one in would be a lie about the catalogue. Composed by
   * {@link e2eSkillId} rather than spelled out — the prefix and the marketplace
   * name are one string.
   */
  id: string;
  slug: SkillSlug;
  description: string;
  domain: string;
};

/**
 * The skill set every E2E source writes to disk — the SOLE definition of what a
 * fixture ships.
 *
 * Everything else about these skills is read off this array: the ids
 * (`E2E_SKILL_IDS`), the titles the wizard renders (`E2E_SKILL_TITLES` is keyed by
 * its slugs and must cover them exactly), and the directories `writeSkills`
 * creates. It is `as const` so those derivations keep the literal SLUGS; the ids
 * are composed at runtime by {@link e2eSkillId} and are `string` either way.
 */
const E2E_SKILLS = [
  {
    category: "web-framework",
    id: e2eSkillId("web-framework-react"),
    slug: "react",
    description: "React framework for building user interfaces",
    domain: "web",
  },
  {
    category: "web-testing",
    id: e2eSkillId("web-testing-vitest"),
    slug: "vitest",
    description: "Next generation testing framework",
    domain: "web",
  },
  {
    category: "web-client-state",
    id: e2eSkillId("web-state-zustand"),
    slug: "zustand",
    description: "Bear necessities state management",
    domain: "web",
  },
  {
    category: "api-api",
    id: e2eSkillId("api-framework-hono"),
    slug: "hono",
    description: "Lightweight web framework for the edge",
    domain: "api",
  },
  {
    category: "meta-methodology",
    id: e2eSkillId("meta-methodology-research-methodology"),
    slug: "research-methodology",
    description: "Codebase investigation and research methodology",
    domain: "meta",
  },
  {
    category: "meta-reviewing",
    id: e2eSkillId("meta-reviewing-reviewing"),
    slug: "reviewing",
    description: "Code review guidance and patterns",
    domain: "meta",
  },
  {
    category: "meta-reviewing",
    id: e2eSkillId("meta-reviewing-cli-reviewing"),
    slug: "cli-reviewing",
    description: "CLI code review patterns",
    domain: "meta",
  },
  {
    category: "web-framework",
    id: e2eSkillId("web-framework-vue-composition-api"),
    slug: "vue-composition-api",
    description: "Vue.js composition API framework",
    domain: "web",
  },
  {
    category: "web-client-state",
    id: e2eSkillId("web-state-pinia"),
    slug: "pinia",
    description: "Vue state management",
    domain: "web",
  },
  // The SPARE: the only skill `E2E_STACK` assigns to no agent, in a category that is
  // NOT exclusive. Every other skill a default install leaves behind — pinia,
  // vue-composition-api — is the exclusive alternate of one the install DID take, so
  // toggling it is a swap and toggling it back a no-op. That left "init installs a
  // subset, edit adds one of the rest" undrivable, which is why init-then-edit-merge
  // could not reach the merge it exists to test. Selecting this one genuinely adds.
  {
    category: "web-testing",
    id: e2eSkillId("web-testing-visual-regression"),
    slug: "visual-regression",
    description: "Screenshot baselines and diff review",
    domain: "web",
  },
] as const satisfies readonly E2ESkill[];

/** One entry of {@link E2E_SKILLS}, with its slug still literal. */
type E2ESkillEntry = (typeof E2E_SKILLS)[number];

/**
 * The slugs {@link E2E_SKILLS} declares, as a union rather than the whole
 * `SkillSlug` one.
 *
 * Slugs, not ids: a namespaced id is composed at runtime by {@link e2eSkillId}, so
 * `E2ESkillEntry["id"]` is `string` and constrains nothing. A skill's slug is
 * written literally and is not namespaced, so it is the only field of the set that
 * can still key a map exhaustively.
 */
type E2ESkillSlug = E2ESkillEntry["slug"];

/**
 * Every skill id an E2E source writes, sorted the way a directory listing is.
 *
 * Read off {@link E2E_SKILLS} for the same reason as {@link E2E_STACK_SKILL_IDS}
 * below: it was a hand-written second list, so a skill added to the source and not
 * to the list left every "the install wrote exactly these" assertion quietly
 * short. The order is the sorted one the listing assertions compare against.
 */
export const E2E_SKILL_IDS: readonly string[] = E2E_SKILLS.map((skill) => skill.id).sort();

/**
 * Display title written into each E2E source skill's metadata.yaml, and
 * therefore the text the wizard renders for that skill.
 *
 * Single source of truth: assertions that match on rendered skill text should
 * key off this instead of re-typing the strings.
 *
 * Keyed by {@link E2ESkillSlug}, so {@link E2E_SKILLS} decides which skills need a
 * title and this map only decides what each one says — a missing or surplus key
 * is a compile error. It used to be the other way round, with `E2E_SKILLS.id`
 * typed `keyof typeof E2E_SKILL_TITLES`: the display map constrained the disk
 * writer, so the writer could not gain, lose or rename a skill without the titles
 * granting permission first.
 *
 * Keyed by SLUG rather than by id for two reasons, and the first is not a
 * preference: an id is namespaced at runtime, so it is no longer a literal type
 * and cannot key anything exhaustively. The second is that a marketplace rename
 * moves every id and no slug, so a slug-keyed map is one this file never has to
 * revisit. The VALUES are not derived from ids at all — the build grid sorts by
 * display name, so a title that tracked its id would relocate every cursor target
 * the moment ids change.
 *
 * **A title must be neither an id nor a public-catalogue display name**, and five
 * of these were both until 2026-08-19: `react` read `"web-framework-react"`, a
 * verbatim catalogue id AND a strict substring of the fixture id
 * `e2e-test-fixture-web-framework-react` that the wizard paints beside it — so the
 * 234 `toContain(display)` assertions across the suite were answered by the id
 * being rendered and proved nothing about the title. The bare catalogue names
 * ("React", "Vitest", …) are the other trap: a spec that installs a fixture skill
 * and opens the wizard against the DEFAULT source renders both catalogues at once,
 * and two cells sharing a label make `focusSkill` pick whichever comes first. The
 * `E2E ` prefix is what the fixture's own stack already does ({@link E2E_STACK_NAME}
 * is "E2E Test Stack"). `CLI Reviewing` and `Visual Regression` are still verbatim
 * catalogue titles and are the remaining hazard of that second kind.
 */
export const E2E_SKILL_TITLES = {
  react: "E2E React",
  vitest: "E2E Vitest",
  zustand: "E2E Zustand",
  hono: "E2E Hono",
  "research-methodology": "Research Methodology",
  reviewing: "Reviewing",
  "cli-reviewing": "CLI Reviewing",
  "vue-composition-api": "Vue Composition Api",
  pinia: "E2E Pinia",
  "visual-regression": "Visual Regression",
} as const satisfies Record<E2ESkillSlug, string>;

// Preload shape matches real CLI stacks in src/cli/lib/configuration/default-stacks.ts:
// real `web-developer` preloads only `web-framework-react` (+ meta-framework when present);
// real `api-developer` preloads only `api-framework-hono` (+ database when present).
// Meta skills are never preloaded in real stacks — they appear as dynamic skills in the
// body's Skill Activation Protocol table, never in agent frontmatter.
const webDeveloperAgentConfig: FixtureStackAgentConfig = {
  "web-framework": [createMockSkillAssignment(e2eSkillId("web-framework-react"), true)],
  "web-testing": [createMockSkillAssignment(e2eSkillId("web-testing-vitest"))],
  "web-client-state": [createMockSkillAssignment(e2eSkillId("web-state-zustand"))],
  "meta-reviewing": [
    createMockSkillAssignment(e2eSkillId("meta-reviewing-reviewing")),
    createMockSkillAssignment(e2eSkillId("meta-reviewing-cli-reviewing")),
  ],
  "meta-methodology": [
    createMockSkillAssignment(e2eSkillId("meta-methodology-research-methodology")),
  ],
};

const apiDeveloperAgentConfig: FixtureStackAgentConfig = {
  "api-api": [createMockSkillAssignment(e2eSkillId("api-framework-hono"), true)],
  "meta-methodology": [
    createMockSkillAssignment(e2eSkillId("meta-methodology-research-methodology")),
  ],
  "meta-reviewing": [createMockSkillAssignment(e2eSkillId("meta-reviewing-reviewing"))],
};

/**
 * Display name written into the E2E source's `config/stacks.ts`, and therefore
 * the text the wizard renders for it — in the stack list, in the confirm step's
 * "Ready to install <stack>" dropdown, and in the summary panel's Stack row.
 *
 * Single source of truth: assertions matching on rendered stack text should key
 * off this instead of re-typing the string.
 */
export const E2E_STACK_NAME = "E2E Test Stack";

/**
 * Stack id and description as written into the source's `config/stacks.ts`.
 *
 * The id is what a shared configuration's `stackId` must name for `init --from` to resolve the
 * stack at all, and the description is what the installed `config.ts` records for it — the config
 * has no `stackId` field, so the description is the only trace the stack leaves.
 */
export const E2E_STACK_ID = "e2e-test-stack";
export const E2E_STACK_DESCRIPTION = "Minimal stack for E2E testing";

/**
 * A sub-agent name the CLI does not declare, for the source
 * {@link E2ESourceOptions.withUndeclaredStackAgent} writes.
 *
 * Deliberately plausible rather than obviously junk — a marketplace author's mistake looks like
 * a sub-agent, which is what makes the name reach `config/stacks.ts` in the first place. It is
 * not a member of `AgentName`, so it is written as the `string` a hand-authored stacks file
 * actually holds and never cast into the union.
 */
export const UNDECLARED_STACK_AGENT = "frontend-dev";

/**
 * `Stack` with its agents' assignments widened, for the reason {@link E2ESkill.id}
 * gives: this marketplace's ids are not members of the public catalogue's union.
 * The shape is otherwise production's, because it is serialized into the source's
 * `config/stacks.ts` and read back by the CLI's own stack loader.
 */
type E2EStack = Omit<Stack, "agents"> & {
  agents: Partial<Record<AgentName, FixtureStackAgentConfig>>;
};

const E2E_STACK: E2EStack = {
  id: E2E_STACK_ID,
  name: E2E_STACK_NAME,
  description: E2E_STACK_DESCRIPTION,
  agents: {
    "web-developer": webDeveloperAgentConfig,
    "api-developer": apiDeveloperAgentConfig,
  },
};

/**
 * The sub-agents `E2E_STACK` declares, read off the stack object rather than
 * re-typed, and sorted the way the installed roster is.
 *
 * A stack's `agents` keys ARE the roster a selection installs, so a spec that
 * spells the names out separately can agree with the code while both disagree
 * with the stack. Deriving them here is what makes "installed === declared" a
 * statement about the stack instead of about a second hand-written list.
 */
export const E2E_STACK_AGENTS: AgentName[] = typedKeys<AgentName>(E2E_STACK.agents).sort();

/**
 * Every skill `E2E_STACK` assigns to any of its agents, deduplicated and sorted
 * the way an installed config's skill list is.
 *
 * Read off the stack object for the same reason as {@link E2E_STACK_AGENTS}: a
 * stack's assignments ARE the statement of what selecting it installs, so a
 * hand-written second list can agree with the installer while both disagree with
 * the stack. The one skill deliberately left out is the SPARE
 * (`web-testing-visual-regression`) — see its note in `E2E_SKILLS`.
 */
export const E2E_STACK_SKILL_IDS: string[] = [
  ...new Set(
    typedValues(E2E_STACK.agents)
      .flatMap((agentConfig) => typedValues(agentConfig))
      .flatMap((assignments) => assignments.map((assignment) => assignment.id)),
  ),
].sort();

type E2ESourceOptions = {
  /**
   * Custom relationship rules to write to `config/skill-rules.ts`.
   *
   * This is the ONLY way a source built here says anything about unresolved slugs.
   * The CLI's built-in rules are narrowed to the slugs a source ships before they
   * are applied (`relationshipsForSource` in `lib/loading/source-loader.ts`), so a
   * plain `createE2ESource()` warns about nothing — it used to warn 2384 times, and
   * the wizard's startup band painted three of them over every frame in this suite.
   *
   * A spec that needs an unresolved-slug warning therefore names its own dangling
   * slug here, deliberately and in ones, rather than inheriting thousands.
   */
  relationships?: Partial<RelationshipDefinitions>;
  /**
   * Skill ids to leave out of the written source — a marketplace as it stood
   * BEFORE those skills were published.
   *
   * Pairs with a plain `createE2ESource()` to give two directories differing by
   * exactly the named skills, which is how a spec models a source moving on
   * without editing one in place.
   */
  withoutSkills?: readonly string[];
  /**
   * Write no `config/stacks.ts` at all — a marketplace that ships no stacks.
   *
   * The CLI's built-in stacks stand in only for the default public marketplace,
   * so a source created this way offers the wizard nothing to choose between on
   * its stack step and the wizard skips that step entirely.
   */
  withoutStacks?: boolean;
  /**
   * Write `config/stacks.ts` with one extra sub-agent the CLI does not declare
   * ({@link UNDECLARED_STACK_AGENT}) beside the real ones.
   *
   * A marketplace's stacks file is authored by hand and nothing narrows its agent keys, so this
   * is the shape an author's typo takes on disk. The declared sub-agents are left in place
   * because the claim under test is a DROP: a source whose stack named only the unknown one
   * could not tell a narrowing apart from a load that failed.
   */
  withUndeclaredStackAgent?: boolean;
};

/** A created E2E source: the source root plus the temp dir owning it. */
export type E2ESource = {
  sourceDir: string;
  tempDir: string;
};

/**
 * Creates a complete skills source directory for E2E init wizard tests.
 *
 * Includes skills, agents, stacks, and the minimal matrix/template structure
 * needed for the full init -> compile pipeline to succeed.
 *
 * The source provides its own config/stacks.ts with a single test stack
 * that references only skills present in the source. This ensures the full
 * init flow (select stack -> accept defaults -> install) can complete without
 * missing skill errors.
 *
 * When `options.relationships` is provided, a `config/skill-rules.ts` file is
 * written to the source with those relationship rules. This enables E2E testing
 * of slug-based relationship resolution via `cc validate` and `cc info`.
 *
 * When `options.withoutStacks` is set, the stacks file is omitted — see the
 * option's own note for what a stackless marketplace makes the wizard do.
 *
 * When `options.withUndeclaredStackAgent` is set, the stack names one sub-agent the CLI does
 * not declare beside its real ones — see that option's note.
 *
 * When `options.withoutSkills` names skills, they are not written at all — see
 * that option's note for the pair of sources it exists to produce.
 */
export async function createE2ESource(options?: E2ESourceOptions): Promise<E2ESource> {
  const tempDir = await createTempDir();
  // Refusals that name this path are asserted against the CLI's own vocabulary, so the
  // segment must spell neither noun of the marketplace/source rename: "source" made
  // `\bsources?\b` negatives fail on the fixture instead of on the product's prose (a
  // slash and a quote are both word boundaries), and "marketplace" would satisfy the
  // positive half of the same rename vacuously. It is not private to this helper.
  const sourceDir = path.join(tempDir, "fixture");

  const omitted = new Set<string>(options?.withoutSkills ?? []);
  await writeSkills(
    sourceDir,
    E2E_SKILLS.filter((skill) => !omitted.has(skill.id)),
  );
  if (!options?.withoutStacks) {
    await writeStacks(sourceDir, options?.withUndeclaredStackAgent === true);
  }
  await writeAgents(sourceDir);

  if (options?.relationships) {
    await writeSkillRules(sourceDir, options.relationships);
  }

  return { sourceDir, tempDir };
}

/**
 * Writes a source's whole tree into `sourceDir`, with no temp directory of its own.
 *
 * Exists so the SHARED fixture and a privately-built one are the same tree by construction rather
 * than by two descriptions that have to be kept in step — `globalSetup` builds the shared one by
 * calling this, exactly as {@link createE2ESource} does.
 */
export async function writeE2ESourceInto(sourceDir: string): Promise<void> {
  await writeSkills(sourceDir, E2E_SKILLS);
  await writeStacks(sourceDir, false);
  await writeAgents(sourceDir);
}

/**
 * The segment the shared plain source occupies inside the frozen fixture root, beside the
 * plugin-capable `fixture/` its sibling helper builds. Spells neither withdrawn noun, for the
 * reason `sharedSourcePath`'s own docblock gives.
 */
const SHARED_PLAIN_SEGMENT = "plain";

/**
 * The one source every spec that neither mutates one nor needs a marketplace launches against.
 *
 * A constant rather than a call because nothing about it is per-spec: `globalSetup` writes this
 * tree once and freezes it, and the path is derived, so a worker computes it without being handed
 * anything. Naming it at a launch site is the whole ergonomic point — `source: E2E_SOURCE` in
 * place of a two-field object assembled from a `beforeAll` that existed only to build one.
 *
 * **It has no `.claude-plugin/marketplace.json`, and that is the difference that matters.** With
 * no marketplace carrying them, every skill this source ships is local-only, so the wizard's
 * default origin is EJECT (`defaultOriginFor` in `stores/wizard-store.ts`). A spec whose subject
 * is plugin install therefore reaches for `createE2EPluginSource()` instead — that fixture is the
 * same tree with the two builds run over it, and swapping one for the other silently flips every
 * unstated origin in the spec.
 *
 * Frozen, so a spec that writes into it fails at the write rather than corrupting whatever runs
 * next; `createE2ESource()` still returns a private writable tree for the specs that need one.
 */
export const E2E_SOURCE: E2ESource = {
  sourceDir: path.join(sharedSourcePath(), SHARED_PLAIN_SEGMENT),
  tempDir: sharedSourcePath(),
};

/**
 * Writes {@link E2E_SOURCE}'s tree into the shared fixture root. Called once, from `globalSetup`,
 * before the freeze.
 */
export async function buildSharedE2ESourceInto(root: string): Promise<void> {
  await writeE2ESourceInto(path.join(root, SHARED_PLAIN_SEGMENT));
}

async function writeSkills(sourceDir: string, skills: readonly E2ESkillEntry[]): Promise<void> {
  for (const skill of skills) {
    const skillDir = path.join(sourceDir, SKILLS_DIR_PATH, skill.id);
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      path.join(skillDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd(skill.id, skill.description),
    );

    await writeFile(
      path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      renderMetadataYaml({
        author: "@agents-inc",
        category: skill.category,
        domain: skill.domain,
        slug: skill.slug,
        displayName: E2E_SKILL_TITLES[skill.slug],
        cliDescription: skill.description,
        usageGuidance: "Use when testing E2E scenarios",
        contentHash: "a1b2c3d",
      }),
    );
  }
}

async function writeStacks(sourceDir: string, withUndeclaredAgent: boolean): Promise<void> {
  const stacksFilePath = path.join(sourceDir, STACKS_FILE_PATH);
  await mkdir(path.dirname(stacksFilePath), { recursive: true });
  const stack = withUndeclaredAgent
    ? {
        ...E2E_STACK,
        agents: { ...E2E_STACK.agents, [UNDECLARED_STACK_AGENT]: webDeveloperAgentConfig },
      }
    : E2E_STACK;
  await writeFile(stacksFilePath, renderConfigTs({ stacks: [stack] }));
}

async function writeSkillRules(
  sourceDir: string,
  relationships: Partial<RelationshipDefinitions>,
): Promise<void> {
  const rulesFilePath = path.join(sourceDir, SKILL_RULES_PATH);
  await mkdir(path.dirname(rulesFilePath), { recursive: true });

  const fullRelationships: RelationshipDefinitions = {
    conflicts: relationships.conflicts ?? [],
    discourages: relationships.discourages ?? [],
    requires: relationships.requires ?? [],
    alternatives: relationships.alternatives ?? [],
  };

  await writeFile(
    rulesFilePath,
    renderRulesTs({ version: "1.0.0", relationships: fullRelationships }),
  );
}

/**
 * The source's sub-agents. No `_templates/agent.liquid` is written beside them: agent
 * rendering resolves its template through `createLiquidEngine`, whose roots are the
 * project's own two override directories and the CLI's own `templates/` — never a
 * marketplace. One written here would be resolved by nothing.
 */
async function writeAgents(sourceDir: string): Promise<void> {
  const agentsDir = path.join(sourceDir, DIRS.agents);

  const agents: Array<{ name: AgentName; title: string; description: string }> = [
    {
      name: "web-developer",
      title: E2E_AGENT_TITLES["web-developer"],
      description: "Full-stack web development specialist",
    },
    {
      name: "api-developer",
      title: E2E_AGENT_TITLES["api-developer"],
      description: "Backend API development specialist",
    },
  ];

  for (const agent of agents) {
    const agentDir = path.join(agentsDir, agent.name);
    await mkdir(agentDir, { recursive: true });

    await writeFile(
      path.join(agentDir, STANDARD_FILES.AGENT_METADATA_YAML),
      renderAgentYaml(agent.name, agent.description, {
        title: agent.title,
        tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
        model: "opus",
        permissionMode: "default",
      }) + "\n",
    );

    await writeFile(
      path.join(agentDir, STANDARD_FILES.IDENTITY_MD),
      `# ${agent.title}\n\n${agent.description}\n`,
    );

    await writeFile(
      path.join(agentDir, STANDARD_FILES.PLAYBOOK_MD),
      `## Workflow\n\n1. Analyze requirements\n2. Implement solution\n`,
    );
  }
}
