/**
 * Runs `.husky/pre-commit` as husky does (`sh -e`) on a PATH holding only `grep` and stand-ins for
 * `git`, `bun` and `bunx`, so no step really runs: each stand-in records its own command line.
 */
import { spawnSync } from "child_process";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

const COMMIT_HOOK = path.resolve(import.meta.dirname, "../../../.husky/pre-commit");

/** git refuses the commit on any other status. */
const COMMIT_ALLOWED = 0;

const HOOK_TIMEOUT_MS = 5_000;

const EXECUTABLE = 0o755;

const LINT_STAGED = "bunx lint-staged";
const DEPS_CHECK = "bun run deps:check";
const CHANGED_PACKAGES_CHECKS = "bunx turbo run lint typecheck test --filter=...[HEAD]";
const MIGRATION_CHECK = "bunx turbo run db:generate:check --filter=...[HEAD]";

const WITHOUT_DEPS_CHECK = [LINT_STAGED, CHANGED_PACKAGES_CHECKS, MIGRATION_CHECK];
const EVERY_STEP = [LINT_STAGED, DEPS_CHECK, CHANGED_PACKAGES_CHECKS, MIGRATION_CHECK];

/** Records its command line, and fails when that line is the step a spec names red. */
function recordingStandIn(tool: string): string {
  return `#!/bin/sh\nprintf '%s\\n' "${tool} $*" >> "$GATE_LOG"\n[ "${tool} $*" != "$RED_GATE" ]\n`;
}

/** Answers only the staged file list, so the hook reading any other diff fails. */
const GIT_STAND_IN = [
  "#!/bin/sh",
  'case "$*" in',
  "'diff --cached --name-only --no-renames') printf '%s\\n' \"$STAGED_FILES\" ;;",
  "*) exit 2 ;;",
  "esac",
  "",
].join("\n");

function hostCommand(tool: string): string {
  return spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf-8" }).stdout.trim();
}

const HOST_SH = hostCommand("sh");
const HOST_GREP = hostCommand("grep");

type Commit = { staged: readonly string[]; redGate?: string };

const worlds: string[] = [];

afterEach(async () => {
  await Promise.all(worlds.splice(0).map(cleanupTempDir));
});

async function runHook({ staged, redGate = "" }: Commit) {
  const world = await createTempDir("pre-commit-hook-");
  worlds.push(world);

  const bin = path.join(world, "bin");
  mkdirSync(bin);
  symlinkSync(HOST_GREP, path.join(bin, "grep"));
  writeFileSync(path.join(bin, "git"), GIT_STAND_IN, { mode: EXECUTABLE });
  writeFileSync(path.join(bin, "bun"), recordingStandIn("bun"), { mode: EXECUTABLE });
  writeFileSync(path.join(bin, "bunx"), recordingStandIn("bunx"), { mode: EXECUTABLE });

  const gateLog = path.join(world, "gates.log");
  writeFileSync(gateLog, "");

  const run = spawnSync(HOST_SH, ["-e", COMMIT_HOOK], {
    cwd: world,
    encoding: "utf-8",
    timeout: HOOK_TIMEOUT_MS,
    env: {
      PATH: bin,
      GATE_LOG: gateLog,
      RED_GATE: redGate,
      STAGED_FILES: staged.join("\n"),
    },
  });

  return { status: run.status, gates: readFileSync(gateLog, "utf-8"), stderr: run.stderr };
}

function asLog(gates: readonly string[]): string {
  return gates.map((gate) => `${gate}\n`).join("");
}

const A_CLI_TEST = "packages/cli/src/cli/lib/source-validator.test.ts";

const COMMITS = [
  {
    stages: "a source file in the CLI",
    runs: "every step but the dependency check",
    staged: ["packages/cli/src/cli/lib/source-validator.ts"],
    gates: WITHOUT_DEPS_CHECK,
  },
  {
    stages: "a snapshot written beside a test",
    runs: "every step but the dependency check",
    staged: ["packages/cli/src/cli/lib/__snapshots__/source-validator.test.ts.snap"],
    gates: WITHOUT_DEPS_CHECK,
  },
  {
    stages: "docs and trackers alone",
    runs: "every step but the dependency check",
    staged: ["docs/architecture.md", "todo/cli.md"],
    gates: WITHOUT_DEPS_CHECK,
  },
  {
    stages: "a test file in the CLI",
    runs: "every step",
    staged: [A_CLI_TEST],
    gates: EVERY_STEP,
  },
  {
    stages: "a component test in an app",
    runs: "every step",
    staged: ["apps/editor/src/features/configure/components/skill-cell.test.tsx"],
    gates: EVERY_STEP,
  },
  {
    stages: "a source file and its test",
    runs: "every step",
    staged: ["packages/cli/src/cli/lib/source-validator.ts", A_CLI_TEST],
    gates: EVERY_STEP,
  },
  {
    stages: "the root package.json",
    runs: "every step",
    staged: ["package.json"],
    gates: EVERY_STEP,
  },
  {
    stages: "the CLI's package.json",
    runs: "every step",
    staged: ["packages/cli/package.json"],
    gates: EVERY_STEP,
  },
  {
    stages: "bun.lock",
    runs: "every step",
    staged: ["bun.lock"],
    gates: EVERY_STEP,
  },
  {
    stages: "an app's tsconfig",
    runs: "every step",
    staged: ["apps/editor/tsconfig.app.json"],
    gates: EVERY_STEP,
  },
  {
    stages: "an app's vitest config",
    runs: "every step",
    staged: ["apps/editor/vitest.config.ts"],
    gates: EVERY_STEP,
  },
  {
    stages: "an app's eslint config",
    runs: "every step",
    staged: ["apps/www/eslint.config.js"],
    gates: EVERY_STEP,
  },
];

const RED_STEPS = [
  { step: "lint-staged", redGate: LINT_STAGED, gates: [LINT_STAGED] },
  { step: "the dependency check", redGate: DEPS_CHECK, gates: [LINT_STAGED, DEPS_CHECK] },
  {
    step: "lint, typecheck or test on the changed packages",
    redGate: CHANGED_PACKAGES_CHECKS,
    gates: [LINT_STAGED, DEPS_CHECK, CHANGED_PACKAGES_CHECKS],
  },
  { step: "the migration check", redGate: MIGRATION_CHECK, gates: EVERY_STEP },
];

describe("the pre-commit hook", () => {
  it.each(COMMITS)("lets a commit staging $stages through after running $runs", async (commit) => {
    const run = await runHook(commit);

    expect([run.status, run.gates], run.stderr).toStrictEqual([
      COMMIT_ALLOWED,
      asLog(commit.gates),
    ]);
  });

  it.each(RED_STEPS)(
    "refuses the commit when $step fails, and runs no step after it",
    async ({ redGate, gates }) => {
      const run = await runHook({ staged: [A_CLI_TEST], redGate });

      expect(run.gates, run.stderr).toBe(asLog(gates));
      expect(run.status, "git commits only when the hook exits zero").toBeGreaterThan(
        COMMIT_ALLOWED,
      );
    },
  );
});
