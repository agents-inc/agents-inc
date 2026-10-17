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

// Both HOME and CLAUDE_CONFIG_DIR redirect the Claude CLI's config tree, and CLAUDE_CONFIG_DIR wins,
// so fixtures pin the config dir explicitly. The negative is "the ambient list did not move".

/** So a HOME-only claim tests HOME. */
const NO_AMBIENT_CONFIG_DIR = { CLAUDE_CONFIG_DIR: undefined };

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("Claude CLI config isolation", () => {
  let fixture: E2EPluginSource;
  /** Must not move. */
  let ambientMarketplaces: MarketplaceInfo[];

  async function registeredMarketplaces(options: ClaudeConfigOptions): Promise<string[]> {
    const marketplaces = await claudePluginMarketplaceList(options);
    return marketplaces.map((marketplace) => marketplace.name);
  }

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    ambientMarketplaces = await claudePluginMarketplaceList();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    // Safety net: reaching the ambient installation means isolation regressed; keep the machine clean.
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

      // `<home>/.claude` is the tree HOME chose, which our CLI also reads.
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
