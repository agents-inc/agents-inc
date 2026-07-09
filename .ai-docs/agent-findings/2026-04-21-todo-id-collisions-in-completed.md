---
type: convention-drift
severity: low
affected_files:
  - todo/TODO-completed.md
standards_docs:
  - .ai-docs/standards/commit-protocol.md
date: 2026-04-21
reporting_agent: orchestrator
category: architecture
domain: infra
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`todo/TODO-completed.md` contains 12 D-ID collisions — each listed ID appears on two distinct rows describing different tasks:

- **D-101** — "Fix Next.js Fullstack stack description" (line 72) vs. "Add compatibleWith groups to default-rules.ts" (line 81)
- **D-166** — "Fix E2E try/finally blocks" (line 31) vs. "Fix E2E try/finally blocks — removed all try/catch/finally app-wide" (line 122)
- **D-167** — "Remove task IDs from describe() blocks in init-wizard" (line 36) vs. "Remove task IDs from describe blocks" (line 131)
- **D-175** — "Bug: Double curlies stripped during compile" (line 34) vs. "Scope-pure project config" (line 113)
- **D-176** — "Sources step: show all skills, global read-only" (line 25) vs. "Migrate CLI_COLORS to hex values only" (line 33)
- **D-177** — "Style skill select: left border only" (line 111) vs. "`uninstall --all` misses re-scoped plugins" (line 123)
- **D-178** — "Make stack the hero of project-level installs" (line 23) vs. "Bug: Scope toggle blocked by excluded tombstones" (line 110)
- **D-179** — "Bug: init in new project ignores global installation" (line 105) [also TODO.md line 30: "Extract shared post-wizard pipeline"]
- **D-180** — "Bug: Project init overwrites global config-types.ts" (line 108) [also TODO.md line 29: "Write BYO skills guide"]
- **D-181** — "Bug: New global skills added during project init not written to global" (line 100) [also TODO.md line 28 + `D-181-yolo-mode-toggle.md`]
- **D-182** — "Sources step: global skills focusable but read-only" (line 24) vs. "Bug: Confirm step diff" (line 109)
- **D-183** — "Propagate global skill changes to all known project configs" (line 106) vs. "Agents step dual-scope badges + S hotkey guard" (line 130)

The collisions cluster in two bands — rows 23–44 (D-165..D-178 era) and rows 100–131 (D-175..D-183 retro-backfill). Hypothesis: the latter batch was retro-filed in bulk from a separate notebook/branch without grepping for already-claimed IDs, and the numbering was re-drawn from a local high-water mark rather than the repo's. Several entries (D-179, D-180, D-181) collide with currently-active rows in `todo/TODO.md`, confirming the backfill never reconciled against the live ID space.

Impact is low — all 12 collisions live in TODO-completed.md (historical), not in active work — but grepping `D-176` in changelogs, commit messages, or agent findings is now ambiguous, and any future reference-by-ID risks resolving to the wrong task.

## Fix Applied

None — discovery only. User decision required on renumbering policy.

## Proposed Standard

1. **Renumber the retro-backfill batch.** The 12 duplicated rows at lines ~100–131 of `todo/TODO-completed.md` should be reassigned to a disjoint range above the current high-water mark (e.g., D-300+) and the originating commits / changelogs cross-referenced. The earlier occurrence (lower line number) keeps the original ID; the later occurrence gets the new one.
2. **Add to `.ai-docs/standards/commit-protocol.md`** a new rule: "Before filing a new `D-NNN`, grep `todo/` and `.ai-docs/agent-findings/` for the highest extant `D-NNN` and increment from there. Do not draw from a local notebook's high-water mark." Place under a new or existing section on ID allocation / task-ticket hygiene.
