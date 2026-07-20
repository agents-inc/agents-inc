---
type: missing-standard
severity: high
affected_files:
  - src/cli/commands/init.tsx
  - src/cli/commands/edit.tsx
  - src/cli/hooks/init.ts
  - src/cli/consts.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
  - .ai-docs/reference/commands/edit.md
date: 2026-07-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
---

## What Was Wrong

`init.tsx` delegates to another command with `await config.runCommand(selectedCommand)` — no argv,
no context. Every caller therefore arrives at the delegated command indistinguishable from every
other caller, and from a direct CLI invocation.

Three distinct user intentions collapsed onto one `cc edit` invocation:

| Entry point                               | User means            | Correct no-change behaviour |
| ----------------------------------------- | --------------------- | --------------------------- |
| `cc init` in a project (dashboard → Edit) | "set this project up" | materialise + register      |
| bare `cc` (dashboard → Edit)              | "let me edit"         | write nothing               |
| bare `cc edit`                            | "let me edit"         | write nothing               |

Because the intent was absent, two E2E suites encoded contradictory expectations for what looked
like the same scenario (project with no own config + wizard passthrough with no roster change), and
both were green only because a stale-config bug kept the roster diff artificially non-empty. Two
prior findings diagnosed the symptom; both then proposed **re-deriving the intent from state** —
`installation.projectDir !== cwd`, or the absence of `<project>/.claude-src/config.ts`. Neither
works, because both are equally true for the bare `cc edit` inspection. Any state-derived proxy
fails here for the same structural reason: the difference is not in the state, it is in _who asked_.

## Fix Applied

Intent is now passed, not inferred.

1. `runDashboardFlow` takes a `DashboardOrigin` (`"init" | "standalone"`). `Init.run` passes
   `"init"`; the bare-`cc` init hook passes `"standalone"`.
2. `dashboardCommandArgv` appends `--project-setup` to the `config.runCommand` argv for an
   init-originated Edit, and nothing otherwise.
3. `Edit` declares the flag `hidden: true` (not a discoverable public surface), keyed off the shared
   `EDIT_PROJECT_SETUP_FLAG` constant so the declaration and the emitter cannot drift.
4. The materialisation gate reads `flags[EDIT_PROJECT_SETUP_FLAG] && !isHomeDirectory(cwd)` — the
   intent, plus its own precondition (at the home root there is no project to set up; the global
   install is what the dashboard was shown for).

Both previously-conflicting suites pass with **every assertion unchanged**. No test was weakened.

## Known Follow-Up: 4 Guard Tests Blocked On An Owner Decision

Honouring the ruling changes the post-condition of the E2E fixture `createGlobalOnlyEnv`
(`e2e/fixtures/dual-scope-helpers.ts`), which calls `initProjectAllGlobal` — i.e. it runs `cc init`
inside a project. That helper now materialises the project config, as it must. Four tests in three
files assert the opposite as a _proxy_ for "the guard blocked the toggle":

| File                                                               | Line    |
| ------------------------------------------------------------------ | ------- |
| `e2e/lifecycle/global-agent-toggle-guard.e2e.test.ts`              | 92      |
| `e2e/lifecycle/global-skill-toggle-guard.e2e.test.ts`              | 92, 139 |
| `e2e/lifecycle/global-skill-filter-incompatible-guard.e2e.test.ts` | 133     |

All four are the same line: `await expect({ dir: env.projectDir }).not.toHaveConfig();`

The guarded behaviour itself is **unaffected**. Every assertion that exercises the guard — the
blocked-toast check, and the "global config byte-identical" check — sits _above_ the failing line
and passes. The very next line, `expect(result.output).toContain(STEP_TEXT.EDIT_UNCHANGED)`, already
asserts the real invariant ("the edit under test was a no-op") directly.

`not.toHaveConfig()` is asserting on state produced by the **setup helper**, not by the action under
test — and the state it pins is the accidental non-materialisation the two sibling findings identify
as the bug. It is stale, not wrong-in-spirit.

Not changed here: per the round's constraint, no assertion in any existing test was weakened,
narrowed or deleted, and test authorship belongs to the tester agent. Recommended replacement (a
_strengthening_, and what CLAUDE.md's "snapshot before and assert identical after" rule already
prescribes): snapshot `<project>/.claude-src/config.ts` after `createGlobalOnlyEnv` returns, and
assert it is byte-identical after the guarded edit. That pins "the guarded edit wrote nothing"
without depending on the file's absence.

Causality was established by a controlled probe: with the `--project-setup` argv suppressed, all
four pass; with it restored, all four fail on that line and nothing else.

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md`, adjacent to the "Early-Return Guards Over
Persistence" section, and cross-reference from `.ai-docs/reference/commands/edit.md`:

> **A delegated command must receive the caller's intent explicitly.** When one command invokes
> another (`config.runCommand`, dashboard routing, a shared flow function), any behaviour that
> differs per caller MUST be passed as an argument or an explicit flag. Do NOT re-derive it inside
> the callee from filesystem or config state — a state proxy is true for callers you did not have in
> mind, and it silently changes meaning when unrelated state changes.
>
> Mechanism: a `hidden: true` oclif flag whose key is a shared exported constant, named for the
> INTENT (`--project-setup`, "this run is an init-initiated project setup") and never for the
> mechanism (`--write-config`, `--force-register`). Hidden keeps it off the documented CLI surface;
> the shared constant keeps the declaring command and the emitting caller from drifting.
>
> Forbidden alternatives: module-level mutable flags, environment variables, and "the callee can
> figure it out from `cwd`/`projectDir`/whether a file exists". The first two are invisible coupling;
> the third is the bug this rule exists to prevent.

Corollary for reviewers: when a fix proposes a predicate to distinguish two flows, enumerate every
entry point that reaches the predicate and confirm it evaluates differently for each. If two entry
points with opposite required behaviour produce the same value, the predicate is a proxy and the
signal has to come from the caller.
