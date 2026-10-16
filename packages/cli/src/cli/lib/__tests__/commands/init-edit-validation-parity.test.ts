import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "@oclif/core";
import type { ReactElement } from "react";

import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { validateSelection } from "@workspace/compile";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { cleanupTempDir, createTempDir } from "../test-fs-utils";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { stubInkInstance } from "../helpers/stub-ink-instance.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import { buildAgentDefs } from "../factories/agent-factories.js";
import {
  buildConfigWriteResult,
  buildGateReport,
  buildProjectConfig,
  buildSourceResult,
} from "../factories/config-factories.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import {
  buildCompilationResult,
  buildDiscoveredSkills,
  buildLoadedSource,
  buildSkillCopyResult,
} from "../factories/operation-result-factories.js";
import { BUILD_STEP_REQUIRES_MATRIX } from "../mock-data/mock-matrices";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { CLAUDE_DIR, STANDARD_FILES } from "../../../consts";
import type { SkillId } from "../../../types";
import type {
  compileAgentsAllScopes,
  copyLocalSkills,
  discoverInstalledSkills,
  loadAgentDefs,
  loadSource,
  writeProjectConfig,
} from "../../operations/index.js";
import type { discoverAllPluginSkills } from "../../plugins/index.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";

/**
 * One rejected selection, two commands, one wording.
 *
 * A selection the matrix rejects — a conflict, an unmet requirement, an exclusive category with
 * two picks — is a fact about the selection, not about the command that produced it. These specs
 * drive `init --from` and `edit --from` over the SAME shared configuration and compare the
 * warnings verbatim, because "init warns too" is a weaker claim than "init warns the same".
 */

const {
  mockRender,
  mockLoadSource,
  mockLoadAgentDefs,
  mockWriteProjectConfig,
  mockDiscoverInstalledSkills,
  mockCompileAgentsAllScopes,
  mockCopyLocalSkills,
  mockDiscoverAllPluginSkills,
} = vi.hoisted(() => ({
  mockRender: vi.fn(),
  // Typed against the real functions, so a field a stub returns that the product has retired is
  // a compile error here rather than a dead value nothing reads.
  mockLoadSource: vi.fn<typeof loadSource>(),
  mockLoadAgentDefs: vi.fn<typeof loadAgentDefs>(),
  mockWriteProjectConfig: vi.fn<typeof writeProjectConfig>(),
  mockDiscoverInstalledSkills: vi.fn<typeof discoverInstalledSkills>(),
  mockCompileAgentsAllScopes: vi.fn<typeof compileAgentsAllScopes>(),
  mockCopyLocalSkills: vi.fn<typeof copyLocalSkills>(),
  mockDiscoverAllPluginSkills: vi.fn<typeof discoverAllPluginSkills>(),
}));

vi.mock("ink", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ink")>()),
  render: mockRender,
}));

// The source load and the write/compile tail are stubbed; nothing between the fetched payload and
// the reporting under test is.
vi.mock("../../operations/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../operations/index.js")>()),
  loadSource: mockLoadSource,
  loadAgentDefs: mockLoadAgentDefs,
  writeProjectConfig: mockWriteProjectConfig,
  discoverInstalledSkills: mockDiscoverInstalledSkills,
  compileAgentsAllScopes: mockCompileAgentsAllScopes,
  copyLocalSkills: mockCopyLocalSkills,
}));

vi.mock("../../plugins/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../plugins/index.js")>()),
  discoverAllPluginSkills: mockDiscoverAllPluginSkills,
}));

const { default: Init } = await import("../../../commands/init.js");
const { default: Edit } = await import("../../../commands/edit.js");

/** The skill whose own `requires` entry the rejected selection below leaves unmet. */
const REQUIRING_SKILL_ID = "web-framework-react" satisfies SkillId;
/** What it requires, and what the clean selection adds to satisfy it. */
const REQUIRED_SKILL_ID = "web-state-zustand" satisfies SkillId;

/**
 * The rejected fixture: React selected, the Zustand it requires left out. Run through the
 * production validator rather than hand-written, so the expected text IS the product's text.
 */
const REJECTED_VALIDATION = validateSelection([REQUIRING_SKILL_ID], BUILD_STEP_REQUIRES_MATRIX);

/** What either command owes the user for {@link REJECTED_VALIDATION}. */
const EXPECTED_WARNINGS = REJECTED_VALIDATION.errors.map((error) => error.message);

/** The id both commands are handed; the mock worker serves whichever payload a spec stores. */
const SEED_ID = "ParityCheck1";

/** A project-scoped skill, so a run from a project holds nothing back as the global install's. */
const PROJECT_SKILL = buildSeedSkill({ scope: "project" });

const REJECTED_PAYLOAD = buildSeedPayload({ skills: { [REQUIRING_SKILL_ID]: PROJECT_SKILL } });

/** The same selection with the requirement met — the negative control. */
const ACCEPTED_SELECTION: SkillId[] = [REQUIRING_SKILL_ID, REQUIRED_SKILL_ID];
const ACCEPTED_PAYLOAD = buildSeedPayload({
  skills: { [REQUIRING_SKILL_ID]: PROJECT_SKILL, [REQUIRED_SKILL_ID]: PROJECT_SKILL },
});

const PROJECT_NAME = "validation-parity-project";

/** Answers yes to whichever confirm a run puts up. */
function confirmEveryPrompt(): void {
  mockRender.mockImplementation((element: ReactElement<Record<string, unknown>>) => {
    const onConfirm = element.props.onConfirm as (() => void) | undefined;
    onConfirm?.();
    return stubInkInstance();
  });
}

/** Every `this.warn` message one command run emitted, in order. */
async function warningsFrom(run: () => Promise<unknown>): Promise<string[]> {
  const warnings: string[] = [];
  const spy = vi.spyOn(Command.prototype, "warn").mockImplementation((input: Error | string) => {
    warnings.push(typeof input === "string" ? input : input.message);
    return input;
  });
  await run();
  spy.mockRestore();
  return warnings;
}

describe("init and edit report a rejected selection identically", () => {
  let tempDir: string;
  let initProjectDir: string;
  let editProjectDir: string;
  let originalCwd: string;

  useMockWorker();

  // Both runs confirm through a stubbed prompt, which stands in for a person at a terminal — and
  // `edit --from` refuses to apply where stdin is not one. Stated rather than inherited from
  // whatever the runner was started from.
  standAtTerminal();

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-validation-parity-");

    const fakeHome = path.join(tempDir, "home");
    await mkdir(fakeHome, { recursive: true });
    vi.stubEnv("HOME", fakeHome);

    // `init` needs a greenfield directory and `edit` needs an installed one — the two
    // preconditions are the only thing that differs between the runs.
    initProjectDir = path.join(tempDir, "init-project");
    editProjectDir = path.join(tempDir, "edit-project");
    await mkdir(path.join(initProjectDir, CLAUDE_DIR), { recursive: true });

    // A settings file that already grants a permission, so init's post-install permission notice
    // resolves to null and never renders.
    await writeFile(
      path.join(initProjectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON),
      JSON.stringify({ permissions: { allow: ["Read(*)"] } }),
    );

    // The installed roster matches the payload each spec serves exactly, so `edit` reaches its
    // no-change branch: the validation report is then the only thing that run has to say.
    // `agents: []` is named because the factory's default roster would give edit a change to make.
    await writeEditInstallation([REQUIRING_SKILL_ID]);

    initializeMatrix(BUILD_STEP_REQUIRES_MATRIX);
    confirmEveryPrompt();
    configMockServer.use(storedConfigHandlerFor(SEED_ID, REJECTED_PAYLOAD));
    mockLoadSource.mockResolvedValue(
      buildLoadedSource(buildSourceResult(BUILD_STEP_REQUIRES_MATRIX, tempDir)),
    );
    mockLoadAgentDefs.mockResolvedValue(buildAgentDefs({}, tempDir));
    // Every warning either command could add after the write is switched off BY NAME, because
    // these specs compare the warnings a run emitted against the validator's alone: a config
    // holding a skill no sub-agent loads is warned about, so is every compile warning, and so is
    // every warning from a recompile the write propagated into another project — which is why the
    // gate report names the empty list of projects it reached.
    mockWriteProjectConfig.mockResolvedValue(
      buildConfigWriteResult(
        buildProjectConfig({ name: PROJECT_NAME, skills: [], agents: [] }),
        getProjectConfigPath(initProjectDir, "claude"),
        { propagation: buildGateReport([]) },
      ),
    );
    mockDiscoverInstalledSkills.mockResolvedValue(buildDiscoveredSkills());
    mockCompileAgentsAllScopes.mockResolvedValue(buildCompilationResult({ warnings: [] }));
    mockCopyLocalSkills.mockResolvedValue(buildSkillCopyResult());
    mockDiscoverAllPluginSkills.mockResolvedValue({});
  });

  async function writeEditInstallation(skillIds: SkillId[]): Promise<void> {
    await writeTestTsConfig(
      editProjectDir,
      buildProjectConfig({ name: PROJECT_NAME, skills: buildSkillConfigs(skillIds), agents: [] }),
    );
  }

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await cleanupTempDir(tempDir);
  });

  it("edit warns once per validation error, in the validator's own wording", async () => {
    process.chdir(editProjectDir);

    const warnings = await warningsFrom(() => Edit.run(["--from", SEED_ID], { root: CLI_ROOT }));

    expect(
      EXPECTED_WARNINGS,
      "the fixture selection must be rejected, or every parity claim here passes on two silences",
    ).not.toStrictEqual([]);
    expect(warnings).toStrictEqual(EXPECTED_WARNINGS);
  });

  it("init warns once per validation error, in the validator's own wording", async () => {
    process.chdir(initProjectDir);

    const warnings = await warningsFrom(() => Init.run(["--from", SEED_ID], { root: CLI_ROOT }));

    expect(warnings).toStrictEqual(EXPECTED_WARNINGS);
  });

  it("init and edit emit the same warnings, verbatim and in the same order", async () => {
    process.chdir(editProjectDir);
    const editWarnings = await warningsFrom(() =>
      Edit.run(["--from", SEED_ID], { root: CLI_ROOT }),
    );

    process.chdir(initProjectDir);
    const initWarnings = await warningsFrom(() =>
      Init.run(["--from", SEED_ID], { root: CLI_ROOT }),
    );

    expect(initWarnings).toStrictEqual(editWarnings);
  });

  it("neither command warns when the selection is accepted", async () => {
    configMockServer.use(storedConfigHandlerFor(SEED_ID, ACCEPTED_PAYLOAD));
    await writeEditInstallation(ACCEPTED_SELECTION);

    process.chdir(editProjectDir);
    const editWarnings = await warningsFrom(() =>
      Edit.run(["--from", SEED_ID], { root: CLI_ROOT }),
    );

    process.chdir(initProjectDir);
    const initWarnings = await warningsFrom(() =>
      Init.run(["--from", SEED_ID], { root: CLI_ROOT }),
    );

    expect(editWarnings).toStrictEqual([]);
    expect(initWarnings).toStrictEqual([]);
  });
});
