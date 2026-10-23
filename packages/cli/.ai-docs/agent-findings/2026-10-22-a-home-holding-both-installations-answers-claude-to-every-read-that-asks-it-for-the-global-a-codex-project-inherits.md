---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/lib/doctor/installation-reads.ts
  - src/cli/lib/config-gate/index.ts
  - src/cli/lib/agents/write-compiled-agents.ts
  - src/cli/lib/operations/skills/discover-skills.ts
  - src/cli/commands/init.tsx
standards_docs:
  - CLAUDE.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  The doctor read and the uninstall deregistration are repaired: a `deregister-project` mutation
  carries the project's provider and `mutateGlobal` edits that provider's global
  (uninstall-under-a-home-holding-both-global-installations.e2e.test.ts, Codex red, Claude the
  control). The other reads the census lists still ask the home folder. One is now reproduced:
  `compile --verbose` in a Codex project under a home holding both reads its global copied-in
  skills from the home's `.claude/skills`, exit 0. The census grep misses the same shape spelled
  `resolveInstallPaths(<dir>, "global")`, as in `operations/project/compile-agents-all-scopes.ts`.
---

## What Was Wrong

A project inherits only its own provider's global installation. `writeFromProjectContext` in
`config-gate/index.ts` states it ("each provider family inherits and propagates only within
itself") and loads the global through the project's provider. Reads elsewhere ask
`providerInUse(<home>)` instead, and a home holding a Claude and a Codex global answers Claude, by
roster order, whatever the project is on.

`hostsOnDisk` in `doctor/installation-reads.ts` was one: in a Codex project under such a home,
doctor looked for the Codex global's ejected skill in `~/.claude/skills`, warned
`1 skill missing from disk … (not found in .claude/skills/)` and said
`The global installation is on .agents-inc/claude/`, exit 0. It is the sibling 3 that
`2026-10-22-a-load-told-which-installation-it-is-about-still-read-the-other-installations-copied-in-skills`
left unrepaired; that finding's census covered `loading/*.ts` and `installation-reads.ts` only.

Census, the whole of `src`:

```
grep -rn "providerInUse(os.homedir())\|providerInUse(homeDir)\|providerInUse(home)\|providerInUse(installBaseDir(" src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

- `config-gate/index.ts` `mutateGlobal`, reached from a project by `uninstall`
  (`deregister-project`). Reproduced: `uninstall --yes` in a Codex project under a home holding both
  exits 0 and leaves the project in the Codex global's `projects`; the deregistration read the
  Claude global, which never listed it. `writeFromHome`, and `eject`'s `recordSourceInGlobal`, are
  not hits: they run at home, where the run is about the home and acting commands refuse a home
  holding both until `--provider` names one.
- `agents/write-compiled-agents.ts`, the global host of `writeCompiledAgentsByScope`: a
  global-scoped sub-agent compiled from such a project would be written for Claude. Read, not
  reproduced.
- `operations/skills/discover-skills.ts` (`globalSkillsRoot` and the global scope of the two
  `installBaseDir` reads) and `commands/init.tsx` (`agentCodec` at global scope): the same shape.
  Read, not reproduced.

## Fix Applied

`hostsOnDisk` takes the project's own provider for the global where the home holds an installation
of it; a home holding only the other provider is read as before. Red, then green:
`installation-reads.test.ts` "reads a home holding both installations as the %s project's own
provider's global" (Codex red, Claude the control), and
`e2e/lifecycle/codex-doctor-under-a-home-holding-both-global-installations.e2e.test.ts`, each
provider with no terminal and at a 120-column PTY (Codex red on the Layout row and
`! 1 skill missing from disk`; Claude green throughout). The rest of the census is unrepaired.

## Proposed Standard

For `packages/cli/CLAUDE.md` under "Scope Awareness": a read of the global installation a project
inherits names the project's provider, never `providerInUse(os.homedir())`, which answers by
roster order where the home holds both. Not checked against an existing standard beyond
CLAUDE.md, which says nothing on it. The census above is the check.
