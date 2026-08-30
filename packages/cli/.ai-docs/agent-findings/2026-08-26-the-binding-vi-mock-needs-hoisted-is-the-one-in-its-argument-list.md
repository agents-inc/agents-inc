---
type: anti-pattern
severity: high
affected_files:
  - packages/compile/src/node-free.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-26
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: missing-rule
status: resolved
resolved_by: >-
  `record` wrapped in `vi.hoisted` in `packages/compile/src/node-free.test.ts`, with a docblock
  naming the temporal dead zone and the zero-collection consequence. The file now collects its
  one test, and the gate was demonstrated to fail on a transitive node reach before the probe
  was removed.
---

## What Was Wrong

`packages/compile/src/node-free.test.ts` is the only mechanical check that the package is
browser-safe, and the only one that can catch a **transitive** node builtin — a builtin reached
by something the package imports is just as fatal in a browser and invisible to any grep of the
package's own text. It never ran.

```
 ❯ src/node-free.test.ts (0 test)

 FAIL  src/node-free.test.ts [ src/node-free.test.ts ]
ReferenceError: Cannot access 'record' before initialization
 ❯ src/node-free.test.ts:30:20
     30| vi.mock("node:fs", record("node:fs"))
       |                    ^
```

The file declared two mutually-referencing bindings and hoisted **the wrong one**:

<!-- packages/compile source, quoted verbatim: that package formats WITHOUT semicolons and this
     file lives under packages/cli, which formats WITH them, so leaving prettier to the block would
     rewrite the quotation into something that no longer matches the file it cites — and the
     alignment of the two trailing comments is the whole point of the quotation. -->
<!-- prettier-ignore -->
```ts
const trap = vi.hoisted(() => ({ reached: [] as string[] }))   // hoisted, and did not need to be

const record = (name: string) => () => {                        // not hoisted, and had to be
  trap.reached.push(name)
  return {}
}

vi.mock("node:fs", record("node:fs"))
```

The rule that decides it is not "anything a `vi.mock` line touches": **it is whether the binding
is evaluated in the `vi.mock(...)` CALL or read inside the factory it returns.**

- `record("node:fs")` is an argument. It is evaluated at the moment `vi.mock` runs, which vitest
  hoists above every `const` in the file — so `record` is dereferenced in its temporal dead zone
  and the module throws before a single `it` is registered.
- `trap` is read only by the innermost closure, which runs when a mocked module is actually
  imported — long after every `const` in the file has initialised. It never needed `vi.hoisted`
  at all.

So the author applied the mechanism, and applied it to exactly the binding that did not need it.
That is what makes this worth filing rather than a typo: the two bindings sit on adjacent lines,
one carries the ceremony and one does not, and the one carrying it is the safe one.

**What the failure costs is not visibility — it is meaning.** This run is red and CI would have
caught it (`.github/workflows/ci.yml` runs `bun run test --filter='!agents-inc'`, which reaches
this workspace). What a reader cannot see from `1 failed` is that the file contributed **zero**
assertions about its subject: the package's browser-safety was unverified for as long as the
error stood, and a suite total quoted as a baseline moves by the whole file's worth of tests
without anything saying so. A gate whose entire value is one assertion is worth nothing at all
when it dies at collection, and it looks identical to a gate that is merely broken.

## Fix Applied

`record` wrapped in `vi.hoisted`, with a docblock stating which of the two bindings needs it and
why. The suite now collects: `3 files, 8 tests passed` in `packages/compile`, against
`3 files, 1 failed, 7 passed` with `src/node-free.test.ts (0 test)` before.

**Then proved it can fail, because a gate that passes and cannot fail is worth nothing either.**
A transitive node reach was introduced into `src/string.ts` — a module imported by
`config-types-source.ts`, so it is reached only through an entry point and not by the entry point
itself — and removed afterwards; `src/string.ts` is byte-identical to before
(`sha256 52f5ff2c…`). Both probe shapes redden the gate, and they do **not** redden it the same
way:

```
// import "node:path"  — side-effect only
AssertionError: a node builtin anywhere in this package is a browser failure at import time:
  expected [ 'path' ] to strictly equal []
```

```
// import { sep } from "node:path"  — named import
Error: [vitest] No "sep" export is defined on the "path" mock.
  ❯ src/string.ts:15:22
  ❯ src/index.ts:31:1
```

The second is the shape a real reach almost always takes, and it never reaches the gate's own
assertion: the mock factories return `{}`, so vitest refuses the named export first. The gate
catches it — the run is red and the stack names the offending module and the entry point that
pulled it in — but the message a reader gets talks about a mock rather than about a browser, and
`trap.reached` stays empty. Left as observed rather than changed: the gate's contract is that a
node reach cannot pass, and that holds for both shapes.

## Proposed Standard

Two lines, both narrow, and neither is a checker — the subject is which of two bindings a
hoisting mechanism applies to, which no scan can decide.

**1. State the rule that picks the binding.** Proposed for
`.ai-docs/standards/clean-code-standards.md`, which is where CLAUDE.md already sends readers for
construct-level rules that apply inside test files: _a binding evaluated
in a `vi.mock(...)` argument list must be `vi.hoisted`; a binding merely READ inside the factory
it returns must not be, because the factory runs at import time when everything has initialised.
Hoisting the second while leaving the first is the failure that reports as `(0 test)`._

**2. A new gate's first run must be shown to FAIL.** This one had never been shown to fail,
which is why nobody noticed it had never been shown to pass either. Proposed as a habit rather
than a rule with a checker: when a spec's whole value is a single invariant, introduce a
violation, watch the red, remove it, and confirm the file is byte-identical afterwards. It is
adjacent to the existing rule in `CLAUDE.md` — _"a test that has never failed has not been shown
to test anything"_, which is stated there about the tests-first workflow and reads as being about
ordering; this is the same sentence about a gate that was written after the fact, where there is
no red phase unless somebody manufactures one.

Checked against `CLAUDE.md` before proposing: neither half conflicts with a NEVER/ALWAYS rule.
The second is a widening of a rule already on the page rather than a new one.

**Census, and it is a census rather than a sample.** Every `vi.mock` in the two projects whose
argument list evaluates a locally-declared binding:

```
grep -rn 'vi\.mock([^)]*,' packages/cli/src packages/cli/e2e packages/cli/scripts \
  packages/compile/src packages/matrix/src apps/editor/src \
  --include='*.ts' --include='*.tsx' | grep -v '/generated/' \
  | grep -vE ',\s*(async\b|\(\s*\)|function\b|\{)'
```

The first grep narrows to `vi.mock` calls that pass a factory at all — a single-argument
`vi.mock("x")` has no expression to evaluate and cannot reach a dead zone. The second drops the
ones whose factory is written inline as an arrow, an `async` arrow or an object literal, which is
every safe form. Thirteen hits, all thirteen in `packages/compile/src/node-free.test.ts` and all
thirteen repaired; the wider first grep returns 95 lines across all six trees, so the filter is doing
the work rather than the scope. Note the exclusion of `**/generated/**`: `packages/compile/src/generated/corpus.ts`
vendors sub-agent prompt text that contains the literal string `vi.mock(` inside a Markdown code
fence, and an unfiltered scan reports it as a hit in a file nobody may edit by hand.

**Related and deliberately not merged:**
`2026-08-26-a-vitest-workspace-that-collects-only-stories-swallows-a-unit-test.md` is the
WORKSPACE-level version of "a test that was never collected" — there the run is green and the
file is absent from the output entirely. Here the file is named in the output with `(0 test)`
beside it and the run is red. The two have different tells and different fixes; filing them as
one would lose the tell that identifies each.
