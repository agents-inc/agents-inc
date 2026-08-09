---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/lib/configuration/config-merger.ts
  - e2e/interactive/edit-wizard-local.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-08
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`cc edit` prints `- <skill> [P]` in its post-wizard **Changes** block for a skill it then
deliberately keeps in `config.ts`. Three surfaces end the run disagreeing about one skill.

The preservation is ruled correct and documented. `mergeConfigs` in
`src/cli/lib/configuration/config-merger.ts` exempts `unresolvableSkillIds` from the
authoritative drop, with the reason written out in its own JSDoc: a skill the wizard could not
resolve from the source loaded this session was never offered as a choice, so its absence from
the wizard's roster is a resolution gap rather than a deselection (D-233 Scenario C data-loss
guard).

`logChangeSummary` in `src/cli/commands/edit.tsx` has no matching exemption. It derives
`removedSkills` from `detectConfigChanges`, which is a plain
`difference(oldSkillIds, newSkillIds)` over the wizard's roster — so every skill the guard
preserves is announced as removed.

Observed end state of one `cc edit` pass over a project holding `web-framework-react` and
`web-styling-tailwind`, edited against a source carrying only the former:

| Surface                     | Says about `web-styling-tailwind`                          |
| --------------------------- | ---------------------------------------------------------- |
| `Changes:` block            | `- web-styling-tailwind [P]` — removed                     |
| `config.ts`                 | `{ id, scope: "project", source: "eject" }` — still active |
| compiled `web-developer.md` | absent — the recompile dropped it                          |

The config entry carries no `excluded: true`, so it is an active claim, not a tombstone. The
skill's files are still on disk, so a later `cc compile` would put it back into the agent — the
edit's own recompile and a subsequent compile disagree too.

This was invisible because the spec that owned the claim asserted nothing about it. Its config
check was `expect(config).not.toContain('"web-testing-vitest"')` — a skill the fixture never
installed, so the negative was satisfied by every possible outcome, including this one. Its
sibling, `should detect unresolvable skill as removed and complete edit`, asserts
`toHaveConfig({ skillIds: ["web-framework-react"] })`, which is a presence check and passes with
tailwind still listed; its in-body comment ("the wizard cannot resolve tailwind from the E2E
source, so it drops it automatically") describes the compiled agent, not the config, and reads as
if it described both.

## Fix Applied

None — discovery only, per the batch rule that a strengthened assertion revealing a real product
failure stops the row.

The spec is pinned rather than repaired:
`e2e/interactive/edit-wizard-local.e2e.test.ts` → `should not report a preserved unresolvable
skill as removed` is `it.fails` with a JSDoc naming the RED assertion. Everything above that
assertion passes, including a `toStrictEqual` on the whole surviving skill list that establishes
the preservation is real and is the ruled-correct half. The negative anchors on the scope tag
(`- web-styling-tailwind [P]`) because the confirm step's own summary paints the same
`- <name>` row without one, so a tag-free negative could not tell the command's Changes block
from the wizard frame that scrolled past.

Which of the two surfaces should move is an owner call:

1. Exempt `unresolvableSkillIds` from `removedSkills` in `detectConfigChanges`, so the summary
   stops claiming a removal the merger refuses — and say nothing, since nothing changed.
2. Report the skill under its own heading ("kept — not in this source"), which tells the user why
   the compiled agent no longer carries a skill their config still lists.

Option 1 leaves the user with no explanation for the agent losing a skill. Option 2 needs a new
line in the summary vocabulary.

## Proposed Standard

`.ai-docs/standards/e2e/anti-patterns.md` § Weak Assertions already bans broad negatives on
merged configs, and that rule is what this spec violated in the direction the doc does not
mention: the negative named a skill **absent from the fixture entirely**, so it was not merely
broad, it was unfalsifiable.

Add to § Weak Assertions:

> **Never negate an identifier the fixture never installed.** `not.toContain("<skill>")` for a
> skill no phase of the test ever put in the config is true before the command runs, so it cannot
> observe anything the command did. Every removal negative must name the identifier the
> corresponding setup put there — and the surrounding spec must establish that it was there,
> or the negative is a green line that has never been able to go red.

The general form is the one the audit's Class 3 already names — an assertion that cannot fail —
and the tell here is mechanical enough to grep for: the string in a `not.toContain` should appear
somewhere in the same test's setup.
