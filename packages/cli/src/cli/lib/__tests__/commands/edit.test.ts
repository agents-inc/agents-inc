import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import type { ReactElement } from "react";
import os from "os";
import path from "path";
import { mkdir } from "fs/promises";
import type { Errors } from "@oclif/core";
import { runCliCommand, CLI_ROOT } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir, fileExists } from "../test-fs-utils";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { createMockSkill } from "../factories/skill-factories.js";
import { createMockMatrix } from "../factories/matrix-factories.js";
import {
  buildProjectConfig,
  buildSourceResult,
  buildWizardResult,
  buildAgentConfigs,
} from "../factories/config-factories.js";
import { SKILLS, TEST_CATEGORIES } from "../test-fixtures";
import { FULLSTACK_PAIR_MATRIX } from "../mock-data/mock-matrices";
import { EXPECTED_SKILLS } from "../expected-values";
import { EXIT_CODES } from "../../exit-codes";
import * as wizardStore from "../../../stores/wizard-store";
import { useWizardStore } from "../../../stores/wizard-store";
import { initializeMatrix } from "../../matrix/matrix-provider";
import * as execModule from "../../../utils/exec.js";
import type { CategoryPath, SkillConfig, SkillId, SkillScope } from "../../../types";
import Edit, {
  applyMigratedGlobalSources,
  migratePluginSkillScopes,
  detectConfigChanges,
} from "../../../commands/edit.js";

// --- Module mocks (hoisted by vitest) ---

const {
  mockRender,
  mockDetectInstallation,
  mockLoadSkillsMatrixFromSource,
  mockLoadProjectConfig,
  mockDiscoverAllPluginSkills,
  mockCopySkillsToLocalFlattened,
  mockDeleteLocalSkill,
  mockEnsureDir,
  mockGetAgentDefinitions,
} = vi.hoisted(() => ({
  mockRender: vi
    .fn()
    .mockReturnValue({ waitUntilExit: () => Promise.resolve(), clear: vi.fn(), unmount: vi.fn() }),
  mockDetectInstallation: vi.fn().mockResolvedValue(null),
  mockLoadSkillsMatrixFromSource: vi.fn(),
  mockLoadProjectConfig: vi.fn().mockResolvedValue(null),
  mockDiscoverAllPluginSkills: vi.fn().mockResolvedValue({}),
  mockCopySkillsToLocalFlattened: vi.fn().mockResolvedValue(undefined),
  mockDeleteLocalSkill: vi.fn().mockResolvedValue(undefined),
  mockEnsureDir: vi.fn().mockResolvedValue(undefined),
  mockGetAgentDefinitions: vi.fn().mockResolvedValue({
    agentsDir: "/mock/agents",
    templatesDir: "/mock/templates",
    sourcePath: "/mock/source",
  }),
}));

vi.mock("ink", async (importOriginal) => {
  const original = await importOriginal<typeof import("ink")>();
  return { ...original, render: mockRender };
});

vi.mock("../../installation/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../installation/index.js")>();
  return {
    ...original,
    detectInstallation: (...args: unknown[]) => mockDetectInstallation(...(args as [])),
  };
});

vi.mock("../../loading/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../loading/index.js")>();
  return {
    ...original,
    loadSkillsMatrixFromSource: (...args: unknown[]) =>
      mockLoadSkillsMatrixFromSource(...(args as [])),
  };
});

vi.mock("../../configuration/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../configuration/index.js")>();
  return {
    ...original,
    loadProjectConfig: (...args: unknown[]) => mockLoadProjectConfig(...(args as [])),
  };
});

vi.mock("../../plugins/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../plugins/index.js")>();
  return {
    ...original,
    discoverAllPluginSkills: (...args: unknown[]) => mockDiscoverAllPluginSkills(...(args as [])),
  };
});

vi.mock("../../agents/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../agents/index.js")>();
  return {
    ...original,
    getAgentDefinitions: (...args: unknown[]) => mockGetAgentDefinitions(...(args as [])),
  };
});

vi.mock("../../skills/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../skills/index.js")>();
  return {
    ...original,
    copySkillsToLocalFlattened: (...args: unknown[]) =>
      mockCopySkillsToLocalFlattened(...(args as [])),
    deleteLocalSkill: (...args: unknown[]) => mockDeleteLocalSkill(...(args as [])),
  };
});

vi.mock("../../../utils/fs.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../utils/fs.js")>();
  return {
    ...original,
    ensureDir: (...args: unknown[]) => mockEnsureDir(...(args as [])),
  };
});

/** Mocks loadProjectConfig with the standard `{ config, configPath }` wrapper. */
function mockProjectConfig(projectDir: string, config: Record<string, unknown>): void {
  mockLoadProjectConfig.mockResolvedValue({
    config,
    configPath: path.join(projectDir, ".claude-src/config.ts"),
  });
}

/** A detected project-scope eject installation rooted at `projectDir`. */
function buildEjectInstallation(projectDir: string) {
  return {
    mode: "eject" as const,
    scope: "project" as const,
    configPath: path.join(projectDir, ".claude-src/config.ts"),
    agentsDir: path.join(projectDir, ".claude/agents"),
    skillsDir: path.join(projectDir, ".claude/skills"),
    projectDir,
  };
}

/**
 * Mocks the Ink render call so the edit wizard immediately completes with the
 * given wizard result (generalizes the removal-wizard mock).
 */
function mockWizardCompletion(wizardResult: unknown): void {
  mockRender.mockImplementation((element: ReactElement) => {
    const onComplete = element.props.onComplete as ((result: unknown) => void) | undefined;
    if (onComplete) {
      onComplete(wizardResult);
    }
    return { waitUntilExit: () => Promise.resolve(), clear: vi.fn(), unmount: vi.fn() };
  });
}

describe("edit command", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-test-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);

    // Ensure detectInstallation returns null (no installation) for these tests
    mockDetectInstallation.mockResolvedValue(null);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  describe("no installation found", () => {
    it("when .claude-src/ directory is missing, should exit with error code", async () => {
      // Clean temp dir has no .claude/ or .claude-src/ directories
      const { error } = await runCliCommand(["edit"]);

      // Should exit with EXIT_CODES.ERROR (1) because detectInstallation returns null
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("when no installation exists, should suggest running init", async () => {
      const { error } = await runCliCommand(["edit"]);

      expect(error?.message).toContain("No installation found");
    });
  });

  describe("flag validation", () => {
    it("should accept --refresh flag", async () => {
      const { error } = await runCliCommand(["edit", "--refresh"]);

      // Should not error on flag parsing (will error on no installation, which is expected)
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept --source flag with path", async () => {
      const { error } = await runCliCommand(["edit", "--source", "/some/path"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept -s shorthand for source", async () => {
      const { error } = await runCliCommand(["edit", "-s", "/some/path"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });
  });

  describe("combined flags", () => {
    it("when mixing -s shorthand and --refresh long flag, should accept both", async () => {
      const { error } = await runCliCommand(["edit", "--refresh", "-s", "/custom/source"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });
  });
});

// Explicit domain assignments — these tests verify domain filtering, so domains must be correct
const EDIT_CATEGORIES = {
  "web-framework": { ...TEST_CATEGORIES.framework, displayName: "Web Framework" },
  "web-client-state": TEST_CATEGORIES.clientState,
  "api-api": { ...TEST_CATEGORIES.api, displayName: "API Framework", domain: "api" as const },
  "web-testing": { ...TEST_CATEGORIES.testing, domain: "shared" as const },
};

const EDIT_SKILLS = {
  "web-framework-react": SKILLS.react,
  "web-state-zustand": SKILLS.zustand,
  "api-framework-hono": SKILLS.hono,
  "web-testing-vitest": SKILLS.vitest,
};

// The edit command uses populateFromSkillIds() on the Zustand wizard store
// to restore prior selections. Testing at the store level because the edit
// command itself launches an interactive wizard that cannot be driven from
// runCliCommand. This validates the same code path used by
// use-wizard-initialization.ts when edit mode is active.

describe("edit wizard pre-selection via populateFromSkillIds", () => {
  beforeEach(() => {
    initializeMatrix(
      createMockMatrix(EDIT_SKILLS, {
        categories: EDIT_CATEGORIES,
      }),
    );
  });

  it("should pre-populate domainSelections from installed skill IDs", () => {
    const installedSkills: SkillId[] = [
      "web-framework-react",
      "web-state-zustand",
      "api-framework-hono",
    ];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    // Web skills should appear under the web domain
    expect(domainSelections.web?.["web-framework"]).toStrictEqual(["web-framework-react"]);
    expect(domainSelections.web?.["web-client-state"]).toStrictEqual(["web-state-zustand"]);

    // API skill should appear under the api domain
    expect(domainSelections.api?.["api-api"]).toStrictEqual(["api-framework-hono"]);
  });

  it("should not pre-select skills that are not in the installed list", () => {
    const installedSkills: SkillId[] = ["web-framework-react"];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    // Only web/framework should be populated
    expect(domainSelections.web?.["web-framework"]).toStrictEqual(["web-framework-react"]);

    // Other categories should not exist
    expect(domainSelections.web?.["web-client-state"]).toBeUndefined();
    expect(domainSelections.api).toBeUndefined();
  });

  it("should set selectedDomains to only the domains found in the provided skill IDs", () => {
    const installedSkills: SkillId[] = ["web-framework-react"];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { selectedDomains } = useWizardStore.getState();

    // populateFromSkillIds sets only domains derived from the skill IDs
    expect(selectedDomains).toContain("web");
    expect(selectedDomains).not.toContain("api");
    expect(selectedDomains).not.toContain("shared");
  });

  it("should place shared-domain skills under the shared domain key", () => {
    const installedSkills: SkillId[] = ["web-testing-vitest"];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    // Testing category maps to the shared domain
    expect(domainSelections.shared?.["web-testing"]).toStrictEqual(["web-testing-vitest"]);

    // No web or api entries should exist
    expect(domainSelections.web).toBeUndefined();
    expect(domainSelections.api).toBeUndefined();
  });

  it("should produce empty domainSelections when installed list is empty", () => {
    const installedSkills: SkillId[] = [];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    expect(Object.keys(domainSelections)).toHaveLength(0);
  });

  it("should skip skills missing a category", () => {
    const sparseSkills = {
      "web-framework-react": SKILLS.react,
      // Boundary cast: intentionally testing skill with no category
      // Boundary cast: fictional skill ID for testing missing-category handling
      "web-framework-unknown": createMockSkill("web-framework-unknown" as SkillId, {
        category: undefined as unknown as CategoryPath,
      }),
    };

    initializeMatrix(
      createMockMatrix(sparseSkills, {
        categories: EDIT_CATEGORIES,
      }),
    );

    // Boundary cast: fake ID to test unknown-skill handling
    const installedSkills: SkillId[] = ["web-framework-react", "web-framework-unknown" as SkillId];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    // Only the skill with a valid category should be populated
    expect(domainSelections.web?.["web-framework"]).toStrictEqual(["web-framework-react"]);
    expect(domainSelections.web?.["web-framework"]).toHaveLength(1);
  });

  it("should skip skills whose category has no domain mapping", () => {
    const extraSkills = {
      "web-framework-react": SKILLS.react,
      // Boundary cast: intentionally testing unmapped category handling
      // Boundary cast: fictional skill ID for testing unmapped-category handling
      "infra-tooling-linter": createMockSkill("infra-tooling-linter" as SkillId),
    };

    initializeMatrix(
      createMockMatrix(extraSkills, {
        categories: EDIT_CATEGORIES,
      }),
    );

    // Boundary cast: fake ID to test unmapped-category handling
    const installedSkills: SkillId[] = ["web-framework-react", "infra-tooling-linter" as SkillId];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    // Only the resolvable skill should be populated
    expect(domainSelections.web?.["web-framework"]).toStrictEqual(["web-framework-react"]);
    // No domain should contain the unresolvable skill
    const allTechs = useWizardStore.getState().getAllSelectedTechnologies();
    expect(allTechs).not.toContain("infra-tooling-linter");
  });

  it("should not duplicate skills when the same skill ID appears twice in installed list", () => {
    const installedSkills: SkillId[] = ["web-framework-react", "web-framework-react"];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    // Should deduplicate
    expect(domainSelections.web?.["web-framework"]).toStrictEqual(["web-framework-react"]);
    expect(domainSelections.web?.["web-framework"]).toHaveLength(1);
  });

  it("should populate multiple skills within the same category (non-exclusive)", () => {
    // testing category is non-exclusive, so multiple selections are valid
    const multiSkills = {
      ...EDIT_SKILLS,
      // Boundary cast: fictional skill ID for testing multi-skill category population
      "web-testing-playwright": createMockSkill("web-testing-playwright" as SkillId),
    };

    initializeMatrix(
      createMockMatrix(multiSkills, {
        categories: EDIT_CATEGORIES,
      }),
    );

    // Boundary cast: fake ID to test multi-selection in same category
    const installedSkills: SkillId[] = ["web-testing-vitest", "web-testing-playwright" as SkillId];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    expect(domainSelections.shared?.["web-testing"]).toContain("web-testing-vitest");
    expect(domainSelections.shared?.["web-testing"]).toContain("web-testing-playwright");
    expect(domainSelections.shared?.["web-testing"]).toHaveLength(2);
  });
});

// After populateFromSkillIds, the wizard uses getSelectedTechnologiesPerDomain()
// to determine which domains have active selections. Domains not in this result
// can be filtered out of the build step UI. This tests that the store correctly
// omits domains with zero selections.

describe("edit wizard domain filtering", () => {
  beforeEach(() => {
    initializeMatrix(
      createMockMatrix(EDIT_SKILLS, {
        categories: EDIT_CATEGORIES,
      }),
    );
  });

  it("should report only web domain when only web skills are installed", () => {
    const installedSkills: SkillId[] = [...EXPECTED_SKILLS.WEB_DEFAULT];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const perDomain = useWizardStore.getState().getSelectedTechnologiesPerDomain();

    // Web should have selections
    expect(perDomain.web).toStrictEqual(EXPECTED_SKILLS.WEB_DEFAULT);

    // API, CLI, mobile should be absent (no selections)
    expect(perDomain.api).toBeUndefined();
    expect(perDomain.cli).toBeUndefined();
    expect(perDomain.mobile).toBeUndefined();
  });

  it("should report both web and api domains when both have selections", () => {
    const installedSkills: SkillId[] = ["web-framework-react", "api-framework-hono"];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const perDomain = useWizardStore.getState().getSelectedTechnologiesPerDomain();

    expect(perDomain.web).toStrictEqual(["web-framework-react"]);
    expect(perDomain.api).toStrictEqual(["api-framework-hono"]);
    expect(perDomain.cli).toBeUndefined();
  });

  it("should report only shared domain when only shared skills are installed", () => {
    const installedSkills: SkillId[] = ["web-testing-vitest"];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const perDomain = useWizardStore.getState().getSelectedTechnologiesPerDomain();

    // Only shared domain should have selections
    expect(perDomain.shared).toStrictEqual(["web-testing-vitest"]);

    // All other domains should be absent
    expect(perDomain.web).toBeUndefined();
    expect(perDomain.api).toBeUndefined();
    expect(perDomain.cli).toBeUndefined();
    expect(perDomain.mobile).toBeUndefined();
  });

  it("should return empty result when no skills are installed", () => {
    const installedSkills: SkillId[] = [];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const perDomain = useWizardStore.getState().getSelectedTechnologiesPerDomain();

    // All domains should be absent
    expect(Object.keys(perDomain)).toHaveLength(0);
  });

  it("should include correct skill count per domain", () => {
    const installedSkills: SkillId[] = [
      "web-framework-react",
      "web-state-zustand",
      "api-framework-hono",
      "web-testing-vitest",
    ];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const perDomain = useWizardStore.getState().getSelectedTechnologiesPerDomain();

    // Web has 2 skills (framework + client-state)
    expect(perDomain.web).toHaveLength(2);

    // API has 1 skill
    expect(perDomain.api).toHaveLength(1);

    // Shared has 1 skill (testing)
    expect(perDomain.shared).toHaveLength(1);

    // CLI and mobile still absent
    expect(perDomain.cli).toBeUndefined();
    expect(perDomain.mobile).toBeUndefined();
  });
});

// The edit command has an eject-mode fallback: when discoverAllPluginSkills returns
// empty (no plugin-based skills found), it falls back to project config skills.
// These tests verify that the correct installedSkillIds reach the Wizard component.

describe("edit command eject-mode skill fallback", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  const CONFIG_SKILL_IDS: SkillId[] = ["web-framework-react", "api-framework-hono"];
  const CONFIG_SKILLS = CONFIG_SKILL_IDS.map((id) => ({
    id,
    scope: "project" as const,
    source: "eject",
  }));

  const testMatrix = FULLSTACK_PAIR_MATRIX;

  const testSourceResult = buildSourceResult(testMatrix, "/test/source");

  let hydrateSpy: ReturnType<typeof vi.spyOn>;

  function getRenderedInstalledSkillIds(): SkillId[] | undefined {
    // edit.tsx passes the merged (plugin + config) skill id list to BOTH
    // hydrateWizardStore({ installedSkillIds }) and <Wizard installedSkillIds />.
    // We inspect the hydrate call because it's easy to spy on; the Wizard prop
    // receives the same value (currentSkillIds) so either signal is valid.
    const hydrateCall = hydrateSpy.mock.calls[0];
    if (!hydrateCall) return undefined;
    const options = hydrateCall[0] as { installedSkillIds?: SkillId[] };
    return options.installedSkillIds;
  }

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-fallback-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);

    hydrateSpy = vi.spyOn(wizardStore, "hydrateWizardStore");

    // Reset all mocks to known state for each test
    mockRender.mockClear();
    mockRender.mockReturnValue({
      waitUntilExit: () => Promise.resolve(),
      clear: vi.fn(),
      unmount: vi.fn(),
    });

    mockDetectInstallation.mockResolvedValue(buildEjectInstallation(projectDir));

    mockLoadSkillsMatrixFromSource.mockResolvedValue(testSourceResult);
    initializeMatrix(testSourceResult.matrix);
  });

  afterEach(async () => {
    hydrateSpy.mockRestore();
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("should use project config skills as installedSkillIds when plugin discovery returns empty", async () => {
    mockDiscoverAllPluginSkills.mockResolvedValue({});
    mockProjectConfig(projectDir, {
      name: "test-project",
      agents: [],
      skills: CONFIG_SKILLS,
    });

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    expect(mockRender).toHaveBeenCalledTimes(2);
    const installedSkillIds = getRenderedInstalledSkillIds();
    expect(installedSkillIds).toStrictEqual(CONFIG_SKILL_IDS);
  });

  it("should merge discovered plugin skills with config skills as installedSkillIds", async () => {
    mockDiscoverAllPluginSkills.mockResolvedValue({
      "web-framework-react": { id: "web-framework-react", path: "skills/web-framework-react/" },
    });
    mockProjectConfig(projectDir, {
      name: "test-project",
      agents: [],
      skills: CONFIG_SKILLS,
    });

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    expect(mockRender).toHaveBeenCalledTimes(2);
    const installedSkillIds = getRenderedInstalledSkillIds();
    // Plugin discovery found react; config also has hono — both should be included
    expect(installedSkillIds).toStrictEqual(CONFIG_SKILL_IDS);
  });
});

// Bug regression: edit command must detect when agents are added/removed,
// not just skill changes. Without the fix, adding a new agent (with no skill
// changes) would cause the command to print "No changes made" and exit early.

describe("edit command detects added agents", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  const EXISTING_SKILL_IDS: SkillId[] = ["web-framework-react"];
  const EXISTING_SKILLS = buildSkillConfigs(EXISTING_SKILL_IDS, {
    scope: "project",
    source: "eject",
  });

  const testMatrix = FULLSTACK_PAIR_MATRIX;
  const testSourceResult = buildSourceResult(testMatrix, "/test/source");

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-agent-detect-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);

    mockRender.mockClear();
    mockDetectInstallation.mockResolvedValue(buildEjectInstallation(projectDir));

    mockLoadSkillsMatrixFromSource.mockResolvedValue(testSourceResult);
    initializeMatrix(testSourceResult.matrix);
    mockDiscoverAllPluginSkills.mockResolvedValue({});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("should NOT report 'No changes made' when only agents are added", async () => {
    // Old config has one agent: web-developer
    mockProjectConfig(projectDir, {
      name: "test-project",
      agents: buildAgentConfigs(["web-developer"]),
      skills: EXISTING_SKILLS,
    });

    // Mock render to invoke onComplete with a wizard result that adds web-tester
    // (same skills, but a new agent)
    mockWizardCompletion(
      buildWizardResult(EXISTING_SKILLS, {
        agentConfigs: buildAgentConfigs(["web-developer", "web-tester"]),
      }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    // With the fix, the command detects agent changes and proceeds past the
    // early return into agent loading (loadAgentDefs -> getAgentDefinitions).
    // Without the fix, the command exits early and getAgentDefinitions is never called.
    expect(mockGetAgentDefinitions).toHaveBeenCalledTimes(1);
  });
});

// Bug regression: edit command must copy newly added local-source skills to
// .claude/skills/. Without the fix, the addedLocalSkills copy block was missing,
// so skills switched to local source during edit were never copied.

describe("edit command copies newly added local skills", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  const testMatrix = FULLSTACK_PAIR_MATRIX;
  const testSourceResult = buildSourceResult(testMatrix, "/test/source");

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-local-copy-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);

    mockRender.mockClear();
    mockCopySkillsToLocalFlattened.mockClear();
    mockEnsureDir.mockClear();
    mockDetectInstallation.mockResolvedValue(buildEjectInstallation(projectDir));

    mockLoadSkillsMatrixFromSource.mockResolvedValue(testSourceResult);
    initializeMatrix(testSourceResult.matrix);
    mockDiscoverAllPluginSkills.mockResolvedValue({});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("should call copySkillsToLocalFlattened when a local skill is added", async () => {
    // Old config has no skills
    mockProjectConfig(projectDir, {
      name: "test-project",
      agents: buildAgentConfigs(["web-developer"]),
      skills: [],
    });

    const newLocalSkills = buildSkillConfigs(["web-framework-react"], {
      scope: "project",
      source: "eject",
    });

    // Mock render to invoke onComplete with a wizard result that adds a local skill
    mockWizardCompletion(
      buildWizardResult(newLocalSkills, {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    // The copy function should have been called for the newly added local skill
    expect(mockCopySkillsToLocalFlattened).toHaveBeenCalledOnce();
    expect(mockCopySkillsToLocalFlattened).toHaveBeenCalledWith(
      ["web-framework-react"],
      expect.stringContaining(".claude/skills"),
      testSourceResult,
    );
  });
});

describe("edit command removes deselected local skills", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  const testMatrix = FULLSTACK_PAIR_MATRIX;
  const testSourceResult = buildSourceResult(testMatrix, "/test/source");

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-local-remove-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);

    mockRender.mockClear();
    mockDeleteLocalSkill.mockClear();
    mockDetectInstallation.mockResolvedValue(buildEjectInstallation(projectDir));
    mockLoadSkillsMatrixFromSource.mockResolvedValue(testSourceResult);
    initializeMatrix(testSourceResult.matrix);
    mockDiscoverAllPluginSkills.mockResolvedValue({});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  function mockRemovalWizard(): void {
    mockWizardCompletion(
      buildWizardResult([], { agentConfigs: buildAgentConfigs(["web-developer"]) }),
    );
  }

  it("deletes a deselected PROJECT-scope eject skill's directory from the project dir", async () => {
    mockProjectConfig(projectDir, {
      name: "test-project",
      agents: buildAgentConfigs(["web-developer"]),
      skills: buildSkillConfigs(["web-framework-react"], { scope: "project", source: "eject" }),
    });
    mockRemovalWizard();

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    // Project-scope eject skill dir is removed from the project directory (cwd), not home.
    expect(mockDeleteLocalSkill).toHaveBeenCalledWith(process.cwd(), "web-framework-react");
  });

  it("deletes a deselected GLOBAL-scope eject skill's directory from the home dir", async () => {
    mockProjectConfig(projectDir, {
      name: "test-project",
      agents: buildAgentConfigs(["web-developer"]),
      skills: buildSkillConfigs(["web-framework-react"], { scope: "global", source: "eject" }),
    });
    mockRemovalWizard();

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    // Global-scope eject skill dir is removed from the home directory, not the project.
    expect(mockDeleteLocalSkill).toHaveBeenCalledWith(os.homedir(), "web-framework-react");
  });

  it("does NOT delete a directory for a deselected plugin-mode skill (handled by plugin uninstall)", async () => {
    mockProjectConfig(projectDir, {
      name: "test-project",
      agents: buildAgentConfigs(["web-developer"]),
      skills: buildSkillConfigs(["web-framework-react"], {
        scope: "project",
        source: "agents-inc",
      }),
    });
    mockRemovalWizard();

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    expect(mockDeleteLocalSkill).not.toHaveBeenCalledWith(expect.anything(), "web-framework-react");
  });
});

// A project-context edit performs install-mode migrations for GLOBAL-scoped skills on disk
// under $HOME and in the user-scope plugin registry. The global config must record exactly
// those migrations — and nothing else — so the recorded source never contradicts the
// filesystem.

const GLOBAL_PLUGIN_REACT = buildSkillConfigs(["web-framework-react"], {
  scope: "global",
  source: "agents-inc",
});
const GLOBAL_EJECT_REACT = buildSkillConfigs(["web-framework-react"], {
  scope: "global",
  source: "eject",
});
const PROJECT_PLUGIN_HONO = buildSkillConfigs(["api-framework-hono"], {
  scope: "project",
  source: "agents-inc",
});
const REACT_MIGRATED_TO_EJECT = new Map<SkillId, string>([["web-framework-react", "eject"]]);

describe("applyMigratedGlobalSources", () => {
  it("rewrites the source of an active-global skill whose migration ran this session", () => {
    const result = applyMigratedGlobalSources(GLOBAL_PLUGIN_REACT, REACT_MIGRATED_TO_EJECT);

    expect(result.skills).toStrictEqual(GLOBAL_EJECT_REACT);
    expect(result.changed).toBe(true);
  });

  it("leaves a global skill absent from the migration set untouched", () => {
    const otherGlobal = buildSkillConfigs(["web-state-zustand"], {
      scope: "global",
      source: "agents-inc",
    });

    const result = applyMigratedGlobalSources(otherGlobal, REACT_MIGRATED_TO_EJECT);

    expect(result.skills).toStrictEqual(otherGlobal);
    expect(result.changed).toBe(false);
  });

  it("leaves a global tombstone untouched even when its id migrated", () => {
    const tombstone = buildSkillConfigs(["web-framework-react"], {
      scope: "global",
      source: "agents-inc",
      excluded: true,
    });

    const result = applyMigratedGlobalSources(tombstone, REACT_MIGRATED_TO_EJECT);

    expect(result.skills).toStrictEqual(tombstone);
    expect(result.changed).toBe(false);
  });

  it("leaves a project-scoped entry untouched even when its id migrated", () => {
    const projectReact = buildSkillConfigs(["web-framework-react"], {
      scope: "project",
      source: "agents-inc",
    });

    const result = applyMigratedGlobalSources(projectReact, REACT_MIGRATED_TO_EJECT);

    expect(result.skills).toStrictEqual(projectReact);
    expect(result.changed).toBe(false);
  });

  it("reports no change when the recorded source already matches the migration", () => {
    const result = applyMigratedGlobalSources(GLOBAL_EJECT_REACT, REACT_MIGRATED_TO_EJECT);

    expect(result.skills).toStrictEqual(GLOBAL_EJECT_REACT);
    expect(result.changed).toBe(false);
  });

  it("rewrites only the migrated entry in a mixed global config", () => {
    const otherGlobal = buildSkillConfigs(["web-state-zustand"], {
      scope: "global",
      source: "agents-inc",
    });

    const result = applyMigratedGlobalSources(
      [...GLOBAL_PLUGIN_REACT, ...otherGlobal],
      REACT_MIGRATED_TO_EJECT,
    );

    expect(result.skills).toStrictEqual([...GLOBAL_EJECT_REACT, ...otherGlobal]);
    expect(result.changed).toBe(true);
  });
});

describe("edit command source switches on inherited global-active skills", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  const AGENTS = buildAgentConfigs(["web-developer"]);

  const testMatrix = FULLSTACK_PAIR_MATRIX;
  const testSourceResult = buildSourceResult(testMatrix, "/test/source");

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-global-authority-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);

    mockRender.mockClear();
    mockCopySkillsToLocalFlattened.mockClear();
    mockGetAgentDefinitions.mockClear();
    mockDetectInstallation.mockResolvedValue(buildEjectInstallation(projectDir));
    mockLoadSkillsMatrixFromSource.mockResolvedValue(testSourceResult);
    initializeMatrix(testSourceResult.matrix);
    mockDiscoverAllPluginSkills.mockResolvedValue({});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("applies a source switch on an inherited global-active skill rather than discarding it", async () => {
    mockProjectConfig(projectDir, {
      name: "test-project",
      agents: AGENTS,
      skills: [...GLOBAL_PLUGIN_REACT, ...PROJECT_PLUGIN_HONO],
    });
    mockWizardCompletion(
      buildWizardResult([...GLOBAL_EJECT_REACT, ...PROJECT_PLUGIN_HONO], { agentConfigs: AGENTS }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    // The switch is a real change: the command runs the migration + config write path
    // instead of returning early at "No changes made.".
    expect(mockGetAgentDefinitions).toHaveBeenCalled();
  });
});

// An eject→plugin mode migration whose `claude plugin install` fails is the twin of the
// newly-added-skill failure already guarded in applyPluginChanges: the run must hard-error
// before any config records a marketplace source for a skill with no plugin registration.

describe("edit command mode migration with a failing plugin install", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;
  let stderrChunks: string[] = [];
  let origStderrWrite: typeof process.stderr.write;

  const AGENTS = buildAgentConfigs(["web-developer"]);
  const MARKETPLACE = "agents-inc";
  const testSourceResult = buildSourceResult(FULLSTACK_PAIR_MATRIX, "/test/source", {
    marketplace: MARKETPLACE,
  });
  const installSpy = vi.spyOn(execModule, "claudePluginInstall");
  const marketplaceExistsSpy = vi.spyOn(execModule, "claudePluginMarketplaceExists");
  const marketplaceUpdateSpy = vi.spyOn(execModule, "claudePluginMarketplaceUpdate");

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-migration-install-fail-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);

    stderrChunks = [];
    origStderrWrite = process.stderr.write;
    process.stderr.write = function (str: unknown): boolean {
      stderrChunks.push(String(str));
      return true;
    } as typeof process.stderr.write;

    mockRender.mockClear();
    mockDeleteLocalSkill.mockClear();
    mockDetectInstallation.mockResolvedValue(buildEjectInstallation(projectDir));
    mockLoadSkillsMatrixFromSource.mockResolvedValue(testSourceResult);
    initializeMatrix(testSourceResult.matrix);
    mockDiscoverAllPluginSkills.mockResolvedValue({});
    installSpy.mockReset().mockRejectedValue(new Error("plugin ref not found"));
    // The marketplace precondition is already satisfied — this test isolates the
    // per-skill install failure, not marketplace resolution.
    marketplaceExistsSpy.mockReset().mockResolvedValue(true);
    marketplaceUpdateSpy.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    process.stderr.write = origStderrWrite;
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("exits with ERROR, writes no config.ts and keeps the ejected copy on disk", async () => {
    mockProjectConfig(projectDir, {
      name: "test-project",
      agents: AGENTS,
      skills: buildSkillConfigs(["web-framework-react"], { scope: "project", source: "eject" }),
    });
    mockWizardCompletion(
      buildWizardResult(
        buildSkillConfigs(["web-framework-react"], { scope: "project", source: MARKETPLACE }),
        { agentConfigs: AGENTS },
      ),
    );

    // `this.error()` throws a CLIError carrying the exit code; `Errors.CLIError` is the
    // oclif type for it, partial because only `oclif.exit` and `message` are asserted.
    let thrown: (Error & Partial<Errors.CLIError>) | undefined;
    try {
      await Edit.run([], { root: CLI_ROOT });
    } catch (error) {
      if (error instanceof Error) thrown = error;
    }

    expect(thrown?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(thrown?.message).toContain("Plugin install intent could not be honored");
    expect(stderrChunks.join("")).toContain("Failed to install plugin web-framework-react");

    expect(
      await fileExists(path.join(projectDir, ".claude-src/config.ts")),
      "config.ts must not record a marketplace source for a skill that was never plugin-installed",
    ).toBe(false);
    expect(
      mockDeleteLocalSkill,
      "the ejected working copy must survive a migration whose plugin install failed",
    ).not.toHaveBeenCalled();
  });
});

// Bug regression: migratePluginSkillScopes must NOT uninstall the global ("user")
// plugin when re-scoping from global to project. The global registration is shared
// across projects and must remain intact. Only project→global should uninstall.

describe("migratePluginSkillScopes", () => {
  const installSpy = vi.spyOn(execModule, "claudePluginInstall");
  const uninstallSpy = vi.spyOn(execModule, "claudePluginUninstall");

  beforeEach(() => {
    installSpy.mockReset().mockResolvedValue();
    uninstallSpy.mockReset().mockResolvedValue();
  });

  afterAll(() => {});

  it("should not uninstall global plugin when re-scoping from global to project", async () => {
    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global" as const, to: "project" as const }],
    ]);
    const skills: Pick<SkillConfig, "id" | "source">[] = [
      { id: "web-framework-react", source: "agents-inc" },
    ];

    await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(uninstallSpy).not.toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "user",
      "/project",
    );
    expect(installSpy).toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "project",
      "/project",
    );
  });

  it("should uninstall project plugin when re-scoping from project to global", async () => {
    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "project" as const, to: "global" as const }],
    ]);
    const skills: Pick<SkillConfig, "id" | "source">[] = [
      { id: "web-framework-react", source: "agents-inc" },
    ];

    await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(uninstallSpy).toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "project",
      "/project",
    );
    expect(installSpy).toHaveBeenCalledWith("web-framework-react@agents-inc", "user", "/project");
  });

  it("should skip eject-source skills during scope migration", async () => {
    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global" as const, to: "project" as const }],
    ]);
    const skills: Pick<SkillConfig, "id" | "source">[] = [
      { id: "web-framework-react", source: "eject" },
    ];

    await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(uninstallSpy).not.toHaveBeenCalled();
    expect(installSpy).not.toHaveBeenCalled();
  });

  it("should handle mixed scope changes correctly", async () => {
    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global" as const, to: "project" as const }],
      ["web-state-zustand", { from: "project" as const, to: "global" as const }],
    ]);
    const skills: Pick<SkillConfig, "id" | "source">[] = [
      { id: "web-framework-react", source: "agents-inc" },
      { id: "web-state-zustand", source: "agents-inc" },
    ];

    const result = await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(result.migrated).toHaveLength(2);

    // React global→project: NO uninstall, install at project
    expect(uninstallSpy).not.toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "user",
      "/project",
    );
    expect(installSpy).toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "project",
      "/project",
    );

    // Zustand project→global: uninstall project, install at user
    expect(uninstallSpy).toHaveBeenCalledWith(
      "web-state-zustand@agents-inc",
      "project",
      "/project",
    );
    expect(installSpy).toHaveBeenCalledWith("web-state-zustand@agents-inc", "user", "/project");
  });

  it("should report install failure without affecting global registration", async () => {
    installSpy.mockRejectedValue(new Error("install failed"));

    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global" as const, to: "project" as const }],
    ]);
    const skills: Pick<SkillConfig, "id" | "source">[] = [
      { id: "web-framework-react", source: "agents-inc" },
    ];

    const result = await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    // Should NOT have uninstalled global
    expect(uninstallSpy).not.toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "user",
      "/project",
    );
    // Should report failure
    expect(result.migrated).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe("web-framework-react");
  });

  it("should not install at global scope when project uninstall fails", async () => {
    uninstallSpy.mockRejectedValue(new Error("uninstall failed"));

    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "project" as const, to: "global" as const }],
    ]);
    const skills: Pick<SkillConfig, "id" | "source">[] = [
      { id: "web-framework-react", source: "agents-inc" },
    ];

    const result = await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    // Should have tried to uninstall
    expect(uninstallSpy).toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "project",
      "/project",
    );
    // Should NOT have installed at global (uninstall failed, catch fired)
    expect(installSpy).not.toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "user",
      "/project",
    );
    // Should report failure
    expect(result.migrated).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
  });

  it("should skip skills not found in the skills array", async () => {
    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global" as const, to: "project" as const }],
    ]);
    // Empty skills array — skill not found
    const skills: Array<{ id: SkillId; source: string }> = [];

    const result = await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(uninstallSpy).not.toHaveBeenCalled();
    expect(installSpy).not.toHaveBeenCalled();
    expect(result.migrated).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it("should continue processing after individual skill failure", async () => {
    installSpy.mockRejectedValueOnce(new Error("first fails")).mockResolvedValueOnce();

    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global" as const, to: "project" as const }],
      ["web-state-zustand", { from: "global" as const, to: "project" as const }],
    ]);
    const skills: Pick<SkillConfig, "id" | "source">[] = [
      { id: "web-framework-react", source: "agents-inc" },
      { id: "web-state-zustand", source: "agents-inc" },
    ];

    const result = await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    // First skill failed, second succeeded
    expect(result.migrated).toStrictEqual(["web-state-zustand"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe("web-framework-react");
  });
});

// detectConfigChanges is a pure function that compares old and new configs
// to produce a structured diff. These tests verify each change type is
// correctly detected without requiring the full command lifecycle.

describe("detectConfigChanges", () => {
  it("should detect added skills", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"]),
      agents: [],
    });
    const wizardResult = buildWizardResult(
      buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
    );

    const changes = detectConfigChanges(oldConfig, wizardResult);

    expect(changes.addedSkills).toStrictEqual(["api-framework-hono"]);
    expect(changes.removedSkills).toStrictEqual([]);
  });

  it("should detect removed skills", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
      agents: [],
    });
    const wizardResult = buildWizardResult(buildSkillConfigs(["web-framework-react"]));

    const changes = detectConfigChanges(oldConfig, wizardResult);

    expect(changes.removedSkills).toStrictEqual(["api-framework-hono"]);
    expect(changes.addedSkills).toStrictEqual([]);
  });

  it("should detect scope changes on skills", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      agents: [],
    });
    const wizardResult = buildWizardResult(
      buildSkillConfigs(["web-framework-react"], { scope: "project" }),
    );

    const changes = detectConfigChanges(oldConfig, wizardResult);

    expect(changes.scopeChanges.size).toBe(1);
    expect(changes.scopeChanges.get("web-framework-react")).toStrictEqual({
      from: "global",
      to: "project",
    });
    // Skill is not added or removed — just scope-changed
    expect(changes.addedSkills).toStrictEqual([]);
    expect(changes.removedSkills).toStrictEqual([]);
  });

  it("should detect source changes on skills", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"], { source: "eject" }),
      agents: [],
    });
    const wizardResult = buildWizardResult(
      buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
    );

    const changes = detectConfigChanges(oldConfig, wizardResult);

    expect(changes.sourceChanges.size).toBe(1);
    expect(changes.sourceChanges.get("web-framework-react")).toStrictEqual({
      from: "eject",
      to: "agents-inc",
    });
  });

  it("should detect added and removed agents", () => {
    const oldConfig = buildProjectConfig({
      skills: [],
      agents: buildAgentConfigs(["web-developer"]),
    });
    const wizardResult = buildWizardResult([], {
      agentConfigs: buildAgentConfigs(["api-developer"]),
    });

    const changes = detectConfigChanges(oldConfig, wizardResult);

    expect(changes.addedAgents).toStrictEqual(["api-developer"]);
    expect(changes.removedAgents).toStrictEqual(["web-developer"]);
  });

  it("should detect agent scope changes", () => {
    const oldConfig = buildProjectConfig({
      skills: [],
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
    });
    const wizardResult = buildWizardResult([], {
      agentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
    });

    const changes = detectConfigChanges(oldConfig, wizardResult);

    // Boundary cast: buildAgentConfigs uses AgentName cast for test names
    expect(changes.agentScopeChanges.get("web-developer")).toStrictEqual({
      from: "project",
      to: "global",
    });
  });

  it("should return empty changes when configs are identical", () => {
    const skills = buildSkillConfigs(["web-framework-react"]);
    const agents = buildAgentConfigs(["web-developer"]);
    const oldConfig = buildProjectConfig({ skills, agents });
    const wizardResult = buildWizardResult(skills, { agentConfigs: agents });

    const changes = detectConfigChanges(oldConfig, wizardResult);

    expect(changes.addedSkills).toStrictEqual([]);
    expect(changes.removedSkills).toStrictEqual([]);
    expect(changes.addedAgents).toStrictEqual([]);
    expect(changes.removedAgents).toStrictEqual([]);
    expect(changes.sourceChanges.size).toBe(0);
    expect(changes.scopeChanges.size).toBe(0);
    expect(changes.agentScopeChanges.size).toBe(0);
  });

  it("should treat null old config as empty (all skills/agents are additions)", () => {
    const wizardResult = buildWizardResult(
      buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
      {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      },
    );

    const changes = detectConfigChanges(null, wizardResult);

    expect(changes.addedSkills).toStrictEqual(["web-framework-react", "api-framework-hono"]);
    expect(changes.removedSkills).toStrictEqual([]);
    expect(changes.addedAgents).toStrictEqual(["web-developer"]);
    expect(changes.removedAgents).toStrictEqual([]);
    expect(changes.sourceChanges.size).toBe(0);
    expect(changes.scopeChanges.size).toBe(0);
  });

  it("should detect multiple change types simultaneously", () => {
    const oldConfig = buildProjectConfig({
      skills: [
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "eject" }),
        ...buildSkillConfigs(["web-testing-vitest"]),
      ],
      agents: buildAgentConfigs(["web-developer"]),
    });
    const wizardResult = buildWizardResult(
      [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "agents-inc" }),
        ...buildSkillConfigs(["api-framework-hono"]),
      ],
      {
        agentConfigs: buildAgentConfigs(["web-developer", "api-developer"]),
      },
    );

    const changes = detectConfigChanges(oldConfig, wizardResult);

    // Added hono, removed vitest
    expect(changes.addedSkills).toStrictEqual(["api-framework-hono"]);
    expect(changes.removedSkills).toStrictEqual(["web-testing-vitest"]);
    // React: scope G→P and source eject→agents-inc
    expect(changes.scopeChanges.get("web-framework-react")).toStrictEqual({
      from: "global",
      to: "project",
    });
    expect(changes.sourceChanges.get("web-framework-react")).toStrictEqual({
      from: "eject",
      to: "agents-inc",
    });
    // Added api-developer agent
    expect(changes.addedAgents).toStrictEqual(["api-developer"]);
    expect(changes.removedAgents).toStrictEqual([]);
  });

  // A dual-scope addition (adding project scope to an already-global install)
  // produces TWO new entries for the same id: an active project entry plus an
  // excluded global tombstone. The active-only diff sees only the project entry
  // and would misread it as a G→P migration. detectConfigChanges must flag it as
  // a dual-scope transition using the tombstone-inclusive `fullEntries`.
  it("classifies a G→P dual-scope skill addition as a dual-scope transition, not a migration", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      agents: [],
    });
    const wizardResult = buildWizardResult(
      buildSkillConfigs(["web-framework-react"], { scope: "project" }),
    );
    const fullEntries = {
      newSkills: [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
      ],
      oldSkills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      newAgents: [],
      oldAgents: [],
    };

    const changes = detectConfigChanges(oldConfig, wizardResult, fullEntries);

    // The scope change stays in scopeChanges — it still drives the disk-side
    // project-scope install and keeps hasAnyChanges truthy.
    expect(changes.scopeChanges.get("web-framework-react")).toStrictEqual({
      from: "global",
      to: "project",
    });
    // ...but it is flagged so the summary renders it as a project-scope addition.
    expect(changes.dualScopeSkillTransitions.has("web-framework-react")).toBe(true);
  });

  it("classifies a P→G dual-scope skill removal as a dual-scope transition, not a migration", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
      agents: [],
    });
    const wizardResult = buildWizardResult(
      buildSkillConfigs(["web-framework-react"], { scope: "global" }),
    );
    const fullEntries = {
      newSkills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      oldSkills: [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
      ],
      newAgents: [],
      oldAgents: [],
    };

    const changes = detectConfigChanges(oldConfig, wizardResult, fullEntries);

    expect(changes.scopeChanges.get("web-framework-react")).toStrictEqual({
      from: "project",
      to: "global",
    });
    expect(changes.dualScopeSkillTransitions.has("web-framework-react")).toBe(true);
  });

  it("keeps a genuine G→P migration (no tombstone) out of the dual-scope set", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      agents: [],
    });
    const wizardResult = buildWizardResult(
      buildSkillConfigs(["web-framework-react"], { scope: "project" }),
    );
    const fullEntries = {
      newSkills: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
      oldSkills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      newAgents: [],
      oldAgents: [],
    };

    const changes = detectConfigChanges(oldConfig, wizardResult, fullEntries);

    expect(changes.scopeChanges.get("web-framework-react")).toStrictEqual({
      from: "global",
      to: "project",
    });
    expect(changes.dualScopeSkillTransitions.has("web-framework-react")).toBe(false);
  });

  it("classifies a G→P dual-scope AGENT addition as a dual-scope transition", () => {
    const oldConfig = buildProjectConfig({
      skills: [],
      agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
    });
    const wizardResult = buildWizardResult([], {
      agentConfigs: buildAgentConfigs(["web-developer"], { scope: "project" }),
    });
    const fullEntries = {
      newSkills: [],
      oldSkills: [],
      newAgents: [
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
        ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
      ],
      oldAgents: buildAgentConfigs(["web-developer"], { scope: "global" }),
    };

    const changes = detectConfigChanges(oldConfig, wizardResult, fullEntries);

    // Boundary cast: buildAgentConfigs uses AgentName cast for test names
    expect(changes.agentScopeChanges.get("web-developer")).toStrictEqual({
      from: "global",
      to: "project",
    });
    expect(changes.dualScopeAgentTransitions.has("web-developer")).toBe(true);
  });

  it("treats every scope change as a migration when fullEntries is omitted", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      agents: [],
    });
    const wizardResult = buildWizardResult(
      buildSkillConfigs(["web-framework-react"], { scope: "project" }),
    );

    const changes = detectConfigChanges(oldConfig, wizardResult);

    expect(changes.scopeChanges.size).toBe(1);
    expect(changes.dualScopeSkillTransitions.size).toBe(0);
    expect(changes.dualScopeAgentTransitions.size).toBe(0);
  });
});

// The change summary must display human-readable names, scope labels, and
// appropriate change prefixes. These tests drive the edit command through
// the full flow to capture stdout and verify the formatted output.

describe("edit change summary display", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;
  let stdoutChunks: string[] = [];
  let origWrite: typeof process.stdout.write;

  const testMatrix = FULLSTACK_PAIR_MATRIX;
  const testSourceResult = buildSourceResult(testMatrix, "/test/source");

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-summary-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);

    stdoutChunks = [];
    origWrite = process.stdout.write;
    process.stdout.write = function (str: unknown): boolean {
      stdoutChunks.push(String(str));
      return true;
    } as typeof process.stdout.write;

    mockRender.mockClear();
    mockDetectInstallation.mockResolvedValue(buildEjectInstallation(projectDir));

    mockLoadSkillsMatrixFromSource.mockResolvedValue(testSourceResult);
    initializeMatrix(testSourceResult.matrix);
    mockDiscoverAllPluginSkills.mockResolvedValue({});
  });

  afterEach(async () => {
    process.stdout.write = origWrite;
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("should show display names instead of raw skill IDs for added skills", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({ skills: [], agents: buildAgentConfigs(["web-developer"]) }),
    );

    mockWizardCompletion(
      buildWizardResult(buildSkillConfigs(["web-framework-react"], { scope: "project" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    const output = stdoutChunks.join("");

    // Should use display name "React", not raw ID "web-framework-react"
    expect(output).toContain("React");
    expect(output).not.toContain("web-framework-react");
  });

  it("should show scope labels [G]/[P] on added skill lines", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({ skills: [], agents: buildAgentConfigs(["web-developer"]) }),
    );

    mockWizardCompletion(
      buildWizardResult(buildSkillConfigs(["web-framework-react"], { scope: "global" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    const output = stdoutChunks.join("");

    // Should show [G] scope label for the globally-scoped added skill
    expect(output).toContain("[G]");
  });

  it("should show + prefix for G-to-P scope changes instead of ~", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"]),
      }),
    );

    mockWizardCompletion(
      buildWizardResult(buildSkillConfigs(["web-framework-react"], { scope: "project" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    const output = stdoutChunks.join("");

    // G→P scope change should show "+" prefix (treat as addition to project)
    // and show scope transition labels
    expect(output).toContain("+ React");
    expect(output).toContain("[G]");
    expect(output).toContain("[P]");
    // Should NOT show "~" for G→P changes
    expect(output).not.toContain("~ React");
  });

  it("should report a dual-scope addition as a project-scope add, not a G→P migration", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"]),
      }),
    );

    mockRender.mockImplementation((element: ReactElement) => {
      const onComplete = element.props.onComplete as ((result: unknown) => void) | undefined;
      if (onComplete) {
        // Dual-scope shape: active project entry + excluded global tombstone.
        // The global install survives; only project scope is added.
        onComplete(
          buildWizardResult(
            [
              ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
              ...buildSkillConfigs(["web-framework-react"], {
                scope: "global",
                excluded: true,
              }),
            ],
            { agentConfigs: buildAgentConfigs(["web-developer"]) },
          ),
        );
      }
      return { waitUntilExit: () => Promise.resolve(), clear: vi.fn(), unmount: vi.fn() };
    });

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    const output = stdoutChunks.join("");

    // Rendered as a project-scope addition
    expect(output).toContain("+ React");
    expect(output).toContain("[P]");
    // Must NOT be rendered as a scope migration
    expect(output).not.toContain("[G] → [P]");
    expect(output).not.toContain("~ React");
  });

  it("should show ~ prefix for P-to-G scope changes", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        agents: buildAgentConfigs(["web-developer"]),
      }),
    );

    mockWizardCompletion(
      buildWizardResult(buildSkillConfigs(["web-framework-react"], { scope: "global" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    const output = stdoutChunks.join("");

    // P→G scope change should show "~" prefix (modification, not addition)
    expect(output).toContain("~ React");
    expect(output).toContain("[P]");
    expect(output).toContain("[G]");
    // Should NOT show "+" for P→G changes
    expect(output).not.toContain("+ React");
  });

  it("should show display names for removed skills", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        agents: buildAgentConfigs(["web-developer"]),
      }),
    );

    mockRender.mockImplementation((element: ReactElement) => {
      const onComplete = element.props.onComplete as ((result: unknown) => void) | undefined;
      if (onComplete) {
        // Remove all skills — wizard result has no skills
        onComplete(
          buildWizardResult([], {
            agentConfigs: buildAgentConfigs(["web-developer"]),
          }),
        );
      }
      return { waitUntilExit: () => Promise.resolve(), clear: vi.fn(), unmount: vi.fn() };
    });

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    const output = stdoutChunks.join("");

    // Should use display name "React", not raw ID "web-framework-react"
    expect(output).toContain("React");
    expect(output).not.toContain("web-framework-react");
    // Should show scope label for removed skill (from old config)
    expect(output).toContain("[P]");
  });

  it("should show display names and formatted source labels for source changes", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { source: "eject" }),
        agents: buildAgentConfigs(["web-developer"]),
      }),
    );

    mockWizardCompletion(
      buildWizardResult(buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    const output = stdoutChunks.join("");

    // Should show display name, not raw skill ID
    expect(output).toContain("React");
    expect(output).not.toContain("web-framework-react");
    // Should show formatted source labels (Eject → Agents Inc)
    expect(output).toContain("Eject");
    expect(output).toContain("Agents Inc");
  });
});
