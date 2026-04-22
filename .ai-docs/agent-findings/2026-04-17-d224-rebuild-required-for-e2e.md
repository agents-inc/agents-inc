---
type: convention-drift
severity: medium
affected_files:
  - e2e/helpers/test-utils.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-04-17
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-visible
status: resolved
resolved_by: Added "Rebuild before running E2E tests" rule to .ai-docs/standards/e2e/README.md Critical Rules section (2026-04-21). Documents that `ensureBinaryExists()` only checks existence (not staleness), that `npm run build` is required after any src/ edit, and that unit-green + E2E-red with identical signatures is the canonical stale-build signal. Optional mtime stamp-check in `ensureBinaryExists` deferred as a potential follow-up.
---

## What Was Wrong

During D-224 implementation, after editing `src/cli/stores/wizard-store.ts` the
D-224 red E2Es kept failing with the exact same failure signature as the
pre-fix state. Unit tests covering the same fix passed (the scratch unit test
that replicated the E2E's store inputs produced the expected single
`{scope:"global"}` entry).

Root cause: E2E tests run against the built binary at `dist/` (per
`ensureBinaryExists` in `e2e/helpers/test-utils.ts`). Source edits are invisible
to E2Es until `npm run build` runs. The helper checks that the binary _exists_
but does not stamp-check that it was built after the latest source edit.

After running `npm run build`, the D-224 E2Es flipped to green on the exact
same store-layer fix. Lost ~10 minutes chasing a phantom downstream bug.

## Status Update — 2026-04-21

Still open. Audited `ensureBinaryExists` in `e2e/helpers/test-utils.ts` — it
continues to only check `fileExists(BIN_RUN)` with no mtime stamp-check
against `src/`. Grep of `.ai-docs/standards/e2e/` confirms the README has no
"rebuild before E2E" note. Neither of the proposed remediations (standards
note + mtime stale-warning) has landed.

## Fix Applied

None — discovery only. The fix itself (D-224) is in a separate commit.

## Proposed Standard

Add an explicit note to `.ai-docs/standards/e2e/README.md` (or the cli-developer
agent prompt): "E2E tests execute the compiled binary. After any `src/` change,
run `npm run build` before running E2E tests. If E2Es fail with pre-fix
symptoms despite source edits, rebuild first." Optionally, consider upgrading
`ensureBinaryExists` to compare `dist/` mtime against `src/` mtime and warn
when the build is stale.
