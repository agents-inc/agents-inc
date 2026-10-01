/**
 * Every invocation the Codex host hands the `codex` binary, and every answer it reads back —
 * recorded from the pinned release rather than described.
 *
 * **Why a unit spec exists beside the e2e ones.** The lifecycle specs drive the real binary and
 * can say that an install ended up registered; they cannot say WHICH command put it there, from
 * which directory, or what the host would do with an answer the binary gives only in a state a
 * spec cannot reach cheaply — a plugin removed twice, a marketplace that is already registered
 * from a different source, a listing that still holds a plugin after the removal. Those are the
 * cases where the seam's own rules live, and each one is silent in the direction that looks fine.
 *
 * **The spawn is recorded at `child_process`, which is the door `execCommand` in `utils/exec.ts`
 * goes through** — the same boundary the Claude twin beside this file mocks, and for the same
 * reason: it holds whichever wrapper the implementer reaches for, as long as it is this CLI's own.
 * A host that shells out through something else reddens every test here with "the host spawned
 * nothing at all", which is the intended answer: `execCommand` carries the argument validators.
 *
 * **Nothing here is imported from the product.** Every expected argument and every recorded
 * document is a literal, because an assertion built from the value the product builds moves with
 * it and can never fail. These are also another program's words rather than this one's: `plugin
 * add` is Codex's verb where Claude's is `plugin install`, and `plugin remove` where Claude's is
 * `plugin uninstall`, so the translation is the thing under test.
 *
 * Every document below was recorded on the pinned `@openai/codex` 0.155.1 on 2026-09-22, with
 * `HOME` and `CODEX_HOME` pinned to a scratch tree and the global `config.toml` deleted between
 * runs — the reset matters because `--sandbox workspace-write` and `danger-full-access` make
 * Codex write a trust entry into that very file, so a later run answers for a reason the
 * measurement never set:
 *
 * ```
 * $ codex plugin marketplace add <dir> --json
 * {"marketplaceName":"…","installedRoot":"…","alreadyAdded":false}                       # exit 0
 * $ codex plugin marketplace list --json
 * {"marketplaces":[{"name":"…","root":"…","marketplaceSource":{"sourceType":"local","source":"…"}}]}
 * $ codex plugin add probe-skill@<mkt> --json
 * {"pluginId":"…","name":"…","marketplaceName":"…","version":"1.2.3","installedPath":"<CODEX_HOME>/plugins/cache/<mkt>/probe-skill/1.2.3","authPolicy":"ON_INSTALL"}
 * $ codex plugin list --json
 * {"installed":[{"pluginId":…,"name":…,"marketplaceName":…,"version":…,"installed":true,"enabled":true,…}],"available":[]}
 * $ codex plugin remove probe-skill@<mkt> --json      # installed, then again, then never-installed
 * {"pluginId":"…","name":"…","marketplaceName":"…"}                  # exit 0, byte-identical x3
 * $ codex plugin marketplace upgrade <local mkt> --json
 * Error: marketplace `…` is not configured as a Git marketplace                          # exit 1
 * ```
 */

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

/** The home directory every plugin call that WRITES has to be made from. See {@link PROJECT}. */
const HOME = "/fake-home";

/**
 * A project directory, which decides nothing for a WRITE and decides the switch for a LISTING.
 *
 * `codex plugin` takes no scope flag, and a write routes nothing by the working directory:
 * measured on 0.155.1, `plugin add` run from inside a project writes `[plugins."<id>@<mkt>"]
 * enabled = true` into the GLOBAL `config.toml` and creates no project file at all. So a host that
 * let the cwd follow the project there would silently install for the machine while reading as
 * project work.
 *
 * **A listing is the other way round, and this file pinned the wrong answer until 2026-09-22.**
 * Re-derived on the pinned release: with the global config trusting a project's absolute path, the
 * project's own `.codex/config.toml` decides `enabled` — `false` asked from the project, `true`
 * asked from the home directory, from the same `CODEX_HOME` in the same minute. So the directory
 * `listPlugins` is asked from is the whole of what makes its answer "as seen from one project",
 * and the spec below asserts it rather than the home directory the first draft recorded.
 */
const PROJECT = "/fake-home/a-project";

/** A Codex state tree somewhere other than the one the process points at, as a test pins one. */
const CODEX_STATE = "/fake-home/somewhere-else/.codex";

const MARKETPLACE = "agents-inc";
const MARKETPLACE_SOURCE = "/fake-home/a-local-marketplace";

/**
 * A second marketplace beside ours, which is the state the by-name predicate exists for.
 *
 * Named after one of Codex's own bundled marketplaces, whose names are all in the shipped binary.
 * **It is not asserted to be present, and this constant used to say it was** — "present in every
 * real listing". Re-derived 2026-09-22 against the pinned 0.155.1 with a virgin `CODEX_HOME`:
 * `plugin marketplace list --json` answers `{"marketplaces":[]}`, so whatever registers the
 * bundled entries is not reachable offline. What the predicate has to survive is a registry
 * holding entries this CLI did not add, which is true of any machine whose user has added one.
 */
const A_MARKETPLACE_WE_DID_NOT_ADD = "openai-api-curated";

/** A marketplace this CLI registered from a git source, which is the only kind `upgrade` takes. */
const GIT_MARKETPLACE = "agents-inc-git";

const PLUGIN = "web-framework-react";
const PLUGIN_REF = `${PLUGIN}@${MARKETPLACE}`;
const PLUGIN_VERSION = "1.2.3";

/** A second plugin, installed and switched off, so the listing carries both switch values. */
const DISABLED_PLUGIN = "web-testing-vitest";
const DISABLED_PLUGIN_REF = `${DISABLED_PLUGIN}@${MARKETPLACE}`;
const DISABLED_PLUGIN_VERSION = "2.0.0";

/**
 * The line Codex writes to stderr on EVERY run whose `CODEX_HOME` sits under the temp dir, exit 0
 * included: it refuses to link its helper binaries there and carries on. Quoted into an error
 * message it reads as the cause of a failure it has nothing to do with.
 */
const PATH_ALIAS_WARNING =
  'WARNING: proceeding, even though we could not create PATH aliases: Refusing to create helper binaries under temporary dir "/tmp"\n';

/** Codex's refusal when a name is registered already, from somewhere else. */
const ALREADY_ADDED_ELSEWHERE = `Error: marketplace '${MARKETPLACE}' is already added from a different source; remove it before adding this source`;

/** One recorded invocation: what was run, with what arguments, from where, and under which state tree. */
type Invocation = {
  command: string;
  args: readonly string[];
  cwd: SpawnOptions["cwd"];
  codexHome: string | undefined;
};

const invocations: Invocation[] = [];
/**
 * What the binary is made to answer, one reply per spawn in the order the spawns are made. An
 * `unrunnable` reply is the only shape in which "Codex is not installed" reaches this host.
 */
let replies: FakeChildReply[] = [];

/** How Codex prints its marketplace registry: an OBJECT with a `marketplaces` array inside it. */
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

/** How it prints what is installed: an object with `installed` and `available` arrays. */
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

/** What a removal prints — the same three fields whether anything went or not. */
function removalDocument(name: string): string {
  return JSON.stringify({
    pluginId: `${name}@${MARKETPLACE}`,
    name,
    marketplaceName: MARKETPLACE,
  });
}

/** The listing a home with one enabled plugin answers. */
const ONE_ENABLED_PLUGIN = pluginListDocument([
  { name: PLUGIN, version: PLUGIN_VERSION, enabled: true },
]);

/** The listing a home with nothing installed answers — never an empty string. */
const NOTHING_INSTALLED = pluginListDocument([]);

/** The one invocation the case under test made. More than one is the case's own failure. */
function onlyInvocation(): Invocation {
  const [first, ...rest] = invocations;
  if (first === undefined) throw new Error("the host spawned nothing at all");
  if (rest.length > 0) {
    throw new Error(`the host spawned ${String(invocations.length)} processes rather than one`);
  }
  return first;
}

/** Every argument vector the case under test sent, in order. */
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

  /**
   * Availability, which `update` and `uninstall` both gate their plugin work on.
   *
   * The state tree is pinned and the working directory is not asserted, and that asymmetry is a
   * fact about this host rather than an omission: on Codex the probe is a WRITE — `codex
   * --version` links its helper binaries under `$CODEX_HOME/tmp/arg0/` before it reads an
   * argument — so which installation it answers about is `CODEX_HOME`'s business and no
   * directory's.
   */
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

  /**
   * Marketplaces, where the whole risk is a parser that fails in the direction that looks fine.
   *
   * Claude answers `[{name, source, …}]` and Codex answers `{"marketplaces":[{name, root,
   * marketplaceSource:{…}}]}` — object-wrapped, differently named, with no top-level `source`.
   * `claudePluginMarketplaceList` returns `[]` after a warning on any parse failure, so a Codex
   * host built on that parser reports "marketplace absent" forever: re-added on every run, with a
   * doctor row that can never go green and nothing failing anywhere.
   */
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

      // A user's registry holds whatever they have added beside ours, so no predicate here may
      // count the entries or read the first one.
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

  /**
   * Refreshing, which is two different commands behind one member.
   *
   * `marketplace upgrade` is git-only: against a local source it exits 1 with `marketplace `…`
   * is not configured as a Git marketplace`, measured on 0.155.1. A local marketplace — which is
   * what this CLI's own generated one is — is refreshed by installing its plugins again over the
   * top, and a host that reached for `upgrade` would report a failed update for a marketplace
   * that is working exactly as designed.
   */
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

  /**
   * Installing, where the working directory is the dangerous half.
   *
   * Claude routes a scope by the cwd as well as by a flag. Codex has no scope flag at all and the
   * cwd changes nothing about where the switch lands — measured: `plugin add` from inside a
   * project writes the enable line into the GLOBAL `config.toml` and creates no project file. So
   * the home directory is pinned as a stated rule rather than left to whatever the caller
   * happened to be in, and the refusal below is what keeps the project scope from being asked for
   * at all.
   */
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

  /**
   * Removing, where the answer cannot come from the command that does it.
   *
   * Measured three times on 0.155.1: `plugin remove` for a plugin that was never installed, for
   * one that really went, and for one removed a second time all exit 0 and print the same three
   * fields. So the only thing that can tell a removal from a no-op is the listing taken BEFORE
   * it, and that is what `PluginRemovalOutcome` is for — `uninstall` reports what it observed.
   */
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

  /**
   * Listing, whose MEMBERSHIP is a function of `CODEX_HOME` and whose SWITCH is not.
   *
   * `codex plugin list` takes no project or scope argument — `-m/--marketplace`, `--available`
   * and `--json` are the whole of it — and it does not print an install path, so the path is
   * composed from the shape `plugin add` reports: `<CODEX_HOME>/plugins/cache/<marketplace>/
   * <name>/<version>`, measured. The switch comes back with it because Codex keeps a disabled
   * plugin in the listing where Claude filters it out, and a listing without the field cannot
   * tell "installed but off" from "not installed".
   *
   * **The directory the listing is asked from is asserted here, and it is the PROJECT's.** With
   * no argument able to carry a project, the working directory is the only thing that can, and a
   * trusted project's own `.codex/config.toml` is what answers `enabled` when one is in play —
   * see {@link PROJECT} for the four runs. This file recorded the home directory here until
   * 2026-09-22, which is why the field could never report the one state it exists for.
   *
   * The pair is the point, and both halves are in this file: a listing asked from the project,
   * and every write verb above asked from the home directory. Either assertion alone reads
   * equally well as a host that pins one directory for everything.
   */
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

  /**
   * A marketplace whose SOURCE has gone away, which fails both listing verbs outright.
   *
   * Recorded on the pinned 0.155.1 by adding a local marketplace and moving its directory: `plugin
   * marketplace list --json` exits 1 with `failed to load marketplace(s)`, `plugin list --json`
   * exits 1 with `failed to load configured marketplace snapshot(s)`, and neither prints any JSON.
   * `plugin marketplace add` and `plugin remove` both still exit 0 in that same state.
   *
   * The failure is TOTAL over the registry and has nothing to do with this CLI: one entry a user
   * added by hand and later deleted takes down every read the host makes, including the ones that
   * were going to say our own marketplace is registered. So the two members that ask a QUESTION
   * degrade and say what Codex said, and the write verbs go on throwing.
   *
   * **Each degrade is paired with the failure that must still throw**, because a member that
   * answered `false` or `[]` for every failure would satisfy the degrade case exactly as well and
   * would report a missing `codex` binary as an installation with nothing in it.
   */
  describe("a marketplace Codex can no longer read", () => {
    /** Codex's refusal from `plugin marketplace list --json`, on stderr, with no JSON at all. */
    const REGISTRY_UNREADABLE =
      "Error: failed to load marketplace(s):\n" +
      `- \`a-marketplace-someone-deleted\` at /gone: marketplace root does not contain a supported manifest\n`;

    /** Its twin from `plugin list --json`, which names the snapshot rather than the marketplace. */
    const SNAPSHOT_UNREADABLE =
      "Error: failed to load configured marketplace snapshot(s):\n" +
      `- \`a-marketplace-someone-deleted\` at /gone: marketplace root does not contain a supported manifest\n`;

    /** A failure of this host's own, which must go on reaching the caller. */
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

  /**
   * The one value on this host that reached an argument vector unchecked.
   *
   * `addMarketplace` checks its source and both plugin verbs check their reference, so the gap in
   * `refreshMarketplace` sat between three neighbours that read as the rule — while the Claude
   * twin `claudePluginMarketplaceUpdate` has always called `validatePluginName` first.
   */
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

    /**
     * The second asymmetry, which no assertion could see until this one.
     *
     * A plugin REFERENCE is `<name>@<marketplace>` and needs neither a colon nor a tilde, and
     * `claudePluginUninstall` has always held it to `validatePluginName`. This host held it to
     * the looser `validatePluginPath`, so one argument was refused by one host and accepted by
     * the other — mutation-checked on 2026-09-22, and reverting the fix reddened nothing at all
     * before this pair was written.
     */
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
