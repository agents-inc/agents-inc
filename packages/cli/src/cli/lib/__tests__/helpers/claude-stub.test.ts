import os from "os";
import { describe, expect, it } from "vitest";

import { claudeHost, claudePluginMarketplaceRemove } from "../../hosts/claude-host.js";
import { execCommand } from "../../../utils/exec.js";
import { useClaudeStub } from "./claude-stub.js";

const PATH_BEFORE = process.env.PATH;

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

  it("starts each spec with no calls, whatever the spec before it made", async () => {
    expect(await claude.calls()).toStrictEqual([]);
  });
});

it("hands PATH back as it found it once a spec is done", () => {
  expect(process.env.PATH).toBe(PATH_BEFORE);
});
