/**
 * Every invocation the Claude host hands the `claude` binary, recorded rather than described.
 *
 * C3 moves the `claude*` functions out of `utils/exec.ts` and behind `PluginHost`. The claim the
 * step rests on is that no Claude user notices, and the golden trees beside this file can only
 * check the half that reaches disk: on a machine with no `claude` binary — which is most CI — a
 * whole install writes its tree and spawns nothing, so an argv that changed is invisible to every
 * existing spec. This file is the other half. It pins the command name, the argument vector, the
 * working directory and the one environment variable, for each member of the seam, as the product
 * sends them today.
 *
 * **Nothing here is imported from the product.** Every expected argument is a literal, because an
 * assertion built from the array the product builds moves with it and could never fail. These are
 * also another program's command line rather than this one's vocabulary — `--scope user` is
 * Claude's word for what this CLI calls a global scope, and the translation is the thing under
 * test.
 *
 * **The spawn is mocked at `child_process`, not at `execCommand`.** The plan leaves `execCommand`
 * in `utils/exec.ts` and moves the callers, so a mock of the wrapper would go on reporting a call
 * that no longer reaches a process. Mocking the boundary the operating system is on means the
 * recording holds whichever route the implementer takes.
 *
 * Measured against `claude --version` 2.1.278 on 2026-09-21, with `CLAUDE_CONFIG_DIR` pinned to a
 * scratch directory:
 *
 * ```
 * $ claude plugin uninstall nope@nowhere --scope user
 * ✘ Failed to uninstall plugin "nope@nowhere": Plugin "nope@nowhere" not found in installed plugins
 * [exit 1, on stderr]
 * $ claude plugin marketplace list --json
 * []
 * [exit 0]
 * ```
 *
 * That first line is what the `absent` outcome is classified from, and it is why the classification
 * is a substring match on a message rather than a reading of an exit code.
 */

import type { SpawnOptions } from "child_process";
import os from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hostFor } from "../host-for.js";
import { type FakeChildReply, fakeChildProcess } from "./helpers/fake-child-process.js";

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, spawn: vi.fn<typeof actual.spawn>() };
});
vi.mock("../../../utils/logger");

const { spawn } = await import("child_process");

/** The home directory every user-scoped invocation is run from, fixed so the cwd is a literal. */
const HOME = "/fake-home";

/** The project directory a project-scoped invocation is run from. */
const PROJECT = "/fake-home/a-project";

/** A config tree somewhere other than the one the process points at, as a test would pin one. */
const ISOLATED_CONFIG_DIR = "/fake-home/somewhere-else/.claude";

const PLUGIN_REF = "web-framework-react@a-marketplace";
const MARKETPLACE = "a-marketplace";
const MARKETPLACE_SOURCE = "my-org/my-repo";

/** One recorded invocation: what was run, with what arguments, from where, and with what added. */
type Invocation = {
  command: string;
  args: readonly string[];
  cwd: SpawnOptions["cwd"];
  configDir: string | undefined;
};

const invocations: Invocation[] = [];
/** What the binary is made to answer, one reply per spawn in the order the spawns are made. */
let replies: FakeChildReply[] = [];

/** The one invocation the case under test made. More than one is the case's own failure. */
function onlyInvocation(): Invocation {
  const [first, ...rest] = invocations;
  if (first === undefined) throw new Error("the host spawned nothing at all");
  if (rest.length > 0) {
    throw new Error(`the host spawned ${String(invocations.length)} processes rather than one`);
  }
  return first;
}

describe("the Claude host's invocations", () => {
  beforeEach(() => {
    invocations.length = 0;
    replies = [];
    vi.spyOn(os, "homedir").mockReturnValue(HOME);

    vi.mocked(spawn).mockImplementation((command, args, options) => {
      invocations.push({
        command,
        args,
        cwd: options.cwd,
        configDir: options.env?.["CLAUDE_CONFIG_DIR"],
      });
      return fakeChildProcess(replies.shift());
    });
  });

  afterEach(() => {
    vi.mocked(os.homedir).mockRestore();
  });

  /**
   * Availability, which is the check `update` and `uninstall` both gate their plugin work on.
   *
   * It runs from wherever the process already is — no cwd is passed — and that is deliberate
   * rather than incidental: a version check that chose a working directory would be choosing an
   * installation to answer about.
   */
  describe("asking whether the host is available", () => {
    it("runs the binary's own version flag from nowhere in particular", async () => {
      expect(await hostFor("claude").isAvailable()).toBe(true);

      expect(
        onlyInvocation(),
        "the availability probe is the one call that must not choose an installation to answer about",
      ).toStrictEqual({
        command: "claude",
        args: ["--version"],
        cwd: undefined,
        configDir: process.env["CLAUDE_CONFIG_DIR"],
      });
    });

    it("answers false when the binary is there and fails", async () => {
      replies = [{ exitCode: 1 }];

      expect(
        await hostFor("claude").isAvailable(),
        "a binary on PATH that cannot run is not an available host, and treating it as one makes every later call a thrown error",
      ).toBe(false);
    });
  });

  /**
   * Installing, where the two halves that have to stay put are the scope word and the directory.
   *
   * Claude routes a user-scoped install by the CWD as well as by the flag, which is why the home
   * directory is passed rather than left to whatever the command was run from. Codex has no scope
   * flag at all and routes nothing by cwd, which is why the seam takes this product's scope words
   * and each host builds its own argv from them.
   */
  describe("installing a plugin", () => {
    it("asks for the user scope from the home directory when the skill is global", async () => {
      await hostFor("claude").installPlugin(PLUGIN_REF, "global", PROJECT);

      expect(
        onlyInvocation(),
        "a global skill installed with --scope project writes the switch into the project's settings and leaves every other project without it",
      ).toStrictEqual({
        command: "claude",
        args: ["plugin", "install", PLUGIN_REF, "--scope", "user"],
        cwd: HOME,
        configDir: process.env["CLAUDE_CONFIG_DIR"],
      });
    });

    it("asks for the project scope from the project directory when the skill is not global", async () => {
      await hostFor("claude").installPlugin(PLUGIN_REF, "project", PROJECT);

      expect(
        onlyInvocation(),
        "a project skill installed from the home directory is registered against the wrong project path in Claude's own registry",
      ).toStrictEqual({
        command: "claude",
        args: ["plugin", "install", PLUGIN_REF, "--scope", "project"],
        cwd: PROJECT,
        configDir: process.env["CLAUDE_CONFIG_DIR"],
      });
    });

    it("reports a failed install with the host's own message", async () => {
      replies = [{ exitCode: 1, stderr: "no such plugin" }];

      await expect(
        hostFor("claude").installPlugin(PLUGIN_REF, "project", PROJECT),
        "install intent is inviolable: a caller that cannot tell a failed install from a successful one writes a config row claiming a skill that is not there",
      ).rejects.toThrow("Plugin installation failed: no such plugin");
    });
  });

  /**
   * Removal, and the classification the outcome is read from.
   *
   * The `absent` arm is not new behaviour: `claudePluginUninstall` already swallows a "not
   * installed" or "not found" failure and returns. What C3 adds is that the caller can now see
   * which of the two happened. A failure that is neither keeps throwing, and that half is the one
   * a refactor is most likely to lose — a host that answered `absent` for every failure would
   * satisfy the case above it and make a broken install look like an empty one.
   */
  describe("removing a plugin", () => {
    it("asks for the user scope from the home directory when the skill is global", async () => {
      expect(await hostFor("claude").uninstallPlugin(PLUGIN_REF, "global", PROJECT)).toBe(
        "removed",
      );

      expect(
        onlyInvocation(),
        "the removal must reach the scope the install was filed under",
      ).toStrictEqual({
        command: "claude",
        args: ["plugin", "uninstall", PLUGIN_REF, "--scope", "user"],
        cwd: HOME,
        configDir: process.env["CLAUDE_CONFIG_DIR"],
      });
    });

    it("asks for the project scope from the project directory when the skill is not global", async () => {
      expect(await hostFor("claude").uninstallPlugin(PLUGIN_REF, "project", PROJECT)).toBe(
        "removed",
      );

      expect(
        onlyInvocation(),
        "the removal must reach the scope the install was filed under",
      ).toStrictEqual({
        command: "claude",
        args: ["plugin", "uninstall", PLUGIN_REF, "--scope", "project"],
        cwd: PROJECT,
        configDir: process.env["CLAUDE_CONFIG_DIR"],
      });
    });

    it("reads the host's not-found message as absent rather than as a failure", async () => {
      replies = [
        {
          exitCode: 1,
          stderr: `✘ Failed to uninstall plugin "${PLUGIN_REF}": Plugin "${PLUGIN_REF}" not found in installed plugins`,
        },
      ];

      expect(
        await hostFor("claude").uninstallPlugin(PLUGIN_REF, "project", PROJECT),
        "this is the message claude 2.1.278 prints for a plugin it does not have, and the whole of what tells a removal from a no-op",
      ).toBe("absent");
    });

    it("reads a not-installed message as absent too", async () => {
      replies = [{ exitCode: 1, stderr: "Plugin is not installed" }];

      expect(
        await hostFor("claude").uninstallPlugin(PLUGIN_REF, "project", PROJECT),
        "both spellings are swallowed today, and dropping either turns an ordinary uninstall into a thrown error",
      ).toBe("absent");
    });

    it("still throws on a failure that is neither", async () => {
      replies = [{ exitCode: 1, stderr: "EACCES: permission denied" }];

      await expect(
        hostFor("claude").uninstallPlugin(PLUGIN_REF, "project", PROJECT),
        "a host that answered absent for every failure would report a clean removal for a plugin it could not touch",
      ).rejects.toThrow("Plugin uninstall failed: EACCES: permission denied");
    });
  });

  /**
   * The marketplace verbs, and the one that is a rename trap.
   *
   * Claude's refresh verb is `update`; Codex's is `upgrade`, and `codex plugin marketplace upgrade`
   * exits 1 against a local source. That is why the member is called `refreshMarketplace` and why
   * each host builds its own argv — swapping the binary name in one shared builder produces a
   * command Codex does not have.
   */
  describe("the marketplace verbs", () => {
    it("lists marketplaces as JSON and finds one by name", async () => {
      replies = [{ stdout: JSON.stringify([{ name: MARKETPLACE, source: MARKETPLACE_SOURCE }]) }];

      expect(await hostFor("claude").marketplaceExists(MARKETPLACE)).toBe(true);

      expect(
        onlyInvocation(),
        "the shape parsed here is a TOP-LEVEL array carrying name and source; Codex answers an object with a marketplaces key and no source at all",
      ).toStrictEqual({
        command: "claude",
        args: ["plugin", "marketplace", "list", "--json"],
        cwd: undefined,
        configDir: process.env["CLAUDE_CONFIG_DIR"],
      });
    });

    it("answers false for a name the list does not carry", async () => {
      replies = [{ stdout: JSON.stringify([{ name: "someone-elses", source: "elsewhere" }]) }];

      expect(
        await hostFor("claude").marketplaceExists(MARKETPLACE),
        "without the negative, a predicate answering true for everything passes the case above it and re-registration never happens",
      ).toBe(false);
    });

    it("answers false rather than throwing when the list cannot be parsed", async () => {
      replies = [{ stdout: "not json at all" }];

      expect(
        await hostFor("claude").marketplaceExists(MARKETPLACE),
        "today an unparseable list warns and answers an empty array, which a later host reusing this parser turns into a marketplace that is re-added every run and a doctor row that can never go green",
      ).toBe(false);
    });

    it("adds a marketplace from its source", async () => {
      await hostFor("claude").addMarketplace(MARKETPLACE_SOURCE);

      expect(
        onlyInvocation(),
        "the add takes a SOURCE, where every other verb takes a name",
      ).toStrictEqual({
        command: "claude",
        args: ["plugin", "marketplace", "add", MARKETPLACE_SOURCE],
        cwd: undefined,
        configDir: process.env["CLAUDE_CONFIG_DIR"],
      });
    });

    it("treats an already-registered marketplace as a success", async () => {
      replies = [{ exitCode: 1, stderr: "Marketplace already installed" }];

      await expect(
        hostFor("claude").addMarketplace(MARKETPLACE_SOURCE),
        "every install re-adds the marketplace, so a thrown error here would fail the second install on any machine",
      ).resolves.toBeUndefined();
    });

    it("refreshes a marketplace with Claude's own verb", async () => {
      await hostFor("claude").refreshMarketplace(MARKETPLACE);

      expect(
        onlyInvocation(),
        "update is Claude's verb and upgrade is Codex's — a shared argv builder with the binary name swapped produces a command neither host has",
      ).toStrictEqual({
        command: "claude",
        args: ["plugin", "marketplace", "update", MARKETPLACE],
        cwd: undefined,
        configDir: process.env["CLAUDE_CONFIG_DIR"],
      });
    });

    it("reports a failed refresh with the host's own message", async () => {
      replies = [{ exitCode: 1, stderr: "Marketplace 'a-marketplace' not found." }];

      await expect(
        hostFor("claude").refreshMarketplace(MARKETPLACE),
        "ensureMarketplace warns on this and continues with the cached version, which it cannot do if the failure never arrives",
      ).rejects.toThrow("Failed to update marketplace: Marketplace 'a-marketplace' not found.");
    });
  });

  /**
   * Which installation of the host a call reads and writes.
   *
   * `CLAUDE_CONFIG_DIR` redirects Claude's whole config tree and BEATS `HOME`, which is why the
   * suite pins it rather than relying on a fake home. Codex's equivalent is `CODEX_HOME` and is
   * inherited by every `codex` process the CLI spawns — so the option belongs on the seam, and its
   * translation into a variable name belongs to each host.
   */
  describe("pinning which installation a call touches", () => {
    it("passes the config directory as Claude's own variable", async () => {
      replies = [{ stdout: "[]" }];
      await hostFor("claude").marketplaceExists(MARKETPLACE, { configDir: ISOLATED_CONFIG_DIR });

      expect(
        onlyInvocation().configDir,
        "without it every smoke and e2e call reaches the machine's real installation",
      ).toBe(ISOLATED_CONFIG_DIR);
    });

    it("adds nothing to the environment when no directory is pinned", async () => {
      replies = [{ stdout: "[]" }];
      await hostFor("claude").marketplaceExists(MARKETPLACE);

      expect(
        onlyInvocation().configDir,
        "a host that always set the variable would override a user's own exported one in production",
      ).toBe(process.env["CLAUDE_CONFIG_DIR"]);
    });
  });

  /**
   * Listing, which on this host is a read of two files and not a command at all.
   *
   * Claude has no `plugin list --json`: what is installed comes from `installed_plugins.json` in
   * the plugins directory, and what is switched on comes from `settings.json`. Codex answers a
   * command instead. Pinning the silence is what stops a host extraction inventing a Claude
   * subcommand that does not exist — a call that would exit non-zero and be read as an empty
   * listing.
   */
  describe("listing what is installed", () => {
    it("spawns nothing at all", async () => {
      await hostFor("claude").listPlugins(PROJECT);

      expect(
        invocations,
        "Claude's installed set is two files on disk; a host that shelled out for it would read an error as an empty listing",
      ).toStrictEqual([]);
    });
  });
});
