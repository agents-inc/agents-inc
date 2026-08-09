// There is no root Vitest run in this repository. This file exists to refuse one.
//
// The root had no Vitest config at all until 2026-08-07, so `npx vitest run` here fell back to
// Vitest's own defaults and collected 360 files across four workspaces with none of the setup each
// workspace declares. For packages/cli that was 327 files — 141 unit, 184 PTY-driven e2e — run
// without vitest.setup.ts, which is the file that replaces os.homedir() with a temp directory. The
// suite passed. It just read the developer's real ~/.claude while doing it, and the e2e specs ran
// with none of the globalSetup, fork pool, timeouts or worker cap their own config gives them.
//
// Delegating was tried first and rejected on measurement. `projects: ["packages/*", "apps/*"]` does
// preserve each workspace's setupFiles — a CLI file run through it had homedir isolated — but
// Vitest cannot nest projects, so packages/cli's own three (unit / integration / commands, with the
// includes and the retry that separate them) are discarded with no warning, and the run collected
// 328 CLI files against turbo's 144. A root command that silently runs a suite nobody configured is
// worse than one that refuses, because it looks like it worked.
//
// Nothing below the root is affected: Vitest resolves its config from the directory it runs in and
// never walks up, so `turbo test` — which runs vitest inside each workspace — never loads this file.
// Verified by running one CLI test file both ways.
throw new Error(
  [
    "Vitest has no root run in this repository. Use turbo, which runs each workspace with its own config:",
    "",
    "  bun run test                        every workspace",
    "  bun run test --filter=agents-inc    one workspace",
    "  cd packages/cli && bunx vitest run  one workspace, directly",
    "",
    "A run started at the root loads no workspace setup file. packages/cli/vitest.setup.ts is the",
    "one that isolates os.homedir(); without it the CLI's tests read the real ~/.claude, and its",
    "e2e specs are collected without the config that makes them safe to run.",
  ].join("\n")
)
