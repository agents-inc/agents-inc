---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/standards/clean-code-standards.md
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-21
reporting_agent: ralph-loop-explorer
category: architecture
domain: cli
root_cause: rule-not-visible
status: resolved
resolved_by: .ai-docs/standards/clean-code-standards.md §7.6–7.9 (lines 326–339) and §15 (Data Integrity, lines 494–518) — verified present 2026-04-21
---

## What Was Wrong

`.ai-docs/standards/clean-code-standards.md` is pitched as the reviewer-checkable rule set, but it only covered code-style concerns (view components, function size, error handling, constants, security, testing, type-safety at casts, DRY, dead code, store design, docs, console output, imports, comments). Several rules in `CLAUDE.md` had no mirror in the standards doc, and several recent findings proposed additions that were never incorporated:

- No optional chaining / nullish coalescing on must-exist data (CLAUDE.md Data Integrity) — missing.
- No `{} as Record<K, V>` (CLAUDE.md Type Safety) — missing.
- No `as SkillId` / `as SkillSlug` casts on valid union members (CLAUDE.md Type Safety) — not explicit in 7.2; 7.2 documented WHERE casts are allowed but not the specific union-literal case.
- No multi-tier resolution fallbacks (CLAUDE.md Data Integrity) — missing.
- No backward-compatibility shims (CLAUDE.md Data Integrity) — missing.
- No conditional data merges (CLAUDE.md Scope Awareness — general pattern) — missing.
- Single-writer path normalization (finding `2026-04-21-d233-projects-normalization-asymmetry.md`) — missing.
- Return values must be consumed / observability invariants (findings `2026-04-21-propagation-skipped-observability-gap.md` and `2026-04-21-registerProjectPath-sweep-observability-gap.md`) — missing.
- Plugin install hard-error before `writeConfigAndCompile` (finding `2026-04-20-d229-plugin-install-failure-orphan-config.md`) — missing.
- Writer selection for `config-types.ts` (finding `2026-04-20-d228-writeStandaloneConfigTypes-project-branch.md`) — lived only in `config-writer.md`, not cross-referenced from the standards doc.

Together these findings represent ~1 week of convention drift that the standards doc did not absorb.

## Fix Applied

Extended `clean-code-standards.md`:

- Section 7 (Type Safety) gained 7.6–7.9 covering union-literal casts, `Partial<Record>` idiom, double-cast prohibition, and asserting-helper preference.
- New section 15 (Data Integrity) added with eight rules covering optional-chaining / multi-tier fallbacks / backward-compat shims / conditional merges / single-writer normalization / return-value consumption / plugin install hard-error / `config-types.ts` writer selection. Each rule cross-links the authoritative finding or reference doc.

No code changes.

## Proposed Standard

Already applied. Remaining gap: the header of the standards doc claims "rules from 70+ refactoring tasks across 9 iterations" — after this update the file also embeds post-iteration findings. Either refresh the header or split findings-derived rules into their own section labelled "operational invariants" if the distinction matters for review discipline. Leaving the phrasing as-is is acceptable — findings are the same genre as refactoring tasks, just discovered mid-flight.

Next iteration should check that `.ai-docs/DOCUMENTATION_MAP.md` indexes the two observability findings alongside the existing D-228/D-229 entries, so reviewers land on them from the config-writer page.
