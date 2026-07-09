# Changelog

All notable changes to this project will be documented in this file.

Each release has detailed notes in its own file under [`changelogs/`](./changelogs/). This file serves as a summary index.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.141.1] - 2026-07-09

**Wizard tab-bar spacing fix (hoisted domain-nav case)**

- Fixed hoisted domain-nav rendering 4 blank lines above the skills grid instead of 1, caused by a reserved-space margin duplicated onto an in-flow element

See [changelogs/0.141.1.md](./changelogs/0.141.1.md) for full details.

## [0.141.0] - 2026-04-21

**Config propagation + install-integrity + info-panel correctness (D-228, D-229, D-230, D-231, D-232)**

- Project `config-types.ts` now imports from the global install instead of duplicating unions (D-228 / D-216 Regression #1)
- Plugin install per-skill failures hard-error before `writeConfigAndCompile`, preventing orphan `config.ts` entries (D-229)
- Info-panel diff baseline treats tombstones as slot-occupants, fixing spurious `-`/`+` on dual-scope scope toggles and re-opens (D-230, D-232)

See [changelogs/0.141.0.md](./changelogs/0.141.0.md) for full details.

## [0.140.0] - 2026-04-20

**Per-skill plugin skill reference format in compiled agents (D-217)**

- Compiled agents now reference each skill using the format dictated by that skill's own `source` — `${id}:${id}` for plugin-sourced, bare `${id}` for eject/local. Mixed-mode agents (plugin + eject skills in one agent) now emit correct per-skill formats instead of the previous all-or-nothing whole-agent `installMode` behavior
- `installMode` param dropped from `compileAgentForPlugin`; new `derivePluginRef` helper decides pluginRef per-skill. `SkillReference` / `Skill` carry optional `source?: string` threaded through `buildCompileAgents` → `resolver.ts` → compiler
- New E2E `mixed-mode-skill-ref-format.e2e.test.ts` covers the contract end-to-end; fixes latent fixture template bug (`agent.preloadedSkills` typo) and trims unrealistic meta-skill preloads discovered during implementation
- D-233 (spacebar on dual-scope skill) filed with full root-cause analysis for next cycle

See [changelogs/0.140.0.md](./changelogs/0.140.0.md) for full details.

## [0.139.0] - 2026-04-20

**Backlog grooming and demo assets — no product code changes**

- 2 new plan files (D-218 plugin-install hardening, D-226 E2E sandbox HOME collapse)
- 6 new backlog tickets filed (D-227 through D-232)
- Status notes added to D-216, D-217, D-219, and the D-220–D-225 plans (now shipped)
- `assets/demo.tape` + `assets/theme.json` for a VHS-recorded README demo

See [changelogs/0.139.0.md](./changelogs/0.139.0.md) for full details.

## [0.138.0] - 2026-04-20

**Scope-toggle UX correctness — dual-scope indicator, tombstone cleanup, symmetric info-panel diff**

- D-223: `populateFromSkillIds` no longer drops excluded-global tombstones when a same-id active entry exists — dual-scope `[P][G]` badges now render after G→P toggle
- D-224: `toggleSkillScope` / `toggleAgentScope` unconditionally strip same-scope tombstones on P→G. Full G→P→G cycle is now byte-idempotent
- D-225: info panel diff is symmetric on scope toggle — `(id, scope)` / `(name, scope)` keys for `removedSkills`/`removedAgents` match `prevSkillKeySet`/`prevAgentKeySet`. Tombstone-aware baseline + suppression sets prevent double-render
- 3 new E2E tests (dual-scope badge, tombstone cleanup cycle, info-panel diff) assert both config state and rendered wizard state

See [changelogs/0.138.0.md](./changelogs/0.138.0.md) for full details.

## [0.137.0] - 2026-04-20

**Config correctness overhaul — stack preservation, agent dedup, propagation type lockstep**

- D-220: per-agent stack curation survives `cc edit`. `shouldIncludeTriple` predicate consults `existingStack` for membership (not just `preloaded`) and admits skills via `newlyAddedSkillIds` + `scopeEligibilityGained` deltas
- D-221: `mergeConfigs` uses compound `name:scope[:excluded]` keys with authoritative-from-newConfig semantics and a final `uniqueBy` dedup — repairs on-disk agent-array duplicates idempotently
- D-222: `propagateGlobalChangesToProjects` now merges `selectedAgents` into `combinedConfig` (mirroring the existing `domains` merge), keeping downstream projects' `config.ts::selectedAgents` and `config-types.ts::SelectedAgentName` in lockstep
- 3 new E2E tests (stack curation, agent-array dedup, propagation type consistency) + shared page-object helpers for scope/diff assertions

See [changelogs/0.137.0.md](./changelogs/0.137.0.md) for full details.

## [0.136.0] - 2026-04-17

**E2E lifecycle coverage expansion + documentation**

- 7 new E2E lifecycle tests covering init → edit → compile round-trips, scope-change re-compile, doctor across dual-scope installs, uninstall-reinit cycle, source switching, and error-guard paths
- New `.ai-docs/e2e-coverage-gaps.md` systematic audit maps gaps to proposed tests
- E2E standard adds three Critical Rules: state-change verification, page-object key-press safety, and strict-assertion discipline
- No production code changes

See [changelogs/0.136.0.md](./changelogs/0.136.0.md) for full details.

## [0.135.0] - 2026-04-17

**E2E test infrastructure refactor — fixtures, page objects, matchers**

- E2E fixtures, page objects, and matchers rewritten for reliability. Stability waits eliminate intermittent flakes where key handlers silently no-op'd on mid-animation frames
- `setupDualScopeWithEject` Phase B now drives the dashboard → Edit flow when prior global install exists (realistic user path)
- All 40 existing E2E tests updated to consume new APIs; no production code changes

See [changelogs/0.135.0.md](./changelogs/0.135.0.md) for full details.

## [0.134.0] - 2026-04-17

**Config-generation correctness overhaul — additive global merge, ownership-based stack builder, hardened invariants**

- `mergeGlobalConfigs` now uses a **deep-additive merge** per `(agent, category, skill)`. Project-context edits never remove or overwrite existing global state — fixes silent data loss where per-agent stack updates were dropped on write
- `buildAgentStack` rewritten as an ownership-based builder; `generateProjectConfigFromSkills` hardened with hard invariants replacing silent `"project"` scope defaults
- `matrix-provider.ts::getCategoryDomain` multi-tier fallback removed (CLAUDE.md violation; test fixtures corrected instead)
- 5 new E2E tests cover stack ownership round-trip + scope toggle correctness; 8 new unit tests cover `mergeGlobalConfigs` additive semantics including input-immutability

See [changelogs/0.134.0.md](./changelogs/0.134.0.md) for full details.

## [0.133.0] - 2026-04-17

**Plugin install pipeline hardening — no silent skips, no partial-state installs**

- `cc init` now resolves the marketplace BEFORE any filesystem mutation in `mixed`/`plugin` install modes. Previously, eject skills were copied before the plugin step ran, leaving orphaned files on disk when marketplace resolution failed
- `cc edit` plugin skill install/uninstall/scope migration now hard-errors when marketplace can't be resolved, instead of silently no-op'ing. Pure eject edits skip marketplace resolution entirely
- New `requireMarketplace` helper in both commands; 3 new E2E tests guarding the hard-error and partial-state paths
- D-218 item (2) resolved; items (1) and (3) remain open

See [changelogs/0.133.0.md](./changelogs/0.133.0.md) for full details.

## [0.132.0] - 2026-04-15

**Wizard first-frame flash fix + edit-mode escape navigation fix**

- `cc edit` no longer briefly renders the stack-selection screen before jumping to the build step. Initialization moved from a render-phase hook into `hydrateWizardStore()` called before `render(<Wizard>)`
- Two escape presses from the build step in edit mode no longer land on the stack-selection screen. `goBack` no-ops on empty history instead of falling back to `"stack"`
- D-215 logged: config shape simplification (singular-for-exclusive categories, drop `preloaded: false` default, drop `selectedAgents`, rename `domains` → `selectedDomains`)

See [changelogs/0.132.0.md](./changelogs/0.132.0.md) for full details.

## [0.131.0] - 2026-04-15

**Three scaffolding commands gated behind feature flags**

- `new skill`, `new agent`, `new marketplace` now exit non-zero with a disabled message pointing at tracking tasks (D-212, D-213, D-214). Library helpers (`scaffoldSkillFiles` etc.) remain un-gated
- 5 new tasks logged: D-210 (validate/doctor merge), D-211 (stack reorder), D-212/213/214 (scaffolding lifecycle fixes), R-01 (env-var feature flag override)
- 10-agent matrix composition investigation produced a 22-item hardening backlog under D-214
- `skills-matrix.yaml` reference removed from docs — file is legacy, not read anywhere

See [changelogs/0.131.0.md](./changelogs/0.131.0.md) for full details.

## [0.130.0] - 2026-04-15

**CLI simplification round 3 — 8 more flags pruned, dead helpers removed**

- `search` is now a zero-flag read-only catalog browse (`<query>` required); interactive multi-select + import side effects gone — use `import skill` instead
- `validate --verbose`, `edit --agent-source`, `new marketplace --output`, `update --no-recompile` all removed
- Dead helpers deleted: `resolveAgentsSource`, `formatOrigin`, `loadAgentDefs`'s first param, `SkillSearch` component (449 LOC)
- Unresolved-slug matrix diagnostic promoted `verbose()` → `warn()` so source-authoring bugs surface on stderr

See [changelogs/0.130.0.md](./changelogs/0.130.0.md) for full details.

## [0.129.0] - 2026-04-15

**CLI simplification round 2 — 13 flags pruned, doctor + validate hardened**

- Removed 13 flags across 6 commands (`doctor --verbose`, `build plugins --skills-dir`, `build marketplace` 5 metadata flags, `new skill --output`, `new agent --non-interactive/-r`, `import skill --subdir/--refresh`) — `build marketplace` now reads identity from `package.json`
- `doctor` gains per-check `safeCheck` isolation and a `CheckKind` discriminator for tip emission; `validate` dedup is realpath-based and now covers the plugins pass
- Shared test helpers extracted: `setupIsolatedHome` (9 files migrated), `writeTestPackageJson` (4 sites), `readMarketplaceJson` (3 sites)

See [changelogs/0.129.0.md](./changelogs/0.129.0.md) for full details.

## [0.128.0] - 2026-04-14

**CLI surface cleanup + validate rewrite**

- Removed: `build stack` command, `compile --agent-source`, `doctor --source`, and all `validate` positional args/flags
- `validate` is now a zero-arg four-pass command (registered sources + installed plugins + skills + agents); `validateSource` extended to cover stacks, source agents, and TS config exports
- New [commands reference](./docs/reference/commands.md); README polyglot hint

See [changelogs/0.128.0.md](./changelogs/0.128.0.md) for full details.

## [0.127.0] - 2026-04-14

**Wizard sources-step UX polish**

- Read-only global rows are now focusable from project scope; pressing Space surfaces an explanatory toast instead of being silently ignored
- Lock icon moved before the skill name in the source grid for cleaner alignment
- Mode-migrator tests isolated from real user home directory

See [changelogs/0.127.0.md](./changelogs/0.127.0.md) for full details.

## [0.126.0] - 2026-04-14

**Bug fixes: global plugin scope migration, source step navigation, build step cleanup**

- Global plugin no longer uninstalled when migrating to project-scope eject
- Source step rows sorted to match visual grouping (fixes navigation jumps)
- Removed lock icon and eject indicator from build step skill tags

See [changelogs/0.126.0.md](./changelogs/0.126.0.md) for full details.

## [0.125.0] - 2026-04-13

**D-168: E2E test audit — 86 files swept, ~45 files fixed, 6 new anti-pattern rules**

- Replaced hardcoded strings with STEP_TEXT/DIRS constants across 19 files
- Adopted content-aware matchers over raw filesystem reads in 12 files
- Fixed temp dir leaks and inline writeFile/mkdir anti-patterns in 17 files
- Extracted shared helpers (expectNoDuplicates, completeFromBuild, ProjectBuilder.dualScopeWithImport)
- Added missing timeout overrides and negative assertions in 5 files
- 3 documentation validation passes with accuracy fixes

See [changelogs/0.125.0.md](./changelogs/0.125.0.md) for full details.

## [0.124.0] - 2026-04-13

**Bug fixes: exclusive category deselect guard, SkillTag lock icon layout**

- Skills in non-required single-skill categories can now be deselected
- Lock icon no longer wraps to a new line when scope badges are present

See [changelogs/0.124.0.md](./changelogs/0.124.0.md) for full details.

## [0.123.0] - 2026-04-13

**Stack grouping, agent preselection from stacks, E2E timeout infrastructure**

- Explicit `group` property on stacks with ordered headers (D-194)
- Agents auto-preselected from stack definition instead of domain mapping (D-195)
- E2E session-level `defaultTimeout` property on TerminalSession and BaseStep (D-151)

See [changelogs/0.123.0.md](./changelogs/0.123.0.md) for full details.

## [0.122.0] - 2026-04-13

**Scope bug fixes, dual-scope badges, lock icons, source mode markers**

- Dual-scope badges (G+P) for skills and agents after scope toggle (D-191, D-183)
- Lock icon on globally installed skills, source mode change markers in info panel (D-189, D-200)
- Agent toggle guard, change summary with display names and scope labels (D-196, D-197)
- Fixed P→G reverse toggle, skill scope corruption, config-writer dedup (D-199, D-198)

See [changelogs/0.122.0.md](./changelogs/0.122.0.md) for full details.

## [0.121.0] - 2026-04-13

**Edit command change summary: scope labels, display names, G→P as additions**

- Added/removed skills now show `[G]` or `[P]` scope labels (D-197)
- Source and scope changes use display names instead of raw skill IDs
- G→P scope changes shown as additions instead of modifications

See [changelogs/0.121.0.md](./changelogs/0.121.0.md) for full details.

## [0.120.0] - 2026-04-13

**Scope-aware wizard improvements: dual-scope badges, agent toggle guard, scope preference fix**

- Dual-scope badges show both G+P when a skill exists at both scopes (D-191)
- Global agent toggle guard prevents accidental modifications from project scope (D-196)
- Project skill scope preference fix prevents misreporting after external installs (D-198)

See [changelogs/0.120.0.md](./changelogs/0.120.0.md) for full details.

## [0.119.0] - 2026-04-13

**Test infrastructure: factory adoption + E2E structure cleanup**

- Replaced inline test data with shared factories across 23 unit/integration test files
- Migrated try/finally to afterEach in 8 E2E files (D-166)
- Removed unused mock-skill exports

See [changelogs/0.119.0.md](./changelogs/0.119.0.md) for full details.

## [0.118.0] - 2026-04-09

**Test utility restructure: domain-scoped directories + 356 utility call sites**

- Split helpers.ts monolith into assertions/, factories/, helpers/ directories
- Created 18 reusable assertion utilities with E2E matchers and expected-value constants
- Migrated all 90+ test files to direct domain imports, zero barrel re-exports remaining

See [changelogs/0.118.0.md](./changelogs/0.118.0.md) for full details.

## [0.117.0] - 2026-04-09

**Comprehensive test assertion quality sweep across 133 files**

- Eliminated all weak assertion patterns (toBeDefined, toBeTruthy, toBeGreaterThan(0), bare toHaveBeenCalled)
- Enforced strict config equality, agent content verification, and negative assertions across unit + E2E tests
- Fixed 7 incorrect assertion bugs caught by stricter checks, added 11 new tests

See [changelogs/0.117.0.md](./changelogs/0.117.0.md) for full details.

## [0.116.0] - 2026-04-09

**New stack, updated matrix, task tracking**

- New default stack (17 total), updated generated types
- Added 5 new TODO tasks for scope-related UX improvements

See [changelogs/0.116.0.md](./changelogs/0.116.0.md) for full details.

## [0.115.0] - 2026-04-09

**Excluded skill fixes, scope toggle integrity, G→P override model**

- Excluded skills no longer appear as selected in edit mode; dual-entry skills display correctly
- Scope toggle deselect no longer corrupts global config; agent scope map filters tombstones
- G→P scope toggle preserves global installation — override model for both skills and agents

See [changelogs/0.115.0.md](./changelogs/0.115.0.md) for full details.

## [0.114.0] - 2026-04-09

**Build step guards: unique skill + exclusive category bypass**

- Prevent deselecting the only skill in a category (toast guard)
- Block exclusive category replacement that would implicitly deselect a global skill

See [changelogs/0.114.0.md](./changelogs/0.114.0.md) for full details.

## [0.113.0] - 2026-04-08

**Block global skill deselection from project scope**

- Globally installed skills can no longer be toggled off when editing from project scope
- Toast message explains why; init mode remains exempt for preselection adjustments

See [changelogs/0.113.0.md](./changelogs/0.113.0.md) for full details.

## [0.112.0] - 2026-04-08

**Scope-aware wizard, readOnly sources, confirm diff fixes**

- Agent toggle-off preserves selectedAgents for global agents
- Sources step marks globally-installed skills as readOnly
- ProjectAgentName narrows to project-scoped agents only

See [changelogs/0.112.0.md](./changelogs/0.112.0.md) for full details.

## [0.111.0] - 2026-04-06

**Scope-correct compilation, config, and eject copying**

- Project config no longer leaks global agent stack entries
- Init/edit use dual-pass scope-filtered compilation (global + project)
- Eject skills copy across scopes when toggled during init

See [changelogs/0.111.0.md](./changelogs/0.111.0.md) for full details.

## [0.110.3] - 2026-04-06

**Init-mode confirm diff fix and cc info removal**

- Deselected global skills no longer show as "removed" on confirm step during init
- Removed unused `cc info` command

See [changelogs/0.110.3.md](./changelogs/0.110.3.md) for full details.

## [0.110.2] - 2026-04-06

**Scope toggle fix and agent stack cross-contamination**

- S hotkey no longer blocked by excluded override entries when toggling project→global
- Stack property now uses per-agent assignments instead of assigning all skills to all agents

See [changelogs/0.110.2.md](./changelogs/0.110.2.md) for full details.

## [0.110.1] - 2026-04-06

**Consolidate buildCompileConfig with D7 cross-scope safety**

- Single canonical compile-agent construction path — global agents can no longer receive project-scoped skills during recompilation

See [changelogs/0.110.1.md](./changelogs/0.110.1.md) for full details.

## [0.110.0] - 2026-04-06

**Global config immutability and scope-aware doctor**

- Project-level operations never modify the global config
- Inlined config deduplication for excluded tombstones
- Scope-aware orphan detection in `cc doctor`

See [changelogs/0.110.0.md](./changelogs/0.110.0.md) for full details.

## [0.109.0] - 2026-04-06

**Eject indicator pill and scope toggle guard**

- Ejected skills show `⏏` pill in build step skill tags
- P→G scope toggle blocked with toast for ejected skills when global eject exists

See [changelogs/0.109.0.md](./changelogs/0.109.0.md) for full details.

## [0.108.0] - 2026-04-06

**Scope toggle bug fix and tombstone pruning**

- Fixed stale agent files remaining after scope toggle via compound merge keys and tombstone pruning
- Excluded entries no longer leak into wizard display (agents step badges, confirm step summary)
- Scope-change indicators (`~` prefix) in confirm step for edited skills/agents

See [changelogs/0.108.0.md](./changelogs/0.108.0.md) for full details.

## [0.107.0] - 2026-04-06

**Scope-grouped sources and global scope guard (D-184, D-187)**

- Source grid separates skills into labelled Global/Project sections with inline scope column
- Toast message system with auto-clear for transient wizard notifications
- S hotkey (scope toggle) disabled with toast when running init/edit from HOME

See [changelogs/0.107.0.md](./changelogs/0.107.0.md) for full details.

## [0.106.0] - 2026-04-05

**Project tracking and cross-project propagation (D-131, D-183)**

- Track project installations in global config's `projects` array
- Propagate global skill/agent changes to all registered project configs
- Deregister projects on `uninstall --all`, filter stale paths automatically

See [changelogs/0.106.0.md](./changelogs/0.106.0.md) for full details.

## [0.105.0] - 2026-04-05

**Excluded skills/agents, scope-aware wizard and confirm step**

- Replace locked concept with excluded flags — deselected globals are preserved in config, not removed
- Scope-aware confirm step detects new vs existing by id:scope pair, shows inherited globals
- Inlined project config now includes the full global stack, fixing "No skills configured" in doctor

See [changelogs/0.105.0.md](./changelogs/0.105.0.md) for full details.

## [0.104.0] - 2026-04-03

**Global skill preselection during init, safe global config merging**

- Pre-select globally installed skills/agents when initializing a new project
- Merge into existing global config instead of overwriting it on each project init
- Additive domain toggling in scratch mode, agent preselection restoration after stack choice

See [changelogs/0.104.0.md](./changelogs/0.104.0.md) for full details.

## [0.103.0] - 2026-04-02

**E2E test quality, loading spinner, selectSkill migration**

- Loading spinner during source fetch for init and edit commands
- Replaced try/finally with beforeEach/afterEach, migrated toggleSkill to selectSkill
- Cleaned up test names, removed deprecated BuildStep method

See [changelogs/0.103.0.md](./changelogs/0.103.0.md) for full details.

## [0.102.0] - 2026-04-02

**Hex colors, terminal size guard, compiler Liquid fix, edit styling**

- All CLI_COLORS migrated to hex values for consistent rendering
- Terminal size check centralized in BaseCommand — runs before every command
- Compiler preserves Liquid syntax in agent content fields (D-175)
- Edit command output styled with hex colors, loading spinner added

See [changelogs/0.102.0.md](./changelogs/0.102.0.md) for full details.

## [0.101.0] - 2026-04-02

**Agent findings audit, test quality sweep, CLI fixes**

- Audited 90 agent findings: 56 fixed/verified, 36 false positives
- `toStrictEqual` across all test files (497 replacements), console spy centralization
- `new:agent --force` flag, eject type-safety fix, agent definition updates

See [changelogs/0.101.0.md](./changelogs/0.101.0.md) for full details.

## [0.100.0] - 2026-04-01

**List command Ink UI, source grid restyle, styled edit output**

- `list` renders installed skills/agents with SkillAgentSummary component
- Source grid: inline layout, column headers, chevron focus, no borders
- Edit output: colored change summary, collapsed operational messages

See [changelogs/0.100.0.md](./changelogs/0.100.0.md) for full details.

## [0.99.0] - 2026-03-30

**Remove stale commands, expand rules and matrix**

- Removed `config`, `diff`, `outdated` commands (no longer needed)
- 12 new mutual-exclusion groups, 15+ new skill requirements, React Native state library compat
- 6 new categories and 40+ new skills in built-in matrix
- Confirm step scroll viewport fix for border rows

See [changelogs/0.99.0.md](./changelogs/0.99.0.md) for full details.

## [0.98.0] - 2026-03-29

**Info panel, confirm scroll, terminal clear**

- Info panel redesigned with scrollable skill/agent summary (marketplace, stack, scope sections)
- Confirm step uses standard scroll pattern for large skill/agent lists
- Terminal clears after wizard exits so install logs start clean

See [changelogs/0.98.0.md](./changelogs/0.98.0.md) for full details.

## [0.97.0] - 2026-03-29

**Confirm step redesign and wizard label polish**

- Confirm step replaced with 2-box layout (Skills / Agents), scope sections, bullet/+/- markers, eject icon
- Focused section headers now highlight with dark background across build, sources, and agents steps
- Init dashboard shows ASCII logo and fills terminal viewport

See [changelogs/0.97.0.md](./changelogs/0.97.0.md) for full details.

## [0.96.3] - 2026-03-29

**Test coverage gaps and two bug fixes**

- Fixed `config-loader` returning `{}` for empty files; fixed `source-validator` ignoring `custom: true` skill schema
- ~73 new command/integration tests across 11 files; `help.test.ts` created from scratch
- Integration cleanup: `wizard-init-compile-pipeline.test.ts` merged, `assertConfigIntegrity()` extracted

See [changelogs/0.96.3.md](./changelogs/0.96.3.md) for full details.

## [0.96.2] - 2026-03-29

**E2E test cleanup and type safety fixes**

- E2E lifecycle/interactive tests: try/finally → afterEach, task IDs moved to JSDoc (D-166, D-167)
- Non-null assertions eliminated in `eject.ts`, `search.tsx`, `doctor.ts` via proper TypeScript narrowing (D-165)

See [changelogs/0.96.2.md](./changelogs/0.96.2.md) for full details.

## [0.96.1] - 2026-03-29

**Compact info panel stats view**

- Info panel now shows numeric counts (global/project × plugin/eject) instead of listing all skill names (D-144)
- Info panel layout fixed to properly fill terminal height and include footer hotkey bar

See [changelogs/0.96.1.md](./changelogs/0.96.1.md) for full details.

## [0.96.0] - 2026-03-28

**Rename "local" install mode to "eject" throughout the codebase**

- `InstallMode`, `SkillConfig.source`, all types, labels, commands, schema, and tests updated (D-156)
- Lock icon removed from agents step; toast wording updated to "modify from home dir"

See [changelogs/0.96.0.md](./changelogs/0.96.0.md) for full details.

## [0.95.0] - 2026-03-28

**Lock badges and toast feedback for globally-installed skills in project-scope edit**

- Lock badge (`🔒 G` / `🔒 [G]`) on globally-installed skills and agents in project-scope edit (D-159)
- Toast when attempting to toggle a locked skill or an exclusive category locked by a global install
- Domain descriptions always visible in the domain selection step

See [changelogs/0.95.0.md](./changelogs/0.95.0.md) for full details.

## [0.94.0] - 2026-03-28

**Agent template restructuring, wizard bug fixes, E2E node-pty fix**

- All 20 agent templates restructured: `identity.md` / `playbook.md` / `output.md` convention (D-138)
- Fixed exclusive categories deselecting locked global skills in edit mode (D-161)
- Fixed sources step missing installed check for global-scope plugins (D-160)
- Fixed node-pty converting `undefined` env values to string `"undefined"` in E2E tests

See [changelogs/0.94.0.md](./changelogs/0.94.0.md) for full details.

## [0.93.0] - 2026-03-28

**Absolute localPath fix, operations reorganization**

- Local skill `localPath` changed from relative to absolute, fixing ENOENT in dual-scope edit
- Operations reorganized into `source/`, `skills/`, `project/` subfolders (D-154)
- Dead lifecycle operations removed (`executeInstallation`, `recompileProject`)

See [changelogs/0.93.0.md](./changelogs/0.93.0.md) for full details.

## [0.92.0] - 2026-03-27

**Info panel feature flag, help modal removal, task tracking cleanup**

- Help modal replaced with feature-flagged info panel (`I` key, disabled by default)
- Stats panel removed from build step
- Task tracking updated with completed items and agent gap analysis progress

See [changelogs/0.92.0.md](./changelogs/0.92.0.md) for full details.

## [0.91.0] - 2026-03-27

**Command refactors — extract private methods from 11 command run() bodies**

- All command `run()` methods decomposed into focused private methods and pure helper functions
- Added remeda `countBy`, `difference`, `indexBy` usage in doctor, edit, outdated commands

See [changelogs/0.91.0.md](./changelogs/0.91.0.md) for full details.

## [0.90.0] - 2026-03-27

**Dynamic marketplace display name, macOS symlink fix**

- Wizard Sources step resolves display name from marketplace.json `owner.name`
- Fixed macOS `/var` symlink path mismatch in scope detection
- Stabilized Ctrl+C cancellation e2e test

See [changelogs/0.90.0.md](./changelogs/0.90.0.md) for full details.

## [0.89.0] - 2026-03-27

**Exhaustive categories, meta domain rename, wizard navigation fix**

- 6 missing categories added to `defaultCategories` with exhaustive `satisfies` type check
- Meta domain renamed from "Methodology" to "Meta" in wizard
- Fixed ESC from build step skipping domain selection in edit mode

See [changelogs/0.89.0.md](./changelogs/0.89.0.md) for full details.

## [0.88.0] - 2026-03-26

**Plugin category separation — category belongs in metadata, not manifests**

- Removed `category` from `PluginManifest` — plugin.json doesn't carry skill metadata (D-149)
- Removed all category inference from names — categories come from `metadata.yaml`
- Removed unnecessary test mocks in plugin test files (D-148)

See [changelogs/0.88.0.md](./changelogs/0.88.0.md) for full details.

## [0.87.0] - 2026-03-26

**Declarative commands, operation dissolution, global skill discovery fix**

- 14 commands restructured with declarative two-tier pattern — `run()` reads like pseudocode
- 12 single-use operations dissolved back into their respective commands; operations layer trimmed to 17 shared files
- Fix: init/edit/update now discover all skills (global + project) before compiling agents

See [changelogs/0.87.0.md](./changelogs/0.87.0.md) for full details.

## [0.86.0] - 2026-03-26

**Operations layer — composable building blocks for all CLI commands**

- 26 typed operations extracted from 15 commands into `src/cli/lib/operations/` (D-145)
- All commands refactored to use operations layer; compile.ts reduced 40%, uninstall.tsx 39%, import/skill.ts 47%
- Shared utilities: `truncateText()`, `warn({ suppressInTest })`, `buildSourceSkillsMap()`

See [changelogs/0.86.0.md](./changelogs/0.86.0.md) for full details.

## [0.85.0] - 2026-03-25

**Exclusive incompatibility markers, filter deselection, declarative test data**

- Incompatibility markers suppressed in exclusive (radio) categories (D-132)
- Filter Incompatible toggle now deselects incompatible skills (D-116)
- Grid-aware `selectSkill` in E2E infrastructure, test data extracted to named constants

See [changelogs/0.85.0.md](./changelogs/0.85.0.md) for full details.

## [0.84.1] - 2026-03-25

**Replace SKILL_ID_PATTERN with generated data**

- Skill ID and category validation now uses generated `SKILL_IDS`/`CATEGORIES` arrays instead of hardcoded regex
- Unknown skill IDs in stack configs pass through with warning instead of being silently dropped
- Fixed AI-domain skills producing spurious "Invalid skill ID" warnings

See [changelogs/0.84.1.md](./changelogs/0.84.1.md) for full details.

## [0.84.0] - 2026-03-25

**Documentation restructure, scribe → codex-keeper rename**

- Consolidated all AI docs under `.ai-docs/{reference,standards,agent-findings}`
- Renamed `scribe` agent to `codex-keeper` across entire codebase
- Updated README with current 16-stack catalog and 154-skill listing

See [changelogs/0.84.0.md](./changelogs/0.84.0.md) for full details.

## [0.83.0] - 2026-03-25

**Inline global config in project config, multi-skill category fix, SkillAssignment[] arrays**

- Project config is now a self-contained snapshot with inlined global skills/agents
- Multi-select categories no longer lose skills in stack generation
- Generated config-types use proper `SkillAssignment[]` arrays

See [changelogs/0.83.0.md](./changelogs/0.83.0.md) for full details.

## [0.82.4] - 2026-03-24

**Edit command fixes: agent detection, local skill copy, scope-aware stack splitting**

- `splitConfigByScope` no longer drops project skills from global agents' stacks
- `cc edit` detects agent additions/removals and copies local skills by scope

See [changelogs/0.82.4.md](./changelogs/0.82.4.md) for full details.

## [0.82.3] - 2026-03-24

**Disable scope toggle when editing from global scope**

- S hotkey disabled in build/agents steps when no project context
- Footer hint and help modal hide scope key in global edit mode

See [changelogs/0.82.3.md](./changelogs/0.82.3.md) for full details.

## [0.82.2] - 2026-03-23

**E2E test cleanup, source path fixes, domain subnav hoisting**

- Removed 34 `undefined!` assertions and 11 raw `readFile` calls across E2E tests
- Fixed flat skill directory structure in E2E source creation
- Domain subnav hoists outside tab bar when many domains selected

See [changelogs/0.82.2.md](./changelogs/0.82.2.md) for full details.

## [0.82.1] - 2026-03-23

**Stack description cleanup, E2E active markers, skill-summoner fixes**

- Stack descriptions shortened — dropped redundant framework names
- E2E active domain marker constants added

See [changelogs/0.82.1.md](./changelogs/0.82.1.md) for full details.

## [0.82.0] - 2026-03-23

**Domain reorganization — create ai, meta, infra domains**

- 30 skills reorganized across 3 new domains (ai, meta, infra) and 10 new categories
- 3 managed database skills recategorized from api-baas to api-database

See [changelogs/0.82.0.md](./changelogs/0.82.0.md) for full details.

## [0.81.1] - 2026-03-23

**Fix: source rules override defaults for slug-based lookups**

- Source-provided skill rules now take precedence over defaults when both reference the same slug

See [changelogs/0.81.1.md](./changelogs/0.81.1.md) for full details.

## [0.81.0] - 2026-03-21

**Wizard UX: dedicated domain step, no tab numbers, agent updates**

- Dedicated domain selection step between Stack and Build (D-120)
- Tab numbers removed — cleaner `Stack  Domains  Skills  Sources  Agents  Confirm` (D-121)
- Documentor agent renamed to Scribe, new convention-keeper agent

See [changelogs/0.81.0.md](./changelogs/0.81.0.md) for full details.

## [0.80.0] - 2026-03-21

**E2E test framework overhaul — POM framework, DRY migration, 142 new tests**

- Page Object Model framework with declarative test patterns (D-134)
- 142 new tests covering command flags, error paths, and pure functions (D-136)
- DRY migration: 265 raw exit codes → constants, centralized helpers, split slow files

See [changelogs/0.80.0.md](./changelogs/0.80.0.md) for full details.

## [Unreleased]

## [0.79.0] - 2026-03-21

**Scope-aware path resolution across all commands**

- Fix all commands to route global-scoped skills/agents to `~/` and project-scoped to project dir
- Always merge global and project local skills instead of fallback pattern
- Scope-aware config generation, installation, compilation, and mode migration
- 6 new E2E test suites for scope-aware behavior

See [changelogs/0.79.0.md](./changelogs/0.79.0.md) for full details.

## [0.78.0] - 2026-03-20

**Wizard tab navigation, stats panel, e2e cleanup**

- Lift step titles into wizard-layout with domain tab navigation and dropdown selectors
- Add stats panel showing skill/scope counts in build step
- Add e2e global teardown for stale marketplace cleanup

See [changelogs/0.78.0.md](./changelogs/0.78.0.md) for full details.

## [0.77.0] - 2026-03-17

**Stacks overhaul, incompatibility detection, wizard UX improvements**

- Overhaul 13 default stacks: rename, new descriptions, 4 new stacks, reorder (D-115)
- Detect unsatisfiable requires and framework incompatibility in skill matrix
- Add `web-routing` category, recategorize TanStack Router
- Replace framework filtering with visible incompatibility markers
- Add Filter Incompatible toggle (F hotkey) in build step
- Remove auto-select, deselection blocking, and section locking

See [changelogs/0.77.0.md](./changelogs/0.77.0.md) for full details.

## [0.76.0] - 2026-03-16

**Shared meta category consolidation, web-tooling category**

- Merge `shared-methodology` + `shared-research` + `shared-reviewing` → `shared-meta`
- Add `web-tooling` category for build tools (Vite, Webpack)
- Update all 9 default stacks and generated types

See [changelogs/0.76.0.md](./changelogs/0.76.0.md) for full details.

---

## [0.75.1] - 2026-03-16

**Meta-framework ID rename, tags removal, schema reference**

- Rename meta-framework skill IDs for category consistency (web-framework-_ → web-meta-framework-_)
- Remove `tags` field from skill metadata entirely (D-103)
- Add `$schema` reference to generated metadata.yaml (D-108)

See [changelogs/0.75.1.md](./changelogs/0.75.1.md) for full details.

---

## [0.75.0] - 2026-03-16

**Framework restructuring, new stacks and categories**

- Split web-framework into base + meta-framework categories (D-38)
- Required-by label and block-deselect for meta-frameworks (D-39)
- 3 new stacks: T3, SvelteKit, Astro (9 total)
- 9 new skills: Svelte, SvelteKit, Astro, NextAuth, NestJS, Supabase, AI SDK, Clerk, MongoDB

See [changelogs/0.75.0.md](./changelogs/0.75.0.md) for full details.

---

## [0.74.13] - 2026-03-15

**Wizard UI polish, source choice flag, e2e test updates**

- Styled view titles, skill scope badges, category headers, and agent step
- Source choice screen gated behind `SOURCE_CHOICE` flag (off by default)
- Footer: remove navigate hint, add source hotkeys and agent scope toggle

See [changelogs/0.74.13.md](./changelogs/0.74.13.md) for full details.

---

## [0.74.12] - 2026-03-15

**Matrix refactor, wizard polish, symlink fix**

- Matrix resolver: split `isDiscouraged` into `isDiscouraged`, `isIncompatible`, `hasUnmetRequirements`
- Wizard: per-skill labels, remove marketplace display, simplify build step
- Fix macOS `/var` symlink bug in local-installer with `fs.realpathSync`

See [changelogs/0.74.12.md](./changelogs/0.74.12.md) for full details.

---

## [0.74.11] - 2026-03-14

**Documentation overhaul — README, standards, .ai-docs**

- README rewritten with screenshots and visual wizard walkthrough
- Standards consolidated: E2E testing bible, TypeScript types bible
- .ai-docs validated against current source (12 files updated)
- 39 redundant/completed docs removed

See [changelogs/0.74.11.md](./changelogs/0.74.11.md) for full details.

---

## [0.74.10] - 2026-03-14

**E2E test file splits for parallel execution**

- Split 6 large E2E files (1,087 to 451 lines each) into 14 smaller files
- 76 tests preserved, E2E suite now 62 files / 468 tests

See [changelogs/0.74.10.md](./changelogs/0.74.10.md) for full details.

---

## [0.74.9] - 2026-03-14

**Wizard polish, R-08 refactor, E2E test methodology fixes**

- Unify 5 resolve functions into single `resolveRelationships` (R-08)
- ViewTitle on all wizard steps (D-95), logo only on first screen (D-72)
- Relocate fake E2E tests to proper unit test files and smoke/ directory

See [changelogs/0.74.9.md](./changelogs/0.74.9.md) for full details.

---

## [0.74.8] - 2026-03-14

**Edit command scope fixes, unit test coverage expansion**

- Fix edit command using `installation.projectDir` instead of `cwd` for writes (D-92/D-93)
- Fix stack selection not resetting previous skill selections (D-94)
- 211 new unit tests for 29 previously untested pure functions

See [changelogs/0.74.8.md](./changelogs/0.74.8.md) for full details.

---

## [0.74.7] - 2026-03-13

**E2E test suite expansion and code quality audit**

- 25 new E2E test files (485 tests across 56 files) covering commands, wizards, lifecycle, and integration
- Shared E2E helpers, assertion utilities, and timing constants extracted from duplicated code
- Unit test fixture refactoring into dedicated mock-data modules

See [changelogs/0.74.7.md](./changelogs/0.74.7.md) for full details.

---

## [0.74.6] - 2026-03-13

**Fix init dashboard, custom skill pre-selection, and edit marketplace registration**

- Only show dashboard when project CLI config exists (not from Claude Code plugin settings)
- Resolve custom skill categories from matrix provider instead of static type guard
- Register marketplace before plugin installation in edit command

See [changelogs/0.74.6.md](./changelogs/0.74.6.md) for full details.

---

## [0.74.5] - 2026-03-13

**Fix custom skill warnings and multi-select for synthesized categories**

- Initialize matrix before stack resolution so custom skill IDs are recognized
- Default synthesized categories to non-exclusive (multi-select)

See [changelogs/0.74.5.md](./changelogs/0.74.5.md) for full details.

---

## [0.74.4] - 2026-03-13

**Custom skill validation, search modal fix**

- Validate custom skill IDs via matrix getter instead of broad kebab-case pattern
- Guard against undefined slug in source grid search modal

See [changelogs/0.74.4.md](./changelogs/0.74.4.md) for full details.

---

## [0.74.3] - 2026-03-13

**Verbose slug warnings, init symlink fix, E2E test hygiene**

- Fix verbose logging in validate command and init symlink path comparison
- Demote unresolved slug warnings to verbose level
- Fix E2E fixtures with required metadata fields and valid SkillIds

See [changelogs/0.74.3.md](./changelogs/0.74.3.md) for full details.

---

## [0.74.2] - 2026-03-13

**Plugin scope routing, uninstall filtering, and config splitting**

- Uninstall only removes CLI-installed plugins, preserving third-party plugins
- Plugin install/uninstall uses correct cwd for scope routing
- Agent recompiler and config generator correctly split by scope

See [changelogs/0.74.2.md](./changelogs/0.74.2.md) for full details.

---

## [0.74.1] - 2026-03-13

**Plugin install and uninstall scope fixes**

- Fix global plugin uninstall using wrong scope
- Fix plugin install marketplace gate blocking default source
- Forward `--source` flag from init to edit command

See [changelogs/0.74.1.md](./changelogs/0.74.1.md) for full details.

---

## [0.74.0] - 2026-03-13

**Config writer consolidation**

- Replace `writeProjectSourceConfig` with `generateConfigSource` — all config writes produce proper TypeScript
- Remove deprecated `ProjectSourceConfig` type alias

See [changelogs/0.74.0.md](./changelogs/0.74.0.md) for full details.

---

## [0.73.0] - 2026-03-12

**Matrix extraction, schema hardening, setup removal**

- Extract matrix-provider and skill-resolution from matrix-store/matrix-loader
- Remove extensible schema infrastructure — generated enums replace runtime extension
- Remove unused SetupPair/requiresSetup/providesSetupFor infrastructure
- Add strict and custom metadata JSON schema variants

See [changelogs/0.73.0.md](./changelogs/0.73.0.md) for full details.

---

## [0.72.0] - 2026-03-12

**Generated source types codegen**

- Codegen script replaces manually-maintained type unions with generated source of truth
- Strict slug validation at parse boundaries via Zod enum schemas
- Orphan categories removed, default configuration cleaned up

See [changelogs/0.72.0.md](./changelogs/0.72.0.md) for full details.

---

## [0.71.0] - 2026-03-11

**Reusable SelectList component, Dashboard and GlobalConfigPrompt UX overhaul**

- New `SelectList<T>` component for vertical single-select lists
- Dashboard simplified to vertical menu (no stats display)
- Screen clears between successive Ink renders

See [changelogs/0.71.0.md](./changelogs/0.71.0.md) for full details.

---

## [0.70.0] - 2026-03-11

**Centralize remaining test data (R-09b)**

- Pre-built matrix constants and config factories replace inline test data construction
- CLAUDE.md conventions updated for new test data patterns

See [changelogs/0.70.0.md](./changelogs/0.70.0.md) for full details.

---

## [0.69.0] - 2026-03-11

**loadStackById default stacks fallback (R-01)**

- `loadStackById` now checks built-in default stacks internally
- R-07 codegen plan for source-derived type unions

See [changelogs/0.69.0.md](./changelogs/0.69.0.md) for full details.

---

## [0.68.0] - 2026-03-11

**Per-agent scope in edit mode (D-74)**

- Edit command detects and displays agent scope changes (project/global)
- Agent scope configs restored when entering edit mode
- Help modal shows `S` key for agent scope toggle

See [changelogs/0.68.0.md](./changelogs/0.68.0.md) for full details.

---

## [0.67.0] - 2026-03-11

**Split init-wizard E2E tests for parallel execution (D-73)**

- Monolithic `init-wizard.e2e.test.ts` (55 tests) split into 7 independent files
- ~3.8x speedup from parallel execution (~3.5min → ~55s)
- TODO tracker cleanup: 8 tasks marked complete

See [changelogs/0.67.0.md](./changelogs/0.67.0.md) for full details.

---

## [0.66.0] - 2026-03-11

**Slug-based relationship rules (R-04 Phase 2)**

- All relationship rule types now reference skills by slug (`"react"`) instead of canonical ID (`"web-framework-react"`)
- `slug` field now required in metadata.schema.json (Step 7 finalized)
- 9 new E2E tests for slug-based relationship validation

See [changelogs/0.66.0.md](./changelogs/0.66.0.md) for full details.

---

## [0.65.0] - 2026-03-11

**Narrowed config types, edit command refactor, test consolidation (R-09)**

- Generated config-types.ts unions now reflect only installed items, not the entire matrix
- Edit command uses shared `writeScopedConfigs` instead of duplicated inline logic
- ~90 test files migrated to canonical SKILLS registry and content generators (R-09)

See [changelogs/0.65.0.md](./changelogs/0.65.0.md) for full details.

---

## [0.64.0] - 2026-03-10

**Dual-installation scope splitting, config writer named variables, global defaults**

- Scope-aware config splitting: global items write to `~/.claude-src/`, project items import from global (D-76/D-80)
- Config writer extracts typed named variables above export default for readability (D-81)
- Default scope changed to global; methodology skill auto-injection removed

See [changelogs/0.64.0.md](./changelogs/0.64.0.md) for full details.

---

## [0.63.0] - 2026-03-09

**Wizard UX polish, hotkey registry, store-only matrix access**

- Centralize wizard hotkeys into `hotkeys.ts` registry with `isHotkey()` helper
- Remove `--output` flag from compile, remove `label` from `SourceOption`
- Replace direct `matrix.skills[id]` with store accessors in 7 production files

See [changelogs/0.63.0.md](./changelogs/0.63.0.md) for full details.

---

## [0.62.0] - 2026-03-09

**Matrix store — centralized skill lookups, remove parameter threading**

- `useMatrixStore` Zustand store replaces matrix parameter threading across resolver, wizard, config, and all commands
- Remove `matrix` parameter from 9 resolver functions, 4 wizard store functions, 3 build-step functions, and config generator
- Remove redundant `slug`/`displayName`/`description` from `SkillOption` — derive from store

See [changelogs/0.62.0.md](./changelogs/0.62.0.md) for full details.

---

## [0.61.0] - 2026-03-08

**Dual-pass compile for global and project installations**

- `compile` detects both global and project installations, runs independent passes for each
- `writeProjectConfig()` E2E helper with `ProjectConfig` typing, all inline config writes migrated
- 6 new dual-scope E2E tests covering scope isolation, single-installation fallbacks, and verbose output

See [changelogs/0.61.0.md](./changelogs/0.61.0.md) for full details.

---

## [0.60.1] - 2026-03-08

**Type redundancy cleanup and test infrastructure improvements**

- `CategoryDomainMap`, `PluginConfigResult`, and 4 other types simplified with `Pick`/`Omit`/extends
- `TestSkill` derived from `ExtractedSkillMetadata`, dead alias fields removed, `writeTestSkill` options auto-derived

See [changelogs/0.60.1.md](./changelogs/0.60.1.md) for full details.

---

## [0.60.0] - 2026-03-07

**Slug-based skill identity — R-04 Phase 1**

- `SkillSlug` union type replaces `SkillDisplayName` with compile-time checked slugs
- Aliases and per-skill rules removed — slugs derived from metadata, relationships use group-based declarations
- New relationship types: `CompatibilityGroup`, `SetupPair`, flat `Recommendation`

See [changelogs/0.60.0.md](./changelogs/0.60.0.md) for full details.

---

## [0.59.0] - 2026-03-07

**Dual-scope agent installation with per-agent project/global scope**

- `AgentScopeConfig` replaces bare agent name arrays — each agent has its own scope
- Global installation detection in `init` command with project/global/cancel prompt
- D-37, D-65, B-09 completed

See [changelogs/0.59.0.md](./changelogs/0.59.0.md) for full details.

---

## [0.58.0] - 2026-03-06

**Per-skill scope toggle, S key badge, E2E fixes**

- S key toggles focused skill's scope (project/global) in build step with [P]/[G] badge
- Fix `new marketplace` / `new skill` failing in temp dirs (skip detectInstallation with --output)
- 28 E2E test failures fixed, test suite updated for SkillConfig[] format

See [changelogs/0.58.0.md](./changelogs/0.58.0.md) for full details.

---

## [0.57.0] - 2026-03-02

**Per-skill install mode, archive removal, mode migration**

- Install mode derived from per-skill source selections (`"local"`, `"plugin"`, `"mixed"`)
- Archive mechanism replaced with permanent delete — `deleteLocalSkill()` replaces archive/restore
- Mode migrator handles per-skill local↔plugin transitions in `cc edit`

See [changelogs/0.57.0.md](./changelogs/0.57.0.md) for full details.

---

## [0.56.1] - 2026-03-02

**Domain metadata cleanup, D-37 design doc update**

- `domain` now explicit in skill/agent metadata (no more category prefix inference)
- D-37 install mode redesign doc updated for config.ts, dropped `skillOverrides`

See [changelogs/0.56.1.md](./changelogs/0.56.1.md) for full details.

---

## [0.56.0] - 2026-03-02

**E2E test coverage, global config detection, pre-commit E2E hook**

- 350+ E2E tests covering all commands and wizard flows
- `agentsinc init` prompts when global config exists but no project config (D-65)
- E2E tests added to pre-commit hook (D-63)

See [changelogs/0.56.0.md](./changelogs/0.56.0.md) for full details.

---

## [0.55.1] - 2026-03-01

**B-08 selective agent removal, D-70 rename Subcategory → Category**

- Fixed `uninstall` to selectively remove only config-listed agents instead of wiping the entire agents directory
- Renamed `Subcategory` type to `Category` across ~64 files — aligns with `category` field in `metadata.yaml`

See [changelogs/0.55.1.md](./changelogs/0.55.1.md) for full details.

---

## [0.55.0] - 2026-03-01

**Remove `--dry-run` flag**

- Removed `--dry-run` from all commands — wizard confirm step already previews, all operations are local/reversible

See [changelogs/0.55.0.md](./changelogs/0.55.0.md) for full details.

---

## [0.54.0] - 2026-03-01

**Config file renames, domain ordering fix**

- Renamed `ts-config-*` files to `config-*` — drop prefix now that all configs are TypeScript
- Fixed domain ordering mismatch — custom domains now appear first in all wizard views

See [changelogs/0.54.0.md](./changelogs/0.54.0.md) for full details.

---

## [0.53.0] - 2026-02-28

**Config-types regeneration, sectioned unions, required domain**

- Auto-regenerate `config-types.ts` on `new skill` and `new agent` creation
- Sectioned `// Custom` / `// Marketplace` comments in generated union types
- Domain now required on all skill metadata — never inferred from category prefix

See [changelogs/0.53.0.md](./changelogs/0.53.0.md) for full details.

---

## [0.52.0] - 2026-02-28

**Generated config types, remove defineConfig() runtime dependency**

- Generated `config-types.ts` gives users editor autocomplete with zero dependencies
- Config output uses `satisfies ProjectConfig` instead of `defineConfig()` wrapper
- Fixes root cause of B-08 (uninstall failing due to jiti import resolution)

See [changelogs/0.52.0.md](./changelogs/0.52.0.md) for full details.

---

## [0.51.0] - 2026-02-28

**Install scope tracking, global test isolation**

- Add `installScope` to wizard store — track project vs global scope through wizard flow
- Global `vitest.setup.ts` mocks `os.homedir()` to prevent real global config from leaking into tests
- Fix 63 test failures across 16 files caused by global config fallback

See [changelogs/0.51.0.md](./changelogs/0.51.0.md) for full details.

---

## [0.50.0] - 2026-02-27

**Pre-1.0 cleanup — agent.yaml rename, expert mode removal, scroll hook extraction, DRY consolidation**

- Rename `agent.yaml` to `metadata.yaml` across all 17 agents
- Remove `cli-migrator` agent and expert mode toggle
- Extract `useSectionScroll` and `useRowScroll` hooks from 6 wizard components
- Unify scroll rendering, fix domain sort order stability (B-07)
- Dashboard view when `init` is run on existing project

See [changelogs/0.50.0.md](./changelogs/0.50.0.md) for full details.

---

## [0.49.0] - 2026-02-27

**Config file generation for new skill and new marketplace commands**

- `new marketplace` scaffolds `config/skill-categories.yaml` and `config/skill-rules.yaml`
- `new skill` creates or updates config files when running in marketplace context
- Matrix decomposition (D-50) all 8 phases complete

See [changelogs/0.49.0.md](./changelogs/0.49.0.md) for full details.

---

## [0.48.0] - 2026-02-27

**Matrix decomposition, displayName rename, E2E test infrastructure**

- Decompose `skills-matrix.yaml` into `skill-categories.yaml` + `skill-rules.yaml` with directory-based skill discovery
- Rename `cliName` to `displayName` in metadata schema, loaders, and validators
- Remove per-skill `categoryExclusive` — exclusivity now driven by category definitions
- Full PTY-based E2E test suite with 264 tests covering all commands and interactive flows

See [changelogs/0.48.0.md](./changelogs/0.48.0.md) for full details.

---

## [0.47.0] - 2026-02-25

**Custom domain support, source validation, wizard improvements, dead code cleanup**

- Domain field on skill metadata and agent YAML for custom marketplace support
- `validate --source` command for source repository validation
- Fix custom skill ID rejection in stacks validation
- Remove redundant verifyHash and legacy slash-in-skill-ID code

See [changelogs/0.47.0.md](./changelogs/0.47.0.md) for full details.

---

## [0.46.0] - 2026-02-24

**Custom extensibility, new commands, agent-mapping removal, wizard improvements**

- Custom extensibility foundation: runtime-extensible schemas for custom skills, agents, categories, and domains from private marketplaces
- Remove agent-mappings.yaml and skill-to-agent routing — all skills assigned to all selected agents
- Promote `eject templates` to first-class type, add `new marketplace` command, improve `new skill` and `new agent`
- Dynamic wizard domains/agents from merged matrix, fix stack domain preselection
- Fix plugin mode marketplace registration (strip `github:` prefix)

See [changelogs/0.46.0.md](./changelogs/0.46.0.md) for full details.

---

## [0.45.0] - 2026-02-22

**Persist agent selection, skill relation validation, eject fix, test fixtures**

- Persist `selectedAgents` in config for edit mode restoration
- Validate cross-skill relation refs in matrix health check
- Fix eject preserving existing templates, fix cache --refresh orphan skills
- Replace createMockSkill with TEST_SKILLS constants across test suite

See [changelogs/0.45.0.md](./changelogs/0.45.0.md) for full details.

---

## [0.44.0] - 2026-02-21

**README refresh, terminal logo support, task cleanup**

- Redesign README skills section with inline code tags and add logo
- Add terminal logo image rendering in wizard (terminal-image)
- Clean up completed/deferred TODO tasks
- Remove stale docs and config files

See [changelogs/0.44.0.md](./changelogs/0.44.0.md) for full details.

---

## [0.43.0] - 2026-02-21

**Remove legacy version commands, version metadata field, and ghost-reference health checks**

- Remove `version` command group (redundant with build plugins auto-versioning)
- Remove `version` field from skill metadata (parsed but never used)
- Remove ghost-reference checks from matrix health check (expected for marketplace sources)

See [changelogs/0.43.0.md](./changelogs/0.43.0.md) for full details.

---

## [0.42.0] - 2026-02-19

**SelectionCard component, eject --templates, edit local-mode fix, wizard UI refresh**

- Extract reusable `SelectionCard` for stack selection, sources, and domain selection
- Add `eject agent-partials --templates` flag for template-only ejection
- Fix edit command falling back to project config skills in local mode
- Refresh wizard UI: tabs, titles, category grid, help modal styling

See [changelogs/0.42.0.md](./changelogs/0.42.0.md) for full details.

---

## [0.41.2] - 2026-02-19

**Fix README accuracy, add framework positioning task**

- Fix CLI skills category listing inaccurate skills that don't exist yet
- Add D-33 task for README framework positioning rewrite

See [changelogs/0.41.2.md](./changelogs/0.41.2.md) for full details.

---

## [0.41.1] - 2026-02-19

**Missing changelog entries, commit protocol checklist, test helper extraction**

- Add missing 0.41.0 and 0.33.0 entries to CHANGELOG.md
- Convert commit protocol to mandatory release checklist
- Extract shared test helpers and fixtures from inline test data

See [changelogs/0.41.1.md](./changelogs/0.41.1.md) for full details.

---

## [0.41.0] - 2026-02-19

**Fix config stack generation, CLI_BIN_NAME constant**

- Fix config.yaml missing stack/agents after init (defaults-loader path resolution in dist builds)
- Fix agent-mappings patterns for domain-prefixed subcategories (D-31 follow-up)
- Fix wizard storing display names instead of canonical skill IDs
- Add `CLI_BIN_NAME` constant replacing 19 hardcoded command references

See [changelogs/0.41.0.md](./changelogs/0.41.0.md) for full details.

---

## [0.40.0] - 2026-02-19

**Domain-prefix all category keys (D-31), add category enum to metadata schema (D-32)**

- Rename all 33 bare category keys to domain-prefixed form (e.g., `framework` → `web-framework`, `methodology` → `shared-methodology`)
- Add strict category enum validation to metadata schema
- Simplify `extractSubcategoryFromPath` and `categoryPathSchema` (remove slash-separated paths)
- Update all YAML configs, JSON schemas, types, source code, and 30+ test files

See [changelogs/0.40.0.md](./changelogs/0.40.0.md) for full details.

---

## [0.39.0] - 2026-02-19

**Merge meta-framework into framework, remove web-extras domain, grouped agents step**

- Merge `meta-framework` category into `framework` — meta-frameworks now conflict with base frameworks directly
- Remove `web-extras` domain and `parentDomain` field — all web categories under single `web` domain
- Rewrite agents step with domain-grouped layout (Web, API, CLI, Meta) and scroll support
- Simplify agent preselection from skill-based to domain-based lookup
- Remove unused `preloadedSkills` and `subcategoryAliases` from agent mappings

See [changelogs/0.39.0.md](./changelogs/0.39.0.md) for full details.

---

## [0.38.0] - 2026-02-18

**Agents selection step, skill-based preselection, strict stacks schema**

- New "Agents" wizard step — users can toggle which agents to compile
- Agents preselected from actually selected skills (not just domains)
- Stacks schema enforces valid category keys via enum
- Reusable CheckboxGrid component extracted from domain selection

See [changelogs/0.38.0.md](./changelogs/0.38.0.md) for full details.

---

## [0.37.0] - 2026-02-18

**Rename all snake_case config/metadata fields to camelCase (D-27)**

- 27 fields renamed across types, schemas, configs, and all implementation code
- All 6 JSON schemas updated, validation error discriminants renamed
- Zero backward compatibility shims — clean break

See [changelogs/0.37.0.md](./changelogs/0.37.0.md) for full details.

---

## [0.36.0] - 2026-02-18

**Tier-based source sort order, display name rendering, and code standards enforcement**

- Sources step sorts by fixed tiers: local → scoped marketplace → default public → third-party
- Skills render full display names in Sources step (matching Build step)
- Clean code standards enforced across ~30 files (comments, typedKeys, getErrorMessage, test helpers)

See [changelogs/0.36.0.md](./changelogs/0.36.0.md) for full details.

---

## [0.35.0] - 2026-02-18

**Selective uninstall, expert mode persistence, metadata.yaml requirement, and test infrastructure overhaul**

See [changelogs/0.35.0.md](./changelogs/0.35.0.md) for full details.

---

## [0.34.1] - 2026-02-17

**Code formatting**

Prettier applied across wizard components.

See [changelogs/0.34.1.md](./changelogs/0.34.1.md) for full details.

---

## [0.34.0] - 2026-02-17

**Wizard UX overhaul — layout, scrolling, navigation, and visual redesign**

See [changelogs/0.34.0.md](./changelogs/0.34.0.md) for full details.

---

## [0.33.0] - 2026-02-16

**Rebrand from claude-collective to agents-inc**

- Package renamed: `@claude-collective/cli` → `@agents-inc/cli`
- CLI binary renamed: `cc` → `agentsinc`
- Update schema URLs, help text, branding, and documentation

See [changelogs/0.33.0.md](./changelogs/0.33.0.md) for full details.

---

## [0.32.1] - 2026-02-16

**Code formatting cleanup (Prettier consistency)**

See [changelogs/0.32.1.md](./changelogs/0.32.1.md) for full details.

## [0.32.0] - 2026-02-16

**Wizard simplification, branding, scroll viewport, and code quality**

See [changelogs/0.32.0.md](./changelogs/0.32.0.md) for full details.

## [0.31.1] - 2026-02-16

**Commit protocol and changelog architecture**

Established commit protocol for AI agents with split-file changelog pattern.

[-> Full release notes](./changelogs/0.31.1.md)

## [0.31.0] - 2026-02-16

**CLAUDE.md project instructions and test infrastructure**

Comprehensive AI agent instructions, test fixture structure, feature proposals, and documentation cleanup.

[-> Full release notes](./changelogs/0.31.0.md)

## [0.30.0] - 2026-02-16

**Settings.json-based plugin discovery**

Migrated plugin discovery from project-local directory scanning to settings.json-based resolution via global plugin registry.

[-> Full release notes](./changelogs/0.30.0.md)

## [0.29.5] - 2026-02-15

**Fix local YAML schema paths**

Replaced relative local schema paths with raw.githubusercontent.com URLs for consumer project compatibility.

[-> Full release notes](./changelogs/0.29.5.md)

## [0.29.4] - 2026-02-15

**Strict JSON schema validation**

All 12 generated JSON schemas now enforce meaningful constraints for IDE autocomplete and validation.

[-> Full release notes](./changelogs/0.29.4.md)

## [0.29.3] - 2026-02-15

**Fix wrong YAML schema on generated config**

Fixed `cc init` embedding wrong schema reference in generated config.yaml.

[-> Full release notes](./changelogs/0.29.3.md)

## [0.29.2] - 2026-02-15

**Multi-skill stack assignments in project config**

Stack config now stores multiple skills per category with preloaded flags preserved through the full pipeline.

[-> Full release notes](./changelogs/0.29.2.md)

## [0.29.1] - 2026-02-15

**Lint fixes and code cleanup**

Regex unicode flags, switch default cases, template literals, control flow simplification, and type cleanup.

[-> Full release notes](./changelogs/0.29.1.md)

## [0.29.0] - 2026-02-15

**Shared utilities, security hardening, and integration tests**

Extracted utility modules, expanded Zod schemas, added integration test suites, and hardened path traversal and input validation.

[-> Full release notes](./changelogs/0.29.0.md)

## [0.28.0] - 2026-02-13

**Explicit preloaded booleans and published JSON schemas**

Stack skills use explicit preloaded flags, published JSON schemas for IDE validation, and extended `cc validate` targets.

[-> Full release notes](./changelogs/0.28.0.md)

## [0.27.0] - 2026-02-13

**Stacks use skill IDs and config-driven source loading**

Stacks reference skills by ID instead of display name alias. Marketplace repos can declare custom resource paths.

[-> Full release notes](./changelogs/0.27.0.md)

## [0.26.1] - 2026-02-13

**Fix metadata version coercion and stack lookup**

Fixed version coercion warnings, stack lookup from source in plugin mode, and skills matrix fallback.

[-> Full release notes](./changelogs/0.26.1.md)

## [0.26.0] - 2026-02-13

**Plugin-aware compilation and marketplace guides**

Plugin-aware agent compilation, stacks from source, individual skill plugin installation, and marketplace documentation.

[-> Full release notes](./changelogs/0.26.0.md)

## [0.25.1] - 2026-02-13

**Code formatting**

Prettier applied across 21 files.

[-> Full release notes](./changelogs/0.25.1.md)

## [0.25.0] - 2026-02-12

**Multi-source skill selection (UX 2.0)**

Full multi-source skill selection with source grid, source switching, bound skill search, and settings management.

[-> Full release notes](./changelogs/0.25.0.md)

## [0.24.7] - 2026-02-12

**Sources step and edit command improvements**

New Sources wizard step, edit command starts at Build step, parse boundary hardening.

[-> Full release notes](./changelogs/0.24.7.md)

## [0.24.6] - 2026-02-12

**Codebase-wide comment cleanup**

Removed ~5,600 lines of AI-generated banner comments, standardized JSDoc on type definitions.

[-> Full release notes](./changelogs/0.24.6.md)

## [0.24.5] - 2026-02-11

**Command tests and Vitest auto-mocks**

158 new command tests, Vitest auto-mocks for fs/logger, config split into 3 test projects.

[-> Full release notes](./changelogs/0.24.5.md)

## [0.24.4] - 2026-02-11

**Library restructured into domain subdirectories**

62 files moved from flat `lib/` into 8 domain-organized subdirectories with barrel imports.

[-> Full release notes](./changelogs/0.24.4.md)

## [0.24.3] - 2026-02-11

**AJV replaced with Zod, JSON schemas generated from Zod**

Schema validation rewritten to Zod, JSON schemas generated natively, YAML references use local paths.

[-> Full release notes](./changelogs/0.24.3.md)

## [0.24.2] - 2026-02-11

**Type definitions co-located**

4 scattered type files consolidated into 6 domain-organized files under `src/cli/types/`.

[-> Full release notes](./changelogs/0.24.2.md)

## [0.24.1] - 2026-02-11

**Stack config respects customizations, parse boundaries hardened**

Stack config uses user selections, parse boundaries warn on failure, 17 new unit test files.

[-> Full release notes](./changelogs/0.24.1.md)

## [0.24.0] - 2026-02-11

**Type system rewrite and dead code removal**

All interfaces replaced with type aliases, stack as single source of truth, ~2,100 lines of dead code removed.

[-> Full release notes](./changelogs/0.24.0.md)

## [0.23.0] - 2026-02-10

**Zod runtime validation, typed utilities, and Remeda**

30+ Zod schemas at parse boundaries, typed object utilities, Remeda array operations, named type aliases.

[-> Full release notes](./changelogs/0.23.0.md)

## [0.22.0] - 2026-02-09

**Union types for IDs, categories, agents, and domains**

Strict union types replace `string` across the codebase. Normalized skill ID format enforced at compile time.

[-> Full release notes](./changelogs/0.22.0.md)

## [0.21.0] - 2026-02-09

**Removed refine step, added web-extras domain**

Wizard simplified to 4 steps. 8 categories split into `web-extras` domain with parent domain inheritance.

[-> Full release notes](./changelogs/0.21.0.md)

## [0.20.0] - 2026-02-07

**Removed StackConfig type and global config layer**

All consumers operate directly on ProjectConfig. Global config and related commands deleted.

[-> Full release notes](./changelogs/0.20.0.md)

## [0.19.0] - 2026-02-07

**Removed top-level categories, aligned agent mappings with domains**

Flattened skills matrix to domain-based organization. Agent mapping patterns renamed to match domains.

[-> Full release notes](./changelogs/0.19.0.md)

## [0.18.0] - 2026-02-07

**Matrix health check and type consolidation**

Referential integrity validation, dead type removal, shared utilities extraction, matrix alias cleanup.

[-> Full release notes](./changelogs/0.18.0.md)

## [0.17.0] - 2026-02-07

**Local skill badge and module extraction**

Local skill `[L]` badge in wizard, extracted config-merger, local-installer, and skill resolution improvements.

[-> Full release notes](./changelogs/0.17.0.md)

## [0.16.0] - 2026-02-07

**Simplified wizard flow and styling updates**

Removed stack-options step, simplified ViewTitle API, border-based skill tag styling.

[-> Full release notes](./changelogs/0.16.0.md)

## [0.15.0] - 2026-02-07

**Custom navigation components and global shortcuts**

MenuItem and ViewTitle components, global keyboard shortcuts for mode toggles.

[-> Full release notes](./changelogs/0.15.0.md)

## [0.14.1] - 2026-02-07

**Library extraction: skill-metadata, config-saver, plugin-manifest-finder**

Deduplicated shared logic into 3 new library modules.

[-> Full release notes](./changelogs/0.14.1.md)

## [0.14.0] - 2026-02-07

**WizardLayout, redesigned tabs and footer, ASCII banner**

Extracted WizardLayout component, unified footer, ASCII art banner, Prettier config.

[-> Full release notes](./changelogs/0.14.0.md)

## [0.13.4] - 2026-02-06

**Fix local skills losing category metadata**

Local skills now preserve original category from metadata.yaml instead of hardcoding "local/custom".

[-> Full release notes](./changelogs/0.13.4.md)

## [0.13.3] - 2026-02-06

**Fix local config and agent_skills normalization**

Fixed recompile config lookup fallback and agent_skills mixed format normalization.

[-> Full release notes](./changelogs/0.13.3.md)

## [0.13.2] - 2026-02-06

**Fix npx eject missing agent partials**

Added `src/agents/` to published npm package.

[-> Full release notes](./changelogs/0.13.2.md)

## [0.13.1] - 2026-02-06

**Fix npx eject ENOENT and build config**

Added `config/` to published package, fixed build to copy config to dist, test portability improvements.

[-> Full release notes](./changelogs/0.13.1.md)

## [0.13.0] - 2026-02-06

**Import command, interactive search, framework-first build**

Import skills from GitHub, interactive skill search with multi-select, framework-first wizard flow.

[-> Full release notes](./changelogs/0.13.0.md)

## [0.12.0] - 2026-02-04

**Agent Compliance Bible and Claude Code research**

30-test compliance suite, 176 Claude Code updates documented, agent partials conciseness pass.

[-> Full release notes](./changelogs/0.12.0.md)

## [0.11.0] - 2026-02-04

**CLI source directory rename and Bible documentation**

`src/cli-v2/` renamed to `src/cli/`, comprehensive documentation standards added.

[-> Full release notes](./changelogs/0.11.0.md)

## [0.10.0] - 2026-02-03

**Directory structure: .claude-src/ and .claude/**

Source files in `.claude-src/`, runtime output in `.claude/`. Breaking change to directory layout.

[-> Full release notes](./changelogs/0.10.0.md)

## [0.9.0] - 2026-02-03

**Config location change and eject simplification**

Config moved to `.claude/config.yaml`, eject types simplified, wizard pre-population.

[-> Full release notes](./changelogs/0.9.0.md)

## [0.8.0] - 2026-02-02

**Skill IDs normalized to kebab-case**

Breaking change from path-based IDs to simple kebab-case format. Meta-stack added.

[-> Full release notes](./changelogs/0.8.0.md)

## [0.7.0] - 2026-02-02

**Wizard flow redesign with domain-based grid selection**

New 5-step flow with CategoryGrid, WizardTabs, domain-based navigation. Complete wizard rewrite.

[-> Full release notes](./changelogs/0.7.0.md)

## [0.6.0] - 2026-02-01

**Skills defined in stacks, not agents**

Breaking change: stacks.yaml defines technology selections per agent. Skills resolved via matrix aliases.

[-> Full release notes](./changelogs/0.6.0.md)

## [0.5.1] - 2026-02-01

**Auto-detection of installation mode**

CLI auto-detects local vs plugin installation. `installMode` stored in config.

[-> Full release notes](./changelogs/0.5.1.md)

## [0.5.0] - 2026-02-01

**Agent-centric configuration**

Breaking change: skills defined in agent YAMLs, centralized stacks.yaml.

[-> Full release notes](./changelogs/0.5.0.md)

## [0.4.0] - 2026-01-31

**Methodology skills preselected and comprehensive test suite**

Foundational skills selected by default, 1000+ tests, test isolation support.

[-> Full release notes](./changelogs/0.4.0.md)

## [0.3.0] - 2026-01-31

**CLI framework migration to oclif + Ink**

Migrated from Commander.js + @clack/prompts to oclif + Ink + Zustand.

[-> Full release notes](./changelogs/0.3.0.md)

## [0.2.0] - 2026-01-30

**Marketplace support**

Install stack plugins from configured marketplaces, multi-source agent loading.

[-> Full release notes](./changelogs/0.2.0.md)

## [0.1.3] - 2026-01-30

**Eject output option and remote schema fetching**

Custom output directory for eject, remote schema validation from GitHub.

[-> Full release notes](./changelogs/0.1.3.md)

## [0.1.2] - 2026-01-30

**Remove local dev files from repo**

Cleaned up local development files (.claude, CLAUDE.md).

[-> Full release notes](./changelogs/0.1.2.md)

## [0.1.1] - 2026-01-30

**Fix repo reference and README agent names**

Corrected GITHUB_REPO const and README agent names.

[-> Full release notes](./changelogs/0.1.1.md)

## [0.1.0] - 2026-01-30

**Initial release**

Interactive wizard, stack installation, skill compilation, validation, configuration management, and plugin mode.

[-> Full release notes](./changelogs/0.1.0.md)
