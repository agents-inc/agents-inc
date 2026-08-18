---
type: missing-standard
severity: high
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/commands/init.tsx
  - src/cli/base-command.ts
  - src/cli/lib/seed/seed-apply.ts
  - src/cli/utils/messages.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-17
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  Code side landed for both instances (the home-root refusal is now shared on BaseCommand and
  called by both `--from` producers; the third kept-reason is in `reconcileSharedConfig`). The
  Proposed Standard below is not written into any standards doc yet.
---

## What Was Wrong

`edit --from <id>` was built as a second producer feeding the apply sequence `init --from <id>`
already fed. It reused the decode, the external-skill seating, the skip warnings and the wording,
and it went in hours after `init --from`'s own refusals were settled the same day. Two defects
came out of that, and they are opposite halves of one mistake — the second producer was checked
against the first's HAPPY path and never against the first's refusals or against its own
preconditions.

**1. A refusal the first producer carries and the second does not (CLI-512).** D-310 established
that the home directory IS the global scope and a global installation holds only global-scoped
content, and gave `init --from` `refuseProjectScopedContentAtHome`. `edit --from` declared none, so
the same payload applied at `$HOME` wrote `scope: "project"` rows into the global config — the
exact state the refusal exists to prevent, reached through the other door. Worse there than here,
because this producer is destructive: the hand-run below removed a global install on the way in.
Verified against the pre-fix binary, at a `$HOME` holding a global install of two skills, applying
a configuration whose skill and sub-agent are both `scope: "project"`:

```
Applying this configuration will remove:
 Skills:
 web-testing-vitest (e2e-test-fixture-web-testing-vitest)
Apply this configuration?  y
Changes:
  - web-testing-vitest [G]
  + web-framework-react ([G] -> [P])
  ~ web-developer ([G] -> [P])
    Error: Source and destination must not be the same.
[exit 1]
```

The scope migration then crashes — at the home root both scopes resolve to one directory, so the
copy is a directory onto itself — after the removal has already been announced. The contradiction
D-310 named surfaces as an unhandled `fs-extra` message and exit 1.

**2. An outcome that costs the first producer nothing and deletes for the second (CLI-511).** An
id the catalogue cannot place is SKIPPED by the decode. Into `init --from`'s clean directory that
costs nothing. Over `edit --from`'s installation it is a deletion: the skipped id is absent from
the decoded roster, so nothing put it back, and it landed in `removedSkills` with only
`Skipped N skill(s) this catalog does not know` to explain why an installed skill went. The
payload NAMED the id — the instruction was "keep it" — so the removal was the command acting on
its own inability to place something rather than on anyone's intent.

## Fix Applied

- `refuseProjectScopedContentAtHome` and its `projectScopedContent` helper moved from `init.tsx`
  to `BaseCommand`, beside the other refusals both commands share (`ensureConfigReadable`,
  `ensureSavedSkillsReadable`). Both `--from` producers now call the one method, at the same point
  of the same value: immediately after the decode, above every skip warning and every mutation.
  Moved rather than exported from `init.tsx`, because `edit.tsx` importing `init.tsx` would be a
  second command-to-command edge — `dependency-graph.md` note 130 records the one that exists as
  sitting outside the layer model.
- `reconcileSharedConfig` gained a third kept-reason. `ReconcileOptions.unplaceable` takes the
  decode's own `skippedSkillIds`, and an installed entry the payload named but the decode could
  not place is put back into the RESULT (where the removal diff can see it) and disclosed through
  `unplaceableKept` with the remedy that is true of it — the catalogue, not the skill.
- Where more than one reason covers an entry, `reasonKept` picks from the most permanent claim to
  the least: authored-here, then unplaceable, then inherited-global. Each statement carries its own
  remedy, so the reason named has to be the one that is true of the whole entry.

## Proposed Standard

For `.ai-docs/standards/clean-code-standards.md`, as a numbered rule about adding a producer to an
existing pipeline:

> **A second producer of one apply sequence inherits the first's refusals, and a destructive one
> re-costs the first's harmless outcomes.**
>
> When a new entry point is wired into a sequence something else already drives, two questions are
> owed and neither is answered by the tests passing:
>
> 1. **Which refusals does the existing producer carry, and does each one hold here?** A refusal
>    about the payload or the directory — rather than about that command's own preconditions — holds
>    for every producer, and an invariant enforced on one is enforced nowhere. Put it where both
>    reach it (`BaseCommand` for commands) rather than copying it; two definitions of the same
>    judgement are the shape to avoid.
> 2. **Which of the existing producer's non-failures are non-failures HERE?** Skipping, defaulting
>    and ignoring are free over a clean directory and are not free over an installation. A
>    destructive command must act on intent and never on its own inability to place, resolve or
>    understand something — where it cannot carry out an instruction it was given, the entry stays
>    and the run says why.
>
> Both questions are cheap to answer at the diff and impossible to answer from a green suite: the
> first producer's specs cover the first producer.
