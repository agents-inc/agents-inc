---
type: audit
severity: medium
affected_files:
  - packages/cli/scripts/check-finding-citations.ts
  - todo/cli.md
  - todo/archive.md
  - todo/plans/CLI-450-source-switching-removal-map.md
standards_docs:
  - .ai-docs/standards/briefing.md
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-21
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

Nothing yet — this is the measured answer to whether CLI-623's proposed gate can be built, taken
before building it. The verdict is that its scoping rule does not do what the row expects, and the
reason is not a tuning problem.

**The row's premise holds.** `scripts/check-finding-citations.ts` really does check only finding
BASENAMES; nothing anywhere resolves the symbol names sitting in the same rows. The five wasted
dispatches the row cites are real and the cost is real.

**Its proposed scoping does not hold.** The row scopes the check by saying a tracker row may
legitimately name a symbol that does not exist YET, so the useful signal is a symbol that USED to
exist and no longer does — "which git can answer". Git answers a different question. `git log -S`
and a patch scan both match a NAME appearing in any removed line, anywhere in the repository, at any
point in history. They do not match the row's subject. Two consequences, both measured:

**1. A proposed symbol is flagged, which is precisely the class the scoping rule exists to spare.**
`todo/cli.md` proposes a shared `e2e/helpers/config-reader.ts` "exposing typed accessors —
`readProjectSkills`, `readProjectStack`, `readProjectAgents`, `readProjectDomains`, or a single
`readProjectConfig`". None of the five exists; none is meant to yet. All five are flagged, because
each name has appeared in some removed line somewhere across seven workspaces of history. `envFlag`
in the same tracker is the same shape — a helper the row asks somebody to write.

**2. The filter selects FOR documents whose job is to record a removal.** A row that correctly says
a thing is gone is the row most likely to name a symbol that used to exist and no longer does, so it
is flagged by construction and there is no repair that keeps the sentence. This is not a fringe
case; it is most of the population. `todo/archive.md` is the record of what landed. `todo/plans/CLI-450-source-switching-removal-map.md`
is, in its own title, a removal map. `todo/cli.md` -> CLI-579 is flagged for
`AgentDefinitionOptions` by a sentence whose words are "a type that no longer exists". Two of the
five dispatches the row itself cites — D-307 ("all five symbols it names are at zero occurrences")
and D-214 — are flagged whether their rows are right or wrong, so the check cannot separate the
cases it was written to separate.

This is `check-finding-citations.ts`'s own `.ai-docs/` ruling arriving one directory over: a row
naming an absent thing is sometimes the only record that the thing existed, and a scan over that
tree reports the archive as the defect.

## Census

Every figure is a whole-population measurement taken 2026-08-21, and each is re-derivable from the
commands below rather than quoted. Extraction: backticked tokens in `todo/**/*.md` carrying a case
transition (camelCase, PascalCase, or SCREAMING_SNAKE), which is what excludes ordinary prose words
in backticks. "Present today" is a token scan across `packages/**` and `apps/**` over every
extension that can declare or name a symbol — narrowing that set to `packages/cli` alone inflates
the candidate list by about half with editor symbols, which was this audit's own first error.

| Scope                                          | Cited | Absent today | Git says it existed |
| ---------------------------------------------- | ----: | -----------: | ------------------: |
| All of `todo/` (trackers, archive, plans)      |  1754 |          517 |                 117 |
| Live trackers only (no `archive.md`, no plans) |   258 |           20 |                  17 |

```
grep -rhoP '`[A-Za-z_$][A-Za-z0-9_$]*`' todo --include='*.md' | sort -u | wc -l
git log -p --format= --no-renames --unified=0 | grep -c '^-'
```

The whole-`todo/` row is unusable on its face: roughly a quarter of its 117 are illustrative code in
the vendored contestant documents under `todo/plans/D-162-skill-olympics/` (`Contact`, `Engineer`,
`canEdit`, `UserProfile`), and others are third-party or configuration names that were never this
repository's symbols at all — `QueryClient`, `useFormStatus`, `peerDependenciesMeta`, `TURBO_TOKEN`,
`MONOREPO_DISPATCH_TOKEN` (a secret in a different repository, named by a row saying it does not
exist).

The live-tracker row is the most favourable scope available, and it is the one that settles it.
Reading all 17 by hand: **at most 4 are the defect the row is about** — `extractAgentKeys`,
`parseConfigArrays` and `parseSkillEntries` are local spec parsers a row asks someone to delete and
which are already gone, and `SOURCE_HEADER_NAMES` may be a fourth. Five are the proposed accessors
above, four are sentences correctly recording an absence, and the rest are foreign names. **Roughly
24% precision at best, with the misses concentrated in exactly the class the scoping rule promised
to protect.**

## Why No Gate Was Written

Because a 24%-precision gate over `todo/` acquires an exclusion list in its first week, and an
exclusion list is a snapshot of one moment — the failure mode the whole class is about. The
briefing contract's own rule applies: a guard that can be satisfied without doing the thing is worse
than none, and a hardening verdict of "no honest gate exists, because …" is worth more.

It is also the same shape as the sibling audit filed hours earlier,
`2026-08-21-resolving-every-backticked-name-would-have-missed-the-defect-that-asked-for-it`, which
found that resolving every backticked name in `.ai-docs/` both misses the defect that asked for it
and reports the sentence that caught it. Two independent measurements, one for documents and one
for tracker rows, reaching the same conclusion: **existence is not the predicate.**

## What Would Actually Work

Two instruments, neither built here, both stated so the next attempt does not restart from the
refuted one.

**A symbol paired with a PATH is checkable, and a bare symbol is not.** Where a row writes
`` `CORE_ROLES` (`lib/default-assignments.ts`) `` it makes a claim with a location in it, and the
claim can be resolved against that file with the machinery `check-enumeration-drift.ts` already
has — no history, no name collisions, no judgement about intent. This is the same conclusion the
sibling audit reached from the other end ("existence AT THE NAMED LOCATION is the predicate"), and
its proposed `table-pairs` subset verdict is plausibly the same instrument serving both.

**Or make the citation explicit, as `{@link}` already is for source comments.** A row that wants its
symbol checked writes it in a form that says "resolve this", and a backtick keeps meaning prose.
That is a convention decision rather than a script, it only binds rows written after it is adopted,
and it needs an owner ruling — the same ruling shape as CLI-629.

## Proposed Standard

None yet, deliberately. What this finding asks for is that CLI-623 not be dispatched again in its
current form, since re-deriving it costs an agent the same measurement each time. The row's premise
should be kept and its mechanism replaced by one of the two above.
