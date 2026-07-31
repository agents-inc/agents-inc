---
type: standard-gap
severity: medium
affected_files:
  - src/cli/commands/uninstall.tsx
  - src/cli/lib/configuration/project-config.ts
standards_docs:
  - .ai-docs/reference/commands/index.md
  - CLAUDE.md
date: 2026-07-30
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

D-273 changed `loadProjectConfigFromDir` from "returns `null` when the config is
unusable" to "returns `null` only when the file is ABSENT; throws
`ConfigLoadError` when it exists but cannot be loaded". That converted every one
of its ~15 production call sites into a site that must now make an explicit
choice: **abort** (a corrupt config makes the operation unsafe) or **degrade**
(the operation must still run without it).

Most sites were audited and carry the decision in a comment — `installation.ts`,
`compile.ts` (hard-errors), `detect-project.ts` (returns null), the per-project
loop in `propagateGlobalChangesToProjects` (skips), and the
`deregisterProjectPath` call in `uninstall.tsx` (warns and continues).

One was missed. `detectUninstallTarget` loaded the config inside a `Promise.all`
with `.then((result) => result?.config ?? null)` and no `.catch`. The rejection
escaped `run()` and aborted the command — so `uninstall` died before deleting
anything precisely when the config was corrupt, which is when a user most needs
to uninstall. The same file's `deregisterProjectPath` call site already carried a
comment stating that a corrupt config must never fail the uninstall, so the
command contradicted its own documented intent two functions apart.

The `.then()`-inside-`Promise.all` shape is what hid it: the throw is not
lexically near a `try`, and the surrounding five array members are all
non-throwing `fileExists` / `directoryExists` calls, so the block reads as
total.

## Fix Applied

Extracted `loadUninstallConfig(projectDir, onLoadFailed)` in `uninstall.tsx`. It
catches `ConfigLoadError` only (any other error still propagates), reports the
reason through a callback the command renders with `this.warn`, and returns
`null` so planning continues with the same posture as a missing config. Verified
against corrupt, blank, and schema-violating configs at both project and global
scope: the manifest is removed and the command exits 0.

## Proposed Standard

Two additions:

1. In `src/cli/lib/configuration/project-config.ts`, extend the
   `loadProjectConfigFromDir` docblock with: "Every caller must declare a posture
   for `ConfigLoadError` — abort or degrade — at the call site. There is no safe
   default: swallowing it silently makes a broken install look absent, and
   letting it escape aborts commands that must survive it."
2. A general rule worth a line in CLAUDE.md's Error handling bullet: **when a
   function is changed from returning a sentinel to throwing, the change is not
   complete until every call site has been visited and its posture recorded.**
   A `Promise.all` member is a call site — an awaited `.then()` chain hides the
   throw as effectively as a missing `try`.
