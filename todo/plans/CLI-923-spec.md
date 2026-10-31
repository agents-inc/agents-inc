# CLI-923 — remove the wizard: implementation spec

Rulings: [`CLI-923-remove-the-wizard.md`](./CLI-923-remove-the-wizard.md) plus the owner's Q1–Q3 answers of 2026-10-14,
not re-opened. **[r]** = line re-read 2026-10-14 at `6c526f5e`. Paths are under `packages/cli/` unless they start
`apps/`, `packages/`, `todo/`. Counts are commands; re-derive before acting.

## 1. Command contract

### `init` — routes of `install()` (`src/cli/commands/init.tsx`:456-515 [r]), in order

| #   | Invocation / state                                                                         | Behaviour                                                                                                                                                                                                                                                                                | Exit           |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | `--provider X`, no `--from`                                                                | unchanged `providerNeedsAConfigurationToInstall()`                                                                                                                                                                                                                                       | `INVALID_ARGS` |
| 2   | `--ui [--from <id>] [--marketplace <ref>]`                                                 | editor route (`openEditor` :438-448 [r]), reads no config: stdout `Build it at https://agentsinc.sh/editor` (or `Open it at <editorConfigUrl(id)>`), then the marketplace line if `--marketplace`, then `applySharedConfigHere(…)`; browser only at a TTY, open failure = stderr warning | `SUCCESS`      |
| 3   | `--from <id> [--marketplace <ref>]`                                                        | unchanged — `--marketplace` overrides the payload's marketplace (`sharedConfigSourceFlags` :360-362 [r]); the route for testing local changes and for harness fixtures                                                                                                                   | unchanged      |
| 4   | `--marketplace <ref>`, no `--from`                                                         | route 2 with no id, whatever is installed (no dashboard, no config read)                                                                                                                                                                                                                 | `SUCCESS`      |
| 5   | bare, config unreadable                                                                    | unchanged `ensureConfigReadable` refusal                                                                                                                                                                                                                                                 | `ERROR`        |
| 6   | bare, installation detected (project's own, else global — `runDashboardFlow` :294-313 [r]) | dashboard, below                                                                                                                                                                                                                                                                         | below          |
| 7   | bare, nothing installed (incl. a blank global config)                                      | route 2, no id                                                                                                                                                                                                                                                                           | `SUCCESS`      |

**`--marketplace` (owner Q2).** The flag acts only beside an install (`--from`, no `--ui`); everywhere else the run takes
the editor route and prints one line about it.

- Decided: the same holds for `--ui --marketplace`, `--ui --from <id> --marketplace`, and `--marketplace` over an
  existing installation. The editor's address carries only an id, and the dashboard has nowhere to put a marketplace.
- The line, verbatim; `isLocalSource` (`src/cli/lib/configuration/config.ts`:708 [r]) picks the form:
  - remote: `Add ${ref} from the editor's Marketplace button.`
  - local: `${ref} is a folder on this machine, which the editor cannot read — push it to GitHub, then add it from the editor's Marketplace button.`
- A ref `isLocalSource` refuses (`..`, `~`) → its existing message, `ERROR`, as the install route refuses it today.
- Value-less `--marketplace` unchanged: `Flag --marketplace expects a value`, `INVALID_ARGS`.
- Goes: `refuseMarketplaceForTheEditor`, `refuseMarketplaceOtherThanTheInstalledOne` (:806-838 [r]);
  `editorLoadsItsOwnMarketplace`, `marketplaceFixedAtInstall` (`src/cli/utils/messages.ts`:764, :773 [r]), replaced by
  the line above; `STEP_TEXT.EDITOR_LOADS_MARKETPLACES` (e2e).

**Exit changes for scripts:** bare `init`, no TTY, nothing installed: `ERROR` → `SUCCESS`. `init --ui --marketplace
<ref>`: `INVALID_ARGS` → `SUCCESS`. `init --marketplace <ref>` without `--from`: wizard / dashboard / `INVALID_ARGS` →
editor route, `SUCCESS`.

**Help, verbatim** (summary unchanged):

- description `Build a configuration in agentsinc.sh/editor, or install one by id with --from. Over an existing installation, shows its dashboard.`
- `--from` `Install a configuration shared from agentsinc.sh by its id`
- `--ui` `Open agentsinc.sh/editor on the id --from names, or on the catalogue — what a bare init does where nothing is installed`
- `--marketplace` `With --from, install from this marketplace instead of the one the configuration names. Without --from, open the editor and say how to add it there`
- examples: `Open the editor to build a configuration` → `<%= config.bin %> <%= command.id %>`; `Install a configuration
built in the editor` → `… --from <id>`; `Test local marketplace changes against a configuration built in the editor`
  → `… --from <id> --marketplace ./my-marketplace`

### Dashboard (`init` route 6; bare `agents-inc` via `src/cli/hooks/init.ts`:16-30 [r])

Unchanged: screen, keys, branded title, count lines, Escape (nothing runs, `SUCCESS`), Ctrl+C (`Cancelled`,
`CANCELLED`), no-TTY text (stdout, `SUCCESS`), a chosen command's own exit. Options (`DASHBOARD_OPTIONS` :109-114 [r]):

| Label                         | Runs                          |
| ----------------------------- | ----------------------------- |
| `Edit in the web editor`      | `edit --ui`                   |
| `Compile` / `Doctor` / `List` | `compile` / `doctor` / `list` |

- Piped line (`formatDashboardText` :193-201 [r]), verbatim: `  [Edit in the web editor]  [Compile]  [Doctor]  [List]`
- Delete `DashboardOrigin`, the project-setup argv of `dashboardCommandArgv` (:248-275 [r]), and `runDashboardFlow`'s
  `origin`/`setupMarketplace` params.
- Decided: from a project with no installation of its own, Edit opens the GLOBAL installation in the editor (journey
  40's rule); the project is then set up with `init --from <id>`, which the `Install it:` line already prints.

### `edit` — `applyEdit` (`src/cli/commands/edit.tsx`:499-537 [r])

| Invocation         | Behaviour                                                                                                                                                                                                                                                                                                                                                                | Exit                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `--ui --from <id>` | unchanged                                                                                                                                                                                                                                                                                                                                                                | `SUCCESS`           |
| bare, or `--ui`    | one path; refusals unchanged (ambiguous install `INVALID_ARGS`; unreadable config / unofferable placement `ERROR`), then `openInEditor` (:819-833 [r]): none installed → `ERROR_MESSAGES.NO_INSTALLATION`; publish failure → its error; else `Opening N skill(s) across M sub-agent(s)...`, `Shared as <id>`, the two `sharedConfigDestinations` lines, browser at a TTY | `ERROR` / `SUCCESS` |
| `--from <id>`      | unchanged                                                                                                                                                                                                                                                                                                                                                                | unchanged           |

- **Removed hidden flags** `--project-setup`, `--project-setup-marketplace` (:480-489 [r]; `EDIT_PROJECT_SETUP_FLAG`,
  `EDIT_PROJECT_SETUP_MARKETPLACE_FLAG` in `src/cli/consts.ts`). Internal; use → Nonexistent flag, `INVALID_ARGS`.
- **Exit change:** bare `edit`, no TTY: was `ERROR`, now publishes (the write `edit --ui` already makes), prints the id,
  `SUCCESS`.
- **Help, verbatim:** description `Open this installation in agentsinc.sh/editor, or apply a configuration built there with --from`;
  `--ui` `Open agentsinc.sh/editor on this installation, or on the id --from names without applying it — what a bare edit does`;
  examples `Open this installation in the editor` → `edit`, `Apply a configuration built in the editor, by its id` →
  `edit --from <id>`, `Look at a shared configuration without applying it` → `edit --ui --from <id>`.

### Messages

- Delete `wizardNeedsTerminal`, `RUNS_WITHOUT_A_TERMINAL` (`messages.ts`:725-744 [r]) and the two refusals above.
- `new marketplace` next steps (`src/cli/commands/new/marketplace.ts`:119-128 [r]): steps 1–5 unchanged; step 6 becomes
  two, verbatim:
  - `Push it to GitHub, then add it from the Marketplace button at ${EDITOR_URL}`
  - `${CLI_INVOKE_COMMAND} init --from <id> --marketplace ${marketplaceDir}   (from a project — tests your local changes against a configuration built there)`
- Re-read every hint naming bare `init`/`edit`:
  `grep -rnE "CLI_INVOKE_COMMAND\} (init|edit)['\` ]" src/cli --include='_.ts' --include='_.tsx' | grep -v test`.
  False after removal:
  - `authoredHereKept` "Remove them with '… edit'." (:830-836 [r]): no CLI route removes a skill the round trip does not own → delete the line.
  - `src/cli/lib/installation/mode-migrator.ts`:68 "then run '… edit' again" → `then apply the same id again with '${CLI_INVOKE_COMMAND} edit --from <id>'`.
  - `src/cli/commands/doctor.ts`:981 "'… init' writes a configuration" → `'${CLI_INVOKE_COMMAND} init --from <id>' writes a configuration`.
  - Stay true: `NO_INSTALLATION`, `NO_SKILLS_TO_COMPILE`, the doctor tips, `keptAsInstalledGlobally`'s "edit from your home directory".
- Strings still naming the wizard: `grep -rn "wizard" src/cli --include='*.ts' --include='*.tsx' | grep -v "test\|^\S*:\s*\*\|//"`
  (e.g. `src/cli/lib/matrix/matrix-health-check.ts`:62).

### Later (follow-up; do not build)

Streamline `--marketplace` without `--from`: mint an id naming the marketplace so the editor opens with it loaded. This
widens **CLI-905** (Deferred: "`init --ui --marketplace Y` opens the editor on marketplace Y").

## 2. Delete, extract, rename

### Extract (L3) — both components read no store afterwards

| From                                                | To                                                  | Kept readers                                                                                                                                     |
| --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/cli/components/wizard/skill-agent-summary.tsx` | `src/cli/components/common/skill-agent-summary.tsx` | `src/cli/commands/list.tsx`:55 [r]; CLI-908 later                                                                                                |
| `src/cli/components/wizard/summary-panel.tsx`       | `src/cli/components/common/summary-panel.tsx`       | **none in production after L4** (today only `wizard-layout.tsx`:290, `step-confirm.tsx`:25); kept by ruling for CLI-908/909, which are not built |
| `src/cli/components/wizard/scroll-affordance.tsx`   | `src/cli/components/common/scroll-affordance.tsx`   | `SummaryPanel`                                                                                                                                   |
| `src/cli/lib/wizard/scope-diff.ts` (+test)          | `src/cli/lib/configuration/scope-diff.ts`           | `computeScopeDiff` (`SkillAgentSummary`), `formatScopeTag` (`edit.tsx`:149)                                                                      |
| `src/cli/lib/wizard/domain-order.ts` (a re-export)  | deleted                                             | `src/cli/lib/seed/seed-apply.ts`:9 imports `orderDomains` from `@workspace/compile`                                                              |

- **`SkillAgentSummary` props:** the `ScopeDiffInput` fields — `skillConfigs`, `agentConfigs`, `installedSkillConfigs`,
  `installedAgentConfigs`, `isInitMode`. Today it reads the last three from `useWizardStore` (`skill-agent-summary.tsx`:66-72 [r]).
- **`SummaryPanel` props:** the same, plus `stackName` (replaces `getStackName`), plus the marketplace override
  `setupMarketplace` supplies today (`summary-panel.tsx`:113-126 [r]). L4 drops the override once nothing passes it.
- **`list`:** passes its active configs as both current and installed; stops calling `hydrateWizardStore`
  (`list.tsx`:130 [r]). Frame byte-identical.
- **Hooks that stay:** `use-panel-scroll`, `use-measured-height` (`SummaryPanel`); `use-keyboard-navigation`
  (`src/cli/components/common/select-list.tsx` → dashboard); `use-terminal-dimensions` (`init.tsx` `Dashboard`).

### Rename (L4) — one declaration, out of the wizard

- **`WizardResultV2` → `InstallSelection`.** Declared twice today: `packages/compile/src/seed-to-config.ts`:697-722 [r]
  and `src/cli/components/wizard/wizard.tsx`:38 [r]. Keep compile's, renamed; the CLI imports it. Drop wizard-only fields:
  - `cancelled` — no reader: `grep -rn "\.cancelled" src ../compile/src ../../apps/editor/src`.
  - `unresolvableSkillIds` — seed always `[]`; its reader (`edit.tsx`:592-597 [r], `unresolvedSkillRemovalReasons`) goes.
  - `foldedSkillIds` — CLI twin only; `collapsedPairsOf`'s `folded` (:1685-1693 [r]) and `foldsItsCopyIntoGlobal` go once nothing sets them.
- `seedToWizardResult` → `seedToInstallSelection` (compile). `src/cli/lib/seed/seed-to-wizard.ts` → `seed-to-selection.ts`,
  still a re-export (`src/cli/lib/configuration/__tests__/renderers-come-from-the-shared-package.test.ts`:127 holds the identity).
- Factory `buildWizardResult` → `buildInstallSelection`; every key/param named `wizardResult` (e.g.
  `writeProjectConfig({ wizardResult })`) → `selection`.
- **Callers** (root): `grep -rnE "WizardResultV2|seedToWizardResult|seed-to-wizard|buildWizardResult|\bwizardResult\b" packages apps --include='*.ts' --include='*.tsx' | grep -v node_modules`.
  Production today: `src/cli/base-command.ts`, `src/cli/commands/{init,edit}.tsx`,
  `src/cli/lib/installation/local-installer.ts`, `src/cli/lib/operations/project/write-project-config.ts`,
  `src/cli/lib/seed/seed-apply.ts`, `apps/editor/src/features/configure/lib/output-preview.ts`.

### Delete

**src (L4)**

- Directories: `src/cli/components/wizard/` (after the extractions), `src/cli/components/themes/` (only `wizard.tsx` reads
  `cliTheme`), `src/cli/stores/`, `src/cli/lib/wizard/` (after the moves).
- Hooks (+tests): `use-build-step-props`, `use-category-grid-input`, `use-category-rows`, `use-focused-list-item`,
  `use-row-scroll`, `use-section-scroll`. Check: `grep -rl <hook> src e2e scripts` hits only deleted files.
- `init.tsx`: `selectionFromWizard`, `loadWizardInputsUnderSpinner`, `runWizard` (:544-585, :866-880 [r]),
  `DashboardOrigin`, the two marketplace refusals (§1).
- `edit.tsx`: `selectionFromWizard`, `runEditWizard` (:629-642, :935-966 [r]); `EditSelection`'s `"wizard"` member;
  `compilesGlobalScope`'s wizard arm (:337-344 [r]); `resolveEditRoot`'s `setupRequested` (:249 [r]); the no-change
  `isProjectSetup` write (:581-590 [r]); `setupMarketplace` on `EditContext`/`loadContext`.
- `BaseCommand.clearTerminal`, if it loses its last caller.
- Test code: `src/cli/lib/__tests__/helpers/wizard-simulation.ts` (after L1), `src/cli/lib/__tests__/helpers/painted-toasts*`,
  `src/cli/lib/__tests__/integration/wizard-flow.integration.test.tsx`, `src/cli/lib/matrix/selection-scenarios.contract.test.ts`
  (subject is the wizard grid cell; the editor's `derive.contract.test.ts` becomes the contract's only runner).
- `scripts/check-enumeration-drift.ts`: the rows bound to `hotkeys.ts`, `wizard-store.ts` and scope-diff's deleted exports.
- **Dead-code sweep:** run `bun run deps:dead` (knip, root) before and after; delete what is newly reported where this
  lane deleted the last importer; report the rest. knip misses type members and params — grep those.

**e2e (L2)**

- `e2e/pages/steps/`, `e2e/pages/wizards/`, `base-step.ts`, `wizard-result.ts` (after `ProjectHandle` moves),
  `retry-space*`, `list-row-toggle*`, `retry-enter.ts` (unless `DashboardSession` still uses it),
  `e2e/smoke/pom-framework.e2e.test.ts`.
- The wizard-only members of `e2e/pages/constants.ts` and `e2e/fixtures/dual-scope-helpers.ts`.
- `scripts/check-screen-sentinels.ts` + test (subject: wizard sentinels only); the wizard rows of `scripts/check-mirrored-constants.ts`.

### Which existing specs are deleted — the rule

- **E2E census:** `grep -rlE '\b(InitWizard|EditWizard)\b|pages/(steps|wizards)/|pages/base-step' e2e --include='*.test.ts'`.
  - **Migrate** (setup → `runInitFrom` or `ProjectBuilder`) a spec that also runs a kept command —
    `<census> | xargs grep -lPz '(CLI\.run|runCLI)\(\s*\[\s*"(compile|doctor|list|ls|uninstall|update|eject|search|share|build|new)"'`
    — and any spec that is the last from-scratch spec of a kept journey.
  - **Delete** the rest.
- **Journeys** (`.ai-docs/standards/e2e/user-journeys.md`; `src/cli/lib/__tests__/spec-gates.test.ts` is the worklist):
  - Retire a row whose subject is the interactive flow (screens, keys, toasts, grids, the wizard's own refusals).
  - Re-point a row whose outcome is reachable through `init --from`, `edit --from` or a kept command; mark it TO TEST
    where no surviving spec is from scratch.
  - Report the retired row numbers.
- **Unit census:** after L4 deletes the modules, `npx tsc --noEmit` and `npx tsc -p e2e/tsconfig.json --noEmit` list every
  broken importer. A test whose subject is a deleted module → delete. A test of kept code → takes its input from
  `buildInstallSelection` / factories (e.g. `src/cli/lib/__tests__/commands/edit.test.ts` keeps its apply-path specs).

## 3. Dependencies

- **Leaves:** `zustand` (`package.json`:133 [r]); only importer `stores/wizard-store.ts` — `grep -rln 'from "zustand"' src e2e scripts`.
- **Stays:** `ink`, `react`; `@inkjs/ui` (`common/confirm.tsx`, `common/spinner.tsx`); `ink-testing-library` (component
  tests); `@lydell/node-pty`, `@xterm/headless`, `tree-kill` — the PTY still drives the confirms of `init --from`,
  `edit --from` and `uninstall`, and the dashboard (`e2e/fixtures/interactive-prompt.ts`, `e2e/pages/dashboard-session.ts`);
  `spinner.test.ts` imports `@xterm/headless`.
- Measure: `for d in @inkjs/ui ink-testing-library @lydell/node-pty @xterm/headless tree-kill; do echo "$d $(grep -rl "$d" src e2e scripts --include='*.ts' --include='*.tsx' --include='*.mjs' | wc -l)"; done`.

## 4. Lanes

Order: **L1 → (L2 ∥ L3) → L4 → docs step → release**. L5 lands with or after L4: its wording describes what L4 ships.
The tree builds after every lane.

**Every lane:**

- Read root `CLAUDE.md`, `packages/cli/CLAUDE.md`, `docs/briefing.md`.
- Read-only git; every writing command is the user's. Do not edit `todo/`.
- Need a change in another lane's file? Report the exact change; don't make it.
- Order: tests → code → `meta-design-expressive-typescript` only → hand-run.
- Reddens a gate that reads a document? Delete the binding row or the lines the gate names; rewrite nothing (prose
  follows in the docs step).
- Gates, unfiltered, from repo root: `bun run build`, `typecheck`, `lint`, `test`, `test:e2e`, `deps:check`.
- Fix an anti-pattern or find a missing standard? Write a finding to `.ai-docs/agent-findings/`.

**L1 — harness prep (no behaviour change)**

- Owns: new `e2e/fixtures/project-handle.ts` + every `ProjectHandle` importer;
  `src/cli/lib/__tests__/helpers/{wizard-simulation,index}.ts`, new `skill-config-builders.ts`, + importers of moved
  names; `e2e/pages/{dashboard-session,wizards/init-wizard}.ts`.
- Does: `buildSkillConfig(s)`, `FACTORY_DEFAULT_SCOPE`, `Fixture*` types, `extractSkillIdsFromAssignment` →
  `skill-config-builders.ts`; `ProjectHandle` out of `wizard-result.ts`; `InitWizard.launchForDashboard` →
  `DashboardSession.launch`.
- Dropped after Q2: `runInitFrom` / `runInitFromOnCodex` / `runInitFromOnClaude` keep passing `--marketplace`; no test
  moves off `--from … --marketplace`.
- Tests first: no red (refactor). Proof: both suites green before and after.

**L2 — the e2e suite without the wizard (after L1)**

- Owns: `e2e/**`, incl. `e2e/handrun-journeys.ts` (drop wizard journeys) and `e2e/helpers/handrun.gen.mjs` (rebuilt by
  `scripts/handrun.mjs`); `scripts/check-screen-sentinels*`; the wizard rows of `scripts/check-mirrored-constants.ts`;
  `SPECS_BELONGING_TO_NO_JOURNEY` in `src/cli/lib/__tests__/spec-gates.test.ts`; the rows of `user-journeys.md`;
  `src/cli/lib/__tests__/helpers/*` whose only importers are deleted specs.
- Does:
  - The §2 rule.
  - Dashboard specs (`init-wizard-existing`, `branding-name-reaches-dashboard`, `bare-run-over-unreadable-config`) move to
    installs made by `init --from`/`ProjectBuilder`, launched via `DashboardSession.launch`.
  - The "choose Edit → wizard" cases in those and in `e2e/lifecycle/init-marketplace-over-an-installation.e2e.test.ts`
    are deleted; that file's other cases stay as they are, for L4 to flip.
- Tests first: no red. Migrated specs must pass on the unchanged CLI — that is the proof they no longer need the wizard.

**L3 — extract the kept panel (∥ L2; disjoint files)**

- Owns:
  - the three components (old + new paths) and their tests — `summary-panel.test.tsx`, and the `SkillAgentSummary`
    describe in `step-confirm.test.tsx` → `common/skill-agent-summary.test.tsx`;
  - `src/cli/lib/wizard/{scope-diff,domain-order,index}.ts` → `src/cli/lib/configuration/scope-diff.ts` (+test);
  - importers: `wizard-layout.tsx`, `step-confirm.tsx`, `source-grid.tsx`, `stores/wizard-store.ts`, `edit.tsx`'s import
    line, `list.tsx`, `seed-apply.ts`;
  - `SCOPE_DIFF` (path only) in `scripts/check-enumeration-drift.ts`.
- Tests first: the moved tests at the new paths, rendering from props with no store hydration — red (modules absent).
  `list` specs stay green unchanged.

**L4 — remove the wizard, set the contract (after L2, L3)**

- Owns: `packages/cli/src/**` incl. unit tests; `scripts/check-enumeration-drift.ts`; `packages/cli/package.json`,
  `bun.lock`; `packages/compile/src/{seed-to-config.ts,seed-to-config.test.ts,index.ts}`;
  `apps/editor/src/features/configure/lib/{output-preview,use-share-link}.ts`; the e2e specs below and
  `e2e/pages/constants.ts`; gate-bound `.ai-docs` rows (delete only).
- No longer owned: `apps/www/.../reference/commands.md`. `init` keeps every flag and `edit`'s removed flags are hidden,
  so `check-cli-claims` stays green; the matrix's "wizard" prose is the docs step's.
- Tests first — each red before code:
  - `e2e/commands/init-ui.e2e.test.ts`:
    - "prints the editor's address", "installs nothing", "offers init --from" run for `["init"]` and `["init","--ui"]`
      (bare is red: `ERROR` today).
    - :193 "refuses --marketplace beside it" flips: `init --ui --marketplace <dir>` → `SUCCESS`, link + local-folder
      line, nothing written.
    - :215 flips: over an installation made from another marketplace, `init --ui --marketplace` and
      `init --marketplace` → `SUCCESS` with the line; config byte-identical.
    - New: a remote ref (`github:acme/skills`) gets the `Add … from the editor's Marketplace button.` line.
  - `e2e/lifecycle/init-marketplace-over-an-installation.e2e.test.ts` (as L2 left it): refusal cases flip to the editor
    route — no dashboard, installation byte-identical.
  - `e2e/commands/edit-ui.e2e.test.ts`: "mints an id", "refuses a directory with nothing installed" for `["edit"]` and
    `["edit","--ui"]`.
  - `e2e/commands/wizard-needs-a-terminal.e2e.test.ts`:
    - The `init` case (`["init","--marketplace", <fixture dir>]`) and the `edit` case flip: `SUCCESS`, link printed,
      nothing written.
    - The `uninstall` cases stay.
    - Rename the file off "wizard" and re-point its journey row.
  - `e2e/commands/help.e2e.test.ts`: both screens carry the §1 text, incl. the new `--marketplace` description.
  - `e2e/commands/new-marketplace.e2e.test.ts`: the next steps carry the two §1 lines verbatim.
  - The dashboard spec L2 migrated: exactly the four labels; Edit prints `Shared as <id>` against
    `startSeedConfigStore`; piped line verbatim.
  - Unit `src/cli/commands/init.test.tsx` "still offers the four commands": new labels; Edit's argv `["--ui"]`.
  - `e2e/commands/source-flag-is-init-only.e2e.test.ts` is unchanged: `init` keeps the flag.
- Then implement §1–§3.

**L5 — install-dialog wording (with or after L4)**

- Owns: `apps/editor/src/features/configure/lib/use-install-command.ts` (`COMMAND_NOTES`; comments :16-18, :40-46),
  `use-install-command.test.ts`, `apps/editor/e2e/specs/install-dialog.spec.ts`.
- Does: `BASE_COMMAND` stays the bare `npx agents-inc init` (owner Q1). The notes saying it "starts a fresh wizard"
  (:85-86 [r]) become false and change, verbatim:
  - `refused: "id unavailable — this command starts over in the editor"`
  - `unreachable: "offline — this command starts over in the editor"`
- Tests first: the pinned strings in the unit test and `install-dialog.spec.ts` (:175-199) change first → red. Nothing
  else changes.

**Docs step (`codex-keeper`, after L4):** §5, false sentences only.

## 5. Cross-workspace effects

- **Editor fallback line:** stays the bare `npx agents-inc init` (owner Q1); only its notes change (L5).
  `BARE_COMMAND` in `apps/editor/e2e/specs/codex-provider.spec.ts`:34 is untouched.
- **www pages describing the wizard, or `init --marketplace` storing a marketplace:**
  `grep -rliE "wizard|--marketplace|init -m" apps/www/src` (incl. `apps/www/src/pages/index.astro`, and the
  `init`/`edit` purposes in the `reference/commands.md` matrix).
- **www check scripts that read CLI source:**
  - `apps/www/scripts/check-cli-claims.ts` — compares non-hidden flags and aliases under `packages/cli/src/cli/commands/**`
    with the matrix; stays green, since no visible flag changes.
  - `apps/www/scripts/check-editor-address.ts` — reads `EDITOR_URL`/`editorConfigUrl` in `consts.ts`; untouched.
  - `apps/www/turbo.json` already names both inputs.
- **`.ai-docs` (docs step):**
  - `reference/features/wizard-flow.md`, `reference/wizard/state-transitions.md`, `reference/store-map.md`,
    `reference/concepts/guard-pattern.md`, `reference/component-patterns.md` (hotkeys),
    `reference/testing/{e2e-infrastructure,factories,hand-run}.md`, `reference/commands/{index,edit}.md`.
  - The four wizard pointer stubs, and their `DOCUMENTATION_MAP.md` rows (`scripts/check-briefing-contract.ts` refuses a
    link to a missing doc).
  - `packages/cli/CLAUDE.md` rules naming wizard symbols:
    `grep -nE "wizard|Wizard|waitForWizardFooter|isGloballyLockedSkill|buildSkillConfigForId|skillSlotKey" packages/cli/CLAUDE.md`.
  - READMEs: `grep -liE "wizard|--marketplace" README.md packages/cli/README.md`.
- **`todo/cli.md` candidates (owner decides):**
  - **Moot:** CLI-922 (wizard-spec flake); CLI-910 (its hint's route works once bare `edit` opens the editor); CLI-678,
    CLI-750 (wizard-spec flakes); CLI-738, CLI-735, CLI-734 (build/stack steps); CLI-312, CLI-314, CLI-315, CLI-316
    (wizard UX); CLI-833 (wizard spec/page-object comments); CLI-732 (post-wizard pipeline); CLI-311 (check — "search
    component" names no file today).
  - **Becomes the "Later" follow-up:** CLI-905.
  - **Narrowed:** CLI-869 (unsanitised `displayName` survives in `SkillAgentSummary`, so in `list`); CLI-865 (its test
    moves to `components/common/`); CLI-821 (more `UI_SYMBOLS` lose readers — re-measure); CLI-843 (wizard journeys leave
    the hand-run); CLI-825 (doc rewritten in the docs step); CLI-726 (text anchors were mostly the wizard's); CLI-318
    (CLI authoring of assignments vs consume-yes/author-no).

## 6. Release (the version after 0.168.0: minor bump → 0.169.0)

0.168.0 is published first and is the last version with the wizard (owner Q3).

`CHANGELOG.md` block:

> **The terminal wizard is gone: `init` and `edit` open the editor, and 0.168.0 is the last release with the wizard**
>
> - CLI-923: a bare `init` opens agentsinc.sh/editor where nothing is installed, and shows the installation's dashboard
>   where something is; the dashboard's first option is "Edit in the web editor". A bare `edit` does what `edit --ui`
>   does: it mints an id for this installation and opens it in the editor. `init --from`, `edit --from` and every other
>   command are unchanged.
> - `init --marketplace <ref>` without `--from` opens the editor and says how to add the marketplace there (a local
>   folder is pushed to GitHub first). Beside `--from` it still installs from that marketplace — the way to test local
>   changes.
> - Runs that now exit 0 instead of refusing: a bare `init` or `edit` without a terminal, `init --ui --marketplace`, and
>   `init --marketplace` over an installation made from another marketplace. A bare `edit` publishes this installation
>   to mint its id, as `edit --ui` always has.
> - The wizard is still available in 0.168.0: `npx agents-inc@0.168.0 init`.
> - `zustand` is no longer a dependency.

`changelogs/0.169.0.md` follows `.ai-docs/standards/commit-protocol.md`, with a `### CLI-923` subheading.

Owner runs this once 0.169.0 is published:

```
npm deprecate agents-inc@"<0.168.0" "Upgrade to agents-inc@latest. The last release with the terminal wizard is 0.168.0 (npx agents-inc@0.168.0 init)."
```

## 7. Success criteria

| Criterion                         | How to verify                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No wizard module or importer left | `ls src/cli/components/wizard src/cli/stores src/cli/lib/wizard e2e/pages/steps e2e/pages/wizards` fails; `grep -rlE "components/wizard/\|stores/wizard-store\|lib/wizard/" src e2e scripts` is empty                                                                                                                                                                                                            |
| Rename complete                   | the §2 rename grep is empty outside `node_modules`                                                                                                                                                                                                                                                                                                                                                               |
| `zustand` gone                    | `grep -n zustand package.json` is empty                                                                                                                                                                                                                                                                                                                                                                          |
| §1 contract holds                 | L4's red specs are green; L5's notes match                                                                                                                                                                                                                                                                                                                                                                       |
| Help text verbatim                | `help.e2e.test.ts`; `bun apps/www/scripts/check-cli-claims.ts` (root) still green                                                                                                                                                                                                                                                                                                                                |
| Gates pass                        | the §4 root gates exit 0 with visible output                                                                                                                                                                                                                                                                                                                                                                     |
| Hand-run                          | Empty temp dir: `node dist/index.js init` prints `Build it at https://agentsinc.sh/editor`, exit 0. `init --marketplace .` adds the push-to-GitHub line; `init --marketplace github:acme/skills` adds the Marketplace-button line; both exit 0. Over an `init --from` install: `init` shows the four options; Edit prints `Shared as`. `init --from <id> --marketplace <fixture dir>` installs from that folder. |

## 8. Open

Nothing. A bare `owner/repo` reads as a folder (`isLocalSource` kept, owner 2026-10-14).
