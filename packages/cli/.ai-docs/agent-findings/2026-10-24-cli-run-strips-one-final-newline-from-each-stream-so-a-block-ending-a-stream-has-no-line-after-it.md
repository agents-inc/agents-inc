---
type: missing-standard
severity: low
affected_files:
  - packages/cli/e2e/fixtures/cli.ts
  - packages/cli/e2e/helpers/test-utils.ts
  - packages/cli/e2e/commands/old-claude-src-folder-is-named-as-ignored.e2e.test.ts
  - packages/cli/CLAUDE.md
standards_docs:
  - packages/cli/CLAUDE.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-10-24
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`packages/cli/CLAUDE.md` (Test Assertions) says a `toContain` that pins a block ends on the line
after the block: `[...lines, "", ""]` or `[...lines, "<next line>"]`, never `[...lines, ""]`
alone. The rule assumes the captured text keeps every newline the CLI wrote. The two E2E runners
that capture the CLI, `CLI.run` in `e2e/fixtures/cli.ts` and `runCLI` in
`e2e/helpers/test-utils.ts`, do not. Both call `execa` without setting `stripFinalNewline`, which
defaults to `true`, so each stream loses its last newline. A block that is the last thing on a
stream has no line after it, and `[...lines, ""].join("\n")` cannot match it.

A second effect follows from the same strip. `CLI.run`'s `output` is `stdout + stderr`, and
`runCLI`'s `combined` is the same join. Both glue stdout's last line onto stderr's first line, with
no newline between them.

Reproduction, 2026-10-24, run with `node` from `packages/cli` so that `execa` 9.6.1 resolves:

```js
const r = await execa(
  "node",
  ["-e", "process.stdout.write('out line\\n'); process.stderr.write('err line\\n')"],
  { reject: false },
);
// {"stdout":"out line","stderr":"err line","joined":"out lineerr line"}
```

How it showed up: the CLI-931 rework's notice is printed on stderr, and most commands write
nothing else to stderr. So the notice's lines are the whole of stderr, and the last one is not
followed by a newline. The tester had to build the expected stream as
`[...lines, ...restOfStderr].join("\n")`, with `restOfStderr` empty when the run's own stderr is
empty, and pin it with `toBe`. A later author meeting the same red with `toContain` has an easy
"fix": drop the trailing `""`. That is the weak form the CLAUDE.md rule forbids.

Census, 2026-10-24: `grep -rn -E '""\]' e2e --include='*.e2e.test.ts'` finds no spec ending a
joined block on an empty string, so no live assertion is wrong today. The hazard is the next one.

## Fix Applied

None. This is a discovery only. The specs that hit it already pin the whole stream with `toBe`.

## Proposed Standard

Add one sentence to the "line after the block" rule in `packages/cli/CLAUDE.md`: a `CLI.run` or
`runCLI` stream has its final newline stripped, so a block that ends a stream has no line after it.
Pin such a block with `toBe` on the whole stream, built from the lines the run should print. Never
drop the trailing `""` to make a `toContain` match. Also add that `output` and `combined` join
stdout's last line to stderr's first line with no newline, so a block that crosses from one stream
to the other cannot be pinned on them.

Alternative weighed and not proposed: set `stripFinalNewline: false` in both runners. That would
keep the captured streams byte-exact, and the rule would hold as written. But it changes the value
of every exact stdout or stderr comparison in the suite at once, so the owner or the e2e standards
should rule on it first. This proposal does not conflict with any NEVER/ALWAYS rule. It narrows
how one rule is applied and does not change what the rule requires.
