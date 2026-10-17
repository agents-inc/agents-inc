/**
 * Against the recorded Claude golden trees: every builder's Claude answer lands on the recording,
 * and no Codex answer does. The two halves are only meaningful together.
 */

import os from "os";
import path from "path";
import { readFile, readdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SkillScope } from "../../../types/config.js";
import { CLI_ROOT } from "../../__tests__/helpers/cli-runner.js";
import type { RecordedGolden } from "../../__tests__/helpers/golden-tree.js";
import { getProjectConfigPath } from "../install-base-dir.js";
import { agentsDir, pluginsDir, skillsDir } from "../install-layout.js";
import { attributeByRole, type RoleSite } from "./helpers/install-path-roles.js";

const GOLDEN_TREES_DIR = path.join(CLI_ROOT, "e2e", "fixtures", "claude-golden-trees");

const GOLDEN_TREES = [
  "dual-scope-edit-compile-uninstall.json",
  "global-eject.json",
  "project-plugin.json",
] as const;

// Goldens are keyed relative to the fake home, with the project at `project/` inside it.
const TREE_ROOT = path.resolve(path.sep, "recorded-home");
const PROJECT_DIR = path.join(TREE_ROOT, "project");

const SCOPES: readonly SkillScope[] = ["global", "project"];

// No `plugins@project`: no journey installs a plugin at project scope.
const CLAUDE_BUILDERS_THE_RECORDING_BACKS = [
  "agents@global",
  "agents@project",
  "config@global",
  "config@project",
  "plugins@global",
  "skills@global",
  "skills@project",
] as const;

function treeRelative(absolute: string): string {
  return path.relative(TREE_ROOT, absolute).split(path.sep).join("/");
}

function sitesFor(provider: "claude" | "codex"): RoleSite[] {
  return SCOPES.flatMap((scope) => {
    const scopeRoot = scope === "global" ? TREE_ROOT : PROJECT_DIR;
    const answers = [
      ["config", getProjectConfigPath(scopeRoot, provider)],
      ["agents", agentsDir(provider, scope, PROJECT_DIR)],
      ["skills", skillsDir(provider, scope, PROJECT_DIR)],
      ["plugins", pluginsDir(provider, scope, PROJECT_DIR)],
    ] as const;

    return answers.flatMap(([role, at]) =>
      at === null ? [] : [{ role: `${role}@${scope}`, at: treeRelative(at) }],
    );
  });
}

async function readGolden(golden: (typeof GOLDEN_TREES)[number]): Promise<RecordedGolden> {
  // Parse boundary: the shape `golden-tree.ts` writes.
  return JSON.parse(await readFile(path.join(GOLDEN_TREES_DIR, golden), "utf-8")) as RecordedGolden;
}

async function everyRecordedPath(): Promise<string[]> {
  const recorded = await Promise.all(GOLDEN_TREES.map(readGolden));
  const perPhase = recorded.flatMap((golden) =>
    Object.values(golden.phases).flatMap((phase) => [
      ...Object.keys(phase.files),
      ...phase.emptyDirectories,
    ]),
  );

  return [...new Set(perPhase)].sort();
}

describe("what the path builders answer over a recorded Claude installation", () => {
  beforeEach(() => {
    vi.spyOn(os, "homedir").mockReturnValue(TREE_ROOT);
    // A developer's `$CODEX_HOME` would move Codex answers out of the fake home.
    vi.stubEnv("CODEX_HOME", undefined);
  });

  afterEach(() => {
    vi.mocked(os.homedir).mockRestore();
    vi.unstubAllEnvs();
  });

  it("is checked against exactly the journeys that record a Claude install", async () => {
    expect(
      (await readdir(GOLDEN_TREES_DIR)).sort(),
      "a golden added or removed changes what 'Claude's installation has not moved' is being checked against",
    ).toStrictEqual([...GOLDEN_TREES].sort());
  });

  it("has a recording to check against", async () => {
    expect(
      await everyRecordedPath(),
      "an empty corpus satisfies both assertions below without saying anything about a path builder",
    ).not.toStrictEqual([]);
  });

  it("asks each provider about the same builders", () => {
    expect(
      { claude: sitesFor("claude").length > 0, codex: sitesFor("codex").length > 0 },
      "a provider with no sites is not being asked anything, and its assertion is satisfied for free",
    ).toStrictEqual({ claude: true, codex: true });
  });

  it("lands every Claude answer on the recording", async () => {
    expect(
      attributeByRole(await everyRecordedPath(), sitesFor("claude")).exercised,
      "a path builder's Claude answer no longer names anywhere a real Claude install wrote — Claude's installation has moved",
    ).toStrictEqual([...CLAUDE_BUILDERS_THE_RECORDING_BACKS]);
  });

  it("lands no Codex answer on the recording", async () => {
    expect(
      attributeByRole(await everyRecordedPath(), sitesFor("codex")).exercised,
      "a path builder answers a Claude installation's own path when it is asked for Codex — the provider has not reached it, and a Codex run writes into the Claude install",
    ).toStrictEqual([]);
  });
});
