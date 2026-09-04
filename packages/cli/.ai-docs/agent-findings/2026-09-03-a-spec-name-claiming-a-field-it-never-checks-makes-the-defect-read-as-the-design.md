---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/stacks/stacks-loader.ts
  - src/cli/lib/resolver.ts
  - src/cli/lib/resolver.test.ts
  - src/agents/_templates/agent.liquid
  - src/cli/lib/schemas.ts
standards_docs:
  - CLAUDE.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-09-03
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The DEFECT half landed. `statedUsageFor` in `stacks-loader.ts` now reads `usageGuidance` and falls
  back to the category, and the whole gate is green. The RULE half is open — nothing is written down
  about a spec name claiming a field its assertion does not read, and no census of that class has
  been run. See the `## Correction` section for what the landing changed and what it cost, including
  a second defect the body did not anticipate.
---

## What Was Wrong

Every compiled sub-agent ends in a `<skill_activation_protocol>` block, and each entry's
`- Use when:` line is the only thing that tells the agent when to reach for a dynamic skill.
`agent.liquid` renders that line as `- Use when: {{ skill.usage }}`, and `usage` reaches it from one
place: `resolveAgentConfigToSkills` in `stacks-loader.ts`, which writes
`` `when working with ${category}` `` — the config's own grouping key, not anything the skill says
about itself. `buildSkillRefsFromConfig` delegates to it and `resolveSkillReference` copies the
field through unchanged, so the whole product builds this string in one place. The command below
returns four lines and only one of them is a formula — the other three are the copy-through in
`resolveSkillReference` and the two `usage: string` declarations on `SkillReference` and `Skill`:

```
grep -rn 'usage:' src/cli --include='*.ts' --include='*.tsx' | grep -v '__tests__' | grep -v '\.test\.'
```

Meanwhile every skill states a real trigger sentence in its `metadata.yaml` `usageGuidance` field —
required of a marketplace's own skills by `skillMetadataBaseSchema` (`z.string().min(10)`), surfaced
on `SkillCore` as `usageGuidance?: string`, and carried through to `matrix.skills[id]`, which
`resolveAgentConfigToSkills` already reaches on the line above (it calls `hasSkill` to warn about ids
the matrix does not carry). Nothing read it. `meta-design-expressive-typescript` states "Use when
writing or refactoring TypeScript functions, data transformations, store actions, or any code that
mixes logic levels…" and every agent carrying it was compiled with `Use when: when working with
meta-design`.

**What let it stand for as long as it did is a test NAME.** `resolver.test.ts` carried

```
it("should include usage guidance with category name", ...)
```

whose only assertion was `expect(firstElement(result).usage).toBe("when working with
web-framework")`. The name names the concept — usage guidance — while the assertion pins the string
that replaced it, so anybody grepping for whether guidance was wired found a green spec that appeared
to say yes. Many further assertions in `stacks-loader.test.ts` pin the same derived form —

```
grep -c 'when working with' src/cli/lib/stacks/stacks-loader.test.ts
```

— and those read as ordinary coverage because none of their names claims anything about guidance.
They are in fact sound, as fallback coverage: the `SKILLS.*` fixtures they run against state no
`usageGuidance` at all, so there was never anything for them to read. The one spec that named the
field is the one that made the defect look decided.

Nothing mechanical could see any of it. `usage` and `usageGuidance` are both `string`, so `tsc` is
content; the Liquid engine runs `strictVariables: false` and renders whatever it is handed; and the
rendered line is grammatical, so a human reading a compiled agent sees a sentence rather than a
mistake.

## Fix Applied

None to product code — a different lane owns `stacks-loader.ts`. Seven failing specs were written
and watched red, each for the stated reason:

- `stacks-loader.test.ts`, a new `usage` block under `resolveAgentConfigToSkills` — four red
  (guidance carried; the derived form named explicitly as what must not appear; per-skill guidance
  inside one category; the shipped catalogue's own sentence through `BUILT_IN_MATRIX`) and two green
  that must stay green (the two fallbacks below).
- `agent-protocol-carries-stated-usage-guidance.test.ts`, new — the chain end to end through the real
  `agent.liquid`: `StackAgentConfig` → `resolveAgentConfigToSkills` → `resolveSkillReferences` →
  `renderAgent`. Two red, plus a green guard asserting the protocol block is actually rendered, since
  an absent section makes the negative assertion pass for free.
- `resolver.test.ts` — the misnamed spec above, rewritten to assert what its name claimed. It was
  going to redden on the fix regardless: the file calls no `initializeMatrix`, so it resolves against
  `BUILT_IN_MATRIX`, where `web-framework-react` does state guidance.

**The absence case was decided rather than left open, because it is the half a naive fix gets
wrong.** There are two absences — an id the matrix does not carry (local, custom, withdrawn), and a
skill it does carry that states no `usageGuidance`, which is ordinary rather than malformed since the
field is optional on `SkillCore` and on `matrixRawMetadataSchema`. Both fall back to the category
sentence, and both are pinned. A throw would refuse to install any payload naming a skill this
catalogue does not carry, which is consumption failing; an empty string would ship a `- Use when: `
bullet that says nothing. The category key is the only word available — which is what `liveCategoryOf`
one function above already rules for the same absence, and what `externalSkillMetadata` in
`seed/external-skills.ts` says in as many words when it writes the identical sentence as an external
skill's default guidance.

**One thing measured and deliberately NOT pinned, because pinning it would expand the fix's
contract:** every `usageGuidance` value in `types/generated/matrix.ts` opens with the words "Use
when" — a census of the whole catalogue, not a sample, and the two figures below are equal:

```
grep -c 'usageGuidance:' src/cli/types/generated/matrix.ts
grep -A1 'usageGuidance:' src/cli/types/generated/matrix.ts | grep -cE "['\"]Use when"
```

Read the second command's shape before trusting a smaller figure from a simpler one: the values sit
on a continuation line as often as not, and exactly one is single-quoted because it contains
`"use client"` — a scan for double-quoted values alone reports one fewer and looks complete.

The template's label is `- Use when: `, so the smallest correct fix renders `- Use when: Use when
writing or refactoring TypeScript functions…` in every entry of every agent. Any of three things
resolves it — the template drops its label, the producer strips the leading clause, or the catalogue
rewords — and choosing between them is a product decision, so the specs assert that the guidance
reaches the protocol without asserting the shape of the line it lands on.

## Proposed Standard

CLAUDE.md already carries the narrow case: _"NEVER let a spec's NAME claim validation that its mocks
have removed."_ That rule is scoped to mocks, and there was no mock here — which is exactly why it
could not reach this. Widen it to the shape it is one instance of:

> **A spec's name names the field its assertion reads.** Where a name states a concept the product
> has a field for (`usageGuidance`, `origin`, `scope`), the assertion mentions that field or the
> value read out of it. A name that describes the concept while the assertion pins a substitute is
> worse than no spec at all: it answers the grep somebody runs to check whether the concept is
> wired, and it answers it wrongly.

**There is no cheap census for this class**, and saying so is part of the rule: the mismatch is
between a name and an assertion, both of which are prose to a scanner. What can be enumerated is the
POPULATION worth reading — spec names that mention an identifier at all, which are the ones making a
field-level claim. Read each and ask whether the assertion touches the noun in the name:

```
grep -rnoE 'it\("[^"]*"' src --include='*.test.ts' --include='*.test.tsx' | grep -E '"[^"]*[a-z]+[A-Z][a-zA-Z]+'
```

A word-list scan over the same trees was tried first and returned several hundred hits, most of them
prose using "source" or "scope" as ordinary English. The camelCase filter is what separates a name
that claims a FIELD from one that describes a behaviour.

Second, narrower rule, for the same defect from the other end: **a field a schema requires has one
gate holding its consumer to it.** `usageGuidance` is `z.string().min(10)` in
`skillMetadataBaseSchema` and every catalogue skill supplies one, and no test anywhere asked whether
anything downstream read it. The shape to copy is `agent-template-reads-its-model.test.ts`, which
holds the template's field READS against `Required<AgentConfig>` — a required field with no reader is
invisible to every gate in this package, because supplying it and using it are separate facts and
only the first is typed.

## Correction

Written before the fix landed; three of its claims have been overtaken, and one of them was wrong in
a way worth recording rather than quietly repairing.

**The rendering decision went the other way, and that is better than what this finding proposed.**
The body treats the doubled label — `- Use when: Use when writing or refactoring…` — as an open
choice between three remedies and declines to pin any. The lane that fixed it took the first: the
template's `- Use when: ` label is gone, the bullet is now `- {{ skill.usage }}`, and the producer
writes a whole sentence. So the fallback arm is no longer `when working with <category>` but
`Use when working with <category>.` — a complete sentence with a trailing period, because it renders
as a bullet of its own.

**That reddened ten specs, seven of which this finding had called sound.** The body says the
pre-existing `stacks-loader.test.ts` assertions "are in fact sound, as fallback coverage". They were
sound as coverage and brittle as expectations: each pinned the fallback SENTENCE inline, so a change
to the sentence moved ten literals in a file whose specs are about `preloaded` flags and array
arity. All ten now read one mirrored table, `FALLBACK_USAGE` in `__tests__/mock-data/mock-skills.ts`,
written out per category rather than rebuilt from the product's template.

**The second defect the body did not anticipate is the one worth carrying forward.** When the
product's wording moved, only the POSITIVE assertions reddened. The two negatives — the assertions
whose whole job is to say the fallback did NOT fire for a skill that states guidance — went on
passing, and they diverged from each other in a way neither spec could show:

- `stacks-loader.test.ts` used `.not.toBe("when working with web-client-state")`. The product can no
  longer emit that string at all, so the assertion became wholly vacuous.
- The render spec used `.not.toContain(...)` on the same fragment, and kept its teeth **by
  accident**: the new sentence happens to contain the old one as a substring.

Neither was noticed by the run, because a vacuous negative is green and a surviving negative is
green. Both are now bound to the same `FALLBACK_USAGE` entry, and both were re-checked by removing
the fixture's `usageGuidance` and watching them fail. **This sharpens the finding's own proposed
rule rather than replacing it**: a negative assertion naming a product string is a claim with a
shelf life, and the thing that expires it is a change to the string it is meant to exclude — the one
change that cannot redden it.

One thing deliberately left: `externalSkillMetadata` in `lib/seed/external-skills.ts` still writes
`Use when working with ${displayName}` with **no** trailing period, and that value becomes a skill's
stated guidance on the next load — so a single protocol list can carry both spellings. That file
belongs to another lane; the period is pinned in `FALLBACK_USAGE` with the divergence named in its
docblock, so the inconsistency is visible rather than absorbed.
