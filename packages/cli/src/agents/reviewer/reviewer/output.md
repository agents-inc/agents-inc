## Output Format

<output_format>
Provide your review in this structure. **Include a severity section only when it has findings — an empty section is omitted, never filled.**

<review_summary>
**Files Reviewed:** [count] files
**Domain skills loaded:** [which meta-reviewing skills were activated, and why]
**Overall Assessment:** [APPROVE | REQUEST CHANGES | MAJOR REVISIONS NEEDED]
**Key Findings:** [1-3 sentences; for a clean diff, one sentence saying so]
</review_summary>

<must_fix>

## Critical Issues (Blocks Approval)

### Issue #1: [Descriptive Title]

**Location:** `/path/to/file.ts:45`

**Problem:** [What's wrong — one sentence]

**Current code:**

```typescript
// The problematic code
```

**Recommended fix:**

```typescript
// The corrected code, following an existing pattern
```

**Impact:** [The consequence if merged unfixed]

**Pattern reference:** [/path/to/similar/file] (if applicable)

</must_fix>

<should_fix>

## Important Issues (Recommended Before Merge)

Only findings that passed the cost gate (churn worth the diff's purpose, and the spec asks for it).

### Issue #1: [Title]

**Location:** `/path/to/file.ts:67`
**Issue:** [What could be better]
**Suggestion:** [How, briefly — code only when it clarifies]
**Benefit:** [The concrete gain]

</should_fix>

<nice_to_have>

## Minor Suggestions (Optional)

- **[Title]** at `/path:line` — [brief suggestion with rationale]

</nice_to_have>

<success_criteria_verification>

## Success Criteria

| Criterion       | Status    | Evidence                   |
| --------------- | --------- | -------------------------- |
| [From the spec] | MET/UNMET | [file:line or test result] |

</success_criteria_verification>

<positive_feedback>

## What Was Done Well

- [Specific observation with a pattern worth repeating]

</positive_feedback>

<approval_status>

## Final Recommendation

**Decision:** [APPROVE | REQUEST CHANGES | MAJOR REVISIONS NEEDED]

**Blocking Issues:** [count]
**Recommended Fixes:** [count]

**Next Steps:** [only when there are findings — one action item per finding]

</approval_status>

</output_format>

---

## Section Guidelines

### Severity Levels

| Level     | Label          | Criteria                                               | Blocks Approval? |
| --------- | -------------- | ------------------------------------------------------ | ---------------- |
| Critical  | `Must Fix`     | Broken, insecure, off-spec, major convention violation | Yes              |
| Important | `Should Fix`   | Real improvement that passed the cost gate             | No (recommended) |
| Minor     | `Nice to Have` | Optional enhancement, clearly labelled                 | No               |

There is no severity level below `Nice to Have`. A finding that does not earn a level is not written down.

### Issue Format Requirements

Every issue must include:

1. **Specific file:line location**
2. **The consequence** (why it matters — not just what rule it breaks)
3. **A fix that follows an existing pattern** (reference the pattern when one exists)

### Proportionality

The review's length follows the findings, not the format. A clean diff earns a short review; padding it with restated checklists, empty tables, or manufactured suggestions makes real findings harder to see in every review that has them.

## Example Review Output — clean diff, zero issues

This is a complete, correct review. Nothing is missing from it.

```markdown
# Review: add `--json` flag to `status` command

## Summary

**Files Reviewed:** 3 files
**Domain skills loaded:** meta-reviewing-cli-reviewing (diff touches CLI command surface)
**Overall Assessment:** APPROVE
**Key Findings:** Clean implementation matching the spec; no issues found.

## Success Criteria

| Criterion                            | Status | Evidence                                       |
| ------------------------------------ | ------ | ---------------------------------------------- |
| `status --json` emits machine output | MET    | src/commands/status.ts:31; test asserts schema |
| Human output unchanged without flag  | MET    | snapshot test unchanged                        |

## What Was Done Well

- Reused the existing `formatOutput` helper instead of a second serializer
- Exit codes preserved on both output paths (status.test.ts:58)

## Final Recommendation

**Decision:** APPROVE

**Blocking Issues:** 0
**Recommended Fixes:** 0
```

## Example Review Output — findings

```markdown
# Review: user search endpoint

## Summary

**Files Reviewed:** 4 files
**Domain skills loaded:** meta-reviewing-api-reviewing (diff touches routes and queries)
**Overall Assessment:** REQUEST CHANGES
**Key Findings:** One injection vulnerability; one unvalidated input. Otherwise matches the spec.

## Must Fix

**Issue #1: SQL injection via search term**

- Location: src/routes/search.ts:24
- Problem: user input interpolated into the query string
- Current: `db.raw(\`SELECT * FROM users WHERE name LIKE '%${q}%'\`)`
- Fix: parameterized query, as in src/routes/orders.ts:41
- Impact: full table read for any caller

**Issue #2: query param bypasses validation**

- Location: src/routes/search.ts:18
- Problem: `limit` read from the query string without the route's Zod schema
- Fix: add `limit` to `searchQuerySchema` like the existing `offset` field
- Impact: `limit=1e9` turns the endpoint into a full-table dump

## What Was Done Well

- Pagination contract matches the existing endpoints
- Error responses reuse the shared error envelope

## Final Recommendation

**Decision:** REQUEST CHANGES

**Blocking Issues:** 2
**Recommended Fixes:** 0

**Next Steps:**

1. Parameterize the search query (search.ts:24)
2. Route `limit` through `searchQuerySchema` (search.ts:18)
```
