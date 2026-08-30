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

| ID                                                    | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Status                                                                                                                                                      | Type          | Complexity |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------- |
| EDITOR-07 (was editor-todo "Not designed yet")        | Five surfaces have never been designed — confirm dialog, Share, Settings, states, dark mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Needs Assistance                                                                                                                                            | feature       | complex    |
| EDITOR-09 (new, 2026-08-06)                           | The editor is built from Configurator v5; take the latest Claude Design files instead — programme in [`plans/editor-v6/`](./plans/editor-v6/)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | In Progress                                                                                                                                                 | feature       | complex    |
| EDITOR-22 (new, 2026-08-06)                           | A "custom skills only" filter — provenance is a filter, not a category (owner ruling)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Deferred                                                                                                                                                    | feature       | easy       |
| EDITOR-28 (new, 2026-08-09)                           | Favorite skills (owner: DEFERRED): starring a skill renders it first in the list + a favourites filter joins the filter bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Deferred                                                                                                                                                    | feature       | medium     |
| EDITOR-58 (new, 2026-08-28, 2 of 3 landed 2026-08-29) | **One accessibility defect left of the three axe found in the ASSEMBLED editor — `scrollable-region-focusable`, a scrollable container no keyboard can reach.** The other two landed 2026-08-29: `page-has-heading-one` (an `sr-only` `<h1>` in `route-components.tsx`) and `nested-interactive` (~250 skill cells, fixed by making the cell's operability a sibling `<LatticeCellButton>` rather than the cell itself — the division of affordance `packages/ui/CLAUDE.md` pointed at, not an attribute). This one is live and reproduced: an audit with only `color-contrast` disabled fails on the **output-preview** state at node `.overflow-auto`, so it is a property of a dialog rather than of the resting screen, which is why it outlived the other two. It comes out of the `disableRules` list in `e2e/specs/a11y.spec.ts` as it lands; that list is down to two entries and `color-contrast` is the other one — NOT a pending fix but the permanent 2026-08-07 ruling. Census: `cd apps/editor && bunx playwright test specs/a11y.spec.ts`                                                  | Ready for Dev                                                                                                                                               | fix           | medium     |
| EDITOR-61 (new, 2026-08-29)                           | **A ruled-out skill cell exposes its ••• and both badges as ordinary enabled buttons that silently do nothing.** Found by recertification of EDITOR-58, not by a test, and nothing catches it: the cell surface is `aria-disabled="true"` with `tabIndex -1` and 0.4 opacity, but the controls beside it are neither disabled nor removed, so a screen reader offers three actionable things on a cell the app will not act on. The fix is a decision rather than an attribute — whether an incompatible cell's controls should be absent, disabled, or reachable-and-explaining, which is the same question the scope-error glyph already answered one way                                                                                                                                                                                                                                                                                                                                                                                                                                               | Ready for Dev                                                                                                                                               | fix           | medium     |
| EDITOR-62 (new, 2026-08-29)                           | **The proposal footer says "1 changes".** `totalLabel` in `proposal.tsx` has no singular, and until today nothing could reach it: the footer was only ever rendered for the zero-change proposal, and a comment beside it said so explicitly — "nothing else in this phase produces a count above zero, so the singular is deliberately not invented here". **That comment was the only thing holding the defect shut, and EDITOR-54 wired the model without reopening it**, so the first single-skill answer the model returns reads as broken English in the one place the app asks for confidence. Found by deleting the falsified comment rather than by any test — the composer specs stub two-skill proposals throughout, which is exactly the count that hides it. Fix is the plural rule the codebase already uses elsewhere (`agentSummary` in `skill-cell.tsx` is the model); the test worth writing first is a one-skill proposal, because that is the case no existing spec covers                                                                                                            | Ready for Dev                                                                                                                                               | fix           | easy       |
| EDITOR-63 (new, 2026-08-29)                           | **Two test-side pins that are green against a contract they no longer read.** (1) `e2e/specs/agent-scope.spec.ts` declares its own `const SEED_VERSION = 5` instead of importing it from `@workspace/matrix/seed`, so a contract bump leaves the spec asserting the retired version and passing — the identical line was removed from `sharing.spec.ts` on 2026-08-29 and this one was outside that lane's owned files. (2) `src/lib/api/configs.test.ts`'s `staleBundleHandler` hardcodes a 409 body that has drifted from the worker's: `apps/server/src/index.ts` appends ", and this service serves v${SEED_VERSION}" and the fixture omits it. Harmless today because `configs.ts` branches on status alone — which is the argument for deleting the body rather than mirroring it, since a fixture nobody reads is a claim nobody checks. Both are the same defect wearing two coats: a literal standing where an import belongs                                                                                                                                                                    | Ready for Dev                                                                                                                                               | fix           | easy       |
| EDITOR-50 (new, 2026-08-19)                           | Seven parked editor, server and browser-suite features from the accuracy-programme triage — see [`plans/parked-features-2026-08-19.md`](./plans/parked-features-2026-08-19.md), second section. Each was verified live; each is parked because what remains is a new guard or mechanism rather than a fix. The one worth reading first is the default-refuse network route for the Playwright suite: a spec reached live GitHub and asserted on a third party's data, and while that spec is fixed, nothing stops the next one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Ready for Dev                                                                                                                                               | feature       | complex    |
| EDITOR-55 (new, 2026-08-26)                           | **Responsive below 1300px — no longer design-gated, split out of EDITOR-07.** That row files five surfaces as `Needs Assistance` on the grounds that they share one missing input, a design. For this one the input has ARRIVED: the 2026-08-25 design refresh specifies it — `.app` is a 3-column grid, `min-width: 1240px`, `max-width: 1684px`, centred, and **below the 1300px breakpoint the media block drops `min-width` to 0 and the roster narrows to 250px**, which the design names as the tightest case the agent row's three cycling words plus the agent name have to fit, with the instruction to test the row there rather than at 300px. That is a specification including its own test instruction, and it names precisely the surface Phase A rebuilt. **The editor implements none of it** — zero `@media` blocks in `apps/editor/src` and `packages/ui/src`, and `RootLayout` is `min-w-[85.25rem]`, so the page scrolls sideways rather than reflowing. Note the figure: EDITOR-07 said 1324px; the design says 1300px. Census: `grep -rn '@media' apps/editor/src packages/ui/src` | Ready for Dev                                                                                                                                               | feature       | medium     |
| EDITOR-56 (new, 2026-08-26)                           | **The proposal shows removals by turning the info-panel diagram into a diff — owner ruling, and the removal-row design is already written.** The ruling: _"How are you showing users what will change when they accept the plan? We should reuse the info panel diagram imo. That way it's clear what is being added and removed."_ The diagram is `MatrixGrid` (`packages/ui/src/components/matrix-grid.tsx`), whose only call site today is `skill-options-panel.tsx`. **The design is settled** — `plans/editor-v6/phase-c-spec.md` §11.1 (what a removal row is), §11.9 (`MatrixGrid` gains a read-only mode, a fourth `removed` cva state, and `MatrixAgentCell` hoisted out of the options panel) and §11.10 (the data the renderer needs). **Why this row exists at all:** the ruling was recorded ONLY inside that spec, and the phase owning it is marked landed and retired, so the work was reachable from nothing. **Blocks nothing in Phase C and is not a Phase C defect** — `ProposalGroup.verb` is the closed union `"added"                                                              | "changed"`, so `tsc`refuses a removal rather than drawing one wrongly. Census before starting:`grep -rn 'MatrixAgentCell\|LabelledAgentCell' apps packages` | Ready for Dev | feature    | medium |

---

## Active items

---

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

**On dark mode specifically:** the plumbing landed 2026-08-29 and the palette did not. All 42 core
tokens now carry a dark value under both `prefers-color-scheme` and `[data-theme]`, generated from
`packages/ui/tokens/tokens.json` — but that dark ramp is **the light one read backwards** with four
steps pinned to the filter bar's `band-*` values, which is a first cut to iterate on rather than a
designed palette. What is still owed is the design: the ramp tuned by eye, the `color-contrast`
ruling re-derived (it was measured against the LIGHT palette and does not transfer), Storybook
unpinned from light, and dark added as a mode to the Chromatic and Argos baselines, which today
cover one theme. Settles [`www.md`](./www.md) WWW-01's toggle at the same time.

---

#### EDITOR-09: Build from the latest Claude Design files

The editor was built from `Configurator v5.dc.html` and the five lab files beside it in
`.claude-design/design/`, all dated 2026-08-01. Newer designs exist and the editor should be brought
onto them.

**IN PROGRESS since 2026-08-26.** The programme, its three architecture decisions and its live
dispatch log are in [`plans/editor-v6/`](./plans/editor-v6/). Read
[`plans/editor-v6/README.md`](./plans/editor-v6/README.md) before touching any of this.

**"Latest" is settled: there is no v6.** The whole of `.claude-design/` was refreshed in place on
2026-08-25 — `Configurator v5.dc.html` kept its name and gained ten lab files beside it. So both
stylesheet citations stay honest by filename and neither needed redirecting. `globals.css` did cite a
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
