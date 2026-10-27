---
type: missing-standard
severity: high
affected_files:
  - apps/editor/playwright.config.ts
  - apps/editor/vite.config.ts
  - apps/editor/e2e/README.md
standards_docs:
  - apps/editor/e2e/README.md
date: 2026-10-26
reporting_agent: web-tester
category: testing
domain: e2e
root_cause: missing-rule
status: open
---

## What Was Wrong

The editor suite's web server is `bun run dev`, Vite's dev server with HMR on. When any file in
the module graph changes on disk, the server pushes an update into every open test page. Saving a
store module, or anything a store imports, runs the store module again in the page. Its state
starts empty, so the selection a spec has just made is gone.

With several lanes working at once, another lane saving an editor source file during an e2e run is
routine. A spec that has just chosen a stack then waits 30 s for a roster Save that stays disabled.
Those were EDITOR-99's two unexplained flakes, each of which passed 3/3 when rerun:

- 'holds the dialog while the save is in flight' ("Save stayed disabled")
- 'an offline mint keeps the name, and Save again stores it once online' ("roster Save not ready
  within 30 s")

Load alone did not reproduce them: 0 failures in 12 loaded runs each, at median loads of 38 to 60
on 16 cores, with peaks up to 78.

Reproduced on 2026-10-26 by changing only the mtime of `apps/editor/src/stores/config-store.ts`,
with its bytes left alone and its mtime restored afterwards:

- Bumped once, after the spec chose a stack: the page got a `js-update` frame, the stack was no
  longer pressed, Save was disabled, and the page did not reload.
- Bumped every 3 s while the two specs ran 5 times each on 2 workers: 3 of 10 timed out, each at
  `configure.roster.saveButton.click()` with "element is not enabled" for the whole 30 s.

The same symptom is recorded elsewhere: a Preview button that stayed disabled in
`preview-matches-install.spec.ts` (W5, 120 s) and `output-preview.spec.ts` (E8, 30 s). This is an
inference: neither was rerun under file changes.

## Fix Applied

None in the suite. `playwright.config.ts` and `vite.config.ts` are outside EDITOR-99's lane.

The fix was checked from outside the tree with a config that is the editor's own plus HMR off:

```ts
// apps/editor/vite.e2e.config.ts
import { defineConfig, mergeConfig } from "vite";

import editor from "./vite.config";

export default defineConfig(async (env) =>
  mergeConfig(await editor(env), { server: { hmr: false } }),
);
```

`playwright.config.ts`'s webServer command then becomes
`bun run dev --config vite.e2e.config.ts --port ${PORT} --strictPort`, and the new file joins
`tsconfig.node.json`'s `include` beside `vite.config.ts`, so type-aware ESLint can parse it. The
check ran an `.mjs` copy of that file from the evidence folder. The same 10 runs, under the
same 3-second bumps, passed 10 of 10. A page boots the code on disk when it loads. What changes
after that never reaches it.

## Proposed Standard

`apps/editor/e2e/README.md` already says the suite never reuses a running server, "because that
would test a different tree". Add after it: **and it serves with HMR off, because a file another
lane saves mid-run would otherwise reach the page a spec is driving.**

`playwright.visual.config.ts` serves a static build and needs nothing. No rule in either `CLAUDE.md`
conflicts. Turning `server.watch` off as well would also stop a later page load from booting a newer
tree. That was not tested and is not proposed.
