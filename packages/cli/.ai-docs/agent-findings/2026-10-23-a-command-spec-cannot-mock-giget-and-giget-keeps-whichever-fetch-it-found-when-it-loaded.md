---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/src/cli/lib/__tests__/helpers/shared-marketplace-checkout.ts
  - packages/cli/src/cli/lib/__tests__/helpers/shared-marketplace-checkout.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/doctor.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/doctor-content.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-10-23
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  `serveDefaultMarketplaceHere` in `shared-marketplace-checkout.ts` serves a one-file stand-in for
  the default marketplace on 127.0.0.1 and points `GIGET_GITHUB_URL` at it. `doctor.test.ts` and
  `doctor-content.test.ts` start it in `beforeEach` and stop it in `afterEach`. The helper's own spec
  has giget download the stand-in.
---

## What Was Wrong

Once doctor downloads on every run, every doctor command spec over the default marketplace calls
giget. Two facts that nothing records decide what that call does.

1. **`vi.mock("giget")` cannot reach it.** `runCliCommand` calls oclif's `run`, which loads
   commands from `./dist/commands` (`package.json` -> `oclif.commands.target`) with a native
   `import()`. The bundled source-fetcher's `import "giget"` therefore never passes through
   vitest's module graph. Only the specs that call `fetchFromSource` from source
   (`source-fetcher-*.test.ts`) can mock giget.
2. **giget keeps the `fetch` that existed when it first loaded.** giget imports
   `node-fetch-native/proxy`. In node that resolves to `proxy.cjs`, which requires
   `node-fetch-native`, and `index.cjs` binds `fetch = globalThis.fetch` once, at load. If a spec
   stubs `globalThis.fetch` before giget first loads, giget uses that stub for the rest of the worker.
   `vi.unstubAllGlobals()` does not undo it. The doctor specs stub `fetch` with a bodiless `Response`
   in every `beforeEach`, so the result depends on load order. Today giget loads at import time,
   through `shared-marketplace-checkout.ts`, which imports it for the global setup's checkout.

Without a seam, each doctor spec over the default marketplace would download the real
`github:agents-inc/skills` (tens of megabytes extracted) from GitHub.

## Fix Applied

`GIGET_GITHUB_URL` is read by giget's GitHub provider at call time, so it reaches the dist-loaded
giget. The helper serves a one-file tarball under a fixed ETag, sets the variable, and returns the
call that restores it and closes the server. It lives in the module that imports giget, so any spec
that uses it has loaded giget before its first `beforeEach` stubs `fetch`. The spec's stub still
answers doctor's own questions. For the default marketplace, the downloaded files are never read:
its matrix is `BUILT_IN_MATRIX`.

## Proposed Standard

Add to `packages/cli/CLAUDE.md` under Test Data. A command spec reaches third-party modules through
`dist/`, so `vi.mock` of a dependency is inert there. Redirect the dependency through what it reads
at call time instead (an environment variable or a loopback server). A dependency that binds
`globalThis.fetch` at load has to load before any spec stubs `fetch`. No conflict with CLAUDE.md
found. The rule that forbids network in unit specs is unwritten, and this finding does not add it.
