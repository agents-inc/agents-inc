---
type: standard-gap
severity: medium
affected_files:
  - e2e/lifecycle/stack-per-agent-curation.e2e.test.ts
  - e2e/helpers/test-utils.ts
  - src/cli/lib/configuration/config-writer.ts
  - src/cli/lib/stacks/stacks-loader.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: Comment corrected in the affected spec file; the local `extractStack`/`findAssignment` helpers and the local `Stack` type intentionally remain, because removing them would change six assertions.
---

## What Was Wrong

CLAUDE.md bans local parser/extractor helpers in test files and prescribes "a
structural load (e.g., `loadProjectConfig` for config.ts)" as the replacement.
`e2e/lifecycle/stack-per-agent-curation.e2e.test.ts` declares exactly such a
banned helper — `extractStack(configContent)`, a brace-matching scanner plus
`JSON.parse` over raw `config.ts` text — and its JSDoc carried two claims that
are now both false:

1. "Mirrors the `extractStack` helper in `preloaded-preservation.e2e.test.ts`."
   That mirror no longer exists; `preloaded-preservation.e2e.test.ts` was
   migrated to `loadConfigOrFail` and has no `extractStack`.
2. "Kept local until a shared helper is extracted." The shared helper already
   exists (`loadConfigOrFail` in `e2e/helpers/test-utils.ts`).

Together those two comments read as "this is stale, just swap in the shared
helper" — but that swap is **not** behaviour-preserving, and nothing in the file
said so. The blocker is a deliberate asymmetry between the config writer and the
config loader:

- `compactAssignment` (`src/cli/lib/configuration/config-writer.ts`) writes
  `{ id, preloaded: false }` to `config.ts` as a **bare string**, and preserves
  `{ id, preloaded: true }` as an object.
- `normalizeAgentConfig` (`src/cli/lib/stacks/stacks-loader.ts`), which
  `loadProjectConfigFromDir` → `loadConfigOrFail` runs on every load, **expands
  that bare string back** to `{ id, preloaded: false }`.

The two are exact inverses, so a structural load is lossless for _data_ but
lossy for the _serialisation contract_. This spec file asserts the serialisation
contract directly — six assertions compare against bare strings, e.g.
`expect(stackAfterEdit["api-developer"]?.["api-api"]).toStrictEqual(["api-framework-hono"])`
and `expect(webDeveloperZustand).toStrictEqual("web-state-zustand")`. Under
`loadConfigOrFail` every one of those returns `{ id, preloaded: false }`, so
adopting the shared helper would have forced rewriting six assertions — i.e.
deleting the only coverage that the writer compacts `preloaded: false` at all.

The general trap: **"use a structural load instead of parsing text" is correct
only when the assertion is about the data, not about how the data was
serialised.** The rule as written does not carve that out, so a mechanical
sweep reads the raw-text helper as pure debt.

## Fix Applied

Partial, deliberately.

- Replaced the stale JSDoc on `extractStack` with the verified reason it must
  stay: it names `compactAssignment` and `normalizeAgentConfig` as the two sides
  of the asymmetry and states that the bare-string assertions are observable
  only in the config.ts text as written.
- Did **not** delete `extractStack`, `findAssignment`, `StackSkillAssignment`, or
  the local `Stack` type. Nine of the file's fifteen stack assertions would
  survive a structural read; six would not, and both tests in the file contain at
  least one of the six. Running both a structural load and the raw parse in the
  same test would add a second representation of the same data without deleting
  anything, so the raw path was left whole.
- Did not touch `findAssignment` either. Replacing its `find`-based lookup with
  direct indexing (`toStrictEqual(["web-state-zustand"])`) would _strengthen_
  the assertion from "contains this entry" to "equals exactly this array", which
  is still a change to what the test asserts.

## Proposed Standard

Add to `.ai-docs/standards/e2e/assertions.md`, in the section that mandates
structural loads over text parsing, an explicit exception:

> Prefer `loadConfigOrFail(dir)` over parsing `config.ts` text. **Exception:**
> when the assertion is about the emitted _form_ rather than the data — the
> writer's compaction (`preloaded: false` → bare string), key ordering, or
> formatting — the structural loader normalizes that form away and cannot
> express the assertion. Those sites must read the file text. When a spec file
> keeps a local text parser for this reason, its JSDoc must name the specific
> writer and loader functions that disagree, so the next sweep does not read it
> as debt.

Add to `.ai-docs/standards/e2e/anti-patterns.md`, under the local-parser ban:

> Before deleting a local config parser in favour of a structural load, diff the
> loader's normalization against the assertions. `normalizeAgentConfig` expands
> bare-string stack entries to `{ id, preloaded: false }`; any `toStrictEqual`
> against a bare string is asserting the writer's compaction and will not
> survive the swap.

A general form of this belongs in the sub-agent brief for behaviour-preserving
sweeps: a shared helper existing is not sufficient evidence that a local helper
is redundant — verify the shared helper produces the same _observable_ value the
assertions consume, not merely the same data.
