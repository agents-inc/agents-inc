---
type: anti-pattern
severity: medium
affected_files:
  - packages/compile/src/agent-source.ts
  - packages/compile/src/agent-source.test.ts
  - packages/cli/src/agents/_templates/agent.liquid
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-09-03
reporting_agent: cli-tester
category: testing
domain: shared
root_cause: enforcement-gap
status: partial
partial_note: >-
  The instance landed and the class did not. Proposed Standard 2 is in the tree —
  `sanitizeHooks` now carries `type: sanitizeLiquidSyntax(action.type, "hook.type")`
  unconditionally, and the spec's named pin was retired to `toStrictEqual([])` in the same
  programme. Proposed Standard 1, the general rule that a spread-then-override transform needs a
  gate reading its OUTPUT, is not written into `clean-code-standards.md` and nothing enforces it
  outside this one spec.
---

## What Was Wrong

`sanitizeCompiledAgentData` in `packages/compile/src/agent-source.ts` strips Liquid delimiters
(`{{`, `}}`, `{%`, `%}`) out of an agent definition before `agent.liquid` renders it. It is written
as a **spread followed by overrides**: a leading `...data.agent` copies the whole definition through
untouched, and each field the template renders is then named in a conditional spread that replaces
it with a sanitised value. `sanitizeHooks`, `sanitizeExperimental` and `sanitizeSkills` are the same
shape one level down.

That shape has a property nothing states: **a field nobody names is not merely unsanitised, it is
silently forwarded.** There is no missing key, no `undefined`, no type error and no warning — the
spread already put it there. So the only way the omission can surface is by reading the rendered
output, and nothing did.

It has already produced two misses, both recorded in the module's own docblocks: `hooks` "were the
one part of the definition the sanitiser did not cover, because until this release nothing rendered
them", and `experimental` was added to the type and to the template in the same week without
reaching the enumeration. Both reached the renderer intact with every gate green.

**A third instance was live when this was written, and the gate found it on its first run:**
`hooks[].hooks[].type`. `sanitizeHooks` spreads `...action` and then overrides `command`, `script`
and `prompt`; `type` rides the spread. `agent.liquid` emits the whole hooks map through
`{{ agent.hooks | json }}`, so an author-supplied `type` lands in a compiled agent's frontmatter
verbatim, delimiters and all. Reproduction, from `packages/compile`:

```
npx vitest run src/agent-source.test.ts -t "strips the delimiters off all of them"
```

The spec pins it by name in `KNOWN_UNSANITISED_FIELDS` rather than by absence, so it is green today
and reddens the moment the field is sanitised — that red is the pin retiring.

**Why the type system does not catch it, and why "it is a closed vocabulary" is not an answer.**
`type` is `"command" | "script" | "prompt"`, and `lib/schemas.ts` validates it with
`z.enum(["command", "script", "prompt"])`. So does `agent.schema.json`. That is exactly the argument
`sanitizeExperimental`'s docblock already rejects for `cacheTtl`: `model`, `effort`,
`permissionMode` and `isolation` are all closed vocabularies, all Zod-validated on the CLI path, and
all sanitised anyway — "a type says nothing about what reached the renderer", and `renderAgent` is
also the editor's preview path, which arrives from a browser with none of the CLI's parsing having
run. `type` is the one member of that argument's own class that the enumeration skipped.

## Fix Applied

**The gate, not the sanitiser.** `packages/compile/src/agent-source.ts` belonged to a different lane
of the dispatch that produced this finding and was left byte-identical; the four sanitised fields
inside `sanitizeHooks` are still three.

What landed is in `packages/compile/src/agent-source.test.ts` — a spec that holds the enumeration
against what actually renders, with neither side written down:

- The fixture is annotated `Required<AgentConfig>`, so a field added to the type and forgotten in
  the fixture fails `tsc` at the literal, and a field removed from the type fails there too. This is
  the shape `agent-template-reads-its-model.test.ts` already uses on the CLI side.
- Every field carries a marker built out of Liquid delimiters and naming itself
  (`{{POISON:permissionMode}}`), the agent renders through `renderAgentFromCorpus` — the same Liquid
  render an install performs — and a marker that comes back with its delimiters intact is a field
  nothing stripped. The failure names the field because the marker does.
- Three guards keep it from going vacuous: every field of the definition that can hold author text
  is in the roster, every named marker is actually planted in the fixture, and every marker the
  template reads reaches the output. The last is the subject guard — without it a render that
  emitted no frontmatter at all would satisfy the survivor check for free.

Verified red for the right reason before being reported: deleting the `model` spread from
`sanitizeCompiledAgentData` produces `expected [ 'model', 'hooks.action.type' ] to strictly equal
[ 'hooks.action.type' ]`, and deleting the `experimental` spread produces the same shape naming
`experimental.cacheTtl`. Both were restored.

## Proposed Standard

Two, and the first is the general one.

**1. A spread-then-override transform needs a gate that reads its OUTPUT, not its source.** The
class is wider than sanitising: `{ ...input, field: transform(input.field) }` is how this codebase
writes canonicalisation, redaction and defaulting alike, and in every one of them a field nobody
names is forwarded unchanged and looks identical to a field deliberately passed through. Reviewing
such a function tells you what it names; it cannot tell you what it missed. The gate has to feed a
value the transform is supposed to change into **every** field and assert none survived — and the
roster driving that fixture must come from the compiler (`Required<T>`), not from a hand-kept list,
because a hand-kept list is the same enumeration the defect is in. This belongs in
`clean-code-standards.md` beside the existing canonicalisation rules, which already make the
neighbouring argument for key ORDER ("canonicalise it once in the writer, not once per producer")
and say nothing about field COVERAGE.

**2. Sanitise `type` in `sanitizeHooks`, then delete the entry from `KNOWN_UNSANITISED_FIELDS`.**
One conditional spread beside the three already there. It needs no conditional at all —
`AgentHookAction["type"]` is required — so `type: sanitizeLiquidSyntax(action.type, "hook.type")`
alongside the existing overrides is the whole change. Cross-checked against CLAUDE.md: it conflicts
with nothing, and the "NEVER cast a valid union member" rule is not engaged, because
`sanitizeLiquidSyntax` is already generic over `T extends string` and carries its own boundary-cast
comment for exactly this.

A third was considered and is NOT proposed: making the compile package's own copy of
`agentFieldsReadBy` so the spec could read `agent.liquid` directly. The only sound reader of a
Liquid template lives at `packages/cli/src/cli/lib/__tests__/helpers/template-field-reads.ts`, is
tested, and cannot be imported from `packages/compile` without inverting the dependency direction —
and `Required<AgentConfig>` covers strictly more than the template's roster anyway, since a template
that starts reading `agent.domain` tomorrow finds `domain` already poisoned. Duplicating a tested
extractor to answer a narrower question is not worth a second definition of it.

## Correction

Appended 2026-09-03, same day, by the agent that wrote this file. The body above is left as
written; two of its present-tense claims stopped being true within the hour.

- **"A third instance was live when this was written"** — it is not live now. The lane owning
  `packages/compile/src/agent-source.ts` applied the one-line fix from Proposed Standard 2, so
  `sanitizeHooks` sanitises four fields rather than three, and "the four sanitised fields inside
  `sanitizeHooks` are still three" under _Fix Applied_ reads as of the moment the gate landed.
- **`KNOWN_UNSANITISED_FIELDS` no longer exists.** The pin reddened exactly as its docblock said it
  would, and was deleted along with the constant — a named exception list holding nothing is a slot
  for the next gap to hide in. The survivor assertion is `toStrictEqual([])` again, and the
  coverage was re-demonstrated after the retirement by deleting the newly-added `hook.type` line
  and watching `[ 'hooks.action.type' ]` come back.

One thing the fix established that the body could not, now recorded in the spec's own docblock: the
**CLI route to this defect is provably closed and the browser route is not.** `agentYamlConfigSchema`
enum-validates `type`, and `loadAgentsFromDir` parses each `metadata.yaml` inside a `try` whose
`catch` warns and skips the whole file — so a poisoned `type` does not compile into an agent, it
stops that agent compiling at all. `safeParse` of a hook action declaring
`type: "{{POISON:hooks.action.type}}"` answers `success: false`, one issue at
`hooks.SubagentStop.0.hooks.0.type`, `Invalid option: expected one of "command"|"script"|"prompt"`.
The hole exists only on `renderAgentFromCorpus`, which `apps/editor/src/features/configure/lib/output-preview.ts`
reaches from a browser where none of that has run. The same asymmetry covers `model`, `effort`,
`permissionMode`, `isolation` and `experimental.cacheTtl` — all enum-schema'd on the CLI side — and
NOT `name`, `title`, `description` or `tools`, which are `z.string()` and reachable either way. It is
written down because a reader who checks only the CLI concludes the whole sanitiser block is dead
weight and deletes it.
