---
last_validated: 2026-04-21
---

# The Skill Atomicity Bible

> `skill-atomicity-primer.md` outranks this document where the two differ.

> **The Core Principle**: A skill discusses only its own domain.

**Paths and commands in this document are relative to `packages/cli`**, except those under
`src/skills/`, which name the separate `agents-inc/skills` marketplace checkout and are run from its
root. Run each from the root it names — from the wrong one an audit grep exits non-zero with an
empty stdout, which reads as a clean skill.

A React skill discusses components, hooks and composition; SCSS, Zustand and MSW are settled by the skills that own them. A styling skill discusses CSS patterns and tokens, and leaves icon libraries to theirs. This creates portable, composable, stack-agnostic skills that can be mixed and matched freely.

---

## Table of Contents

1. [The Core Principle](#1-the-core-principle)
2. [Violation Categories](#2-violation-categories)
3. [Transformation Framework](#3-transformation-framework)
4. [Keywords to Watch](#4-keywords-to-watch)
5. [Content Relocation Protocol](#5-content-relocation-protocol)
6. [Quality Gate Checklist](#6-quality-gate-checklist)
7. [Complexity Tiers](#7-complexity-tiers)
8. [Skill File Extraction](#8-skill-file-extraction)
9. [Pitfalls to Avoid](#9-pitfalls-to-avoid)
10. [Troubleshooting Common Issues](#10-troubleshooting-common-issues)
11. [Verification Commands](#11-verification-commands)

---

## Skill Directory Structure

Skills follow a directory-based structure with modular files:

```
.claude/skills/{domain}-{group}-{technology}/
├── SKILL.md              # Main skill file with TOC
├── metadata.yaml         # Skill metadata (category, author, slug, displayName, etc.)
├── reference.md          # Comparison tables, API lookup and migration notes
└── examples/             # Technology-specific example files
    ├── core.md           # Core patterns (required in every skill)
    └── {topic}.md        # Technology-specific topics (as many as needed)
```

### Key Rules

- **`core.md` is required in every skill** — contains first-time setup, primary API, essential types, fundamental patterns, minimum viable usage
- Additional files are named after the **topic** they cover, not fixed categories
- The number and names of additional files depend on the **technology's natural domain boundaries**
- There is no maximum file count — create as many topic files as the technology naturally requires

### Technology-Driven Examples

Different technologies produce different file structures, because each has its own domain of
complexity: a router skill splits by route kind, a styling skill by what is being styled, a testing
skill by what is under test. Read what the shipped skills actually did before deciding a split —
`ls src/skills/*/examples/` in the marketplace repository is the whole survey, and several skills
answer with `core.md` alone, which is a correct answer rather than an unfinished one.

### SKILL.md Table of Contents

Every SKILL.md must include a simple TOC below the frontmatter pointing to related files. The TOC entries reflect the technology-specific topics:

```markdown
---
name: web-framework-react
description: Component architecture, hooks, patterns
---

# React Components

> **Quick Guide:** Brief summary of key patterns...

**Detailed Resources:**

- [examples/core.md](examples/core.md) - Component patterns, props, composition
- [examples/hooks.md](examples/hooks.md) - Custom hook implementations
- [examples/performance.md](examples/performance.md) - Memoization, lazy loading, profiling
- [reference.md](reference.md) - Comparison tables, API lookup and migration notes
```

### SKILL.md Content Standard

SKILL.md is the **decision layer** — it answers _what_, _why_, _when_, and _what goes wrong_. It never answers _how_ with full code implementations.

| Section                        | Purpose                                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontmatter                    | `name` and `description` fields                                                                                                                                                                             |
| Quick Guide                    | One paragraph summary of key patterns and gotchas                                                                                                                                                           |
| Table of Contents              | Links to all example files by concept                                                                                                                                                                       |
| Which path applies             | Where the technology is used in more than one way: the branches, and the file each one opens, so the branches not taken stay unread. Left out where the technology has one path                             |
| `<critical_requirements>`      | The rules this technology's patterns depend on, stated once, at the **top**, each as the action to take                                                                                                     |
| Auto-detection                 | Keywords that trigger this skill                                                                                                                                                                            |
| Applies to / Handled elsewhere | Decision guidance — what this skill settles, and which neighbouring concern is settled somewhere else                                                                                                       |
| `<philosophy>`                 | Optional. Why this technology, and the mental model it asks for; include it where the tool's shape is non-obvious                                                                                           |
| `<decision_framework>`         | Optional. Comparative "pick X over Y" guidance, where the technology competes with a named alternative inside its own domain                                                                                |
| Key patterns (`<patterns>`)    | Name + brief illustrative snippet (3–10 lines) + link to example file, numbered Pattern 1, Pattern 2, …                                                                                                     |
| Red flags                      | Common mistakes, gotchas, and anti-patterns                                                                                                                                                                 |
| `<critical_reminders>`         | Optional, at the **bottom**. Include it when it adds a standing consideration the requirements block did not state; a verbatim repeat of that block is loaded on every use and says nothing the second time |

**Trim the wording before moving anything.** A skill loads whole, so every word is paid for by every
task that touches the technology — and most skills shrink by a third on wording alone: the clause
restating the one before it, the sentence that only sets up the next, the hedges. Do that first,
then move code out; a file cut to length by extraction alone stays wordy in what remains.

**`SKILL.md` is the decision layer, and its size follows from that rather than from a number.** When it stops being scannable — when a reader looking for which approach to take has to page past implementations to find the answer — move the full code examples into the examples folder. Extraction rather than deletion: concepts, decisions and red flags stay, the code blocks move out and are reached by a link. There is deliberately no line or token budget here (owner ruling, 2026-09-03); a threshold invites trimming to the number rather than to the job, and the same count means different things in a skill of dense config and a skill of prose.

**The test for where a paragraph belongs:** a reader choosing between two approaches needs it in
SKILL.md; a reader implementing the one they chose can follow a link. Keep the patterns, the red
flags and the decision guidance — a line count is the symptom, and what belongs where is the
question.

### Examples Folder Structure

Examples are split into focused files based on the technology's natural topics:

| File         | Purpose                               | When to create                                 |
| ------------ | ------------------------------------- | ---------------------------------------------- |
| `core.md`    | Essential patterns everyone needs     | required in every skill                        |
| `{topic}.md` | Technology-specific extended patterns | When a topic has 100+ lines of focused content |

Each example file should cross-reference related files at the top.

---

## 1. The Core Principle

**A skill discusses only its own domain.**

This is the single most important rule for skill atomicity. Every other guideline derives from this principle.

### What This Means

| Domain               | Should Discuss                                   | Settled Elsewhere                         |
| -------------------- | ------------------------------------------------ | ----------------------------------------- |
| **React**            | Components, hooks, props, lifecycle, composition | SCSS, Zustand, React Query, MSW           |
| **Styling**          | CSS patterns, design tokens, selectors, layout   | lucide-react, React Query, form libraries |
| **State Management** | Store patterns, selectors, subscriptions         | Styling approaches, API libraries         |
| **Testing**          | Test structure, assertions, coverage             | Specific mock libraries, styling          |
| **Data Fetching**    | Caching, mutations, optimistic updates           | State management tools, styling           |

### Why This Matters

1. **Portability**: A React skill that doesn't mention SCSS works for teams using Tailwind, CSS-in-JS, or plain CSS
2. **Composability**: Skills can be mixed freely without conflicts
3. **Maintenance**: Updating one skill doesn't require updating others
4. **Clarity**: Each skill teaches one thing well
5. **Flexibility**: Stacks can evolve tool-by-tool without rewriting skills

### The Exception: Bridge Patterns

When a skill defines its own bridge/adapter utility (like MobxQuery that bridges MobX and React Query), implementation-specific imports can be preserved because they teach "how to bridge" not "what tool to use."

```typescript
// ALLOWED in MobX skill - defines the bridge pattern itself
import { MobxQuery } from "./mobx-query";

// NOT ALLOWED in MobX skill - prescribes external tool
import { useQuery } from "@tanstack/react-query"; // VIOLATION
```

---

## 2. Violation Categories

### Category 1: Import Coupling (HIGH Severity)

Examples that import from other domains.

```typescript
// VIOLATION - React skill importing styling
import styles from "./button.module.scss";
import { cva } from "class-variance-authority";

// VIOLATION - Testing skill importing specific mock library
import { server } from "msw/node";
import { rest } from "msw";

// FIXED - Generic comment
// Apply your styling solution via className prop
// Use your mocking solution's server setup
```

**Why High Severity:** Creates hard dependency on external tool. Skill becomes unusable without that specific tool.

---

### Category 2: Explicit Tool Recommendations (HIGH Severity)

"Use X for this" where X is another skill's tool.

```markdown
// VIOLATION
"Use React Query for server data"
"Use Zustand for global client state"
"Use MSW for API mocking"

// FIXED
"Use your data fetching solution"
"Use your client state management approach"
"Use your API mocking solution"
(or remove entirely - let the relevant skill handle it)
```

**Why High Severity:** Prescribes specific tools, defeating the purpose of separate skills.

---

### Category 3: Integration Guides (HIGH Severity)

Sections that list specific tools from other skills.

```markdown
// VIOLATION
**Works with:**

- SCSS Modules: All components use SCSS Modules
- React Query: State management for server data
- Zustand: Global client state management
- MSW: API mocking in tests

// FIXED
**Applies to:** component architecture, props, composition.

**Handled elsewhere:**

- Styling — components accept a `className`; the styling approach is settled by whatever owns it.
- Client state — components receive data as props, and where it came from is not their concern.
- Test doubles for the network — components are unaware of the transport.
```

**Why High Severity:** Creates expectation of specific stack, reduces portability.

---

### Category 4: Decision Tree Exits (MEDIUM Severity)

Decision trees that exit to another domain's tool.

```markdown
// VIOLATION
Is it server data?
├─ YES → Use React Query
└─ NO → Is it global state?
├─ YES → Use Zustand
└─ NO → useState

// FIXED
Is it server data?
├─ YES → Use your data fetching solution (not this skill's scope)
└─ NO → Is it global state?
├─ YES → Use your state management solution
└─ NO → useState (this skill's scope)
```

**Why Medium Severity:** Less direct than imports, but still prescribes tools.

---

### Category 5: Pattern Titles with External Tools (MEDIUM Severity)

Pattern names that include other domain's libraries.

```markdown
// VIOLATION
Pattern 11: Icon Styling with lucide-react
Pattern 3: Integration Testing with MSW
Pattern 7: State Hydration with React Query

// FIXED
Pattern 11: Icon Styling
Pattern 3: Integration Testing with Network-Level Mocking
Pattern 7: State Hydration
```

**Why Medium Severity:** Suggests requirement for specific tool in the title itself.

---

### Category 6: Library Reference Sections (LOW Severity)

Sections that prescribe specific libraries.

```markdown
// VIOLATION

### Library

`lucide-react` (installed in `packages/ui`)

### Dependencies

- React Query v5+
- MSW v2+

// FIXED
(Remove section entirely - let respective skills handle their dependencies)
```

**Why Low Severity:** Informational, but still creates coupling expectation.

---

### Category 7: Codebase-Specific Imports (MEDIUM Severity)

Imports from workspace packages that assume specific structure.

```typescript
// VIOLATION
import { handlers } from "@repo/api-mocks";
import { Button } from "@repo/ui";
import { apiClient } from "@repo/api";

// FIXED
import { handlers } from "./handlers"; // Generic relative import
// Use your component library's Button
// Use your API client
```

**Why Medium Severity:** Assumes specific monorepo structure, not portable.

---

### Category 8: Framework-Specific Names (MEDIUM Severity)

References to specific frameworks where architecture category works.

```markdown
// VIOLATION

## App Integration (Vite/React)

## App Integration (Next.js App Router)

// FIXED

## App Integration (SPA/Client-Side)

## App Integration (SSR Framework)
```

**Why Medium Severity:** Excludes users of other frameworks in same category.

---

## 3. Transformation Framework

### The Decision Tree

For each external domain reference found:

```
1. Is it in a title?
   └─ YES → Genericize the title

2. Is it in a "Library" section?
   └─ YES → Remove the section entirely

3. Is it in an import statement?
   └─ YES → Replace with generic comment or relative import

4. Is it in an example?
   ├─ Is the example still valid without it?
   │   └─ YES → Remove the reference, keep the example
   └─ NO → Rewrite with generic approach

5. Is it in a decision tree?
   ├─ Does tree exit to another domain?
   │   └─ YES → Rewrite to end within own domain
   └─ NO → Keep as-is

6. Is it valuable content that should live elsewhere?
   ├─ YES → Relocate to appropriate skill (see Protocol)
   └─ NO → Remove or genericize

7. Is it a codebase-specific import (@repo/*)?
   └─ YES → Replace with generic relative import pattern

8. Is it a framework name (Next.js, Vite)?
   └─ YES → Replace with architecture category (SPA/SSR)
```

### The Four Phases

The four are one lane: Phase 4 validates the transform Phase 3 made, by the agent that made it.
Auditing a skill someone else wrote is a separate read-only dispatch that reports with quotes and
changes nothing — the verifier is never the fixer.

#### Phase 1: Audit

```bash
# Find all violations
# The one command, defined once in §11 "Full Audit Command" — run that, not a shortened copy.
# A narrower set passes a transformation the full audit would still catch.

# Check specific files
grep -n "import" skill/examples/*.md          # Import violations
grep -n "Works with\|Integrates" skill/*.md  # Integration guide violations
grep -n "Use.*for" skill/*.md                # Tool recommendation violations
```

#### Phase 2: Categorize

For each violation found:

| Category       | Description                               | Action                          |
| -------------- | ----------------------------------------- | ------------------------------- |
| **Remove**     | Content belongs in another skill entirely | Delete (check relocation first) |
| **Relocate**   | Valuable content for another skill        | Copy to target, then delete     |
| **Genericize** | Can stay with domain-agnostic wording     | Rewrite to be generic           |
| **Keep**       | Already pure to this domain               | No changes needed               |

#### Phase 3: Transform

Apply changes based on categorization:

**For imports:**

```typescript
// Before
import styles from "./button.module.scss";

// After
// Apply your styling solution via className
```

**For tool recommendations:**

```markdown
// Before
"Use React Query for server data"

// After
"Use your data fetching solution" OR (remove entirely)
```

**For Integration Guides:**

```markdown
// Before
**Works with:** SCSS Modules, React Query, Zustand

// After
**Handled elsewhere:** styling — components accept a `className` and settle none of it.
```

**For icons in examples:**

```typescript
// Before
import { ChevronUp, ChevronDown } from "lucide-react";

// After
<span aria-hidden="true">▲</span>  // Unicode with aria-hidden
<span aria-hidden="true">▼</span>
```

#### Phase 4: Validate

```bash
# 1. Run §11's Full Audit Command — it must return nothing

# 2. Read transformed skill front-to-back
# - Does philosophy still make sense?
# - Are patterns still actionable?
# - Are examples complete enough?
# - Do critical requirements still apply?

# 3. Check pattern numbering
# - No gaps in sequence
# - All cross-references valid
```

---

## 4. Keywords to Watch

When auditing skills, grep for these patterns:

### Styling Domain

```
SCSS, scss, scss-modules, module.scss, module.css
cva, class-variance-authority
clsx (when used with styles.*)
design tokens (when prescribing specific approach)
lucide-react, lucide, ChevronUp, ChevronDown
styles. (CSS module object access)
Tailwind, tailwind (in non-Tailwind skills)
```

### State Management Domain

```
Zustand, zustand, create (zustand)
Redux, redux, useSelector, useDispatch
MobX, mobx, observable, makeAutoObservable
Jotai, jotai, atom
```

### Data Fetching Domain

```
React Query, react-query, @tanstack/react-query, TanStack
useQuery, useMutation (when imported from React Query)
SWR, swr, useSWR
```

### Testing Domain

```
MSW, msw, Mock Service Worker
Vitest, vitest
Jest, jest
Playwright, playwright
@testing-library/react, RTL, render, screen
```

### Form Libraries

```
react-hook-form, useForm
@hookform/resolvers
zod (when used with forms)
Formik, formik
```

### Framework Names

```
Next.js, Vite, Remix, Gatsby
(replace with SPA/SSR/Static categories)
```

### Environment Variables

```
NEXT_PUBLIC_ (Next.js-specific prefix — use generic names: API_URL, not NEXT_PUBLIC_API_URL)
VITE_ (Vite-specific prefix)
NUXT_ (Nuxt-specific prefix)
EXPO_PUBLIC_ (Expo-specific prefix)
```

### Codebase-Specific

```
@repo/ (workspace package imports)
@/lib/ (codebase-specific path aliases)
../../../packages/ (deep relative imports)
```

### Template Contamination

Patterns that appear to have been copied from an unrelated skill's template. If these appear in a skill that doesn't use the associated technology, they are copy-paste errors:

```
runInAction (MobX — found in vue-i18n, tRPC, Remix skills during Iteration 1)
forwardRef (React — check if skill is actually React)
defineStore (Pinia — check if skill is actually Pinia)
useSelector, useDispatch (Redux — check if skill is actually Redux)
```

### General Patterns

```
import.*from.*other-domain
see [X] skill (cross-skill references)
use [Tool] for (explicit recommendations)
```

---

## 5. Content Relocation Protocol

When removing valuable content that belongs in another skill:

### Step 1: Identify Target

- Where does this content logically belong?
- Which skill owns this domain?

### Step 2: Check for Duplicates

- Does target skill already have similar content?
- Would this be redundant?

### Step 3: Copy to Target

- Match target's formatting style
- Add as new pattern or enhance existing
- Ensure examples compile conceptually

### Step 4: Document the Move

- Note the source file, the section moved, and its destination

### Step 5: Delete from Source

- Only after copy is verified
- Update any internal references

### Historical Relocations Reference

| Content                       | Source            | Destination              | Rationale                       |
| ----------------------------- | ----------------- | ------------------------ | ------------------------------- |
| cva Alert component variants  | React/examples.md | SCSS Modules/examples.md | cva is a styling utility        |
| Button SCSS with states       | React/examples.md | SCSS Modules/examples.md | Pure SCSS patterns              |
| Hardcoded values anti-pattern | React/examples.md | SCSS Modules/examples.md | Magic numbers = styling concern |
| useDebounce with React Query  | React/examples.md | React Query/examples.md  | Data fetching integration       |

---

## 6. Quality Gate Checklist

**A skill transformation is complete when every box below is checked:**

### Schema Compliance (REQUIRED)

- [ ] `SKILL.md` has frontmatter with `name` and `description`
- [ ] `metadata.yaml` has all required fields (category, slug, domain, author, displayName, cliDescription, usageGuidance) — the loader requires `domain` even though `metadata.schema.json` does not list it among its own required keys
- [ ] Author uses `@` prefix (`@vince`, not `vince`)
- [ ] Category is from the allowed enum (see `src/cli/types/generated/source-types.ts` CATEGORIES) — or the file declares `custom: true`, which routes it to `customMetadataValidationSchema`, where any string category and any kebab-case slug are accepted
- [ ] `npx agents-inc doctor` reports no errors under `Content checks` (its `Marketplaces` and `Skills` rows validate `metadata.yaml` and `SKILL.md`)

### Import Purity

- [ ] No imports from other domains in any code example
- [ ] No codebase-specific imports (@repo/\*)
- [ ] All imports are either from own domain or generic patterns

### Language Purity

- [ ] No tool names from other skills anywhere in text
- [ ] No framework names where architecture categories work
- [ ] No "use X for Y" where X is another domain's tool

### Structure Purity

- [ ] Integration Guide removed; the neighbouring concern named under **Handled elsewhere** as a capability rather than as the tool that provides it
- [ ] All decision trees end within this skill's domain
- [ ] All anti-patterns are domain-specific
- [ ] Pattern titles don't include external tool names

### File Structure

- [ ] `examples/core.md` exists (required in every skill — rename the most fundamental example file if needed)
- [ ] `<red_flags>` section exists in SKILL.md (not just in reference.md)
- [ ] No content duplicated between SKILL.md and example files (SKILL.md has brief snippets + links)
- [ ] No content duplicated between SKILL.md and reference.md (each concept lives in one canonical location)
- [ ] Old technology-named example files renamed into `core.md` + topic files rather than left beside them as stubs
- [ ] No `NEXT_PUBLIC_*`, `VITE_*`, or other framework-specific env var prefixes

### Template Contamination

- [ ] Critical requirements actually relate to this technology (not copy-pasted from another skill)
- [ ] No `runInAction()`, `forwardRef()`, `defineStore()` in skills that don't use those technologies

### Coherence

- [ ] Examples still compile conceptually
- [ ] Patterns are actionable without other skill knowledge
- [ ] Philosophy section coherent after changes
- [ ] Quick Guide focused on this domain only

### Integrity

- [ ] Pattern numbering consistent (no gaps)
- [ ] Cross-references within skill still valid
- [ ] No orphaned references to removed content
- [ ] Valuable content relocated before deletion

### Verification

- [ ] §11's Full Audit Command returns nothing
- [ ] Full read-through confirms no violations missed
- [ ] Schema validation passes (`npx agents-inc doctor` — the `Content checks` layer)

---

## 7. Complexity Tiers

### Tier 0: None (0 violations)

- Skill is already atomic
- No changes needed
- Example: React Query (@vince) - 0 violations

### Tier 1: Simple (1-9 violations)

- Title/library reference fixes only
- No content relocation needed
- Quick genericization of a few terms
- **Time estimate**: 15-30 minutes
- Examples: SCSS Modules (3), Performance (3), Tailwind (@vince) (1)

### Tier 2: Medium (10-20 violations)

- Some example rewrites required
- Possible content relocation
- Integration Guide updates
- Decision tree adjustments
- **Time estimate**: 1-2 hours
- Examples: Zustand (16), MSW (16), Accessibility (15+)

### Tier 3: Complex (20+ violations)

- Major example rewrites
- Content relocation required
- Pattern replacements
- Significant restructuring
- **Time estimate**: 2-4 hours
- Examples: React (43+), Vitest (33+)

---

## 8. Skill File Extraction

Guidelines for splitting large example files into `core.md` plus technology-specific topic files.

### Core vs Extractable Criteria

#### Core Patterns (kept in core.md)

A pattern is **core** if it meets any of these criteria:

| Criterion                | Description                                   | Example                                        |
| ------------------------ | --------------------------------------------- | ---------------------------------------------- |
| **First-time setup**     | Required for initial implementation           | Store configuration, client setup, basic hooks |
| **Primary API**          | The main API users interact with 80%+ of time | `useQuery`, `register()`, `createSlice`        |
| **Essential types**      | TypeScript types needed for basic usage       | Generic type parameters, hook return types     |
| **Fundamental good/bad** | The most common mistake to avoid              | Using `index` as key in field arrays           |
| **Minimum viable**       | Simplest complete working example             | Basic form with validation, simple query       |

**Rule of thumb**: If a developer cannot use the library at all without this pattern, it is core.

#### Extractable Patterns (moved to topic files)

A pattern is **extractable** if it meets all of these criteria:

| Criterion          | Description                            | Example                             |
| ------------------ | -------------------------------------- | ----------------------------------- |
| **Optional**       | Not required for basic usage           | Redux Persist, custom middleware    |
| **Advanced**       | Requires understanding of core first   | Entity adapters, optimistic updates |
| **Situational**    | Only needed in specific use cases      | Multi-step forms, offline support   |
| **Self-contained** | Can be understood without core context | Testing patterns, performance tips  |

**Rule of thumb**: If a developer can ship a working feature without this pattern, it is extractable.

### Decision Framework

```
Is this pattern required to use the library at all?
├─ YES → Keep in core.md
└─ NO → Create a topic-specific file named after the concept
        (e.g., hooks.md, middleware.md, persistence.md)
```

### Size Guidelines

| Metric                  | Guideline                           |
| ----------------------- | ----------------------------------- |
| `core.md` target size   | whatever the patterns need, in full |
| Extraction trigger      | A reader stops finding patterns     |
| Topic file minimum      | 100+ lines of focused content       |
| No extraction needed if | Every pattern is still easy to find |

### File Structure for Extracted Files

#### Header Format

Each topic file starts with:

```markdown
# [Skill Name] - [Topic] Examples

> Extended examples for [topic]. See [core.md](core.md) for core patterns.

**Prerequisites**: Understand [Pattern 1], [Pattern 2] from core examples first.

---
```

#### Pattern Format

Maintain the same format as core examples:

```markdown
## Pattern N: [Title]

### Good Example - [Descriptor]

\`\`\`typescript
// Code with comments
\`\`\`

**Why good:** [Explanation]

### Bad Example - [Anti-pattern]

\`\`\`typescript
// BAD code with comments
\`\`\`

**Why bad:** [Explanation]

---
```

#### Cross-References

Add cross-references to core patterns:

```markdown
> **Note:** This pattern builds on [Pattern 2: Basic Setup](core.md#pattern-2-basic-setup).
```

#### File Naming

Always use kebab-case. Name files after the topic, not a generic category:

```
examples/
├── core.md               # Core (always present)
├── hooks.md              # React hook patterns
├── middleware.md          # Middleware/interceptor patterns
├── persistence.md        # Local storage, IndexedDB patterns
├── performance.md        # Optimization techniques
├── async-patterns.md     # Async/concurrent patterns
└── ...                   # As many as the technology requires
```

#### Pattern Numbering

- Core patterns: Sequential numbering (Pattern 1, 2, 3...)
- Topic file patterns: Continue numbering from core to maintain reference stability

```markdown
# core.md

## Pattern 1: Store Configuration

## Pattern 2: Slice Creation

# async-thunks.md

## Pattern 3: Async Thunks with createAsyncThunk

## Pattern 4: Optimistic Updates
```

### Migration Checklist

When extracting patterns from an existing skill:

- [ ] Identify total line count and pattern count
- [ ] Categorize each pattern using the core vs extractable criteria above
- [ ] Group extractable patterns by their natural topic
- [ ] Name topic files after the concept they cover (not generic categories)
- [ ] Verify the core patterns are still the ones a reader reaches for first
- [ ] Add cross-references between files
- [ ] Update SKILL.md TOC to reference new files
- [ ] Verify all code examples still have context
- [ ] Test that examples can be understood standalone

### When One `core.md` Is Enough

Keep the skill as a single `examples/core.md` when:

- The patterns fit one file without a reader losing their place
- File has fewer than 5 patterns total
- All patterns are interdependent (cannot understand one without others)
- Skill is setup/configuration focused (naturally smaller)

---

## 9. Pitfalls to Avoid

### Pitfall 1: Over-Genericizing Examples

**Bad:**

```typescript
// Apply your styling solution here
// Use your state management here
// Do the thing with your tool
```

**Good:**

```typescript
// Apply styles via className prop
className = { className };

// Pass state via props - source doesn't matter
interface Props {
  data: User[];
  isLoading: boolean;
}
```

**Rule:** Generic comments should still be actionable.

---

### Pitfall 2: Breaking Example Logic

**Bad:**

```typescript
// Removed import, left broken code
const buttonClass = styles.button; // styles is undefined!
```

**Good:**

```typescript
// Rewrite to work without the import
const buttonClass = className; // Passed in via props
```

**Rule:** Examples must compile conceptually after transformation.

---

### Pitfall 3: Losing Actionability

**Bad:**

```markdown
// Before
Use React Query for server data

// After (too generic)
Handle server data appropriately
```

**Good:**

```markdown
// After (still actionable)
Server data should be:

- Cached to avoid redundant fetches
- Invalidated when mutations occur
- Handled with loading/error states

(Use your data fetching solution to achieve this)
```

**Rule:** After removing tool recommendations, remaining guidance must still be useful.

---

### Pitfall 4: Forgetting Companion Files

**Incomplete audit:**

```
✓ SKILL.md - checked
✗ reference.md - forgot to check
✗ examples/*.md - forgot to check
```

**Rule:** Always check every file: `SKILL.md`, `reference.md`, every file in `examples/`, `metadata.yaml`

Violations are often concentrated in the `examples/` files because that's where imports live.

---

### Pitfall 5: Leaving Orphaned References

**Bad:**

```markdown
// Removed Pattern 2 (cva variants)
// But left reference in Pattern 5:
"See Pattern 2 for variant implementation" // Now broken!
```

**Good:**

```markdown
// After removing Pattern 2:
// Update Pattern 5:
"Use data-\* attributes for variant styling" // Self-contained
```

**Rule:** After removing content, search for all references to it.

---

### Pitfall 6: Deleting Valuable Content Without Relocation

**Bad:**

```markdown
// Valuable cva example deleted from React skill
// Now no skill has this example!
```

**Good:**

```markdown
// Step 1: Copy to SCSS Modules skill (cva is styling)
// Step 2: Document the relocation
// Step 3: Then delete from React skill
```

**Rule:** Check if content should move to another skill before deleting.

---

## 10. Troubleshooting Common Issues

### Issue: "But users need to know which tools work together!"

**Symptom:** Resistance to removing Integration Guides

**Solution:** Integration guidance belongs at the stack level, not skill level. Skills teach how to use one tool well. Stacks teach how tools combine.

```markdown
// Skill level - NO tool combinations
// Stack level - YES tool combinations
```

---

### Issue: "My examples don't make sense without the imports"

**Symptom:** Examples seem incomplete after removing imports

**Solution:** Rewrite examples to be conceptually complete:

```typescript
// Before: Depends on external import
import { useQuery } from "@tanstack/react-query";
const { data } = useQuery({ queryKey: ["users"] });

// After: Conceptually complete
// Assume data comes from your data fetching solution
interface Props {
  data: User[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

function UserList({ data, isLoading, error }: Props) {
  // Component logic doesn't care where data comes from
}
```

---

### Issue: "The decision tree doesn't help without tool recommendations"

**Symptom:** Decision trees feel empty after removing tool exits

**Solution:** End trees with domain-appropriate guidance, not tool recommendations:

```markdown
// Before
Is it server data? → Use React Query

// After
Is it server data? → Not this skill's scope. Use your data fetching solution.
This skill handles [X], [Y], [Z] instead.
```

---

### Issue: "Grep finds too many false positives"

**Symptom:** Keywords appear in valid contexts

**Solution:** Use context-aware grep and manual review:

```bash
# Bad - catches valid uses
grep -n "SCSS"

# Better - show context
grep -n -B2 -A2 "SCSS"

# Best - specific patterns
grep -n "import.*scss\|Use SCSS\|with SCSS"
```

Valid uses to keep:

- File extensions in sideEffects: `"*.scss"` (pattern, not prescription)
- Architecture categories: "CSS Modules" (generic term)
- Own domain references: SCSS skill can say "SCSS"

---

### Issue: "Critical requirements don't match the technology"

**Symptom:** Rules like `runInAction()` appear in a Vue i18n skill, or `forwardRef` in an Angular skill

**Solution:** This is template contamination — the original AI-generated skill copied boilerplate from an unrelated skill. Read every critical requirement and ask: "Does this rule apply to this technology?" If not, remove it and replace with a domain-specific rule.

Common contamination sources found in Iteration 1:

- `runInAction()` (MobX) appeared in vue-i18n, tRPC, and Remix skills
- Generic CLAUDE.md rules (named exports, named constants) duplicated into critical requirements instead of being referenced

---

### Issue: "Content appears in multiple files"

**Symptom:** The same code example or decision tree exists in SKILL.md, reference.md, and an example file

**Solution:** Each concept should live in one canonical location:

| Content Type                                   | Canonical Owner                           | Other files get...                         |
| ---------------------------------------------- | ----------------------------------------- | ------------------------------------------ |
| Decision guidance, philosophy, red flags       | SKILL.md                                  | Nothing                                    |
| Full code implementations                      | Example files (`examples/*.md`)           | Brief 3-10 line snippet + link in SKILL.md |
| Quick-lookup tables, checklists, API reference | `reference.md`                            | Cross-reference link                       |
| Anti-patterns with code                        | Either SKILL.md red flags OR reference.md | Not both                                   |

During Iteration 1, ~30 skills had the same content in 2-3 places. The fix: keep it in the canonical owner, replace duplicates with cross-reference links.

---

### Issue: "Content relocation is complex"

**Symptom:** Unsure where content belongs

**Solution:** Follow the domain ownership principle:

| Content Type                | Owner Skill            |
| --------------------------- | ---------------------- |
| Styling patterns (cva, CSS) | Styling skill          |
| Data fetching patterns      | Data fetching skill    |
| State patterns              | State management skill |
| Testing patterns            | Testing skill          |
| Component patterns          | React/Vue/etc. skill   |

If content involves two domains, it probably belongs in neither and should be removed.

---

## 11. Verification Commands

### Full Audit Command

```bash
# Comprehensive violation check for a skill
# Each fragment needs its own -e: grep takes the first non-option operand as the pattern and
# every operand after it as a path, so the nine-string form silently searched for the styling
# fragment alone and reported the other eight as missing files.
grep -rn \
  -e "SCSS\|scss-modules\|module\.scss\|module\.css\|cva\|class-variance-authority" \
  -e "zustand\|Zustand\|react-query\|React Query\|@tanstack\|useQuery\|useMutation" \
  -e "MSW\|msw\|Mock Service Worker" \
  -e "Vitest\|vitest\|Jest\|jest" \
  -e "Hono\|hono\|Drizzle\|drizzle" \
  -e "lucide-react\|lucide\|@repo/\|@/lib/" \
  -e "NEXT_PUBLIC_\|VITE_\|NUXT_\|EXPO_PUBLIC_" \
  -e "runInAction" \
  -e "Next\.js\|Vite\|Remix" \
  src/skills/path/to/skill/
```

### Quick Check Commands

```bash
# Check specific domain violations
grep -rn "import.*from.*scss\|import.*from.*zustand" skill/

# Check Integration Guides
grep -n "Works with\|Integrates with" skill/*.md

# Check tool recommendations
grep -n "Use.*for\|use.*for" skill/*.md

# Check decision trees
grep -n "→.*Use\|-> Use" skill/*.md

# Check pattern titles
grep -n "^##.*with\|^###.*with" skill/*.md
```

### Post-Transformation Verification

```bash
# Should return 0 results
grep -rn "VIOLATION_KEYWORDS" skill/

# Visual review
cat skill/SKILL.md | head -100  # Check Quick Guide
cat skill/examples/*.md | grep "import"  # Check imports
cat skill/reference.md | grep -i "integration"  # Check guides
```

---

## Conclusion

**Key Principles:**

1. **A skill discusses only its own domain**
2. **Integration guidance belongs at stack level, not skill level**
3. **Every cross-domain reference is removed, genericised or relocated**
4. **Examples must compile conceptually after transformation**
5. **Verify with grep and with a read-through** — the grep finds the names, the read finds the framing

**The Payoff:**

- Skills work across different tech stacks
- Maintenance is isolated to one skill at a time
- Users learn one thing well without confusion
- Stacks can evolve tool-by-tool
- New skills compose freely with existing ones

**When in doubt, ask:** "Would this skill work for someone using a different tool for [other domain]?" If no, there's a violation.
