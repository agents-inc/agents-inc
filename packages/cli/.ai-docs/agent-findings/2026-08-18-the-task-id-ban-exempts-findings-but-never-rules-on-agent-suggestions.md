---
type: standard-gap
severity: low
affected_files:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/agent-suggestions/2026-07-30-identity-key-helper-export-exception.md
  - .ai-docs/reference/concepts/tombstone-pattern.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

Rule 3 of `documentation-bible.md` bans task IDs and grants exactly two exemptions: an ID quoted as
a specimen of the rule itself, and anything under `agent-findings/`, "whose filenames and
frontmatter are dated evidence by design". `agent-suggestions/` is not named, in that clause or
anywhere else in the bible — the string does not appear in the file.

That directory is the same class of artefact. `DOCUMENTATION_MAP.md` describes it as forward-looking
proposals, `agent-suggestions/README.md` says entries are referenced by filename, keep their status
in frontmatter, and are never moved once written. It is dated evidence with a lifecycle, exactly
like `agent-findings/`, and it holds four task-ID citations, all inside
`2026-07-30-identity-key-helper-export-exception.md`, where the IDs are the subject: the proposal
argues for the identity-key helper convention _by_ naming the two defects that produced it.

So a sweep of this rule has no ruling to apply there. Fix them and it destroys the argument the
proposal is making; skip them and the census it runs is quietly narrower than the rule it is
enforcing. That is the same shape of error as rule 3's own closing sentence, which names a single
surviving offender — one dangling ID in a `lib/wizard/scope-diff.ts` JSDoc — where a census taken
on 2026-08-18 found 210 citing lines across 89 source files, plus 57 more across 23 documents that
the rule's own exemptions do not cover. A sentence naming the smallest possible worklist reads as
the whole one, so a sweep scoped to it fixes the cited line, greps the cited ID, finds it clean and
reports the class closed.

Two smaller corrections to that census, re-derived this pass from `packages/cli`:

- **The source-side file count is 85, not 89.** The line count of 210 is right. The gap is
  `SHA-256`, which the census regex matches and which is not a task ID — five lines across four
  files that carry no other hit.
- **There are four ID-bearing section headings, not three.** `tombstone-pattern.md` carries two:

  ```
  .ai-docs/reference/features/agent-system.md      ## D-220: Per-Agent Curation Preservation
  .ai-docs/reference/config/scope-split.md         ## The D-220 Delta Pipeline
  .ai-docs/reference/concepts/tombstone-pattern.md ## Dual-Scope Semantics (D-223)
  .ai-docs/reference/concepts/tombstone-pattern.md ### 2. Preservation (D-223)
  ```

  The second is a numbered sub-heading under the first, so whichever way the anchor question is
  settled, that document takes the decision twice.

## Fix Applied

None for the exemption question — that is a ruling, not a correction, and belongs to the owner.

Rule 3's evidence clause is corrected separately: it no longer names a single surviving offender.
It now carries the two greps that re-derive the backlog, states that neither returns empty, notes
that `SHA-256` is the only non-ID token they match, and warns that a `grep -v` pipe filters the
matched text rather than the path. Its census command exempts `agent-findings/` and the bible
itself — precisely what the rule's own prose exempts — so `agent-suggestions/` currently reads as
in scope by omission rather than by decision. That is the state this finding records.

## Proposed Standard

**Name `agent-suggestions/` in rule 3's exemption clause, or rule it in scope explicitly.** One
clause either way. The clause already carries the justification for `agent-findings/` — "dated
evidence by design" — and the sibling directory meets it on the same terms, so the likely answer is
to extend the exemption and add `--exclude-dir=agent-suggestions` to the second census command in
the same edit. What must not survive is the current state, where the directory's status is inferred
from a list that never considered it.

**Settle the heading case in the same clause.** Substituting a behaviour into a heading moves its
anchor, so every in-repo link to that anchor moves with it. Rule 3 should say whether headings are
in scope and, if they are, that the anchor updates are part of the same change — found by
`grep -rn '#<old-anchor-slug>' .ai-docs/` before the heading is touched. Four headings survived
every prose pass over those three documents because nothing told a reader they counted.
