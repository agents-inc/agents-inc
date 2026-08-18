---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/source-validator.ts
  - src/cli/lib/matrix/matrix-health-check.ts
standards_docs:
  - .ai-docs/reference/commands/index.md
date: 2026-08-16
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`checkCrossReferences` in `src/cli/lib/source-validator.ts` files EVERY finding
`checkMatrixHealth` returns against one hard-coded path, `SKILL_CATEGORIES_PATH`
(`config/skill-categories.ts`):

```ts
return checkMatrixHealth(matrix).map((healthIssue) => toSourceIssue(healthIssue, ...));
// toSourceIssue, and the single-expression map it replaced, both set:
//   file: SKILL_CATEGORIES_PATH
```

`doctor` renders that value as the location half of every issue line —
`- [ERROR] config/skill-categories.ts: <message>` — so the path is presented to the reader
as the file to open.

For three of the six finding kinds it is the wrong file:

| Finding                         | File the reader must open                                   |
| ------------------------------- | ----------------------------------------------------------- |
| `category-missing-domain`       | `config/skill-categories.ts` — correct                      |
| `skill-unknown-category`        | the skill's own `metadata.yaml`, or the categories file     |
| `skill-unresolved-relation-ref` | `config/skill-rules.ts`                                     |
| `rule-unresolved-slug`          | `config/skill-rules.ts` — the rule holding the typo         |
| `audit-verdict-contradiction`   | `src/cli/lib/configuration/skill-audit.ts`, or the category |
| `skill-unaudited`               | `src/cli/lib/configuration/skill-audit.ts`                  |

The mismatch is loudest on `rule-unresolved-slug`, which exists precisely to point a
marketplace author at a typo they can fix: the line names the slug correctly and then
sends them to a file that does not contain it. `SKILL_RULES_PATH` is already exported
from `consts.ts` and already imported by this module, so nothing is missing but the
mapping.

Two things kept this invisible. `MatrixHealthIssue` carried `finding: string` until
today, so nothing in `source-validator` could branch per kind without a magic string —
one path for all six was the only shape available. And no test asserts the `file` field
of a cross-reference issue: the existing specs filter on `message`, so the path can be
anything and stay green.

## Fix Applied

None — discovery only, and deliberately so. The work in hand was the owner's ruling on
unresolved-slug SEVERITY (error while authoring a marketplace, warning while consuming
one), which touches `severity` and `message`. Repointing `file` changes what every
cross-reference line claims for all six kinds and for both readers, and it is not what
was asked for.

What DID land is the precondition: `MatrixHealthIssue.finding` is now a closed union of
the six kinds rather than `string`, so a per-kind `file` mapping is now a `switch` with
a `never` default rather than a wall of string comparisons.

## Proposed Standard

Two parts.

**Code.** Give the health-check finding its own file mapping, beside the severity
mapping added today in `toSourceIssue`. An exhaustive `switch` over
`MatrixHealthIssue["finding"]` returning the path, with the `never` default, makes a new
finding kind a compile error until someone says where its defect lives — which is the
property the single hard-coded path had already lost.

**Standard.** `.ai-docs/standards/clean-code-standards.md` has no rule about the `file`
field of a diagnostic, and it needs one, because the field looks decorative and is not:
a reader opens what it names. Proposed wording — _"When a diagnostic carries a file or
path field, that path must be the file the reader has to open to fix the finding. A
single path shared by a family of findings is only correct when every member of the
family lives in that one file."_ Its natural enforcement is a test: a spec that asserts
`file` per finding kind, which no spec does today for this module.
