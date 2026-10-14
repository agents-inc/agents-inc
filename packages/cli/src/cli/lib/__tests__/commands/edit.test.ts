import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import type { ReactElement } from "react";
import os from "os";
import path from "path";
import { mkdir } from "fs/promises";
import type { Errors } from "@oclif/core";
import { parseRefusal, runCliCommand, CLI_ROOT } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir, fileExists } from "../test-fs-utils";
import { useFakeHome } from "../helpers/isolated-home.js";
import { writeRawTestConfig } from "../helpers/config-io.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { createMockSkill, createMockSkillDefinition } from "../factories/skill-factories.js";
import { createMockMatrix } from "../factories/matrix-factories.js";
import {
  buildProjectConfig,
  buildSourceResult,
  buildWizardResult,
  buildAgentConfigs,
} from "../factories/config-factories.js";
import { buildInstallation } from "../factories/installation-factories.js";
import { renderUnparseableConfigTs } from "../factories/unloadable-config-factories.js";
import { SKILLS, TEST_CATEGORIES } from "../test-fixtures";
import { FULLSTACK_PAIR_MATRIX } from "../mock-data/mock-matrices";
import { EXPECTED_SKILLS } from "../expected-values";
import { EXIT_CODES } from "../../exit-codes";
import {
  CLAUDE_DIR,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EDITOR_URL,
  EJECT_SOURCE,
  STANDARD_DIRS,
} from "../../../consts";
import { ERROR_MESSAGES } from "../../../utils/messages";
import * as wizardStore from "../../../stores/wizard-store";
import { useWizardStore } from "../../../stores/wizard-store";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { hostAt } from "../../hosts/host-for.js";
import type { CategoryPath, ProjectConfig, SkillId, SkillScope } from "../../../types";
import type { getAgentDefinitions } from "../../agents/index.js";
import type { loadProjectConfig } from "../../configuration/index.js";
import type { detectInstallation, Installation } from "../../installation/index.js";
import type { loadSkillsMatrixFromSource } from "../../loading/index.js";
import type { discoverAllPluginSkills } from "../../plugins/index.js";
import type { copySkillsToLocalFlattened, deleteLocalSkill } from "../../skills/index.js";
import type { ensureDir } from "../../../utils/fs.js";
import { firstElement } from "../helpers/element-at.js";
import { stubInkInstance } from "../helpers/stub-ink-instance.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
import Edit, {
  applyMigratedGlobalSources,
  migratePluginSkillScopes,
  detectConfigChanges,
} from "../../../commands/edit.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";

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
} = await vi.hoisted(async () => ({
  // Imported here rather than at the top: hoisting runs this block before the file's imports.
  mockRender: vi
    .fn()
    .mockReturnValue((await import("../helpers/stub-ink-instance.js")).stubInkInstance()),
  mockDetectInstallation: vi.fn<typeof detectInstallation>().mockResolvedValue(null),
  mockLoadSkillsMatrixFromSource: vi.fn<typeof loadSkillsMatrixFromSource>(),
  mockLoadProjectConfig: vi.fn<typeof loadProjectConfig>().mockResolvedValue(null),
  mockDiscoverAllPluginSkills: vi.fn<typeof discoverAllPluginSkills>().mockResolvedValue({}),
  // An empty array is a copy that did nothing; `undefined` would now stop the command.
  mockCopySkillsToLocalFlattened: vi.fn<typeof copySkillsToLocalFlattened>().mockResolvedValue([]),
  mockDeleteLocalSkill: vi.fn<typeof deleteLocalSkill>().mockResolvedValue(undefined),
  mockEnsureDir: vi.fn<typeof ensureDir>().mockResolvedValue(undefined),
  mockGetAgentDefinitions: vi.fn<typeof getAgentDefinitions>().mockResolvedValue({
    agentsDir: "/mock/agents",
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
    detectInstallation: mockDetectInstallation,
  };
});

vi.mock("../../loading/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../loading/index.js")>();
  return {
    ...original,
    loadSkillsMatrixFromSource: mockLoadSkillsMatrixFromSource,
  };
});

vi.mock("../../configuration/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../configuration/index.js")>();
  return {
    ...original,
    loadProjectConfig: mockLoadProjectConfig,
  };
});

vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../helpers/mock-plugin-host.js");
  const host = createMockPluginHost();
  return { hostAt: () => host, hostFor: () => host };
});

vi.mock("../../plugins/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../plugins/index.js")>();
  return {
    ...original,
    discoverAllPluginSkills: mockDiscoverAllPluginSkills,
  };
});

vi.mock("../../agents/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../agents/index.js")>();
  return {
    ...original,
    getAgentDefinitions: mockGetAgentDefinitions,
  };
});

vi.mock("../../skills/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../skills/index.js")>();
  return {
    ...original,
    copySkillsToLocalFlattened: mockCopySkillsToLocalFlattened,
    deleteLocalSkill: mockDeleteLocalSkill,
  };
});

vi.mock("../../../utils/fs.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../utils/fs.js")>();
  return {
    ...original,
    ensureDir: mockEnsureDir,
  };
});

/** Every name a config could be written under, so a "not written" assertion can fail. */
const CONFIG_PATHS_UNDER_EVERY_PROVIDER = [
  ".agents-inc/claude/config.ts",
  ".agents-inc/codex/config.ts",
] as const;

async function configsWrittenUnder(projectDir: string): Promise<string[]> {
  const found = await Promise.all(
    CONFIG_PATHS_UNDER_EVERY_PROVIDER.map(async (relative) =>
      (await fileExists(path.join(projectDir, relative))) ? relative : null,
    ),
  );

  return found.filter((relative) => relative !== null);
}

function mockProjectConfig(projectDir: string, config: ProjectConfig): void {
  mockLoadProjectConfig.mockResolvedValue({
    config,
    configPath: path.join(projectDir, ".agents-inc/claude/config.ts"),
    provider: "claude",
  });
}

/** Rooted at `projectDir` because these specs run the command inside that directory. */
function buildEjectInstallation(projectDir: string): Installation {
  return buildInstallation({
    mode: "eject",
    projectDir,
    configPath: getProjectConfigPath(projectDir, "claude"),
    agentsDir: path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS),
    skillsDir: path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS),
  });
}

function mockWizardCompletion(wizardResult: unknown): void {
  mockRender.mockImplementation((element: ReactElement<Record<string, unknown>>) => {
    const onComplete = element.props.onComplete as ((result: unknown) => void) | undefined;
    if (onComplete) {
      onComplete(wizardResult);
    }
    return stubInkInstance();
  });
}

const CONFIG_LOAD_FAILED_PHRASE = "could not be loaded";

const RECREATE_PHRASE = "recreate the configuration";

/** `edit` refuses to mount its wizard without a terminal, so the file stands at one. */
standAtTerminal();

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

    mockDetectInstallation.mockResolvedValue(null);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  describe("no installation found", () => {
    it("when no source folder is present under either name, should exit with error code", async () => {
      const { error } = await runCliCommand(["edit"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("when no installation exists, should suggest running init", async () => {
      const { error } = await runCliCommand(["edit"]);

      expect(error?.message).toContain("No installation found");
    });
  });

  /** Loaded from disk: the guard reads the file directly, so the mocked loader is not in play. */
  describe("unreadable config", () => {
    const fakeHome = useFakeHome(() => tempDir);

    it("refuses, naming the config it could not read", async () => {
      const configPath = await writeRawTestConfig(projectDir, renderUnparseableConfigTs());

      const { error } = await runCliCommand(["edit"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(configPath);
      expect(error?.message).toContain(CONFIG_LOAD_FAILED_PHRASE);
      expect(error?.message).not.toContain(ERROR_MESSAGES.NO_INSTALLATION);
    });

    it("says to recreate the configuration and where to build a new one", async () => {
      await writeRawTestConfig(projectDir, renderUnparseableConfigTs());

      const { error } = await runCliCommand(["edit"]);

      expect(error?.message).toContain(RECREATE_PHRASE);
      expect(error?.message).toContain(EDITOR_URL);
    });

    it("refuses when the unreadable config is the global one and the project has none", async () => {
      const globalConfigPath = await writeRawTestConfig(fakeHome.dir, renderUnparseableConfigTs());

      const { error } = await runCliCommand(["edit"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(globalConfigPath);
      expect(error?.message).toContain(RECREATE_PHRASE);
    });

    it("keeps the no-installation message when no config file exists at all", async () => {
      const { error } = await runCliCommand(["edit"]);

      expect(error?.message).toContain(ERROR_MESSAGES.NO_INSTALLATION);
      expect(error?.message).not.toContain(RECREATE_PHRASE);
    });
  });

  describe("flag validation", () => {
    it("rejects --refresh — every load revalidates, so there is nothing to force", async () => {
      const { error } = await runCliCommand(["edit", "--refresh"]);

      expect(error?.message).toContain(parseRefusal("--refresh"));
    });

    it("rejects --source — the wizard opens on the catalogue config.ts names", async () => {
      const { error } = await runCliCommand(["edit", "--source", "/some/path"]);

      expect(error?.message).toContain(parseRefusal("--source"));
      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("rejects the -s shorthand for the same reason", async () => {
      const { error } = await runCliCommand(["edit", "-s", "/some/path"]);

      expect(error?.message).toContain(parseRefusal("-s"));
      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });
  });
});

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

// The wizard cannot be driven from runCliCommand, so pre-selection is tested at the store, on
// the path use-wizard-initialization.ts takes in edit mode.

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

    expect(domainSelections.web?.["web-framework"]).toStrictEqual(["web-framework-react"]);
    expect(domainSelections.web?.["web-client-state"]).toStrictEqual(["web-state-zustand"]);

    expect(domainSelections.api?.["api-api"]).toStrictEqual(["api-framework-hono"]);
  });

  it("should not pre-select skills that are not in the installed list", () => {
    const installedSkills: SkillId[] = ["web-framework-react"];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    expect(domainSelections.web?.["web-framework"]).toStrictEqual(["web-framework-react"]);

    expect(domainSelections.web?.["web-client-state"]).toBeUndefined();
    expect(domainSelections.api).toBeUndefined();
  });

  it("should set selectedDomains to only the domains found in the provided skill IDs", () => {
    const installedSkills: SkillId[] = ["web-framework-react"];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { selectedDomains } = useWizardStore.getState();

    expect(selectedDomains).toContain("web");
    expect(selectedDomains).not.toContain("api");
    expect(selectedDomains).not.toContain("shared");
  });

  it("should place shared-domain skills under the shared domain key", () => {
    const installedSkills: SkillId[] = ["web-testing-vitest"];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    expect(domainSelections.shared?.["web-testing"]).toStrictEqual(["web-testing-vitest"]);

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
      // Boundary cast: a fictional skill id with no category
      "web-framework-unknown": createMockSkill("web-framework-unknown" as SkillId, {
        category: undefined as unknown as CategoryPath,
      }),
    };

    initializeMatrix(
      createMockMatrix(sparseSkills, {
        categories: EDIT_CATEGORIES,
      }),
    );

    // Boundary cast: a fake id to test unknown-skill handling
    const installedSkills: SkillId[] = ["web-framework-react", "web-framework-unknown" as SkillId];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    expect(domainSelections.web?.["web-framework"]).toStrictEqual(["web-framework-react"]);
    expect(domainSelections.web?.["web-framework"]).toHaveLength(1);
  });

  it("should skip skills whose category has no domain mapping", () => {
    const extraSkills = {
      "web-framework-react": SKILLS.react,
      // Boundary cast: a fictional skill id in an unmapped category
      "infra-tooling-linter": createMockSkill("infra-tooling-linter" as SkillId),
    };

    initializeMatrix(
      createMockMatrix(extraSkills, {
        categories: EDIT_CATEGORIES,
      }),
    );

    // Boundary cast: a fake id to test unmapped-category handling
    const installedSkills: SkillId[] = ["web-framework-react", "infra-tooling-linter" as SkillId];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    expect(domainSelections.web?.["web-framework"]).toStrictEqual(["web-framework-react"]);
    const allTechs = useWizardStore.getState().getAllSelectedTechnologies();
    expect(allTechs).not.toContain("infra-tooling-linter");
  });

  it("should not duplicate skills when the same skill ID appears twice in installed list", () => {
    const installedSkills: SkillId[] = ["web-framework-react", "web-framework-react"];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    expect(domainSelections.web?.["web-framework"]).toStrictEqual(["web-framework-react"]);
    expect(domainSelections.web?.["web-framework"]).toHaveLength(1);
  });

  it("should populate multiple skills within the same category (non-exclusive)", () => {
    // Testing is non-exclusive, so multiple selections are valid.
    const multiSkills = {
      ...EDIT_SKILLS,
      // Boundary cast: a fictional skill id for multi-skill population
      "web-testing-playwright": createMockSkill("web-testing-playwright" as SkillId),
    };

    initializeMatrix(
      createMockMatrix(multiSkills, {
        categories: EDIT_CATEGORIES,
      }),
    );

    // Boundary cast: a fake id to test multi-selection in one category
    const installedSkills: SkillId[] = ["web-testing-vitest", "web-testing-playwright" as SkillId];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const { domainSelections } = useWizardStore.getState();

    expect(domainSelections.shared?.["web-testing"]).toContain("web-testing-vitest");
    expect(domainSelections.shared?.["web-testing"]).toContain("web-testing-playwright");
    expect(domainSelections.shared?.["web-testing"]).toHaveLength(2);
  });
});

// Domains with zero selections are omitted, so the build step can filter them out.

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

    expect(perDomain.web).toStrictEqual(EXPECTED_SKILLS.WEB_DEFAULT);

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

    expect(perDomain.shared).toStrictEqual(["web-testing-vitest"]);

    expect(perDomain.web).toBeUndefined();
    expect(perDomain.api).toBeUndefined();
    expect(perDomain.cli).toBeUndefined();
    expect(perDomain.mobile).toBeUndefined();
  });

  it("should return empty result when no skills are installed", () => {
    const installedSkills: SkillId[] = [];

    useWizardStore.getState().populateFromSkillIds(installedSkills);

    const perDomain = useWizardStore.getState().getSelectedTechnologiesPerDomain();

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

    expect(perDomain.web).toHaveLength(2);

    expect(perDomain.api).toHaveLength(1);

    expect(perDomain.shared).toHaveLength(1);

    expect(perDomain.cli).toBeUndefined();
    expect(perDomain.mobile).toBeUndefined();
  });
});

// With no plugin-based skills found, edit falls back to the project config's skills.

describe("edit command eject-mode skill fallback", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  const CONFIG_SKILL_IDS: SkillId[] = ["web-framework-react", "api-framework-hono"];
  const CONFIG_SKILLS = buildSkillConfigs(CONFIG_SKILL_IDS, { scope: "project", origin: "eject" });

  const testMatrix = FULLSTACK_PAIR_MATRIX;

  const testSourceResult = buildSourceResult(testMatrix, "/test/source");

  let hydrateSpy: ReturnType<typeof vi.spyOn>;

  function getRenderedInstalledSkillIds(): SkillId[] | undefined {
    // The hydrate call and the Wizard prop receive the same list; the hydrate call is easier to
    // spy.
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

    mockRender.mockClear();
    mockRender.mockReturnValue(stubInkInstance());

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
    mockProjectConfig(projectDir, buildProjectConfig({ agents: [], skills: CONFIG_SKILLS }));

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    expect(mockRender).toHaveBeenCalledTimes(2);
    const installedSkillIds = getRenderedInstalledSkillIds();
    expect(installedSkillIds).toStrictEqual(CONFIG_SKILL_IDS);
  });

  it("should merge discovered plugin skills with config skills as installedSkillIds", async () => {
    mockDiscoverAllPluginSkills.mockResolvedValue({
      "web-framework-react": createMockSkillDefinition("web-framework-react"),
    });
    mockProjectConfig(projectDir, buildProjectConfig({ agents: [], skills: CONFIG_SKILLS }));

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    expect(mockRender).toHaveBeenCalledTimes(2);
    const installedSkillIds = getRenderedInstalledSkillIds();
    expect(installedSkillIds).toStrictEqual(CONFIG_SKILL_IDS);
  });
});

// Adding an agent with no skill change must not end in "No changes made".

describe("edit command detects added agents", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  const EXISTING_SKILL_IDS: SkillId[] = ["web-framework-react"];
  const EXISTING_SKILLS = buildSkillConfigs(EXISTING_SKILL_IDS, {
    scope: "project",
    origin: "eject",
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
    mockProjectConfig(
      projectDir,
      buildProjectConfig({ agents: buildAgentConfigs(["web-developer"]), skills: EXISTING_SKILLS }),
    );

    mockWizardCompletion(
      buildWizardResult(EXISTING_SKILLS, {
        agentConfigs: buildAgentConfigs(["web-developer", "web-tester"]),
      }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    // Reaching agent loading proves the command did not return early.
    expect(mockGetAgentDefinitions).toHaveBeenCalledTimes(1);
  });
});

// Skills switched to local source during edit are copied to .claude/skills/.

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
    mockProjectConfig(
      projectDir,
      buildProjectConfig({ agents: buildAgentConfigs(["web-developer"]), skills: [] }),
    );

    const newLocalSkills = buildSkillConfigs(["web-framework-react"], {
      scope: "project",
      origin: "eject",
    });

    mockWizardCompletion(
      buildWizardResult(newLocalSkills, {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

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
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
      }),
    );
    mockRemovalWizard();

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    // Removed from the project directory (cwd), not home.
    expect(mockDeleteLocalSkill).toHaveBeenCalledWith(
      process.cwd(),
      "web-framework-react",
      "project",
    );
  });

  it("deletes a deselected GLOBAL-scope eject skill's directory from the home dir", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "eject" }),
      }),
    );
    mockRemovalWizard();

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    // Removed at global scope: `deleteLocalSkill` resolves the home skills folder for the host.
    expect(mockDeleteLocalSkill).toHaveBeenCalledWith(
      process.cwd(),
      "web-framework-react",
      "global",
    );
  });

  it("does NOT delete a directory for a deselected plugin-mode skill (handled by plugin uninstall)", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "agents-inc",
        }),
      }),
    );
    mockRemovalWizard();

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    expect(mockDeleteLocalSkill).not.toHaveBeenCalled();
  });
});

// A project-context edit's migrations of global-scoped skills happen under $HOME, so the global
// config records exactly those, and nothing else.

const GLOBAL_PLUGIN_REACT = buildSkillConfigs(["web-framework-react"], {
  scope: "global",
  origin: "agents-inc",
});
const GLOBAL_EJECT_REACT = buildSkillConfigs(["web-framework-react"], {
  scope: "global",
  origin: "eject",
});
const PROJECT_PLUGIN_HONO = buildSkillConfigs(["api-framework-hono"], {
  scope: "project",
  origin: "agents-inc",
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
      origin: "agents-inc",
    });

    const result = applyMigratedGlobalSources(otherGlobal, REACT_MIGRATED_TO_EJECT);

    expect(result.skills).toStrictEqual(otherGlobal);
    expect(result.changed).toBe(false);
  });

  it("leaves a global tombstone untouched even when its id migrated", () => {
    const tombstone = buildSkillConfigs(["web-framework-react"], {
      scope: "global",
      origin: "agents-inc",
      excluded: true,
    });

    const result = applyMigratedGlobalSources(tombstone, REACT_MIGRATED_TO_EJECT);

    expect(result.skills).toStrictEqual(tombstone);
    expect(result.changed).toBe(false);
  });

  it("leaves a project-scoped entry untouched even when its id migrated", () => {
    const projectReact = buildSkillConfigs(["web-framework-react"], {
      scope: "project",
      origin: "agents-inc",
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
      origin: "agents-inc",
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
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        agents: AGENTS,
        skills: [...GLOBAL_PLUGIN_REACT, ...PROJECT_PLUGIN_HONO],
      }),
    );
    mockWizardCompletion(
      buildWizardResult([...GLOBAL_EJECT_REACT, ...PROJECT_PLUGIN_HONO], { agentConfigs: AGENTS }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    // A real change: the run reaches the migration and config write.
    expect(mockGetAgentDefinitions).toHaveBeenCalled();
  });
});

// A failed eject→plugin install hard-errors before any config records a marketplace origin.

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
  const installSpy = vi.mocked(hostAt("/any-root").installPlugin);
  const marketplaceExistsSpy = vi.mocked(hostAt("/any-root").marketplaceExists);
  const marketplaceUpdateSpy = vi.mocked(hostAt("/any-root").refreshMarketplace);

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-migration-install-fail-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);

    stderrChunks = [];
    // Restored onto the same object in afterEach; binding would restore a wrapper.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored, not called
    origStderrWrite = process.stderr.write;
    process.stderr.write = function (str: unknown): boolean {
      stderrChunks.push(String(str));
      return true;
    };

    mockRender.mockClear();
    mockDeleteLocalSkill.mockClear();
    mockDetectInstallation.mockResolvedValue(buildEjectInstallation(projectDir));
    mockLoadSkillsMatrixFromSource.mockResolvedValue(testSourceResult);
    initializeMatrix(testSourceResult.matrix);
    mockDiscoverAllPluginSkills.mockResolvedValue({});
    installSpy.mockReset().mockRejectedValue(new Error("plugin ref not found"));
    // Isolates the per-skill install failure from marketplace resolution.
    marketplaceExistsSpy.mockReset().mockResolvedValue(true);
    marketplaceUpdateSpy.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    process.stderr.write = origStderrWrite;
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("exits with ERROR, writes no config.ts and keeps the ejected copy on disk", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        agents: AGENTS,
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
      }),
    );
    mockWizardCompletion(
      buildWizardResult(
        buildSkillConfigs(["web-framework-react"], { scope: "project", origin: MARKETPLACE }),
        { agentConfigs: AGENTS },
      ),
    );

    // `Errors.CLIError`, partial: only `oclif.exit` and `message` are asserted.
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
      await configsWrittenUnder(projectDir),
      "config.ts must not record a marketplace source for a skill that was never plugin-installed",
    ).toStrictEqual([]);
    expect(
      mockDeleteLocalSkill,
      "the ejected working copy must survive a migration whose plugin install failed",
    ).not.toHaveBeenCalled();
  });
});

// A project-scoped skill picked with only global sub-agents reaches none, and the run must say
// so. Asserted on output, since the generator, the save or the command may raise it.

/** Mirrors `STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT` in `e2e/pages/constants.ts`. */
const ASSIGNED_TO_NO_AGENT_PHRASE = "is assigned to no sub-agent";

describe("edit command reports a selected skill the scope filter left unassigned", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;
  let stderrChunks: string[] = [];
  let origStderrWrite: typeof process.stderr.write;

  const GLOBAL_AGENTS = buildAgentConfigs(["web-developer"], { scope: "global" });
  const PROJECT_EJECT_REACT = buildSkillConfigs(["web-framework-react"], {
    scope: "project",
    origin: EJECT_SOURCE,
  });
  const testSourceResult = buildSourceResult(FULLSTACK_PAIR_MATRIX, "/test/source");
  /** The save writes the global scope through `os.homedir()`, so it must not be the real one. */
  const homedirSpy = vi.spyOn(os, "homedir");

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-unassigned-skill-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    const fakeHome = path.join(tempDir, "fake-home");
    await mkdir(fakeHome, { recursive: true });
    homedirSpy.mockReturnValue(fakeHome);
    process.chdir(projectDir);

    stderrChunks = [];
    // Restored onto the same object in afterEach; binding would restore a wrapper.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored, not called
    origStderrWrite = process.stderr.write;
    process.stderr.write = function (str: unknown): boolean {
      stderrChunks.push(String(str));
      return true;
    };

    mockRender.mockClear();
    mockDetectInstallation.mockResolvedValue(buildEjectInstallation(projectDir));
    mockLoadSkillsMatrixFromSource.mockResolvedValue(testSourceResult);
    initializeMatrix(testSourceResult.matrix);
    mockDiscoverAllPluginSkills.mockResolvedValue({});
    // The copy makes the skill real on disk while it reaches no agent, and keeps the run going.
    mockCopySkillsToLocalFlattened.mockReset().mockResolvedValue([
      {
        skillId: "web-framework-react",
        sourcePath: "/test/source/web-framework-react",
        destPath: path.join(projectDir, ".claude/skills/web-framework-react"),
        contentHash: "hash-unassigned",
      },
    ]);
  });

  afterEach(async () => {
    process.stderr.write = origStderrWrite;
    homedirSpy.mockRestore();
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("names the skill that landed in no agent's stack", async () => {
    mockProjectConfig(projectDir, buildProjectConfig({ agents: GLOBAL_AGENTS, skills: [] }));
    mockWizardCompletion(buildWizardResult(PROJECT_EJECT_REACT, { agentConfigs: GLOBAL_AGENTS }));

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    // Proof the run selected and copied the skill, so the warning assertion is not vacuous.
    expect(mockCopySkillsToLocalFlattened).toHaveBeenCalledOnce();

    const stderr = stderrChunks.join("");
    expect(stderr).toContain(ASSIGNED_TO_NO_AGENT_PHRASE);
    expect(stderr).toContain("web-framework-react");
  });
});

// Global→project must not uninstall the shared global registration; only project→global does.

describe("migratePluginSkillScopes", () => {
  const installSpy = vi.mocked(hostAt("/any-root").installPlugin);
  const uninstallSpy = vi.mocked(hostAt("/any-root").uninstallPlugin);

  beforeEach(() => {
    installSpy.mockReset().mockResolvedValue();
    uninstallSpy.mockReset().mockResolvedValue("removed");
  });

  afterAll(() => {});

  it("should not uninstall global plugin when re-scoping from global to project", async () => {
    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global" as const, to: "project" as const }],
    ]);
    const skills = buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" });

    await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(uninstallSpy).not.toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "global",
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
    const skills = buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" });

    await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(uninstallSpy).toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "project",
      "/project",
    );
    expect(installSpy).toHaveBeenCalledWith("web-framework-react@agents-inc", "global", "/project");
  });

  it("should skip eject-source skills during scope migration", async () => {
    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global" as const, to: "project" as const }],
    ]);
    const skills = buildSkillConfigs(["web-framework-react"], { origin: "eject" });

    await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(uninstallSpy).not.toHaveBeenCalled();
    expect(installSpy).not.toHaveBeenCalled();
  });

  it("should handle mixed scope changes correctly", async () => {
    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global" as const, to: "project" as const }],
      ["web-state-zustand", { from: "project" as const, to: "global" as const }],
    ]);
    const skills = buildSkillConfigs(["web-framework-react", "web-state-zustand"], {
      origin: "agents-inc",
    });

    const result = await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(result.migrated).toHaveLength(2);

    expect(uninstallSpy).not.toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "global",
      "/project",
    );
    expect(installSpy).toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "project",
      "/project",
    );

    expect(uninstallSpy).toHaveBeenCalledWith(
      "web-state-zustand@agents-inc",
      "project",
      "/project",
    );
    expect(installSpy).toHaveBeenCalledWith("web-state-zustand@agents-inc", "global", "/project");
  });

  it("should report install failure without affecting global registration", async () => {
    installSpy.mockRejectedValue(new Error("install failed"));

    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global" as const, to: "project" as const }],
    ]);
    const skills = buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" });

    const result = await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(uninstallSpy).not.toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "global",
      "/project",
    );
    expect(result.migrated).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(firstElement(result.failed).id).toBe("web-framework-react");
  });

  it("should not install at global scope when project uninstall fails", async () => {
    uninstallSpy.mockRejectedValue(new Error("uninstall failed"));

    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "project" as const, to: "global" as const }],
    ]);
    const skills = buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" });

    const result = await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(uninstallSpy).toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "project",
      "/project",
    );
    // The uninstall failed, so nothing was installed at global.
    expect(installSpy).not.toHaveBeenCalledWith(
      "web-framework-react@agents-inc",
      "global",
      "/project",
    );
    expect(result.migrated).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
  });

  it("should skip skills not found in the skills array", async () => {
    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global" as const, to: "project" as const }],
    ]);
    const skills = buildSkillConfigs<SkillId>([]);

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
    const skills = buildSkillConfigs(["web-framework-react", "web-state-zustand"], {
      origin: "agents-inc",
    });

    const result = await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(result.migrated).toStrictEqual(["web-state-zustand"]);
    expect(result.failed).toHaveLength(1);
    expect(firstElement(result.failed).id).toBe("web-framework-react");
  });
});

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
    expect(changes.addedSkills).toStrictEqual([]);
    expect(changes.removedSkills).toStrictEqual([]);
  });

  it("should detect source changes on skills", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"], { origin: "eject" }),
      agents: [],
    });
    const wizardResult = buildWizardResult(
      buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
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

    expect(changes.agentScopeChanges.get("web-developer")).toStrictEqual({
      from: "project",
      to: "global",
    });
  });

  // One sentence per sub-agent, in entry order: model, Codex model, effort.
  it("names a change to a sub-agent's Codex model alone", () => {
    const oldConfig = buildProjectConfig({
      skills: [],
      agents: buildAgentConfigs(["web-developer"], { model: "haiku", effort: "high" }),
    });
    const wizardResult = buildWizardResult([], {
      agentConfigs: buildAgentConfigs(["web-developer"], {
        model: "haiku",
        codexModel: "gpt-5.6-terra",
        effort: "high",
      }),
    });

    const changes = detectConfigChanges(oldConfig, wizardResult);

    expect(changes.tuningChanges.get("web-developer")).toStrictEqual({
      from: "model haiku, effort high",
      to: "model haiku, codex model gpt-5.6-terra, effort high",
    });
  });

  it("names a Codex model pinned on a sub-agent resting on its defaults", () => {
    const oldConfig = buildProjectConfig({
      skills: [],
      agents: buildAgentConfigs(["web-developer"]),
    });
    const wizardResult = buildWizardResult([], {
      agentConfigs: buildAgentConfigs(["web-developer"], { codexModel: "gpt-5.6-luna" }),
    });

    const changes = detectConfigChanges(oldConfig, wizardResult);

    expect(changes.tuningChanges.get("web-developer")).toStrictEqual({
      from: "defaults",
      to: "codex model gpt-5.6-luna",
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
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "eject" }),
        ...buildSkillConfigs(["web-testing-vitest"]),
      ],
      agents: buildAgentConfigs(["web-developer"]),
    });
    const wizardResult = buildWizardResult(
      [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "agents-inc" }),
        ...buildSkillConfigs(["api-framework-hono"]),
      ],
      {
        agentConfigs: buildAgentConfigs(["web-developer", "api-developer"]),
      },
    );

    const changes = detectConfigChanges(oldConfig, wizardResult);

    expect(changes.addedSkills).toStrictEqual(["api-framework-hono"]);
    expect(changes.removedSkills).toStrictEqual(["web-testing-vitest"]);
    expect(changes.scopeChanges.get("web-framework-react")).toStrictEqual({
      from: "global",
      to: "project",
    });
    expect(changes.sourceChanges.get("web-framework-react")).toStrictEqual({
      from: "eject",
      to: "agents-inc",
    });
    expect(changes.addedAgents).toStrictEqual(["api-developer"]);
    expect(changes.removedAgents).toStrictEqual([]);
  });

  // A dual-scope addition yields an active project entry and a global tombstone; the active-only
  // diff would misread it as a G→P migration, so `fullEntries` classifies it.
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

    // Still a scope change: it drives the project-scope install and keeps hasAnyChanges true.
    expect(changes.scopeChanges.get("web-framework-react")).toStrictEqual({
      from: "global",
      to: "project",
    });
    // ...but flagged, so the summary renders it as a project-scope addition.
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

  /**
   * Measured against the removed half, a project plugin dropped over a global copy would read as a
   * switch to eject.
   */
  it("measures a collapsed pair's origin against the global install it masked", () => {
    const projectHalf = buildSkillConfigs(["web-framework-react"], {
      scope: "project",
      origin: DEFAULT_PUBLIC_SOURCE_NAME,
    });
    const maskedGlobal = buildSkillConfigs(["web-framework-react"], {
      scope: "global",
      origin: EJECT_SOURCE,
      excluded: true,
    });
    const resurfaced = buildSkillConfigs(["web-framework-react"], {
      scope: "global",
      origin: EJECT_SOURCE,
    });
    const oldConfig = buildProjectConfig({ skills: projectHalf, agents: [] });
    const fullEntries = {
      newSkills: resurfaced,
      oldSkills: [...projectHalf, ...maskedGlobal],
      newAgents: [],
      oldAgents: [],
    };

    const changes = detectConfigChanges(oldConfig, buildWizardResult(resurfaced), fullEntries);

    expect(changes.collapsedPairs).toStrictEqual([
      {
        projectHalf: firstElement(projectHalf),
        maskedGlobal: firstElement(maskedGlobal),
        folded: false,
      },
    ]);
    expect(
      changes.sourceChanges,
      "the global install keeps its mode, so nothing switched",
    ).toStrictEqual(new Map());
  });

  /** The config entry cannot tell `s` from the selection key; the wizard result can. */
  it("marks a collapsed pair folded when the wizard result says `s` folded it", () => {
    const projectHalf = buildSkillConfigs(["web-framework-react"], {
      scope: "project",
      origin: EJECT_SOURCE,
    });
    const maskedGlobal = buildSkillConfigs(["web-framework-react"], {
      scope: "global",
      origin: EJECT_SOURCE,
      excluded: true,
    });
    const folded = buildSkillConfigs(["web-framework-react"], {
      scope: "global",
      origin: EJECT_SOURCE,
    });
    const oldConfig = buildProjectConfig({ skills: projectHalf, agents: [] });
    const fullEntries = {
      newSkills: folded,
      oldSkills: [...projectHalf, ...maskedGlobal],
      newAgents: [],
      oldAgents: [],
    };

    const changes = detectConfigChanges(
      oldConfig,
      buildWizardResult(folded, { foldedSkillIds: ["web-framework-react"] }),
      fullEntries,
    );

    expect(changes.collapsedPairs).toStrictEqual([
      {
        projectHalf: firstElement(projectHalf),
        maskedGlobal: firstElement(maskedGlobal),
        folded: true,
      },
    ]);
  });

  it("reports a collapse that carries a new install mode as the global install's source change", () => {
    const projectHalf = buildSkillConfigs(["web-framework-react"], {
      scope: "project",
      origin: DEFAULT_PUBLIC_SOURCE_NAME,
    });
    const maskedGlobal = buildSkillConfigs(["web-framework-react"], {
      scope: "global",
      origin: EJECT_SOURCE,
      excluded: true,
    });
    const folded = buildSkillConfigs(["web-framework-react"], {
      scope: "global",
      origin: DEFAULT_PUBLIC_SOURCE_NAME,
    });
    const oldConfig = buildProjectConfig({ skills: projectHalf, agents: [] });
    const fullEntries = {
      newSkills: folded,
      oldSkills: [...projectHalf, ...maskedGlobal],
      newAgents: [],
      oldAgents: [],
    };

    const changes = detectConfigChanges(oldConfig, buildWizardResult(folded), fullEntries);

    expect(changes.sourceChanges).toStrictEqual(
      new Map([["web-framework-react", { from: EJECT_SOURCE, to: DEFAULT_PUBLIC_SOURCE_NAME }]]),
    );
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
    // Restored onto the same object in afterEach; binding would restore a wrapper.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored, not called
    origWrite = process.stdout.write;
    process.stdout.write = function (str: unknown): boolean {
      stdoutChunks.push(String(str));
      return true;
    };

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

    // G→P reads as an addition to the project.
    expect(output).toContain("+ React");
    expect(output).toContain("[G]");
    expect(output).toContain("[P]");
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

    mockRender.mockImplementation((element: ReactElement<Record<string, unknown>>) => {
      const onComplete = element.props.onComplete as ((result: unknown) => void) | undefined;
      if (onComplete) {
        // Dual-scope shape: active project entry + excluded global tombstone.
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
      return stubInkInstance();
    });

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    const output = stdoutChunks.join("");

    expect(output).toContain("+ React");
    expect(output).toContain("[P]");
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

    // P→G is a modification, not an addition.
    expect(output).toContain("~ React");
    expect(output).toContain("[P]");
    expect(output).toContain("[G]");
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

    mockRender.mockImplementation((element: ReactElement<Record<string, unknown>>) => {
      const onComplete = element.props.onComplete as ((result: unknown) => void) | undefined;
      if (onComplete) {
        onComplete(
          buildWizardResult([], {
            agentConfigs: buildAgentConfigs(["web-developer"]),
          }),
        );
      }
      return stubInkInstance();
    });

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    const output = stdoutChunks.join("");

    expect(output).toContain("React");
    expect(output).not.toContain("web-framework-react");
    expect(output).toContain("[P]");
  });

  it("should show display names and formatted source labels for source changes", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { origin: "eject" }),
        agents: buildAgentConfigs(["web-developer"]),
      }),
    );

    mockWizardCompletion(
      buildWizardResult(buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    const output = stdoutChunks.join("");

    expect(output).toContain("React");
    expect(output).not.toContain("web-framework-react");
    expect(output).toContain("Eject");
    expect(output).toContain("Agents Inc");
  });

  it("should show one ~ line for an install-mode switch, not a remove/add pair", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { origin: EJECT_SOURCE }),
        agents: buildAgentConfigs(["web-developer"]),
      }),
    );

    mockWizardCompletion(
      buildWizardResult(buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await Edit.run([], { root: CLI_ROOT }).catch(() => {});

    const output = stdoutChunks.join("");

    // A mode switch keeps the skill installed, so one `~` line rather than `-`/`+`.
    expect(output).toContain("~ React");
    expect(output).not.toContain("- React");
    expect(output).not.toContain("+ React");
  });
});
