---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/scripts/check-enumeration-drift.ts
  - packages/cli/scripts/check-boundary-union-casts.test.ts
  - packages/cli/scripts/check-spec-name-vocabulary.ts
  - packages/cli/src/cli/lib/__tests__/config-gate-enforcement.test.ts
  - packages/cli/src/cli/lib/__tests__/tested-exports-reach-production.test.ts
  - packages/cli/src/cli/lib/configuration/__tests__/config-types-writer.test.ts
  - packages/cli/eslint.config.js
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-26
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: open
---

## What happened

Extracting the config-pair and compiled-agent renderers into `@workspace/compile` left every CLI
module that had held them as a **re-export facade** — `config-writer.ts`, `config-types-writer.ts`,
`config-generator.ts`, `scope-predicates.ts`, `seed-to-wizard.ts`, `utils/string.ts` and the pure
half of `consts.ts`. Every call site kept working, `tsc` stayed green and `eslint` stayed green.

**Seven separate repository gates went red, and each named a different subject.** None of them
mentions "moved to another package"; each reports its own local symptom, so a reader repairing them
one at a time never sees that they are one change:

| Gate                              | What it said                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `check-enumeration-drift`         | `names a symbol that enumerates nothing` — `exports: "function"` reads DECLARATIONS, and a facade declares none              |
| `check-enumeration-drift`         | `names a symbol its source file does not export` — `STANDARD_FILES` / `STANDARD_DIRS` / `DIRS` are re-exported, not declared |
| `check-boundary-union-casts`      | a `DECLARED_BACKLOG` entry stopped offending, because the casts left with the code                                           |
| `check-spec-name-vocabulary`      | a spec name cites `DOMAIN_ORDER`, which no non-spec module of this package holds any more                                    |
| `config-gate-enforcement`         | the write-privileged zone and the gate-private-import allowlist both named the module the writes left                        |
| `tested-exports-reach-production` | `getGlobalConfigImportPath` lost its last production caller when the value became a parameter                                |
| `eslint.config.js`                | the `no-restricted-imports` ban and the enforcement-guard exemption both key on a path                                       |

## The class

**A gate keyed on a module's PATH is keyed on where a symbol is declared, not on where it is read
from.** A facade preserves the read and moves the declaration, so it is precisely the change that
separates the two — and there is no gate over the gates. `reportUnusedDisableDirectives` cannot see
an import ban that matches nothing, and a documentation row bound to a file that now declares
nothing fails with a message about the DOCUMENT rather than about the move.

The one that would have failed silently is the ESLint ban: `CONFIG_WRITER_IMPORTS` matched
`**/config-writer`, the renderer moved to `@workspace/compile/config-source`, and the rule would
have kept sitting in the config looking exactly as it did the day it worked. The phase spec caught
that one by name; nothing caught the other six in advance.

## What would catch it

Nothing does today, and that is the finding. Three candidates, none implemented here:

- **A census habit rather than a checker.** Before landing a facade, run the path through every
  gate that could name it:
  `grep -rn "<module-path>" packages/cli/scripts packages/cli/eslint.config.js packages/cli/src/cli/lib/__tests__ --include='*.ts' --include='*.js'`
  That command finds all seven above. It is cheap, it is exact, and it belongs in
  `briefing.md` beside "name the files each lane owns".
- **A `reexports: "every-name"` source shape already exists** in `check-enumeration-drift.ts` and
  is the right binding for a PURE facade. It does not help a MIXED module — one that re-exports
  some names and declares others — which is why `config-types-io.ts` was split out: making the
  facade pure is what let its documentation row bind again. That is a real design pressure worth
  stating: **a module that is half facade and half implementation is unbindable by either shape.**
- **Not a lint rule.** The gates are heterogeneous — a docs binder, a source scanner, two roster
  specs and two ESLint zones — and what they share is a path string, not a construct.

## Scope

Observed once, across one extraction, in seven places. Filed as a standard gap rather than an
anti-pattern: nothing here was written wrongly, and every gate did its job. What is missing is the
step that says a facade obliges a census of everything keyed on the path it leaves behind.
