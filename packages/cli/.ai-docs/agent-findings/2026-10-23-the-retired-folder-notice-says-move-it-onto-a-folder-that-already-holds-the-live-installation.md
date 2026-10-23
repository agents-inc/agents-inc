---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/hooks/init.ts
  - packages/cli/src/cli/lib/installation/install-layout.test.ts
  - packages/cli/src/cli/lib/installation/install-layout.ts
  - packages/cli/src/cli/utils/messages.test.ts
  - packages/cli/src/cli/utils/messages.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-23
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: open
---

## What Was Wrong

`retiredSourceFolderUnsupported` in `utils/messages.ts` always ends "Move it to
`<root>/.agents-inc/claude/`". It fires from `sayTheRetiredSourceFolderIsUnsupported` in
`hooks/init.ts` whenever `retiredSourceFolderIn` finds `<root>/.claude-src/`, and nothing asks
whether the destination already exists. When it does, the folder holds the installation the CLI
is actually reading, and there is nothing to move it into.

Reproduction, 2026-10-23, with a throwaway HOME holding both `<tmp-home>/.claude-src/config.ts`
and `<tmp-home>/.agents-inc/claude/config.ts`:

```
HOME=<tmp-home> node packages/cli/dist/index.js --version
<tmp-home>/.claude-src/ is no longer supported (agents-inc now serves Claude and Codex). Move it to <tmp-home>/.agents-inc/claude/.
```

Following the advice literally, `mv <tmp-home>/.claude-src <tmp-home>/.agents-inc/claude` nests it
as `.agents-inc/claude/.claude-src/`. The notice then stops, because it checks only
`<root>/.claude-src`. Nothing was migrated, and a dead folder now sits inside the live
installation. Moving the files one by one instead would overwrite the live `config.ts`. The
owner's own HOME is in this state today, so the notice prints on every command.

Coverage: `grep -rln -E 'retiredSourceFolderUnsupported|retiredSourceFolderIn' packages/cli/src packages/cli/e2e`
returns the five files above. In `install-layout.test.ts`, "both" means both roots (home and
project), and no spec puts `.claude-src/` beside an existing `.agents-inc/claude/` in the same root.
The text itself is also pinned in `e2e/pages/constants.ts` and
`lib/__tests__/commands/bare-run.test.ts` (`grep -rln 'no longer supported' packages/cli/e2e packages/cli/src`).

Related: `2026-10-21-the-retired-folder-notice-names-no-root-so-a-home-only-folder-reads-as-the-projects.md`
is about the missing root, which the notice now names. That finding was reproduced in this same HOME
state, so naming the root alone leaves this half open.

## Fix Applied

None — discovery only, outside the reporting lane.

## Proposed Standard

When `<root>/.agents-inc/claude/` exists, the notice should stop saying "move it". It should say the
retired folder is ignored and name the folder in use, leaving the choice of what to keep to the
user. The owner decides the wording. A general rule for `packages/cli/CLAUDE.md`: a message that
tells the user to move or rename something checks the destination first, and words the case where
it already exists separately. This adds no reader for the retired folder, so it does not conflict
with the NEVER rule on backward-compatibility shims.
