---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/commands/init.tsx
  - e2e/interactive/edit-wizard-excluded-skills.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-06
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

D-215 deletes `ProjectConfig.selectedAgents` and re-sources the edit wizard's agent hydration from
`config.agents` filtered to the non-excluded rows. That is a contract change about where a list is
read from. It turned out to also be a behaviour change, because the old read had a silent failure
mode.

`edit.tsx` hydrated the wizard with `initialAgents: projectConfig?.selectedAgents`. Any config
without that optional field hydrated `initialAgents: undefined`, so the wizard fell back to its
default agent selection instead of the project's actual roster. `detectConfigChanges` then compared
that default roster against `config.agents` and found `addedAgents` / `removedAgents` — a phantom
diff. The edit was reported as changed, `writeConfigAndCompile` ran, and config.ts plus the compiled
agents were rewritten on a passthrough where the user changed nothing.

With hydration reading `config.agents`, the rosters match and `hasAnyChanges` is correctly false:
the command prints "No changes made." and returns early, writing and compiling nothing.

`detectConfigChanges` itself never read `selectedAgents` — the drift was entirely upstream of it, in
what the wizard was seeded with. That is why no unit test caught it: the change detector was always
correct about the inputs it was given.

Five specs in `e2e/interactive/edit-wizard-excluded-skills.e2e.test.ts` were depending on the
phantom write. Each ended with:

```ts
const updatedConfig = await readTestFile(configTsPath(projectDir));
expect(updatedConfig).toContain('"excluded":true');   // the CLI writer's compact form
...
await expect({ dir: wizard.globalHome }).toHaveCompiledAgents();
```

Both assertions only hold if the CLI rewrote and recompiled. The fixture writes its config with
`JSON.stringify(..., 2)`, so its own `"excluded": true` (with a space) does not match the compact
literal — the assertion was, in effect, "a write happened", asserted through a formatting
coincidence. Once the no-op became a real no-op, all five failed on the fixture's own untouched
file.

The specs' actual subject — an excluded skill stays excluded across an edit — was never in question
and still holds.

## Fix Applied

Hydration is the D-215 contract and stays. The five specs are retargeted at their subject:

- The excluded/dual-scope assertions now use the existing `readSkillEntries` structural load from
  `e2e/fixtures/dual-scope-helpers.ts` with `toStrictEqual` on the skill's own rows. This is
  stronger than the raw-text check it replaces, which `'"scope":"global"'` alone would have
  satisfied from any unrelated row in the file.
- The `toHaveCompiledAgents()` proof-of-execution is replaced by
  `expect(result.rawOutput).toContain(STEP_TEXT.EDIT_UNCHANGED)` — the run must still be shown to
  have reached its decision, and "No changes made." is now the correct outcome to pin.

Not fixed: no test anywhere asserts that a no-op edit leaves the compiled agents untouched. The
phantom write meant such a test would have failed until now, so its absence is unsurprising; it is
worth adding as the positive statement of this behaviour rather than leaving it implied by five
specs that merely stopped asserting the opposite.

## Proposed Standard

`.ai-docs/standards/e2e/assertions.md` should carry a rule about proof-of-execution assertions:

> A proof-of-execution assertion must name a side effect the flow under test is SUPPOSED to produce.
> `toHaveCompiledAgents()` on a passthrough edit asserts a recompile — which a correct no-op edit
> must not perform. When the flow's expected outcome is "nothing happened", assert the report
> ("No changes made.") and the unchanged state, not an artifact whose presence would mean the
> opposite.

The companion rule, which the raw-text half of this finding shares with
`2026-08-06-project-scope-agent-deselect-writes-no-tombstone.md`: assert config state through a
structural load, not through a substring of the emitted file. A `toContain` on generated text
couples the assertion to the writer's formatting AND to the fact that a write occurred — two claims
the test did not mean to make.
