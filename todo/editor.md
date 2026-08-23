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

| ID                                             | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Status           | Type    | Complexity |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- | ---------- |
| EDITOR-07 (was editor-todo "Not designed yet") | Five surfaces have never been designed — confirm dialog, Share, Settings, states, dark mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Needs Assistance | feature | complex    |
| EDITOR-09 (new, 2026-08-06)                    | The editor is built from Configurator v5; take the latest Claude Design files instead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Ready for Dev    | feature | complex    |
| EDITOR-10 (new, 2026-08-05)                    | The agents grid has no researcher row — the roster's fifth role (CLI-351 landed 2026-08-05)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Investigate      | feature | complex    |
| EDITOR-22 (new, 2026-08-06)                    | A "custom skills only" filter — provenance is a filter, not a category (owner ruling)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Deferred         | feature | easy       |
| EDITOR-28 (new, 2026-08-09)                    | Favorite skills (owner: DEFERRED): starring a skill renders it first in the list + a favourites filter joins the filter bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Deferred         | feature | medium     |
| EDITOR-50 (new, 2026-08-19)                    | Seven parked editor, server and browser-suite features from the accuracy-programme triage — see [`plans/parked-features-2026-08-19.md`](./plans/parked-features-2026-08-19.md), second section. Each was verified live; each is parked because what remains is a new guard or mechanism rather than a fix. The one worth reading first is the default-refuse network route for the Playwright suite: a spec reached live GitHub and asserted on a third party's data, and while that spec is fixed, nothing stops the next one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Ready for Dev    | feature | complex    |
| EDITOR-51 (new, 2026-08-21)                    | **The error colour is an unsettled choice, not a designed one — flagged by the agent that shipped it rather than left to be discovered.** EDITOR-08's scope marker uses `text-destructive`, which is declared in `globals.css` but **has never been drawn anywhere in this app**. The design's palette carries no error colour at all, and amber is reserved for what the user deliberately chose, so it could not be borrowed. This is the smallest honest choice available and it wants a designer's eye. **Not a new gap:** EDITOR-07 already lists _"empty, loading and error states"_ among the five surfaces never designed — this is the first one to actually ship, which makes it the concrete instance to design against rather than a hypothetical. The glyph itself is settled and needs no design: it is the options panel's info glyph with the stem and dot swapped — same circle, same 12px, same stroke — because the design ships no icon set beyond the GitHub mark, so drawing it is what that panel already does. | Needs Assistance | feature | easy       |

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
- Empty, loading and error states.
- Responsive below 1324px.
- Dark mode.

**On dark mode specifically:** `packages/ui` declares a dark variant but ships no dark colours for
it. That is the same gap that forced the documentation site to drop its theme toggle
([`www.md`](./www.md) WWW-01), so designing this once settles both.

---

#### EDITOR-09: Build from the latest Claude Design files

The editor was built from `Configurator v5.dc.html` and the five lab files beside it in
`.claude-design/design/`, all dated 2026-08-01. Newer designs exist and the editor should be brought
onto them.

**Before starting, settle what "latest" means**, because this repository cites the design by
filename in two stylesheets (`packages/ui/src/styles/globals.css` and `apps/www/src/styles/site.css`
both name `Configurator v5`) and those citations only stay honest if the file they name is the one
actually implemented. A v6 arriving alongside v5 rather than replacing it means deciding which is
canonical and updating both citations with it.

**What the current design already owns**, so the diff is a design question and not an archaeology
one: the collapsed hairline lattice, the type scale, the reserved amber accent (only for what the
user deliberately chose), the sticky filter bar's dark band, and whitespace-not-rules as the section
separator. Those are all recorded in `www.md`'s "Constraints already settled" — a new design that
changes one of them changes it for the site too, since both halves draw from the same tokens.

**Not to be confused with EDITOR-07**, which is the five surfaces that have never been designed at
all. This item is redrawing what exists against newer source; that one is designing what is missing.

---

#### EDITOR-10: The agents grid gains a researcher row

CLI-351 (landed 2026-08-05 — see [`archive.md`](./archive.md)) unified the roster: five roles —
developer, pm, **researcher**, reviewer, tester — across web, api, ai and cli. The editor's agents
panel and `default-assignments.ts` were built against the earlier four-role field, so the three new
non-researcher agents (`ai-pm`, `ai-tester`, `cli-pm`) light up cells that already exist — but
`ai-researcher` and `cli-researcher`, and the existing `web-researcher` / `api-researcher`, have no
row to land in.

The roster now exists and is wired on the CLI side, so this is actionable: extend the grid to the
fifth role, decide whether `default-assignments.ts` reaches researchers by default, and reconcile
with the design source — the four-role field is what `screens/04-skill-panel.png` draws, so a
fifth row diverges from the design file unless EDITOR-09 brings a newer one that includes it.

The 2026-08-06 web-hardcode audit pinned the exact surfaces and the consequence: `ROLE_COLUMNS`
(`skill-options-panel.tsx:32-37`) and `CORE_ROLES` (`lib/default-assignments.ts:20`) both hardcode
the four-role list, so **researchers silently receive zero assignments today** — this changes what
installs, not just what renders. When fixing, derive roles from the matrix package's
`SubAgent.flavor` instead of a literal list — with one trap: the flavor for pms is `planning`
(the CLI's directory name) while the ids end `-pm`. Related, lower priority:
`read-model/sub-agents.ts:36-38` infers an agent's domain by splitting the id on `-` because the
authoritative `agentDefinedDomains` (the `domain` field in agent `metadata.yaml`) is unpopulated —
when roles become data-driven, populating that CLI-side field kills the last inference.

**Split executed 2026-08-06 (owner approval):** the behavioral half — `CORE_ROLES` data-driven so
researchers are assignable — was fixed immediately and is no longer this item. What remains here
is the design-gated half only: the grid's fifth column, against a design file that draws four.

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
