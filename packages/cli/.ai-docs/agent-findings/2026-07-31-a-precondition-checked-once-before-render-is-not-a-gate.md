---
type: missing-standard
severity: medium
affected_files:
  - src/cli/base-command.ts
  - src/cli/components/wizard/wizard-layout.tsx
  - src/cli/utils/terminal.ts
  - src/cli/components/hooks/use-terminal-dimensions.ts
standards_docs:
  - .ai-docs/reference/component-patterns.md
  - .ai-docs/reference/features/wizard-flow.md
date: 2026-07-31
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: "Code landed (WizardLayout re-checks MIN_TERMINAL_SIZE on every render; both gates now read one shared predicate and one shared message formatter in src/cli/utils/terminal.ts) and both reference docs record it. The general rule is NOT written anywhere: nothing states that a precondition enforced once before render must be re-enforced by the render whenever the precondition can change under a running session, and nothing states that two gates printing the same user-visible string must share the formatter."
---

## What Was Wrong

`BaseCommand.ensureTerminalSize()` runs exactly once, in `init()`, before Ink mounts. While the
terminal is too small it installs a `stdout.on("resize")` listener; the moment the size becomes
valid it removes the listener and resolves. Nothing re-checks afterwards.

So the gate stopped you **launching** small but not **becoming** small. Reproduced against the real
binary: launch at 30 rows (passes the gate), resize to 16 mid-session, and the build grid paints
straight through the footer —

```
 M D  Labelsor S  Scope)  I  Info
 ──────────────────────────────────────────────────────────────────────
 │ SPACE  selectus ENTER  continuext ESC  backxt │ │ Qwik │ │ Remix │
```

Two properties made this invisible:

1. **The check and the thing it protects live in different lifecycles.** The check is imperative and
   one-shot (command `init()`); the thing it protects is a React tree that re-renders for its whole
   session. A reader of `ensureTerminalSize` sees a loop that waits for a valid size and reasonably
   concludes the size is handled. Nothing in the file hints that the guarantee expires the instant
   it is granted.
2. **The machinery to fix it already existed and was already wired in.** `useTerminalDimensions()`
   subscribes to `stdout.on("resize")` and re-renders, and `WizardLayout` already called it — for
   `rows`, to set its own height. It simply never compared the value to anything. No new watcher was
   needed; the missing code was one comparison on a value already in hand.

A second, quieter defect sat alongside it: the user-visible wording
(`Terminal too short (need 20). Please resize.`) was built inline inside `ensureTerminalSize`. Any
second gate would have re-typed it, and the E2E constants `STEP_TEXT.TOO_NARROW` / `TOO_SHORT` key
off that exact text — so a drifted second copy would be silently unassertable.

## Fix Applied

- Extracted `isTerminalLargeEnough(columns, rows)` and `formatTerminalTooSmallMessage(columns)` into
  `src/cli/utils/terminal.ts`, beside the existing `clearTerminalScreen`. Both gates call both.
  `formatTerminalTooSmallMessage` documents its precondition (call only when the size check failed;
  width is reported in preference to height, which is why height is not a parameter).
- `WizardLayout` now guards on `useTerminalDimensions()` immediately after its hooks and returns a
  `TerminalTooSmall` block instead of the wizard tree.
- **Replacement, not overlay** — and this is load-bearing. Drawing the message on top of a
  still-mounted wizard does not work: Ink lays the children out at the small size regardless of what
  covers them, so the bleed keeps painting underneath. The comment on `TerminalTooSmall` says so, so
  the next person does not "improve" it into an overlay.
- The startup gate is KEPT. Blocking before Ink mounts is cleaner than mounting a tree in order to
  refuse to draw it. The two are complementary, and `component-patterns.md` now has a
  "Terminal-size gates" table saying which catches what.
- Coverage: `src/cli/components/wizard/wizard-layout.test.tsx` (5 cases, including the exact-minimum
  boundary that `TERMINAL_SIZE.SHORT` sits on) and
  `e2e/interactive/wizard-terminal-resize-guard.e2e.test.ts` (shrink → prompt → grow → install
  completes). Both verified to go red with the guard reverted.

## Proposed Standard

Two rules, both currently unwritten.

**1. A precondition that can change must be enforced where it is consumed, not only where the
process starts.** Belongs in `.ai-docs/standards/clean-code-standards.md`. Suggested wording: _a
check performed once during command startup guarantees the condition at t=0 and nothing after. If
the condition can change while the process runs — terminal size, TTY-ness, config on disk, network
reachability — the surface that depends on it must re-derive it on every render or every use. A
startup check is an optimisation (fail before you build anything), never the enforcement point._
The tell that this rule has been broken is a one-shot listener that is removed on success, as
`ensureTerminalSize` did.

**2. Two surfaces that print the same user-visible string must share one formatter.** Related to,
but distinct from, CLAUDE.md's existing `skillSlotKey` export exemption — that rule is about two
surfaces agreeing on a _lookup key_; this is about them agreeing on _rendered text_. The cost of
drift is specific and worth naming: E2E constants key off rendered text, so a second copy of a
message is a surface with no assertable identity. Suggested home:
`.ai-docs/standards/clean-code-standards.md`, alongside the existing constants rule, phrased as _if
a string appears on screen from two code paths, one of them is a formatter and the other calls it —
extract before the second copy exists, not after._
