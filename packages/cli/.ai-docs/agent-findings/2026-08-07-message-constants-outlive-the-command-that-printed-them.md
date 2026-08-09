---
type: convention-drift
severity: low
affected_files:
  - src/cli/utils/messages.ts
  - src/cli/utils/messages.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-07
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: The three constants the `update` rewrite orphaned were deleted with it; the three that were already dead before it are still there, and nothing detects the class.
---

## What Was Wrong

`src/cli/utils/messages.ts` accumulates strings that no command prints any more. Deleting the
command that printed one leaves the constant behind, and `messages.test.ts` — which pins each
group's key list with `toStrictEqual` — makes the leftover look deliberate: the key is enumerated
in a passing spec, so it reads as a maintained part of the surface rather than as residue.

Rewriting `update` (CLI-428) made this visible because it orphaned three at once:

| Constant                                 | Printed by                                        |
| ---------------------------------------- | ------------------------------------------------- |
| `ERROR_MESSAGES.NO_LOCAL_SKILLS`         | `update`'s "no local skills" early return         |
| `ERROR_MESSAGES.SKILL_NOT_FOUND`         | `update`'s `skill` positional-argument error path |
| `SUCCESS_MESSAGES.ALL_SKILLS_UP_TO_DATE` | `update`'s hash-comparison verdict                |

All three named behaviour the command no longer has, so leaving them would have been worse than
inert — a reader grepping `"All skills are up to date."` would conclude the CLI still says it.

The same grep found three more with **no** consumer that predate this task and are not its to
remove: `ERROR_MESSAGES.NO_SKILLS_FOUND`, `ERROR_MESSAGES.VALIDATION_FAILED` and
`STATUS_MESSAGES.UPDATING_PLUGIN_SKILLS`. The first two look plausible enough that a future command
might import one and print a message nobody chose; the third describes a step (`"Updating plugin
skills..."`) that no code path performs.

## Fix Applied

The three the rewrite orphaned were deleted along with the command that printed them, and
`messages.test.ts`'s key lists were updated to match. The three pre-existing dead constants were
left alone: they are outside the task's scope, and deciding whether each is residue or a reserved
string is a call for whoever owns the surface.

## Proposed Standard

`messages.ts` has no import-side guard, and `messages.test.ts`'s key lists are the opposite of one —
they assert the keys EXIST. Two options, either of which would close the class:

1. Add a spec beside `messages.test.ts` that greps `src/cli/` for each exported message key and
   fails on a key with no consumer outside `messages.ts` and its own spec. The repository already
   has this shape of self-check (`scripts/check-shared-vitest-config.test.ts`,
   `src/cli/lib/__tests__/config-gate-enforcement.test.ts`), so it is a known pattern rather than a
   new one.
2. Failing that, add a line to `.ai-docs/standards/clean-code-standards.md` under the constants
   section: **when a command is deleted or rewritten, grep `utils/messages.ts` for the strings it
   printed and delete the ones nothing else prints** — the same discipline CLAUDE.md already
   requires for exports ("run grep before adding `export`"), applied to removal rather than
   addition.

Option 1 is preferable: the rule in option 2 is exactly the kind a human or an agent skips under
time pressure, which is how three of these survived long enough to be found by accident.
