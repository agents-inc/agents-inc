/**
 * What the Claude host refuses before an argument reaches a command line, and which installation
 * every call touches.
 *
 * It arrived here from `src/cli/utils/exec.test.ts` with C3, unedited but for the module it
 * imports from and one row: `claudePluginUninstallBestEffort` is gone, because the two-scope
 * sweep is the CALLER's now — `uninstallPlugins` in `commands/uninstall.tsx` reads the scopes off
 * `PluginHost.offeredPlacements`, which is what lets a host that installs plugins globally only
 * sweep one scope rather than two. `lib/__tests__/commands/uninstall.test.ts` holds the order.
 *
 * Its siblings in `__tests__/` beside this file cover what it does not: the seam's shape, and
 * every argv the host hands the binary.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process spawn to prevent actual command execution. Each spawn is answered in the
// top-level beforeEach below, once the fake child it hands back has been imported.
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, spawn: vi.fn<typeof actual.spawn>() };
});

vi.mock("../../utils/logger");

/**
 * The two filesystem reads the LISTING is made of — Claude has no `plugin list --json`, so the
 * one member of this host that spawns nothing is also the one whose pinned installation cannot be
 * seen in a spawned environment.
 *
 * Typed against the real functions, so an answer these mocks give that the functions can no
 * longer return is a compile error here rather than a value nothing reads.
 */
const { mockFileExists, mockReadFileSafe } = vi.hoisted(() => ({
  mockFileExists: vi.fn<typeof fileExists>(),
  mockReadFileSafe: vi.fn<typeof readFileSafe>(),
}));

vi.mock("../../utils/fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/fs")>()),
  fileExists: mockFileExists,
  readFileSafe: mockReadFileSafe,
}));

import { spawn } from "child_process";
import os from "os";
import path from "path";
import { DEFAULT_PLUGIN_NAME } from "../../consts";
import { renderInstalledPluginsRegistry } from "../__tests__/factories/plugin-registry-factories";
import type { fileExists, readFileSafe } from "../../utils/fs";
import type { ClaudeConfigOptions } from "./claude-host";
import { fakeChildProcess } from "./__tests__/helpers/fake-child-process.js";
import {
  claudeHost,
  claudePluginInstall,
  claudePluginMarketplaceAdd,
  claudePluginMarketplaceExists,
  claudePluginMarketplaceList,
  claudePluginMarketplaceRemove,
  claudePluginMarketplaceUpdate,
  claudePluginUninstall,
  isClaudeCLIAvailable,
} from "./claude-host";

/**
 * The word withdrawn from the user-facing surface, as a whole word so
 * `resource` and a path that happens to spell it are not matched.
 */
const WITHDRAWN_NOUN = /\bsources?\b/i;

/** Every spawn exits clean with nothing on either stream — the one answer every case here needs. */
beforeEach(() => {
  vi.mocked(spawn).mockImplementation(() => fakeChildProcess());
});

describe("Claude host argument validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("claudePluginInstall validation", () => {
    it("rejects empty plugin path", async () => {
      await expect(claudePluginInstall("", "project", "/project")).rejects.toThrow(
        "Plugin path must not be empty",
      );
    });

    it("rejects whitespace-only plugin path", async () => {
      await expect(claudePluginInstall("   ", "project", "/project")).rejects.toThrow(
        "Plugin path must not be empty",
      );
    });

    it("rejects oversized plugin path", async () => {
      const longPath = "a".repeat(1025);
      await expect(claudePluginInstall(longPath, "project", "/project")).rejects.toThrow(
        "Plugin path is too long",
      );
    });

    it("accepts plugin path at max length", async () => {
      const maxPath = "a".repeat(1024);
      // Validation passes at exactly max length (function returns Promise<void>)
      await expect(claudePluginInstall(maxPath, "project", "/project")).resolves.toBeUndefined();
    });

    it("rejects plugin path with control characters", async () => {
      await expect(claudePluginInstall("plugin\x00path", "project", "/project")).rejects.toThrow(
        "invalid control characters",
      );
    });

    it("rejects plugin path with null byte", async () => {
      await expect(
        claudePluginInstall("my-skill\0../../etc/passwd", "project", "/project"),
      ).rejects.toThrow("invalid control characters");
    });

    it("rejects plugin path with shell metacharacters", async () => {
      await expect(claudePluginInstall("$(malicious)", "project", "/project")).rejects.toThrow(
        "invalid characters",
      );
    });

    it("rejects plugin path with spaces", async () => {
      await expect(claudePluginInstall("path with spaces", "project", "/project")).rejects.toThrow(
        "invalid characters",
      );
    });

    it("rejects plugin path with semicolons", async () => {
      await expect(claudePluginInstall("path;rm -rf /", "project", "/project")).rejects.toThrow(
        "invalid characters",
      );
    });

    it("rejects plugin path with backticks", async () => {
      await expect(claudePluginInstall("`malicious`", "project", "/project")).rejects.toThrow(
        "invalid characters",
      );
    });

    /**
     * Each accepted value is awaited to its answer. These cases used to assert only that the call
     * returned a Promise, which an async function does whether its validator admits the value or
     * refuses it — so a validator that refused every path left all three green. The spawn mock
     * above closes with exit 0, so an admitted path resolves the way the max-length case does.
     */
    it("accepts valid plugin path", async () => {
      await expect(
        claudePluginInstall("my-skill@my-marketplace", "project", "/project"),
      ).resolves.toBeUndefined();
    });

    it("accepts plugin path with slashes", async () => {
      await expect(
        claudePluginInstall("org/repo/skill", "project", "/project"),
      ).resolves.toBeUndefined();
    });

    it("accepts plugin path with @ symbol", async () => {
      await expect(
        claudePluginInstall("skill-name@marketplace", "project", "/project"),
      ).resolves.toBeUndefined();
    });
  });

  describe("claudePluginMarketplaceAdd validation", () => {
    it("rejects empty source", async () => {
      await expect(claudePluginMarketplaceAdd("")).rejects.toThrow("Marketplace must not be empty");
    });

    it("rejects oversized source", async () => {
      const longSource = "a".repeat(1025);
      await expect(claudePluginMarketplaceAdd(longSource)).rejects.toThrow(
        "Marketplace is too long",
      );
    });

    /**
     * The four refusals narrate around the value they were handed. Each one is a
     * `Marketplace ...` sentence, so the qualifier "source" in front of it is the word
     * withdrawn — including the one in the character-set explanation.
     */
    it.each([
      ["empty", ""],
      ["oversized", "a".repeat(1025)],
      ["control character", "user\x00/repo"],
      ["shell injection", "$(whoami)/repo"],
    ])("does not call the marketplace a source when refusing a %s value", async (_name, value) => {
      await expect(claudePluginMarketplaceAdd(value)).rejects.toThrow(/Marketplace/);
      await expect(claudePluginMarketplaceAdd(value)).rejects.not.toThrow(WITHDRAWN_NOUN);
    });

    it("accepts source at max length", async () => {
      const maxSource = "a".repeat(1024);
      await expect(claudePluginMarketplaceAdd(maxSource)).resolves.toBeUndefined();
    });

    it("rejects source with control characters", async () => {
      await expect(claudePluginMarketplaceAdd("user\x00/repo")).rejects.toThrow(
        "invalid control characters",
      );
    });

    it("rejects source with shell injection", async () => {
      await expect(claudePluginMarketplaceAdd("$(whoami)/repo")).rejects.toThrow(
        "invalid characters",
      );
    });

    it("rejects source with spaces", async () => {
      await expect(claudePluginMarketplaceAdd("user /repo")).rejects.toThrow("invalid characters");
    });

    it("accepts owner/repo format", async () => {
      await expect(claudePluginMarketplaceAdd("my-org/my-repo")).resolves.toBeUndefined();
    });

    it("accepts github: prefixed source", async () => {
      await expect(claudePluginMarketplaceAdd("github:my-org/my-repo")).resolves.toBeUndefined();
    });

    it("accepts source with dots and underscores", async () => {
      await expect(claudePluginMarketplaceAdd("my_org.name/my_repo.name")).resolves.toBeUndefined();
    });

    it("accepts source with @ symbol", async () => {
      await expect(claudePluginMarketplaceAdd("my-org/my-repo@main")).resolves.toBeUndefined();
    });
  });

  describe("claudePluginUninstall validation", () => {
    it("rejects empty plugin name", async () => {
      await expect(claudePluginUninstall("", "project", "/project")).rejects.toThrow(
        "Plugin name must not be empty",
      );
    });

    it("rejects whitespace-only plugin name", async () => {
      await expect(claudePluginUninstall("   ", "project", "/project")).rejects.toThrow(
        "Plugin name must not be empty",
      );
    });

    it("rejects oversized plugin name", async () => {
      const longName = "a".repeat(257);
      await expect(claudePluginUninstall(longName, "project", "/project")).rejects.toThrow(
        "Plugin name is too long",
      );
    });

    it("rejects plugin name with control characters", async () => {
      await expect(claudePluginUninstall("plugin\x00name", "project", "/project")).rejects.toThrow(
        "invalid control characters",
      );
    });

    it("rejects plugin name with shell metacharacters", async () => {
      await expect(claudePluginUninstall("$(malicious)", "project", "/project")).rejects.toThrow(
        "invalid characters",
      );
    });

    it("accepts valid plugin name", async () => {
      await expect(claudePluginUninstall(DEFAULT_PLUGIN_NAME, "project", "/project")).resolves.toBe(
        "removed",
      );
    });

    it("accepts plugin name with @ symbol", async () => {
      await expect(claudePluginUninstall("@org/plugin-name", "project", "/project")).resolves.toBe(
        "removed",
      );
    });
  });
});

const ISOLATED_CONFIG_DIR = "/tmp/isolated-claude-config";
const PROJECT_DIR = "/project";
const PLUGIN_REF = "my-skill@my-marketplace";
const MARKETPLACE_NAME = "my-marketplace";
const MARKETPLACE_SOURCE = "my-org/my-repo";

/**
 * Every helper that reaches the Claude CLI's config tree.
 *
 * **`isClaudeCLIAvailable` is in this list, and it was deliberately absent until 2026-09-22.**
 * The reason given for leaving it out was true of this binary and of no other: measured on
 * 2026-09-21, `claude --version` under a pinned scratch `HOME` and `CLAUDE_CONFIG_DIR` wrote
 * nothing at all. What made it the wrong call is that the seam carries the option, and the next
 * host's probe is a WRITE — `codex --version` links helper binaries under `$CODEX_HOME/tmp/arg0/`
 * before it reads an argument (re-derived on `@openai/codex` 0.155.1, 2026-09-22) — so a member
 * whose Claude implementation drops the argument makes the seam untestable for the host that
 * needs it. `listPlugins` is absent for a different reason and has its own describe below: it
 * spawns nothing, so no spawned environment can carry its answer.
 */
const CONFIG_READING_HELPERS: Array<[string, (options?: ClaudeConfigOptions) => Promise<unknown>]> =
  [
    [
      "claudePluginInstall",
      (options) => claudePluginInstall(PLUGIN_REF, "user", PROJECT_DIR, options),
    ],
    [
      "claudePluginUninstall",
      (options) => claudePluginUninstall(PLUGIN_REF, "user", PROJECT_DIR, options),
    ],
    ["claudePluginMarketplaceList", (options) => claudePluginMarketplaceList(options)],
    [
      "claudePluginMarketplaceExists",
      (options) => claudePluginMarketplaceExists(MARKETPLACE_NAME, options),
    ],
    [
      "claudePluginMarketplaceAdd",
      (options) => claudePluginMarketplaceAdd(MARKETPLACE_SOURCE, options),
    ],
    [
      "claudePluginMarketplaceRemove",
      (options) => claudePluginMarketplaceRemove(MARKETPLACE_NAME, options),
    ],
    [
      "claudePluginMarketplaceUpdate",
      (options) => claudePluginMarketplaceUpdate(MARKETPLACE_NAME, options),
    ],
    ["isClaudeCLIAvailable", (options) => isClaudeCLIAvailable(options)],
  ];

/**
 * `CLAUDE_CONFIG_DIR` redirects the Claude CLI's whole config tree — marketplace
 * registry, installed-plugin registry and user settings — and it BEATS `HOME`
 * when both are set (measured against Claude Code 2.1.231). A helper that does
 * not forward it writes into whichever installation the calling process happens
 * to inherit, which for a test runner is the developer's own.
 */
describe("Claude config dir isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(CONFIG_READING_HELPERS)(
    "%s forwards the config dir it was given",
    async (_name, call) => {
      await call({ configDir: ISOLATED_CONFIG_DIR });

      expect(vi.mocked(spawn).mock.lastCall?.[2]?.env?.CLAUDE_CONFIG_DIR).toBe(ISOLATED_CONFIG_DIR);
    },
  );

  it.each(CONFIG_READING_HELPERS)(
    "%s leaves the inherited config dir alone when given none",
    async (_name, call) => {
      await call();

      // The subject guard. With no CLAUDE_CONFIG_DIR exported by the shell, a helper that
      // spawned nothing reads `undefined` on both sides of the assertion below and passes it.
      expect(
        vi.mocked(spawn),
        "the helper spawned nothing, so the environment below was never handed to a process",
      ).toHaveBeenCalled();
      expect(vi.mocked(spawn).mock.lastCall?.[2]?.env?.CLAUDE_CONFIG_DIR).toBe(
        process.env.CLAUDE_CONFIG_DIR,
      );
    },
  );

  it("keeps the rest of the environment when isolating the config dir", async () => {
    await claudePluginMarketplaceAdd(MARKETPLACE_SOURCE, { configDir: ISOLATED_CONFIG_DIR });

    expect(vi.mocked(spawn).mock.lastCall?.[2]?.env?.PATH).toBe(process.env.PATH);
  });
});

/**
 * Which installation the LISTING is read from, which no spawned environment can show.
 *
 * Every other member of this host hands `CLAUDE_CONFIG_DIR` to a child process, so the describe
 * above can read the answer off `spawn`. This one reads two files: the installed-plugin registry
 * under the plugins directory, and the project's own settings. A member that ignored the pinned
 * config directory would answer about the developer's own installation while every spawned call
 * beside it answered about the test's — and the two disagreeing is invisible, because a listing
 * has no exit code to be wrong.
 *
 * The paths are literals rather than the product's own constants, for the reason
 * `e2e/pages/constants.ts` exists: an assertion built from the constant the product joins moves
 * with it and could never fail.
 */
describe("which installation a listing is read from", () => {
  const REGISTRY_FILE = "installed_plugins.json";

  beforeEach(() => {
    vi.clearAllMocks();
    mockFileExists.mockResolvedValue(true);
    mockReadFileSafe.mockResolvedValue(renderInstalledPluginsRegistry({}));
  });

  it("reads the registry of the installation the caller pinned", async () => {
    await claudeHost().listPlugins(PROJECT_DIR, { configDir: ISOLATED_CONFIG_DIR });

    expect(
      mockFileExists,
      "without this the option is accepted and dropped, and a smoke run reads the machine's real ~/.claude while writing into a temp tree",
    ).toHaveBeenCalledWith(path.join(ISOLATED_CONFIG_DIR, "plugins", REGISTRY_FILE));
  });

  it("reads the user's own installation when nothing is pinned", async () => {
    await claudeHost().listPlugins(PROJECT_DIR);

    expect(
      mockFileExists,
      "a host that always demanded a pinned directory would answer nothing in production, where the installation is whichever one the process already points at",
    ).toHaveBeenCalledWith(path.join(os.homedir(), ".claude", "plugins", REGISTRY_FILE));
  });

  it("answers an empty listing for an installation with no registry at all", async () => {
    mockFileExists.mockResolvedValue(false);

    expect(
      await claudeHost().listPlugins(PROJECT_DIR, { configDir: ISOLATED_CONFIG_DIR }),
      "an installation that has never installed a plugin is not a broken one, and reading it as an error would fail every command on a fresh machine",
    ).toStrictEqual([]);
  });
});
