import path from "path";
import { captureOutput } from "@oclif/test";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { fileExists } from "../test-fs-utils";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  testMarketplaceSkillId,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { forgetTheProviderChosenForThisRun } from "../../installation/install-layout.js";

/**
 * Imported from source rather than run through `dist/`, so the provider `--provider` chose for the
 * run can be forgotten between specs: a dist module's state would outlive the spec that set it.
 */
const { default: Init } = await import("../../../commands/init.js");

const SEED_ID = "Seed1";
const REACT = testMarketplaceSkillId("web-framework-react");

/** Literals: a test reading the folders off the product would move with them. */
const CLAUDE_CONFIG = ".agents-inc/claude/config.ts";
const CODEX_CONFIG = ".agents-inc/codex/config.ts";

describe("init --from with --provider", () => {
  useMockWorker();
  let projectDir: string;
  let cleanup: () => Promise<void>;
  let dirs: TestDirs;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-init-from-provider-test-"));
    dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
    configMockServer.use(
      storedConfigHandlerFor(
        SEED_ID,
        buildSeedPayload({
          skills: {
            [REACT]: buildSeedSkill({
              install: "eject",
              scope: "project",
              assignments: { "web-developer": "lazy" },
            }),
          },
          agents: { "web-developer": { scope: "project" } },
        }),
      ),
    );
  });

  afterEach(async () => {
    forgetTheProviderChosenForThisRun();
    await cleanupTestSource(dirs);
    await cleanup();
  });

  function initFrom(...extra: string[]) {
    return captureOutput(() =>
      Init.run(["--from", SEED_ID, "--marketplace", dirs.sourceDir, ...extra], { root: CLI_ROOT }),
    );
  }

  it("installs into the folder of the provider it names", async () => {
    const { error } = await initFrom("--provider", "codex");

    expect(error).toBeUndefined();
    expect(await fileExists(path.join(projectDir, CODEX_CONFIG))).toBe(true);
    expect(await fileExists(path.join(projectDir, CLAUDE_CONFIG))).toBe(false);
  });

  it("installs into Claude's folder when it names none", async () => {
    const { error } = await initFrom();

    expect(error).toBeUndefined();
    expect(await fileExists(path.join(projectDir, CLAUDE_CONFIG))).toBe(true);
    expect(await fileExists(path.join(projectDir, CODEX_CONFIG))).toBe(false);
  });
});
