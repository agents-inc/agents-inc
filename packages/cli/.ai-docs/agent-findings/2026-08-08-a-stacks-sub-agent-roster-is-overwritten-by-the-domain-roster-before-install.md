---
type: architectural-drift
severity: high
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/components/wizard/wizard.tsx
  - src/cli/components/wizard/stack-selection.tsx
  - src/cli/lib/configuration/default-stacks.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-08-08
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
---

## What Was Wrong

A stack declares WHICH sub-agents an installation gets and what each of them carries. Choosing one
in the wizard does not install that roster.

Measured 2026-08-08 by driving the real binary (0.152.1) through `init` against
`/home/vince/dev/skills`, selecting the first stack (`nextjs-fullstack`) and accepting every
default. `defaultStacks[0].agents` declares twelve sub-agents. Eleven were installed, and they are
not a subset:

- **Declared but absent:** `agent-summoner`, `codex-keeper`, `skill-summoner` — missing from
  `config.agents`, missing from the `config.stack` block the install writes back, and with no file
  in `~/.claude/agents/`.
- **Installed but never declared:** `api-tester`, `cli-researcher`.

The installed set is exactly the deduped union of `DOMAIN_AGENTS` for the selected domains
(web ∪ api ∪ cli = 11 names). The stack's own roster leaves no trace anywhere on disk.

The skills half of the same stack is correct: all 23 declared skill ids matched exactly in
`config.skills`, in the rewritten `config.stack`, and as directories under `~/.claude/skills/`. Only
the agent roster diverges — and it diverges silently: `doctor` reports
`Summary: 12 passed, 0 warnings, 0 errors` on the result, because every check it runs reads the
config that was written rather than the stack that was chosen.

### Reproduction

In an empty scratch `HOME`:

```
HOME=<scratch> agents-inc init --source /home/vince/dev/skills
```

Enter on the first stack, Enter on the domain step, Enter through the build grid, Enter on Sources,
Enter on Agents, Enter on Confirm. Then compare `ls $HOME/.claude/agents` against
`Object.keys(defaultStacks[0].agents)`.

### Code in the path

- `preselectAgentsFromStack` (`src/cli/stores/wizard-store.ts`), called by `stack-selection.tsx`
  when a stack is picked. It merges the stack's names with any saved global preselections and
  writes `selectedAgents`.
- `preselectAgentsFromDomains` (same store). It writes `selectedAgents` to the deduped union of
  `DOMAIN_AGENTS[domain]` for the selected domains — an outright assignment, not a merge.
- `DOMAIN_AGENTS` (same store), the per-domain roster constant.
- The Sources step's `onContinue` in `src/cli/components/wizard/wizard.tsx`, which calls
  `store.preselectAgentsFromDomains()` whenever `initialAgents` is empty — which is every fresh
  `init`.

### Suspected underlying cause

Two preselect paths write the same store field and the domain-derived one always runs later in the
step order, so on a fresh install the stack's roster is computed at the stack step and then
discarded at the Sources step. Nothing downstream can notice, because from the Agents step onward
the only roster in existence is the domain one.

## Fix Applied

Owner ruling 2026-08-08: "Agents declared in the stack need to be the ones installed." The stack's
list wins outright; domain derivation serves from-scratch flows only.

`preselectAgentsFromDomains` (`src/cli/stores/wizard-store.ts`) now opens with a guard: with
`selectedStackId` set it returns the state untouched. The two preselect paths no longer write the
same field in competition — the domain one is the path taken when nothing has declared a roster.
The Sources step's call site is unchanged, and so is the user's freedom to edit the roster in the
agents step: the stack decides what it starts as, not what it stays as.

`default-stacks.ts` now says so at the top, answering the question its header used to leave open:
the `agents` keys are binding.

Verified by hand against the real binary (0.152.1 + fix) with `HOME` on a throwaway directory and
`--source /home/vince/dev/skills`: the agents step reads `Continue with 12 agent(s)` with
`agent-summoner`, `skill-summoner` and `codex-keeper` checked and `api-tester` / `cli-researcher`
clear, and `$HOME/.claude/agents` ends with exactly the twelve `.md` files
`Object.keys(defaultStacks[0].agents)` names.

## Proposed Standard

The second half of this section — the `default-stacks.ts` doc hook — is now in the file. The first
half is still proposed, and now has three tests standing behind it:

1. `.ai-docs/standards/e2e/README.md`, under "Critical Rules", alongside the existing
   state-change-verification rule:

   > A test that selects a stack MUST assert the installed sub-agent roster by NAME against the
   > stack's own `agents` keys, not by count and not against a hand-written list. The stack
   > definition is the contract the selection claims to honour; a roster the test spells out
   > separately can agree with the code while both disagree with the stack.

   The three tests written for this fix are what the rule would look like applied:

   - `src/cli/lib/__tests__/integration/stack-agent-roster.integration.test.ts` — every built-in
     stack, replayed through the real store in wizard order and taken to the config generator,
     asserting `config.agents` equals the stack's own keys and that no undeclared sub-agent reaches
     `config.stack`. This is the always-on barrier, and it is the one that covers the
     declared-but-absent half for `nextjs-fullstack` on every run.
   - `e2e/interactive/init-wizard-stack-roster.e2e.test.ts` — the real binary, the fixture stack,
     the whole installed roster compared as a set against `E2E_STACK_AGENTS` (derived from the
     fixture stack object, not re-typed) in the config and on disk.
   - `e2e/interactive/real-marketplace.e2e.test.ts` — the literal `nextjs-fullstack` against the
     local skills clone, asserted against `Object.keys(defaultStacks[0].agents)`. Skipped where
     that clone is absent, which is why it is the exemplar rather than the barrier.

2. `e2e/lifecycle/global-scope-install-reporting.e2e.test.ts` held the defect as its expected value:
   a hand-written eight-name `COMPILED_AGENT_NAMES` with a docstring explaining that a stack install
   compiles the domain union. It now reads the roster off the stack. Two comment blocks in
   `e2e/lifecycle/global-agent-propagation-type-consistency.e2e.test.ts` described the same thing as
   fact and were rewritten; their assertions were already scoped to one agent's absence and did not
   move.
