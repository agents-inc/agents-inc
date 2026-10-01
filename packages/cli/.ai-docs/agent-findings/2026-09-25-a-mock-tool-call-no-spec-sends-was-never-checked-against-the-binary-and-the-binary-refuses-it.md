---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/e2e/fixtures/codex-responses-mock.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-09-25
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`applyPatchCall` in `e2e/fixtures/codex-responses-mock.ts` builds the Responses-API event for a
model calling Codex's `apply_patch` tool — a `custom_tool_call` named `apply_patch` — and its
docblock presents it as how a scenario makes the model edit a file. **No spec calls it**
(`grep -rln applyPatchCall e2e src` answers the defining file alone), so it had never been sent to
the pinned binary, and the pinned binary refuses it.

Measured 2026-09-25 against `@openai/codex` 0.155.1, in a delegated sub-agent's turn under
`mockProviderConfig` (`workspace-write`, `approval_policy="never"`):

- the sub-agent's request offers `exec_command`, `write_stdin`, `request_user_input`, `view_image`,
  `get_goal`, `create_goal`, `update_goal` and `web_search` — no `apply_patch`;
- sending `applyPatchCall(...)` is refused on stderr with `unsupported custom tool call: apply_patch`
  (from `codex_core::tools::router`), the file is not written, and the turn carries on as though
  nothing had been asked. `codex exec` still exits 0.

So a spec written on this helper would see its edit silently not happen.

## Fix Applied

None to the helper — it is outside the lane that found it.

## Proposed Standard

A proposal, not an approved rule. In `standards/e2e/anti-patterns.md`: **a harness helper that
stands in for a third party's wire format ships with a caller in a spec that drives the pinned
binary**, or is deleted. A builder for a request the binary has never received is a claim about the
binary that nothing has measured, and — unlike product code — nothing downstream exercises it until
the day a spec depends on it. Deleting `applyPatchCall` is the smaller fix and follows
"prefer deleting a claim to rewriting it"; keeping it needs a spec proving the event is accepted in
some turn of the pinned release. This does not conflict with anything in `CLAUDE.md`; it is the
e2e face of `2026-09-22-a-declared-seam-member-with-no-caller-reads-exactly-like-a-finished-one`.
