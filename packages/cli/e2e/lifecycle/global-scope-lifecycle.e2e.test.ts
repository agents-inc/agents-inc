import path from "path";
import { CLI } from "../fixtures/cli.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { cleanupTempDir, configTypesTsPath, ensureBinaryExists } from "../helpers/test-utils.js";
import {
  createDualScopeEnv,
  createTestEnvironment,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
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

// Shared E2E source across all suites in this file

beforeAll(async () => {
  await ensureBinaryExists();
}, TIMEOUTS.SETUP_DUAL);

describe("global scope lifecycle -- source loader merge", () => {
  let env: DualScopeEnv | undefined;

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
  });

  it(
    "edit wizard should detect both global and project local skills after dual-scope init",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createDualScopeEnv(E2E_SOURCE);

      const wizard = await EditWizard.launch({
        projectDir: env.projectDir,
        source: E2E_SOURCE,
        env: { HOME: env.fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const sources = await wizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();

      // The Sources grid labels each row with the skill's TITLE, so that is what a
      // "both scopes were merged" assertion reads — the namespaced id it is
      // published under is never painted.
      const sourcesOutput = wizard.getOutput();
      expect(sourcesOutput).toContain(E2E_SKILL.react.display);
      expect(sourcesOutput).toContain(E2E_SKILL.vitest.display);
      expect(sourcesOutput).toContain(E2E_SKILL.hono.display);

      await wizard.destroy();
    },
  );
});

describe("global scope lifecycle -- doctor command", () => {
  let sharedEnv: DualScopeEnv;

  beforeAll(async () => {
    sharedEnv = await createDualScopeEnv(E2E_SOURCE);
  }, TIMEOUTS.LIFECYCLE);

  afterAll(async () => {
    await sharedEnv.destroy();
  });

  it("should not report false 'missing' for global-scoped agents", async () => {
    const { fakeHome, projectDir } = sharedEnv;

    const { exitCode, stdout } = await CLI.run(
      ["doctor"],
      { dir: projectDir },
      { env: { HOME: fakeHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).not.toContain("web-developer (missing)");
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
  let env: DualScopeEnv | undefined;

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
  });

  it(
    "should remove project-scoped skills from project dir via uninstall --yes",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createDualScopeEnv(E2E_SOURCE);
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

describe("global scope lifecycle -- init wizard with scope toggling", () => {
  let tempDir: string;
  let wizard: InitWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
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

      // Run init wizard from project dir with HOME pointing to fakeHome
      wizard = await InitWizard.launch({
        projectDir,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      // Stack -> Domain -> Build
      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      // Web domain -- toggle web-framework-react to project scope, focused
      // explicitly rather than relying on where the grid opens.
      await build.focusSkill(E2E_SKILL.react.display);
      await build.toggleScopeOnFocusedSkill();
      await build.advanceDomain();

      // API domain (all skills stay global)
      await build.advanceDomain();

      // Shared domain (pass through)
      const sources = await build.advanceToSources();

      // Sources -- set ALL to local
      await sources.waitForReady();
      await sources.setAllLocal();
      const agents = await sources.advance();

      // Agents -- accept defaults
      const confirm = await agents.acceptDefaults("init");

      // Confirm
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // --- Config content assertions ---
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        agents: ["web-developer"],
      });

      // --- Agent compilation assertions ---
      // Agents default to global scope (no scope toggle in agents step),
      // so compiled agent lives at fakeHome, not projectDir.
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
        const claudeSrcDir = path.dirname(configTypesTsPath(scopeDir));
        const typecheck = await typecheckGeneratedConfig(claudeSrcDir);
        expect(
          typecheck.exitCode,
          `the config written at ${scopeDir} must type-check against its own types.\ntsc output:\n${typecheck.output}`,
        ).toBe(EXIT_CODES.SUCCESS);
        const probe = await probeConfigTypesNarrowing(claudeSrcDir, SPLIT_INSTALL_ALIASES);
        expect(
          probe.exitCode,
          `a bogus literal must not type-check at ${scopeDir}.\ntsc output:\n${probe.output || "(no diagnostics — the unions accept everything)"}`,
        ).not.toBe(EXIT_CODES.SUCCESS);
        expect(probe.output).toContain(TS_NOT_ASSIGNABLE);
      }

      await result.destroy();
    },
  );
});
