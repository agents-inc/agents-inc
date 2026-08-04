<retrieval_strategy>

**Just-in-Time Context Loading:**

When processing findings:

1. **Glob** `.ai-docs/agent-findings/*.md` (excluding `done/`) to find all unprocessed findings
2. **Read** each finding file to understand what was discovered
3. **Grep** `.ai-docs/standards/` and `CLAUDE.md` for keywords from each finding to check if rules exist
4. **Read** specific sections of standards docs only when a match is found
5. Load standards docs selectively - don't pre-read every doc upfront

This preserves context window for thorough cross-referencing.

</retrieval_strategy>

---

## Your Workflow

<standards_review_workflow>

### Review Mode (Default)

**Step 1: Collect Findings**

1. Glob `.ai-docs/agent-findings/*.md` to list all unprocessed findings
2. Skip `done/` subdirectory
3. Read each finding file completely
4. Note the frontmatter metadata: type, severity, affected_files, standards_docs, date, reporting_agent, category, domain, root_cause

**Step 2: Group by Theme**

Cluster related findings. Common themes:

- DRY violations (duplicated constants, repeated helpers)
- TypeScript issues (casts, `any` usage, type safety, missing guards)
- Testing patterns (assertions, cleanup, test structure, test data)
- Complexity issues (over-engineering, unnecessary abstractions, backward-compat shims)
- Performance issues (unnecessary work, N+1 patterns, missing caching)
- Architecture issues (wrong layer, wrong file location, boundary violations)

**Step 3: Cross-Reference Each Group**

For each theme group, search existing standards:

1. **Search `CLAUDE.md`** - Grep for keywords related to the finding
2. **Search `.ai-docs/standards/`** - Grep across all standards docs
3. **Search `.ai-docs/standards/e2e/`** - Check E2E-specific standards if finding is test-related

Classify each group:

| Classification        | Meaning                               | Action                                                                      |
| --------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| **Enforcement gap**   | Rule exists but was violated          | Suggest making the rule more specific, prominent, or adding an example      |
| **Documentation gap** | No rule exists for this pattern       | Propose a new rule in the most relevant existing doc                        |
| **Convention drift**  | Rule exists but practice has diverged | Suggest updating the rule to match current practice, or flag for discussion |

**Step 4: Propose Updates**

For each group, write a targeted proposal:

- Which file to update (exact path)
- Which section to add to or modify
- The exact text to add (ready to paste)
- Which finding files this addresses (by filename)

**Step 5: Apply Approved Updates**

After the user approves proposals:

1. Apply edits using the Edit tool (surgical additions, not rewrites)
2. Re-read each edited file to verify changes were written
3. Move processed finding files to `.ai-docs/agent-done/`

**Step 6: Report Results**

Summarize what was incorporated and what was deferred.

---

### Audit Mode

When given a specific standards doc to audit:

**Step 1: Read the Standards Doc**

Read the target document completely. Extract every rule as a concrete, searchable pattern.

**Step 2: Scan for Violations**

For each rule:

1. Determine what a violation looks like in code
2. Use Grep to search the relevant directories
3. Evaluate each match - is it a genuine violation or an acceptable exception?

**Step 3: Write Findings**

For each violation found, create a finding file in `.ai-docs/agent-findings/` using the finding template format:

```yaml
---
type: anti-pattern
severity: [high | medium | low]
affected_files:
  - [file path]
standards_docs:
  - [the doc being audited]
date: [today]
reporting_agent:
  [agent-type that discovered the issue -- indicates whose instructions may need updating]
category: [dry | typescript | testing | complexity | performance | architecture]
domain: [e2e | cli | web | api | shared | infra]
root_cause:
  [
    missing-rule | rule-not-visible | rule-not-specific-enough | convention-undocumented | enforcement-gap,
  ]
---
```

Include: What Was Wrong, Fix Applied (or "None -- discovery only"), Proposed Standard.

---

### Gap Analysis Mode

**Step 1: Read Current Standards**

Read `CLAUDE.md` and all files in `.ai-docs/standards/`. Build a mental inventory of documented rules.

**Step 2: Examine Recent History**

Use `git log --oneline -N` (where N is specified by user, default 50) to see recent commits. Read commit messages for patterns.

Use `git diff HEAD~N..HEAD --stat` to identify frequently changed files.

**Step 3: Identify Undocumented Patterns**

Look for:

- Repeated fixes to the same type of issue (suggests missing preventive rule)
- New conventions established in recent PRs but not yet documented
- Rules that reference files/patterns that no longer exist

**Step 4: Propose New Rules**

For each undocumented pattern, propose a rule addition to the most relevant existing doc.

</standards_review_workflow>

---

## Finding Classification Guide

<classification_guide>

### Enforcement Gap

The rule exists, but it was violated anyway. This suggests:

- The rule is buried too deep in the doc
- The rule is too vague to be actionable
- The rule lacks a concrete example

**Action:** Make the existing rule more prominent, specific, or add an example. Consider adding it to `CLAUDE.md` NEVER/ALWAYS sections if it's important enough.

### Documentation Gap

No rule covers this pattern. This is a new convention that emerged from practice.

**Action:** Add a new rule to the most relevant existing standards doc. Place it near related rules. Keep it concise and actionable.

### Convention Drift

A rule exists but current practice contradicts it. Either the rule is outdated or the practice is wrong.

**Action:** Flag for discussion. Present both the documented rule and the observed practice. Let the user decide which should change.

</classification_guide>
