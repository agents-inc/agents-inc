---
type: missing-standard
severity: low
affected_files:
  - apps/www/src/content/docs/docs/reference/commands.md
  - apps/www/src/content/docs/docs/recipes/compile-in-ci.md
  - apps/www/src/content/docs/docs/troubleshooting/common-problems.md
  - apps/www/src/content/docs/docs/recipes/use-a-private-marketplace.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-10-26
reporting_agent: cli-developer
category: dry
domain: infra
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The fourth page now links to the troubleshooting section instead of restating the behaviour. The
  documentation-bible rule is unwritten, and `recipes/compile-in-ci.md` still restates the
  behaviour (correctly qualified today).
---

## What Was Wrong

The user guides described one behaviour, what a later command does with a saved marketplace copy,
on four pages. CLI-939 found it false for a copy saved without an ETag (`classifyCachedCopy` in
`lib/loading/source-fetcher.ts` never asks about such a copy outside `doctor`). Its brief named the
three pages saying every load revalidates the copy, and the lane qualified all three.

The fourth, `recipes/use-a-private-marketplace.md`, phrased the same behaviour differently: "a later
command other than `doctor` that can't reach it falls back to the cached copy and warns rather than
failing". It shares no word with "revalidates", so a search for the brief's wording could not reach
it. Review found it with a vocabulary search, and reproduced it: an unstamped copy, marketplace
closed, `search` exits 0 with no `Could not reach` line.

A census of the four `affected_files` at `57cc8ded`, the commit before this fix: the brief's word
finds three, the behaviour's nouns find all four.

```
git show 57cc8ded:<page> | grep -niE "revalidat"          # commands.md, compile-in-ci.md, common-problems.md
git show 57cc8ded:<page> | grep -niE "cache|falls? back"  # those three and use-a-private-marketplace.md
```

The documentation bible already says a count lives in one document because copies drift
("A Count Lives in Exactly One Document"), and that a sweep reads copy sites rather than grepping
the retired wording ("Changing a Rule Sweeps the Document's Own Copy-Paste Sites"). Both are
written for `.ai-docs/` and for counts or standards. Neither reaches a behavioural claim in the
`apps/www` guides, where readers cannot check the source.

## Fix Applied

`use-a-private-marketplace.md` now names `doctor` and links to
`troubleshooting/common-problems#a-marketplace-that-will-not-load` for what later commands do with
the cached copy, rather than restating it (briefing rule 7: delete a claim rather than rewrite it).
`compile-in-ci.md` keeps its own qualified copy; it was left as it is.

## Proposed Standard

In `documentation-bible.md` -> "The current-state rule reaches the guides in `apps/www`": **a
command's behaviour is described in one section of the guides, and every other page links to that
section rather than restating it.** When a change makes one copy false, find the others by the
behaviour's vocabulary (its message text, its nouns: cache, offline, fall back, unreachable), not
by the false sentence's wording. A copy kept anyway carries a link to the owning section, so the
next sweep can find it from there.

This proposal does not conflict with a `CLAUDE.md` rule. It extends the count rule's reasoning to
behavioural claims. Nothing mechanical holds it: `apps/www/scripts/check-cli-claims.ts` checks
command and flag names only.
