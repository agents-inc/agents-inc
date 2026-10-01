/**
 * A recorded install tree read back, and the one transformation that says what a folder rename
 * did to it.
 *
 * The Claude golden trees are re-recorded on purpose exactly once per layout change, and the plan
 * that moves the source folder predicts the whole diff before the move: a named set of path keys,
 * and one import specifier inside the files under them. A re-record is trustworthy when the
 * recorded tree differs from the one before it by that prediction and by nothing else — and
 * "nothing else" is the half no roster of moved keys can state, because a roster says what it
 * names and is silent about every byte it does not.
 *
 * So this module does the inverse: it takes the tree as recorded and writes the move BACK out of
 * it, answering both what it had to touch and the tree it arrives at. The caller then holds that
 * reconstruction against the tree recorded before the move. Where the two agree, the move is the
 * whole difference; where they do not, something else rode along in the same `-u`.
 *
 * **The names are the caller's, not this module's.** Every spelling of a source folder in this
 * package is resolved rather than written, and a shared helper is not a spec — the one place the
 * e2e tree is allowed to write them is its own mirror. So the two spellings and the two import
 * specifiers arrive as a {@link FolderMove}, and this module never knows which folder it is
 * undoing.
 *
 * A reconstruction is compared through {@link structuralDigest} rather than as bytes: the sort
 * order of a tree's keys follows the names, so a renamed key lands somewhere else in the file and
 * two trees that hold the same recording serialise differently. The digest sorts before it
 * hashes, which is what makes the comparison about the recording rather than about the spelling.
 */
import { createHash } from "node:crypto";

import { bytewise } from "../../../utils/string.js";

/** One phase of a recorded journey, in the shape `readInstallTree` serialises. */
export type RecordedPhase = {
  files: Record<string, string>;
  emptyDirectories: string[];
};

/** One journey's recorded trees: each phase by name, and the paths the journey does not pin. */
export type RecordedGolden = {
  notPinned: string[];
  phases: Record<string, RecordedPhase>;
};

/**
 * A folder that moved, in the four spellings a recorded tree can hold it in.
 *
 * `pathNow` and `pathBefore` are matched as whole path SEGMENTS, so a folder whose name is a
 * prefix of a sibling's is not caught by the one that moved. `textNow` and `textBefore` are exact
 * strings, because the text this touches is a relative import specifier and its `../` depth
 * changes with the folder's — a substring swap of the folder name alone would leave the depth
 * from the old layout and reconstruct a file that never existed.
 */
export type FolderMove = {
  readonly pathNow: string;
  readonly pathBefore: string;
  readonly textNow: string;
  readonly textBefore: string;
};

/** A recorded tree with a move written back out of it, and everything that undo had to touch. */
export type UnwoundGolden = {
  /** What the same journey recorded before the move, if the move is the whole difference. */
  before: RecordedGolden;
  /** Every path key the undo renamed, as `<phase>: <key>`, in the tree's own order. */
  renamedKeys: string[];
  /** Every file whose TEXT the undo rewrote, in the same form. */
  rewrittenFiles: string[];
};

/** Where `run` begins inside `segments` as a contiguous whole-segment run, or -1. */
function indexOfRun(segments: readonly string[], run: readonly string[]): number {
  for (let at = 0; at + run.length <= segments.length; at += 1) {
    if (run.every((segment, offset) => segments[at + offset] === segment)) return at;
  }

  return -1;
}

/** `key` with the first whole-segment run of `from` spelled `to`, or null when it holds none. */
function renamedKey(key: string, from: string, to: string): string | null {
  const segments = key.split("/");
  const fromSegments = from.split("/");
  const at = indexOfRun(segments, fromSegments);

  if (at === -1) return null;

  return [
    ...segments.slice(0, at),
    ...to.split("/"),
    ...segments.slice(at + fromSegments.length),
  ].join("/");
}

/** One phase with the move undone, and what that cost, reported per file. */
function unwindPhase(
  phase: string,
  tree: RecordedPhase,
  move: FolderMove,
): { tree: RecordedPhase; renamedKeys: string[]; rewrittenFiles: string[] } {
  const renamedKeys: string[] = [];
  const rewrittenFiles: string[] = [];

  const files = Object.fromEntries(
    Object.entries(tree.files).map(([key, text]) => {
      const renamed = renamedKey(key, move.pathNow, move.pathBefore);
      const rewritten = text.replaceAll(move.textNow, move.textBefore);

      if (renamed !== null) renamedKeys.push(`${phase}: ${key}`);
      if (rewritten !== text) rewrittenFiles.push(`${phase}: ${key}`);

      return [renamed ?? key, rewritten];
    }),
  );

  return {
    tree: {
      files,
      emptyDirectories: tree.emptyDirectories.map(
        (dir) => renamedKey(dir, move.pathNow, move.pathBefore) ?? dir,
      ),
    },
    renamedKeys,
    rewrittenFiles,
  };
}

/**
 * The tree this golden recorded before `move`, and everything the reconstruction had to touch.
 *
 * The two rosters are the point as much as the tree is: a caller holds them against the diff its
 * plan predicted, so a reconstruction that quietly touched a file nobody predicted is named
 * rather than absorbed.
 */
export function goldenBeforeTheMove(golden: RecordedGolden, move: FolderMove): UnwoundGolden {
  const unwound = Object.entries(golden.phases).map(
    ([phase, tree]) => [phase, unwindPhase(phase, tree, move)] as const,
  );

  return {
    before: {
      notPinned: golden.notPinned,
      phases: Object.fromEntries(unwound.map(([phase, { tree }]) => [phase, tree])),
    },
    renamedKeys: unwound.flatMap(([, { renamedKeys }]) => renamedKeys),
    rewrittenFiles: unwound.flatMap(([, { rewrittenFiles }]) => rewrittenFiles),
  };
}

/** The same value with every object's keys in one order, so two spellings hash alike. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort(bytewise)
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
  );
}

/**
 * A digest of what a value HOLDS, rather than of how it was written.
 *
 * Key order is what a byte comparison would catch here and what it must not: renaming a path key
 * moves it in a sorted tree, so every key after it changes position while the recording is
 * untouched. Sorting before hashing is what leaves the difference in the recording alone.
 */
export function structuralDigest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
