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

/** The aliases a scope-split install fills in at each scope it writes. */
const SPLIT_INSTALL_ALIASES = ["SkillId", "AgentName", "Category"] as const;

/**
 * Global scope lifecycle E2E tests -- regression coverage for scope-blind bugs.
 */

let store: SeedConfigStore;

beforeAll(async () => {
  store = await startSeedConfigStore();
});

afterAll(async () => {
  await store.close();
});

/** The dual-scope installation, in a fresh environment. */
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
    // `toContain("agents compiled")` is a fragment the PASS row and the WARN row
    // both carry ("N/N agents compiled" vs "N agents need recompilation" plus its
    // detail lines), so only the negative above discriminated. It was replaced by
    // the back-reference below, which pins the two counts EQUAL and so cannot be
    // satisfied by the warn row. An empty `toContain(``)` sat here between those
    // two facts until 2026-08-23 — true of every string, and the residue of the
    // removal rather than a fourth assertion.
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

      // The stack at global scope, but React in the project. A project skill never reaches a
      // global sub-agent, so React is assigned to none.
      await installFromSeed(
        store,
        "ReactInProject1",
        e2eStackPayload({
          projectSkills: [E2E_SKILL.react.id],
          unassigned: [E2E_SKILL.react.id],
        }),
        { dir: projectDir, home: fakeHome },
      );

      // --- Config content assertions ---
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        agents: ["web-developer"],
      });

      // --- Agent compilation assertions ---
      // The sub-agents rest at global scope, so the compiled agent lives at fakeHome,
      // not projectDir.
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer"],
        notContains: [E2E_SKILL.react.id],
      });

      // --- Scope-aware copy assertions ---
      await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
      await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.vitest.id);
      await expect({ dir: fakeHome }).not.toHaveSkillCopied(E2E_SKILL.react.id);
      await expect({ dir: projectDir }).not.toHaveSkillCopied(E2E_SKILL.vitest.id);

      // --- Generated type surface, at both scopes ---
      // A split install writes one config.ts per scope and one config-types.ts
      // beside each. The project's aliases EXTEND the global ones, so a global
      // union that degraded to `string` would absorb the project's literals and
      // neither file would look wrong on its own — which is why both are probed
      // rather than just the scope this flow's assertions above are about.
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
        // EACH alias, not any: the two above hold while one alias rejects and the others have
        // collapsed to `string`.
        expect(
          probe.rejected,
          `every alias asked for must reject its bogus literal.\ntsc output:\n${probe.output}`,
        ).toStrictEqual([...SPLIT_INSTALL_ALIASES]);
      }
    },
  );
});
