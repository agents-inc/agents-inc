---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/components/wizard/source-grid.tsx
  - src/cli/stores/wizard-store.ts
standards_docs:
  - .ai-docs/reference/concepts/scope-system.md
  - .ai-docs/reference/component-patterns.md
date: 2026-07-31
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Landed: the three code divergences (empty-baseline semantics, marker column, selection glyph) are
  fixed in source-grid.tsx and wizard-store.ts with unit + E2E coverage. Pending: the "One diff, one
  key" section in reference/concepts/scope-system.md has no empty-baseline clause and no rendering
  half, so nothing stops the next surface from re-deriving either.
---

## What Was Wrong

`2026-07-29-sources-tab-session-diff-diverged-from-computescopediff.md` unified the diff **key**
(`skillSlotKey`) across the confirm step and the Sources tab. Three further divergences survived
that pass, all the same shape — **the Sources tab re-deriving, in its own vocabulary, a status the
info panel and confirm step already compute and render**.

1. **Semantic: an empty baseline meant opposite things on the two surfaces.**
   `classifyDiffRow` in `lib/wizard/scope-diff.ts` reads `prevKeySet === null || !prevKeySet.has(key)`
   — no baseline means every row is new. `addedSlotFlag` in `wizard-store.ts` read
   `if (!installedSkillSlots) return {}` — no baseline means no row is new. On a genuine first
   `init` (`createInitialState` sets `installedSkillConfigs: null`; `hydrateForInit` overwrites it
   only when a global installation already exists) the Sources tab therefore showed no `+` and no
   green, while the confirm step one step later marked every one of the same rows added. The second
   `init` worked, which is why it went unnoticed: from then on the snapshot is non-null.

   The `null` branch was a silent fallback of exactly the kind CLAUDE.md bans, and its JSDoc stated
   the carve-out as intentional ("with no snapshot there is nothing to diff against, which keeps
   init from flagging every row") — so a reader had no signal that the reference implementation
   disagreed. Note that `null` and `[]` were already answering differently in the same function: an
   empty snapshot flagged every row added, a missing one flagged none.

2. **Layout: the marker column existed on marked rows only.**
   `rowStatusGlyph` returned `""` for an ordinary row, so in a mixed grid plain names started two
   columns left of `+`/`-` names inside the same fixed-width box. `DIFF_PREFIX` in
   `skill-agent-summary.tsx` has always given _every_ status a 2-char prefix, `unchanged` included,
   which is why the info panel never had this problem. The focused branch compounded it: it
   concatenated the glyph (which already ends in a space) with a highlight-padded `` ` ${name} ` ``,
   so a focused marked row rendered `"+  Name "` against `"+ Name"` unfocused — the name moved a
   column the moment focus arrived, and the `LABEL_BG` band started two columns further left than on
   an unmarked focused row. Two E2E specs carried JSDoc paragraphs explaining that they capture an
   UNFOCUSED row to dodge it; a workaround documented twice as if it were a constraint is the
   strongest evidence available that the render was wrong.

3. **Vocabulary: inert rows expressed selection with a glyph nothing else in the grid used.**
   `SourceTag`'s editable branch carries selection in colour and weight, with the prefix slot
   reserved for the focus chevron or a blank. Its `readOnly`/`disabled` branch instead painted
   `UI_SYMBOLS.SELECTED` (`✓`) in that slot. The check therefore appeared nowhere else in the grid
   and landed only on rows the user cannot act on — including the pending-removal row, where
   `toPendingRemovalRow` re-pins selection to the persisted source, so the row about to be deleted
   got an affirmative tick beside the source it was losing.

Separately, the grid reserved an 11-column gutter to spell out `Scope` / `Global` / `Project` —
information the info panel and confirm step already label on their own per-scope blocks. Removing
it is not a divergence fix, but it is the same duplication in the horizontal direction.

## Fix Applied

- `collectInstalledSkillSlots` now returns a non-nullable `ReadonlySet<string>` — a missing snapshot
  collapses to the empty set rather than to a distinct "no baseline" state, because they are the
  same answer. `addedSlotFlag` lost its null branch and its nullable parameter, and `SourceRowContext`
  / `toLockedGlobalRow` were re-typed to match. Both JSDocs now state the equivalence instead of the
  retired carve-out. Two store specs pin `null` and `[]` classifying identically.
- `rowStatusGlyph` → `rowStatusMarker`, returning a fixed **two-column** cell on every row (glyph +
  one space, or `ROW_MARKER_BLANK`). The focused branch renders `{marker}{`${name} `}`, so the
  marker sits inside the highlight, the band is one width on every row, and exactly one space
  separates marker from name focused or not. `SKILL_NAME_WIDTH` widened 24 → 26, i.e. by exactly the
  marker width, so no name that fitted before the marker was reserved starts wrapping now.
- `SourceTag`'s inert branch drops the `✓`: the prefix slot is always the blank chevron spacer, and
  selection is carried by weight plus brightness (`bold={option.selected}`,
  `dimColor={!disabled && !option.selected}`) — the editable branch's vocabulary. Each row keeps its
  status colour: `ERROR` for pending removal, dimmed for locked.
- The `Scope` caption is gone, replaced by a same-width spacer so `Local`/`Plugin` still sit over
  their cells. `SCOPE_COL_WIDTH` and the per-group labels went with it in the first pass and were
  **restored the same day** on the owner's correction — the `Global`/`Project` labels down the left
  are row headers, and a caption naming a column whose every value is self-describing was the only
  redundancy. `ScopeGroup` is modelled on the `scope` itself (also its React key); the label is
  derived from it through `SCOPE_ROW_HEADERS`. The grouping is unaffected either way:
  `sourceRowSortTier` still orders global before project and the `marginTop={1}` still separates the
  blocks, and a single-scope grid still renders flat with no gutter.
- Unit coverage re-derived from the new behaviour rather than broadened: both whole-frame snapshots
  regenerated (they now pin the marker column and the surviving blank-line block separator), the two
  `toContain(UI_SYMBOLS.SELECTED)` specs replaced by chalk-exact weight/brightness assertions on both
  inert kinds, and the obsolete JSDoc workaround paragraphs removed from the two dual-scope specs.

### Observed, not fixed

`SKILL_NAME_WIDTH` is still too narrow for the matrix. The longest `displayName` is 30 columns
("Electron Storage & Credentials") and 15 names exceed the 24 the name itself gets, so those rows
wrap to two lines. This predates the marker work — the marker change actually _improves_ the
tightest case, since a focused marked row now costs the name 3 columns instead of 4 — and fixing it
means widening the grid by another 7 columns, which is a layout decision, not a defect fix.

## Proposed Standard

Extend the **"One diff, one key"** section proposed for
`.ai-docs/reference/concepts/scope-system.md` with an empty-baseline clause:

- A diff classifier MUST treat "no baseline" and "empty baseline" identically. If the two can be
  distinguished, say why in the JSDoc and name the surface that must agree; otherwise collapse the
  nullable input at its collector so no call site can branch on it. `classifyDiffRow` is the
  reference — a null previous-key set means everything is new.

Add its missing **rendering half** to `.ai-docs/reference/component-patterns.md`, beside the
existing `SkillAgentSummary` diff-baseline section:

- **One marker column.** A surface that renders diff status inline reserves a fixed-width marker
  cell on _every_ row, blank when the row carries no status. `DIFF_PREFIX` is the reference. Never
  emit `""` for the unmarked case — the names in a fixed-width grid then start in two different
  columns depending on data.
- **One glyph set, one meaning.** `+` added, `-` removed, `~` source-changed, `•` unchanged, `🔒`
  locked. A glyph that appears on one row kind and nowhere else is a divergence, not an affordance.
- **Selection is expressed the same way on every row of a grid**, whatever its interactive state.
  Colour and weight are the grid's selection vocabulary; if an inert row cannot show selection that
  way, that is an argument for changing the whole grid, not for giving inert rows a private glyph.
- **A focus treatment must not change a row's metrics.** Padding a focused label shifts its content
  relative to its unfocused neighbours; put the padding where it cannot move the marker or the name.

Add to `.ai-docs/standards/e2e/anti-patterns.md`: when a spec's JSDoc explains that it captures a
particular state _to avoid_ a rendering defect, that paragraph is a defect report, not a test
constraint. File it; do not let it calcify. Two specs here carried the same workaround for the same
double-space for two releases.
