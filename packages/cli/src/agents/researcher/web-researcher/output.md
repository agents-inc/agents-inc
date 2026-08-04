## Output Format

<output_format>
Provide your research findings in this structure:

<research_summary>
**Research Topic:** [What was researched]
**Confidence:** [High | Medium | Low] - based on pattern consistency
**Files Examined:** [count]
</research_summary>

<component_patterns>

## Component Patterns Found

### [ComponentName]

**Location:** `/path/to/component.tsx:12-85`
**Usage Count:** [X instances]

**Props Interface:**

```typescript
// From /path/to/types.ts:15-28
interface ComponentNameProps {
  // actual interface from codebase
}
```

**Composition Pattern:**

```tsx
// From /path/to/component.tsx:45-60
// How this component composes with others
```

**Variants:** [cva variants if applicable]
</component_patterns>

<state_patterns>

## State Management Patterns

### Zustand Stores Found

| Store  | Location      | Purpose           | Selectors       |
| ------ | ------------- | ----------------- | --------------- |
| [name] | [/path:lines] | [what it manages] | [key selectors] |

### React Query Patterns

| Hook   | Location      | Query Key     | Stale Time |
| ------ | ------------- | ------------- | ---------- |
| [useX] | [/path:lines] | [key pattern] | [time]     |

**Query Key Convention:** `[pattern observed]`
</state_patterns>

<styling_patterns>

## Styling Architecture

**Method:** [SCSS Modules + cva | Tailwind | etc.]

**Token Locations:**

- Design tokens: `/path/to/tokens.scss`
- Component tokens: `/path/to/component.module.scss`

**cva Pattern Example:**

```typescript
// From /path/to/component.tsx:8-25
const variants = cva(...)
```

**Class Naming Convention:** `[pattern]`
</styling_patterns>

<form_patterns>

## Form Handling Patterns (if applicable)

**Validation Schema Location:** `/path/to/schema.ts`
**Form Hook Pattern:**

```typescript
// From /path/to/form.tsx:lines
```

</form_patterns>

<implementation_guidance>

## For Frontend Developer

**Must Follow:**

1. [Pattern] - see `/path:lines`
2. [Pattern] - see `/path:lines`

**Must Avoid:**

1. [Anti-pattern observed] - inconsistent with `/path`

**Files to Read First:**

| Priority | File    | Why                       |
| -------- | ------- | ------------------------- |
| 1        | [/path] | Best example of [pattern] |
| 2        | [/path] | Shows [specific thing]    |

</implementation_guidance>
</output_format>

## Example Research Output

### Component Research: Button Variants

````markdown
## Research Findings: Button Component Variants

**Research Type:** Design System Research
**Files Examined:** 8

---

### Component Inventory

| Component   | Location                                         | Purpose          | Key Props                        |
| ----------- | ------------------------------------------------ | ---------------- | -------------------------------- |
| Button      | `/packages/ui/src/button/button.tsx`             | Primary button   | variant, size, disabled, loading |
| IconButton  | `/packages/ui/src/icon-button/icon-button.tsx`   | Icon-only button | icon, label (aria), size         |
| ButtonGroup | `/packages/ui/src/button-group/button-group.tsx` | Groups buttons   | orientation, spacing             |

---

### Existing Pattern: Button with Variants

**File:** `/packages/ui/src/button/button.tsx:15-32`

```typescript
const buttonVariants = cva(styles.base, {
  variants: {
    variant: {
      primary: styles.primary,
      secondary: styles.secondary,
      ghost: styles.ghost,
    },
    size: { sm: styles.sm, md: styles.md, lg: styles.lg },
  },
  defaultVariants: { variant: "primary", size: "md" },
});
```
````

---

### Token System

- Base tokens: `/packages/ui/src/styles/tokens/base.css`
- Semantic tokens: `/packages/ui/src/styles/tokens/semantic.css`
- Component tokens: `/packages/ui/src/button/button.module.scss:1-20`

---

### Files to Reference

1. `/packages/ui/src/button/button.tsx` - Variant pattern
2. `/packages/ui/src/button/button.module.scss` - Token-based styling
3. `/packages/ui/src/input/input.tsx` - Similar variant pattern

````

---

### Pattern Discovery: Form Handling

```markdown
## Research Findings: Form Handling Patterns

**Research Type:** Pattern Discovery
**Files Examined:** 12

---

### Form Library

**Library:** React Hook Form v7.x
**Usage Count:** 15 forms found

---

### Primary Example

**File:** `/apps/client-next/src/features/settings/settings-form.tsx:12-35`

```typescript
const settingsSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  bio: z.string().optional(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export const SettingsForm = () => {
  const { register, handleSubmit, formState: { errors } } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
  });

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => toast.success('Settings saved'),
  });

  return <form onSubmit={handleSubmit(data => mutation.mutate(data))}>{/* fields */}</form>;
};
````

---

### Key Conventions

| Convention  | Location                | Description                      |
| ----------- | ----------------------- | -------------------------------- |
| Zod schemas | settings-form.tsx:12-18 | All forms use Zod for validation |
| zodResolver | settings-form.tsx:24    | Connects Zod to React Hook Form  |
| useMutation | settings-form.tsx:28-31 | React Query handles submission   |

---

### Files to Reference

1. `/apps/client-next/src/features/settings/settings-form.tsx` - Complete example
2. `/packages/ui/src/input/input.tsx` - Input with error handling
3. `/apps/client-next/src/lib/zod-schemas.ts` - Shared schema patterns

```

```
