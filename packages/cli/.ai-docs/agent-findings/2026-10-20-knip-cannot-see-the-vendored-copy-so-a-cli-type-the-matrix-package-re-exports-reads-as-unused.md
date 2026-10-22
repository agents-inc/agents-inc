---
type: standard-gap
severity: low
affected_files:
  - knip.jsonc
  - packages/cli/src/cli/types/matrix.ts
  - packages/matrix/src/index.ts
standards_docs:
  - packages/cli/.ai-docs/standards/typescript-types-bible.md
date: 2026-10-20
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`knip` (2026-10-20 run, "Unused exported types") lists `ValidationError` in
`packages/cli/src/cli/types/matrix.ts`. It is not unused. `scripts/generate-matrix-package.ts` copies
that file byte for byte to `packages/matrix/src/vendor/matrix.ts`. `packages/matrix/src/index.ts`
re-exports `ValidationError` from `./vendor/matrix`, and `packages/compile/src/types.ts` and
`selection.ts` import it from `@workspace/matrix`.

knip cannot see this. `knip.jsonc` ignores `src/vendor/**` in `packages/matrix`, and even without
that ignore, the vendored copy is a different file. So knip judges the CLI copy only by readers
inside `packages/cli`. Any CLI type that only the vendored copy carries to another workspace will be
reported as unused.

Removing the export would be caught, so this does not break anything: after `generate:matrix`, the
re-export in `packages/matrix/src/index.ts` would not compile (inferred from TS2305, not run). The
cost is a false row on every `deps:dead` worklist. A sweep agent can only clear it by grepping the
vendor consumers by hand, as this lane did:

```
git grep -n "vendor/" -- packages apps | grep -E 'from|export'
```

## Fix Applied

None. This is a discovery only. `ValidationError` keeps its export. The other vendored-file entries
from the same run were checked against that grep and acted on (C7 lane, REPO-44 step 5).

## Proposed Standard

Mark an export that only the vendored copy uses with `/** @public */`. knip 6.32 never reports an
export with that tag (`isAlwaysIgnored` in `node_modules/knip/dist/util/tag.js`). The alternative is
a `//` note beside the `src/vendor/**` ignore in `knip.jsonc` that names this blind spot. The tag
would be a new convention in this repo, so the owner should decide.
