---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/src/cli/lib/__tests__/user-journeys/config-precedence.test.ts
  - packages/cli/.ai-docs/standards/clean-code-standards.md
  - packages/cli/.ai-docs/standards/e2e/README.md
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-21
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  scripts/check-spec-name-vocabulary.ts holds every constant-shaped token in every it/describe/test
  name against the tokens the package's non-spec modules hold IN CODE. The three CC_SOURCE names in
  config-precedence.test.ts are renamed to CC_MARKETPLACE; clean-code-standards.md 17.4 now records
  both specimens as repaired and states exactly which half of its own class the new gate holds.
---

## What Was Wrong

`clean-code-standards.md` § 17.4 puts five surfaces on any rename and says tooling covers two. A
test NAME is one of the three it does not cover, and it is the worst of them: **it can never go
red.** The section had recorded two live specimens, and one of them was still live five days later:

```
it("should use CC_SOURCE when no flag provided", …)     // body sets process.env[SOURCE_ENV_VAR]
it("should use CC_SOURCE over project config", …)       // and SOURCE_ENV_VAR is "CC_MARKETPLACE"
it("should ignore CC_SOURCE for every command after init", …)
```

The sharp part is that the old-value grep **does** return these — the withdrawn identifier is right
there in the name. Grepping was never the gap. Accounting for the hits was, and a hit in an `it`
name reads as prose to a pass looking for code. The name also survived being written down as a
specimen in a standards document, which is the strongest evidence available that prose alone does
not retire a defect.

A second, unrelated staleness in the same round: `.ai-docs/standards/e2e/README.md`'s directory
listing described `e2e/assertions/phase-assertions.ts` as carrying `expectPhaseSuccess` alone; it
gained `expectCancelledExit`, which is called from inside `abortAndDestroy` rather than from the 35
sites that abort.

## Fix Applied

The three `it` names now read `CC_MARKETPLACE`, and the README listing names both exports.

`scripts/check-spec-name-vocabulary.ts` holds the class. It reads the name every `it`, `describe`
and `test` in the package gives itself — from the AST, so `it.each(…)("…")`, `describe.skipIf(…)`
and template names are read rather than missed — takes every constant-shaped token out of it (one
containing an underscore, which is how this codebase spells a constant and an environment variable
and is not how it writes prose), and requires each to be a token some non-spec module holds.

**Resolution is against CODE and never against comments, and that is what makes the scan work at
all.** The first draft resolved against whole file text, and its own docblock named the withdrawn
variable as the example — so the module vouched for the specs and the run reported clean. Prose is
the surface § 17.4 says nothing ever catches; letting it resolve a name hands the withdrawn
vocabulary a way to certify itself.

**Census, measured 2026-08-21:** across 431 specs and 299 non-spec modules the finished scan reports
exactly the three names above and nothing else. The other twelve constant-shaped tokens appearing in
spec names today (`XDG_CACHE_HOME`, `BUILT_IN_MATRIX`, `AGENT_NAMES`, `DOMAIN_ORDER`, …) all resolve,
so the gate lands at zero false positives on the tree it was written against.

## Proposed Standard

None new — § 17.4 is the rule and it was already right. What it now says additionally is which half
of its own class is held and which is not: a heading whose stale word is an ordinary one (`source`,
as in its first specimen), a comment, a helper's option name and an assertion message still have
nothing, ever. Naming the residue is the point; a gate that closes one surface of five is worth
having only if the other four are still stated as open.
