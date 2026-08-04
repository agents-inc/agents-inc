## Output Format

<output_format>
Provide your pattern extraction in this structure:

<extraction_summary>
**Codebase:** [name/path]
**Extraction Date:** [date]
**Files Analyzed:** [count]
**Pattern Categories:** [count]/15
</extraction_summary>

<pattern_catalog>

## 1. Code Architecture Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

**Example:**

```typescript
// From /path:lines
```

## 2. Component Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

**Example:**

```typescript
// From /path:lines
```

## 3. State Management Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

**Example:**

```typescript
// From /path:lines
```

## 4. API Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

**Example:**

```typescript
// From /path:lines
```

## 5. Database Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

**Example:**

```typescript
// From /path:lines
```

## 6. Testing Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

**Example:**

```typescript
// From /path:lines
```

## 7. Error Handling Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

**Example:**

```typescript
// From /path:lines
```

## 8. Styling Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

**Example:**

```scss
// From /path:lines
```

## 9. Build/Tooling Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

## 10. CI/CD Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

## 11. Environment/Config Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

## 12. Security Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

## 13. Logging/Observability Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

## 14. Performance Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

## 15. Documentation Patterns

| Pattern | Location      | Confidence     | Instances |
| ------- | ------------- | -------------- | --------- |
| [name]  | [/path:lines] | [High/Med/Low] | [count]   |

</pattern_catalog>

<anti_patterns>

## Anti-Patterns Observed

| Anti-Pattern | Location      | Why Problematic | Occurrences |
| ------------ | ------------- | --------------- | ----------- |
| [name]       | [/path:lines] | [reason]        | [count]     |

</anti_patterns>

<consistency_analysis>

## Consistency Score

| Category       | Consistency    | Notes         |
| -------------- | -------------- | ------------- |
| Naming         | [High/Med/Low] | [observation] |
| Error handling | [High/Med/Low] | [observation] |
| Testing        | [High/Med/Low] | [observation] |

**Coverage Gaps:**

- [Missing pattern category]
- [Inconsistent area]
  </consistency_analysis>

<raw_patterns_export>

## Machine-Readable Export

```yaml
patterns:
  code_architecture:
    - name: [name]
      file: [/path]
      lines: [start-end]
      confidence: [high|medium|low]
  # ... all categories
```

</raw_patterns_export>
</output_format>

## Example Output

Create `./extracted-standards.md` with this structure:

```markdown
# [Project Name] - Standards & Patterns

**Extraction Date:** [YYYY-MM-DD]
**Monorepo Tool:** [Turborepo/Nx/Lerna]
**Confidence Level:** [High/Medium/Low]

---

## Package Architecture

### Workspace Structure
```

packages/
├── ui/ # Shared components
├── utils/ # Pure functions
apps/
├── web/ # Next.js application

````

### Package Naming

All internal packages use `@repo/` prefix with `workspace:*` protocol.

---

## Code Conventions

### Imports

```typescript
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@repo/ui";
import { Shell } from "./shell";
import styles from "./page.module.scss";
````

### Query Hooks

```typescript
export const usePost = (id: number) => {
  return useQuery({
    queryKey: ["posts", "detail", id],
    queryFn: () => fetchPost(id),
  });
};
```

---

## Quick Reference

### Critical Do's

- Use TanStack Query for server state
- Use CSS variables for tokens
- Named exports only
- kebab-case file names

### Critical Don'ts

- No default exports in libraries
- No magic numbers
- No any without justification
- No hardcoded colors/spacing

### Commands

```bash
pnpm tsc --noEmit path/to/file.ts    # Type check
pnpm prettier --write path/to/file.ts # Format
pnpm eslint path/to/file.ts           # Lint
pnpm vitest run path/to/file.test.ts  # Test
```

---

## Confidence Notes

**High Confidence:** Patterns seen 5+ times
**Medium Confidence:** Patterns seen 3-4 times
**Low Confidence:** Patterns seen 2 times - needs verification

```

```
