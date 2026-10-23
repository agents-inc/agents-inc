---
type: convention-drift
severity: low
affected_files:
  - .claude/skills/commit-plan/SKILL.md
standards_docs:
  - packages/cli/.ai-docs/standards/commit-protocol.md
date: 2026-10-22
reporting_agent: cli-developer
category: dry
domain: infra
root_cause: enforcement-gap
status: partial
partial_note: >-
  The skill's sentences now agree with root CLAUDE.md's commit-plan rule and with commit-protocol.md.
  Nothing yet stops the next drift: the file is still ignored, and no gate reads it.
---

## What Was Wrong

The project's one skill, `.claude/skills/commit-plan/SKILL.md`, is matched by `.gitignore`'s
`.claude` line (`git check-ignore -v` names it). So no `git diff` shows an edit to it, no commit
carries it, and none of the repository's document checkers read it. It restates the commit protocol
rather than pointing at it, so it kept rules the protocol and root `CLAUDE.md` had since replaced.
A full read of the file found six (census of the one file):

- The generate checks were described as `git diff --exit-code` against committed output. The
  protocol retired that shape on 2026-08-20 (`b4ea84aa`): each check now compares its in-memory
  output with the bytes on disk.
- CI was said to run `generate:schemas:check` and `generate:matrix:check`. `.github/workflows/ci.yml`
  runs `generate:matrix:check` and `generate:compile:check`.
- Formatting was a `prettier --check` before the sequence, with a formatting pass first. The
  protocol now runs `bun run format` before the last commit and commits what it changed (`5f935f76`).
- "the gates run per commit". The protocol gates the first and last commit only.
- "One concern per commit, however large the push". Root `CLAUDE.md` says to group by concern into
  about 10–20 commits a person can review.
- A pattern for deciding each staged-then-edited path. Root `CLAUDE.md` says not to plan around the
  staged index, because the owner unstages first.

## Fix Applied

Lane F6-sk1 rewrote those sentences to match. Where a restated claim was not load-bearing, the
lane deleted it rather than rewording it. The release checklist in the critical reminders now
points at the skill's Pattern 8 instead of listing steps.

## Proposed Standard

This is a proposal for the owner. One of these would make drift visible:

- Track `.claude/skills/` (un-ignore it in `.gitignore`). A diff and the link checkers would then
  see the file. That first means removing the skill's machine-specific path to the skills
  repository, because tracked files may not carry one (root `CLAUDE.md`).
- Or, under briefing.md rule 7, have the skill point at `commit-protocol.md` for every rule the
  protocol owns, and keep only the git mechanics the protocol does not cover.

## Correction

2026-10-23: the second bullet of "What Was Wrong" is not an expired rule. `.github/workflows/ci.yml`
also runs `generate:schemas:check`, in `check-cli`, and has since `1fe666cf` (2026-08-05). What the
skill said of CI was true but incomplete: it left out `generate:compile:check`. The census is five
expired rules, not six.
