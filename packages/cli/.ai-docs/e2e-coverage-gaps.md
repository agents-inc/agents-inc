---
last_validated: 2026-04-21
---

# E2E Test Coverage Gaps

## Status Legend

- [DONE] Test exists and passes
- [FILLED] New test created in this pass
- [TODO] Gap identified, test not yet written
- [SKIP] Intentionally not tested (feature flag, known bug, or not applicable)

---

## 1. Init Command

| Flow                              | Status   | Test File                                   |
| --------------------------------- | -------- | ------------------------------------------- |
| Fresh init with stack selection   | [DONE]   | interactive/init-wizard-stack               |
| Fresh init from scratch           | [DONE]   | interactive/init-wizard-scratch             |
| Dashboard shown on re-init        | [DONE]   | interactive/init-wizard-existing            |
| Navigation with ESC               | [DONE]   | interactive/init-wizard-navigation          |
| Ctrl+C abort                      | [DONE]   | interactive/init-wizard-navigation          |
| Domain filtering                  | [DONE]   | interactive/init-wizard-filter-incompatible |
| Plugin mode selection             | [DONE]   | interactive/init-wizard-plugin              |
| Sources step management           | [DONE]   | interactive/init-wizard-sources             |
| Agent selection                   | [DONE]   | interactive/init-wizard-stack-agents        |
| Flag handling                     | [DONE]   | interactive/init-wizard-flags               |
| Global scope init                 | [DONE]   | lifecycle/init-global-preselection-confirm  |
| Default source preselection       | [DONE]   | interactive/init-wizard-default-source      |
| Scope toggle G key persistence    | [DONE]   | interactive/init-wizard-scope-split         |
| Init → Edit → Compile full chain  | [FILLED] | lifecycle/init-edit-compile-roundtrip       |
| Dashboard menu Edit execution     | [TODO]   | —                                           |
| Invalid --source URL error        | [FILLED] | lifecycle/init-edit-error-guards            |
| Plugin install failure hard-error | [FILLED] | lifecycle/plugin-install-failure-hard-error |
| All domains deselected validation | [TODO]   | —                                           |

## 2. Edit Command

| Flow                               | Status   | Test File                                  |
| ---------------------------------- | -------- | ------------------------------------------ |
| Edit wizard launch + pre-selection | [DONE]   | interactive/edit-wizard-launch             |
| Plugin migration (eject → plugin)  | [DONE]   | interactive/edit-wizard-plugin-migration   |
| Plugin operations                  | [DONE]   | interactive/edit-wizard-plugin-operations  |
| Local skill adding                 | [DONE]   | interactive/edit-wizard-local              |
| Skill accumulation                 | [DONE]   | lifecycle/edit-skill-accumulation          |
| Excluded skills handling           | [DONE]   | interactive/edit-wizard-excluded-skills    |
| Unique skill guards                | [DONE]   | interactive/edit-wizard-unique-skill-guard |
| Completion step                    | [DONE]   | interactive/edit-wizard-completion         |
| Navigation                         | [DONE]   | interactive/edit-wizard-navigation         |
| Detection of existing installation | [DONE]   | interactive/edit-wizard-detection          |
| Agent scope routing                | [DONE]   | lifecycle/edit-agent-scope-routing         |
| Re-edit cycles                     | [DONE]   | lifecycle/re-edit-cycles                   |
| Scope toggle P→G skill             | [DONE]   | lifecycle/dual-scope-edit-scope-changes    |
| Scope toggle G→P skill             | [DONE]   | lifecycle/dual-scope-edit-scope-changes    |
| Scope toggle P→G agent             | [DONE]   | lifecycle/dual-scope-edit-scope-changes    |
| Scope toggle G→P agent             | [DONE]   | lifecycle/dual-scope-edit-scope-changes    |
| Source changes (eject→plugin)      | [DONE]   | lifecycle/dual-scope-edit-source-changes   |
| Mixed source handling              | [DONE]   | lifecycle/dual-scope-edit-mixed-sources    |
| Display integrity (scope badges)   | [DONE]   | lifecycle/dual-scope-edit-display          |
| Config snapshot before/after G→P   | [FILLED] | lifecycle/scope-toggle-config-snapshot     |
| Config snapshot before/after P→G   | [FILLED] | lifecycle/scope-toggle-config-snapshot     |
| Agent content after scope toggle   | [FILLED] | lifecycle/scope-toggle-agent-content       |
| Scope toggle roundtrip (persist)   | [FILLED] | lifecycle/scope-toggle-roundtrip           |
| Combined skill + agent toggle      | [FILLED] | lifecycle/scope-toggle-combined            |
| Edit from global-only installation | [FILLED] | lifecycle/edit-global-fallback             |
| Edit passthrough no-op             | [FILLED] | lifecycle/scope-toggle-roundtrip           |
| Edit with invalid --source error   | [FILLED] | lifecycle/init-edit-error-guards           |
| All skills deselected validation   | [TODO]   | —                                          |

## 3. Compile Command

| Flow                                    | Status   | Test File                                             |
| --------------------------------------- | -------- | ----------------------------------------------------- |
| Basic compile to default output         | [DONE]   | commands/compile                                      |
| Frontmatter and content verification    | [DONE]   | commands/compile                                      |
| Verbose flag                            | [DONE]   | commands/compile                                      |
| Multiple skills compilation             | [DONE]   | commands/compile                                      |
| Dual-scope compilation                  | [DONE]   | commands/dual-scope, commands/compile-scope-filtering |
| Edge cases (broken YAML, missing skill) | [DONE]   | commands/compile-edge-cases                           |
| Custom stack assignments                | [DONE]   | commands/compile-edge-cases                           |
| Compile idempotency                     | [DONE]   | commands/compile-edge-cases                           |
| Source flag override                    | [DONE]   | commands/compile                                      |
| Global installation fallback            | [DONE]   | commands/compile                                      |
| Compile after G→P scope change          | [FILLED] | lifecycle/compile-after-scope-change                  |
| Compile after P→G scope change          | [FILLED] | lifecycle/compile-after-scope-change                  |
| Compile idempotency after scope change  | [FILLED] | lifecycle/compile-after-scope-change                  |
| Init→Edit→Compile full chain            | [FILLED] | lifecycle/init-edit-compile-roundtrip                 |
| Compile with no skills found error      | [FILLED] | lifecycle/init-edit-error-guards                      |
| Compile with empty skills array         | [FILLED] | lifecycle/init-edit-error-guards                      |

## 4. Uninstall Command

| Flow                              | Status   | Test File                            |
| --------------------------------- | -------- | ------------------------------------ |
| Help text                         | [DONE]   | commands/uninstall                   |
| No installation found             | [DONE]   | commands/uninstall                   |
| Uninstall with --yes              | [DONE]   | commands/uninstall                   |
| File removal verification         | [DONE]   | commands/uninstall                   |
| User content preservation         | [DONE]   | commands/uninstall                   |
| Config cleanup --all              | [DONE]   | commands/uninstall                   |
| Interactive confirmation          | [DONE]   | interactive/uninstall                |
| Cancellation with N               | [DONE]   | interactive/uninstall                |
| Plugin-specific uninstall         | [DONE]   | commands/plugin-uninstall-core       |
| Plugin edge cases                 | [DONE]   | commands/plugin-uninstall-edge-cases |
| Init → Uninstall → Re-init cycle  | [FILLED] | lifecycle/uninstall-reinit-lifecycle |
| Dual-scope uninstall preservation | [FILLED] | lifecycle/uninstall-reinit-lifecycle |

## 5. Doctor Command

| Flow                                | Status   | Test File                   |
| ----------------------------------- | -------- | --------------------------- |
| Config missing state                | [DONE]   | commands/doctor             |
| Config validity pass                | [DONE]   | commands/doctor             |
| Source reachable check              | [DONE]   | commands/doctor             |
| Help flag                           | [DONE]   | commands/doctor             |
| Corrupt config handling             | [DONE]   | commands/doctor             |
| Valid config + local source         | [DONE]   | commands/doctor-diagnostics |
| Agents compiled check               | [DONE]   | commands/doctor-diagnostics |
| Orphaned agent detection            | [DONE]   | commands/doctor-diagnostics |
| Missing skills detection            | [DONE]   | commands/doctor-diagnostics |
| Healthy project passes all          | [DONE]   | commands/doctor-diagnostics |
| Dual-scope healthy installation     | [FILLED] | lifecycle/doctor-dual-scope |
| Dual-scope missing agent detection  | [FILLED] | lifecycle/doctor-dual-scope |
| Dual-scope orphaned skill detection | [FILLED] | lifecycle/doctor-dual-scope |
| Global installation fallback        | [DONE]   | commands/doctor             |

## 6. Validate Command

| Flow                        | Status | Test File              |
| --------------------------- | ------ | ---------------------- |
| Help text                   | [DONE] | commands/validate      |
| No-args validation flow     | [DONE] | commands/validate      |
| Installed skills validation | [DONE] | commands/validate      |
| Corrupted skill metadata    | [DONE] | commands/validate      |
| Agent validation            | [DONE] | commands/validate      |
| Relationship rules          | [DONE] | commands/relationships |
| All four section headers    | [DONE] | commands/validate      |

## 7. Eject Command

| Flow                     | Status | Test File                     |
| ------------------------ | ------ | ----------------------------- |
| No type specified error  | [DONE] | commands/eject                |
| Invalid type error       | [DONE] | commands/eject                |
| Agent-partials eject     | [DONE] | commands/eject                |
| Templates eject          | [DONE] | commands/eject                |
| Skills eject             | [DONE] | commands/eject                |
| All eject                | [DONE] | commands/eject                |
| Force flag               | [DONE] | commands/eject                |
| Custom output directory  | [DONE] | commands/eject                |
| Integration with compile | [DONE] | integration/eject-compile     |
| Eject integration flows  | [DONE] | integration/eject-integration |

## 8. List Command

| Flow                         | Status | Test File     |
| ---------------------------- | ------ | ------------- |
| No installation found        | [DONE] | commands/list |
| ls alias                     | [DONE] | commands/list |
| Help text                    | [DONE] | commands/list |
| Local installation display   | [DONE] | commands/list |
| Skill count                  | [DONE] | commands/list |
| Agent count                  | [DONE] | commands/list |
| Mode indicator               | [DONE] | commands/list |
| Global installation fallback | [DONE] | commands/list |

## 9. Search Command

| Flow                | Status | Test File                 |
| ------------------- | ------ | ------------------------- |
| Basic search query  | [DONE] | interactive/search-static |
| No results handling | [DONE] | interactive/search-static |
| Multiple matches    | [DONE] | interactive/search-static |
| Help flag           | [DONE] | interactive/search-static |

## 10. Import Skill Command

| Flow                 | Status | Test File             |
| -------------------- | ------ | --------------------- |
| Help text            | [DONE] | commands/import-skill |
| Flag validation      | [DONE] | commands/import-skill |
| Source parsing       | [DONE] | commands/import-skill |
| Invalid source error | [DONE] | commands/import-skill |
| Local source listing | [SKIP] | Known bug - it.fails  |
| Local source import  | [SKIP] | Known bug - it.fails  |

## 11. Build Commands

| Flow                            | Status | Test File                             |
| ------------------------------- | ------ | ------------------------------------- |
| Build plugins basic             | [DONE] | commands/build, commands/plugin-build |
| Build plugins with --agents-dir | [DONE] | commands/build-agent-plugins          |
| Build marketplace basic         | [DONE] | commands/build, commands/plugin-build |
| Help text                       | [DONE] | commands/build                        |

## 12. New Commands

| Flow                     | Status | Test File             |
| ------------------------ | ------ | --------------------- |
| New skill scaffold       | [SKIP] | Feature flag disabled |
| New marketplace scaffold | [SKIP] | Feature flag disabled |
| New agent scaffold       | [SKIP] | Feature flag disabled |

## 13. Lifecycle Chains

| Flow                               | Status   | Test File                                 |
| ---------------------------------- | -------- | ----------------------------------------- |
| Init then edit merge               | [DONE]   | lifecycle/init-then-edit-merge            |
| Re-edit cycles                     | [DONE]   | lifecycle/re-edit-cycles                  |
| Source switching modes             | [DONE]   | lifecycle/source-switching-modes          |
| Cross-scope lifecycle              | [DONE]   | lifecycle/cross-scope-lifecycle           |
| Dual-scope local skill addition    | [DONE]   | lifecycle/edit-add-local-skills           |
| Exclusion lifecycle                | [DONE]   | lifecycle/exclusion-lifecycle             |
| Preloaded preservation             | [FILLED] | lifecycle/preloaded-preservation          |
| Config scope integrity             | [DONE]   | lifecycle/config-scope-integrity          |
| Scope change deselect integrity    | [DONE]   | lifecycle/scope-change-deselect-integrity |
| Project tracking propagation       | [DONE]   | lifecycle/project-tracking-propagation    |
| Selected agent name excluded       | [DONE]   | lifecycle/selected-agent-name-excluded    |
| Global agent toggle guard          | [DONE]   | lifecycle/global-agent-toggle-guard       |
| Global skill toggle guard          | [DONE]   | lifecycle/global-skill-toggle-guard       |
| Init → Edit → Compile roundtrip    | [FILLED] | lifecycle/init-edit-compile-roundtrip     |
| Compile after scope changes        | [FILLED] | lifecycle/compile-after-scope-change      |
| Config snapshots around toggles    | [FILLED] | lifecycle/scope-toggle-config-snapshot    |
| Agent content after scope toggle   | [FILLED] | lifecycle/scope-toggle-agent-content      |
| Scope toggle roundtrip             | [FILLED] | lifecycle/scope-toggle-roundtrip          |
| Combined scope toggles             | [FILLED] | lifecycle/scope-toggle-combined           |
| Edit from global-only installation | [FILLED] | lifecycle/edit-global-fallback            |
| Doctor on dual-scope installation  | [FILLED] | lifecycle/doctor-dual-scope               |
| Init → Uninstall → Re-init cycle   | [FILLED] | lifecycle/uninstall-reinit-lifecycle      |
| Full source switching lifecycle    | [FILLED] | lifecycle/source-switching-full-cycle     |

## 14. Page Object Race Conditions (Bug Pattern)

| Method                        | Status   | File                       |
| ----------------------------- | -------- | -------------------------- |
| `toggleScopeOnFocusedSkill()` | [FILLED] | pages/steps/build-step.ts  |
| `toggleScopeOnFocusedAgent()` | [FILLED] | pages/steps/agents-step.ts |

---

## Summary

| Category     | Total Flows | Done    | Filled | TODO  | Skip  |
| ------------ | ----------- | ------- | ------ | ----- | ----- |
| Init         | 17          | 14      | 2      | 1     | 0     |
| Edit         | 28          | 19      | 8      | 1     | 0     |
| Compile      | 16          | 10      | 6      | 0     | 0     |
| Uninstall    | 12          | 10      | 2      | 0     | 0     |
| Doctor       | 14          | 10      | 3      | 0     | 0     |
| Validate     | 7           | 7       | 0      | 0     | 0     |
| Eject        | 10          | 10      | 0      | 0     | 0     |
| List         | 8           | 8       | 0      | 0     | 0     |
| Search       | 4           | 4       | 0      | 0     | 0     |
| Import       | 6           | 4       | 0      | 0     | 2     |
| Build        | 4           | 4       | 0      | 0     | 0     |
| New          | 3           | 0       | 0      | 0     | 3     |
| Lifecycle    | 21          | 13      | 10     | 0     | 0     |
| Page Objects | 2           | 0       | 2      | 0     | 0     |
| **TOTAL**    | **152**     | **113** | **33** | **2** | **5** |

**Coverage: 96% (146/152 flows covered, 5 skipped, 2 TODOs left)**

### Remaining TODOs (low priority)

These are **tracked here, not in `todo/cli.md`**. They are coverage-tracker entries for minor edge cases, not actionable tickets. Promote to `todo/cli.md` only if one becomes blocking or a real bug surfaces.

- Init: All domains deselected validation — requires wizard interaction to deselect all domains (edge case)
- Edit: All skills deselected validation — requires wizard interaction to deselect all skills (edge case)
- Init: Dashboard menu Edit execution — requires testing dashboard → Edit → edit command chain (partially covered by `init-wizard-existing`)

## 15. Known Assertion Gaps (fixture limitations)

These assertions SHOULD pass but don't due to test fixture limitations. They are documented as
commented-out assertions with `KNOWN GAP` markers in the test files. When the fixture is extended
to include the missing infrastructure, the assertions should be uncommented.

| Test File                                              | Assertion                                                           | Root Cause                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `interactive/edit-wizard-plugin-migration.e2e.test.ts` | `toHaveCompiledAgent("web-developer")` after local→plugin migration | `createE2EPluginSource` fixture does not include agent definition partials needed for compilation |
| `interactive/init-wizard-default-source.e2e.test.ts`   | `toHaveCompiledAgents()` after plugin-mode init                     | Same fixture limitation — `createE2EPluginSource` has no agent partials                           |

### Assertion Strengthening Audit Trail (Passes 1–3)

Total new assertions added across all passes: **~55**

Categories:

- `toHaveCompiledAgents()` / `toHaveCompiledAgent(name)` — 20 additions
- `toHaveCompiledAgentContent(name, { contains, notContains })` — 8 additions
- `toHaveAgentFrontmatter(name, { ... })` — 4 additions
- `toHaveConfig({ skillIds, agents, source })` — 7 additions
- `toHaveSkillCopied(id)` — 5 additions
- `fileExists` / `directoryExists` assertions — 6 additions
- Config-types.ts existence checks — 3 additions
- Excluded tombstone (`"excluded":true`) checks — 2 additions
- Config byte-identical comparison (`toStrictEqual`) — 2 additions
- Negative assertions (`notContains`, scope isolation) — 4 additions
