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

## The list

| Row     | Type     | Size    | What                                                                                            |
| ------- | -------- | ------- | ----------------------------------------------------------------------------------------------- |
| CLI-746 | chore    | trivial | Task ids in FUNCTION-level JSDoc, where only file-level is sanctioned. packages/cli/CLAUDE.md p |
| CLI-778 | chore    | trivial | Two dead surfaces on the agent assertion helpers, both found while deleting a third. (1) expect |
| CLI-789 | chore    | trivial | .ai-docs/reference/commands/index.md fails prettier --check in the working tree, and it makes e |
| CLI-793 | chore    | trivial | A prose count is load-bearing shell for a checker in another file. scripts/check-enumeration-dr |
| CLI-795 | chore    | trivial | The same wrong-numeral defect, in the same file, one comment further down — and BOTH numerals i |
| CLI-796 | test     | trivial | A documentation table stays unbound because the only binding available is the weak one its own  |
| CLI-801 | docs     | trivial | A journey row claims a refusal fires "before the confirm", and without a TTY it never fires at  |
| CLI-806 | docs     | trivial | A journey row's blocker is an environment claim written as an absolute. Row 17 is marked TO TES |
| CLI-814 | chore    | trivial | checkSourceReachable does not pluralise: 1 skills available. Hand-reproduced against a one-skil |
| CLI-817 | chore    | trivial | user-journeys.md was left prettier-red by an uncommitted change, and the next lane inherits the |
| CLI-647 | test     | small   | Five sites carry the ??-between-subject-and-matcher defect; two are exact. Scan run 2026-08-21  |
| CLI-648 | test     | small   | A selector that cannot see the node reads exactly like one that works — and four of five test-t |
| CLI-652 | chore    | small   | Two further compiler-API checks worth building, and five judged not worth it — the reasons are  |
| CLI-742 | chore    | small   | D-220 survives 14 times in SOURCE, and the worst of them sits under the documentation just clea |
| CLI-757 | bug      | small   | A Zod schema and a test compel authors to write prose that nothing renders. requires[].reason i |
| CLI-761 | chore    | small   | Three tables state the same fact about the same skills. SKILL_IDENTITY_FIELDS (e2e/fixtures/pro |
| CLI-770 | test     | small   | A shared E2E helper lives outside the one door CLAUDE.md names, is imported directly by ten-plu |
| CLI-771 | chore    | small   | Two agents running the E2E suite in one checkout cannot both succeed, and three six-minute runs |
| CLI-788 | test     | small   | A recovery message users actually reach has no end-to-end coverage, and the one test naming it  |
| CLI-790 | bug      | small   | One unparseable metadata.yaml in any installed skill kills uninstall before it deletes anything |
| CLI-797 | docs     | small   | Six documentation sites describe the binary guard as reading a git-tracked file, and one of the |
| CLI-802 | test     | small   | One journey cannot be driven by hand at all, and that is worth knowing about the fixture rather |
| CLI-803 | test     | small   | Three journey assertions cannot fail for the reason they name, and one asserts the CLI's own bi |
| CLI-804 | test     | small   | Two journeys discharge their compiled-agent surface with a count, where a swap passes. custom-m |
| CLI-805 | docs     | small   | Two journey rows describe their specs as doing more than the specs do. (1) Row 28a says its spe |
| CLI-807 | test     | small   | Three assertions in journey specs are true of every string, and all three look like template li |
| CLI-808 | docs     | small   | A journey understates its own coverage by two surfaces, and its prose names the wrong one as un |
| CLI-809 | docs     | small   | A journey's from-scratch claim rests on one spec while naming two, and the other is a variant e |
| CLI-810 | test     | small   | A refusal journey proves its negatives with directory listings, which cannot see a rewritten fi |
| CLI-812 | docs     | small   | Two standards the tree has been missing, both surfaced by one pair of defects. (1) An artefact  |
| CLI-813 | test     | small   | The from-scratch heuristic has no vocabulary for a journey whose subject is a directory nothing |
| CLI-815 | test     | small   | An editor consequence of the catalogue fix that was not verified in its own suite. categoryOpti |
| WWW-08  | refactor | medium  | SMALLER after 2026-08-21. The www-side half is done: the header is one component (src/component |
| CLI-557 | bug      | medium  | e2e/lifecycle/config-scope-integrity.e2e.test.ts does not cover what it is named for. Its marke |
| CLI-613 | test     | medium  | 144 of 235 E2E spec files are named by no user-journey row — 61% of the suite (census 2026-08-2 |
| CLI-650 | bug      | medium  | Matrix hygiene, D-214's successor — THREE items, verified 2026-08-22, in this order. D-214's 22 |
| CLI-679 | test     | medium  | Nothing gates a symbol named in .ai-docs/ markdown against the source tree, which is how 51 sta |
| CLI-689 | chore    | medium  | RE-MEASURED and the row's own remedy is the wrong one. 38 expectFourSurfaces call sites across  |
| CLI-692 | test     | medium  | Every relationship-rule spec in the suite tests a configuration no real marketplace can be in.  |
| CLI-547 | chore    | complex | The task-ID backlog: 265 sites, and a sweep scoped to any one sentence will report the class cl |
| CLI-596 | bug      | complex | BLOCKED, and the blocker is a product defect bigger than this row: a marketplace cannot write a |
| CLI-730 | refactor | complex | (was D-168) Audit E2E tests — replace manual file construction with CLI commands.               |
| CLI-736 | refactor | complex | (was D-219) E2E fixture-default ergonomics. [Plan](./plans/CLI-736-wizard-launcher-default-fixt |

## Not on this list

- **Features** — 54 rows, out of scope for this programme.
- **Deferred / Investigate / Needs Assistance** — parked deliberately or needing a decision.
- **Needs Ruling** — four branding questions awaiting the owner: the tagline has no output site, the
  ASCII logo and `--help` line stay hardcoded, the resolver's docstring describes a per-field
  fallback that is per-file, and the interactive dashboard does not follow the configured name while
  the piped one does.
