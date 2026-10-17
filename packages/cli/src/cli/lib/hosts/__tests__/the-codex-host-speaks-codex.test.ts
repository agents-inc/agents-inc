import type { SpawnOptions } from "child_process";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hostFor } from "../host-for.js";
import { type FakeChildReply, fakeChildProcess } from "./helpers/fake-child-process.js";

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, spawn: vi.fn<typeof actual.spawn>() };
});
vi.mock("../../../utils/logger");

const { spawn } = await import("child_process");

/** Every plugin WRITE is made from here; Codex routes nothing by the cwd. */
const HOME = "/fake-home";

/** A listing asked from here answers the project's own `enabled` switch. */
const PROJECT = "/fake-home/a-project";

const CODEX_STATE = "/fake-home/somewhere-else/.codex";

const MARKETPLACE = "agents-inc";
const MARKETPLACE_SOURCE = "/fake-home/a-local-marketplace";

const A_MARKETPLACE_WE_DID_NOT_ADD = "openai-api-curated";

/** `upgrade` takes only a git-sourced marketplace. */
const GIT_MARKETPLACE = "agents-inc-git";

const PLUGIN = "web-framework-react";
const PLUGIN_REF = `${PLUGIN}@${MARKETPLACE}`;
const PLUGIN_VERSION = "1.2.3";

const DISABLED_PLUGIN = "web-testing-vitest";
const DISABLED_PLUGIN_REF = `${DISABLED_PLUGIN}@${MARKETPLACE}`;
const DISABLED_PLUGIN_VERSION = "2.0.0";

/** Codex prints this on every run under the temp dir, exit 0 included. */
const PATH_ALIAS_WARNING =
  'WARNING: proceeding, even though we could not create PATH aliases: Refusing to create helper binaries under temporary dir "/tmp"\n';

const ALREADY_ADDED_ELSEWHERE = `Error: marketplace '${MARKETPLACE}' is already added from a different source; remove it before adding this source`;

type Invocation = {
  command: string;
  args: readonly string[];
  cwd: SpawnOptions["cwd"];
  codexHome: string | undefined;
};

const invocations: Invocation[] = [];
let replies: FakeChildReply[] = [];

function marketplaceListDocument(
  entries: readonly { name: string; sourceType: "local" | "git"; source: string }[],
): string {
  return JSON.stringify({
    marketplaces: entries.map((entry) => ({
      name: entry.name,
      root: `${CODEX_STATE}/marketplaces/${entry.name}`,
      marketplaceSource: { sourceType: entry.sourceType, source: entry.source },
    })),
  });
}

function pluginListDocument(
  entries: readonly { name: string; version: string; enabled: boolean }[],
): string {
  return JSON.stringify({
    installed: entries.map((entry) => ({
      pluginId: `${entry.name}@${MARKETPLACE}`,
      name: entry.name,
      marketplaceName: MARKETPLACE,
      version: entry.version,
      installed: true,
      enabled: entry.enabled,
      source: { source: "local", path: `${MARKETPLACE_SOURCE}/plugins/${entry.name}` },
      marketplaceSource: { sourceType: "local", source: MARKETPLACE_SOURCE },
      installPolicy: "AVAILABLE",
      authPolicy: "ON_INSTALL",
    })),
    available: [],
  });
}

/** Identical whether anything was removed or not. */
function removalDocument(name: string): string {
  return JSON.stringify({
    pluginId: `${name}@${MARKETPLACE}`,
    name,
    marketplaceName: MARKETPLACE,
  });
}

const ONE_ENABLED_PLUGIN = pluginListDocument([
  { name: PLUGIN, version: PLUGIN_VERSION, enabled: true },
]);

const NOTHING_INSTALLED = pluginListDocument([]);

function onlyInvocation(): Invocation {
  const [first, ...rest] = invocations;
  if (first === undefined) throw new Error("the host spawned nothing at all");
  if (rest.length > 0) {
    throw new Error(`the host spawned ${String(invocations.length)} processes rather than one`);
  }
  return first;
}

function everyArgv(): (readonly string[])[] {
  return invocations.map((invocation) => invocation.args);
}

describe("the Codex host's invocations", () => {
  beforeEach(() => {
    invocations.length = 0;
    replies = [];
    vi.spyOn(os, "homedir").mockReturnValue(HOME);

    vi.mocked(spawn).mockImplementation((command, args, options) => {
      invocations.push({
        command,
        args,
        cwd: options.cwd,
        codexHome: options.env?.["CODEX_HOME"],
      });
      return fakeChildProcess(replies.shift());
    });
  });

  afterEach(() => {
    vi.mocked(os.homedir).mockRestore();
  });

  // `codex --version` writes under `$CODEX_HOME`, so the state tree matters and the cwd does not.
  describe("asking whether the host is available", () => {
    it("runs the binary's own version flag under the state tree it was given", async () => {
      expect(await hostFor("codex").isAvailable({ configDir: CODEX_STATE })).toBe(true);

      const probe = onlyInvocation();
      expect(probe.command).toBe("codex");
      expect(probe.args).toStrictEqual(["--version"]);
      expect(
        probe.codexHome,
        "an availability probe with no CODEX_HOME writes into the developer's own Codex state on every run",
      ).toBe(CODEX_STATE);
    });

    it("answers false when the binary is there and fails", async () => {
      replies = [{ exitCode: 1 }];

      expect(
        await hostFor("codex").isAvailable({ configDir: CODEX_STATE }),
        "a binary on PATH that cannot run is not an available host, and treating it as one makes every later call a thrown error",
      ).toBe(false);
    });

    it("answers false when there is no binary to run at all", async () => {
      replies = [{ unrunnable: true }];

      expect(
        await hostFor("codex").isAvailable({ configDir: CODEX_STATE }),
        "a missing `codex` arrives as a spawn error rather than an exit code, and an uncaught one aborts the command that was only asking",
      ).toBe(false);
    });
  });

  // Codex wraps the list in an object where Claude answers a bare array.
  describe("reading the marketplaces Codex knows", () => {
    it("reads Codex's object-wrapped document rather than Claude's array", async () => {
      replies = [
        {
          stdout: marketplaceListDocument([
            { name: MARKETPLACE, sourceType: "local", source: MARKETPLACE_SOURCE },
          ]),
        },
      ];

      expect(
        await hostFor("codex").marketplaceExists(MARKETPLACE, { configDir: CODEX_STATE }),
        "a marketplace this CLI registered is reported absent by a parser written for Claude's shape",
      ).toBe(true);

      expect(onlyInvocation()).toStrictEqual({
        command: "codex",
        args: ["plugin", "marketplace", "list", "--json"],
        cwd: HOME,
        codexHome: CODEX_STATE,
      });
    });

    it("finds ours beside one it did not add, and still answers false for a name nobody registered", async () => {
      const registry = marketplaceListDocument([
        {
          name: A_MARKETPLACE_WE_DID_NOT_ADD,
          sourceType: "local",
          source: `${CODEX_STATE}/.tmp/plugins`,
        },
        { name: MARKETPLACE, sourceType: "local", source: MARKETPLACE_SOURCE },
      ]);
      replies = [{ stdout: registry }, { stdout: registry }];
      const host = hostFor("codex");

      expect(await host.marketplaceExists(MARKETPLACE, { configDir: CODEX_STATE })).toBe(true);
      expect(
        await host.marketplaceExists("a-marketplace-nobody-added", { configDir: CODEX_STATE }),
        "a predicate that answered true for any non-empty registry would be green on Codex's own bundled entry alone",
      ).toBe(false);
    });

    it("registers a marketplace from its source, from the home directory", async () => {
      await hostFor("codex").addMarketplace(MARKETPLACE_SOURCE, { configDir: CODEX_STATE });

      expect(onlyInvocation()).toStrictEqual({
        command: "codex",
        args: ["plugin", "marketplace", "add", MARKETPLACE_SOURCE, "--json"],
        cwd: HOME,
        codexHome: CODEX_STATE,
      });
    });

    it("quotes a refusal without the PATH-alias warning Codex prints on every run", async () => {
      replies = [{ exitCode: 1, stderr: `${PATH_ALIAS_WARNING}${ALREADY_ADDED_ELSEWHERE}\n` }];

      const failed = hostFor("codex").addMarketplace(MARKETPLACE_SOURCE, {
        configDir: CODEX_STATE,
      });

      await expect(failed).rejects.toThrow(ALREADY_ADDED_ELSEWHERE);
      await expect(
        failed,
        "the PATH-alias warning is on stderr of every successful run too, so quoting it names a cause that is not one",
      ).rejects.not.toThrow(/PATH aliases/);
    });
  });

  // `marketplace upgrade` is git-only; a local marketplace is refreshed by re-adding its plugins.
  describe("refreshing a registered marketplace", () => {
    it("upgrades one registered from a git source", async () => {
      replies = [
        {
          stdout: marketplaceListDocument([
            { name: GIT_MARKETPLACE, sourceType: "git", source: "my-org/my-repo" },
          ]),
        },
      ];

      await hostFor("codex").refreshMarketplace(GIT_MARKETPLACE, { configDir: CODEX_STATE });

      expect(everyArgv()).toContainEqual([
        "plugin",
        "marketplace",
        "upgrade",
        GIT_MARKETPLACE,
        "--json",
      ]);
    });

    it("re-adds a local marketplace's plugins, and never asks for an upgrade", async () => {
      replies = [
        {
          stdout: marketplaceListDocument([
            { name: MARKETPLACE, sourceType: "local", source: MARKETPLACE_SOURCE },
          ]),
        },
        { stdout: ONE_ENABLED_PLUGIN },
        { stdout: removalDocument(PLUGIN) },
      ];

      await hostFor("codex").refreshMarketplace(MARKETPLACE, { configDir: CODEX_STATE });

      const argv = everyArgv();
      expect(
        argv.flat(),
        "`marketplace upgrade` exits 1 on a local source, so a refresh that reaches for it reports a failure the install does not have",
      ).not.toContain("upgrade");
      expect(argv).toContainEqual(["plugin", "add", PLUGIN_REF, "--json"]);
    });
  });

  // `plugin add` always writes the global config, whatever the cwd.
  describe("installing a plugin", () => {
    it("runs `plugin add` from the home directory, never from the project", async () => {
      await hostFor("codex").installPlugin(PLUGIN_REF, "global", PROJECT, {
        configDir: CODEX_STATE,
      });

      expect(
        onlyInvocation(),
        "a plugin call made from the project reads as project work and is not",
      ).toStrictEqual({
        command: "codex",
        args: ["plugin", "add", PLUGIN_REF, "--json"],
        cwd: HOME,
        codexHome: CODEX_STATE,
      });
    });

    it("spawns nothing at all for the placement Codex does not offer", async () => {
      const refused = hostFor("codex").installPlugin(PLUGIN_REF, "project", PROJECT, {
        configDir: CODEX_STATE,
      });

      await expect(refused).rejects.toThrow(PLUGIN_REF);
      expect(
        invocations,
        "a refusal that has already spawned `plugin add` has installed the plugin for the whole machine before saying no",
      ).toStrictEqual([]);
    });
  });

  // `plugin remove` answers identically for a no-op, so the outcome comes from the listings.
  describe("removing a plugin", () => {
    it("answers `removed` for a plugin the listing held beforehand", async () => {
      replies = [
        { stdout: ONE_ENABLED_PLUGIN },
        { stdout: removalDocument(PLUGIN) },
        { stdout: NOTHING_INSTALLED },
      ];

      expect(
        await hostFor("codex").uninstallPlugin(PLUGIN_REF, "global", PROJECT, {
          configDir: CODEX_STATE,
        }),
      ).toBe("removed");

      expect(everyArgv()).toContainEqual(["plugin", "remove", PLUGIN_REF, "--json"]);
      expect(
        invocations.map((invocation) => invocation.cwd),
        "every plugin call is made from the home directory, the removal included",
      ).toStrictEqual([HOME, HOME, HOME]);
    });

    it("answers `absent` for one it did not, although Codex's reply is identical", async () => {
      replies = [
        { stdout: NOTHING_INSTALLED },
        { stdout: removalDocument(PLUGIN) },
        { stdout: NOTHING_INSTALLED },
      ];

      expect(
        await hostFor("codex").uninstallPlugin(PLUGIN_REF, "global", PROJECT, {
          configDir: CODEX_STATE,
        }),
        "a removal classified from the command's own exit code or output reports one plugin removed for a plugin that was never there",
      ).toBe("absent");
    });

    it("throws when the plugin is still listed after the removal", async () => {
      replies = [
        { stdout: ONE_ENABLED_PLUGIN },
        { stdout: removalDocument(PLUGIN) },
        { stdout: ONE_ENABLED_PLUGIN },
      ];

      await expect(
        hostFor("codex").uninstallPlugin(PLUGIN_REF, "global", PROJECT, {
          configDir: CODEX_STATE,
        }),
        "a plugin that survived its own removal is neither `removed` nor `absent`, and answering either hides a failed uninstall",
      ).rejects.toThrow(PLUGIN_REF);
    });
  });

  // `plugin list` prints no install path; it is composed from the shape `plugin add` reports.
  describe("listing what is installed", () => {
    it("answers every installed plugin with its composed path and its switch", async () => {
      replies = [
        {
          stdout: pluginListDocument([
            { name: PLUGIN, version: PLUGIN_VERSION, enabled: true },
            { name: DISABLED_PLUGIN, version: DISABLED_PLUGIN_VERSION, enabled: false },
          ]),
        },
      ];

      expect(await hostFor("codex").listPlugins(PROJECT, { configDir: CODEX_STATE })).toStrictEqual(
        [
          {
            pluginKey: PLUGIN_REF,
            installPath: path.join(
              CODEX_STATE,
              "plugins",
              "cache",
              MARKETPLACE,
              PLUGIN,
              PLUGIN_VERSION,
            ),
            enabled: true,
          },
          {
            pluginKey: DISABLED_PLUGIN_REF,
            installPath: path.join(
              CODEX_STATE,
              "plugins",
              "cache",
              MARKETPLACE,
              DISABLED_PLUGIN,
              DISABLED_PLUGIN_VERSION,
            ),
            enabled: false,
          },
        ],
      );

      expect(
        onlyInvocation(),
        "a listing asked from anywhere but the project answers the GLOBAL switch, so `enabled` can never report the project that turned a plugin off",
      ).toStrictEqual({
        command: "codex",
        args: ["plugin", "list", "--json"],
        cwd: PROJECT,
        codexHome: CODEX_STATE,
      });
    });

    it("answers an empty listing rather than throwing when nothing is installed", async () => {
      replies = [{ stdout: NOTHING_INSTALLED }];

      expect(await hostFor("codex").listPlugins(PROJECT, { configDir: CODEX_STATE })).toStrictEqual(
        [],
      );
    });
  });

  // One deleted marketplace source fails every listing: reads degrade, writes still throw.
  describe("a marketplace Codex can no longer read", () => {
    const REGISTRY_UNREADABLE =
      "Error: failed to load marketplace(s):\n" +
      `- \`a-marketplace-someone-deleted\` at /gone: marketplace root does not contain a supported manifest\n`;

    const SNAPSHOT_UNREADABLE =
      "Error: failed to load configured marketplace snapshot(s):\n" +
      `- \`a-marketplace-someone-deleted\` at /gone: marketplace root does not contain a supported manifest\n`;

    const NO_BINARY: FakeChildReply = { unrunnable: true };

    it("answers that ours is not registered rather than throwing, and says what Codex said", async () => {
      replies = [{ exitCode: 1, stderr: REGISTRY_UNREADABLE }];

      expect(
        await hostFor("codex").marketplaceExists(MARKETPLACE, { configDir: CODEX_STATE }),
        "a marketplace somebody else deleted is not a reason for this CLI to abort the command that was only asking",
      ).toBe(false);
    });

    it("still throws when the registry could not be read for a reason of this host's", async () => {
      replies = [NO_BINARY];

      await expect(
        hostFor("codex").marketplaceExists(MARKETPLACE, { configDir: CODEX_STATE }),
        "a host that answered false for every failure would report a missing codex binary as a machine with no marketplaces",
      ).rejects.toThrow();
    });

    it("answers an empty listing rather than throwing, and says what Codex said", async () => {
      replies = [{ exitCode: 1, stderr: SNAPSHOT_UNREADABLE }];

      expect(
        await hostFor("codex").listPlugins(PROJECT, { configDir: CODEX_STATE }),
        "discovery and doctor both read this, and one unreadable entry in a user's own registry must not stop either",
      ).toStrictEqual([]);
    });

    it("still throws when the listing could not be read for a reason of this host's", async () => {
      replies = [NO_BINARY];

      await expect(
        hostFor("codex").listPlugins(PROJECT, { configDir: CODEX_STATE }),
        "an empty listing for every failure reports an installation with nothing installed, which is the answer a broken host gives",
      ).rejects.toThrow();
    });

    it("still throws from a removal, which cannot be classified from a listing it never read", async () => {
      replies = [{ exitCode: 1, stderr: SNAPSHOT_UNREADABLE }];

      await expect(
        hostFor("codex").uninstallPlugin(PLUGIN_REF, "global", PROJECT, {
          configDir: CODEX_STATE,
        }),
        "a write told the listing was empty reports `absent` for a plugin it never looked at",
      ).rejects.toThrow();
    });
  });

  describe("a name that would reach the argument vector", () => {
    it("is refused before anything is spawned, the way the Claude host refuses it", async () => {
      await expect(
        hostFor("codex").refreshMarketplace("a marketplace; rm -rf /", { configDir: CODEX_STATE }),
      ).rejects.toThrow(/invalid characters/i);

      expect(
        invocations,
        "a refusal that has already spawned has handed the name to the binary before deciding it was not one",
      ).toStrictEqual([]);
    });

    it("holds a removal's reference to the same check the Claude host holds it to", async () => {
      await expect(
        hostFor("codex").uninstallPlugin("web:framework@a-mkt", "global", PROJECT, {
          configDir: CODEX_STATE,
        }),
      ).rejects.toThrow(/invalid characters/i);

      expect(invocations, "a reference refused on one host and spawned on the other").toStrictEqual(
        [],
      );
    });

    it("still removes an ordinary reference, which is what that check may not cost", async () => {
      replies = [
        { stdout: ONE_ENABLED_PLUGIN },
        { stdout: removalDocument(PLUGIN) },
        { stdout: NOTHING_INSTALLED },
      ];

      expect(
        await hostFor("codex").uninstallPlugin(PLUGIN_REF, "global", PROJECT, {
          configDir: CODEX_STATE,
        }),
        "a validator narrowed too far refuses every real plugin reference and satisfies the case above",
      ).toBe("removed");
    });

    it("lets a name the validator accepts through to the listing it has to read first", async () => {
      replies = [
        {
          stdout: marketplaceListDocument([
            { name: GIT_MARKETPLACE, sourceType: "git", source: "my-org/my-repo" },
          ]),
        },
      ];

      await hostFor("codex").refreshMarketplace(GIT_MARKETPLACE, { configDir: CODEX_STATE });

      expect(
        everyArgv(),
        "without this half a validator that refused every name would satisfy the case above and refresh nothing at all",
      ).toContainEqual(["plugin", "marketplace", "upgrade", GIT_MARKETPLACE, "--json"]);
    });
  });
});
