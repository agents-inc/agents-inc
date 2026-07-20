---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/skills/source-switcher.ts
standards_docs:
  - .ai-docs/reference/concepts/scope-system.md
date: 2026-07-19
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: Pass 8 Cluster D item 8 — migrateLocalSkillScope now resolves the home dir via installBaseDir() at runtime.
---

## What Was Wrong

`migrateLocalSkillScope` in `source-switcher.ts` computed the global base directory
from the `GLOBAL_INSTALL_ROOT` constant:

```ts
const fromBaseDir = fromScope === "global" ? GLOBAL_INSTALL_ROOT : projectDir;
```

`GLOBAL_INSTALL_ROOT = os.homedir()` is evaluated ONCE at module-load time. Tests
that mock the home directory (via `os.homedir` spy or `$HOME`) after the module is
already loaded do not affect this captured value, so scope migrations in tests (and
any runtime home-dir override) silently used the real home directory — a latent bug
that only surfaces when the home dir is mocked/changed.

## Fix Applied

Switched to the runtime resolver `installBaseDir(projectDir, scope)` (from
`installation/install-base-dir.ts`), which calls `os.homedir()` at call time. This
is the same helper `resolveInstallPaths` already uses, so scope migration now agrees
with every other runtime `os.homedir()` caller and with test home-dir mocks.

```ts
const toScope: SkillScope = fromScope === "global" ? "project" : "global";
const fromBaseDir = installBaseDir(projectDir, fromScope);
const toBaseDir = installBaseDir(projectDir, toScope);
```

## Proposed Standard

Never capture `os.homedir()` at module-load time for paths that participate in
scope resolution. Resolve the scope base directory at call time via
`installBaseDir(projectDir, scope)` (or `resolveInstallPaths`). Document this in
`reference/concepts/scope-system.md`: the `GLOBAL_INSTALL_ROOT` constant is only
safe for values that never need to vary within a process (and never in test
home-dir isolation).
