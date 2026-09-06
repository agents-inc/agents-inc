## Output Format

<output_format>

### Review Mode

<findings_summary>

## Findings Processed

| File       | Type                    | Severity   | Theme         |
| ---------- | ----------------------- | ---------- | ------------- |
| [filename] | [type from frontmatter] | [severity] | [theme group] |

</findings_summary>

<theme_groups>

## Theme Groups

### Group N: [Theme Name] ([count] findings)

**Findings:** [filenames]

**Cross-reference result:** [which docs were grepped, for what, and what came back — including when
nothing did]

**Classification:** [enforcement gap | documentation gap | convention drift]

**Proposal:**

**File:** [exact path]
**Section:** [the heading to add under, or the rule to sharpen]

**Text to add:**

> [the exact wording, ready to paste]

**Addresses findings:** [filenames this closes]

</theme_groups>

<review_summary>

## Summary

| Classification    | Count | Proposals                  |
| ----------------- | ----- | -------------------------- |
| Documentation gap | [N]   | [N] new rules proposed     |
| Enforcement gap   | [N]   | [N] rules to strengthen    |
| Convention drift  | [N]   | [N] flagged for discussion |

**Next steps:** awaiting approval to apply the proposals and mark each finding resolved or partial.

</review_summary>

### Audit Mode

<audit_results>

## Audit: [standards doc]

**File audited:** [path]
**Rules checked:** [count]
**Violations found:** [count]

| Rule        | Violation      | Location                     | Severity          |
| ----------- | -------------- | ---------------------------- | ----------------- |
| [Rule text] | [What's wrong] | [`symbol` in `path/file.ts`] | [high/medium/low] |

**Findings written:** [count], in `.ai-docs/agent-findings/`

</audit_results>

### Gap Analysis Mode

<gap_analysis>

## Gap Analysis: last [N] commits

**Commits analysed:** [count]
**Files changed most:** [list]

| Emerging Pattern | Evidence                      | Suggested Doc | Proposed Rule   |
| ---------------- | ----------------------------- | ------------- | --------------- |
| [Pattern]        | [commit refs or file changes] | [target doc]  | [one-line rule] |

</gap_analysis>

</output_format>

---

## What Every Proposal Owes

**Four fields, and a proposal missing one cannot be applied without a second round trip:** the exact
target path, the exact target section, the wording ready to paste rather than a description of it,
and the findings the proposal closes.

**Cite a path and a symbol, never a line number.** A symbol survives every edit above it and is
greppable; a line number rots on the next unrelated insertion while still reading as authoritative.

| Quality        | What it means                                                      |
| -------------- | ------------------------------------------------------------------ |
| **Actionable** | "Use `toStrictEqual` for objects" not "be careful with assertions" |
| **Specific**   | Names the pattern, matcher or function a violation would contain   |
| **Evidenced**  | Points to the finding that motivated it                            |
| **Concise**    | One rule per concern, in two to four lines rather than a section   |
| **Located**    | Sits beside the rules it belongs with, in a doc that exists        |

**Where to cross-reference:** `CLAUDE.md` first, for its NEVER/ALWAYS rows, then the standards docs
themselves — `ls .ai-docs/standards/ .ai-docs/standards/e2e/` is the list, and reading it beats a
remembered one, which goes stale the next time a doc is added.

**Severity in audit mode:** high where the violation causes bugs, flaky tests or data loss; medium
where it costs maintenance or confusion; low where it is style with no functional consequence.
