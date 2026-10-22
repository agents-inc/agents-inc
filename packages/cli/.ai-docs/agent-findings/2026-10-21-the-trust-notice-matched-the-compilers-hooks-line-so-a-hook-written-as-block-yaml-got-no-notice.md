---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/lib/hosts/claude-project-trust.ts
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  REPO-44 lane T1-trust-every-hook. `declaresAHook` in claude-project-trust.ts now parses the
  frontmatter through `extractFrontmatter` (utils/frontmatter.ts) and reads the top-level `hooks`
  record. The spec "speaks for a hook written by hand as block YAML" in
  the-claude-host-asks-for-folder-trust.test.ts failed against the old reader and passes now.
---

## What Was Wrong

`claudeCompileNotices` decides whether to print the Claude folder-trust notice by reading every
`*.md` in the project's `.claude/agents/`, including agent files a user wrote by hand. The old
reader split the file on `---` and matched `/^hooks:\s*\{.*"(Stop|SubagentStop)":\[\{/m`, which is
the single JSON line `agent.liquid` writes. A `hooks:` key written as block YAML has no `{` on its
own line, so the notice said nothing about it. Claude Code parses this frontmatter as YAML, so it
would still drop that hook until the folder is trusted. That last step is an inference from how
Claude Code reads frontmatter and was not checked against a live Claude Code.

The same pattern also held the notice's scope. Its event list was the completion gate's
(`Stop`/`SubagentStop`), and the spec "says nothing about a sub-agent whose only hook is on another
event" made that list look like a rule. The scope stayed after compile stopped adding a completion
gate (`2026-10-20-removing-a-default-hook-left-a-negative-about-its-notice-with-no-subject.md`),
until the owner ruled on 2026-10-21 that the notice covers every hook.

## Fix Applied

The reader now parses through `extractFrontmatter`, the parser `agent-plugin-compiler.ts` already
uses for compiled agents. A zod schema reads the top-level `hooks` record, and an event holding at
least one definition counts as a hook. A `hooks:` key nested under another key, an empty event and
a file with no hooks all still produce no notice, and each has a spec.

To find other production code that handles a frontmatter fence itself:
`grep -rnE '"---"|FRONTMATTER' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.\|__tests__'`.
On 2026-10-21 it returned `utils/frontmatter.ts` and the `NO_FRONTMATTER_REASON` constant in
`agent-plugin-compiler.ts`, and nothing else.

## Proposed Standard

`clean-code-standards.md` 7.11 says to use `parseFrontmatter()` for SKILL.md and not to write a
second extractor, but it names only SKILL.md. Proposed wording: read any frontmatter, including a
compiled sub-agent's `.md`, through the shared parser (`parseFrontmatter()` for SKILL.md,
`extractFrontmatter` in `utils/frontmatter.ts` otherwise). Never match the line the compiler
writes, because that misses every file the compiler did not write. This widens 7.11 and does not
conflict with CLAUDE.md, whose matching ALWAYS rule also names only SKILL.md.
