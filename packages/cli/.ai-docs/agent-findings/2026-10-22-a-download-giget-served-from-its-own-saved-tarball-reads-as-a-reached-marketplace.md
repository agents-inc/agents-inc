---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/src/cli/lib/loading/source-fetcher.ts
  - packages/cli/src/cli/commands/doctor.ts
  - packages/cli/src/cli/lib/__tests__/helpers/shared-marketplace-checkout.ts
  - packages/cli/e2e/fixtures/default-source-cache.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  Inside `askingEachMarketplaceItself` (doctor's load) both halves are handled. A record with no
  ETag is asked about anyway. Outside that scope a record written without an ETag is still never
  asked about again, so no other command ever refreshes that copy.
---

## What Was Wrong

Two facts about the marketplace cache sat in no document and no comment, and each one by itself
makes "the marketplace answered" unprovable from the fetch result.

1. **A giget download that succeeds does not show the marketplace answered.** `downloadTemplate`
   in giget 1.2.5 (`node_modules/giget/dist/shared/giget.*.mjs`) catches its own download error.
   When `tarPath` exists it logs `Download error. Using cached version` under `DEBUG` only, then
   extracts its saved tarball. `downloadFreshCopy` in `source-fetcher.ts` therefore returns
   `fromCache: false` for a copy nobody fetched. The only signal is the HEAD `recordFetchedCopy`
   sends afterwards, and that HEAD failed into `.catch(() => undefined)`, which wrote a record
   with no ETag. The research's hand-run b3 (our cache cleared, giget's kept, offline) showed
   `doctor` printing `✓ Connected to remote … Fetched … over the network`.
2. **An unrecorded copy is discarded by the next load, giget's tarball with it.**
   `classifyCachedCopy` answers `unrecorded` for a copy with no `.etag.json` beside it, and
   `fetchFromRemoteSource` then calls `discardCachedCopy`, which removes both caches before
   downloading. So a load that refuses a download must still write the record, or it destroys the
   only fallback every later offline command has. The first draft of doctor's refusal did not
   write it. In the b3 state that turned the next offline `search` from exit 0 into a failure.
   `refuses a download the marketplace did not answer for, recording it as any other load would`
   in `source-fetcher-revalidation.test.ts` pins this.

A third fact governs the test layer. The unit suite's shared default-marketplace checkout
(`shared-marketplace-checkout.ts`, `NEVER_REVALIDATED_TARBALL`) and the e2e one
(`seedDefaultSourceCache`) both stay offline only because their records carry no ETag. Any path
that asks regardless of the ETag must have the answer stubbed. Doctor is now such a path, so
`doctor.test.ts` and `doctor-content.test.ts` stub `fetch`.

## Fix Applied

Doctor's load runs inside `askingEachMarketplaceItself`, which is AsyncLocalStorage, the shape of
`sayingEachWarningOnce`. Inside it, `classifyCachedCopy` asks even when no ETag was recorded and
throws `MarketplaceUnreachableError` rather than letting the copy stand in. Its verdicts are kept
in their own memo. `recordFetchedCopy` writes the record first, then refuses a download its HEAD
could not confirm. Outside the scope nothing changed.

## Proposed Standard

`clean-code-standards.md` has no section on the marketplace cache. Proposal: a short one saying
that (a) only a HEAD that answers shows a download reached the marketplace, and (b) any path that
stops a load after a download writes the fetch record first. This is a proposal and not checked
against every standard. Nothing in `CLAUDE.md` contradicts it.

The open half needs an owner decision: should a record with no ETag be asked about outside doctor
too? That changes what every offline command does, and the research behind card F5b offered it as
a separate option (F5b-a, option 2), which was not chosen.
