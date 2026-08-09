---
type: architectural-drift
severity: low
affected_files:
  - src/cli/hooks/init.ts
  - src/cli/base-command.ts
standards_docs:
  - .ai-docs/reference/commands/index.md
  - .ai-docs/reference/boundary-map.md
date: 2026-08-09
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

The oclif init hook resolves the skills source **before every command** and attaches the result to
oclif's `Config` object, and nothing ever reads it back.

The chain is two hops. `hooks/init.ts` calls `resolveSource(...)` and writes the answer onto the
config through a boundary cast (`ConfigWithSource`). `BaseCommand` exposes it as a public getter:

```ts
public get sourceConfig(): ResolvedConfig | undefined {
  return (this.config as unknown as ConfigWithSource).sourceConfig;
}
```

Grep for the getter across `src/`, `e2e/` and `scripts/` and the declaration is the only hit. Every
command that needs a resolved source calls `loadSource()` / `loadSkillsMatrixFromSource()` and gets
a fresh `ResolvedConfig` inside the `SourceLoadResult`; the two that name `resolveSource` directly
(`compile`, `eject`) call it themselves. `eject`'s `sourceResult?.sourceConfig` is the LOADER's
field of the same name, not this one.

So the hook performs a config-file read (project, then global) on the way into `list`, `search`,
`doctor`, `update`, `build …` and every other command, to fill a slot with no consumer. It is
cheap and harmless, which is exactly why it survived: nothing fails, nothing is slow enough to
notice, and the getter reads as a supported API.

Found while threading the caller identity through `resolveSource` for CLI-466 — the hook is one of
its five production call sites, and the threading is honest there while being, as far as any reader
is concerned, unobservable.

## Fix Applied

None — discovery only, and deliberately so. CLI-466's scope is which commands may NAME a source;
what the hook does with the answer is a separate question, and it has two possible answers rather
than one:

1. Delete the resolution, the `ConfigWithSource` cast and the `sourceConfig` getter. The hook keeps
   its other responsibility (the bare-`cc` dashboard).
2. Keep it and give it the reader it was written for: a command that wants the resolved source
   WITHOUT loading a matrix currently has no cheap way to ask.

Both are one small commit; neither is this task's.

## Proposed Standard

`deps:dead` (knip) reports unused exports, and a getter on a class is not an export — so the tool
that would have caught this cannot see it. The rule worth writing, in
[`leaf-exports.md`](../reference/leaf-exports.md) beside the existing entries: **a boundary cast
that publishes a value onto a framework object needs a named reader, and the reader belongs in the
same note as the writer.** The cast in `hooks/init.ts` and the getter in `base-command.ts` each
document the other end of a wire that goes nowhere; a single line naming the consuming command
would have made the gap visible at either end.
