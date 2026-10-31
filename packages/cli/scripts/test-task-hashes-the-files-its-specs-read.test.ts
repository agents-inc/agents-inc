/**
 * Asks turbo itself, through `--dry=json`, which files it hashes into this package's `test` task.
 * A file a spec in that task reads from outside the package, and that turbo does not hash, lets a
 * change to that file alone replay a cached pass wherever the task runs without `--force` — the
 * pre-push hook's own `turbo run test` among them. A workspace this package builds against needs
 * no entry: the `build` edge carries its hash.
 */
import { spawnSync } from "child_process";
import path from "path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { typedKeys } from "../src/cli/utils/typed-object.ts";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

const REPOSITORY_ROOT = path.resolve(PACKAGE_ROOT, "../..");

const TURBO = path.join(REPOSITORY_ROOT, "node_modules/.bin/turbo");

const TEST_TASK = "agents-inc#test";

const DRY_RUN_TIMEOUT_MS = 60_000;

const DryRunSchema = z.object({
  tasks: z.array(z.object({ taskId: z.string(), inputs: z.record(z.string(), z.string()) })),
});

/**
 * The census, by the spec in `scripts/` that reads each file. A file listed here that has since been
 * deleted reads as unhashed: re-run the census rather than adding an input for it.
 */
const READ_OUTSIDE_THE_PACKAGE = [
  { reader: "pre-push-hook.test.ts", files: [".husky/pre-push"] },
  { reader: "pre-commit-hook.test.ts", files: [".husky/pre-commit"] },
  { reader: "generate-compile-package.test.ts", files: [".github/workflows/ci.yml"] },
  {
    reader: "check-shared-tsconfig.test.ts",
    files: [
      "package.json",
      "apps/editor/package.json",
      "apps/editor/tsconfig.json",
      "apps/editor/tsconfig.app.json",
      "apps/editor/tsconfig.node.json",
      "apps/editor/tsconfig.e2e.json",
      "apps/www/package.json",
      "apps/www/tsconfig.json",
      "packages/ui/package.json",
      "packages/ui/tsconfig.json",
    ],
  },
  {
    reader: "check-shared-vitest-config.test.ts",
    files: [
      "package.json",
      "apps/editor/package.json",
      "apps/editor/vitest.config.ts",
      "apps/www/package.json",
      "packages/ui/package.json",
      "packages/ui/vitest.config.ts",
    ],
  },
  {
    reader: "check-shared-eslint-config.test.ts",
    files: [
      "package.json",
      "apps/editor/package.json",
      "apps/editor/eslint.config.js",
      "apps/www/package.json",
      "apps/www/eslint.config.js",
      "packages/ui/package.json",
      "packages/ui/eslint.config.js",
    ],
  },
  {
    reader: "check-vitest-collects-every-test.test.ts",
    files: [
      "package.json",
      "apps/editor/package.json",
      "apps/editor/vitest.config.ts",
      "apps/editor/scripts/spa-fallback-shell.test.ts",
      "apps/editor/src/features/configure/lib/provider.test.ts",
      "apps/server/package.json",
      "apps/server/vitest.config.ts",
      "apps/server/src/auth.test.ts",
      "apps/server/wrangler.jsonc",
      "apps/server/migrations/0000_accounts_and_saved_stacks.sql",
      "packages/ui/package.json",
      "packages/ui/vitest.config.ts",
      "packages/ui/.storybook/main.ts",
      "packages/ui/src/lib/utils.test.ts",
      "packages/vitest-config/node.js",
    ],
  },
  {
    reader: "check-briefing-contract.test.ts",
    files: ["README.md", "docs/architecture.md", "docs/briefing.md", "package.json"],
  },
];

function inputsTurboHashesForTheTestTask(): Set<string> {
  const run = spawnSync(TURBO, ["run", "test", "--filter=agents-inc", "--dry=json"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf-8",
    timeout: DRY_RUN_TIMEOUT_MS,
  });
  if (run.status !== 0) throw new Error(`turbo's dry run exited ${run.status}: ${run.stderr}`);

  const plan = DryRunSchema.parse(JSON.parse(run.stdout));
  const task = plan.tasks.find(({ taskId }) => taskId === TEST_TASK);
  if (task === undefined) throw new Error(`turbo's dry run planned no ${TEST_TASK}`);

  return new Set(typedKeys(task.inputs));
}

/** Planned once: every assertion reads the same plan. */
describe("the CLI's test task, as turbo plans it", () => {
  const hashed = inputsTurboHashesForTheTestTask();

  /** turbo keys an input by its path from the package: `../../.husky/pre-push`, `../ui/package.json`. */
  const unhashed = (repositoryFile: string): boolean =>
    !hashed.has(
      path
        .relative(PACKAGE_ROOT, path.join(REPOSITORY_ROOT, repositoryFile))
        .split(path.sep)
        .join("/"),
    );

  it("hashes the package's own files, and an outside file where an input names one", () => {
    expect(hashed.has("scripts/pre-push-hook.test.ts")).toBe(true);
    expect(
      ["CLAUDE.md", "todo/repo.md"].filter(unhashed),
      "the inputs already declared outside the package must show here, or a red below is this probe's and not the task's",
    ).toStrictEqual([]);
  });

  it.each(READ_OUTSIDE_THE_PACKAGE)(
    "hashes what $reader reads from outside the package",
    ({ files }) => {
      expect(
        files.filter(unhashed),
        "a change to any of these alone leaves the task's hash unchanged, so turbo replays a cached pass instead of running the spec — add them to test.inputs in packages/cli/turbo.json",
      ).toStrictEqual([]);
    },
  );
});
