---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/reference/component-patterns.md
  - src/cli/components/wizard/source-grid.tsx
  - src/cli/components/wizard/step-agents.tsx
  - src/cli/components/wizard/hotkeys.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-01
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: "Docs side landed — the three drifted claims in component-patterns.md are corrected and the section carries a dated PARTIAL annotation. The standard itself is NOT written into documentation-bible.md, and no checker exists. This is the code-shipped/standard-unwritten direction of `partial`."
---

## What Was Wrong

A validation sweep over `component-patterns.md` found three claims that named things which do
not exist in source. All three are the same defect wearing different clothes, and none of them
is detectable by the validation loop the bible currently prescribes.

**1. A renamed module-internal function.** The doc said `rowStatusGlyph` / `rowLabelColor`
"mirror `DIFF_PREFIX` / `DIFF_COLOR`". `rowStatusGlyph` has no declaration anywhere in the repo.
The 0.147.0 marker rework renamed it `rowStatusMarker` and split the colour side into
`rowDiffColor` behind two callers (`rowLabelColor`, `focusedRowLabelColor`). An agent grepping
`rowStatusGlyph` to find the marker logic gets zero hits and has no way to tell whether the doc
is stale or the function is somewhere it did not think to look.

**2. A deleted store subscription documented as a live read.** The doc said `StepAgents`
"Reads `selectedAgents`, `agentConfigs`, and `installedAgentConfigs` from wizard store." The
0.147.1 dead-binding sweep deleted the `installedAgentConfigs` subscription because nothing in
the component consumed it. The doc kept asserting the read — and worse, asserting it in a
section about how dual-scope badges are derived, which invites the reader to believe the badges
consult the hydration snapshot. They do not; they come entirely from the live `agentConfigs`
pair.

**3. A new export with no heading to arrive at.** `isInfoPanelAvailable(step)` was added to
`hotkeys.ts` in 0.147.0 and is the gate on both the `I` key and its footer hint. The Hotkeys
Registry section ended with `Helper: isHotkey(...)` — singular — so the registry read as
complete while omitting the export that decides whether the registry's most global hotkey does
anything at all.

**Why the existing checks all pass over this.** The bible's validation loop ("read every claim,
verify it against source") plus its Heading Diff rule between them cover file paths, line
numbers, signatures, counts and missing sections. Nothing covers a **backticked identifier in
prose**. Defects 1 and 2 have a heading (they sit inside sections that exist and are otherwise
accurate), and defect 3 has no heading by construction. The 2026-07-31 finding this supersedes
proposed "a one-line CI check over backticked `src/**` paths in `.ai-docs/reference/`" — the
right instinct, one category too narrow. Every one of these three survives a path check, because
every path involved is correct. It is the identifiers that rotted.

The asymmetry that makes this worth a rule: a stale prose paragraph under-informs, but a stale
identifier actively misdirects. `rowStatusGlyph` reads exactly as authoritatively as
`rowStatusMarker` does, and the only way to tell them apart is to grep — which is precisely the
step the doc exists to save.

## Fix Applied

Docs only; no source touched.

- `rowStatusGlyph` → `rowStatusMarker`, with `rowDiffColor` and its two defaulting callers
  documented, in `component-patterns.md` → "SourceGrid Row States".
- `StepAgents` store access rewritten to the two fields it actually subscribes to, plus its
  imperative `getState()` calls, with an explicit callout that it does **not** read
  `installedAgentConfigs` and that the badges derive from the live pair.
- `isInfoPanelAvailable` added to the hotkey registry as a two-row Helpers table, alongside the
  bible-mandated "No other `HOTKEY_*` constants exist" sentinel, which was also absent.
- `last_validated` deliberately **not** re-stamped — the pass judged three sections, not the file.

No checker was added, and no rule was written into `standards/`, which is not this agent's file
to edit. Hence `status: partial`.

## Proposed Standard

For `.ai-docs/standards/documentation-bible.md`, as a third bullet beside "Heading Diff" and the
existing path-verification rule:

**Identifier Diff — a backticked identifier is a claim, and it is checkable.** Any
`` `symbolName` `` appearing in `.ai-docs/reference/` prose that is not obviously prose (i.e.
matches `[a-zA-Z_][a-zA-Z0-9_]*` and appears in a sentence describing code) must resolve to a
declaration in `src/`. A validation pass over a doc MUST grep the identifiers it names, not only
the paths. Three sub-rules follow from the three shapes found above:

1. **A rename is not covered by re-reading the section.** The section around `rowStatusGlyph`
   was substantively correct; only the name had moved. Re-reading a section for accuracy will
   pass it. Grep the name.
2. **A store field named in a "Store access:" line is a subscription claim.** Verify it against
   the component's actual `useWizardStore` selectors, not against the store's field list — the
   field can exist while the read does not. This is the exact shape 0.147.1's dead-binding sweep
   creates: every removed binding leaves a doc sentence asserting a read that no longer happens.
3. **A "Helper:" / "Helpers:" line is an exhaustive claim whether or not it says so.** Singular
   phrasing (`Helper: isHotkey`) reads as complete. Either enumerate every export of the module
   or say which subset is listed.

Cheap mechanical form, in the spirit of the bible's existing "grep the artifact" check: for each
reference doc, extract backticked tokens matching a function/const naming shape and
`grep -r "function <tok>\|const <tok>\|export .*<tok>" src/`. Zero hits is a hard error, the same
severity the bible already assigns to a documented file path that does not exist — an agent
following either one is sent somewhere that is not there.

**Relationship to the 2026-07-31 finding.** This widens the check proposed in the closing "Also
observed" paragraph of
`2026-07-31-a-hardcoded-header-lets-its-fixture-omit-the-field-it-will-derive-from.md`, which
asked for a CI check over backticked `src/**` **paths**. Deliberately linked as `related:`, not
`supersedes:` — that finding's primary claim (a hardcoded display value lets its fixtures omit
the field it will derive from) shipped and is `status: resolved`, and marking it `superseded`
would erase that record to widen one paragraph of its proposal. Only the proposed check is
extended here; nothing in it is retracted.
