---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/utils/messages.ts
  - packages/cli/src/cli/lib/installation/install-layout.ts
  - packages/cli/src/cli/lib/__tests__/commands/bare-run.test.ts
  - packages/cli/src/cli/lib/installation/install-layout.test.ts
  - packages/cli/src/cli/hooks/init.ts
  - packages/cli/src/cli/utils/messages.test.ts
  - packages/cli/e2e/pages/constants.ts
  - packages/cli/e2e/helpers/handrun.gen.mjs
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Code side landed: every run prints one line per root holding the folder, HOME's as `~/.claude-src/`
  and a project's by its absolute path (`retiredSourceFolderIgnored` in `utils/messages.ts`, over
  `rootsHoldingTheRetiredSourceFolder` in `install-layout.ts`; CLI-931, owner 2026-10-24). Pending:
  the CLAUDE.md widening proposed below is not written.
---

## What Was Wrong

The `init` hook checks two roots for the retired folder, `[cwd, os.homedir()]`
(`sayTheRetiredSourceFolderIsUnsupported` in `hooks/init.ts`, over `retiredSourceFolderIn` in
`install-layout.ts`). `retiredSourceFolderUnsupported` in `messages.ts` then prints a line that
names neither root:

```
.claude-src/ is no longer supported (agents-inc now serves Claude and Codex). Move it to .agents-inc/claude/.
```

Reproduction, 2026-10-21. `~/.claude-src/` exists and `<repo>/.claude-src/`
does not. Running `node packages/cli/dist/index.js compile` from `<repo>` printed the
line above as its first line. Read in a project, it says the project holds the folder. It doesn't,
and the project already has a `.agents-inc/claude/` with a live `config.ts`. So "Move it to
.agents-inc/claude/" points a reader at the wrong directory.

`bare-run.test.ts` and `e2e/pages/constants.ts` pin the root-less text. Journey 52 in
`user-journeys.md` ("where it goes") records it as COVERED.

## Fix Applied

None. This is a discovery only, and it is outside the reporting lane.

## Proposed Standard

The line should name the root that holds the folder, as an absolute path or as `~/` for HOME. When
both roots hold one, it should name both. `retiredSourceFolderIn` would then return the roots it
found instead of only the replacement name.

The nearest rule is `packages/cli/CLAUDE.md`: "NEVER report a single path for artifacts that are
split by scope". It names skills and agents, so it didn't reach this line. A proposed widening:
"any path a command prints that came from a check of more than one root". This doesn't conflict
with any NEVER/ALWAYS rule.

## Correction

2026-10-24. This file's `partial_note` said on 2026-10-23 that CLI-931 had deleted the notice, so no
run named the folder. The owner replaced that ruling on 2026-10-24 before the deletion was
committed (`git show HEAD:packages/cli/src/cli/hooks/init.ts` still carries the old notice). Every
run now names each root holding the folder, as this finding proposed, and says it is ignored and
which folder agents-inc reads there. The body above is left as written.
