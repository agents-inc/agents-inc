---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/agent-findings/INDEX.md
  - scripts/check-findings-frontmatter.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`agent-findings/INDEX.md` names findings by basename. Deleting a finding removes the file and
leaves the row, and nothing on the way out looks. Both directions have drifted, and each is one
command to measure — run from `packages/cli`:

```
grep -oE '`(20[0-9]{2}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+)`' .ai-docs/agent-findings/INDEX.md \
  | tr -d '`' | sort -u \
  | while read -r n; do [ -f ".ai-docs/agent-findings/$n.md" ] || echo "$n"; done
```

| Direction                            | Count |
| ------------------------------------ | ----: |
| INDEX rows naming a file not on disk |    64 |
| Findings on disk with no INDEX row   |     9 |
| Findings on disk                     |   320 |
| Population the INDEX header claims   |   380 |

The header's grading table (193 STRONG / 131 SOLID / 16 THIN / 39 STALE / 1 WRONG) sums to that
380, so the shares are stated against a population 60 larger than the directory. Correcting the
headline alone would leave the table incoherent; the two have to move together, which is why
neither has moved.

**The failure mode is specific and it is not cosmetic.** A dangling INDEX row is a one-line summary
of a finding, with no file behind it, sitting beside 311 rows that do have one. It reads as a live
finding an agent may cite — and eleven of the 64 are in the STALE section, whose whole purpose is
telling a reader which findings NOT to act on. A reader who wants the detail greps the basename,
finds only the INDEX row, and cannot tell a deleted finding from a mistyped name.

**Distinct from the prose-citation class.**
`2026-08-18-a-findings-citation-carries-the-fact-and-nothing-checks-it-resolves` covers the 64
citations that the same prune broke in 39 surviving files, and those were repaired one at a time.
The INDEX is not one of the 39: it is the membership registry rather than a citing document, its
64 rows still dangle, and it is the only file where the drift runs in BOTH directions and where a
population count is asserted over the top of it.

`scripts/check-findings-frontmatter.ts` reads every file in the directory and judges its
frontmatter. It has the directory listing in hand and does not compare it with the INDEX, which is
why 320 files can pass while 64 rows dangle.

## Fix Applied

Only for the finding this pass deleted
(`2026-08-18-a-renamed-config-field-drifted-through-seven-documents-unseen`): the file and its
INDEX row were removed together, and a re-grep across `.ai-docs/`, `src/`, `e2e/` and `scripts/`
returns nothing but this sentence — which names it deliberately, as the record of what was removed,
and is the one hit to expect rather than a citation to repair.

The 64 pre-existing dangling rows and the 9 unlisted findings are not touched. Repairing them means
deciding, per row, whether the summary is worth keeping as a record of a deleted finding or should
go — and the header count and its grading table have to be re-derived in the same pass.

## Proposed Standard

**Give the INDEX a registry row of its own.** The membership question is exactly what
`scripts/check-enumeration-drift.ts` answers, and it already reports `namedButAbsent` and
`presentButUnnamed` separately — the two directions above. The directory listing is not a symbol,
so it cannot be a `code-spans` row as written; the cheaper route is a second scan inside
`scripts/check-findings-frontmatter.ts`, which already walks the directory: compare the basenames
it read against the basenames INDEX.md names, and fail on either difference.

**State the deletion protocol where the deleter will read it.** `agent-findings/README.md` has the
resolution model; it has no removal model. One line: a finding is deleted with its INDEX row, and
`grep -rF "<basename>" .ai-docs/ src/ e2e/ scripts/` is run first, because a citing sentence that
needs the fact gets the fact written into it rather than a link to a file that has gone.
