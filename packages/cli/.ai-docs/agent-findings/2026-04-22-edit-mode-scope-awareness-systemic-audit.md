---
type: audit
severity: high
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/lib/installation/mode-migrator.ts
  - src/cli/lib/plugins/plugin-settings.ts
  - src/cli/lib/stacks/stack-installer.ts
  - src/cli/stores/wizard-store.ts
  - src/cli/components/wizard/step-agents.tsx
standards_docs:
  - CLAUDE.md
date: 2026-04-22
reporting_agent: general-purpose
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

<!--
Systemic audit of edit-mode pipeline for scope-awareness gaps.
Prompted by a session where a single `edit` run exposed three bugs:
 - plugin uninstall targeted project scope when user was global
 - agents-step UI did not reflect global-scope toggles visually
 - config-generation step failed on agents bookkeeping
-->

## What Was Wrong

`edit.tsx` threads TWO different directories through the pipeline — `installation.projectDir` (for reads) and `cwd` (for writes) — and the criterion used to decide "am I in global scope?" is inconsistent across layers:

| Layer                                                           | Criterion                                                | Result when `cwd` is a random dir with ONLY a global install            |
| --------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `runEditWizard` (`edit.tsx:222`)                                | `cwd === GLOBAL_INSTALL_ROOT`                            | `false` → scope toggle enabled in UI                                    |
| `writeConfigAndCompile` (`edit.tsx:582`)                        | `fs.realpathSync(cwd) !== fs.realpathSync(os.homedir())` | `true` → dual-pass compile, creates `/random/dir/.claude-src/config.ts` |
| `writeProjectConfig` (`write-project-config.ts:61`)             | Same as above                                            | Same                                                                    |
| `discoverAllPluginSkills` inside `loadContext` (`edit.tsx:182`) | Uses `installation.projectDir` (correct)                 | Reads `~/.claude/settings.json`                                         |
| `discoverInstalledSkills` during compile (`edit.tsx:580`)       | Uses `cwd`                                               | Looks at `/random/dir/.claude/` — misses global plugins                 |
| Plugin install/uninstall (`edit.tsx:468, 491, 494`)             | Passes `cwd` to `claudePluginInstall`/`Uninstall`        | Registers/unregisters against wrong working dir                         |

Three distinct gaps surface in one session:

### Gap 1 — `isEditingFromGlobalScope` uses cwd, not the detected installation

`edit.tsx:222` sets `isGlobalDir = cwd === GLOBAL_INSTALL_ROOT`. The wizard store's scope-toggle early-return (`toggleAgentScope` wizard-store:1131, `toggleSkillScope` wizard-store:957) and toast ("Scope toggle unavailable in global context") gate on this flag. When `installation.projectDir === os.homedir()` but `cwd !== os.homedir()`, the wizard exposes a scope toggle for items whose install is actually global-only. Conversely, when `cwd === ~` but there is a genuine project install registered elsewhere, the toggle is hidden needlessly. This mismatch is the likely cause of "agents-step UI didn't reflect global-scope toggles visually": the user expected global-mode behavior (toggle disabled or always-global), but got the project-mode UI because `cwd` wasn't `~`.

### Gap 2 — `isProjectContext` fabricates a project install from cwd

`edit.tsx:582` and `write-project-config.ts:61` compute `isProjectContext` purely from `cwd !== os.homedir()`. `compile.ts:186-210` takes the correct approach — it uses `detectBothInstallations(cwd)` and runs a project pass ONLY when `detectProjectInstallation(cwd)` actually returns a non-null installation. Edit and init both skip this check, so a user running `edit` from `/random/dir` with only a global install triggers:

- `writeScopedConfigs` writes `/random/dir/.claude-src/config.ts` with a global-import preamble (bogus project config)
- `compileAgents` runs a project pass targeting `/random/dir/.claude/agents/` with a `scopeFilter: "project"` — but `loadProjectConfigFromDir(/random/dir)` returns null, so `filteredAgents` is undefined and only the partially-populated `agentScopeMap` survives → agents bookkeeping failure symptom.

### Gap 3 — plugin uninstall at home-dir ambiguity (already filed)

`mode-migrator.ts:133` calls `claudePluginUninstall(id, pluginScope, projectDir)` once with the derived scope. When `projectDir === os.homedir()` the Claude CLI reports "enabled at project scope" because `~/.claude/settings.json` is both user and project from its perspective. The same ambiguity hits `migratePluginSkillScopes` (`edit.tsx:778`) and the per-skill operator `uninstallPluginSkills` (`uninstall-plugin-skills.ts:26`). The canonical dual-scope fallback pattern lives in `uninstall.tsx:559-580` — try the primary scope, then the other one, each in its own try/catch — and none of the edit-mode paths use it. The single-scope call in `mode-migrator.ts` is the first instance of this class; this audit broadens it to every uninstall call site invoked from edit.

### Secondary observations

- `plugin-settings.ts:63 getEnabledPluginKeys(projectDir)` reads only `<projectDir>/.claude/settings.json`. When `projectDir !== os.homedir()`, globally-enabled plugins (registered at `~/.claude/settings.json`) are invisible. Callers who need both must call twice (`multi-source-loader.ts:182` already does; `discoverAllPluginSkills` inside `discoverInstalledSkills` does so via the `isGlobalProject` branch at `discover-skills.ts:120-138`; `edit.tsx:182` does not).
- `stack-installer.ts:67,87` hardcodes `"project"` scope for `claudePluginInstall`. Fine for init-from-cwd, wrong for global stack installs.
- `step-agents.tsx:263` defaults `scope` to `"global"` when `agentConfig` is missing (new agent preselected but no config row yet). Correct default, but undocumented — easy to misread as a bug if a reader expects a scope-aware default derived from `isEditingFromGlobalScope`.

### Prioritized file:line list

1. **HIGH** `src/cli/commands/edit.tsx:222` — `isGlobalDir = cwd === GLOBAL_INSTALL_ROOT` is wrong when `installation.projectDir = ~` and `cwd ≠ ~`. Fix: `const isGlobalDir = context.installation.projectDir === GLOBAL_INSTALL_ROOT;` (drive UI from the DETECTED installation, not the shell cwd).
2. **HIGH** `src/cli/commands/edit.tsx:582` and `src/cli/lib/operations/project/write-project-config.ts:61` — `isProjectContext` computed from `cwd !== homedir` fabricates a project install. Fix: derive from `await detectProjectInstallation(cwd) !== null` (matching `detectBothInstallations`), and pass the result into `writeProjectConfig`/`compileAgents` instead of recomputing.
3. **HIGH** `src/cli/lib/installation/mode-migrator.ts:133`, `src/cli/commands/edit.tsx:778`, `src/cli/lib/operations/skills/uninstall-plugin-skills.ts:26` — single-scope `claudePluginUninstall` breaks at home-dir ambiguity. Fix: extract the dual-scope best-effort pattern from `uninstall.tsx:559-580` into a shared helper in `utils/exec.ts` (e.g., `claudePluginUninstallBothScopes`) and route all three sites through it.
4. **MEDIUM** `src/cli/commands/edit.tsx:580` — `discoverInstalledSkills(cwd)` silently misses global plugins when `cwd !== installation.projectDir`. Fix: pass `context.installation.projectDir` (the same dir used for reads earlier in `loadContext`), not `cwd`.
5. **MEDIUM** `src/cli/lib/stacks/stack-installer.ts:67,87` — hardcoded `"project"` scope. Fix: take an explicit `scope: "project" | "global"` parameter or derive from `projectDir === os.homedir()`.
6. **LOW** `src/cli/components/wizard/step-agents.tsx:263` — `scope ?? "global"` default needs a comment explaining the intent; currently readable as a silent fallback on data that must exist (CLAUDE.md anti-pattern).

## Fix Applied

None — discovery only. Gap 3 has a standing finding already; Gaps 1, 2, 4, 5 are new.

## Proposed Standard

Add to CLAUDE.md "Scope Awareness" NEVER list:

> NEVER compute "am I in global scope?" from `cwd === GLOBAL_INSTALL_ROOT` or `cwd !== os.homedir()`. The authoritative source is the detected installation: `installation.projectDir === os.homedir()` means the session is editing the global install. `cwd` is a shell-state quirk that can diverge arbitrarily from where the CLI's data lives.
>
> NEVER compute `isProjectContext` from `cwd !== os.homedir()`. Use `await detectProjectInstallation(cwd) !== null` — matching `detectBothInstallations`. Any path that fabricates a project install on the fly will corrupt unrelated directories.
>
> NEVER pass `cwd` to `discoverInstalledSkills`, `discoverAllPluginSkills`, or `writeProjectConfig` when `installation.projectDir` is available — `cwd` can point to a dir with no CLI data; reads go to where the data lives.

New section in `.ai-docs/reference/features/edit-mode.md` titled "cwd vs installation.projectDir discipline" codifying: reads use `installation.projectDir`; writes use `installation.projectDir` UNLESS the write is a project-scoped item AND a project installation exists at `cwd` (in which case split paths by `resolveInstallPaths(dir, scope)` per item). The edit.tsx comment at lines 154-157 is the wrong model — "cwd for writes" should be "installation.projectDir for reads AND for writes that target this installation's files".
