---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/src/agents/tester/cli-tester/playbook.md
  - packages/cli/src/agents/tester/cli-tester/output.md
  - packages/cli/src/agents/tester/cli-tester/critical-requirements.md
  - packages/cli/src/agents/tester/cli-tester/critical-reminders.md
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-08-07
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

Turning on `@typescript-eslint/await-thenable` reported 90 violations in `packages/cli`, and all 90
were the same expression: `await stdin.write(…)` in Ink component specs.
`ink-testing-library`'s `stdin.write` is synchronous — the `await` buys one microtask tick and
nothing else. Every one of the 90 was immediately followed by `await delay(…)`, a real timer, so
the tick was never load-bearing. They were removed and all 177 tests in the five affected spec
files still pass.

The part that makes this a finding rather than a cleanup: **the pattern is taught by four shipped
agent prompts.** `src/agents/tester/cli-tester/` contains `await stdin.write(` in `playbook.md`,
`output.md`, `critical-requirements.md` and `critical-reminders.md`. `src/agents/` ships in the npm
package, so these are product content, not repository notes — the cli-tester agent will keep
writing the pattern into new specs, where the lint rule will now reject it, for every user of the
CLI as well as in this repository.

This is the general shape rather than a one-off: **a lint rule turned on in this repository has no
way to reach the prompts that generate the code it lints.** Ten instances of the expression live
in `.md` files that ESLint does not read.

## Fix Applied

None to the prompts — deliberately. `src/agents/` is user-visible product content and editing it
is a release-carrying change, outside the scope of the lint-enablement task that found this. The
92 occurrences in spec files were fixed; the 10 in the four prompts were left and are recorded
here.

## Proposed Standard

Two things, the second more important than the first.

1. The four `cli-tester` prompt files should drop the `await` from `stdin.write(…)` in their
   examples. One-line change each, no behavioural claim attached.
2. `e2e/README.md` (or whichever standard owns "we changed a rule") should carry a step:
   **when a lint rule is enabled or a convention changed, grep `src/agents/**/*.md` for the
   pattern it now rejects.** The prompts are the upstream of a large share of the code in this
   repository and they are invisible to every gate — no linter, no type-checker and no test reads
   them. A rule the code obeys and the prompt teaches against will be re-violated on the next
   generated file, and the diff will look like the agent's fault.
