---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/installation/installation.ts
  - src/cli/lib/__tests__/factories/installation-factories.ts
  - src/cli/lib/__tests__/commands/edit.test.ts
  - src/cli/lib/__tests__/integration/installation.test.ts
  - src/cli/lib/installation/installation.test.ts
  - src/cli/lib/plugins/plugin-info.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`Installation.skillsDir` (built in `detectInstallationInDir`, `installation.ts`) is
`path.join(dir, CLAUDE_DIR, mode === "plugin" ? PLUGINS_SUBDIR : STANDARD_DIRS.SKILLS)` for every
provider. For a Codex installation it names `.claude/skills` or `.claude/plugins`. That is a folder
Codex never reads. The `agentsDir` beside it goes through `agentsDir(provider, scope, dir)` and is
right.

Nothing reads the wrong value. A census of the property's references through the TypeScript
language service (`getReferencesAtPosition` on the `skillsDir` member of `Installation`, run over
`packages/cli/tsconfig.json`) finds no product reader. All of them are the specs and factory listed
above, and they assert the Claude path. `agentsDir`, `configPath`, `mode` and `projectDir` each
have product readers (`compile.ts`, `init.tsx`, `list.tsx`, `plugin-info.ts`, `edit.tsx`).

CLAUDE.md already covers this: "Where such a field has no reader at all, delete it rather than
widening it". The specs reading the field make it look used, so no grep for an unused symbol finds
it.

## Fix Applied

None. This is a discovery only. It came up during an expressive-ts pass (Patterns 5, 6 and 8). The
pass weighed replacing that `mode === "plugin"` ternary with an exhaustive `Record<InstallMode, …>`,
then left the ternary alone, because polishing a field nothing reads is what the rule forbids.
Deleting the field also changes the specs that assert it, and that pass had to leave specs
unchanged.

## Proposed Standard

No new rule. The fix is to delete `skillsDir` from `Installation` and from the specs and factory
that assert it.
For hardening, a language-service census can list exported type members whose only references are
in `*.test.ts` or `__tests__/`. That census is cheap to run once. As a gate it would be noisy, since
some members are legitimately read only by specs, so no honest gate exists beyond that census.
