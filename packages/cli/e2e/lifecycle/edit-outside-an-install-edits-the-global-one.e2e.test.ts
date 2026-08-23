import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  createTestEnvironment,
  finishWizard,
  initGlobalWithEject,
  initProjectAllGlobal,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL, E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  ensureBinaryExists,
  fileExists,
  loadConfigOrFail,
  readCompiledAgents,
  readTestFile,
  readTreeSnapshot,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import type { SkillConfig } from "../../src/cli/types/index.js";

/**
 * `cc edit` started in a directory that holds no installation edits the installation it
 * FOUND — the global one — rather than inventing a project out of the directory it was
 * started in.
 *
 * The command names no directory. It detects an installation, and detection falls back to
 * `$HOME` when the working directory has no config of its own, so a bare `cc edit` in an
 * unrelated checkout is a request to edit the GLOBAL install. `edit` used to read that
 * directory as a project anyway: the wizard offered the project/global scope toggle over a
 * project that did not exist, the write path split by scope and wrote a `.claude-src/` pair
 * into the directory, and the compile ran twice, dropping `.claude/agents/` beside it.
 *
 * Both halves are asserted, and neither means anything alone. A hidden scope toggle cannot
 * tell a correctly-scoped criterion from one that has swallowed its whole domain — both
 * hide it — so the control below drives the same edit from a directory that DOES hold an
 * installation and requires the toggle to be offered and the project's own pair to be
 * written.
 *
 * The negative half is a whole-tree snapshot rather than four separate absences: the
 * directory must come out of the run byte-identical, which covers the config pair, the
 * compiled agents and anything else a stray write would leave.
 */

/** The skill the E2E stack assigns to no agent, so an edit has something genuinely new to add. */
const SPARE_SKILL = E2E_SKILL["visual-regression"];

describe("edit from a directory that holds no installation", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempDir: string;
  let fakeHome: string;
  let bareDir: string;

  let bareBuildOutput: string;
  let bareEditExitCode: number;
  let bareEditOutput: string;
  let bareTreeBefore: Record<string, TreeSnapshotEntry>;
  let bareTreeAfter: Record<string, TreeSnapshotEntry>;
  let globalSkillsAfter: SkillConfig[];
  let globalAgentFilesAfter: string[];
  let globalConfigTypesAfter: string;

  let controlBuildOutput: string;
  let controlConfigPair: { configTs: boolean; configTypesTs: boolean };

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;

    const env = await createTestEnvironment();
    tempDir = env.tempDir;
    fakeHome = env.fakeHome;
    // `createTestEnvironment` leaves this directory bare — a `.claude/settings.json` and
    // nothing else. Only Phase A runs, so nothing is ever installed into it.
    bareDir = env.projectDir;

    const phaseA = await initGlobalWithEject(sourceDir, sourceTempDir, fakeHome);
    expect(phaseA.exitCode, `global install failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

    bareTreeBefore = await readTreeSnapshot(bareDir);

    // The subject: `cc edit` from the bare directory, adding a skill so the run has real
    // work to persist. A pass-through would leave the directory untouched for want of
    // anything to write rather than for want of authority to write it.
    const wizard = await EditWizard.launch({
      projectDir: bareDir,
      source: { sourceDir, tempDir: sourceTempDir },
      env: { HOME: fakeHome },
      ...TERMINAL_SIZE.TALL,
    });
    bareBuildOutput = wizard.build.getOutput();
    await wizard.build.focusSkill(SPARE_SKILL.display);
    await wizard.build.toggleFocusedSkill();
    const sources = await wizard.build.passThroughAllDomainsGeneric();
    await sources.waitForReady();
    // The global install is all-eject and the fixture marketplace is a bare directory, so a
    // newly-picked skill left on its default plugin mode would fail the run on an
    // unresolvable marketplace rather than on anything this spec is about.
    await sources.setAllLocal();
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("edit");
    const outcome = await finishWizard(await confirm.confirm());
    bareEditExitCode = outcome.exitCode;
    bareEditOutput = outcome.output;

    bareTreeAfter = await readTreeSnapshot(bareDir);
    globalSkillsAfter = (await loadConfigOrFail(fakeHome)).skills;
    globalAgentFilesAfter = Object.keys(await readCompiledAgents(fakeHome)).sort();
    globalConfigTypesAfter = await readTestFile(configTypesTsPath(fakeHome));

    // The control: the same directory once it DOES hold an installation of its own, so the
    // toggle and the project pair are required rather than merely absent above.
    const phaseB = await initProjectAllGlobal(sourceDir, sourceTempDir, fakeHome, bareDir);
    expect(phaseB.exitCode, `project setup failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);

    const controlWizard = await EditWizard.launch({
      projectDir: bareDir,
      source: { sourceDir, tempDir: sourceTempDir },
      env: { HOME: fakeHome },
      ...TERMINAL_SIZE.TALL,
    });
    controlBuildOutput = controlWizard.build.getOutput();
    await controlWizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);

    controlConfigPair = {
      configTs: await fileExists(configTsPath(bareDir)),
      configTypesTs: await fileExists(configTypesTsPath(bareDir)),
    };
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  it("completes the edit", () => {
    expect(bareEditExitCode, `edit from a bare directory failed: ${bareEditOutput}`).toBe(
      EXIT_CODES.SUCCESS,
    );
  });

  it("hides the scope toggle, because the installation being edited is the global one", () => {
    // Proof the frame is the fully-painted build step, so a missing Scope label below is the
    // hidden hotkey rather than a screen that never arrived.
    expect(bareBuildOutput).toContain(STEP_TEXT.BUILD_FOOTER);
    expect(bareBuildOutput).toContain(STEP_TEXT.BUILD);
    expect(
      bareBuildOutput,
      "a global-scope edit must not offer the project/global scope toggle",
    ).not.toContain(STEP_TEXT.SCOPE);
  });

  it("records the added skill at global scope in the global config", () => {
    expect(
      globalSkillsAfter.filter((skill) => skill.id === SPARE_SKILL.id),
      "the skill added from a bare directory belongs to the installation that was edited",
    ).toStrictEqual([{ id: SPARE_SKILL.id, scope: "global", origin: "eject" }]);
  });

  it("compiles the global installation's own sub-agents, and only those", () => {
    expect(
      globalAgentFilesAfter,
      "the compiled roster belongs to the installation the run edited",
    ).toStrictEqual(E2E_STACK_AGENTS.map((agent) => `${agent}.md`).sort());
  });

  it("narrows the global config-types.ts to the roster the edit left", () => {
    expect(
      globalConfigTypesAfter,
      "the added skill must reach the type surface its config.ts is checked against",
    ).toContain(SPARE_SKILL.id);
  });

  it("leaves the directory it was started in byte-identical", () => {
    expect(
      bareTreeAfter,
      "a directory holding no installation must come out of an edit untouched",
    ).toStrictEqual(bareTreeBefore);
  });

  it("offers the scope toggle once that directory holds an installation of its own", () => {
    expect(controlBuildOutput).toContain(STEP_TEXT.BUILD_FOOTER);
    expect(controlBuildOutput).toContain(STEP_TEXT.BUILD);
    expect(
      controlBuildOutput,
      "a project-scope edit must offer the project/global scope toggle",
    ).toContain(STEP_TEXT.SCOPE);
  });

  it("writes that directory its own config pair once it holds an installation", () => {
    expect(
      controlConfigPair,
      "a directory that holds an installation is the one an edit writes its pair into",
    ).toStrictEqual({ configTs: true, configTypesTs: true });
  });
});
