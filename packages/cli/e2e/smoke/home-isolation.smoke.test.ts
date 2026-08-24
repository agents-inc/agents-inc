import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { EXIT_CODES, E2E_MARKETPLACE_NAME, TIMEOUTS } from "../pages/constants.js";
import {
  claudePluginMarketplaceAdd,
  claudePluginMarketplaceList,
  claudePluginMarketplaceRemove,
  cleanupFixture,
  cleanupTempDir,
  createIsolatedClaudeHome,
  createTempDir,
  execCommand,
  isClaudeCLIAvailable,
  type ClaudeConfigOptions,
  type MarketplaceInfo,
} from "../helpers/test-utils.js";

/**
 * Where does a `claude plugin` invocation keep its state, and how is it redirected?
 *
 * The answer, settled here rather than assumed: BOTH `HOME` and `CLAUDE_CONFIG_DIR`
 * redirect the Claude CLI's whole config tree — reads AND writes — and
 * `CLAUDE_CONFIG_DIR` WINS when the two disagree. `HOME=<h>` puts the tree at
 * `<h>/.claude`, which is the directory our own CLI reads the plugin registry from
 * under the same HOME, so both binaries see one installation. That is why the e2e
 * fixtures pin the config dir explicitly instead of relying on `HOME` alone: an
 * exported `CLAUDE_CONFIG_DIR` on a developer's machine overrides every fake HOME
 * in the suite, and a helper called in-process has no fake HOME to inherit at all.
 *
 * This file exists because the question was once asked and answered with
 * `expect(typeof result.exitCode).toBe("number")` — an assertion that passes on a
 * crash. It is the guard that keeps the answer true, so every claim below is read
 * back out of the registry the invocation actually wrote to, and paired with the
 * machine's own installation being byte-identical to how the run found it.
 *
 * The negative is asserted as "the ambient list did not move", not as "the ambient
 * list lacks this name": a machine carrying a stale registration under the fixture
 * name would fail the second for a reason that has nothing to do with isolation,
 * while re-registering it at this run's source path still moves the list.
 *
 * NOTE: smoke tests for the Claude CLI binary, NOT E2E tests for our CLI.
 */

/** Neutralises an exported `CLAUDE_CONFIG_DIR` so a HOME-only claim tests HOME. */
const NO_AMBIENT_CONFIG_DIR = { CLAUDE_CONFIG_DIR: undefined };

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("Claude CLI config isolation", () => {
  let fixture: E2EPluginSource;
  /** The marketplaces the machine's own installation carries. Must not move. */
  let ambientMarketplaces: MarketplaceInfo[];

  /** Names registered in one config tree. */
  async function registeredMarketplaces(options: ClaudeConfigOptions): Promise<string[]> {
    const marketplaces = await claudePluginMarketplaceList(options);
    return marketplaces.map((marketplace) => marketplace.name);
  }

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    ambientMarketplaces = await claudePluginMarketplaceList();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    // Safety net, not cleanup: every test below registers into a temp tree, so
    // reaching the ambient installation at all means the isolation regressed.
    // Deregistering keeps a red run from leaving the machine dirty for the next.
    await claudePluginMarketplaceRemove(E2E_MARKETPLACE_NAME);
    await cleanupFixture(fixture);
  });

  it("runs the binary against a home that holds no Claude state", async () => {
    const isolated = await createIsolatedClaudeHome();
    try {
      const result = await execCommand("claude", ["--version"], {
        env: { HOME: isolated.home, ...NO_AMBIENT_CONFIG_DIR },
      });

      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(result.stdout.trim()).toMatch(/\d+\.\d+/);
    } finally {
      await cleanupTempDir(isolated.home);
    }
  });

  it("registers into the fake HOME rather than the machine's installation", async () => {
    const isolated = await createIsolatedClaudeHome();
    try {
      const add = await execCommand("claude", ["plugin", "marketplace", "add", fixture.sourceDir], {
        env: { HOME: isolated.home, ...NO_AMBIENT_CONFIG_DIR },
      });
      expect(add.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Reading it back through the config dir proves two things at once: the
      // registration happened, and `<home>/.claude` is the tree HOME chose — the
      // directory our own CLI reads the plugin registry from under that HOME.
      expect(await registeredMarketplaces({ configDir: isolated.configDir })).toContain(
        E2E_MARKETPLACE_NAME,
      );
      expect(await claudePluginMarketplaceList()).toStrictEqual(ambientMarketplaces);
    } finally {
      await cleanupTempDir(isolated.home);
    }
  });

  it("registers into CLAUDE_CONFIG_DIR rather than the machine's installation", async () => {
    const configDir = await createTempDir();
    try {
      const add = await execCommand("claude", ["plugin", "marketplace", "add", fixture.sourceDir], {
        env: { CLAUDE_CONFIG_DIR: configDir },
      });
      expect(add.exitCode).toBe(EXIT_CODES.SUCCESS);

      expect(await registeredMarketplaces({ configDir })).toContain(E2E_MARKETPLACE_NAME);
      expect(await claudePluginMarketplaceList()).toStrictEqual(ambientMarketplaces);
    } finally {
      await cleanupTempDir(configDir);
    }
  });

  it("lets CLAUDE_CONFIG_DIR win when it disagrees with HOME", async () => {
    const isolated = await createIsolatedClaudeHome();
    const configDir = await createTempDir();
    try {
      await execCommand("claude", ["plugin", "marketplace", "add", fixture.sourceDir], {
        env: { HOME: isolated.home, CLAUDE_CONFIG_DIR: configDir },
      });

      expect(await registeredMarketplaces({ configDir })).toContain(E2E_MARKETPLACE_NAME);
      expect(await registeredMarketplaces({ configDir: isolated.configDir })).not.toContain(
        E2E_MARKETPLACE_NAME,
      );
    } finally {
      await cleanupTempDir(isolated.home);
      await cleanupTempDir(configDir);
    }
  });

  it("isolates our own marketplace helpers, not just a raw invocation", async () => {
    const isolated = await createIsolatedClaudeHome();
    try {
      await claudePluginMarketplaceAdd(fixture.sourceDir, { configDir: isolated.configDir });

      expect(await registeredMarketplaces({ configDir: isolated.configDir })).toContain(
        E2E_MARKETPLACE_NAME,
      );
      expect(await claudePluginMarketplaceList()).toStrictEqual(ambientMarketplaces);
    } finally {
      await cleanupTempDir(isolated.home);
    }
  });

  it("takes the registration with the temp tree when the tree is removed", async () => {
    const isolated = await createIsolatedClaudeHome();
    await claudePluginMarketplaceAdd(fixture.sourceDir, { configDir: isolated.configDir });
    expect(await registeredMarketplaces({ configDir: isolated.configDir })).toContain(
      E2E_MARKETPLACE_NAME,
    );

    await cleanupTempDir(isolated.home);

    expect(await registeredMarketplaces({ configDir: isolated.configDir })).not.toContain(
      E2E_MARKETPLACE_NAME,
    );
  });

  it("leaves the machine's own installation exactly as it found it", async () => {
    expect(await claudePluginMarketplaceList()).toStrictEqual(ambientMarketplaces);
  });
});
