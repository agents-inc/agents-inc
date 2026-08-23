---
type: standard-gap
severity: medium
affected_files:
  - todo/plans/brief-accuracy-rules.md
  - todo/plans/orchestration-accuracy-investigation.md
  - packages/cli/src/cli/lib/matrix/skill-resolution.ts
standards_docs:
  - .ai-docs/standards/briefing.md
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-21
reporting_agent: general-purpose
category: architecture
domain: infra
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  Written into `.ai-docs/standards/briefing.md` rule 3 as the two-sided rule — a name that resolves
  is not a claim that survived, a name that resolves to nothing is not automatically drift — with
  the truncated-listing hazard named beside it. The evidence row that produced it was corrected in
  `todo/plans/brief-accuracy-rules.md`.
---

## What Was Wrong

Two documents recording the brief-accuracy evidence presented `resolveSlugsOrSkip` as a symbol that
had died and been replaced by `resolveEveryNeed`. **The symbol is alive**: it is declared and called
in `src/cli/lib/matrix/skill-resolution.ts` today.

```
grep -rIn -c "resolveSlugsOrSkip" packages/cli/src packages/cli/e2e packages/cli/scripts
```

The correction the row recorded was nevertheless right, which is the whole of the finding. The claim
being corrected was about a **call**: that a rule's `needs` are resolved slug-by-slug and the
unresolved ones skipped. That call moved — `resolveEveryNeed` calls the same helper for the needs and
then answers `null` unless every slug resolved, so the needs are now taken whole or not at all, a
_stronger_ guarantee — and `resolveSlugsOrSkip` survives underneath it, still resolving the other
rule kinds slug-by-slug. So:

- **checking the NAME would have refuted a correct correction** — the name is there, so the row
  "must" be stale;
- **and checking only the name is the check the existing rule prescribes.**
  `documentation-bible.md` -> "A Name in a Document Is a Claim About Source" runs a
  `grep -rnw '<symbol>' src e2e scripts` per identifier and calls zero hits a hard error. That is
  the right check for the question it asks (does this identifier exist?) and it is silent on the
  question the claim actually made (does this call still happen here?).

**The second half surfaced while verifying the first, and is the cheaper mistake.** The census that
nearly reported `resolveSlugsOrSkip` as dead was

```
grep -rIl --exclude-dir=node_modules --exclude-dir=.git -- "$s" . | head -6
```

— a listing truncated to six entries, read as though it were the population. The source file sorted
seventh. Nothing about the output says it is partial; `head` is the habit that keeps a survey
readable and it converts an absence-of-hits into a claim.

The inverse error sits in the same rule and is already documented one layer away: a name that
resolves to nothing is not automatically drift, because this codebase's house style explains what was
REMOVED. `reference/testing/factories.md` names `outdatedForkMetadata` precisely to say the carve-out
went, and `todo/cli.md` -> CLI-581 is the ruling that a backtick is not a promise to resolve.

## Fix Applied

`.ai-docs/standards/briefing.md` rule 3 states it as one rule with both sides — the check is the CALL
rather than the name, an absence is never judged from a truncated listing, and zero hits is a lead
rather than a verdict. The two plan files were corrected: `brief-accuracy-rules.md` now carries a
row-by-row verification table of its own symbol evidence, in which this row is the one that was
wrong.

**Residue, in a file this lane does not own.** `reference/testing/infrastructure.md` -> "Repository
Checks" introduces its table with _"The roster is the spec list, and the table below names all of
it"_ over `ls scripts/*.test.ts`. `scripts/check-briefing-contract.test.ts` landed in this pass and
that table does not name it, so the claim is now short by one. No checker binds that table — there is
no `check-enumeration-drift.ts` row for `reference/testing/infrastructure.md` — so nothing reddens;
it needs a row added by whoever owns that document:

| `check-briefing-contract.ts` | Every standard is named by `DOCUMENTATION_MAP.md`, both `CLAUDE.md` files link `standards/briefing.md`, and neither points an agent at a path that is not on disk |

## Proposed Standard

Adopted rather than proposed — it is `standards/briefing.md` rule 3, and the wording deliberately
does not touch `documentation-bible.md`'s identifier check, which is correct for its own question.

The part still worth someone's decision is **the enumeration registry's blind spot**, because it is
the same shape one level up: `check-enumeration-drift.ts` binds a document's list to a SYMBOL or to a
directory listing, so a table whose subject is "every file in `scripts/` matching a glob" can be
registered — the command is already written above the table — while a claim about a CALL SITE cannot
be registered at all. That is not an argument for widening the registry; it is the reason rule 3 is a
discipline rather than a row.
