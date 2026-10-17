import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  CLAUDE_SOURCE_REL,
  CODEX_SOURCE_REL,
  PROVIDER_CLAUDE,
  PROVIDER_CODEX,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  directoryExists,
  fileExists,
  flattenCliOutput,
  normalizeInstallTree,
  readInstallTree,
  type InstallTree,
} from "../helpers/test-utils.js";
import { cliVersion } from "../../src/cli/lib/agents/agent-provenance.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { parseRefusal } from "../../src/cli/lib/__tests__/helpers/cli-runner.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";

/**
 * `--provider` is a location parameter on one command: meaningless without `--from`, `--provider
 * claude` installs exactly what no flag does, and once a scope holds two installations no command
 * picks one silently. Nothing reads a config for the provider, so the assertions are about folders.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/**
 * Built by the shared helper: both readers are negatives, and a hand-spelled refusal could never
 * fail them.
 */
const NO_SUCH_FLAG = parseRefusal("--provider");

/** A provider nobody ships: the flag is a closed roster. */
const NOT_A_PROVIDER = "gemini";

/** One ejected skill at global scope with its sub-agent; no host binary needed. */
function ejectedGlobally() {
  return buildSeedPayload({
    skills: {
      [E2E_SKILL.react.id]: buildSeedSkill({
        install: "eject",
        scope: "global",
        assignments: { [WEB_DEV]: "lazy" },
      }),
    },
    agents: { [WEB_DEV]: { scope: "global" } },
  });
}

describe("the provider arrives on the command", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
  }, 120_000);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(source);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it("refuses --provider with no --from, naming both the flag it needs and the editor", async () => {
    env = await createTestEnvironment({ permissions: false });

    const refused = await CLI.run(["init", ...PROVIDER_CODEX], {
      dir: env.projectDir,
      globalHome: env.fakeHome,
    });
    const said = flattenCliOutput(refused.output);

    expect(refused.exitCode, said).toBe(EXIT_CODES.INVALID_ARGS);
    expect(said).toContain("--from");
    // The `/editor` segment: the apex landing page knows nothing about `?fromId=`.
    expect(said).toContain(STEP_TEXT.EDITOR_URL);

    // Nothing written at either scope: a half-created installation is what later commands would
    // guess about.
    for (const root of [env.projectDir, env.fakeHome]) {
      expect(await directoryExists(path.join(root, DIRS.SOURCE_ROOT)), root).toBe(false);
    }
  });

  it("takes the same flag beside --from, which is what makes the refusal above about --from", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish("PrvWith1", ejectedGlobally());

    const installed = await runInitFromOnCodex(
      store,
      "PrvWith1",
      { dir: env.projectDir, globalHome: env.fakeHome },
      source.sourceDir,
    );

    expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
    expect(await fileExists(path.join(env.fakeHome, CODEX_SOURCE_REL, FILES.CONFIG_TS))).toBe(true);
  });

  it("installs onto Claude when the default provider is named out loud", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish("PrvClau1", ejectedGlobally());

    const installed = await CLI.run(
      ["init", "--from", "PrvClau1", "--marketplace", source.sourceDir, ...PROVIDER_CLAUDE],
      { dir: env.projectDir, globalHome: env.fakeHome },
      { env: { AGENTS_INC_API_URL: store.url } },
    );

    expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
    // Naming the default writes the Claude pair and no Codex folder.
    expect(await fileExists(path.join(env.fakeHome, CLAUDE_SOURCE_REL, FILES.CONFIG_TS))).toBe(
      true,
    );
    expect(await directoryExists(path.join(env.fakeHome, CODEX_SOURCE_REL))).toBe(false);
  });

  /**
   * Bytes: two installs of one configuration, with `claude` and with no flag, compared as
   * normalised trees. Two environments, since `init --from` refuses an existing installation.
   */
  it("installs the same BYTES as no flag at all, which is what makes it a location and not a feature", async () => {
    store.publish("PrvSame1", ejectedGlobally());

    const withNoFlag = await createTestEnvironment({ permissions: false });
    const namingTheDefault = await createTestEnvironment({ permissions: false });

    try {
      const bare = await runInitFrom(
        store,
        "PrvSame1",
        { dir: withNoFlag.projectDir, globalHome: withNoFlag.fakeHome },
        source.sourceDir,
      );
      expect(bare.exitCode, flattenCliOutput(bare.output)).toBe(EXIT_CODES.SUCCESS);

      const named = await CLI.run(
        ["init", "--from", "PrvSame1", "--marketplace", source.sourceDir, ...PROVIDER_CLAUDE],
        { dir: namingTheDefault.projectDir, globalHome: namingTheDefault.fakeHome },
        { env: { AGENTS_INC_API_URL: store.url } },
      );
      expect(named.exitCode, flattenCliOutput(named.output)).toBe(EXIT_CODES.SUCCESS);

      // Subject guard: two empty trees compare equal for free.
      const installedBare = await installedTreeOf(withNoFlag.fakeHome);
      expect(Object.keys(installedBare.files).length).toBeGreaterThan(0);

      expect(await installedTreeOf(namingTheDefault.fakeHome)).toStrictEqual(installedBare);
    } finally {
      await cleanupTempDir(withNoFlag.tempDir);
      await cleanupTempDir(namingTheDefault.tempDir);
    }
  });

  it("refuses a provider nobody ships, naming the ones it has", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish("PrvBad01", ejectedGlobally());

    const refused = await CLI.run(
      [
        "init",
        "--from",
        "PrvBad01",
        "--marketplace",
        source.sourceDir,
        "--provider",
        NOT_A_PROVIDER,
      ],
      { dir: env.projectDir, globalHome: env.fakeHome },
      { env: { AGENTS_INC_API_URL: store.url } },
    );
    const said = flattenCliOutput(refused.output);

    expect(refused.exitCode, said).toBe(EXIT_CODES.INVALID_ARGS);
    // Both names, so the user sees the spelling they wanted.
    expect(said).toContain("claude");
    expect(said).toContain("codex");
    expect(await directoryExists(path.join(env.fakeHome, DIRS.SOURCE_ROOT))).toBe(false);
  });

  /**
   * Ends with the subject guard, so a refusal cannot pass on a setup that never reached two
   * installations.
   */
  async function installBothProvidersAt(home: string): Promise<void> {
    const at = { dir: home, globalHome: home };
    store.publish("PrvTwoCl", ejectedGlobally());
    store.publish("PrvTwoCd", ejectedGlobally());

    const claude = await runInitFrom(store, "PrvTwoCl", at, source.sourceDir);
    expect(claude.exitCode, flattenCliOutput(claude.output)).toBe(EXIT_CODES.SUCCESS);

    const codex = await runInitFromOnCodex(store, "PrvTwoCd", at, source.sourceDir);
    expect(codex.exitCode, flattenCliOutput(codex.output)).toBe(EXIT_CODES.SUCCESS);

    for (const folder of [CLAUDE_SOURCE_REL, CODEX_SOURCE_REL]) {
      expect(await fileExists(path.join(home, folder, FILES.CONFIG_TS)), folder).toBe(true);
    }
  }

  it("refuses to guess which installation to uninstall when a scope holds two, and names the flag", async () => {
    env = await createTestEnvironment({ permissions: false });
    await installBothProvidersAt(env.fakeHome);

    const ambiguous = await CLI.run(["uninstall", "--yes"], {
      dir: env.fakeHome,
      globalHome: env.fakeHome,
    });
    const said = flattenCliOutput(ambiguous.output);

    // No TTY, so the run must stop and say how to answer.
    expect(ambiguous.exitCode, said).toBe(EXIT_CODES.INVALID_ARGS);
    expect(said).toContain("--provider");

    // Both pairs survive: refused, not acted on whichever came first.
    for (const folder of [CLAUDE_SOURCE_REL, CODEX_SOURCE_REL]) {
      expect(await fileExists(path.join(env.fakeHome, folder, FILES.CONFIG_TS)), folder).toBe(true);
    }
  });

  /**
   * Every other command that acts on one installation owes the same refusal. `eject agent-partials`
   * would stop for its own reason afterwards; the refusal comes first.
   */
  const ACTS_ON_ONE_INSTALLATION = [
    { label: "edit", argv: ["edit"] },
    { label: "share", argv: ["share"] },
    { label: "eject", argv: ["eject", "agent-partials"] },
  ] as const;

  it.each(ACTS_ON_ONE_INSTALLATION)(
    "refuses to guess which installation $label is about, and names the flag",
    async ({ argv }) => {
      env = await createTestEnvironment({ permissions: false });
      await installBothProvidersAt(env.fakeHome);

      const ambiguous = await CLI.run([...argv], {
        dir: env.fakeHome,
        globalHome: env.fakeHome,
      });
      const said = flattenCliOutput(ambiguous.output);

      expect(ambiguous.exitCode, said).toBe(EXIT_CODES.INVALID_ARGS);
      expect(said).toContain("--provider");
      // Both names, so the user need not go and look.
      for (const provider of [PROVIDER_CLAUDE[1], PROVIDER_CODEX[1]]) {
        expect(said, provider).toContain(provider);
      }

      for (const folder of [CLAUDE_SOURCE_REL, CODEX_SOURCE_REL]) {
        expect(await fileExists(path.join(env.fakeHome, folder, FILES.CONFIG_TS)), folder).toBe(
          true,
        );
      }
    },
  );

  it.each(ACTS_ON_ONE_INSTALLATION)(
    "lets --provider pick one for $label, which is what makes the refusal above actionable",
    async ({ argv }) => {
      env = await createTestEnvironment({ permissions: false });
      await installBothProvidersAt(env.fakeHome);

      const chosen = await CLI.run([...argv, ...PROVIDER_CODEX], {
        dir: env.fakeHome,
        globalHome: env.fakeHome,
      });
      const said = flattenCliOutput(chosen.output);

      // The claim is only that the flag selected: no refusal about the installation or the flag.
      expect(
        said,
        "the flag it was told to use is one this command does not declare",
      ).not.toContain(NO_SUCH_FLAG);
      expect(said).not.toContain("--provider <");
    },
  );

  it("uninstalls without the flag when the scope holds one, which is what the refusal is against", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish("PrvOne01", ejectedGlobally());

    const codex = await runInitFromOnCodex(
      store,
      "PrvOne01",
      { dir: env.fakeHome, globalHome: env.fakeHome },
      source.sourceDir,
    );
    expect(codex.exitCode, flattenCliOutput(codex.output)).toBe(EXIT_CODES.SUCCESS);

    const uninstalled = await CLI.run(["uninstall", "--yes"], {
      dir: env.fakeHome,
      globalHome: env.fakeHome,
    });
    const said = flattenCliOutput(uninstalled.output);

    expect(uninstalled.exitCode, said).toBe(EXIT_CODES.SUCCESS);
    expect(said).not.toContain(NO_SUCH_FLAG);
    expect(await directoryExists(path.join(env.fakeHome, CODEX_SOURCE_REL))).toBe(false);
  });
});

/**
 * Normalised so two temp roots compare; the Claude CLI's own session state is left out, since this
 * CLI never writes it.
 */
async function installedTreeOf(home: string): Promise<InstallTree> {
  const tree = await readInstallTree(home, {
    skip: [
      path.posix.join(DIRS.CLAUDE, FILES.CLAUDE_SESSION_JSON),
      path.posix.join(DIRS.CLAUDE, FILES.CLAUDE_SESSION_LOCK),
      path.posix.join(DIRS.CLAUDE, DIRS.CLAUDE_BACKUPS),
    ],
  });
  return normalizeInstallTree(tree, { roots: { home: [home] }, cliVersion: await cliVersion() });
}
