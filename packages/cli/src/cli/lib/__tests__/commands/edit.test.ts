import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import type { ReactElement } from "react";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import os from "os";
import path from "path";
import { mkdir } from "fs/promises";
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
import { initializeMatrix } from "../../matrix/matrix-provider";
import { hostAt } from "../../hosts/host-for.js";
import type { ProjectConfig, SkillId, SkillScope } from "../../../types";
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
import { stubInkInstance } from "../helpers/stub-ink-instance.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
import { useMockWorker } from "../helpers/mock-worker.js";
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
});
