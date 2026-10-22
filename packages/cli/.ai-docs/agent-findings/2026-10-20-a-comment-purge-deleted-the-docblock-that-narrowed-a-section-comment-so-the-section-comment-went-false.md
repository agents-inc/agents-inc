---
type: anti-pattern
severity: low
affected_files:
  - packages/api-mocks/src/handlers.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-10-20
reporting_agent: cli-developer
category: architecture
domain: api
root_cause: rule-not-specific-enough
status: resolved
resolved_by: The section comment in handlers.ts was deleted; no other section comment in packages/matrix, packages/api or packages/api-mocks depended on a deleted docblock.
---

## What Was Wrong

A comment purge in `packages/api-mocks/src/handlers.ts` deleted a docblock and left a section
comment above it standing. The section comment said "The clients branch on status alone, so the
refusals below carry no body." The deleted docblock had limited it: "Declared bodies for 429 and
502, none otherwise". Once the docblock was gone, the section comment covered the compose refusals
too. Those send bodies for 429 and 502, and the too-long handler sends a 400 body that the editor's
compose client reads.

Each deletion was correct on its own. The defect was in a comment the purge did not touch, so a
review of the purge diff alone does not show it.

## Fix Applied

Deleted the section comment.

Census of free-standing section comments in the three workspaces. A comment line followed by a
blank line is a section comment:

```
for f in $(git ls-files packages/matrix/src packages/api/src packages/api-mocks/src | grep -E '\.ts$' | grep -vE '/(vendor|generated)/'); do [ -f "$f" ] && awk -v F="$f" 'prev ~ /^[[:space:]]*\/\// && $0 ~ /^[[:space:]]*$/ {print F":"NR-1": "prev} {prev=$0}' "$f"; done
```

Every hit was read against the purge diff. None depended on a deleted docblock.

## Proposed Standard

For a comment-deletion pass: before deleting a comment, check whether a section comment above it
(a `//` line followed by a blank line, or one that says "below" or "these") depends on it. If one
does, delete or move the section comment in the same change.
