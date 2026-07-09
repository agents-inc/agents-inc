---
type: anti-pattern
severity: medium
affected_files:
  - e2e/interactive/uninstall.e2e.test.ts
  - e2e/interactive/edit-agent-scope-routing.e2e.test.ts
  - e2e/interactive/edit-skill-accumulation.e2e.test.ts
  - e2e/commands/list.e2e.test.ts
  - e2e/commands/uninstall.e2e.test.ts
  - e2e/commands/uninstall-preservation.e2e.test.ts
  - e2e/commands/doctor.e2e.test.ts
  - e2e/commands/doctor-diagnostics.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-04-13
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: writeAgentStub/writeAgentFile helpers adopted across 8 files
---

## What Was Wrong

E2E test files contained inline `mkdir` + `writeFile` calls to create agent .md stubs and skill metadata, duplicating logic that helpers in `e2e/helpers/test-utils.ts` already provide. Patterns found:

1. **Inline metadata YAML for forkedFrom** in `uninstall.e2e.test.ts` -- the existing `addForkedFromMetadata()` helper does exactly this.
2. **Inline agent stub creation** (`mkdir` + `writeFile` with frontmatter) in 4+ files -- repeated pattern of creating `---\nname: X\n---\ncontent` files in `.claude/agents/`.
3. **Inline agent file writes** (`writeFile` for simple `# AgentName` content) in doctor/list tests.

## Fix Applied

- Replaced inline metadata YAML in `uninstall.e2e.test.ts` with `addForkedFromMetadata()`.
- Created file-local `writeAgentStub()` helpers in files that need agent frontmatter (edit-agent-scope-routing, edit-skill-accumulation, uninstall-preservation).
- Created file-local `writeAgentFile()` helpers in files that need simple agent .md files (list, uninstall, doctor-diagnostics).
- Added explanatory comments for intentionally manual constructions (corrupt config in doctor.e2e.test.ts, fabricated skill IDs not in SkillId union in doctor-diagnostics.e2e.test.ts and uninstall.e2e.test.ts).

## Proposed Standard

Consider adding a shared `writeAgentStub()` helper to `e2e/helpers/test-utils.ts` if the pattern continues to appear in new test files. Currently, file-local helpers were used to keep the change minimal and avoid modifying the shared utility for a pattern that has two variants (with/without frontmatter).

Add to `.ai-docs/standards/e2e/anti-patterns.md`:

- "Do not inline `mkdir` + `writeFile` for agent .md stubs -- use a `writeAgentStub()` or `writeAgentFile()` local helper, or a shared helper from `test-utils.ts`."
- "When manual file construction is required for edge cases (corrupt files, fabricated IDs not in type unions), add a comment explaining why."
