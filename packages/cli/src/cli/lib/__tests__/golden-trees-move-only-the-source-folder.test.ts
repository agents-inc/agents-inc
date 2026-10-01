/**
 * The Claude golden trees across the step that starts WRITING the new source folder, held to the
 * diff the plan predicted before anything was re-recorded.
 *
 * R2 of the source-folder rename is the first step whose golden trees legitimately move: a new
 * installation is created in `.agents-inc/<provider>/` instead of `.claude-src/`, so every path
 * an install records under that folder is renamed and the project `config-types.ts` that imports
 * the global one by a relative specifier is rewritten. `todo/plans/CLI-source-folder-rename-plan.md`
 * predicts the WHOLE of it — twenty path keys and four content rewrites, split 14/3 across the
 * dual-scope journey, 2/0 across global-eject and 4/1 across project-plugin — and this file is
 * that prediction made mechanical, so the re-record is checked rather than trusted.
 *
 * **This replaces the R1 pin** (`golden-trees-are-unchanged-by-the-source-folder-rename`), whose
 * subject was that nothing moved. That sentence is retired by the step this file is about, and a
 * pin that must fail forever is worse than no pin: it reads as the regression the change caused.
 *
 * Four assertions, and they answer four different questions.
 *
 *   - The ROSTER of path keys naming a source folder answers "what moved". It holds BOTH
 *     spellings, so a key left on the old name arrives in the same diff rather than in a second
 *     assertion that might not be read.
 *   - The REWRITE roster answers "what changed inside a file whose path moved", which no roster
 *     of keys can see: the four `config-types.ts` imports are the only file content the move
 *     touches, and a key comparison is blind to every byte under it.
 *   - The DIGEST answers "and nothing else". It is taken over the tree with the move written back
 *     OUT of the recording — reconstructed by `helpers/golden-source-folder.ts` — and held
 *     against the digest of the tree as it stood before R2. Where the reconstruction agrees, the
 *     rename is the whole difference; where it does not, something rode along in the same `-u`.
 *     Structural rather than byte-wise on purpose: renaming a key moves it in a sorted tree, so
 *     every key after it changes position while the recording is untouched.
 *   - The EMPTY DIRECTORIES roster answers "did the re-record lock a bug in". This is the half the
 *     plan names explicitly and the only one that is green both before and after: uninstall cleans
 *     up leaf-first, so a provider folder removed without its now-empty `.agents-inc/` parent would
 *     leave the after-uninstall phase recording one — and a blind `-u` would write that into the
 *     fixture as the expected behaviour.
 *
 * The digest and the empty-directory roster are PINS rather than red-then-green tests: they are
 * green today, they must stay green through the flip, and their red arrives only if the re-record
 * carried something the plan did not predict. The two rosters above them are the red-then-green
 * half, and they are red until the flip lands.
 *
 * The folder names are literals. They are text recorded on disk by a real install, and an
 * assertion importing the constant the product writes would move with it and could never fail.
 */

import path from "path";
import { readFile, readdir } from "fs/promises";
import { describe, expect, it } from "vitest";

import { CLI_ROOT } from "./helpers/cli-runner.js";
import {
  type FolderMove,
  type RecordedGolden,
  goldenBeforeTheMove,
  structuralDigest,
} from "./helpers/golden-source-folder.js";

const GOLDEN_TREES_DIR = path.join(CLI_ROOT, "e2e", "fixtures", "claude-golden-trees");

/** Every golden the Claude byte-identity journeys record, named rather than counted. */
const GOLDEN_TREES = [
  "dual-scope-edit-compile-uninstall.json",
  "global-eject.json",
  "project-plugin.json",
] as const;

/**
 * The move itself, in the four spellings a recorded tree holds it in.
 *
 * The import specifier gains a `../` because the new folder is one level deeper than the one it
 * replaces — `project/.agents-inc/claude/` against `project/.claude-src/`. That is why the text
 * pair is exact rather than a swap of the folder name inside it: a name-only swap would leave the
 * old depth and reconstruct a file no install ever wrote.
 */
const THE_MOVE: FolderMove = {
  pathNow: ".agents-inc/claude",
  pathBefore: ".claude-src",
  textNow: "from '../../../.agents-inc/claude/config-types'",
  textBefore: "from '../../.claude-src/config-types'",
};

/**
 * Every path an installed tree records under a source folder once the flip has landed, per golden
 * and per phase. Twenty keys in all, which is the plan's predicted rename exactly.
 *
 * Both spellings are searched for, so a key the flip left behind on the old name is reported here
 * by name rather than passing this assertion and failing a different one.
 */
const SOURCE_FOLDER_KEYS = {
  "dual-scope-edit-compile-uninstall.json": {
    "after dual-scope setup": [
      ".agents-inc/claude/config-types.ts",
      ".agents-inc/claude/config.ts",
      "project/.agents-inc/claude/config-types.ts",
      "project/.agents-inc/claude/config.ts",
    ],
    "after the edit pairs a global skill at project scope": [
      ".agents-inc/claude/config-types.ts",
      ".agents-inc/claude/config.ts",
      "project/.agents-inc/claude/config-types.ts",
      "project/.agents-inc/claude/config.ts",
    ],
    "after compile from the project": [
      ".agents-inc/claude/config-types.ts",
      ".agents-inc/claude/config.ts",
      "project/.agents-inc/claude/config-types.ts",
      "project/.agents-inc/claude/config.ts",
    ],
    "after uninstall from the project": [
      ".agents-inc/claude/config-types.ts",
      ".agents-inc/claude/config.ts",
    ],
  },
  "global-eject.json": {
    "after init": [".agents-inc/claude/config-types.ts", ".agents-inc/claude/config.ts"],
  },
  "project-plugin.json": {
    "after init": [
      ".agents-inc/claude/config-types.ts",
      ".agents-inc/claude/config.ts",
      "project/.agents-inc/claude/config-types.ts",
      "project/.agents-inc/claude/config.ts",
    ],
  },
} as const satisfies Record<(typeof GOLDEN_TREES)[number], Record<string, readonly string[]>>;

/**
 * The four files whose TEXT the move rewrites, and the only ones.
 *
 * A project's `config-types.ts` imports the global one by a path relative to itself, computed in
 * `lib/configuration/config-types-io.ts`. The global config-types imports nothing, which is why
 * global-eject has no entry here at all — and why the split is 3/0/1 rather than one per journey.
 */
const IMPORT_REWRITES = {
  "dual-scope-edit-compile-uninstall.json": [
    "after dual-scope setup: project/.agents-inc/claude/config-types.ts",
    "after the edit pairs a global skill at project scope: project/.agents-inc/claude/config-types.ts",
    "after compile from the project: project/.agents-inc/claude/config-types.ts",
  ],
  "global-eject.json": [],
  "project-plugin.json": ["after init: project/.agents-inc/claude/config-types.ts"],
} as const satisfies Record<(typeof GOLDEN_TREES)[number], readonly string[]>;

/**
 * What each journey recorded BEFORE the flip, as a digest of the recording rather than of the
 * file. Taken from `packages/cli` over the goldens as they stood on 2026-09-20, and re-derivable
 * from a pre-flip tree with, run from `packages/cli`:
 *
 * ```
 * bun -e 'const {structuralDigest} = await import("./src/cli/lib/__tests__/helpers/golden-source-folder.ts");
 *   const {readFileSync} = await import("fs");
 *   for (const f of ["dual-scope-edit-compile-uninstall","global-eject","project-plugin"])
 *     console.log(f, structuralDigest(JSON.parse(readFileSync(`e2e/fixtures/claude-golden-trees/${f}.json`,"utf-8"))));'
 * ```
 *
 * Taken over the golden itself rather than over a reconstruction because before the flip there is
 * nothing to write back out — which is the same statement the assertion below makes afterwards.
 *
 * One row per step, so a reader can see which claim moved:
 *
 * | Step            | dual-scope-edit-compile-uninstall | global-eject | project-plugin |
 * | --------------- | --------------------------------- | ------------ | -------------- |
 * | Before the flip | `4815a9bb…`                       | `9a622d14…`  | `42e52148…`    |
 *
 * A step after the flip that changes an installed tree owes this treatment: predict the diff,
 * check the `-u` against the prediction, then move the constant and say what moved it.
 */
const BEFORE_THE_MOVE_DIGESTS = {
  "dual-scope-edit-compile-uninstall.json":
    "4815a9bbdc05eb6fe38f643ca4f70a567ce4da306d120581ce4474401424be82",
  "global-eject.json": "9a622d14056c9b12b54a3908282ce3cbf43a23581a01bae5f825f24df2216cd1",
  "project-plugin.json": "42e52148a7ee58c85d11090a5737726867e131762d36598d9426cee4511d6a39",
} as const satisfies Record<(typeof GOLDEN_TREES)[number], string>;

/**
 * Every directory an install leaves behind holding nothing, per golden and per phase.
 *
 * All but one are empty, and that is the assertion's whole subject. `project-plugin` records the
 * marketplace directory the Claude CLI creates and does not fill; the after-uninstall phase of the
 * dual-scope journey records NOTHING, and must go on recording nothing — uninstall removes the
 * provider folder when it empties, so it has to remove the `.agents-inc/` parent underneath it
 * too. A `-u` taken before that lands writes `project/.agents-inc` in here and the bug becomes the
 * fixture.
 */
const EMPTY_DIRECTORIES = {
  "dual-scope-edit-compile-uninstall.json": {
    "after dual-scope setup": [],
    "after the edit pairs a global skill at project scope": [],
    "after compile from the project": [],
    "after uninstall from the project": [],
  },
  "global-eject.json": { "after init": [] },
  "project-plugin.json": { "after init": [".claude/plugins/marketplaces"] },
} as const satisfies Record<(typeof GOLDEN_TREES)[number], Record<string, readonly string[]>>;

async function readGolden(golden: string): Promise<RecordedGolden> {
  // Parse boundary: JSON.parse answers `any`, and the shape is the one `golden-tree.ts` writes.
  return JSON.parse(await readFile(path.join(GOLDEN_TREES_DIR, golden), "utf-8")) as RecordedGolden;
}

/** Every key of every phase that names a source folder under either of its two spellings. */
function sourceFolderKeysIn(recorded: RecordedGolden): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(recorded.phases).map(([phase, tree]) => [
      phase,
      Object.keys(tree.files).filter(
        (file) => file.includes(THE_MOVE.pathNow) || file.includes(THE_MOVE.pathBefore),
      ),
    ]),
  );
}

describe("the golden trees the flip re-records", () => {
  it("are exactly the journeys that record a Claude install", async () => {
    expect(
      (await readdir(GOLDEN_TREES_DIR)).sort(),
      "a golden added or removed changes what 'the re-record diff is exactly the rename' is being checked against",
    ).toStrictEqual([...GOLDEN_TREES].sort());
  });

  it.each(GOLDEN_TREES)("records %s's source folder under the new name", async (golden) => {
    expect(
      sourceFolderKeysIn(await readGolden(golden)),
      "the source-folder paths an install records — a key still on the old name is a path the flip did not reach",
    ).toStrictEqual(SOURCE_FOLDER_KEYS[golden]);
  });

  it.each(GOLDEN_TREES)(
    "rewrites %s's project config-types import and nothing else",
    async (golden) => {
      expect(
        goldenBeforeTheMove(await readGolden(golden), THE_MOVE).rewrittenFiles,
        "the files whose TEXT the move rewrites — an install whose project config-types still imports the old path compiles against a module that is not there",
      ).toStrictEqual(IMPORT_REWRITES[golden]);
    },
  );

  /**
   * The "and nothing else" half, and the only one that can see a change the rosters do not name.
   *
   * Green before the flip (the reconstruction is a no-op on a tree holding no new-layout path) and
   * green after, so its red says one thing: the re-record carried something the plan did not
   * predict.
   */
  it.each(GOLDEN_TREES)("leaves everything in %s outside that move untouched", async (golden) => {
    const unwound = goldenBeforeTheMove(await readGolden(golden), THE_MOVE);

    expect(
      structuralDigest(unwound.before),
      "writing the rename back out of this golden does not reproduce the tree recorded before the flip — the re-record moved something besides the source folder",
    ).toBe(BEFORE_THE_MOVE_DIGESTS[golden]);
  });

  /**
   * The re-record's own trap, named by the plan: never `-u` blind.
   *
   * `removeDirIfEmpty` runs on the leaf, so a provider folder taken away without its parent leaves
   * an empty `.agents-inc/` behind — which this fixture would then record as correct.
   */
  it.each(GOLDEN_TREES)(
    "records in %s only the directories an install means to leave empty",
    async (golden) => {
      const recorded = await readGolden(golden);

      expect(
        Object.fromEntries(
          Object.entries(recorded.phases).map(([phase, tree]) => [phase, tree.emptyDirectories]),
        ),
        "an install left an empty directory behind that it did not before — uninstall cleans up leaf-first, so the source folder's parent is the one it forgets",
      ).toStrictEqual(EMPTY_DIRECTORIES[golden]);
    },
  );
});
