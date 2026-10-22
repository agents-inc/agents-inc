---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/src/cli/lib/loading/source-fetcher.ts
  - packages/cli/src/cli/lib/loading/source-fetcher-revalidation.test.ts
  - packages/cli/src/cli/commands/doctor.ts
  - packages/cli/src/cli/lib/__tests__/helpers/shared-marketplace-checkout.ts
  - packages/cli/src/cli/lib/__tests__/helpers/shared-marketplace-checkout.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/doctor.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/doctor-content.test.ts
  - packages/cli/e2e/commands/doctor-diagnostics.e2e.test.ts
  - packages/cli/e2e/commands/doctor-report-shape.e2e.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Inside `askingEachMarketplaceItself` (doctor's load) a copy is now read only when the
  marketplace answers a GET with the ETag the copy was saved under; anything else downloads, staged
  beside the copy, and a refused download leaves the copy and its record as they were. Outside the
  scope a record with no ETag is still never asked about again, the gap the giget finding already
  names as untracked.
---

## What Was Wrong

Doctor's load asked the marketplace, then read the saved copy whenever the answer could not be
compared. `classifyCachedCopy` returned `current` when the record carried no ETag, when the answer
carried none, and when the host refused HEAD (405 or 501, which `fetchEtag` exempted). So doctor
printed `✓ Connected to remote … 10 skills available` while the marketplace served 9, and exit 0
over a host that served nothing at all (405 to every method). Doctor itself made the first case:
offline, giget extracts its own saved tarball, and the load wrote a record with no ETag before
refusing it, so the next online doctor read that copy for good.

The rule the scope was built to keep — "asks the marketplace itself, never the copy" — was stated
for the unanswered case only. "The marketplace answered" was taken to mean "the copy may be read",
when only an ETag on both sides says the copy is what the marketplace serves.

A HEAD cannot settle it either: a 405 to HEAD says nothing about the GET, and after a download
giget may have extracted its saved tarball because the GET failed.

## Fix Applied

In `source-fetcher.ts`, inside the scope only:

- The question is a GET with its body cancelled at the headers, so a refused method is a refusal
  of the content (`TarballWithheldError`), and `HEAD_METHOD_REFUSED` is gone.
- `classifyCachedCopy` answers `current` only when both ETags exist and match, `superseded` when
  both exist and differ, and the new `unconfirmed` otherwise, which downloads quietly.
- `downloadAnsweredFor` downloads into `<cache dir>.download`, asks after the download, and only
  then swaps the copy and writes its record. A refusal removes the staged directory and leaves the
  copy, its record and giget's tarball as they were, so doctor no longer writes a record over
  giget's tarball.

Doctor's `Fetched <source> over the network` now reads `Reached <source> over the network`, which
holds for both a download and a copy the marketplace confirmed.

The unit doctor specs read the shared default-marketplace checkout, whose record has no ETag, so
they would now download over it. `fingerprintSharedCheckout` gives each fake home its own record,
with an ETag, over a link to the shared checkout, and the specs' stubbed `fetch` answers it.

## Proposed Standard

`clean-code-standards.md`, beside the rule about `fetch` resolving on every status: **a check that
promises an answer from the source must state, for each answer that cannot be compared, whether it
downloads or refuses.** "Answered" is not "unchanged". A missing ETag on either side, or a status
that answers the method rather than the content, cannot show that a saved copy matches. Census of
the conditional reads of a saved copy:

```
grep -n 'etag' packages/cli/src/cli/lib/loading/source-fetcher.ts
```

What catches a regression: the specs in `source-fetcher-revalidation.test.ts` that download over
an unconfirmed copy, refuse a 405 or 501, and leave nothing staged; and the
`doctor-diagnostics.e2e.test.ts` describes "a remote marketplace whose saved copy no fingerprint
vouches for" and "a remote marketplace that answers 405, withholding its content". Run against the
code before this change, 14 of those unit specs and 3 of those e2e specs failed.
