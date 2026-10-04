/**
 * Claude's install output does not move when the layout learns the host roles.
 *
 * C1 teaches `lib/installation/install-layout.ts` that "where does an install put things" has a
 * provider-shaped answer. The step changes no behaviour, and the thing it must not change is every
 * Claude installation on every disk — so this file asserts that through what a real install
 * RECORDED rather than by restating paths. The three golden trees under
 * `e2e/fixtures/claude-golden-trees/` are the recording: `claude-install-byte-identity.e2e.test.ts`
 * walks init, edit, compile and uninstall against the real binary and pins every file each phase
 * leaves behind.
 *
 * **Why not a path list.** A spec that spelled `.claude/agents` beside an assertion is a second
 * copy of the product's own answer, moved by whoever moves the first; it can agree with a role
 * that went wrong and cannot disagree with one that went right. The recording cannot be edited
 * into agreement, because a real install wrote it. So the question asked here is the one a list
 * cannot ask: **does every byte those journeys recorded still sit under a role the layout names?**
 *
 * Four assertions, and each fails for its own reason.
 *
 * - **Unclaimed** — a recorded path no role explains. A role that moved shows up here, and so
 *   does a role C1 forgot to add: `.claude/agents/web-developer.md` becomes unattributed the
 *   moment `agentsDir` answers anything else.
 * - **Contested** — a path two roles claim. A role widened to a parent directory produces this
 *   before it produces an unclaimed path, and an attribution reporting only the first would read
 *   as clean while one role had swallowed its siblings.
 * - **The roles each journey exercises**, by member. A count cannot see a swap, and this is the
 *   assertion that reddens when a role stops claiming anything at all — the shape an unclaimed
 *   path cannot show, because a role that claims nothing leaves nothing behind to be unclaimed.
 * - **The paths the journeys deliberately DO NOT pin** — the Claude CLI's own session file, its
 *   lock and its backups directory — must be claimed by NO role. That is the narrowness guard: a
 *   role answering `.claude` whole, or the tree root, would explain every recorded path and leave
 *   the first two assertions green over a layout that had stopped saying anything.
 *
 * The attribution itself lives in `helpers/install-path-roles.ts` with its own tests, because a
 * helper a spec leans on this hard needs a reason to be trusted — and its two discriminating
 * cases, a path under no site and a path under two, are exactly what these assertions rest on.
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

/** Every golden the Claude byte-identity journeys record, named rather than counted. */
const GOLDEN_TREES = [
  "dual-scope-edit-compile-uninstall.json",
  "global-eject.json",
  "project-plugin.json",
] as const;

type GoldenTree = (typeof GOLDEN_TREES)[number];

/**
 * The roots each journey was recorded under.
 *
 * `createTestEnvironment` in `e2e/fixtures/dual-scope-helpers.ts` puts the project INSIDE the fake
 * home — `<fakeHome>/project` — and `readInstallTree` is taken from the fake home, so every key a
 * golden holds is relative to the home and a project key opens with `project/`. Driving the roles
 * from the same two directories is what makes a role's answer comparable with a recorded key.
 */
const TREE_ROOT = path.resolve(path.sep, "recorded-home");
const PROJECT_DIR = path.join(TREE_ROOT, "project");

const SCOPES: readonly SkillScope[] = ["global", "project"];

/**
 * Which roles each journey's recording exercises, by name.
 *
 * Derived from what each journey DOES, not from running the attribution and writing down what
 * came back: `global-eject` installs every skill ejected at global scope and touches no project,
 * so it records a global source pair, global agents, global ejected skills and the settings file
 * the fixture writes — and no plugins directory, because nothing is installed as a plugin.
 * `project-plugin` installs plugins at global scope and compiles an agent into the project, so it
 * adds `plugins@global` and a project half, and records no ejected skills at all.
 * `dual-scope-edit-compile-uninstall` is the eject journey at both scopes, so it has both halves
 * and no plugins.
 */
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

/** A path under the recorded tree's root, spelled the way a golden's keys are. */
function treeRelative(absolute: string): string {
  return path.relative(TREE_ROOT, absolute).split(path.sep).join("/");
}

/**
 * Every place a Claude installation writes, at both scopes, as the roles answer today.
 *
 * `sourceDir` is included although it is not one of the roles C1 adds: the goldens record the
 * config pair as well as the host artifacts, and an attribution missing it would report those two
 * files as unclaimed on every run. Including it is also what makes the assertion total, which is
 * the property the unclaimed list depends on.
 */
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
  // Parse boundary: JSON.parse answers `any`, and the shape is the one `golden-tree.ts` writes.
  return JSON.parse(await readFile(path.join(GOLDEN_TREES_DIR, golden), "utf-8")) as RecordedGolden;
}

/** Every path a journey pinned, across all its phases: files and the directories left empty. */
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

  /**
   * The narrowness guard, and the one assertion whose subject is what the roles must NOT claim.
   *
   * `project-plugin` leaves the Claude CLI's own `.claude.json`, its lock and its `backups/`
   * directory unpinned, because nothing this CLI does can move them. They sit inside `.claude/`,
   * so a role answering that directory whole — or the tree root — would claim them, and the three
   * assertions above would go green over a layout that had stopped discriminating. The roster of
   * unpinned paths is checked for emptiness first, because an assertion over nothing is satisfied
   * by any implementation at all.
   */
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
