/**
 * Runs `.husky/pre-push` as husky does (`sh -e`) on a PATH holding only `grep` and stand-ins for
 * `git`, `bun` and `bunx`, so no gate really runs: each stand-in records its own command line.
 */
import { spawnSync } from "child_process";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

const PUSH_HOOK = path.resolve(import.meta.dirname, "../../../.husky/pre-push");

/** git refuses the push on any other status. */
const PUSH_ALLOWED = 0;

const HOOK_TIMEOUT_MS = 5_000;

const EXECUTABLE = 0o755;

const DEPS_CHECK = "bun run deps:check";
const CLI_LINT = "bunx turbo run lint --filter=agents-inc";
const WEB_LINT = "bunx turbo run lint --filter=!agents-inc";
const CLI_UNIT = "bunx turbo run test --filter=agents-inc";
const CLI_E2E = "bunx turbo run test:e2e --filter=agents-inc";
const WEB_UNIT = "bunx turbo run test --filter=!agents-inc";
const WEB_E2E = "bunx turbo run test:e2e --filter=!agents-inc";

// One invocation per suite, unit before e2e: the hook's header says why.
const CLI_SIDE = [CLI_LINT, CLI_UNIT, CLI_E2E];
const WEB_SIDE = [WEB_LINT, WEB_UNIT, WEB_E2E];
const BOTH_SIDES = [CLI_LINT, WEB_LINT, CLI_UNIT, CLI_E2E, WEB_UNIT, WEB_E2E];
const EVERY_GATE = [DEPS_CHECK, ...BOTH_SIDES];

/** Records its command line, and fails when that line is the gate a spec names red. */
function recordingStandIn(tool: string): string {
  return `#!/bin/sh\nprintf '%s\\n' "${tool} $*" >> "$GATE_LOG"\n[ "${tool} $*" != "$RED_GATE" ]\n`;
}

/** Answers the hook's two questions: is there a push target, and which files does the push carry. */
const GIT_STAND_IN = [
  "#!/bin/sh",
  'case "$1" in',
  'rev-parse) [ "$PUSH_TARGET" = yes ] ;;',
  "diff) printf '%s\\n' \"$PUSHED_FILES\" ;;",
  "*) exit 2 ;;",
  "esac",
  "",
].join("\n");

function hostCommand(tool: string): string {
  return spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf-8" }).stdout.trim();
}

const HOST_SH = hostCommand("sh");
const HOST_GREP = hostCommand("grep");

type Push = { pushTarget: boolean; pushed: readonly string[]; redGate?: string };

const worlds: string[] = [];

afterEach(async () => {
  await Promise.all(worlds.splice(0).map(cleanupTempDir));
});

async function runHook({ pushTarget, pushed, redGate = "" }: Push) {
  const world = await createTempDir("pre-push-hook-");
  worlds.push(world);

  const bin = path.join(world, "bin");
  mkdirSync(bin);
  symlinkSync(HOST_GREP, path.join(bin, "grep"));
  writeFileSync(path.join(bin, "git"), GIT_STAND_IN, { mode: EXECUTABLE });
  writeFileSync(path.join(bin, "bun"), recordingStandIn("bun"), { mode: EXECUTABLE });
  writeFileSync(path.join(bin, "bunx"), recordingStandIn("bunx"), { mode: EXECUTABLE });

  const gateLog = path.join(world, "gates.log");
  writeFileSync(gateLog, "");

  const run = spawnSync(HOST_SH, ["-e", PUSH_HOOK], {
    cwd: world,
    encoding: "utf-8",
    timeout: HOOK_TIMEOUT_MS,
    env: {
      PATH: bin,
      GATE_LOG: gateLog,
      RED_GATE: redGate,
      PUSH_TARGET: pushTarget ? "yes" : "no",
      PUSHED_FILES: pushed.join("\n"),
    },
  });

  return { status: run.status, gates: readFileSync(gateLog, "utf-8"), stderr: run.stderr };
}

function asLog(gates: readonly string[]): string {
  return gates.map((gate) => `${gate}\n`).join("");
}

const PUSHES = [
  {
    carries: "a branch with no push target",
    runs: "every gate",
    pushTarget: false,
    pushed: [],
    gates: EVERY_GATE,
  },
  {
    carries: "a change to the CLI",
    runs: "the CLI side",
    pushTarget: true,
    pushed: ["packages/cli/src/cli/commands/init.tsx"],
    gates: CLI_SIDE,
  },
  {
    carries: "a change to packages/matrix",
    runs: "both sides",
    pushTarget: true,
    pushed: ["packages/matrix/src/seed.ts"],
    gates: BOTH_SIDES,
  },
  {
    carries: "a change to packages/compile",
    runs: "both sides",
    pushTarget: true,
    pushed: ["packages/compile/src/seed-to-config.ts"],
    gates: BOTH_SIDES,
  },
  {
    carries: "a change to packages/api",
    runs: "both sides",
    pushTarget: true,
    pushed: ["packages/api/src/index.ts"],
    gates: BOTH_SIDES,
  },
  {
    carries: "a change to packages/api-mocks",
    runs: "both sides",
    pushTarget: true,
    pushed: ["packages/api-mocks/src/handlers.ts"],
    gates: BOTH_SIDES,
  },
  {
    carries: "a change to a package the CLI does not bundle",
    runs: "the web side",
    pushTarget: true,
    pushed: ["packages/ui/src/index.ts"],
    gates: WEB_SIDE,
  },
  {
    carries: "a change to an app",
    runs: "the web side",
    pushTarget: true,
    pushed: ["apps/editor/src/main.tsx"],
    gates: WEB_SIDE,
  },
  {
    carries: "a change to the CLI and to an app",
    runs: "both sides",
    pushTarget: true,
    pushed: ["packages/cli/src/cli/commands/init.tsx", "apps/www/astro.config.ts"],
    gates: BOTH_SIDES,
  },
  {
    carries: "a change to the git hooks",
    runs: "both sides",
    pushTarget: true,
    pushed: [".husky/pre-push"],
    gates: BOTH_SIDES,
  },
  {
    carries: "a change to CI",
    runs: "both sides",
    pushTarget: true,
    pushed: [".github/workflows/ci.yml"],
    gates: BOTH_SIDES,
  },
  {
    carries: "a change to the root turbo.json",
    runs: "both sides",
    pushTarget: true,
    pushed: ["turbo.json"],
    gates: BOTH_SIDES,
  },
  {
    carries: "a change to the root package.json",
    runs: "every gate",
    pushTarget: true,
    pushed: ["package.json"],
    gates: EVERY_GATE,
  },
  {
    carries: "a change to bun.lock",
    runs: "every gate",
    pushTarget: true,
    pushed: ["bun.lock"],
    gates: EVERY_GATE,
  },
  {
    carries: "a change to the root tsconfig.json",
    runs: "every gate",
    pushTarget: true,
    pushed: ["tsconfig.json"],
    gates: EVERY_GATE,
  },
  {
    carries: "a change to the CLI's package.json",
    runs: "the dependency check and the CLI side",
    pushTarget: true,
    pushed: ["packages/cli/package.json"],
    gates: [DEPS_CHECK, ...CLI_SIDE],
  },
  {
    carries: "a change to an app's vitest config",
    runs: "the dependency check and the web side",
    pushTarget: true,
    pushed: ["apps/editor/vitest.config.ts"],
    gates: [DEPS_CHECK, ...WEB_SIDE],
  },
  {
    carries: "a change to docs and trackers alone",
    runs: "no gate",
    pushTarget: true,
    pushed: ["docs/architecture.md", "todo/cli.md"],
    gates: [],
  },
];

const RED_SUITES = [
  {
    suite: "the CLI's unit run",
    redGate: CLI_UNIT,
    gates: [DEPS_CHECK, CLI_LINT, WEB_LINT, CLI_UNIT],
  },
  {
    suite: "the CLI's e2e run",
    redGate: CLI_E2E,
    gates: [DEPS_CHECK, CLI_LINT, WEB_LINT, CLI_UNIT, CLI_E2E],
  },
  {
    suite: "the web unit run",
    redGate: WEB_UNIT,
    gates: [DEPS_CHECK, CLI_LINT, WEB_LINT, CLI_UNIT, CLI_E2E, WEB_UNIT],
  },
  {
    suite: "the web e2e run",
    redGate: WEB_E2E,
    gates: EVERY_GATE,
  },
];

describe("the pre-push hook", () => {
  it.each(PUSHES)("lets $carries through after running $runs", async (push) => {
    const run = await runHook(push);

    expect([run.status, run.gates], run.stderr).toStrictEqual([PUSH_ALLOWED, asLog(push.gates)]);
  });

  it.each(RED_SUITES)(
    "refuses the push when $suite fails, and runs no gate after it",
    async ({ redGate, gates }) => {
      const run = await runHook({ pushTarget: false, pushed: [], redGate });

      expect(run.gates, run.stderr).toBe(asLog(gates));
      expect(run.status, "git pushes only when the hook exits zero").toBeGreaterThan(PUSH_ALLOWED);
    },
  );
});
