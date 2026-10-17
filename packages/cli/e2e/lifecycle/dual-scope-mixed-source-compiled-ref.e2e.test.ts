import { mkdir } from "fs/promises";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  loadConfigOrFail,
  readTestFile,
  renderMetadataYaml,
  runCLI,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureProjectConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * A skill at both scopes with different sources (plugin vs eject) compiles in the format of the
 * ACTIVE (project) entry: bare `id` for eject, `id:id` for plugin. `sourceById` is keyed by
 * `SkillId` alone, so both halves reaching it could stamp the wrong source.
 */

const HONO = E2E_SKILL.hono.id;
const HONO_PLUGIN_REF = `${HONO}:${HONO}`;
const MARKET = "test-marketplace";

const HONO_METADATA = renderMetadataYaml({
  domain: "api",
  author: "@agents-inc",
  displayName: E2E_SKILL.hono.display,
  category: "api-api",
  slug: "hono",
  cliDescription: "Hono edge framework",
  usageGuidance: "Use when testing E2E scenarios",
  contentHash: "a1b2c3d",
});

const projectStack = {
  [E2E_AGENT["api-developer"].name]: {
    "api-api": [{ id: HONO, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

// The same skill on a global agent, so each scope's format is checked independently.
const globalStack = {
  [E2E_AGENT["web-developer"].name]: {
    "api-api": [{ id: HONO, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

async function seedScope(
  baseDir: string,
  config: Partial<FixtureProjectConfig> & Pick<FixtureProjectConfig, "name">,
  source: string,
): Promise<void> {
  await mkdir(baseDir, { recursive: true });
  await createPermissionsFile(baseDir);
  await createLocalSkill(baseDir, HONO, {
    description: "Hono edge framework",
    metadata: HONO_METADATA,
  });
  // `compile` takes no `--marketplace` and reads no `CC_MARKETPLACE`, so the source goes here.
  await writeProjectConfig(baseDir, { ...config, marketplace: source });
}

describe("dual-scope mixed-source compiled agent ref format", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "global=plugin, project=eject: project agent renders bare id, global agent renders id:id",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const fakeHome = path.join(tempDir, "home");
      const projectDir = path.join(tempDir, "project");

      await seedScope(
        fakeHome,
        {
          name: "dual-global-plugin",
          skills: buildSkillConfigs([HONO], { scope: "global", origin: MARKET }),
          agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
          stack: globalStack,
          projects: [projectDir],
        },
        E2E_SOURCE.sourceDir,
      );

      // Tombstone first, active entry second: the production config-writer order.
      await seedScope(
        projectDir,
        {
          name: "dual-project-eject",
          skills: [
            ...buildSkillConfigs([HONO], { scope: "global", origin: MARKET, excluded: true }),
            ...buildSkillConfigs([HONO], { scope: "project", origin: "eject" }),
          ],
          agents: buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "project" }),
          stack: projectStack,
        },
        E2E_SOURCE.sourceDir,
      );

      // A compile inside a project writes only that project, so the global agent needs its own run.
      const globalResult = await runCLI(["compile"], fakeHome, {
        env: { HOME: fakeHome },
      });
      expect(globalResult.exitCode, `global compile failed:\n${globalResult.combined}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      const result = await runCLI(["compile"], projectDir, {
        env: { HOME: fakeHome },
      });
      expect(result.exitCode, `compile failed:\n${result.combined}`).toBe(EXIT_CODES.SUCCESS);

      // Compile must not rewrite config.
      const projectConfig = await loadConfigOrFail(projectDir);
      expect(projectConfig.skills).toStrictEqual([
        { id: HONO, scope: "global", origin: MARKET, excluded: true },
        { id: HONO, scope: "project", origin: "eject" },
      ]);

      const projectAgent = await readTestFile(
        path.join(agentsPath(projectDir), `${E2E_AGENT["api-developer"].name}.md`),
      );
      expect(projectAgent).toContain(HONO);
      expect(
        projectAgent,
        "project/eject active entry must render bare id, not the plugin ref",
      ).not.toContain(HONO_PLUGIN_REF);

      const globalAgent = await readTestFile(
        path.join(agentsPath(fakeHome), `${E2E_AGENT["web-developer"].name}.md`),
      );
      expect(globalAgent, "global/plugin active entry must render the plugin ref id:id").toContain(
        HONO_PLUGIN_REF,
      );
    },
  );

  it(
    "global=eject, project=plugin: project agent renders id:id, global agent renders bare id",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const fakeHome = path.join(tempDir, "home");
      const projectDir = path.join(tempDir, "project");

      await seedScope(
        fakeHome,
        {
          name: "dual-global-eject",
          skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
          agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
          stack: globalStack,
          projects: [projectDir],
        },
        E2E_SOURCE.sourceDir,
      );

      // Tombstone first, active entry second: the production config-writer order.
      await seedScope(
        projectDir,
        {
          name: "dual-project-plugin",
          skills: [
            ...buildSkillConfigs([HONO], { scope: "global", origin: "eject", excluded: true }),
            ...buildSkillConfigs([HONO], { scope: "project", origin: MARKET }),
          ],
          agents: buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "project" }),
          stack: projectStack,
        },
        E2E_SOURCE.sourceDir,
      );

      // A compile inside a project writes only that project, so the global agent needs its own run.
      const globalResult = await runCLI(["compile"], fakeHome, {
        env: { HOME: fakeHome },
      });
      expect(globalResult.exitCode, `global compile failed:\n${globalResult.combined}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      const result = await runCLI(["compile"], projectDir, {
        env: { HOME: fakeHome },
      });
      expect(result.exitCode, `compile failed:\n${result.combined}`).toBe(EXIT_CODES.SUCCESS);

      const projectConfig = await loadConfigOrFail(projectDir);
      expect(projectConfig.skills).toStrictEqual([
        { id: HONO, scope: "global", origin: "eject", excluded: true },
        { id: HONO, scope: "project", origin: MARKET },
      ]);

      const projectAgent = await readTestFile(
        path.join(agentsPath(projectDir), `${E2E_AGENT["api-developer"].name}.md`),
      );
      expect(
        projectAgent,
        "project/plugin active entry must render the plugin ref id:id",
      ).toContain(HONO_PLUGIN_REF);

      const globalAgent = await readTestFile(
        path.join(agentsPath(fakeHome), `${E2E_AGENT["web-developer"].name}.md`),
      );
      expect(globalAgent).toContain(HONO);
      expect(
        globalAgent,
        "global/eject active entry must render bare id, not the plugin ref",
      ).not.toContain(HONO_PLUGIN_REF);
    },
  );
});
