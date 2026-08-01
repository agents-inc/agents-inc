# Skill Consume Command UX Research

> Research findings for a `agents-inc consume` command that merges external skills into existing local skills.

---

## Executive Summary

The `agents-inc consume` command enables users to "absorb" knowledge from external skills (third-party repos, community skills) into their own local skills. Unlike `agents-inc import` which copies skills wholesale, `consume` intelligently merges content to create enhanced, comprehensive local skills.

**Key insight:** This is closer to knowledge synthesis than file merging - we're combining expertise, not just concatenating files.

---

## 1. Mental Models Explored

### Model A: Git Merge (Rejected)

**Concept:** Line-by-line merge with conflict markers

```diff
Pattern 1: Basic Setup
```

**Pros:**

- Familiar to developers
- Deterministic, traceable

**Cons:**

- Skills are prose/knowledge, not code - line conflicts make no sense
- Merging "Pattern 1: X" with "Pattern 1: Y" shouldn't create a conflict
- Would require manual resolution for almost every merge

**Verdict:** Inappropriate for knowledge files. Skills aren't source code.

---

### Model B: Append/Concatenate (Partial Fit)

**Concept:** Simply append external patterns to local skill

```
Local SKILL.md:
  - Pattern 1: Basic Setup
  - Pattern 2: Hooks

After consume:
  - Pattern 1: Basic Setup
  - Pattern 2: Hooks
  - Pattern 3: Performance (from external)
  - Pattern 4: Testing (from external)
```

**Pros:**

- Simple, predictable
- No data loss
- Easy to implement

**Cons:**

- Creates duplicates when patterns overlap
- Doesn't handle conflicting advice
- No intelligent synthesis

**Verdict:** Good fallback mode (`--append`), but not the default.

---

### Model C: AI-Assisted Synthesis (Recommended)

**Concept:** Use AI to intelligently merge skills, identifying:

- Complementary patterns (add them)
- Overlapping patterns (synthesize best of both)
- Conflicting patterns (prefer local, flag external as alternative)
- Redundant content (deduplicate)

**Pros:**

- Produces truly comprehensive skills
- Handles semantic overlap intelligently
- Can improve existing patterns with new insights

**Cons:**

- Requires AI call (cost, latency)
- Less predictable output
- Needs review step

**Verdict:** Best default experience, with preview before applying.

---

### Model D: Section-Based Merge (Hybrid)

**Concept:** Parse skills by section (Philosophy, Patterns, Examples, Anti-patterns) and merge by section type.

```yaml
consume_strategy:
  philosophy: prefer_local # Keep local philosophy
  patterns: merge_all # Combine all unique patterns
  examples: merge_unique # Add non-duplicate examples
  anti_patterns: merge_all # More anti-patterns = better
  critical_requirements: union # All requirements preserved
```

**Pros:**

- Structured, predictable
- Respects skill anatomy
- Fast (no AI needed)

**Cons:**

- Can't detect semantic duplicates within sections
- May still need manual cleanup

**Verdict:** Good middle-ground option (`--structured`).

---

## 2. Recommended Approach

### Primary: AI-Assisted Synthesis with Preview

```bash
# Default: AI synthesis with preview
agents-inc consume vercel-labs/react-best-practices --into web-framework-react
```

**Flow:**

1. Fetch external skill
2. AI analyzes both skills
3. Generate merged skill (in temp location)
4. Show diff preview
5. User confirms or edits
6. Apply merge

### Secondary: Structured Merge

```bash
# Faster, deterministic, no AI
agents-inc consume vercel-labs/react-best-practices --into web-framework-react --structured
```

### Fallback: Simple Append

```bash
# Just append, no deduplication
agents-inc consume vercel-labs/react-best-practices --into web-framework-react --append
```

---

## 3. Command Design

### Syntax Options

**Option A: Source-first (like git pull)**

```bash
agents-inc consume <external-skill> --into <local-skill>
agents-inc consume github:vercel-labs/agent-skills/react-best-practices --into web-framework-react
```

**Option B: Target-first (like import)**

```bash
agents-inc consume <local-skill> --from <external-skill>
agents-inc consume web-framework-react --from github:vercel-labs/agent-skills/react-best-practices
```

**Option C: Interactive (no args)**

```bash
agents-inc consume
# Prompts: Which local skill? Which external source? Which patterns?
```

**Recommendation:** Option A (source-first) matches `git merge <branch>` mental model, and `--into` is explicit.

### Full Command Spec

```bash
agents-inc consume <source> --into <local-skill> [options]

Arguments:
  source                External skill source (GitHub URL, repo:path, or skill ID)

Options:
  --into, -i <skill>    Target local skill to enhance (required)
  --preview             Show preview only, don't apply (default: true)
  --apply               Skip preview, apply immediately
  --structured          Use section-based merge (no AI)
  --append              Simply append without merging
  --sections <list>     Only consume specific sections (comma-separated)
  --dry-run             Show what would happen without fetching
  --force               Overwrite without confirmation
```

### Source Formats (Reuse from `import skill`)

```bash
# Full GitHub URL
agents-inc consume https://github.com/vercel-labs/agent-skills --skill react-best-practices --into web-framework-react

# Short GitHub format
agents-inc consume github:vercel-labs/agent-skills --skill react-best-practices --into web-framework-react

# Direct skill path
agents-inc consume gh:vercel-labs/agent-skills/skills/react-best-practices --into web-framework-react

# Local path (for testing)
agents-inc consume /path/to/skill-folder --into web-framework-react
```

---

## 4. UX Flow Mockups

### Flow A: Default (AI-Assisted with Preview)

```
$ agents-inc consume github:vercel-labs/agent-skills --skill react-best-practices --into web-framework-react

Consume External Skill

Source: https://github.com/vercel-labs/agent-skills
Skill:  react-best-practices
Target: .claude/skills/web-framework-react/

Fetching external skill...
Analyzing skills for merge...

┌─────────────────────────────────────────────────────────────────────┐
│  Merge Analysis                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📊 Summary:                                                        │
│    - 11 patterns in local skill                                     │
│    - 57 rules in external skill                                     │
│                                                                     │
│  ✅ Complementary (will add):                                       │
│    - Pattern 12: Eliminating Request Waterfalls (async-parallel)    │
│    - Pattern 13: Bundle Size Optimization (bundle-barrel-imports)   │
│    - Pattern 14: Server-Side Performance (server-cache-react)       │
│    ... +32 more patterns                                            │
│                                                                     │
│  🔄 Overlapping (will synthesize):                                  │
│    - Pattern 4: Event Handler Naming → merged with js-event-refs    │
│    - Pattern 5: Custom Hooks → enhanced with rerender-* rules       │
│                                                                     │
│  ⚠️  Potentially Conflicting:                                       │
│    - Local prefers useActionState, external suggests useTransition  │
│      → Keeping both as alternatives                                 │
│                                                                     │
│  📝 Result: 43 patterns (was 11)                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Preview merged skill? [Y/n/edit] _
```

### Flow B: Structured Merge (No AI)

```
$ agents-inc consume github:vercel-labs/agent-skills --skill react-best-practices --into web-framework-react --structured

Consume External Skill (Structured Mode)

Source: https://github.com/vercel-labs/agent-skills
Skill:  react-best-practices
Target: .claude/skills/web-framework-react/

Fetching external skill...
Parsing skill sections...

┌─────────────────────────────────────────────────────────────────────┐
│  Section-by-Section Merge Plan                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  <philosophy>                                                       │
│    ✓ Keep local (1 block)                                           │
│                                                                     │
│  <critical_requirements>                                            │
│    + Add 3 new requirements from external                           │
│                                                                     │
│  <patterns>                                                         │
│    ✓ Keep local patterns 1-11                                       │
│    + Add 35 new patterns (renumbered 12-46)                         │
│                                                                     │
│  <integration>                                                      │
│    ✓ Keep local (already comprehensive)                             │
│                                                                     │
│  <critical_reminders>                                               │
│    + Add 2 new reminders from external                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Apply merge? [y/N/preview] _
```

### Flow C: Interactive Mode

```
$ agents-inc consume

Consume External Skill

Which local skill do you want to enhance?

  ❯ ● web-framework-react          React component patterns
    ○ web-state-zustand            State management with Zustand
    ○ api-database-drizzle         Drizzle ORM patterns
    ○ web-testing-vitest           Testing with Vitest

↑/↓ navigate  ENTER select  ESC cancel

---

Enter external skill source:
> github:vercel-labs/agent-skills

Available skills in vercel-labs/agent-skills:
  ❯ ● react-best-practices         React/Next.js performance optimization
    ○ nextjs-caching               Next.js caching strategies
    ○ typescript-patterns          TypeScript best practices

↑/↓ navigate  ENTER select  ESC cancel

---

How would you like to merge?

  ❯ ● AI-assisted synthesis         Intelligent merge with preview
    ○ Structured merge             Section-by-section (faster)
    ○ Simple append                Just add to end (safest)

↑/↓ navigate  ENTER select  ESC cancel
```

---

## 5. Handling Conflicts and Overlap

### Conflict Types

| Type                               | Example                                                              | Resolution Strategy                                   |
| ---------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| **Same pattern, different advice** | Local: "Always use useActionState", External: "Prefer useTransition" | Keep both as alternatives with context                |
| **Overlapping patterns**           | Both have "Error Handling" section                                   | Synthesize into one comprehensive pattern             |
| **Contradicting requirements**     | Local: "No default exports", External: "Use default exports"         | Prefer local, note external as "alternative approach" |
| **Duplicate examples**             | Same code pattern in both                                            | Deduplicate, keep the more complete version           |

### Resolution Strategies

#### AI-Assisted (Default)

- AI identifies semantic overlap
- Synthesizes complementary content
- Flags contradictions for user review
- Generates unified, coherent output

#### Structured (--structured)

- Section-by-section merge
- Local always wins for conflicts
- External appended where no overlap
- No semantic understanding

#### Append (--append)

- No conflict resolution
- Simply concatenates
- User handles cleanup manually

---

## 6. Metadata Tracking

### Proposal: `consumed_from` Field

```yaml
# .claude/skills/web-framework-react/metadata.yaml

category: framework
category_exclusive: true
author: "@vince"
version: 3

# Existing: tracks where skill was originally forked from
forked_from:
  skill_id: web-framework-react
  content_hash: 484296c
  date: 2026-02-03

# NEW: tracks all consumed sources
consumed_from:
  - source: https://github.com/vercel-labs/agent-skills
    skill_name: react-best-practices
    content_hash: 61860fd
    date: 2026-02-04
    mode: ai-synthesis # or "structured" or "append"
    patterns_added: 35
    patterns_synthesized: 2

  - source: https://github.com/kentcdodds/react-patterns
    skill_name: advanced-hooks
    content_hash: abc123
    date: 2026-02-05
    mode: append
    patterns_added: 8
```

### Benefits

1. **Provenance tracking** - Know where knowledge came from
2. **Update detection** - Can check if consumed sources have updates
3. **Attribution** - Credit original authors
4. **Conflict resolution** - If same source consumed twice, can diff

### Commands Leveraging This

```bash
# Check if consumed sources have updates
agents-inc consume --check-updates

# Re-consume with updates
agents-inc consume --update-all

# Show consumption history
agents-inc info web-framework-react --consumed
```

---

## 7. Similar Patterns in Other Tools

### Git Merge/Rebase

- **Similarity:** Combining changes from different sources
- **Difference:** Git works on lines, skills work on knowledge
- **Learning:** Preview (diff) before applying is essential

### Obsidian Note Merging

- **Similarity:** Combining knowledge documents
- **Difference:** Obsidian links notes, doesn't merge content
- **Learning:** Linked references work well for attribution

### Wikipedia Merge

- **Similarity:** Merging overlapping encyclopedia articles
- **Difference:** Human editors, not automated
- **Learning:** Keep "main" article identity, merge sections

### Documentation Aggregation (Docusaurus, GitBook)

- **Similarity:** Pulling docs from multiple sources
- **Difference:** Usually just includes, doesn't merge
- **Learning:** Version/source tracking is critical

### AI Knowledge Distillation (Emerging)

- **Similarity:** Using AI to synthesize knowledge
- **Difference:** Typically for training, not user-facing docs
- **Learning:** Quality depends on AI prompt engineering

---

## 8. Implementation Considerations

### Skill Parsing

Skills have consistent structure that can be parsed:

```markdown
---
name: skill-id
description: Brief description
---

# Title

<critical_requirements>

## CRITICAL: ...

</critical_requirements>

<philosophy>
## Philosophy
...
</philosophy>

<patterns>
## Core Patterns
### Pattern 1: Name
...
</patterns>

<integration>
## Integration Guide
...
</integration>

<critical_reminders>

## CRITICAL REMINDERS

...
</critical_reminders>
```

**Parser approach:**

1. Extract frontmatter (YAML)
2. Split by custom tags (`<philosophy>`, `<patterns>`, etc.)
3. Parse patterns by `### Pattern N:` headers

### AI Prompt Strategy

```markdown
You are merging two skill documents for Claude AI agents.

LOCAL SKILL (keep identity, primary authority):
{local_skill_content}

EXTERNAL SKILL (source to consume):
{external_skill_content}

Instructions:

1. Identify complementary patterns in EXTERNAL not in LOCAL → Add as new patterns
2. Identify overlapping patterns → Synthesize best of both
3. Identify conflicting advice → Keep LOCAL approach, note EXTERNAL as alternative
4. Preserve LOCAL's philosophy, structure, and voice
5. Renumber patterns sequentially
6. Output as valid markdown matching LOCAL's format

Output the merged skill document.
```

### File Operations

```
Before consume:
.claude/skills/web-framework-react/
├── SKILL.md
├── metadata.yaml
└── examples/
    └── core.md

After consume:
.claude/skills/web-framework-react/
├── SKILL.md              # Merged content
├── SKILL.md.backup       # Pre-merge backup
├── metadata.yaml         # Updated with consumed_from
└── examples/
    └── core.md           # May also be merged
```

---

## 9. Edge Cases

### Case 1: No Overlap

External skill is entirely complementary (different technology/patterns).

**Resolution:** Append all patterns, warn user that skills may not integrate well.

### Case 2: Complete Overlap

External skill covers same ground as local with different examples.

**Resolution:** AI synthesizes, or structured mode skips (already covered).

### Case 3: External Has Better Content

User realizes external skill is superior overall.

**Resolution:** Offer `--replace` flag to replace rather than merge.

### Case 4: Large External Skill

External has 100+ patterns, would bloat local skill.

**Resolution:** Offer `--sections` to pick specific sections, or `--max-patterns` limit.

### Case 5: Incompatible Structures

External skill doesn't follow standard skill structure.

**Resolution:** Fall back to append mode with warning, or fail with helpful error.

---

## 10. Recommended MVP

### Phase 1: Basic Consume

- `agents-inc consume <source> --into <skill> --append`
- Simple append mode only
- Basic metadata tracking (`consumed_from`)
- Preview before apply

### Phase 2: Structured Merge

- Section-based parsing
- `--structured` flag
- Per-section merge strategies

### Phase 3: AI-Assisted

- AI synthesis as default
- Conflict detection and resolution
- Sophisticated preview with explanations

---

## 11. Open Questions for User Feedback

1. **Should consume modify examples/ files too?** Or just SKILL.md?

2. **What's the right default?** AI-synthesis (best output) vs append (safest)?

3. **Should there be a `agents-inc unconsume` command?** To revert a consume using backup?

4. **Version compatibility?** What if external skill targets different React version?

5. **Licensing concerns?** Should we check external skill licenses before consuming?

---

## Appendix A: Command Examples

```bash
# Basic consume with preview
agents-inc consume github:vercel-labs/agent-skills --skill react-best-practices --into web-framework-react

# Consume and apply immediately
agents-inc consume github:vercel-labs/agent-skills --skill react-best-practices --into web-framework-react --apply

# Structured merge (no AI)
agents-inc consume github:vercel-labs/agent-skills --skill react-best-practices --into web-framework-react --structured

# Only consume certain sections
agents-inc consume github:vercel-labs/agent-skills --skill react-best-practices --into web-framework-react --sections patterns,examples

# Append mode (safest)
agents-inc consume github:vercel-labs/agent-skills --skill react-best-practices --into web-framework-react --append

# Dry run (don't fetch, just show plan)
agents-inc consume github:vercel-labs/agent-skills --skill react-best-practices --into web-framework-react --dry-run

# Interactive mode
agents-inc consume

# Check for updates to consumed sources
agents-inc consume --check-updates

# Re-consume updated sources
agents-inc consume --update
```

## Appendix B: Metadata Schema Addition

```yaml
# Addition to metadata.yaml schema
consumed_from:
  type: array
  items:
    type: object
    required: [source, skill_name, content_hash, date]
    properties:
      source:
        type: string
        description: URL or path to source repository
      skill_name:
        type: string
        description: Name of consumed skill
      content_hash:
        type: string
        description: Hash of consumed skill at time of consumption
      date:
        type: string
        format: date
        description: Date of consumption
      mode:
        type: string
        enum: [ai-synthesis, structured, append]
        description: Merge strategy used
      patterns_added:
        type: integer
        description: Number of new patterns added
      patterns_synthesized:
        type: integer
        description: Number of patterns merged/enhanced
```

---

_Research completed: 2026-02-04_
_Author: api-researcher agent_
