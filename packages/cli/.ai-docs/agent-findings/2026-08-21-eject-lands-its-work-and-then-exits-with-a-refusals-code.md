---
type: anti-pattern
severity: low
affected_files:
  - src/cli/commands/eject.ts
  - src/cli/lib/exit-codes.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-21
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: scope-discipline-deferred
status: resolved
resolved_by: >-
  ensureConfig now catches the refusal, reports it through reportIncompleteWork, and the run ends
  on the completed-with-failures account with the eject tick withheld and exit code 5. Verified by
  hand against the built binary and pinned by the eject leg of
  commands/config-unreadable-stops-the-guess, which asserts the ejected template beside the config
  that was correctly not invented. The classification gate moved with the mechanism, as this
  finding required before promotion.
---

## What Was Wrong

The 2026-08-20 ruling gave `edit` a third ending — `EXIT_CODES.COMPLETED_WITH_FAILURES` — on a
stated principle: an `ERROR` aborted so nothing landed and the run can be repeated, while this one
landed and the repeat is the wrong move. `eject` produces that exact shape today and reports it
with the old code.

Measured by hand against the built binary (0.156.1), in a project with no config of its own and an
unreadable global `~/.claude-src/config.ts`:

```
✓ Agent templates ejected to <project>/.claude-src/agents/_templates
You can now customize agent templates locally.
    Error: Failed to load config from '<home>/.claude-src/config.ts': ParseError: ...
```

exit **1**. The templates are on disk and stay there; what failed is `ensureMinimalConfig`, which
runs afterwards and — correctly, under the same ruling — refuses to invent a `config.ts` recording
a marketplace it read out of a file it could not evaluate. So the command did part of its work,
reported the rest as failed, and answered with the code reserved for a run where nothing landed.
`EXIT_CODES.COMPLETED_WITH_FAILURES`'s own docblock names the consequence: _"a spec asserting
`not.toBe(0)` cannot tell a refusal from a partial apply either."_

This is a deferral rather than an oversight — the ruling was scoped to `edit`, the
`incompleteWork` machinery is private to that command's class, and `failure-reporting-
classification.test.ts` rosters `edit.tsx` and `base-command.ts` and nothing else. It is filed so
the scope boundary is a record rather than a silence.

## Fix Applied

Discovery only at filing; the fix landed 2026-08-21 with CLI-607 and CLI-612 in one pass.

`ensureConfig` in `src/cli/commands/eject.ts` wraps `ensureMinimalConfig` and catches its throw,
reports it through `reportIncompleteWork` with the doctor recovery, and the new `reportEnding`
withholds `✓ Eject complete!` before `exitIfWorkIncomplete` prints the account and raises 5. The
refusal itself is untouched and still invents nothing.

**One line moved in the spec, exactly as this finding predicted**, and two assertions were added
beside it: the ejected template is now asserted present, because the whole difference between this
ending and a refusal is that something landed, and the withheld tick is asserted absent. The
prediction held because the spec had been written to pin the state rather than the aspiration.

The mechanism was hoisted to `BaseCommand` rather than copied, which is what the section below
required, and the widened gate is filed as
`2026-08-21-hoisting-a-guarded-mechanism-to-a-base-class-outruns-the-gate-that-guarded-it.md`.

## Proposed Standard

**A command that can complete part of its work needs its ending decided once, at the end, and the
decision does not belong to one command.** `edit` has the mechanism —
`reportIncompleteWork` / `exitIfWorkIncomplete`, a `run()` that is two statements — and it is
private. `init` is named as having the same defect in a worse form by
`2026-08-20-a-reported-failure-that-leaves-the-exit-code-at-zero-is-invisible-to-everything-but-a-reader`;
`eject` is the same defect in the other direction, reporting a partial apply as a refusal rather
than a refusal as a success. Three commands is a `BaseCommand` concern.

Before promoting it, the classification gate has to move with it: the roster in
`failure-reporting-classification.test.ts` is per-file and its whole value is that an unclassified
`this.warn` reddens. A shared `reportIncompleteWork` with a gate that still names only two files
would let the third command's warn sites land unjudged while the mechanism looked adopted — which
is the failure this finding is about, one layer up.

Home for the rule: `.ai-docs/standards/clean-code-standards.md`, beside the existing error-handling
section. Cross-checked against `CLAUDE.md` § Error handling, which names `EXIT_CODES.*` and
`this.handleError` and says nothing about which code a partial apply takes — that is the gap.
