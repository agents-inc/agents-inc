---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/vitest.setup.ts
  - packages/cli/src/cli/lib/__tests__/test-constants.ts
  - packages/cli/src/cli/lib/__tests__/terminal-size-pinned-process-wide.test.tsx
  - packages/cli/src/cli/lib/__tests__/commands/init-from-says-what-it-did.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/list-shows-the-installation.test.ts
  - .husky/pre-commit
  - .github/workflows/ci.yml
standards_docs:
  - packages/cli/.ai-docs/standards/commit-protocol.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: enforcement-gap
status: partial
partial_note: >-
  The specs are now sized by a pinned 80 by 24 terminal (COLUMNS and LINES in vitest.setup.ts).
  No gate runs the unit suite at a terminal width; that half is the proposal below, unwritten.
---

## What Was Wrong

Four specs passed headless and failed at a terminal wider than 80 columns. The owner reported a
terminal run of 8430 of 8434 against 8434 of 8434 headless an hour earlier; the table below
reproduces it.

- `commands/init-from-says-what-it-did.test.ts` › "shows the permission notice to a project that
  grants no permissions" — the bordered box spans the whole width.
- `commands/list-shows-the-installation.test.ts` › the three "at a terminal" inline snapshots — the
  Skills/Agents divider sits at a share of the width.

The product is right: both are meant to follow the terminal. The specs did not control the width
they asserted. Vitest forks its workers with `stdio: "pipe"`, so `process.stdout` has no size in
any spec, and Ink sizes a pipe by asking the `terminal-size` package. That tries stderr (also a
pipe), then `COLUMNS` with `LINES`, then `/dev/tty`, then `tput`, which honours `COLUMNS`. With no
terminal (an agent's shell, CI) no step finds a size and Ink draws at its 80 by 24 default, the
size the expectations were written at. At a terminal, `/dev/tty` answers its real width.

Reproduced from `packages/cli` after a build, with `script -qec "stty cols N rows 40; npx vitest run
…" /dev/null` for a terminal N wide:

| Run                                            | The two files | Whole `packages/cli` suite                           |
| ---------------------------------------------- | ------------- | ---------------------------------------------------- |
| Headless                                       | 47 passed     | 8434 passed                                          |
| `COLUMNS=120`, no terminal                     | 4 failed      | not run                                              |
| Terminal 80 wide                               | 47 passed     | not run                                              |
| Terminal 100 wide                              | 4 failed      | not run                                              |
| Terminal 120 wide                              | 4 failed      | 4 failed, 8430 passed                                |
| Root `bun run test --force`, terminal 120 wide | —             | `agents-inc#test` 4 failed; the other 11 tasks green |

**A census at 120 columns, not a sample:** those four are every spec whose result differed between
the whole package suite (316 files) and the root `bun run test --force` (streamed and turbo's TUI)
at 120 columns and the same runs headless. Widths under 80 were not run.

**Why the gate missed it.** `.husky/pre-commit` (`turbo run lint typecheck test`), CI `check-cli`
(`bun run test --filter=agents-inc`) and every gate an agent runs have no terminal, so each measures
one width, 80 — the only width at which these specs could not fail. Turbo's `test` hash holds no
terminal width either (read from `turbo.json`, not measured), so a pass recorded headless would
replay at any width unless `--force`.

## Fix Applied

`vitest.setup.ts` sets `COLUMNS` and `LINES` to `SPEC_TERMINAL_COLUMNS` and `SPEC_TERMINAL_ROWS` (80
by 24, in `__tests__/test-constants.ts`), which `terminal-size` reads before `/dev/tty`. That is the
setup's existing way with an input a dependency reads from the developer's shell — it already
deletes `CI` and `GITHUB_ACTIONS` because Ink reads them. 80 by 24 is what Ink fell back to
headless, so no expectation moved, and no product code changed.

**Pinning the stream instead was tried and is wrong.** The repository's terminal specs
(`spinner.test.ts`, `prompt-confirm-holds-the-terminal.test.tsx`, `use-measured-height.test.tsx`,
`base-command.test.ts`) assign `process.stdout.columns` and `rows`, and the first version of this
fix did that in the setup. It made the four green at every width and turned four `search.test.ts`
specs red at every width, headless included: `@oclif/table` fits its table to
`process.stdout.columns` and draws its natural width when there is none, and those specs assert the
table a pipe gets. Those terminal specs size a terminal on purpose; these four write to a pipe, and
a pipe has no size.

`terminal-size-pinned-process-wide.test.tsx` names the pin: a box drawn on the piped stdout is 80
wide, and with `COLUMNS` and `LINES` stubbed to 200 by 50 it is 200 wide (the paired case, which
holds that Ink sizes a pipe by those variables at all). With the pin commented out, the
first case and the original four go red at 120 columns; **headless they stay green**, because Ink's
own fallback is also 80. No headless run can see the pin go.

After the fix, the guard and the two files and the whole package suite are green headless, with
`COLUMNS=120`, and at terminals 80, 100, 120 and 200 wide; the root `bun run test --force` is green
at 120, streamed and in turbo's TUI.

## Proposed Standard

**The gate runs the CLI unit suite once at a terminal width other than 80.** In
`commit-protocol.md` › "Gates", and in CI `check-cli`:

```
script -qec "stty cols 120 rows 40; bun run test" /dev/null
```

80 is the one width a headless gate, Ink's fallback and the pin share, so a run there proves nothing
about width — not even that the pin is still in place. The pin covers what Ink measures through
`terminal-size`; anything that opens `/dev/tty` itself, or a child process handed an environment
without these variables, still reads the developer's terminal, and only a run at another width
sees it. Run through turbo, it needs `--force`
or a cold cache. Cross-checked against `CLAUDE.md`: conflicts with nothing; it changes the gate
command itself, so an agent's gate and the repository's stay one command.
