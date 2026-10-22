---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/src/cli/lib/seed/external-skills.ts
  - packages/cli/src/cli/commands/edit.tsx
  - packages/matrix/src/seed.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  REPO-44 lane p-verify-fix-2. `externalIdsNamingNoDirectory` in packages/matrix/src/seed.ts names
  every `external` key that is not one directory name (empty, `.`, `..`, a `/` or `\`, a NUL).
  `registerExternalSkills` refuses such a payload before anything is seated or written, and
  `installableSeedPayloadSchema` refuses it at mint. Held by "a carried skill's id" in
  packages/matrix/src/seed.test.ts, the two refusals in external-skills.test.ts, and the two
  "climbs out of" legs in e2e/interactive/from-refusals-come-before-the-question.e2e.test.ts, both
  watched red against a build with the CLI refusal removed. Lane p-verify-fix-3 added the clause
  the superseded finding proposed and this fix had left out: `holdsAControl` refuses any C0, DEL
  or C1 character, so no id can print a terminal sequence or name a directory `doctor` rejects.
  Held by the control cases in seed.test.ts, the worker's POST /configs spec, and
  a-link-carrying-terminal-controls.test.ts, each watched red with the clause removed.
supersedes: 2026-10-21-a-dry-run-against-scratch-copies-writes-wherever-the-payload-id-points.md
---

## What Was Wrong

A shared configuration carries an added skill's bytes under `external`, keyed by the skill's id, and
the CLI uses that id as the skill's directory name. `externalSkillDir` and `scratchCopyOf` in
`lib/seed/external-skills.ts` both did `path.join(<folder>, id)` with the key exactly as it came off
the wire. `seedPayloadSchema.external` is `z.record(z.string(), …)`, and nothing between the fetch
and the join checked the key. So `../victim` was a path, not a name.

Two holes followed from that one gap:

- `edit --from` judges what a carried skill would change by writing it into a scratch folder under
  `os.tmpdir()` before it asks (`carriedThatChange` → `carriedSkillsThatDiffer`). `../victim` wrote
  the payload's files into `$TMPDIR/victim` while the question was on screen, and they stayed after a
  No.
- `init --from` with `../../../escaped-dir` wrote into `$HOME/escaped-dir` from a project and only
  then failed on a later path check, leaving the files behind.

The per-file keys of a carried skill were already refused before writing (`refuseEscapingPaths`).
The key one level up, which names the directory every one of those files is written into, was not.

## Fix Applied

One predicate in the wire contract, `externalIdsNamingNoDirectory(payload)` in
`packages/matrix/src/seed.ts`, used in two places. `registerExternalSkills` calls it first and
throws, naming each id quoted, so no matrix entry is seated and no path is joined. The mint schema
(`installableSeedPayloadSchema`) calls it as well, so the worker, the api-mocks worker, the editor's
pre-POST check and `share --stdin` all refuse such a payload. The CLI refuses every such key in
`external`, selected or not, so that it accepts exactly what the mint accepts.

Census of the other payload keys that reach a path, from
`grep -rn "path.join" packages/cli/src/cli/lib/seed/*.ts` and the decode in
`packages/compile/src/seed-to-config.ts`:

- `skills` keys are resolved against the catalogue (`isSkillId`), and unknown ones are skipped.
- `agents` keys go through `isAgentName`, and unknown ones are skipped.
- `external[*].files` keys are refused by `refuseEscapingPaths` before that skill writes. The mint
  schema still accepts an escaping file key (`seedSkillTreeSchema` keys are `z.string().min(1)`).
  That is not reachable as a write on the CLI, but the worker will store such a key.
- `installation-payload.ts` joins `skill.id` from the installed config, not from the wire.

## Proposed Standard

`packages/cli/CLAUDE.md`, under "Data Integrity": a key or value from a shared configuration that
becomes a path segment is refused at the boundary that registers it, as anything other than one
directory name. The refusal lives in `@workspace/matrix/seed` beside the schema, so the CLI and the
mint cannot disagree about what is installable. A check at the write is not enough, because the
CLI now writes before it asks in at least one place: the scratch rehearsal behind `edit --from`'s
plan.
