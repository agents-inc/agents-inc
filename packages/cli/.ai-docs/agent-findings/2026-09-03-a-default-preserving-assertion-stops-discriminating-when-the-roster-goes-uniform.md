---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/e2e/fixtures/expected-values.ts
  - packages/cli/e2e/commands/init-from-scenarios-tuning.e2e.test.ts
  - packages/cli/src/cli/lib/__tests__/mock-data/mock-agents.ts
  - packages/cli/src/cli/lib/resolver.test.ts
  - packages/cli/.ai-docs/reference/features/model-and-effort.md
  - packages/cli/.ai-docs/reference/features/agent-system.md
standards_docs:
  - .ai-docs/reference/features/model-and-effort.md
date: 2026-09-03
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: premise-expired
status: resolved
resolved_by: >-
  Both halves landed. The e2e half restored `E2E_BUILTIN_AGENT`'s true value and made the two
  default-preserving specs state what they can and cannot see. The unit half closed on 2026-09-04:
  `RESOLVE_AGENTS_DEFINITIONS` in `mock-data/mock-agents.ts` no longer pins both mock agents at
  `opus`, so the fixture can draw the distinction again. Proved by mutation rather than by a green
  suite — replacing `agentConfig.model ?? definition.model` with `agentConfig.model ?? "opus"` in
  `resolver.ts` now reddens `should keep the metadata model when the config sets only effort`
  (`expected 'opus' to be 'sonnet'`), where before the mutation reddened nothing anywhere.
---

## What Was Wrong

Every bundled sub-agent now declares `model: opus` — the owner ruled the roster uniform on
2026-09-03, and `meta/convention-keeper` and `tester/api-tester` were the last two moved off
`sonnet`. Re-derive with:

```
grep -h '^model:' $(find packages/cli/src/agents -name metadata.yaml) | sort | uniq -c
```

Two e2e specs existed to prove that a **default-preserving** path leaves a sub-agent's model alone,
and they were built on that split. `E2E_BUILTIN_AGENT` in `e2e/fixtures/expected-values.ts` carried
`"api-tester": { defaultModel: "sonnet" }` under a docblock stating the reason outright: `api-tester`
"is the one whose default is NOT `opus`, which is why the default-preserving specs use it: an
assertion of `opus` there would pass on a hardcoded fallback." The reasoning was correct when
written. The fact it rested on is gone, and nothing existed to notice — the fixture's value simply
became wrong, and the docblock became a piece of retired reasoning that reads as current.

**The interesting half is what the specs lost and what they kept, because the two are easy to
confuse.** A dropped default is still caught: `agent.liquid` renders
`model: {{ agent.model | default: "inherit" }}`, so a metadata read that never happened produces
`inherit`, which is not what any expected value here says. Removing `?? definition.model` from
`resolveAgents` reddens both specs with
`Expected agent frontmatter model to be "opus" but got "inherit"`. What is no longer visible is
narrower and was the docblock's exact subject: a resolver answering a **hardcoded `opus`** in place
of reading the metadata. No fixture installing the shipped roster can see that, because both
mechanisms produce the same byte.

**A second, separate assertion went vacuous in the same move and was not part of the report that
found this.** `it("carries every model the contract allows onto its own sub-agent")` gives one
sub-agent per model word, and the OPUS row's frontmatter assertion can no longer fail: a mapper
that dropped `opus` from what it forwards would still compile `model: opus` off the metadata. The
row survives only because the spec also asserts the written `config.ts` entry, where an override
that never arrived is an absent KEY rather than a coinciding value. Simulating that mapper —
`entry.model !== "opus" && { model: entry.model }` in
`packages/compile/src/seed-to-config.ts` — reddens the config assertion alone and leaves the
frontmatter assertion green, which is the whole finding in one run.

That generalises past models: **a frontmatter assertion checks a RESOLVED value and a config
assertion checks whether an override was RECORDED.** Only the second can distinguish "the override
arrived" from "the default happened to agree", and the distinction is invisible until the two sides
converge.

## Fix Applied

The fixture value and every comment resting on the retired premise, in the two e2e files, plus the
`Model distribution` claim in `agent-system.md`, which now carries the re-derive command instead of
a count. The specs were **not** rewritten to assert something else: their remaining assertions
discriminate against the failure modes that are still reachable, and both were demonstrated to
redden under a broken mechanism before the comments claiming so were written. What each spec can no
longer see is now stated in the spec, next to the assertion, rather than left as a silently weaker
check.

Not fixed: `RESOLVE_AGENTS_DEFINITIONS` pins `WEB_DEVELOPER_DEFINITION` and
`API_DEVELOPER_DEFINITION` at `model: "opus"` (`mock-agents.ts` lines 51 and 58), so
`it("should keep the metadata model when the config sets only effort")` in `resolver.test.ts`
asserts `opus` against a definition declaring `opus` and cannot tell the two mechanisms apart
either. That suite's own docblock names the trap for the OVERRIDE direction — "a fixture whose
metadata already matched the expected value would make the test pass on a resolver that ignored the
config entirely" — and then walks into it in the PRESERVE direction three lines below. It is the
cheapest fix in the set and the only one that closes the class: these are the suite's own
definitions, unaffected by any ruling about shipped agents, so pinning one of them off `opus` costs
one literal.

`model-and-effort.md` still restates the retired premise verbatim ("`api-tester` is used for those
because its default is `sonnet`, not `opus`"). It was another lane's file and is reported rather
than edited.

## Proposed Standard

For `.ai-docs/reference/features/model-and-effort.md`, in the section describing the E2E and
resolver coverage — the doc that already owns this subject and already carries the wrong version
of it:

**A fixture that asserts a DEFAULT survives must declare a value nothing else in the run would
produce.** The failure is not that the assertion is wrong; it is that it becomes unfalsifiable
while continuing to read as rigorous, and the change that empties it happens somewhere else
entirely — in shipped metadata, under a ruling that has nothing to do with tests. Where the fixture
is the suite's own (`mock-agents.ts`), pin it off the shipped value deliberately and say why on the
line. Where it must mirror shipped data (`E2E_BUILTIN_AGENT`), the mirror cannot be chosen, so
record in the fixture what it can no longer distinguish rather than leaving the reader to infer
that it still can.

This is CLAUDE.md's existing "NEVER broaden an assertion to make a failing test pass" and "NEVER
encode a known gap in an assertion's ARITY, LENGTH or ABSENCE" arriving from a third direction —
a gap encoded in an assertion's **coincidence**, where the expected value is right, the test is
green, and the reason it is green has quietly changed. Neither existing rule covers it: nothing was
broadened and nothing was made absent.

The mechanical companion, worth stating because it is what saved the model-row spec here: **where a
spec asserts both a compiled artefact and the config that produced it, the config assertion is the
one that survives the two sides converging.** Do not delete a config-side `toStrictEqual` as
redundant with a frontmatter check — they answer different questions, and the redundancy is only
apparent while the values differ.
