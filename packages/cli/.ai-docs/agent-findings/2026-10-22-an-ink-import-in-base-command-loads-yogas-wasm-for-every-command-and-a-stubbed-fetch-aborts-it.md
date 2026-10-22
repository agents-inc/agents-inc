---
type: architectural-drift
severity: medium
affected_files:
  - packages/cli/src/cli/base-command.ts
  - packages/cli/src/cli/components/common/summary-panel.tsx
  - packages/cli/src/cli/lib/__tests__/commands/doctor-content.test.ts
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: open
---

## What Was Wrong

While building the confirm screens, a helper on `BaseCommand` that rendered the summary panel
through Ink's `renderToString` made `BaseCommand` import Ink. Every command then loaded Ink, and
with it `yoga-layout`, whose emscripten loader prepares its WASM through the global `fetch` when one
is defined. `doctor-content.test.ts` stubs `fetch` in `beforeEach` with
`vi.fn(async () => new Response(null))`, so the load got an empty body and `doctor` aborted:

```
failed to asynchronously prepare wasm: CompileError: WebAssembly.instantiate(): BufferSource argument is empty
Aborted(CompileError: WebAssembly.instantiate(): BufferSource argument is empty)
```

`doctor` draws nothing with Ink. Its specs went red only because the base class every command
extends had picked up a rendering import.

## Fix Applied

The panel printing moved out of `BaseCommand` into `summaryPanelBlock` in
`components/common/summary-panel.tsx`, called by the three commands that show a panel (`init`,
`edit` and `uninstall`), which already load Ink. `BaseCommand` imports no Ink module, and the doctor
specs are green.

## Proposed Standard

`BaseCommand` imports no module that reaches `ink` or `yoga-layout`, because whatever it imports
every command loads. No rule says so, and no check would catch it: the only signal was a spec that
happened to stub `fetch`. Candidate check: an ESLint `no-restricted-imports` scoped to
`src/cli/base-command.ts` for `ink` and `../components/**`. That catches the direct import only, not
one through a utility module. Proposal only; not written.
