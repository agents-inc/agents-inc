---
type: architectural-drift
severity: medium
affected_files:
  - packages/matrix/src/skill-index.ts
  - apps/server/src/crawl.ts
  - apps/editor/src/lib/api/skill-contents.ts
  - apps/editor/src/features/configure/components/add-skill-dialog.tsx
  - packages/matrix/src/seed.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: web-developer
category: architecture
domain: shared
root_cause: missing-rule
status: partial
partial_note: >-
  The code-side fix landed in full on 2026-08-18 (EDITOR-46); the Proposed Standard below has not
  been written into any standards document, so this is the inverse of the enum's documented
  direction. Landed - `skillIndexEntrySchema` gained a required `bytes` field, `crawl.ts` sums blob
  sizes under each skill directory from the tree it already fetches (zero extra requests),
  `SKILL_INDEX_KEY` was bumped to `skill-index:v2` per the ruling, and the add-skills dialog marks
  and refuses an oversized row where the visitor first sees it. Pending - the rule in section 2
  below (a producer publishing a catalogue must carry whatever its consumers need in order to
  REFUSE an entry) still belongs beside the wire-contract guidance in
  `standards/documentation-bible.md`, and the checkable corollary in section 3 (two modules
  narrowing the same upstream endpoint with two different local schemas) has no home yet.
---

## What Was Wrong

EDITOR-45 opens by asserting that "the index already carries the sizes it would need to say so
first". **It does not.** `skillIndexEntrySchema` in `packages/matrix/src/skill-index.ts` declares
exactly five fields — `name`, `description`, `repo`, `path`, `stars` — and no byte count of any
kind. Nothing downstream can mark a search row as unaddable, because nothing downstream knows how
big the row is.

The interesting part is not the absence. It is that **the producer already holds the number and
throws it away**, and the proof is that a sibling module reads the same bytes and keeps it.

Both modules call the same GitHub endpoint, `GET /repos/{repo}/git/trees/{ref}?recursive=1`, and
each narrows the response with its own local `treeSchema`:

| Module                                      | Its `treeSchema` keeps               | Consequence                                                  |
| ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| `apps/server/src/crawl.ts`                  | `truncated`, `tree[].path`           | sizes discarded at the only point they are free              |
| `apps/editor/src/lib/api/skill-contents.ts` | `truncated`, `tree[].path/type/size` | sizes kept, and the cap answered before a byte is downloaded |

`skill-contents.ts` even documents the property the crawl is discarding: _"Sizes are the tree's own,
so the cap is answered before a single byte is downloaded."_ The crawl's `fetchSkillDirectories`
already receives those same sizes in the same response — it maps the tree to `entry.path` and drops
the rest. Summing the blob sizes under each skill directory there would cost **zero additional
requests**.

The visible effect is the one the tracker row describes. `MAX_EXTERNAL_SKILL_BYTES` is 262,144
(`packages/matrix/src/seed.ts`), and five of the indexed skills are past it — `canvas-design`
(5.4 MB), `pptx` (1.14 MB), `docx` (1.10 MB), `xlsx` (1.10 MB), `claude-api` (0.94 MB). Because the
size is unknown until the editor does its own listing, the refusal cannot arrive until
`fetchSkillContents` runs at confirm — after search, stage, categorise, confirm and a full tree
listing. A visitor spends the entire funnel on a row that was never addable, and the index that
offered it was in a position to say so.

There is a second, sharper edge in `resolveStaged` (`add-skill-dialog.tsx`): it is all-or-nothing
and returns the _first_ failure, so one oversized skill refuses the whole batch. Staging four good
skills and `docx` loses all five to one message.

**Why this is drift rather than a missing feature.** The index contract and the per-skill cap were
designed apart. The index was specified as "enough to show a result, and enough to fetch it
afterwards" — a reasonable brief that nobody checked against the refusals its consumer would go on
to make. The cap was specified in the payload schema, where it is enforced correctly. Neither
document is wrong on its own terms; the gap is that no rule required them to meet.

## Fix Applied

**2026-08-18 — the code-side fix landed under EDITOR-46.** What is written below was true when this
finding was filed; it is kept as the record of how the defect was reached, and the frontmatter's
`partial_note` states what has since changed. The design it proposed was implemented unaltered: a
required `bytes` on `skillIndexEntrySchema`, summed in `crawl.ts` from the tree listing already in
hand, the KV key bumped rather than the field made optional, and the refusal moved to the search
row. Neither editor-side workaround was used, and the late refusal in `skill-contents.ts` remains
the authority — the two now share one predicate and one phrase (`isPastCarryLimit`,
`carryLimitRefusal`) so they cannot drift.

The `resolveStaged` edge this finding flagged as "a second, sharper edge" is now unreachable from
the UI rather than fixed: an oversized skill cannot be staged, so it can no longer take four good
ones down with it. `resolveStaged` itself is untouched and still all-or-nothing on first failure,
which is correct for the failures that remain (unreadable, unreachable, not-text).

---

**Originally filed as: none — discovery only, and deliberately so.** The task instruction was to establish the premise
from the index's own shape _before_ designing, and to say so rather than invent a fetch if it did
not hold. It does not hold, so no size-telling was implemented.

Both editor-side workarounds were considered and rejected as invented fetches:

- **Resolve contents at stage time.** Downloads every file of a skill the visitor may never
  confirm — much heavier than asking its size.
- **List the tree at stage time, download at confirm.** Costs a second listing per staged skill
  against the 60-requests-an-hour an anonymous browser gets, to recover a number the producer
  already had.

The honest fix is at the producer, and it needs a ruling because it crosses two workspaces and has
a deploy-ordering hazard (below).

## Proposed Standard

**1. The concrete fix, for whoever takes the ruling.** Add a byte count to
`skillIndexEntrySchema`, populate it in `crawl.ts` by summing blob sizes under each skill directory
from the tree it already fetches, and let the search row and the staged row read it.

Note one hazard that must not be skipped: the published index in KV was built by the current crawl
and carries no such field, so a **required** field would make `skillIndexSchema.safeParse` reject
the live index and the add-skills dialog would show "the skill index is unreadable" until the daily
Action republished. Either make the field optional, or bump the KV key — `skill-index.ts` already
records that "a shape change is handled by bumping the KV key", which is the documented answer and
the one to follow.

**2. The rule that would have prevented it.** No document says that a producer serving a list must
carry whatever its consumers need in order to _refuse_ an entry in it. That is the missing rule, and
it is narrow enough to state precisely:

> Where one component publishes a catalogue of things and another applies a hard limit to them, the
> limit's input belongs in the published contract. A refusal that can only be computed after the
> consumer does its own fetch arrives at the end of the funnel by construction, and the funnel is
> the part the user pays for.

This belongs beside the wire-contract guidance the schema file already carries in its header
comment, and is worth a line in `standards/documentation-bible.md` where shared contracts between
workspaces are described — `skill-index.ts` is explicitly a three-party contract (the Action, the
worker, the editor), so it is exactly the shape the rule is about.

**3. A checkable corollary.** Two modules narrowing the _same_ upstream endpoint with two different
local schemas is the mechanical signature of this defect. `crawl.ts` and `skill-contents.ts` both
declare a `treeSchema` over `git/trees`. A reviewer noticing that pair would have asked why one
keeps `size` and the other does not, which is the whole finding.
