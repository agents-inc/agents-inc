---
type: standard-gap
severity: low
affected_files:
  - apps/editor/vite.config.ts
  - apps/editor/.env.example
standards_docs:
  - .ai-docs/reference/monorepo-layout.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`npx turbo build` from the repository root fails on `editor#build` when `apps/editor/.env` does not
exist:

```
Error: Invalid environment: VITE_API_URL (Invalid input: expected string, received undefined).
See apps/editor/.env.example for what each one is.
```

The failure is by design at the env-schema level — `.env.example` says outright that "a production
build fails without the required ones" — and the message names the file to copy, which is good
behaviour from the schema. `tsc -b` passes first; only the Vite config load fails. Supplying
`VITE_API_URL` inline makes the whole build succeed.

What is undocumented is the consequence one level up: **`turbo build` is not runnable from a fresh
checkout**, so any agent or contributor told to run the root build gate as a green/red signal gets a
red that has nothing to do with their change. The failure surfaces as `editor#build ERROR ... exited
(1)` in Turbo's summary, several lines away from the schema's helpful message, which makes it look
like a code failure until you re-run the workspace build directly.

## Fix Applied

None — creating `apps/editor/.env` was out of scope and would be machine-local anyway. The gate was
closed for this task by supplying the variable inline
(`VITE_API_URL=http://localhost:8787 npx turbo build`), which succeeds for all three build tasks and
proves the change under test does not break the editor build.

## Proposed Standard

Say in `.ai-docs/reference/monorepo-layout.md` — beside wherever the root task list lives — that
`turbo build` requires `apps/editor/.env` and that copying `.env.example` is a setup step, not an
optional one. Two cheaper alternatives are worth considering instead: give `VITE_API_URL` the
localhost default the dev server already assumes so only production builds demand it explicitly, or
have the editor's `build` script fail with a one-line message naming the missing setup step rather
than a Zod error surfaced through a Vite config-load stack trace.
