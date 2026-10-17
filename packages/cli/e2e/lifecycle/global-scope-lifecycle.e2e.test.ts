import path from "path";
import { CLI } from "../fixtures/cli.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { cleanupTempDir, configTypesTsPath } from "../helpers/test-utils.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  e2eStackPayload,
  installE2EStackDualScope,
  installFromSeed,
} from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  TS_NOT_ASSIGNABLE,
  probeConfigTypesNarrowing,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";

const SPLIT_INSTALL_ALIASES = ["SkillId", "AgentName", "Category"] as const;

/** Scope-blind regressions across the global-scope lifecycle. */

let store: SeedConfigStore;

beforeAll(async () => {
  store = await startSeedConfigStore();
});

afterAll(async () => {
  await store.close();
});

async function dualScopeEnv(): Promise<TestEnvironment> {
  const env = await createTestEnvironment();
  await installE2EStackDualScope(store, env);
  return env;
}

describe("global scope lifecycle -- doctor command", () => {
  let sharedEnv: TestEnvironment;

  beforeAll(async () => {
    sharedEnv = await dualScopeEnv();
  }, TIMEOUTS.LIFECYCLE);

  afterAll(async () => {
    await cleanupTempDir(sharedEnv.tempDir);
  });

  it("should not report false 'missing' for global-scoped agents", async () => {
    const { fakeHome, projectDir } = sharedEnv;

    const { exitCode, stdout } = await CLI.run(
      ["doctor"],
      { dir: projectDir },
      { env: { HOME: fakeHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).not.toContain(`${E2E_AGENT["web-developer"].name} (missing)`);
    // Pins the two counts equal; a bare "agents compiled" also matches the WARN row.
    expect(stdout).toMatch(/(\d+)\/\1 agents compiled/);
    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_TIP_COMPILE_AGENTS);
  });

  it("should not report false 'missing' for global-scoped skills", async () => {
    const { fakeHome, projectDir } = sharedEnv;

    const { exitCode, stdout } = await CLI.run(
      ["doctor"],
      { dir: projectDir },
      { env: { HOME: fakeHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).not.toContain(`${E2E_SKILL.react.id} (not found)`);
    expect(stdout).not.toContain(`${E2E_SKILL.vitest.id} (not found)`);
    expect(stdout).toContain("skills found");
  });
});

describe("global scope lifecycle -- uninstall with dual scope", () => {
  let env: TestEnvironment | undefined;

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "should remove project-scoped skills from project dir via uninstall --yes",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await dualScopeEnv();
      const { fakeHome, projectDir } = env;

      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      await expect({ dir: projectDir }).not.toHaveSkillCopied(E2E_SKILL.hono.id);
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.vitest.id);
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
    },
  );
});

describe("global scope lifecycle -- init with one skill in the project", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it(
    "should place global-scoped local skills at HOME and project-scoped at project dir",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // A project skill never reaches a global sub-agent, so React is assigned to none.
      await installFromSeed(
        store,
        "ReactInProject1",
        e2eStackPayload({
          projectSkills: [E2E_SKILL.react.id],
          unassigned: [E2E_SKILL.react.id],
        }),
        { dir: projectDir, home: fakeHome },
      );

      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        agents: ["web-developer"],
      });

      // The sub-agents rest at global scope, so the compiled agent lives at fakeHome.
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer"],
        notContains: [E2E_SKILL.react.id],
      });

      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.vitest.id);
      await expect({ dir: fakeHome }).not.toHaveSkillCopied(E2E_SKILL.react.id);
      await expect({ dir: projectDir }).not.toHaveSkillCopied(E2E_SKILL.vitest.id);

      // Both scopes probed: the project's aliases extend the global ones, so a global union
      // degraded to `string` would absorb the project's literals unseen.
      for (const scopeDir of [fakeHome, projectDir]) {
        const sourceFolder = path.dirname(configTypesTsPath(scopeDir));
        const typecheck = await typecheckGeneratedConfig(sourceFolder);
        expect(
          typecheck.exitCode,
          `the config written at ${scopeDir} must type-check against its own types.\ntsc output:\n${typecheck.output}`,
        ).toBe(EXIT_CODES.SUCCESS);
        const probe = await probeConfigTypesNarrowing(sourceFolder, SPLIT_INSTALL_ALIASES);
        expect(
          probe.exitCode,
          `a bogus literal must not type-check at ${scopeDir}.\ntsc output:\n${probe.output || "(no diagnostics — the unions accept everything)"}`,
        ).not.toBe(EXIT_CODES.SUCCESS);
        expect(probe.output).toContain(TS_NOT_ASSIGNABLE);
        // Each alias: the checks above hold while one rejects and the rest collapsed to `string`.
        expect(
          probe.rejected,
          `every alias asked for must reject its bogus literal.\ntsc output:\n${probe.output}`,
        ).toStrictEqual([...SPLIT_INSTALL_ALIASES]);
      }
    },
  );
});
