import path from "path";
import { mkdir, writeFile } from "fs/promises";
import {
  createTempDir,
  createLocalSkill,
  createPermissionsFile,
  sourceFolderIn,
  writeProjectConfig,
  writeAgentStubs,
  renderMetadataYaml,
  renderSkillMd,
  FORKED_FROM_METADATA,
} from "../helpers/test-utils.js";
import type { FixtureSkillConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSkillConfig,
  buildSkillConfigs,
} from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { buildClaudeSettings } from "../../src/cli/lib/__tests__/factories/claude-settings-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import { E2E_SKILL } from "./expected-values.js";
import { pluginKeyFor } from "./plugin-install-state.js";
import { DIRS, FILES } from "../pages/constants.js";
import type { AgentName, Domain } from "../../src/cli/types/index.js";
import type { ProjectHandle } from "./project-handle.js";

export type DualScopeHandle = {
  project: ProjectHandle;
  globalHome: ProjectHandle;
};

export type EditableOptions = {
  /** Recorded in config.ts, the only place later commands read the source from. */
  marketplace?: string;
  skills?: string[];
  agents?: AgentName[];
  domains?: Domain[];
  stack?: Partial<Record<AgentName, FixtureStackAgentConfig>>;
  /** Marks the skills CLI-managed, so `uninstall` removes rather than skips them. */
  forkedFrom?: boolean;
  /** Config-only `scope: "global"` entries modelling skills inherited from the global install. */
  globalSkills?: string[];
  /** Defaults to `"eject"`. */
  globalSkillsSource?: string;
  /** Config entries with no files and no source carrying them, so nothing resolves them. */
  unresolvableSkills?: string[];
};

type SkillContentOverride = {
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
  marketplace?: string;
  agents?: AgentName[];
  domains?: Domain[];
  /** Omits config.ts's marketplace field while entries keep it as `origin` (legacy installs). */
  omitMarketplaceField?: boolean;
  unresolvableSkills?: string[];
};

type SkillIdentityFields = { category: string; slug: string; displayName: string };

// Stated, never derived from the id; an unmapped id throws. `displayName` is the source's title
// (the schema caps it at 30 chars, which a namespaced id exceeds).
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

// The only file `toHavePlugin` reads. Writes rather than merges: the directory is freshly created.
async function writePluginInstallSettings(
  projectDir: string,
  pluginKeys: readonly string[],
): Promise<void> {
  const claudeDir = path.join(projectDir, DIRS.CLAUDE);
  await mkdir(claudeDir, { recursive: true });
  await writeFile(
    path.join(claudeDir, FILES.SETTINGS_JSON),
    JSON.stringify(buildClaudeSettings(pluginKeys)),
  );
}

export const MINIMAL_PROJECT_SKILL_ID = E2E_SKILL.vitest.id;
export const MINIMAL_PROJECT_AGENT_NAMES = [
  "web-developer",
  "api-developer",
] as const satisfies readonly AgentName[];

// Deliberately outside the `SkillId` union.
export const CUSTOM_PROJECT_SKILL_ID = "web-custom-e2e-widget";

export class ProjectBuilder {
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

    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "e2e-compile-test",
        skills: buildSkillConfigs([MINIMAL_PROJECT_SKILL_ID], {
          scope: "project",
          origin: "eject",
        }),
        agents: buildAgentConfigs([...MINIMAL_PROJECT_AGENT_NAMES], { scope: "project" }),
      }),
    );

    return { dir: projectDir };
  }

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

    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "test-edit-project",
        skills: [
          ...buildSkillConfigs([...skills, ...unresolvableSkills], {
            scope: "project",
            origin: "eject",
          }),
          ...buildSkillConfigs(globalSkills, {
            scope: "global",
            origin: options?.globalSkillsSource ?? "eject",
          }),
        ],
        agents: buildAgentConfigs(agents, { scope: "project" }),
        selectedDomains: domains,
        ...(options?.marketplace !== undefined && { marketplace: options.marketplace }),
        ...(options?.stack && { stack: options.stack }),
      }),
    );

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

  static async dualScope(options?: DualScopeOptions): Promise<DualScopeHandle> {
    const tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");

    await writeProjectConfig(
      globalHome,
      buildProjectConfig({
        name: "global-test",
        skills: buildSkillConfigs(["web-testing-cypress-e2e"], {
          scope: "global",
          origin: "eject",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        selectedDomains: ["web"],
        stack: {
          "web-developer": {
            "web-e2e": [sa("web-testing-cypress-e2e", true)],
          },
        },
      }),
    );

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

    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "project-test",
        skills: options?.projectSkills ?? [
          buildSkillConfig("web-mocks-msw", { scope: "project", origin: "eject" }),
          buildSkillConfig("web-testing-cypress-e2e", { scope: "global", origin: "eject" }),
        ],
        agents: buildAgentConfigs(["api-developer"], { scope: "project" }),
        selectedDomains: ["web"],
        stack: {
          "api-developer": options?.projectStack ?? {
            // One agent with a global-scoped and a project-scoped skill, in different categories.
            "web-e2e": [sa("web-testing-cypress-e2e", true)],
            "web-mocking": [sa("web-mocks-msw", true)],
          },
        },
      }),
    );

    await createLocalSkill(projectDir, "web-mocks-msw", {
      description:
        options?.projectSkill?.description ?? "Project-local E2E skill for dual-scope testing",
      metadata:
        options?.projectSkill?.metadata ??
        renderMetadataYaml({
          ...metadataFieldsFor("web-mocks-msw"),
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

  // The project config imports the global one.
  static async dualScopeWithImport(): Promise<DualScopeHandle> {
    const tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "fake-home");
    const projectDir = path.join(tempDir, "project");

    await writeProjectConfig(
      globalHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        selectedDomains: ["web"],
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", true)],
          },
        },
      }),
    );

    await createLocalSkill(globalHome, "web-framework-react", {
      description: "React framework skill for global scope testing",
      metadata: renderMetadataYaml({
        category: "web-framework",
        slug: "react",
        contentHash: "hash-react",
      }),
    });

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
  selectedDomains?: Domain[];
}
`;
    const globalConfigDir = sourceFolderIn(globalHome);
    const projectConfigDir = sourceFolderIn(projectDir);
    await mkdir(projectConfigDir, { recursive: true });

    await writeFile(path.join(globalConfigDir, FILES.CONFIG_TYPES_TS), configTypesContent);
    await writeFile(path.join(projectConfigDir, FILES.CONFIG_TYPES_TS), configTypesContent);

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

  // A custom id in a real category: the loader refuses a fabricated domain or category.
  static async withCustomSkill(options?: { marketplace?: string }): Promise<ProjectHandle> {
    const tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    const configDir = sourceFolderIn(projectDir);
    const skillDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, CUSTOM_PROJECT_SKILL_ID);

    await mkdir(configDir, { recursive: true });
    await mkdir(skillDir, { recursive: true });

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
  selectedDomains?: Domain[];
}
`;

    await writeFile(path.join(configDir, FILES.CONFIG_TYPES_TS), configTypesContent);

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

    // Not via createLocalSkill: the id is outside the SkillId union.
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

  // Enables each skill's plugin key in settings.json so a departure is assertable;
  // `unresolvableSkills` get none. The registry half is `createPluginInstalledProject`.
  static async pluginProject(options: PluginProjectOptions): Promise<ProjectHandle> {
    const tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const skills = options.skills;
    const agents = options.agents ?? ["web-developer"];
    const domains = options.domains ?? ["web"];

    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "plugin-edit-test",
        ...(options.marketplace !== undefined && { marketplace: options.marketplace }),
        ...(options.omitMarketplaceField ? {} : { marketplaceName: options.marketplaceName }),
        skills: buildSkillConfigs([...skills, ...(options.unresolvableSkills ?? [])], {
          scope: "project",
          origin: options.marketplaceName,
        }),
        agents: buildAgentConfigs(agents, { scope: "project" }),
        selectedDomains: domains,
      }),
    );

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

    await writePluginInstallSettings(
      projectDir,
      skills.map((id) => pluginKeyFor(id, options.marketplaceName)),
    );

    return { dir: projectDir };
  }

  static async localProjectWithMarketplace(options: PluginProjectOptions): Promise<ProjectHandle> {
    const tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const skills = options.skills;
    const agents = options.agents ?? ["web-developer"];
    const domains = options.domains ?? ["web"];

    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "local-edit-test",
        ...(options.marketplace !== undefined && { marketplace: options.marketplace }),
        marketplaceName: options.marketplaceName,
        skills: buildSkillConfigs(skills, { scope: "project", origin: "eject" }),
        agents: buildAgentConfigs(agents, { scope: "project" }),
        selectedDomains: domains,
      }),
    );

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

  // `subDir` is an empty directory to run from: a project with no config of its own.
  static async globalWithSubproject(): Promise<{ globalHome: ProjectHandle; subDir: string }> {
    const tempDir = await createTempDir();

    await writeProjectConfig(
      tempDir,
      buildProjectConfig({
        name: "global-test",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        selectedDomains: ["web"],
      }),
    );

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

  // Writes into `dir` (no temp dir of its own), enough for `detectInstallation()`.
  static async installation(dir: string): Promise<void> {
    // A config with neither skills nor agents is not an installation; `agents` is explicitly empty.
    await writeProjectConfig(
      dir,
      buildProjectConfig({
        name: "test",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
        agents: [],
        selectedDomains: [],
      }),
    );
  }
}
