---
type: architectural-drift
severity: high
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/commands/edit.tsx
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-08-08
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  Owner ruling 2026-08-08 (CLI-442) settled the default as CORRECT — a fresh pick in a project
  edit defaults to global scope — and required the `s` override to produce a real project
  install. Re-measured 2026-08-08 against the rebuilt binary in a scratch HOME, on the same
  `init` -> dashboard -> Edit session this finding was written from: the pick renders `[G]`,
  `s` renders `[P]`, and confirming writes the project half in full (project `config.ts` entry
  at `scope: "project"`, files under the project's `.claude/skills/`, and the project-scoped
  agent compiled with the skill in it) while the global config's skills, the global skills
  directory and all 11 global agents stay byte-identical. No code change was needed on this
  path; what was missing was a spec that reaches the state through the real wizard rather than
  planting it, now `e2e/lifecycle/project-edit-fresh-pick-scope-override.e2e.test.ts`. That
  spec was mutation-checked (a probe refusing the toggle for a snapshot-less id turns it red on
  the exact badge assertion) so its green is evidence rather than absence.
---

## What Was Wrong

With a global installation already in place, opening a project directory's own configuration
(`init` → dashboard → Edit, which is a genuine project-scope session) and selecting a new skill
writes that skill into the GLOBAL installation, not the project.

Measured 2026-08-08 against the real binary (0.152.1), source `/home/vince/dev/skills`, in a
scratch `HOME` holding the eject-mode global install from the same pass. Selecting
"React Hook Form" in the Web grid and confirming produced:

- project `config.ts`: `{ "id": "web-forms-react-hook-form", "scope": "global", "source": "eject" }`
- `$HOME/.claude/skills/web-forms-react-hook-form/` — created (10 files)
- `<project>/.claude/skills/` — still empty
- `<project>/.claude/agents/` — still empty
- global `config.ts` — rewritten
- five global agent files (`pm`, `reviewer`, `web-developer`, `web-researcher`, `web-tester`) —
  rewritten

No guard fired and no warning was printed. The only disclosure is the badge in the confirm summary:
`+ React Hook Form [G]`.

The session was unambiguously project-scope: the `s` scope hotkey works in it (a second session in
the same directory used `s` to move skills between scopes successfully), which the wizard only
offers when `isEditingFromGlobalScope` is false.

### Reproduction

After a global install exists in `<scratch>`:

```
cd <project>; HOME=<scratch> agents-inc init --source /home/vince/dev/skills
```

Enter on the dashboard's Edit, focus "React Hook Form" in the Web grid, Space, Enter through to
Confirm, Enter. Then read `<project>/.claude-src/config.ts` (`scope: "global"`), and compare
`ls $HOME/.claude/skills/web-forms-react-hook-form` (present) with `ls <project>/.claude/skills`
(empty).

### Code in the path

- `createDefaultSkillConfig` (`src/cli/stores/wizard-store.ts`) returns
  `{ id, scope: "global", source: … }` — the scope is a literal, and the function takes no scope
  parameter and reads no scope state.
- `buildSkillConfigForId` (same file) degrades to `createDefaultSkillConfig`'s output whenever the
  hydration snapshot has no entry for the id, which is the definition of a genuinely-new selection.
- `reconcileSkillConfigs` (same file) calls it from the `added` branch.
- `toggleTechnology` (same file) carries three `GLOBAL_SKILLS_LOCKED` guard arms. All three are
  about deselecting, or about selecting something that already has an active global install. None
  covers adding a skill that has no global install yet.

### Suspected underlying cause

The default scope for a newly-selected skill is a module-level literal rather than a function of the
session's scope, so `isEditingFromGlobalScope === false` has no bearing on where a new selection is
recorded — and because the recorded scope is also what the installer targets, the write lands in
`$HOME` and in the global config.

### Downstream

This is what makes
`2026-08-08-a-project-edit-cannot-remove-a-skill-it-owns-when-a-global-install-backs-it.md`
unreachable rather than merely refused: if no new skill can be created project-only, the only route
to a project-scoped skill is the `s` toggle on an already-global one, which produces a `[P][G]` pair
whose global half the removal guard then protects.

## Fix Applied

None — discovery only. Produced by an owner-ordered verification pass mandated to report causes
without patching.

## Proposed Standard

`.ai-docs/standards/e2e/README.md`, under "Critical Rules", extending the existing
state-change-verification rule with the cross-scope case:

> A test that adds, removes or re-scopes an entry from a PROJECT-scope session MUST snapshot the
> global scope (`$HOME/.claude/**` and `$HOME/.claude-src/config.ts`) before the session and assert
> it byte-identical after, unless the test's own subject is a deliberate cross-scope write. Checking
> only the project side cannot tell "the project was configured" apart from "the global install was
> configured and the project observed it".
