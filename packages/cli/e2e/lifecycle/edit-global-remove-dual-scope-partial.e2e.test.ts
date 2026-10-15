import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
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
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * Dual-scope partial removal: skill X is installed at BOTH scopes — a global copy
 * (in the global config, referenced by a global agent's stack) and the project's
 * own independent project-scoped copy (referenced by a project-scoped agent's
 * stack). Removing ONLY the global copy (`edit --from` at global scope) must strip X from
 * the global config while leaving the project's own project-scope entry — in both
 * skills[] and stack — completely untouched. The project is registered so global
 * propagation actually runs against it, proving it does not clobber the project's
 * own copy.
 */

const globalStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const projectStack = {
  [E2E_AGENT["api-developer"].name]: {
    "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

const vitestMetadata = renderMetadataYaml({
  displayName: E2E_SKILL.vitest.display,
  category: "web-testing",
  slug: E2E_SKILL.vitest.slug,
  cliDescription: "E2E test skill",
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: "c3d4e5f",
});

/** The global configuration with vitest left out: its sub-agent on, holding nothing. */
const WITHOUT_VITEST_ID = "NoVitst3";

describe("edit at global scope removes only the global copy of a dual-scope skill", () => {
  let store: SeedConfigStore;
  let tempDir: string | undefined;

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
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "strips the global copy and leaves the project-scope copy untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Seed a GLOBAL install (HOME === globalHome) that owns a global
      // vitest referenced by web-developer's stack, plus a registered project
      // that owns its OWN project-scoped vitest referenced by api-developer's
      // stack (and inlines the inherited global vitest in its skills[]).
      // ================================================================

      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "home");
      const projectDir = path.join(tempDir, "project");
      await mkdir(globalHome, { recursive: true });
      await mkdir(projectDir, { recursive: true });
      await createPermissionsFile(globalHome);
      await createPermissionsFile(projectDir);

      const globalConfig = buildProjectConfig({
        name: "dual-scope-global",
        marketplace: E2E_SOURCE.sourceDir,
        skills: buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
        stack: globalStack,
        projects: [realpathSync(projectDir)],
      });
      await writeProjectConfig(globalHome, globalConfig);
      // Fork provenance, so the round trip owns the copy and the apply may remove it.
      await createLocalSkill(globalHome, E2E_SKILL.vitest.id, {
        description: "Global vitest copy",
        metadata: FORKED_FROM_METADATA,
      });

      // Project config inlines the inherited global vitest AND carries its own
      // project-scoped vitest. api-developer (project-scoped) references it.
      const projectConfig = buildProjectConfig({
        name: "dual-scope-project",
        skills: [
          ...buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "global", origin: "eject" }),
          ...buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "project", origin: "eject" }),
        ],
        agents: buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "project" }),
        stack: projectStack,
      });
      await writeProjectConfig(projectDir, projectConfig);
      await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
        description: "Project's own vitest copy",
        metadata: vitestMetadata,
      });

      // ================================================================
      // Phase 2: Run `cc edit --from` at global scope, leaving vitest out. This
      // removes the GLOBAL copy only and triggers propagation to the project.
      // ================================================================

      const result = await applyEditFrom(store, WITHOUT_VITEST_ID, { dir: globalHome });
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      // ================================================================
      // Phase 3a: Global config — vitest gone from skills[] and stack.
      // ================================================================

      const g = await loadConfigOrFail(globalHome);
      expect(g.skills.map((s) => s.id)).not.toContain(E2E_SKILL.vitest.id);
      expect(g.stack?.[E2E_AGENT["web-developer"].name]?.["web-testing"]).toBeUndefined();

      // ================================================================
      // Phase 3b: Project config — the project's OWN project-scope vitest entry
      // (skills[] and stack) is completely untouched. Proof-of-execution: the
      // inherited global vitest is dropped, showing propagation actually ran.
      // ================================================================

      const p = await loadConfigOrFail(projectDir);

      // Proof-of-execution: propagation rewrote the project, dropping the stale
      // inherited global vitest. Without this, the assertions below could pass
      // vacuously on an untouched file.
      expect(
        p.skills.filter((s) => s.scope === "global").length,
        "propagation must drop the inherited global vitest from the project",
      ).toBe(0);

      // The project's own project-scope vitest survives, unchanged.
      const projectVitest = p.skills.find(
        (s) => s.id === E2E_SKILL.vitest.id && s.scope === "project",
      );
      expect(
        projectVitest,
        "project's own project-scope vitest must survive the global removal",
      ).toStrictEqual({ id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" });

      // The project agent's stack still references its project-scope vitest.
      expect(
        p.stack?.[E2E_AGENT["api-developer"].name]?.["web-testing"],
        "project agent stack must still reference the project-scope vitest",
      ).toStrictEqual([{ id: E2E_SKILL.vitest.id, preloaded: false }]);

      // Filesystem side: the project's own eject skill dir is untouched.
      expect(
        await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.vitest.id)),
        "project's own vitest skill dir must remain",
      ).toBe(true);
    },
  );
});
