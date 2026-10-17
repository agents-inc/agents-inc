/**
 * Every path the Claude golden trees in `e2e/fixtures/claude-golden-trees/` recorded must sit
 * under exactly one layout role, so a moved, widened or unused role reddens here.
 */

import os from "os";
import path from "path";
import { readFile, readdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SkillScope } from "../../../types/config.js";
import { agentsDir, permissionFiles, pluginsDir, skillsDir, sourceDir } from "../install-layout.js";
import { CLI_ROOT } from "../../__tests__/helpers/cli-runner.js";
import type { RecordedGolden } from "../../__tests__/helpers/golden-tree.js";
import { attributeByRole, type RoleSite } from "./helpers/install-path-roles.js";

const GOLDEN_TREES_DIR = path.join(CLI_ROOT, "e2e", "fixtures", "claude-golden-trees");

const GOLDEN_TREES = [
  "dual-scope-edit-compile-uninstall.json",
  "global-eject.json",
  "project-plugin.json",
] as const;

type GoldenTree = (typeof GOLDEN_TREES)[number];

// Goldens are keyed relative to the fake home, with the project at `project/` inside it.
const TREE_ROOT = path.resolve(path.sep, "recorded-home");
const PROJECT_DIR = path.join(TREE_ROOT, "project");

const SCOPES: readonly SkillScope[] = ["global", "project"];

// Derived from what each journey does, not from the attribution's output.
const ROLES_EXERCISED = {
  "dual-scope-edit-compile-uninstall.json": [
    "agents@global",
    "agents@project",
    "settings@global",
    "settings@project",
    "skills@global",
    "skills@project",
    "source@global",
    "source@project",
  ],
  "global-eject.json": ["agents@global", "settings@global", "skills@global", "source@global"],
  "project-plugin.json": [
    "agents@global",
    "agents@project",
    "plugins@global",
    "settings@global",
    "settings@project",
    "source@global",
    "source@project",
  ],
} as const satisfies Record<GoldenTree, readonly string[]>;

function treeRelative(absolute: string): string {
  return path.relative(TREE_ROOT, absolute).split(path.sep).join("/");
}

// `sourceDir` is included because the goldens record the config pair too.
function claudeSites(): RoleSite[] {
  return SCOPES.flatMap((scope) => {
    const scopeRoot = scope === "global" ? TREE_ROOT : PROJECT_DIR;
    const directories = [
      ["source", sourceDir(scopeRoot, "claude")],
      ["agents", agentsDir("claude", scope, PROJECT_DIR)],
      ["skills", skillsDir("claude", scope, PROJECT_DIR)],
      ["plugins", pluginsDir("claude", scope, PROJECT_DIR)],
    ] as const;

    return [
      ...directories.flatMap(([role, at]) =>
        at === null ? [] : [{ role: `${role}@${scope}`, at: treeRelative(at) }],
      ),
      ...permissionFiles("claude", scope, PROJECT_DIR).map((file) => ({
        role: `settings@${scope}`,
        at: treeRelative(file),
      })),
    ];
  });
}

async function readGolden(golden: GoldenTree): Promise<RecordedGolden> {
  // Parse boundary: the shape `golden-tree.ts` writes.
  return JSON.parse(await readFile(path.join(GOLDEN_TREES_DIR, golden), "utf-8")) as RecordedGolden;
}

function everyRecordedPath(recorded: RecordedGolden): string[] {
  const perPhase = Object.values(recorded.phases).flatMap((phase) => [
    ...Object.keys(phase.files),
    ...phase.emptyDirectories,
  ]);

  return [...new Set(perPhase)].sort();
}

describe("every path a Claude install recorded sits under a role the layout names", () => {
  beforeEach(() => {
    vi.spyOn(os, "homedir").mockReturnValue(TREE_ROOT);
  });

  afterEach(() => {
    vi.mocked(os.homedir).mockRestore();
  });

  it("is checked against exactly the journeys that record a Claude install", async () => {
    expect(
      (await readdir(GOLDEN_TREES_DIR)).sort(),
      "a golden added or removed changes what 'Claude's install output has not moved' is being checked against",
    ).toStrictEqual([...GOLDEN_TREES].sort());
  });

  it.each(GOLDEN_TREES)("has something to check in %s", async (golden) => {
    expect(
      everyRecordedPath(await readGolden(golden)),
      "a journey recording nothing satisfies every assertion below without saying anything about the layout",
    ).not.toStrictEqual([]);
  });

  it.each(GOLDEN_TREES)("leaves nothing in %s unexplained by a role", async (golden) => {
    expect(
      attributeByRole(everyRecordedPath(await readGolden(golden)), claudeSites()).unclaimed,
      "a Claude install wrote somewhere no role names — the role that used to answer for it has moved",
    ).toStrictEqual([]);
  });

  it.each(GOLDEN_TREES)("gives every path in %s exactly one role", async (golden) => {
    expect(
      attributeByRole(everyRecordedPath(await readGolden(golden)), claudeSites()).contested,
      "two roles claim one path, so one of them has been widened over its siblings and answers for directories it does not own",
    ).toStrictEqual([]);
  });

  it.each(GOLDEN_TREES)("exercises exactly the roles %s records", async (golden) => {
    expect(
      attributeByRole(everyRecordedPath(await readGolden(golden)), claudeSites()).exercised,
      "the roles this journey's recording reaches — a role missing here claims nothing at all, which no unclaimed path can show",
    ).toStrictEqual([...ROLES_EXERCISED[golden]]);
  });

  // Narrowness guard: Claude Code's own state inside `.claude/` must be claimed by no role.
  it("claims none of the paths the journeys deliberately leave unpinned", async () => {
    const recorded = await Promise.all(GOLDEN_TREES.map(readGolden));
    const unpinned = recorded.flatMap((golden) => golden.notPinned);

    expect(
      unpinned,
      "no journey leaves anything unpinned, so this guard has no subject and cannot fail",
    ).not.toStrictEqual([]);

    expect(
      attributeByRole(unpinned, claudeSites()).claims.filter((claim) => claim.roles.length > 0),
      "a role claims another program's own state, so it answers for a directory this CLI does not own",
    ).toStrictEqual([]);
  });
});
