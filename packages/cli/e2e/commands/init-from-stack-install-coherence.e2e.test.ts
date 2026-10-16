import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  E2E_AGENT,
  E2E_SKILL,
  E2E_STACK_AGENTS,
  E2E_STACK_DESCRIPTION,
  E2E_STACK_ID,
  E2E_STACK_SKILL_IDS,
} from "../fixtures/expected-values.js";
import {
  createTestEnvironment,
  readActiveAgentNames,
  readAllSkillEntries,
  readConfigSkillIds,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  cleanupTempDir,
  configTypesTsPath,
  fileExists,
  loadConfigOrFail,
  readCompiledAgents,
  skillsPath,
  listFiles,
} from "../helpers/test-utils.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import {
  TS_NOT_ASSIGNABLE,
  probeConfigTypesNarrowing,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";
import "../matchers/setup.js";

/**
 * Installing a stack must both land that stack and leave a configuration that
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
 * from the installed stack, so a bogus literal must be rejected by each — an alias
 * that degraded to `string` accepts the literal and emits no diagnostic at all.
 */
const STACK_DERIVED_ALIASES = ["SkillId", "AgentName", "Category"] as const;

/** Everything an eject-mode install writes into its source folder. */
const INSTALLED_SOURCE_FOLDER_ENTRIES = ["config-types.ts", "config.ts"];

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const STACKED_ID = "StackCo1";
const onBoth = { [WEB_DEV]: "lazy", [API_DEV]: "lazy" } as const;

describe("init --from — a stack install lands its roster and type-checks", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
    // The web app always sends the expansion: `stackId` is metadata, `assignments` is the data.
    // This payload IS the E2E source's stack, written out skill by skill, at the default scope.
    store.publish(
      STACKED_ID,
      buildSeedPayload({
        stackId: E2E_STACK_ID,
        skills: {
          [E2E_SKILL.react.id]: ejectedGlobalSkill(),
          [E2E_SKILL.vitest.id]: ejectedGlobalSkill(),
          [E2E_SKILL.zustand.id]: ejectedGlobalSkill(),
          [E2E_SKILL.reviewing.id]: ejectedGlobalSkill({ assignments: onBoth }),
          [E2E_SKILL["cli-reviewing"].id]: ejectedGlobalSkill(),
          [E2E_SKILL["research-methodology"].id]: ejectedGlobalSkill({ assignments: onBoth }),
          [E2E_SKILL.hono.id]: ejectedGlobalSkill({ assignments: { [API_DEV]: "lazy" } }),
        },
        agents: {
          [WEB_DEV]: { on: true, scope: "global" },
          [API_DEV]: { on: true, scope: "global" },
        },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "installs the stack's declared skills and agents, and the generated config pair still narrows",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      const { fakeHome: globalHome, projectDir } = env;
      const result = await runInitFrom(
        store,
        STACKED_ID,
        { dir: projectDir, globalHome },
        source.sourceDir,
      );
      expect(result.exitCode, `init failed:\n${result.output}`).toBe(EXIT_CODES.SUCCESS);

      // --- Surface 2: what the run recorded. The stack id resolved, so the config assertions
      // below are about the stack the run says it installed. ---
      expect((await loadConfigOrFail(projectDir)).description).toBe(E2E_STACK_DESCRIPTION);

      // --- Surface 3: the persisted configuration, at both scopes it could have
      // been written to. Default scope is global, so the skills and agents land
      // in the global partition and the project records the same roster. ---
      expect(
        await readActiveAgentNames(projectDir),
        "the project config must name exactly the sub-agents the stack declares",
      ).toStrictEqual(E2E_STACK_AGENTS);
      expect(
        [...new Set(await readConfigSkillIds(projectDir))].sort(),
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
      const globalSourceFolder = path.dirname(configTypesTsPath(globalHome));
      const projectSourceFolder = path.dirname(configTypesTsPath(projectDir));
      expect(await fileExists(configTypesTsPath(globalHome))).toBe(true);
      expect(await fileExists(configTypesTsPath(projectDir))).toBe(true);

      const globalTypecheck = await typecheckGeneratedConfig(globalSourceFolder);
      expect(
        globalTypecheck.exitCode,
        `the global config.ts must type-check against its own config-types.ts.\ntsc output:\n${globalTypecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      const projectTypecheck = await typecheckGeneratedConfig(projectSourceFolder);
      expect(
        projectTypecheck.exitCode,
        `the project config.ts must type-check against its own config-types.ts.\ntsc output:\n${projectTypecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);

      // Then the property the aliases exist for: a value that is not installed
      // must still be a type error. A pair that accepts its own config AND
      // everything else has stopped checking anything.
      const globalProbe = await probeConfigTypesNarrowing(
        globalSourceFolder,
        STACK_DERIVED_ALIASES,
      );
      expect(
        globalProbe.exitCode,
        `a bogus literal must not type-check against the global config-types.ts.\ntsc output:\n${globalProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(globalProbe.output).toContain(TS_NOT_ASSIGNABLE);
      // EACH alias, not any: the two above hold while one alias rejects and the others have
      // collapsed to `string`, which is the degradation this probe exists to catch.
      expect(
        globalProbe.rejected,
        `every stack-derived alias must reject its bogus literal in the global config-types.ts.\ntsc output:\n${globalProbe.output}`,
      ).toStrictEqual([...STACK_DERIVED_ALIASES]);

      const projectProbe = await probeConfigTypesNarrowing(
        projectSourceFolder,
        STACK_DERIVED_ALIASES,
      );
      expect(
        projectProbe.exitCode,
        `a bogus literal must not type-check against the project config-types.ts.\ntsc output:\n${projectProbe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(projectProbe.output).toContain(TS_NOT_ASSIGNABLE);
      expect(
        projectProbe.rejected,
        `every stack-derived alias must reject its bogus literal in the project config-types.ts.\ntsc output:\n${projectProbe.output}`,
      ).toStrictEqual([...STACK_DERIVED_ALIASES]);

      // Probing writes a file next to config-types.ts and removes it again, so
      // both trees must be exactly what the install left.
      expect(
        (await listFiles(globalSourceFolder)).sort(),
        "probing must leave the global source folder untouched",
      ).toStrictEqual(INSTALLED_SOURCE_FOLDER_ENTRIES);
      expect(
        (await listFiles(projectSourceFolder)).sort(),
        "probing must leave the project source folder untouched",
      ).toStrictEqual(INSTALLED_SOURCE_FOLDER_ENTRIES);
    },
  );
});
