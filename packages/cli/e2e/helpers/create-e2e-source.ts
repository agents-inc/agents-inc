import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { createTempDir, runCLI, writeTestPackageJson } from "./test-utils.js";
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
import { E2E_MARKETPLACE_NAME, e2eSkillId } from "../pages/constants.js";
import { createMockSkillAssignment } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import { typedKeys, typedValues } from "../../src/cli/utils/typed-object.js";
import {
  renderAgentYaml,
  renderConfigTs,
  renderMetadataYaml,
  renderRulesTs,
  renderSkillMd,
} from "../../src/cli/lib/__tests__/content-generators.js";

// Prefer the shared, frozen `E2E_SOURCE`. Build your own only when the source is the subject:
// `createE2ESource(options)` for different contents, `{ unbuilt: true }` for a pre-build checkout,
// `createE2EPluginSource({ owned: true })` for a tree the spec writes into.

export { e2eSkillId };

export const E2E_AGENT_TITLES = {
  "web-developer": "Web Developer",
  "api-developer": "API Developer",
} as const satisfies Partial<Record<AgentName, string>>;

type E2ESkill = {
  category: CategoryPath;
  /** Namespaced by the fixture marketplace, so `string` rather than `SkillId`. */
  id: string;
  slug: SkillSlug;
  description: string;
  domain: string;
};

// The sole definition of what a fixture ships; ids, titles and directories are derived from it.
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
  // The spare: assigned to no agent, in a non-exclusive category, so selecting it genuinely adds.
  {
    category: "web-testing",
    id: e2eSkillId("web-testing-visual-regression"),
    slug: "visual-regression",
    description: "Screenshot baselines and diff review",
    domain: "web",
  },
] as const satisfies readonly E2ESkill[];

type E2ESkillEntry = (typeof E2E_SKILLS)[number];

// Slugs, not ids: ids are composed at runtime and are not literal types.
type E2ESkillSlug = E2ESkillEntry["slug"];

export const E2E_SKILL_IDS: readonly string[] = E2E_SKILLS.map((skill) => skill.id).sort();

// What the CLI renders for each skill. A title must be neither an id nor a catalogue display name,
// or `toContain(display)` is answered by the id.
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

// Preloads mirror the real stacks in default-stacks.ts; meta skills are never preloaded.
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

const E2E_STACK_NAME = "E2E Test Stack";

// config.ts has no `stackId`, so the description is the only trace the installed stack leaves.
export const E2E_STACK_ID = "e2e-test-stack";
export const E2E_STACK_DESCRIPTION = "Minimal stack for E2E testing";

// Assignments widened: fixture ids are outside the catalogue union.
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

export const E2E_STACK_AGENTS: AgentName[] = typedKeys<AgentName>(E2E_STACK.agents).sort();

export const E2E_STACK_SKILL_IDS: string[] = [
  ...new Set(
    typedValues(E2E_STACK.agents)
      .flatMap((agentConfig) => typedValues(agentConfig))
      .flatMap((assignments) => assignments.map((assignment) => assignment.id)),
  ),
].sort();

type E2ESourceOptions = {
  /** The only source of unresolved-slug warnings; built-in rules are narrowed to shipped slugs. */
  relationships?: Partial<RelationshipDefinitions>;
  /** A marketplace as it stood before these skills were published. */
  withoutSkills?: readonly string[];
  withoutStacks?: boolean;
  /** Skip `build plugins` and `build marketplace`; every consuming command refuses such a tree. */
  unbuilt?: boolean;
  marketplaceName?: string;
};

export type E2ESource = {
  sourceDir: string;
  tempDir: string;
};

export async function createE2ESource(options?: E2ESourceOptions): Promise<E2ESource> {
  const tempDir = await createTempDir();
  // Spells neither "source" nor "marketplace", so prose assertions on those nouns skip the path.
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

  if (!options?.unbuilt) {
    await publishE2EMarketplace(sourceDir, options?.marketplaceName ?? E2E_MARKETPLACE_NAME);
  }

  return { sourceDir, tempDir };
}

async function writeE2ESourceInto(sourceDir: string): Promise<void> {
  await writeSkills(sourceDir, E2E_SKILLS);
  await writeStacks(sourceDir);
  await writeAgents(sourceDir);
}

export async function buildE2EMarketplaceInto(sourceDir: string): Promise<void> {
  await writeE2ESourceInto(sourceDir);
  await publishE2EMarketplace(sourceDir, E2E_MARKETPLACE_NAME);
}

// The CLI's own builds, so fixtures carry exactly what an author publishes.
async function publishE2EMarketplace(sourceDir: string, marketplaceName: string): Promise<void> {
  const builtPlugins = await runCLI(["build", "plugins"], sourceDir);
  if (builtPlugins.exitCode !== 0) {
    throw new Error(
      `build plugins failed (exit ${builtPlugins.exitCode}):\n${builtPlugins.combined}`,
    );
  }

  await writeTestPackageJson(sourceDir, { name: marketplaceName });

  const builtMarketplace = await runCLI(["build", "marketplace"], sourceDir);
  if (builtMarketplace.exitCode !== 0) {
    throw new Error(
      `build marketplace failed (exit ${builtMarketplace.exitCode}):\n${builtMarketplace.combined}`,
    );
  }
}

const SHARED_PLAIN_SEGMENT = "plain";

// Written once per run by globalSetup and frozen; a spec writing into it fails at the write. Read
// when used, not at import: modules outside a run (the hand-run bundle, unit specs) import it too.
export const E2E_SOURCE: E2ESource = {
  get sourceDir() {
    return path.join(sharedSourcePath(), SHARED_PLAIN_SEGMENT);
  },
  get tempDir() {
    return sharedSourcePath();
  },
};

export async function buildSharedE2ESourceInto(root: string): Promise<void> {
  await buildE2EMarketplaceInto(path.join(root, SHARED_PLAIN_SEGMENT));
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

// No `_templates/agent.liquid`: template resolution never looks in a marketplace.
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
