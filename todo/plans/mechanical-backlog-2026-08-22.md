# The mechanical backlog — sequenced

Every non-feature row that was open on 2026-08-22, verified for relevance, sequenced, and worked
through. **The trackers stay canonical**; this file only orders them and records what each lane
found. A row is deleted from its tracker and appended to `archive.md` as it lands, per the
delete-on-land rule — this file is not a second tracker and nothing is ticked off here.

## Why this file exists

The owner's instruction, 2026-08-22: these rows have been discussed for days without being done.
Investigate whether each is still relevant, delete the ones that are not, sequence the rest, and
execute. The sequencing is the point — the previous attempts failed on ordering, not on effort.

## The two rules that govern the order

**1. A lane runs alone unless it is provably safe to share.** The test is both halves:

- the lanes' files are disjoint, **and**
- neither lane has wide test blast radius.

`dist/` is shared no matter how the files are carved up, so **any lane that runs the E2E suite is
exposed to any other lane's rebuild.** This is not solvable by file ownership. On 2026-08-22 four
lanes independently reported failures in files outside their own diffs — `exit 127`,
`Warning: init is not a agents-inc command`, and one lane watching the suite report 3, then 10, then
6, then 0 failures across four consecutive runs. The dangerous part is that these surface as
assertion failures rather than as build errors, so they read as regressions.

**Documentation-only lanes are the exception.** They touch `.ai-docs/` or `apps/www`, never build,
and never run the E2E suite. One may run alongside any single code lane.

**Read-only verification is also exempt** — it writes nothing and builds nothing.

**2. Every row is finished, not just fixed.** The repository's agreed order, and no step is optional:

1. Write the test first and watch it fail. A test that has never failed has not been shown to test
   anything.
2. Implement until it passes.
3. Apply `meta-design-expressive-typescript` to what was touched.
4. Run it by hand through the real binary. Passing tests and a working command are different claims.
5. Update the documentation the change moved.
6. Delete the row from its tracker, append one line to `archive.md`, update `ROADMAP.md` if a phase
   moved — in the same turn the work lands.

**So a "small" row is rarely one file.** Most touch source, a spec, and a reference document, and
several are gated by `check-enumeration-drift`, which turns a documentation table into a hard gate.
Sequencing that ignores the doc half schedules half a lane.

## Verification standard applied to every row here

This backlog has a measured history of not describing itself: an earlier round found **41% of 112
rows were not what they claimed** — 23 already done, 7 misdiagnosed, 11 verdicts overturned on
adversarial recheck. Two more were found stale on the morning of 2026-08-22 alone.

So no row enters the sequence on its row text. Each carries a verdict — **LIVE**, **DONE**,
**MOOT**, **WRONG** or **PARTIAL** — with the command that produced it. **MOOT is a first-class
verdict and the one most often missed**: the subject was removed from the tree under some other
item, so the work can never be performed. Filing such a row as done records work nobody did; leaving
it open puts dead work back in the backlog. Its archive line says _moot_ and names the item that
removed the subject.

## Status

**Verified 2026-08-22 by three read-only sweeps over 37 rows.** Result: **12 already DONE, 3 MOOT,
5 WRONG or half-false, and every large row's headline figure stale** — nine of eleven figures quoted
from rows were wrong. Those are deleted and archived. **43 mechanical rows survive**, each now
carrying a re-measured figure rather than the one it was written with.

## The sequence

Bands run in order. Inside a band, rows may share the tree only where marked.

### Band 0 — measurement integrity. Nothing else is trustworthy until these land.

| Row                   | Why first                                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLI-686**           | The unit suite's result depends on the developer's shell — `FORCE_COLOR` set gives 15 failures naming missing strings, which read as regressions. It has already corrupted one verification pass and cost two lanes a diagnosis. |
| **CLI-696 → CLI-700** | One unescaped pipe deletes a whole journey row, so six specs read as unclaimed and `spec-gates` is red. Ordered: the pipe fix changes the number CLI-700's roster arithmetic depends on.                                         |
| **CLI-698**           | The ugrep hazard note has been **wrong three times**, and the second wrong version went into every brief of 2026-08-22. Until it is corrected, any lane re-deriving a count can read a silent zero as a clean negative.          |
| **CLI-699**           | STALE — the guard was repointed at `dist/` and now refuses in 924 ms where its absence cost 45 s. Folds into CLI-671.                                                                                                            |

_CLI-686 and CLI-696/700 are parallel-safe: disjoint files, neither rebuilds `dist`._

### Band 1 — the id cluster. Strictly ordered, and each runs alone.

`CLI-574` → `CLI-547` → `CLI-680`

`CLI-574` is the gate of the whole cluster: 27 live `D-NNN` ids (not 35), 144 refs (not 166), and it
**renumbers `CLI-730` and `CLI-736`**, so any brief citing those before it lands names an id that will
not exist. Atomic **per id** — each rename moves its tracker row, its `.ai-docs` citations and its
`changelogs/` citations together, and eleven have a `plans/D-NN-*.md` whose rename breaks the row's
`[Plan]` link unless both move. `CLI-547` follows because 158 of the ids are `D-`. `CLI-680` is a
subset of `CLI-547` and **its stated reason for deferral is false** — zero inbound anchors, measured.

### Band 2 — small correctness. Batches of two or three, files disjoint.

`CLI-693` · `CLI-694` · `CLI-677` · `CLI-656` · `CLI-672` · `CLI-674` · `CLI-676` · `CLI-682` ·
`CLI-685` · `CLI-687` · `CLI-688` · `CLI-689` · `CLI-703` · `CLI-704`

Not parallel-safe within this band: **CLI-676** (`e2e/pages/constants.ts` — every page object imports
it), **CLI-687** (a shared assertion helper with five consumers), **CLI-685** (an `agent.liquid`
change rewrites every compiled agent), **CLI-689** (a required `globalHome` reddens ~30 call sites),
**CLI-674 part 2** and **CLI-672** (shared fixtures). Each of those runs alone.

### Band 3 — the ruled product changes. Alone, each.

| Row                                     | Note                                                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLI-702**                             | Wire up branding (owner ruling). Changes what the CLI prints.                                                                                                                   |
| **CLI-596 + CLI-692**                   | The rules union (owner ruling): a rules file may name the catalogue's skills **or** this marketplace's own. Same schema file — one lane. 192 E2E specs reference the fixture.   |
| **CLI-670**                             | Scope explicitly as _import `installableSeedPayloadSchema` into `config-to-seed.ts`; do not touch `packages/matrix/src/seed.ts`_ — a parked `SEED_VERSION` bump owns that file. |
| **CLI-650** · **CLI-557** · **CLI-649** | CLI-649 is atomic across nine files; splitting it reddens the drift gate. CLI-689 precedes CLI-557 if that guard is written E2E.                                                |

### Band 4 — coverage and census. Each alone; all touch wide test surfaces.

`CLI-613` (175 unclaimed of 244, not 144 of 235 — and 169 once CLI-696 lands) · `CLI-647` (its wider
census is **522 hits**, of which only the `??`-plus-falsy subset is triaged) · `CLI-648` (widening
`no-restricted-syntax` re-lints the package) · `CLI-671` · `CLI-652`

### Band 5 — documentation. One docs lane may run alongside any one code lane.

`CLI-620` · `CLI-636` · `CLI-642` · `CLI-643` · `CLI-690` · `CLI-691` · `CLI-701` · `CLI-705` — then
**`CLI-679` last**, because a gate opened while symbols are still being deleted opens red and gets
deleted, which is the failure mode it exists to prevent.

### Band 6 — the large refactors. Alone, ordered.

`CLI-693` (already in band 2) → `CLI-736` → `CLI-730`. CLI-736 changes how every wizard launches (245 call
sites in 109 files, not 172 in 74); CLI-730 rewrites what specs do after launching (222 sites in 73
files). Running CLI-730 first means rewriting against a launcher CLI-736 then changes. **`CLI-613` is
fenced off from this chain** by `e2e/` file ownership. **`WWW-08` is independent of everything** —
different workspace, no shared file.

## What was deleted, and why

**Verified DONE and archived:** CLI-603, CLI-604, CLI-609, CLI-638 (the four green-for-the-wrong-reason
rows), CLI-632, CLI-616, CLI-653, CLI-654, CLI-683, CLI-675, CLI-646.

**Superseded:** CLI-631 (by CLI-649, which is exact where CLI-631 was wrong by five files) · CLI-640
(folded into CLI-647, which IS its census triage) · CLI-625 (by CLI-698 — **its value was its
measurement and the measurement was wrong**, so it was deleted rather than corrected in place).

**MOOT — subject removed under another item:** three parts of CLI-674 (`resolveClaudeMd`,
`loadSkillsByIds`, `output-validator.ts`). Two of the three went moot **during** the verification,
twenty minutes apart.

**WRONG and deleted rather than rewritten:** CLI-674 part 3 — `StartupMessage["level"]`'s `"info"` has
two production producers, so only one member is unproducible and a one-member colour-table entry is
not worth a row.

## Corrections found while verifying

Recorded per-dispatch in `accuracy-programme-progress.md`. The one that matters most is mine and is
the **third wrong version of the same hazard note**: the ugrep silent-zero has no reliable stated cause —
three have now been given and all three were false. Both previous times the correction was applied to
the finding and not to the instrument — the same root cause as the dead-export census that hid 22
further instances behind a hand-patched result.
