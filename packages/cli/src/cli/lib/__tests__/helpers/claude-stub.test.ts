import os from "os";
import path from "path";
import { readFile, rm } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  claudeHost,
  claudePluginMarketplaceList,
  claudePluginMarketplaceRemove,
} from "../../hosts/claude-host.js";
import { execCommand } from "../../../utils/exec.js";
import { cleanupTempDir, createTempDir, directoryExists, fileExists } from "../test-fs-utils";
import { useClaudeStub } from "./claude-stub.js";

const PATH_BEFORE = process.env.PATH;

const REGISTRY_LEFT_EMPTY = '{\n  "version": 2,\n  "plugins": {}\n}';

describe("useClaudeStub", () => {
  const claude = useClaudeStub();

  it("answers a claude spawned by name in place of Claude Code's CLI, and logs the call", async () => {
    const answer = await execCommand("claude", ["plugin", "marketplace", "list", "--json"]);

    expect(answer, "the stub answers: nothing installed, and success").toStrictEqual({
      stdout: "[]\n",
      stderr: "",
      exitCode: 0,
    });
    expect(await claude.calls()).toStrictEqual(["plugin marketplace list --json"]);
  });

  it("answers the marketplace list with the marketplaces a spec says Claude holds", async () => {
    const held = [{ name: "test-fixture", source: "directory", path: os.tmpdir() }];

    await claude.holdMarketplaces(held);

    expect(await claudePluginMarketplaceList()).toStrictEqual(held);
    expect(await claudeHost().marketplaceExists("test-fixture")).toBe(true);
  });

  it("fails the marketplace list once a spec says it cannot be read, and logs the call", async () => {
    await claude.failMarketplaceList();

    const answer = await execCommand("claude", ["plugin", "marketplace", "list", "--json"]);

    expect(answer).toStrictEqual({
      stdout: "",
      stderr: "✘ Failed to list marketplaces\n",
      exitCode: 1,
    });
    expect(await claude.calls()).toStrictEqual(["plugin marketplace list --json"]);
  });

  it("logs the install the Claude host asks for, from wherever the host runs it", async () => {
    await claudeHost().installPlugin("hono@test-fixture", "global", os.tmpdir());

    expect(await claude.calls()).toStrictEqual(["plugin install hono@test-fixture --scope user"]);
  });

  it("refuses a plugin uninstall as Claude Code 2.1.310 refuses a plugin it does not hold, and logs the call", async () => {
    const answer = await execCommand("claude", [
      "plugin",
      "uninstall",
      "hono@test-fixture",
      "--scope",
      "project",
    ]);

    expect(answer).toStrictEqual({
      stdout: "",
      stderr:
        '✘ Failed to uninstall plugin "hono@test-fixture": Plugin "hono@test-fixture" not found in installed plugins\n',
      exitCode: 1,
    });
    expect(await claude.calls()).toStrictEqual([
      "plugin uninstall hono@test-fixture --scope project",
    ]);
  });

  it("answers the Claude host's uninstall as a plugin that was not there", async () => {
    const outcome = await claudeHost().uninstallPlugin("hono@test-fixture", "global", os.tmpdir());

    expect(outcome).toBe("absent");
    expect(await claude.calls()).toStrictEqual(["plugin uninstall hono@test-fixture --scope user"]);
  });

  it("logs each call in the order made", async () => {
    await execCommand("claude", ["--version"]);
    await execCommand("claude", ["plugin", "install", "react@test-fixture", "--scope", "project"]);

    expect(await claude.calls()).toStrictEqual([
      "--version",
      "plugin install react@test-fixture --scope project",
    ]);
  });

  it("keeps each call of the Claude host that changes Claude's setup, in the order made, and no read", async () => {
    const host = claudeHost();
    const marketplaceDir = os.tmpdir();

    await execCommand("claude", ["--version"]);
    await host.addMarketplace(marketplaceDir);
    await execCommand("claude", ["plugin", "marketplace", "list", "--json"]);
    await host.refreshMarketplace("test-fixture");
    await host.installPlugin("hono@test-fixture", "global", os.tmpdir());
    await host.updatePlugin("hono@test-fixture", "global", os.tmpdir());
    await host.uninstallPlugin("react@test-fixture", "project", os.tmpdir());
    await claudePluginMarketplaceRemove("test-fixture");

    expect(await claude.changes()).toStrictEqual([
      `plugin marketplace add ${marketplaceDir}`,
      "plugin marketplace update test-fixture",
      "plugin install hono@test-fixture --scope user",
      "plugin update hono@test-fixture --scope user",
      "plugin uninstall react@test-fixture --scope project",
      "plugin marketplace remove test-fixture",
    ]);
  });

  describe("what a spec says Claude leaves", () => {
    let tempDir: string;
    let file: string;
    let folder: string;

    beforeEach(async () => {
      tempDir = await createTempDir("claude-stub-leaves-");
      file = path.join(tempDir, ".claude", "plugins", "installed_plugins.json");
      folder = path.join(tempDir, ".claude", "plugins", "marketplaces");
      await claude.leaveBehind([{ file, content: REGISTRY_LEFT_EMPTY }, { folder }]);
    });

    afterEach(async () => {
      await cleanupTempDir(tempDir);
    });

    it("is written by a call that changes Claude's setup, and by no read before it", async () => {
      await execCommand("claude", ["--version"]);
      await execCommand("claude", ["plugin", "marketplace", "list", "--json"]);
      const afterTheReads = { file: await fileExists(file), folder: await directoryExists(folder) };

      await claudeHost().installPlugin("hono@test-fixture", "project", os.tmpdir());

      expect(afterTheReads, "a read writes nothing").toStrictEqual({ file: false, folder: false });
      expect(await readFile(file, "utf8")).toBe(REGISTRY_LEFT_EMPTY);
      expect(await directoryExists(folder)).toBe(true);
    });

    it("is written again by each later call that changes Claude's setup, a refused uninstall too", async () => {
      await claudeHost().installPlugin("hono@test-fixture", "project", os.tmpdir());
      await rm(path.join(tempDir, ".claude"), { recursive: true });

      await claudeHost().uninstallPlugin("hono@test-fixture", "project", os.tmpdir());

      expect(await fileExists(file)).toBe(true);
      expect(await directoryExists(folder)).toBe(true);
    });
  });

  it("starts each spec with no calls, whatever the spec before it made", async () => {
    expect(await claude.calls()).toStrictEqual([]);
  });
});

it("hands PATH back as it found it once a spec is done", () => {
  expect(process.env.PATH).toBe(PATH_BEFORE);
});
