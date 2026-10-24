import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { CLI } from "../fixtures/cli.js";
import { runInitFromOnClaude, runInitFromOnCodex } from "../fixtures/codex-install.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, directoryExists, flattenCliOutput } from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import type { Provider } from "../../src/cli/consts.js";

/**
 * `list` from a folder holding no installation, under a HOME whose global installations it shows.
 * The user docs say `list` names both installations above the one it is showing only "when one
 * scope holds both" (configuration/providers.md). CLI-969: measured against the built CLI, a HOME
 * holding only a Codex installation printed "holds 1 installations — codex — and this is the claude
 * one" above the listing of that Codex installation. Claude is the control, being also the provider
 * a folder holding nothing would otherwise be read as.
 */

const EVERY_PROVIDER = ["claude", "codex"] as const satisfies readonly Provider[];

const SOURCE_FOLDER = {
  claude: DIRS.SOURCE_CLAUDE,
  codex: DIRS.SOURCE_CODEX,
} as const satisfies Record<Provider, string>;

const INSTALL_WITH = {
  claude: runInitFromOnClaude,
  codex: runInitFromOnCodex,
} as const satisfies Record<Provider, typeof runInitFromOnClaude>;

const SEED_ID = "ListInhr";

describe("list in a folder holding no installation, under a HOME holding global ones", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  async function installAtHome(providers: readonly Provider[]): Promise<{
    home: string;
    project: ProjectHandle;
  }> {
    env = await createTestEnvironment({ permissions: false });
    const home = env.fakeHome;
    store.publish(SEED_ID, e2eStackPayload());

    for (const provider of providers) {
      const installed = await INSTALL_WITH[provider](
        store,
        SEED_ID,
        { dir: home, globalHome: home },
        E2E_SOURCE.sourceDir,
      );
      expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
    }

    // Subject guards: HOME holds an installation of exactly the providers installed there, and the
    // folder list runs in holds none of its own.
    expect(
      await Promise.all(
        EVERY_PROVIDER.map((provider) => directoryExists(path.join(home, SOURCE_FOLDER[provider]))),
      ),
      `HOME holds a source folder for ${providers.join(" and ")} and no other, in roster order`,
    ).toStrictEqual(EVERY_PROVIDER.map((provider) => providers.includes(provider)));
    await expectNoSourceFolder(env.projectDir, "the folder list runs in holds no installation");

    return { home, project: { dir: env.projectDir, globalHome: home } };
  }

  it.each(EVERY_PROVIDER)(
    "lists a HOME's lone %s installation with no line naming another above it",
    { timeout: TIMEOUTS.LIFECYCLE },
    async (provider) => {
      const { home, project } = await installAtHome([provider]);

      const { exitCode, stdout } = await CLI.run(["list"], project);

      expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
      expect(stdout, `list shows the ${provider} installation HOME holds`).toContain(
        `  Config:  ${home}/${SOURCE_FOLDER[provider]}/${FILES.CONFIG_TS}\n`,
      );
      expect(
        stdout,
        "one scope holding one installation has no other to name, so nothing is printed above the listing",
      ).toMatch(/^\s*Installation: /);
    },
  );

  it(
    "names both of a HOME's installations above the Claude one it lists, and the flag that shows the other",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { home, project } = await installAtHome(EVERY_PROVIDER);

      const { exitCode, stdout } = await CLI.run(["list"], project);

      expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
      expect(stdout, "the line naming both sits directly above the listing").toContain(
        `${home} holds 2 installations — claude and codex — and this is the claude one. Show another with --provider <claude|codex>.\n\nInstallation: `,
      );
      expect(stdout, "the installation listed is the Claude one the line says it is").toContain(
        `  Config:  ${home}/${SOURCE_FOLDER.claude}/${FILES.CONFIG_TS}\n`,
      );
    },
  );
});
