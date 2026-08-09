---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/tsconfig.json
  - packages/cli/package.json
  - packages/typescript-config/base.json
  - packages/typescript-config/node.json
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: partial
partial_note: The code side landed — packages/cli/tsconfig.json now extends @workspace/typescript-config/node.json and the package declares the workspace devDependency. What is pending is the detector described under "Proposed Standard"; nothing yet prevents the next workspace from drifting the same way.
---

## What Was Wrong

`packages/cli/tsconfig.json` extended nothing. It restated `target`, `module`, `moduleResolution`,
`strict`, `esModuleInterop` and `skipLibCheck` inline, and set no `lib` — so `target: ES2022`
implied `lib.es2022.full.d.ts`, which includes DOM. A Node CLI type-checked with `window`,
`document`, `name`, `status` and `open` in scope, and a local binding shadowing any of them
resolved against the DOM global rather than erroring. It also missed the four options the shared
base carries for everyone else: `verbatimModuleSyntax`, `isolatedModules`, `moduleDetection:
"force"` and `noFallthroughCasesInSwitch`.

The gap is not that the config was wrong once. It is that it stayed wrong silently. Every gate this
package runs — `tsc --noEmit` three times, `eslint .`, the unit suite, the e2e suite, `tsup`, and
`turbo typecheck` from the root — was green the entire time, because each one reads whatever the
config happens to say. A config that has stopped agreeing with its siblings is invisible to a tool
whose only input is that config.

Two smaller symptoms of the same disconnection, both fixed with it:

- `packages/cli/package.json` was the only workspace that did not declare
  `@workspace/typescript-config` as a devDependency. Resolution worked anyway, on the hoisted
  symlink in the root `node_modules` — so the missing declaration cost nothing and announced
  nothing.
- Two of the six inline options had become inert without anyone noticing. `esModuleInterop: true`
  is the TypeScript 6 default (setting it to `false` is now the deprecation error TS5107), and
  `outDir: "dist"` was never read by anything, because tsup owns the real `dist/` and every `tsc`
  invocation in the package passes `--noEmit`.

## Fix Applied

`packages/cli/tsconfig.json` now extends `@workspace/typescript-config/node.json` and keeps only
`jsx` / `jsxImportSource` — the two options that are genuinely CLI-specific, because Ink is React
and the base has no reason to carry JSX settings for the workspaces that are not. The file carries
a `//`-comment recording why each of the seven dropped options was dropped, in the documented-
decisions style the shared package already uses. `@workspace/typescript-config` was added to the
package's devDependencies, matching the other five workspaces.

Total fallout across 372 source files, 6 script files and 222 e2e files: **one** error —
`src/cli/hooks/init.ts` imported `Hook` from `@oclif/core` as a value under the newly-inherited
`verbatimModuleSyntax`, corrected to `import type`. Zero DOM-shadow errors, zero `isolatedModules`
errors, zero `noFallthroughCasesInSwitch` errors. The divergence had cost the package almost
nothing in accumulated debt — which is precisely why nothing surfaced it.

`tsconfig.scripts.json` and `e2e/tsconfig.json` needed no treatment: both extend
`../tsconfig.json` and inherited the new base transitively.

## Proposed Standard

Add a check that every workspace `tsconfig.json` extends one of the four configs in
`packages/typescript-config/`, and that its package declares `@workspace/typescript-config`. It is
a directory walk over the `workspaces` globs in the root `package.json` plus a string test on the
`extends` field — cheap enough to sit beside the existing generated-artifact drift checks, and the
only kind of check that can see this class of defect at all, because it compares workspaces to each
other rather than reading one in isolation.

Where the rule should live: a `deps:check`-adjacent script wired into the same CI job that runs
`syncpack lint`, with the rule itself stated in `packages/typescript-config`'s own README (the
package currently documents its decisions in `//`-comments inside the JSON and has no prose entry
point). The one judgement call to encode: a workspace with a defensible reason not to extend
should be allowed to opt out by naming itself in the check with a comment, so that the next
divergence is a recorded decision rather than, as here, an absence of one.
