---
type: missing-standard
severity: low
affected_files:
  - src/cli/base-command.ts
  - src/cli/commands/init.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-30
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

oclif's `this.exit(code)` and `this.error(...)` both work by throwing. `BaseCommand.handleError`
re-raises whatever it catches through `this.error(getErrorMessage(error))`, so a `this.exit` reached
inside a `try` whose `catch` calls `handleError` prints `Error: EEXIT: <code>` and exits ERROR,
whatever code was asked for. Printing a line after an error meets it directly: `this.error` throws,
so the only way is `this.error(message, { exit: false })`, the line, then `this.exit(code)`.

Met when `init --from` had to print one line after a refused save's error: the write ran inside
`handleInstallation`'s `try { … } catch (error) { this.handleError(error); }`.
`clean-code-standards.md` § 3.2 says to use `handleError` in command catch blocks and says nothing
about an exit thrown through one.

Sample, not a census of call chains:
`grep -rn "this\.exit(" src/cli/commands src/cli/base-command.ts` lists `edit.tsx`
(`confirmSharedConfigOrCancel`), `base-command.ts` (`exitIfWorkIncomplete`), `init.tsx` (two),
`doctor.ts` and `uninstall.tsx` (`cancelUninstall`). Only checked that none sits lexically inside a
`handleError` catch; callers further up were not traced.

## Fix Applied

`init.tsx`: the config write runs before the `try` that wraps compiling; its failure path prints the
error with `{ exit: false }`, logs the line, then throws a `CLIError` carrying the cause and
`EXIT_CODES.ERROR` with `skipOclifErrorHandling: true` (a public field oclif's `handle` honours).
A first cut ended on `this.exit(EXIT_CODES.ERROR)`: the output was right, but seven specs in
`init-from-says-what-it-did.test.ts` read the cause from the thrown error and got `EEXIT: 1`.

## Proposed Standard

`clean-code-standards.md` § 3: "`this.exit` and `this.error` throw. Never reach either inside a `try`
whose `catch` re-raises through `handleError`: it reprints `EEXIT: <code>` as the error. To print a
line after an error, `this.error(message, { exit: false })`, the line, then throw a `CLIError` with
the cause, the exit code and `skipOclifErrorHandling: true`, outside such a `try`." The alternative
is for `handleError` to rethrow an oclif exit untouched, a change to `base-command.ts` that every
command shares. Proposal only; it does not conflict with CLAUDE.md.
