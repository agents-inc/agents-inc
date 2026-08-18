import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { createDualScopeEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  agentsPath,
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  loadConfigOrFail,
  readTestFile,
  renderMetadataYaml,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";

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

const HONO_ID = E2E_SKILL.hono.id;
const HONO_PLUGIN_REF = `${HONO_ID}:${HONO_ID}`;

// Check 5 uses a NON-framework skill (web-testing-vitest). Framework skills
// (api-framework-hono) are required and cannot be deselected at global scope,
// so an isolated global-only removal is only expressible with a non-framework
// skill — the same reason edit-global-remove-dual-scope-partial.e2e.test.ts
// uses vitest. It is seeded preloaded:true on the project agent so its
// compiled-agent reference form is still asserted.
const VITEST_ID = E2E_SKILL.vitest.id;
const VITEST_PLUGIN_REF = `${VITEST_ID}:${VITEST_ID}`;

const vitestMetadata = renderMetadataYaml({
  author: "@agents-inc",
  displayName: E2E_SKILL.vitest.display,
  category: "web-testing",
  slug: "vitest",
  cliDescription: "E2E test skill",
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: "b2c3d4e",
});

const globalStack = {
  [E2E_AGENT["web-developer"].name]: { "web-testing": [{ id: VITEST_ID, preloaded: false }] },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const projectStack = {
  [E2E_AGENT["api-developer"].name]: { "web-testing": [{ id: VITEST_ID, preloaded: true }] },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

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
    "config dual-scope shape, bare agent ref, [P][G] badges, and s-toggle collapses the pair",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createDualScopeEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      // --- Check 1: project config carries the both-eject dual-scope pair. ---
      const projectConfig = await loadConfigOrFail(projectDir);
      const honoEntries = projectConfig.skills.filter((s) => s.id === HONO_ID);

      const active = honoEntries.find((s) => s.excluded !== true);
      const tombstone = honoEntries.find((s) => s.excluded === true);
      expect(honoEntries).toHaveLength(2);
      expect(active).toStrictEqual({ id: HONO_ID, scope: "project", origin: "eject" });
      expect(tombstone).toStrictEqual({
        id: HONO_ID,
        scope: "global",
        origin: "eject",
        excluded: true,
      });

      // --- Check 2: compiled project agent references hono in BARE form. ---
      // api-developer is project-scoped and preloads hono; eject source ⇒ no
      // `id:id` colon form.
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["api-developer"].name,
        {
          contains: [HONO_ID],
          notContains: [HONO_PLUGIN_REF],
        },
      );
      const agentPath = path.join(agentsPath(projectDir), `${E2E_AGENT["api-developer"].name}.md`);
      const agentContent = await readTestFile(agentPath);
      expect(agentContent).toContain(`  - ${HONO_ID}`);
      expect(agentContent).not.toContain(HONO_PLUGIN_REF);

      // --- Check 3: re-open edit → dual-scope [P][G] badges render for hono. ---
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      // hono lives in the API domain — advance from Web before reading badges.
      await wizard.build.advanceDomain();
      await wizard.build.focusSkill(E2E_SKILL.hono.display);
      const badgesBefore = await wizard.build.getScopeBadgesForSkill(E2E_SKILL.hono.display);
      expect([...badgesBefore].sort()).toStrictEqual(["G", "P"]);

      // --- Check 4: pressing `s` on a PERSISTED dual-scope pair collapses it to
      // the single inherited-global entry. `s` is the sole dual-scope toggle, and
      // the collapse is not blocked by the eject-collision guard: the snapshot's
      // global entry is the pair's tombstone (excluded), not an active global
      // eject install. The badges drop to a single `G`. ---
      await wizard.build.toggleScopeOnFocusedSkill();
      const badgesAfter = await wizard.build.getScopeBadgesForSkill(E2E_SKILL.hono.display);
      expect(badgesAfter, "`s` must collapse the persisted [P][G] pair to [G]").toStrictEqual([
        "G",
      ]);

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "removing the GLOBAL copy (edit at global scope) leaves the project's own copy untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
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
        skills: buildSkillConfigs([VITEST_ID], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
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
          ...buildSkillConfigs([VITEST_ID], { scope: "global", origin: "eject", excluded: true }),
          ...buildSkillConfigs([VITEST_ID], { scope: "project", origin: "eject" }),
        ],
        agents: buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "project" }),
        selectedDomains: ["web"],
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
        ...TERMINAL_SIZE.TALL,
      });
      try {
        await globalEdit.build.selectSkill(E2E_SKILL.vitest.display); // deselect global vitest
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
      const globalLoaded = await loadConfigOrFail(globalHome);
      expect(globalLoaded.skills.map((s) => s.id)).not.toContain(VITEST_ID);
      expect(
        globalLoaded.stack?.[E2E_AGENT["web-developer"].name]?.["web-testing"],
      ).toBeUndefined();

      // Project config: the project's OWN project-scope vitest survives untouched.
      const p = await loadConfigOrFail(projectDir);

      // Proof-of-execution: propagation rewrote the project, dropping the stale
      // inherited-global vitest (tombstone). Guards against a vacuous pass on an
      // untouched file.
      expect(
        p.skills.filter((s) => s.scope === "global").length,
        "propagation must drop the inherited-global vitest from the project",
      ).toBe(0);

      const projectVitest = p.skills.find((s) => s.id === VITEST_ID && s.scope === "project");
      expect(projectVitest).toStrictEqual({ id: VITEST_ID, scope: "project", origin: "eject" });
      expect(p.stack?.[E2E_AGENT["api-developer"].name]?.["web-testing"]).toStrictEqual([
        { id: VITEST_ID, preloaded: true },
      ]);

      // Compiled project agent still references the project-scope vitest (bare).
      const compile = await CLI.run(
        ["compile"],
        { dir: projectDir },
        {
          env: { HOME: globalHome },
        },
      );
      expect(compile.exitCode, compile.output).toBe(EXIT_CODES.SUCCESS);
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["api-developer"].name,
        {
          contains: [`  - ${VITEST_ID}`],
          notContains: [VITEST_PLUGIN_REF],
        },
      );

      // Filesystem: the project's own ejected vitest skill dir survives.
      expect(
        await directoryExists(path.join(skillsPath(projectDir), VITEST_ID)),
        "project's own ejected vitest skill dir must remain after global removal",
      ).toBe(true);
    },
  );
});
