---
type: standard-gap
severity: medium
affected_files:
  - apps/server/vitest.config.ts
  - packages/cli/scripts/check-shared-vitest-config.ts
  - packages/cli/scripts/run-check-shared-vitest-config.ts
  - packages/cli/package.json
  - packages/ui/package.json
  - package.json
  - .husky/pre-commit
  - .husky/pre-push
  - packages/cli/.ai-docs/reference/monorepo-layout.md
standards_docs:
  - .ai-docs/reference/monorepo-layout.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  Closed 2026-08-07, all four residuals. apps/server/vitest.config.ts is now
  `mergeConfig(nodeConfig, { plugins: [cloudflareTest(...)] })` and declares
  `@workspace/vitest-config`, so `deps:check` exits 0 with all three axes clean; the suite is
  unchanged at 17 tests and still runs in the Workers runtime, which the pool's own
  `parseProjectOptions` guarantees by accepting exactly `undefined` or `"node"` for `environment`
  and throwing on anything else. The `it.fails` marker in check-shared-vitest-config.test.ts is
  gone and that file is 14/14. Both hooks' `deps:check` greps now match `vitest\.config\.[^/]+`.
  monorepo-layout.md says three checks everywhere and gained a subsection for the third. Proposed
  Standard 3's second half — documenting the `//no-*` opt-out key once as a convention rather than
  twice per check — was the only thing not carried out here, and it landed 2026-08-08 as a
  monorepo-layout.md subsection titled "A workspace that stands apart records it in its own
  package.json", which covers all three keys once while the per-axis subsections now name their
  key and point at it.
---

## What Was Wrong

`apps/server/vitest.config.ts` is standalone. It sets `include: ["src/**/*.test.ts"]`,
`globals: false` and `clearMocks: true` — which is `@workspace/vitest-config`'s node preset,
restated by hand, three settings out of four. The fourth, `environment: "node"`, is the only real
difference, and it is absent because `cloudflareTest()` supplies the Workers runtime instead.
Nothing anywhere records whether that hand-copy was a decision or a drift.

The gap is the same shape as the tsconfig one written up on 2026-08-06, and it was invisible for
the same reason: Vitest reads whatever config it is handed. A suite that has stopped agreeing with
its siblings about globals, includes or `clearMocks` is green in its own workspace and unreadable
from every other one, so `turbo test`, `turbo lint` and both typechecks stay green while the
presets diverge. Only a check that compares workspaces to each other can see it — which is why
this one sits beside `syncpack lint` rather than inside a workspace's own gates.

Two related observations found while building the detector:

- **A text search for the package name would have been worse than no check.**
  `packages/ui/vitest.config.ts` names `@workspace/vitest-config` four times, in the comment
  explaining why it does not use it. A substring match reads that as compliance. The check parses
  the config's top-level `import` and `export ... from` statements with the TypeScript parser
  instead, which is also what makes a re-export (`packages/matrix`) and a merge (`apps/editor`)
  count equally.

- **Both hooks can now miss a change that moves the answer.** `.husky/pre-commit` and
  `.husky/pre-push` run `deps:check` only when a staged or pushed path matches
  `package.json`, `bun.lock` or `tsconfig*.json`. A commit that edits only a `vitest.config.ts`
  changes what the third check answers and triggers neither hook. CI still catches it —
  `check-web` runs `deps:check` unconditionally — so this is a lag, not a hole.

## Fix Applied

The detector, as the third axis of `bun run deps:check`:

- `packages/cli/scripts/check-shared-vitest-config.ts` — judges every workspace: `bound` (its root
  `vitest.config.*` imports or re-exports `@workspace/vitest-config` and its `package.json`
  declares it), `opted-out`, `no-suite` (no root config, so nothing to agree with), or `diverged`.
- `packages/cli/scripts/run-check-shared-vitest-config.ts` — argv, output and exit code, mirroring
  `run-check-shared-tsconfig.ts`.
- `packages/cli/scripts/check-shared-vitest-config.test.ts` — fixture repositories for the shapes
  that cannot coexist here, plus assertions against this repository.
- The exception mechanism copies the tsconfig check exactly: a `//no-shared-vitest-config` key in
  the workspace's own `package.json`, carrying the reason, printed by nothing but read by the
  check. `packages/cli` and `packages/ui` now carry one each. A hardcoded allowlist in the script
  was rejected: it would put the excuse in a file the excused workspace's author never opens.

`apps/server/vitest.config.ts` was deliberately **not** rewritten in that pass. Whether it should
merge the shared preset or record why it stands alone was its owner's call, and the honest state of
the repository was that the check had caught something real and was failing on it.

**Closed later the same day.** It merges the shared preset. The open question the note above left —
whether `environment: "node"` arriving from the shared config would fight the Workers pool — is
answered in the pool's own source: `parseProjectOptions` accepts exactly `undefined` or `"node"` and
throws a `TypeError` on anything else, because it never goes through Vitest's environment mechanism
at all. Seventeen tests before, seventeen after, still against `navigator.userAgent ===
"Cloudflare-Workers"` and a live KV binding.

## Proposed Standard

1. **`.ai-docs/reference/monorepo-layout.md` describes `deps:check` as two checks in at least two
   places** (the gate table around "syncpack, shared-tsconfig", and the CI section's "the other
   half is the shared-tsconfig check"). Both sentences are now wrong by one. The root
   `package.json`'s `//deps:check` comment has been revised; these have not.

2. **Widen both hooks' trigger patterns to include `vitest.config.*`.** The grep in
   `.husky/pre-commit` and `.husky/pre-push` lists the files that can change a cross-workspace
   answer. That list is now one filename short.

3. **State the rule where a config author will meet it:** a workspace that runs Vitest extends
   `@workspace/vitest-config`, or its `package.json` says why not. The `//no-*` key convention now
   has two instances and should be documented once as a convention rather than twice as a
   coincidence.
