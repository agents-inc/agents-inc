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

## Where we are — 2026-08-20 (CLI e2e re-measured; CLI unit, tsc/eslint/prettier re-run 2026-08-20; the editor rows are the 2026-08-17 figures and have not been re-run since)

**The Go-Live program is COMPLETE. All three legs are done and every gate is green.**

**The tree is no longer uncommitted — that changed on 2026-08-20.** The whole programme landed in a
release round ending at `155f0662` (0.156.1, the focus walk looking before it presses), and the
working tree was clean immediately afterwards. This section said "nothing is committed" for weeks
before that; if it says so again, it is stale.

**In flight as of 2026-08-20: the seventeen-ruling round.** The owner settled every open ruling in
one pass — the twelve in [`plans/open-rulings-2026-08-19.md`](./plans/open-rulings-2026-08-19.md)
plus CLI-538, CLI-590, CLI-591, CLI-592 and CLI-595. Six closed with no work needed, four of those
because the premise was checked and found narrower than written. The rest are in implementation.
**The decisions are recorded in the plan file, not here** — this roadmap orders work; it is not the
decision record.

All CLI figures below re-measured 2026-08-20 on a clean tree with nothing rebuilding `dist/` —
which matters, because every intermediate reading taken during the ruling round was corrupted by
concurrent rebuilds swapping tsup's hashed chunks under a running suite. Any E2E number quoted from
mid-round is noise, not a regression.

| Suite                             | State                                                  |
| --------------------------------- | ------------------------------------------------------ |
| CLI unit                          | 181 files / **7,059 passed, 0 failed**                 |
| CLI e2e                           | 230 files / **847 passed, 0 failed** (7 expected-fail) |
| Editor unit                       | 13 files / 293 passed — 2026-08-17 figure, not re-run  |
| Editor playwright                 | 259 passed — 2026-08-17 figure, not re-run             |
| tsc / eslint / prettier           | clean                                                  |
| schemas / types / matrix `:check` | all three green                                        |

`generate:schemas:check` was RED all through the programme — the gate is
`git diff --exit-code src/schemas/` and the tree carried an uncommitted `source` → `marketplace`
rename. **The commit round it was waiting for has happened and the gate is GREEN** — re-run
2026-08-20: `✓ src/schemas matches what the generator emits`.

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

## The browser is reachable from a cold start — CLOSED 2026-08-24

Both rows landed, and with them the idea they shared: **`--ui` opens whatever `--from` names, and
the command's own subject when `--from` is absent** (owner ruling 2026-08-24). One rule, both
commands.

- **CLI-622 — LANDED.** `init --ui` opens the editor from a directory with nothing installed.
- **CLI-621 — LANDED.** `init --ui --from <id>` and `edit --ui --from <id>` open that id. The pair
  used to be refused as "two directions of one round trip"; `SHARED_CONFIG_ONE_DIRECTION` is
  deleted. The `edit` form needs no installation at all — opening an id reads no local state.
- **`share --stdin` landed beside them**, unrostered: a configuration the CALLER holds becomes an
  id without an installation or a file on disk, which is the door `meta-config-stack-detect` had
  none of. Its snapshot of the wire contract was found stale at `v: 3` against a live `v: 5`
  `z.literal` — so every payload it emitted was already being refused — and is now corrected.

What is left of the cluster is nothing. `share --stdin --ui` was considered and declined (owner,
2026-08-24): publishing stays a visibly separate step from opening.

## The end-game renames

Parked "to the very end" so they would follow a clean commit. That condition is met, but **meeting
it made them available, not required** — these are cosmetic-to-internal consistency wins with no
user-facing capability behind them. Best done as one batch: they touch overlapping surfaces and
re-auditing twice is waste.

**CLI-463 left this group on 2026-08-16** — it is vocabulary-coupled to A1 and moved to Track A. CLI-727
and CLI-425 are not, and stay here.

| ID          | What                                                                                                                                                                             | Status   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **CLI-727** | **Rename project/global scope to project/user** — "global skills" become "user skills" throughout. Nice to have, never a blocker                                                 | Deferred |
| **CLI-425** | Skill-id/category alignment, 33+ sites — a skill id always includes its category. **Re-audit post-taxonomy before executing**; list at `plans/CLI-425-id-category-violations.md` | Deferred |

## Queued by the owner for their own session

- **CLI-473** — delete the init hook's dead `sourceConfig` plumbing; no readers anywhere.
- **SERVER-03** — the share-link attribution route; the CLI's user-agent half already ships. Know
  what the number is worth first: the GET is served immutable, so the count is a floor, not a census.

## Correctness rows carried out of pass 5

| ID          | What                                                                                                                                                   | Status        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| **CLI-492** | Align init / edit / compile on CLI-only agent definitions — a source-defined agent name can enter the generated unions from one path and never compile | Ready for Dev |
| **CLI-496** | The global source-migration propagation defect on the narrower path — nothing tests it today, its only spec is `describe.skip`                         | Ready for Dev |
| **CLI-477** | Nothing enforces that every `defaultRules` slug exists in the default catalog (invariant 4)                                                            | Ready for Dev |

## Docs and test hygiene

### The green-for-the-wrong-reason census — 2026-08-22

Seven classes were found over this programme; five had never been censused, and were each found
incidentally while doing something else. That is not evidence they were isolated. The census settles
it: **two classes are worth a gate, three are not, and one has no further instances at all.**

- **CLI-657 → CLI-658** — eleven dead exported symbols carry **116 test invocations**; `installEject`
  alone carries 35 across six specs while `init.tsx` calls `lib/operations/` instead. **CLI-657
  first** — a gate run before the delete-or-wire decision rosters every one as an allowed exception
  and makes it permanent.
- **CLI-663 → CLI-664** — the roster-of-producers that is a hand-written subset. The one gate here
  worth building unconditionally: the property is syntactic and the tree already holds four correct
  implementations to copy.
- **CLI-659** · **CLI-660** · **CLI-661** · **CLI-662** — one-off cleanups. Deliberately no gate: the
  false-positive rates are 97%, 75% and semantic respectively, and a weak gate is worse than none.
- **CLI-665** — a finding's frontmatter contradicting its own body.
- **CLI-655 is closed on a clean negative** — no further half-redirected mocks exist, and the reason
  is that the class was closed at its cause rather than policed at its symptom.

**The finding that generalises**: every class genuinely closed was closed by _removing its subject_ —
constants became functions, a page object became closed-loop, a fixture gained a deliberate
divergence. Gate only where no subject can be removed.

- **CLI-493** — the codex-keeper doc batch: M-2's three sites, the badge notation, the
  `plugin marketplace update` correction, two CLI-479 drifts (phantom hotkey constants, `STEP_TEXT`
  count 139 → 149).
- **CLI-497** — `SOURCE_ROW_WALK_LENGTH` is fixture-sized (12); a larger source under-walks and
  passes vacuously.
- **CLI-596** — all ten E2E fixture skill slugs are already claimed by the default catalogue, so a
  fixture skill has no slug identity in the ~14 mixed-configuration specs. Inert today (no product
  reader of `getSkillBySlug` or `idToSlug`); armed for the first one.
- **D-235** (uncovered `buildProjectTypesExtras` branch) · **CLI-726** (stable test identifiers) ·
  **CLI-723** (a CLI E2E testing skill).

## The site

The site is deployed and `/skills` is live. **With no audience, wrong documentation misleads nobody**
— so none of this is urgent, and it is cheapest to write the docs once the go-live legs have settled
what they describe rather than twice.

One row is a defect rather than a gap, and it is the cheapest thing here: **WWW-11** (the CLI README
links `guides/importing-skills.md`, a guide deliberately deleted when `import skill` retired — the
fix is deleting the row, not writing the page back). It is live on the published npm page.

Two rows are missing gates rather than missing work, and both were filed after a hand-diff found
something no checker could have: **WWW-12** (`check-cli-claims.ts` reads one page while CLI claims
now live on several) and **WWW-13** (nothing gates the search modal's styling, and it mounts at
runtime so even a computed-style check has to open the modal first). Neither blocks anything; both
are the kind of row that only gets written while the memory of the defect is fresh.

Then the build-out: **WWW-02** (5 of 12 landing blocks, and the catalogue teaser — the centrepiece —
is not one of them) · **WWW-03** (apex path split — **the repository half landed 2026-09-01**; what
remains is a Cloudflare dashboard move, a token scope, and an acceptance pass against the real
hostname, so it is now blocked on the owner rather than on work. **It is also blocked on REPO-41**,
because CI has deployed nothing since 2026-08-30) ·
**WWW-01** (what is left of it — the reference is per-group rather than per-command, and there is no
Releases section) · **WWW-06** (empty video slots — needs your recordings).

**WWW-01 shrank on 2026-08-27** when the site went from 19 pages to 37 and from five sidebar groups
to nine — Configuration, The editor, Recipes and Troubleshooting joined, and the exhaustive
`.claude-src/config.ts` field reference closed what that row called the single largest gap on the
site. One of its bullets was **withdrawn rather than done**: the owner ruled that the older
README-linked guides carry the correct voice, which is the reverse of what the row asserted, so a
future pass must not "fix" them. WWW-04, WWW-07, WWW-08 and WWW-10 all landed and were removed from
the tracker; this line named them for a fortnight after they had.

## In flight — the editor v6 design programme (started 2026-08-26)

**EDITOR-09** is no longer design-gated: the design folder was refreshed in place on 2026-08-25 and
the programme is running. Phases, decisions and the live dispatch log are in
[`plans/editor-v6/`](./plans/editor-v6/) — **that folder is canonical for this work, not this
section**, which only orders it.

| Phase                                                                                                                                                           | Rows      | State                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A — chrome and roster: design tokens, the effort word, the roster group-by toggle, the collapsible stack header, the roster hinge header, the ink token rename  | EDITOR-09 | **Landed**                                                                                                                                    |
| B — the output preview: a shared pure renderer the CLI's write path also calls, then the dialog                                                                 | EDITOR-52 | **Landed and retired** — extraction verified by imports, not intent                                                                           |
| C — the docked composer, UI only                                                                                                                                | EDITOR-53 | **Landed and retired** — shipped in a shape the row never described: no modes                                                                 |
| D — the composer's AI backend                                                                                                                                   | EDITOR-54 | **LANDED 2026-08-29** and retired — `POST /compose` calls Claude, the composer is wired to it, and Turnstile was replaced by required sign-in |
| E — the proposal diagram: `MatrixGrid` becomes a diff, so a proposal can draw a REMOVAL                                                                         | EDITOR-56 | **Ready for dev** — owner-ruled and fully designed in `phase-c-spec.md` §11.1/§11.9/§11.10                                                    |
| F — the 2026-08-30 design refresh: sign-in up the rail, the theme glyph, domain titles as tabs, the filters out of the search field, the composer's new drawing | EDITOR-09 | **LANDED 2026-08-30** — five items in one session, no dispatch; it REVERSED the composer's starter chips, which Phase C had shipped           |

**Phase F is why "there is no v6" is not the same as "the design is fixed".** The folder is
refreshed in place, so the citation never rots and the claim always can: two of the programme's own
recorded rulings were reversed by the 2026-08-30 refresh, and a brief quoting the plan rather than
re-reading `DECISIONS.md` would have rebuilt what the refresh had just cut. **Re-read the design
folder before dispatching against it**, whatever this roadmap or that plan says.

**Phase E exists because a ruling went missing.** The diagram ruling was recorded only inside Phase
C's spec, and Phase C is retired — so until 2026-08-26 the work was reachable from no tracker and no
roadmap. It was listed after D by dependency-freedom rather than by need; D has since landed.

**EDITOR-10 (the researcher row) LANDED 2026-08-26** and is retired. Its stated gate — "a fifth
column diverges from a design file that draws four" — had expired without anyone noticing: the code
drew TWO, because CLI-398/CLI-399 consolidated the per-domain reviewer and PM, so adding researchers
moved the panel toward the design rather than away. The skill options panel now places all 18
sub-agents; it placed 14.

## The editor, beyond go-live

**EDITOR-22** (a "custom skills only"
filter — provenance is a filter, not a category) · **EDITOR-28** (favourites) · design-gated:
**EDITOR-07** (five never-designed surfaces).

## Housekeeping

**`MONOREPO_DISPATCH_TOKEN`** in the skills repo — until it exists the catalog-regen automation does
not fire (`repository_dispatch` reads the token, not the workflow), so a marketplace merge still
wants the catalog regenerated by hand here. State unconfirmed as of 2026-08-16; check before
assuming either way. · **CLI-467** (the knip deletion rounds against the recorded baseline) ·
**REPO-37** (dependency-cruiser graph + one architecture assessment) · **REPO-40** (`packages/api-mocks` describes the worker for one workspace out of ten; `apps/server` and `packages/cli` each re-implement `/configs`) · **CLI-737** (README GIF).

## The editor's open rows this file did not carry

Added 2026-08-29 after an audit found the roadmap listing five archived ids and none of the editor's
newer ones. EDITOR-51 was here for a few hours and is archived — the error colour was chosen the
same day. **EDITOR-55** (responsive below 1300px) · **EDITOR-58** — now ONE accessibility defect, not
three: `nested-interactive` and the missing `h1` landed 2026-08-29, and `scrollable-region-focusable`
is live on the output-preview state, which is why it outlived them · **EDITOR-61** (a ruled-out cell
offers three controls that do nothing) · **EDITOR-62** (the proposal footer says "1 changes" — the
model is wired now, so the count that was unreachable is reachable) · **EDITOR-63** (two literals
standing where imports belong).

## Waiting on an owner signal

**SKILLS-01** + **CLI-405** (adapter migration, ~160 skills) · **SKILLS-09** (the observability setup
skill is Next-only in all but name) · **CLI-739** (prune built-in stacks) · **SERVER-01** registry
adapters (each lands only with hand-verification against the live registry) · **CLI-453**
(`new skill`).

**SERVER-02 landed 2026-08-29** — one configured client in the editor, mocks and unit coverage
for the three newest worker clients. The lane declined to create `packages/api` and **the owner
overruled that on the same day**, on the measured grounds that the bundle cost was negligible; the
workspace exists, and `apps/server/src/index.ts`'s `AppType` is imported by it and by nothing else.

## The long tail

`cli.md` carries roughly a hundred further rows — wizard UX polish (CLI-311 to CLI-316), expressive-
TypeScript decisions (CLI-324 to CLI-330), agent-roster work (CLI-380 to CLI-384), telemetry
(CLI-731, CLI-725), and the older feature backlog (CLI-714, CLI-716, CLI-718, CLI-719, CLI-720). **This roadmap does not
replicate them and is not trying to** — the tracker is canonical. They surface here only when
something promotes them into a leg above.
