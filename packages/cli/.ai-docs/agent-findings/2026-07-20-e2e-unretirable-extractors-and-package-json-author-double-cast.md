---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/scope-change-deselect-integrity.e2e.test.ts
  - e2e/lifecycle/source-switching-full-cycle.e2e.test.ts
  - e2e/commands/build.e2e.test.ts
  - src/cli/lib/__tests__/helpers/config-io.ts
  - src/cli/lib/__tests__/mock-data/mock-source-files.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

Two separate issues found while running the Pass 8 Cluster G adoption sweep over chunk C8.

**1. Two more unretirable raw-text config extractors.** Same class as
`2026-07-20-e2e-regex-config-extractors-block-structural-load-adoption.md`, in two files
that finding does not name:

- `scope-change-deselect-integrity.e2e.test.ts` splits the raw `config.ts` text on newlines
  and filters for lines containing `"id"` **and** `"scope":"global"` **and not** `"excluded"`,
  then sorts. This is a hand-rolled three-predicate line scanner standing in for
  `config.skills.filter((s) => s.scope === "global" && !s.excluded)`. It is duplicated
  verbatim at the before-snapshot and after-snapshot sites in the same test, so a defect in
  the predicate cancels out and the green result is not evidence the scanner is correct.
- `source-switching-full-cycle.e2e.test.ts` declares a local `extractSkillIds` that
  `.match()`es `/"([\w-]+-[\w-]+-[\w-]+)"/g` over the raw config text. The pattern is a
  three-hyphen-segment shape heuristic, not a skill-id lookup: it matches any quoted
  triple-segment token anywhere in the file, including category keys inside the `stack`
  block and the marketplace/source names the test itself injects. The same test also
  regex-scans `/"source":"([^"]+)"/g` for the eject-source assertion.

Both are the CLAUDE.md-banned "local parser/extractor inside a test file". `loadConfigOrFail`
(landed in phase 1 of this pass) is the correct structural replacement for both, but adopting
it changes the asserted values from raw-text captures to parsed `ProjectConfig` fields, which
a strictly behaviour-preserving sweep forbids. Left in place deliberately.

**2. `as unknown as string` double cast in `build.e2e.test.ts`.** The test
"should parse object-form author with name+email+url" passes an object-form npm author to
`writeTestPackageJson`:

```ts
author: { name: "Jane Doe", email: "jane@example.com", url: "https://jane.example.com" } as unknown as string,
```

CLAUDE.md bans `as unknown as T` outright ("fix the upstream type instead"). The npm
`package.json` schema and the CLI's own marketplace builder both accept
`string | { name; email?; url? }` — which is precisely what this test exists to prove.
So the helper's type is genuinely too narrow and the cast is papering over a real modelling
gap, not silencing a one-off.

**Correction (round 3): the upstream type is NOT in `e2e/helpers/test-utils.ts`.** That file
only re-exports `writeTestPackageJson` (imported at its line 15, re-exported in the block at
line 93) and declares no types of its own. The real definition is
`src/cli/lib/__tests__/helpers/config-io.ts`, whose signature is
`overrides: Partial<typeof VALID_PACKAGE_JSON_FILE> = {}` — so the `author` type is not
written down anywhere as a deliberate contract. It is _inferred_ from the fixture value
`author: "Test Author <test@example.com>"` in
`src/cli/lib/__tests__/mock-data/mock-source-files.ts`, which is a plain (non-`as const`)
object literal and therefore yields `string`.

That indirection is the actual root cause, and it generalises beyond this one field:
`Partial<typeof SOME_FIXTURE>` derives an _override_ contract from one arbitrary example
value, so every override is silently constrained to the types that example happened to use
rather than to the domain the consumer really accepts. Anyone following this finding to
`test-utils.ts` will find nothing to change.

## Fix Applied

None — discovery only for both items. Everything else in the chunk was adopted: the
surrounding `configTsPath` / `agentsPath` / `skillsPath`, `TIMEOUTS.SETUP_DUAL`,
`TERMINAL_SIZE.TALL`, `saveFromBuild`, `finishWizard`, `loadConfigOrFail`, `writeAgentFile`,
`E2E_SKILL` and `E2E_AGENT_DISPLAY` adoptions all landed.

## Proposed Standard

Two additions.

`.ai-docs/standards/e2e/anti-patterns.md`, raw-text-extractor section — extend the rule the
sibling finding proposes with the _duplicated-predicate_ case specifically:

- When the same raw-text extractor is applied to BOTH sides of a before/after comparison, the
  test proves only that the extractor is deterministic, not that it is correct. Treat a
  symmetric extractor as untested regardless of whether the suite is green, and require the
  structural replacement when the assertion is next touched.
- Shape heuristics (`/"([\w-]+-[\w-]+-[\w-]+)"/`) must never stand in for an id lookup. A
  regex that matches an id's _shape_ will silently capture category keys, source names and
  any other token of the same shape. If a structural load is not adoptable, the extractor
  must at minimum be scoped to the array it claims to read.

`.ai-docs/standards/e2e/README.md` (or wherever the test-utils helper contract lives) — record
that `writeTestPackageJson`'s `author` option should be widened to
`string | { name: string; email?: string; url?: string }` so the object-form author test can
drop its `as unknown as string`. Widening the helper type is the fix; the cast is not.

Concretely, in `src/cli/lib/__tests__/helpers/config-io.ts`:

```ts
overrides: Partial<
  Omit<typeof VALID_PACKAGE_JSON_FILE, "author"> & {
    author: string | { name: string; email?: string; url?: string };
  }
> = {},
```

This is byte-identical at runtime — `writeTestPackageJson` `JSON.stringify`s the merged object
wholesale and never reads `author`, so no emitted `package.json` changes. Verified by type
probe that it (a) accepts the object-form author with the cast removed, (b) still accepts every
existing string-form call site, including the bare `writeTestPackageJson(projectDir)` calls, and
(c) still _rejects_ a malformed author object — it is a widening, not an escape hatch.

Add the generalised rule alongside it: **never derive an overrides/options type from a fixture
value via `Partial<typeof FIXTURE>`.** Declare the options type explicitly and let the fixture
satisfy it. Deriving from the value inverts the dependency — the example constrains the API
instead of the API constraining the example — and the resulting over-narrowing surfaces far
from its cause, as a cast in an unrelated test file.
