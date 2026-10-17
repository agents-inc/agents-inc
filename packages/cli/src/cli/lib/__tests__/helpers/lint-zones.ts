/**
 * Derives the zones a flat ESLint config splits one rule into. Rule options are not merged across
 * blocks, so each declaring block is a zone, with a subject file no later declaring block matches
 * (`null` when it owns none — the caller's to fail on).
 */
import { pathToFileURL } from "node:url";

import type { Linter } from "eslint";
import fg from "fast-glob";

export type LintZone = {
  readonly patterns: string;
  readonly subject: string | null;
};

const EVERY_FILE = "**/*";

// ESLint reads a bare `dist` as a directory; fast-glob reads it as one file.
function asDirectoryAware(pattern: string): string[] {
  return pattern.endsWith("*") || pattern.endsWith("/") ? [pattern] : [pattern, `${pattern}/**`];
}

/** A block with `ignores` and no `files` is ESLint's global ignore. */
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

function patternsOf(block: Linter.Config): string {
  return selectorsOf(block)
    .map((selector) => (typeof selector === "string" ? selector : selector.join(" & ")))
    .join(", ");
}

function filesSelectedBy(
  block: Linter.Config,
  ignore: readonly string[],
  cwd: string,
): Set<string> {
  const selected = new Set<string>();

  for (const selector of selectorsOf(block)) {
    // A nested array is ESLint's AND.
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

function isLintableSubject(file: string): boolean {
  return (file.endsWith(".ts") || file.endsWith(".tsx")) && !file.endsWith(".d.ts");
}

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

/** `cwd` is the directory holding the config. */
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

/** Parse boundary: a plain-`.js` config has no type, so the cast declares its shape. */
export async function flatConfigAt(configPath: string): Promise<Linter.Config[]> {
  const loaded = (await import(pathToFileURL(configPath).href)) as { default?: Linter.Config[] };

  if (loaded.default === undefined) {
    throw new Error(`${configPath} default-exports nothing — a flat config is an array of blocks`);
  }

  return loaded.default;
}
