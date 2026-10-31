---
type: missing-standard
severity: low
affected_files:
  - apps/editor/src/features/configure/components/save-stack-dialog.tsx
  - apps/editor/src/features/configure/components/skill-contents-dialog.tsx
standards_docs:
  - docs/architecture.md
date: 2026-10-29
reporting_agent: web-developer
category: architecture
domain: web
root_cause: missing-rule
status: open
---

## What Was Wrong

The owed-save rename dialog (`useOwedToAsk` in `save-stack-dialog.tsx`) waits while another modal is
open, and it learns that from a hand-written list of conditions. The skill-contents dialog opens
outside `dialog` (its own `previewSkillId`, so it can sit over the install dialog) and was missing
from the list, so sign-in landing while it was open put the rename dialog over it (EDITOR-96). The
contents dialog's open state is derived, not stored: `previewSkillId !== null` and catalog-store
`external[previewSkillId]` exists. A catalogue load that drops the skill closes it without clearing
the id, so a waiter on the id alone waits forever.

Census of every editor modal and how it opens:
`grep -rn -E 'open=\{' apps/editor/src --include='*.tsx' | grep -v '\.test\.'` gave 8 files on
2026-10-29; six open through ui-store `dialog`, `pendingStack` or `pendingMarketplace`; save-stack
is the waiter itself; skill-contents was the one outside.

## Fix Applied

`useContentsOpen` in `save-stack-dialog.tsx` repeats the contents dialog's own open derivation,
subscribed to both stores, and `useAnotherModalOpen` joins it to the ui-store conditions. Caught by
the `accounts.spec.ts` cases "waits behind an added skill's contents open as the account lands" and
"asks once a catalogue load drops the added skill whose contents were open".

## Proposed Standard

Nothing catches the next one: a new modal opened outside `dialog`/`pendingStack`/`pendingMarketplace`
reopens this bug, and the contents derivation now lives in two files that can drift. Either a line in
`docs/architecture.md` -> Cross-boundary rules ("a modal opened outside ui-store `dialog` is added to
`useAnotherModalOpen` in save-stack-dialog.tsx"), or one exported `usePreviewedSkill()` in
`skill-contents-dialog.tsx` that both the dialog and the waiter call, so the derivation has one home.
Proposal only.
