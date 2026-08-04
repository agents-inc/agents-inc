---
type: convention-drift
severity: low
affected_files:
  - e2e/lifecycle/scope-toggle-roundtrip.e2e.test.ts
  - src/cli/lib/__tests__/helpers/config-comparison.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Two config.ts text normalizers exist that look interchangeable but are not.

The shared one, `normalizeGlobalConfig` in
`src/cli/lib/__tests__/helpers/config-comparison.ts` (re-exported from
`e2e/helpers/test-utils.ts`), drops the machine-specific `"projects"` line and
then **sorts the remaining lines** before joining.

The local one, `normalizeConfig` in
`e2e/lifecycle/scope-toggle-roundtrip.e2e.test.ts`, drops the same `"projects"`
line but **does not sort**.

The two differ only by a single `.sort()` call, and neither name signals the
difference. A sweep that mechanically swaps the local helper for the shared one
(exactly what the Pass 8 Cluster G adoption rulebook asks for under "local
re-declarations that a shared export now covers") would silently change what
`expect(normalizeConfig(after)).toStrictEqual(normalizeConfig(before))` asserts:
the sorted variant is insensitive to line REORDERING, so a config rewrite that
shuffles entries would stop failing the test.

Related, in the same file: `projectConfigBefore` is read as a "before" snapshot
but is never compared against an "after" value, so the project-side half of the
"passthrough edit must not change scope" invariant is captured and then dropped.
CLAUDE.md requires verifying config AND filesystem on both sides.

## Fix Applied

None — discovery only, and deliberately so. This pass is strictly
behaviour-preserving, so adopting `normalizeGlobalConfig` was rejected (it would
have weakened the assertion) and the unused `projectConfigBefore` snapshot was
left alone (completing it would have ADDED an assertion). Both are recorded here
so a later, assertion-affecting pass can decide intentionally.

## Proposed Standard

Two changes would prevent the trap:

1. Rename the shared helper to encode the sort, e.g.
   `normalizeGlobalConfigOrderInsensitive`, or split it into two exports
   (`stripProjectsLine` and `sortLines`) that call sites compose. A name that
   does not mention sorting cannot warn an adopter that sorting happens.

2. Add a rule to `.ai-docs/standards/e2e/anti-patterns.md` under the
   shared-helper-adoption guidance: before replacing a file-local helper with a
   same-shaped shared export, diff the two bodies and confirm the assertion
   strength is identical. "Structurally similar" is not "equivalent" when the
   helper feeds a `toStrictEqual`.

Separately, `scope-toggle-roundtrip.e2e.test.ts`'s unused `projectConfigBefore`
should either gain the matching after-comparison or be deleted, so the file does
not read as if it verifies something it does not.
