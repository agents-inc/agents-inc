import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { TIMEOUTS, EXIT_CODES } from "../pages/constants.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  createPermissionsFile,
  createTempDir,
  fileExists,
  loadConfigOrFail,
  readTestFile,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { isClaudeCLIAvailable } from "../helpers/test-utils.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";

const claudeAvailable = await isClaudeCLIAvailable();

const API_DOMAIN = "api";

/** No config here declares it, so a `Domain` listing every known domain fails. */
const UNDECLARED_DOMAIN = "mobile";

const EJECT_STACK_ID = "ScopeIn1";

const PLUGIN_STACK_ID = "ScopeIn2";

const PROJECT_PLUGIN_HONO_ID = "ScopeIn3";

let store: SeedConfigStore;

beforeAll(async () => {
  store = await startSeedConfigStore();
  store.publish(EJECT_STACK_ID, e2eStackPayload({ scope: "global" }));
  store.publish(PLUGIN_STACK_ID, e2eStackPayload({ scope: "global", install: "plugin" }));
  store.publish(
    PROJECT_PLUGIN_HONO_ID,
    e2eStackPayload({
      scope: "global",
      install: "plugin",
      projectSkills: [E2E_SKILL.hono.id],
      projectAgents: [E2E_AGENT["api-developer"].name],
    }),
  );
});

afterAll(async () => {
  await store.close();
});

describe("config-scope integrity -- global stack scope filtering", () => {
  // Blocked: project-scoped skills require a local copy, and the source path does not resolve
  // from a consuming project.
  it.todo("should not reference project-scoped skills in global config stack section");
});

describe("config-scope integrity -- domains in global config only", () => {
  it.todo("should store ALL domains in global config and no domains in project config");
});

describe("config-scope integrity -- config-types Domain type includes config.domains", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it(
    "should include all config.domains in config-types.ts Domain type even when some domains have no skills",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const fakeHome = path.join(tempDir, "fake-home");

      await mkdir(fakeHome, { recursive: true });
      await createPermissionsFile(fakeHome);

      const initResult = await runInitFrom(
        store,
        EJECT_STACK_ID,
        { dir: fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(initResult.exitCode, `Phase A init failed: ${initResult.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // Remove api skills by hand while keeping the "api" domain.
      const configPath = configTsPath(fakeHome);
      const originalConfig = await readTestFile(configPath);

      // Removes every api-framework-hono entry, prefix included, keyed on the emitted shape.
      // `[^{}]*` keeps each match inside the innermost object so braces stay balanced.
      const modifiedConfig = originalConfig.replace(
        new RegExp(
          `(?:'[\\w-]+'\\s*:\\s*)?\\{[^{}]*\\bid\\s*:\\s*'${E2E_SKILL.hono.id}'[^{}]*\\},?\\s*`,
          "g",
        ),
        "",
      );

      await writeFile(configPath, modifiedConfig);

      // Read structurally: a regex scan would answer a format change with "no such skill".
      const editedConfig = await loadConfigOrFail(fakeHome);
      expect(editedConfig.selectedDomains).toContain(API_DOMAIN);
      expect(editedConfig.skills.map((skill) => skill.id)).not.toContain(E2E_SKILL.hono.id);

      const compiled = await CLI.run(["compile"], { dir: fakeHome });
      expect(compiled.exitCode, `Phase C compile failed: ${compiled.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      const configTypesPath = configTypesTsPath(fakeHome);
      expect(await fileExists(configTypesPath), "config-types.ts must exist after compile").toBe(
        true,
      );

      const configTypesContent = await readTestFile(configTypesPath);

      expect(configTypesContent).toContain("AUTO-GENERATED");

      const domainTypeMatch = configTypesContent.match(/export type Domain\s*=\s*([\s\S]*?);/);
      expect(domainTypeMatch, "config-types.ts must contain a Domain type").not.toBeNull();
      const domainTypeBlock = domainTypeMatch![1];

      // "api" included though its skills were removed; the negative catches a list of all domains.
      for (const domain of editedConfig.selectedDomains ?? []) {
        expect(domainTypeBlock).toContain(`'${domain}'`);
      }
      expect(domainTypeBlock).not.toContain(`'${UNDECLARED_DOMAIN}'`);
    },
  );
});

describe.skipIf(!claudeAvailable)(
  "config-scope integrity -- global config includes source field",
  () => {
    let tempDir: string;
    // Plugin-capable: a source without `.claude-plugin/marketplace.json` refuses plugin mode.
    let pluginSource: E2EPluginSource;

    beforeAll(async () => {
      pluginSource = await createE2EPluginSource();
    }, TIMEOUTS.SETUP_DUAL);

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
      }
    });

    /**
     * Pins the writer's emission of `marketplace`; `splitConfigByScope`'s spread is guarded in
     * `config-generator.test.ts`, since the inlining writer supplies the field another way here.
     */
    it(
      "should include source field in both global and project configs after scope split",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome, projectDir } = env;

        const phaseA = await runInitFrom(
          store,
          PLUGIN_STACK_ID,
          { dir: fakeHome },
          pluginSource.sourceDir,
        );
        expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

        const phaseB = await runInitFrom(
          store,
          PROJECT_PLUGIN_HONO_ID,
          { dir: projectDir, globalHome: fakeHome },
          pluginSource.sourceDir,
        );
        expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);

        expect(
          (await loadConfigOrFail(fakeHome)).marketplace,
          "Global config must record the marketplace",
        ).toBe(pluginSource.sourceDir);

        expect(
          (await loadConfigOrFail(projectDir)).marketplace,
          "Project config must record the marketplace",
        ).toBe(pluginSource.sourceDir);
      },
    );
  },
);
