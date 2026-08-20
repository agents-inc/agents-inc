---
type: architectural-drift
severity: high
affected_files:
  - src/cli/lib/configuration/config-writer.ts
  - src/cli/lib/configuration/config-generator.ts
  - src/cli/lib/matrix/matrix-provider.ts
  - src/cli/lib/seed/seed-to-wizard.ts
  - src/cli/lib/seed/seed-apply.ts
  - src/cli/lib/config-gate/propagate.ts
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
date: 2026-08-19
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `cleanForEmission` in `config-writer.ts` now runs `canonicalizeStackOrder` beside the
  compaction and the field-order canonicalisation it already ran, so the stack's sub-agent
  keys emit in name order and each sub-agent's category keys in the matrix's declaration
  order whichever producer assembled the object. The declaration-order comparator moved to
  `byCategoryDeclarationOrder` in `matrix-provider.ts`, and `inCanonicalCategoryOrder` in
  `config-generator.ts` — which had the only copy of the rule — now calls it. Covered by
  two specs under "stack key order follows the roster, not the producer's insertion order"
  in `config-writer.test.ts`; both were watched failing first.
---

## What Was Wrong

A configuration shared out of one installation and rebuilt in another by `init --from`
reproduced the configuration exactly and **compiled a different sub-agent**. Every
config-level comparison passed — seven skill entries and two sub-agent entries identical
field for field, the same skills directory, the same agents directory — and one of the two
compiled bodies was not byte-identical:

```
--- origin/web-developer.md
+++ rebuilt/web-developer.md
@@ ## Available Skills (Require Loading)
-### e2e-test-fixture-web-state-zustand
-### e2e-test-fixture-web-testing-vitest
+### e2e-test-fixture-web-testing-vitest
+### e2e-test-fixture-web-state-zustand
```

Two entries of the dynamic activation table, swapped. `api-developer.md` was byte-identical
in the same run, which is what made the cause legible rather than the symptom: both configs'
`stack` blocks carried the same curation in different key orders, and `api-developer`'s
reordered key was its only **preloaded** row — which lands in frontmatter rather than in the
dynamic table, so its move was invisible in the body.

The order the compiled body carries is not decorative. `buildAgentTemplateContext` splits
`agent.skills` into preloaded and dynamic **preserving order**, and `agent.skills` is read
back off `config.ts` by `recompileAgents` — so the stack's key order in the file decides the
order of the activation table the sub-agent is handed.

### The rule existed, in one producer, and four others never heard it

`inCanonicalCategoryOrder` in `config-generator.ts` sorted a newly built stack's categories
into the matrix's declaration order, and said why: _"two sessions that select the same skills
emit the same bytes."_ That is the whole invariant. But it was a **local function inside one
builder**, and a census of everything that assembles a stack
(`grep -rn "Partial<Record<AgentName, StackAgentConfig>>" --include='*.ts' --include='*.tsx' src e2e`)
returns five modules:

| Producer                                     | Key order it produced                             |
| -------------------------------------------- | ------------------------------------------------- |
| `buildAgentStack` (`config-generator.ts`)    | roster order — the only one that ordered anything |
| `buildStackProperty` (`config-generator.ts`) | the stack YAML's own key order                    |
| `seedToWizardResult` (`seed-to-wizard.ts`)   | the shared payload's skill order                  |
| `withKeptStackRows` (`seed-apply.ts`)        | assigned rows, then carried rows appended         |
| `additiveMergeStack` (`propagate.ts`)        | existing rows, then incoming rows appended        |

The wizard writes through the first. `init --from` writes through the third, whose
`assignedStack` **replaces** the ownership-derived stack wholesale — by design, because the
payload's per-`(skill, sub-agent)` assignments are the curation. Replacing it also replaced
the one ordering rule in the system.

### Why nothing caught it

The seam is invisible to every assertion the round trip already had. The configuration
genuinely matched: the comparison is over `config.skills` and `config.agents`, which are both
sorted by the generator, and `stack` is neither compared entry-for-entry nor emitted into
either array. The compiled bodies were only ever compared **within** an installation — a
scope-filter check, a roster check, a references-check — never **between** two installations
that should be the same. Both ends were internally consistent; only the comparison across
them failed, and only the hand-run makes that comparison.

### The adjacent rule that should have covered it

`cleanForEmission` in the same file already canonicalises the config's **top-level** field
order, for word-for-word this reason: _"the three producers of an in-memory config insert
their keys in three different orders, and without this the same values would emit as three
different files."_ The rule was correct and its scope was one level too shallow — the stack
is a record of records, and its keys are as producer-dependent as the fields above it.

## Fix Applied

`canonicalizeStackOrder` in `config-writer.ts`, run from `cleanForEmission` immediately after
`compactStackAssignments`: sub-agent keys in name order (code-unit, matching the bare `.sort()`
`generateProjectConfigFromSkills` already applies to its agent list — `localeCompare` would
make the bytes a property of the machine), and each sub-agent's category keys through
`byCategoryDeclarationOrder`.

That comparator is new in `matrix-provider.ts` and is the rule's single definition:
`inCanonicalCategoryOrder` in `config-generator.ts` now calls it rather than holding a second
copy. It is built per call, not memoised at module load, because `initializeMatrix` replaces
the matrix after the local-skill merge.

Every write of `config.ts` goes through `generateConfigSource`, and `recompileAgents` reads the
config back off disk before compiling, so one canonicalisation at the writer settles both the
emitted bytes and the compiled body for all five producers — present and future.

Verified by hand through the real binary: the same share round trip that produced the diff above
now reports `compiled sub-agents whose body differs: none`, with both files byte-identical.

## Proposed Standard

**A record whose key order reaches a file has exactly one place that decides that order: the
writer.** Add to `CLAUDE.md` under "Code Style", beside the existing export-a-shared-key rule:

> NEVER leave the key order of a nested record to whoever assembled it when that record is
> serialised. Canonicalise it once in the writer, not once per producer — a producer that
> replaces another's output (rather than merging with it) also replaces its ordering, and
> nothing downstream can tell. `canonicalizeStackOrder` in `config-writer.ts` is the shape;
> `byCategoryDeclarationOrder` in `matrix-provider.ts` is where the rule itself lives, so the
> builder and the writer cannot disagree about it.

And a testing rule, which is the half that let this run: **a round trip needs one assertion
that compares the two ends' generated artefacts, not only each end against its own config.**
`expectFourSurfaces` held at both ends here and is a genuinely strong check — it just cannot
see a difference that is consistent within each installation. `journeyShareRoundTrip` in
`e2e/handrun-journeys.ts` carries that comparison (`readCompiledAgents` at both ends, compared
byte for byte); it is the only one in the repository, and it is in the hand-run rather than in
a suite, so nothing gates on it.

## What This Does Not Fix

One genuine round-trip loss survives and is unrelated to ordering: the origin config carried
`"description": "Minimal stack for E2E testing"` from the stack it was built with, and the
rebuild carries none. The seed payload has a `stackId` field and `share` posts `null` into it,
because `config.ts` records the applied stack's **description** and not its **id** — so there
is nothing for the encoder to read. It affects no compiled output and no installed file; it is
the config's own name for itself, and it is silently dropped. `journeyShareRoundTrip`'s
config-level comparison covers `skills` and `agents` only, so it cannot see this either.
