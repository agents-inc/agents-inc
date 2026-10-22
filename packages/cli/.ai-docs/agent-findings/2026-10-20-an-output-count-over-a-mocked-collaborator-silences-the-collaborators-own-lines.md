---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/stacks/stacks-loader.test.ts
  - src/cli/lib/matrix/matrix-loader.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: Both instances in the configuration/matrix/stacks lane were rewritten over real files. The census candidate outside that lane (plugin-discovery.test.ts) is unverified, and the proposed CLAUDE.md rule has not landed.
---

## What Was Wrong

A spec that mocks a collaborator which itself logs, and then asserts an EXACT count, sequence or
absence of logger output, pins output no user ever sees. The mock silences the collaborator's own
lines, so "says it once" or "warns nothing" holds only in the mocked world.

There were two instances, both found while rewriting the specs over real files on 2026-10-20:

- `stacks-loader.test.ts` "says where it found no stacks file" mocked `loadConfig` and asserted
  `verbose` was called exactly once with `No stacks file found at <path>`. Unmocked, a missing stacks
  file prints two verbose lines: `Config not found at <path>` (from `loadConfig`) and then
  `No stacks file found at <path>`.
- `matrix-loader.test.ts` "warns nothing more for a frontmatter that reads but its schema refused"
  mocked `parseFrontmatter` to return `null` and asserted `warn` was never called. Unmocked,
  `parseFrontmatter` warns once (`Invalid SKILL.md frontmatter in '<path>'`). That warning is the
  one the spec meant to keep single, and the mock hid it.

Each spec made a claim the real run contradicts: one verbose line where the user gets two, and no
warning where the user gets one. Neither could see a line added or dropped inside the mocked
collaborator. That is an inference from the mock's shape; `loader.ts` is outside this lane and was
not mutated.

## Fix Applied

Both specs now run unmocked. Each asserts the whole output the real run produces:

- the stacks spec asserts `vi.mocked(verbose).mock.calls` equals both lines, in order;
- the frontmatter spec asserts `warn` is called exactly once, with the SKILL.md path.

Both rewritten specs are now held to the whole output of a real run. The frontmatter spec was run
red against a mutation that makes `matrix-loader.ts` warn a second time
(`if (unreadable !== undefined)` → `if (true)`). The mocked form would have caught that one as well,
so the gain is the collaborator's half, which only the unmocked form counts.

Census over `src`, 2026-10-20: specs that mock the logger, mock a collaborator besides it, and
assert an exact count or absence on logger output.

```
grep -rlE 'vi\.mock\("[^"]*utils/logger"' src --include='*.test.ts' --include='*.test.tsx' | xargs grep -lE 'vi\.mock\("[^"]*(config-loader|/loading|utils/fs|operations|loader|source-loader|project-config|config")' | xargs grep -lE '(warn|verbose|log)\)\.(not\.toHaveBeenCalled\(\)|toHaveBeenCalledExactlyOnceWith|toHaveBeenCalledTimes)|(warn|verbose)\)\.mock\.calls\)\.toStrictEqual'
```

It returned two files, after the fix:

- `plugins/plugin-settings.test.ts` mocks only `utils/fs`, which logs nothing
  (`grep -c 'verbose(\|warn(' src/cli/utils/fs.ts` → 0). Not an instance.
- `plugins/plugin-discovery.test.ts` also mocks `../loading` and `../hosts/host-for.js`. Its
  exactly-once `verbose` assertion has not been checked against what those modules log. Unverified.

The census is a sample with a narrow net. It names collaborators by path fragment, so a mocked
module outside that list is not seen.

## Proposed Standard

This belongs in `packages/cli/CLAUDE.md` → "Test Assertions", as a sibling of "NEVER let a spec's
NAME claim validation that its mocks have removed". That rule covers a mocked parser. This is the
same shape for a mocked logger caller:

> NEVER assert an exact count, sequence or absence of logger output in a spec that mocks a
> collaborator which itself logs. The mock silences the collaborator's lines, so the assertion
> describes output no run produces. Drop the mock for that spec, or assert presence only.

Cross-checked against CLAUDE.md: it does not conflict. It narrows "NEVER encode a known gap in an
assertion's ARITY, LENGTH or ABSENCE" to the case where the arity comes from a mock rather than a
gap.
