---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/skills/skill-plugin-compiler.ts
  - src/cli/lib/skills/skill-copier.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  The plugin compiler is fixed. The eject copier (`copySkillTo` in `skill-copier.ts`) has the same
  shape and is not fixed. Whether a re-ejected skill folder should drop what its source dropped is
  an owner decision, because an ejected folder is the user's to edit.
---

## What Was Wrong

`compileSkillPlugin` created the plugin folder if it was missing and copied `SKILL.md`,
`reference.md`, `examples/` and `scripts/` over it. It never removed anything. A file deleted from a
skill's source therefore stayed in its plugin after every later build. In the skills repository's
`dist/plugins`, 64 files across 40 plugins had no source left. For example,
`api-database-redis/examples/redis.md` was removed from the source in `5c627838`, and the build kept
shipping it. That count is a census: every file under each plugin's `skills/<name>/` was checked
against its source folder.

Nothing could notice. The content hash and the version bump only read the source, so the plugin's
version moved while its stale files stayed.

Sibling search: `grep -rn "await copy(" src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`.
That found 8 sites. `copySkillTo` in `skill-copier.ts` has the same shape: it copies a skill over an
existing ejected folder without clearing it, and it is reached from `eject`, `copy-local-skills.ts`
and `mode-migrator.ts`. `agent-plugin-compiler.ts` writes one fixed-name file per plugin, so it
cannot strand a file inside a plugin. The rest copy into a fresh scratch folder, a folder that
`--force` governs, or a folder the move guards.

## Fix Applied

`compileSkillPlugin` now reads the earlier build's `plugin.json` and `.content-hash` first, because
they carry the version forward. Then it removes the plugin folder and writes it again from scratch.
It only removes a folder that holds `.claude-plugin/plugin.json`, which is the same "only what is
recognisably ours" rule `pruneStaleSkillPlugins` follows in `commands/build/plugins.ts`. A skill
whose name is not a single folder name (`''`, `.`, `..`, or a path) is refused before anything is
written. So is a plugin folder that would hold the skill's own source, as with
`build plugins -o src/skills`, where the second run would otherwise delete the source.

Tests: `skill-plugin-compiler.test.ts` › "rebuilding a plugin over its earlier build", and
`e2e/commands/build-plugins-drops-files-the-source-dropped.e2e.test.ts`. Each guard was checked by
mutation: dropping it, clearing unconditionally, or clearing before the version read each turns its
test red.

## Proposed Standard

`clean-code-standards.md`, beside the file-writing rules: **a step that regenerates a folder from a
source must replace what it wrote last time, not write over it.** Read anything the step carries
forward first, such as a version or a hash. Only remove a folder the step can recognise as its own
earlier output, and refuse a destination that would contain its own input. The test that catches a
violation deletes a source file between two runs and checks the full file list after the second.
Checking that the new files exist is not enough, because a write-over passes it.

This does not conflict with any CLAUDE.md rule. It does not settle the ejected-skill case, which
needs the owner to decide whether the user owns that folder.

## Correction

Review found that "only removes a folder that holds `.claude-plugin/plugin.json`" protected a folder
no build made for one build only. The first build wrote into it, which put a manifest there; the
second build then took it for an earlier build and deleted it whole, a user's file included — a
deletion the build before this fix never made. A step that recognises its own output by a marker it
writes adopts every folder it writes into once.

`assertClearable` now refuses a plugin folder that is not empty and holds no manifest, before
anything is written. The unit test builds twice and checks the output tree is unchanged after both.
Clearing unconditionally is now caught by "leaves a file standing where the plugin's folder would
go", since the refusal stops a foreign folder before the clear is reached.

The proposed standard gains a clause: **never write into a non-empty folder the step does not
recognise as its own**, and its test runs the step twice.
