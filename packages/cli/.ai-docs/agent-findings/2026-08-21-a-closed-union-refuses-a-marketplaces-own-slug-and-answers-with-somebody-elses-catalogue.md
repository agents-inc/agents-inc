---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/schemas.ts
  - src/cli/lib/source-validator.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-21
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Two of the three halves the body describes have landed since it was written; the third has not,
  and is what this note now names. The rules-side message landed as `unknownSkillSlugRefusal`. The
  metadata half the body records as deliberately deferred has landed too —
  `metadataValidationSchema` builds its refusal through `unknownMetadataSlugRefusal`, which names
  the slug the author wrote instead of the union and says that a skill outside the catalogue's
  vocabulary is carried by declaring itself not from it, the way out
  `customMetadataValidationSchema` already provided and no refusal had mentioned. The question the
  body defers to is answered: the owner ruled on 2026-08-22 that the union stays closed and that
  declaration is the documented mechanism. PENDING, and unchanged: `matrixLoadFailure` still names
  one hardcoded categories file for every load failure that is not a refused marketplace name, so
  an author whose rules file will not parse is still sent to open a file that is fine. Its two
  outcomes are now described in the skills-and-matrix reference, so the documentation half of that
  proposal has landed and the behaviour half has not; and the other Proposed Standard — that a
  refusal built from a closed union owes the reader the value they wrote — is not written into the
  clean-code standards.
---

## What Was Wrong

`config/skill-rules.ts` names skills by SLUG, and `skillRefInRules` in `src/cli/lib/schemas.ts` was
`skillSlugSchema` — `z.enum(SKILL_SLUGS)` over this CLI's own generated catalogue. A marketplace
author naming a skill **they themselves ship** was therefore refused, and Zod's own text for an
enum reports the options and never the input. So the refusal handed back roughly 250 names
belonging to somebody else, and the one thing missing from it was the slug the author had written.

Measured by hand against the built binary (`bin/run.js`, 0.156.1) with a marketplace shipping one
skill under slug `acme-react` and a `skill-rules.ts` naming it:

| Surface  | What the user got                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------- |
| `search` | the whole union, in an oclif error box, and a non-zero exit — the marketplace does not load at all       |
| `doctor` | the same union twice: once as an error on `config/skill-rules.ts`, once inside a WARNING on another file |

Two things the tracker row for this (CLI-502) understates, both found by driving it rather than by
reading:

- **The marketplace does not "work"** when it ships relationship rules naming its own skills. The row
  reasons from `relationships` being `exactOptional()`, which is true and is about a marketplace
  that ships NO rules. One that ships them fails its whole load: `loadSkillRules` raises
  `ConfigSchemaError` out of `loadAndMergeFromBasePath`, so `search` exits non-zero and `doctor`'s
  `Marketplace Reachable` row fails.
- **The same union is applied one layer earlier**, to `metadata.yaml`'s own `slug` field, so an author
  hits the dump before they ever write a rule. That one is survivable — `validateSkillMetadata`
  picks `customMetadataValidationSchema` when the file declares `custom: true`, and that variant's
  `slug` is any kebab-case string — but nothing in the refusal says so.

And a third defect sits beside them, independent of the union: when the matrix load fails, phase 3
of `validateSource` reports "Cross-reference validation skipped" against **`config/skill-categories.ts`**,
a hardcoded file that is not the one that failed. An author whose `skill-rules.ts` will not parse is
sent to open a file that is fine. `doctor` renders `- [SEVERITY] <file>: <message>`, so the `file`
field is a direct instruction about which file to open.

## Fix Applied

`skillRefInRules` is now its own `z.enum(SKILL_SLUGS, { error: … })` whose message is built by
`unknownSkillSlugRefusal`. It names the value the author wrote — the function form of `error` is the
only way to reach `issue.input` — states the constraint in the words the authoring guide already
uses, and offers the way out that guide already documents (ship the file with a version and no
relationships). Pinned by `source-validator.test.ts` -> "should say why a rule may not name this
marketplace's own skill, not list the catalogue", whose no-dump assertion reads a real member off
`SKILL_SLUGS` rather than a typed literal, and was mutation-checked by putting the union back into
the message.

Not fixed, and deliberately: the `metadata.yaml` half, because whether a marketplace's own slugs may
leave the closed union is CLI-498's open question and the answer decides the shape of that message;
and the mis-attributed `skill-categories.ts` warning, because it is a distinct defect with its own
behaviour to change.

## Proposed Standard

**A refusal built from a closed union owes the reader the value they wrote, not the union they did
not.** Zod's default text for `z.enum` is the option list and nothing else, which is useful when the
union is short and a vocabulary the reader shares, and useless the moment either stops being true —
a ~250-member generated catalogue is neither. The test is cheap and worth applying wherever a
generated union reaches a file a third party edits: does the message contain the offending value,
and would a reader who has it be able to act? Home: `.ai-docs/standards/clean-code-standards.md`,
beside § 3.6 and § 3.7 — those two say a caught cause must be reported and that a distinction a
caller needs travels as a type; this is the same argument for the value a schema refused.

**And a diagnostic issue's `file` field is an instruction, not a label.** `fileHoldingDefect` in
`source-validator.ts` is an exhaustive switch precisely so no finding can be routed to a file
nobody decided on — and the phase-3 catch sits outside it, hardcoding `SKILL_CATEGORIES_PATH` for
every load failure whatever caused it. Any path a report hands a reader should be derived from the
thing that failed. Home: the "Which file a cross-reference finding names" section of
`.ai-docs/reference/features/skills-and-matrix.md`, which already documents the routed half and now
documents the two unrouted ones.

Both counts above are a census of what was driven — one marketplace, both non-installing commands —
not a sample of anything wider.
