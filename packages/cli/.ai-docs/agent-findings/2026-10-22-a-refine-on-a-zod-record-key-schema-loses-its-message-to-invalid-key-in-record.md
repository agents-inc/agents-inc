---
type: missing-standard
severity: low
affected_files:
  - packages/matrix/src/seed.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-10-22
reporting_agent: cli-developer
category: typescript
domain: shared
root_cause: convention-undocumented
status: open
---

## What Was Wrong

A rule on a zod record's KEY schema reports a refused key as `invalid_key` with the message
`Invalid key in record`. Its own message survives only in that issue's nested `issues`, which no
formatter in this repository reads. Probed against the repository's installed zod:

```
z.record(z.string().refine((key) => !key.includes(".."), { message: "custom key message" }), z.string())
  .safeParse({ "../x": "y" }).error.issues
→ [{"code":"invalid_key","origin":"record","issues":[{"code":"custom","path":[],"message":"custom key message"}],"path":["../x"],"message":"Invalid key in record"}]
```

The shared-configuration schema needed such a rule: `seedSkillTreeSchema` now refuses a carried
file key that steps through `..` or holds a NUL. Written on the key schema, the editor and
`share --stdin` would have shown `…files.../victim.md: Invalid key in record`, with nothing saying
what was wrong with the key. The rule therefore sits on the record as a `superRefine` that adds one
issue per bad key. That keeps the path (`["files", <key>]`, or `["external", <id>, "files", <key>]`
in a full payload) and the wording, which matrix `seed.test.ts` pins in "names the carried file that
climbs out of its folder".

Census of key schemas carrying a constraint, from
`grep -rn --include='*.ts' --include='*.tsx' -E '\.record\(' packages apps --exclude-dir=node_modules --exclude-dir=dist | grep -E 'record\(z\.string\(\)\.|record\([a-zA-Z]+Schema'`:
one site, the same tree's `z.string().min(1)` key. An empty file key is refused there as
`Invalid key in record` rather than with a length message. Nothing names that case today, and it was
left as found.

## Fix Applied

The new per-key rule in `seedSkillTreeSchema` is a record-level `superRefine`, with a comment saying
why. The `min(1)` key was not changed.

## Proposed Standard

`typescript-types-bible.md`, beside its zod guidance: a key rule whose message a user reads goes on
the record (`superRefine` adding `path: [key]`), never on the key schema, where zod replaces the
message with `Invalid key in record`. A key constraint whose refusal nobody reads may stay on the
key schema. This conflicts with nothing in either `CLAUDE.md`.
