---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/DOCUMENTATION_MAP.md
  - .ai-docs/standards/prompt-bible.md
  - .ai-docs/standards/loop-prompts-bible.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: main-thread
category: dry
domain: shared
root_cause: rule-not-specific-enough
status: resolved
resolution_note: Both parts of the proposed standard have landed. (1) DOCUMENTATION_MAP.md Standards table carries the "Scope disambiguator" column, populated for both bibles. (2) Word-cap drift reconciled: prompt-bible.md §8.3 now uses "250-300 words" and links to loop-prompts-bible.md §8.4 as the single source of truth for report-length caps and iteration cadence. Verified 2026-04-21.
---

## What Was Wrong

Ralph iter 71 cross-checked `prompt-bible.md` and `loop-prompts-bible.md` indexing in `DOCUMENTATION_MAP.md`.

Both bibles were indexed but without disambiguation. Their names (`prompt-bible` / `loop-prompts-bible`) suggest overlap, and both contain a "Section 8" covering Ralph-loop delegation. Without a scope label in the map, a reader lands on the wrong file when asking "what does our prompt standard say about loop reports?".

Cross-bible Section 8 comparison also surfaced a minor drift:

- `prompt-bible.md` §8.3 caps per-iter reports at **"under 250 words"**.
- `loop-prompts-bible.md` §8.4 caps them at **"250-300 words"**.

Same structure `(a) coverage (b) additions (c) findings (d) next-iter suggestion` in both — structure is aligned, word cap is not.

## Fix Applied

1. Added a `Scope disambiguator` column to the Standards table in `DOCUMENTATION_MAP.md`.
2. Filled it for both bibles:
   - `prompt-bible` -> "XML tags, delegation prompt shape, per-delegation boilerplate — **what to say**"
   - `loop-prompts-bible` -> "Ralph-loop iter discipline, completion promise, synthesis passes — **when/how often**"
3. Bumped `Last Audited` on both to 2026-04-21.

Word-cap drift is documented here but not fixed in the bibles — fix is a future iter for codex-keeper.

## Proposed Standard

1. `DOCUMENTATION_MAP.md` Standards table: any two docs whose names could be confused (shared prefix, shared section numbers) **must** carry a scope-disambiguator cell. Enforce on next documentation-bible audit.
2. `loop-prompts-bible.md` §8.4 and `prompt-bible.md` §8.3 must agree on the per-iter report word cap. Recommend canonicalizing to **"250-300 words"** in both, and having `prompt-bible.md` §8.3 link out to `loop-prompts-bible.md` §8.4 as the single source of truth for iter-report cadence. Delegate the edit to `codex-keeper` with scope `.ai-docs/standards/{prompt-bible.md,loop-prompts-bible.md}` only.
