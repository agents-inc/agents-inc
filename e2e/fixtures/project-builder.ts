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
import { DIRS, FILES } from "../pages/constants.js";
import type {
  ProjectConfig,
  SkillId,
  SkillConfig,
  AgentName,
  Domain,
  StackAgentConfig,
} from "../../src/cli/types/index.js";
import type { ProjectHandle } from "../pages/wizard-result.js";

export type DualScopeHandle = {
  project: ProjectHandle;
  globalHome: ProjectHandle;
};

export type EditableOptions = {
  skills?: SkillId[];
  agents?: AgentName[];
  domains?: Domain[];
  stack?: Partial<Record<AgentName, StackAgentConfig>>;
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
  globalSkills?: SkillId[];
};

/** Description and metadata.yaml body for one local skill written by a fixture. */
export type SkillContentOverride = {
  description: string;
  metadata: string;
};

export type DualScopeOptions = {
  globalSkill?: SkillContentOverride;
  projectSkills?: SkillConfig[];
  projectStack?: StackAgentConfig;
  projectSkill?: SkillContentOverride;
};

export type PluginProjectOptions = {
  skills: SkillId[];
  marketplace: string;
  agents?: AgentName[];
  domains?: Domain[];
  /**
   * When true, skips writing the `marketplace` field into config.ts even
   * though the skills carry plugin-sourced `source` values. Simulates legacy
   * installs where marketplace was never persisted — the scenario that
   * triggered the silent plugin-install skip regression (see
   * feedback_no_plugin_to_eject_fallback.md).
   */
  omitMarketplaceField?: boolean;
};

/**
 * Explicit category/slug for every skill ID these fixtures write metadata for.
 * Deriving a slug from a skill ID is banned (see CLAUDE.md) because a wrong
 * guess still looks plausible on disk; an unmapped ID must fail loudly instead.
 *
 * Every `category` here must be a member of `CATEGORIES` in
 * `src/cli/types/generated/source-types.ts` — note that `web-state-*` skills
 * belong to `web-client-state`, not to a `web-state` category.
 */
const SKILL_CATEGORY_SLUGS: Partial<Record<SkillId, { category: string; slug: string }>> = {
  "api-framework-hono": { category: "api-framework", slug: "hono" },
  "meta-methodology-research-methodology": {
    category: "meta-methodology",
    slug: "research-methodology",
  },
  "meta-reviewing-cli-reviewing": { category: "meta-reviewing", slug: "cli-reviewing" },
  "meta-reviewing-reviewing": { category: "meta-reviewing", slug: "reviewing" },
  "web-framework-react": { category: "web-framework", slug: "react" },
  "web-state-zustand": { category: "web-client-state", slug: "zustand" },
  "web-styling-tailwind": { category: "web-styling", slug: "tailwind" },
  "web-testing-vitest": { category: "web-testing", slug: "vitest" },
};

function categorySlugFor(skillId: SkillId): { category: string; slug: string } {
  const entry = SKILL_CATEGORY_SLUGS[skillId];
  if (!entry) {
    throw new Error(
      `No category/slug mapping for skill "${skillId}". ` +
        `Add it to SKILL_CATEGORY_SLUGS in e2e/fixtures/project-builder.ts.`,
    );
  }
  return entry;
}

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

    await createLocalSkill(projectDir, "web-testing-vitest", {
      description: "E2E test skill for compile verification",
      body: "# Test E2E Skill\n\nThis skill exists solely for E2E testing of the compile command.",
      metadata: renderMetadataYaml({
        displayName: "web-testing-vitest",
        slug: "vitest",
        cliDescription: "E2E test skill",
        usageGuidance: "Use when testing E2E scenarios",
        contentHash: "a1b2c3d",
      }),
    });

    const config: ProjectConfig = {
      name: "e2e-compile-test",
      skills: [{ id: "web-testing-vitest", scope: "project", source: "eject" }],
      agents: [
        { name: "web-developer", scope: "project" },
        { name: "api-developer", scope: "project" },
      ],
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
    const skills = options?.skills ?? ["web-framework-react"];
    const agents = options?.agents ?? ["web-developer"];
    const domains = options?.domains ?? ["web"];

    const skillsDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS);
    const agentsDir = path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS);

    await mkdir(skillsDir, { recursive: true });
    await mkdir(agentsDir, { recursive: true });

    const globalSkills = options?.globalSkills ?? [];
    const projectSkillConfigs = skills.map((id) => ({
      id,
      scope: "project" as const,
      source: "eject",
    }));
    const globalSkillConfigs = globalSkills.map((id) => ({
      id,
      scope: "global" as const,
      source: "eject",
    }));
    const skillConfigs = [...projectSkillConfigs, ...globalSkillConfigs];
    const agentConfigs = agents.map((name) => ({ name, scope: "project" as const }));

    const config: ProjectConfig = {
      name: "test-edit-project",
      skills: skillConfigs,
      agents: agentConfigs,
      domains,
      selectedAgents: agents,
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
              displayName: skillId,
              ...categorySlugFor(skillId),
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
    const globalConfig: ProjectConfig = {
      name: "global-test",
      skills: [{ id: "web-testing-cypress-e2e", scope: "global", source: "eject" }],
      agents: [{ name: "web-developer", scope: "global" }],
      domains: ["web"],
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
          displayName: "web-testing-cypress-e2e",
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "c3d4e5f",
        }),
    });

    // --- Project installation ---
    const projectConfig: ProjectConfig = {
      name: "project-test",
      skills: options?.projectSkills ?? [
        { id: "web-testing-playwright-e2e", scope: "project", source: "eject" },
        { id: "web-testing-cypress-e2e", scope: "global", source: "eject" },
      ],
      agents: [{ name: "api-developer", scope: "project" }],
      domains: ["web"],
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
          displayName: "web-testing-playwright-e2e",
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
      skills: [{ id: "web-framework-react", scope: "global", source: "eject" }],
      agents: [{ name: "web-developer", scope: "global" }],
      domains: ["web"],
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
export type SkillConfig = { id: SkillId; scope: "project" | "global"; source: string };
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
  source?: string;
  marketplace?: string;
  agentsSource?: string;
  domains?: Domain[];
  selectedAgents?: AgentName[];
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
  {"id":"web-testing-vitest","scope":"project","source":"eject"},
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
   * Exercises Zod schema validation for custom skill IDs and category keys.
   *
   * Structure:
   *   <projectDir>/
   *     .claude-src/
   *       config-types.ts   (auto-generated types including custom IDs)
   *       config.ts         (imports config-types, uses satisfies ProjectConfig)
   *     .claude/
   *       skills/
   *         web-custom-e2e-widget/
   *           SKILL.md
   *           metadata.yaml  (custom: true, domain: custom-e2e, category: web-custom-e2e)
   */
  static async withCustomSkill(): Promise<ProjectHandle> {
    const tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    const configDir = path.join(projectDir, DIRS.CLAUDE_SRC);
    const skillDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, "web-custom-e2e-widget");

    await mkdir(configDir, { recursive: true });
    await mkdir(skillDir, { recursive: true });

    // Auto-generated config-types.ts with custom skill ID and custom category
    const configTypesContent = `// AUTO-GENERATED by agentsinc — DO NOT EDIT

export type SkillId =
  // Custom
  | "web-custom-e2e-widget"
  // Marketplace
  | "web-framework-react";

export type AgentName =
  | "web-developer";

export type Domain =
  // Custom
  | "custom-e2e"
  // Marketplace
  | "web";

export type Category =
  | "web-custom-e2e"
  | "web-framework";

export type SkillConfig = { id: SkillId; scope: "project" | "global"; source: string };

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
  source?: string;
  marketplace?: string;
  agentsSource?: string;
  domains?: Domain[];
  selectedAgents?: AgentName[];
}
`;

    await writeFile(path.join(configDir, FILES.CONFIG_TYPES_TS), configTypesContent);

    // Config file that references custom skill and custom category
    const configContent = `import type { ProjectConfig } from "./config-types";

export default {
  name: "test-custom-skill-project",
  agents: [{ name: "web-developer", scope: "project" }],
  skills: [{ id: "web-custom-e2e-widget", scope: "project", source: "eject" }],
  domains: ["web"],
  stack: {
    "web-developer": {
      "web-custom-e2e": {
        id: "web-custom-e2e-widget",
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
        "web-custom-e2e-widget",
        "A custom test widget skill",
        "# Custom E2E Widget\n\nCustom skill for E2E testing of custom skill ID handling.",
      ),
    );

    await writeFile(
      path.join(skillDir, FILES.METADATA_YAML),
      renderMetadataYaml({
        custom: true,
        domain: "custom-e2e",
        category: "web-custom-e2e",
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
   * Has config with marketplace source, skills, agents dir with agent stubs.
   */
  static async pluginProject(options: PluginProjectOptions): Promise<ProjectHandle> {
    const tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const skills = options.skills;
    const agents = options.agents ?? ["web-developer"];
    const domains = options.domains ?? ["web"];

    await writeProjectConfig(projectDir, {
      name: "plugin-edit-test",
      ...(options.omitMarketplaceField ? {} : { marketplace: options.marketplace }),
      skills: skills.map((id) => ({
        id,
        scope: "project" as const,
        source: options.marketplace,
      })),
      agents: agents.map((name) => ({ name, scope: "project" as const })),
      domains,
      selectedAgents: agents,
    });

    for (const skillId of skills) {
      await createLocalSkill(projectDir, skillId, {
        description: "Test skill",
        metadata: renderMetadataYaml({
          displayName: skillId,
          ...categorySlugFor(skillId),
          contentHash: `e2e-hash-${skillId}`,
        }),
      });
    }

    await writeAgentStubs(projectDir, agents);

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
      marketplace: options.marketplace,
      skills: skills.map((id) => ({
        id,
        scope: "project" as const,
        source: "eject",
      })),
      agents: agents.map((name) => ({ name, scope: "project" as const })),
      domains,
    });

    for (const skillId of skills) {
      await createLocalSkill(projectDir, skillId, {
        description: "Test skill",
        metadata: renderMetadataYaml({
          displayName: skillId,
          ...categorySlugFor(skillId),
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
      skills: [{ id: "web-framework-react", scope: "project", source: "eject" }],
      agents: [{ name: "web-developer", scope: "project" }],
      domains: ["web"],
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
      skills: [{ id: "web-framework-react", scope: "project", source: "eject" }],
      domains: [],
    });
  }
}
