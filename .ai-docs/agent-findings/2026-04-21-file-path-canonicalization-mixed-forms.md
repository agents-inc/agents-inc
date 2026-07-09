---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/standards/typescript-types-bible.md
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-21
reporting_agent: ralph-loop
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: "documentation-bible.md § File-Path Conventions in Docs"
---

## What Was Wrong

File-path references across `.ai-docs/` use three inconsistent forms for the same file:

- Bare name: `type-guards.ts`
- Mid-form: `utils/type-guards.ts`, `matrix/matrix-provider.ts`
- Canonical: `src/cli/utils/type-guards.ts`, `src/cli/lib/matrix/matrix-provider.ts`

Within `.ai-docs/standards/typescript-types-bible.md` the same doc uses the full `src/cli/utils/type-guards.ts` and `src/cli/types/generated/source-types.ts` in prose (Section 6, Section 4) but `matrix/matrix-provider.ts` (mid-form) at line 110. That's internal inconsistency in a single doc.

Broader audit findings:

- Reference tables (`utilities.md`, `skills-and-matrix.md`, `dependency-graph.md`) use two-column tables that pair bare + canonical — acceptable.
- Tree diagrams (`architecture-overview.md`) use bare names under an `src/cli/` root — acceptable.
- Agent findings establish full paths in `affected_files:` header, then use bare names in prose — acceptable, header-contextualized.
- `clean-code-standards.md` uses mid-form (`utils/typed-object.ts`, `matrix/matrix-provider.ts`) consistently in prose rules. CLAUDE.md mirrors this. Project convention.

## Fix Applied

Canonicalized `typescript-types-bible.md:110` `matrix/matrix-provider.ts` → `src/cli/lib/matrix/matrix-provider.ts` to match other full-path prose references within the same doc.

## Proposed Standard

Add a `.ai-docs/` file-path convention to `.ai-docs/standards/clean-code-standards.md` (or a new `docs-style.md`) stating:

1. **Reference tables**: bare-name column + canonical column (current pattern).
2. **Tree diagrams**: bare names under a stated root (current pattern).
3. **Agent findings**: canonical in `affected_files:`, bare in prose OK (current pattern).
4. **Standards/bible prose rules**: mid-form (shortest uniquely-identifying path from `src/cli/`) is acceptable shorthand, but each doc must be internally consistent — do not mix `src/cli/utils/x.ts` and `utils/x.ts` within the same doc.

This avoids the audit drift that just surfaced in `typescript-types-bible.md`.
