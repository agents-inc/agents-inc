---
type: convention-drift
severity: medium
affected_files:
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/plugins/plugin-settings.ts
  - src/cli/lib/permission-checker.tsx
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/reference/features/plugin-system.md
date: 2026-07-30
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  Doc side landed: plugin-system.md now carries Cross-Scope Reconciliation, the v2 plugin
  registry, Settings Integration, ScopedConfigWriteResult and the propagation->recompile chain.
  Still pending: the proposed new rows in documentation-bible.md's "Doc-Touching Changes"
  table, which is the mechanism that would have caught this without a full sweep.
---

## What Was Wrong

`.ai-docs/reference/features/plugin-system.md` was last fully validated at product v0.144.1. Two
targeted documentation syncs shipped after it (0.145.0 and 0.146.0), and **neither touched this
file**, even though the systems it documents changed substantially in exactly that window:

| Source change                                                                                  | Doc consequence                                                              |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `local-installer.ts` gained the whole cross-scope reconciliation layer (D-259 / D-268 / D-279) | The doc had **no section at all** for masking, self-heal, or collision kinds |
| `plugin-settings.ts` gained `getInstalledPluginsRegistryPath` / `listRegisteredPluginInstalls` | The doc's three-function Plugin Settings table was silently incomplete       |
| `plugin-info.ts` dropped `InstallationInfo.version`, added `agentDirs`                         | The doc still described `InstallationInfo` as "mode, paths, counts"          |
| `permission-checker.tsx` gained `extraKnownMarketplaces` as an expected settings key           | Settings integration was undocumented entirely                               |
| `writeScopedConfigs` gained a return type (`ScopedConfigWriteResult`)                          | The doc described it as a void splitter                                      |
| `mode-migrator.ts` switched its toEject uninstall to scope-precise (D-262)                     | The doc still said it used `claudePluginUninstallBestEffort()`               |

The root cause is not agent inattention — it is that the sync passes have a checklist to follow,
and the checklist does not mention this area. `documentation-bible.md` -> "Doc-Touching Changes
(Feature / Rename / Deletion Hooks)" enumerates the high-impact files that must trigger a doc
grep. Its rows cover `src/cli/commands/**`, `src/cli/components/**`, trust-boundary ops,
`config-types-writer.ts`, `stack-plugin-compiler.ts`, store refactors and mock-data constants.

**There is no row for `src/cli/lib/installation/**`or`src/cli/lib/plugins/**`.** So a change to
the single largest file in the install path (`local-installer.ts`, ~1600 lines) triggers no doc
hook, while a change to a component file does. The two sync passes were behaving correctly
against the checklist they were given.

A second, smaller drift found while reconciling: `writeScopedConfigs`'s sixth parameter is named
`projectInstallationExists`, but both production call sites (`writeProjectConfig` and the private
`writeConfigAndCompileAgents`) pass `!isHomeDirectory(projectDir)`. Inside the function the
project branch is only reached when that same predicate is true, so the argument is always `true`
there — the `hasProjectItems` disjunct and the "skip project config" branch are unreachable in
production. This is recorded as an observation in `plugin-system.md`; no code change was made.

## Fix Applied

Documentation only. `plugin-system.md` was reconciled against the current source and gained:

- A **Cross-Scope Reconciliation (Masking)** section: the two write sites, the fixed
  self-heal-before-mask order, the IDENTITY vs CATEGORY collision kinds, the shared
  `buildProjectCollisionTest` predicate, the undeclared-`exclusive` rule, the mask-lifetime
  rule after D-277, and the deliberate asymmetry with the wizard's exclusive-swap guard.
- The **claude CLI v2 registry** (`installed_plugins.json`) layout, selection precedence, and
  `validate`'s registry-first / direct-children-fallback resolution order.
- A **Settings Integration** section naming every member of `EXPECTED_SETTINGS_KEYS`.
- `ScopedConfigWriteResult` + the propagation-then-recompile chain (D-240 / D-256).
- Corrected `InstallationInfo`, detection semantics (D-273), mode-migrator scope precision
  (D-262), refreshed barrel-export tables, and a Known Limitations row for D-276.

No source file was modified.

## Proposed Standard

Add two rows to the "Doc-Touching Changes (Feature / Rename / Deletion Hooks)" table in
`.ai-docs/standards/documentation-bible.md`:

| Change                                                                   | Doc(s) to grep + update                                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Any change under `src/cli/lib/installation/**`                           | `features/plugin-system.md`, `concepts/scope-system.md`, `concepts/tombstone-pattern.md`, `config/config-writer.md` |
| Any change under `src/cli/lib/plugins/**` or to `permission-checker.tsx` | `features/plugin-system.md`, `boundary-map.md`                                                                      |

And add a general rule to the same section:

> A targeted sync pass must grep the shipped diff for the files named in this table, not only for
> the docs the release notes happen to mention. A release note describes user-visible behaviour;
> a doc hook describes which reference doc owns the code that produced it. The two do not overlap
> reliably — the D-279 masking work is described in the changelog under a wizard-facing heading,
> while the code lives entirely in the installer.

Corollary for reference docs (add to the "Splits & Pointers" neighbourhood):

> When a doc's owned area gains a NEW subsystem (not a changed one), the absence of a matching
> heading is the drift signal. A validation pass that only checks existing claims against source
> cannot detect a section that was never written. Every sweep must diff the doc's heading list
> against the exported surface of the modules it claims to own.
