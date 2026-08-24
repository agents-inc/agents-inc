import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  ensureBinaryExists,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import "../matchers/setup.js";

/**
 * A project-scoped skill never reaches a global-scoped sub-agent. That rule is
 * correct, documented and enforced at four layers — and every one of them is
 * silent.
 *
 * Pick one skill into project scope while every selected sub-agent stays global
 * (the default), and the skill is copied to `<project>/.claude/skills/`, written
 * into `config.ts`, and assigned to nothing. The run reports `0 agents rewritten`
 * and `doctor` is green, so the one thing the user is never told is the one thing
 * that matters: the skill will never be loaded.
 *
 * This spec asserts the install AND the silence, so the shape survives even if the
 * warning's wording moves — see STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT.
 */
describe("a project-scoped skill picked alongside only global sub-agents", () => {
  let source: E2ESource | undefined;
  let tempDir: string | undefined;
  let fakeHome: string;
  let projectDir: string;
  let initOutput: string;
  let initExitCode: number;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();

    const env = await createTestEnvironment();
    tempDir = env.tempDir;
    fakeHome = env.fakeHome;
    projectDir = env.projectDir;

    const wizard = await InitWizard.launch({
      source,
      projectDir,
      env: { HOME: fakeHome },
      ...TERMINAL_SIZE.TALL,
    });

    try {
      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      // Web domain: send React to PROJECT scope, focused explicitly rather than
      // relying on where the grid opens.
      await build.focusSkill(E2E_SKILL.react.display);
      await build.toggleScopeOnFocusedSkill();

      const sources = await build.passThroughAllDomains();
      await sources.waitForReady();
      // Eject, so the copy that lands with no assignment is observable on disk.
      await sources.setAllLocal();
      const agents = await sources.advance();

      // Every sub-agent left at the default GLOBAL scope — the whole point.
      const confirm = await agents.acceptDefaults("init");
      const result = await confirm.confirm();

      initExitCode = await result.exitCode;
      initOutput = result.output;
      await result.destroy();
    } finally {
      await wizard.destroy();
    }
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    await cleanupFixture(source);
  });

  it("installs the skill and records it at project scope", async () => {
    expect(initExitCode).toBe(EXIT_CODES.SUCCESS);

    // The filesystem half: the copy really landed under the project.
    await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
    // The config half: it is a project-scoped entry of this project's own.
    await expect({ dir: projectDir }).toHaveConfig({ skillIds: [E2E_SKILL.react.id] });
  });

  it("assigns it to no sub-agent, at either scope", async () => {
    const projectStack = (await loadConfigOrFail(projectDir)).stack;
    const globalStack = (await loadConfigOrFail(fakeHome)).stack;

    // Serialized rather than walked: the claim is that the id appears in no
    // agent's catalogue at all, which needs no structure to state.
    //
    // The two `expect(...).toBeDefined()` lines are the control, and without them the negatives
    // below pass for free: `JSON.stringify(undefined ?? {})` is `"{}"`, which contains no id
    // whatever the product did, so an install that wrote no stack at all satisfied them. The
    // fallback is gone for the same reason — an absent stack must fail here, not be excused.
    // The project side is the stronger claim and the one this journey is about: a skill that
    // reaches no sub-agent leaves NO project stack at all, not one that merely omits the id.
    // `JSON.stringify(projectStack ?? {})` said the weaker thing and could not fail — `"{}"`
    // contains no id however the run went — so the absence it was written for went unasserted.
    expect(projectStack).toBeUndefined();

    // The global side really is populated, so its negative discriminates. Asserted as the
    // serialised form because the claim is that the id appears in NO agent's catalogue, which
    // needs no structure to state — with the control above it, since an absent global stack
    // would satisfy this for free too.
    expect(globalStack).toBeDefined();
    expect(JSON.stringify(globalStack)).not.toContain(E2E_SKILL.react.id);
  });

  it("says so, naming the skill", () => {
    expect(initOutput).toContain(STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT);
    expect(initOutput).toContain(E2E_SKILL.react.id);
  });
});
