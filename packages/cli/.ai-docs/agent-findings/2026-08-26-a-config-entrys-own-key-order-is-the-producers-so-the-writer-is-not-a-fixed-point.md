---
type: convention-drift
severity: high
affected_files:
  - packages/compile/src/config-source.ts
  - packages/cli/src/cli/stores/wizard-store.ts
  - packages/cli/src/cli/lib/config-gate/propagate.ts
  - packages/cli/e2e/lifecycle/preview-matches-install.e2e.test.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
date: 2026-08-26
reporting_agent: reviewer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `cleanForEmission` in `packages/compile/src/config-source.ts` now canonicalises
  key order at all three levels the bytes expose, not two — `withEntriesInSchemaOrder`
  rebuilds every `skills` and `agents` element in its loader-schema key order, and
  `compactAssignment` does the same for a stack assignment that survives compaction
  in object form. Constants are `as const satisfies readonly (keyof SkillConfig)[]`
  and its two siblings, so a field rename reddens the list that owns it. The
  tester's pin — "re-emits a config carrying a wizard-minted global tombstone with
  the same bytes" in `config-round-trip.test.ts` — is green, as is the
  `preview-matches-install` e2e leg. The agent-side twin the pin does not cover was
  fixed in the same pass and hand-verified: an entry minted `{ name, excluded, scope }`
  emits `{"name":…,"scope":…,"excluded":true}`.
---

## What Was Wrong

`CLAUDE.md` already carries the rule this breaks: _"NEVER leave the key order of a nested record
to whoever assembled it when that record is serialised. Canonicalise it **once in the writer**."_
It was written about `stack`, a record of records, and `canonicalizeStackOrder` satisfies it.
`cleanForEmission` satisfies the same rule for the config's top-level fields, and its docblock
states the consequence in as many words: _"Emitting in it is what makes the writer a fixed
point: the three producers of an in-memory config … insert their keys in three different orders,
and without this the same values would emit as three different files."_

**One level further down, the rule is not applied and the claim is false.** Each element of
`skills` and `agents` is rendered by `renderEntryLine`, which is `JSON.stringify(entry)` — so an
entry's own key order is whatever order its producer inserted the keys in, and there are at
least two orders in production:

- `reconcileSkillConfigs` and `toggleSkillScope` in `stores/wizard-store.ts` mint a global
  tombstone as `{ id, scope, excluded, origin }`;
- `maskCollidingGlobalSkills` in `config-gate/propagate.ts` mints one by spreading, which gives
  `{ id, scope, origin, excluded }`;
- and the Zod loader rebuilds every entry in `SkillConfig`'s declaration order,
  `{ id, scope, origin, excluded }`, so a config read back off disk is a third producer.

The consequence is that the writer is **not** a fixed point for any entry carrying `excluded`.
Write a config from the wizard, load it back, re-render it with the same inputs, and the bytes
differ. Reproduced in-process — no install needed:

```ts
// project config exactly as reconcileSkillConfigs mints one
const fromWizard = {
  name: "demo",
  agents: [{ name: "web-developer", scope: "project" }],
  skills: [
    { id: "web-framework-react", scope: "project", origin: "agents-inc" },
    { id: "web-styling-tailwind", scope: "global", excluded: true, origin: "agents-inc" },
  ],
  selectedDomains: [],
};
const written = generateConfigSource(fromWizard, MATRIX, { isProjectConfig: true, globalConfig });
writeFileSync(`${dir}/.claude-src/config.ts`, written);

const reloaded = (await loadProjectConfigFromDir(dir)).config;
const reRendered = generateConfigSource(reloaded, MATRIX, { isProjectConfig: true, globalConfig });
```

```
WRITTEN  :   {"id":"web-styling-tailwind","scope":"global","excluded":true,"origin":"agents-inc"},
RE-RENDER:   {"id":"web-styling-tailwind","scope":"global","origin":"agents-inc","excluded":true},
IDENTICAL: false
```

Nothing caught it for as long as one installation only ever had one producer. It surfaced the
moment a second surface was asked to draw the same bytes: `preview-matches-install.e2e.test.ts`,
the CLI's half of the editor-v6 emission contract, loads a project config off disk and re-renders
it, and this is one of the two differences it reports. **The class is exactly what that phase
exists to remove** — a preview built from editor state will insert its own key order, so the
dialog shows a line no install writes, for a configuration that is otherwise correct.

It is also a live CLI defect independent of the preview: an `edit` run that changes nothing about
a tombstoned skill still rewrites its line, so `writeIfChanged` reports a change and the diff a
user reads names a skill they did not touch.

Census of the producers, which is a census rather than a sample:

```
grep -rnE '\{[^}]*\bexcluded: true\b[^}]*\}' packages/cli/src/cli \
  --include='*.ts' --include='*.tsx' | grep -v '__tests__' | grep -v '\.test\.'
```

Six hits, four in `wizard-store.ts` and two in `propagate.ts`. The two agent-side hits
(`{ name, scope, excluded }`) happen to agree with `AgentScopeConfig`'s declaration order today,
because neither sets `model` or `effort`; that is luck, not a property of the code.

## Fix Applied

None — discovery only. The reviewer is not the fixer, and choosing the canonical order is an
authorship decision (`SkillConfig`'s declaration order is the obvious candidate, since the loader
already produces it and it is what a round trip converges on).

## Proposed Standard

Two halves, and the second is the one no existing rule covers.

**1. Extend the existing rule from records to array elements.** `CLAUDE.md`'s nested-record rule
names "a record of records" and its live example is `canonicalizeStackOrder`. An element of an
emitted array is the same problem with the same fix and is not covered by the sentence as
written. Proposed wording, to sit with the existing rule rather than as a new one: _canonicalise
the key order of anything the writer serialises, including the elements of an emitted array —
`renderEntryLine`'s `JSON.stringify(entry)` is producer-ordered and there is no order in an array
element that the writer does not own._ The implementation belongs in `cleanForEmission` beside
`canonicalizeStackOrder` and `canonicalizeFieldOrder`, keyed on the type's declaration order,
so the wizard, the masker and the loader cannot disagree.

**2. A round trip inside ONE installation is a test shape nobody writes.** `CLAUDE.md` already
requires that a round trip compare the two ends' generated artefacts rather than each end against
its own config — that rule is about two installations (`share-round-trip-compiled-bodies.e2e.test.ts`).
This defect is a round trip with only one: render → write → load → render, and compare the two
renders. Every existing config-level check passes over it, because both configs deep-equal each
other and only the bytes differ. Proposed as a rule in
`.ai-docs/reference/config/config-writer.md`, where the fixed-point claim is made: _a writer that
claims to be a fixed point owes a spec that writes its output, loads it back through the real
loader, re-renders, and asserts the two strings are identical._ That spec is cheap (the
reproduction above is the whole of it), it would have failed on the day the tombstone shape was
introduced, and it is the only thing that would.

Checked against `CLAUDE.md` before proposing: neither half conflicts with a NEVER/ALWAYS rule —
the first is a widening of a rule that is already there, and the second is a new spec shape rather
than a new abstraction. Nothing mechanically enforces either today, and I am not proposing a
checker: the subject is "did the writer canonicalise this particular nested shape", which is a
question about the writer's own data model rather than about a construct a scan could match.
