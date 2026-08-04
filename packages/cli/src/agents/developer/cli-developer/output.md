## Output Format

<output_format>
Provide your implementation in this structure:

<summary>
**Task:** [Brief description of what was implemented]
**Status:** [Complete | Partial | Blocked]
**Files Changed:** [count] files ([+additions] / [-deletions] lines)
</summary>

<investigation>
**Files Examined:**

| File            | Lines | What Was Learned             |
| --------------- | ----- | ---------------------------- |
| [/path/to/file] | [X-Y] | [Pattern/utility discovered] |

**Patterns Identified:**

- **Command structure:** [How commands are organized - from /path:lines]
- **Prompt handling:** [How prompts are structured - from /path:lines]
- **Config loading:** [How config is resolved - from /path:lines]

**Existing Code Reused:**

- [Utility/constant] from [/path] - [Why reused instead of creating new]
  </investigation>

<approach>
**Summary:** [1-2 sentences describing the implementation approach]

**Files:**

| File            | Action             | Purpose               |
| --------------- | ------------------ | --------------------- |
| [/path/to/file] | [created/modified] | [What change and why] |

**Key Decisions:**

- [Decision]: [Rationale based on existing patterns from /path:lines]
  </approach>

<implementation>

### [filename.ts]

**Location:** `/absolute/path/to/file.ts`
**Changes:** [Brief description - e.g., "New command" or "Added option handling"]

```typescript
// [Description of this code block]
[Your implementation code]
```

**Design Notes:**

- [Why this approach was chosen]
- [How it matches existing patterns]

### [filename2.ts] (if applicable)

[Same structure...]

</implementation>

<tests>

### [filename.test.ts]

**Location:** `/absolute/path/to/file.test.ts`

```typescript
[Test code covering the implementation]
```

**Coverage:**

- [x] Happy path: [scenario]
- [x] Cancellation: [p.isCancel scenarios]
- [x] Error handling: [scenarios]
- [x] Exit codes: [verified correct codes]

</tests>

<verification>

## Success Criteria

| Criterion            | Status    | Evidence                                       |
| -------------------- | --------- | ---------------------------------------------- |
| [From specification] | PASS/FAIL | [How verified - test name, manual check, etc.] |

## CLI-Specific Quality Checks

**User Experience:**

- [ ] Spinner feedback for operations > 500ms
- [ ] Clear error messages with actionable guidance
- [ ] Success messages confirm what was done
- [ ] Dry-run mode available for destructive operations

**Cancellation Handling:**

- [ ] p.isCancel() checked after EVERY @clack/prompt
- [ ] SIGINT (Ctrl+C) handled in entry point
- [ ] Graceful exit messages on cancellation
- [ ] No orphaned processes or state

**Exit Codes:**

- [ ] Named constants used (EXIT_CODES.\*)
- [ ] No magic numbers (0, 1, 2, etc.)
- [ ] Appropriate code for each exit path
- [ ] Documented what each code means

**Code Quality:**

- [ ] No magic numbers (named constants used)
- [ ] No `any` types without justification
- [ ] Follows existing naming conventions
- [ ] Uses parseAsync() for async actions
- [ ] Uses optsWithGlobals() for parent options

## Build & Test Status

- [ ] Existing tests pass
- [ ] New tests pass (if added)
- [ ] Build succeeds
- [ ] No type errors
- [ ] No lint errors

</verification>

<notes>

## For Reviewer

- [Areas to focus review on]
- [Decisions that may need discussion]
- [Alternative approaches considered]

## Scope Control

**Added only what was specified:**

- [Feature implemented as requested]

**Did NOT add:**

- [Unrequested feature avoided - why it was tempting but wrong]

## Known Limitations

- [Any scope reductions from spec]
- [Technical debt incurred and why]

## Dependencies

- [New packages added: none / list with justification]
- [Breaking changes: none / description]

</notes>

</output_format>

---

## Section Guidelines

### When to Include Each Section

| Section            | When Required                     |
| ------------------ | --------------------------------- |
| `<summary>`        | Always                            |
| `<investigation>`  | Always - proves research was done |
| `<approach>`       | Always - shows planning           |
| `<implementation>` | Always - the actual code          |
| `<tests>`          | When tests are part of the task   |
| `<verification>`   | Always - proves completion        |
| `<notes>`          | When there's context for reviewer |

### CLI-Specific Quality Checks (Expanded)

**User Experience:**

- Spinner for async ops: `const s = p.spinner(); s.start("Loading..."); ... s.stop("Done")`
- Clear errors: `p.log.error("Config file not found at ~/.myapp/config.yaml")`
- Success feedback: `p.log.success("Created 5 files")`
- Dry-run mode: `--dry-run` flag that previews without executing

**Cancellation Handling:**

```typescript
// EVERY prompt needs this pattern:
const result = await p.select({ message: "Choose:" });
if (p.isCancel(result)) {
  p.cancel("Operation cancelled");
  process.exit(EXIT_CODES.CANCELLED);
}
```

**Exit Codes (Unix Conventions):**

- SUCCESS (0): Operation completed successfully
- ERROR (1): General error
- INVALID_ARGS (2): Invalid arguments or options
- CANCELLED (130 or custom): User cancelled

**Output Styling (picocolors):**

- Success: `pc.green("Done")`
- Warnings: `pc.yellow("Warning: ...")`
- Errors: `pc.red("Error: ...")`
- Info/dim: `pc.dim("(from config file)")`
- Headers: `pc.bold("Configuration:")`

## Example Implementation Output

Here's what a complete, high-quality CLI developer output looks like:

```markdown
# Implementation: Add Config Show Command

## Investigation Notes

**Files Read:**

- src/cli/index.ts:1-45 - Entry point structure, SIGINT handler
- src/cli/commands/init.ts:1-89 - Existing command pattern with options
- src/cli/lib/exit-codes.ts:1-20 - Exit code constants
- src/cli/lib/config.ts:45-89 - Config resolution hierarchy

**Pattern Found:**
Commands use `new Command()` with `.action(async (options, command) => {})` pattern.
Global options accessed via `command.optsWithGlobals()`.
All prompts check `p.isCancel()` before proceeding.

## Implementation Plan

1. Create `config show` subcommand following init.ts pattern
2. Use existing `resolveSource()` from lib/config.ts
3. Use picocolors for output formatting
4. Follow exit code constants

## Changes Made

### 1. Created Config Show Command (src/cli/commands/config.ts)

- Added `config show` subcommand
- Displays current effective configuration
- Shows source origin (flag/env/project/global/default)
- Uses existing config resolution utilities

### 2. Registered Command (src/cli/index.ts)

- Imported configCommand
- Added to program.addCommand()

## Verification

**Success Criteria:**

- [x] Command shows current config (verified manually)
- [x] Displays source origin (tested all 5 origins)
- [x] Works with --dry-run flag (verified)
- [x] Handles missing config gracefully (tested)

**Quality Checks:**

- [x] Uses EXIT_CODES constants (no magic numbers)
- [x] Follows existing command pattern exactly
- [x] Reuses existing config utilities

**Build Status:**

- [x] `bun test` passes
- [x] `bun run build` succeeds

## Summary

**Files:** 2 changed (+47 lines)
**Scope:** Added config show command only. Did NOT add config edit/set (not in spec).
**For Reviewer:** Verify output formatting matches other commands.
```
