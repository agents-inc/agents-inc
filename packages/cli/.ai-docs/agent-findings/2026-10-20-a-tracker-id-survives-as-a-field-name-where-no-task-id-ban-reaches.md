---
type: missing-standard
severity: low
affected_files:
  - src/cli/lib/configuration/skill-audit.ts
standards_docs:
  - CLAUDE.md
  - .ai-docs/standards/clean-code-standards.md
  - .ai-docs/standards/documentation-bible.md
date: 2026-10-20
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: missing-rule
status: open
---

## What Was Wrong

`SkillAuditEntry.deferredToD306` in `skill-audit.ts` names a tracker ID, and a retired one: D-306
is now CLI-740 (`todo/cli.md`, "CLI-740 (was D-306)"). The field is set on every row that carries
a deferral.

The task-ID bans each name a location, and an identifier is not among them. CLAUDE.md and
`clean-code-standards.md` 6.11 cover test names, assertion messages and test comments.
`documentation-bible.md` covers documents. The comment rule covers comments. A product-code
identifier falls outside all of them, so a comment pass leaves it alone and no review flags it.

Census across every workspace's source, after excluding a unicode-escape false positive in
`consts.ts` (`uDD12`). The only hit is this field:

```
grep -rnoE '\b[a-z][A-Za-z]*(D|Cli|CLI|Repo|REPO|Editor|EDITOR)-?[0-9]{2,4}\b' packages/*/src packages/cli/e2e packages/cli/scripts apps/*/src --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=dist
```

## Fix Applied

None. `todo/cli.md`'s CLI-740 row cites the field by name ("the accumulated `deferredToD306`
lines in `skill-audit.ts`"), so renaming it would make that tracker line false. Renaming the field
and updating the row has to happen in one change, which needs the orchestrator because sub-agents
do not edit `todo/`.

## Proposed Standard

Extend the task-ID ban to identifiers. Name what the thing is for, not the ticket that introduced
it, for example `deferred` or `unexpressedNuance`. ESLint's `id-match`, or `no-restricted-syntax`
on `Identifier[name=/(D|CLI|REPO|EDITOR)-?\d{2,4}/]`, would enforce this mechanically. It would
redden on this field until the rename lands.
