---
type: missing-standard
severity: low
affected_files:
  - src/cli/commands/build/marketplace.ts
  - src/cli/commands/build/plugins.ts
  - src/cli/commands/compile.ts
  - src/cli/commands/doctor.ts
  - src/cli/commands/eject.ts
  - src/cli/lib/agents/agent-plugin-compiler.ts
  - src/cli/lib/agents/agent-recompiler.ts
  - src/cli/lib/content-validator.ts
  - src/cli/lib/hosts/claude-project-trust.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/loading/multi-source-loader.ts
  - src/cli/lib/loading/source-loader.ts
  - src/cli/lib/operations/skills/discover-skills.ts
  - src/cli/lib/plugins/plugin-settings.ts
  - src/cli/lib/skills/local-skill-loader.ts
  - src/cli/lib/skills/skill-plugin-compiler.ts
  - src/cli/lib/stacks/stacks-loader.ts
  - src/cli/stores/wizard-store.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-10-03
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  The code half landed for the install report and the lines in utils/messages.ts, commands/init.tsx
  and commands/edit.tsx, through one shared plural() in utils/string.ts. The census below still
  finds the class in the other commands, and no standard says how a count line is written or
  asserted.
---

## What Was Wrong

Every count line in the install report wrote its noun in the plural whatever the count, so an
install of one printed `Selected 1 skills`, `Copied 1 skills to …`, `Configuration saved (1 agents)`,
`Compiled 1 agents`, `Copied 1 local skills`, `Installed 1 skill plugins`. The recompile summaries
did the same (`1 agents rewritten`, `Recompiled agents in 1 registered projects`).

Two things kept it alive, and both are about tests rather than the product:

- **The singular is a substring of the plural.** `Selected 1 skill`, `Compiled 1 agent` and
  `Installed 1 skill plugin` are each contained in the defective line. A positive assertion on the
  correct singular is satisfied by the bug, so it cannot fail on it. Only a pair can: the singular
  positively, and the plural for the same count negatively. A trailing delimiter also works where
  the line has one, for example `Configuration saved (1 agent)` or `… 1 registered project,`.
- **The text mirrors pinned the defect as the expected value.** `STEP_TEXT.PROPAGATED_RECOMPILE_ONE`
  read `Recompiled agents in 1 registered projects`, `STEP_TEXT.COMPILED_WITH_FAILURES` read
  `agents (1 failed)`, and a `compile.test.ts` regex and the `edit-plugin-banner-parity` regex
  required the plural. A mirror is meant to hold the product string byte for byte, and these did.
  So the defect was recorded as a requirement in four places, and fixing it reddened each one.

`doctor.ts` already had the right helper, `plural(count, word)`, private to that file. Elsewhere,
lines either pluralised unconditionally or open-coded a `count === 1 ?` ternary, as
`claude-project-trust.ts` and `wizard-store.ts` do.

## Fix Applied

- `plural(count, noun)` moved from `commands/doctor.ts` to `utils/string.ts`, exported, and tested
  in `string.test.ts`. `doctor.ts` imports it, so there is one definition.
- These now go through it. In `utils/messages.ts`: `pluginsInstalled`, `recompileSummary`, whose
  `subject` is now given in the singular by `edit.tsx` and `compile.ts`, and
  `propagatedRecompileSummary`. In `commands/init.tsx`: the plan, save, compile and copy lines. In
  `commands/edit.tsx`: the two startup counts.
- Each singular is pinned from both sides in `utils/messages.test.ts` and
  `e2e/commands/init-from-scenarios-install.e2e.test.ts`. The two mirrors were re-spelled to strings
  that are not substrings of the plural form.

**The class, as a census:**

```
grep -rnE '\$\{[^}]*(length|[cC]ount|total\w*|size)[^}]*\}( [a-zA-Z-]+)? (skills|agents|plugins|sub-agents|projects|files|marketplaces|stacks|categories)\b' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v __tests__
```

After the fix this finds 32 hits in 18 files, which are the `affected_files` above. It is a census
of this pattern, and the pattern misses a count with a noun it does not list.

- **False positives (2):** `claude-project-trust.ts` and `wizard-store.ts`. Both already branch on
  `count === 1`.
- **Verbose-only:** several hits print only under `--verbose`, for example `multi-source-loader.ts`,
  `stacks-loader.ts`, `agent-recompiler.ts` and `plugin-settings.ts`.
- **Visible to the user, and left alone:** they are outside the install report this pass owned.
  `build plugins` (`Compiled N skill plugins`, `Compiled N agent plugins`, and the
  `skill-plugin-compiler` / `agent-plugin-compiler` listings), `build marketplace` (two),
  `compile`'s `Discovered N … skills` (three), `eject` (`N skills ejected to …`),
  `content-validator`, and `doctor`'s four `x/y … skills` ratios.

`skill-plugin-compiler.test.ts` and `build-agent-plugins.e2e.test.ts` assert
`Compiled 1 skill plugins` and `Compiled 1 agent plugins` literally. They pin the defect in the
same way the four sites above did.

The many `(s)` lines (`skill(s)`, `sub-agent(s)`, `failure(s)`) are hedged rather than wrong, and
were not counted.

## Proposed Standard

For `clean-code-standards.md`, beside the other message rules:

> **A count line takes its noun through `plural()` from `utils/string.ts`.** Never write
> `` `${n} skills` ``. Hedging with `(s)` is acceptable, but a bare plural is wrong once in every
> count of one.

For `standards/e2e/assertions.md`:

> **A singular count is asserted from both sides, or with a delimiter that ends the noun.**
> `toContain("Compiled 1 agent")` passes over `Compiled 1 agents`. Pair it with
> `not.toContain("Compiled 1 agents")`, or anchor on the next character (`(1 agent)`,
> `1 registered project,`).

This agrees with the existing mirror rule, which keeps the literal in `e2e/pages/constants.ts`
rather than importing the product's constant. The mirror still holds the product's text. The rule
adds only that a mirror for a count of one must not be a substring of the defective form. I checked
both proposals against CLAUDE.md's NEVER/ALWAYS rules and found no conflict.
