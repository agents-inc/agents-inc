---
type: architectural-drift
severity: medium
affected_files:
  - packages/cli/src/cli/lib/seed/external-skills.ts
  - packages/cli/src/cli/lib/seed/installation-payload.ts
  - packages/cli/src/cli/lib/skills/skill-metadata.ts
  - packages/cli/src/cli/utils/fs.ts
standards_docs:
  - .ai-docs/reference/features/seed-contract.md
date: 2026-08-17
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  Code landed — provenance now records the directory, and the producer rebuilds the `external`
  entry from it. The standard is NOT written: nothing in `.ai-docs/standards/` says that a field
  the CLI writes into `metadata.yaml` is the ONLY thing a later command can ask about an install,
  so a field added late is invisible on every directory written before it.
---

## What Was Wrong

The change that gave a payload the ability to CARRY a skill's directory (`external`) gave the
receiver everything it needed to install one. It recorded, in the installed `metadata.yaml`, the
repository those bytes came from (`forkedFrom.source`) and not the directory inside it. Nothing at
the time needed the directory, so nothing missed it.

The half that needed it was the producer, and it did not exist yet. `configToSeedPayload` re-emitted
a carried skill as a plain `install: "eject"` row with no `external` entry, so **installing the
minted id somewhere else skipped the skill**. Proven by hand against the built binary before any
code changed:

```
$ node dist/index.js init --from Repro001 --marketplace <fixture>     # project A
Wrote 1 skill(s) this configuration carries: external-web-tooling-brainstorming
$ node dist/index.js share                                            # project A
✓ Shared as IYOzaBQD
   posted body: { "skills": { "external-web-tooling-brainstorming": {...} } }   # no "external"
$ node dist/index.js init --from IYOzaBQD --marketplace <fixture>     # project B, clean
Copied 0 skills to .claude/skills/
 ›   Warning: Skipped 1 skill(s) this catalog does not know: external-web-tooling-brainstorming
```

**The general shape, which is the part worth recording.** A skill's directory on disk is the only
evidence a later command has about how that skill got there — `share` and `edit --ui` load no
catalogue and reach no network. So every question a future command will ask has to have been
answered at install time, into `metadata.yaml`, by a build that had no reason to ask it. Ownership
(`forkedFrom` present at all) was recorded early enough and works. The directory was not, and the
gap was invisible until a producer needed it.

**The consequence that has no fix, and cannot have one.** A skill carried by a build that recorded
`forkedFrom.source` and not `forkedFrom.path` records a repository and no directory, which is
byte-for-byte what an ordinary ejected catalogue skill records. Nothing on disk tells them apart, so
the producer treats it as a catalogue skill and it travels as an id — which the receiver can only
resolve if it already has the skill. **Cross-machine, this is real and unchanged:** installing the
minted id in a clean directory reports "Skipped 1 skill(s) this catalog does not know" and installs
less than the sharer has. Re-adding the skill under the current build is the whole of the remedy,
which is discard-don't-migrate applied to content rather than to ids. The population is developer
machines only: v5 is unreleased, and the content field landed the same day.

**The blast radius stops at the id — a `path`-less carried skill is NOT dropped from the payload.**
This corrects the prediction this finding was written with, which was that `edit --from` would
delete such a skill on a round trip through the editor. Tested by hand against the built binary,
by stripping `forkedFrom.path` from a real install and round-tripping it:

- **The producer still names it.** `judgeSkill` (`lib/seed/installation-payload.ts`) decides
  OWNERSHIP, and `forkedFrom` being present at all is the whole of that test — `path` plays no part
  in it. The entry is `owned: true`, so it travels as a bare id. Only its `external` entry is
  missing: `readCarriedSkill` returns `{ carries: "nothing" }` when `provenance.path === undefined`,
  on the reading that a skill with no recorded directory has a catalogue behind it and its bytes
  can stay home.
- **The receiver resolves it, on the same machine.** A skill sitting in `.claude/skills/` is merged
  into the loaded matrix by the local-skill discovery every load runs, so the id the payload names
  is a known id there.
- **So the destructive apply keeps it.** `edit --from` removes what the payload OMITS, and the
  payload did not omit it.

What the missing `path` costs is therefore exactly one thing — the bytes do not travel — and it
costs it only where the receiver does not already have them.

Two smaller drifts, found in passing and fixed with the row:

- `external-skills.ts` wrote `` `github:${repo}` `` inline while `GITHUB_SOURCE.GITHUB_PREFIX`
  exists in `consts.ts`. Harmless until something had to READ that form back — a hardcoded prefix
  and a constant-driven reader are two spellings of one format.
- `glob()` in `utils/fs.ts` passed no `dot` option, so fast-glob's default skipped dotfiles. Right
  for every existing caller (all of them scan FOR something) and wrong for the first caller that
  had to reproduce a directory faithfully: a `.` file the write side accepts would have been
  dropped on the way back out, silently.

## Fix Applied

Landed in four parts:

1. **`ForkedFromMetadata` gained `path`** — the skill's own directory inside the repository
   `source` names. Written only by `external-skills.ts`, through `injectForkedFromMetadata`, which
   is the package's single writer of that block. Its 4th parameter became a bag
   (`Pick<ForkedFromMetadata, "source" | "path">`) rather than a 5th positional string, because two
   adjacent optional strings can be swapped silently and these two mean different things.
2. **`path` is the discriminator, and says what it means.** A marketplace resolves every id it
   serves, so an ejected catalogue skill needs no directory recorded and has none. A carried skill
   answers to no catalogue and the directory is its only address. "Has a recorded directory" is
   therefore not a flag bolted on to mean "external" — it is the property that makes it external.
3. **`readCarriedSkills` rebuilds the entry from disk**, validated by `seedExternalSkillSchema`
   itself rather than by rules restated in the CLI. That is what makes `MAX_EXTERNAL_SKILL_BYTES`,
   the SKILL.md requirement and every field's shape one definition instead of two: a directory that
   has grown past the cap since install is refused by name, in the same sentence as everything else
   the installation cannot share.
4. **`configToSeedPayload` takes what is carried as a required argument.** A default would have let
   the next producer forget the content, which is precisely this defect.

Half an address is refused rather than guessed: a directory recorded with no repository (or with a
ref this contract has no word for) produces a named refusal, so no payload claims to carry content
it could not read.

## Proposed Standard

1. **Into `standards/` (clean-code or a new "provenance" section), the rule this defect is an
   instance of:** a file the CLI writes into an installed skill directory is the ONLY thing a later
   command can ask about that install — `share`, `edit --ui` and `uninstall` all read it offline,
   with no catalogue and no network. So a field added to it is invisible on every directory written
   before the field existed, and there is no migration to add it retroactively. When a feature gives
   the CLI a new kind of install, record everything the INVERSE operation will need at the moment of
   writing, not when the inverse is built.

2. **Into `seed-contract.md` § "The `share` Producer Path"** (not written): `configToSeedPayload`'s second parameter, what decides that a skill's bytes travel, and
   the two refusals the content reader adds to `unshareableConfigError`. The Known Limitations table
   should carry the old-build blind spot above, since it is a real state a real machine can be in.

3. **A convention for `utils/fs.ts` `glob`:** name the two uses it now serves. A scan looking for
   known filenames wants the default; a read reproducing a directory wants `{ dot: true }`. The
   option is documented on the function, which is where a reader will meet it, but nothing says
   which of the two a new caller is.
