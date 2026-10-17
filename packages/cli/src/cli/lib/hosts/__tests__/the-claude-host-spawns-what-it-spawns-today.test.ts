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

const HOME = "/fake-home";

const PROJECT = "/fake-home/a-project";

const ISOLATED_CONFIG_DIR = "/fake-home/somewhere-else/.claude";

const PLUGIN_REF = "web-framework-react@a-marketplace";
const MARKETPLACE = "a-marketplace";
const MARKETPLACE_SOURCE = "my-org/my-repo";

type Invocation = {
  command: string;
  args: readonly string[];
  cwd: SpawnOptions["cwd"];
  configDir: string | undefined;
};

const invocations: Invocation[] = [];
let replies: FakeChildReply[] = [];

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

  // No cwd: a version check that chose a directory would be choosing an installation.
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

  // Claude routes a user-scoped install by the cwd as well as by `--scope`.
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

  // Claude has no `plugin list`; the installed set is read from two files on disk.
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
