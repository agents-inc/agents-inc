import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process spawn to prevent actual command execution
vi.mock("child_process", () => ({
  spawn: vi.fn(() => {
    const stdoutCallbacks: Array<(data: string) => void> = [];
    const stderrCallbacks: Array<(data: string) => void> = [];
    const closeCallbacks: Array<(code: number) => void> = [];

    const proc = {
      stdout: {
        on: vi.fn((event: string, cb: (data: string) => void) => {
          if (event === "data") stdoutCallbacks.push(cb);
        }),
      },
      stderr: {
        on: vi.fn((event: string, cb: (data: string) => void) => {
          if (event === "data") stderrCallbacks.push(cb);
        }),
      },
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === "close") closeCallbacks.push(cb);
      }),
    };

    // Simulate successful command execution asynchronously
    setTimeout(() => {
      stdoutCallbacks.forEach((cb) => cb(""));
      stderrCallbacks.forEach((cb) => cb(""));
      closeCallbacks.forEach((cb) => cb(0));
    }, 0);

    return proc;
  }),
}));

vi.mock("./logger");

import { spawn } from "child_process";
import { DEFAULT_PLUGIN_NAME } from "../consts";
import type { ClaudeConfigOptions } from "./exec";
import {
  claudePluginInstall,
  claudePluginMarketplaceAdd,
  claudePluginMarketplaceExists,
  claudePluginMarketplaceList,
  claudePluginMarketplaceRemove,
  claudePluginMarketplaceUpdate,
  claudePluginUninstall,
  claudePluginUninstallBestEffort,
} from "./exec";

/**
 * The word CLI-463 withdraws from the user-facing surface, as a whole word so
 * `resource` and a path that happens to spell it are not matched.
 */
const WITHDRAWN_NOUN = /\bsources?\b/i;

describe("exec argument validation", () => {
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

    it("accepts valid plugin path", async () => {
      // Valid path should pass validation (spawn is mocked so it won't actually execute)
      // The spawn mock doesn't resolve, so the promise hangs -- we just verify no validation error
      const promise = claudePluginInstall("my-skill@my-marketplace", "project", "/project");
      // If validation passed, the function would call spawn (which is mocked and won't resolve)
      // We can't await it, but we can verify it didn't throw synchronously
      expect(promise).toBeInstanceOf(Promise);
    });

    it("accepts plugin path with slashes", async () => {
      const promise = claudePluginInstall("org/repo/skill", "project", "/project");
      expect(promise).toBeInstanceOf(Promise);
    });

    it("accepts plugin path with @ symbol", async () => {
      const promise = claudePluginInstall("skill-name@marketplace", "project", "/project");
      expect(promise).toBeInstanceOf(Promise);
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
     * CLI-463 takes out — including the one in the character-set explanation.
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
      const promise = claudePluginMarketplaceAdd("my-org/my-repo");
      expect(promise).toBeInstanceOf(Promise);
    });

    it("accepts github: prefixed source", async () => {
      const promise = claudePluginMarketplaceAdd("github:my-org/my-repo");
      expect(promise).toBeInstanceOf(Promise);
    });

    it("accepts source with dots and underscores", async () => {
      const promise = claudePluginMarketplaceAdd("my_org.name/my_repo.name");
      expect(promise).toBeInstanceOf(Promise);
    });

    it("accepts source with @ symbol", async () => {
      const promise = claudePluginMarketplaceAdd("my-org/my-repo@main");
      expect(promise).toBeInstanceOf(Promise);
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
      const promise = claudePluginUninstall(DEFAULT_PLUGIN_NAME, "project", "/project");
      expect(promise).toBeInstanceOf(Promise);
    });

    it("accepts plugin name with @ symbol", async () => {
      const promise = claudePluginUninstall("@org/plugin-name", "project", "/project");
      expect(promise).toBeInstanceOf(Promise);
    });
  });
});

const ISOLATED_CONFIG_DIR = "/tmp/isolated-claude-config";
const PROJECT_DIR = "/project";
const PLUGIN_REF = "my-skill@my-marketplace";
const MARKETPLACE_NAME = "my-marketplace";
const MARKETPLACE_SOURCE = "my-org/my-repo";

/**
 * Every helper that reaches the Claude CLI's config tree. `isClaudeCLIAvailable`
 * is absent on purpose — `claude --version` reads no config, so it has nothing
 * to isolate.
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
    [
      "claudePluginUninstallBestEffort",
      (options) => claudePluginUninstallBestEffort(PLUGIN_REF, "user", PROJECT_DIR, options),
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
