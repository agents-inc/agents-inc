---
type: missing-standard
severity: medium
affected_files:
  - src/cli/lib/seed/external-skills.ts
  - packages/matrix/src/seed.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-26
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: the carried id now has a byte limit (registerExternalSkills); a carried file's path segments still have none, and minting (installableSeedPayloadSchema) still accepts both
---

## What Was Wrong

Every name a shared configuration turns into a path segment was checked for its SHAPE and never
for the file system's LENGTH limit. A carried skill's id is its directory: `namesOneDirectory` in
`packages/matrix/src/seed.ts` refuses separators, `.`, `..` and control characters, and nothing
refused one over 255 bytes, so `init --from` printed the panel, asked, then died on
`ENAMETOOLONG … mkdir` and left an empty `.claude/skills/`; `edit --from` died the same way in its
scratch copy (CLI-936). A carried file's key is checked only for staying inside its folder
(`leavesItsDirectory` in the same file, `refuseEscapingPaths` in `external-skills.ts`), so a
256-byte file name makes `init --from` exit 1 with `ENAMETOOLONG … open` and leaves `SKILL.md`,
`metadata.yaml` and an empty `references/` behind with no config written (reproduced by the
CLI-936 tester, `handrun-sibling-file-name-256.log` in that lane's evidence).

Sites, from `grep -rn "path.join(\|path.resolve(" src/cli/lib/seed/*.ts` (census): the id reaches
`externalSkillDir` and `scratchCopyOf`; a file key reaches `writeExternalSkill`.

## Fix Applied

The id half: `registerExternalSkills` refuses every carried id over 255 UTF-8 bytes by name, before
anything is seated, so both commands stop before the panel and write nothing. Specs:
`external-skills.test.ts` "a carried skill's id, against the longest name a directory may have",
and the two "…longer than a directory name may be" describes in
`from-refusals-come-before-the-question.e2e.test.ts`, each with a 255-byte control.

Not fixed: the file-key half (no reds; not in CLI-936's row), and minting — the editor's
`externalSkillId` has no length cap, and `installableSeedPayloadSchema` is outside the lane.

## Proposed Standard

`packages/cli/CLAUDE.md` § Data Integrity: a string from a payload that becomes a path segment is
refused before any write for its shape AND for the 255-UTF-8-byte segment limit, at install and at
mint, with a control at exactly 255 bytes. Doesn't conflict with any NEVER/ALWAYS rule. The
stronger home is `namesOneDirectory` / `leavesItsDirectory` in `packages/matrix/src/seed.ts`, which
install and mint already share.
