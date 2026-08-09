import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  E2E_STACK_AGENTS,
  E2E_STACK_DISPLAY,
  E2E_STACK_SKILL_IDS,
} from "../fixtures/expected-values.js";
import {
  readActiveAgentNames,
  readAllSkillEntries,
  readConfigSkillIds,
} from "../fixtures/dual-scope-helpers.js";
import {
  cleanupTempDir,
  completeWithLocalSources,
  configTypesTsPath,
  ensureBinaryExists,
  fileExists,
  readCompiledAgents,
  skillsPath,
  listFiles,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  TS_NOT_ASSIGNABLE,
  probeConfigTypesNarrowing,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";
import "../matchers/setup.js";

/**
 * Picking a stack must both install that stack and leave a configuration that
 * type-checks.
 *
 * Two claims were each covered on their own and never together: that a stack's
 * declared roster is the installed one, and that a generated `config.ts` /
 * `config-types.ts` pair holds up under `tsc`. A stack install is exactly where
 * they meet — it is the one flow that writes a non-trivial skill list, an agent
 * list and a `stack` block in a single pass, so a coherence defect between them
 * has nowhere else to show up.
 *
 * All four surfaces are asserted at the scope the install lands in, and the
 * generated pair is checked at BOTH scopes: an install whose global half writes
 * an alias that accepts everything is one where the project half's own aliases
 * are absorbed by it, and neither file looks wrong on its own.
 */

/**
 * The generated aliases a stack install fills in. Every one of them is derived
 * from the picked stack, so a bogus literal must be rejected by each — an alias
 * that degraded to `string` accepts the literal and emits no diagnostic at all.
 */
const STACK_DERIVED_ALIASES = ["SkillId", "AgentName", "Category"] as const;

/** Everything an eject-mode install writes into a `.claude-src/` directory. */
const INSTALLED_CLAUDE_SRC_ENTRIES = ["config-types.ts", "config.ts"];

describe("init wizard — a stack install lands its roster and type-checks", () => {
  let wizard: InitWizard | undefined;
  let source: E2ESource | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (source) await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "installs the stack's declared skills and agents, and the generated config pair still narrows",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      wizard = await InitWizard.launchInProject({
        ...(source !== undefined && { source }),
      });
      const globalHome = wizard.globalHome;

      const result = await completeWithLocalSources(wizard);
      expect(await result.exitCode, `init failed:\n${result.output}`).toBe(EXIT_CODES.SUCCESS);
      const installOutput = result.rawOutput;
      await result.destroy();

      // --- Surface 2: what the user saw. The stack is named on screen, so the
      // config assertions below are about the stack the run said it installed. ---
      expect(installOutput).toContain(E2E_STACK_DISPLAY);
      expect(installOutput).toContain(STEP_TEXT.INIT_SUCCESS);

      // --- Surface 3: the persisted configuration, at both scopes it could have
      // been written to. Default scope is global, so the skills and agents land
      // in the global partition and the project records the same roster. ---
      expect(
        await readActiveAgentNames(result.project.dir),
        "the project config must name exactly the sub-agents the stack declares",
      ).toStrictEqual(E2E_STACK_AGENTS);
      expect(
        [...new Set(await readConfigSkillIds(result.project.dir))].sort(),
        "the project config must carry exactly the skills the stack assigns",
      ).toStrictEqual(E2E_STACK_SKILL_IDS);
      expect(
        [...new Set((await readAllSkillEntries(globalHome)).map((entry) => entry.id))].sort(),
        "the global config must carry exactly the skills the stack assigns",
      ).toStrictEqual(E2E_STACK_SKILL_IDS);

      // --- Surface 1: the compiled agents on disk, compared as a whole roster
      // rather than searched for names this spec happens to know. ---
      const compiled = await readCompiledAgents(globalHome);
      expect(
        Object.keys(compiled).sort(),
        "the compiled agents must be exactly the stack's declared roster",
      ).toStrictEqual(E2E_STACK_AGENTS.map((name) => `${name}.md`));
      for (const agentName of E2E_STACK_AGENTS) {
        await expect({ dir: globalHome }).toHaveAgentFrontmatter(agentName, { name: agentName });
      }
      expect(
        (await listFiles(skillsPath(globalHome))).sort(),
        "every skill the stack assigns must be ejected onto disk",
      ).toStrictEqual(E2E_STACK_SKILL_IDS);

      // --- Surface 4: the generated type surface the config is checked against.
      // First that the config the CLI just wrote accepts itself — a pair that
      // fails here tells the user their untouched installation is invalid. ---
      const globalClaudeSrc = path.dirname(configTypesTsPath(globalHome));
      const projectClaudeSrc = path.dirname(configTypesTsPath(result.project.dir));
      expect(await fileExists(configTypesTsPath(globalHome))).toBe(true);
      expect(await fileExists(configTypesTsPath(result.project.dir))).toBe(true);

      const globalTypecheck = await typecheckGeneratedConfig(globalClaudeSrc);
      expect(
        globalTypecheck.exitCode,
        `the global config.ts must type-check against its own config-types.ts.\ntsc output:\n${globalTypecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      const projectTypecheck = await typecheckGeneratedConfig(projectClaudeSrc);
      expect(
        projectTypecheck.exitCode,
        `the project config.ts must type-check against its own config-types.ts.\ntsc output:\n${projectTypecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);

      // Then the property the aliases exist for: a value that is not installed
      // must still be a type error. A pair that accepts its own config AND
      // everything else has stopped checking anything.
      const globalProbe = await probeConfigTypesNarrowing(globalClaudeSrc, STACK_DERIVED_ALIASES);
      expect(
        globalProbe.exitCode,
        `a bogus literal must not type-check against the global config-types.ts.\ntsc output:\n${globalProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(globalProbe.output).toContain(TS_NOT_ASSIGNABLE);

      const projectProbe = await probeConfigTypesNarrowing(projectClaudeSrc, STACK_DERIVED_ALIASES);
      expect(
        projectProbe.exitCode,
        `a bogus literal must not type-check against the project config-types.ts.\ntsc output:\n${projectProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(projectProbe.output).toContain(TS_NOT_ASSIGNABLE);

      // Probing writes a file next to config-types.ts and removes it again, so
      // both trees must be exactly what the install left.
      expect(
        (await listFiles(globalClaudeSrc)).sort(),
        "probing must leave the global .claude-src tree untouched",
      ).toStrictEqual(INSTALLED_CLAUDE_SRC_ENTRIES);
      expect(
        (await listFiles(projectClaudeSrc)).sort(),
        "probing must leave the project .claude-src tree untouched",
      ).toStrictEqual(INSTALLED_CLAUDE_SRC_ENTRIES);
    },
  );
});
