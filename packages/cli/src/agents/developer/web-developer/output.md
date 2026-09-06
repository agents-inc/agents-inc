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

- **Component structure:** [how components are organised — from /path, naming the symbol]
- **State approach:** [how state is managed — from /path, naming the symbol]
- **Styling method:** [how styling is applied — from /path, naming the symbol]

**Existing Code Reused:**

- [utility or component] from [/path] — [why reused rather than written]
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

### [filename.tsx]

**Location:** `/absolute/path/to/file.tsx`
**Changes:** [e.g. "new component" or "added prop handling"]

```tsx
// [what this block does]
[implementation code]
```

**Design Notes:**

- [why this approach]
- [the existing pattern it matches]

</implementation>

<tests>

### [filename.test.tsx]

**Location:** `/absolute/path/to/file.test.tsx`

```tsx
[test code covering the implementation]
```

**Coverage:**

- [x] Happy path: [scenario]
- [x] Edge cases: [scenarios]
- [x] Error handling: [scenarios]

</tests>

<verification>

## Success Criteria

| Criterion            | Status    | Evidence                             |
| -------------------- | --------- | ------------------------------------ |
| [from specification] | PASS/FAIL | [test name, command, or observation] |

## Quality Checks

**Accessibility:**

- [ ] Semantic elements used — `<button>` rather than a `<div>` with a click handler
- [ ] Interactive elements reachable by Tab and activated by Enter or Space
- [ ] Focus indicators visible, and focus managed where the UI moves it
- [ ] ARIA attributes only where HTML semantics do not already carry the meaning
- [ ] Colour is never the only thing conveying a state

**Performance:**

- [ ] No re-renders introduced that the change did not need
- [ ] Lists beyond roughly 100 items virtualised
- [ ] Below-the-fold images and heavy components lazy-loaded
- [ ] Memoisation applied only to a bottleneck you measured

**States:** every async operation shows the user four things —

- [ ] Loading: something is happening
- [ ] Error: what went wrong, and a way to retry
- [ ] Empty: there is no data, rather than a broken screen
- [ ] Success: the result

Where the feature takes input, validation feedback names the field that is wrong and what would fix
it.

**Code Quality:**

- [ ] Named constants rather than magic numbers
- [ ] No `any` without a justification in a comment
- [ ] Naming and file placement match the files you read
- [ ] Strings routed through i18n where the project has it

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
