---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/src/stores/persisted-schema.ts
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/features/configure/lib/seed.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  pruneUnknownIds spreads the config before overriding the pruned fields; EMPTY names
  `description: undefined` and importConfig/applySavedStack set `{ ...EMPTY, ...config }`.
  Held by config-store.test.ts "the description a configuration carries" and
  persisted-schema.test.ts "keeps the description, which names no id".
---

## What Was Wrong

Carrying a payload's `description` through the editor (F9) needed one optional field on
`persistedConfigSchema`, and two existing shapes each lost it in a different direction.

- **Dropped by a projection.** `pruneUnknownIds` built its result as a literal naming
  `stackId`, `skills`, `remembered` and `agents`. Every adoption (`fromSeedPayload`) and every
  storage read (`merge`) passes through it, so any field added later vanished there without an
  error — the field parsed, then disappeared one call later.
- **Kept by a merge.** zustand's `set` merges. `applyStack(null)`, `reset`, `importConfig` and
  `applySavedStack` all "replace the whole selection" with an object that does not name an
  optional field it happens not to hold, so the previous configuration's value survived the
  replacement. `EMPTY` named only the four fields.

Neither shows up in a type check: the field is optional, so every literal compiles.

## Fix Applied

`pruneUnknownIds` spreads `config` first, then overrides the four pruned fields. `EMPTY` names
`description: undefined`, and the two replacing actions write `{ ...EMPTY, ...config }`.

## Proposed Standard

`docs/architecture.md` -> Cross-boundary rules already says a zustand `set` writes. One line
beside it: "A store action that replaces the selection spreads `EMPTY` first, and `EMPTY` names
every optional field, because `set` merges and an absent key keeps the old value." A function that
filters a record should spread it rather than restate it, so a field it does not filter passes
through.
