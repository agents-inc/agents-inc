---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/stack-per-agent-curation.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/assertions.md
  - CLAUDE.md
date: 2026-08-01
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >
  Code side landed: `findAssignment` is gone from
  `e2e/lifecycle/stack-per-agent-curation.e2e.test.ts` (removed with Change B of the model/effort
  work), and the six assertions it fed now compare the writer's exact emitted value with
  `toStrictEqual`. Pending: the sibling half of the rule — what to do when a spec's subject
  genuinely IS the serialized form — is still unwritten in
  `.ai-docs/standards/e2e/anti-patterns.md`, so the `extractStack` that deliberately REMAINS in
  the same file still reads to an arriving reader as an unfixed instance of the CLAUDE.md ban
  rather than the documented exception it is. That half is inherited from
  `2026-07-20-structural-config-load-erases-writer-compaction.md`, which proposed it and is also
  still `partial`.
---

## What Was Wrong

`e2e/lifecycle/stack-per-agent-curation.e2e.test.ts` carried two local helpers, not one.
`extractStack` (brace-match the `const stack` declaration, `JSON.parse` it) is the one that gets
noticed. Beside it sat `findAssignment`, a `find`-based lookup that every stack assertion in the
file went through to pull one entry out of a category value before asserting on it.

CLAUDE.md § "Test Assertions" bans exactly this: _"NEVER define local parser/extractor helpers
inside a test file (loops, regex scans, state machines that pick data out of rendered output or
config text). If the helper has non-trivial logic it would need its OWN tests to be trusted."_

The specific damage is what makes this worth recording rather than filing as style. `findAssignment`
sat **on the assertion side**, so it silently downgraded what every call site could observe: a
lookup-then-assert asks "does this category CONTAIN an entry with this id, and is its `preloaded`
right?", while the direct form asks "is this category EXACTLY this value?". Everything the writer
might additionally have emitted into that category — a second skill fanned out by a curation
regression, an array where a bare string belongs — was invisible to the first question and is
caught by the second. That is not a hypothetical: per-agent curation, which this file exists to
protect, fails precisely by an agent gaining an entry it was not meant to hold.

The previous pass over this file
(`2026-07-20-structural-config-load-erases-writer-compaction.md`) saw the helper and **deliberately
declined to remove it**, on the correct ground that "replacing its `find`-based lookup with direct
indexing would _strengthen_ the assertion from 'contains this entry' to 'equals exactly this array',
which is still a change to what the test asserts". Strengthening an assertion inside a
behaviour-preserving sweep is out of scope, so the removal had to wait for a task that owned the
file's assertions. Change B was that task.

## Fix Applied

None by this task. `findAssignment` was removed when Change B of the model/effort work landed; the
assertions it fed now read as specifications of the emitted shape:

```ts
expect(stackAfterEdit["api-developer"]?.["api-api"]).toStrictEqual({
  id: "api-framework-hono",
  preloaded: true,
});
expect(stackAfterEdit["web-developer"]?.["web-client-state"]).toStrictEqual("web-state-zustand");
```

Those lines are now the only place in the suite pinning the bare-string form of an exclusive
category (`compactCategoryAssignments`, `config-writer.ts`). This entry is the finding that work
owed the directory — test agents cannot write findings files, so the follow-up was carried in
`docs/progress-model-effort-and-config-cleanup.md` § Phase 3 until a cli-developer task could file
it. Recorded so the removal is not undone by the next author who finds the assertions verbose:
**the verbosity is the point.**

Verified this session: the file's 2 tests are green in the full lifecycle run (170 passed), and no
`findAssignment` remains anywhere under `e2e/`.

## Left For The Owner

`extractStack` in the same file was deliberately KEPT and its JSDoc explains why: the spec's subject
is the writer's compaction contract, which `normalizeAgentConfig` (via `loadConfigOrFail`) undoes on
read, so a structural assertion cannot express it. That justification is correct but lives only in
the file — a reader arriving from CLAUDE.md's flat prohibition sees a banned construct carrying a
comment that argues with the rule. `2026-04-17-shared-config-stack-parser.md` still tracks the wider
family (`extractStack` x2, `parseConfigArrays`, `extractAgentKeys`, `parseSkillEntries`) under D-234;
this removal closes the `findAssignment` line item in that list and nothing else.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md` § "Weak Assertions", cross-linked from CLAUDE.md
§ "Test Assertions" so the exception is discoverable from the ban:

> **A local extractor on the assertion side silently narrows the assertion.** A helper that finds
> the entry you are about to assert on turns "equals exactly this" into "contains something like
> this", and everything the code additionally emitted becomes unobservable. Produce the value, then
> assert on it whole (`toStrictEqual` against the exact emitted shape). The rule is not "extractors
> are ugly" — it is that a lookup in front of an assertion decides what the assertion can fail on.
>
> **The one legitimate local helper is a spec whose subject is the SERIALIZED form**, which a
> structural loader normalizes away. It must be a pure slice-and-`JSON.parse` with no per-shape
> branching, must carry a JSDoc naming the writer/loader pair it deliberately bypasses, and must
> never appear on the assertion side. `extractStack` in `stack-per-agent-curation.e2e.test.ts` is
> the reference example; `findAssignment`, removed 2026-08-01, is the counter-example.
