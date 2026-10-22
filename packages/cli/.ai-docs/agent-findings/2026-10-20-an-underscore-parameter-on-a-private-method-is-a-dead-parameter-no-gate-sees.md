---
type: anti-pattern
severity: low
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/lib/matrix/skill-resolution.ts
  - src/cli/lib/resolver.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-20
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  All three dead parameters are deleted: `logCompletionSummary` in `commands/edit.tsx`, the
  categories chain through `buildResolvedSkillMap` and `buildResolvedSkill`, and `resolveAgents`'
  project root with its arguments. The census now returns only the three parameters below judged
  correct. The proposed standard is not applied.
---

## What Was Wrong

`Edit.logCompletionSummary(_changes: ConfigChanges)` took the run's changes and never read them: the
method prints `✓ Done` or nothing. Its only caller passed `changes` in. A reader of the call site
takes the argument to mean the summary depends on the changes, and it does not.

Nothing can report this. `@typescript-eslint/no-unused-vars` carries `argsIgnorePattern: "^_"` in
both `packages/cli/eslint.config.js` and `packages/eslint-config/base.js`. TypeScript's
`noUnusedParameters` is off: `packages/typescript-config/base.json` leaves the check to ESLint. That
escape hatch is for a parameter a caller's signature requires by position. On a private method,
whose callers are all in one file, no caller requires it, so the underscore only keeps a dead
parameter alive.

This is the parameter form of the `_error` rule in `CLAUDE.md`. That rule covers a caught error
renamed to silence the lint report.

## Fix Applied

Deleted the parameter and the argument.

Census, over production code in `src/cli` and `scripts`, from `packages/cli`:

```
grep -rnE "(^|[(,])\s*_[a-zA-Z]\w*\??\s*(:|=[^>=])" src/cli scripts | grep -v __tests__ | grep -v "\.test\.ts"
```

It matches a parameter on its own line, which is how Prettier wraps a long signature. A first
census matched only `(_x:` and `, _x:` and missed both dead sites below. It skips a parameter with
neither a type nor a default: `strict` refuses one on a declared function as an implicit `any`, so
it can only be a callback whose caller supplies the type.

On 2026-10-20 it returned seven parameters on five functions:

- `codexInstallPlugin` and `codexUninstallPlugin` in `src/cli/lib/hosts/codex-host.ts`, two each.
  Correct: the host interface passes scope and project by position.
- `isKept` in `src/cli/lib/seed/seed-apply.ts`. Correct: `rowsWhere` passes the category first and
  the predicate reads only the row.
- `buildResolvedSkill` in `src/cli/lib/matrix/skill-resolution.ts`. Dead: module-private, and its
  one caller passes the categories in.
- `resolveAgents` in `src/cli/lib/resolver.ts`. Dead: its one production caller, in
  `agents/agent-recompiler.ts`, passes the source path in.

## Proposed Standard

`CLAUDE.md` -> "Code Style", beside the `_error` rule: an underscore-prefixed parameter is allowed
only where a caller's signature requires it by position. On a method or function whose every caller
you can see, delete the parameter instead. The census above is the check. A lint rule cannot tell
the two cases apart, because the exemption is keyed on the name and not on the caller.
