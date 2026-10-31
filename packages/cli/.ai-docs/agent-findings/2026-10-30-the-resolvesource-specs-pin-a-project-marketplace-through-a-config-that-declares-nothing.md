---
type: convention-drift
severity: medium
affected_files:
  - src/cli/lib/__tests__/factories/config-factories.ts
  - src/cli/lib/configuration/config.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-30
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: premise-expired
status: open
---

## What Was Wrong

`buildSourceConfig()` returns `{ marketplace, ...overrides }`: no `skills`, no `agents`. Written into
a project folder, that is a config that declares nothing, which the owner ruled on 2026-10-24 counts
as no installation at all. The `resolveSource` specs in `config.test.ts` that pin "a project config
naming a marketplace is read first" (`sourceOrigin: "project"`) almost all build that config this
way, so their subject is now the declares-nothing edge, not an ordinary project installation.

When the factory was written, any project config was an installation, so the shape was the minimal
honest fixture. The ruling made it a special case and nothing flagged the specs riding on it. It
surfaced when CLI-1000 (a declares-nothing config picks the global installation's marketplace) had
to ask whether a declares-nothing config that names a marketplace is still read: these specs say yes
by accident, not by decision.

Census command (the sites in that file writing it into the project folder):

```
grep -n "writeTestTsConfig(tempDir, buildSourceConfig" src/cli/lib/configuration/config.test.ts
```

The config-precedence journey does the same through a local `createProjectConfig` helper that writes
a partial config (marketplace only):

```
grep -n "createProjectConfig(projectDir" src/cli/lib/__tests__/user-journeys/config-precedence.test.ts
```

Other spec files using the factory (not checked one by one):

```
grep -rln "buildSourceConfig" src --include='*.test.ts'
```

## Fix Applied

None. This is discovery only. The new CLI-1000 specs build the declares-nothing config with
`buildProjectConfig({ skills: [], agents: [] })` and the declaring control with `buildProjectConfig()`,
so each one's subject is visible in its fixture.

## Proposed Standard

In `CLAUDE.md` (this package's) § Test Data: a spec whose subject is a project installation builds its
config with `buildProjectConfig()` (it declares a skill and a sub-agent). `buildSourceConfig()` is for
a source repo's config or a home-root (global) config, where declaring nothing does not change what
the config is. This does not conflict with any NEVER/ALWAYS rule there. Applying it to the census
above should wait until the owner answers whether a declares-nothing config's named marketplace is
read, since the answer decides which of those specs keep their expected value.
