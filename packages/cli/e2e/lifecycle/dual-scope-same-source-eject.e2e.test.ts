import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { applyEditFrom } from "../fixtures/e2e-stack-seed.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  FORKED_FROM_METADATA,
  loadConfigOrFail,
  renderMetadataYaml,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
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
 * The seeded pair has its GLOBAL copy removed by a real `edit --from` at global
 * scope, and the project's own project-scope copy must survive — config,
 * compiled agent reference, and filesystem.
 *
 * The MIXED plugin/eject matrix is covered separately by
 * dual-scope-edit-mixed-sources.e2e.test.ts — this file is strictly the
 * both-eject cell.
 */

// A NON-framework skill, seeded preloaded:true on the project agent so its
// compiled-agent reference form is asserted.
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

/** The global installation's configuration without vitest: its sub-agent on, holding nothing. */
const WITHOUT_VITEST_ID = "NoVitst1";

describe("dual-scope same-source (both eject)", () => {
  let store: SeedConfigStore;
  let seededTempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      WITHOUT_VITEST_ID,
      buildSeedPayload({
        agents: { [E2E_AGENT["web-developer"].name]: { on: true, scope: "global" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (seededTempDir) {
      await cleanupTempDir(seededTempDir);
      seededTempDir = undefined;
    }
  });

  it(
    "removing the GLOBAL copy (edit --from at global scope) leaves the project's own copy untouched",
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
        marketplace: E2E_SOURCE.sourceDir,
        skills: buildSkillConfigs([VITEST_ID], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
        stack: globalStack,
        projects: [realpathSync(projectDir)],
      });
      await writeProjectConfig(globalHome, globalConfig);
      // Fork provenance, so the round trip owns the copy and the apply may remove it.
      await createLocalSkill(globalHome, VITEST_ID, {
        description: "Global vitest copy",
        metadata: FORKED_FROM_METADATA,
      });

      const projectConfig = buildProjectConfig({
        name: "dual-scope-project-eject",
        marketplace: E2E_SOURCE.sourceDir,
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

      // A real `edit --from` at global scope (HOME === cwd === globalHome) of a
      // configuration that leaves vitest out.
      const globalEdit = await applyEditFrom(store, WITHOUT_VITEST_ID, { dir: globalHome });
      expect(globalEdit.exitCode, globalEdit.output).toBe(EXIT_CODES.SUCCESS);

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
