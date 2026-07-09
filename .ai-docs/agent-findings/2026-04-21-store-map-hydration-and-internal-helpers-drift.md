---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/reference/store-map.md
  - src/cli/stores/wizard-store.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: store-map.md expanded with hydration section, 11 internal helpers, and snapshot-semantic consumer lists; documentation-bible.md line 230+ codifies the Zustand store documentation rule
---

## What Was Wrong

`reference/store-map.md` (last validated 2026-04-13) was accurate for field/action names — no dead references, no renamed signatures — but incomplete in three ways:

1. **`hydrateWizardStore` + `HydrateOptions` were entirely undocumented.** This is the only supported entry point for pre-render store seeding (init and edit flows both call it). Agents asked to implement new wizard entry points would not find it.
2. **Internal helpers `reconcileSkillConfigs` / `restoreSkillConfigs` / `applyAgentToggle` were missing from the Internal Helpers section.** Only `buildSkillConfigForId` and `applySkillRemoval` were listed, even though the other three are load-bearing for tombstone logic.
3. **Snapshot-semantics of `installedSkillConfigs` / `installedAgentConfigs` were described as just "for diff rendering"** — their role as the tombstone decision probe (consumed by `toggleSkillScope`, `toggleTechnology`, `applySkillRemoval`, `buildSourceRows`) was invisible. Same for `_stackDomainSelections` and the init-only lifetime of `globalPreselections` / `globalAgentPreselections`.

Additionally, `toggleTechnology` was documented as "Radio (exclusive) or checkbox toggle" without the three user-visible guard clauses (global-scope block, exclusive-replacement block, last-in-required-exclusive block), and the `selectedAgents` ↔ `agentConfigs` pairing (the D-215 retention reason) was not explained.

## Fix Applied

- Expanded the WizardState shape table entries for: `_stackDomainSelections`, `installedSkillConfigs`, `installedAgentConfigs`, `focusedSkillId`, `focusedAgentId`, `globalPreselections`, `globalAgentPreselections`, `domainSelections`, `skillConfigs`, `selectedAgents`, `agentConfigs`.
- Rewrote `toggleTechnology` action row to enumerate its three guard clauses.
- Expanded Internal Helpers section from 2 helpers to 11, covering every non-exported function in `wizard-store.ts`.
- Added a new Hydration Entry Point section documenting `hydrateWizardStore(options: HydrateOptions)` and the 7-step hydration sequence.
- Updated `last_validated` to 2026-04-21; updated staleness dashboard + State Management row in `DOCUMENTATION_MAP.md`.

## Proposed Standard

Add to `standards/documentation-bible.md` under the store-map template:

> When documenting a Zustand store, every non-exported helper at module scope MUST be listed in Internal Helpers. Store state fields that (a) are set once and never modified, or (b) act as decision probes consumed by multiple actions, MUST have their consumers enumerated in the field description — not just their authoring action. The hydration entry point (imperative `setState` batch called before first render) MUST get its own section, separate from the store's action table.
