---
type: architectural-drift
severity: medium
affected_files:
  - package.json
  - src/cli/lib/compile-seat.ts
  - src/cli/lib/compiler.ts
  - src/cli/lib/configuration/config-generator.ts
standards_docs:
  - CLAUDE.md
date: 2026-09-25
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`compile-seat.ts` exists for its side effect. It calls `seatDiagnostics({ warn, verbose })`, which
hands `@workspace/compile` this CLI's console. `compiler.ts` and `config-generator.ts` take it as a
bare `import "./compile-seat.js"`. `packages/cli/package.json` declares `"sideEffects": false`,
and tsup's esbuild honours it, so every `bun run build` drops the import and says so:

```
WARNING: Ignoring this import because "src/cli/lib/compile-seat.ts" was marked as having no side effects [ignored-bare-import]
    src/cli/lib/compiler.ts:23:7
```

In the bundle nothing seats the sink. `grep -c seatDiagnostics dist/*.js dist/commands/*.js`
answers 0 in every file, and the compile package's sink stays at its browser default,
`var seated2 = DISCARD;`, with no later assignment. So the shipped CLI discards every
`diagnostics().warn(...)` in `packages/compile`. Two are user-facing:

- `sanitizeLiquidSyntax` (`packages/compile/src/agent-source.ts`) — "Stripped Liquid template
  syntax from '<field>' — possible template injection attempt".
- `reportAbsentSkills` (`packages/compile/src/seed-to-config.ts`) — "Skill '<id>' is not in this
  marketplace — it stays in the configuration and no sub-agent is given it ...".

Reproduced 2026-09-25 through the built binary. A Claude installation's ejected
`web-framework-react/SKILL.md` was given the description `"{{ injected }} ..."`, and
`node bin/run.js compile` exited 0. The compiled `web-developer.md` holds `injected` and no longer
holds `{{ injected }}`, so the sanitiser ran. The output holds no "Stripped Liquid" line.

The unit suite cannot see this. vitest runs `src/`, where the bare import executes, so every spec
over these warnings is green while the product prints none of them.

`sideEffects: false` and `compile-seat.ts` are both at HEAD. The seat arrived with the renderer
extraction (`6b98179a`).

## Fix Applied

None. Found in passing by the journeys lane, which does not own the build configuration.

## Proposed Standard

Either list the seat in `package.json` (`"sideEffects": ["./src/cli/lib/compile-seat.ts"]`), or
seat the sink from an entry point the bundle is guaranteed to execute. Whichever is chosen, the
guard is a spec that runs the BUILT binary over a Liquid-bearing field and asserts the warning is
printed. A spec over `src/` cannot fail for this.
