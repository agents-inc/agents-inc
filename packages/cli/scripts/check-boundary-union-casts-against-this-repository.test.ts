import path from "path";

import { describe, expect, it } from "vitest";

import { check } from "./check-boundary-union-casts.js";

/** Existing offenders, keyed by file; repairing one deletes its entry. */
const CLI_BACKLOG: readonly string[] = [
  path.join("src", "cli", "lib", "__tests__", "commands", "eject.test.ts"),
  path.join("src", "cli", "lib", "__tests__", "factories", "category-factories.ts"),
  path.join("src", "cli", "lib", "__tests__", "factories", "skill-factories.ts"),
  path.join("src", "cli", "lib", "__tests__", "mock-data", "mock-matrices.ts"),
  path.join("src", "cli", "lib", "__tests__", "mock-data", "mock-skills.ts"),
  path.join("src", "cli", "lib", "agents", "list-compiled-agents.ts"),
  path.join("src", "cli", "lib", "configuration", "__tests__", "default-categories.test.ts"),
  path.join("src", "cli", "lib", "configuration", "config-merger.test.ts"),
  path.join("src", "cli", "lib", "matrix", "matrix-provider.ts"),
  path.join("src", "cli", "lib", "matrix", "skill-resolution.integration.test.ts"),
  path.join("src", "cli", "lib", "skills", "skill-copier.test.ts"),
  path.join("src", "cli", "lib", "stacks", "stacks-loader.ts"),
];

/** The same for `@workspace/compile`; `seed-to-config.ts` as a parse boundary awaits a ruling. */
const COMPILE_BACKLOG: readonly string[] = [
  path.join("src", "config-types-source.ts"),
  path.join("src", "seed-to-config.ts"),
  path.join("src", "selection.ts"),
];

const REPAIR =
  "a module here is asserting a `string` into a generated union — narrow it through a guard, " +
  "or if it is a real parse boundary add its DIRECTORY to PARSE_BOUNDARIES. Repairing one " +
  "means deleting its entry from the backlog in the same change.";

describe("this repository", () => {
  it(
    "adds no new module in packages/cli casting a boundary string into a generated union",
    { timeout: 120_000 },
    () => {
      const { widening } = check({ packageRoot: path.resolve(import.meta.dirname, "..") });

      expect([...new Set(widening.map((cast) => cast.file))].sort(), REPAIR).toStrictEqual(
        CLI_BACKLOG,
      );
    },
  );

  it(
    "adds no new module in packages/compile casting a boundary string into a generated union",
    { timeout: 120_000 },
    () => {
      const { widening } = check({
        packageRoot: path.resolve(import.meta.dirname, "..", "..", "compile"),
      });

      expect([...new Set(widening.map((cast) => cast.file))].sort(), REPAIR).toStrictEqual(
        COMPILE_BACKLOG,
      );
    },
  );
});
