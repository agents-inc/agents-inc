/**
 * Claude's installation does not move when the provider is threaded through every path builder,
 * and nothing the layout answers for Codex lands where Claude's installation already is.
 *
 * Step C2 of `todo/plans/CLI-codex-provider-plan.md` — "the provider reaches every path". The one
 * thing the step must not change is every Claude installation on every disk, and the step's own
 * failure mode is the mirror of that: a path builder the threading missed keeps answering
 * `.claude/` and `.agents-inc/claude/` for BOTH providers, so a Codex run writes into the Claude
 * installation with every test green. The plan calls it a half-routed path, and it is the reason
 * the `--provider` flag was kept off the help screens until C7b shipped it.
 *
 * **Asserted through what a real install RECORDED, not by restating paths.** The three golden
 * trees under `e2e/fixtures/claude-golden-trees/` are walked by
 * `claude-install-byte-identity.e2e.test.ts` against the real binary — init, edit, compile and
 * uninstall — and every file each phase leaves behind is pinned there. A spec that spelled
 * `.claude/agents` beside an assertion would be a second copy of the product's own answer, moved
 * by whoever moves the first. The recording cannot be edited into agreement, because an install
 * wrote it.
 *
 * **Two assertions that move together, and neither means anything alone.**
 *
 * - **A Claude ask lands on the recording.** Every path builder asked for `claude` answers a
 *   place the recording holds. A builder whose Claude answer moved stops claiming anything and
 *   drops out of the roster, which is what a count could not see.
 * - **A Codex ask lands nowhere near it.** No path builder asked for `codex` answers anything the
 *   recording holds. This is the half a builder the threading missed reddens: one that still
 *   answers `.agents-inc/claude/config.ts` when asked for Codex names a file in the recording, at
 *   both scopes.
 *
 * Written as one refusal with its permitted case beside it on purpose: a Codex roster that
 * claimed nothing because the builders had stopped answering at all would satisfy the second
 * assertion and fail the first.
 *
 * **Every builder is asked for both providers**, so each contributes a Claude answer that must land
 * on the recording and a Codex answer that must not. A role that stops answering for Claude
 * reddens the first half; one whose Codex answer is still Claude's reddens the second.
 *
 * The corpus is every path every phase of every golden holds, aggregated. Per-golden rosters are
 * `claude-install-output-stays-under-its-roles.test.ts`'s subject and are not restated here; what
 * this file asks is a question about the builders rather than about any one journey.
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

/** Every golden the Claude byte-identity journeys record, named rather than counted. */
const GOLDEN_TREES = [
  "dual-scope-edit-compile-uninstall.json",
  "global-eject.json",
  "project-plugin.json",
] as const;

/**
 * The roots each journey was recorded under.
 *
 * `createTestEnvironment` in `e2e/fixtures/dual-scope-helpers.ts` puts the project INSIDE the
 * fake home — `<fakeHome>/project` — and the tree is read from the fake home, so every key a
 * golden holds is relative to the home and a project key opens with `project/`. Driving the
 * builders from the same two directories is what makes an answer comparable with a recorded key.
 *
 * Neither directory is created. Every builder under test is a path builder: the two that probe
 * the disk answer the layout a new installation is created in when there is nothing there, which
 * is the same answer the recording holds.
 */
const TREE_ROOT = path.resolve(path.sep, "recorded-home");
const PROJECT_DIR = path.join(TREE_ROOT, "project");

const SCOPES: readonly SkillScope[] = ["global", "project"];

/**
 * The builders that claim a recorded Claude path today, by name.
 *
 * `plugins@project` is absent because no journey installs a plugin at project scope, so the
 * corpus holds nothing under `project/.claude/plugins` for it to claim. That is a fact about the
 * recording rather than about the builder, and it is written out rather than left to a count —
 * a count cannot tell a builder that stopped answering from one the journeys never exercised.
 */
const CLAUDE_BUILDERS_THE_RECORDING_BACKS = [
  "agents@global",
  "agents@project",
  "config@global",
  "config@project",
  "plugins@global",
  "skills@global",
  "skills@project",
] as const;

/** A path under the recorded tree's root, spelled the way a golden's keys are. */
function treeRelative(absolute: string): string {
  return path.relative(TREE_ROOT, absolute).split(path.sep).join("/");
}

/** Every place the path builders answer for `provider`, at both scopes. */
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
  // Parse boundary: JSON.parse answers `any`, and the shape is the one `golden-tree.ts` writes.
  return JSON.parse(await readFile(path.join(GOLDEN_TREES_DIR, golden), "utf-8")) as RecordedGolden;
}

/** Every path every phase of every golden holds: files and the directories left empty. */
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
    // Codex's global root follows `$CODEX_HOME` wherever a developer's shell points it, and an
    // answer that followed one out of the fake home would miss the recording for a reason that
    // has nothing to do with the threading.
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
