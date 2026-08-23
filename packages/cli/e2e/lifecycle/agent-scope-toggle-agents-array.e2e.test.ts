import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { E2E_AGENT_DISPLAY, E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import { DIRS, EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { cleanupTempDir, ensureBinaryExists, fileExists } from "../helpers/test-utils.js";
import { expectNoDuplicates } from "../assertions/config-assertions.js";
import {
  createDualScopeEnv,
  createGlobalOnlyEnv,
  readAgentEntries,
  readConfigSkillIds,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";

/**
 * The one skill `E2E_STACK` assigns to no agent, so no phase here installs it at
 * either scope. That is what makes selecting it a real addition rather than a
 * toggle the scope guards refuse.
 */
const SPARE_SKILL = E2E_SKILL["visual-regression"];

/**
 * D-221 — Agent scope toggle (project → global) corrupts `agents` array
 * with duplicate project-scope rows.
 *
 * Verifies that toggling an agent's scope via `cc edit` produces a clean
 * `agents: AgentScopeConfig[]` array in the written `config.ts`:
 *
 *   - No `(name, scope)` pair appears more than once.
 *   - P→G migration removes the project-scope row for the migrated agent.
 *   - G→P migration produces exactly one project row plus one excluded
 *     global tombstone — no spurious duplicates.
 *   - Re-running `cc edit` (unrelated change) does not amplify any
 *     pre-existing row counts.
 *
 * Root cause (per todo/D-221-investigations/05-merger.md):
 * `config-merger.ts::mergeConfigs` uses a scope-less `agentKey` for
 * non-excluded entries, so two active rows with the same name but different
 * scopes collide. When `existingConfig.agents` (loaded with global entries
 * inlined into the project file) contains a duplicate by name, the
 * positional `.map()` over existing rewrites every collision slot, preserving
 * the count while mutating the value.
 *
 * These tests are expected to FAIL on current `main` (red phase) and pass
 * once `mergeConfigs` composes scope into the identity key.
 */

describe("agent scope toggle keeps agents array duplicate-free", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  describe("Scenario A — P→G toggle produces no duplicates", () => {
    let env: DualScopeEnv | undefined;
    let wizard: EditWizard | undefined;

    afterEach(async () => {
      await wizard?.destroy();
      wizard = undefined;
      await env?.destroy();
      env = undefined;
    });

    it(
      "P→G on api-developer removes project row, keeps exactly one global row, no dup (name, scope) pairs",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        // ================================================================
        // Phase 1: Build mixed-scope project via the CLI.
        //   - global config: web-developer:global, api-developer:global
        //   - project config (inlined): web-developer:global, api-developer:project
        //     plus api-developer:global:excluded tombstone
        // ================================================================
        env = await createDualScopeEnv(sourceDir, sourceTempDir);
        const { fakeHome, projectDir } = env;

        const projectAgentFile = path.join(
          projectDir,
          DIRS.CLAUDE,
          DIRS.AGENTS,
          "api-developer.md",
        );
        const globalAgentFile = path.join(fakeHome, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");

        // Pre-condition: api-developer is at project scope and was compiled
        // into the project agents dir by the dual-scope setup.
        expect(
          await fileExists(projectAgentFile),
          "Pre-condition: api-developer.md must exist in project agents dir after dual-scope setup",
        ).toBe(true);

        // ================================================================
        // Phase 2: Launch edit wizard and toggle api-developer P→G.
        // ================================================================
        wizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });

        const sources = await wizard.build.passThroughAllDomains();
        await sources.waitForReady();
        const agents = await sources.advance();

        // api-developer is a persisted dual-scope [P][G] agent — `s` is the sole
        // dual-scope toggle and collapses [P][G] → [G], the P→G migration path.
        await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["api-developer"]);
        await agents.toggleScopeOnFocusedAgent();
        const confirm = await agents.advance("edit");

        const result = await confirm.confirm();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();

        // ================================================================
        // Phase 3: Parse config.ts::agents and assert duplicate-free shape.
        // ================================================================
        const rows = await readAgentEntries(projectDir);

        // No (name, scope) pair appears more than once, anywhere.
        expectNoDuplicates(
          rows.map((row) => `${row.name}:${row.scope}`),
          "(name, scope) pairs in the agents array",
          `Full agents array: ${JSON.stringify(rows, null, 2)}`,
        );

        // The migrated agent appears EXACTLY once and only at global scope.
        const apiDevRows = rows.filter((r) => r.name === "api-developer");
        expect(
          apiDevRows,
          `api-developer must appear exactly once at global scope after P→G. Got: ${JSON.stringify(apiDevRows)}`,
        ).toStrictEqual([{ name: "api-developer", scope: "global" }]);

        // The project-scope row is removed — not preserved as stale data.
        const apiDevProjectRows = rows.filter(
          (r) => r.name === "api-developer" && r.scope === "project",
        );
        expect(
          apiDevProjectRows,
          "P→G migration must REMOVE the project-scope row for the migrated agent",
        ).toStrictEqual([]);

        // web-developer is untouched: exactly one row, scope global.
        const webDevRows = rows.filter((r) => r.name === "web-developer");
        expect(
          webDevRows,
          `web-developer must appear exactly once with its original (global) scope. Got: ${JSON.stringify(webDevRows)}`,
        ).toStrictEqual([{ name: "web-developer", scope: "global" }]);

        // ================================================================
        // Phase 4: Filesystem assertions — compiled agent moved P→G.
        // ================================================================
        expect(
          await fileExists(globalAgentFile),
          "P→G: api-developer.md must exist in GLOBAL agents dir after migration",
        ).toBe(true);
        expect(
          await fileExists(projectAgentFile),
          "P→G: api-developer.md must NOT exist in project agents dir after migration",
        ).toBe(false);

        // Both scopes at four-surface strength. A sub-agent moving P→G rewrites the agent
        // unions on BOTH sides, and the side that lost its only project-scoped agent is where
        // `ProjectAgentName` has nothing left to narrow to.
        await expectFourSurfaces(projectDir, { globalHome: fakeHome });
        await expectFourSurfaces(fakeHome);
      },
    );
  });

  describe("Scenario B — repeated edits do not amplify duplicate rows", () => {
    let env: DualScopeEnv | undefined;
    let wizard1: EditWizard | undefined;
    let wizard2: EditWizard | undefined;

    afterEach(async () => {
      await wizard1?.destroy();
      wizard1 = undefined;
      await wizard2?.destroy();
      wizard2 = undefined;
      await env?.destroy();
      env = undefined;
    });

    it(
      "P→G then second edit with a skill addition: agents array still has exactly one entry per (name, scope)",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        // ================================================================
        // Phase 1: mixed-scope project (same as Scenario A baseline).
        // ================================================================
        env = await createDualScopeEnv(sourceDir, sourceTempDir);
        const { fakeHome, projectDir } = env;

        // ================================================================
        // Phase 2: First edit — P→G on api-developer.
        // ================================================================
        wizard1 = await EditWizard.launch({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });

        const sources1 = await wizard1.build.passThroughAllDomains();
        await sources1.waitForReady();
        const agents1 = await sources1.advance();
        // api-developer is a persisted dual-scope [P][G] agent — `s` collapses
        // [P][G] → [G], restoring it to global.
        await agents1.navigateCursorToAgent(E2E_AGENT_DISPLAY["api-developer"]);
        await agents1.toggleScopeOnFocusedAgent();
        const confirm1 = await agents1.advance("edit");
        const result1 = await confirm1.confirm();
        expect(await result1.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result1.destroy();

        const rowsAfterFirstEdit = await readAgentEntries(projectDir);
        expectNoDuplicates(
          rowsAfterFirstEdit.map((row) => `${row.name}:${row.scope}`),
          "(name, scope) pairs after the first edit",
        );

        // ================================================================
        // Phase 3: Second edit, whose whole job is to force a config WRITE so
        // Phase 4 has something to measure amplification against.
        //
        // The skill has to be one this project can actually add. It was
        // `web-state-zustand`, which `createDualScopeEnv` installs at GLOBAL
        // scope — so a project-scope edit had the global lock refuse the toggle,
        // no write was forced, and Phase 4 read a config the second edit never
        // rewrote. The SPARE is the fixture's answer to exactly this: the one
        // skill `E2E_STACK` assigns to no agent, so nothing has installed it at
        // either scope and selecting it is a genuine addition.
        // ================================================================
        wizard2 = await EditWizard.launch({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });
        await wizard2.build.selectSkill(SPARE_SKILL.display);
        const sources2 = await wizard2.build.passThroughAllDomainsGeneric();
        await sources2.waitForReady();
        // Every other phase against this fixture sets its sources local, and this
        // one now has to as well: `createE2ESource` writes no marketplace
        // manifest, so a freshly added skill left on its default plugin origin is
        // an install the CLI correctly refuses. The phase got away without it for
        // as long as it added nothing.
        await sources2.setAllLocal();
        const agents2 = await sources2.advance();
        const confirm2 = await agents2.acceptDefaults("edit");
        const result2 = await confirm2.confirm();
        expect(await result2.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result2.destroy();

        // ================================================================
        // Phase 4: After the second edit, the agents array must still
        // contain exactly one entry per (name, scope) pair — corruption
        // must NOT self-amplify across edit cycles.
        // ================================================================
        // Proof the second edit executed the write path at all. Without it every
        // assertion below holds trivially for a run that changed nothing — which
        // is precisely how this phase passed while its skill toggle was refused.
        expect(
          await readConfigSkillIds(projectDir),
          "the second edit must have written the added skill, or it forced no write to amplify",
        ).toContain(SPARE_SKILL.id);

        const rowsAfterSecondEdit = await readAgentEntries(projectDir);
        expectNoDuplicates(
          rowsAfterSecondEdit.map((row) => `${row.name}:${row.scope}`),
          "(name, scope) pairs after the second edit — corruption must not self-amplify",
          `Full agents array: ${JSON.stringify(rowsAfterSecondEdit, null, 2)}`,
        );

        // Specific invariant: api-developer still at global only, exactly once.
        const apiDevRows = rowsAfterSecondEdit.filter((r) => r.name === "api-developer");
        expect(apiDevRows).toStrictEqual([{ name: "api-developer", scope: "global" }]);

        // web-developer still at global only, exactly once.
        const webDevRows = rowsAfterSecondEdit.filter((r) => r.name === "web-developer");
        expect(webDevRows).toStrictEqual([{ name: "web-developer", scope: "global" }]);

        await expectFourSurfaces(projectDir, { globalHome: fakeHome });
        await expectFourSurfaces(fakeHome);
      },
    );
  });

  describe("Scenario C — G→P toggle produces no duplicates", () => {
    let env: DualScopeEnv | undefined;
    let wizard: EditWizard | undefined;

    afterEach(async () => {
      await wizard?.destroy();
      wizard = undefined;
      await env?.destroy();
      env = undefined;
    });

    it(
      "G→P on api-developer produces one project row + one global tombstone, other agents unchanged, no dup pairs",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        // ================================================================
        // Phase 1: All agents at global scope in both global and project.
        // ================================================================
        env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
        const { fakeHome, projectDir } = env;

        const projectAgentFile = path.join(
          projectDir,
          DIRS.CLAUDE,
          DIRS.AGENTS,
          "api-developer.md",
        );
        const globalAgentFile = path.join(fakeHome, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");

        expect(
          await fileExists(globalAgentFile),
          "Pre-condition: api-developer.md must exist in global agents dir after all-global setup",
        ).toBe(true);

        // ================================================================
        // Phase 2: Launch edit and toggle api-developer G→P.
        // ================================================================
        wizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });

        const sources = await wizard.build.passThroughAllDomains();
        await sources.waitForReady();
        const agents = await sources.advance();
        await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["api-developer"]);
        await agents.toggleScopeOnFocusedAgent();
        const confirm = await agents.advance("edit");
        const result = await confirm.confirm();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();

        // ================================================================
        // Phase 3: Config assertions.
        // ================================================================
        const rows = await readAgentEntries(projectDir);

        expectNoDuplicates(
          rows.map((row) => `${row.name}:${row.scope}`),
          "(name, scope) pairs after G→P",
          `Full agents array: ${JSON.stringify(rows, null, 2)}`,
        );

        // api-developer appears exactly twice — as active project row and
        // global tombstone — with distinct (name, scope) keys.
        const apiDevRows = rows.filter((r) => r.name === "api-developer");
        const apiDevActiveProject = apiDevRows.filter((r) => r.scope === "project" && !r.excluded);
        const apiDevGlobalTombstone = apiDevRows.filter(
          (r) => r.scope === "global" && r.excluded === true,
        );
        expect(
          apiDevActiveProject,
          "G→P: api-developer must have exactly one active project row",
        ).toStrictEqual([{ name: "api-developer", scope: "project" }]);
        expect(
          apiDevGlobalTombstone,
          "G→P: api-developer must have exactly one global:excluded tombstone",
        ).toStrictEqual([{ name: "api-developer", scope: "global", excluded: true }]);

        // web-developer is untouched — exactly one entry at global.
        const webDevRows = rows.filter((r) => r.name === "web-developer");
        expect(
          webDevRows,
          `web-developer must appear exactly once at global scope. Got: ${JSON.stringify(webDevRows)}`,
        ).toStrictEqual([{ name: "web-developer", scope: "global" }]);

        // ================================================================
        // Phase 4: Filesystem — G→P is additive.
        //   - Compiled api-developer.md NOW in project agents dir.
        //   - Global api-developer.md STILL present (tombstone masks it for
        //     this project but the global file is not deleted).
        // ================================================================
        expect(
          await fileExists(projectAgentFile),
          "G→P: api-developer.md must exist in project agents dir after migration",
        ).toBe(true);
        expect(
          await fileExists(globalAgentFile),
          "G→P: api-developer.md must STILL exist in global agents dir (G→P is additive)",
        ).toBe(true);

        await expectFourSurfaces(projectDir, { globalHome: fakeHome });
        await expectFourSurfaces(fakeHome);
      },
    );
  });
});
