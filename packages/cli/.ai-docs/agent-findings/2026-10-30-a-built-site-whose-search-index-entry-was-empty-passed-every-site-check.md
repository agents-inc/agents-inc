---
type: missing-standard
severity: low
affected_files:
  - apps/www/scripts/check-search-index.ts
  - apps/www/package.json
standards_docs:
  - apps/www/package.json
date: 2026-10-30
reporting_agent: web-tester
category: testing
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  apps/www/scripts/check-search-index.ts, wired last into the www test script, refuses a
  dist/pagefind/pagefind-entry.json that names no page count, and a fragment count that disagrees
  with the count it names
---

## What Was Wrong

Observed 2026-10-30 in `apps/www/dist/` (written 13:58 that day; how it was written is unknown):
`dist/pagefind/pagefind-entry.json` was 0 bytes while the 297 fragments beside it were whole. The
search box loads that file first, so on that build every search failed ("Failed to load Pagefind
metadata" in the browser). No site check read the search index, so nothing in `bun run test` would
have noticed. A rebuild wrote a 173-byte entry and search worked again.

A second gotcha for anyone measuring search order: Starlight hands the search box its own ranking
options (`pageLength` 0.1, `termSimilarity` 9 and the rest, `schemas/pagefind.ts` in
`@astrojs/starlight` 0.41.6), so `pagefind.search()` called directly ranks differently from the box.
On this build, "doctor" put a release page first through the bare call and Troubleshooting first in
the box. The result set is the same; only the order differs.

## Fix Applied

`apps/www/scripts/check-search-index.ts` reads the index Pagefind wrote, and as a control it refuses
an entry file with no page count, or a fragment count that differs from that count. It runs the
search through the built site's own Pagefind bundle, and it asserts only membership, never order.

## Proposed Standard

None beyond the check. A site check that measures search ranking must apply the box's ranking
options, or say that it does not.
