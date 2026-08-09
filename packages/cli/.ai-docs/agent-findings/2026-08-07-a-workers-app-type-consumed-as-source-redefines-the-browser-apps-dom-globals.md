---
type: missing-standard
severity: medium
affected_files:
  - apps/server/tsconfig.build.json
  - apps/server/package.json
  - apps/editor/package.json
  - apps/editor/src/lib/api/configs.ts
  - turbo.json
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-07
reporting_agent: api-developer
category: architecture
domain: infra
root_cause: convention-undocumented
status: partial
partial_note: The code side landed with SERVER-04 (apps/server emits a declaration, apps/editor consumes it, turbo's lint/typecheck gained `^build`). What is not written down is the rule itself — that a workspace whose source names ambient runtime globals must be consumed as an emitted declaration, never as source — so the next Worker-to-browser type import has nothing to read.
---

## What Was Wrong

Every shared workspace in this repository is consumed **as source**. `packages/matrix` and
`packages/ui` point their `exports` map straight at `./src/*.ts`, and the apps read those files
directly. It works because both packages are plain TypeScript whose only dependency is `zod` —
nothing in them names a type that the consumer's own environment does not already have.

SERVER-04 needed the editor to infer its API client from the worker's Hono `AppType`, and the
obvious move was to wire `apps/server` the same way. It does not generalise, and the reason is not
obvious from the outside:

`apps/server/src/index.ts` names `Env`, the **global** interface `wrangler types` writes into
`worker-configuration.d.ts`. An `import type` does not stop TypeScript pulling the module it names
into the consumer's program, so the editor ends up type-checking the worker's source and cannot
resolve `Env`:

```
../server/src/index.ts(11,30): error TS2304: Cannot find name 'Env'.
```

The tempting fix — add `worker-configuration.d.ts` to the editor's `include` so the name resolves —
is the trap worth recording, because **it appears to work**. It produces exactly one error, and the
error is not about the worker at all:

```
src/features/configure/lib/use-pinned.ts(59,13): error TS2345:
  Argument of type '() => () => Element' is not assignable to parameter of type 'EffectCallback'.
```

That file has nothing to do with the API. What happened is that the 14,714-line Workers runtime
declaration redefines DOM globals, and Cloudflare's `Element` (the HTMLRewriter one) silently
displaced the DOM's. One error is the visible tip: the whole browser app was now compiling against
a different meaning of the shared global names, and `skipLibCheck` is not a defence because these
are not errors _inside_ the `.d.ts`. A version of this that happened to produce **zero** errors
would have been merged without anyone knowing the editor's DOM types had moved.

## Fix Applied

`apps/server` now emits a declaration and the editor consumes that instead of the source:

- `apps/server/tsconfig.build.json` — `emitDeclarationOnly`, entry `src/index.ts` only, so the
  output is one 183-line `dist/index.d.ts`. It compiles nothing; wrangler still builds the worker
  from `wrangler.jsonc`, and `noEmit` stays on in `tsconfig.json` for the typecheck gate.
- `apps/server/package.json` — a `build` script, and an `exports` map whose `types` condition points
  at the emitted declaration while `default` still points at the source.
- The emitted declaration still _mentions_ `Env`, but as an unresolved name inside a `.d.ts`, which
  `skipLibCheck` legitimately drops to `any`. That is harmless here and worth stating explicitly:
  Hono's `Client<T>` reads only the schema generic and never the environment one, so the binding
  the editor cannot see is also the binding it has no use for.
- `turbo.json` — `lint` and `typecheck` gained `^build`. Without it a cold checkout type-checks the
  editor against a declaration that has not been generated yet, and reports a missing module rather
  than an unbuilt dependency. `test` had carried `^build` all along for the same reason.

## Proposed Standard

Add to `.ai-docs/standards/typescript-types-bible.md`, in a new section on cross-workspace type
consumption:

> **A workspace is consumed as source only if its source names nothing ambient.** `packages/*` here
> qualify — plain TypeScript over `zod`. A workspace whose source depends on ambient globals from a
> runtime declaration (`wrangler types`' `Env`, `@types/node`, DOM) must publish an emitted `.d.ts`
> and point its `exports` `types` condition at it. `import type` does not cut the module graph; only
> a declaration boundary does.
>
> **The check is not "does it compile".** Pulling a foreign runtime's globals into a consumer can
> compile while silently redefining shared names — `Element`, `Response`, `fetch`, `Headers`. After
> wiring a cross-workspace type import, confirm the consumer's error count is unchanged **and** that
> no error appeared in a file unrelated to the import. An unrelated file failing is the signature of
> this class of mistake, not a coincidence.
>
> **A generated type is a build output.** Any turbo task that resolves it — `lint` and `typecheck`,
> not just `test` — needs `^build`.
