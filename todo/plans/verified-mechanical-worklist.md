# The verified mechanical worklist

**This is the single list.** Every non-feature row that is ready to work, in the order it will be
worked. It is generated from the trackers, which stay canonical — a row is deleted from its tracker
and appended to `archive.md` as it lands, and this file is regenerated. Nothing is ticked off here.

## What "verified" means

A row is **verified** when a read-only pass has reproduced its claim against the tree and recorded the
command that proves it. That bar exists because this backlog does not describe itself: a 112-row
sweep found **41% were not what they claimed** — already done, misdiagnosed, or overturned on
recheck. Rows filed from another agent's report and never re-checked have been wrong on contact at
about the same rate.

**The asymmetry is the argument.** A lane costs about an hour; a verdict costs minutes.

## Order

Trivial and small first, then medium, then the four complex ones last. Within a band, the constraint
is not size but **what may share the tree**: a lane runs alongside another only if their files are
disjoint **and** neither has wide test blast radius. `dist/` is shared however the files are carved
up, so any lane running a suite is exposed to any other lane's build. Documentation-only lanes are
the exception — they never build.

How a row is finished rather than merely fixed is the root [`CLAUDE.md`](../../CLAUDE.md)'s "How
work gets implemented", and is deliberately not restated here — it drifted the last time it stood in
two places.

### The constraints that outlive any one sequencing

Absorbed from `mechanical-backlog-2026-08-22.md` when that file was merged into this one on
2026-08-23. Each is a fact about the rows, not about the order they happened to be written in, so a
regeneration of this list must carry them forward.

- **`CLI-736` then `CLI-730`, and both landed 2026-08-23 in that order.** Kept because it is the
  constraint that held: `CLI-736` changed how every wizard launches and `CLI-730` changed what the
  fixtures underneath them write, so the reverse order would have rewritten every site against a
  launcher that then moved. **`CLI-613` was fenced off from that chain** by `e2e/` file ownership.
- **`CLI-596` and `CLI-692` are one lane, and neither is on this list** — see _Not on this list_
  below. Recorded here because the constraint survives the ruling that unblocks them: same schema
  file, 192 E2E specs on the fixture, so they return together or not at all.
- **`CLI-689` precedes `CLI-557`** where that guard is written end-to-end.
- **`CLI-679` goes last among the documentation rows.** A gate opened while symbols are still being
  deleted opens red and gets deleted, which is the failure mode it exists to prevent.
- **`CLI-547` is unblocked.** Its two predecessors in the id cluster, `CLI-574` and `CLI-680`, landed
  in 0.157.0.
- **Runs alone:** `CLI-689` (a required `globalHome` reddens all 38 call sites), `CLI-613`, `CLI-647`
  and `CLI-652` (wide test surfaces), `CLI-736` and `CLI-730`.
- **`WWW-08` is independent of everything else here** — different workspace, no shared file.

## The list

**Empty as of 2026-08-23.** Every row this list carried has landed or been retired with a reason
recorded in [`archive.md`](../archive.md); the last two, `CLI-736` and `CLI-730`, landed that day.
Nothing outstanding is mechanical — what remains in the trackers is features, deferred items, and
the four branding questions below, none of which this list is for.

Regenerate it from the trackers when a mechanical backlog next accumulates, and carry _The
constraints that outlive any one sequencing_ forward when you do.

## Not on this list

- **Features** — 54 rows, out of scope for this programme.
- **Deferred / Investigate / Needs Assistance** — parked deliberately or needing a decision.
- **Needs Ruling** — four branding questions awaiting the owner: the tagline has no output site, the
  ASCII logo and `--help` line stay hardcoded, the resolver's docstring describes a per-field
  fallback that is per-file, and the interactive dashboard does not follow the configured name while
  the piped one does.
