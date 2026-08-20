---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/agent-findings/2026-07-29-qa-sweep-working-tree-v0144.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/agent-findings/TEMPLATE.md
date: 2026-08-01
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

The 2026-07-30 regeneration ran the findings directory's first link-integrity scan and found seven
defects. Its remedy, written into Pattern U as item (a), names the keys the scan should cover:

> target existence plus mirrored pairing for `supersedes:` / `superseded_by:`, target existence for
> `blocked_by:`

Three keys. Those are the three the author had in mind, and they are the three the scan now covers.

**But `related:` and `standards_docs:` also name finding files, and nothing checks them.** Running
the same one-line existence check over those two keys on 2026-08-01 found **four dangling targets**
the mandated scan is structurally unable to see:

| Dangling target                                        | Named by                                          | Key              |
| ------------------------------------------------------ | ------------------------------------------------- | ---------------- |
| `2026-04-20-new-agent-toggle-defaults-global-scope.md` | a findings-frontmatter audit since deleted itself | `standards_docs` |
| `2026-04-13-e2e-anti-pattern-audit-d168.md`            | a keypress-coverage finding since deleted itself  | `related`        |
| `2026-04-14-missing-home-isolation-in-unit-tests.md`   | an e2e-helper-home finding since deleted itself   | `related`        |
| `2026-04-14-unit-test-home-isolation.md`               | an e2e-helper-home finding since deleted itself   | `related`        |

Three of the four point into the 2026-03-21..2026-04-16 window that a batch deletion removed from
disk, so they have the same cause as the two dangling targets the 2026-07-30 pass repaired. The
first is the _same file_ that pass already identified as deleted — it just also happened to be
referenced from a fourth key nobody was looking at.

**This is a Pattern U instance about the Pattern U remedy.** Pattern U's own statement is "the
self-audit is structurally incapable of detecting the defect class it is aimed at". A link check
scoped to three of the five keys that carry links cannot report on the other two, and its PASS
result reads as "the directory's links are sound".

### Two further path defects in the same scan

Neither is a dangling _finding_ link, but both surfaced from the same widened check and both are
real:

1. **`scratchpad/d226-porting-recipe.md` does not exist**, and is named in the `standards_docs:` of
   the D-226 porting findings. A scratchpad path is not a durable reference target: the directory is
   session-scoped and untracked, so the link cannot resolve for any later reader. Grep the directory
   for `scratchpad/` to see the current set.

2. **Findings carry machine-specific absolute paths beginning `/home/vince/`** — a
   recursive grep for that prefix over `.ai-docs/agent-findings/` still returns several, among them
   `2026-07-29-qa-sweep-working-tree-v0144.md`. `CLAUDE.md` states: _"NEVER put machine-specific
   absolute paths in any file tracked by git."_ These are tracked files, and the set is larger
   than the three this scan first named — two of which have since been deleted for other reasons,
   which is not a repair.

## Fix Applied

None to the findings themselves — this pass owns `reference/findings-impact-report.md` and
`DOCUMENTATION_MAP.md` only, and the repairs belong in `agent-findings/` (convention-keeper) and in
the individual finding files.

Recorded in `reference/findings-impact-report.md` under a new "Link-integrity scope gap" section,
in the "Cross-surface defects reported, not fixed" table, and as Priority Action 24.

## Proposed Standard

**`standards/documentation-bible.md` → Pattern U remedy (a), and the "Agent Findings Frontmatter"
pre-processing scan:** widen the link-integrity check from three keys to **every frontmatter key
whose values are filenames**. Concretely, target-existence must be checked on `supersedes:`,
`superseded_by:`, `blocked_by:`, **`related:`** and **`standards_docs:`**. Mirrored-pairing stays
scoped to `supersedes:` / `superseded_by:`, which are the only paired keys.

State the rule by _property_ rather than by enumeration, so it does not need re-widening when a key
is added: **any frontmatter value that is a path must resolve on disk.** An enumeration of keys is
the same shape of artefact as an enumeration of members — it goes stale the moment the set grows,
and it reads as exhaustive while being short. `STEP_TEXT` in `e2e/pages/constants.ts` is the worked
case: a doc recorded it as "all 72 members" the day after a from-source recount, while the constant
on disk carried 74 — the two it missed were internal harness sentinels introduced alongside product
fixes, so they appear in no changelog and extension could never have found them. The same applies to
the checker's own scope list.

**`agent-findings/TEMPLATE.md`:** add to the cross-link requirements (rule 3a, which currently says
"The target file must exist on disk" for `supersedes:` / `superseded_by:` / `blocked_by:`) that the
same requirement binds on `related:` and `standards_docs:`, and that neither may name a path under
`scratchpad/` or any absolute path.

**`CLAUDE.md`:** the machine-specific-absolute-path rule already exists and was violated three
times in `agent-findings/`. It needs no new wording — it needs the frontmatter scan to check for a
leading `/`, which is a one-line addition to the same pass.
