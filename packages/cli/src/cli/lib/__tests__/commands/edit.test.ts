import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { ReactElement } from "react";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import os from "os";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import type { Errors } from "@oclif/core";
import { parseRefusal, runCliCommand, CLI_ROOT } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir, fileExists } from "../test-fs-utils";
import { useFakeHome } from "../helpers/isolated-home.js";
import { writeRawTestConfig } from "../helpers/config-io.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import {
  buildProjectConfig,
  buildSourceResult,
  buildInstallSelection,
  buildAgentConfigs,
} from "../factories/config-factories.js";
import { buildInstallation } from "../factories/installation-factories.js";
import { renderUnparseableConfigTs } from "../factories/unloadable-config-factories.js";
import { buildSeedPayload } from "../factories/seed-factories.js";
import { FULLSTACK_PAIR_MATRIX } from "../mock-data/mock-matrices";
import { EXIT_CODES } from "../../exit-codes";
import {
  CLAUDE_DIR,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EDITOR_URL,
  EJECT_SOURCE,
  STANDARD_DIRS,
} from "../../../consts";
import { ERROR_MESSAGES } from "../../../utils/messages";
import { getSkillById, initializeMatrix } from "../../matrix/matrix-provider";
import { hostAt } from "../../hosts/host-for.js";
import type { ProjectConfig, SkillId, SkillScope, StackAgentConfig } from "../../../types";
import type { InstallSelection } from "@workspace/compile/seed-to-config";
import type { getAgentDefinitions } from "../../agents/index.js";
import type { loadProjectConfig } from "../../configuration/index.js";
import type { detectInstallation, Installation } from "../../installation/index.js";
import type { loadSkillsMatrixFromSource } from "../../loading/index.js";
import type { discoverAllPluginSkills } from "../../plugins/index.js";
import type { copySkillsToLocalFlattened, deleteLocalSkill } from "../../skills/index.js";
import type { seedToInstallSelection } from "../../seed/seed-to-selection.js";
import type { ensureDir } from "../../../utils/fs.js";
import { firstElement } from "../helpers/element-at.js";
import { flattenCliOutput } from "../helpers/flatten-cli-output.js";
import { sa } from "../factories/skill-factories.js";
import { stubInkInstance } from "../helpers/stub-ink-instance.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import Edit, { migratePluginSkillScopes, detectConfigChanges } from "../../../commands/edit.js";
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
  mockSeedToInstallSelection,
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
  mockSeedToInstallSelection: vi.fn<typeof seedToInstallSelection>(),
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

// The apply path is under test, not the decode: `edit --from` is handed the selection each spec
// builds, whatever the served payload says.
vi.mock("../../seed/seed-to-selection.js", () => ({
  seedToInstallSelection: mockSeedToInstallSelection,
}));

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

const SEED_ID = "EditApply1";

/** `edit --from` decodes `selection`, and its confirm is answered yes. */
function applyingSelection(selection: InstallSelection): void {
  mockSeedToInstallSelection.mockReturnValue({
    result: selection,
    skippedSkillIds: [],
    skippedAgentNames: [],
  });
  mockRender.mockImplementation((element: ReactElement<Record<string, unknown>>) => {
    const onConfirm = element.props.onConfirm as (() => void) | undefined;
    onConfirm?.();
    return stubInkInstance();
  });
}

function runEditFrom(): Promise<unknown> {
  return Edit.run(["--from", SEED_ID], { root: CLI_ROOT });
}

const CONFIG_LOAD_FAILED_PHRASE = "could not be loaded";

const RECREATE_PHRASE = "recreate the configuration";

/** `edit --from` refuses to apply without a terminal, so the file stands at one. */
standAtTerminal();

useMockWorker();

beforeEach(() => {
  configMockServer.use(storedConfigHandlerFor(SEED_ID, buildSeedPayload()));
});

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

    it("rejects --source — edit loads the catalogue config.ts names", async () => {
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

  // `edit --from` from a project reads the global install, which must not be the real one.
  useFakeHome(() => tempDir);

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("should NOT report 'No changes made' when only agents are added", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({ agents: buildAgentConfigs(["web-developer"]), skills: EXISTING_SKILLS }),
    );

    applyingSelection(
      buildInstallSelection(EXISTING_SKILLS, {
        agentConfigs: buildAgentConfigs(["web-developer", "web-tester"]),
      }),
    );

    await runEditFrom().catch(() => {});

    // Reaching agent loading proves the command did not return early.
    expect(mockGetAgentDefinitions).toHaveBeenCalledTimes(1);
  });
});

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

  useFakeHome(() => tempDir);

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

    applyingSelection(
      buildInstallSelection(newLocalSkills, {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await runEditFrom().catch(() => {});

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

  const fakeHome = useFakeHome(() => tempDir);

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  function applyingRemoval(): void {
    applyingSelection(
      buildInstallSelection([], { agentConfigs: buildAgentConfigs(["web-developer"]) }),
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
    applyingRemoval();

    await runEditFrom().catch(() => {});

    // Removed from the project directory (cwd), not home.
    expect(mockDeleteLocalSkill).toHaveBeenCalledWith(
      process.cwd(),
      "web-framework-react",
      "project",
    );
  });

  // At the home root: from a project, `--from` holds every global entry it omits.
  it("deletes a deselected GLOBAL-scope eject skill's directory from the home dir", async () => {
    const globalAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
    process.chdir(fakeHome.dir);
    mockDetectInstallation.mockResolvedValue(buildEjectInstallation(fakeHome.dir));
    mockProjectConfig(
      fakeHome.dir,
      buildProjectConfig({
        agents: globalAgents,
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "eject" }),
      }),
    );
    applyingSelection(buildInstallSelection([], { agentConfigs: globalAgents }));

    await runEditFrom().catch(() => {});

    expect(mockDeleteLocalSkill).toHaveBeenCalledWith(
      fakeHome.dir,
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
    applyingRemoval();

    await runEditFrom().catch(() => {});

    expect(mockDeleteLocalSkill).not.toHaveBeenCalled();
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

  useFakeHome(() => tempDir);

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
    applyingSelection(
      buildInstallSelection(
        buildSkillConfigs(["web-framework-react"], { scope: "project", origin: MARKETPLACE }),
        { agentConfigs: AGENTS },
      ),
    );

    // `Errors.CLIError`, partial: only `oclif.exit` and `message` are asserted.
    let thrown: (Error & Partial<Errors.CLIError>) | undefined;
    try {
      await runEditFrom();
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
    applyingSelection(buildInstallSelection(PROJECT_EJECT_REACT, { agentConfigs: GLOBAL_AGENTS }));

    await runEditFrom().catch(() => {});

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

  it("uninstalls nothing when re-scoping from global to project", async () => {
    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global", to: "project" }],
    ]);
    const skills = buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" });

    await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(uninstallSpy.mock.calls).toStrictEqual([]);
    expect(installSpy.mock.calls).toStrictEqual([
      ["web-framework-react@agents-inc", "project", "/project"],
    ]);
  });

  it("judges each change by its own skill, not by the first one listed", async () => {
    const scopeChanges = new Map<SkillId, { from: SkillScope; to: SkillScope }>([
      ["web-framework-react", { from: "global", to: "project" }],
    ]);
    const skills = [
      ...buildSkillConfigs(["web-state-zustand"], { origin: EJECT_SOURCE }),
      ...buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
    ];

    const result = await migratePluginSkillScopes(scopeChanges, skills, "agents-inc", "/project");

    expect(result.migrated).toStrictEqual(["web-framework-react"]);
  });
});

describe("detectConfigChanges", () => {
  it("should detect added skills", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"]),
      agents: [],
    });
    const selection = buildInstallSelection(
      buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
    );

    const changes = detectConfigChanges(oldConfig, selection);

    expect(changes.addedSkills).toStrictEqual(["api-framework-hono"]);
    expect(changes.removedSkills).toStrictEqual([]);
  });

  it("should detect removed skills", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
      agents: [],
    });
    const selection = buildInstallSelection(buildSkillConfigs(["web-framework-react"]));

    const changes = detectConfigChanges(oldConfig, selection);

    expect(changes.removedSkills).toStrictEqual(["api-framework-hono"]);
    expect(changes.addedSkills).toStrictEqual([]);
  });

  it("should detect scope changes on skills", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      agents: [],
    });
    const selection = buildInstallSelection(
      buildSkillConfigs(["web-framework-react"], { scope: "project" }),
    );

    const changes = detectConfigChanges(oldConfig, selection);

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
    const selection = buildInstallSelection(
      buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
    );

    const changes = detectConfigChanges(oldConfig, selection);

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
    const selection = buildInstallSelection([], {
      agentConfigs: buildAgentConfigs(["api-developer"]),
    });

    const changes = detectConfigChanges(oldConfig, selection);

    expect(changes.addedAgents).toStrictEqual(["api-developer"]);
    expect(changes.removedAgents).toStrictEqual(["web-developer"]);
  });

  it("should detect agent scope changes", () => {
    const oldConfig = buildProjectConfig({
      skills: [],
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
    });
    const selection = buildInstallSelection([], {
      agentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
    });

    const changes = detectConfigChanges(oldConfig, selection);

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
    const selection = buildInstallSelection([], {
      agentConfigs: buildAgentConfigs(["web-developer"], {
        model: "haiku",
        codexModel: "gpt-5.6-terra",
        effort: "high",
      }),
    });

    const changes = detectConfigChanges(oldConfig, selection);

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
    const selection = buildInstallSelection([], {
      agentConfigs: buildAgentConfigs(["web-developer"], { codexModel: "gpt-5.6-luna" }),
    });

    const changes = detectConfigChanges(oldConfig, selection);

    expect(changes.tuningChanges.get("web-developer")).toStrictEqual({
      from: "defaults",
      to: "codex model gpt-5.6-luna",
    });
  });

  it("should return empty changes when configs are identical", () => {
    const skills = buildSkillConfigs(["web-framework-react"]);
    const agents = buildAgentConfigs(["web-developer"]);
    const oldConfig = buildProjectConfig({ skills, agents });
    const selection = buildInstallSelection(skills, { agentConfigs: agents });

    const changes = detectConfigChanges(oldConfig, selection);

    expect(changes.addedSkills).toStrictEqual([]);
    expect(changes.removedSkills).toStrictEqual([]);
    expect(changes.addedAgents).toStrictEqual([]);
    expect(changes.removedAgents).toStrictEqual([]);
    expect(changes.sourceChanges.size).toBe(0);
    expect(changes.scopeChanges.size).toBe(0);
    expect(changes.agentScopeChanges.size).toBe(0);
  });

  it("should treat null old config as empty (all skills/agents are additions)", () => {
    const selection = buildInstallSelection(
      buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
      {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      },
    );

    const changes = detectConfigChanges(null, selection);

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
    const selection = buildInstallSelection(
      [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "agents-inc" }),
        ...buildSkillConfigs(["api-framework-hono"]),
      ],
      {
        agentConfigs: buildAgentConfigs(["web-developer", "api-developer"]),
      },
    );

    const changes = detectConfigChanges(oldConfig, selection);

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
    const selection = buildInstallSelection(
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

    const changes = detectConfigChanges(oldConfig, selection, fullEntries);

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
    const selection = buildInstallSelection(
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

    const changes = detectConfigChanges(oldConfig, selection, fullEntries);

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

    const changes = detectConfigChanges(oldConfig, buildInstallSelection(resurfaced), fullEntries);

    expect(changes.collapsedPairs).toStrictEqual([
      {
        projectHalf: firstElement(projectHalf),
        maskedGlobal: firstElement(maskedGlobal),
      },
    ]);
    expect(
      changes.sourceChanges,
      "the global install keeps its mode, so nothing switched",
    ).toStrictEqual(new Map());
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

    const changes = detectConfigChanges(oldConfig, buildInstallSelection(folded), fullEntries);

    expect(changes.sourceChanges).toStrictEqual(
      new Map([["web-framework-react", { from: EJECT_SOURCE, to: DEFAULT_PUBLIC_SOURCE_NAME }]]),
    );
  });

  it("keeps a genuine G→P migration (no tombstone) out of the dual-scope set", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      agents: [],
    });
    const selection = buildInstallSelection(
      buildSkillConfigs(["web-framework-react"], { scope: "project" }),
    );
    const fullEntries = {
      newSkills: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
      oldSkills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      newAgents: [],
      oldAgents: [],
    };

    const changes = detectConfigChanges(oldConfig, selection, fullEntries);

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
    const selection = buildInstallSelection([], {
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

    const changes = detectConfigChanges(oldConfig, selection, fullEntries);

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
    const selection = buildInstallSelection(
      buildSkillConfigs(["web-framework-react"], { scope: "project" }),
    );

    const changes = detectConfigChanges(oldConfig, selection);

    expect(changes.scopeChanges.size).toBe(1);
    expect(changes.dualScopeSkillTransitions.size).toBe(0);
    expect(changes.dualScopeAgentTransitions.size).toBe(0);
  });

  it("keeps a G→P move a migration when the tombstone beside it is another skill's", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      agents: [],
    });
    const movedReact = buildSkillConfigs(["web-framework-react"], { scope: "project" });
    const fullEntries = {
      newSkills: [
        ...movedReact,
        ...buildSkillConfigs(["web-state-zustand"], { scope: "global", excluded: true }),
      ],
      oldSkills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      newAgents: [],
      oldAgents: [],
    };

    const changes = detectConfigChanges(oldConfig, buildInstallSelection(movedReact), fullEntries);

    expect(changes.dualScopeSkillTransitions).toStrictEqual(new Set());
  });

  it("keeps a G→P move a migration when the global entry beside it is still installed", () => {
    const oldConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      agents: [],
    });
    const bothScopes = [
      ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
      ...buildSkillConfigs(["web-framework-react"], { scope: "global" }),
    ];
    const fullEntries = {
      newSkills: bothScopes,
      oldSkills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      newAgents: [],
      oldAgents: [],
    };

    const changes = detectConfigChanges(oldConfig, buildInstallSelection(bothScopes), fullEntries);

    expect(changes.dualScopeSkillTransitions).toStrictEqual(new Set());
  });

  it("reads a collapsed pair's halves off its own skill among others", () => {
    const zustand = buildSkillConfigs(["web-state-zustand"], { scope: "project" });
    const projectHalf = buildSkillConfigs(["web-framework-react"], { scope: "project" });
    const maskedGlobal = buildSkillConfigs(["web-framework-react"], {
      scope: "global",
      excluded: true,
    });
    const resurfaced = buildSkillConfigs(["web-framework-react"], { scope: "global" });
    const oldConfig = buildProjectConfig({ skills: [...zustand, ...projectHalf], agents: [] });
    const fullEntries = {
      newSkills: [...zustand, ...resurfaced],
      oldSkills: [...zustand, ...projectHalf, ...maskedGlobal],
      newAgents: [],
      oldAgents: [],
    };

    const changes = detectConfigChanges(
      oldConfig,
      buildInstallSelection([...zustand, ...resurfaced]),
      fullEntries,
    );

    expect(changes.collapsedPairs).toStrictEqual([
      { projectHalf: firstElement(projectHalf), maskedGlobal: firstElement(maskedGlobal) },
    ]);
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

  useFakeHome(() => tempDir);

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

    applyingSelection(
      buildInstallSelection(buildSkillConfigs(["web-framework-react"], { scope: "project" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await runEditFrom().catch(() => {});

    const output = stdoutChunks.join("");

    expect(output).toContain("+ React [P]");
    expect(output).not.toContain("+ web-framework-react");
  });

  it("should show scope labels [G]/[P] on added skill lines", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({ skills: [], agents: buildAgentConfigs(["web-developer"]) }),
    );

    applyingSelection(
      buildInstallSelection(buildSkillConfigs(["web-framework-react"], { scope: "global" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await runEditFrom().catch(() => {});

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

    applyingSelection(
      buildInstallSelection(buildSkillConfigs(["web-framework-react"], { scope: "project" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await runEditFrom().catch(() => {});

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

    // Dual-scope shape: active project entry + excluded global tombstone.
    applyingSelection(
      buildInstallSelection(
        [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
        ],
        { agentConfigs: buildAgentConfigs(["web-developer"]) },
      ),
    );

    await runEditFrom().catch(() => {});

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

    applyingSelection(
      buildInstallSelection(buildSkillConfigs(["web-framework-react"], { scope: "global" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await runEditFrom().catch(() => {});

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

    applyingSelection(
      buildInstallSelection([], {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await runEditFrom().catch(() => {});

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

    applyingSelection(
      buildInstallSelection(buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await runEditFrom().catch(() => {});

    const output = stdoutChunks.join("");

    expect(output).toContain("~ React (Eject → Agents Inc)");
    expect(output).not.toContain("~ web-framework-react");
  });

  it("should show one ~ line for an install-mode switch, not a remove/add pair", async () => {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { origin: EJECT_SOURCE }),
        agents: buildAgentConfigs(["web-developer"]),
      }),
    );

    applyingSelection(
      buildInstallSelection(buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }), {
        agentConfigs: buildAgentConfigs(["web-developer"]),
      }),
    );

    await runEditFrom().catch(() => {});

    const output = stdoutChunks.join("");

    // A mode switch keeps the skill installed, so one `~` line rather than `-`/`+`.
    expect(output).toContain("~ React");
    expect(output).not.toContain("- React");
    expect(output).not.toContain("+ React");
  });

  it("drops the project half of a collapsed ejected pair and leaves the global copy as it was", async () => {
    const skillPath = (root: string) =>
      path.join(root, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "web-framework-react", "SKILL.md");
    const home = os.homedir();
    for (const [root, content] of [
      [projectDir, "the project's copy"],
      [home, "the global copy"],
    ] as const) {
      await mkdir(path.dirname(skillPath(root)), { recursive: true });
      await writeFile(skillPath(root), content);
    }
    const projectHalf = buildSkillConfigs(["web-framework-react"], {
      scope: "project",
      origin: EJECT_SOURCE,
    });
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        skills: [
          ...projectHalf,
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: EJECT_SOURCE,
            excluded: true,
          }),
        ],
      }),
    );
    mockDeleteLocalSkill.mockClear();
    applyingSelection(
      buildInstallSelection(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: EJECT_SOURCE }),
        { agentConfigs: buildAgentConfigs(["web-developer"]) },
      ),
    );

    await runEditFrom().catch(() => {});

    expect(stdoutChunks.join("")).toContain("Changes:\n  - React [P]\n\n");
    expect(stdoutChunks.join("")).toContain("\nNo agents to recompile\n");
    expect(await readFile(skillPath(home), "utf-8")).toBe("the global copy");
    expect(mockDeleteLocalSkill.mock.calls).toStrictEqual([
      [projectDir, "web-framework-react", "project"],
    ]);
  });

  describe("an edit that changes one kind of thing only", () => {
    const INSTALLED_SKILLS = buildSkillConfigs(["web-framework-react"]);
    const REACT_FOR_WEB_DEVELOPER: ProjectConfig["stack"] = {
      "web-developer": { "web-framework": [{ id: "web-framework-react", preloaded: false }] },
    };

    async function outputOfApplying(selection: InstallSelection): Promise<string> {
      applyingSelection(selection);
      await runEditFrom().catch(() => {});
      return stdoutChunks.join("");
    }

    it("says nothing changed when the configuration is the one installed", async () => {
      mockProjectConfig(projectDir, buildProjectConfig({ skills: INSTALLED_SKILLS }));

      const output = await outputOfApplying(
        buildInstallSelection(INSTALLED_SKILLS, {
          agentConfigs: buildAgentConfigs(["web-developer"]),
        }),
      );

      expect(output).toContain("No changes made.");
      expect(output).not.toContain("Changes:");
    });

    it("applies a sub-agent dropped and nothing else", async () => {
      mockProjectConfig(
        projectDir,
        buildProjectConfig({
          skills: INSTALLED_SKILLS,
          agents: buildAgentConfigs(["web-developer", "api-developer"]),
        }),
      );

      const output = await outputOfApplying(
        buildInstallSelection(INSTALLED_SKILLS, {
          agentConfigs: buildAgentConfigs(["web-developer"]),
        }),
      );

      expect(output).toContain("Changes:\n  - api-developer (agent)\n\n");
    });

    it("applies a sub-agent moved to the global install and nothing else", async () => {
      mockProjectConfig(projectDir, buildProjectConfig({ skills: INSTALLED_SKILLS }));

      const output = await outputOfApplying(
        buildInstallSelection(INSTALLED_SKILLS, {
          agentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
        }),
      );

      expect(output).toContain("Into the global install:\n  Sub-agents:\n    web-developer\n");
      expect(output).toContain("Changes:\n  ~ web-developer ([P] → [G])\n\n");
    });

    it("applies a sub-agent retuned and nothing else", async () => {
      mockProjectConfig(projectDir, buildProjectConfig({ skills: INSTALLED_SKILLS }));

      const output = await outputOfApplying(
        buildInstallSelection(INSTALLED_SKILLS, {
          agentConfigs: buildAgentConfigs(["web-developer"], { model: "opus" }),
        }),
      );

      expect(output).toContain("Changes:\n  ~ web-developer (agent: defaults → model opus)\n\n");
    });

    it("applies a sub-agent added to the project over its global install as a project add", async () => {
      mockProjectConfig(
        projectDir,
        buildProjectConfig({
          skills: INSTALLED_SKILLS,
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        }),
      );

      const output = await outputOfApplying(
        buildInstallSelection(INSTALLED_SKILLS, {
          agentConfigs: [
            ...buildAgentConfigs(["web-developer"], { scope: "project" }),
            ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
          ],
        }),
      );

      expect(output).toContain("Into this project:\n  Sub-agents:\n    web-developer\n");
      expect(output).toContain("Changes:\n  + web-developer [P] (agent)\n\n");
    });

    it("labels a skill added beside a skill of the other scope with its own scope", async () => {
      mockProjectConfig(projectDir, buildProjectConfig({ skills: INSTALLED_SKILLS }));

      const output = await outputOfApplying(
        buildInstallSelection(
          [...INSTALLED_SKILLS, ...buildSkillConfigs(["api-framework-hono"], { scope: "global" })],
          { agentConfigs: buildAgentConfigs(["web-developer"]) },
        ),
      );

      expect(output).toContain("Changes:\n  + Hono [G]\n\n");
    });

    it("labels a skill removed beside a skill of the other scope with its own scope", async () => {
      mockProjectConfig(
        projectDir,
        buildProjectConfig({
          skills: [
            ...INSTALLED_SKILLS,
            ...buildSkillConfigs(["api-framework-hono"], { scope: "global" }),
          ],
        }),
      );

      const output = await outputOfApplying(
        buildInstallSelection(INSTALLED_SKILLS, {
          agentConfigs: buildAgentConfigs(["web-developer"]),
        }),
      );

      expect(output).toContain("Changes:\n  - Hono [G]\n\n");
    });

    it("applies a sub-agent's skills reassigned and nothing else", async () => {
      mockProjectConfig(
        projectDir,
        buildProjectConfig({ skills: INSTALLED_SKILLS, stack: REACT_FOR_WEB_DEVELOPER }),
      );

      const output = await outputOfApplying(
        buildInstallSelection(INSTALLED_SKILLS, {
          agentConfigs: buildAgentConfigs(["web-developer"]),
        }),
      );

      expect(output).toContain("Changes:\n  ~ web-developer (agent: skills reassigned)\n\n");
    });
  });
});

describe("what edit --from does to plugins and saved copies", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;
  let stdoutChunks: string[] = [];
  let stderrChunks: string[] = [];
  let outputSpies: MockInstance[] = [];

  const MARKETPLACE = "agents-inc";
  const REACT_PLUGIN = "web-framework-react@agents-inc";
  const HONO_PLUGIN = "api-framework-hono@agents-inc";
  const UNRESOLVABLE_SOURCE = "/test/source";
  const AGENTS = buildAgentConfigs(["web-developer"]);
  const host = hostAt("/any-root");
  const installSpy = vi.mocked(host.installPlugin);
  const uninstallSpy = vi.mocked(host.uninstallPlugin);

  /** Built per test: resolving a marketplace writes the name it found onto the result. */
  const withMarketplace = () =>
    buildSourceResult(FULLSTACK_PAIR_MATRIX, UNRESOLVABLE_SOURCE, { marketplace: MARKETPLACE });
  /** Nothing at `/test/source` names a marketplace, so resolving one fails. */
  const withoutMarketplace = () => buildSourceResult(FULLSTACK_PAIR_MATRIX, UNRESOLVABLE_SOURCE);

  const refusedForWantOfAMarketplace = (purpose: string) =>
    `Cannot ${purpose}: marketplace could not be resolved from '${UNRESOLVABLE_SOURCE}'. Plugin install mode requires a marketplace — fix the marketplace or switch the affected skills to eject mode.`;

  const skillFileAt = (root: string) =>
    path.join(root, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "web-framework-react", "SKILL.md");

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-apply-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);

    stdoutChunks = [];
    stderrChunks = [];
    outputSpies = [
      vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
        stdoutChunks.push(String(chunk));
        return true;
      }),
      vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
        stderrChunks.push(String(chunk));
        return true;
      }),
    ];

    mockRender.mockClear();
    mockDeleteLocalSkill.mockReset().mockResolvedValue(undefined);
    mockCopySkillsToLocalFlattened.mockReset().mockResolvedValue([]);
    mockDetectInstallation.mockResolvedValue(buildEjectInstallation(projectDir));
    mockDiscoverAllPluginSkills.mockResolvedValue({});
    installSpy.mockReset().mockResolvedValue(undefined);
    uninstallSpy.mockReset().mockResolvedValue("removed");
    vi.mocked(host.marketplaceExists).mockReset().mockResolvedValue(true);
    vi.mocked(host.refreshMarketplace).mockReset().mockResolvedValue(undefined);
    initializeMatrix(FULLSTACK_PAIR_MATRIX);
  });

  const fakeHome = useFakeHome(() => tempDir);

  afterEach(async () => {
    for (const spy of outputSpies) spy.mockRestore();
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  function installed(
    skills: ProjectConfig["skills"],
    agents: ProjectConfig["agents"] = AGENTS,
  ): void {
    mockProjectConfig(
      projectDir,
      buildProjectConfig({ skills, agents, stack: onWebDeveloper(skills) }),
    );
  }

  /** Runs `edit --from` over the selection, answered yes, and returns what it threw. */
  async function applying(
    sourceResult: ReturnType<typeof buildSourceResult>,
    skills: InstallSelection["skills"],
    agentConfigs: InstallSelection["agentConfigs"] = AGENTS,
  ): Promise<(Error & Partial<Errors.CLIError>) | undefined> {
    mockLoadSkillsMatrixFromSource.mockResolvedValue(sourceResult);
    applyingSelection(
      buildInstallSelection(skills, {
        agentConfigs,
        selectedAgents: agentConfigs.map((agent) => agent.name),
        assignedStack: onWebDeveloper(skills),
      }),
    );
    try {
      await runEditFrom();
      return undefined;
    } catch (error) {
      if (error instanceof Error) return error;
      throw error;
    }
  }

  /** Each active skill on web-developer under its own category, so none is left unassigned. */
  function onWebDeveloper(skills: InstallSelection["skills"]): InstallSelection["assignedStack"] {
    const rows = skills
      .filter((skill) => !skill.excluded)
      .map((skill): StackAgentConfig => ({ [getSkillById(skill.id).category]: [sa(skill.id)] }));
    return { "web-developer": rows.reduce((stack, row) => ({ ...stack, ...row }), {}) };
  }

  const stderr = () => flattenCliOutput(stderrChunks.join(""));

  const plugin = (ids: SkillId[], scope: SkillScope, extra?: { excluded: boolean }) =>
    buildSkillConfigs(ids, { scope, origin: MARKETPLACE, ...extra });
  const saved = (ids: SkillId[], scope: SkillScope) =>
    buildSkillConfigs(ids, { scope, origin: EJECT_SOURCE });

  describe("a plugin skill moved between scopes", () => {
    it("uninstalls it here and installs it globally", async () => {
      installed(plugin(["web-framework-react"], "project"));

      const error = await applying(withMarketplace(), plugin(["web-framework-react"], "global"));

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain("Changes:\n  ~ React ([P] → [G])\n\n");
      expect(uninstallSpy.mock.calls).toStrictEqual([[REACT_PLUGIN, "project", projectDir]]);
      expect(installSpy.mock.calls).toStrictEqual([[REACT_PLUGIN, "global", projectDir]]);
      expect(stderr()).toBe("");
    });

    it("moves the one that moved when a saved copy that stays is listed first", async () => {
      installed([
        ...saved(["web-framework-react"], "project"),
        ...plugin(["api-framework-hono"], "project"),
      ]);

      const error = await applying(withMarketplace(), [
        ...saved(["web-framework-react"], "project"),
        ...plugin(["api-framework-hono"], "global"),
      ]);

      expect(error).toBeUndefined();
      expect(uninstallSpy.mock.calls).toStrictEqual([[HONO_PLUGIN, "project", projectDir]]);
      expect(installSpy.mock.calls).toStrictEqual([[HONO_PLUGIN, "global", projectDir]]);
      expect(stderr()).toBe("");
    });

    it("refuses when no marketplace can be resolved, and writes nothing", async () => {
      installed(plugin(["web-framework-react"], "project"));

      const error = await applying(withoutMarketplace(), plugin(["web-framework-react"], "global"));

      expect(error?.message).toBe(refusedForWantOfAMarketplace("migrate plugin skill scopes"));
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(installSpy).not.toHaveBeenCalled();
      expect(await configsWrittenUnder(projectDir)).toStrictEqual([]);
    });

    it("names the skill whose install at the new scope failed, and exits with failures", async () => {
      installed(plugin(["web-framework-react"], "project"));
      installSpy.mockRejectedValue(new Error("plugin ref not found"));

      const error = await applying(withMarketplace(), plugin(["web-framework-react"], "global"));

      expect(stdoutChunks.join("")).toContain(
        [
          "Completed with 1 failure(s) — the changes above landed, these did not:",
          "  Failed to migrate plugin scope for web-framework-react: plugin ref not found",
          "    Run 'npx agents-inc doctor' to see what this installation is left holding.",
        ].join("\n"),
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
    });
  });

  describe("a saved copy moved between scopes", () => {
    it("carries its files to the global install without a marketplace, beside a plugin listed first", async () => {
      await mkdir(path.dirname(skillFileAt(projectDir)), { recursive: true });
      await writeFile(skillFileAt(projectDir), "the saved copy");
      installed([
        ...plugin(["api-framework-hono"], "project"),
        ...saved(["web-framework-react"], "project"),
      ]);

      const error = await applying(withoutMarketplace(), [
        ...plugin(["api-framework-hono"], "project"),
        ...saved(["web-framework-react"], "global"),
      ]);

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain("Changes:\n  ~ React ([P] → [G])\n\n");
      expect(await readFile(skillFileAt(fakeHome.dir), "utf-8")).toBe("the saved copy");
      expect(await fileExists(skillFileAt(projectDir))).toBe(false);
    });
  });

  describe("a collapsed [P][G] pair of plugins", () => {
    const projectHalfOverGlobal = [
      ...plugin(["web-framework-react"], "project"),
      ...plugin(["web-framework-react"], "global", { excluded: true }),
    ];

    it("uninstalls the project's plugin and leaves the global one installed", async () => {
      installed(projectHalfOverGlobal);

      const error = await applying(withMarketplace(), plugin(["web-framework-react"], "global"));

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain("Changes:\n  - React [P]\n\n");
      expect(stdoutChunks.join("")).toContain("\nRemoved 1 plugin(s)\n");
      expect(uninstallSpy.mock.calls).toStrictEqual([[REACT_PLUGIN, "project", projectDir]]);
      expect(installSpy).not.toHaveBeenCalled();
      expect(mockDeleteLocalSkill).not.toHaveBeenCalled();
    });

    it("warns of the project plugin it could not uninstall, and claims no removal", async () => {
      installed(projectHalfOverGlobal);
      uninstallSpy.mockRejectedValue(new Error("uninstall refused"));

      const error = await applying(withMarketplace(), plugin(["web-framework-react"], "global"));

      expect(error).toBeUndefined();
      expect(stderr()).toContain(
        "Warning: Failed to uninstall plugin web-framework-react: uninstall refused",
      );
      expect(stdoutChunks.join("")).not.toContain("Removed 0 plugin(s)");
    });

    it("warns that the project plugin stays when no marketplace is known", async () => {
      installed(projectHalfOverGlobal);

      const error = await applying(withoutMarketplace(), plugin(["web-framework-react"], "global"));

      expect(error).toBeUndefined();
      expect(stderr()).toContain(
        "Warning: Could not uninstall this project's plugin for web-framework-react: no marketplace",
      );
      expect(uninstallSpy).not.toHaveBeenCalled();
    });
  });

  describe("a skill the configuration adds or drops", () => {
    it("uninstalls a dropped plugin listed after a saved copy that stays", async () => {
      installed([
        ...saved(["web-framework-react"], "project"),
        ...plugin(["api-framework-hono"], "project"),
      ]);

      const error = await applying(withMarketplace(), saved(["web-framework-react"], "project"));

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain("\nRemoved 1 plugin(s)\n");
      expect(uninstallSpy.mock.calls).toStrictEqual([[HONO_PLUGIN, "project", projectDir]]);
      expect(mockDeleteLocalSkill).not.toHaveBeenCalled();
    });

    it("warns of a dropped plugin it could not uninstall, and claims no removal", async () => {
      installed(plugin(["api-framework-hono"], "project"));
      uninstallSpy.mockRejectedValue(new Error("uninstall refused"));

      const error = await applying(withMarketplace(), []);

      expect(error).toBeUndefined();
      expect(stderr()).toContain(
        "Warning: Failed to uninstall plugin api-framework-hono: uninstall refused",
      );
      expect(stdoutChunks.join("")).not.toContain("Removed 0 plugin(s)");
    });

    it("refuses to add a plugin when no marketplace can be resolved", async () => {
      installed([]);

      const error = await applying(withoutMarketplace(), plugin(["api-framework-hono"], "project"));

      expect(error?.message).toBe(
        refusedForWantOfAMarketplace("install or uninstall plugin skills"),
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(await configsWrittenUnder(projectDir)).toStrictEqual([]);
    });

    it("deletes a dropped saved copy listed after a plugin that stays", async () => {
      installed([
        ...plugin(["api-framework-hono"], "project"),
        ...saved(["web-framework-react"], "project"),
      ]);

      const error = await applying(withMarketplace(), plugin(["api-framework-hono"], "project"));

      expect(error).toBeUndefined();
      expect(mockDeleteLocalSkill.mock.calls).toStrictEqual([
        [projectDir, "web-framework-react", "project"],
      ]);
      expect(uninstallSpy).not.toHaveBeenCalled();
    });
  });

  describe("a skill switched between a plugin and a saved copy", () => {
    it("refuses to switch a saved copy to a plugin when no marketplace can be resolved, keeping the copy", async () => {
      installed(saved(["web-framework-react"], "project"));

      const error = await applying(
        withoutMarketplace(),
        plugin(["web-framework-react"], "project"),
      );

      expect(error?.message).toBe(refusedForWantOfAMarketplace("migrate skills to plugin mode"));
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(mockDeleteLocalSkill).not.toHaveBeenCalled();
      expect(await configsWrittenUnder(projectDir)).toStrictEqual([]);
    });

    it("deletes no local copy when a plugin skill only changes marketplace", async () => {
      installed(plugin(["web-framework-react"], "project"));

      const error = await applying(
        withMarketplace(),
        buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "acme" }),
      );

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain("Changes:\n  ~ React (Agents Inc → acme)\n\n");
      expect(mockDeleteLocalSkill).not.toHaveBeenCalled();
    });

    it("keeps the global copy of a skill switched to a project plugin", async () => {
      installed(saved(["web-framework-react"], "global"));

      const error = await applying(withMarketplace(), plugin(["web-framework-react"], "project"));

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain("Switching 1 skill(s) to Plugin (native install)");
      expect(mockDeleteLocalSkill).not.toHaveBeenCalled();
    });

    it("warns of the plugin it could not uninstall once the saved copy landed", async () => {
      installed(plugin(["web-framework-react"], "project"));
      mockCopySkillsToLocalFlattened.mockResolvedValue([
        {
          skillId: "web-framework-react",
          sourcePath: "/test/source/web-framework-react",
          destPath: path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "web-framework-react"),
          contentHash: "hash-switched",
        },
      ]);
      uninstallSpy.mockRejectedValue(new Error("uninstall refused"));

      const error = await applying(withMarketplace(), saved(["web-framework-react"], "project"));

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain("\nCopied 1 local skill(s)\n");
      expect(stderr()).toContain(
        "Warning: Could not uninstall plugin for web-framework-react: uninstall refused",
      );
    });

    it("refuses when the saved copy cannot be written, naming the skill and writing no config", async () => {
      installed(plugin(["web-framework-react"], "project"));
      mockCopySkillsToLocalFlattened.mockRejectedValue(new Error("EACCES: permission denied"));

      const error = await applying(withMarketplace(), saved(["web-framework-react"], "project"));

      expect(stderr()).toContain(
        "Warning: Failed to copy web-framework-react for eject: EACCES: permission denied",
      );
      expect(error?.message).toBe(
        "Failed to copy 1 skill(s) for eject. Eject intent could not be honored. Check that the destination skills directory is writable, then apply the same id again with 'npx agents-inc edit --from <id>' — or switch the affected skills back to plugin mode.",
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(uninstallSpy).not.toHaveBeenCalled();
      expect(await configsWrittenUnder(projectDir)).toStrictEqual([]);
    });
  });

  describe("a [P][G] pair", () => {
    it("adds a skill over its global install as one project add", async () => {
      installed(saved(["web-framework-react"], "global"));

      const error = await applying(withMarketplace(), [
        ...saved(["web-framework-react"], "project"),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: EJECT_SOURCE,
          excluded: true,
        }),
      ]);

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toBe(
        [
          "Fetching configuration EditApply1...",
          "Into this project:",
          "  Skills:",
          "    React (web-framework-react)",
          "",
          "Changes:",
          "  + React [P]",
          "",
          "No agents to recompile",
          "",
          "✓ Done",
          "",
          "",
        ].join("\n"),
      );
    });

    it("collapses a sub-agent's pair into its global install, listing no arrival", async () => {
      const skills = saved(["web-framework-react"], "project");
      installed(skills, [
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
        ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
      ]);

      const error = await applying(
        withMarketplace(),
        skills,
        buildAgentConfigs(["web-developer"], { scope: "global" }),
      );

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toBe(
        [
          "Fetching configuration EditApply1...",
          "",
          "Changes:",
          "  - web-developer [P] (agent)",
          "",
          "No agents to recompile",
          "",
          "✓ Done",
          "",
          "",
        ].join("\n"),
      );
    });
  });
});
