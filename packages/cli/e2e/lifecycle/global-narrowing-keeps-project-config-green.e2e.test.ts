import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  configTsPath,
  loadConfigOrFail,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { createTestEnvironment, readAllSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { applyFromSeed, e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  TS_NOT_ASSIGNABLE,
  TS_UNKNOWN_PROPERTY,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";

/**
 * A global-scope edit that narrows the global unions must not turn an untouched project's
 * generated config.ts (which inlines global rows) into a type error. `web-state-zustand` is
 * dynamic and alone in its category, so removing it narrows Category as well as SkillId.
 */

const NARROWED_SKILL = E2E_SKILL.zustand;
const NARROWED_CATEGORY = "web-client-state";

const EJECT_SOURCE = "eject";

function sourceFolderOf(dir: string): string {
  return path.dirname(configTsPath(dir));
}

/** Unregistered, so propagation cannot repair the project: its types must hold on their own. */
async function unregisterProjects(globalHome: string): Promise<void> {
  const globalConfig = await loadConfigOrFail(globalHome);
  expect(
    globalConfig.projects?.length,
    "the project install must have registered itself before this removes the registration",
  ).toBeGreaterThan(0);

  // Removes the key entirely; an explicit `undefined` is not a config state.
  const { projects: _projects, ...withoutProjects } = globalConfig;
  await writeProjectConfig(globalHome, withoutProjects);
}

describe("a global-scope narrowing keeps an untouched project's config.ts type-checking", () => {
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "still type-checks after a global edit removes a skill the project config inlines",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // Every skill global, so the project's types are `SkillId = GlobalSkillId` with no extras.
      await installFromSeed(store, "AllGlobal1", e2eStackPayload(), {
        dir: projectDir,
        home: fakeHome,
      });

      expect(
        await readAllSkillEntries(projectDir),
        "the project config must inline the global skill it is about to be orphaned from",
      ).toContainEqual({ id: NARROWED_SKILL.id, scope: "global", origin: EJECT_SOURCE });
      expect((await readAllSkillEntries(fakeHome)).map((s) => s.id)).toContain(NARROWED_SKILL.id);

      // Control: what the install wrote type-checks.
      const afterInstall = await typecheckGeneratedConfig(sourceFolderOf(projectDir));
      expect(
        afterInstall.exitCode,
        `A freshly installed project config.ts must type-check.\ntsc output:\n${afterInstall.output}`,
      ).toBe(EXIT_CODES.SUCCESS);

      await unregisterProjects(fakeHome);

      // Only an edit at the global root can remove a global entry.
      await applyFromSeed(store, "Narrowed1", e2eStackPayload({ without: [NARROWED_SKILL.id] }), {
        dir: fakeHome,
        home: fakeHome,
      });

      expect(
        (await readAllSkillEntries(fakeHome)).map((s) => s.id),
        "the global edit must actually have removed the skill",
      ).not.toContain(NARROWED_SKILL.id);

      expect(
        await readAllSkillEntries(projectDir),
        "the untouched project config must still inline the now-removed global row",
      ).toContainEqual({ id: NARROWED_SKILL.id, scope: "global", origin: EJECT_SOURCE });

      const afterNarrowing = await typecheckGeneratedConfig(sourceFolderOf(projectDir));
      expect(
        afterNarrowing.exitCode,
        `A global-scope edit must not invalidate an untouched project's config.ts.\ntsc output:\n${afterNarrowing.output || "(no diagnostics)"}`,
      ).toBe(EXIT_CODES.SUCCESS);
      // Which code fires depends on what the removed entry was the last member of, so both.
      expect(afterNarrowing.output).not.toContain(TS_NOT_ASSIGNABLE);
      expect(afterNarrowing.output).not.toContain(TS_UNKNOWN_PROPERTY);
      expect(afterNarrowing.output).not.toContain(NARROWED_SKILL.id);
      expect(afterNarrowing.output).not.toContain(NARROWED_CATEGORY);
    },
  );
});
