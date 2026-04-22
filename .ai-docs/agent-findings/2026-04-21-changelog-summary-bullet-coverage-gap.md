---
type: convention-drift
severity: low
affected_files:
  - CHANGELOG.md
standards_docs:
  - .ai-docs/standards/commit-protocol.md
date: 2026-04-21
reporting_agent: ralph-audit
category: dry
domain: infra
root_cause: convention-undocumented
status: resolved
resolved_by: Added forward-applying checklist bullet to .ai-docs/standards/commit-protocol.md Release Checklist requiring every `### D-xxx` subheading in `changelogs/{version}.md` to have at least one bullet in the corresponding `CHANGELOG.md` summary block. Mechanically checkable via grep/diff.
---

## What Was Wrong

`CHANGELOG.md` summary for 0.141.0 cites D-231 in the headline parentheses (`(D-228, D-229, D-230, D-231, D-232)`) and `changelogs/0.141.0.md` contains a dedicated `### D-231 — Drop dead version field from config.ts` subheading, but the 3-bullet summary block in `CHANGELOG.md` itself has no bullet for D-231. The three bullets cover D-228, D-229, and the D-230/D-232 pair — D-231 was folded into the parentheses list and the detailed file without its own summary bullet.

`commit-protocol.md` already mandates task-ID coverage in the release-line parentheses (bullet: "Summary references every task ID shipped in the release"), but does not require that every `### D-xxx` subheading in the detailed changelog also receive at least one bullet in the `CHANGELOG.md` summary block. Small "cleanup" tickets like D-231 (dead-field removal) drift into prose without their own line even though they are real shipped work.

Discovered as part of iter 65's release-integrity audit; invariant checking the three surfaces (headline parens ↔ detailed `### D-xxx` subheadings ↔ summary bullets) agree was not previously codified.

## Fix Applied

Added a new bullet to `.ai-docs/standards/commit-protocol.md` Release Checklist (immediately after the existing "Summary references every task ID shipped in the release" bullet) codifying the symmetry invariant across the three surfaces (headline parens ↔ detailed `### D-xxx` subheadings ↔ summary bullets). Cannot retroactively edit 0.141.0 artifacts per protocol — rule applies forward-only to future releases.

## Proposed Standard

Add to `.ai-docs/standards/commit-protocol.md`, Release Checklist section, immediately after the existing "Summary references every task ID shipped in the release" bullet:

> - [ ] Every ticket with a `### D-xxx` subheading in the detailed `changelogs/{version}.md` MUST have at least one corresponding bullet in the `CHANGELOG.md` summary block for that release. Zero tolerance for "cleanup tickets" that get folded into prose without their own bullet — if a ticket earned a detailed subheading, it earned a summary bullet.

Rationale: the three surfaces (headline parens, detailed `### D-xxx`, summary bullets) are the three places a reader looks to reconstruct "what shipped". Asymmetric coverage across them silently drops tickets from the at-a-glance view even when they are fully documented elsewhere. This invariant is mechanically checkable: grep `### D-` in the detailed file, grep `D-xxx` in the corresponding `CHANGELOG.md` block, diff the sets.
