import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, spawn: vi.fn<typeof actual.spawn>() };
});

vi.mock("../../utils/logger");

import { spawn } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { DEFAULT_PLUGIN_NAME } from "../../consts";
import {
  buildUserPluginInstallation,
  renderInstalledPluginsRegistry,
} from "../__tests__/factories/plugin-registry-factories";
import { useFakeHome } from "../__tests__/helpers/isolated-home";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";
import type { ClaudeConfigOptions } from "./claude-host";
import { type FakeChildReply, fakeChildProcess } from "./__tests__/helpers/fake-child-process.js";
import { warn } from "../../utils/logger";
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

/** Whole word, so `resource` does not match. */
const WITHDRAWN_NOUN = /\bsources?\b/i;

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

// `CLAUDE_CONFIG_DIR` beats `HOME`; an unforwarded one reaches the developer's own installation.
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

      // Without this, a helper that spawned nothing reads `undefined` on both sides below.
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

describe("which installation a listing is read from", () => {
  const PINNED_PLUGIN = "pinned-skill@my-marketplace";
  const USERS_OWN_PLUGIN = "users-own-skill@my-marketplace";
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await createTempDir("cc-claude-listing-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  /** Claude's own registry under `<configRoot>/plugins`, recording one user-scoped install. */
  async function registerIn(configRoot: string, pluginKey: string): Promise<void> {
    const pluginsRoot = path.join(configRoot, "plugins");
    await mkdir(pluginsRoot, { recursive: true });
    await writeFile(
      path.join(pluginsRoot, "installed_plugins.json"),
      renderInstalledPluginsRegistry({
        [pluginKey]: [buildUserPluginInstallation(path.join(configRoot, "cache", pluginKey))],
      }),
    );
  }

  async function listedKeys(options?: ClaudeConfigOptions): Promise<string[]> {
    return (await claudeHost().listPlugins(PROJECT_DIR, options)).map((plugin) => plugin.pluginKey);
  }

  it("reads the registry of the installation the caller pinned", async () => {
    const pinned = path.join(tempDir, "isolated-claude-config");
    await registerIn(pinned, PINNED_PLUGIN);
    await registerIn(path.join(home.dir, ".claude"), USERS_OWN_PLUGIN);

    expect(
      await listedKeys({ configDir: pinned }),
      "without this the option is accepted and dropped, and a smoke run reads the machine's real ~/.claude while writing into a temp tree",
    ).toStrictEqual([PINNED_PLUGIN]);
  });

  it("reads the user's own installation when nothing is pinned", async () => {
    await registerIn(path.join(home.dir, ".claude"), USERS_OWN_PLUGIN);

    expect(
      await listedKeys(),
      "a host that always demanded a pinned directory would answer nothing in production, where the installation is whichever one the process already points at",
    ).toStrictEqual([USERS_OWN_PLUGIN]);
  });

  it("answers an empty listing for an installation with no registry at all", async () => {
    expect(
      await listedKeys({ configDir: path.join(tempDir, "never-installed-anything") }),
      "an installation that has never installed a plugin is not a broken one, and reading it as an error would fail every command on a fresh machine",
    ).toStrictEqual([]);
  });
});

/** What each Claude call answers and says when `claude` refuses, cannot run, or answers oddly. */
describe("what the Claude host says when claude fails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function claudeReplies(reply: FakeChildReply): void {
    vi.mocked(spawn).mockImplementation(() => fakeChildProcess(reply));
  }

  const CANNOT_RUN: FakeChildReply = { unrunnable: true };

  it("answers unavailable when claude cannot be run at all", async () => {
    claudeReplies(CANNOT_RUN);

    expect(await isClaudeCLIAvailable()).toBe(false);
  });

  it("answers an empty listing, quietly, when the listing command fails", async () => {
    claudeReplies({ exitCode: 1, stdout: "" });

    expect(await claudePluginMarketplaceList()).toStrictEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("answers an empty listing, and says so, when the listing is not JSON", async () => {
    claudeReplies({ stdout: "not json" });

    expect(await claudePluginMarketplaceList()).toStrictEqual([]);
    expect(warn).toHaveBeenCalledWith("Failed to parse marketplace list output as JSON");
  });

  it("answers an empty listing, and says so, when the listing is not an array of entries", async () => {
    claudeReplies({ stdout: JSON.stringify({ marketplaces: [] }) });

    expect(await claudePluginMarketplaceList()).toStrictEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "Unexpected marketplace list format — expected an array of marketplace entries",
    );
  });

  it("takes a marketplace claude already has as added", async () => {
    claudeReplies({
      exitCode: 1,
      stderr: `Marketplace '${MARKETPLACE_NAME}' is already installed`,
    });

    await expect(claudePluginMarketplaceAdd(MARKETPLACE_SOURCE)).resolves.toBeUndefined();
  });

  it("quotes claude, trimmed, when adding a marketplace fails", async () => {
    claudeReplies({ exitCode: 1, stderr: "  network down \n" });

    await expect(claudePluginMarketplaceAdd(MARKETPLACE_SOURCE)).rejects.toThrow(
      new Error("Failed to add marketplace: network down"),
    );
  });

  it("names the attempt and keeps the cause when claude cannot be run to add a marketplace", async () => {
    claudeReplies(CANNOT_RUN);

    await expect(claudePluginMarketplaceAdd(MARKETPLACE_SOURCE)).rejects.toMatchObject({
      message: "Failed to add marketplace: spawn ENOENT",
      cause: expect.objectContaining({ message: "spawn ENOENT" }),
    });
  });

  it("removes a marketplace by name with claude's own remove verb", async () => {
    claudeReplies({});

    await claudePluginMarketplaceRemove(MARKETPLACE_NAME);

    expect(vi.mocked(spawn).mock.lastCall?.[1]).toStrictEqual([
      "plugin",
      "marketplace",
      "remove",
      MARKETPLACE_NAME,
    ]);
  });

  it.each(["Marketplace not found", "Marketplace not installed"])(
    "takes a marketplace claude reports gone (%s) as removed",
    async (said) => {
      claudeReplies({ exitCode: 1, stderr: said });

      await expect(claudePluginMarketplaceRemove(MARKETPLACE_NAME)).resolves.toBeUndefined();
    },
  );

  it("quotes claude when removing a marketplace fails for another reason", async () => {
    claudeReplies({ exitCode: 1, stderr: "permission denied" });

    await expect(claudePluginMarketplaceRemove(MARKETPLACE_NAME)).rejects.toThrow(
      new Error("Failed to remove marketplace: permission denied"),
    );
  });

  it("names the attempt when claude cannot be run to remove or update a marketplace", async () => {
    claudeReplies(CANNOT_RUN);

    await expect(claudePluginMarketplaceRemove(MARKETPLACE_NAME)).rejects.toThrow(
      new Error("Failed to remove marketplace: spawn ENOENT"),
    );
    await expect(claudePluginMarketplaceUpdate(MARKETPLACE_NAME)).rejects.toThrow(
      new Error("Failed to update marketplace: spawn ENOENT"),
    );
  });

  it("quotes stdout when claude said nothing on stderr, and calls silence an unknown error", async () => {
    claudeReplies({ exitCode: 1, stdout: "said on stdout\n" });
    await expect(claudePluginMarketplaceUpdate(MARKETPLACE_NAME)).rejects.toThrow(
      new Error("Failed to update marketplace: said on stdout"),
    );

    claudeReplies({ exitCode: 1 });
    await expect(claudePluginMarketplaceUpdate(MARKETPLACE_NAME)).rejects.toThrow(
      new Error("Failed to update marketplace: Unknown error"),
    );
  });

  it.each([
    ["removed", (name: string) => claudePluginMarketplaceRemove(name)],
    ["updated", (name: string) => claudePluginMarketplaceUpdate(name)],
  ])("refuses a marketplace name it would not hand to claude before it is %s", async (_, call) => {
    await expect(call("my marketplace; rm -rf /")).rejects.toThrow(/invalid characters/i);
    expect(spawn).not.toHaveBeenCalled();
  });
});
