---
type: standard-gap
severity: medium
affected_files:
  - e2e/commands/compile-corrupt-config.e2e.test.ts
  - e2e/commands/compile-project-scope-containment.e2e.test.ts
  - e2e/commands/compile-prunes-stale-agents.e2e.test.ts
  - e2e/commands/eject-home-config-pair.e2e.test.ts
  - e2e/commands/eject-preserves-exclusive-stack.e2e.test.ts
  - e2e/commands/eject.e2e.test.ts
  - e2e/commands/plugin-build-versioning.e2e.test.ts
  - e2e/interactive/confirm-step-mode-change-indicator.e2e.test.ts
  - e2e/interactive/edit-wizard-completion.e2e.test.ts
  - e2e/interactive/edit-wizard-dual-scope-indicator.e2e.test.ts
  - e2e/interactive/edit-wizard-excluded-skills.e2e.test.ts
  - e2e/interactive/edit-wizard-pending-removal-row.e2e.test.ts
  - e2e/interactive/info-panel-scope-toggle-diff.e2e.test.ts
  - e2e/interactive/sources-overflow-pending-removal.e2e.test.ts
  - e2e/interactive/wizard-overflow-affordance.e2e.test.ts
  - e2e/lifecycle/agent-scope-toggle-agents-array.e2e.test.ts
  - e2e/lifecycle/config-scope-integrity.e2e.test.ts
  - e2e/lifecycle/dual-scope-collapse-and-restore-via-s.e2e.test.ts
  - e2e/lifecycle/dual-scope-s-round-trip-space-inert.e2e.test.ts
  - e2e/lifecycle/dual-scope-same-source-eject.e2e.test.ts
  - e2e/lifecycle/dual-scope-same-source-plugin.e2e.test.ts
  - e2e/lifecycle/edit-global-source-toggle-propagation-compiled-ref.e2e.test.ts
  - e2e/lifecycle/edit-remove-last-skill-stack-cleanup.e2e.test.ts
  - e2e/lifecycle/edit-remove-one-of-many-skills-stack-cleanup.e2e.test.ts
  - e2e/lifecycle/global-agent-toggle-guard.e2e.test.ts
  - e2e/lifecycle/global-blank-config-overinstalls-agents.e2e.test.ts
  - e2e/lifecycle/global-install-tombstones-project-owned.e2e.test.ts
  - e2e/lifecycle/init-global-preselection-confirm.e2e.test.ts
  - e2e/lifecycle/mixed-mode-skill-ref-format.e2e.test.ts
  - e2e/lifecycle/plugin-install-failure-hard-error.e2e.test.ts
  - e2e/lifecycle/project-edit-fresh-pick-scope-override.e2e.test.ts
  - e2e/lifecycle/project-edit-removes-project-half-of-pair.e2e.test.ts
  - e2e/lifecycle/scope-change-deselect-integrity.e2e.test.ts
  - e2e/lifecycle/stack-per-agent-curation.e2e.test.ts
  - e2e/lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts
  - e2e/matchers/project-matchers.e2e.test.ts
  - e2e/smoke/pom-framework.e2e.test.ts
  - scripts/check-finding-citations.test.ts
  - scripts/check-shared-eslint-config.test.ts
  - scripts/generate-matrix-package.test.ts
  - src/cli/lib/__tests__/commands/eject.test.ts
  - src/cli/lib/__tests__/config-gate-enforcement.test.ts
  - src/cli/lib/__tests__/spec-filenames.test.ts
  - src/cli/lib/configuration/__tests__/config-readers-agree.test.ts
  - src/cli/lib/configuration/config-generator.test.ts
  - src/cli/lib/configuration/config.test.ts
  - src/cli/lib/loading/source-fetcher.test.ts
  - src/cli/lib/loading/source-loader.test.ts
  - src/cli/lib/matrix/matrix-resolver.test.ts
  - src/cli/utils/exec.test.ts
  - src/cli/utils/messages.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-21
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  The five files CLI-560 names are clean (15 lines removed, meaning preserved at every site) and
  the filename half is already gated by src/cli/lib/__tests__/spec-filenames.test.ts. What has not
  moved is the inline-comment half, which is the whole of the remaining breach and belongs to
  CLI-547 — censused below at 82 recogniser hits across 51 spec files, of which 81 in 50 files are
  real, with the command that produces the figure. No content gate can land before that sweep
  clears, because a gate is only a gate on the day it is green.
---

## What Was Wrong

The ban on task IDs in tests is written as an enumeration. CLAUDE.md § Test Data:

> NEVER put TODO/task IDs in test names (`describe()`, `it()`), assertion messages (2nd arg to
> `expect`), or inline test comments.

Its sibling finding — `2026-08-21-the-ban-on-task-ids-in-test-names-stops-at-the-filename` —
established why the enumeration has exactly those three members, and the reasoning is worth
quoting because this finding is where it breaks:

> A `describe` string, an `it` string and an assertion message are all string LITERALS in a syntax
> tree, which a `no-restricted-syntax` selector can match — and that is how the three enumerated
> locations came to be the three.

That accounts for two of the three. **An inline comment is not a string literal in a syntax tree
either.** `no-restricted-syntax` registers each configured selector as a **visitor key** on the
traversal (`node_modules/eslint/lib/rules/no-restricted-syntax.js`, `create()` returns
`{ [selector](node) { … } }`), so it fires only on nodes the linter walks. Comments are not walked
— they are attached trivia, reachable only through `sourceCode.getAllComments()`. So of the three
locations the rule enumerates, **two are selector-reachable and one is exactly as unreachable as
the filename the sibling finding was written about.**

The consequence is visible in the tree and it splits cleanly along that line. The two enforceable
members are clean; the unenforceable one holds every remaining breach.

Both figures come from one recogniser — the `TRACKER_ID_RUN` shape already in
`spec-filenames.test.ts`, applied to file CONTENT instead of to basenames, with the digit run
narrowed to `{2,4}` so the single-digit `D-1` … `D-7` E2E phase labels are left alone. `todo/cli.md`
-> CLI-574 rules those need no rename, and CLI-547 independently records that a `[A-Z]{1,4}-[0-9]{2,4}`
census also matches `SHA-256`, which a stated four-prefix roster does not.

Titles — the reachable half — over every spec the package holds:

```
node -e '
const fg=require("fast-glob"),{readFileSync}=require("fs");
const RUN=/(^|[^a-z0-9])(cli|d|p4|skills)-?\d{2,4}([^a-z0-9]|$)/i, T=/^\s*(describe|it|test)(\.\w+)*\s*\(/;
let n=0; for (const f of fg.sync(["src/**/*.test.ts","src/**/*.test.tsx","e2e/**/*.test.ts","scripts/**/*.test.ts"]))
  for (const l of readFileSync(f,"utf8").split("\n")) if (T.test(l)&&RUN.test(l)) { n++; console.log(f, l.trim()); }
console.log("title hits:", n);'
```

`title hits: 0` on 2026-08-21, over 432 specs.

Comments and other body text — the unreachable half — is the same script with the `T.test(l)` clause
dropped: **82 hits across 51 files** on 2026-08-21, after CLI-560's five files were cleared. It was
97 across 56 before them. Exactly one of the 82 is a false positive — see the third design
constraint below — so the real figure is **81 across 50**.

**The half of the rule a tool could hold is the half nobody breaks.** That is not a coincidence and
it is the durable point: the enumeration reads as one rule with three members, so the two that are
mechanically enforced make the third look enforced too, and a breach in it is invisible to the same
reader who would never write one in an `it` name.

## Fix Applied

CLI-560's five files only — `lib/resolver.test.ts`, `lib/installation/local-installer.test.ts`,
`lib/configuration/config-merger.test.ts`,
`lib/config-gate/__tests__/write-project-partial.test.ts` and `stores/wizard-store.test.ts`. Fifteen
lines, meaning preserved at every site rather than the sentence deleted: `Since D-309 no pair-writer
… mints the privilege` became `No pair-writer … mints the privilege`, `Per D-221 semantics,
newConfig is authoritative` became `The merge treats newConfig as authoritative`, and
`D-217: installMode is gone` became `installMode is gone`. No assertion, name or message moved, and
the five files' 459 tests are unchanged.

**No gate.** The reason is the finding's own subject and is stated rather than deferred silently:
see below.

## Proposed Standard

**One: correct the enumeration's stated reason, in both places the rule is written.** The sibling
finding proposes adding the FILENAME to the list because no ESLint selector reaches it. That is
right and incomplete — an inline comment is in the same position, and it is the member that
actually accumulated 82 breaches. The list should say which of its members a tool can hold, because
that is the fact a reader needs in order to know which ones only discipline protects:

> NEVER put TODO/task IDs in a test's `describe()` / `it()` names, in assertion messages, in inline
> test comments, or in the spec's FILENAME. Only the first two are reachable by an ESLint selector
> — they are string literals in the syntax tree. A comment and a filename are not, so those two are
> held by `src/cli/lib/__tests__/spec-filenames.test.ts` and its content-side sibling instead.
> File-level JSDoc is the only permitted location.

**Two: the gate is the same shape as `spec-filenames.test.ts` and it is CLI-547's closing move, not
CLI-560's.** It reads each spec's content with the same recogniser, and it cannot land at 82
breaches — a gate that is red on the day it is written gets an exclusion list, and an exclusion list
is the snapshot-of-a-moment this whole class is about. Two design constraints, both measured while
writing this:

- **The digit run must be `{2,4}`, not `{1,4}`.** A `{1,4}` recogniser condemns the 59 `D-1` … `D-7`
  E2E phase labels that CLI-574 rules need no rename, plus `agent-recompiler.test.ts`'s
  `(D7 cross-scope safety)`. That single decision moves the census from 157 lines to 97.
- **It would condemn `spec-filenames.test.ts` itself** — 8 of the pre-sweep 97 lines are that file's
  own `NAMES_A_TASK` fixtures, which are the discriminating cases that make it a real gate rather
  than a recogniser answering `false` to everything. Excluding the file by path is the weak form:
  anything can be moved into an exclusion. The honest form is to compose those fixtures from
  `TRACKER_ID_PREFIXES` and a number so no literal ID is written, keeping the subject guard intact.
- **A four-digit run that is a plausible YEAR must be excluded.** `skills-2026` inside the plan slug
  `"custom-skills-2026-08-06-investigation"` (`scripts/check-finding-citations.test.ts`) satisfies
  `skills-\d{2,4}` and is the one false positive in the 82. This constraint has no filename-side
  twin, which is why `spec-filenames.test.ts` did not need it: a spec BASENAME never carries a date,
  while a spec BODY quotes finding slugs and dated plan paths routinely, and every one of those
  opens with a prefix letter followed by a year.

**Three, and the reason no interim ESLint rule was written:** `no-warning-comments` is the only
core rule that reads comments, and its schema takes `terms` as `{ type: "array", items: { type:
"string" } }` — literal terms, no pattern (verified against the installed eslint 10.8.0, in
`node_modules/eslint/lib/rules/no-warning-comments.js`). Expressing `CLI-\d+` in it means
enumerating every ticket ever issued, which is the `todo/`-derived roster `spec-filenames.test.ts`
already rejects: `todo/` sits above this package and does not ship with it, so a roster read from
there answers clean in a published checkout for the reason that it cannot see anything. A custom
rule reading `sourceCode.getAllComments()` would work and is a second implementation of a
recogniser that already exists in a spec — the spec is the cheaper home while the two must agree.
