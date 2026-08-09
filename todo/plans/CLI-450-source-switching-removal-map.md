# CLI-450 — Source-switching removal map (2026-08-09)

Produced by the read-only investigation; persisted verbatim by the orchestrator.

## The boundary, in three sentences

The Sources step, its grid, its store verbs and its config `source` field all survive; what is deleted is the **marketplace axis** — every mechanism that discovers, renders, or writes a _second_ marketplace for a skill, leaving a fixed two-value install-mode choice (eject vs the one resolved marketplace). Decisively, that axis is already **dead weight**: `tagPublicSourceSkills`/`tagExtraSources` only _tag_ skills that the primary matrix already contains (they never add skills), `buildMarketplacePluginRef` always uses `sourceResult.marketplace` and never the per-skill `source` name, and **zero** e2e specs select a marketplace-vs-marketplace column — so a cross-marketplace pick today writes a config string that no install path reads. Deletion therefore removes an unimplemented half-feature plus the multi-source loading and settings/search machinery that exists only to feed it, and (per the new ruling) the D-233 preserve-unresolvable guard, replaced by real removal + loud reporting.

## Counts

| Bucket                                                    | Count                                                                                              |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/` files whole-file DELETE                            | 5 (+4 test files)                                                                                  |
| `src/` files RESHAPE (mode/source entangled)              | 14                                                                                                 |
| `src/` files KEEP unchanged (argued below)                | 11                                                                                                 |
| e2e specs referencing Sources-step verbs                  | 44 files                                                                                           |
| …driving **marketplace-vs-marketplace** selection         | **0**                                                                                              |
| …driving per-skill cell selection (all mode: col 0/col 1) | 8 specs + 2 page objects                                                                           |
| …driving bulk mode only (`l`/`p`)                         | 34 files (incl. 2 shared fixtures)                                                                 |
| e2e specs DELETE/RESHAPE                                  | 2 (`sources-step-duplicate-marketplace-column`, `init-wizard-sources-settings-hidden`)             |
| e2e specs that flip green                                 | 1 (`edit-wizard-local` → `it.fails` "should not report a preserved unresolvable skill as removed") |
| Unit/component tests touched                              | ~140 cases across 8 files                                                                          |
| Docs to edit                                              | 22 `.ai-docs` + 2 external (`apps/www` architecture, `docs/cli/excluded-skills-edge-cases`)        |
| agent-findings (historical — do NOT edit)                 | 12                                                                                                 |

## Surfaces table

### 1. Wizard — source-changing surfaces

| File                                                       | Symbol                                                                                                           | Role                                             | Verdict                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `src/cli/components/wizard/step-sources.tsx`               | `StepSources`                                                                                                    | The step itself                                  | **RESHAPE** — survives as the mode step                                                      |
| ″                                                          | `handleSearch`, `handleBind`, `handleSearchStateChange`, `resolveAllSources`/`searchExtraSources` imports        | Bind a skill to a _third_ marketplace            | **DELETE** — pure source-choosing                                                            |
| ″                                                          | `view: "choice" \| "customize"`, `SelectionCard` pair, `setCustomizeSources`                                     | "Use recommended vs Customize sources" screen    | **DELETE** — the choice is between source sets; `SOURCE_CHOICE` is already `false`           |
| ″                                                          | `handleGridSelect` + `isRowInert` scope-threading                                                                | Threads acting scope to the store                | **KEEP** — the D-262 dual-scope guard is mode-agnostic                                       |
| ″                                                          | `l`/`p` hotkey handling                                                                                          | Bulk install mode                                | **KEEP**                                                                                     |
| `src/cli/components/wizard/source-grid.tsx`                | `SourceGrid`, `SOURCE_COL_WIDTH`, pinned header, `ARROW_LEFT/RIGHT` column walk, `SOURCE_GRID_HEADER_MIN_HEIGHT` | N-column source picker                           | **RESHAPE** — the horizontal axis collapses to 2 fixed cells                                 |
| ″                                                          | `SourceOption[]`, `SourceRow.options`                                                                            | Open-ended option list                           | **RESHAPE** — becomes a 2-value mode, or a fixed-length pair                                 |
| ″                                                          | `rowStatusMarker`, `rowDiffColor`, `isRowInert`, `groupRowsByScope`, `SCOPE_ROW_HEADERS`, scroll/affordance      | Row state, scope grouping, diff markers          | **KEEP** — orthogonal to the axis                                                            |
| ″                                                          | `SEARCH_PILL_LABEL`, `onSearch`/`onBind`/`onSearchStateChange` props                                             | Search pill                                      | **DELETE**                                                                                   |
| `src/cli/components/wizard/search-modal.tsx`               | whole file                                                                                                       | Cross-marketplace skill search UI                | **DELETE** — sole consumer is source-grid                                                    |
| `src/cli/components/hooks/use-source-grid-search-modal.ts` | whole file                                                                                                       | ″                                                | **DELETE**                                                                                   |
| `src/cli/components/wizard/step-settings.tsx`              | `StepSettings`                                                                                                   | Add/remove extra marketplaces overlay            | **DELETE** — `WIZARD_SETTINGS_OVERLAY` already `false` and documented broken (input capture) |
| `src/cli/components/hooks/use-source-operations.ts`        | whole file                                                                                                       | `handleAdd`/`handleRemove` for extras            | **DELETE**                                                                                   |
| `src/cli/lib/configuration/source-manager.ts`              | `addSource`, `removeSource`, `getSourceSummary`                                                                  | Extras CRUD in config                            | **DELETE**                                                                                   |
| `src/cli/lib/feature-flags.ts`                             | `SOURCE_SEARCH`, `SOURCE_CHOICE`, `WIZARD_SETTINGS_OVERLAY`                                                      | Gates on all three                               | **DELETE** (flags + their branches)                                                          |
| `src/cli/consts.ts`                                        | `SOURCE_DISPLAY_NAMES`, `SOURCE_HEADER_NAMES` (`Record<string,string>`)                                          | Label lookup keyed by arbitrary marketplace name | **RESHAPE** — two fixed labels (`Local`/`Plugin`)                                            |
| `src/cli/components/wizard/hotkeys.ts`                     | `HOTKEY_SET_ALL_LOCAL`, `HOTKEY_SET_ALL_PLUGIN`                                                                  | `l`/`p`                                          | **KEEP**                                                                                     |

### 2. Store verbs (`src/cli/stores/wizard-store.ts`)

| Symbol                                                                                                                                                                                                                                        | Role                                                                        | Verdict                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `setSourceSelection(skillId, sourceId, scope)`                                                                                                                                                                                                | Writes an arbitrary source id                                               | **RESHAPE** → `setInstallMode(skillId, mode, scope)`; keep the empty-arg guards                                                                |
| `withActiveEntrySource`                                                                                                                                                                                                                       | Rewrites only the active `(id, scope)` entry, sparing the tombstone (D-262) | **KEEP** — the invariant is about scope, not marketplace                                                                                       |
| `setAllSourcesEject`                                                                                                                                                                                                                          | `l`                                                                         | **KEEP**                                                                                                                                       |
| `setAllSourcesPlugin`                                                                                                                                                                                                                         | Picks _first non-local_ `availableSources` entry                            | **RESHAPE** — target the single resolved marketplace; "first non-local" is the marketplace-axis remnant                                        |
| `buildSkillSourceOptions`                                                                                                                                                                                                                     | eject + N sorted sources + bound skills                                     | **RESHAPE** — eject + the one marketplace                                                                                                      |
| `getSourceSortTier` + `SOURCE_SORT_TIER_LOCAL/_SCOPED/_PUBLIC/_THIRD_PARTY`                                                                                                                                                                   | Orders N marketplace columns                                                | **DELETE** — nothing to order at 2                                                                                                             |
| `buildBoundSkillOptions`, `boundSkills`, `bindSkill`, `BoundSkill`/`BoundSkillCandidate` types (`types/config.ts`, `types/matrix.ts`, `lib/schemas.ts`)                                                                                       | Third-marketplace binding                                                   | **DELETE**                                                                                                                                     |
| `primarySourceName`, `resolveEffectiveSource`                                                                                                                                                                                                 | Default source resolution                                                   | **KEEP** — still needed to name the one marketplace                                                                                            |
| `buildSkillConfigForId` (`resolveEffectiveSource(saved?.source, primarySource)`)                                                                                                                                                              | Saved source beats computed primary (CLAUDE.md ALWAYS rule)                 | **KEEP** — it protects eject-vs-plugin, not marketplace                                                                                        |
| `buildSourceRows`, `classifySkillSourceRows`, `toLockedGlobalRow`, `toPendingRemovalRow`, `collectRemovedInstalledEntries`, `collectInstalledSkillSlots`, `addedSlotFlag`, `withSelectedSource`, `sourceRowSortTier`, `isSlotAlreadyRendered` | Row construction, scope locks, D-257/258/271 session diff                   | **KEEP** — all keyed on `(id, scope)` slots, axis-independent                                                                                  |
| `customizeSources` state + `setCustomizeSources`                                                                                                                                                                                              | Gate for the deleted choice screen                                          | **DELETE**                                                                                                                                     |
| `unresolvableSkillIds` state, `populateFromSkillIds` accumulation                                                                                                                                                                             | D-233 feed                                                                  | **RESHAPE** — keep detection, repoint from _preservation_ to _loud removal_; today it `warn()`s a **count only**, must name each skill and why |
| `resolveSkillForPopulation`                                                                                                                                                                                                                   | Warns per unresolved skill                                                  | **KEEP** — already names the skill; becomes the reporting source                                                                               |

### 3. scope-diff (`src/cli/lib/wizard/scope-diff.ts`)

| Symbol                                                                                                                           | Verdict                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `DiffRowStatus: "source-changed"`, `prevSourceMap`, `classifyDiffRow` source comparison, `~` marker in `skill-agent-summary.tsx` | **KEEP** — `source` goes `eject ↔ <marketplace>` on a _mode_ change, so `~` remains the mode-change indicator. Rename-only candidate. |
| `skillSlotKey` / `agentSlotKey` (the exported shared key)                                                                        | **KEEP** — load-bearing for Sources↔confirm agreement                                                                                 |

### 4. Persistence

| File                                                                                                   | Symbol                                                                                                                                                                                             | Verdict                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/configuration/config-merger.ts`                                                                   | `MergeContext.unresolvableSkillIds`, `MergeOptions` Pick, `new Set(options?.unresolvableSkillIds)`, the `!unresolvableSkillIds.has(existing.id)` exemption (~line 189), context propagation (~243) | **DELETE** — owner ruling: unresolvable entries are removed, not preserved                                                              |
| ″                                                                                                      | `authoritativeScope`, `skillKey`/`agentKey`, dual-scope drop rules                                                                                                                                 | **KEEP** — unrelated to sources                                                                                                         |
| ″                                                                                                      | `existingConfig.source` (project-level source)                                                                                                                                                     | **KEEP** — that's the marketplace to install _from_                                                                                     |
| `lib/installation/local-installer.ts:362`                                                              | `unresolvableSkillIds: wizardResult.unresolvableSkillIds`                                                                                                                                          | **DELETE** (pass-through)                                                                                                               |
| `lib/seed/seed-to-wizard.ts:239`                                                                       | `unresolvableSkillIds: []`                                                                                                                                                                         | **DELETE**                                                                                                                              |
| `components/wizard/wizard.tsx:64,232`                                                                  | `unresolvableSkillIds` prop plumbing                                                                                                                                                               | **DELETE**                                                                                                                              |
| `lib/operations/project/write-project-config.ts:26`                                                    | D-233 authority JSDoc                                                                                                                                                                              | **RESHAPE** (doc)                                                                                                                       |
| `commands/edit.tsx` `logChangeSummary`/`detectConfigChanges`                                           | Reports `- X [P]` for preserved skills                                                                                                                                                             | **RESHAPE** — with removal real, the line becomes true; add the "why it went" reason. _(Coordinate: another agent owns this function.)_ |
| `lib/installation/mode-migrator.ts`                                                                    | `detectMigrations`, `executeMigration`, `SkillMigration`, `MigrationPlan`                                                                                                                          | **KEEP** whole — only ever classifies `toEject`/`toPlugin`; it is the mode engine                                                       |
| `lib/skills/source-switcher.ts`                                                                        | `deleteLocalSkill`, `migrateLocalSkillScope`                                                                                                                                                       | **KEEP** — misnamed; it is scope/mode file movement. Rename to `local-skill-mover.ts`                                                   |
| `commands/edit.tsx` `recordGlobalSourceMigrations` + `config-gate` `{ kind: "migrate-skill-sources" }` | **KEEP** — records _mode_ migrations performed at global scope                                                                                                                                     |
| `types/config.ts` `SkillConfig.source`                                                                 | **KEEP** — provenance; value space narrows to `eject \| <the one marketplace>`                                                                                                                     |

### 5. Loading

| File                                                                                                                                                                                                 | Symbol                                                                                                                                                                                                              | Verdict                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `lib/loading/multi-source-loader.ts`                                                                                                                                                                 | phase 4 `tagPublicSourceSkills`, phase 5 `tagExtraSources`, `searchExtraSources`                                                                                                                                    | **DELETE** — their own JSDoc says "so users can switch between sources"; they only tag skills the primary matrix already holds |
| ″                                                                                                                                                                                                    | `tagPrimarySourceSkills`, `tagLocalSkills`, `tagPluginSkills`, `setActiveSources`                                                                                                                                   | **KEEP** — feed the installed/eject state and the one marketplace name                                                         |
| ″                                                                                                                                                                                                    | `SkillSource.primary`/`type`/`url`, `availableSources` array                                                                                                                                                        | **RESHAPE** — collapses to at most `{local, marketplace}`                                                                      |
| `lib/configuration/config.ts` `resolveAllSources` / `sources` extras array                                                                                                                           | **RECHECK** — also read by `lib/content-validator.ts` (`cc doctor` validates registered sources). Keep the _config field_ only if doctor's check is judged independently valuable; otherwise delete with the extras |
| `lib/loading/source-loader.ts`, `operations/source/load-source.ts`, `lib/source-validator.ts`, `hooks/init.ts` `extractSourceFlag`, `configuration/config.ts` `resolveSource`/`validateSourceFormat` | **KEEP** — the `--source` stack                                                                                                                                                                                     |
| `lib/skills/local-skill-loader.ts`, `operations/skills/copy-local-skills.ts`                                                                                                                         | **KEEP** — local skill resolution                                                                                                                                                                                   |
| `operations/skills/install-plugin-skills.ts` / `uninstall-plugin-skills.ts` / `plugins/plugin-ref.ts`                                                                                                | **KEEP** — and note they already ignore per-skill `source`                                                                                                                                                          |

### 6. Consumers (tests)

| File                                                                                                                                                      | Verdict                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `e2e/lifecycle/source-switching-modes.e2e.test.ts`                                                                                                        | **KEEP** — eject↔plugin bulk. Rename `install-mode-*`                                                                                                                                                        |
| `e2e/lifecycle/source-switching-full-cycle.e2e.test.ts`                                                                                                   | **KEEP** — eject→plugin→eject round-trip. Rename                                                                                                                                                             |
| `e2e/lifecycle/source-switching-per-skill.e2e.test.ts`                                                                                                    | **KEEP** — the only user of `moveSourceColumnRight`; reaches the _plugin_ column. Rename; the column-move may become a toggle press                                                                          |
| `e2e/interactive/sources-step-duplicate-marketplace-column.e2e.test.ts`                                                                                   | **DELETE** — asserts two indistinguishable marketplace columns don't render; a 2-column grid makes the failure mode impossible. Its JSDoc is the best existing evidence for the removal                      |
| `e2e/interactive/init-wizard-sources-settings-hidden.e2e.test.ts`                                                                                         | **DELETE** with the overlay                                                                                                                                                                                  |
| `e2e/interactive/edit-wizard-local.e2e.test.ts`                                                                                                           | **RESHAPE** — the `it.fails` spec flips green; its sibling's config assertion must become `toStrictEqual([...])` without tailwind, plus a positive on the removal reason                                     |
| `e2e/pages/steps/sources-step.ts`                                                                                                                         | **RESHAPE** — drop `openSettings`/`closeSettings`/`pressAddSource`/`pressDeleteSource`/`addSourceUrl`; keep `setAllLocal`/`setAllPlugin`/`selectFocusedSourceCell`; `moveSourceColumnRight` becomes a toggle |
| `e2e/helpers/test-utils.ts` `completeWithLocalSources`, `e2e/fixtures/dual-scope-helpers.ts` (6 call sites)                                               | **KEEP** — `setAllLocal` is how ~34 specs choose eject mode; touching it is the largest avoidable risk                                                                                                       |
| `src/cli/lib/__tests__/integration/source-switching.integration.test.ts`                                                                                  | **KEEP** — delete + re-copy = mode round-trip. Rename                                                                                                                                                        |
| `src/cli/lib/skills/source-switcher.test.ts` (8)                                                                                                          | **KEEP**, rename with the module                                                                                                                                                                             |
| `src/cli/lib/loading/multi-source-loader.test.ts` (23)                                                                                                    | **RESHAPE** — drop public-fallback/extras cases                                                                                                                                                              |
| `src/cli/lib/configuration/source-manager.test.ts` (22), `step-settings.test.tsx` (18)                                                                    | **DELETE** with their modules                                                                                                                                                                                |
| `src/cli/components/wizard/source-grid.test.tsx` (58)                                                                                                     | **RESHAPE** — cases built on ≥3 `createSourceOption`s                                                                                                                                                        |
| `src/cli/components/wizard/step-sources.test.tsx` (7)                                                                                                     | **RESHAPE**                                                                                                                                                                                                  |
| `src/cli/stores/wizard-store.test.ts`                                                                                                                     | **RESHAPE** — 2 `buildSourceRows` describes, `setSourceSelection`/`setAllSources*` cases, 3 `unresolvableSkillIds` assertions                                                                                |
| `src/cli/lib/configuration/config-merger.test.ts` (~1108–1151)                                                                                            | **DELETE** — the 3 unresolvable-preservation cases, replaced by drop-and-report cases                                                                                                                        |
| `src/cli/lib/__tests__/mock-data/mock-skills.ts` `SWITCHABLE_SKILLS`, `LOCAL_SKILL_VARIANTS`; `factories/skill-factories.ts` `createMockMultiSourceSkill` | **RECHECK** — `SWITCHABLE_SKILLS` is mode-only (rename); `createMockMultiSourceSkill` loses its reason to exist                                                                                              |
| `e2e/fixtures/project-builder.ts` `unresolvableSkills` option                                                                                             | **KEEP** — now feeds the removal-reporting tests                                                                                                                                                             |

### 7. Docs

**Substantive rewrites (6):** `reference/features/skills-and-matrix.md` (§ Source Switching, § multi-source tagging pipeline), `reference/store-map.md` (§ Source-option builders, § Source-row builders, § Source sort tiers, `setSourceSelection`/`setAllSources*` rows), `reference/wizard/state-transitions.md` (action table rows 254–257, getter 353, hotkeys 400–401, § second projection), `reference/component-patterns.md` (§ SourceGrid Row States, § Section Scroll pinned-header paragraph), `reference/features/wizard-flow.md` (lines 80, 190, 444, 454–456), `reference/config/config-merger.md` (unresolvable exemption).

**Line-level touches (16):** `DOCUMENTATION_MAP.md`, `reference/architecture-overview.md`, `reference/utilities.md`, `reference/commands/index.md`, `reference/dependency-graph.md`, `reference/concepts/{guard-pattern,scope-system,tombstone-pattern}.md`, `reference/features/{configuration,seed-contract}.md`, `reference/testing/{e2e-infrastructure,infrastructure,mock-data}.md`, `standards/e2e/{README,anti-patterns,page-objects,test-data,user-journeys}.md`, `standards/e2e-testing-bible.md`.

**External (2):** `apps/www/src/content/docs/docs/reference/architecture.md:53`, `docs/cli/excluded-skills-edge-cases.md:114`.

**Do NOT edit:** the 12 `.ai-docs/agent-findings/*` files — historical records.

## User-visible behavior that disappears

1. A skill row can no longer be pointed at a _third-party_ or _public-fallback_ marketplace — the grid shows `Local | Plugin` only.
2. The `S` settings overlay (add/remove marketplace URLs) is withdrawn, not just hidden.
3. The search pill / cross-marketplace skill search and binding is gone.
4. The "Use recommended sources vs Customize skill sources" choice screen is gone (the step opens straight into the grid — already true, since `SOURCE_CHOICE` is `false`).
5. **New behavior:** a config skill the loaded source no longer carries is _removed_ from `config.ts` and named in the run's output with a reason, instead of being silently preserved while the summary claimed it was removed.

None of 1–4 is exercised by any e2e spec today; 1 and 2 are on `false` flags or documented-broken paths.

## D-233 — resolved by owner ruling (no longer an open question)

Preservation is **DELETE**. Carried-forward requirement: **removal must be reported, never silent** — name the skill and why it went ("not present in `<source>`"). Two supporting facts for the writeup:

- The switching→unresolvable link the ruling assumed is weaker than feared: per-skill `source` never influences which matrix loads, so a cross-marketplace pick could not produce an unresolvable. The genuine producers are (a) upstream removal/rename, and (b) `--source` pointing at a different marketplace than at install time — and (b) survives the removal.
- This also closes `2026-08-08-edit-reports-an-unresolvable-skill-as-removed-while-preserving-it.md` via a third option the finding did not list: make the removal _real_. `Changes:` block, `config.ts`, and the compiled agent then all agree, and the pinned `it.fails` spec in `edit-wizard-local.e2e.test.ts` inverts to a positive assertion on the reported reason.

## Design cost

The grid loses its **horizontal axis**. Concretely: `SOURCE_COL_WIDTH = 18` × N cells collapses to two; `ARROW_LEFT`/`ARROW_RIGHT` stop meaning "traverse sources" and either disappear or become a toggle; the pinned column header (`SOURCE_GRID_HEADER_MIN_HEIGHT = 4`, and the whole "header costs a row" trade) has only two captions left to pin and may not be worth a row at all; `SKILL_NAME_WIDTH = 26` and the `SCOPE_COL_WIDTH = 11` gutter free up horizontal budget. The mitigating fact: `SOURCE_HEADER_NAMES` already maps `eject→"Local"`, `agents-inc→"Plugin"`, so in the default single-marketplace path **the grid already renders exactly the two columns the reshape leaves** — the visual delta on the common path is near zero, and the design work is about whether a 2-state choice still deserves a grid or becomes a per-row state badge.

Files/screens that currently draw it: `src/cli/components/wizard/source-grid.tsx` (the layout constants above); `.ai-docs/reference/component-patterns.md` § SourceGrid Row States (the rendering contract, incl. the no-`✓` rule and the pinned-header trade) and § Section Scroll; `.claude-design/DECISIONS.md` line 32, which already specifies the target shape — _"State badges = `On demand|Preloaded`, `Plugin|Eject`, `Project|Global`. Always present, always showing current value; click flips to the alternative"_ — i.e. the web configurator has **already** ruled the mode a two-state badge, not a column axis; `.claude-design/design/Configurator v5.dc.html` (3 `Eject` / 3 `Plugin` hits, install dialog "install mode as a right-aligned word, `eject` amber") and `.claude-design/screens/05-install-dialog.png`. Note `DECISIONS.md` line 41 describes an "Add skill from GitHub" wedge — confirm with the owner that deleting the CLI's search/bind path does not orphan a committed design direction.

## Test blast radius for the step's own specs

| Axis driven                                           | Specs                                                                                                                                       | Verdict                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Marketplace vs marketplace                            | **0**                                                                                                                                       | —                                     |
| Renders a multi-marketplace column set (no selection) | 1 (`sources-step-duplicate-marketplace-column`)                                                                                             | DELETE                                |
| Settings overlay                                      | 1 (`init-wizard-sources-settings-hidden`)                                                                                                   | DELETE                                |
| Mode only — bulk `l`/`p`                              | 34 files (incl. `test-utils.completeWithLocalSources`, `dual-scope-helpers` ×6)                                                             | KEEP untouched                        |
| Mode only — per-skill cell (col 0/col 1)              | 8 specs                                                                                                                                     | KEEP; verify after the toggle reshape |
| Both bulk and per-skill                               | 5 (`init-wizard-plugin`, `cross-scope-lifecycle`, `dual-scope-same-source-plugin`, `edit-add-local-skills`, `init-plugin-marketplace-fail`) | KEEP                                  |
| Page objects                                          | 2 (`sources-step.ts`, `build-step.ts`)                                                                                                      | RESHAPE                               |

## Removal sequence

1. Delete the flag-off dead branches first (zero behavior change): `step-settings.tsx`, `use-source-operations.ts`, `source-manager.ts`, `search-modal.tsx`, `use-source-grid-search-modal.ts`, the three flags, and `step-sources.tsx`'s `"choice"` view — plus their tests and the 2 e2e specs.
2. Delete `boundSkills`/`bindSkill`/`BoundSkill*` and `buildBoundSkillOptions` (now unreachable).
3. Delete `tagPublicSourceSkills` + `tagExtraSources` from the loader; `availableSources` narrows to ≤2 entries, so `getSourceSortTier` + its 4 constants go with them.
4. Reshape `buildSkillSourceOptions` / `setAllSourcesPlugin` / `setSourceSelection`→`setInstallMode` and the `SOURCE_*_NAMES` records. Store tests + `source-grid.test.tsx` land here.
5. Reshape `source-grid.tsx` to the 2-state control; page objects follow; re-run the 47 sources-touching e2e files as one gate.
6. D-233: delete the `unresolvableSkillIds` exemption in `config-merger.ts` and its plumbing, add named removal reporting, flip the pinned `it.fails` spec, coordinate with the `logChangeSummary` work in flight.
7. Renames last (`source-switcher.ts`, the three `source-switching-*` e2e files, `SWITCHABLE_SKILLS`) so earlier steps stay greppable.
8. Docs: 6 rewrites, 16 line touches, 2 external; leave `agent-findings/` alone.

## Open questions for the owner

1. **`resolveAllSources` / config `sources` extras array** — delete outright, or keep the config field because `cc doctor`'s `content-validator.ts` validates registered sources? (Only non-wizard consumer.)
2. **Does `cc eject --source` count?** It re-copies a skill from a chosen marketplace but never rewrites per-skill config `source`. Reads as `--source` (KEEP), but it is the one remaining CLI path that changes what an installed skill's files come from.
3. **`~` source-changed marker** — keep the name, or rename to mode-changed across `scope-diff.ts` + `skill-agent-summary.tsx` + the confirm-step spec?
4. **`.claude-design/DECISIONS.md` line 41** ("Add skill from GitHub" wedge) — does deleting the CLI search/bind path orphan a committed design direction?

## Owner rulings on the four questions (2026-08-09)

1. **Extras array: DELETE outright** — confirmed after the full consumer picture (the map missed
   `search` as a third consumer; all three consume a list no living path can populate). `search`
   narrows to primary + local; doctor's sources section narrows likewise. `--source` — the
   user's own-marketplace path — is expressly untouched and stays.
2. **`eject --source`: REMOVE** ("not actually something I use").
3. **`~` marker: RENAME** source-changed → mode-changed across scope-diff.ts,
   skill-agent-summary.tsx and the confirm-step spec.
4. **The "Add skill from GitHub" design wedge lives in the editor only** — the editor's
   add-skills search is the official home; the CLI's search/bind path deletes with nothing
   orphaned; DECISIONS.md gets the one-line repoint.

## Execution log (2026-08-09)

Executed in the map's order. Full gates after every step; the three deletion steps were run
against the FULL e2e suite to prove zero behaviour change before anything reshaped.

| Step | What landed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Unit suites      | Full e2e                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------- |
| 1    | Flag-off dead branches: `step-settings.tsx`, `search-modal.tsx`, `use-source-operations.ts`, `use-source-grid-search-modal.ts`, `source-manager.ts`, the three flags, the `"choice"` view — plus the orphans they left (`selection-card.tsx`, `use-modal-state.ts`, `use-text-input.ts`, `HOTKEY_SETTINGS`/`HOTKEY_ADD_SOURCE`, the `Settings` footer item, `showSettings`/`toggleSettings`/`customizeSources`/`setCustomizeSources`, the now-unused `Wizard` `projectDir` prop) and 3 e2e specs | 142 files / 6447 | 639 pass / 14 xfail                                  |
| 2    | `BoundSkill`/`BoundSkillCandidate`, `boundSkillSchema`, `ProjectConfig.boundSkills`, `boundSkills`/`bindSkill`/`buildBoundSkillOptions`, `searchExtraSources`                                                                                                                                                                                                                                                                                                                                    | 142 / 6441       | 639 / 14 — **identical to step 1**                   |
| 3    | `tagPublicSourceSkills` + `tagExtraSources` + `fetchSourceSkills`; ruling 1's extras array (`ProjectConfig.sources`, its Zod + JSON schema, the gate's `add-source`/`remove-source` mutations); `resolveAllSources` → `resolvePrimarySourceEntry`; `search` narrowed to primary+local; doctor's sources section narrowed to primary + cwd-source                                                                                                                                                 | 142 / 6433       | 638 / 14 (−1 = the deleted extras-merge search spec) |
| 4    | Store verbs: `setSourceSelection` → `setInstallMode(skillId, mode, scope)` (the UI can no longer hand over an arbitrary source string — the store resolves it), `buildSkillSourceOptions` → `buildInstallModeOptions`, `withSelectedSource` → `withSelectedMode`, `setAllSourcesPlugin` → the one marketplace, `SOURCE_HEADER_NAMES` → `INSTALL_MODES` + `INSTALL_MODE_CELL_LABELS` in `consts.ts`                                                                                               | —                | —                                                    |
| 5    | Grid reshaped to the two-state control                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 142 / 6431       | 638 / 14                                             |
| 6    | D-233: exemption + merge plumbing deleted, removal reported per skill by name and reason; `eject --source` removed                                                                                                                                                                                                                                                                                                                                                                               | 142 / 6432       | 640 / 13                                             |
| 7    | Renames                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 141 / 6418       | —                                                    |
| 8    | Docs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                | —                                                    |

### The grid-shape call

**The two columns stayed; the pinned header went.** The map's own note decided it: on the default
single-marketplace path the grid already rendered exactly the two cells the reshape leaves, so
collapsing to what was already on screen beat inventing a badge. What changed is the captions —
the cells now read `Local` and `Plugin` (`INSTALL_MODE_CELL_LABELS`) instead of `Eject` and the raw
marketplace name. That is what killed the header: it existed to caption marketplace columns whose
inline labels differed from their headings, and with self-captioning cells it would have printed
`Local` and `Plugin` directly above the words `Local` and `Plugin` at the cost of a viewport row.
Gone with it: `SOURCE_GRID_HEADER_MIN_HEIGHT` and the `showPinnedHeader` gate that made the header
yield to content at short viewports.

`SourceOption` lost its `id` and `installed` (both dead) and now carries `mode` alone, so the grid
cannot express a source the store would not write.

### The removal report, verbatim

```
Changes:
  - web-styling-retired-legacy-xyz [G] (not present in github:agents-inc/skills)
```

The reason suffix uses the `~` line's own `(from → to)` shape. Only unresolvable removals carry
one — every other removal is a deselection the user watched themselves make.

### Red evidence for the behaviour-changing steps

- **Steps 4–5.** `install-mode-per-skill.e2e.test.ts` (one of the eight per-skill cell specs) was
  given the control-shape assertions first and run RED: `Plugin` absent, `Eject` present, and
  `Local` printed ABOVE the skill row. The failure frame is the argument for the reshape — the
  second column was captioned with the raw marketplace name `e2e-test-1786261800281`, wrapped
  across two lines, costing a row per skill. Green after.
- **Step 6.** `edit-wizard-local.e2e.test.ts`'s pinned `it.fails` was inverted rather than deleted:
  it now asserts the config comes out as `["web-framework-react"]`, that the Changes block prints
  `- web-styling-tailwind [P]`, and that it says `not present in`.
- **Untouched, as required.** `completeWithLocalSources` and `dual-scope-helpers` were never
  opened; the 34 bulk-mode specs passed unmodified at every step.

### Deviations from the map, and why

1. **`WizardResultV2.unresolvableSkillIds` was KEPT, repointed** (§4 marked it DELETE). The
   ruling's carried-forward requirement is that the removal be reported by name — and the ids the
   report names are exactly the ones `resolveSkillForPopulation` rejected. §2 already said
   "repoint from preservation to loud removal"; deleting the carrier would have forced `edit` to
   re-derive the same answer from the matrix, which is how two surfaces come to disagree. What WAS
   deleted is everything downstream of it that fed the merge exemption: `MergeContext`'s field, the
   `MergeOptions` Pick, the guard itself, and `local-installer`'s pass-through.
2. **`getSourceSortTier` + its four constants went in step 4, not step 3.** At ≤2 entries the tier
   sort still decides which cell is first, so deleting it in step 3 would have flipped the column
   order — a behaviour change in a step whose whole point was that it had none. It died with the
   builder it ordered.
3. **`SOURCE_DISPLAY_NAMES` survives.** The map's row bundled it with `SOURCE_HEADER_NAMES`, but it
   labels a `SkillConfig.source` VALUE on the summary panel and in `edit`'s migration lines, which
   are not the grid's axis. `SOURCE_HEADER_NAMES` (grid-only) is the one that became the two fixed
   cell labels.
4. **`createMockMultiSourceSkill` stays** (§6 RECHECK). Its consumer is
   `skill-resolution.integration.test.ts`, which uses three synthetic "sources" to assemble a
   matrix and test merge/resolution — a subject that survives the removal.
5. **`skipExtraSources` was not renamed.** It gates the whole tagging pipeline and always did, so
   the misnomer predates this work; renaming it touches ten files the map does not list. Recorded
   in `skills-and-matrix.md` instead.
6. **`sources-overflow-pending-removal.e2e.test.ts` needed a fixture repair.** Removing the header
   row gave the viewport one more row, and its seven-row fixture stopped overflowing. Fixed by
   adding an eighth skill, and by making the scroll loop press until the clipped row is visible
   rather than a fixed 20 times — once nothing is hidden below, the next press wraps focus to the
   top and takes the viewport with it, so a fixed count asserts whichever point of that cycle it
   lands on.

### Damage to report

**`src/cli/lib/__tests__/integration/install-mode.integration.test.ts` was overwritten and is
lost from the working tree.** The step-7 rename of `source-switching.integration.test.ts` chose that
name without checking it was free; it was not — `.ai-docs/reference/testing/infrastructure.md:171`
and `changelogs/0.117.0.md` both record the file, and the suite lost 1 file / 14 tests
(142→141 files, 6432→6418 tests) at exactly that step. The renamed spec has since been moved to
`install-mode-round-trip.integration.test.ts`, so the original name is free again and a
`git checkout` of that one path restores it with no conflict. **It is the only outstanding item
from this work.**

### Gates

`tsc` ×3 clean · `eslint .` clean · `prettier --check` clean · `generate:matrix:check` clean ·
`deps:check` clean · unit/integration/commands 141 files, 6418 pass / 3 xfail / 50 skip ·
full e2e 188 files, 640 pass / 13 xfail / 46 skip / 3 todo.

### Hand-verification (real binary, scratch HOME)

| Check                                                          | Outcome                                                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Sources step renders the two-state control                     | `+ React ❯ Local Plugin` — two cells, self-captioned, no header row                                               |
| `l` still works                                                | confirm panel reads `Marketplace All skills ejected`                                                              |
| `p` still works                                                | confirm panel reads `Marketplace Agents Inc`                                                                      |
| A config entry the source lacks is removed with a named reason | `- web-styling-retired-legacy-xyz [G] (not present in github:agents-inc/skills)`; the id is gone from `config.ts` |
| `eject` has no `--source`                                      | absent from `--help`; `eject skills --source X` → `Nonexistent flag: --source`, exit 2, nothing written           |
| `search` still works against the primary                       | `Found 35 skills matching "react"`, every row sourced `marketplace`                                               |
