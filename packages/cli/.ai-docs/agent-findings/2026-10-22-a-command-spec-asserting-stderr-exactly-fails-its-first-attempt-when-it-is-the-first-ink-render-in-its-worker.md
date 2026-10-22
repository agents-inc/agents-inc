---
type: standard-gap
severity: low
affected_files:
  - packages/cli/src/cli/lib/__tests__/helpers/mock-worker.ts
  - packages/cli/vitest.config.ts
  - packages/cli/src/cli/lib/__tests__/commands/init-from-says-what-it-did.test.ts
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`yoga-layout` (Ink's layout engine) loads its wasm with `fetch` on a `data:` URL whenever `fetch`
is a function (`node_modules/yoga-layout/dist/binaries/yoga-wasm-base64-esm.js`). `useMockWorker`
listens with `onUnhandledRequest: "error"`, so the first Ink render in a Vitest worker prints
`[MSW] Error: intercepted a request without a matching request handler: • GET null` followed by
the whole base64 module to stderr. The fetch rejects, yoga decodes the base64 itself, and the
command carries on.

A spec that pins stderr with `toBe` therefore fails its first attempt whenever it is the first Ink
render in its worker. The `commands` project's `retry: 1` hides this, because the retry runs in a
worker where yoga has already loaded. It shows under `--retry=0`, or when `-t` makes such a spec
the first to run:

```
npx vitest run --retry=0 -t 'warns which skills the catalogue does not know' \
  src/cli/lib/__tests__/commands/init-from-says-what-it-did.test.ts
```

That run fails with `expected '[MSW] Error: intercepted a request wi…' to be 'Warning: Skipped 1
skill(s) this cata…'`. Without `--retry=0` the same spec passes, marked `(retry x1)`. The other
exact-stderr specs were not counted: whether one fails depends on which spec renders first in its
worker.

## Fix Applied

None — discovery only. `mock-worker.ts` is a shared helper outside the lane that found this.

## Proposed Standard

`useMockWorker` should let `data:` URLs through and keep refusing every other unhandled request:
`onUnhandledRequest: (request, print) => { if (!request.url.startsWith("data:")) print.error(); }`.
Its gate is the `--retry=0` command above going green. Until then, `retry: 1` on the `commands`
project is covering a deterministic first-render failure as well as real flakes, and nothing says
which of the two a `(retry x1)` is.
