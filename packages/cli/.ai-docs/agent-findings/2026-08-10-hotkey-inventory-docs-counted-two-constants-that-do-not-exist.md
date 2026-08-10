---
type: convention-drift
severity: low
affected_files:
  - src/cli/components/wizard/hotkeys.ts
  - .ai-docs/reference/wizard/state-transitions.md
  - .ai-docs/reference/component-patterns.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-10
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  The count sentence in state-transitions.md is corrected and now reads four, naming the four
  constants that exist. The two phantom rows in component-patterns.md's hotkey table
  (HOTKEY_SETTINGS, HOTKEY_ADD_SOURCE) and the prose that depends on them are NOT corrected — they
  predate this change and belong to a codex-keeper pass over that document. What landed here is
  only the part the CLI-479 change itself made false.
---

## What Was Wrong

Two reference documents enumerated the wizard's `HOTKEY_*` registry, and both enumerations were
wrong before this task started.

`reference/wizard/state-transitions.md` opened its hotkey section with "Exactly eight `HOTKEY_*`
constants exist there", listing `HOTKEY_SETTINGS` and `HOTKEY_ADD_SOURCE` among them.
`reference/component-patterns.md` carried the same two as rows in its character-hotkey table, plus
a paragraph explaining that "`HOTKEY_SCOPE` and `HOTKEY_SETTINGS` share the `s` key and are
context-gated in `wizard.tsx`".

Neither constant is in `src/cli/components/wizard/hotkeys.ts`. Before CLA-479 the module exported
six: `HOTKEY_INFO`, `HOTKEY_ACCEPT_DEFAULTS`, `HOTKEY_SCOPE`, `HOTKEY_TOGGLE_LABELS`,
`HOTKEY_SET_ALL_LOCAL`, `HOTKEY_SET_ALL_PLUGIN`. It now exports four.

Both documents assert their own exhaustiveness in the same breath — "No other `HOTKEY_*` constants
exist", "both re-read off `hotkeys.ts` in full — the module holds nothing beyond what the tables
above and below enumerate". A claim of completeness is the one kind of claim a reader cannot
partially trust: it is either checked or it is misleading, and this one had drifted in the
direction that invents surface rather than omitting it. An agent reading either table would look
for a settings step and an add-source key that no code path can reach.

The drift is invisible to every gate. `tsc` and ESLint do not read Markdown; nothing cross-checks a
documented inventory against the module it claims to enumerate. It surfaced only because CLA-479
had to decrement the count and the arithmetic did not come out.

## Fix Applied

Corrected the sentence this change made false. `state-transitions.md` now reads "Exactly four
`HOTKEY_*` constants exist", names the four, and records in the same sentence that
`HOTKEY_SET_ALL_LOCAL` / `HOTKEY_SET_ALL_PLUGIN` were withdrawn with the Sources step's bulk keys
while `HOTKEY_SETTINGS` / `HOTKEY_ADD_SOURCE` were already absent before that — so a later reader
subtracting two from eight does not conclude something went missing unrecorded.

`component-patterns.md`'s table lost only the two rows CLA-479 deleted. Its `HOTKEY_SETTINGS` and
`HOTKEY_ADD_SOURCE` rows and the `s`-key-sharing paragraph are left in place: they are older drift
with a different cause, and rewriting them is a documentation pass, not a side effect of a store
change.

## Proposed Standard

An inventory that names a count is only worth writing if something can check it. Two options, and
the first is cheap:

1. **Make the count checkable.** `scripts/` already carries `check-findings-frontmatter.ts` as
   precedent for a doc-shape checker with a test that fails on violation. A comparable scan could
   parse the `HOTKEY_*` exports out of `hotkeys.ts` and fail when a reference doc's enumeration
   disagrees. The same shape covers the other self-asserting inventories in `.ai-docs/` — the
   `STEP_TEXT` member count, the schema count in `types/zod-schemas.md`, the file totals in
   `DOCUMENTATION_MAP.md` — each of which already carries a "re-derive, never carry forward"
   instruction that only a human currently honours.

2. **If it cannot be checked, do not assert exhaustiveness.** `standards/documentation-bible.md`
   should say that a doc may enumerate a module's exports OR claim the enumeration is complete, and
   that claiming completeness without a checker converts a stale row from an omission into a
   fabrication. The rule belongs beside the existing "A Count Lives in Exactly One Document"
   section, which already establishes that counts are load-bearing; this is the missing half —
   where a count is allowed to live is settled, whether it is allowed to be unverifiable is not.
