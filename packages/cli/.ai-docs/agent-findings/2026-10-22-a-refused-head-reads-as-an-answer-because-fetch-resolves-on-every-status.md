---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/src/cli/lib/loading/source-fetcher.ts
  - packages/cli/src/cli/lib/loading/source-fetcher-revalidation.test.ts
  - packages/cli/e2e/commands/doctor-diagnostics.e2e.test.ts
  - packages/cli/e2e/helpers/tarball-source-server.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  clean-code-standards.md 15.19 (CLI-948); init --from and edit --from stop on any 4xx but 405 and
  warn over a 5xx or 405 (CLI-946, CLI-958); every other load warns over a 5xx or 405 and keeps
  silent on a 4xx (CLI-962)
---

## What Was Wrong

`fetch` resolves on every HTTP status and rejects only when no answer arrives. `fetchEtag` in
`source-fetcher.ts` read the `etag` header and nothing else, so a HEAD answered `404` with no
ETag looked exactly like a `200` with no ETag. `classifyCachedCopy` then answered `current`, and
`askAfterTheDownload` answered `answered: true`. Doctor printed `✓ Connected to remote` over a
repository that no longer served anything, and exited 0.

A missing repository is answered this way on every host giget names. A `curl -sIL` census on
2026-10-22 of one live repository and one missing one per host:

- `api.github.com/repos/<repo>/tarball/main`: the live one gives 302 then 200 with an ETag; the
  missing one gives 404 with no ETag.
- `gitlab.com/<repo>/-/archive/main.tar.gz`: the live one gives 200 with an ETag; the missing one
  gives 302 then 403.
- `bitbucket.org/<repo>/get/master.tar.gz`: 200, and 404.
- `git.sr.ht/~<repo>/archive/master.tar.gz`: 200, and 404.

None of the four answered a HEAD with 405.

The download path has the same gap. giget 1.2.5's `download` throws on a GET status `>= 400`, and
`downloadTemplate` catches that throw like a network failure: when its saved tarball exists, it
extracts that tarball. So a refused download also "succeeds", and only the HEAD that follows can
show the refusal.

The finding `2026-10-22-a-download-giget-served-from-its-own-saved-tarball-reads-as-a-reached-marketplace`
proposed "only a HEAD that answers shows a download reached the marketplace". That holds only when
"answers" means an ok status. Its fix counted any HEAD that resolved.

## Fix Applied

Inside the scope, `fetchEtag` asks with a GET and throws `TarballWithheldError` for any response
that is not `ok`, 405 and 501 included. On the saved-copy path, `classifyCachedCopy` details the
error through `createDetailedFetchError`; on the download path, `downloadAnsweredFor` does, after
`askAfterTheDownload`. Either way doctor's row reads `✗ Failed to load marketplace` with
`Repository not found` / `Authentication required for` / `Access denied to`, the same as with no
saved copy.

`it.each(WITHHELD)` in `source-fetcher-revalidation.test.ts` pins both paths, 405 and 501 among
its rows. Its regex is anchored, so a message wrapped twice fails it. `a remote marketplace that
answers $status, withholding its content` in `doctor-diagnostics.e2e.test.ts` drives the built CLI
and real giget through `startTarballSourceServer`'s new `refuse(status)`.

## Proposed Standard

`clean-code-standards.md` has no section on HTTP answers. Proposal: "A `Response` is not an
answer until its status says so. Where a call reads a header or body, check `response.ok` (or name
the statuses it accepts) at the call." Census command:
`grep -rnE "\bfetch\(" src --include='*.ts' --include='*.tsx' | grep -v "\.test\.\|__tests__"`. On
2026-10-22 it named two sites: this one, and `publish-seed.ts`, which already checks `ok`. This is
a proposal, checked against `CLAUDE.md`'s NEVER/ALWAYS rules (no conflict) but not against every
standard.

Corrected 2026-10-23: Fix Applied first said doctor exempted 405 and 501 and threw from
`recordFetchedCopy`, and named the doctor describe by an older title. All three described the code
of 2026-10-22. The standard landed, narrower than proposed, as `clean-code-standards.md` 15.19.
