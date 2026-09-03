# Editor — build tracker

Outstanding work on `apps/editor`, the configurator. Its sibling trackers: the site is
[`www.md`](./www.md), the API worker is [`server.md`](./server.md), the CLI is [`cli.md`](./cli.md),
the skills marketplace is [`skills.md`](./skills.md), and everything about deployment, naming and
publishing the repository itself is [`repo.md`](./repo.md).

**An item is deleted when it lands rather than ticked off**, so everything below is still open.
There is no done column and nothing is struck through. Landed items get one line each in
[`archive.md`](./archive.md).

**Rows are one-liners.** Detail lives below the table under the item's ID. Each ID permanently
carries the identifier the item had before this folder existed, because several of them are cited by
number in prose and in source comments and those citations have to stay traceable.

| ID                                                                | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Status                                                                                                                                                      | Type          | Complexity |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------- |
| EDITOR-74 (new, 2026-09-03, measured, left by the EDITOR-73 lane) | **`savedStack` derives its id from the name while the worker mints a UUID, so two stacks both named `Saved stack` collide on `key={saved.id}`.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Ready for Dev                                                                                                                                               | fix           | easy       |
| EDITOR-70 (new, 2026-09-02, found by the EDITOR-67 lane)          | **`listStacks` answers `[]` for a 500 as well as a 401, so an unreadable account is indistinguishable from an empty one.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Needs Assistance                                                                                                                                            | fix           | easy       |
| EDITOR-71 (new, 2026-09-02, left by the EDITOR-67 lane)           | **The new adoption notice is a second `role="alert"` in `main`, one co-occurring state from breaking `importNotice`, and unaudited.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Ready for Dev                                                                                                                                               | test          | low        |
| EDITOR-72 (new, 2026-09-02, left by the EDITOR-66 lane)           | **The e2e README says every locator lives in `pages/`; 55 sites across 15 spec files cannot obey it, because the page objects model only resting states.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ready for Dev                                                                                                                                               | test          | low        |
| EDITOR-07 (was editor-todo "Not designed yet")                    | Five surfaces have never been designed — confirm dialog, Share, Settings, states, dark mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Needs Assistance                                                                                                                                            | feature       | complex    |
| EDITOR-09 (new, 2026-08-06)                                       | The editor is built from Configurator v5; take the latest Claude Design files instead — programme in [`plans/editor-v6/`](./plans/editor-v6/)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | In Progress                                                                                                                                                 | feature       | complex    |
| EDITOR-22 (new, 2026-08-06)                                       | A "custom skills only" filter — provenance is a filter, not a category (owner ruling)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Deferred                                                                                                                                                    | feature       | easy       |
| EDITOR-28 (new, 2026-08-09)                                       | Favorite skills (owner: DEFERRED): starring a skill renders it first in the list + a favourites filter joins the filter bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Deferred                                                                                                                                                    | feature       | medium     |
| EDITOR-58 (new, 2026-08-28, 2 of 3 landed 2026-08-29)             | **One accessibility defect left of the three axe found in the ASSEMBLED editor — `scrollable-region-focusable`, a scrollable container no keyboard can reach.** The other two landed 2026-08-29: `page-has-heading-one` (an `sr-only` `<h1>` in `route-components.tsx`) and `nested-interactive` (~250 skill cells, fixed by making the cell's operability a sibling `<LatticeCellButton>` rather than the cell itself — the division of affordance `packages/ui/CLAUDE.md` pointed at, not an attribute). This one is live and reproduced: an audit with only `color-contrast` disabled fails on the **output-preview** state at node `.overflow-auto`, so it is a property of a dialog rather than of the resting screen, which is why it outlived the other two. It comes out of the `disableRules` list in `e2e/specs/a11y.spec.ts` as it lands; that list is down to two entries and `color-contrast` is the other one — NOT a pending fix but the permanent 2026-08-07 ruling. Census: `cd apps/editor && bunx playwright test specs/a11y.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Ready for Dev                                                                                                                                               | fix           | medium     |
| EDITOR-61 (new, 2026-08-29)                                       | **A ruled-out skill cell exposes its ••• and both badges as ordinary enabled buttons that silently do nothing.** Found by recertification of EDITOR-58, not by a test, and nothing catches it: the cell surface is `aria-disabled="true"` with `tabIndex -1` and 0.4 opacity, but the controls beside it are neither disabled nor removed, so a screen reader offers three actionable things on a cell the app will not act on. The fix is a decision rather than an attribute — whether an incompatible cell's controls should be absent, disabled, or reachable-and-explaining, which is the same question the scope-error glyph already answered one way                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev                                                                                                                                               | fix           | medium     |
| EDITOR-62 (new, 2026-08-29)                                       | **The proposal footer says "1 changes".** `totalLabel` in `proposal.tsx` has no singular, and until today nothing could reach it: the footer was only ever rendered for the zero-change proposal, and a comment beside it said so explicitly — "nothing else in this phase produces a count above zero, so the singular is deliberately not invented here". **That comment was the only thing holding the defect shut, and EDITOR-54 wired the model without reopening it**, so the first single-skill answer the model returns reads as broken English in the one place the app asks for confidence. Found by deleting the falsified comment rather than by any test — the composer specs stub two-skill proposals throughout, which is exactly the count that hides it. Fix is the plural rule the codebase already uses elsewhere (`agentSummary` in `skill-cell.tsx` is the model); the test worth writing first is a one-skill proposal, because that is the case no existing spec covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Ready for Dev                                                                                                                                               | fix           | easy       |
| EDITOR-63 (new, 2026-08-29)                                       | **Two test-side pins that are green against a contract they no longer read.** (1) `e2e/specs/agent-scope.spec.ts` declares its own `const SEED_VERSION = 5` instead of importing it from `@workspace/matrix/seed`, so a contract bump leaves the spec asserting the retired version and passing — the identical line was removed from `sharing.spec.ts` on 2026-08-29 and this one was outside that lane's owned files. (2) `src/lib/api/configs.test.ts`'s `staleBundleHandler` hardcodes a 409 body that has drifted from the worker's: `apps/server/src/index.ts` appends ", and this service serves v${SEED_VERSION}" and the fixture omits it. Harmless today because `configs.ts` branches on status alone — which is the argument for deleting the body rather than mirroring it, since a fixture nobody reads is a claim nobody checks. Both are the same defect wearing two coats: a literal standing where an import belongs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Ready for Dev                                                                                                                                               | fix           | easy       |
| EDITOR-50 (new, 2026-08-19)                                       | Seven parked editor, server and browser-suite features from the accuracy-programme triage — see [`plans/parked-features-2026-08-19.md`](./plans/parked-features-2026-08-19.md), second section. Each was verified live; each is parked because what remains is a new guard or mechanism rather than a fix. The one worth reading first is the default-refuse network route for the Playwright suite: a spec reached live GitHub and asserted on a third party's data, and while that spec is fixed, nothing stops the next one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Ready for Dev                                                                                                                                               | feature       | complex    |
| EDITOR-55 (new, 2026-08-26)                                       | **Responsive below 1300px — no longer design-gated, split out of EDITOR-07.** That row files five surfaces as `Needs Assistance` on the grounds that they share one missing input, a design. For this one the input has ARRIVED: the 2026-08-25 design refresh specifies it — `.app` is a 3-column grid, `min-width: 1240px`, `max-width: 1684px`, centred, and **below the 1300px breakpoint the media block drops `min-width` to 0 and the roster narrows to 250px**, which the design names as the tightest case the agent row's three cycling words plus the agent name have to fit, with the instruction to test the row there rather than at 300px. That is a specification including its own test instruction, and it names precisely the surface Phase A rebuilt. **The editor implements none of it** — zero `@media` blocks in `apps/editor/src` and `packages/ui/src`, and `RootLayout` is `min-w-[85.25rem]`, so the page scrolls sideways rather than reflowing. Note the figure: EDITOR-07 said 1324px; the design says 1300px. Census: `grep -rn '@media' apps/editor/src packages/ui/src` **A design-revision leg arrived 2026-09-02 (owner), and it CONTRADICTS the arrived design rather than extending it**: the skills grid goes to 3 across where the design says 4, `selected` and clear move into a `Filters` dropdown where the design puts them on the domain strip, and the left nav rail shrinks a lot where the design changes only `--npad` below 1300px. **RULED by the owner 2026-09-03: the main column is just wide enough to wrap three cards instead of four.** That settles the floor the design left unstated, and it is the only number below 1300px that was ever missing. Detail and the derivation are below the table. | Ready for Dev                                                                                                                                               | feature       | medium     |
| EDITOR-56 (new, 2026-08-26)                                       | **The proposal shows removals by turning the info-panel diagram into a diff — owner ruling, and the removal-row design is already written.** The ruling: _"How are you showing users what will change when they accept the plan? We should reuse the info panel diagram imo. That way it's clear what is being added and removed."_ The diagram is `MatrixGrid` (`packages/ui/src/components/matrix-grid.tsx`), whose only call site today is `skill-options-panel.tsx`. **The design is settled** — `plans/editor-v6/phase-c-spec.md` §11.1 (what a removal row is), §11.9 (`MatrixGrid` gains a read-only mode, a fourth `removed` cva state, and `MatrixAgentCell` hoisted out of the options panel) and §11.10 (the data the renderer needs). **Why this row exists at all:** the ruling was recorded ONLY inside that spec, and the phase owning it is marked landed and retired, so the work was reachable from nothing. **Blocks nothing in Phase C and is not a Phase C defect** — `ProposalGroup.verb` is the closed union `"added"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | "changed"`, so `tsc`refuses a removal rather than drawing one wrongly. Census before starting:`grep -rn 'MatrixAgentCell\|LabelledAgentCell' apps packages` | Ready for Dev | feature    | medium |

---

## Active items

---

#### EDITOR-72: a page object modelling only a control's resting state pushes lifecycle locators into the specs

`apps/editor/e2e/README.md`'s Layout table says every locator lives in `pages/`. Re-derive the
breach:

```
grep -rnE '\.(getByRole|getByLabel|getByText|getByTestId|locator)\(' apps/editor/e2e/specs --include='*.ts' | grep -v visual.spec.ts
grep -rn 'roster\.root\.getByRole' apps/editor/e2e/specs
```

**Not a rule anybody broke — a rule nobody could obey from where they were standing.** `RosterPanel`
located Save and Share by their RESTING word, while both buttons narrate their outcome through their
accessible name. So the moment a spec asserts anything about a non-resting state, the page object's
locator has stopped matching and the only place left to put the assertion is the spec.

EDITOR-66 closed this for Save by appending a parameterised `saveNarrating(label)`, the shape
`skillRow(name, agentId)` already uses — locator in `pages/`, words in the spec. The remaining
narration sites in `sharing.spec.ts`, `accounts.spec.ts` and `agent-scope.spec.ts` belong to no lane
and are the work here.

**The proposed checker is deliberately narrow** — scoped to `.root.getByRole(` rather than
`getByRole` at large, because the broad form would condemn more correct code than incorrect and get
switched off. Finding:
`agent-findings/2026-09-02-a-page-object-modelling-only-a-controls-resting-state-pushes-every-lifecycle-locator-into-the-specs.md`.

#### EDITOR-55: the main column's floor below 1300px, ruled 2026-09-03

**The owner's ruling: the main column is just wide enough to wrap three cards instead of four.**

This is the number the 2026-08-25 design never stated. Above the 1300px breakpoint it fixes
`.app` at `min-width: 1240px`; below it the media block drops that to 0 and pins only the furniture —
rail 152px, two 24px gutters, roster 250px — leaving the main column unconstrained. A scrutiny pass
asserted "1240 ≤ 1280, so it already fits"; that was **withdrawn 2026-09-02** as the wrong
comparison, because 1240 is the floor ABOVE the breakpoint and does not apply at 1280.

Re-derive rather than trusting these figures:

```
grep -n 'min-width\|--gut\|--npad\|repeat(4\|column-gap' .claude-design/README.md
grep -n 'COLUMNS' apps/editor/src/features/configure/components/domain-section.tsx
```

The derivation, from the design's own numbers. At its stated `min-width: 1240px` the main column is
`1240 − (152 + 60 + 60 + 300) = 668px`, and `.c4` divides that into four columns with three 34px
gaps — so **141.5px is the narrowest card the design itself sanctions.** Hold that card floor and
take one column away:

|                                          | main column | `.app` floor                         |
| ---------------------------------------- | ----------- | ------------------------------------ |
| 3 cards at the sanctioned floor + 2 gaps | 492.5px     | **942.5px** (450px furniture + main) |

**The ruling is generous rather than tight, which is the sanity check that it is right.** At a 1280
viewport the main column gets 830px and each card 254px — **1.8× the width a card has at the
design's own 1240px 4-across floor.** At 1440 it is 307px, at 1470 it is 317px. Three across on a
13-inch screen is not a compromise; it is more room per card than the design gives four across at
its narrowest.

**It needs no new primitive.** `Lattice` in `packages/ui` already declares `grid-cols-1` through
`grid-cols-4`, and `COLUMNS` in `domain-section.tsx` is a single `const` feeding both the lattice and
each cell's `column={index % COLUMNS}` border arithmetic — so the count is already single-sourced.

Still owner-facing, and not settled by this ruling: the `Filters` dropdown for `selected` and clear
(the design puts them on the domain strip), and how far the nav rail shrinks (the design changes only
`--npad` below 1300px). Both contradict the arrived design rather than extending it.

**Gotchas for whoever implements**: the visual suite pins screenshots at 1600×1000 in both themes and
every one will diff, and `a11y.spec.ts` and `sticky-bar.spec.ts` both assert against the current
layout.

#### EDITOR-74: a double narrower than production collapses a key the grid reads

`savedStack` in `packages/api-mocks/src/fixtures.ts` derives `id` from `name`. The worker mints
`crypto.randomUUID()` — re-derive:

```
grep -n 'randomUUID' apps/server/src/stacks.ts
grep -n 'savedStack' packages/api-mocks/src/fixtures.ts
grep -n 'key={' apps/editor/src/features/configure/components/stack-grid.tsx
```

**Every signed-in save is named `SAVED_STACK_NAME`**, so two saves produce two stacks with one id
under the double, and `stack-grid.tsx`'s `key={saved.id}` collides. Measured with a deliberate
`toHaveCount(-1)`: it renders two cells today, on behaviour React documents as unsupported.

**It is the mirror of a lesson already on record.** A double LOOSER than its route cannot fail; a
double NARROWER than production manufactures behaviour production cannot have. The full diff and two
pre-flight checks are in
`agent-findings/2026-09-03-a-double-narrower-than-production-collapses-a-dimension-a-consumer-reads.md`.

#### EDITOR-70: an unreadable account reads as an empty one

`listStacks` in `apps/editor/src/lib/api/stacks.ts` is `if (!response.ok) return []`. Its docblock
justifies exactly one status — a 401 means signed out, which the caller already draws a sign-in
control for — but the guard is total, so a 500 answers `[]` too.

**Adoption keys on `stacks.length === 0`**, so a failed list read against a populated account is
indistinguishable from a first sign-in. Pre-existing and unchanged by EDITOR-67, but that row made
the consequence worse: the adoption notice it added can now tell a user their snapshot is "not in
your account" when the account may hold stacks nobody could read.

**`Needs Assistance` because the fix is a product decision rather than a patch**, and the EDITOR-67
lane correctly declined to invent one: should the grid distinguish "you have no stacks" from "we
could not read your stacks"? Answer that and the code change is small.

#### EDITOR-71: the adoption notice's test surface

Two things the EDITOR-67 lane flagged rather than buried, neither of which it owned.

**A locator one state from breaking.** `configure.importNotice` is
`page.locator("main").getByRole("alert")`, and `main` now draws two possible `role="alert"` nodes.
The states cannot co-occur today — every import spec is signed out — so this is a hazard rather than
a live defect, and it is the CLI-856 class: the red would land on a spec that did not move. The
EDITOR-67 lane located its own assertions by `data-slot` so they cannot be ambiguous, which is the
shape to copy; `importNotice` is what needs narrowing.

**A state with no audit.** The new notice has no `a11y.spec.ts` audit and no `visual.spec.ts`
capture. The e2e README's rule runs one way — every captured state owes an audit, not the reverse —
so the lane was conforming in skipping both, and a `role="alert"` region on an accessibility surface
is still worth auditing once.

#### EDITOR-03: Added skills are session-only

By explicit instruction — this is the current behaviour on purpose, not an oversight.

Persisting them means giving them real catalog entries, which is a marketplace concern rather than
an editor one. That dependency is why the scope is open.

---

#### EDITOR-07: Five surfaces have never been designed

Kept as one grouped item because they share a single missing input — a design — rather than a
single piece of work:

- Confirm dialog visuals. Built in the dialog language, never mocked.
- The Share page and the Settings page.
- Empty, loading and error states. **Responsive was the fifth bullet and is no longer here** — the 2026-08-25 design specifies it, so it left as EDITOR-55.
- Dark mode.

**On dark mode specifically:** the plumbing landed 2026-08-29, the CONTROL landed 2026-08-30, and
the palette still has not. Every core token carries a dark value under both `prefers-color-scheme`
and `[data-theme]`, generated from `packages/ui/tokens/tokens.json`, and the nav rail's footer now
carries the single glyph that writes `[data-theme]` — three states, `system` by default, so a
browser that has never been told still follows the machine. But that dark ramp is **the light one
read backwards** with four steps pinned to the filter bar's `band-*` values, which is a first cut to
iterate on rather than a designed palette. **The toggle landing is what makes the rest of this
urgent rather than theoretical**: until 2026-08-30 a visitor reached the underived palette only by
setting their OS to dark, and now one click does it.

What is still owed is the design: the ramp tuned by eye, the `color-contrast` ruling re-derived (it
was measured against the LIGHT palette and does not transfer), Storybook unpinned from light, and
dark added as a mode to the Chromatic and Argos baselines, which today cover one theme. Settles
[`www.md`](./www.md) WWW-01's toggle at the same time.

---

#### EDITOR-09: Build from the latest Claude Design files

The editor was built from `Configurator v5.dc.html` and the five lab files beside it in
`.claude-design/design/`, all dated 2026-08-01. Newer designs exist and the editor should be brought
onto them.

**IN PROGRESS since 2026-08-26.** The programme, its three architecture decisions and its live
dispatch log are in [`plans/editor-v6/`](./plans/editor-v6/). Read
[`plans/editor-v6/README.md`](./plans/editor-v6/README.md) before touching any of this.

**"Latest" is settled: there is no v6.** `.claude-design/` is refreshed IN PLACE — on 2026-08-25 and
again on 2026-08-30 — and `Configurator v5.dc.html` kept its name both times. So both stylesheet
citations stay honest by filename and neither needed redirecting. **The flip side is that a citation
by filename never rots and a claim about the file's CONTENTS always can**: the 2026-08-30 refresh
added a "Turns 99–107" section to `DECISIONS.md` that reversed two things the programme had recorded
as settled, and its five changes landed the same day as Phase F. `globals.css` did cite a
section that does not exist; A0 landed the correction and it now reads `§ Visual language`. The
sibling in `apps/www/src/styles/site.css` never needed one — it names no section at all.

**Five places where the refreshed design contradicts a shipped contract** are tabled in the
programme README under "What the design file gets wrong about this repository". The contract wins in
every case, and the sharpest is the effort scale: the prototype draws four values spelled
`low, med, high, max` where `EFFORT_NAMES`, `seedEffortSchema` and `AGENT_EFFORTS` all hold five
spelled `low, medium, high, xhigh, max`. Narrowing it would make one stored `xhigh` fail the whole
`safeParse` in `config-store`'s `merge`, discarding a visitor's entire saved configuration and
reporting only to Sentry. An implementer reading the design file alone will get this wrong.

**What the current design already owns**, so the diff is a design question and not an archaeology
one: the collapsed hairline lattice, the type scale, the reserved amber accent (only for what the
user deliberately chose), the sticky filter bar's dark band, and whitespace-not-rules as the section
separator. Those are all recorded in `www.md`'s "Constraints already settled" — a new design that
changes one of them changes it for the site too, since both halves draw from the same tokens.

**Not to be confused with EDITOR-07**, which is the five surfaces that have never been designed at
all. This item is redrawing what exists against newer source; that one is designing what is missing.

---

#### EDITOR-15 to EDITOR-21: the added-skills defect set (custom-skills investigation, 2026-08-06)

**HOME-STRETCH BUCKET (owner, 2026-08-09):** the go-live program is three legs in dependency
order — (1) EDITOR-30 catalog loading + marketplace dialog, (2) THIS intake: external skills
persisted in the payload and installed via `--from` (EDITOR-15-20, category confirm, generated
metadata, universal eject), (3) CLI-462 + EDITOR-31, the edit --ui round-trip. `new skill`
(CLI-453) is explicitly NOT in the bucket.

**Owner priority ruling 2026-08-06: the CLI half of custom skills comes first — the editor URL
is not public, so its live add-skill surface is a non-issue for now. EDITOR-15 to EDITOR-20 are
Deferred until the CLI stages land.** All from the owner-ordered investigation recorded at
[`todo/plans/custom-skills-2026-08-06-investigation.md`](../todo/plans/custom-skills-2026-08-06-investigation.md)
— which also corrects a premise: the add-skill UI is NOT feature-flagged; it is live today. The
flag-guarded feature is the CLI's `cc new skill`. Sharpest defect: EDITOR-15 — `toSeedPayload`
emits `github:` ids the receiving editor prunes and the CLI skips, so the install dialog lists an
added skill and hands over a command that will not install it. Sequencing: these ride Stage 2 of
the investigation's re-enable path, after CLI-406 lands; EDITOR-03's three-way fork (session-only
honest / scaffold instruction / real entries) is the deciding input and its options are recorded
in the investigation file. **Add-skill search design settled 2026-08-08 (owner):** the search
field lives on the add-skills dialog and returns EXTERNAL skills only — never the own catalog
(the grid already is the catalog). Skill-level results with install-proof (the `import skill`
discovery rules), not raw repos; backed by SERVER-01's federated index. External results enter
through the custom-skills intake (eject-only, AI-suggested category, provenance badge), so this
rides the custom-skills stack, not before it.
