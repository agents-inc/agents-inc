---
type: convention-drift
severity: medium
affected_files:
  - todo/plans/D-310-from-global-scope-project-skills.md
  - src/cli/lib/seed/seed-schema.test.ts
  - src/cli/commands/init.tsx
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-17
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`.ai-docs/` forbids source line numbers and requires citation by symbol
(`documentation-bible.md` -> "No Source Line Numbers — Cite by Symbol"). `todo/plans/` is held to no
such rule, and a plan is read the same way a reference doc is: an agent opens it, trusts its
citations, and navigates to them.

`todo/plans/D-310-from-global-scope-project-skills.md` was written 2026-08-04 and implemented
2026-08-17. Over those thirteen days **every underlying fact in it stayed true and roughly half its
citations stopped resolving.**

**The citation that was worst is the one that no longer names a file at all.** The plan cites
`seedSkillSchema.scope: z.enum(["project", "global"])` at `src/cli/lib/seed/seed-schema.ts:37`. That
module does not exist — the schema moved to `packages/matrix/src/seed.ts`, imported as
`@workspace/matrix/seed`, and the only survivor under the old name is
`src/cli/lib/seed/seed-schema.test.ts`, which is the CLI's contract test rather than the schema. An
agent grepping the cited path finds a similarly-named file that is not the thing described. The
FACT — that the wire declares a per-skill `scope` of exactly those two members — is unchanged.

**Roughly six further references had rotted**, in three grades:

| Citation                                                                                  | State                                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/cli/lib/seed/seed-schema.ts:37`                                                      | File gone (schema moved workspaces)                                |
| `init.tsx:279` (`isGlobalRoot` on the wizard route)                                       | Now `init.tsx:367` — 88 lines out                                  |
| `init.tsx:243`, `:260`, `:263`, `:320`, `:331-340`, `:342-346`                            | All out by 60–110 lines; several now land inside unrelated symbols |
| `src/cli/consts.ts:32` (`GLOBAL_INSTALL_ROOT`)                                            | Now `CATALOG_JSON` — a live line naming a different constant       |
| `src/cli/lib/seed/seed-to-wizard.ts:152`                                                  | Now a comment line                                                 |
| `src/cli/lib/configuration/project-config.ts:114`                                         | The `isHomeDirectory` gate it names is at `:124`                   |
| `src/cli/lib/plugins/plugin-finder.ts:29`, `utils/exec.ts:135-137`, `plugin-ref.ts:24-26` | Off by one; still land inside the cited symbol                     |
| `src/cli/lib/installation/is-home-directory.ts:13`                                        | Still exact                                                        |

The third grade is the dangerous one. `consts.ts:32` resolves to a real declaration that is not the
one the plan means, so an agent that follows it reads a wrong fact **with no signal that anything
moved** — worse than a dangling path, which at least fails loudly.

**Every symbol name in the plan was still correct.** `isHomeDirectory`, `toClaudePluginScope`,
`resolvePluginCwd`, `getCollectivePluginDir`, `seedToWizardResult`, `handleInstallation`,
`GLOBAL_INSTALL_ROOT`, `EXIT_CODES.ERROR` — all of them resolve by grep today. The plan's argument
was reconstructable in full; only its coordinates were not.

## A plan can rot in its REASONING, not only in its citations

The same plan's proposed **"Enforcement point 2 — the location"** was dead as written, and would
have been dead on the day it was written.

It asks for two things at once:

1. "The home directory is never a valid _project_ directory. Resolving it as one is refused."
2. "**Requirement, not an aside:** this must fire only when resolving `$HOME` as a project, never
   when installing globally from `$HOME`."

Requirement 2 forbids the only implementation of requirement 1. The plan's own evidence says so, two
paragraphs later: `resolvePluginCwd` "sends `user` scope to `os.homedir()` and everything else to
`projectDir`, so when `projectDir` **is** `os.homedir()` both branches execute in the same
directory. The two installs are the same thing on disk regardless of what we call them." There is no
observable difference between "resolving `$HOME` as a project" and "installing globally from
`$HOME`" at the point the guard was to sit — `projectDir` carries the same string either way. The
discriminator the requirement demands does not exist.

What shipped instead moved the subject: not "is this directory being resolved as a project" but
"does this PAYLOAD carry project-scoped content, given that the install root is `$HOME`" —
`Init.refuseProjectScopedContentAtHome` in `src/cli/commands/init.tsx`, classifying through
`isActiveAt(entry, "project")`. That question has an answer at the boundary, and the global install
from `$HOME` the requirement wanted to protect is exactly the payload that carries nothing
project-scoped, so it passes untouched.

A reader who trusted the plan's own section headings would have implemented enforcement point 2 as
written, discovered it could not be made to fire correctly, and had no way to tell whether the fault
was theirs or the plan's.

## Fix Applied

None to the plan — it was deleted on landing, per the tracker convention that an item is removed
rather than ticked off, and `todo/archive.md` now carries the one-line record. Discovery only.

## Proposed Standard

Two rules, both for `todo/plans/`, both cheap:

1. **Plans cite by symbol, the same way `.ai-docs/` does.** Name the enclosing symbol and the file
   — `isGlobalRoot` in `src/cli/commands/init.tsx` — rather than `init.tsx:279`. A symbol survives
   every edit above it and is greppable; a line number rots silently while still reading as
   authoritative, and a rotted
   line number that lands on a live declaration reads as a fact. The rule already exists and is
   already argued in `standards/documentation-bible.md` -> "No Source Line Numbers — Cite by
   Symbol"; what is missing is a sentence extending it to `todo/plans/`, since that directory is
   read by agents under the same trust as a reference doc. The existing check
   (`grep -rEc '\.tsx?:[0-9]+' .ai-docs/reference/` returning zero) extends to `todo/plans/`
   verbatim.

2. **A plan proposing a guard must name the value the guard reads.** Not the rule in prose — the
   expression. Enforcement point 2 would have failed this in one line: the only value available at
   its proposed site is `projectDir`, and `projectDir` is identical in both cases the requirement
   distinguishes. A plan that cannot name its own discriminator has not been checked, and the cost
   is paid by whoever implements it rather than by whoever wrote it.

The natural home for both is `standards/documentation-bible.md`, which already owns the
cite-by-symbol rule and would only need to widen its stated scope beyond `.ai-docs/`.
