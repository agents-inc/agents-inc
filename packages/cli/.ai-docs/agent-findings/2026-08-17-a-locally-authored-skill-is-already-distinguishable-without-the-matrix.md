---
type: architectural-drift
severity: medium
affected_files:
  - packages/cli/src/cli/lib/seed/config-to-seed.ts
  - packages/cli/src/cli/lib/seed/installation-payload.ts
  - packages/cli/src/cli/lib/skills/skill-metadata.ts
  - packages/cli/src/cli/lib/skills/skill-copier.ts
  - packages/cli/src/cli/commands/uninstall.tsx
standards_docs:
  - .ai-docs/reference/features/seed-contract.md
date: 2026-08-17
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: rule-not-visible
status: resolved
resolved_by: >-
  Implemented in `src/cli/lib/seed/installation-payload.ts`. `judgeSkill` reads
  `readForkedFromMetadata` per eject-mode entry, offline, exactly as `uninstall` does, and the
  round trip leaves what it does not own alone — a user-authored skill is neither carried nor
  refused, because it was never in scope. `skillsAuthoredHere` exports the same judgement to the
  receiving half, so `edit --from`'s destructive apply cannot read a payload's silence about a
  skill as an instruction to delete it. Both `share` and `edit --ui` mint through
  `seedPayloadForInstallation`, so the check sits in one place and the two commands cannot
  disagree about one project. The owner's ruling chose neither of the two options this finding
  offered: not "refuse" and not "carry inline", but "outside the round trip".
---

## What Was Wrong

`2026-08-16-the-seed-contract-cannot-carry-half-of-what-a-config-holds.md` lists locally-authored
skills as the one gap with **no refusal available**, on this reasoning:

> `share` cannot tell the two apart from `ProjectConfig` alone — it would need the loaded matrix

The premise is right and the conclusion does not follow. `ProjectConfig` genuinely cannot tell a
user-authored skill from an ejected catalogue skill — both carry `origin: "eject"` — but the
**filesystem can, without a matrix**, and another command in this package already asks it that way.

`skill-copier.ts` stamps `forkedFrom` into the `metadata.yaml` of every skill the CLI ejects
("Core copy: hash the source SKILL.md, copy the directory, stamp forkedFrom provenance"). A skill
the user wrote by hand into `.claude/skills/` carries no such key. `uninstall` reads exactly this
to decide what it may delete — `readForkedFromMetadata` (`lib/skills/skill-metadata.ts`) feeding
`shouldRemoveSkill(forkedFrom) => forkedFrom !== null` in `uninstall.tsx` — so "was this skill
this CLI's copy of a catalogue skill, or the user's own?" is a question already answered on disk,
by one stat and one small YAML parse per eject-mode entry, in a command that runs offline by
design.

Nothing is broken by the mistaken premise today, because nothing acts on it. What it changes is the
**menu** a v-next ruling is chosen from. The predecessor finding presents one option — a wire field
carrying inline skill content, which is a schema bump plus editor and worker work in three
workspaces. A second option exists and was invisible: refuse by name at the producer, in the same
message `configToSeedPayload` already builds for the marketplace and model cases, using a
discriminator this package already ships.

## Fix Applied

The discriminator is now the round trip's ownership test.

`judgeSkill` (`lib/seed/installation-payload.ts`) asks `readForkedFromMetadata` of every eject-mode
entry whose directory exists, and an entry with no provenance is dropped from the payload rather
than named in it. Three guards sit above that call and each says why the case above it never
reaches the disk read: a marketplace skill has no local directory and needs none, a tombstone is a
statement about something not installed here, and a configuration recording an install that is not
there is evidence of nothing rather than evidence of authorship.

The owner's ruling picked a third answer, not either of the two this finding offered:

- **Not refuse.** A hand-written skill does not fail a share.
- **Not carry inline.** No wire field for it. (v5's `external` carries content for a different
  case — a skill the round trip DOES own that answers to no catalogue, i.e. one a previous
  `--from` carried in.)
- **Outside the round trip.** A shared configuration never carried it, so nothing about leaving it
  home is lossy.

The check sits in one place, as this finding required: both `share` and `edit --ui` mint through
`seedPayloadForInstallation`, and `skillsAuthoredHere` re-exports the same judgement to
`edit --from` so the destructive apply keeps what the producer never claimed. `authoredHereKept` in
`utils/messages.ts` is what tells the user which ones and how to remove them for real.

## Proposed Standard

1. **Amend the "Locally-authored skills" bullet in
   `2026-08-16-the-seed-contract-cannot-carry-half-of-what-a-config-holds.md`.** Its "no refusal
   available" verdict is the load-bearing claim of that item and it is not true; a reader deciding
   v-next from that list would never consider the cheaper half of the choice. **Done** — that item
   now records the disk-side answer and is marked resolved there.

2. **Record the discriminator where the question is asked, not only where it is answered.**
   `forkedFrom` is documented as uninstall's own concern. It is in fact the package's single
   answer to "is this skill directory the CLI's copy or the user's?", and both `seed-contract.md`
   (§ what the contract cannot carry) and the uninstall documentation should name
   `readForkedFromMetadata` as that one answer, so the next producer that needs it finds it instead
   of concluding, correctly from `ProjectConfig` and wrongly overall, that only the matrix knows.

3. **State the pairing rule in `seed-contract.md`'s producer section:** every refusal
   `configToSeedPayload` makes is made for both commands that mint an id, and any new producer-side
   check goes into that mapping rather than into a command. `edit --ui` is the first evidence the
   rule is needed; there was exactly one producer when the refusals were written.
