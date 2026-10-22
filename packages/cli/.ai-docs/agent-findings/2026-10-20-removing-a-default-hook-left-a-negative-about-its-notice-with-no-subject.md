---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/lib/__tests__/commands/edit-from-says-what-it-did.test.ts
standards_docs:
  - packages/cli/.ai-docs/standards/e2e/assertions.md
date: 2026-10-20
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: premise-expired
status: resolved
resolved_by: >-
  REPO-44 follow-up F1-stop-hook-fix. The spec's project now declares a Stop hook on web-developer,
  a precondition asserts the compiled file carries it, and removing the `hasIncompleteWork` guard
  from `reportWhatThisHostCannotCarry` in the built `edit` turns the spec red.
---

## What Was Wrong

`edit-from-says-what-it-did.test.ts`, in "a write the file system refuses", asserts that a run with
failures does not print the Claude folder-trust notice. The notice only prints when a compiled
project sub-agent carries a `Stop` hook (`claudeCompileNotices` in
`src/cli/lib/hosts/claude-project-trust.ts` returns `[]` otherwise). The spec's only sub-agent is the
built-in web-developer, which carried a hook only because compile used to add one to every writing
sub-agent. When that default was removed, nothing in the spec carried a hook, so the assertion
passed whatever `edit` did. Removing the guard from the built `edit` (`if (this.hasIncompleteWork)
return;` in `reportWhatThisHostCannotCarry`) left the spec green. Nothing else covers that guard.

## Fix Applied

The test declares a project definition of web-developer whose `metadata.yaml` carries a `Stop`
hook, and asserts the compiled `web-developer.md` carries the hook line before the failing run.
With the guard removed from `dist/commands/edit.js` the spec fails, with the notice printed between
the compile summary and `Completed with 2 failure(s)`. With the guard in place, it passes.

## Proposed Standard

`standards/e2e/assertions.md`, § "A negative over tool output quotes the tool's own string", already
says to make the subject true and confirm the spec goes red. It does not say who reruns that check
when the input goes away. Proposed sentence: a change that removes a product default greps for
negative assertions about what that default caused, and for each one either gives the spec its own
copy of the input or deletes the assertion. Census for this default:
`grep -rn "CLAUDE_FOLDER_UNTRUSTED\|sub-agent's completion gate" e2e src/cli/lib/__tests__`.
