/**
 * The zones a flat ESLint config splits one rule into, read off the config instead of listed
 * beside it.
 *
 * `no-restricted-syntax` and `no-restricted-imports` take options, and a rule's options are NOT
 * merged across flat-config blocks — the last block naming the rule for a file owns all of them.
 * So every block that declares the rule for a reason of its own silently drops every selector it
 * does not restate, and only a lint run over a real file IN THAT ZONE can tell a restated selector
 * from a dropped one. A gate measuring those zones therefore needs one subject file per zone.
 *
 * **That roster used to be hand-written, and three waves running left it short** — two zones
 * unrostered on 2026-09-20 alone, each one a block whose selectors nothing measured. A list that
 * has to be extended by whoever adds a block is a list that records the blocks somebody remembered.
 * So the zones are DERIVED here: every block declaring the rule becomes a zone, and its subject is
 * a file the block owns — meaning a file it matches that no LATER declaring block matches, since a
 * later block would own the rule's options for it and the lint would measure that block instead.
 *
 * A zone that owns no file at all comes back with a `null` subject rather than being dropped. That
 * is a config nothing can be measured against — a block matching no file on disk, or one whose
 * every file a later block has taken — and it is the caller's to fail on, not this module's to
 * quietly skip.
 */
import { pathToFileURL } from "node:url";

import type { Linter } from "eslint";
import fg from "fast-glob";

/** One separately-ruled zone: how its block selects files, and a real file that block owns. */
export type LintZone = {
  /** The block's own patterns, so a failure names the ZONE rather than only the file it linted. */
  readonly patterns: string;
  /** A file on disk the block owns, or `null` when it owns none. */
  readonly subject: string | null;
};

/** The selector a block with no `files` carries: ESLint applies it to everything it reaches. */
const EVERY_FILE = "**/*";

/**
 * ESLint reads a bare `dist` as the directory and everything under it; fast-glob reads it as one
 * file of that name. The shared base states two of its global ignores that way, and without this
 * the whole of `node_modules/` would be a candidate subject.
 */
function asDirectoryAware(pattern: string): string[] {
  return pattern.endsWith("*") || pattern.endsWith("/") ? [pattern] : [pattern, `${pattern}/**`];
}

/** A block that ignores without selecting is ESLint's global ignore — it reaches every zone. */
function globalIgnoresIn(config: readonly Linter.Config[]): string[] {
  return config
    .flatMap((block) =>
      block.files === undefined && block.ignores !== undefined ? block.ignores : [],
    )
    .flatMap(asDirectoryAware);
}

function ignoresOf(block: Linter.Config): string[] {
  return block.ignores === undefined ? [] : block.ignores.flatMap(asDirectoryAware);
}

function selectorsOf(block: Linter.Config): readonly (string | string[])[] {
  return block.files === undefined ? [EVERY_FILE] : block.files;
}

/** The block's patterns as one string, AND-groups spelled with `&` so they read as one selector. */
function patternsOf(block: Linter.Config): string {
  return selectorsOf(block)
    .map((selector) => (typeof selector === "string" ? selector : selector.join(" & ")))
    .join(", ");
}

/** Every file on disk a block selects, its own ignores and the config's global ones applied. */
function filesSelectedBy(
  block: Linter.Config,
  ignore: readonly string[],
  cwd: string,
): Set<string> {
  const selected = new Set<string>();

  for (const selector of selectorsOf(block)) {
    // A nested array is ESLint's AND: the entry matches a file only if every pattern in it does.
    const [firstPattern, ...alsoRequired] = (
      typeof selector === "string" ? [selector] : selector
    ).map((pattern) => new Set(fg.sync([pattern], { cwd, ignore: [...ignore], onlyFiles: true })));

    if (firstPattern === undefined) {
      throw new Error(
        "a config block selects files with an empty pattern group, which matches nothing",
      );
    }

    for (const file of firstPattern) {
      if (alsoRequired.every((required) => required.has(file))) selected.add(file);
    }
  }

  return selected;
}

/**
 * A file `lintText` can be handed. The fixtures this feeds are ordinary TypeScript, so a `.d.ts`
 * path is excluded — an implementation in an ambient file is not the shape any zone is about.
 */
function isLintableSubject(file: string): boolean {
  return (file.endsWith(".ts") || file.endsWith(".tsx")) && !file.endsWith(".d.ts");
}

/** The block's first owned file — matched by it, and by no later block that declares the rule. */
function fileOwnedBy(
  selected: ReadonlySet<string>,
  laterBlocks: readonly ReadonlySet<string>[],
): string | null {
  const [owned] = [...selected]
    .filter(isLintableSubject)
    .filter((file) => !laterBlocks.some((later) => later.has(file)))
    .sort();

  return owned === undefined ? null : owned;
}

/**
 * Every zone `config` splits `rule` into, in config order, each with a file it owns.
 *
 * `cwd` is the directory the config's patterns are relative to — the directory holding it.
 */
export function lintZonesIn(
  config: readonly Linter.Config[],
  rule: string,
  cwd: string,
): LintZone[] {
  const ignoredEverywhere = globalIgnoresIn(config);
  const declaring = config
    .filter((block) => block.rules?.[rule] !== undefined)
    .map((block) => ({
      block,
      selected: filesSelectedBy(block, [...ignoredEverywhere, ...ignoresOf(block)], cwd),
    }));

  if (declaring.length === 0) {
    throw new Error(`no block in this config declares '${rule}', so there is no zone to measure`);
  }

  return declaring.map(({ block, selected }, index) => ({
    patterns: patternsOf(block),
    subject: fileOwnedBy(
      selected,
      declaring.slice(index + 1).map((later) => later.selected),
    ),
  }));
}

/**
 * The flattened block array a flat config file exports.
 *
 * Parse boundary: a plain-`.js` config has no type of its own, so the shape is declared here —
 * the same route `spec-gates.test.ts` already takes to `packages/eslint-config/base.js`.
 */
export async function flatConfigAt(configPath: string): Promise<Linter.Config[]> {
  const loaded = (await import(pathToFileURL(configPath).href)) as { default?: Linter.Config[] };

  if (loaded.default === undefined) {
    throw new Error(`${configPath} default-exports nothing — a flat config is an array of blocks`);
  }

  return loaded.default;
}
