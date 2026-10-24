---
type: missing-standard
severity: low
affected_files:
  - apps/server/vitest.config.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: api
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  Rule 3 of the rate-limiter section in standards/editor-and-worker.md: replace a collaborator
  through its binding or app.request's bindings argument, never vi.mock a module src/index
  imports, and plant a key mutant through a vite transform hook in a throwaway config. Reproduced
  under @cloudflare/vitest-pool-workers 0.20.1 through SELF.fetch and app.request alike.
---

## What Was Wrong

Under `@cloudflare/vitest-pool-workers` 0.20.1, a spec can mock `src/compose` and still be running
the real handler.

A probe mocked `src/compose`'s `compose` handler to answer 299:

- The handler the spec imports directly was the mock.
- `app.request("/compose", …, env)`, with `app` imported from `src/index`, answered 401 (no
  session). That is the real handler.
- `SELF.fetch("/compose", …)` also answered 401.

A factory of `() => import("./compose.mutant")` was never even evaluated (the module's load line
never printed). The spec passed 16/16 against the unmutated route.

Inference, not established: `src/index` is the worker's `main`, and its copy of `./compose` was
bound before the spec's mocks registered.

The probe ran from `apps/server/.wrangler/probe/`, outside `src/`. A mock of a module the spec
imports directly did reach it from there, so the mock's path resolved.

## Fix Applied

None. Discovery only. `grep -rn "vi.mock" apps/server/src` returns nothing, so no spec relies on
such a mock today.

## Proposed Standard

For `standards/editor-and-worker.md`: in the worker's suite, replace a collaborator through its
binding (`vi.spyOn(env.X, …)`), or mount the handler under test on its own `OpenAPIHono` app with
the same bindings. Never `vi.mock` a module that `src/index` imports. A spec that does so reads as
mocked and runs the real code.
