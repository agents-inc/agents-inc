import { describe, expect, it } from "vitest";

import {
  type FolderMove,
  type RecordedGolden,
  goldenBeforeTheMove,
  structuralDigest,
} from "./golden-source-folder.js";

/**
 * A folder that moved, written as a spec may write one.
 *
 * The names are invented rather than the real pair, because this file's subject is the undo and
 * not the rename: a helper that only ever worked on `.claude-src` would be a helper that matched
 * that string, and nothing here would say so.
 */
const MOVE: FolderMove = {
  pathNow: "outer/inner",
  pathBefore: "old",
  textNow: "from '../../../outer/inner/types'",
  textBefore: "from '../../old/types'",
};

/** A recorded journey holding one moved file, one untouched file and one empty directory. */
function goldenWith(
  files: Record<string, string>,
  emptyDirectories: string[] = [],
): RecordedGolden {
  return { notPinned: [".state/lock"], phases: { "after init": { files, emptyDirectories } } };
}

describe("the tree a golden recorded before a folder moved", () => {
  it("renames a key whose first segment is the folder, and says which", () => {
    const unwound = goldenBeforeTheMove(
      goldenWith({ "outer/inner/config.ts": "export default {}" }),
      MOVE,
    );

    expect(Object.keys(unwound.before.phases["after init"]?.files ?? {})).toStrictEqual([
      "old/config.ts",
    ]);
    expect(unwound.renamedKeys).toStrictEqual(["after init: outer/inner/config.ts"]);
  });

  it("renames a key that holds the folder further down, under a project of its own", () => {
    const unwound = goldenBeforeTheMove(
      goldenWith({ "project/outer/inner/config.ts": "export default {}" }),
      MOVE,
    );

    expect(Object.keys(unwound.before.phases["after init"]?.files ?? {})).toStrictEqual([
      "project/old/config.ts",
    ]);
  });

  // The discriminating case for the two above: without it a helper that matched the folder as a
  // SUBSTRING would satisfy both, and would rewrite every sibling whose name merely starts alike.
  it("leaves a sibling whose name only begins with the folder's alone", () => {
    const unwound = goldenBeforeTheMove(
      goldenWith({ "outer/inner-plugin/manifest.json": "{}" }),
      MOVE,
    );

    expect(Object.keys(unwound.before.phases["after init"]?.files ?? {})).toStrictEqual([
      "outer/inner-plugin/manifest.json",
    ]);
    expect(unwound.renamedKeys).toStrictEqual([]);
  });

  it("writes the recorded import specifier back whole, depth and all", () => {
    const unwound = goldenBeforeTheMove(
      goldenWith({ "project/outer/inner/config-types.ts": `} ${MOVE.textNow}\n` }),
      MOVE,
    );

    expect(unwound.before.phases["after init"]?.files["project/old/config-types.ts"]).toBe(
      `} ${MOVE.textBefore}\n`,
    );
    expect(unwound.rewrittenFiles).toStrictEqual([
      "after init: project/outer/inner/config-types.ts",
    ]);
  });

  // A file whose PATH moved and whose text did not is the ordinary case, and the roster that
  // names both must keep them apart — a helper reporting the rename as a rewrite would make the
  // caller's predicted count of content rewrites unfalsifiable.
  it("reports a moved file that holds no rewritten text as renamed only", () => {
    const unwound = goldenBeforeTheMove(
      goldenWith({ "outer/inner/config.ts": "export default {}" }),
      MOVE,
    );

    expect(unwound.rewrittenFiles).toStrictEqual([]);
  });

  it("renames an empty directory recorded under the folder", () => {
    const unwound = goldenBeforeTheMove(goldenWith({}, ["project/outer/inner"]), MOVE);

    expect(unwound.before.phases["after init"]?.emptyDirectories).toStrictEqual(["project/old"]);
  });

  it("carries the paths the journey does not pin through untouched", () => {
    expect(goldenBeforeTheMove(goldenWith({}), MOVE).before.notPinned).toStrictEqual([
      ".state/lock",
    ]);
  });
});

describe("a digest of what a recorded tree holds", () => {
  it("is the same for two trees whose keys were written in a different order", () => {
    const one = goldenWith({ "b.ts": "b", "a.ts": "a" });
    const other = goldenWith({ "a.ts": "a", "b.ts": "b" });

    expect(structuralDigest(one)).toBe(structuralDigest(other));
  });

  // The subject guard: a digest that answered alike for everything would satisfy the case above
  // without looking at either tree.
  it("differs when a single recorded byte differs", () => {
    expect(structuralDigest(goldenWith({ "a.ts": "a" }))).not.toBe(
      structuralDigest(goldenWith({ "a.ts": "A" })),
    );
  });

  // Order inside an array is content, not spelling — an `emptyDirectories` list is recorded
  // sorted, so two different orders are two different recordings.
  it("keeps the order of a recorded array", () => {
    expect(structuralDigest(goldenWith({}, ["a", "b"]))).not.toBe(
      structuralDigest(goldenWith({}, ["b", "a"])),
    );
  });
});
