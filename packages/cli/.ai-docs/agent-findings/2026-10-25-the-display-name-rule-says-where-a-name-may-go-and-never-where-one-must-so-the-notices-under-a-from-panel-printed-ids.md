---
type: missing-standard
severity: low
affected_files:
  - CLAUDE.md
  - src/cli/utils/messages.ts
  - src/cli/commands/edit.tsx
  - src/cli/commands/init.tsx
  - src/cli/lib/seed/seed-apply.ts
  - src/cli/lib/configuration/scope-diff.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-25
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The five notices name each skill as the panel row for it does (CLI-972, 2026-10-26). The
  CLAUDE.md clause proposed below is not landed, and the six other id-printing lines in the census
  are not ruled.
---

## What Was Wrong

`CLAUDE.md` › Data Integrity says where a skill's `displayName` may go ("selection UI, search
results, change summaries and `list`'s rows only") and how a row drawn from an entry finds it
(record, then catalogue, then id). It never says where a name is required. So the five notices
printed with an `init --from` / `edit --from` panel (`addedToGlobalSubAgents`,
`keptAsInstalledGlobally`, `authoredHereKept`, `unplaceableKept`, `keptUnassigned` in
`utils/messages.ts`) printed ids under a panel that names the same skills, and two testers found
the rule could not settle it. The owner ruled on 2026-10-24 (card q-cli-972-notice-names): "Name
them as the box does".

The census, run 2026-10-25:

```
grep -n -E 'skillIds\.join|\$\{skillId\}|`  skill \$\{|\$\{id\}`|ids\.join' src/cli/utils/messages.ts
```

returned the five notices plus six lines the ruling does not cover, each still printing ids:
`carriedSkillsWritten` (printed by the same `--from` runs after the confirm),
`sharedConfigProjectScopeAtHome`, `skillAssignedToNoAgent`, `scopeBlockedStackAssignment`,
`shareRefusesEjectedSkills` and `sharedSkillsLeftBehind`. That is the whole census, not a sample.

## Fix Applied

In product code (CLI-972's developer, 2026-10-26): each of the five notices takes a required
`NamedBy` (`lib/configuration/scope-diff.ts`, the lookup `AgentChange.namedBy` already gave the
`~ sub-agent: gains …` line) and names each skill by `getSkillEntryDisplayName` on its entry, else
the catalogue, else its id. Every caller passes `panelRowEntries(held)` (`lib/seed/seed-apply.ts`):
the active entries of `held.result.skills`, the list both commands draw the panel's skill rows from.
A caller that drops the entries fails `tsc`.

The CLI-972 tester wrote failing specs for the ruling: the five notices name
skills as the panel does, at unit, command (`*-from-says-what-it-did.test.ts`) and e2e level. Each
route into a notice has one spec whose recorded name differs from the catalogue's, with the panel
row as the control in that spec, so a catalogue-only fix stays red. The joined-sub-agent notice's
is a unit spec on `joinedStatement`, because a real decode records the catalogue's name.

A catalogue-only mutant of the five notices, run on an isolated copy of the package, kept every one
of those specs red. A first written-here spec passed under it, because its recorded name was the
catalogue's; it now records another.

## Proposed Standard

In `CLAUDE.md` › Data Integrity, after "No command adds a side read …", add: "A notice printed
with a `--from` panel names each skill as the panel row for it does: `getSkillEntryDisplayName`
on the entry that row was drawn from." This does not conflict with the path-block rule above it:
none of the five notices describes the filesystem. Whether the six lines in the census follow it is
not ruled; they are owner questions, not part of this proposal.
