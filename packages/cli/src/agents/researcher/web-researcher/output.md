## Output Format

<output_format>

**Report the sections your research covered and omit the rest.** A findings document's size follows
the question's size rather than this template's, and a section padded to fill the shape costs the
reader more than an absent one does.

<research_summary>
**Research Topic:** [What was researched]
**Confidence:** [High | Medium | Low] - based on how consistently the source confirms the claims
**Files Examined:** [count]
**Open Questions:** [what the codebase did not settle, or "none"]
</research_summary>

<component_patterns>

## Component Patterns

| Component | Location      | Purpose   | Key Props |
| --------- | ------------- | --------- | --------- |
| [name]    | `/path:lines` | [purpose] | [props]   |

### [ComponentName]

**Location:** `/path/to/component.tsx:12-85`
**Usage Count:** [X instances]

**Props Interface:**

```typescript
// From /path/to/types.ts:15-28
interface ComponentNameProps {
  // the actual interface, copied from the definition
}
```

**Composition Pattern:**

```tsx
// From /path/to/component.tsx:45-60
// How this component composes with others
```

**Variants:** [the variant mechanism and its options, if any]
</component_patterns>

<state_patterns>

## State Management

### Client State Stores

| Store  | Location      | Purpose           | Selectors       |
| ------ | ------------- | ----------------- | --------------- |
| [name] | `/path:lines` | [what it manages] | [key selectors] |

### Server State Hooks

| Hook   | Location      | Query Key     | Stale Time |
| ------ | ------------- | ------------- | ---------- |
| [useX] | `/path:lines` | [key pattern] | [time]     |

**Query Key Convention:** [the pattern observed, and where it is built]
</state_patterns>

<styling_patterns>

## Styling Architecture

**Method:** [the styling methodology this codebase uses]

**Token Locations:**

- Design tokens: `/path/to/tokens.scss`
- Component tokens: `/path/to/component.module.scss`

**Variant Pattern:**

```typescript
// From /path/to/component.tsx:8-25
```

**Class Naming Convention:** [the pattern, with a location]
</styling_patterns>

<form_patterns>

## Form Handling

**Validation Schema Location:** `/path/to/schema.ts:lines`

```typescript
// From /path/to/form.tsx:lines - schema, resolver wiring, and submission
```

**Error Display Convention:** [how field errors reach the UI, with a location]
</form_patterns>

<implementation_guidance>

## For the Frontend Developer

**Must Follow:**

1. [Pattern] - see `/path:lines`
2. [Pattern] - see `/path:lines`

**Must Avoid:**

1. [Anti-pattern observed] - inconsistent with `/path:lines`

**Files to Read First:**

| Priority | File    | Why                       |
| -------- | ------- | ------------------------- |
| 1        | [/path] | Best example of [pattern] |
| 2        | [/path] | Shows [specific thing]    |

</implementation_guidance>
</output_format>

---

## The Bar

Every finding carries a verified path, the line range, the code as it actually reads, how many
instances exist, and what the developer should do with it. The difference is what a developer can
act on:

**Below the bar** — true, and worth nothing:

```markdown
The codebase uses React Query for server state.
```

**At the bar** — the same claim, actionable:

```markdown
**Library:** React Query v5 — 47 query hooks

**Query key factory:** `/packages/api-client/src/queries/posts.ts:12-25` — hierarchical keys, `as const`
**Custom hook shape:** `/packages/api-client/src/hooks/use-post.ts:8-22` — wraps `useQuery` with defaults

Read `/packages/api-client/src/queries/posts.ts` first; it is the fullest example.
```

The paths above illustrate the shape. Write the ones you actually opened.
