import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { DIRS, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { createDualScopeEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  readTestFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName, StackAgentConfig } from "../../src/cli/types/index.js";

/**
 * Dual-scope, SAME source mode (both copies eject).
 *
 * A skill installed at BOTH scopes: the project owns an active project-scope
 * copy, and the shared global install is masked by a project-local tombstone
 * (`{scope:"global", excluded:true}`) — the D-223 dual-scope shape. Here both
 * halves are eject-sourced, so the compiled agent reference is the BARE skill
 * id (no `id:id` plugin colon form).
 *
 * Test 1 bootstraps the dual-scope pair via real `cc init` (eject) + a real
 * dashboard→edit G→P toggle (`createDualScopeEnv`) and verifies the config
 * shape, the compiled-agent reference form, the re-opened `[P][G]` badges, and
 * the `s` scope-toggle behaviour.
 *
 * Test 2 (fresh, seeded, minimal-stack) removes the GLOBAL copy via a real
 * `cc edit` at global scope and proves the project's own project-scope copy
 * survives — config, compiled agent reference, and filesystem. It is seeded
 * (like edit-global-remove-dual-scope-partial.e2e.test.ts) because in a
 * full wizard install every agent's stack references the skill, which makes an
 * isolated global-only skill removal non-deterministic.
 *
 * The MIXED plugin/eject matrix is covered separately by
 * dual-scope-edit-mixed-sources.e2e.test.ts — this file is strictly the
 * both-eject cell.
 */

const HONO_ID = "api-framework-hono";
const HONO_LABEL = "api-framework-hono";
const HONO_PLUGIN_REF = `${HONO_ID}:${HONO_ID}`;
const API_DEVELOPER: AgentName = "api-developer";
const WEB_DEVELOPER: AgentName = "web-developer";

// Check 5 uses a NON-framework skill (web-testing-vitest). Framework skills
// (api-framework-hono) are required and cannot be deselected at global scope,
// so an isolated global-only removal is only expressible with a non-framework
// skill — the same reason edit-global-remove-dual-scope-partial.e2e.test.ts
// uses vitest. It is seeded preloaded:true on the project agent so its
// compiled-agent reference form is still asserted.
const VITEST_ID = "web-testing-vitest";
const VITEST_LABEL = "web-testing-vitest";
const VITEST_PLUGIN_REF = `${VITEST_ID}:${VITEST_ID}`;

const vitestMetadata =
  `author: "@agents-inc"\ndisplayName: ${VITEST_ID}\ncategory: web-testing\nslug: vitest\n` +
  `cliDescription: "E2E test skill"\nusageGuidance: "Use when testing E2E scenarios"\n` +
  `contentHash: "b2c3d4e"\n`;

const globalStack = {
  [WEB_DEVELOPER]: { "web-testing": [{ id: VITEST_ID, preloaded: false }] },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

const projectStack = {
  [API_DEVELOPER]: { "web-testing": [{ id: VITEST_ID, preloaded: true }] },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

describe("dual-scope same-source (both eject)", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let env: DualScopeEnv | undefined;
  let wizard: EditWizard | undefined;
  let seededTempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    await env?.destroy();
    env = undefined;
    if (seededTempDir) {
      await cleanupTempDir(seededTempDir);
      seededTempDir = undefined;
    }
  });

  it(
    "config dual-scope shape, bare agent ref, [P][G] badges, and s-toggle is a guarded no-op",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      env = await createDualScopeEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      // --- Check 1: project config carries the both-eject dual-scope pair. ---
      const loaded = await loadProjectConfigFromDir(projectDir);
      expect(loaded, "project config.ts must exist").not.toBeNull();
      if (!loaded) return;
      const honoEntries = loaded.config.skills.filter((s) => s.id === HONO_ID);

      const active = honoEntries.find((s) => s.excluded !== true);
      const tombstone = honoEntries.find((s) => s.excluded === true);
      expect(honoEntries).toHaveLength(2);
      expect(active).toStrictEqual({ id: HONO_ID, scope: "project", source: "eject" });
      expect(tombstone).toStrictEqual({
        id: HONO_ID,
        scope: "global",
        source: "eject",
        excluded: true,
      });

      // --- Check 2: compiled project agent references hono in BARE form. ---
      // api-developer is project-scoped and preloads hono; eject source ⇒ no
      // `id:id` colon form.
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(API_DEVELOPER, {
        contains: [HONO_ID],
        notContains: [HONO_PLUGIN_REF],
      });
      const agentPath = path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS, `${API_DEVELOPER}.md`);
      const agentContent = await readTestFile(agentPath);
      expect(agentContent).toContain(`  - ${HONO_ID}`);
      expect(agentContent).not.toContain(HONO_PLUGIN_REF);

      // --- Check 3: re-open edit → dual-scope [P][G] badges render for hono. ---
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      // hono lives in the API domain — advance from Web before reading badges.
      await wizard.build.advanceDomain();
      await wizard.build.focusSkill(HONO_LABEL);
      const badgesBefore = await wizard.build.getScopeBadgesForSkill(HONO_LABEL);
      expect([...badgesBefore].sort()).toStrictEqual(["G", "P"]);

      // --- Check 4: pressing `s` on a PERSISTED dual-scope pair is an
      // intentional guarded no-op (toggleSkillScope guard in wizard-store.ts) —
      // it does NOT collapse to a single global entry. Space is the sanctioned
      // collapse mechanism. The dual-scope badges remain unchanged. ---
      await wizard.build.toggleScopeOnFocusedSkill();
      const badgesAfter = await wizard.build.getScopeBadgesForSkill(HONO_LABEL);
      expect([...badgesAfter].sort()).toStrictEqual(["G", "P"]);

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "removing the GLOBAL copy (edit at global scope) leaves the project's own copy untouched",
    { timeout: TIMEOUTS.LIFECYCLE, retry: 0 },
    async () => {
      // Fresh seeded dual-scope env (do NOT chain off the previous test):
      //   global: vitest (eject) referenced by web-developer (preloaded:false)
      //           so it can be cleanly deselected at global scope.
      //   project: its OWN project-scope vitest (eject) referenced by
      //            api-developer (preloaded:true) + the inherited-global tombstone.
      // The project is registered so global-removal propagation runs against it.
      seededTempDir = await createTempDir();
      const globalHome = path.join(seededTempDir, "home");
      const projectDir = path.join(seededTempDir, "project");
      await mkdir(globalHome, { recursive: true });
      await mkdir(projectDir, { recursive: true });
      await createPermissionsFile(globalHome);
      await createPermissionsFile(projectDir);

      const globalConfig = buildProjectConfig({
        name: "dual-scope-global-eject",
        skills: buildSkillConfigs([VITEST_ID], { scope: "global", source: "eject" }),
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
        domains: ["web"],
        selectedAgents: [WEB_DEVELOPER],
        stack: globalStack,
        projects: [realpathSync(projectDir)],
      });
      await writeProjectConfig(globalHome, globalConfig);
      await createLocalSkill(globalHome, VITEST_ID, {
        description: "Global vitest copy",
        metadata: vitestMetadata,
      });

      const projectConfig = buildProjectConfig({
        name: "dual-scope-project-eject",
        skills: [
          ...buildSkillConfigs([VITEST_ID], { scope: "global", source: "eject", excluded: true }),
          ...buildSkillConfigs([VITEST_ID], { scope: "project", source: "eject" }),
        ],
        agents: buildAgentConfigs([API_DEVELOPER], { scope: "project" }),
        domains: ["web"],
        selectedAgents: [API_DEVELOPER],
        stack: projectStack,
      });
      await writeProjectConfig(projectDir, projectConfig);
      await createLocalSkill(projectDir, VITEST_ID, {
        description: "Project's own vitest copy",
        metadata: vitestMetadata,
      });

      // Real `cc edit` at global scope (HOME === projectDir === globalHome):
      // deselect vitest (preloaded:false on web-developer ⇒ freely deselectable).
      const globalEdit = await EditWizard.launch({
        projectDir: globalHome,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: globalHome },
        rows: 60,
        cols: 120,
      });
      try {
        await globalEdit.build.selectSkill(VITEST_LABEL); // deselect global vitest
        const sources = await globalEdit.build.passThroughAllDomainsGeneric();
        await sources.waitForReady();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();
        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();
      } finally {
        await globalEdit.destroy();
      }

      // Global config: vitest gone from the global skills[] and stack.
      const globalLoaded = await loadProjectConfigFromDir(globalHome);
      expect(globalLoaded, "global config.ts must exist").not.toBeNull();
      if (!globalLoaded) return;
      expect(globalLoaded.config.skills.map((s) => s.id)).not.toContain(VITEST_ID);
      expect(globalLoaded.config.stack?.[WEB_DEVELOPER]?.["web-testing"]).toBeUndefined();

      // Project config: the project's OWN project-scope vitest survives untouched.
      const projectLoaded = await loadProjectConfigFromDir(projectDir);
      expect(projectLoaded, "project config.ts must exist").not.toBeNull();
      if (!projectLoaded) return;
      const p = projectLoaded.config;

      // Proof-of-execution: propagation rewrote the project, dropping the stale
      // inherited-global vitest (tombstone). Guards against a vacuous pass on an
      // untouched file.
      expect(
        p.skills.filter((s) => s.scope === "global").length,
        "propagation must drop the inherited-global vitest from the project",
      ).toBe(0);

      const projectVitest = p.skills.find((s) => s.id === VITEST_ID && s.scope === "project");
      expect(projectVitest).toStrictEqual({ id: VITEST_ID, scope: "project", source: "eject" });
      expect(p.stack?.[API_DEVELOPER]?.["web-testing"]).toStrictEqual([
        { id: VITEST_ID, preloaded: true },
      ]);

      // Compiled project agent still references the project-scope vitest (bare).
      const compile = await CLI.run(
        ["compile", "--source", sourceDir],
        { dir: projectDir },
        {
          env: { HOME: globalHome },
        },
      );
      expect(compile.exitCode, compile.output).toBe(EXIT_CODES.SUCCESS);
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(API_DEVELOPER, {
        contains: [`  - ${VITEST_ID}`],
        notContains: [VITEST_PLUGIN_REF],
      });

      // Filesystem: the project's own ejected vitest skill dir survives.
      expect(
        await directoryExists(path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, VITEST_ID)),
        "project's own ejected vitest skill dir must remain after global removal",
      ).toBe(true);
    },
  );
});
