import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { createTempDir } from "./test-utils.js";
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
  SkillId,
  SkillSlug,
  Stack,
  StackAgentConfig,
} from "../../src/cli/types/index.js";
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
 * Display title written into each E2E source skill's metadata.yaml, and
 * therefore the text the wizard renders for that skill.
 *
 * Single source of truth: assertions that match on rendered skill text should
 * key off this instead of re-typing the strings.
 */
export const E2E_SKILL_TITLES = {
  "web-framework-react": "web-framework-react",
  "web-testing-vitest": "web-testing-vitest",
  "web-state-zustand": "web-state-zustand",
  "api-framework-hono": "api-framework-hono",
  "meta-methodology-research-methodology": "Research Methodology",
  "meta-reviewing-reviewing": "Reviewing",
  "meta-reviewing-cli-reviewing": "CLI Reviewing",
  "web-framework-vue-composition-api": "Vue Composition Api",
  "web-state-pinia": "web-state-pinia",
  "web-testing-visual-regression": "Visual Regression",
} as const satisfies Partial<Record<SkillId, string>>;

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
  id: keyof typeof E2E_SKILL_TITLES;
  slug: SkillSlug;
  description: string;
  domain: string;
};

const E2E_SKILLS: E2ESkill[] = [
  {
    category: "web-framework",
    id: "web-framework-react",
    slug: "react",
    description: "React framework for building user interfaces",
    domain: "web",
  },
  {
    category: "web-testing",
    id: "web-testing-vitest",
    slug: "vitest",
    description: "Next generation testing framework",
    domain: "web",
  },
  {
    category: "web-client-state",
    id: "web-state-zustand",
    slug: "zustand",
    description: "Bear necessities state management",
    domain: "web",
  },
  {
    category: "api-api",
    id: "api-framework-hono",
    slug: "hono",
    description: "Lightweight web framework for the edge",
    domain: "api",
  },
  {
    category: "meta-methodology",
    id: "meta-methodology-research-methodology",
    slug: "research-methodology",
    description: "Codebase investigation and research methodology",
    domain: "meta",
  },
  {
    category: "meta-reviewing",
    id: "meta-reviewing-reviewing",
    slug: "reviewing",
    description: "Code review guidance and patterns",
    domain: "meta",
  },
  {
    category: "meta-reviewing",
    id: "meta-reviewing-cli-reviewing",
    slug: "cli-reviewing",
    description: "CLI code review patterns",
    domain: "meta",
  },
  {
    category: "web-framework",
    id: "web-framework-vue-composition-api",
    slug: "vue-composition-api",
    description: "Vue.js composition API framework",
    domain: "web",
  },
  {
    category: "web-client-state",
    id: "web-state-pinia",
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
    id: "web-testing-visual-regression",
    slug: "visual-regression",
    description: "Screenshot baselines and diff review",
    domain: "web",
  },
];

// Preload shape matches real CLI stacks in src/cli/lib/configuration/default-stacks.ts:
// real `web-developer` preloads only `web-framework-react` (+ meta-framework when present);
// real `api-developer` preloads only `api-framework-hono` (+ database when present).
// Meta skills are never preloaded in real stacks — they appear as dynamic skills in the
// body's Skill Activation Protocol table, never in agent frontmatter.
const webDeveloperAgentConfig: StackAgentConfig = {
  "web-framework": [createMockSkillAssignment("web-framework-react", true)],
  "web-testing": [createMockSkillAssignment("web-testing-vitest")],
  "web-client-state": [createMockSkillAssignment("web-state-zustand")],
  "meta-reviewing": [
    createMockSkillAssignment("meta-reviewing-reviewing"),
    createMockSkillAssignment("meta-reviewing-cli-reviewing"),
  ],
  "meta-methodology": [createMockSkillAssignment("meta-methodology-research-methodology")],
};

const apiDeveloperAgentConfig: StackAgentConfig = {
  "api-api": [createMockSkillAssignment("api-framework-hono", true)],
  "meta-methodology": [createMockSkillAssignment("meta-methodology-research-methodology")],
  "meta-reviewing": [createMockSkillAssignment("meta-reviewing-reviewing")],
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

const E2E_STACK: Stack = {
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
export const E2E_STACK_SKILL_IDS: SkillId[] = [
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
  withoutSkills?: readonly SkillId[];
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
  const sourceDir = path.join(tempDir, "source");

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

async function writeSkills(sourceDir: string, skills: E2ESkill[]): Promise<void> {
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
        displayName: E2E_SKILL_TITLES[skill.id],
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
