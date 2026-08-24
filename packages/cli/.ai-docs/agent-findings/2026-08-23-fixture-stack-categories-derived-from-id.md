---
type: anti-pattern
severity: medium
affected_files:
  - e2e/fixtures/project-builder.ts
  - e2e/commands/dual-scope.e2e.test.ts
  - e2e/commands/compile-scope-filtering.e2e.test.ts
  - e2e/commands/compile-global-scope-hint.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-23
reporting_agent: orchestrator
category: testing
domain: e2e
root_cause: enforcement-gap
status: open
---

# Four E2E fixtures file a skill under a stack category the catalogue contradicts

## What was observed

Thirteen hand-written stack literals key an assignment on `"web-testing"` — or, once,
`"web-mocking"` — for a skill whose declared category is `"web-e2e"`:

```
grep -rn '"web-testing": \[{ id: "web-testing-\(cypress\|playwright\)-e2e"' e2e --include='*.ts'
grep -rn '"web-mocking": \[{ id: "web-testing-playwright-e2e"' e2e --include='*.ts'
```

`web-testing-cypress-e2e` and `web-testing-playwright-e2e` both carry `category: "web-e2e"` in
`src/cli/types/generated/matrix.ts`, and `web-e2e` carries `exclusive: true`. **The key was derived
from the id's `web-testing-` prefix**, which is the derivation `packages/cli/CLAUDE.md` forbids
outright — _"NEVER derive `slug`, `domain` or `category` from a skill ID or directory path — in
product code, and in test factories and fixtures"_.

The lookup that would have answered correctly already exists and is already used by these same
fixtures for the metadata they write to disk: `metadataFieldsFor()` in
`e2e/fixtures/project-builder.ts` returns `category: "web-e2e"` for both ids. So each of these
fixtures writes a `metadata.yaml` saying `web-e2e` and a `config.ts` saying `web-testing`, about the
same skill, in the same directory.

## Why it stayed invisible

`normalizeStackRecord` relocates an assignment to its skill's declared category on LOAD, so every
consumer sees the corrected shape and every assertion passes. Nothing reads the key the fixture
actually wrote. The contradiction is only observable by writing the config back out — which no spec
did, because `writeProjectConfig` rendered its own JSON rather than going through the product's
writer. (That half is fixed: `writeProjectConfig` now calls `generateConfigSource`.)

## Reproduction

`writeProjectConfig` carries an env-gated round-trip diagnostic. Unset it does nothing; set, it
records every fixture config that does not survive the product's own load-then-write cycle:

```
CONFIG_ROUNDTRIP_PROBE=/tmp/probe.jsonl npx vitest --config e2e/vitest.config.ts --run --project e2e
```

**19 findings over 150 fixture configs, in exactly these four files, all this one cause.** Sixteen
are `DRIFT` — the re-read config places the skill under `web-e2e` and, because that category is
exclusive, compacts the array to a bare object, so the two renderings differ. Three are `THROW`:

```
Error: Category 'web-e2e' is exclusive but holds 2 skills:
  [{"id":"web-testing-cypress-e2e","preloaded":true},{"id":"web-testing-playwright-e2e","preloaded":true}]
```

Every other fixture config in the suite round-trips byte-identically.

## Why this is not a cosmetic fixture nit

The three `THROW` sites are the part that matters. `ProjectBuilder.dualScope()` puts
`cypress-e2e` and `playwright-e2e` in one agent's stack under two different wrong keys; corrected,
they land in the same exclusive category, and **the product's writer refuses to emit that config at
all**. So `dual-scope.e2e.test.ts` -> _"should compile project agents referencing both global and
project skills"_ asserts a compiled sub-agent body that no CLI-written configuration can produce.
The spec is green, and what it covers is not reachable.

## Why it is filed rather than fixed

Correcting the keys is mechanical, but it FORCES a fixture-identity decision that is not: the
dual-scope fixture needs two distinguishable skills in one agent's stack, and two `web-e2e` skills
cannot coexist there. One of them has to become a skill from another category, which moves the ids
five specs assert on across two files. That is a change to what those specs cover, so it belongs to
the owner rather than to the sweep that found it — `CLAUDE.md`'s "the verifier is never the fixer".

## What would have caught it

Nothing does today, which is why `root_cause` is `enforcement-gap` rather than `missing-rule`: the
rule is written, is specific, and names test fixtures explicitly. What is absent is a check. The
round-trip diagnostic above IS that check and could be promoted from an env-gated report to an
always-on assertion the moment these four files are clean — that is the natural close for this
finding, and the reason the diagnostic was left in the tree rather than deleted with the audit.
