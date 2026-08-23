---
type: standard-gap
severity: medium
affected_files:
  - todo/cli.md
  - packages/cli/src/cli/components/wizard/wizard.tsx
  - packages/cli/src/cli/components/wizard/hotkeys.ts
  - packages/cli/src/cli/utils/messages.ts
  - packages/cli/src/cli/commands/eject.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-21
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

A four-bug brief was dispatched from `todo/cli.md`. **Three of the four rows no longer described
the tree**, and every one of them read, from the row alone, exactly like a live defect.

| Row     | What the row claimed                                                                              | What the tree held                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI-534 | `compile`'s refusal names an `add` command that exits 127; `eject --output` names a false default | Both fixed in `4ad1bab7`, one day before dispatch. The refusal names `init`; the flag description names no default                                                                                                                                                                                                   |
| D-307   | The wizard root `useInput` steals `s` from the add-source text input, behind a feature flag       | The entire surface is gone from `src/`: no `feature-flags.ts`, no `FEATURE_FLAGS`, no `showSettings`/`toggleSettings`, no `HOTKEY_SETTINGS`, no `StepSettings`, no `settings` member of `WizardStep`, no text input anywhere (`TextInput` appears only as a theme entry), and the row's own named repro spec deleted |
| CLI-359 | A template reads fields the model never carries                                                   | Live and reproduced                                                                                                                                                                                                                                                                                                  |
| CLI-367 | A required category never blocks advancement                                                      | Live and reproduced                                                                                                                                                                                                                                                                                                  |

**The two halves fail differently, and the second is the one worth a mechanism.** CLI-534 was
_fixed_ — a row that is merely finished, which any diff of the named file settles in seconds.
D-307 is the harder case: its subject was **withdrawn**, and the row still names five symbols
(`FEATURE_FLAGS.WIZARD_SETTINGS_OVERLAY`, `feature-flags.ts`, `HOTKEY_SETTINGS`, `StepSettings`,
`HOTKEY_SET_ALL_LOCAL`) that no file under `src/` declares. Grepping any one of them answers the
row in one command. Nothing grepped.

**Why this is not just tracker hygiene.** The row's detail block is confident, dated, and cites
line numbers and a repro spec by name — it reads as verified, because it _was_ verified, on
2026-08-02. A reader arriving at it has no signal distinguishing "verified and still true" from
"verified against a tree that no longer exists". The brief built on it asked for a fix to a
keyboard-handling path that cannot be reached, and only a grep for `FEATURE_FLAGS` — which the
brief itself prompted, and which is the only reason this was caught — settled it.

**There is already a checker of exactly this shape, and its domain stops one step short.**
`scripts/check-finding-citations.ts` scans `todo/` and proves every finding cited **by filename**
still exists. It was built for precisely this failure — a tracker naming something that is gone —
and it does not look at the symbol names in the same rows, which are the far more common
citation. `check-enumeration-drift.ts` is the other near-miss: it binds a document's list to a
source symbol, but its registry covers `.ai-docs/` and not `todo/`.

## Fix Applied

None on the tracker — `todo/` is the orchestrator's to edit and sub-agents do not touch it. The
two live rows (CLI-359, CLI-367) were fixed; the findings for those are filed separately. This
records the row-staleness class and what settled each row, so the orchestrator can retire CLI-534
and D-307 against evidence rather than against another agent's summary:

```
grep -rn "FEATURE_FLAGS\|showSettings\|HOTKEY_SETTINGS\|StepSettings" packages/cli/src   # D-307: no hits
grep -n "NO_SKILLS_TO_COMPILE" packages/cli/src/cli/utils/messages.ts                     # CLI-534a: names init
grep -n -A8 "output: Flags.string" packages/cli/src/cli/commands/eject.ts                 # CLI-534b: no default named
```

## Proposed Standard

For `.ai-docs/standards/documentation-bible.md`, beside the citation rule that
`check-finding-citations.ts` already enforces:

**A tracker row that names a source symbol is making a claim about the present tense, and it
should be checkable in one command.** Extend `check-finding-citations.ts` — or add a sibling —
to read backticked identifiers out of `todo/*.md` rows and report those that no file under
`src/`, `e2e/` or `scripts/` declares. The introduction problem is the same one
`2026-08-21-five-specs-covered-a-behaviour-the-coverage-matrix-had-no-row-for` names for its
reverse check, and the same answer applies: census today's misses, roster them as a declared
backlog, and refuse the next one. **A row whose named symbols have all vanished is the strongest
possible signal that its subject was withdrawn, and it costs one grep to notice.**

Second, weaker but cheaper, for the brief-writing habit rather than for a checker: **a brief
built on a row older than the last release should re-derive the row's central claim before
dispatch, and say in the brief that it did.** This brief instead said "verify every claim below
before acting", which worked — but it put the cost on every agent that reads it rather than once
on the author, and an agent that trusted the row would have written a fix for an unreachable
keyboard path and reported success.
