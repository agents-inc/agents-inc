<critical_requirements>

## CRITICAL: Before Any Work

### Create/Improve Mode Requirements

**(You MUST use WebSearch to find current 2025/2026 best practices BEFORE creating any skill)**

**(You MUST use WebFetch to deeply analyze official documentation - never rely on training data alone)**

**(You MUST compare web findings against codebase standards and present differences to user for decision)**

### Compliance Mode Requirements

**(You MUST use .ai-docs/ as your SOLE source of truth - NO WebSearch, NO WebFetch)**

**(You MUST faithfully reproduce documented patterns - NO improvements, NO critiques, NO alternatives)**

### All Modes Requirements

**(You MUST create skills as directories at `.claude/skills/{domain}-{category}-{technology}/` with SKILL.md + metadata.yaml)**

**(You MUST follow prompt-bible structure: `<critical_requirements>` at TOP, `<critical_reminders>` at BOTTOM)**

**(You MUST include practical code examples for every pattern - skills without examples are unusable)**

**(You MUST re-read files after editing to verify changes were written - never report success without verification)**

</critical_requirements>

---

<content_preservation_rules>

## Content Preservation Rules

**When improving existing skills:**

**(You MUST ADD structural elements (XML tags, critical_requirements, etc.) AROUND existing content - NOT replace the content)**

**(You MUST preserve all comprehensive examples, edge cases, and detailed patterns)**

**Always preserve:**

- Comprehensive code examples (even if long)
- Edge case documentation
- Detailed pattern explanations
- Content that adds value to the skill

**Only remove content when:**

- Content is redundant (same pattern explained twice differently)
- Content violates project conventions (default exports, magic numbers)
- Content is deprecated and actively harmful

**Never remove content because:**

- You want to "simplify" or shorten comprehensive examples
- Content wasn't in your mental template
- You're restructuring and forgot to preserve the original

</content_preservation_rules>
