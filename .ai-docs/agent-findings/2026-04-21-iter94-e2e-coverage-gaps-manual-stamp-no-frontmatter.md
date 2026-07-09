---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/e2e-coverage-gaps.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: general-purpose
category: testing
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: last_validated frontmatter added to DOCUMENTATION_MAP.md, e2e-coverage-gaps.md, and all 9 files in .ai-docs/standards/; finding's mechanical follow-up complete
---

## What Was Wrong

`.ai-docs/e2e-coverage-gaps.md` tracks staleness via a manual line 3 marker (`Last updated: 2026-04-16`) instead of a frontmatter `last_validated:` field. This put it outside any automated sweep that keys on frontmatter stamps — ralph iters 1-93 all skipped it. Content drift confirmed: Init table missed the new `lifecycle/plugin-install-failure-hard-error.e2e.test.ts` (added for D-229) and the Summary counts (152 flows) don't reflect current e2e suite.

Similarly, the top-level `DOCUMENTATION_MAP.md` and every `.ai-docs/standards/*.md` file (10 bibles plus primer + e2e/ subdir) have no frontmatter at all — no stamp-based drift check possible even though iters 65-93 have landed findings against these exact docs.

## Fix Applied

- Bumped `Last updated:` stamp to 2026-04-21.
- Added row for "Plugin install failure hard-error" under Init, pointing at `lifecycle/plugin-install-failure-hard-error`.
- Did NOT recompute Summary counts (would require full e2e suite audit — out of scope for a stamp sweep).

## Proposed Standard

Update `.ai-docs/standards/documentation-bible.md` to require frontmatter `last_validated:` on ALL `.ai-docs/**/*.md` content docs — including top-level files (`DOCUMENTATION_MAP.md`, `e2e-coverage-gaps.md`), every `standards/*.md` bible, and the `standards/e2e/` subdir. Without it, files invisibly age past drift sweeps. Pointer-only files (TEMPLATE.md, README.md in agent-findings) are exempt.

Mechanical follow-up: add frontmatter block with `last_validated: 2026-04-21` to the ~12 standards/top-level files currently missing it.
