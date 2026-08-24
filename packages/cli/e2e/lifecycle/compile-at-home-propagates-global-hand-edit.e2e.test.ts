import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  loadConfigOrFail,
  readTestFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  readAllSkillEntries,
  setupProjectOnlyMixedScope,
} from "../fixtures/dual-scope-helpers.js";
import { typecheckGeneratedConfig } from "../helpers/type-check-probe.js";

/**
 * The documented hand-edit workflow — edit `.claude-src/config.ts`, then run
 * `compile` — must reach the registered projects a global change invalidates.
 *
 * A global-scope `compile` regenerates `~/.claude-src/config-types.ts` from the
 * hand-edited config, narrowing the global unions. Every registered project
 * inlines the active global rows verbatim into its OWN `config.ts` and keeps its
 * compiled `.claude/agents/*.md` built from them, so narrowing the global side
 * without fanning the change out leaves each registered project naming a skill
 * that no longer exists anywhere — in its config and in its compiled agents.
 *
 * Which assertion carries the red: the project's `config.ts` still naming the
 * removed skill, the missing propagated-recompile line, and the compiled
 * `api-developer.md` still preloading it. The `tsc` assertion does NOT go red
 * before the fix — the project's own `config-types.ts` was written at init with
 * every active skill inlined as an extra, so the stale pair still type-checks
 * with itself. It is here as a guard on the fix: propagation rewrites BOTH
 * files, and rewriting only one is how a green propagation still hands the user
 * an invalid install.
 */

/** The skill removed from the global config by hand, inherited by the project. */
const REMOVED_SKILL = E2E_SKILL.hono;

/**
 * The agent the project owns at PROJECT scope. Its compiled `.md` preloads the
 * removed global skill, so it is the artifact that proves propagation drove a
 * recompile rather than only rewriting config files.
 */
const PROJECT_AGENT = E2E_AGENT["api-developer"];

/** `source` recorded for skills installed from a local source via `setAllLocal`. */
const EJECT_SOURCE = "eject";

/** The `.claude-src/` directory holding a scope's generated config pair. */
function claudeSrcDir(dir: string): string {
  return path.dirname(configTsPath(dir));
}

/**
 * The documented hand-edit: drop one skill from the GLOBAL `config.ts`, leaving
 * every other field — including the `projects` registration propagation reads —
 * verbatim. Structural (load, filter, write) rather than a text edit, so the
 * removal cannot depend on the writer's formatting.
 */
async function removeGlobalSkillByHand(globalHome: string, skillId: string): Promise<void> {
  const globalConfig = await loadConfigOrFail(globalHome);

  expect(
    globalConfig.skills.map((s) => s.id),
    "the global config must hold the skill this hand-edit removes",
  ).toContain(skillId);
  expect(
    globalConfig.projects?.length,
    "the project install must have registered itself — propagation reads that list",
  ).toBeGreaterThan(0);

  await writeProjectConfig(globalHome, {
    ...globalConfig,
    skills: globalConfig.skills.filter((s) => s.id !== skillId),
  });
}

describe("compile at the home directory fans a hand-edited global config out to registered projects", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "rewrites the registered project's config pair and recompiles its agents",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // Phase 1 — a project install that registers itself, owns api-developer at
      // project scope, and inherits api-framework-hono from global scope.
      await setupProjectOnlyMixedScope(E2E_SOURCE, fakeHome, projectDir);

      const projectAgentMd = path.join(agentsPath(projectDir), `${PROJECT_AGENT.name}.md`);

      expect(
        await readAllSkillEntries(projectDir),
        "the project config must inline the global skill it is about to be orphaned from",
      ).toContainEqual({ id: REMOVED_SKILL.id, scope: "global", origin: EJECT_SOURCE });
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(PROJECT_AGENT.name, {
        contains: [REMOVED_SKILL.id],
      });
      const projectAgentBefore = await readTestFile(projectAgentMd);

      // Control: what the install wrote type-checks, so a failure at the end is
      // about the global change and not about the install.
      const afterInstall = await typecheckGeneratedConfig(claudeSrcDir(projectDir));
      expect(
        afterInstall.exitCode,
        `A freshly installed project config.ts must type-check.\ntsc output:\n${afterInstall.output}`,
      ).toBe(EXIT_CODES.SUCCESS);

      // Phase 2 — the documented workflow: hand-edit the global config, compile.
      await removeGlobalSkillByHand(fakeHome, REMOVED_SKILL.id);
      const globalConfigAfterEdit = await readTestFile(configTsPath(fakeHome));

      const compile = await CLI.run(["compile"], { dir: fakeHome }, { env: { HOME: fakeHome } });
      expect(compile.exitCode, `Compile at HOME failed: ${compile.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      // Phase 3 — the registered project follows the global change.
      expect(
        (await readAllSkillEntries(projectDir)).map((s) => s.id),
        "the removed global skill must not survive in the registered project's config",
      ).not.toContain(REMOVED_SKILL.id);
      expect(
        await readTestFile(configTsPath(projectDir)),
        "no trace of the removed skill may remain in the project's config.ts",
      ).not.toContain(REMOVED_SKILL.id);

      const afterPropagation = await typecheckGeneratedConfig(claudeSrcDir(projectDir));
      expect(
        afterPropagation.exitCode,
        `Propagation must leave the project's config pair type-checking.\ntsc output:\n${afterPropagation.output || "(no diagnostics)"}`,
      ).toBe(EXIT_CODES.SUCCESS);

      // The compiled agents follow too — propagation is config-only, so the
      // command owes the recompile. Content AND a byte diff: the file must have
      // been rewritten, not merely happen to lack the skill.
      expect(
        compile.output,
        "compile must report the propagated project's agent recompile",
      ).toContain(STEP_TEXT.PROPAGATED_RECOMPILE_ONE);
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(PROJECT_AGENT.name, {
        notContains: [REMOVED_SKILL.id],
      });
      expect(
        await readTestFile(projectAgentMd),
        "the propagated project's compiled agent must have been rewritten",
      ).not.toBe(projectAgentBefore);

      // compile refreshes config-types.ts and propagates — it never rewrites the
      // hand-edited config.ts it was pointed at.
      expect(await readTestFile(configTsPath(fakeHome))).toBe(globalConfigAfterEdit);
    },
  );
});
