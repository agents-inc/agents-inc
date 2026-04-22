---
type: standard-gap
severity: medium
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/wizard/build-step-logic.ts
  - src/cli/lib/wizard/build-step-logic.test.ts
  - e2e/helpers/create-e2e-source.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-03-25
proposer: cli-reviewer
category: complexity
domain: shared
root_cause: convention-undocumented
status: absorbed-informally
resolution_date: 2026-04-21
resolution_note: |
  Core idea (thin orchestrators + pure helpers, extract when name communicates more than expression)
  is present in clean-code-standards.md §1.3 ("Split components at 300 LOC... parent becomes a thin
  orchestrator") and the "GOOD: thin orchestrator calling focused helpers" example pattern, plus
  scattered orchestrator references (§415+). NOT present as a titled "Declarative Programming — No
  Context Required" section with the full two-tier pattern, the "Can you read it without simulating?"
  test, or the named-test-data rule (REACT_CONFLICTS_VUE / BUILD_STEP_WEB_MATRIX). CLAUDE.md has
  no declarative/SLAP rule. Residual: if future drift recurs on inline transforms or inline
  createMock* calls, promote to a named section rather than leaving it informally absorbed.
---

## Core Principle: Code Should Not Require Context to Understand

When reading code, the reader should never need to mentally simulate a block to understand _why_ it's there. This applies everywhere — store actions, rendering logic, test setup, configuration, utilities. Extract when the name communicates intent that the expression doesn't already communicate

This is sometimes called the **Single Level of Abstraction Principle** (SLAP) — each function should operate at one level of abstraction. But the sharper framing is about **reader cognitive load**: can someone understand the code's flow without simulating any of its parts?

### Why This Matters for AI-Generated Code

1. **Testable in isolation** — pure functions can be tested without setup, mocks, or state. Bugs are pinpointed to the exact function.
2. **Verifiable by name** — `removeSkillsFromSelections(selections, toRemove)` can be reviewed by reading the signature. An inline `Object.fromEntries(typedEntries(...).map(...))` requires simulation.
3. **Composable without context** — pure functions can be moved, reused, or replaced without understanding surrounding code.
4. **Smaller blast radius** — a bug in a pure function is contained. A bug in a 40-line function with mutable state could affect anything.

## Where This Was Found

The principle surfaced in a Zustand store action but applies across the entire codebase:

### Store actions

`toggleFilterIncompatible` mixed guard clauses, domain logic, and state assembly. Refactored to a thin orchestrator calling pure functions (`findIncompatibleWebSkills`, `removeSkillsFromSelections`).

### Test data

Inline `createMockSkill("web-framework-react", { conflictsWith: [...] })` requires simulating the factory. Named constants like `REACT_CONFLICTS_VUE` make intent clear from the name.

Inline `createMockMatrix(SKILLS.react, SKILLS.vue, { categories: { ... } })` requires tracing the arguments. Named constants like `BUILD_STEP_WEB_MATRIX` describe what the matrix represents.

### E2E infrastructure

`additionalSkills` and `categories` options were added to `createE2ESource` to avoid modifying the base skill set. The simpler approach: just include the skills in the base array. Complexity was added to avoid fixing two fragile count assertions.

### Rendering logic

An inline ternary inside an object literal inside a `.map()` requires simulation to understand. A named variable or predicate makes the intent visible.

## The Two-Tier Pattern

Every function with logic should follow this structure:

**Top tier — orchestrator:** Reads like pseudocode. Guard clauses, named function calls, assembly. No inline data transformations.

```typescript
// You can understand this without simulating anything
toggleFilterIncompatible: () =>
  set((state) => {
    if (state.filterIncompatible) return { filterIncompatible: false };
    if (!webSelections) return { filterIncompatible: true };

    const removed = findIncompatibleWebSkills(webSelections, state.lockedSkillIds);
    if (removed.size === 0) return { filterIncompatible: true };

    return {
      filterIncompatible: true,
      domainSelections: { ...state.domainSelections, web: removeSkillsFromSelections(webSelections, removed) },
      skillConfigs: state.skillConfigs.filter((sc) => !removed.has(sc.id)),
    };
  }),
```

**Bottom tier — pure functions:** Independently testable, no context needed. Placed at the bottom of the file or in shared modules.

```typescript
function findIncompatibleWebSkills(webSelections, lockedSkillIds): Set<SkillId> { ... }
function removeSkillsFromSelections(selections, toRemove): CategorySelections { ... }
```

## The Test: Can You Read It Without Simulating?

For any block of code, ask: "Can someone understand the code's flow without simulating any of its parts?"

- If **yes** — the code is at the right level of abstraction.
- If **no** — extract the part that requires simulation into a named function or constant.

This applies to:

- **Functions:** Extract inline transforms to named pure functions
- **Test data:** Extract inline factory calls to named constants
- **Configuration:** Use the simplest option that works, don't add complexity to avoid fixing fragile tests
- **Predicates:** Name filter/map callbacks when the logic isn't obvious from a glance

## Where to Apply

Audit the codebase for code that requires simulation to understand:

- `src/cli/stores/wizard-store.ts` — store actions with inline transforms
- `src/cli/lib/wizard/build-step-logic.ts` — rendering logic mixed with data transforms
- `src/cli/lib/matrix/matrix-resolver.ts` — validation functions with inline accumulation
- `src/cli/lib/configuration/config-generator.ts` — config building with mixed concerns
- `src/cli/lib/stacks/stacks-loader.ts` — stack processing with inline transforms
- All test files — inline `createMockSkill`/`createMockMatrix` calls that should be named constants

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md`:

### Declarative Programming — No Context Required

**Functions should be thin orchestrators calling named pure functions:**

- Guard clauses and early exits at the top
- Named pure function calls for domain logic
- Assembly at the bottom
- No inline data transformations

**Pure functions at the bottom of the file or in shared modules:**

- Each does one thing, named for its purpose
- Independently testable without mocks or state setup
- Reusable across call sites

**Test data should be named constants:**

- `REACT_CONFLICTS_VUE` over `createMockSkill("web-framework-react", { conflictsWith: [...] })`
- `BUILD_STEP_WEB_MATRIX` over `createMockMatrix(SKILLS.react, SKILLS.vue, { categories: { ... } })`
- Constants in `mock-data/` files, not inline in test files

**Prefer simplicity over options:**

- Don't add configuration options to avoid fixing fragile tests
- Don't add indirection to avoid modifying shared data
- The right fix is the simple fix

**The test:** can someone understand the code's flow without simulating any of its parts?
