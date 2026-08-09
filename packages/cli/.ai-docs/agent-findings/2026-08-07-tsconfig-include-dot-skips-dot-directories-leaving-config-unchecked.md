---
type: standard-gap
severity: low
affected_files:
  - packages/ui/tsconfig.json
date: 2026-08-07
reporting_agent: web-tester
category: typescript
domain: infra
root_cause: rule-not-visible
status: resolved
resolved_by: "packages/ui/tsconfig.json now includes `.storybook/*.ts` explicitly beside `.`, with a comment naming the reason; verified with `tsc --listFiles`."
---

## What Was Wrong

`packages/ui/tsconfig.json` declared `"include": ["."]`, which reads as "every
file in this package". It is not. TypeScript's wildcard include **skips
directories whose name begins with a dot**, so adding `.storybook/main.ts` and
`.storybook/preview.ts` produced two files that were neither type-checked by
`tsc --noEmit` nor parseable by ESLint — the latter failing loudly with:

```
Parsing error: .storybook/main.ts was not found by the project service.
```

The ESLint error is the only reason this was noticed. `tsc` said nothing at all:
it exited 0 while silently covering neither file, which is the worse half of the
behaviour. A config file that decides how the whole test suite is built was
outside the typecheck gate, and the gate was green.

Two further details cost a cycle each and are worth recording:

1. **Naming the directory is not enough.** `"include": [".", ".storybook"]`
   still skips it — verified with `tsc --listFiles`. The pattern has to reach a
   file glob: `".storybook/*.ts"`.
2. **Once included, the files are actually checked**, which immediately
   surfaced a real error the package had no way to see before —
   `preview.ts`'s `import "../src/styles/globals.css"` has no type declaration.

## Fix Applied

```jsonc
// `.storybook` is named because TypeScript's wildcard include skips
// directories beginning with a dot, so `"."` alone leaves the Storybook
// config untyped — and ESLint's project service then refuses to parse it.
"include": [".", ".storybook/*.ts"],
```

The CSS import is declared with a file-local `/// <reference types="vite/client" />`
in `preview.ts` rather than by adding `"types": ["vite/client"]` to
`compilerOptions` — setting `types` at all switches off automatic `@types`
discovery for the whole package, which is a much larger change than the problem
warrants.

Verified with `tsc --noEmit --listFiles | grep .storybook` (both files present)
and a clean `eslint` run.

## Proposed Standard

> **`"include": ["."]` does not mean "everything".** Any dot-directory holding
> TypeScript — `.storybook`, `.config`, `.github/scripts` — needs its own
> explicit glob, and the glob must name files rather than the directory.

This is worth a line in whichever standards doc covers the shared TypeScript
configs, because the failure mode is asymmetric and that is what makes it
dangerous: **ESLint fails loudly and `tsc` fails silently.** A package with no
lint step, or one whose lint config does not reach the directory, would carry
unchecked TypeScript indefinitely with a green typecheck.

It also connects to an existing repository concern. `bun run deps:check` already
runs `packages/cli/scripts/check-shared-tsconfig.ts` because
`packages/cli/tsconfig.json` "extended nothing for months while tsc, eslint,
both suites, tsup and turbo typecheck all stayed green". This is the same class
of defect one level down — not _which config_ is extended, but _which files it
reaches_ — and the same script is the natural place to assert that every
`.ts`/`.tsx` file in a workspace is covered by that workspace's program.
