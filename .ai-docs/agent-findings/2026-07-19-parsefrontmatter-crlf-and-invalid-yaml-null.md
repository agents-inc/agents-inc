---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/loading/loader.ts
  - src/cli/utils/frontmatter.ts
  - src/cli/lib/loading/loader.test.ts
standards_docs:
  - .ai-docs/reference/features/skills-and-matrix.md
date: 2026-07-19
reporting_agent: cli-developer
category: dry
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: Pass 8 Cluster D item 1 — parseFrontmatter now delegates to extractFrontmatter; findings + tests updated.
---

## What Was Wrong

Two separate SKILL.md frontmatter extractors existed with divergent regexes:

- `loader.ts` `parseFrontmatter` used `/^---\n([\s\S]*?)\n---/` — LF-only, so any
  file saved with Windows (CRLF) line endings failed to match and the skill was
  silently dropped (loader.test even asserted this as a "current limitation").
- `utils/frontmatter.ts` `extractFrontmatter` used `/^---\r?\n([\s\S]*?)\r?\n---/`
  — CRLF-tolerant — and wrapped `parseYaml` in try/catch, returning `null` on
  malformed YAML instead of throwing.

Maintaining two extractors let the CRLF bug live in one path while the other was
correct, and the two disagreed on error semantics (throw vs. null).

## Fix Applied

`parseFrontmatter` now delegates extraction to `extractFrontmatter`, then runs the
same `skillFrontmatterLoaderSchema.safeParse` on the returned parsed object. Two
deliberate behavior changes result, both recorded here:

1. **CRLF tolerance** — SKILL.md files with `\r\n` line endings now parse (the
   deliberate fix). The known-limitation test was flipped to assert a successful parse.
2. **Invalid YAML returns `null` instead of throwing** — `extractFrontmatter`
   catches YAML parse errors. Two loader tests that asserted `parseFrontmatter`
   throws on tab-indented / unclosed-bracket YAML were flipped to assert `null`.
   This is strictly more robust (aligns with the documented "invalid-YAML-crashes-
   whole-matrix" known gap in skills-and-matrix.md) and matches how callers already
   treat a `null` return (skip the skill).

Schema validation is unchanged: `safeParse` receives the identical parsed YAML
object it received before.

## Proposed Standard

One extractor per concern. When two utilities parse the same on-disk shape, they
MUST share a single implementation; divergent regexes/error-handling for the same
format is an anti-pattern. Document the extractor's contract (CRLF-tolerant,
returns `null` for absent OR malformed frontmatter) in
`reference/features/skills-and-matrix.md` near the frontmatter-loading section.
