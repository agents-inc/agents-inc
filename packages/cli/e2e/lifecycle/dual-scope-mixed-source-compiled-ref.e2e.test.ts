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
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureProjectConfig, FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * Dual-scope MIXED source-mode + compiled-agent ref-format verification.
 *
 * A skill can be installed at BOTH scopes: the project owns an active copy
 * `{id, scope:"project", source}` while the global install is masked by a
 * tombstone `{id, scope:"global", excluded:true, source}`. When the two halves
 * carry DIFFERENT sources (plugin vs eject), the compiled agent must render the
 * skill in the format dictated by the ACTIVE (project) entry:
 *   - eject  -> bare `id`
 *   - plugin -> `id:id` (PluginSkillRef form)
 *
 * `buildCompileAgents` (local-installer.ts) builds `sourceById` keyed by
 * `SkillId` ALONE. If both halves of a dual-scope pair reached it, the map's
 * last-write-wins could stamp the WRONG source onto the compiled ref. This
 * suite drives the REAL production compile command (`cc compile`) against a
 * genuine dual-scope config to prove which format the active entry produces —
 * the first end-to-end exercise of this path (the unit test constructs
 * AgentConfig directly, bypassing buildCompileAgents).
 *
 * The active project skill's content is ejected to `.claude/skills/` so the
 * compiler can resolve it; the ref FORMAT is driven purely by the config
 * `source` string, independent of content location.
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

// Project agent (api-developer) preloads hono — appears in compiled frontmatter.
const projectStack = {
  [E2E_AGENT["api-developer"].name]: {
    "api-api": [{ id: HONO, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

// Global agent (web-developer) also preloads hono so the SAME skill id renders
// under the GLOBAL scope's source — proving per-scope format independence.
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
  // The source belongs in the config: `compile` takes no `--marketplace` and reads no
  // `CC_MARKETPLACE` — both are `init`'s — so this is where it reads one from.
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

      // Global install: hono active at global scope, sourced from the marketplace (plugin).
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

      // Project override: global tombstone FIRST (production config-writer order),
      // active project entry SECOND. Project copy is ejected (source:"eject").
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

      // The global agent is compiled by a run in the GLOBAL context: a compile
      // inside a project writes only that project.
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

      // Config check: dual-scope pair intact after compile (compile must not rewrite config).
      const projectConfig = await loadConfigOrFail(projectDir);
      expect(projectConfig.skills).toStrictEqual([
        { id: HONO, scope: "global", origin: MARKET, excluded: true },
        { id: HONO, scope: "project", origin: "eject" },
      ]);

      // CRITICAL CHECK: project (active=eject) agent renders BARE id, NOT id:id.
      const projectAgent = await readTestFile(
        path.join(agentsPath(projectDir), `${E2E_AGENT["api-developer"].name}.md`),
      );
      expect(projectAgent).toContain(HONO);
      expect(
        projectAgent,
        "project/eject active entry must render bare id, not the plugin ref",
      ).not.toContain(HONO_PLUGIN_REF);

      // Cross-scope evidence: the GLOBAL (active=plugin) agent renders id:id for the SAME skill.
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

      // Global install: hono active at global scope, ejected (source:"eject").
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

      // Project override: global tombstone FIRST (ejected), active project entry
      // SECOND, sourced from the marketplace (plugin).
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

      // The global agent is compiled by a run in the GLOBAL context: a compile
      // inside a project writes only that project.
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

      // CRITICAL CHECK: project (active=plugin) agent renders id:id.
      const projectAgent = await readTestFile(
        path.join(agentsPath(projectDir), `${E2E_AGENT["api-developer"].name}.md`),
      );
      expect(
        projectAgent,
        "project/plugin active entry must render the plugin ref id:id",
      ).toContain(HONO_PLUGIN_REF);

      // Cross-scope evidence: the GLOBAL (active=eject) agent renders bare id.
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
