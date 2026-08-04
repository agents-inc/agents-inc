---
type: convention-drift
severity: low
affected_files:
  - /home/vince/.claude/projects/-home-vince-dev-cli/memory/MEMORY.md
standards_docs: []
date: 2026-04-21
reporting_agent: general-purpose
category: architecture
domain: shared
root_cause: convention-undocumented
status: open
resolved_by: MEMORY.md is user-owned (outside repo); discovery-only finding. Grooming action and "verbose-light one-liners with pointers" rule candidate awaiting user decision.
---

## What Was Wrong

`MEMORY.md` (user auto-memory, not in repo) carries phase-completion entries from
2026-02-07 through 2026-02-12 (Type Consolidation, Web Extras Domain Split,
Multi-Source UX 2.0 phases 1-6, Union Types, Type Narrowing Phase 2, Zod, Remeda).
Since 2026-02-12 roughly **40+ D-NNN tasks** have landed (D-165 .. D-235 range,
including D-217 per-skill plugin skill reference format, D-228 project-branch
config-types writer routing, D-229 plugin-install orphan hard-error, D-231 dead
`version` field removal, D-230/D-232 tombstone-aware diff baseline). None of
these are reflected.

Concrete staleness:

- Multi-Source UX 2.0 entry references `docs/ux-2.0-multi-source-implementation.md` — file no longer exists (grep hits only `changelogs/0.31.0.md`).
- "84 test files, 1634 tests passing" — numbers are ~2 months old; current suite is substantially larger.
- `__tests__/helpers.ts` paths differ from current CLAUDE.md (`__tests__/factories/` + `__tests__/helpers/`).
- "Pre-existing unused var: `selectedDomains` in step-build.tsx" — unverified, low signal.
- No mention of D-216 scope propagation, D-220 stack curation, D-223/D-224/D-225 tombstone/scope-indicator work, D-217 source field, D-228 writer selection, D-231 version removal.

## Fix Applied

None — discovery only. User explicitly said "DO NOT add new memories without
strong signal" this iteration. Reporting drift for the user to decide whether
to groom MEMORY.md.

## Proposed Standard

Phase-completion memories should be **archived** once >4 weeks old and there is
no live decision-surface depending on them. Suggested grooming action next
memory-maintenance iteration:

1. Collapse six stale phase entries (Type Consolidation, Web Extras, Multi-Source
   UX 2.0 phases, Union Types, Type Narrowing 2, Zod, Remeda) into a single
   one-liner pointer (e.g. "Feb 2026 refactor wave — see git log") OR drop them.
2. Delete the broken `docs/ux-2.0-multi-source-implementation.md` reference.
3. Remove stale test counts ("1634 tests passing", etc.) — they rot within days.
4. If worth capturing, add one one-liner for the D-216..D-232 scope/tombstone
   cluster rather than per-task entries.

Rule candidate: memory entries should be **verbose-light one-liners with
pointers**, not phase reports. Phase reports belong in changelogs / TODO-
completed.md which are version-controlled and don't rot silently.

## Docs Slice Audit — 2026-04-21

No docs-only slice is landable in-repo. `MEMORY.md` lives at
`/home/vince/.claude/projects/-home-vince-dev-cli/memory/MEMORY.md`
— user-owned, outside the git tree. Grooming the stale phase entries
and codifying the "verbose-light one-liners with pointers" rule both
require the user's decision on their own memory file. Finding stays
`open` pending that decision.
