import path from "path";
import { mkdir, writeFile } from "fs/promises";
import {
  createTempDir,
  createLocalSkill,
  createPermissionsFile,
  writeProjectConfig,
  writeAgentStubs,
  renderMetadataYaml,
  renderSkillMd,
  FORKED_FROM_METADATA,
} from "../helpers/test-utils.js";
import type {
  FixtureProjectConfig,
  FixtureSkillConfig,
  FixtureStackAgentConfig,
} from "../helpers/test-utils.js";
import { E2E_SKILL } from "./expected-values.js";
import { pluginKeyFor } from "./plugin-install-state.js";
import { DIRS, FILES } from "../pages/constants.js";
import type { AgentName, Domain } from "../../src/cli/types/index.js";
import type { ProjectHandle } from "../pages/wizard-result.js";

export type DualScopeHandle = {
  project: ProjectHandle;
  globalHome: ProjectHandle;
};

export type EditableOptions = {
  /**
   * The skills source this install answers to, recorded in its config.
   *
   * Every command after `init` resolves the source out of the config — `--marketplace` is
   * `init`'s flag alone and `CC_MARKETPLACE` is read at install time only — so a fixture that
   * hand-writes an install has to write the source too, or the commands under test read
   * the default public marketplace. Pass it HERE rather than to a wizard launcher whenever
   * the spec snapshots config.ts: recorded at build time it is part of the fixture, and
   * recorded later it is a change the snapshot sees.
   */
  marketplace?: string;
  skills?: string[];
  agents?: AgentName[];
  domains?: Domain[];
  stack?: Partial<Record<AgentName, FixtureStackAgentConfig>>;
  /**
   * Writes `FORKED_FROM_METADATA` as each skill's metadata.yaml instead of the
   * default metadata, marking the skills as CLI-managed so `uninstall` removes
   * them instead of skipping them as user-created.
   */
  forkedFrom?: boolean;
  /**
   * Extra `scope: "global"` skill entries recorded in the project config. In a
   * project-scope edit these render as inherited, locked (readOnly) Sources rows
   * — the `installedSkillConfigs` snapshot IS `projectConfig.skills`, and a
   * global entry viewed from a project edit is read-only (see
   * `classifySkillSourceRows`). No disk copy is written: they model skills
   * inherited from the global install, not project-local files.
   */
  globalSkills?: string[];
  /**
   * The `origin` recorded for the `globalSkills` entries above. Defaults to `"eject"`, which
   * matches the project half and is the shape most specs want.
   *
   * It exists because one scenario is UNREACHABLE at that default: the `s` collapse of a
   * `[P][G]` pair back to `[G]`. `wouldOverwriteGlobalEject` refuses a project→global press
   * exactly when the live entry is a project eject, the snapshot holds an ACTIVE global eject
   * and no tombstone exists — so the press returns a toast and changes nothing, and a spec built
   * on the default fails on a swallowed keystroke while reading as the render bug it meant to
   * test. Naming a marketplace for the global half is what makes the collapse reachable, and
   * every such spec still owes a scope-badge proof (`["P"]` → `["G"]`) that the press landed.
   */
  globalSkillsSource?: string;
  /**
   * Skills recorded in the project config with NO files written for them. A skill
   * the session's source does not carry AND the install has no copy of is one the
   * wizard cannot resolve: it drops the skill from its roster, and the run reports
   * a change.
   *
   * Writing the files instead does not produce that state — an installed local
   * skill whose metadata.yaml describes it is merged into the matrix and offered
   * like any other, so the wizard resolves it and nothing changes.
   */
  unresolvableSkills?: string[];
};

/** Description and metadata.yaml body for one local skill written by a fixture. */
export type SkillContentOverride = {
  description: string;
  metadata: string;
};

export type DualScopeOptions = {
  globalSkill?: SkillContentOverride;
  projectSkills?: FixtureSkillConfig[];
  projectStack?: FixtureStackAgentConfig;
  projectSkill?: SkillContentOverride;
};

export type PluginProjectOptions = {
  skills: string[];
  marketplaceName: string;
  /** The skills source this install answers to — see {@link EditableOptions.marketplace}. */
  marketplace?: string;
  agents?: AgentName[];
  domains?: Domain[];
  /**
   * When true, skips writing the `marketplaceName` field into config.ts even
   * though every skill entry carries that marketplace as its `origin`. Simulates
   * legacy installs where the marketplace's name was never persisted — the scenario
   * that triggered the silent plugin-install skip regression (see
   * feedback_no_plugin_to_eject_fallback.md).
   */
  omitMarketplaceField?: boolean;
  /** Config entries with no files written for them — see {@link EditableOptions.unresolvableSkills}. */
  unresolvableSkills?: string[];
};

/** The identity fields a fixture writes into an installed skill's metadata.yaml. */
type SkillIdentityFields = { category: string; slug: string; displayName: string };

/**
 * Explicit category, slug and display name for every skill ID these fixtures write
 * metadata for. Deriving any of them from a skill ID is banned (see CLAUDE.md) because
 * a wrong guess still looks plausible on disk; an unmapped ID must fail loudly instead.
 *
 * Every `category` here must be a member of `CATEGORIES` in
 * `src/cli/types/generated/source-types.ts` — note that `web-state-*` skills
 * belong to `web-client-state`, not to a `web-state` category.
 *
 * `displayName` is the title the SOURCE publishes for the same skill, so an installed
 * copy and the catalogue entry it came from name it the same way. It is not the id:
 * the strict metadata schema bounds the field at 30 characters, and a namespaced id is
 * longer than that on its own — `doctor`'s content layer validates every installed
 * metadata.yaml, so a fixture writing one reads as a broken install rather than a
 * healthy project. Same reasoning as `FORKED_FROM_METADATA` in test-utils.ts.
 *
 * Keyed by the id an install actually records, so the fixture marketplace's
 * entries are namespaced and `web-styling-tailwind` — which no source here ships,
 * and which exists to be UNRESOLVABLE — is not.
 */
const SKILL_IDENTITY_FIELDS: Record<string, SkillIdentityFields> = {
  [E2E_SKILL.hono.id]: {
    category: "api-api",
    slug: E2E_SKILL.hono.slug,
    displayName: E2E_SKILL.hono.display,
  },
  [E2E_SKILL["research-methodology"].id]: {
    category: "meta-methodology",
    slug: E2E_SKILL["research-methodology"].slug,
    displayName: E2E_SKILL["research-methodology"].display,
  },
  [E2E_SKILL["cli-reviewing"].id]: {
    category: "meta-reviewing",
    slug: E2E_SKILL["cli-reviewing"].slug,
    displayName: E2E_SKILL["cli-reviewing"].display,
  },
  [E2E_SKILL.reviewing.id]: {
    category: "meta-reviewing",
    slug: E2E_SKILL.reviewing.slug,
    displayName: E2E_SKILL.reviewing.display,
  },
  [E2E_SKILL.react.id]: {
    category: "web-framework",
    slug: E2E_SKILL.react.slug,
    displayName: E2E_SKILL.react.display,
  },
  [E2E_SKILL.zustand.id]: {
    category: "web-client-state",
    slug: E2E_SKILL.zustand.slug,
    displayName: E2E_SKILL.zustand.display,
  },
  "web-styling-tailwind": { category: "web-styling", slug: "tailwind", displayName: "Tailwind" },
  [E2E_SKILL["visual-regression"].id]: {
    category: "web-testing",
    slug: E2E_SKILL["visual-regression"].slug,
    displayName: E2E_SKILL["visual-regression"].display,
  },
  [E2E_SKILL.vitest.id]: {
    category: "web-testing",
    slug: E2E_SKILL.vitest.slug,
    displayName: E2E_SKILL.vitest.display,
  },
  [E2E_SKILL.pinia.id]: {
    category: "web-client-state",
    slug: E2E_SKILL.pinia.slug,
    displayName: E2E_SKILL.pinia.display,
  },
  "web-testing-cypress-e2e": {
    category: "web-e2e",
    slug: "cypress-e2e",
    displayName: "Cypress E2E",
  },
  "web-testing-playwright-e2e": {
    category: "web-e2e",
    slug: "playwright-e2e",
    displayName: "Playwright E2E",
  },
  "web-testing-react-testing-library": {
    category: "web-testing",
    slug: "react-testing-library",
    displayName: "React Testing Library",
  },
  "web-testing-vue-test-utils": {
    category: "web-testing",
    slug: "vue-test-utils",
    displayName: "Vue Test Utils",
  },
  "web-mocks-msw": { category: "web-mocking", slug: "msw", displayName: "MSW" },
  "web-state-jotai": { category: "web-client-state", slug: "jotai", displayName: "Jotai" },
  "web-testing-e2e-valid": { category: "web-e2e", slug: "e2e-valid", displayName: "Valid E2E" },
  "web-testing-e2e-broken": { category: "web-e2e", slug: "e2e-broken", displayName: "Broken E2E" },
  "web-testing-e2e-good": { category: "web-e2e", slug: "e2e-good", displayName: "Good E2E" },
  "web-testing-e2e-exists": {
    category: "web-e2e",
    slug: "e2e-exists",
    displayName: "Existing E2E",
  },
  "web-testing-e2e-orphan": { category: "web-e2e", slug: "e2e-orphan", displayName: "Orphan E2E" },
  "web-testing-e2e-first": { category: "web-e2e", slug: "e2e-first", displayName: "First E2E" },
  "web-testing-e2e-second": { category: "web-e2e", slug: "e2e-second", displayName: "Second E2E" },
  "my-custom-skill": {
    category: "web-tooling",
    slug: "my-custom-skill",
    displayName: "My Custom Skill",
  },
};

/**
 * The stated `category` / `slug` / `displayName` of a fixture skill, from the one table
 * above. Exported because a second caller exists: nothing may derive these three from an
 * id or a directory name, so every fixture that writes a `metadata.yaml` has to read them
 * from here and take the throw when the table has no row.
 */
export function metadataFieldsFor(skillId: string): SkillIdentityFields {
  const entry = SKILL_IDENTITY_FIELDS[skillId];
  if (!entry) {
    throw new Error(
      `No category/slug/displayName mapping for skill "${skillId}". ` +
        `Add it to SKILL_IDENTITY_FIELDS in e2e/fixtures/project-builder.ts.`,
    );
  }
  return entry;
}

/**
 * Enables a set of plugin keys in the project's `.claude/settings.json` — the one file
 * `toHavePlugin` reads, and therefore the only place a plugin's presence or departure is
 * observable.
 *
 * Writes rather than merges, because the only caller runs it on a directory it has just
 * created and nothing has put a settings.json there yet. `createPermissionsFile` runs
 * after and DOES merge, so the permissions block lands on top of these keys rather than
 * replacing them.
 */
async function enablePluginsInSettings(projectDir: string, pluginKeys: string[]): Promise<void> {
  const claudeDir = path.join(projectDir, DIRS.CLAUDE);
  await mkdir(claudeDir, { recursive: true });
  await writeFile(
    path.join(claudeDir, FILES.SETTINGS_JSON),
    JSON.stringify({ enabledPlugins: Object.fromEntries(pluginKeys.map((key) => [key, true])) }),
  );
}

/**
 * What `ProjectBuilder.minimal()` puts in the project — the single local skill
 * and the two agents its config declares. Exported so specs assert against the
 * fixture's own definition rather than re-typing the names the command echoes
 * back at them.
 */
export const MINIMAL_PROJECT_SKILL_ID = E2E_SKILL.vitest.id;
export const MINIMAL_PROJECT_AGENT_NAMES = [
  "web-developer",
  "api-developer",
] as const satisfies readonly AgentName[];

/**
 * The custom skill `ProjectBuilder.withCustomSkill()` installs and preloads.
 * Deliberately outside the `SkillId` union — a custom skill is exactly a skill
 * the marketplace does not know about.
 */
export const CUSTOM_PROJECT_SKILL_ID = "web-custom-e2e-widget";

export class ProjectBuilder {
  /**
   * Creates a minimal project with one local skill and config.
   * Suitable for compile tests.
   *
   * Structure:
   *   <projectDir>/
   *     .claude-src/
   *       config.ts
   *     .claude/
   *       skills/
   *         web-testing-vitest/
   *           SKILL.md
   *           metadata.yaml
   */
  static async minimal(): Promise<ProjectHandle> {
    const tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    await createLocalSkill(projectDir, MINIMAL_PROJECT_SKILL_ID, {
      description: "E2E test skill for compile verification",
      body: "# Test E2E Skill\n\nThis skill exists solely for E2E testing of the compile command.",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor(MINIMAL_PROJECT_SKILL_ID),
        cliDescription: "E2E test skill",
        usageGuidance: "Use when testing E2E scenarios",
        contentHash: "a1b2c3d",
      }),
    });

    const config: FixtureProjectConfig = {
      name: "e2e-compile-test",
      skills: [{ id: MINIMAL_PROJECT_SKILL_ID, scope: "project", origin: "eject" }],
      agents: MINIMAL_PROJECT_AGENT_NAMES.map((name) => ({ name, scope: "project" })),
    };

    await writeProjectConfig(projectDir, config);

    return { dir: projectDir };
  }

  /**
   * Creates a project suitable for the edit command.
   * Has config, local skills, and an agents directory.
   *
   * Structure:
   *   <projectDir>/
   *     .claude-src/
   *       config.ts
   *     .claude/
   *       skills/
   *         <skillId>/
   *           SKILL.md
   *           metadata.yaml
   *       agents/       (empty, for recompilation target)
   */
  static async editable(options?: EditableOptions): Promise<ProjectHandle> {
    const tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const skills = options?.skills ?? [E2E_SKILL.react.id];
    const agents = options?.agents ?? ["web-developer"];
    const domains = options?.domains ?? ["web"];

    const skillsDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS);
    const agentsDir = path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS);

    await mkdir(skillsDir, { recursive: true });
    await mkdir(agentsDir, { recursive: true });

    const globalSkills = options?.globalSkills ?? [];
    const unresolvableSkills = options?.unresolvableSkills ?? [];
    const projectSkillConfigs = [...skills, ...unresolvableSkills].map((id) => ({
      id,
      scope: "project" as const,
      origin: "eject",
    }));
    const globalSkillConfigs = globalSkills.map((id) => ({
      id,
      scope: "global" as const,
      origin: options?.globalSkillsSource ?? "eject",
    }));
    const skillConfigs = [...projectSkillConfigs, ...globalSkillConfigs];
    const agentConfigs = agents.map((name) => ({ name, scope: "project" as const }));

    const config: FixtureProjectConfig = {
      name: "test-edit-project",
      skills: skillConfigs,
      agents: agentConfigs,
      selectedDomains: domains,
      ...(options?.marketplace !== undefined && { marketplace: options.marketplace }),
      ...(options?.stack && { stack: options.stack }),
    };

    await writeProjectConfig(projectDir, config);

    for (const skillId of skills) {
      await createLocalSkill(projectDir, skillId, {
        description: "Test skill for E2E",
        body: `# ${skillId}\n\nTest content.`,
        metadata: options?.forkedFrom
          ? FORKED_FROM_METADATA
          : renderMetadataYaml({
              ...metadataFieldsFor(skillId),
              cliDescription: "E2E test skill",
              usageGuidance: "Use when testing E2E scenarios",
              contentHash: "b2c3d4e",
            }),
      });
    }

    return { dir: projectDir };
  }

  /**
   * Creates dual-scope project (global + project installations).
   *
   * Structure:
   *   <tempDir>/
   *     global-home/                        <- fake HOME
   *       .claude-src/config.ts             <- global config
   *       .claude/skills/web-testing-cypress-e2e/
   *     project/                            <- project dir (cwd)
   *       .claude-src/config.ts             <- project config
   *       .claude/skills/web-testing-playwright-e2e/
   */
  static async dualScope(options?: DualScopeOptions): Promise<DualScopeHandle> {
    const tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");

    // --- Global installation ---
    const globalConfig: FixtureProjectConfig = {
      name: "global-test",
      skills: [{ id: "web-testing-cypress-e2e", scope: "global", origin: "eject" }],
      agents: [{ name: "web-developer", scope: "global" }],
      selectedDomains: ["web"],
      stack: {
        "web-developer": {
          "web-testing": [{ id: "web-testing-cypress-e2e", preloaded: true }],
        },
      },
    };
    await writeProjectConfig(globalHome, globalConfig);

    await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
      description: options?.globalSkill?.description ?? "Global E2E skill for dual-scope testing",
      metadata:
        options?.globalSkill?.metadata ??
        renderMetadataYaml({
          ...metadataFieldsFor("web-testing-cypress-e2e"),
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "c3d4e5f",
        }),
    });

    // --- Project installation ---
    const projectConfig: FixtureProjectConfig = {
      name: "project-test",
      skills: options?.projectSkills ?? [
        { id: "web-testing-playwright-e2e", scope: "project", origin: "eject" },
        { id: "web-testing-cypress-e2e", scope: "global", origin: "eject" },
      ],
      agents: [{ name: "api-developer", scope: "project" }],
      selectedDomains: ["web"],
      stack: {
        "api-developer": options?.projectStack ?? {
          "web-testing": [{ id: "web-testing-cypress-e2e", preloaded: true }],
          "web-mocking": [{ id: "web-testing-playwright-e2e", preloaded: true }],
        },
      },
    };
    await writeProjectConfig(projectDir, projectConfig);

    await createLocalSkill(projectDir, "web-testing-playwright-e2e", {
      description:
        options?.projectSkill?.description ?? "Project-local E2E skill for dual-scope testing",
      metadata:
        options?.projectSkill?.metadata ??
        renderMetadataYaml({
          ...metadataFieldsFor("web-testing-playwright-e2e"),
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "d4e5f6a",
        }),
    });

    return {
      project: { dir: projectDir },
      globalHome: { dir: globalHome },
    };
  }

  /**
   * Creates a dual-scope project where the project config imports from the global config.
   * Used for compile verification of cross-scope config resolution.
   *
   * Structure:
   *   <tempDir>/
   *     fake-home/                             <- fake HOME (globalHome)
   *       .claude-src/
   *         config.ts                          <- global config
   *         config-types.ts                    <- shared types
   *       .claude/skills/web-framework-react/
   *     project/                               <- project dir (cwd)
   *       .claude-src/
   *         config.ts                          <- imports globalHome config
   *         config-types.ts                    <- shared types
   *       .claude/skills/web-testing-vitest/
   */
  static async dualScopeWithImport(): Promise<DualScopeHandle> {
    const tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "fake-home");
    const projectDir = path.join(tempDir, "project");

    // --- Global installation ---
    await writeProjectConfig(globalHome, {
      name: "global",
      skills: [{ id: "web-framework-react", scope: "global", origin: "eject" }],
      agents: [{ name: "web-developer", scope: "global" }],
      selectedDomains: ["web"],
      stack: {
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
      },
    });

    await createLocalSkill(globalHome, "web-framework-react", {
      description: "React framework skill for global scope testing",
      metadata: renderMetadataYaml({
        category: "web-framework",
        slug: "react",
        contentHash: "hash-react",
      }),
    });

    // --- Shared config-types.ts ---
    const configTypesContent = `// AUTO-GENERATED
export type SkillId = "web-framework-react" | "web-testing-vitest";
export type AgentName = "web-developer" | "api-developer";
export type Domain = "web";
export type Category = "web-framework" | "web-testing";
export type SkillConfig = { id: SkillId; scope: "project" | "global"; origin: string };
export type SkillAssignment = SkillId | { id: SkillId; preloaded: boolean };
export type StackAgentConfig = Partial<Record<Category, SkillAssignment>>;
export type AgentScopeConfig = { name: AgentName; scope: "project" | "global" };
export interface ProjectConfig {
  version?: "1";
  name: string;
  description?: string;
  agents: AgentScopeConfig[];
  skills: SkillConfig[];
  author?: string;
  stack?: Partial<Record<AgentName, StackAgentConfig>>;
  marketplace?: string;
  marketplaceName?: string;
  agentsSource?: string;
  selectedDomains?: Domain[];
}
`;
    const globalConfigDir = path.join(globalHome, DIRS.CLAUDE_SRC);
    const projectConfigDir = path.join(projectDir, DIRS.CLAUDE_SRC);
    await mkdir(projectConfigDir, { recursive: true });

    await writeFile(path.join(globalConfigDir, FILES.CONFIG_TYPES_TS), configTypesContent);
    await writeFile(path.join(projectConfigDir, FILES.CONFIG_TYPES_TS), configTypesContent);

    // --- Project config that imports from global ---
    const globalImportPath = path
      .relative(projectConfigDir, globalConfigDir)
      .split(path.sep)
      .join("/");

    const projectConfigContent = `import globalConfig from "${globalImportPath}/config";
import type { ProjectConfig } from "./config-types";

const skills = [
  ...globalConfig.skills,
  {"id":"web-testing-vitest","scope":"project","origin":"eject"},
];

const agents = [
  ...globalConfig.agents,
  {"name":"api-developer","scope":"project"},
];

export default {
  ...globalConfig,
  name: "test-project",
  skills,
  agents } satisfies ProjectConfig;
`;
    await writeFile(path.join(projectConfigDir, FILES.CONFIG_TS), projectConfigContent);

    // --- Project skill ---
    await createLocalSkill(projectDir, "web-testing-vitest", {
      description: "Vitest testing skill for project scope testing",
      metadata: renderMetadataYaml({
        category: "web-testing",
        slug: "vitest",
        contentHash: "hash-vitest",
      }),
    });

    return {
      project: { dir: projectDir },
      globalHome: { dir: globalHome },
    };
  }

  /**
   * Creates a project with a custom (non-marketplace) skill and config-types.ts.
   * Exercises Zod schema validation for a skill id outside the union.
   *
   * The ID is custom and the TAXONOMY is real. A custom skill is placed in a
   * category that already exists rather than bringing one, so a fabricated
   * `custom-e2e` domain and `web-custom-e2e` category — what this fixture wrote
   * until the placement rule landed — is a file no product path can produce and
   * the loader now refuses.
   *
   * Structure:
   *   <projectDir>/
   *     .claude-src/
   *       config-types.ts   (auto-generated types including the custom ID)
   *       config.ts         (imports config-types, uses satisfies ProjectConfig)
   *     .claude/
   *       skills/
   *         web-custom-e2e-widget/
   *           SKILL.md
   *           metadata.yaml  (custom: true, domain: web, category: web-tooling)
   */
  static async withCustomSkill(options?: { marketplace?: string }): Promise<ProjectHandle> {
    const tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    const configDir = path.join(projectDir, DIRS.CLAUDE_SRC);
    const skillDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, CUSTOM_PROJECT_SKILL_ID);

    await mkdir(configDir, { recursive: true });
    await mkdir(skillDir, { recursive: true });

    // Auto-generated config-types.ts with custom skill ID and custom category
    const configTypesContent = `// AUTO-GENERATED by agents-inc — DO NOT EDIT

export type SkillId =
  // Custom
  | "${CUSTOM_PROJECT_SKILL_ID}"
  // Marketplace
  | "web-framework-react";

export type AgentName =
  | "web-developer";

export type Domain =
  | "web";

export type Category =
  | "web-framework"
  | "web-tooling";

export type SkillConfig = { id: SkillId; scope: "project" | "global"; origin: string };

export type SkillAssignment = SkillId | { id: SkillId; preloaded: boolean };

export type StackAgentConfig = Partial<Record<Category, SkillAssignment>>;

export type AgentScopeConfig = { name: AgentName; scope: "project" | "global" };

export interface ProjectConfig {
  version?: "1";
  name: string;
  description?: string;
  agents: AgentScopeConfig[];
  skills: SkillConfig[];
  author?: string;
  stack?: Partial<Record<AgentName, StackAgentConfig>>;
  marketplace?: string;
  marketplaceName?: string;
  agentsSource?: string;
  selectedDomains?: Domain[];
}
`;

    await writeFile(path.join(configDir, FILES.CONFIG_TYPES_TS), configTypesContent);

    // Config file that references custom skill and custom category
    const marketplaceLine =
      options?.marketplace === undefined ? "" : `\n  marketplace: "${options.marketplace}",`;
    const configContent = `import type { ProjectConfig } from "./config-types";

export default {
  name: "test-custom-skill-project",${marketplaceLine}
  agents: [{ name: "web-developer", scope: "project" }],
  skills: [{ id: "${CUSTOM_PROJECT_SKILL_ID}", scope: "project", origin: "eject" }],
  selectedDomains: ["web"],
  stack: {
    "web-developer": {
      "web-tooling": {
        id: "${CUSTOM_PROJECT_SKILL_ID}",
        preloaded: true,
      },
    },
  },
} satisfies ProjectConfig;
`;

    await writeFile(path.join(configDir, FILES.CONFIG_TS), configContent);

    // Written directly (not via createLocalSkill) because the custom skill ID
    // is intentionally outside the SkillId union.
    await writeFile(
      path.join(skillDir, FILES.SKILL_MD),
      renderSkillMd(
        CUSTOM_PROJECT_SKILL_ID,
        "A custom test widget skill",
        "# Custom E2E Widget\n\nCustom skill for E2E testing of custom skill ID handling.",
      ),
    );

    await writeFile(
      path.join(skillDir, FILES.METADATA_YAML),
      renderMetadataYaml({
        custom: true,
        domain: "web",
        category: "web-tooling",
        slug: "e2e-widget",
        displayName: "Custom E2E Widget",
        cliDescription: "E2E custom test skill",
        usageGuidance: "Use when testing custom skill scenarios",
        contentHash: "e5f6a7b",
      }),
    );

    return { dir: projectDir };
  }

  /**
   * Creates a project that looks like it was initialized in plugin mode.
   * Has config with marketplace source, skills, agents dir with agent stubs, and each
   * declared skill's plugin key enabled in `.claude/settings.json`.
   *
   * **The enabled keys are what make a DEPARTURE assertable.** Without them the fixture
   * claimed plugin origin in config.ts and left the one file `toHavePlugin` reads empty,
   * so `not.toHavePlugin` held before the command ran and every migration spec built here
   * could check the install direction and not the uninstall one. A hardening pass added
   * exactly that assertion, mutated away the `claudePluginUninstall` call, watched it stay
   * green and removed its own assertion rather than ship a vacuous one.
   *
   * `unresolvableSkills` get no key: they are config entries with no files, which is a
   * state no install ever reached, so enabling them would be a claim about an install that
   * did not happen. The registry half lives in `createPluginInstalledProject`, in
   * `plugin-install-state.ts` — that fixture owns a fake HOME and this one does
   * not, and `toHavePlugin` reads only the project's settings.json.
   */
  static async pluginProject(options: PluginProjectOptions): Promise<ProjectHandle> {
    const tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const skills = options.skills;
    const agents = options.agents ?? ["web-developer"];
    const domains = options.domains ?? ["web"];

    await writeProjectConfig(projectDir, {
      name: "plugin-edit-test",
      ...(options.marketplace !== undefined && { marketplace: options.marketplace }),
      ...(options.omitMarketplaceField ? {} : { marketplaceName: options.marketplaceName }),
      skills: [...skills, ...(options.unresolvableSkills ?? [])].map((id) => ({
        id,
        scope: "project" as const,
        origin: options.marketplaceName,
      })),
      agents: agents.map((name) => ({ name, scope: "project" as const })),
      selectedDomains: domains,
    });

    for (const skillId of skills) {
      await createLocalSkill(projectDir, skillId, {
        description: "Test skill",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor(skillId),
          contentHash: `e2e-hash-${skillId}`,
        }),
      });
    }

    await writeAgentStubs(projectDir, agents);

    await enablePluginsInSettings(
      projectDir,
      skills.map((id) => pluginKeyFor(id, options.marketplaceName)),
    );
    await createPermissionsFile(projectDir);

    return { dir: projectDir };
  }

  /**
   * Creates a project initialized in eject mode but with a marketplace configured.
   * Skills have source "eject" but the config has a marketplace field.
   */
  static async localProjectWithMarketplace(options: PluginProjectOptions): Promise<ProjectHandle> {
    const tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const skills = options.skills;
    const agents = options.agents ?? ["web-developer"];
    const domains = options.domains ?? ["web"];

    await writeProjectConfig(projectDir, {
      name: "local-edit-test",
      ...(options.marketplace !== undefined && { marketplace: options.marketplace }),
      marketplaceName: options.marketplaceName,
      skills: skills.map((id) => ({
        id,
        scope: "project" as const,
        origin: "eject",
      })),
      agents: agents.map((name) => ({ name, scope: "project" as const })),
      selectedDomains: domains,
    });

    for (const skillId of skills) {
      await createLocalSkill(projectDir, skillId, {
        description: "Test skill",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor(skillId),
          contentHash: `e2e-hash-${skillId}`,
        }),
      });
    }

    await writeAgentStubs(projectDir, agents);

    await createPermissionsFile(projectDir);

    return { dir: projectDir };
  }

  /**
   * Creates a global installation with one skill installed.
   * Returns a handle to the global home dir (for HOME env var)
   * and a subdirectory to run commands from (simulating a project without its own config).
   *
   * Structure:
   *   <tempDir>/
   *     .claude-src/config.ts         <- global config
   *     .claude/skills/web-framework-react/
   *       SKILL.md
   *       metadata.yaml
   *     subproject/                   <- empty dir to run from
   */
  static async globalWithSubproject(): Promise<{ globalHome: ProjectHandle; subDir: string }> {
    const tempDir = await createTempDir();

    await writeProjectConfig(tempDir, {
      name: "global-test",
      skills: [{ id: "web-framework-react", scope: "project", origin: "eject" }],
      agents: [{ name: "web-developer", scope: "project" }],
      selectedDomains: ["web"],
    });

    await createLocalSkill(tempDir, "web-framework-react", {
      description: "React",
      body: "# React",
      metadata: renderMetadataYaml({
        displayName: "web-framework-react",
        category: "web-framework",
        slug: "react",
        contentHash: "hash",
      }),
    });

    const subDir = path.join(tempDir, "subproject");
    await mkdir(subDir, { recursive: true });

    return { globalHome: { dir: tempDir }, subDir };
  }

  /**
   * Creates a minimal `.claude-src/config.ts` installation in the given directory.
   * This satisfies `detectInstallation()` for commands that require an existing
   * installation (e.g., `new skill` when no `--output` flag is provided).
   *
   * Unlike other ProjectBuilder methods, this does NOT create its own temp dir.
   * It writes into the provided directory.
   */
  static async installation(dir: string): Promise<void> {
    // Declares a skill so the config is a real installation: a config that
    // declares neither skills nor agents is content-less and does not count as
    // an installation.
    await writeProjectConfig(dir, {
      name: "test",
      skills: [{ id: "web-framework-react", scope: "project", origin: "eject" }],
      selectedDomains: [],
    });
  }
}
