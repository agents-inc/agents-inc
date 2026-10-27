---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/lib/loading/source-fetcher.ts
  - packages/cli/src/cli/lib/loading/source-fetcher-revalidation.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-26
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `gigetDownload` in `source-fetcher.ts` marks each saved tarball's giget record before the download
  and reads whether giget rewrote it (`markSavedRecords`, `writtenByThisDownload`, `unmark`), holding
  a lock on giget's provider folder from mark to put-back (`holdingGigetFolder`). It no longer reads
  a time. Four reds in the "on a filesystem storing whole seconds" describe and four in "two
  marketplaces downloading at once" of `source-fetcher-revalidation.test.ts` went green (CLI-938).
---

## What Was Wrong

`gigetDownload` decided whether giget wrote a tarball during this download by comparing its
modification time before and after (`tarballTimes`, `modifiedAt`). A filesystem keeping whole
seconds leaves that time unmoved when giget rewrites the tarball within the second it last wrote it.
A fresh download then read as giget's saved copy. Inside doctor, `downloadPast` refused it
("Could not reach … the download failed and only a saved copy came back", exit 1) whenever the host
refused HEAD, since giget then records no ETag. Outside doctor, the run warned of a refusal over a copy
it had just downloaded.

Three readings that look like fixes are not:

- **Bytes or size.** A host refusing HEAD makes giget re-fetch on every run, so identical bytes are
  the normal case.
- **ctime.** No process can set it, and on such a filesystem it is whole seconds too.
- **Stamping the tarball's time and putting it back with `utimes`.** The put-back is inexact. Measured
  2026-10-26 on ext4 under WSL2 (Node 23.10): `utimes(f, atimeMs/1000, mtimeMs/1000)` returned a
  different `mtimeMs` for 14 of 20 files (a sample). That breaks
  `e2e/commands/marketplace-unreachable-over-gigets-tarball.e2e.test.ts`, which pins giget's cache
  by content and `mtimeMs`.

## Fix Applied

giget writes a tarball's record (`{tarball}.json`) only once the download of that tarball completes,
always as `JSON.stringify(info)`. Before the download, each saved tarball's record is set aside
untouched (`{record}.unmarked`), and a copy opening with a newline takes its place. JSON reads the
newline as whitespace, so giget behaves the same, its ETag shortcut included. A record giget rewrote
no longer opens with the newline, so its tarball was written by this download, whatever the bytes
and the clock. A record left as marked is swapped back for the original by rename, which keeps the
original's time. A tarball with no record marked for it was not saved before, so the download wrote
it.

The tarball a download will extract is unknown until giget resolves it, so every saved tarball under
the provider folder (`github`, `http`, …) is marked, other marketplaces' included. A second run's
mark then read as giget's rewrite to the first, and each put-back could land on a file the other had
moved: review reproduced a lost refusal warning and an `ENOENT` crash with two marketplaces
downloading at once, in one process and in two. So one run at a time holds `.agents-inc.lock` in the
provider folder, from before its marks until they are back. A discard of giget's folder for a
marketplace that moved on, and doctor's set-aside of a saved tarball, take the same lock, since
either would move a record another run has marked. A lock whose holder's process has ended (Ctrl+C
or a crash mid-download) or that has outlasted any download is taken over, and the next run puts
back any record its holder left marked.

Mutation checks, 2026-10-26: an empty mark reddens 7 specs in the whole-seconds describe (the 4 reds
and the 3 later-second controls). Dropping the original record instead of putting it back reddens no
unit spec. Only the e2e above pins that. In the two-marketplaces describe, each of six mutations
reddens at least one spec: downloads or discards taking no lock, an ended holder's or an outlasting
lock not taken over, a left-marked record not put back, the lock never let go.

## Proposed Standard

None needed: `clean-code-standards.md` › "A library that can answer from its own cache is asked which
it did" names no method. The fuller lesson, for a reviewer: **a file's modification time cannot show
a rewrite within the filesystem's resolution, and `utimes` cannot restore one exactly.**

Census of the same reading elsewhere, run 2026-10-26 (excluding specs):
`grep -rn "mtime\|ctime\|birthtime" src scripts e2e --include='*.ts' --include='*.tsx'`. No product
code is left. These tooling sites read a rewrite from modification time, and were left alone as
outside this lane:

- `scripts/check-findings-frontmatter.ts` `fingerprintOf` (size plus `mtimeMs`)
- `src/cli/lib/testing/dist-staleness.ts` `holdsTheGuardedBuild` (time equality)
- `e2e/helpers/test-utils.ts` `readTreeSnapshot`, whose comment says the time "catches a rewrite
  with identical bytes"
- `e2e/handrun-journeys.ts` `claudeTreeUnder` ("content and mtime, so an identical rewrite shows")

## Correction

Added later on 2026-10-26 by the cli-developer, in the second fix round. Two things in "Fix Applied"
changed:

- **The lock's name.** The lock is `agents-inc.lock`, not `.agents-inc.lock`. The package lint rule
  on the source folder's name (`SOURCE_FOLDER_NAME` in `eslint.config.js`) refuses `.agents-inc`
  everywhere except `install-layout.ts`.
- **How the lock is created.** It is no longer written with `fs/promises` `writeFile`'s `wx` flag,
  which the package lint rule restricts. It is created empty with `open(…, "wx")`, and the holder is
  written through `writeFile` in `utils/fs.ts`.

One case was added. A lock that names this process's own id, under a holder this process is not
using, is now taken over at once. That lock was left by an ended process with the same id, as a
container restarted over the same cache folder can hand out. Before this, it blocked every load for
the full 10 minutes with no message. It is pinned by `downloads past a lock naming this run's own
process id that it never took, leaving none behind`. Two in-process specs in the same describe stop
a takeover of a lock this process holds: a mutant treating every own-id lock as ended fails both.
