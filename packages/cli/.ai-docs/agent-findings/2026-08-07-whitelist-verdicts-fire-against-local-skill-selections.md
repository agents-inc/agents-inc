---
type: audit
severity: low
affected_files:
  - src/cli/lib/matrix/matrix-resolver.ts
  - ../matrix/src/read-model/selection-semantics.ts
standards_docs:
  - .ai-docs/reference/features/skills-and-matrix.md
date: 2026-08-07
reporting_agent: general-purpose
category: architecture
domain: cli
root_cause: scope-discipline-deferred
status: resolved
resolved_by: 'The blocking decision was settled by the owner on 2026-08-07 (option 1) and CLI-389 phase C deleted `compatibleWith`, taking the quirk with it: with no whitelist there is no verdict a selection id outside the relationship vocabulary can trigger, and the 50 catalogue skills a lone local selection reported incompatible drop to zero. Pinned by `matrix-resolver.test.ts` → "a selection that excludes nothing" → "rules nothing out for a selection the catalogue declares nothing about", over the shipped catalogue with one local skill merged in. The proposed standard — what an id outside the vocabulary contributes — is stated in `.ai-docs/reference/features/skills-and-matrix.md` → "Selection semantics: possibility, not presence".'
blocked_by: 2026-08-07-requires-closure-cannot-carry-the-whitelist-verdicts.md
---

## What Was Wrong

Discovery made while extracting the shared selection semantics (EDITOR-11
step 2); the behaviour predates the extraction and was carried over verbatim.

The `compatibleWith` whitelist verdict fires when the selection is non-empty
and names none of the skill's declared hosts. A selected **local/custom skill**
is a selection whose id no built-in whitelist can ever name — so the moment a
user's only selection is a local skill, every whitelisted catalogue skill
(Radix, Expo, Pinia, next-intl, …) reports "only compatible with …" in the
wizard grid, even though the user has expressed no framework choice at all.
The check is host-list vs. selection-list; a custom id in the selection is
indistinguishable from a wrong framework.

The editor sidesteps the analogue deliberately: its session-added
(`github:...`) skills are filtered out of the judged selection in `derive.ts`,
on the reasoning that a skill declaring no relationships neither rules anything
out nor is ruled out. The CLI keeps its historical behaviour — this extraction
changed no verdicts on that path, it only made the asymmetry visible.

## Fix Applied

None — discovery only. The shared module isolates every `compatibleWith` read
behind the single `outsideWhitelist` cause so that Phase C of CLI-389, which
deletes the field in favour of richer incompatibility data, removes the quirk
and the seam in one cut. Fixing it separately beforehand would be work Phase C
deletes.

Update 2026-08-07: that deletion is blocked (see `blocked_by`) — the requires
closure it was to hand off to cannot reproduce three of the CLI's pinned
verdicts. This quirk stays live until that decision is settled, and the
measurement there puts its blast radius at 50 catalogue skills reported
incompatible against a lone local selection.

## Proposed Standard

When Phase C replaces `compatibleWith`, the replacement's semantics should
state explicitly what a selection id **outside the catalogue's relationship
vocabulary** contributes to a verdict (proposal: nothing — matching the
editor's treatment of added skills). Candidate home:
`.ai-docs/reference/features/skills-and-matrix.md`, in the selection-semantics
section.
