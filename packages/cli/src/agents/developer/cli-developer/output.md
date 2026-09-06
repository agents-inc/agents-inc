## Output Format

<output_format>

Report your implementation in this structure.

<summary>
**Task:** [what was implemented]
**Status:** [Complete | Partial | Blocked]
**Files Changed:** [count] files ([+additions] / [-deletions] lines)
</summary>

<investigation>
**Files Examined:**

| File            | Symbol read       | What it showed             |
| --------------- | ----------------- | -------------------------- |
| [/path/to/file] | [function / type] | [pattern or utility found] |

**Patterns Identified:**

- **Command structure:** [how commands are registered — from /path, naming the symbol]
- **Prompt handling:** [how prompts and cancellation are handled — from /path, naming the symbol]
- **Config loading:** [how config is resolved — from /path, naming the symbol]

**Existing Code Reused:**

- [utility or constant] from [/path] — [why reused rather than written]
  </investigation>

<approach>
**Summary:** [the implementation approach, in a sentence or two]

**Files:**

| File            | Action             | Purpose                |
| --------------- | ------------------ | ---------------------- |
| [/path/to/file] | [created/modified] | [what changed and why] |

**Key Decisions:**

- [decision]: [the existing pattern it follows, and where that pattern lives]
  </approach>

<implementation>

### [filename.ts]

**Location:** `/absolute/path/to/file.ts`
**Changes:** [e.g. "new command" or "added option handling"]

```typescript
// [what this block does]
[implementation code]
```

**Design Notes:**

- [why this approach]
- [the existing pattern it matches]

</implementation>

<tests>

### [filename.test.ts]

**Location:** `/absolute/path/to/file.test.ts`

```typescript
[test code covering the implementation]
```

**Coverage:**

- [x] Happy path: [scenario]
- [x] Cancellation: [which prompts, and what the command did]
- [x] Error handling: [scenarios]
- [x] Exit codes: [which code each path returned]

</tests>

<verification>

## Success Criteria

| Criterion            | Status    | Evidence                             |
| -------------------- | --------- | ------------------------------------ |
| [from specification] | PASS/FAIL | [test name, command, or observation] |

## Quality Checks

**User experience:**

- [ ] Spinner for anything over roughly half a second — `s.start("Loading…")` through `s.stop("Done")`
- [ ] Errors name the problem and what to do: `p.log.error("Config file not found at ~/.myapp/config.yaml")`
- [ ] Success messages say what happened: `p.log.success("Created 5 files")`
- [ ] `--dry-run` available for anything destructive

**Cancellation:**

- [ ] `p.isCancel()` checked after every prompt
- [ ] SIGINT handled in the entry point
- [ ] Cancellation exits with a message, leaving no half-written state

**Exit codes** — named constants throughout, following the Unix convention the project's set encodes:

- [ ] `SUCCESS` (0) for a completed operation
- [ ] `ERROR` (1) for a general failure
- [ ] `INVALID_ARGS` (2) for bad arguments or options
- [ ] `CANCELLED` (130, or the project's own) for user cancellation
- [ ] Each exit path documented with what its code means

**Output styling:** `pc.green` for success, `pc.yellow` for warnings, `pc.red` for errors, `pc.dim`
for provenance such as `(from config file)`, `pc.bold` for headers.

- [ ] Styling routed through the project's helper rather than raw `console.log`

**Code Quality:**

- [ ] Named constants rather than magic numbers
- [ ] No `any` without a justification in a comment
- [ ] Naming and file placement match the files you read
- [ ] `parseAsync()` and `optsWithGlobals()` where the project uses Commander

## Build & Test Status

- [ ] Existing tests pass
- [ ] New tests pass
- [ ] Build succeeds, with no type or lint errors

</verification>

<notes>

## For Reviewer

- [where to focus]
- [decisions worth discussing]
- [alternatives considered and rejected]

## Scope Control

**Added:** [what the spec asked for]
**Did not add:** [what was tempting and out of scope]

## Known Limitations

- [scope reduced from the spec, or debt taken on, and why]

## Dependencies

- [packages added: none, or each with its justification]
- [breaking changes: none, or what breaks]

</notes>

</output_format>

---

## When to Include Each Section

| Section            | When Required                          |
| ------------------ | -------------------------------------- |
| `<summary>`        | Always                                 |
| `<investigation>`  | Always — it evidences the research     |
| `<approach>`       | Always — it evidences the planning     |
| `<implementation>` | Always — the actual code               |
| `<tests>`          | When tests are part of the task        |
| `<verification>`   | Always — it evidences completion       |
| `<notes>`          | When there is context for the reviewer |
