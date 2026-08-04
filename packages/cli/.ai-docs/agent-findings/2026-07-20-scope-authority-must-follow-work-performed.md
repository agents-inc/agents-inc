---
type: architectural-drift
severity: high
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/configuration/config-merger.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-07-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: 'Inverted relative to the enum''s documented direction — the CODE side landed and the DOCS side did not. Landed (verified 2026-07-30): `applyProjectScopeAuthority`/`enforceScopeAuthority` are gone from `edit.tsx` and `recordGlobalSourceMigrations` replaces them, invoked before `writeConfigAndCompile` and scoped to `migratedSkillIds` filtered by `isActiveAt(s, "global")`; the rationale is on-site in its JSDoc. `authoritativeScope: "owned"` in `config-merger.ts` is unchanged as intended. Pending: the proposed standard. Neither CLAUDE.md''s "Scope Awareness" section nor `reference/concepts/scope-system.md` states "config authority must follow the work actually performed", so the trap the finding names — reading the config rule as an invariant about ALL global state rather than about UNRELATED global state — is still uncorrected in the docs, and the guidance about grepping the E2E suite before implementing a refusal was not added to the sub-agent prompt guidance. Also still true: the reconciliation lives in the command rather than its ideal home in the config-write layer.'
---

## What Was Wrong

Two separate rules describe who may write global state from a project-context run, and they
disagreed about the same operation:

- The **config** rule: "never modify global config from project-level operations"
  (commit 403df46), enforced by `authoritativeScope: "owned"` in `mergeConfigs` and by
  `mergeGlobalConfigs`, which never rewrites an existing global entry.
- The **filesystem/registry** behaviour: `executeMigration` resolves each skill's install
  paths from **that skill's own scope**, so a project-context `cc edit` that switches a
  global-scoped skill between plugin and eject already copies/deletes the skill under
  `$HOME` and adds/removes its **user-scope** plugin registration. That is a deliberate,
  tested feature (`e2e/lifecycle/scope-aware-local-copy.e2e.test.ts`, describe
  "edit source switch -- scope-aware migration").

The result was a three-way divergence after one such edit: disk said eject, the global
config still said plugin, and the plugin registry was empty.

The trap is that the config rule reads like an invariant about _global state_, when it is
really an invariant about _unrelated global state_. A previous fix round read it the first
way and made `cc edit` **refuse** global-scoped source switches from a project directory.
That was locally consistent and locally verified, but it silently deleted a shipped feature
— the three scope-aware migration lifecycle tests went red, with the switch never running.

## Fix Applied

Reshaped the fix from "refuse" to "record", with a deliberately narrow carve-out in
`src/cli/commands/edit.tsx`:

- Removed `applyProjectScopeAuthority` / `enforceScopeAuthority` (the refusal).
- Added `recordGlobalSourceMigrations`, which runs **before** `writeConfigAndCompile` and
  rewrites `source` in the global config for **exactly the skill ids `executeMigration`
  acted on this run** that are active at global scope — nothing else. `marketplace`,
  `stack`, `agents`, other entries and other projects' views are untouched.
- The `authoritativeScope: "owned"` model in `config-merger.ts` is unchanged; its unit test
  ("owned-scope edit ... preserves inherited global-active skills") encodes the deliberate
  principle for the _roster_ and still passes untouched. The carve-out is about a single
  field on entries this run physically migrated, not about roster authority.

Rationale is documented on-site in the `recordGlobalSourceMigrations` JSDoc.

Note: the ideal home for this reconciliation is the config-write layer
(`mergeGlobalConfigs` / `writeScopedConfigs` in `local-installer.ts`), threading the
migrated ids down from the command. That was out of this agent's file ownership, so it
lives in the command for now — see "Proposed Standard".

## Proposed Standard

Add to the "Scope Awareness (project vs global)" section of `CLAUDE.md`, and to whichever
`.ai-docs/` page documents the D-233 authority model:

> **Config authority must follow the work actually performed.** "Never modify global config
> from project-level operations" governs global state the operation did **not** touch. When
> a project-context operation legitimately writes global _disk_ or the global _plugin
> registry_ for a skill (per-skill scope resolution in `executeMigration`,
> `installBaseDir`, `claudePluginInstall`), it **must** record that specific change in the
> global config. Refusing the config write does not protect global state — it just makes
> the recorded state lie about the filesystem. Scope the write to the exact ids and the
> exact fields the run changed; never widen `authoritativeScope` to `"all"` to achieve it.

Also worth adding to the sub-agent bug-fix prompt guidance:

> Before implementing a **refusal** for a user-visible operation, grep the e2e suite for
> tests that exercise that operation and assert it succeeds. A refusal is a product change;
> a divergence between two persisted views of the same operation is a bug. Prefer making
> the two views agree over removing the operation.
