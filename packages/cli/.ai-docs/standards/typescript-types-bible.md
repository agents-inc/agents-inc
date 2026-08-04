---
last_validated: 2026-04-21
---

# TypeScript Types Bible

> Principles and patterns extracted from a real-world type-narrowing effort across 37+ files.

---

## 1. Fix Types at the Source

**The #1 rule: never cast downstream to fix an upstream `string`.**

Type from the deserialization boundary (YAML parse, JSON parse, CLI args), then let types flow naturally through the pipeline. If you're casting in the middle of a function chain, the source type is wrong.

```typescript
// BAD — casting downstream
const id = rawData.id as SkillId; // workaround for untyped source

// GOOD — type the source, casts disappear downstream
type RawMetadata = {
  id: SkillId; // typed at source
  category: CategoryPath;
};
// no casts needed anywhere downstream
```

**Implementation order matters:** fix cross-cutting types first (shared interfaces in `types.ts`), because changes cascade to all consumers. Work outward from the center.

---

## 2. Union Types for Finite Sets

Use union types when a value comes from a known, closed set:

```typescript
type AgentName = "web-developer" | "api-developer" | "cli-developer";
type Domain = "web" | "api" | "cli" | "meta";
type ModelName = "sonnet" | "opus" | "haiku" | "inherit";
type PermissionMode =
  "default" | "acceptEdits" | "dontAsk" | "bypassPermissions" | "plan" | "delegate";
```

**Generated unions are the source of truth.** `SkillId`, `SkillSlug`, `Category`, `Domain`, and `AgentName` are auto-generated in `src/cli/types/generated/source-types.ts` from the skills source and agent metadata (run `bun run generate:types`). Never redeclare them, never hand-maintain a parallel list, and never cast a literal string member to them — the literal string IS the type. Casts like `"web-framework-react" as SkillId` or `"web" as Domain` are anti-patterns; only cast at data-entry boundaries (YAML, JSON, CLI args) or in error-path tests that deliberately use an invalid value (in which case prefer `string` over `as SkillId`).

**Keep `string` when the set is open-ended:**

- Display names, descriptions, titles, reasons, messages
- Filesystem paths
- Semver strings
- URLs, emails
- Free-form tags, keywords
- User-extensible identifiers (custom agent names, plugin names)
- Tool names (extensible via MCP)

**Decision rule:** If you can't enumerate every valid value, keep it `string`.

---

## 3. Template Literal Types for Structured IDs

When IDs follow a pattern but the full set is too large to enumerate:

```typescript
type SkillIdPrefix = "web" | "api" | "cli" | "meta" | "mobile";
type SkillId = `${SkillIdPrefix}-${string}`;
// Matches: "web-framework-react", "api-database-drizzle"
// Rejects: "unknown-something", plain "react"
```

This gives partial validation — the prefix is constrained, the suffix is open. Better than `string`, practical unlike full enumeration.

---

## 4. `Partial<Record<UnionType, V>>` for Runtime Records

**Never use `Record<UnionType, V>` when runtime won't have all keys.**

```typescript
// BAD — implies every Category key exists at runtime
categories: Record<Category, CategoryDefinition>;

// GOOD — correctly models sparse runtime data
categories: Partial<Record<Category, CategoryDefinition>>;
```

This applies universally:

- `Partial<Record<SkillId, ResolvedSkill>>` — not all skills present
- `Partial<Record<SkillAlias, SkillId>>` — not all aliases mapped
- `Partial<Record<Domain, SubcategorySelections>>` — not all domains selected

**TypeScript forces you to handle `undefined` access, which is correct.**

**Initializing an empty record: annotate, don't cast.**

```typescript
// BAD — cast implies the empty literal is already the target shape
const byCategory = {} as Record<Category, Skill[]>;
const byCategory = {} as Partial<Record<Category, Skill[]>>;

// GOOD — type annotation on the binding, literal stays literal
const byCategory: Partial<Record<Category, Skill[]>> = {};
```

The annotation form is preferred because the literal `{}` never masquerades as a complete record — the compiler tracks population as assignments land.

**Asserting lookups instead of non-null assertions.** When a skill must exist in the matrix, never write `matrix.skills[id]!` — use `getSkillById(id)` / `getSkillBySlug(slug)` from `src/cli/lib/matrix/matrix-provider.ts`, which throw with a diagnostic message. Reserve `matrix.skills[id]` (no `!`) for genuinely optional lookups, where the `undefined` branch is handled.

---

## 5. Pre-Resolution vs Post-Resolution Types

Data that passes through a resolution/normalization step should have different types before and after:

```typescript
// Pre-resolution: user input can be alias OR canonical ID
type ExtractedSkillMetadata = {
  requires: (SkillAlias | SkillId)[]; // "react" or "web-framework-react"
  compatibleWith: (SkillAlias | SkillId)[];
};

// Post-resolution: always canonical IDs
type ResolvedSkill = {
  requires: SkillId[]; // always "web-framework-react"
  compatibleWith: SkillId[];
};
```

This encodes pipeline semantics in the type system — the compiler catches resolution bugs.

---

## 6. Classify Your Casts

Not all casts are bad. Classify them:

| Cast Type                        | Legitimate?       | Example                                                                                                                                                            |
| -------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Object.keys/entries boundary** | Yes               | `Object.keys(record) as Category[]` — TS always returns `string[]`                                                                                                 |
| **CLI arg boundary**             | Yes               | `flags.category as CategoryPath` — user input enters as `string`                                                                                                   |
| **YAML/JSON parse boundary**     | Yes               | `parseYaml(content) as Record<string, unknown>`                                                                                                                    |
| **Test data construction**       | Yes               | `{ id: "test" } as SkillId` — intentionally invalid test values                                                                                                    |
| **Store initialization**         | Prefer annotation | `const x: Partial<Record<...>> = {}` beats `{} as Partial<Record<...>>`. Cast only when assignment context makes annotation awkward (e.g. inline callback return). |
| **vi.mock factory literals**     | Yes               | `"agents-inc"` inside `vi.mock()` — Vitest hoists factories above imports, so constants are unavailable                                                            |
| **Branded record construction**  | Yes               | `{...} as unknown as Record<BrandedA, BrandedB>` — object literal keys can't satisfy branded types directly                                                        |
| **Mid-pipeline workaround**      | **No**            | Fix the source type instead                                                                                                                                        |

**Every legitimate boundary cast should have a comment explaining why.**

For the full boundary cast taxonomy with real codebase examples (6 categories, acceptable vs
unacceptable patterns, post-safeParse conventions), see
[`clean-code-standards.md` Section 7.2](clean-code-standards.md).

**Double cast through `unknown` for branded Record keys.** When constructing a Record whose keys and values are both branded template literal types (e.g., `SkillDisplayName`, `SkillId`), a single `as` cast fails because object literal string keys are not assignable to branded types. Use `as unknown as Record<BrandedKey, BrandedValue>` with a comment:

```typescript
// Double cast needed: object literal's string keys are not assignable to branded
// SkillDisplayName/SkillId types without going through `unknown` first (boundary cast)
const displayNameToId = {
  react: "web-framework-react",
  zustand: "web-state-zustand",
} as unknown as Record<SkillDisplayName, SkillId>;
```

Prefer typed helper functions over raw casts for recurring patterns. These live in `src/cli/utils/typed-object.ts` — import from there, do not re-implement:

```typescript
// src/cli/utils/typed-object.ts
export function typedEntries<K extends string, V>(obj: Partial<Record<K, V>>): [K, V][] {
  return Object.entries(obj) as [K, V][];
}

export function typedKeys<K extends string>(obj: Partial<Record<K, unknown>>): K[] {
  return Object.keys(obj) as K[];
}
```

**Runtime narrowing uses type guards, not casts.** For string-to-union narrowing at runtime, use the guards in `src/cli/utils/type-guards.ts` — `isCategory()`, `isDomain()`, `isAgentName()`, `isCategoryPath()`. They check membership against the generated `CATEGORIES` / `DOMAINS` / `AGENT_NAMES` arrays from `src/cli/types/generated/source-types.ts`, so adding a new value to the source automatically widens the guard.

```typescript
// BAD — cast asserts membership without checking
const domain = flags.domain as Domain;

// GOOD — guard narrows, fall-through handles invalid input
if (!isDomain(flags.domain)) {
  throw new Error(`Invalid domain: ${flags.domain}`);
}
// flags.domain is now Domain
```

---

## 7. Extract Shared Type Aliases

When the same union appears on multiple types, extract it:

```typescript
// BAD — duplicated inline on 6 types
model: "sonnet" | "opus" | "haiku" | "inherit";

// GOOD — single source of truth
type ModelName = "sonnet" | "opus" | "haiku" | "inherit";

// Used consistently:
type AgentDefinition = {
  model: ModelName;
};
type AgentConfig = {
  model: ModelName;
};
type CustomAgentConfig = {
  model: ModelName;
};
```

---

## 8. Named Type Aliases for Complex Shapes

Give names to recurring composite types:

```typescript
// Instead of repeating this everywhere:
Record<Domain, Record<Category, SkillAlias[]>>;

// Extract a named alias:
type SubcategorySelections = Record<Category, (SkillAlias | SkillId)[]>;
type DomainSelections = Partial<Record<Domain, Partial<SubcategorySelections>>>;
```

Benefits: easier to read, single point of change, self-documenting.

---

## 9. Nested Record Typing

For nested key-value structures, type each level:

```typescript
// BAD — loses all semantic meaning
stack: Record<string, Record<string, string>>;

// GOOD — every level documented
stack: Record<AgentName, Partial<Record<Category, SkillId>>>;
//       ^ outer key      ^ not all subcats   ^ inner value
```

---

## 10. `as const` for Constant Arrays

Use `as const` for constant data to get literal types automatically:

```typescript
const DEFAULT_SKILLS = [
  "meta-methodology-anti-over-engineering",
  "meta-methodology-investigation-requirements",
] as const;
// Type: readonly ["meta-methodology-...", "meta-methodology-..."]
// Each element is a literal type, not just string
```

Add an explicit type annotation when consumers need to widen:

```typescript
const DEFAULT_SKILLS: readonly SkillId[] = [...] as const;
// Consumers get SkillId[], literals still type-checked at definition
```

---

## 11. Index Signatures vs Record Types

Prefer `Record` or `Partial<Record>` over index signatures:

```typescript
// AVOID — index signature allows any string key
type StackAgentConfig = {
  [subcategoryId: string]: string;
};

// PREFER — explicit key type
type StackAgentConfig = Partial<Record<Category, SkillAlias>>;
```

Index signatures always widen to `string` keys. `Record` with union keys preserves type information.

---

## 12. Mixed Built-in + User-Extensible Keys

When a Record has both known keys (from a union) and user-defined keys, keep `string`:

```typescript
// Can't narrow — includes custom agent IDs that users define
agents: string[];
custom_agents: Record<string, CustomAgentConfig>;
agent_skills: Record<string, AgentSkillConfig>;

// CAN narrow — only built-in agents in this context
agents: Record<AgentName, StackAgentConfig>; // stacks only reference built-ins
```

**Decision rule:** If users can add arbitrary keys, keep `string`. If the keys come from your codebase only, use the union.

---

## 13. Audit Methodology

When narrowing types across a codebase:

1. **Audit every `string` field** — decide: union type, template literal, or keep `string`
2. **Classify each as:**
   - Keep `string` (free-form) — no action
   - Narrow to union — change the type
   - Already done — verify
3. **Fix in priority order:**
   - Cross-cutting shared types first (they cascade)
   - Core library types second
   - Component/command types last (localized)
4. **Track boundary casts separately** — these are legitimate and should stay
5. **Target: zero unnecessary casts** — every remaining cast has a comment

---

## Quick Decision Flowchart

```
Is the value from a known, finite set?
├─ YES → Can you enumerate all values?
│   ├─ YES (< ~30 values) → Union type
│   └─ NO but has a pattern → Template literal type
└─ NO → Keep string

Is it a Record key?
├─ Will runtime have ALL keys? → Record<Union, V>
└─ Sparse at runtime? → Partial<Record<Union, V>>

Does the same union appear 2+ times?
├─ YES → Extract a named type alias
└─ NO → Inline is fine

Is there a resolution/normalization step?
├─ YES → Different types pre vs post resolution
└─ NO → Single type throughout

Do you need to cast?
├─ At a boundary (parse/CLI/Object.keys)? → OK, add comment
└─ Mid-pipeline? → Fix the source type instead
```
