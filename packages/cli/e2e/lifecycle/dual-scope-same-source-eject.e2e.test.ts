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

// Preloaded on the project agent so its compiled reference form is asserted.
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

/** Its sub-agent stays on, holding nothing. */
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

      const globalEdit = await applyEditFrom(store, WITHOUT_VITEST_ID, { dir: globalHome });
      expect(globalEdit.exitCode, globalEdit.output).toBe(EXIT_CODES.SUCCESS);

      const globalLoaded = await loadConfigOrFail(globalHome);
      expect(globalLoaded.skills.map((s) => s.id)).not.toContain(VITEST_ID);
      expect(
        globalLoaded.stack?.[E2E_AGENT["web-developer"].name]?.["web-testing"],
      ).toBeUndefined();

      const p = await loadConfigOrFail(projectDir);

      // Proof propagation rewrote the project, against a vacuous pass on an untouched file.
      expect(
        p.skills.filter((s) => s.scope === "global").length,
        "propagation must drop the inherited-global vitest from the project",
      ).toBe(0);

      const projectVitest = p.skills.find((s) => s.id === VITEST_ID && s.scope === "project");
      expect(projectVitest).toStrictEqual({ id: VITEST_ID, scope: "project", origin: "eject" });
      expect(p.stack?.[E2E_AGENT["api-developer"].name]?.["web-testing"]).toStrictEqual([
        { id: VITEST_ID, preloaded: true },
      ]);

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

      expect(
        await directoryExists(path.join(skillsPath(projectDir), VITEST_ID)),
        "project's own ejected vitest skill dir must remain after global removal",
      ).toBe(true);
    },
  );
});
