## Output Format

<output_format>
Provide your review in this structure:

<review_summary>
**Files Reviewed:** [count] files ([total lines] lines)
**Overall Assessment:** [APPROVE | REQUEST CHANGES | MAJOR REVISIONS NEEDED]
**Key Findings:** [2-3 sentence summary of most important CLI safety/UX issues]
</review_summary>

<files_reviewed>

| File                         | Lines | Review Focus           |
| ---------------------------- | ----- | ---------------------- |
| [/path/to/cli/index.ts]      | [X-Y] | Entry point, SIGINT    |
| [/path/to/cli/commands/*.ts] | [X-Y] | Command implementation |
| [/path/to/cli/lib/*.ts]      | [X-Y] | Exit codes, utilities  |

</files_reviewed>

<cli_safety_audit>

## CLI Safety Review

### Signal Handling

- [ ] SIGINT handler exists in entry point
- [ ] SIGINT calls process.exit(EXIT_CODES.CANCELLED)
- [ ] SIGTERM handled (for container deployments)

### Exit Code Audit

- [ ] EXIT_CODES constant file exists
- [ ] All exit codes have JSDoc descriptions
- [ ] No magic numbers in process.exit() calls
- [ ] Correct exit code per scenario (SUCCESS, ERROR, CANCELLED, etc.)

### Prompt Cancellation

- [ ] p.isCancel() after EVERY @clack/prompts call
- [ ] p.cancel() with descriptive message on cancellation
- [ ] process.exit(EXIT_CODES.CANCELLED) after p.cancel()

### Async Handling

- [ ] parseAsync() used (not parse())
- [ ] Global error handler with .catch() on main
- [ ] Async errors not silently swallowed

**Safety Issues Found:**

| Finding | Location    | Severity | Impact                    |
| ------- | ----------- | -------- | ------------------------- |
| [Issue] | [file:line] | Critical | [What happens if unfixed] |

</cli_safety_audit>

<must_fix>

## Critical Issues (Blocks Approval)

### Issue #1: [Descriptive Title]

**Location:** `/path/to/file.ts:45`
**Category:** [Signal Handling | Exit Codes | Cancellation | Async | Security]

**Problem:** [What's wrong - one sentence]

**Current code:**

```typescript
// The problematic code
```

**Recommended fix:**

```typescript
// The corrected code
```

**Impact:** [Why this matters - CLI crashes, undefined behavior, silent failures]

**Pattern reference:** [/path/to/similar/file:lines] (if applicable)

</must_fix>

<should_fix>

## Important Issues (Recommended Before Merge)

### Issue #1: [Title]

**Location:** `/path/to/file.ts:67`
**Category:** [Spinners | Error Messages | Config | Help Text]

**Issue:** [What could be better]

**Suggestion:**

```typescript
// How to improve
```

**Benefit:** [Why this helps user experience]

</should_fix>

<nice_to_have>

## Minor Suggestions (Optional)

- **[Title]** at `/path:line` - [Brief suggestion with rationale]
- **[Title]** at `/path:line` - [Brief suggestion with rationale]

</nice_to_have>

<user_experience_review>

## User Experience Review

### Visual Feedback

- [ ] Spinners used for operations > 500ms
- [ ] Spinners stopped before any console output
- [ ] Success messages include result details
- [ ] Progress visible for multi-step operations

### Error Messages

- [ ] Messages explain WHAT failed
- [ ] Messages explain WHY it failed
- [ ] Messages suggest HOW to fix
- [ ] picocolors used consistently (red for errors)
- [ ] Relevant context included (file paths, option names)

### Help Text

- [ ] All options have descriptions
- [ ] Required vs optional clear
- [ ] Default values documented
- [ ] Examples provided and copy-paste ready
- [ ] showHelpAfterError(true) enabled

**UX Issues Found:** [count]

</user_experience_review>

<configuration_review>

## Configuration Review

### Precedence Order (highest to lowest)

- [ ] CLI flags correctly override all
- [ ] Environment variables next
- [ ] Project config (./.config)
- [ ] Global config (~/.config)
- [ ] Default values last

### Handling Edge Cases

- [ ] Empty flag values handled correctly
- [ ] Missing config files handled gracefully
- [ ] Invalid config shows helpful error
- [ ] Source tracked for --verbose mode

**Config Issues Found:** [count]

</configuration_review>

<testing_adequacy>

## Testing Review

### Command Testing

- [ ] Happy path tested for each command
- [ ] Invalid arguments tested
- [ ] --help output tested
- [ ] exitOverride() used in tests

### Prompt Testing

- [ ] @clack/prompts properly mocked
- [ ] Cancellation flow tested (isCancel returns true)
- [ ] Validation rejection tested

### Exit Code Testing

- [ ] Success exits with 0
- [ ] Errors exit with correct non-zero codes
- [ ] Cancellation exits with CANCELLED code

**Testing Issues Found:** [count]

</testing_adequacy>

<convention_check>

## Convention Adherence

| Dimension         | Status         | Notes                 |
| ----------------- | -------------- | --------------------- |
| kebab-case files  | PASS/WARN/FAIL | [Details if not PASS] |
| Named exports     | PASS/WARN/FAIL | [Details if not PASS] |
| No magic numbers  | PASS/WARN/FAIL | [Details if not PASS] |
| Named constants   | PASS/WARN/FAIL | [Details if not PASS] |
| Command file size | PASS/WARN/FAIL | [<200 lines each]     |

</convention_check>

<positive_feedback>

## What Was Done Well

- [Specific positive observation about CLI patterns]
- [Another positive observation with pattern reference]
- [Reinforces patterns to continue using]

</positive_feedback>

<deferred>

## Deferred to Specialists

**Backend Reviewer:**

- [Non-CLI utilities that need review]

**Frontend Reviewer:**

- [React components if any]

**Tester Agent:**

- [Test coverage gaps to address]

</deferred>

<approval_status>

## Final Recommendation

**Decision:** [APPROVE | REQUEST CHANGES | REJECT]

**Blocking Issues:** [count] ([count] safety-related)
**Recommended Fixes:** [count] ([count] UX-related)
**Suggestions:** [count]

**Next Steps:**

1. [Action item - e.g., "Add p.isCancel() check after p.select() at line 45"]
2. [Action item - e.g., "Replace process.exit(1) with EXIT_CODES.ERROR at line 78"]
3. [Action item]

</approval_status>

</output_format>

---

## Section Guidelines

### Severity Levels (CLI-Specific)

| Level     | Label          | Criteria                                       | Blocks Approval? |
| --------- | -------------- | ---------------------------------------------- | ---------------- |
| Critical  | `Must Fix`     | SIGINT, exit codes, cancellation, parseAsync   | Yes              |
| Important | `Should Fix`   | Spinners, error messages, config, help text    | No (recommended) |
| Minor     | `Nice to Have` | --json output, extra examples, verbose logging | No               |

### Issue Categories (CLI-Specific)

| Category            | Examples                                          |
| ------------------- | ------------------------------------------------- |
| **Signal Handling** | Missing SIGINT, wrong exit code on signal         |
| **Exit Codes**      | Magic numbers, missing constants, wrong code used |
| **Cancellation**    | Missing isCancel, no p.cancel message             |
| **Async**           | parse() vs parseAsync(), swallowed errors         |
| **Spinners**        | Missing feedback, not stopped before output       |
| **Error Messages**  | No WHAT/WHY/HOW, missing context                  |
| **Configuration**   | Wrong precedence, missing handling                |
| **Help Text**       | Missing descriptions, no examples                 |
| **Security**        | Shell injection, unvalidated paths                |

### CLI Safety Priority

CLI safety issues are ALWAYS reviewed first. The safety audit section:

1. Uses a checklist format for systematic coverage
2. Documents findings in a table with severity
3. Provides specific file:line references
4. Explains the impact of each finding

### Issue Format Requirements

Every issue must include:

1. **Specific file:line location**
2. **Current code snippet** (what's wrong)
3. **Fixed code snippet** (how to fix)
4. **Impact explanation** (why it matters for CLI users)
5. **Pattern reference** (where to see correct example, if applicable)

### Approval Decision Framework

**APPROVE when:**

- All SIGINT/cancellation handling verified
- All exit codes use named constants
- parseAsync() used for async commands
- Error handling exists for async operations
- Tests cover critical paths

**REQUEST CHANGES when:**

- Missing p.isCancel() checks (any prompt)
- Magic numbers in process.exit()
- parse() used with async actions
- Missing spinner for long operations
- Unhelpful error messages

**MAJOR REVISIONS NEEDED when:**

- No SIGINT handler in entry point
- Systematic missing cancellation handling
- No exit code constants defined
- No error handling pattern established
- Security vulnerabilities (shell injection)

## Example Review Output

````markdown
# CLI Review: init command

## Files Reviewed

- src/cli/index.ts (45 lines)
- src/cli/commands/init.ts (120 lines)
- src/cli/lib/exit-codes.ts (25 lines)

## Summary

3 critical issues: missing p.isCancel() checks, magic number exit codes, using parse() instead of parseAsync().

## Must Fix

**Issue #1: Missing p.isCancel() check**

- Location: src/cli/commands/init.ts:45
- Problem: p.select() result not checked for cancellation
- Current:
  ```typescript
  const framework = await p.select({ message: "Select framework:", options: [...] });
  const name = await p.text({ message: "Project name:" });
  ```
````

- Fix:
  ```typescript
  const framework = await p.select({ message: "Select framework:", options: [...] });
  if (p.isCancel(framework)) {
    p.cancel("Setup cancelled");
    process.exit(EXIT_CODES.CANCELLED);
  }
  ```

**Issue #2: Magic number exit code**

- Location: src/cli/commands/init.ts:78
- Problem: `process.exit(1)` instead of named constant
- Fix: Use `process.exit(EXIT_CODES.ERROR)`

**Issue #3: Using parse() instead of parseAsync()**

- Location: src/cli/index.ts:42
- Problem: Errors in async handlers silently swallowed
- Fix: Change `program.parse()` to `await program.parseAsync()`

## Should Fix

**Missing spinner for network call**

- Location: src/cli/commands/init.ts:52
- Issue: fetchTemplates() has no visual feedback
- Suggestion: Wrap with p.spinner()

**Error message not actionable**

- Location: src/cli/commands/init.ts:67
- Issue: "Config invalid" doesn't explain how to fix
- Suggestion: Include validation error and remediation command

## CLI Safety Checklist

- [x] SIGINT handler present
- [ ] p.isCancel() after every prompt - FAIL (lines 45, 56, 67)
- [ ] No magic numbers in process.exit() - FAIL (line 78)
- [ ] parseAsync() used - FAIL (line 42)

## Positive Observations

- Clean command structure with separate files per command
- Good use of picocolors for consistent styling
- EXIT_CODES constant file well-organized with JSDoc

## Verdict: REQUEST CHANGES

Fix 3 blocking CLI safety issues before merge.

```

```
