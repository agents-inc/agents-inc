---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/commands/compile.test.ts
  - src/cli/lib/__tests__/commands/edit.test.ts
  - src/cli/lib/__tests__/commands/eject.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-09
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The four `--refresh` cases were rewritten while removing the flag (CLI-465). Each now asserts the
  string oclif actually prints, `Nonexistent flag: --refresh`, which makes them rejection guards
  rather than vacuous acceptance ones. The wider class — every other
  `not.toContain("unknown flag")` in the commands suite — is untouched and still vacuous.
---

## What Was Wrong

Four unit tests across three commands claimed to prove a flag was accepted, in this shape:

```ts
const { error } = await runCliCommand(["compile", "--refresh"]);
const output = error?.message || "";
expect(output.toLowerCase()).not.toContain("unknown flag");
```

**oclif never prints "unknown flag".** Its parser rejects an undeclared flag with
`Nonexistent flag: --refresh`. So the assertion holds for every possible outcome: flag accepted,
flag rejected, command crashed for an unrelated reason, or `error` undefined entirely.

`compile` proved it. `compile` has never declared `--refresh` — its `static flags` are
`{...BaseCommand.baseFlags, verbose}` — and both of its `--refresh` tests were green anyway, one of
them named "should accept --refresh flag". A test asserting a command accepts a flag it does not
have, passing, for as long as anyone can tell.

The same shape is used for genuinely-declared flags elsewhere in the commands suite (`--source`,
`-s`, `-o`, `--verbose`). Those tests are equally incapable of failing; they are only accidentally
correct.

## Fix Applied

The four `--refresh` cases were rewritten as part of removing the flag: they now assert
`toContain("Nonexistent flag: --refresh")`, which is the parser's real refusal and fails the moment
any command re-declares the flag. `compile`'s duplicate ("--verbose with --refresh") was deleted
rather than converted — one rejection assertion per command is the whole claim.

The rest of the class is untouched and still vacuous. It is a sweep, not a side effect of this task.

## Proposed Standard

In `.ai-docs/standards/e2e/assertions.md` (§ Negative Assertions), add: **a negative assertion on
tool output must quote the tool's own string.** Before writing `not.toContain(X)` against a parser,
runtime or third-party message, run the failing case once and copy what it actually prints. A
negative built from a paraphrase ("unknown flag", "not found", "invalid") is satisfied by every
outcome including the one it was written to exclude.

The mechanical test: make the assertion's subject true on purpose (pass a flag that really is
undeclared) and confirm the test goes red. All four cases here would have been caught by that in
one run.
