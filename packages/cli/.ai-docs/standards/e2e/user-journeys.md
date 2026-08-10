---
last_validated: 2026-08-10
---

# Canonical user journeys

The list of journeys the CLI must prove it can perform end to end, and what a spec has to assert
before it counts as proving one. Every E2E spec belongs to a journey on this page; a journey with
no from-scratch spec is a hole in the suite regardless of how many variant specs branch off it.

**Audience:** whoever writes or reviews an E2E spec, and whoever decides what to test next.

**Sources.** Journeys 1–11 are the flows driven by hand in
[`todo/plans/cli-flow-verification-2026-08-08.md`](../../../../../todo/plans/cli-flow-verification-2026-08-08.md)
and its [re-run](../../../../../todo/plans/cli-flow-verification-rerun-2026-08-08.md).
Journeys 12–17 were named by the owner on 2026-08-08, and journeys 18–22 on 2026-08-09. The
coverage column is re-derived from the
[CLI-444 audit](../../../../../todo/plans/CLI-444-e2e-strictness-audit.md), whose journey map links
here.

---

## What "from-scratch" means

A **from-scratch** spec starts with nothing on disk at the relevant scope, drives the real binary
(the wizard through a PTY, or a non-interactive command), and asserts observable output. A spec
that begins from a `ProjectBuilder`-written config is a **variant** — legitimate for covering a
branch, never sufficient to prove the journey is reachable.

## The four assertion surfaces

**Owner mandate, 2026-08-08.** A journey spec asserts on all four surfaces below. One missing
surface makes the spec incomplete by definition, however strong its other assertions are — each
surface fails independently of the others, and three of the four have shipped a defect the others
were green through.

| #   | Surface              | What it is                                                                | Read it with                                                                                                  |
| --- | -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Compiled agent files | `.claude/agents/*.md` at each scope the journey touches                   | `readCompiledAgents`, `listFiles(agentsPath(dir))`, `toHaveAgentFrontmatter`, `toHaveAgentDynamicSkills`      |
| 2   | CLI rendered output  | what the user saw — wizard frames and command stdout/stderr               | `getOutput()` on a step page object, `CLI.run().output`, `STEP_TEXT`                                          |
| 3   | Written `config.ts`  | the configuration the run persisted, at every scope it could have written | `loadConfigOrFail` / `readSkillEntries` + `toStrictEqual`; raw bytes when proving something did NOT move      |
| 4   | `config-types.ts`    | the generated type surface the config is checked against                  | `readTestFile(configTypesTsPath(dir))`, or `type-check-probe.ts` for "a bad value must still be a type error" |

Surface 4 is the one specs skip. It is not decoration: the aliases are what make a hand-edited
`config.ts` fail loudly instead of silently, so a journey that changes the installed skill set and
does not re-check them has not proved the install is still coherent.

**Negative form.** For a scope a journey must NOT touch, the same four surfaces are asserted
byte-identical (or absent) rather than skipped. "Nothing changed here" is a claim and needs
evidence.

---

## Coverage vocabulary

| Marker                   | Meaning                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| **COVERED**              | A from-scratch spec exists and is named                                                           |
| **COVERED (this round)** | Closed during CLI-444 remediation; the spec is named                                              |
| **PARTIAL**              | A from-scratch spec exists but does not assert all four surfaces — the missing surfaces are named |
| **TO TEST**              | No from-scratch spec. Deliberately not written this round                                         |
| **PARKED**               | Owner ruling: the implementation is changing, so no spec work happens here                        |

---

## Journeys 1–11 — the hand-verified flows

| #   | Journey                                                                                                                                                                    | From-scratch spec                                                                                                                                                                                | Surfaces asserted | Status                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Global install from nothing, eject mode (stack → domains → skills → sources → agents → confirm)                                                                            | `lifecycle/global-scope-lifecycle`, `interactive/init-wizard-stack`; `fixtures/dual-scope-helpers.initGlobalWithEject` drives it for ~30 lifecycle specs                                         | 1, 2, 3, 4        | **COVERED (this round)** — surface 4 closed by probing the generated pair at BOTH scopes at the end of `global-scope-lifecycle`'s scope-split install. Both, because the project's aliases extend the global ones: a global union that degraded to `string` absorbs the project's literals and neither file looks wrong alone |
| 2   | Selecting a stack installs exactly that stack's skill and sub-agent roster                                                                                                 | `interactive/init-wizard-stack-roster` (config + screen), `interactive/init-wizard-stack-install-coherence` (all four)                                                                           | 1, 2, 3, 4        | **COVERED (this round)** — the roster spec compares the installed roster against the stack definition; the coherence spec adds the compiled files on disk, the ejected skill directories and the generated pair. Both derive the expectation from `E2E_STACK` itself rather than from a second hand-written list              |
| 3   | Setting up a project over an existing global install — a fresh pick during a project edit stays project-scoped                                                             | `lifecycle/project-edit-fresh-pick-scope-override` (CLI-442)                                                                                                                                     | 1, 2, 3           | **PARTIAL** — global scope proved byte-identical; surface 4 **TO TEST**                                                                                                                                                                                                                                                       |
| 4   | Scope toggle for a skill, G→P and P→G                                                                                                                                      | `lifecycle/dual-scope-collapse-and-restore-via-s`, `lifecycle/tombstone-cleanup-PtoG-restoration`, `lifecycle/dual-scope-in-session-collapse-restore-sequence`                                   | 1, 2, 3           | **PARTIAL** — surface 4 **TO TEST**                                                                                                                                                                                                                                                                                           |
| 5   | Install-mode toggle eject↔plugin                                                                                                                                           | `lifecycle/install-mode-bulk`, `lifecycle/install-mode-full-cycle` (bulk); `lifecycle/install-mode-per-skill`, `lifecycle/mixed-mode-skill-ref-format` (per-skill)                               | 2, 3              | **PARTIAL** — `source-switching-modes` asserts only the narration; the resulting install mode on disk (surface 1) and `config-types.ts` (surface 4) are **TO TEST**                                                                                                                                                           |
| 6   | A second project inherits the global install                                                                                                                               | `lifecycle/project-tracking-propagation`, `commands/compile-project-scope-containment` (builds both projects through the wizard)                                                                 | 1, 2, 3, 4        | **COVERED**                                                                                                                                                                                                                                                                                                                   |
| 7   | A global edit propagates to every registered project                                                                                                                       | `lifecycle/edit-global-agent-removal-propagation`, `lifecycle/edit-global-source-toggle-propagation-compiled-ref`                                                                                | 1, 2, 3, 4        | **COVERED**                                                                                                                                                                                                                                                                                                                   |
| 8   | A project edit removes the project half of a `[P][G]` pair and stays contained                                                                                             | `lifecycle/project-edit-removes-project-half-of-pair` (CLI-443), `commands/compile-project-scope-containment` (CLI-438)                                                                          | 1, 2, 3, 4        | **COVERED (this round)** — surface 4 closed in the named spec, in both forms: the project's regenerated pair is probed (its skill set changed) and the global `config-types.ts` is asserted byte-identical beside the global `config.ts` it already pinned                                                                    |
| 9   | A stack's picks are editable — deselect a stack skill, select a non-stack one                                                                                              | `lifecycle/stack-per-agent-curation`, `lifecycle/edit-remove-one-of-many-skills-stack-cleanup`, `lifecycle/edit-remove-last-skill-stack-cleanup`                                                 | 1, 2, 3           | **PARTIAL** — surface 4 **TO TEST**                                                                                                                                                                                                                                                                                           |
| 10  | `update` — eject-only install (no-op plus the ownership line)                                                                                                              | `commands/update`, `lifecycle/install-update-source-drift`                                                                                                                                       | 2, 3              | **COVERED** for the eject branch. The **marketplace-refresh success branch has no E2E** — it needs a real marketplace registered in the run's fake HOME and the real Claude CLI; `commands/update`'s JSDoc records the reasoning and the branch is unit-tested. **TO TEST** (blocked)                                         |
| 11  | Generated-file integrity after every mutating step — `config.ts` re-loads, `compile` leaves `config-types.ts` byte-identical, no compiled agent changes, `doctor` is clean | `commands/compile-config-types-refresh`, `lifecycle/init-edit-compile-roundtrip`, `lifecycle/project-scope-config-types-union-collapse`, `lifecycle/global-narrowing-keeps-project-config-green` | 1, 2, 3, 4        | **COVERED** — this journey is the only one where surface 4 is the subject rather than an afterthought                                                                                                                                                                                                                         |

## Journeys 12–17 — owner-named

| #   | Journey                                                                                                                                                                               | From-scratch spec                                                                                                                                                                   | Surfaces asserted                                                                          | Status                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | Stack selection determines the stack **and** generates a valid config — the picked stack's skills and agents land, and the generated `config.ts` / `config-types.ts` pair type-checks | `interactive/init-wizard-stack-install-coherence`                                                                                                                                   | 1, 2, 3, 4                                                                                 | **COVERED (this round)** — one from-scratch run asserts the declared roster in config, on disk and in the compiled files, then that the written config type-checks against its own types AND still rejects a bogus literal, at both scopes                                                                                                        |
| 13  | `init --from <id>` installs a shared configuration                                                                                                                                    | `commands/init-from-shared-config` + `init-from-agent-scope`, `init-from-scenarios-curation`, `init-from-scenarios-install`, `init-from-scenarios-tuning`, `init-from-revalidation` | 1, 2, 3                                                                                    | **PARTIAL** — surface 4 **TO TEST** across all seven files                                                                                                                                                                                                                                                                                        |
| 13a | `init --from` refuses on an existing install                                                                                                                                          | `commands/init-from-greenfield`                                                                                                                                                     | 2, 3 (both proved byte-identical), plus a control proving the refusal is not unconditional | **COVERED** for the refusal; surfaces 1 and 4 are asserted as unchanged, which is the right form here                                                                                                                                                                                                                                             |
| 13b | `init --from` where the shared configuration includes global-scoped content                                                                                                           | `commands/init-from-agent-scope` (agent scope asserted at both destinations)                                                                                                        | 1, 2, 3                                                                                    | **PARTIAL** — surface 4 **TO TEST**                                                                                                                                                                                                                                                                                                               |
| 14  | Deleting a config under a live install — the user removes `.claude-src/config.ts` and the CLI recovers rather than misreporting                                                       | `lifecycle/global-config-deleted-under-install`, plus the project-scope orphan row in `commands/doctor-diagnostics`                                                                 | 1, 2, 3, 4                                                                                 | **COVERED** — a real install, its config deleted, then `doctor` / `compile` / `edit` / `list` / `init` driven over the leftovers. `doctor` now names every stranded skill and agent as unowned, at both scopes; the `it.fails` that pinned the old skip is a positive assertion                                                                   |
| 15  | Changing scope for a **skill**, both directions, both scopes                                                                                                                          | see journey 4                                                                                                                                                                       | 1, 2, 3                                                                                    | **PARTIAL** — surface 4 **TO TEST**                                                                                                                                                                                                                                                                                                               |
| 16  | Changing scope for a **sub-agent**, both directions                                                                                                                                   | `lifecycle/agent-scope-toggle-agents-array`, `lifecycle/dual-scope-agent-badge-and-s-collapse`, `interactive/edit-agent-scope-routing`                                              | 1, 2, 3                                                                                    | **PARTIAL** — surface 4 **TO TEST**                                                                                                                                                                                                                                                                                                               |
| 17  | Changing install mode at **both** scopes — a global-scoped skill and a project-scoped skill switched in the same install                                                              | `lifecycle/dual-scope-same-source-eject`, `lifecycle/dual-scope-same-source-plugin` cover both cells of the source matrix, each at one scope                                        | 2, 3                                                                                       | **TO TEST (blocked)** — the switch is eject↔plugin, so driving it needs a real `claude plugin install` at two scopes. Every existing mode-switch spec is `describe.skipIf(!claudeAvailable)`, so a spec written this way is gated off wherever the Claude CLI is absent and cannot be the row's from-scratch proof. Same dependency as journey 10 |

## Journeys 18–22 — owner-named

Named by the owner on 2026-08-09. Each is an ARC rather than a single command: the value is in the
hand-offs — what one step stores and the next step has to read — which is exactly what per-command
specs cannot see.

| #   | Journey                                                                                                                                                             | From-scratch spec                           | Surfaces asserted | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 18  | The custom-marketplace arc — `init --source` stores the source, every later command resolves it from the configuration, and `search` / `list` answer from inside it | `lifecycle/custom-marketplace-arc`          | 1, 2, 3, 4        | **COVERED (this round)** — both variants (a source shipping stacks, and a stackless one). `search` carries the discriminating negative: a skill the PUBLIC marketplace ships and this source does not must not be findable, which is what tells "resolved the custom source" from "merged in the default one". See the two blocked legs below                                                                                                                                                                |
| 19  | Uninstall from scratch — at each scope, in a dual-scope install, with `--yes`, and over a config that has stopped loading                                           | `lifecycle/uninstall-from-scratch-scopes`   | 1, 2, 3, 4        | **COVERED (this round)** — the dual-scope spec asserts all four in BOTH forms: gone at the scope the command ran in, unchanged at the scope it must not touch. The single intended exception is stated as an equality, not tolerated — a project uninstall deregisters that project from the global `projects[]` and moves nothing else                                                                                                                                                                      |
| 20  | `eject <type>` customisation — eject the templates or an agent partial, edit it, and the next compile carries the edit                                              | `integration/eject-customization-recompile` | 1, 2, 3, 4        | **COVERED (this round)** — from a real install rather than a `ProjectBuilder` config, which is what makes the ejected copy's precedence over the source's own template a reachable state. `config.ts` is asserted byte-identical: a customisation is not a configuration change                                                                                                                                                                                                                              |
| 21  | The marketplace-author arc — `doctor` over the repository, `build plugins`, `build marketplace`, then install from the built repository                             | `commands/marketplace-author-arc`           | 1, 2, 3, 4        | **COVERED (this round)** for the eject install. `doctor` is run from the source-repo cwd at both ends of the build, and again over the installation — it is the one command whose answer must CHANGE between the two cwds. The **plugin install from the built marketplace has no E2E**: it needs a registered marketplace and the Claude CLI, the same dependency as journey 10                                                                                                                             |
| 22  | Revalidation — a remote source that moved on is picked up by the next load, with no flag                                                                            | `commands/source-revalidation`              | 2                 | **PARTIAL by subject.** The spec drives `search`, a read-only browse, so surfaces 1, 3 and 4 have no subject to assert — the run installs nothing, writes no `config.ts` and compiles no agent. Surface 2 carries all four arms (cold, changed, unchanged, unreachable), and the fixture's request log is the proof-of-execution half: the unchanged arm must show exactly one HEAD and no GET, which is what separates "revalidated and kept the cache" from "never asked" and from "re-downloaded blindly" |

**Journey 18's two uncovered legs, named rather than left implied.**

- **`update` refreshing the custom marketplace.** The arc spec drives `update` and asserts what an
  ejected install can be told — the copies are the user's own, and there is no marketplace to
  refresh. The refresh SUCCESS branch is journey 10's, and blocked for the same reason.
- **`GIGET_AUTH` for a private source.** It belongs at unit level: proving it needs a private remote
  repository and a token, neither of which an E2E fixture can stand up. It is read in two places in
  `src/cli/lib/loading/source-fetcher.ts` — giget's own download, and the revalidation HEAD that
  must carry the same token or every private-source load would report itself unreachable — and
  **no test currently names it at either level**.

## Withdrawn journeys

These have no live coverage **by owner ruling**, not by neglect. The behaviour they described was
removed, and the specs listed here pin its absence — they must not be "restored" into passing.

| Journey                                                        | State                                                                                                                                                                     | Specs                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `import skill` / `new skill` / `new agent` / `new marketplace` | **WITHDRAWN** — the four commands were deleted rather than left parked; `commands/help` pins that each now exits `UNKNOWN_COMMAND` and that `--help` lists neither family | `commands/help`                                       |
| Filter-incompatible (`F`) hotkey                               | **WITHDRAWN** — the feature and its flag were deleted; `interactive/edit-wizard-navigation` pins that the hint is absent and that pressing `F` leaves the frame identical | `interactive/edit-wizard-navigation`                  |
| Marketplace-sources settings overlay                           | Withdrawn by D-307; the feature and its spec were deleted outright in CLI-450/452 — nothing remains to pin                                                                | `interactive/init-wizard-sources` (`describe.skipIf`) |

---

## Using this page

**Writing a spec.** Find its journey. If the journey is TO TEST, the spec is a from-scratch one and
owes all four surfaces. If the journey is COVERED, the spec is a variant and may branch off the
existing from-scratch spec — name that spec in the JSDoc so a reader can see what proves the state
is reachable.

**Reviewing a spec.** Check the four surfaces before checking anything else. A spec asserting three
of them is not "mostly done"; it is a spec that will stay green through a defect on the fourth.

**Closing a TO TEST row.** Name the new spec in the row and change the marker in the same commit
that lands the spec. A row that says TO TEST after the spec exists is worse than no row, because it
sends the next reader to write a duplicate.

## Journeys 23–28 — documented ahead of the home stretch (owner, 2026-08-09)

Documented now so the shapes exist before the work starts; every row is **TO COME** — no specs
until its feature lands. The four assertion surfaces apply to all of them.

| #   | Journey                                                                                                                                                                                                    | Status / notes                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23  | `edit --ui`: an existing install serialized to a payload, opened in the editor, edited, applied back via `edit --from <id>` as an ordinary edit — loud removals, guard rules, honest summaries all binding | **TO COME** with CLI-462 + EDITOR-31. Fidelity rule: the round-trip carries everything or refuses loudly                                            |
| 24  | `init --from` carrying editor-added external skills: the payload's external entries are fetched from their own repos, ejected with generated metadata, and land grid-native                                | **TO COME** with the custom-skills intake (EDITOR-15–20). Today the payload drops them — the EDITOR-15 defect                                       |
| 25  | Adding a skill in the editor end to end: index search → pick → category confirm → payload → install — the added skill exists on disk with usable metadata and compiles into agents                         | **TO COME** with the intake; the search half is live today, everything after the pick is not                                                        |
| 26  | Mixed sources across scopes: global installed from marketplace X, a project from marketplace Y                                                                                                             | **OPEN DESIGN DECISION** — see below. No spec until ruled                                                                                           |
| 27  | The full custom-marketplace editor flow: add a marketplace in the editor (dialog + token), select skills from its loaded catalog, install via `--from` with the source stored                              | **TO COME** with EDITOR-30 + the payload's `source` field                                                                                           |
| 28  | Stacks for custom sources: a custom marketplace ships its own stacks → the wizard offers exactly those; it ships none → no stack step, no Stack tab                                                        | Behavior LANDED (CLI-451/455) and spec-covered at the step level; **TO COME** as a four-surface journey row when the custom-marketplace arc re-runs |

## Findings from hand verification

Findings the hand passes over the real binary turned up, kept here beside the journeys they belong
to rather than only in the pass report. A finding is removed when it is fixed, not struck through.

### 2026-08-10 — fifth pass (published binary, published marketplace)

Full run in
[`todo/plans/cli-flow-verification-fifth-pass-2026-08-10.md`](../../../../../todo/plans/cli-flow-verification-fifth-pass-2026-08-10.md).
The first pass driven against published artifacts on both sides — `agents-inc@0.153.0` **installed
from npm** and the marketplace as `github:agents-inc/skills` serves it after the 2026-08-09 publish.
23 journey rows driven, **23 PASS at the journey level**, all four surfaces each, byte-identity
proved wherever a journey claims a scope must not move.

**Everything the fourth pass left open is closed.** F-1 (published categories the CLI's enum
rejected) is FIXED at the source — all 102 published `category:` values are now in the CLI's table,
`api-database` → `api-orm` and `api-framework` → `api-api`, and `doctor` after a default install
exits 0 with `12 passed, 0 warnings, 0 errors`. F-2 (one unknown category silencing the operational
layer) is FIXED with it: the orphan row now names all 23 stranded skills and all 12 stranded agents
on a config-deleted install. **CLI-472** is FIXED by the marketplace publish — `eject skills --force`
from the default source ejects 238 skills, exit 0, so journey 20 no longer needs a fixture source to
avoid it. Journey 10's blocked refresh branch and journey 21's uncovered plugin leg both **succeeded
when driven by hand** against a real registered marketplace; both stay uncovered by E2E for the
unchanged reason (a spec needs a registered marketplace plus the Claude CLI).

Findings below are the ones the pass raised. They were compiled, not fixed, by instruction.

**M-1 — toggling a sub-agent to project scope silently truncates its skill catalogue.** Touches
**journey 16**, which passes its stated subject (the scope mechanics) with this underneath.
`web-researcher` moved global→project keeps its preloaded frontmatter but drops three of its seven
catalogue skills, because the project `config.ts` is written with no `stack` const and the build
falls back to default category assignment. Project agents take precedence over global ones, so the
project's effective agent can no longer reach them. Nothing reports it: `doctor` stays 12/0/0 and
`compile` at either scope does not heal it.

**M-2 — a stack's per-agent assignment is re-derived rather than honoured.** Touches **journeys 2
and 12**, which pass on totals: the installed set equals the stack's declaration in both directions.
The distribution does not — `cli-tester` declares `{}` and receives 4 skills, `web-tester` declares
3 and receives 13. `config-generator.ts`'s `shouldIncludeTriple` short-circuits on
`newlyAddedSkillIds`, so on a from-scratch install the relevance derivation wins and the stack
overlay contributes only `preloaded` flags — while `default-stacks.ts` says a stack declares which
skills each sub-agent gets. **M-1 and M-2 are one question**: who owns per-agent assignment.

**M-3 — the Sources bulk hotkeys override the lock on inherited global rows.** Touches the
containment claims in **journeys 3, 8 and 17**. Global rows render 🔒 and non-focusable in a project
edit, so the per-row toggle cannot reach them by design; `P` / `L` ignore that, and a project run
really installed plugins and rewrote the global `config.ts`. Note the tension: this is currently the
only route by which **journey 17** is reachable, so tightening it redefines that row.

**M-4 — a project-scoped skill picked alongside only global agents is assigned to nothing.** It
copies to disk, appears in no `stack` block and no agent's frontmatter, and `doctor` reports
`Skills Resolved 2/2`.

**M-5 — `list` reports `Skills: 0` for a plugin install run from a project directory** (the same
install reports 7 from the home directory). **M-6 — the uninstall preview promises to remove the
compiled agents even when it cannot**, then leaves them byte-identical; the summary afterwards is
honest, the plan is not. **M-7 — `init`'s closing line points at the project `config.ts`** when the
assignments live only in the global one, and `list` names the other file for the same install.

**Observation, now reproduced exactly** — the fourth pass's `marketplace` note is CONFIRMED:
switching only a _project_-scoped skill to plugin mode appends `"marketplace": "agents-inc"` to the
**global** `config.ts`, and no reverse switch removes it. Harmless behaviourally; drift in a
user-editable file.

**Observation — `config.ts` is not byte-stable across writers.** Found independently by four agents.
`init`, `edit`, the project-registration writer and `compile` emit `export default` keys in
different orders, so an unrelated later command rewrites the file — including a `compile` that
reports `0 rewritten`. Values never change. A byte-identity assertion on `config.ts` across a writer
transition will fail for a reason unrelated to its subject; `config-types.ts` is unaffected, so
**journey 11**'s actual claim still holds.

**Correction to journey 10's text:** `update` delegates to `claude plugin marketplace update <name>`
(once per distinct marketplace, after a `claude --version` probe), not `claude plugin update`.

Twenty-five lower-severity findings — `doctor`'s unconditional verbose trace, its verdict on a
cleanly uninstalled directory, tombstones counted as validated agents, `search`'s `ID` column
rendering display names, the empty Stack-step info overlay, and others — are listed in the pass
report rather than here.

### Journey 26 — the open decision

What should happen when the global install came from marketplace X and a project installs from
marketplace Y? Recorded recommendation (orchestrator, 2026-08-09, unruled):

- **Allow it, with per-scope content ownership.** Global skills belong to X and resolve from
  their installed content (the disk/plugin merge already guarantees this — a project run never
  re-resolves global skills against Y). The project's catalog for new picks is Y alone;
  inherited global skills render as the locked rows they already are.
- **One hard rule: a dual-scope pair must share one source.** `[P][G]` means "the same skill at
  two scopes" — with X and Y both supplying an id, two different contents would masquerade as
  one skill. Creating a cross-source pair is refused with a named reason, exactly like the
  exclusive-swap guard.
- The alternative — refusing mixed scopes outright ("global is from X; use X or uninstall") —
  is simpler but blocks the legitimate org story (default global + team project marketplace).

**STILL TO BE DECIDED (owner, 2026-08-09: "I need to think this through")** — the recommendation above is input, not a decision. Nothing builds or specs against journey 26 until the owner rules.
