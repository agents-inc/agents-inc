---
type: anti-pattern | standard-gap | convention-drift | audit | missing-standard | architectural-drift
severity: high | medium | low
affected_files:
  - path/to/file1.ts
  - path/to/file2.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: YYYY-MM-DD
reporting_agent: <agent-type> # which sub-agent discovered the issue (tells us whose instructions may need updating)
category: dry | typescript | testing | complexity | performance | architecture
# category guidance:
#   dry          → duplicated logic/constants/fixtures that should be extracted
#   typescript   → type-safety issues (casts, any, missing narrowing, schema gaps)
#   testing      → test hygiene (factories, assertions, flakes, coverage gaps)
#   complexity   → high cyclomatic complexity, deeply nested control flow, tangled branches
#   performance  → runtime latency, memory footprint, hot-path optimization
#   architecture → layering, module boundaries, ownership, dependency direction
domain: e2e | cli | web | api | shared | infra
# domain guidance:
#   e2e    → e2e/ tests, page objects, fixtures
#   cli    → oclif commands, wizard flows, install/compile logic
#   web    → UI/React/Ink components, terminal rendering
#   api    → HTTP handlers, external service integration
#   shared → utilities, types, schemas used across domains
#   infra  → build, tooling, CI, scripts
root_cause: missing-rule | rule-not-visible | rule-not-specific-enough | convention-undocumented | enforcement-gap | scope-discipline-deferred
# Optional lifecycle fields (omit unless applicable):
# status: open | partial | resolved | superseded
# partial_note: <what's landed (docs/standards) vs what's pending (code)>  # required when status: partial
# resolved_by: <short note describing the fix>  # required when status: resolved
# supersedes: <older-finding-filename.md>
# superseded_by: <newer-finding-filename.md>
# blocked_by: <upstream-finding-filename.md>  # upstream open/partial finding whose code-side fix must land before this one can close
---

<!--
How to resolve a finding:
- Edit this file in place. Do NOT move or rename it (cross-links break silently).
- Add BOTH `status: resolved` AND `resolved_by: <short note>` to the frontmatter — always paired.
- The `resolved_by:` note should cite the mechanism of resolution (commit hash, PR, doc update, standards section, superseding finding).
- See `README.md` → "Resolution Model (authoritative)" for the full rule.
-->

## What Was Wrong

<!-- Describe the anti-pattern, missing standard, or convention drift you discovered -->

## Fix Applied

<!-- Describe what you did to fix it (or "None — discovery only" if you just identified it) -->

## Proposed Standard

<!-- What rule, convention, or documentation update would prevent this in the future? -->
<!-- Be specific: name the doc file and section where the rule should go -->
