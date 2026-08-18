import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { createTempDir } from "./test-utils.js";
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
 * Preferred pattern: Create source ONCE per describe block in `beforeAll`,
 * store in a suite-level variable, and pass to wizard launchers via the
 * `source` option. This avoids redundant source creation per test.
 *
 * Example:
 *   let source: { sourceDir: string; tempDir: string };
 *   beforeAll(async () => { source = await createE2ESource(); });
 *   afterAll(async () => { await cleanupTempDir(source.tempDir); });
 *
 * Wizard launchers (InitWizard.launch, EditWizard.launch) accept a `source`
 * option to use a pre-created source instead of creating a new one internally.
 *
 * Only create sources inline when the test requires a unique/modified source.
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
 * revisit. The VALUES stay unprefixed for the same reason they are not derived
 * from ids at all — the build grid sorts by display name, so a title that tracked
 * its id would relocate every cursor target the moment ids change.
 */
export const E2E_SKILL_TITLES = {
  react: "web-framework-react",
  vitest: "web-testing-vitest",
  zustand: "web-state-zustand",
  hono: "api-framework-hono",
  "research-methodology": "Research Methodology",
  reviewing: "Reviewing",
  "cli-reviewing": "CLI Reviewing",
  "vue-composition-api": "Vue Composition Api",
  pinia: "web-state-pinia",
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

// Minimal agent template for E2E tests. Diverges from src/agents/_templates/agent.liquid
// (which ships partials + methodology sections); the frontmatter `skills:` block MUST
// mirror production exactly — consumes top-level `preloadedSkillIds` (NOT `agent.preloadedSkills`,
// which does not exist). Drift risk: follow-up could import the production template directly,
// but that requires shipping all referenced partials into the fixture.
const AGENT_TEMPLATE = `---
name: {{ agent.name }}
description: {{ agent.description }}
tools: {{ agent.tools | join: ", " }}
model: {{ agent.model }}
{% if agent.effort %}effort: {{ agent.effort }}
{% endif %}permissionMode: {{ agent.permissionMode }}
{% if preloadedSkillIds.size > 0 %}skills:
{% for skillId in preloadedSkillIds %}  - {{ skillId }}
{% endfor %}{% endif %}---

{% include "_partials/intro.liquid" %}

{% for skill in skills %}
{{ skill.content }}
{% endfor %}
`;

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
    await writeStacks(sourceDir);
  }
  await writeAgents(sourceDir);

  if (options?.relationships) {
    await writeSkillRules(sourceDir, options.relationships);
  }

  return { sourceDir, tempDir };
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

async function writeStacks(sourceDir: string): Promise<void> {
  const stacksFilePath = path.join(sourceDir, STACKS_FILE_PATH);
  await mkdir(path.dirname(stacksFilePath), { recursive: true });
  await writeFile(stacksFilePath, renderConfigTs({ stacks: [E2E_STACK] }));
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

async function writeAgents(sourceDir: string): Promise<void> {
  const agentsDir = path.join(sourceDir, DIRS.agents);
  const templatesDir = path.join(sourceDir, DIRS.templates);
  await mkdir(templatesDir, { recursive: true });
  await writeFile(path.join(templatesDir, "agent.liquid"), AGENT_TEMPLATE);

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
