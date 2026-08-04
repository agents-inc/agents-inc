---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/consts.ts
  - src/cli/base-command.ts
  - e2e/pages/constants.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/reference/utilities.md
  - .ai-docs/reference/component-patterns.md
date: 2026-07-31
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: "Code landed (MIN_TERMINAL_SIZE is the single gate, the dead SCROLL_VIEWPORT.MIN_TERMINAL_HEIGHT is deleted, TERMINAL_SIZE.SHORT raised to match); the standard is pending — nothing states that a named constant with zero importers is a defect rather than spare capacity, and nothing records that the E2E harness's SHORT geometry is coupled to a production constant it is forbidden to import."
---

## What Was Wrong

The minimum terminal height the CLI enforces was declared **twice**, and the two declarations had
never been connected to each other:

| Declaration                                                                                               | Value   | Reality                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `SCROLL_VIEWPORT.MIN_TERMINAL_HEIGHT` in `src/cli/consts.ts`                                              | 15      | **Dead.** It occurred exactly once in all of `src/` — its own definition. No importer, ever. |
| `const MIN_WIDTH = 80; const MIN_HEIGHT = 15;` inside `ensureTerminalSize()` in `src/cli/base-command.ts` | 80 / 15 | **The gate that actually runs.**                                                             |

Two failure modes at once, and they conceal each other:

1. **A named constant nobody reads.** Its doc comment (`"Minimum terminal height to show the wizard
at all"`) is a true statement about a value the program never consults. It reads authoritative in
   `grep`, in the reference docs (both `utilities.md` and `component-patterns.md` listed it) and in
   the session log that raised the whole question — which cited `SCROLL_VIEWPORT.MIN_TERMINAL_HEIGHT`
   as "the wizard's advertised minimum" while the binary was enforcing a local literal.
2. **Magic numbers in the live path.** `MIN_WIDTH`/`MIN_HEIGHT` are exactly what CLAUDE.md's
   "no magic numbers — use constants from `consts.ts`" rule bans, and they had survived because a
   constant with the right _name_ already existed elsewhere. The dead constant made the violation
   look already-fixed.

The value was also wrong. Driven against the real binary on the build step — the binding constraint,
being the tallest step — 15, 16 and 17 rows render corrupt (overlapping card borders, unreadable);
18 is the first clean render; 20 is clean with a full category card plus the next heading. So the
gate was admitting three heights at which the wizard is unusable, and the number that would have
been fixed if anyone had touched the "official" constant was the same wrong one.

**The ripple nobody would have predicted from the code.** `TERMINAL_SIZE.SHORT` in
`e2e/pages/constants.ts` was `{ rows: 16, cols: 100 }`, chosen as "the smallest viewport that still
clears the size gate". Raising the gate to 20 without raising `SHORT` does not fail those specs — it
makes every one of them sit on `Terminal too short. Please resize.` and **hang until its timeout**.
A silent coupling between a production constant and a test constant that is contractually forbidden
to import it (`e2e/pages/constants.ts` opens with "NO imports from src/cli/").

## Fix Applied

- New `MIN_TERMINAL_SIZE` (`COLS: 80`, `ROWS: 20`) in `consts.ts`, read by
  `BaseCommand.ensureTerminalSize` for both dimensions. Its JSDoc names it as the only size gate in
  the CLI and records the full measurement table, so the number cannot be "tidied" later by someone
  who cannot see where 20 came from.
- `SCROLL_VIEWPORT.MIN_TERMINAL_HEIGHT` **deleted**, along with the two reference-doc entries that
  advertised it — the name cannot come back by being copied out of a doc.
- A dead local variable went with it: `ensureTerminalSize` computed a `rows` it never used when
  building its error message.
- `TERMINAL_SIZE.SHORT` raised to `{ rows: 20, cols: 100 }`, with the coupling written into its doc
  comment and into `standards/e2e/README.md`. Every spec using it still overflows at the new height
  and still passes.

## Proposed Standard

For `.ai-docs/standards/clean-code-standards.md`, beside the existing constants rules:

> **A named constant with zero importers is a defect, not spare capacity.** It is worse than the
> magic number it was meant to replace, because it makes the violation look already-fixed: the next
> reader greps the name, finds the definition and the docs, and concludes the value is centralised.
> Before adding a constant, add the call site in the same change. When a constant's value is
> measured rather than chosen, the derivation goes in a comment on the constant — a bare number is
> indistinguishable from a guess and gets rounded to something neater later.

For `.ai-docs/standards/e2e/README.md`, in the terminal-geometry section (added there in this
change, restated here so the rule is findable from the findings directory):

> **`TERMINAL_SIZE.SHORT.rows` must equal `MIN_TERMINAL_SIZE.ROWS`.** `e2e/pages/constants.ts` may
> not import from `src/cli/`, so the coupling is a duplicated value and must be stated in both
> files. Set `SHORT` below the gate and the affected specs **hang** on the resize prompt until
> timeout rather than failing — the most expensive failure mode a suite has. Set it above and those
> specs quietly stop exercising the tightest geometry the wizard claims to support. Changing the
> gate is therefore never a one-file change.
