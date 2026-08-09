---
type: architectural-drift
severity: low
affected_files:
  - src/cli/lib/stacks/stack-installer.ts
  - src/cli/lib/stacks/stack-plugin-compiler.ts
  - src/cli/lib/stacks/index.ts
standards_docs:
  - .ai-docs/reference/features/built-in-catalogue.md
date: 2026-08-09
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: scope-discipline-deferred
status: resolved
resolved_by: >-
  CLI-459 took the second option — the chain is deleted, not wired to a command. `stack-installer.ts`,
  `stack-plugin-compiler.ts` and their specs are gone, along with `install-compile.test.ts` and the
  symbols only they reached (`StackPluginOptions`, `CompiledStackPlugin`,
  `printStackCompilationSummary`, `createMockCompiledStackPlugin`, `generateStackPluginManifest`,
  `StackManifestOptions`, `convertStackToCompileConfig`). The `lib/stacks` barrel now re-exports
  `stacks-loader.ts` alone.
---

## What Was Found

CLI-455 scopes `loadStackById` to the source that owns the stack, so both of its callers had to be
handed the source identity. One of them — `stack-plugin-compiler.ts::compileStackPlugin` — is
reachable in production from nothing.

The chain above it is:

```
installStackAsPlugin  (stack-installer.ts)   <- no caller in src/
  compileStackToTemp  (stack-installer.ts)   <- called only by installStackAsPlugin, and by specs
    compileStackPlugin (stack-plugin-compiler.ts)
```

`grep -rn "installStackAsPlugin\|compileStackToTemp" src e2e` returns the definitions, the
`lib/stacks/index.ts` barrel re-export, and `stack-installer.test.ts`. No oclif command, no
operation, no wizard path calls any of them; the barrel export is the only thing keeping them
linked. The compiler is exercised in earnest by four spec files, all of which construct its options
directly.

Threading the ruling through it meant adding a required `source: string` to three option types
(`StackPluginOptions`, `StackInstallOptions`, and `compileStackToTemp`'s inline options) and
updating ~17 call sites, every one of them a spec. That is the honest shape — a compiler that
resolves a stack by id must know which source the id belongs to — but the whole plumbing run serves
a path no user reaches.

## Why It Matters

A dead path with live specs reads as a supported surface. Every future ruling about stack
resolution pays this cost again, and its specs report green over behaviour no command performs, so
the suite's coverage claim is broader than the product's.

`compileStackPlugin` also carries a second test-only affordance: `StackPluginOptions.stack`, whose
comment says it "bypasses loading from config/stacks.ts". Nothing in `src/` passes it. It exists so
specs can compile a stack without writing one to disk.

## Recommendation

Decide the surface deliberately, in a task of its own — not inside a ruling about scoping:

- If stack→plugin installation is still wanted, give it a command and wire the source through from
  the same `sourceResult.sourceConfig.source` the eject path reads.
- If it is not, delete `stack-installer.ts`, its spec, and the barrel exports; `compileStackPlugin`
  keeps only the callers that build marketplace bundles.

Nothing was removed here: the ruling's scope is the tab bar, `loadStackById` and its callers'
failure reporting, and deleting a published-barrel surface is not that.
