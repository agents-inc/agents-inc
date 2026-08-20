---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/skills/skill-plugin-compiler.ts
  - src/cli/lib/skills/skill-metadata.ts
  - src/cli/lib/skills/local-skill-loader.ts
  - src/cli/lib/plugins/plugin-manifest.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-19
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`2026-08-10-a-known-gap-pinned-as-an-arity-assertion-is-invisible-to-grep.md` carries one unwritten
residue: a rule that **`metadata.yaml` is a generator input rather than a shipped artefact**, to be
added to `clean-code-standards.md`.

**That sentence contradicts a rule already written in the same document**, so it was not adopted.
`clean-code-standards.md` 15.15 opens: "A file the CLI writes into an installed skill directory is
the only thing a later command can ask about that install. `share`, `edit --ui` and `uninstall` all
read `metadata.yaml` offline: no catalogue, no network." That is the opposite claim about the same
file, and 15.15 is the newer and better-evidenced of the two.

Both are true, of different install paths, and neither says which path it means. That is the actual
gap.

**Eject / local path — `metadata.yaml` IS the shipped artefact.** `skill-copier.ts` copies the skill
directory and then calls `injectForkedFromMetadata` (`skills/skill-metadata.ts`), which writes
`{destPath}/metadata.yaml`; `external-skills.ts` does the same for a carried skill. On the read side
`extractLocalSkill` in `skills/local-skill-loader.ts` returns `null` when the file is absent, so an
installed local skill without one is not discovered at all. 15.15 governs this path exactly.

**Plugin-build path — `metadata.yaml` IS a build input and is not copied.** `compileSkillPlugin` in
`skills/skill-plugin-compiler.ts` reads it through `readSkillMetadata`, lifts `author` and
`category` into the manifest via `generateSkillPluginManifest`, and then writes only `SKILL.md`,
the members of `SKILL_CONTENT_FILES` and the members of `SKILL_CONTENT_DIRS` into
`{pluginDir}/skills/{skillName}/`. `metadata.yaml` is in none of those, so it does not ship. It is
also absent from `computeSkillFolderHash` (`lib/versioning.ts`), which hashes the same two
constants — so a metadata-only edit does not move the content hash and does not bump the plugin
version.

## Fix Applied

None. The grading pass that found this stopped rather than resolve a contradiction between a
proposal and a written rule.

## Proposed Standard

Two questions to settle before any rule is written, and the second may not be a documentation
question at all.

1. **Which fields cross into an installed skill, per install path?** A field added to
   `localSkillMetadataSchema` is visible to an ejected install and invisible to a plugin install
   unless it is also threaded through `generateSkillPluginManifest`, whose emitted set is fixed
   (`name`, `version`, `skills`, `description`, `author`, `category`, `keywords`). A rule stating
   that, beside 15.15, would close the class the original residue was reaching for — without the
   blanket claim, which is false on the eject path.

2. **Is the plugin path's omission deliberate?** 15.15's premise is that `share`, `edit --ui` and
   `uninstall` interrogate an install offline through `metadata.yaml`. A plugin-installed skill has
   no `metadata.yaml` on disk, so either those commands do not reach plugin installs, or they
   answer from somewhere else, or 15.15 over-generalises from the eject path. This is a product
   question, not a wording one, and the answer decides whether the rule above is a documentation
   change or a defect report.

Sample, not a census: the paths above were traced from `metadata.yaml`'s writers and readers in
`src/cli/lib/skills/`. No sweep of the commands named in 15.15 was run against a plugin install.
