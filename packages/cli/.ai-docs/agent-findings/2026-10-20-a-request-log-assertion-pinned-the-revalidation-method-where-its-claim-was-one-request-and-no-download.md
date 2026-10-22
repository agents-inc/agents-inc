---
type: anti-pattern
severity: low
affected_files:
  - e2e/commands/source-revalidation.e2e.test.ts
  - .ai-docs/standards/e2e/user-journeys.md
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  The spec asserts the outcome. user-journeys.md row 22 still describes the unchanged arm as
  "exactly one HEAD and no GET", which the spec no longer holds.
---

## What Was Wrong

`source-revalidation.e2e.test.ts` held the unchanged arm's request log `toStrictEqual(["HEAD 200"])`
under the message "one question asked, no body transferred", and the cold arm counted every `GET`.
The CLI revalidates with a HEAD and an ETag compare (`fetchEtag` in
`src/cli/lib/loading/source-fetcher.ts`). A conditional GET does the same job, and the stand-in
already answers it: `statusFor` in `e2e/helpers/tarball-source-server.ts` returns 304 on a matching
`If-None-Match` for any method. That refactor still makes one request, transfers no body and prints
the same output, but its log reads `GET 304`, and both assertions failed on it.

A tarball host's protocol leaves the method to the client. The config store is different: its routes
are the worker's contract, so `share.e2e.test.ts` pinning `POST /configs` is behaviour.

## Fix Applied

Both arms now count downloads. A download is `"GET 200"`, the only answer the stand-in sends bytes
with. The cold arm asserts exactly one. The unchanged arm asserts none, and exactly one request.
Checked by injecting into the spec's request logs and running it: a conditional-GET log
(`["GET 304"]`) is green under the new assertions and red under the old ones. A second cold
download is red on "downloaded once". A source republished before the cache run is red on "no body
transferred".

## Proposed Standard

`standards/e2e/assertions.md`: where a boundary's protocol leaves the client its mechanism, a
request-log assertion names the outcome (requests made, bodies transferred) rather than the method.
A route the product's own server defines may be pinned. No mechanical gate exists: whether the
protocol leaves a choice is a property of the boundary, not of the syntax.

`standards/e2e/user-journeys.md` row 22: "the unchanged arm must show exactly one HEAD and no GET"
becomes "the unchanged arm must show exactly one request and no download".
