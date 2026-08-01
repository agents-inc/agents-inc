---
type: standard-gap
severity: high
affected_files:
  - .ai-docs/reference/dependency-graph.md
  - .ai-docs/reference/boundary-map.md
  - src/cli/commands/list.tsx
  - src/cli/components/wizard/wizard.tsx
  - src/cli/components/wizard/hotkeys.ts
  - src/cli/lib/operations/project/load-agent-defs.ts
  - src/cli/lib/operations/skills/discover-skills.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-01
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: "Docs fixed (dependency-graph.md and boundary-map.md rebuilt from source this pass). The standards change is pending: documentation-bible.md's Heading Diff rule covers missing SECTIONS but not missing or phantom TABLE ROWS, and its validation loop still reads row-first."
---

## What Was Wrong

The 0.147.1 release removed 37 unused imports from production code. `dependency-graph.md` — whose entire content is an import graph — was carrying at least one of them as a documented edge (`components/wizard/wizard.tsx` -> `lib/feature-flags`), and had never recorded a real edge that had been present all along (`components/wizard/hotkeys.ts` -> `lib/feature-flags`).

Both defects have the same mechanical cause, and it is the one the bible's Heading Diff rule already identifies for sections but does not extend to rows:

> The standard validation loop (read each claim, verify it against source, fix it) is structurally incapable of finding a missing claim. It only checks claims that exist.

A row-by-row pass over the Component -> Lib table would have caught the phantom `wizard.tsx` row (read the row, grep the file, no match, delete). It could never have found the missing `hotkeys.ts` row, because nothing in a row-first pass looks at files that have no row. The bible's Heading Diff rule states exactly this reasoning — but scopes it to headings versus exported symbols, which is one granularity too coarse for a document whose atomic unit is an edge, not a section.

Re-deriving the whole graph by grepping every `import` in `src/cli` and diffing against the tables found substantially more than the two feature-flag defects:

| Defect                                                                                           | Class                                                                                                                     |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `commands/list.tsx` imports `hydrateWizardStore`                                                 | The doc asserted "Commands should not import stores directly. **Currently none do**" — a negative exhaustive claim, false |
| `lib/operations/project/load-agent-defs.ts` and `write-project-config.ts` use `loadMergedAgents` | Doc said `loadAllAgents` — a real, adjacent export. Picking it silently drops project-local agent overrides               |
| `lib/operations/skills/discover-skills.ts` uses `loadSkillsFromDir`                              | Doc said `parseFrontmatter`, which that file does not import                                                              |
| Three operations rows reading "(none)"                                                           | All three have lib edges                                                                                                  |
| "Operation-to-operation composition exists in **exactly one place**"                             | Four places                                                                                                               |
| `boundary-map.md`: "**Three** commands override `static baseFlags = {}`"                         | Seven. An agent following it emits `--source` on four commands oclif rejects                                              |
| `boundary-map.md`: `eject`'s positional `type` arg                                               | Absent from its row entirely                                                                                              |

The `loadAllAgents` / `loadMergedAgents` case is the most dangerous shape here and deserves separating from the rest. A file path that does not exist fails loudly the moment an agent opens it. A function name that **does** exist, in the **same barrel**, with a plausibly similar name, does not fail at all — it compiles, and it silently changes behaviour.

The two `boundary-map.md` defects were not caused by any recent release. They are long-standing, and they surfaced only because this pass ran the bible's flag/arg diff rather than re-reading the rows. Notably, `commands/index.md` — the canonical commands reference — had **both** right the whole time. Two docs disagreed for at least two releases and no check compared them, because each doc's validation is scoped to itself.

## Fix Applied

Both owned docs rebuilt from source rather than row-verified:

- `dependency-graph.md`: every table re-derived from `grep` of every `import` in `src/cli`. New "Command -> Store Imports" section; new type-only cross-layer edge table (4 edges, previously 1 documented); Operations -> Lib map corrected on 13 of 17 rows; observation 12 replaced with a verified four-row table; `utils/terminal.ts` section rewritten for its two new exports and third consumer. New observation 16 records the row-versus-edge failure mode at the point of use.
- `boundary-map.md`: section 1.1 corrected to seven `baseFlags = {}` overrides; section 1.3 gained `eject`'s enum-constrained positional arg and the four missing override annotations; a precedence note added stating that `commands/index.md` is canonical for signatures and wins on conflict.
- Removed the restated Zod schema count from `boundary-map.md`'s Key Files table per the count-ownership registry. Cross-checked anyway: 35 in source, 35 in `types/zod-schemas.md` — the two surfaces agreed, so the duplication was the whole defect. This is the second surface found restating that particular count.

Neither doc was fully re-stamped. Both carry a dated PARTIAL annotation naming exactly which sections were verified and which still carry their 2026-07-30 date.

## Proposed Standard

For `.ai-docs/standards/documentation-bible.md`, extending the existing "Heading Diff" section rather than creating a new one — the reasoning is already written there and only the granularity is wrong.

1. **Extend Heading Diff to Edge Diff.** For any doc whose atomic unit is a relationship rather than a section (`dependency-graph.md` is the only current one), the sweep MUST derive the full relation from source and diff it **in both directions**:
   - every source edge has a documented row (catches missing rows), and
   - every documented row has a source edge (catches phantom rows).

   One direction alone is not a validation. A row-first pass cannot see an absence; an edge-first pass cannot see a phantom.

2. **A dead-code-removal release is a mandatory re-validation trigger for `dependency-graph.md`.** Add it to "Re-Validation Triggers (Beyond Calendar Cadence)". Removing an import is invisible in a feature changelog — 0.147.1 filed it under "Changed / Dead code removed from production" — while being the single highest-impact event for a doc made of imports. The existing triggers are all additive (a finding names the doc; a task touches a referenced file); none fires on a deletion.

3. **Name symbols, not just modules, when the module exports near-synonyms.** A row reading `lib/loading/ (loadAllAgents)` is worse than `lib/loading/` alone, because it is confidently wrong about a symbol that exists. Where a barrel exports several similar functions, the doc must state which one and why — `dependency-graph.md` now carries a `loadAllAgents` vs `loadMergedAgents` callout naming the behavioural consequence of picking wrong.

4. **A negative or exhaustive claim carries its verification inline or is not written.** "Currently none do", "exactly one place", "the only size gate" and "three commands override" were all true when written and all false when read. Each now either states the grep that established it and when, or has been rewritten as a positive enumeration. This belongs beside the "Exhaustive Enumeration over Glob Shorthand" rule, which addresses the same failure from the opposite side.

5. **When two docs cover the same surface, name which is canonical inside both.** `boundary-map.md` section 1.3 and `commands/index.md` both listed per-command flags; they disagreed for two releases and nothing compared them. The fix is not to delete one — the boundary map genuinely needs to place oclif parsing on the map — but to state precedence in the derived doc so a reader who hits the conflict resolves it correctly, and so the next sweep knows which file to correct.
