---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/features/wizard-flow.md
  - src/cli/components/wizard/wizard.tsx
  - src/cli/stores/wizard-store.ts
  - src/cli/commands/init.tsx
  - src/cli/commands/edit.tsx
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: wizard-flow.md rewritten to cover hydration-vs-props; documentation-bible.md line 224 adds the Hydration-vs-props rule
---

## What Was Wrong

`reference/features/wizard-flow.md` documented `WizardProps` as the single entry point for all wizard state (initialStep, initialDomains, installedSkillConfigs, installedAgentConfigs, isEditingFromGlobalScope). In reality, that state now flows through `hydrateWizardStore()` called BEFORE `render(<Wizard/>)` in both `init.tsx` and `edit.tsx`. The actual `WizardProps` type is now minimal (onComplete, onCancel, version, logo, projectDir, startupMessages, initialAgents, installedSkillIds).

Secondary drift:

- Hooks table still listed `useWizardInitialization`, which no longer exists (file deleted; inlined into `hydrateWizardStore`).
- Stack-agent-preselection section referenced `use-wizard-initialization` as the setter of `globalAgentPreselections`; now it is `hydrateWizardStore`.
- ESC handling description said wizard.tsx handled cancel/goBack; actually wizard.tsx's ESC is a no-op and each step owns its own ESC handler. No documented Ctrl+C semantics.

## Fix Applied

- Rewrote `Wizard Props` section to match actual prop surface.
- Added `HydrateOptions (edit/init setup)` section documenting the hydration type and init vs edit behavior.
- Rewrote `Edit Mode Flow` to reflect hydrate-before-render pattern.
- Added `Cancellation semantics` subsection documenting ESC ownership per step and Ctrl+C behavior (Ink SIGINT -> useApp().exit(); `wizardResult === null` treated as cancelled by parent command).
- Removed stale `useWizardInitialization` row from hooks table and replaced the reference in stack-agent-preselection.
- Confirmed hotkeys.ts registry is authoritative: only HOTKEY_INFO, HOTKEY_ACCEPT_DEFAULTS, HOTKEY_SCOPE, HOTKEY_SETTINGS, HOTKEY_TOGGLE_LABELS, HOTKEY_FILTER_INCOMPATIBLE, HOTKEY_SET_ALL_LOCAL, HOTKEY_SET_ALL_PLUGIN, HOTKEY_ADD_SOURCE exist. No HOTKEY_COPY_LINK. Added explicit note.
- Bumped `last_validated` to 2026-04-21 in frontmatter and DOCUMENTATION_MAP.md.

## Proposed Standard

When a system is refactored to move behavior from "prop-driven" to "store-hydrated-before-render" (or vice versa), the owning reference doc MUST be validated in the same commit. Add to `.ai-docs/standards/documentation-bible.md`:

- **Hydration-vs-props rule:** Any doc claiming a React component receives state via props must be cross-checked against the actual `type XxxProps` in the component file. If state is hydrated via a separate function (e.g., `hydrateXStore`), the doc must name that function and show the `HydrateOptions` type.
- **Hook table rule:** Every entry in a hooks table must be verified to exist via `Glob` before the doc is validated. Deleted hooks produce immediate drift when callers migrate.
- **Hotkey registry rule:** Hotkey lists in docs must enumerate only constants that exist in `hotkeys.ts` (or equivalent registry). Include an explicit "No other HOTKEY\_\* constants exist" sentinel so future deletions are obvious.
