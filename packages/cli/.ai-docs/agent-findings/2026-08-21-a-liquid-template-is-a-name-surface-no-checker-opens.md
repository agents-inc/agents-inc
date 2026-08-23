---
type: anti-pattern
severity: high
affected_files:
  - src/agents/_templates/agent.liquid
  - src/cli/types/agents.ts
  - src/cli/lib/resolver.ts
  - src/cli/lib/__tests__/user-journeys/edit-recompile.test.ts
  - .ai-docs/reference/features/agent-system.md
  - .ai-docs/reference/features/model-and-effort.md
standards_docs:
  - .ai-docs/reference/features/model-and-effort.md
date: 2026-08-21
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The two lookups were corrected to camelCase in `src/agents/_templates/agent.liquid`, and
  `src/cli/lib/__tests__/agent-template-reads-its-model.test.ts` now holds every `agent.*` lookup
  in every shipped template against the keys of a value typed `Required<AgentConfig>`, so the
  compiler owns the roster the gate checks against. Verified by reintroducing both snake_case
  spellings: the gate fails naming `agent.disallowed_tools` and `agent.permission_mode` by file.
---

## What Was Wrong

`src/agents/_templates/agent.liquid` looked up `agent.permission_mode` and
`agent.disallowed_tools`. `AgentConfig` has always spelled them `permissionMode` and
`disallowedTools`. **Neither field could ever reach a compiled sub-agent**, and nothing anywhere
said so.

The interesting part is not the typo, it is that **a Liquid template is a place where a name can
stop naming anything while every mechanism that normally catches that is inapplicable at once**:

| Mechanism that catches a stale name  | Why it was silent here                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `tsc`                                | A `.liquid` file is a string on disk; the compiler never opens it                                          |
| ESLint                               | `eslint.config.js` covers `.ts`/`.tsx` only — `.liquid` is not linted                                      |
| The engine itself                    | `createLiquidEngine` sets `strictVariables: false`, so the lookup answers `undefined` rather than throwing |
| `scripts/check-enumeration-drift.ts` | Binds a DOCUMENT's list to a source symbol; this is source-against-source                                  |

**The two fields then failed in different directions, and the difference is what kept the tests
green.** `disallowedTools` sits behind `{% if %}`, so a miss deletes the whole line — a loud,
findable absence. `permissionMode` is emitted unconditionally behind a `| default: "default"`
filter, so a miss keeps the KEY and loses only the VALUE. The compiled frontmatter still read
`permissionMode: default`, which is exactly what a correctly-rendered default looks like.

**And a spec was asserting precisely that.**
`lib/__tests__/user-journeys/edit-recompile.test.ts` carries
`expect(frontmatter).toHaveProperty("permissionMode")` inside a test named "should carry the
agent's tools, model and permission mode in the compiled frontmatter". It is green with the bug
and green without it. A presence assertion over a field with a template-level default cannot fail.

**Two documents had faithfully recorded the defect rather than reporting it.**
`reference/features/agent-system.md`'s Template Variables table listed `agent.disallowed_tools`
→ `AgentConfig.disallowedTools` as though the mapping were a design decision, and
`reference/features/model-and-effort.md` described the snake_case reads and warned a future fixer
not to "normalise" `model`/`effort` along with them. Both were accurate about the template and
neither asked whether the template was right — the same shape as the `add` refusal that
`2026-08-18-a-live-command-was-documented-as-deleted-and-nothing-could-have-caught-it` reports.

## Fix Applied

1. **The template**, not the type. The EMITTED key names (`disallowedTools:`, `permissionMode:`)
   are already what Claude Code's agent frontmatter requires and match
   `src/schemas/agent-frontmatter.schema.json` and the `AgentFrontmatter` type; only the
   model-side lookups were wrong. Corrected to `agent.disallowedTools` and
   `agent.permissionMode`.

2. **A gate binding template reads to the type they render.**
   `lib/__tests__/agent-template-reads-its-model.test.ts` extracts every `agent.*` lookup from
   every shipped template and asserts each is a key of `EVERY_AGENT_CONFIG_FIELD`, a literal
   typed `Required<AgentConfig>`. `Required<…>` is what makes it a binding rather than a second
   hand-maintained list: a field added to or removed from `AgentConfig` fails `tsc` at that
   literal. The extractor is `lib/__tests__/helpers/template-field-reads.ts` with its own tests,
   per CLAUDE.md's rule against untested parsers inside spec files.

3. **Value assertions, not key assertions.** Three specs in `lib/compiler.test.ts` render the
   SHIPPED template through a real engine and assert the emitted VALUES, with the neither-set
   case beside them as the control.

4. Both documents re-derived.

**Deliberately NOT fixed: `resolveAgents` still drops both fields.** `lib/resolver.ts` names ten
fields explicitly and `permissionMode`/`disallowedTools` are not among them, so no shipped
install can produce a non-default value even now. `model-and-effort.md` states that as a design
decision ("only `model` and `effort` survive resolution"), so widening it is a product question
rather than part of this fix. **The consequence worth naming: this fix changes no byte of any
currently-shipped compiled agent** — verified by hand, `compile` reported "0 rewritten, 10
unchanged". The template was wrong and unreachably so, which is why it survived.

## Proposed Standard

For `.ai-docs/standards/clean-code-standards.md`:

**A template is source, and a lookup in one is a reference no compiler will check.** Where a
template reads fields off a typed model, bind the reads to the type in a spec — the roster read
from a value the compiler has proved carries every property (`Required<T>`), never from a list
someone maintains. The same applies to any string that names a symbol: a Liquid lookup, a
`process.env` key spelled in prose, a dynamic import path.

For `.ai-docs/standards/e2e/assertions.md` (or the CLAUDE.md "Test Assertions" block, which
already carries the closely-related arity rule):

**Never assert the PRESENCE of a field the producer can default.** `toHaveProperty("x")` over a
template with `{{ x | default: … }}` behind it, or a schema with a default, cannot fail — the key
is emitted whether the value arrived or not, so the assertion pins the template's fallback and
reports it as the model's value. Assert the value, and assert it against a fixture that sets the
field to something the default is not. This is the same class as the existing rule against
encoding a known gap in an assertion's arity: both are green assertions over a defect, and both
redden only when the defect is fixed.
