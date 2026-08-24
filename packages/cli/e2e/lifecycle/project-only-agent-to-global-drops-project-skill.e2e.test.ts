import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  agentsPath,
  cleanupTempDir,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  loadConfigOrFail,
  readAgentEntriesFor,
  skillsPath,
} from "../helpers/test-utils.js";
import { createTestEnvironment, readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_AGENT_DISPLAY, E2E_SKILL } from "../fixtures/expected-values.js";

/** The sub-agent that changes scope, and the file it compiles to. */
const API_DEVELOPER = E2E_AGENT["api-developer"].name;
const API_DEVELOPER_FILE = `${API_DEVELOPER}.md`;

/**
 * The whole of `api-developer`'s stack once it is global: the two GLOBAL-scoped meta
 * skills, and no `api-api` key at all — the category the project-scoped skill lived in.
 *
 * Held as one `toStrictEqual` rather than as a pair of contains/not-contains, so a
 * project-scoped assignment that leaked back in reddens whichever category it lands in.
 *
 * `preloaded: false` is explicit because these are read through `loadConfigOrFail`, and
 * `loadProjectConfigFromDir` runs `normalizeStackRecord` over the stack — every assignment
 * comes back with the flag spelled out. It is also the substantive claim for these two:
 * the only preload `api-developer` ever had was the project-scoped skill that just left.
 */
const GLOBAL_API_DEVELOPER_STACK = {
  "meta-methodology": [{ id: E2E_SKILL["research-methodology"].id, preloaded: false }],
  "meta-reviewing": [{ id: E2E_SKILL.reviewing.id, preloaded: false }],
};

/**
 * The same sub-agent's stack while it is still PROJECT-scoped — `GLOBAL_API_DEVELOPER_STACK`
 * plus the `api-api` preload that the move to global scope is about to cost it.
 *
 * The departure control for the assertion above: without it, an `api-api` key that was never
 * built in the first place reads exactly like one the scope filter removed.
 */
const PROJECT_API_DEVELOPER_STACK = {
  ...GLOBAL_API_DEVELOPER_STACK,
  "api-api": [{ id: E2E_SKILL.hono.id, preloaded: true }],
};

/**
 * A project-only sub-agent moved to GLOBAL scope loses the project-scoped skill it
 * carried, because a global sub-agent may not carry one.
 *
 * The mechanism is `isScopePairCompatible` in `lib/configuration/config-generator.ts` —
 * "project skills never reach global agents" — applied as the first filter in
 * `buildAgentStack`. **This is DESIGNED behaviour, ruled correct by the owner: the
 * assignment is meant to disappear, and the skill is meant to be left installed and
 * loaded by nobody.** This spec pins the design; it is not a defect report, and the
 * warning asserted at the end is the product telling the user so.
 *
 * The fixture is deliberately NOT a dual-scope one. Every other agent-scope spec starts
 * from a persisted `[P][G]` pair, where `s` is a collapse of a pair that already exists at
 * both scopes and the global half was compiled before the toggle ever ran — so nothing
 * about the scope filter is exercised. Here `api-framework-hono` and `api-developer` are
 * PROJECT-ONLY (a scratch project init, no prior global install, so neither has a global
 * half), and the `s` press is a genuine P->G departure.
 *
 * The negative assertion carries a positive subject guard in the SAME captured frame: the
 * newly-global `api-developer.md` must still carry the two global-scoped meta skills. An
 * absence assertion on its own passes over an empty file, a missing file or the wrong file.
 *
 * MUTATION-CHECKED, and the result is the reason each assertion below is worded the way it
 * is. The rule is enforced at three layers, each of which alone keeps the skill out of the
 * compiled agent — so defeating only the first leaves every filesystem assertion green, and
 * a spec written to redden on it would have been reporting the wrong thing. Each mutation
 * is CUMULATIVE: layer N only becomes observable once 1..N-1 are already defeated.
 *
 *   1. `isScopePairCompatible` (`configuration/config-generator.ts`), the filter in
 *      `buildAgentStack` — return `true` unconditionally. Only the two OUTPUT assertions
 *      redden: the run installs the same bytes and says nothing at all. Every filesystem
 *      and config assertion in this spec still passes, because layer 2 catches it.
 *   2. `splitAgentStack`'s partition predicate in the same file — treat every assignment as
 *      global. `GLOBAL_API_DEVELOPER_STACK` reddens, gaining
 *      `"api-api": [{ id: <hono>, preloaded: true }]`. The compiled agent is still clean.
 *   3. `buildCompileAgents`'s `agentConfig.scope !== "global" || globalSkillIds.has(ref.id)`
 *      (`installation/local-installer.ts`) — the compile-time safety net. NOW the
 *      `notContains` below reddens: `Expected compiled agent "api-developer" to NOT contain
 *      "<hono id>" but it does`, with its `contains` guard still passing.
 *
 * So the warning is what carries the red for the mechanism this spec is named after, and the
 * compiled-agent assertion is what carries the red for the user-visible contract. Neither
 * substitutes for the other, which is why both are here.
 */
describe("a project-only sub-agent toggled to global scope", () => {
  let testTempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
  }, TIMEOUTS.SETUP_DUAL);

  afterEach(async () => {
    if (testTempDir) await cleanupTempDir(testTempDir);
    testTempDir = undefined;
  });

  it(
    "drops its project-scoped skill from the compiled agent, keeps its global ones, and says the skill now reaches nothing",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;

      // PHASE A -- a scratch project install with a project-scoped skill assigned to a
      // project-scoped sub-agent. No global install underneath either of them, so no
      // dual-scope pair exists anywhere in this fixture.
      const initWizard = await InitWizard.launch({
        projectDir,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      try {
        const domain = await initWizard.stack.selectFirstStack();
        const build = await domain.acceptDefaults();

        // Web domain: pass through — react and the rest stay GLOBAL.
        await build.advanceDomain();

        // API domain: send api-framework-hono to PROJECT scope.
        await build.focusSkill(E2E_SKILL.hono.display);
        await build.toggleScopeOnFocusedSkill();
        await build.advanceDomain();

        // Methodology domain -> Sources.
        const sources = await build.advanceToSources();
        await sources.waitForReady();
        // Eject, so the skill that ends up assigned to nothing is observable on disk.
        await sources.setAllLocal();
        const agents = await sources.advance();

        // Send api-developer to PROJECT scope, so the project-scoped skill has a
        // sub-agent that can legally carry it.
        await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["api-developer"]);
        await agents.toggleScopeOnFocusedAgent();
        const confirm = await agents.advance("init");

        const installed = await confirm.confirm();
        expect(await installed.exitCode, `Phase A init failed: ${installed.rawOutput}`).toBe(
          EXIT_CODES.SUCCESS,
        );
        await installed.destroy();
      } finally {
        await initWizard.destroy();
      }

      // The fixture's defining property: both are project-ONLY. A single entry each,
      // at project scope, with no global row and no tombstone beside it.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "the fixture must hold a project-only skill — a dual-scope pair would make the toggle a collapse",
      ).toStrictEqual([{ id: E2E_SKILL.hono.id, scope: "project", origin: "eject" }]);
      expect(
        await readAgentEntriesFor(projectDir, API_DEVELOPER),
        "the fixture must hold a project-only sub-agent",
      ).toStrictEqual([{ name: API_DEVELOPER, scope: "project" }]);

      // The departure state, on every surface the toggle will move it off.
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(API_DEVELOPER, {
        contains: [E2E_SKILL.hono.id, E2E_SKILL["research-methodology"].id, E2E_SKILL.reviewing.id],
      });
      expect(
        await fileExists(path.join(agentsPath(fakeHome), API_DEVELOPER_FILE)),
        "the sub-agent must not already exist at global scope, or its arrival there proves nothing",
      ).toBe(false);
      expect(
        (await loadConfigOrFail(projectDir)).stack?.[API_DEVELOPER],
        "the project partition must record the whole stack while the sub-agent is project-scoped",
      ).toStrictEqual(PROJECT_API_DEVELOPER_STACK);

      // PHASE B -- toggle the sub-agent P->G and save.
      const editWizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      let editOutput: string;
      try {
        const sources = await editWizard.build.passThroughAllDomains();
        await sources.waitForReady();
        const agents = await sources.advance();

        await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["api-developer"]);
        await agents.toggleScopeOnFocusedAgent();
        const confirm = await agents.advance("edit");

        const edited = await confirm.confirm();
        expect(await edited.exitCode, `Phase B edit failed: ${edited.rawOutput}`).toBe(
          EXIT_CODES.SUCCESS,
        );
        editOutput = edited.output;
        await edited.destroy();
      } finally {
        await editWizard.destroy();
      }

      // THE POINT. One frame, read once: the project-scoped skill is gone from the
      // newly-global sub-agent, and the two global-scoped ones it kept are the positive
      // subject guard that the frame is the right file and is not empty.
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent(API_DEVELOPER, {
        contains: [E2E_SKILL["research-methodology"].id, E2E_SKILL.reviewing.id],
        notContains: [E2E_SKILL.hono.id],
      });

      // P->G is a MOVE for a sub-agent: the project's compiled copy is gone.
      expect(
        await fileExists(path.join(agentsPath(projectDir), API_DEVELOPER_FILE)),
        `${API_DEVELOPER_FILE} must not exist at project scope after the P->G toggle`,
      ).toBe(false);

      // The config half of the same move, at both scopes.
      expect(
        await readAgentEntriesFor(fakeHome, API_DEVELOPER),
        "the global config must own the sub-agent after the toggle",
      ).toStrictEqual([{ name: API_DEVELOPER, scope: "global" }]);

      // The stack the config records, exhaustively — the `api-api` category the
      // project-scoped skill lived in must be absent, not merely emptied. Compared against
      // `PROJECT_API_DEVELOPER_STACK`, which the same read returned one phase ago, this is
      // the departure rather than a key nobody ever filled.
      expect(
        (await loadConfigOrFail(fakeHome)).stack?.[API_DEVELOPER],
        "a global sub-agent's stack must carry the global skills and none of the project ones",
      ).toStrictEqual(GLOBAL_API_DEVELOPER_STACK);

      // NOT asserted here: the project config's own `stack`. It comes back absent, but the
      // project writer filters that stack to PROJECT-scoped sub-agents (`config-writer.ts`),
      // so a row for a now-global sub-agent is dropped at emission whatever the scope filter
      // did. Measured under the layer-1 mutation described above, where `splitAgentStack`
      // DID hand the project partition an `api-api` row for this sub-agent: the emitted
      // project config still carried no stack. An assertion there would read as this spec's
      // subject and could not fail for it.

      // The orphan is real: still installed, still recorded, loaded by nobody.
      expect(
        await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.hono.id)),
        "the skill must stay installed at project scope — losing its assignment is not an uninstall",
      ).toBe(true);
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "the skill must stay recorded at project scope",
      ).toStrictEqual([{ id: E2E_SKILL.hono.id, scope: "project", origin: "eject" }]);

      // And the run says so, naming the skill and the sub-agent the rule kept it from.
      // Both sentinels rather than the composed sentences: the wording is the
      // implementer's and lives in those two constants. The skill id and the sub-agent
      // name are the spec's own, so they are named here — the sub-agent QUOTED, because
      // its bare name is also the change summary's `~ api-developer ([P] → [G])` row and
      // an unquoted match would pass on that alone.
      expect(editOutput).toContain(STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT);
      expect(editOutput).toContain(E2E_SKILL.hono.id);
      expect(editOutput).toContain(STEP_TEXT.STACK_PAIR_DROPPED_BY_SCOPE);
      expect(editOutput).toContain(`'${API_DEVELOPER}'`);
    },
  );
});
