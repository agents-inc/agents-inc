---
type: architectural-drift
severity: medium
affected_files:
  - packages/cli/scripts/generate-json-schemas.ts
  - packages/cli/scripts/generate-source-types.ts
  - packages/cli/src/schemas/project-config.schema.json
  - packages/cli/src/schemas/project-source-config.schema.json
standards_docs:
  - .ai-docs/reference/features/code-generation.md
date: 2026-08-19
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: convention-undocumented
status: partial
partial_note: >-
  The code half landed — both generators now format their own emitted strings in memory and
  neither writes to a file it does not own — and the `$comment` inside
  `src/schemas/project-config.schema.json` no longer describes the deleted behaviour; it states
  that `generate:schemas` writes nothing there and points at
  `reference/features/code-generation.md` for the gate rather than restating it. Pending: both
  proposed standards below. `code-generation.md` records the new behaviour descriptively, but
  neither rule exists in prescriptive form anywhere — not "a generator formats what it emits,
  never the directory it emits into", and not "an instruction about a build step does not belong
  inside the artefact it constrains".
---

## What Was Wrong

Both `scripts/generate-json-schemas.ts` and `scripts/generate-source-types.ts` ended by shelling out
to Prettier over their **output directory** rather than over their **output**:

```
execSync(`bunx prettier --write "${SCHEMAS_DIR}/"`, { stdio: "inherit" });
```

For the types generator that was harmless — `src/cli/types/generated/` holds exactly the two files
it emits. For the schema generator it was not. `src/schemas/` holds twelve files and
`SCHEMA_ENTRIES` names ten; the other two, `project-config.schema.json` and
`project-source-config.schema.json`, are hand-maintained. So `generate:schemas` reformatted two
files it does not own, on every run, and the gate beside it inherited them: a hand-written schema
that was merely unformatted made `generate:schemas:check` red, reported against the generator.

The coupling had already been noticed from the inside and written down in the wrong place — a
`$comment` **inside** `project-config.schema.json` instructs its own editors to "keep it
prettier-clean, or `generate:schemas:check` fails on the reformat". That is a hand-maintained file
carrying an instruction whose cause is a shell-out three directories away, and it is the only
statement of the rule anywhere.

Two consequences, both of which showed up while replacing the `git diff` checks with in-memory ones:

1. **A directory-wide format makes the emitted set unknowable from the generator.** Anything that
   compares emitted bytes against disk has to decide what it owns, and the write path had been
   answering "everything under the output directory" while `SCHEMA_ENTRIES` answered "these ten".
   The two answers had never been forced to agree because nothing had ever compared them.
2. **The gate blamed the wrong party.** A stale hand-written schema, or one edited without running
   Prettier, failed a check whose message names the generator and whose remedy — "run
   `generate:schemas`" — happens to work only because the shell-out silently rewrites the file.

## Fix Applied

Both generators now build `{ path, content }` in memory and format each emitted string through
Prettier's Node API. The `execSync` shell-outs are gone, so neither generator writes to a file it
does not own, and `check` judges exactly the set `SCHEMA_ENTRIES` (or the two type files) declares.
`generate-json-schemas.test.ts` pins the boundary directly: corrupting **both** hand-maintained
schemas leaves `check` clean.

Prettier's options are resolved from the generator's own path rather than from the destination,
which is what lets `check` compare a fixture directory in `os.tmpdir()` against what the committed
files hold. Resolving from the destination would give a temp directory a different config, or none,
and the check would report permanent drift against its own fixtures.

`format:check` is now the only thing keeping the two hand-maintained schemas Prettier-clean. That is
not a regression: `prepublishOnly` runs `format:check` before both generator checks, and `eslint .`
/ `prettier --check .` cover `src/schemas/` from the package root either way. It is a change of
which gate reports the problem, and the new one names the right file.

The `$comment` in `project-config.schema.json` no longer instructs its editors about a gate
three directories away. It says `generate:schemas` writes nothing to the file, keeps the
hand-edit instruction that is genuinely about this artefact, and names the reference doc that
owns the formatting gate instead of restating it — one writable copy of that fact, not two.

## Proposed Standard

In `.ai-docs/reference/features/code-generation.md`, where the emission pipeline is described:
**a generator formats what it emits, never the directory it emits into.** The directory is shared —
with hand-maintained siblings here, and in principle with anything else — and a write path that
cannot say which files it owns gives its check nothing to compare. The concrete rule: build
`{ path, content }`, format the content, then write or compare. Never `prettier --write <dir>`.

A second rule follows from where the old one was written down: **an instruction about a build step
does not belong inside the artefact it constrains.** A `$comment` in a JSON schema telling its
editors how to survive a generator's shell-out is invisible to everyone reading the generator, and
it outlives the behaviour — as this one now has. Put it in the reference doc that owns the
pipeline, and let the artefact carry only what it is.

Cross-checked against CLAUDE.md: no NEVER/ALWAYS rule covers generator output boundaries, and
nothing here contradicts one. The nearest neighbour is the standing rule that a result field must
have a producer — this is its file-level analogue, that a writer must be able to name what it wrote.
