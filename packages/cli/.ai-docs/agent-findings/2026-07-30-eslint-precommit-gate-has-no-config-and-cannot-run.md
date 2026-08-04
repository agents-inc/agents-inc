---
type: standard-gap
severity: medium
affected_files:
  - package.json
standards_docs:
  - CLAUDE.md
  - .ai-docs/standards/commit-protocol.md
date: 2026-07-30
reporting_agent: codex-keeper
category: architecture
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: "Option B taken at the user's explicit request: ESLint 9 flat config (`eslint.config.js`) with `typescript-eslint` + `eslint-config-prettier`, an `npm run lint` script, and lint wired into both `lint-staged` and `prepublishOnly`. The gate is now runnable; baseline is 150 problems, unfixed and reported rather than swept. See `2026-07-30-eslint-disable-directives-were-never-verified.md` for drift the new linter exposed."
---

## What Was Wrong

In plain terms: the pre-commit checklist tells every agent to confirm there are
no ESLint errors, but this repository has no ESLint at all. The check cannot be
performed, so ticking the box is always a guess.

`CLAUDE.md` -> "Pre-Commit Checklist" lists:

```
- [ ] No ESLint errors
```

alongside `npm test` and `tsc --noEmit`, both of which are real and runnable.
Nothing distinguishes the unrunnable item from the runnable ones.

Verified on disk 2026-07-30, all four independently:

| Probe                                                                       | Result             |
| --------------------------------------------------------------------------- | ------------------ |
| `eslint.config.{js,mjs,ts}` / `.eslintrc*` anywhere outside `node_modules/` | **None exist**     |
| `eslint` in `package.json` `dependencies` / `devDependencies`               | **Not declared**   |
| `node_modules/.bin/eslint`                                                  | **Absent**         |
| `lint` script in `package.json`                                             | **No such script** |

The only linting-adjacent tooling is `lint-staged`, and its entire configuration
is `"*.{ts,js,json,yaml,yml,md}": "prettier --write"` — formatting, not linting.
`prepublishOnly` runs `format:check && typecheck && build && test`; no lint stage
exists there either.

Consequences, in order of how likely they are to bite:

1. **`npx eslint` does not fail informatively.** With no local binary, `npx`
   attempts a registry fetch; if it resolves at all, ESLint v9+ then exits with a
   "couldn't find an eslint.config.js file" error. Either way the agent sees a
   failure that looks like a broken environment rather than an absent tool, and
   the natural next step — scaffolding a config — is a change nobody asked for.
2. **The checklist item is silently satisfied by default.** An agent that cannot
   run the check and sees no errors reports the box ticked. A checklist item that
   always passes is worse than an absent one: it confers unearned confidence on
   every commit that cites it.
3. **The rules ESLint would enforce are enforced by prose instead.** CLAUDE.md
   carries a long NEVER/ALWAYS list (no `any`, no `@ts-ignore` without comment,
   no unused imports, named exports only) that reads like a lint config. Those
   are currently upheld by agent diligence and review alone. This is also the
   mechanism behind `2026-07-20-e2e-spec-files-accumulate-unused-imports-unenforced.md`
   and `2026-07-17-d167-task-id-recurrence-no-lint-guard.md`, both of which
   propose lint rules that have nowhere to live.

## Fix Applied

None — discovery only, and deliberately so on two counts.

No lint config was created: introducing ESLint is a workflow change the user has
not requested, and CLAUDE.md forbids introducing new workflow patterns (tools,
flags, strategies) unprompted. Choosing a config style, a rule set and a
`typescript-eslint` integration are all decisions with real cost, and they are
the user's to make.

`CLAUDE.md` was not edited either — it is project configuration, and a sub-agent
may not amend it on its own authority. The gap is therefore recorded in the two
surfaces this agent does own:

- this finding, and
- `.ai-docs/DOCUMENTATION_MAP.md` -> "Known Tooling Gaps", which CLAUDE.md rule 4
  requires every agent to read **before** working on any area of the codebase —
  so it is seen ahead of the checklist rather than after it.

## Proposed Standard

Pick ONE. Both close the gap; they differ in cost and in what they buy.

**Option A — make the checklist honest (near-zero cost).** Amend the
`CLAUDE.md` Pre-Commit Checklist item to state the current reality:

> - [ ] No ESLint errors — **N/A: this repo has no ESLint config, no `eslint`
>       dependency and no `lint` script. Do not run `npx eslint` and do not scaffold
>       a config to satisfy this line.** Static analysis is `tsc --noEmit` plus
>       `prettier --check`; style rules are enforced by review against the NEVER /
>       ALWAYS lists above.

The explicit "do not scaffold" clause matters — without it, the honest reading of
an unrunnable gate is that someone should make it runnable.

**Option B — make the gate real.** Adopt ESLint 9 flat config with
`typescript-eslint`, add a `lint` script, and add it to `lint-staged` and
`prepublishOnly`. This is the only option that mechanically enforces the
CLAUDE.md rules that are lint-shaped, and it gives the two findings cited above
somewhere to land. It is a genuine workflow change and needs explicit approval.

**Do not leave it as-is.** A checklist item that cannot be executed will keep
being reported as passed.

**General rule worth stating once, wherever the checklist is next revised:**
every gate on a pre-commit checklist must name the exact command that verifies
it. A gate with no runnable command is not a gate — it is an assumption wearing a
checkbox.
