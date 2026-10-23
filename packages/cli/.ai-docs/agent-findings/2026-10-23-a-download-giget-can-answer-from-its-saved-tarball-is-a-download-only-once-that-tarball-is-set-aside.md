---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/lib/loading/source-fetcher.ts
  - packages/cli/src/cli/lib/loading/source-fetcher-revalidation.test.ts
  - packages/cli/e2e/commands/doctor-marketplace-download.e2e.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-23
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  Code landed: `withTarballSetAside` moves giget's record aside before its tarball and puts it back
  last, so giget fetches whenever the tarball it saved is whole, and an interrupted download leaves a
  cut tarball no record vouches for, which the next download fetches over. Pending: the Proposed
  Standard is not written into `clean-code-standards.md`. See "Correction".
---

## What Was Wrong

The owner ruled that doctor downloads every marketplace on every run (q-doctor-matching-stamp,
"Always download"). Making doctor skip its own "is the copy current" question was not enough to do
that. In giget 1.2.5, `downloadTemplate` sends a HEAD, and when the answer's ETag equals the one
recorded beside its saved tarball (`{tarball}.json`), it extracts that tarball without fetching. A
failed GET also falls back to the saved tarball. Either way it says nothing and returns the same
result as a real download. So a doctor run that "downloads" can send no GET at all, and a saved
copy the owner ruled out would still decide what doctor counts.

`2026-10-22-an-answer-after-a-giget-download-cannot-show-the-marketplace-served-what-giget-extracted`
records the first half: the modification-time test in `gigetDownload` that tells a saved tarball
from a fetched one. Its resolution accepted a saved tarball whose ETag the marketplace confirmed,
and that acceptance is the reuse the ruling forbids.

Reproduction against the tree before the fix: e2e `doctor-marketplace-download`, describe "a
marketplace doctor downloads on every run". The server's `failOnce("GET", 503, 2)` sat unused,
because no GET after the first ever went out, and the row passed with exit 0.

## Fix Applied

The fix is in `downloadAnsweredFor` / `downloadPast`. A saved tarball under another ETag means the
download failed, and it is refused as before. A saved tarball under the live ETag means giget never
fetched: `withTarballSetAside` renames giget's record of it (`{tarball}.json`), then the tarball,
with a `.set-aside` suffix, and giget is asked again. With no tarball to fall back on, giget must
GET, and it throws if that fails. On failure the tarball is put back, then its record; on success
both set-aside files are deleted. This means a failed download leaves the CLI's copy, its record and
giget's tarball byte-identical, and the e2e leg asserts that over both trees.

## Proposed Standard

`clean-code-standards.md`, beside whatever it says about third-party caches: a library that caches
behind its own API counts as a saved copy. "Download afresh" is a claim about that cache too, and
it holds only when the library has nothing to fall back on. If the library offers no switch to turn
this off (giget 1.2.5 offers none: `force`, `forceClean` and `offline: false` all leave the HEAD
shortcut in place), the caller has to remove what the library would fall back on. No conflict with
CLAUDE.md found.

## Correction

This was `resolved`, by `downloadPast`, with the e2e leg "fails the marketplace row when the
download fails though the marketplace answered" and the unit specs named "downloads past the
tarball giget saved" red before it. That holds for a run that finishes. Until the fix at the end of
this section, the set-aside moved only the tarball, and `{tarball}.json` kept the live ETag.

A process killed between the rename and its undo left `{tarball}.set-aside` behind. If giget had
not yet opened its new tarball, the next download fetched, because giget had no tarball to fall
back on. If giget was streaming it, the partial tarball stayed beside that record. giget's next HEAD
then matched, and it extracted the partial file with no GET.

Measured on giget 1.2.5 outside the CLI, against a server that stops mid-body, with the process
killed by SIGKILL. The partial tarball was 205492 of 410984 bytes, beside `{"etag":"\"X\""}`. The
next download sent only `HEAD` and threw `zlib: unexpected end of file`.

Through the built CLI, with that state written by hand after two passing doctor runs (giget's
tarball cut to half, its `.json` untouched, a `.set-aside` beside it), three doctor runs each exited
1 with `Marketplace Reachable ✗ Failed to load marketplace` and `zlib: unexpected end of file`.
giget's tarball stayed at its cut size, so no download went out. A `search` between them exited 0 on
a HEAD and left giget's folder alone. Doctor recovered once the marketplace published a new
tarball, and the stale `.set-aside` was still there afterwards.

**Fixed afterwards.** `withTarballSetAside` now moves `{tarball}.json` aside before the tarball and,
when the download fails, puts the tarball back before the record. giget writes the record only once
a download completes, so nothing on disk names the live ETag beside a cut tarball at any point of an
interrupted download. Red first: e2e `doctor-marketplace-download` › "a doctor run interrupted while
it downloads the marketplace" (Ctrl+C in a pseudo-terminal while the server holds the download at
half its body): the next doctor run exited 1 on `zlib: unexpected end of file`, giget's tarball at
3352 of 6704 bytes. The unit spec "leaves giget no record beside the tarball an unfinished download
past its saved one is writing" goes red when only the record's move is reverted. The unit fake had
hidden the defect: it modelled giget's ETag check as "a tarball is there" and its download wrote no
record. The state written by hand above, record intact, still fails doctor until the ETag moves: the
CLI no longer produces it, and nothing repairs it. A killed run can leave set-aside files behind;
the next set-aside replaces and removes them.
