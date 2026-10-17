import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TIMEOUTS, EXIT_CODES, SOURCE_PATHS, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";
import {
  MONOREPO_ROOT,
  agentsPath,
  createTempDir,
  cleanupTempDir,
  directoryExists,
} from "../helpers/test-utils.js";
import { readActiveAgentNames } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { listCompiledAgentNames } from "../../src/cli/lib/agents/list-compiled-agents.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `init --from` against the real local skills repository (`--marketplace` at the local clone, so
 * no network). Skipped when that directory is absent; `SKILLS_SOURCE` overrides it.
 */

// A sibling checkout of the monorepo, hence MONOREPO_ROOT rather than the CLI package root.
const SKILLS_SOURCE = process.env.SKILLS_SOURCE ?? path.resolve(MONOREPO_ROOT, "../skills");

const REAL_INSTALL_TIMEOUT = TIMEOUTS.PLUGIN_INSTALL;

const hasSkillsSource = await directoryExists(path.join(SKILLS_SOURCE, SOURCE_PATHS.SKILLS_DIR));

/**
 * A ref names the marketplace that resolved it; a bare `toContain("agents-inc")` is this CLI's own
 * name and passes whichever marketplace answered.
 */
const INSTALLED_SKILL_REFS = [
  "web-framework-react@agents-inc",
  "web-meta-framework-nextjs@agents-inc",
] as const;

const WEB_DEV = E2E_AGENT["web-developer"].name;
const INSTALLED_ID = "RealMkt1";

const pluginOnWebDev = buildSeedSkill({
  install: "plugin",
  scope: "global",
  assignments: { [WEB_DEV]: "lazy" },
});

describe.skipIf(!hasSkillsSource)("real marketplace", () => {
  let projectDir: string;
  let store: SeedConfigStore;
  let initOutput: string;
  // One shared HOME for the init and every follow-up run, so they resolve the same global root.
  let sharedHome: string;

  beforeAll(async () => {
    projectDir = await createTempDir();
    sharedHome = await createTempDir();
    store = await startSeedConfigStore();
    store.publish(
      INSTALLED_ID,
      buildSeedPayload({
        skills: {
          "web-framework-react": pluginOnWebDev,
          "web-meta-framework-nextjs": pluginOnWebDev,
        },
        agents: { [WEB_DEV]: { on: true, scope: "global" } },
      }),
    );

    const result = await runInitFrom(
      store,
      INSTALLED_ID,
      { dir: projectDir, globalHome: sharedHome },
      SKILLS_SOURCE,
    );
    initOutput = result.output;
    expect(result.exitCode, initOutput).toBe(EXIT_CODES.SUCCESS);
  }, REAL_INSTALL_TIMEOUT);

  afterAll(async () => {
    await store.close();
    if (projectDir) {
      await cleanupTempDir(projectDir);
    }
    if (sharedHome) {
      await cleanupTempDir(sharedHome);
    }
  });

  describe("init --from with real marketplace", () => {
    it("should have installed the real skills the configuration names", () => {
      INSTALLED_SKILL_REFS.forEach((ref) => expect(initOutput).toContain(ref));
    });

    it("should have created config.ts with agents-inc source", async () => {
      await expect({ dir: projectDir }).toHaveConfig({
        origin: "agents-inc",
        agents: [WEB_DEV],
      });
    });

    it("should have installed exactly the sub-agents the configuration names", async () => {
      expect(
        await readActiveAgentNames(projectDir),
        "config.ts must name exactly the sub-agents the configuration switches on",
      ).toStrictEqual([WEB_DEV]);

      const compiled = await listCompiledAgentNames(agentsPath(sharedHome));
      expect(
        compiled.sort(),
        "the compiled agents on disk must be exactly that roster",
      ).toStrictEqual([WEB_DEV]);
    });

    it("should have compiled agents with real content", async () => {
      await expect({ dir: sharedHome }).toHaveCompiledAgent(WEB_DEV);
    });

    it("should have displayed completion details", () => {
      expect(initOutput).toContain(STEP_TEXT.AGENTS_COMPILED_TO);
      expect(initOutput).toContain(STEP_TEXT.CONFIGURATION_LABEL);
    });
  });

  describe("compile with real installed project", () => {
    it("should compile agents to project output directory", async () => {
      const { exitCode } = await CLI.run(
        ["compile"],
        { dir: projectDir, globalHome: sharedHome },
        {
          env: { CC_MARKETPLACE: undefined },
        },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      await expect({ dir: sharedHome }).toHaveCompiledAgent(WEB_DEV);
    });
  });

  describe("list after real install", () => {
    it("should show installed skills and agents", async () => {
      const { exitCode, stdout } = await CLI.run(["list"], {
        dir: projectDir,
        globalHome: sharedHome,
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).not.toContain(STEP_TEXT.NO_INSTALLATION);
      // `list` prints a summary, so the counts are what it can be held to.
      expect(stdout).toMatch(new RegExp(`Skills:\\s+${INSTALLED_SKILL_REFS.length}`));
      expect(stdout).toMatch(/Agents:\s+1\b/);
    });
  });
});
