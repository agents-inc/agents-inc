---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/agent-findings/2026-04-21-propagation-skipped-observability-gap.md
  - src/cli/commands/compile.ts
  - src/cli/commands/uninstall.tsx
standards_docs:
  - .ai-docs/agent-findings/TEMPLATE.md
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-19
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`2026-04-21-propagation-skipped-observability-gap.md` carries `status: partial` and this
`partial_note`:

> standards added (clean-code-standards § 15.6, config-writer § Propagation observability); code
> fix (Option A warn() at writeScopedConfigs call sites) pending

Option A is not pending. It shipped, and it shipped somewhere else. The finding proposed an
always-visible `warn()` when `propagateGlobalChangesToProjects` returns a non-empty `skipped[]`;
`compile.ts` → `reportPropagation` and `uninstall.tsx` → `updateRegisteredProjects` each loop
`report.propagated.skipped` and call `this.warn(registeredProjectUpdateSkipped(skippedPath))`.
`registeredProjectUpdateSkipped` lives in `src/cli/utils/messages.ts` and is always visible — it is
not gated on `--verbose`, which is the whole substance of the gap the note says is open.

The `partial_note` also names a call site that no longer exists. `writeScopedConfigs` is not a
production symbol: `writeScopedFromWizard` replaced it, and the surviving `writeScopedConfigs` is a
local shim inside `local-installer.test.ts` that keeps older specs reading as they did. The name is
so thoroughly gone that `src/cli/lib/__tests__/config-gate-enforcement.test.ts` holds it as the
constant `A_NAME_NOTHING_DECLARES`, the self-test for a guard whose job is catching list rows that
name nothing.

**Why nothing caught it.** Every check over this directory is per-file and structural. The
frontmatter scan asserts the YAML parses. The link-integrity scan asserts the filename-valued keys
resolve. The lifecycle-pairing check asserts `status:` has its partner field. None of them reads a
`partial_note` and asks whether the source still agrees, because a `partial_note` is prose about
code and no scanner can evaluate it. The sibling-comparison rule that would have caught the
adjacent case — a stale finding beside a resolved duplicate over the same symbol — does not fire
either, because there is only one finding here.

That distinction is the point. The known failure mode is "two findings over one defect, one closed
and one not". This is the single-finding form: a lone `partial_note` describing work that landed
under a different task, in a different module, with no second finding anywhere to disagree with it.
It read as an open observability gap for roughly four months.

The staleness compounds because a `partial_note` is the one field a reader takes as current state.
`TEMPLATE.md` already says so — "it is a claim about what is pending _right now_" — and the same
sentence has now been the diagnosis twice.

## Fix Applied

None to the finding's lifecycle fields — the finding is another agent's and a re-status is a
verification pass rather than a citation repair, which is what this pass owned. Two prose citations
inside it were repaired (both named findings on the 2026-08-19 deletion batch) and the surrounding
sentences were corrected to current source, so the file is at least internally consistent about
`normalizeProjectPath`.

## Proposed Standard

**1. A `partial_note` is re-derived when the finding is touched at all, not only when it is
closed.** `.ai-docs/agent-findings/README.md` → "Resolution Model (authoritative)" currently binds
the re-read to the act of resolving. Bind it to the act of EDITING: any pass that opens a finding
for any reason — a citation repair, a rename sweep, a frontmatter fix — re-reads its `partial_note`
against source before it closes the file, and either corrects it or records that it was checked.
The cost is one grep for the symbols the note names; the alternative is what happened here, where a
citation-repair pass was the first thing in four months to read the sentence at all.

**2. Any lifecycle note naming a symbol must name one the tree declares.** A `partial_note`,
`resolved_by:` or `blocked_by:` that pins its claim to a function name is checkable the same way
`config-gate-enforcement.test.ts` checks its guard lists: extract the backticked identifiers and
filter them against the package's exports. A note naming a symbol nothing declares is either stale
or was never right, and both are worth failing on. The census is one command, run from
`packages/cli`:

```
grep -hoE '`[a-zA-Z_][a-zA-Z0-9_]+`' .ai-docs/agent-findings/*.md | tr -d '`' | sort -u
```

This is deliberately weaker than the rule above — it catches renames, not landed fixes — but it is
mechanical, and the case here would have tripped it on `writeScopedConfigs` alone.
