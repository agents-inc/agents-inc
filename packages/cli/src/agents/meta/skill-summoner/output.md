## Output Format

<output_format>
Provide your skill definition in this structure:

<skill_definition>

## Skill: {domain}-{category}-{technology}

### Directory Location

`.claude/skills/{domain}-{category}-{technology}/`

### metadata.yaml

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/agents-inc/cli/main/packages/cli/src/schemas/metadata.schema.json
category: [domain]-[category]
slug: [technology]
domain: [domain]
author: "@[author]"
displayName: [Display Name]
cliDescription: [5-6 words max]
usageGuidance: >-
  [When AI agent should invoke this skill - be specific about triggers]
```

### SKILL.md

````markdown
---
name: [Name]
description: [One-line description]
---

# [Name] Patterns

> **Quick Guide:** [1-2 sentence summary of when/why to use this technology]

---

<critical_requirements>

## ⚠️ CRITICAL: Before Using This Skill

> **All code must follow project conventions in CLAUDE.md** (kebab-case, named exports, import ordering, `import type`, named constants)

**(You MUST [domain-specific critical rule 1 - most important thing to remember])**

**(You MUST [domain-specific critical rule 2 - second most important])**

**(You MUST [domain-specific critical rule 3 - third most important])**

</critical_requirements>

---

**Auto-detection:** [comma-separated keywords that trigger this skill]

**When to use:**

- [Specific scenario 1]
- [Specific scenario 2]
- [Specific scenario 3]

**Key patterns covered:**

- [Core pattern 1]
- [Core pattern 2]
- [Core pattern 3]

---

<philosophy>

## Philosophy

[Why this technology exists, what problems it solves]

**When to use [Technology]:**

- [Use case 1]
- [Use case 2]

**When NOT to use:**

- [Anti-pattern scenario 1]
- [Anti-pattern scenario 2]

</philosophy>

---

<patterns>

## Core Patterns

### Pattern 1: [Name]

[Detailed explanation]

[Use `#### SubsectionName` markdown headers to organize content within patterns as needed. Common subsections include: Constants, Implementation, Usage, Hooks, Configuration - but only include what's relevant for this pattern.]

```[language]
// ✅ Good Example
// Complete, runnable code with explanatory comments
```

**Why good:** [Concise reasoning as comma-separated list - explain the consequence/benefit, not just facts]

```[language]
// ❌ Bad Example - Anti-pattern
// Code showing what NOT to do
```

**Why bad:** [Concise reasoning as comma-separated list - explain what breaks/fails, not just "missing X"]

[OPTIONAL - only include if not obvious from context:]
**When to use:** [Concise scenario - only when the choice isn't self-evident]

**When not to use:** [Concise anti-pattern - only when helpful to clarify boundaries]

---

### Pattern 2: [Name]

[Continue for all major patterns with embedded good/bad examples...]

</patterns>

---

<performance>

## Performance Optimization (OPTIONAL)

[Include only if performance is a significant concern. Cover: optimization patterns, caching strategies, etc.]

</performance>

---

<decision_framework>

## Decision Framework

[Decision tree or flow chart for choosing between approaches]

</decision_framework>

---

<integration>

## Integration Guide (OPTIONAL)

[How this technology integrates with the rest of the stack. Include only when the technology has meaningful interactions with other tools/libraries in your stack.]

**Works with:**

- [Technology X]: [How they integrate]
- [Technology Y]: [How they integrate]

**Replaces / Conflicts with:**

- [Technology Z]: [Why you wouldn't use both]

</integration>

---

<red_flags>

## RED FLAGS

**High Priority Issues:**

- ❌ [Anti-pattern 1 with explanation]
- ❌ [Anti-pattern 2 with explanation]

**Medium Priority Issues:**

- ⚠️ [Warning 1]
- ⚠️ [Warning 2]

**Common Mistakes:**

- [Mistake 1 and how to avoid]
- [Mistake 2 and how to avoid]

**Gotchas & Edge Cases:**

- [Quirk or surprising behavior 1 - not necessarily wrong, just tricky]
- [Edge case 2 that might trip people up]

</red_flags>

---

<critical_reminders>

## ⚠️ CRITICAL REMINDERS

> **All code must follow project conventions in CLAUDE.md** (kebab-case, named exports, import ordering, `import type`, named constants)

**(You MUST [domain-specific critical rule 1 - repeat from top])**

**(You MUST [domain-specific critical rule 2 - repeat from top])**

**(You MUST [domain-specific critical rule 3 - repeat from top])**

**Failure to follow these rules will [consequence - e.g., break functionality].**

</critical_reminders>
````

### reference.md (optional)

```markdown
# [Name] Quick Reference

[Condensed reference for quick lookups]
```

### examples/ (optional)

[List any example files needed]
</skill_definition>

<research_sources>

## Sources Used

| Source              | URL/Location  | What Was Used             |
| ------------------- | ------------- | ------------------------- |
| Official docs       | [url]         | [specific section]        |
| Codebase pattern    | [/path:lines] | [what pattern]            |
| Best practice guide | [url]         | [specific recommendation] |

</research_sources>

<skill_relationships>

## Relationship Analysis

**Requires (hard dependencies):**

- [skill-id] - [why required]

**Compatible with (works well together):**

- [skill-id] - [why compatible]

**Conflicts with (mutually exclusive):**

- [skill-id] - [why conflicts]

**Category:** [category]
</skill_relationships>

<validation>
## Skill Quality Checks

- [ ] Skill directory follows 3-part naming: `{domain}-{category}-{technology}`
- [ ] SKILL.md exists with complete structure
- [ ] metadata.yaml exists with required fields
- [ ] All code examples are syntactically correct
- [ ] Examples follow the patterns described (no contradictions)
- [ ] Usage guidance is specific (not vague "use when needed")
- [ ] SKILL.md has TOC if > 100 lines
- [ ] No overlap with existing skills (checked against: [list])
- [ ] slug field matches the technology portion of the directory name
- [ ] domain field matches the domain portion of the directory name
      </validation>
      </output_format>

## Example: Complete Skill Package

### Directory Structure

```
.claude/skills/web-state-mobx/
├── SKILL.md
├── metadata.yaml
└── examples/async-actions.md (optional)
```

### metadata.yaml

```yaml
category: web-client-state
slug: mobx
domain: web
author: "@skill-summoner"
displayName: MobX State
cliDescription: Observable state management patterns
usageGuidance: >-
  Use when implementing client-side state with MobX observables,
  computed values, or reactions. Not for server state (use React Query).
```

### SKILL.md (condensed)

```markdown
# MobX State Management Patterns

> **Quick Guide:** Use MobX for complex client state needing computed values and automatic dependency tracking.

<critical_requirements>

## ⚠️ CRITICAL: Before Using This Skill

> **All code must follow project conventions in CLAUDE.md**

**(You MUST call `makeAutoObservable(this)` in EVERY store constructor)**
**(You MUST wrap ALL async state updates in `runInAction()`)**
**(You MUST use React Query for server state - NOT MobX)**
</critical_requirements>

<philosophy>
## Philosophy
MobX: "anything that can be derived, should be derived automatically."
**When to use:** Complex client state, computed values, class-based architecture
**When NOT to use:** Server state (React Query), simple UI state (useState/Zustand)
</philosophy>

<patterns>
## Core Patterns

### Pattern 1: Store with makeAutoObservable

​`typescript
// ✅ Good Example
const ACTIVE_STATUS = "active";
class UserStore {
  users: User[] = [];
  constructor() { makeAutoObservable(this); }
  get activeUsers() { return this.users.filter((u) => u.status === ACTIVE_STATUS); }
}
export { UserStore };
​`
**Why good:** makeAutoObservable enables tracking, named constants, named exports

​`typescript
// ❌ Bad Example
class UserStore {
  users = [];
  async fetchUsers() {
    const response = await apiClient.getUsers();
    this.users = response.data; // BAD: Outside action after await
  }
}
export default UserStore; // BAD: Default export
​`
**Why bad:** State mutation after await breaks reactivity, default export violates conventions
</patterns>

<red_flags>

## RED FLAGS

- ❌ Mutating observables outside actions (breaks reactivity)
- ❌ Using MobX for server state (use React Query)
- ⚠️ Not using `observer()` HOC on React components
  **Gotchas:** Code after `await` is NOT part of the action - wrap in `runInAction()`
  </red_flags>

<critical_reminders>

## ⚠️ CRITICAL REMINDERS

**(You MUST call `makeAutoObservable(this)` in EVERY store constructor)**
**(You MUST wrap ALL async state updates in `runInAction()`)**
**(You MUST use React Query for server state - NOT MobX)**
**Failure to follow these rules will break MobX reactivity.**
</critical_reminders>
```

---

## Common Mistakes

| Mistake            | Wrong                         | Correct                               |
| ------------------ | ----------------------------- | ------------------------------------- |
| Directory location | `src/skills/mobx.md`          | `.claude/skills/web-state-mobx/`      |
| Naming pattern     | `mobx`, `state-mobx`          | `web-client-state-mobx`               |
| Metadata fields    | `cli_name`, `version`, `tags` | `displayName`, `slug`, `domain`       |
| File structure     | Single file                   | Directory + SKILL.md + metadata.yaml  |
| Auto-detection     | "state management"            | "MobX observable, makeAutoObservable" |
| Examples           | Separate section              | Embedded in each pattern              |
