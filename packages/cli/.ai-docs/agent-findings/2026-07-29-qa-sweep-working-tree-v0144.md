---
type: audit
severity: high
affected_files:
  - src/cli/commands/compile.ts
  - src/cli/commands/validate.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/plugins/plugin-info.ts
  - src/cli/lib/source-validator.ts
  - e2e/pages/steps/build-step.ts
  - e2e/helpers/test-utils.ts
standards_docs:
  - docs/guides/editing-config.md
  - docs/reference/commands.md
date: 2026-07-29
reporting_agent: qa-orchestrator (multi-agent live-CLI sweep)
category: testing
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  Re-derived 2026-08-20 against source. The requires-enforcement item is RULED and its
  compatibility/matrix bullet is CORRECTED; the marketplace-repo content items are not this
  repository and stay open. RULED - the advisory model is the intended behaviour and stays. A skill
  breaking a `requires`, `conflicts` or `discourages` rule is labelled in the grid, stays fully
  selectable, installs, and draws a warning after the fact. Strict-block, a dependency cascade and a
  grid filter were all considered and none is adopted; treat a proposal for any of them as a product
  change rather than a bug fix. The model is now documented as intended behaviour in
  reference/features/skills-and-matrix.md under "Every relationship is ADVISORY". CORRECTED - this
  finding's "the edit grid makes requires-gated skills unreachable via navigation" is FALSE against
  current source and was describing the withdrawn `f` incompatible-filter. Nothing skips or blocks a
  gated cell - `useFocusedListItem` is a generic 2D focus hook, `category-grid.tsx` passes it only
  `findValidCol` (`wrapOptionIndex` over the option count, consulting no state) and no `skipRow`,
  `useCategoryGridInput` sends SPACE to whatever cell is focused, and `toggleTechnology` refuses only
  on scope ownership and the last-skill-in-a-required-exclusive-category guard. The E2E-infrastructure
  bullet's "horizontal nav skips disabled/incompatible cells and SPACE on guarded cells is a silent
  no-op" is stale for the same reason, whatever remains true of the page object's other claims. The
  `f` filter is WITHDRAWN rather than flag-gated - no feature-flag constant of any name survives
  under `src/`, `hotkeys.ts` binds nothing to `f`, and `e2e/interactive/edit-wizard-navigation.e2e.test.ts`
  pins the key inert by asserting the screen is byte-identical across the press. Also stale - the
  init/edit asymmetry this finding recorded is gone; `reportValidationErrors` on `BaseCommand` is
  called by both `commands/init.tsx` and `commands/edit.tsx`.
---

# QA sweep of the uncommitted working tree (v0.144.1 banner), 2026-07-28/29

Pick-up document for a separate session. A 23-agent sweep drove the **real built
CLI** (from the then-uncommitted working tree) through every common use case in
sandboxed environments: global/project installs in plugin and eject modes, skill
toggling, plugin↔eject mode switching (incl. mixed per-skill), agent selection +
scope toggling, multi-project propagation with global skill removal, uninstall
flows, and the non-interactive command surface. Every mutating stage was verified
against `config.ts` + `config-types.ts` at **both** scopes plus the `.claude/`
filesystem. All findings below were reproduced at least twice; the two majors were
additionally re-verified adversarially in fresh sandboxes by independent agents.

Method: scenario scripts run under the repo's own vitest using the e2e page
objects (`TerminalSession`, `InitWizard`, `EditWizard`) with `HOME` pointed at
sandbox dirs and `--source /home/vince/dev/skills` (read-only). See "Reproducing
the harness" at the end. Original sandboxes/logs lived under the session
scratchpad in `/tmp` (ephemeral — assume gone); every repro below is
self-contained.

## Baseline (all green)

- `tsup` build clean. `tsc --noEmit`: **1 pre-existing error** (initially
  misreported as clean — a piped exit code masked it): TS1360 at
  `src/cli/lib/configuration/default-categories.ts:468` — `defaultCategories`
  defines 50 categories but the generated `Category` union has 88; 38 category
  definitions missing (api-caching, api-graphql, api-messaging, api-queue, +34
  more). Present in the staged working tree before any QA/fix activity; needs a
  product decision (add the missing definitions or loosen the `satisfies`
  constraint).
- Unit suite: 127 files, 5,099 passed / 50 skipped.
- Full e2e suite: 145 files passed / 5 skipped, 587 tests passed / 0 failed (~5.7 min).

## Verified working (do not re-litigate)

- Plugin-mode installs (global and project): `settings.json` `enabledPlugins`,
  `installed_plugins.json` (v2 cache layout), no local copies; surgical add/remove
  on toggle; permissions and `extraKnownMarketplaces` preserved across edits.
- Eject-mode installs (global and project): copies land at the correct scope root
  only; removed-skill directories cleaned; `compile` byte-idempotent.
- Mode switching plugin→eject→plugin and mixed per-skill sources: plugins
  uninstalled/reinstalled, files copied/removed, `source` fields flip correctly,
  nothing orphaned. `eject agent-partials`/`templates` + subsequent compile works.
- Agent lifecycle: selection, deselection (stale compiled `.md` pruned), scope
  flips G↔P move compiled files with no duplicates; tombstones
  (`excluded: true`) created and cleaned exactly per the round-trip contract;
  `GLOBAL_SKILLS_BLOCKED`/`GLOBAL_AGENTS_BLOCKED` guards hold from project scope.
- Multi-project propagation (1 HOME + 2 projects): no cross-leak between
  projects; global config registers projects as realpaths and the `projects[]`
  field survives HOME-context edits; global skill add/remove via the **wizard**
  re-inlines/prunes in every registered project (incl. stack refs); removing all
  global skills yields `SkillId = never` (no `string` union collapse on this
  path); project-scope `config-types.ts` keeps the import-and-extend shape.
- Uninstall: project uninstall preserves global content and updates the global
  registry; global uninstall preserves project-owned and user-authored content;
  re-init after uninstall is clean. Corrupt `config.ts` → clear ConfigLoadError,
  non-zero exit, no partial writes.

## Confirmed issue 1 (major): `validate` exits 1 on a healthy install

Immediately after any clean install from the official marketplace,
`agentsinc validate` reports `222 skill(s), 45 error(s), 177 warning(s)` and
exits 1, while `doctor` on the same state passes. Three compounding parts:

1. **Marketplace/schema drift** — 45 of 222 skills in `/home/vince/dev/skills`
   fail the CLI's `cliDescription` ≤ 60-char bound (metadata schema in
   `src/cli/lib/schemas.ts`); e.g. `ai-provider-anthropic-sdk`,
   `web-ui-chakra-ui`, `web-meta-framework-qwik`, `web-utilities-rxjs`. Fix is
   either marketplace content or schema bound — decide which side owns the limit.
2. **displayName rule can never pass** (minor) — `checkDisplayNameMatches`
   (`src/cli/lib/source-validator.ts` ~67–80) requires `displayName` to equal the
   directory name exactly; the marketplace convention is
   `<domain>-<category>-<slug>` dirs with human display names ("React" vs
   `web-framework-react`), so ~177/222 skills warn. Should compare slug or a
   slugified displayName.
3. **Plugins pass is blind to the claude CLI cache layout** (minor) —
   `findPluginDirectories` (`src/cli/commands/validate.ts` ~324) only inspects
   direct children of `~/.claude/plugins` for a `.claude-plugin` manifest; claude
   CLI ≥2.1.220 installs under `plugins/cache/<marketplace>/<plugin>/<version>/`
   and records in `installed_plugins.json` (v2). Result: "— no plugins" printed
   while plugins are installed and enabled, so bundles are never validated.

Repro: fresh sandbox HOME, `agentsinc init --source /home/vince/dev/skills`
(any small selection, default plugin mode), then `agentsinc validate` with the
same HOME → exit 1. Reproduced identically in 8+ sandboxes across scenarios.

## Confirmed issue 2 (major): global hand-edit + `compile` skips project propagation

The documented flow — hand-edit `config.ts`, then run `agentsinc compile`
(`docs/guides/editing-config.md` "After Editing"; `docs/reference/commands.md`
compile "When to use: After hand-editing config.ts") — does **not** reconcile
registered projects when the edited config is the **global** one.
`propagateGlobalChangesToProjects` (`src/cli/lib/installation/local-installer.ts`)
fires only from the wizard write path; `src/cli/commands/compile.ts` never calls
it. The wizard contract (pinned by
`e2e/lifecycle/edit-global-agent-removal-propagation.e2e.test.ts`) says global
agent removal must reach registered projects.

Failing invariant: after the documented hand-edit → compile workflow, CLI-owned
persisted state must be mutually consistent across scopes. Instead the registered
project's `config.ts` retains the CLI-generated inlined row (e.g.
`{"name":"web-architecture","scope":"global"}` in `agents[]` +
`selectedAgents`) for an agent that exists in no config and no compiled dir —
`doctor` then reports a missing agent that no compile pass can materialize. The
user never touched the project file, so this is not a hand-edit-gone-wrong.

Minimal repro: global eject init at sandbox HOME (default agents) → register a
project (init in project dir → dashboard → Edit → any project-scope change →
confirm) → remove one agent (e.g. `web-architecture`) from the **global**
`config.ts` by hand → `agentsinc compile` from HOME → inspect the project's
`config.ts` and run `doctor` in the project.

Candidate fix direction: have `compile` (dual-pass path) invoke the same
propagation/reconciliation the wizard uses when the global config differs from
projects' inlined snapshots — or explicitly document hand-edits of the global
config as unsupported and have `doctor` say so.

Related (minor, refuted as a bug): `compile` does not regenerate
`config-types.ts` after hand-edits — **by design**. No doc promises it;
`regenerateConfigTypes` is wizard-path-only; compile warns
`Skill '<id>' is configured but was not found`. Worth a sentence in
`editing-config.md` at most.

## Refuted as intended design (do not re-flag)

Adversarial verifiers reproduced but refuted these — each matches unit-tested
contracts:

- "Every agent's stack receives every selected skill" (cross-domain stack
  fill at init) — intended, unit-tested contract.
- "Project-scoped skills dropped from agent stacks / compiled agents" — intended
  scope-compatibility rule (global agents don't compile project-scoped skills).
- "Project scope lost on off/on round-trip; re-selected skill returns GLOBAL" —
  documented: saved OFF removes the entry with no tombstone; re-selection uses
  the default scope; a project-context edit adding a skill at global scope
  writing to global config is the intended global-first default (see minor note
  below about surprise factor).

## Minor issues (observed consistently; not individually adversarially verified)

Diagnostics/UX:

- `list` header renders `Installation: agents-inc vplugin` — `getInstallationInfo`
  (`src/cli/lib/plugins/plugin-info.ts` ~78) sets `version` to the literal mode
  string; `formatInstallationDisplay` renders `v${version}`.
- `list` inconsistencies: one run showed `Skills: 0` for a 23-skill plugin
  install; non-TTY output omits the documented scope-grouped summary; dual-scope
  entries counted once per scope; `Agents:` label reused for unrelated rows.
- Every CLI run after a plugin install warns
  `Unknown fields in settings file: extraKnownMarketplaces` (CLI's own write).
- `doctor` misdiagnoses a config-listed skill with no installed files as a
  PLUGIN problem in an eject-mode install.
- `eject templates` after `eject agent-partials` no-ops with a warning but still
  prints `Eject complete!` and exits 0.

Config hygiene:

- Global `config.ts` export-block key order flip-flops depending on which
  context wrote it → VCS diff churn in a user-tracked file.
- Project-scope `compile` creates an empty `.claude/agents/` dir in the global
  HOME.
- Global uninstall leaves registered projects with dangling inlined
  global-scoped entries (no cleanup or notice) — same family as confirmed
  issue 2.
- New skills added from a project-context edit default to GLOBAL scope —
  intended (global-first) but repeatedly surprised QA agents; consider a hint in
  the wizard.

Compatibility/matrix:

- Inconsistent requires enforcement: with SolidJS selected, Zustand (requires
  React-family) is selectable at init, installs, and stays doctor-clean, while
  the edit grid makes requires-gated skills unreachable via navigation.
- Marketplace content: `api-search-getxapi` and `api-search-xquik` are
  incomplete skill dirs invisible to every diagnostic (not listed, not warned).

Docs drift:

- `uninstall --all` documented in `docs/reference/commands.md` but the flag no
  longer exists.

## E2E-infrastructure findings (repo harness, not the CLI)

Independently hit by four agents:

- `BuildStep.focusSkill`/`selectSkill` (`e2e/pages/steps/build-step.ts`)
  mis-models the grid: assumes DOWN resets the column (real grid preserves/
  clamps via `useFocusedListItem`), and blind keystroke counting breaks because
  horizontal nav skips disabled/incompatible cells and SPACE on guarded cells is
  a silent no-op. Consecutive `focusSkill` calls in one domain can toggle the
  wrong skill. Page objects should assert the focused cell from the rendered
  screen before toggling.
- `createPermissionsFile` (`e2e/helpers/test-utils.ts`) overwrites
  `.claude/settings.json` wholesale — re-running it mid-lifecycle (e.g. before
  an EditWizard launch) wipes `enabledPlugins`/`extraKnownMarketplaces`.
- `TIMEOUTS.WIZARD_LOAD` (15s) is too short for `init` against the real
  marketplace under parallel load — the stack step can still be at
  "Loading skills..."; pass `loadTimeout` ≥ 150s for real-marketplace runs.

## Reproducing the harness in a fresh session

Scenario files run under the repo's own vitest (only runner that works:
`bun` fails on `@lydell/node-pty` with ESPIPE; `tsx` fails on `@xterm/headless`
CJS named exports):

1. Scratch dir with `package.json` `{"type":"module"}`, a config exporting a
   plain object (no imports): `{ test: { include: ["<scratch>/scenarios/**/*.scenario.ts"], testTimeout: 300_000, hookTimeout: 120_000, pool: "forks", fileParallelism: false } }`.
2. Scenario files import `vitest`, `node:*`, and repo e2e modules **by absolute
   path** (`/home/vince/dev/cli/e2e/...`); other bare npm specifiers won't
   resolve from the scratch dir. `import "/home/vince/dev/cli/e2e/matchers/setup.js"`
   for the custom matchers.
3. Run: `cd /home/vince/dev/cli && npx vitest --run --config <scratch>/vitest.config.ts <scenario file>`.
4. Safety rails: every CLI invocation gets `env: { HOME: <sandbox> }` (never the
   real HOME); `/home/vince/dev/skills` is read-only `--source`; run vitest
   foreground (never backgrounded); heed the three infra gotchas above.

## Fix-round status (2026-07-29, same-day addendum)

A fix batch + live-CLI re-verification loop ran after this report. RESOLVED (implemented,
test-pinned, and confirmed gone by driving the rebuilt binary in fresh sandboxes):

- `list` "vplugin" header — version field removed from `InstallationInfo`; mode rendered via
  `INSTALL_MODE_LABELS` only (`plugin-info.ts`); regression-pinned.
- "Unknown fields in settings file: extraKnownMarketplaces" — added to `EXPECTED_SETTINGS_KEYS`
  (`permission-checker.tsx`); CLI-written settings parse warning-free, unknown fields still warn.
- Global uninstall now propagates: `pruneGlobalEntriesFromRegisteredProjects` prunes inlined
  global entries from each registered project + regenerates its config-types before the global
  config is deleted; warns-and-continues on unreachable projects; e2e-pinned
  (`uninstall-global-propagation.e2e.test.ts`).
- `compile` now regenerates `config-types.ts` at every scope it compiles, including the
  zero-installed-skills early-return path (`regenerateScopeConfigTypes`, e2e-pinned in
  `compile-config-types-refresh.e2e.test.ts`). `skipExtraSources: true` on the refresh/propagation
  loads was verified byte-identical to the wizard path and documented in JSDoc.
- `uninstall --all` docs drift — `commands.md` matches the real flag surface; stale `.ai-docs`
  refs logged in the drift log.
- e2e infra: `focusSkill` rewritten closed-loop with EXACT trimmed-label cell matching (the
  initial rewrite's substring matching broke on React/React Query — 15 slug-passing call sites
  converted to `.display`); `createPermissionsFile` now merges instead of clobbering
  `settings.json`; `WIZARD_LOAD` 15s → 45s.

Final gates after the round: typecheck = only the pre-existing TS1360; unit 5,112 passed;
full e2e green (one suite-level beforeAll timeout in `real-marketplace.e2e.test.ts` under
full-suite load, 8/8 solo — load flake, not a regression).

RESOLVED in a second same-day round (implemented, suite-verified, live-confirmed):

- `validate` now exits 0 on healthy installs (both modes, live-verified: "Result: 0 error(s),
  45 warning(s)"): over-length `cliDescription` downgraded to a warning carrying the actual
  length (`splitMetadataValidationIssues` in schemas.ts; strict schema keeps `.max(60)` as the
  declared contract); `checkDisplayNameMatches` replaced by `checkDirNameMatchesSkillId`
  (dirname vs frontmatter name — 0 warnings on the official marketplace, was 177); plugins pass
  reads `installed_plugins.json` v2 via `listRegisteredPluginInstalls` (reuses
  `installedPluginsSchema`), validates each installPath, falls back to the direct-children scan
  when the registry is absent, dangling installPaths → invalid findings. Negative control
  verified: hard metadata violations still exit 1. NOT done: marketplace-CI enforcement (skills
  repo untouched). Known gap flagged: stack-embedded skill metadata (`validateStacks`) still
  errors on over-length cliDescription — no impact today (official marketplace ships no
  src/stacks).
- TS1360 fixed: 38 missing category definitions added to `defaultCategories` (union now fully
  covered; `tsc --noEmit` exits 0). NOTE: all 38 are DERIVED (domain from id prefix, humanized
  displayName, exclusive:false, required:false, order appended) — the assumed source of truth
  `config/skill-categories.ts` does not exist in the marketplace repo (verified incl. git
  history). The derived displayName/description strings are product content worth a human skim.

- Category-value correction round (same day): the 38 derived `defaultCategories` entries were
  re-derived from the full marketplace matrix (224 metadata.yaml files, 89 categories) — 11
  flipped to `exclusive: true` (web-editor, web-maps, api-graphql, mobile-navigation,
  mobile-styling, mobile-testing, mobile-ui-components, infra-iac, desktop-multiwindow,
  desktop-packaging, desktop-security), `api-graphql` renamed to "GraphQL Server", mobile/
  desktop/infra reordered importance-first. Adversarially verified (all 38 clean) and
  live-verified in the real wizard (rendering, radio-swap semantics, install → validate exit 0).
  Pre-fix behavior confirmed: undefined categories were auto-synthesized (`synthesizeCategory`)
  with junk names ("Api Graphql"), order 999, never exclusive — so these definitions are a
  genuine UX fix, not just a typecheck fix.

STILL OPEN (deliberately untouched):

- Adversarial control pass flagged two PRE-EXISTING `exclusive: true` entries as likely wrong
  (user call): `shared-monorepo` (turborepo composes on top of pnpm-workspaces — radio forbids
  the canonical combo) and `api-email` (setup-resend + resend-react-email are a setup+usage
  pair, not alternatives).
- PRE-EXISTING duplicate header (user call): `api-api` and `api-framework` both render
  "API Framework" in the API grid (Elysia sits alone in `api-framework` while its siblings are
  in `api-api`) — marketplace/definition split predating the 38.
- Requires-enforcement model — advisory-only by design since c42b6f1f; user decision pending
  between strict-block / warn-but-allow-with-visible-labels / fixed F-filter (D-269).
  Note: `init.tsx` silently drops `result.validation` errors that `edit.tsx` surfaces as
  warnings — the one real init/edit asymmetry.
- `api-search-getxapi`/`api-search-xquik` — confirmed untracked, zero-file local test artifacts
  (2026-07-17); disregard/delete manually.
- Marketplace content tidy-up (optional): 45 skills with >60-char cliDescription now warn;
  shortening them and adding schema checks to the skills repo CI would silence the warnings at
  the source.

## Suggested next actions (priority order)

1. Decide ownership of the `cliDescription` 60-char bound (schema vs marketplace
   content) and make `validate` green on a fresh default install; fix the
   displayName rule and the plugin-cache blind spot alongside.
2. Fix confirmed issue 2: make `compile` reconcile registered projects after
   global config changes (reuse `propagateGlobalChangesToProjects`), or document
   the limitation and surface it in `doctor`.
3. Sweep the `list` output bugs (`vplugin`, counts, non-TTY summary).
4. Harden the e2e page objects (focus-assertion before toggle; non-destructive
   `createPermissionsFile`; real-marketplace load timeout).
