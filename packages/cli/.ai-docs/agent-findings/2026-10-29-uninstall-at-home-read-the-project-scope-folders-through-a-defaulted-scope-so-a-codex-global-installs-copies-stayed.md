---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/commands/uninstall.tsx
  - src/cli/lib/installation/install-base-dir.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-29
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  Landed: `detectUninstallTarget` passes the scope of the installation at its root (global at home)
  to `resolveInstallPaths`, and no call in `src` relies on the default any more. Pending: the
  `scope` parameter of `resolveInstallPaths` still has a default, so nothing stops the next call
  from leaning on it; that file is another lane's and the change is reported, not made.
---

## What Was Wrong

`detectUninstallTarget` in `commands/uninstall.tsx` called `resolveInstallPaths(projectDir)` with no
scope, so the parameter's default `"project"` applied, though at home the installation is the global
one. For Claude both scopes name home's `.claude/` folders, so nothing showed. For Codex they do not:
a project's copies live in `~/.agents/skills`, a global installation's in `$CODEX_HOME/skills` (else
`~/.codex/skills`). A Codex global eject install from home, then `uninstall --yes` from home, removed
the role files and the config but left the ejected skill in `$CODEX_HOME/skills/<id>`; with
`CODEX_HOME` relocated, the role files stayed too.

CLAUDE.md's Scope Awareness section already says to call `resolveInstallPaths(projectDir, scope)`
"with the explicit scope parameter". The default made breaking that rule compile.

Census on 2026-10-29, after the fix (empty means no call relies on the default):

```
grep -rnE "resolveInstallPaths\([a-zA-Z]+\)" packages/cli/src --include="*.ts" --include="*.tsx" | grep -v test
```

It is the same class as
`2026-10-21-init-at-home-names-the-project-scope-folders-so-a-codex-global-install-is-reported-where-it-was-not-written`,
which names the remaining home-directory branches that assume the two scopes share folders.

## Fix Applied

`detectUninstallTarget` computes the target's scope once (`"global"` at home, else `"project"`)
and passes it to `resolveInstallPaths` and to the target. Pinned by
`uninstall.test.ts` ("removes the copy and the compiled sub-agent from where the host keeps them",
Claude as the control, Codex with `CODEX_HOME` unset and relocated) and by
`codex-uninstall-reports-what-it-observed.e2e.test.ts`.

## Proposed Standard

Make `scope` a required parameter of `resolveInstallPaths` in
`src/cli/lib/installation/install-base-dir.ts`. Then a call that leans on a default fails to compile,
which is the check that would have caught this one. This is the code-side form of the existing
CLAUDE.md rule, so it does not conflict with it. The CLAUDE.md sentence can then point at the
signature rather than restate it.
