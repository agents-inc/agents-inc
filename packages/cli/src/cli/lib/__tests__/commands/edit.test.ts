import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { ReactElement } from "react";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import os from "os";
import path from "path";
import { mkdir, readFile } from "fs/promises";
import type { Errors } from "@oclif/core";
import { parseRefusal, runCliCommand, CLI_ROOT } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir, fileExists } from "../test-fs-utils";
import { useFakeHome } from "../helpers/isolated-home.js";
import { readTestTsConfig, writeRawTestConfig } from "../helpers/config-io.js";
import { writeTestSkill } from "../helpers/disk-writers.js";
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
  EDITOR_URL,
  EJECT_SOURCE,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../../consts";
import { ERROR_MESSAGES } from "../../../utils/messages";
import { getSkillById, initializeMatrix } from "../../matrix/matrix-provider";
import { hostAt } from "../../hosts/host-for.js";
import type { ProjectConfig, SkillId, SkillScope, StackAgentConfig } from "../../../types";
import type { InstallSelection } from "@workspace/compile/seed-to-config";
import type { getLocalAgentDefinitions } from "../../agents/index.js";
import type { loadProjectConfig } from "../../configuration/index.js";
import type { detectInstallation, Installation } from "../../installation/index.js";
import type { loadSkillsMatrixFromSource } from "../../loading/index.js";
import type { discoverAllPluginSkills } from "../../plugins/index.js";
import type { copySkillsToLocalFlattened } from "../../skills/index.js";
import type { seedToInstallSelection } from "../../seed/seed-to-selection.js";
import type { ensureDir } from "../../../utils/fs.js";
import { flattenCliOutput } from "../helpers/flatten-cli-output.js";
import { sa } from "../factories/skill-factories.js";
import { stubInkInstance } from "../helpers/stub-ink-instance.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import Edit from "../../../commands/edit.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";

const {
  mockRender,
  mockDetectInstallation,
  mockLoadSkillsMatrixFromSource,
  mockLoadProjectConfig,
  mockDiscoverAllPluginSkills,
  mockCopySkillsToLocalFlattened,
  mockEnsureDir,
  mockGetLocalAgentDefinitions,
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
  // An empty array is a copy that did nothing; `undefined` would stop the command.
  mockCopySkillsToLocalFlattened: vi.fn<typeof copySkillsToLocalFlattened>().mockResolvedValue([]),
  mockEnsureDir: vi.fn<typeof ensureDir>().mockResolvedValue(undefined),
  mockGetLocalAgentDefinitions: vi.fn<typeof getLocalAgentDefinitions>().mockResolvedValue({
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
    getLocalAgentDefinitions: mockGetLocalAgentDefinitions,
  };
});

vi.mock("../../skills/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../skills/index.js")>();
  return {
    ...original,
    copySkillsToLocalFlattened: mockCopySkillsToLocalFlattened,
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

/** React's `SKILL.md` in the skills folder under `root` — a project, or home for the global install. */
function savedCopyAt(root: string): string {
  return path.join(
    root,
    CLAUDE_DIR,
    STANDARD_DIRS.SKILLS,
    "web-framework-react",
    STANDARD_FILES.SKILL_MD,
  );
}

/** Carries `forkedFrom`, as an ejected copy does: a folder without it is the user's own work. */
async function writeSavedCopy(root: string, content: string): Promise<void> {
  await writeTestSkill(path.join(root, CLAUDE_DIR, STANDARD_DIRS.SKILLS), "web-framework-react", {
    skillContent: content,
    extraMetadata: {
      forkedFrom: {
        skillId: "web-framework-react",
        contentHash: "abc1234",
        date: "2026-01-01",
        source: "/test/source",
      },
    },
  });
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
    agentsOnlySkippedSkillsCarried: [],
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
    await writeSavedCopy(projectDir, "the project's copy");
    await writeSavedCopy(fakeHome.dir, "the global copy");
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "eject" }),
      }),
    );
    applyingRemoval();

    await runEditFrom().catch(() => {});

    expect(await fileExists(savedCopyAt(projectDir))).toBe(false);
    expect(await readFile(savedCopyAt(fakeHome.dir), "utf-8")).toBe("the global copy");
  });

  // At the home root: from a project, `--from` holds every global entry it omits.
  it("deletes a deselected GLOBAL-scope eject skill's directory from the home dir", async () => {
    const globalAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
    process.chdir(fakeHome.dir);
    await writeSavedCopy(fakeHome.dir, "the global copy");
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

    expect(await fileExists(savedCopyAt(fakeHome.dir))).toBe(false);
  });

  it("does NOT delete a directory for a deselected plugin-mode skill (handled by plugin uninstall)", async () => {
    await writeSavedCopy(projectDir, "a folder of the same name");
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

    expect(await readFile(savedCopyAt(projectDir), "utf-8")).toBe("a folder of the same name");
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
    await writeSavedCopy(projectDir, "the ejected copy");
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
      await readFile(savedCopyAt(projectDir), "utf-8"),
      "the ejected working copy must survive a migration whose plugin install failed",
    ).toBe("the ejected copy");
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

    const stderr = stderrChunks.join("");
    expect(stderr).toContain(ASSIGNED_TO_NO_AGENT_PHRASE);
    expect(stderr).toContain("web-framework-react");
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
    const home = os.homedir();
    await writeSavedCopy(projectDir, "the project's copy");
    await writeSavedCopy(home, "the global copy");
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
    applyingSelection(
      buildInstallSelection(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: EJECT_SOURCE }),
        { agentConfigs: buildAgentConfigs(["web-developer"]) },
      ),
    );

    await runEditFrom().catch(() => {});

    expect(stdoutChunks.join("")).toContain("Changes:\n  - React [P]\n\n");
    expect(stdoutChunks.join("")).toContain("\nNo agents to recompile\n");
    expect(await readFile(savedCopyAt(home), "utf-8")).toBe("the global copy");
    expect(await fileExists(savedCopyAt(projectDir))).toBe(false);
  });

  it("drops only the collapsed pair's own project half when another skill is listed first", async () => {
    const home = os.homedir();
    await writeSavedCopy(projectDir, "the project's copy");
    await writeSavedCopy(home, "the global copy");
    const hono = buildSkillConfigs(["api-framework-hono"], {
      scope: "project",
      origin: EJECT_SOURCE,
    });
    mockProjectConfig(
      projectDir,
      buildProjectConfig({
        skills: [
          ...hono,
          ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: EJECT_SOURCE }),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: EJECT_SOURCE,
            excluded: true,
          }),
        ],
      }),
    );
    applyingSelection(
      buildInstallSelection(
        [
          ...hono,
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: EJECT_SOURCE }),
        ],
        { agentConfigs: buildAgentConfigs(["web-developer"]) },
      ),
    );

    await runEditFrom().catch(() => {});

    expect(stdoutChunks.join("")).toContain("Changes:\n  - React [P]\n\n");
    expect(await readFile(savedCopyAt(home), "utf-8")).toBe("the global copy");
    expect(await fileExists(savedCopyAt(projectDir))).toBe(false);
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

      expect(output).toContain("Into the global install:\n  Sub-agents:\n    web-developer\n\n");
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

      expect(output).toContain("Into this project:\n  Sub-agents:\n    web-developer\n\n");
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

    it("applies a sub-agent added and nothing else", async () => {
      mockProjectConfig(projectDir, buildProjectConfig({ skills: INSTALLED_SKILLS }));

      const output = await outputOfApplying(
        buildInstallSelection(INSTALLED_SKILLS, {
          agentConfigs: buildAgentConfigs(["web-developer", "web-tester"]),
        }),
      );

      expect(output).toContain("Changes:\n  + web-tester (agent)\n\n");
      expect(output).not.toContain("No changes made.");
    });

    it("applies a Codex model pinned beside a sub-agent's other tuning, and nothing else", async () => {
      mockProjectConfig(
        projectDir,
        buildProjectConfig({
          skills: INSTALLED_SKILLS,
          agents: buildAgentConfigs(["web-developer"], { model: "haiku", effort: "high" }),
        }),
      );

      const output = await outputOfApplying(
        buildInstallSelection(INSTALLED_SKILLS, {
          agentConfigs: buildAgentConfigs(["web-developer"], {
            model: "haiku",
            codexModel: "gpt-5.6-terra",
            effort: "high",
          }),
        }),
      );

      expect(output).toContain(
        "Changes:\n  ~ web-developer (agent: model haiku, effort high → model haiku, codex model gpt-5.6-terra, effort high)\n\n",
      );
    });

    it("applies a Codex model pinned on a sub-agent resting on its defaults, and nothing else", async () => {
      mockProjectConfig(projectDir, buildProjectConfig({ skills: INSTALLED_SKILLS }));

      const output = await outputOfApplying(
        buildInstallSelection(INSTALLED_SKILLS, {
          agentConfigs: buildAgentConfigs(["web-developer"], { codexModel: "gpt-5.6-luna" }),
        }),
      );

      expect(output).toContain(
        "Changes:\n  ~ web-developer (agent: defaults → codex model gpt-5.6-luna)\n\n",
      );
    });

    it("moves a skill into the project when the tombstone beside it is another skill's", async () => {
      mockProjectConfig(
        projectDir,
        buildProjectConfig({
          skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        }),
      );

      const output = await outputOfApplying(
        buildInstallSelection(
          [
            ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
            ...buildSkillConfigs(["api-framework-hono"], { scope: "global", excluded: true }),
          ],
          { agentConfigs: buildAgentConfigs(["web-developer"]) },
        ),
      );

      expect(output).toContain("Changes:\n  + React ([G] → [P])\n\n");
    });

    it("moves a skill into the project when the global entry beside it is still installed", async () => {
      mockProjectConfig(
        projectDir,
        buildProjectConfig({
          skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        }),
      );

      const output = await outputOfApplying(
        buildInstallSelection(
          [
            ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
            ...buildSkillConfigs(["web-framework-react"], { scope: "global" }),
          ],
          { agentConfigs: buildAgentConfigs(["web-developer"]) },
        ),
      );

      // The arrow is the move; a project add over its global install prints no arrow. Two active
      // entries for one id also list an addition, a state the payload decode never hands over.
      expect(output).toContain("  + React ([G] → [P])\n");
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
      expect(
        await configsWrittenUnder(projectDir),
        "the allowed half of every refusal here that writes nothing",
      ).toStrictEqual([".agents-inc/claude/config.ts"]);
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

    it("carries a saved copy moving beside it as files, sending only the plugin through Claude", async () => {
      await writeSavedCopy(projectDir, "the saved copy");
      installed([
        ...saved(["web-framework-react"], "project"),
        ...plugin(["api-framework-hono"], "project"),
      ]);

      const error = await applying(withMarketplace(), [
        ...saved(["web-framework-react"], "global"),
        ...plugin(["api-framework-hono"], "global"),
      ]);

      expect(error).toBeUndefined();
      expect(uninstallSpy.mock.calls).toStrictEqual([[HONO_PLUGIN, "project", projectDir]]);
      expect(installSpy.mock.calls).toStrictEqual([[HONO_PLUGIN, "global", projectDir]]);
      expect(await readFile(savedCopyAt(fakeHome.dir), "utf-8")).toBe("the saved copy");
      expect(await fileExists(savedCopyAt(projectDir))).toBe(false);
      expect(
        (await readTestTsConfig<ProjectConfig>(getProjectConfigPath(projectDir, "claude"))).skills,
      ).toStrictEqual([
        ...saved(["web-framework-react"], "global"),
        ...plugin(["api-framework-hono"], "global"),
      ]);
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

  describe("a plugin skill added to the project over its global install", () => {
    const projectHalfOverGlobal = [
      ...plugin(["web-framework-react"], "project"),
      ...plugin(["web-framework-react"], "global", { excluded: true }),
    ];

    it("installs it here and leaves the global registration, which other projects use", async () => {
      installed(plugin(["web-framework-react"], "global"));

      const error = await applying(withMarketplace(), projectHalfOverGlobal);

      expect(error).toBeUndefined();
      expect(installSpy.mock.calls).toStrictEqual([[REACT_PLUGIN, "project", projectDir]]);
      expect(uninstallSpy.mock.calls).toStrictEqual([]);
    });

    it("names it when its install here failed, and still leaves the global registration", async () => {
      installed(plugin(["web-framework-react"], "global"));
      installSpy.mockRejectedValue(new Error("plugin ref not found"));

      const error = await applying(withMarketplace(), projectHalfOverGlobal);

      expect(stdoutChunks.join("")).toContain(
        "  Failed to migrate plugin scope for web-framework-react: plugin ref not found\n",
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
      expect(uninstallSpy.mock.calls).toStrictEqual([]);
    });
  });

  describe("plugin skills moved both ways at once", () => {
    it("moves each its own way, one into the project and one out to the global install", async () => {
      installed([
        ...plugin(["web-framework-react"], "global"),
        ...plugin(["api-framework-hono"], "project"),
      ]);

      const error = await applying(withMarketplace(), [
        ...plugin(["web-framework-react"], "project"),
        ...plugin(["web-framework-react"], "global", { excluded: true }),
        ...plugin(["api-framework-hono"], "global"),
      ]);

      expect(error).toBeUndefined();
      expect(uninstallSpy.mock.calls).toStrictEqual([[HONO_PLUGIN, "project", projectDir]]);
      expect(installSpy.mock.calls).toStrictEqual([
        [REACT_PLUGIN, "project", projectDir],
        [HONO_PLUGIN, "global", projectDir],
      ]);
    });

    it("installs nothing globally for a plugin it could not uninstall here", async () => {
      installed(plugin(["web-framework-react"], "project"));
      uninstallSpy.mockRejectedValue(new Error("uninstall refused"));

      const error = await applying(withMarketplace(), plugin(["web-framework-react"], "global"));

      expect(stdoutChunks.join("")).toContain(
        "  Failed to migrate plugin scope for web-framework-react: uninstall refused\n",
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
      expect(installSpy.mock.calls).toStrictEqual([]);
    });

    it("moves the rest when one plugin's install fails", async () => {
      installed(plugin(["web-framework-react", "api-framework-hono"], "project"));
      installSpy.mockRejectedValueOnce(new Error("plugin ref not found"));

      const error = await applying(
        withMarketplace(),
        plugin(["web-framework-react", "api-framework-hono"], "global"),
      );

      expect(error?.oclif?.exit).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
      expect(installSpy.mock.calls).toStrictEqual([
        [REACT_PLUGIN, "global", projectDir],
        [HONO_PLUGIN, "global", projectDir],
      ]);
      expect(stdoutChunks.join("")).toContain(
        "  Failed to migrate plugin scope for web-framework-react: plugin ref not found\n",
      );
      expect(stdoutChunks.join("")).not.toContain(
        "Failed to migrate plugin scope for api-framework-hono",
      );
    });
  });

  describe("a collapsed pair whose global install changes mode", () => {
    /** Measured against the dropped project half, the plugin dropped over a saved copy would read as a switch. */
    it("names only the project half dropped when the global copy keeps its mode", async () => {
      installed([
        ...plugin(["web-framework-react"], "project"),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: EJECT_SOURCE,
          excluded: true,
        }),
      ]);

      const error = await applying(withMarketplace(), saved(["web-framework-react"], "global"));

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain("Changes:\n  - React [P]\n\n");
    });

    it("names the global install's switch when the collapse carries a new install mode", async () => {
      installed([
        ...plugin(["web-framework-react"], "project"),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: EJECT_SOURCE,
          excluded: true,
        }),
      ]);

      const error = await applying(withMarketplace(), plugin(["web-framework-react"], "global"));

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain("  ~ React (Eject → Agents Inc)\n");
    });
  });

  describe("a saved copy moved between scopes", () => {
    it("carries its files to the global install without a marketplace, beside a plugin listed first", async () => {
      await writeSavedCopy(projectDir, "the saved copy");
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
      expect(await readFile(savedCopyAt(fakeHome.dir), "utf-8")).toBe("the saved copy");
      expect(await fileExists(savedCopyAt(projectDir))).toBe(false);
    });
  });

  describe("a collapsed [P][G] pair of plugins", () => {
    const projectHalfOverGlobal = [
      ...plugin(["web-framework-react"], "project"),
      ...plugin(["web-framework-react"], "global", { excluded: true }),
    ];

    it("uninstalls the project's plugin and leaves the global one installed", async () => {
      await writeSavedCopy(projectDir, "a folder of the same name");
      installed(projectHalfOverGlobal);

      const error = await applying(withMarketplace(), plugin(["web-framework-react"], "global"));

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain("Changes:\n  - React [P]\n\n");
      expect(stdoutChunks.join("")).toContain("\nRemoved 1 plugin(s)\n");
      expect(uninstallSpy.mock.calls).toStrictEqual([[REACT_PLUGIN, "project", projectDir]]);
      expect(installSpy).not.toHaveBeenCalled();
      expect(await fileExists(savedCopyAt(projectDir))).toBe(true);
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
      await writeSavedCopy(projectDir, "the saved copy");
      installed([
        ...saved(["web-framework-react"], "project"),
        ...plugin(["api-framework-hono"], "project"),
      ]);

      const error = await applying(withMarketplace(), saved(["web-framework-react"], "project"));

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain("\nRemoved 1 plugin(s)\n");
      expect(uninstallSpy.mock.calls).toStrictEqual([[HONO_PLUGIN, "project", projectDir]]);
      expect(await readFile(savedCopyAt(projectDir), "utf-8")).toBe("the saved copy");
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
      await writeSavedCopy(projectDir, "the saved copy");
      installed([
        ...plugin(["api-framework-hono"], "project"),
        ...saved(["web-framework-react"], "project"),
      ]);

      const error = await applying(withMarketplace(), plugin(["api-framework-hono"], "project"));

      expect(error).toBeUndefined();
      expect(await fileExists(savedCopyAt(projectDir))).toBe(false);
      expect(uninstallSpy).not.toHaveBeenCalled();
    });
  });

  describe("a skill switched between a plugin and a saved copy", () => {
    it("refuses to switch a saved copy to a plugin when no marketplace can be resolved, keeping the copy", async () => {
      await writeSavedCopy(projectDir, "the saved copy");
      installed(saved(["web-framework-react"], "project"));

      const error = await applying(
        withoutMarketplace(),
        plugin(["web-framework-react"], "project"),
      );

      expect(error?.message).toBe(refusedForWantOfAMarketplace("migrate skills to plugin mode"));
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(await readFile(savedCopyAt(projectDir), "utf-8")).toBe("the saved copy");
      expect(await configsWrittenUnder(projectDir)).toStrictEqual([]);
    });

    it("deletes no local copy when a plugin skill only changes marketplace", async () => {
      await writeSavedCopy(projectDir, "a folder of the same name");
      installed(plugin(["web-framework-react"], "project"));

      const error = await applying(
        withMarketplace(),
        buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "acme" }),
      );

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain("Changes:\n  ~ React (Agents Inc → acme)\n\n");
      expect(await fileExists(savedCopyAt(projectDir))).toBe(true);
    });

    it("keeps the global copy of a skill switched to a project plugin", async () => {
      await writeSavedCopy(fakeHome.dir, "the global copy");
      installed(saved(["web-framework-react"], "global"));

      const error = await applying(withMarketplace(), plugin(["web-framework-react"], "project"));

      expect(error).toBeUndefined();
      expect(stdoutChunks.join("")).toContain(
        "Installing 1 skill as a plugin in this project (the global copy stays)",
      );
      expect(await readFile(savedCopyAt(fakeHome.dir), "utf-8")).toBe("the global copy");
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
