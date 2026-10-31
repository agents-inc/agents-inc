import path from "path";
import { mkdir, readFile } from "fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { runInitFromOnClaude } from "../fixtures/codex-install.js";
import { setAsideInstallation } from "../fixtures/config-reading-commands.js";
import { seedDefaultSourceCache } from "../fixtures/default-source-cache.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { E2E_SKILL, E2E_SKILL_IDS, E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  fileExists,
  flattenCliOutput,
  listFiles,
  loadConfigOrFail,
  readCompiledAgents,
  readTreeSnapshot,
  skillsPath,
  sourceFolderIn,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { doctorRow, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import type { SkillId } from "../../src/cli/types/index.js";

/**
 * A project whose config declares no skill and no sub-agent counts exactly like no config, so it
 * reads the marketplace HOME's installation came from, as a project with no config does. Each
 * command runs in both projects under the same HOME, and the project with no config is the control.
 */

const SEED_ID = "DeclMkt";

/** Any catalogue skill: the seeded copy only keeps a wrong read of the default marketplace offline. */
const LEFT_OUT_OF_THE_DEFAULT_COPY = "meta-reviewing-infra-reviewing" as const satisfies SkillId;

describe("a project whose config declares nothing, under a HOME installed from a marketplace of its own", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment;
  let home = "";
  let declaresNothing: ProjectHandle;
  let noConfig: ProjectHandle;
  let restore: () => Promise<void>;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(SEED_ID, e2eStackPayload());

    env = await createTestEnvironment({ permissions: false });
    home = env.fakeHome;
    declaresNothing = { dir: env.projectDir, globalHome: home };
    noConfig = { dir: path.join(home, "holds-no-config"), globalHome: home };
    await mkdir(noConfig.dir);

    const installed = await runInitFromOnClaude(
      store,
      SEED_ID,
      { dir: home, globalHome: home },
      E2E_SOURCE.sourceDir,
    );
    expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
    await writeProjectConfig(declaresNothing.dir, { name: path.basename(declaresNothing.dir) });
    await seedDefaultSourceCache(home, { omitting: LEFT_OUT_OF_THE_DEFAULT_COPY });

    expect(
      (await loadConfigOrFail(home)).marketplace,
      "HOME's installation records the marketplace it came from",
    ).toBe(E2E_SOURCE.sourceDir);
    const own = await loadConfigOrFail(declaresNothing.dir);
    expect(
      { skills: own.skills, agents: own.agents, marketplace: own.marketplace },
      "the project's config declares no skill and no sub-agent, and names no marketplace",
    ).toStrictEqual({ skills: [], agents: [], marketplace: undefined });
    expect(await fileExists(configTsPath(noConfig.dir)), "the control holds no config").toBe(false);

    restore = await setAsideInstallation(home);
  }, TIMEOUTS.LIFECYCLE);

  beforeEach(async () => {
    await restore();
  });

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(env.tempDir);
  });

  it(
    "compile resolves HOME's marketplace and compiles HOME's agents as the project with no config does",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const control = await CLI.run(["compile"], noConfig);
      expect(control.exitCode, flattenCliOutput(control.output)).toBe(EXIT_CODES.SUCCESS);
      expect(control.stdout, "subject guard: with no config, HOME's marketplace").toContain(
        `${STEP_TEXT.COMPILE_MARKETPLACE_GLOBAL}\n`,
      );
      const compiledByControl = await readCompiledAgents(home);
      expect(Object.keys(compiledByControl).sort(), "subject guard: HOME's agents").toStrictEqual(
        E2E_STACK_AGENTS.map((agent) => `${agent}.md`).sort(),
      );
      const configBefore = await readFile(configTsPath(declaresNothing.dir), "utf-8");

      const result = await CLI.run(["compile"], declaresNothing);

      expect(result.exitCode, flattenCliOutput(result.output)).toBe(EXIT_CODES.SUCCESS);
      expect(result.stdout).toContain(`${STEP_TEXT.COMPILE_MARKETPLACE_GLOBAL}\n`);
      expect(await readCompiledAgents(home)).toStrictEqual(compiledByControl);
      expect(
        await readFile(configTsPath(declaresNothing.dir), "utf-8"),
        "compile leaves the project's config as it was",
      ).toBe(configBefore);
    },
  );

  it(
    "search lists HOME's marketplace, as from the project with no config",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const control = await CLI.run(["search", E2E_SKILL.react.slug], noConfig);
      expect(control.exitCode, flattenCliOutput(control.output)).toBe(EXIT_CODES.SUCCESS);
      expect(control.stdout, "subject guard: with no config, HOME's marketplace").toContain(
        E2E_SKILL.react.display,
      );
      const before = await readTreeSnapshot(declaresNothing.dir);

      const result = await CLI.run(["search", E2E_SKILL.react.slug], declaresNothing);

      expect(result.exitCode, flattenCliOutput(result.output)).toBe(EXIT_CODES.SUCCESS);
      expect(result.stdout).toBe(control.stdout);
      expect(await readTreeSnapshot(declaresNothing.dir), "search writes nothing").toStrictEqual(
        before,
      );
    },
  );

  it(
    "eject skills copies HOME's marketplace's skills, as into the project with no config",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const control = await CLI.run(["eject", "skills"], noConfig);
      expect(control.exitCode, flattenCliOutput(control.output)).toBe(EXIT_CODES.SUCCESS);
      const ejectedByControl = (await listFiles(skillsPath(noConfig.dir))).sort();
      expect(ejectedByControl.length, "subject guard: the control ejected skills").toBeGreaterThan(
        0,
      );
      expect(
        E2E_SKILL_IDS,
        "subject guard: with no config, only HOME's marketplace's skills",
      ).toStrictEqual(expect.arrayContaining(ejectedByControl));
      const configBefore = await readFile(configTsPath(declaresNothing.dir), "utf-8");
      const homeConfigBefore = await readTreeSnapshot(sourceFolderIn(home));

      const result = await CLI.run(["eject", "skills"], declaresNothing);

      expect(
        (await listFiles(skillsPath(declaresNothing.dir))).sort(),
        flattenCliOutput(result.output),
      ).toStrictEqual(ejectedByControl);
      expect(result.exitCode, flattenCliOutput(result.output)).toBe(EXIT_CODES.SUCCESS);
      expect(
        await readFile(configTsPath(declaresNothing.dir), "utf-8"),
        "eject leaves the project's config as it was",
      ).toBe(configBefore);
      expect(
        await readTreeSnapshot(sourceFolderIn(home)),
        "eject leaves HOME's installation as it was",
      ).toStrictEqual(homeConfigBefore);
    },
  );

  it(
    "doctor reaches HOME's marketplace, as from the project with no config",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const reachedHomesMarketplace = doctorRow(
        STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE,
        STEP_TEXT.DOCTOR_STATUS_PASS,
        `${STEP_TEXT.DOCTOR_SOURCE_LOCAL} ${E2E_SOURCE.sourceDir}`,
      );
      const control = await CLI.run(["doctor"], noConfig);
      expect(control.stdout, "subject guard: with no config, HOME's marketplace").toMatch(
        reachedHomesMarketplace,
      );
      expect(control.stdout).toContain(STEP_TEXT.DOCTOR_MARKETPLACE_NAMED_BY_GLOBAL);

      const result = await CLI.run(["doctor"], declaresNothing);

      expect(result.stdout).toMatch(reachedHomesMarketplace);
      expect(result.stdout).toContain(STEP_TEXT.DOCTOR_MARKETPLACE_NAMED_BY_GLOBAL);
    },
  );
});
