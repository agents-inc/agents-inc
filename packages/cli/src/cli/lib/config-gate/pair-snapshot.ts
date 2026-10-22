import type { Provider } from "../../consts";
import { getProjectConfigPath } from "../installation/install-base-dir";
import { fileExists, readFile } from "../../utils/fs";
import { typesPathFor } from "./pair-writer.js";

/** What one half of a pair reads as: absent is `null`; unreadable is a symbol equal to nothing. */
type HalfContents = string | null | symbol;

/** Both halves of a project's config pair as they read now. */
type PairContents = readonly [HalfContents, HalfContents];

export type PairSnapshot = ReadonlyMap<string, PairContents>;

/**
 * DEGRADE: one project's unreadable file must not stop the fan-out from visiting the rest, which
 * skips that project and says why. A fresh symbol never equals a later read, not even another
 * unreadable one, so a pair the fan-out did update still counts as rewritten.
 */
async function readHalf(filePath: string): Promise<HalfContents> {
  try {
    return (await fileExists(filePath)) ? await readFile(filePath) : null;
  } catch {
    return Symbol(filePath);
  }
}

async function readPair(projectDir: string, provider: Provider): Promise<PairContents> {
  const configPath = getProjectConfigPath(projectDir, provider);
  return Promise.all([readHalf(configPath), readHalf(typesPathFor(configPath))]);
}

/** Taken before a fan-out, so what it writes can be told from a re-emit of the same bytes. */
export async function snapshotProjectPairs(
  projectDirs: readonly string[],
  provider: Provider,
): Promise<PairSnapshot> {
  const pairs = await Promise.all(
    projectDirs.map(async (dir) => [dir, await readPair(dir, provider)] as const),
  );
  return new Map(pairs);
}

/** `projectDirs` must each have been snapshotted: a fan-out only reaches projects it was handed. */
export async function pairsRewrittenSince(
  before: PairSnapshot,
  projectDirs: readonly string[],
  provider: Provider,
): Promise<Set<string>> {
  const judged = await Promise.all(
    projectDirs.map(async (dir) => ({
      dir,
      rewritten: !samePair(snapshotOf(before, dir), await readPair(dir, provider)),
    })),
  );
  return new Set(judged.filter(({ rewritten }) => rewritten).map(({ dir }) => dir));
}

function snapshotOf(before: PairSnapshot, dir: string): PairContents {
  const pair = before.get(dir);
  if (pair === undefined) throw new Error(`No snapshot of ${dir} was taken before the fan-out`);
  return pair;
}

function samePair([config, types]: PairContents, [configNow, typesNow]: PairContents): boolean {
  return config === configNow && types === typesNow;
}
