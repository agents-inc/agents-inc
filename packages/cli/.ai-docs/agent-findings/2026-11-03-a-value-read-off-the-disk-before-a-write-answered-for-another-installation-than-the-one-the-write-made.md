---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/installation/install-layout.ts
  - src/cli/commands/init.tsx
  - src/cli/lib/operations/skills/copy-local-skills.ts
  - src/cli/lib/seed/external-skills.ts
standards_docs:
  - CLAUDE.md
date: 2026-11-03
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  Code half done for `init --from`: `whileInstallingInto` in install-layout.ts counts the project as
  holding its own installation for the length of the run, so `inheritedGlobalProvider` answers
  before the save as it does after. The proposed standard is not written, and nothing catches a
  pre-write read that does not go through `inheritedGlobalProvider`.
---

## What Was Wrong

CLI-1028. Under a home holding a Codex installation, `init --from` without `--provider` in a fresh
project installs the project as Claude. Until `writeProjectConfig` saves the project's config, the
folder holds no installation, so `inheritedGlobalProvider` answered the home's provider, Codex. Every
read made before the save answered for the Codex global; every read after it, for the Claude one.

What a user saw, from the L14 review's hand-run before the fix:

- `Installing 1 skill across 1 sub-agent`, then `Compiled 2 agents`.
- `Copied 1 skill to …/.codex/skills/`, then `Skills copied to: …/.claude/skills`, a folder that did
  not exist.
- The first `doctor`: `Skills Installed ! 1 skill missing from disk`.

The reads before the save were the count, the copy folder, the take-back snapshot, the carried
skill's folder, the catalogue load and the config-readable check. Each was right for the disk it
read. The disk changed under them.

## Fix Applied

REPO-55 follow-ups, L14. `whileInstallingInto(projectDir, install)` in install-layout.ts records the
project for the length of the run and clears it in a `finally`. `inheritedGlobalProvider` answers the
project's own provider for a project being installed. `init.tsx` runs its `--from` route inside it.
No other caller was edited: every one of them reaches the provider through `inheritedGlobalProvider`.
`lib/installation/__tests__/a-project-being-installed-inherits-its-own-providers-global.test.ts`
fails if the `finally` goes.

## Proposed Standard

`packages/cli/CLAUDE.md`, beside the scope rules: a run that writes an installation reads the
installation it is about to make, not the folder as it stands, for every read before the write. Name
the state the run is in (`whileInstallingInto`) rather than re-deriving it from the disk.

No check catches a regression. A pre-write read that calls `providerInUse(os.homedir())` directly
skips the fix. Census of such reads, run 2026-11-03 from `packages/cli`:

```
grep -rn "providerInUse(os.homedir())" src/cli --include='*.ts' --include='*.tsx' | grep -v -E '\.test\.|__tests__'
```

Two hits: `inheritedGlobalProvider` itself, and `lib/doctor/installation-reads.ts`, which `doctor`
reaches over an installation already written.

This adds a rule and conflicts with nothing in CLAUDE.md.
