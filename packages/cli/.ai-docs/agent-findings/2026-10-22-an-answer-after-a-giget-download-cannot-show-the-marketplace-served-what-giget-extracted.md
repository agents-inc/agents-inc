---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/src/cli/lib/loading/source-fetcher.ts
  - packages/cli/src/cli/lib/loading/source-fetcher-revalidation.test.ts
  - packages/cli/src/cli/lib/loading/source-fetcher-download.test.ts
  - packages/cli/e2e/helpers/tarball-source-server.ts
  - packages/cli/e2e/commands/doctor-marketplace-download.e2e.test.ts
  - packages/cli/e2e/commands/doctor-diagnostics.e2e.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `gigetDownload` in `source-fetcher.ts` tells a tarball the download wrote from one giget saved
  earlier, by the tarball's modification time against a listing taken before the download. A saved
  tarball is recorded under the ETag giget saved it with. Doctor's load: see
  2026-10-23-a-download-giget-can-answer-from-its-saved-tarball-is-a-download-only-once-that-tarball-is-set-aside.md.
---

## What Was Wrong

Doctor's download asked the marketplace after the download and took a good answer as proof that
the marketplace served what was extracted. It is not. giget 1.2.5's `downloadTemplate` catches
its own failed GET and, when its saved tarball exists, extracts that instead. It logs only under
`DEBUG`, and the result it returns is the same object a real download returns. A question asked a
moment later answers for the marketplace as it is now, not for the bytes giget took from disk.

So one failed request (`GET 503`, once) after the marketplace moved on made doctor:

- swap giget's saved tarball in as the copy;
- record it under the live ETag;
- print `✓ … 10 skills available / Reached <source> over the network` while the marketplace served
  9;
- read that copy as current on every later run, because the ETags now matched.

A load outside doctor (`search`) hit by the same failure recorded the live ETag over giget's
tarball the same way, through `recordFetchedCopy`.

giget answers its own ETag match the same way, and that is the second reason the result cannot be
trusted. When the HEAD's ETag equals the one it saved, it extracts the saved tarball with no GET.
The two cases look identical from outside, and only one of them is a failure.

The earlier finding `2026-10-22-a-download-giget-served-from-its-own-saved-tarball-reads-as-a-reached-marketplace`
proposed "only a HEAD that answers shows a download reached the marketplace". That holds only
while the network stays down. A failure that clears between giget's GET and the next question
defeats it.

Nothing could catch it:

- The unit specs mock giget wholesale, so its fallback never runs in them.
- The e2e tarball server refused every request or none, so no spec could fail one download and
  answer the question after it.

## Fix Applied

- **Detection.** `gigetDownload` lists the modification time of every tarball under giget's
  provider directory, at any depth, before the download. Afterwards it locates the extracted
  tarball from the result (`{name}/{version || name}.tar.gz`). An unchanged time means giget used
  its saved tarball, whose ETag sits beside it in `{tarball}.json`. The listing first looked one
  folder deep, which missed a branch holding a slash: see
  `2026-10-22-a-branch-holding-a-slash-saves-gigets-tarball-a-folder-deeper-than-a-one-level-glob-looks`.
- **Outside doctor**, that tarball is still read, but it is recorded under the ETag giget saved it
  with (or none), never the live one.
- **Inside `askingEachMarketplaceItself`**, the saved tarball is kept only when the marketplace
  answers with the ETag it was saved under. That includes a download that failed while the
  marketplace still serves that ETag; whether doctor may accept it is an open owner question.
  Anything else throws `MarketplaceUnreachableError` ("the download failed and only a saved copy
  came back"). The copy, its record and giget's tarball stay as they were.
- **The e2e tarball server** gained `failOnce(method, status, passing)`, and
  `doctor-marketplace-download.e2e.test.ts` reproduces both cases.

What would catch a regression, mutation-checked:

- Making `vouchedFor` accept any saved tarball reddens specs in
  `source-fetcher-revalidation.test.ts` and `doctor-marketplace-download.e2e.test.ts`.
- Recording the live ETag again reddens specs in the same two files.

## Proposed Standard

This is a proposal for `clean-code-standards.md`, beside the rule about `fetch` resolving on every
status: **a library that can answer from its own cache is asked which one it did, and where it
cannot say, the cache is read before and after.** Whether the network was reached is not shown by
a question asked afterwards, which describes the source now and not the bytes on disk.

Census of the calls that can take giget's fallback:

```
grep -rn "downloadTemplate(" packages/cli/src
```

On 2026-10-22 this returned `gigetDownload` in `source-fetcher.ts` (both product paths go through
it) and the test helper `shared-marketplace-checkout.ts`, which seeds a checkout and is not a load.
Nothing in `CLAUDE.md` contradicts the proposal. It was not checked against every standard.

The detection depends on giget's cache layout (`cacheDirectory()`, the tarball name and the
`.json` record beside it), which `getGigetCacheDir` already replicates. If giget changes that
layout, the tarball is not found before or after. Doctor then refuses every download, which fails
the doctor e2e specs at once, and other loads record no ETag.

## Correction

2026-10-23: the owner answered the open question in "Fix Applied": doctor always downloads. The
acceptance that section describes, a saved tarball kept when the marketplace answers with the ETag
it was saved under, was withdrawn. Such a tarball is now set aside so giget must fetch:
`2026-10-23-a-download-giget-can-answer-from-its-saved-tarball-is-a-download-only-once-that-tarball-is-set-aside.md`.
The detection by modification time, and the record under giget's own ETag outside doctor, stand.
