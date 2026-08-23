---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/schemas.ts
  - src/cli/utils/messages.ts
  - src/cli/lib/validate-kebab-name.ts
  - src/cli/lib/plugins/plugin-validator.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
  - .ai-docs/reference/types/zod-schemas.md
date: 2026-08-20
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  The marketplace-name half landed — marketplaceSchema.name is held to
  KEBAB_CASE_PATTERN, so the CLI reads back exactly what it will publish, and the VERDICT the three
  judges reach is now bound by src/cli/lib/__tests__/kebab-name-judges-agree.test.ts, which goes red
  the day a fourth is written with its own regex. What stays open is the PROSE: the same rule has
  four user-facing spellings across four modules, only KEBAB_CASE_PATTERN is shared, and
  plugin-validator.ts still states the verdict without stating the rule.
---

## What Was Wrong

Two defects of one shape, found while tightening `marketplaceSchema` under the 2026-08-20 owner
ruling.

**A rule enforced on one side of a round trip only.** `build marketplace` has refused to PUBLISH a
marketplace whose name is not kebab-case since it learned to read `package.json` —
`marketplaceNameNotPublishable` in `utils/messages.ts`, reached from
`commands/build/marketplace.ts`. The LOAD side, `marketplaceSchema.name` in `lib/schemas.ts`, took
any non-empty string. So the CLI refused to write a name it would happily read, and — the direction
that actually cost something — read a name Claude Code will not register plugins under. A
third-party manifest naming `@acme/skills` parsed clean, and every plugin it listed was namespaced
under a string no install could use. The emit-side refusal was written as the rule's enforcement and
was in fact half of it; nothing said so, because a schema field and a command's guard do not look
like two halves of anything.

**One rule, four user-facing spellings, no shared definition.** Census — `grep -rn "kebab-case" src
e2e scripts --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`, 23 hits in 12 files, of which
four are sentences a user reads:

| Where                                   | What it says                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `lib/validate-kebab-name.ts`            | `<noun> name must be kebab-case (lowercase letters, numbers, and hyphens, ...)` |
| `utils/messages.ts`                     | `A marketplace name is kebab-case: lowercase letters, numbers and hyphens, ...` |
| `lib/schemas.ts` (added by this change) | the same sentence, plus an example and where to edit it                         |
| `lib/plugins/plugin-validator.ts` (×2)  | `name must be kebab-case: "<name>"` — states the verdict and none of the rule   |

The remaining 19 hits are doc comments and the `KEBAB_CASE_PATTERN` declaration, and are not this
finding's subject. The `plugin-validator.ts` pair is the one worth acting on independently: a reader
handed `@scope/thing` there gets no rule, no example and no list of offending characters, while
`charactersOutsideKebabCase` — which exists to produce exactly that list — sits one import away and
is called only by `messages.ts`.

## Fix Applied

`marketplaceSchema.name` is now `z.string().min(1).regex(KEBAB_CASE_PATTERN, { message })`. Two
notes on the form, both load-bearing:

- The message is carried on the `regex` check rather than in a `.refine()`. A refinement is
  unrepresentable in JSON Schema and `z.toJSONSchema` drops it **silently**, so
  `src/schemas/marketplace.schema.json` would have lost the `pattern` an editor validates
  `marketplace.json` against — a regression with no error to notice it by. Verified both ways
  against `zod@4`; the emitted schema gained `"pattern": "^[a-z][a-z0-9]*(-[a-z0-9]+)*$"`.
- The sentence is copied verbatim from `marketplaceNameNotPublishable` rather than reworded, so the
  two directions of one rule cannot come to describe it differently. That is a mitigation, not a
  fix: the duplication is now three-deep.

No fixture changed. Every marketplace `name` literal in `src/`, `e2e/` and `scripts/` was already
kebab-case (grepped via the `owner:` sibling every marketplace literal carries).

## Proposed Standard

**A validating schema and the emitter that writes the file it validates are one rule, and the
narrower side is the definition.** Where the CLI both writes and reads a file, a constraint added to
either side belongs on both, and the load side must not be the looser of the two — a file this CLI
emitted must parse under its own reader. `.ai-docs/standards/clean-code-standards.md` is the home;
the neighbouring rule about canonicalising key order "once in the writer" is the same concern read
from the other end. Where the pair exists, name it in `reference/types/zod-schemas.md` beside the
schema, the way that document already names which schemas are strict and which are lenient.

The check is one grep and worth running before adding any `.regex()` or `.min()` to a schema that
has an emitter: does something in `commands/build/**` or `lib/*-generator.ts` write this file, and
does it refuse what the schema now refuses?

**The verdict half of this is now enforced** by
`src/cli/lib/__tests__/kebab-name-judges-agree.test.ts`, which runs one table of names past all
three judges and requires them to agree. Its table is chosen to discriminate rather than to cover:
`-acme`, `acme-`, `acme--skills` and `2acme` are each accepted by a naive `/^[a-z0-9-]+$/` and
refused by `KEBAB_CASE_PATTERN`, so a fourth judge written by hand reddens exactly those four rows.
Verified by mutation — swapping `validateKebabCaseName` to the naive regex reddens them and nothing
else.

**The rule's PROSE gets one definition, and it lives with the pattern.** `KEBAB_CASE_PATTERN` in
`consts.ts` is already the single regex; there is no single sentence, so each surface writes its
own and the four disagree in punctuation, in the Oxford comma, and in whether they state the rule at
all. Export the sentence from `lib/validate-kebab-name.ts` — the module whose entire subject is this
rule — and have `messages.ts`, `schemas.ts` and `plugin-validator.ts` read it.

Cross-checked against `CLAUDE.md`: this is the sanctioned exception to "NEVER export constants only
used within the same file", which exempts "helpers that build an identity or lookup key that more
than one surface must agree on", and it matches the `skillSlotKey` / `agentSlotKey` precedent —
several surfaces each writing their own version of one rule is exactly what that carve-out is for.
It was deliberately NOT done in this change: `validate-kebab-name.ts` was outside the task's file
set, and a shared-constant edit reaching four modules is a change that wants its own diff rather
than a rider on a schema tightening.
