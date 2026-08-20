# Roadmap — the order of everything outstanding

A sequencing view over the six per-workspace trackers. **The trackers stay canonical** — rows live
there with their detail, land there, and archive there; this file only orders them and is updated
whenever a phase moves. IDs link back by grep.

**Every row named here exists in a tracker.** If a phase needs something, it is listed by ID rather
than described in prose — a phase that reads as startable must actually be startable.

**Updating this file is step 6 of the lifecycle, not a tidy-up.** It once ran a full day stale while
eleven of its twenty rows landed, which would have told a fresh session the programme had not
started. See the root `CLAUDE.md`.

---

## Where we are — 2026-08-19 (CLI rows re-measured; the editor rows are the 2026-08-17 figures and have not been re-run since)

**The Go-Live program is COMPLETE. All three legs are done and every gate is green.** Nothing is
committed: the working tree carries the whole programme plus the day's fixes, uncommitted, by the
owner's standing instruction that commits are authorised one round at a time.

| Suite                                  | State                                        |
| -------------------------------------- | -------------------------------------------- |
| CLI unit                               | 6,993 passed / 0 failed                      |
| CLI e2e                                | 842 passed / 0 failed                        |
| Editor unit                            | 13 files / 293 passed                        |
| Editor playwright                      | 259 passed (was 193 at the start of the day) |
| tsc / eslint / prettier / matrix:check | clean across every workspace                 |

`generate:schemas:check` is RED and has been all day: the gate is `git diff --exit-code src/schemas/`
and the working tree carries an uncommitted `source` → `marketplace` rename. It goes green at the
commit round, not before.

**Twenty-four rows were retired on 2026-08-17**, six of them closed by proof rather than by a patch —
work that had already been done, been superseded, or never needed doing. `archive.md` carries all of
them with the reasoning.

## What may break, and what may not (owner ruling, 2026-08-16)

A standing ruling. It decides how much compatibility work is worth doing, so read it before
designing around a migration.

| Surface                   | May break                                                                       |
| ------------------------- | ------------------------------------------------------------------------------- |
| **The editor**            | **Entirely.** Nobody uses it and nobody knows it exists                         |
| **Shared config ids**     | **Yes.** Minted links may stop resolving; saved browser stacks may be discarded |
| **Existing CLI installs** | **Yes.** A user's config may need a hand edit, or a reinstall                   |
| **The CLI itself**        | **NOT completely.** A few real people run it; it must still start and work      |

**Intermediate states may be broken.** A half-landed programme is allowed to leave the tree red, a
shared id dead, or an install needing repair. What matters is the END state: everything working,
every gate green.

**So do not build migrations, compat shims or dual-read fallbacks** unless the CLI would otherwise
stop working for someone mid-flight. Discard-don't-migrate is already the seed contract's policy and
is the right instinct everywhere else too — a loud failure that names the fix beats a silent
fallback that hides it. CLAUDE.md's standing ban on backward-compatibility shims is the same rule
from the other direction.

**What this does NOT license:** shipping a state nobody can recover from. When a change breaks an
existing install, the CLI must say so in a way that names the fix — CLI-501's renamed-key guard is
the model: it refuses, names the old key and the new one, and the repair is a one-line edit.

**And the site is not urgent.** `/skills` is live, nobody is reading the docs, so a wrong page
misleads no one — weight doc work by what it unlocks, not by who it inconveniences today.

---

## What happens next — the order is the owner's

Three phases, and the second must not start before the first finishes.

### Phase 1 — the remaining fixes — **DONE 2026-08-17/18**

All seven landed, and they surfaced three more rows along the way (CLI-521 and CLI-522 during the
work, CLI-523 and CLI-524 from the journeys pass). See `archive.md`.

### Phase 2 — the user-journeys pass — **DONE 2026-08-18**

**33 of 39 journeys walked by hand, 19 claims, every one holding.** The harness is
`e2e/handrun-journeys.ts` + `scripts/handrun.mjs`, built on the suite's own page objects and
fixtures; each further journey is 10–15 lines.

**The CLI failed no journey.** Every failure in the pass was the harness or the invocation, twice
because a product guard correctly refused what the harness asked for.

Left unwalked: journeys 25, 26 and 27, which are browser-side and cannot close a CLI row by the
page's own rule.

### Phase 2b — the eight rows phases 1 and 2 surfaced — **DONE 2026-08-18**

The from-scratch gate, the hand-run pass and the findings reconciliation each left follow-ups. All
eight are retired; detail in `archive.md` under this date.

| Row       | What it was                                                                                |
| --------- | ------------------------------------------------------------------------------------------ |
| CLI-527   | Journey 7's arc had never run end to end — written, and journey 9 closed with it           |
| CLI-528   | The from-scratch gate declined to judge six entries, silently                              |
| CLI-530   | Eight places where the code was fixed and the prose still asserted the old behaviour       |
| CLI-531   | The enumeration-drift checker, filed five times in eighteen days and never built           |
| CLI-532   | `no-self-compare` repo-wide, and the vacuous-comparison widening measured before it landed |
| EDITOR-45 | The own-config restore door pruned the saved selection silently                            |
| EDITOR-46 | The crawl received every skill's size and discarded it                                     |
| EDITOR-47 | A verification note carrying a count nine days stale                                       |

**Three of them found more than they were filed for**, which is the part worth carrying forward:

- **A renamed symbol had inverted behaviour, not just a name.** `globallyInstalledKept` →
  `globallyInstalledRemoved` took a field off `KeptFromRoundTrip`, a parameter off
  `reconcileSharedConfig`, and split one plan into two. Four documentation tables were rebuilt rather
  than renamed. A count check could not have seen it: both totals read 32 against 33, and the real
  defect was three names.
- **An editor e2e spec was asserting a third party's file size.** It reached live `api.github.com`
  with no content stub and passed on the SIZE refusal rather than the "cannot be read" refusal it
  names. It only surfaced because EDITOR-46 gave `docx` its honest weight. Filed as EDITOR-48 — the
  spec is fixed, the missing network guard is not.
- **A spec asserted the silence while the same run logged the loss.** `toBeHidden()` on the exact path
  the app was reporting a six-id prune on, one line apart in the same output.

Two rows came out of it: **EDITOR-48** (no network guard on the editor's Playwright suite) and
**CLI-533** (a one-sentence owner ruling on what `seed-contract.md`'s "Refusals it carries" row
counts).

### Phase 2c — the accuracy programme — **COMPLETE 2026-08-19**

A fourth phase followed the first three, on an owner ruling that **a guard is not a feature**: 54 of
the 58 findings parked as "new work" were returned to scope and executed. See `archive.md` under this
date. It found nine live defects and left the registry at 62 bound rows (counted inside the `REGISTRY` array; the file holds 90 occurrences of `claim:`, and the difference is type declarations, return literals and `claim: string` parameters).

The documentation was re-derived from source across 51 documents on the assumption that all of it was
wrong, and the 382-finding corpus was graded, re-audited and pruned. Both are in `archive.md` under
those dates. The programme then ran in three phases:

- **Phase A — the worklist.** D1–D8 and M1–M20 from [`plans/accuracy-worklist.md`](./plans/accuracy-worklist.md),
  executed across sixteen briefs. **Every one of the sixteen executing agents corrected something in
  its own brief**, which is the single most useful measurement the programme produced.
- **Phase B — all 39 user journeys, walked by hand.** Thirty-six through the CLI harness, two in the
  browser, one closed by construction. It found **two shipped defects that 6,777 unit, 810 e2e and
  297 Playwright tests were all blind to**: a `share` → `init --from` round trip that produced an
  identical config but a different compiled agent, and every editor-minted custom-marketplace id
  being uninstallable (**EDITOR-49**). Neither suite could see either one, for the same reason in
  both cases — each test built both ends of the comparison with the same producer.
- **Phase C — the remaining findings.** 294 triaged with 33 classifications refuted on re-check.
  Fixes landed in seven groups; 131 findings were deleted; the rest are parked as **CLI-554**
  (3 features, after the guards-are-not-features ruling returned 54 of the original 58 to scope), **EDITOR-50** (7), and **CLI-555** (12 open rulings).

- **Phase D — the session's own output audited, then verified, then fixed.** Three audits (docs,
  tests, journeys) against the assumption that the session's own changes were wrong, on the same
  principle the programme had just applied to everything else. Every finding was then re-verified by
  an agent that was not allowed to fix it, which refuted five and saved two wrong actions. It closed
  with two guards — the drift checker learned to read a table's VALUES (CLI-585), and every wizard
  keypress now asserts the frame is wholly on screen (CLI-586). **The second guard immediately found
  a shipped defect the owner had reported and the orchestrator had failed to reproduce**: a warning
  raised during store hydration went to stderr under a painted frame and was pushed off the top. Nine
  e2e specs across five files were losing the same three lines. Fixed at the buffering window rather
  than at the call sites, so both warning arms and both `init` and `edit` are covered by
  construction. All 36 CLI-drivable user journeys were then re-run by hand: 163 verdicts, none
  failed.

**None of it blocks Phase 3.** Everything was a correction, a guard or a deletion. Every gate in the
repository is green and nothing is committed — the tree carries the whole programme, by the owner's
standing instruction that commits are authorised one round at a time.

### Phase 3 — the commit round

Not before phases 1 and 2. Follow `packages/cli/.ai-docs/standards/commit-protocol.md`. The owner
authorises each round explicitly; never commit unprompted.

---

# Track A — the critical path — **COMPLETE 2026-08-17**

Kept as a record of what shipped and in what order. Every row is retired; the detail is in
`archive.md` under its date.

| Phase     | What it delivered                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| **A0**    | `source` → `marketplace` on the user-facing surface (CLI-501, CLI-463)                                                  |
| **A1**    | Marketplace-namespaced skill ids, closing the collision class by construction rather than by guards (CLI-498)           |
| **Leg 1** | The editor loads a marketplace in the browser, browser-direct against the `catalog.json` that `build marketplace` emits |
| **Leg 2** | External skills survive the trip from the editor into an install — whole directories inline, both directions            |
| **Leg 3** | The round trip: `edit --ui` out, `edit --from` back, destructive and interactive, proven an identity                    |

**The three findings worth carrying forward**, because each cost a rework and each will recur:

- **A provider seat that is correct everywhere except at import time is not a seat.** Two
  module-scope bindings would have frozen the vendored catalogue no matter how correct the store was.
- **`authoritativeScope` protects the config row, not the disk.** The removal _diff_ drives the
  deletions, and a producer that bypasses the wizard store is the first for which those two must be
  made to agree deliberately.
- **A second producer joining an existing sequence inherits neither the first's refusals nor a
  re-costing of its harmless outcomes.** A skip is free into a clean directory and is a deletion over
  an installation.

---

## Explicitly NOT in the program

Owner rulings, recorded so they are not re-litigated:

- **`new skill` (CLI-453)** — go live without it (owner 2026-08-09). When built it mimics the
  editor's intake flow, which is why it waits for that flow to settle, not the other way round.
- **`new agent`** — not returning.
- **The org-hosted editor instance** — a future option contingent on adoption.

---

# Track B — nice to have, blocks nothing

Real work and worth doing. **None of it gates go-live.** Grouped by kind, unordered within each
group; pick up whatever suits the session.

## The end-game renames

Parked "to the very end" so they would follow a clean commit. That condition is met, but **meeting
it made them available, not required** — these are cosmetic-to-internal consistency wins with no
user-facing capability behind them. Best done as one batch: they touch overlapping surfaces and
re-auditing twice is waste.

**CLI-463 left this group on 2026-08-16** — it is vocabulary-coupled to A1 and moved to Track A. D-118
and CLI-425 are not, and stay here.

| ID          | What                                                                                                                                                                             | Status   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **D-118**   | **Rename project/global scope to project/user** — "global skills" become "user skills" throughout. Nice to have, never a blocker                                                 | Deferred |
| **CLI-425** | Skill-id/category alignment, 33+ sites — a skill id always includes its category. **Re-audit post-taxonomy before executing**; list at `plans/CLI-425-id-category-violations.md` | Deferred |

## Queued by the owner for their own session

- **CLI-473** — delete the init hook's dead `sourceConfig` plumbing; no readers anywhere.
- **SERVER-03** — the share-link attribution route; the CLI's user-agent half already ships. Know
  what the number is worth first: the GET is served immutable, so the count is a floor, not a census.

## Correctness rows carried out of pass 5

| ID          | What                                                                                                                                                   | Status                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| **CLI-492** | Align init / edit / compile on CLI-only agent definitions — a source-defined agent name can enter the generated unions from one path and never compile | Ready for Dev                |
| **CLI-496** | The global source-migration propagation defect on the narrower path — nothing tests it today, its only spec is `describe.skip`                         | Ready for Dev                |
| **CLI-475** | One unknown category silences every operational `doctor` check — the content-errors-first skip is unconditional                                        | Ready for Dev                |
| **CLI-477** | Nothing enforces that every `defaultRules` slug exists in the default catalog (invariant 4)                                                            | Ready for Dev                |
| **CLI-470** | Uninstall honesty legs 2–3: the body-comment provenance marker and the marker-driven sweep (leg 1 landed)                                              | **On hold — owner calls it** |

## Docs and test hygiene

- **CLI-493** — the codex-keeper doc batch: M-2's three sites, the badge notation, the
  `plugin marketplace update` correction, two CLI-479 drifts (phantom hotkey constants, `STEP_TEXT`
  count 139 → 149).
- **CLI-497** — `SOURCE_ROW_WALK_LENGTH` is fixture-sized (12); a larger source under-walks and
  passes vacuously.
- **D-235** (uncovered `buildProjectTypesExtras` branch) · **D-219** (fixture-default ergonomics) ·
  **D-168** (E2E setup via CLI commands, not hand-built files) · **D-111** (stable test identifiers)
  · **D-64** (a CLI E2E testing skill).

## The site

The site is deployed and `/skills` is live. **With no audience, wrong documentation misleads nobody**
— so none of this is urgent, and it is cheapest to write the docs once the go-live legs have settled
what they describe rather than twice.

Two rows are defects rather than gaps, and are what to fix first whenever this lane comes up:
**WWW-04** (three pages tell readers to run `new skill` / `new agent` / `new marketplace` — all off,
and `new agent` is never coming back) and **WWW-10** (the docs claim 7 domains; there are 9).

Then the build-out: **WWW-01** (5 of 10 sidebar sections) · **WWW-02** (5 of 12 landing blocks) ·
**WWW-03** (apex path split) · **WWW-06** (empty video slots — needs your recordings) · **WWW-07**
(the two halves do not read as one product) · **WWW-08** (the shared header was never extracted).

## The editor, beyond go-live

**EDITOR-02** (one 1.07 MB chunk, nothing code-split) · **EDITOR-05** (descriptions describe the
library, not the skill — fix is upstream in the CLI) · **EDITOR-08** (a project-scoped skill can be
assigned to a global sub-agent that cannot resolve it) · **EDITOR-22** (a "custom skills only"
filter — provenance is a filter, not a category) · **EDITOR-28** (favourites) · design-gated:
**EDITOR-07** (five never-designed surfaces) / **EDITOR-09** (rebuild from the latest Claude Design
files) / **EDITOR-10** (the researcher row, against a design file that draws four).

## Housekeeping

**`MONOREPO_DISPATCH_TOKEN`** in the skills repo — until it exists the catalog-regen automation does
not fire (`repository_dispatch` reads the token, not the workflow), so a marketplace merge still
wants the catalog regenerated by hand here. State unconfirmed as of 2026-08-16; check before
assuming either way. · **CLI-467** (the knip deletion rounds against the recorded baseline) ·
**REPO-37** (dependency-cruiser graph + one architecture assessment) · **REPO-24** (drop the
`@agents-inc/cli/config` jiti alias — with no installed base, this is now a free deletion whenever
you want it) · **REPO-07** (delete the old web monorepo — a judgement about how long you want the
safety net) · **REPO-09** (a local `.env` can ship a live site pointed at your own machine) ·
**D-237** (README GIF).

## Waiting on an owner signal

**SKILLS-01** + **CLI-405** (adapter migration, ~160 skills) · **SKILLS-09** (the observability setup
skill is Next-only in all but name) · **D-280** (prune built-in stacks) · **SERVER-01** registry
adapters (each lands only with hand-verification against the live registry) · **SERVER-02**
(`packages/api` + mocks — worth more as SERVER-01/03 add surface) · **CLI-453** (`new skill`).

## The long tail

`cli.md` carries roughly a hundred further rows — wizard UX polish (CLI-311 to CLI-316), expressive-
TypeScript decisions (CLI-324 to CLI-330), agent-roster work (CLI-380 to CLI-384), telemetry
(D-170, D-90), and the older feature backlog (D-08, D-13, D-25, D-26, D-41). **This roadmap does not
replicate them and is not trying to** — the tracker is canonical. They surface here only when
something promotes them into a leg above.
