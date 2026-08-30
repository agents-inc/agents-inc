---
last_validated: 2026-04-21
---

# The Definitive Guide to Optimal Prompt Structure for Claude

**Version:** 2.1
**Date:** April 2026
**Target Model:** Claude Sonnet 4.6 / Opus 4.7 (1M)

**Purpose:** This document provides universal prompt engineering techniques that work for any Claude agent system. These techniques are validated by Anthropic research, production systems achieving 72.7%+ on SWE-bench, academic research, and community consensus.

> **Note:** This document covers universal prompt engineering techniques that work for any Claude agent system.

---

## Performance Metrics at a Glance

| Technique                   | Impact                                    | Evidence Source                   |
| --------------------------- | ----------------------------------------- | --------------------------------- |
| Self-reminder loop          | 60-70% ↓ off-task behavior                | Anthropic (30+ hour sessions)     |
| Investigation-first         | 80%+ ↓ hallucination                      | Aider, SWE-agent, Community       |
| Emphatic repetition         | 70%+ ↓ scope creep                        | Aider production data             |
| XML tags                    | 30%+ ↑ accuracy, 60% ↓ format errors      | Anthropic training data           |
| Documents first, query last | 30% ↑ performance                         | Anthropic research (75K tokens)   |
| Expansion modifiers         | Full Sonnet 4.6 capability on broad tasks | Conditional — Claude 4.6 defaults |
| Self-correction triggers    | 74.4% SWE-bench with mid-run guidance     | Refact.ai production              |
| Post-action reflection      | Improved long-horizon reasoning           | Anthropic context engineering     |
| Progress tracking           | 30+ hour session focus                    | Anthropic experiments             |
| Positive framing            | Better instruction adherence              | Opus 4.5 docs                     |
| "Think" alternatives        | Prevents Opus 4.5 confusion               | Anthropic Claude 4 docs           |
| Just-in-time loading        | Preserves context window                  | SWE-agent, Aider                  |
| Write verification          | Prevents false-success reports            | All agents (production use)       |

---

## Table of Contents

1. [The Essential Techniques](#1-the-essential-techniques)
2. [Optimal Prompt Structure & Ordering](#2-optimal-prompt-structure--ordering)
3. [XML Tag Standards](#3-xml-tag-standards)
4. [Sonnet 4.5 Specific Optimizations](#4-sonnet-45-specific-optimizations)
5. [Production Validation Checklist](#5-production-validation-checklist)
6. [Examples: Before vs After](#6-examples-before-vs-after)
7. [Troubleshooting Common Issues](#7-troubleshooting-common-issues)
8. [Multi-Agent Delegation (Project-Specific)](#8-multi-agent-delegation-project-specific)

---

## 1. The Essential Techniques

These techniques are validated by Anthropic research, production systems (Aider: 72.7% SWE-bench, Augment: 65.4% SWE-bench Verified, Refact.ai: 74.4% SWE-bench Verified, Mini-SWE: 65%+), and community consensus as of November 2025.

### Technique #1: Self-Reminder Loop (60-70% Reduction in Off-Task Behavior)

**The Pattern:**

```markdown
<core_principles>
Principle 1: Investigation First
Principle 2: Follow Existing Patterns
Principle 3: Minimal Changes Only
Principle 4: Test Before Complete
Principle 5: Verify Everything

**Display all 5 principles at the start of EVERY response**
</core_principles>

[Rest of prompt]

**DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE TO MAINTAIN INSTRUCTION CONTINUITY.**

**ALWAYS RE-READ FILES AFTER EDITING TO VERIFY CHANGES WERE WRITTEN. NEVER REPORT SUCCESS WITHOUT VERIFICATION.**
```

**Why It Works:**

- Creates self-reinforcing loop: The meta-instruction to display all principles is itself displayed
- Keeps all 5 core principles in recent context throughout conversation
- The instruction to display principles appears at start and end of prompt
- Prevents instruction drift in long sessions

**Impact & Evidence:**

- **60-70% reduction in off-task behavior**
- Anthropic confirms "Sonnet 4.5 maintains focus for 30+ hours" with proper reminders
- All production long-running agents use variants of this pattern
- Community reports: "Most reliable method to prevent instruction drift"

**Application:**
Create 3-5 core principles for each agent, followed by a meta-instruction: "Display all X principles at the start of EVERY response". Close with a final reminder that reinforces both the principle display AND file verification. This creates unbreakable continuity even in 30+ hour sessions.

---

### Technique #2: Investigation-First Protocol (80%+ Reduction in Hallucination)

**The Pattern:**

```markdown
<investigation_requirement>
**CRITICAL: Never speculate about code you have not opened.**

Before making any claims or implementing anything:

1. **List the files you need to examine**
2. **Read each file completely**
3. **Base analysis strictly on what you find**
4. **If uncertain, ask**

If you don't have access to necessary files:

- Explicitly state what files you need
- Ask for them to be added
- Do not proceed without proper investigation

**This prevents 80%+ of hallucination issues in coding agents.**
</investigation_requirement>
```

**Why It Works:**

- Forces evidence-based responses, prevents hallucinated patterns
- Requires systematic examination before claims
- Eliminates speculation about code structure
- Creates accountability for file reading

**Impact & Evidence:**

- **80%+ reduction in hallucination issues**
- Aider, SWE-agent, Cursor: All require file reading before action
- Anthropic guidance: "Always ground responses in provided context"
- Community: "Single most important anti-hallucination technique"

**Application:**
Always include investigation requirements BEFORE task-specific instructions. This forces the habit of reading first, implementing second.

---

### Technique #3: Emphatic Repetition for Critical Rules (70%+ Reduction in Scope Creep)

**The Pattern:**

```markdown
<critical_requirements>

## CRITICAL: Before Any Work

**(You MUST use existing utilities instead of creating new abstractions)**
**(You MUST make minimal necessary changes only)**
**(You MUST NOT change anything not explicitly mentioned in the task)**
</critical_requirements>

[Body of prompt]

<critical_reminders>

## CRITICAL REMINDERS

**(You MUST use existing utilities)** - never create new ones when they exist
**(You MUST make minimal changes only)** - surgical implementation
**(You MUST NOT change anything not explicitly mentioned in the specification)**

**Failure to follow these rules will produce over-engineered, inconsistent code.**
</critical_reminders>
```

**Formatting that Works:**

- **Bold** for emphasis
- **(Bold + parentheses)** for ultra-critical rules using "You MUST" format
- ALL CAPS for section headers only
- `code` for file names, commands, and XML tags (e.g., `identity.md`, `npm run build`, `<role>`)
- Repeat critical rules at start AND end using `<critical_requirements>` and `<critical_reminders>` tags

**Why It Works:**

- Sonnet 4.5 responds strongly to emphasis
- Creates cognitive anchor at start and reinforcement at end
- Double emphasis for most critical constraints
- Final reminder appears right before response generation

**Impact & Evidence:**

- **70%+ reduction in scope creep**
- **40-50% increase in compliance** with repetition
- Aider uses "ONLY EVER RETURN CODE IN A _SEARCH/REPLACE BLOCK_!" successfully with asterisks
- SWE-agent: Multiple exclamation marks for critical rules
- Community reports 80%+ reduction in format violations

**Application:**
Identify the single most important rule for each agent type (e.g., "Never modify auth files", "Always write tests first", "Follow existing patterns") and apply emphatic repetition at start and end using the `**(You MUST ...)** ` format.

---

### Technique #4: XML Tags for Semantic Boundaries (30%+ Accuracy Improvement)

**The Pattern:**

```xml
<role>
You are an expert TypeScript developer.
</role>

<context>
This codebase uses MobX for state management.
</context>

<task>
Implement user profile editing feature.
</task>

<constraints>
- Do not modify authentication system
- Use existing form components
</constraints>

<examples>
<example>
Similar pattern from SettingsForm.tsx:
[code]
</example>
</examples>

<output_format>
<implementation>...</implementation>
<tests>...</tests>
</output_format>
```

**Why It Works:**

- Anthropic trained Claude specifically to recognize XML
- Creates semantic boundaries preventing instruction mixing
- Tags act as cognitive separators between sections
- Enables structured parsing by the model

**Impact & Evidence:**

- **30%+ accuracy improvement** over plain text for complex tasks
- **60% reduction in format errors** according to production systems
- Anthropic documentation: "Claude was trained with XML tags in its training data"
- All state-of-the-art systems (Aider, SWE-agent, Cursor) use XML extensively
- Community developers report consistent improvements

**Best Practices:**

- Use semantic tag names: `<thinking>`, `<investigation>`, `<output>` rather than generic `<section1>`
- Keep nesting ≤3 levels deep for best results
- Choose names that clearly convey meaning
- No canonical "best" set—adapt to your needs

**Application:**
Wrap all major sections in semantic XML tags. Use nested tags for hierarchical content but avoid deep nesting (>3 levels).

---

### Technique #5: Documents First, Query Last (30% Performance Boost)

**The Pattern:**

```markdown
<documents>
<document index="1">
<source>filename.py</source>
<document_content>
[Full file content - place at TOP]
</document_content>
</document>
</documents>

<context>
[Background information, patterns, conventions]
</context>

<instructions>
[Task requirements, methodology]
</instructions>

<query>
[Specific question or action request - place at END]
</query>
```

**Why It Works:**

- Attention mechanisms process information sequentially
- Early context has stronger retention throughout response generation
- Allows Claude to fully internalize context before applying instructions
- Prevents juggling task requirements while processing content

**When to Use:**

- Prompts with 20K+ tokens
- Multiple documents to reference
- Long-context analysis tasks
- When comprehensive context is essential

**Impact & Evidence:**

- **Up to 30% improvement** on long-context tasks
- Anthropic internal research: Tested on 75K-90K token government documents
- Achieved **90% accuracy** with query-last vs significantly lower with query-first
- "Works for ALL Claude models from legacy to Claude 4" - Anthropic docs
- SWE-agent, Augment: Both structure prompts this way

**Application:**
For prompts with substantial context (20K+ tokens), always place documents/files first, instructions in the middle, and the specific query/request at the very end. This contradicts intuition but delivers measurable improvements.

---

### Technique #6: Conditional Expansion Modifiers for Sonnet 4.5

**The Pattern:**

```markdown
<task>
Create an analytics dashboard.

**This task is genuinely broad — cover the metrics, filters and drill-downs it actually calls for.
Be thorough on what the task needs and silent on the rest; the work's size follows the task's size, not the template's.**
</task>
```

**When to Use:**

- Genuinely broad tasks, where the model demonstrably under-delivers against the brief
- Tasks whose scope a literal reading would narrow (a "dashboard" returned as a single chart)
- NOT every task description — on an already-scoped task the modifier is an instruction to exceed the scope

**Why It Works:**

- Sonnet 4.5 is trained for precise instruction following
- On a broad task it otherwise delivers the narrowest reading that technically complies
- Claude 4.x is **more conservative than 3.5** despite higher capability
- Naming the breadth the task actually has grants permission without asking for volume

**The Conditional Rule:**
Apply an expansion modifier where the model demonstrably under-delivers, and nowhere else. Sonnet 4.5's literal instruction following cuts both ways: a broad task read narrowly is a real failure mode, and a narrow task carrying a volume modifier is an instruction to over-deliver that will be obeyed just as precisely. The modifier calibrates the deliverable to the task — it is not an ingredient every prompt needs.

**Additional Patterns for 4.5:**

**Explicit Permission:**

```markdown
Feel free to refactor architecture if needed to achieve the goal.
You have permission to make substantial changes within [scope].
```

**Extended Thinking for Complex Tasks:**

```markdown
Before answering, consider step-by-step inside <thinking> tags about:

1. What assumptions am I making?
2. What are potential failure modes?
3. What's the optimal approach?

Then provide your answer in <output> tags.
```

**Impact & Evidence:**

- Recovers full Sonnet 4.5 capability on broad tasks
- Counters conservative defaults in Claude 4.x
- Anthropic: "Claude 4.x requires explicit permission to be thorough"
- Community: "Single most important change needed from 3.5 to 4.x"
- Solves the widespread "Claude 4 is less helpful than 3.5" complaint

**Case Study — What the Unconditional Form Cost:**
Applied to every prompt regardless of task breadth, these modifiers produce the inverse defect. The reviewer agents carried them as a standing instruction and returned speculative refactors and out-of-spec recommendations — over-engineered reviews the owner stopped using, and the reason the reviewer-restraint repair pass exists. The mandate reached 25 agent prompts because it was prescribed rather than chosen — the summoner's playbook made it a checklist item for every `identity.md` it wrote, and this technique's own worked example supplied the wording. Softening the prompts did not stop it. That sweep retired one phrase and was verified with a zero-hit grep for it, while this technique's own modifier list and application paragraph went on prescribing the same volume in a second vocabulary — three modifiers of the shapes the "Modifiers That Backfire" list below now names, under an instruction to add one to EVERY task description and a statement that doing so was not optional. An author following the technique to the letter was compliant with this bible and reintroduced at the next agent exactly what the sweep had taken out. A phrase-level grep returning zero is evidence about one wording, never about the rule that produced it — verify a mandate's removal by reading the technique it came from.

**Key Modifiers That Work:**

- "Be thorough on what the task needs and silent on the rest — the work's size follows the task's size, not the template's"
- "This task is genuinely broad: cover [the dimensions it actually has]"
- "Include the edge cases and error handling the task actually calls for"
- "Feel free to refactor entire architecture if needed" (scoped permission, not a volume request)

**Modifiers That Backfire:**

- ❌ Anything asking for a maximum count of features or interactions
- ❌ Anything asking to go past the task's basics for its own sake
- ❌ Any standing pairing of "thorough" with "comprehensive"

These ask for volume rather than fit. They were retired from this bible and from the bundled agent prompts in the reviewer-restraint pass; do not reintroduce them.

**Application:**
Add an expansion modifier when the task is genuinely broad and a literal reading would under-deliver. Do NOT add one to every task description — on a well-scoped task it is a standing instruction to exceed the scope, and it will be obeyed. When unsure, state the breadth the task has rather than asking for more than it has.

---

### Technique #7: Self-Correction Triggers (Mid-Run Guidance)

**The Pattern:**

```markdown
<self_correction_triggers>
**Self-Correction Checkpoints:**

If you notice yourself:

- **Generating code without reading files first** → Stop. Read the files.
- **Creating complex abstractions** → Simplify. Follow existing patterns.
- **Making assumptions about behavior** → Stop. Verify first.
- **Producing generic advice** → Replace with specific, actionable guidance.

These checkpoints prevent drift during long sessions.
</self_correction_triggers>
```

**Why It Works:**

- Provides "guardrails" that the model can self-apply
- Acts like mid-run messages without external scaffolding
- Catches common failure modes before they compound
- Maintains quality throughout extended sessions

**Impact & Evidence:**

- **74.4% on SWE-bench Verified** with mid-run guidance (Refact.ai)
- Significant stability improvements in long-running agents
- Prevents cascade errors from early mistakes

**Application:**
Include 4-6 specific self-correction triggers relevant to your agent's domain. Frame them as observable behaviors with immediate corrective actions.

---

### Technique #8: Post-Action Reflection

**The Pattern:**

```markdown
<post_action_reflection>
**After each major action, evaluate:**

1. Did this achieve the intended goal?
2. What new information did I learn?
3. What gaps remain in my understanding?
4. Should I adjust my approach?

Only proceed when you have sufficient confidence in your current state.
</post_action_reflection>
```

**Why It Works:**

- Forces intentional pauses between actions
- Prevents runaway execution based on faulty assumptions
- Encourages iterative refinement
- Improves decision quality in multi-step tasks

**Impact & Evidence:**

- Anthropic guidance: "After receiving tool results, carefully reflect on their quality"
- Improves long-horizon reasoning capability
- Reduces error propagation in agentic workflows

**Application:**
Add reflection prompts after tool use sections or at natural decision points in workflows.

---

### Technique #9: Progress Tracking for Extended Sessions

**The Pattern:**

```markdown
<progress_tracking>
**Progress Notes Pattern:**

When working on complex tasks:

1. **Track findings** after each major step
2. **Note confidence levels** (high/medium/low)
3. **Document unresolved questions** for clarification
4. **Record decision rationale** for key choices

This maintains orientation across extended sessions.
</progress_tracking>
```

**Why It Works:**

- Creates structured mental state across conversation
- Prevents losing track of goals in long sessions
- Supports retrieval of earlier context
- Enables better handoffs between conversation turns

**Impact & Evidence:**

- Anthropic context engineering: "Structured note-taking enables persistent memory"
- Claude maintained focus in 30+ hour Pokémon sessions using similar patterns
- Community validation for complex multi-file refactors

**Application:**
Include progress tracking for any agent that handles tasks spanning multiple conversation turns or requiring coordination across many files.

---

### Technique #10: Positive Framing for Constraints

**The Pattern:**

```markdown
# Instead of:

❌ "Do NOT use default exports"
❌ "Never create magic numbers"

# Use:

✅ "Use named exports for all public APIs"
✅ "Define all numeric values as named constants"
```

**Why It Works:**

- Positive instructions are easier to follow than prohibitions
- Reduces cognitive load (don't have to invert the instruction)
- More actionable (tells what TO do, not just what NOT to do)
- Better for Opus 4.5 which responds well to clear guidance

**Impact & Evidence:**

- Anthropic: "Instead of 'Do not use markdown,' say 'Your response should be composed of prose'"
- Opus 4.5 is "more responsive to the system prompt than previous models"
- Clearer mental model for the agent

**Application:**
When documenting constraints, lead with the positive approach (✅), then show what to avoid (❌). This applies to both agent prompts and skill documentation.

---

### Technique #11: "Think" Alternatives for Opus 4.5

**The Pattern:**

```markdown
# When extended thinking is disabled, avoid:

❌ "Think about the implications"
❌ "Think through the problem"

# Use instead:

✅ "Consider the implications"
✅ "Evaluate the problem"
✅ "Analyze the requirements"
```

**Why It Works:**

- Opus 4.5 is "particularly sensitive to the word 'think' and its variants"
- When extended thinking is disabled, "think" can cause confusion
- Alternative words provide the same guidance without triggering issues

**Recommended Replacements:**

- think → consider, evaluate, analyze
- think about → reflect on, assess
- think through → work through, examine
- thinking → reasoning, analysis

**Application:**
Audit prompts for "think" variants when targeting Opus 4.5 without extended thinking enabled. This is less critical for Sonnet 4.5 but still good practice.

**Note on Extended Thinking (January 2026 Update)**

As of January 2026, Claude Code **enables extended thinking by default** with a maximum budget of 31,999 tokens. The trigger keywords (`think`, `megathink`, `ultrathink`) have been **deprecated** and no longer have any effect.

**Current system:**

- Extended thinking is **always on** by default (max 31,999 tokens)
- Use `MAX_THINKING_TOKENS` environment variable to limit or disable thinking
- Toggle with `Alt+T` (session-level) or `/config` (global setting)
- View thinking with `Ctrl+O` (verbose mode)

**In agent prompts:** Still avoid the word "think" → use consider/evaluate/analyze (prevents confusion with Opus 4.5's thinking system).

---

### Technique #12: Just-in-Time Context Loading

**The Pattern:**

```markdown
<retrieval_strategy>
**Just-in-Time Loading:**

- Don't pre-load every potentially relevant file
- Start with file paths and naming patterns
- Load detailed content only when needed
- This preserves context window for actual work
  </retrieval_strategy>
```

**Why It Works:**

- Preserves precious context window space
- Avoids overwhelming the model with irrelevant detail
- Enables deeper exploration of actually-needed content
- Matches how production agents (SWE-agent, Aider) operate

**Impact & Evidence:**

- Anthropic: "Maintain lightweight identifiers and dynamically load data at runtime"
- Context engineering principle: "smallest set of high-signal tokens"
- Production systems use glob/grep before full file reads

**Application:**
Include retrieval guidance in agents that explore codebases. Encourage pattern-based discovery before deep reading.

---

### Technique #13: Write Verification Protocol (Prevents False-Success Reports)

**The Pattern:**

```markdown
<write_verification_protocol>
**After completing ANY file edits, you MUST:**

1. **Re-read the file(s) you just edited** using the Read tool
2. **Verify your changes exist in the file:**
   - For new content: Confirm the new text/code is present
   - For edits: Confirm the old content was replaced
   - For structural changes: Confirm the structure is correct
3. **If verification fails:**
   - Report: "❌ VERIFICATION FAILED: [what was expected] not found in [file]"
   - Do NOT report success
   - Re-attempt the edit operation
4. **Only report success AFTER verification passes**
   </write_verification_protocol>
```

**Why It Works:**

- Agents can plan and generate correctly but fail to execute the Write/Edit operation
- Without verification, agents report success based on what they intended to do
- This causes downstream failures that are hard to debug
- Explicit re-reading creates an unbreakable verification loop

**Impact & Evidence:**

- **Prevents false-success reports** from file operations
- Catches tool execution failures immediately
- Enables accurate progress tracking and debugging
- Already in use across all agents

**Application:**
Include write verification for ALL agents. The verification step is mandatory after every Write or Edit tool use.

---

## 2. Optimal Prompt Structure & Ordering

Based on convergent evidence from Anthropic, production systems, and academic research.

### The Canonical Structure

```markdown
# Agent Name

[1-2 sentence introduction to agent's purpose]

---

<role>
[Role definition with expansion modifiers for Claude 4.x]
</role>

---

<core_principles>
[3-5 principles with self-reminder: "Display all X principles at the start of EVERY response"]
</core_principles>

---

<critical_requirements>
[Critical rules using **(You MUST ...)** format - placed early for emphasis]
</critical_requirements>

---

<investigation_requirement>
[Investigation-first protocol]
</investigation_requirement>

---

## Role-Specific Investigation Process

[Agent-specific investigation steps]

---

<self_correction_triggers>
[If you notice yourself... checkpoints]
</self_correction_triggers>

---

<domain_scope>
**You handle:**

- [Responsibility 1]
- [Responsibility 2]

**You DON'T handle:**

- [Other agent's domain 1] → [Agent Name]
- [Other agent's domain 2] → [Agent Name]
  </domain_scope>

---

## Main Content Sections

### [Section 1]

[Agent-specific patterns, checklists, guidelines]

### [Section 2]

[Code examples, anti-patterns, best practices]

---

<anti_over_engineering>
[Minimal changes guidance - for implementation agents]
</anti_over_engineering>

---

<output_format>
[Expected response structure]
</output_format>

---

<critical_reminders>
[Repeat critical rules from <critical_requirements> - placed late for reinforcement]
</critical_reminders>

---

**DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE TO MAINTAIN INSTRUCTION CONTINUITY.**

**ALWAYS RE-READ FILES AFTER EDITING TO VERIFY CHANGES WERE WRITTEN. NEVER REPORT SUCCESS WITHOUT VERIFICATION.**
```

### Section Ordering Rationale

1. **Title & Introduction** - Sets context
2. **Role** - Defines identity with expansion modifiers
3. **Core Principles** - Self-reminder loop (MUST be early for continuous reinforcement)
4. **Critical Requirements** - First emphatic statement of rules
5. **Investigation Requirement** - Prevents hallucination (MUST be early to establish habit)
6. **Role-Specific Investigation** - Customizes investigation for domain
7. **Self-Correction Triggers** - Mid-run guidance checkpoints
8. **Domain Scope** - Clear boundaries preventing scope creep
9. **Main Content** - Agent-specific patterns and guidelines
10. **Anti-Over-Engineering** - Prevents scope creep and unnecessary complexity
11. **Output Formats** - Standard response structure
12. **Critical Reminders** - Second emphatic statement of rules (closes emphatic repetition)
13. **Final Reminder** - Reinforces self-reminder loop AND write verification (closes both loops)

**Why This Order:**

- **Early sections prevent fundamental errors** (hallucination, scope creep, instruction drift)
- **Middle sections provide domain knowledge** (patterns, standards, examples)
- **Late sections handle reinforcement** (emphatic repetition, loop closure)
- **Final reminder closes both the self-reinforcing loop AND write verification**

This ordering is based on:

- Anthropic's "documents first, query last" guidance
- Production system analysis (Aider, SWE-agent, Cursor)
- Academic research on prompt structure impact
- Community validation of what works in practice

---

## 3. XML Tag Standards

### Required Tags for All Prompts

```xml
<role>
[Agent's role definition]
</role>

<core_principles>
[The 3-5 principles with self-reminder loop]
</core_principles>

<critical_requirements>
[Critical rules using **(You MUST ...)** format]
</critical_requirements>

<investigation_requirement>
[Investigation-first protocol]
</investigation_requirement>

<task>
[What needs to be accomplished]
</task>

<constraints>
[What NOT to do]
</constraints>

<output_format>
[Expected response structure]
</output_format>

<critical_reminders>
[Repeat critical rules from <critical_requirements>]
</critical_reminders>
```

### Recommended Tags for Complex Tasks

```xml
<context>
[Background information, patterns, architecture]
</context>

<examples>
<example>
[Input/output demonstration]
</example>
</examples>

<workflow>
[Step-by-step process]
</workflow>

<success_criteria>
[Measurable completion criteria]
</success_criteria>

<self_correction_triggers>
[If you notice yourself... checkpoints]
</self_correction_triggers>

<post_action_reflection>
[After each major action, evaluate...]
</post_action_reflection>

<progress_tracking>
[Track findings, confidence levels, decisions]
</progress_tracking>

<retrieval_strategy>
[Just-in-time loading guidance]
</retrieval_strategy>

<domain_scope>
[What agent handles vs doesn't handle]
</domain_scope>

<permission_scope>
[What agent can do without asking vs needs approval]
</permission_scope>
```

### Tags for Long-Context Tasks (20K+ tokens)

```xml
<documents>
<document index="1">
<source>filename.py</source>
<document_content>
[Full file content - place at TOP]
</document_content>
</document>
</documents>

[Rest of prompt - context, instructions, examples]

<query>
[Specific question - place at END]
</query>
```

### XML Naming Conventions

**Good semantic names:**

- `<thinking>`, `<planning>`, `<implementation>`
- `<must_fix>`, `<suggestions>`, `<positive_feedback>`
- `<test_suite>`, `<coverage_analysis>`
- `<output>` (for response), `<command>` (for bash commands)
- `<investigation_notes>`, `<verification>`
- `<self_correction_triggers>` (for mid-run guidance)
- `<post_action_reflection>` (for reasoning checkpoints)
- `<progress_tracking>` (for extended session state)
- `<retrieval_strategy>` (for just-in-time loading guidance)
- `<permission_scope>` (for explicit change permissions)
- `<critical_requirements>` (for rules at TOP)
- `<critical_reminders>` (for rules at BOTTOM)

**Avoid generic names:**

- `<section1>`, `<section2>`
- `<part_a>`, `<part_b>`
- `<info>`, `<data>`
- `<content>`, `<text>`

**Nesting Guidelines:**

- Keep nesting ≤3 levels deep
- Use flat structures when possible
- Semantic hierarchy over deep nesting

> **Skill files use a different tag set** — see [Skill-Content Tags (vs Agent-Prompt Tags)](#skill-content-tags-vs-agent-prompt-tags) below. The Required/Recommended tag lists in this section target agent and task prompts, not skill content files under `src/skills/**/SKILL.md`.

### Skill-Content Tags (vs Agent-Prompt Tags)

Skill files (`src/skills/**/SKILL.md`) are reference content loaded into a calling agent's context, not standalone agents. They use a stable, narrower tag vocabulary focused on teaching a single tool/domain. The 222 skills in this project's marketplace converge on the following set — new skills MUST match, audits MUST flag drift.

**Required tags (present in all skills):**

- `<critical_requirements>` — bookend at TOP, rules in `**(You MUST ...)**` format (same semantics as agent prompts)
- `<philosophy>` — why this tool / when to use it / mental model framing
- `<patterns>` — the core pattern library, numbered (Pattern 1, Pattern 2, ...)
- `<red_flags>` — anti-patterns, gotchas, common mistakes with consequences
- `<critical_reminders>` — bookend at BOTTOM, repeats the TOP rules, closes with `**Failure to follow these rules will ...**`

**Common optional tags (include when the domain warrants):**

- `<decision_framework>` — comparative "pick X vs Y" guidance (e.g. Zustand vs Context, SWR vs React Query)
- `<integration>` — cross-skill integration notes (how this composes with sibling skills)
- `<performance>` — perf tuning section separate from the main patterns
- `<migration_notice>` — version-migration callout when a major version shift matters (e.g. Remix v2 → v3)

**Deliberately excluded from skills** (agent-prompt patterns that do NOT apply):

- `<core_principles>` and the **self-reminder loop** (Technique #1) — skills are context, not agents; the calling agent owns its own principle display
- The **dual final reminder** block (principles display + write verification) — same reason
- `<role>`, `<task>`, `<constraints>`, `<output_format>` — skills describe a tool, not a job to execute
- `<investigation_requirement>`, `<self_correction_triggers>`, `<post_action_reflection>`, `<progress_tracking>` — agent-execution concerns

Reviewers auditing a skill against this bible should use the list above. A skill MUST have all five required tags; missing any is drift. A skill using tags outside the required + optional set (e.g. inventing `<guidelines>` or `<overview>`) is drift — either the tag should be added to this list (if genuinely reusable across ≥3 skills) or the skill should be refactored into the canonical vocabulary.

---

## 4. Sonnet 4.5 Specific Optimizations

### Sonnet 4.5 vs Opus 4.5 Quick Comparison

| Characteristic               | Sonnet 4.5                      | Opus 4.5                    |
| ---------------------------- | ------------------------------- | --------------------------- |
| Default behavior             | Conservative, minimal           | Over-engineering tendency   |
| Instruction following        | Very literal                    | More interpretive           |
| Expansion modifiers          | Useful on genuinely broad tasks | Helpful but less critical   |
| "Think" sensitivity          | Low                             | **High** (avoid in prompts) |
| System prompt responsiveness | Standard                        | **More responsive**         |
| Parallel tool execution      | Standard                        | **Excels** at parallel ops  |

### Critical Differences from Sonnet 3.5

1. **More Conservative by Default**
   - A genuinely broad task needs its breadth stated explicitly
   - Needs permission for substantial changes
   - Naming the dimensions the task actually has unlocks full capability
   - Without expansion modifiers, produces minimal implementations

2. **Enhanced Context Awareness**
   - Tracks token budget internally
   - Knows when approaching limits
   - Can maintain focus for 30+ hours with proper structure
   - Better at managing long conversations

3. **Stricter Instruction Following**
   - Interprets constraints more literally
   - Needs explicit permission vs implicit understanding
   - Less "reading between the lines"
   - More precise instruction adherence

   **Example - Be Explicit with Sonnet:**

   ```markdown
   # ❌ Vague (Sonnet may under-deliver)

   Add a user profile feature

   # ✅ Explicit (Sonnet delivers fully)

   Add a user profile feature with:

   - Avatar upload with preview
   - Bio field (markdown supported)
   - Social links section
   - Form validation with inline errors
   ```

4. **Improved Multi-Turn Coherence**
   - Better at maintaining context across conversations
   - Self-reminder loop essential for long sessions
   - File-based state management highly effective
   - Superior memory of earlier conversation parts

### Required Adjustments for 4.5

**Add Expansion Modifiers (broad tasks only — see Technique #6):**

```markdown
<task>
[Task description]

**This task is genuinely broad — cover [the dimensions it actually has].
Be thorough on what the task needs and silent on the rest; the work's size follows the task's size, not the template's.**
</task>
```

**Explicit Permission for Changes:**

```markdown
<constraints>
Feel free to refactor architecture if needed to achieve the goal.
You have permission to make substantial changes within [scope].
</constraints>
```

**Token Budget Awareness:**

```markdown
You have approximately [X] tokens remaining in context.
Prioritize [most important information] if approaching limits.
Consider summarizing [less critical sections] to preserve space.
```

**Extended Thinking for Complex Tasks:**

```markdown
<instructions>
Before answering, consider step-by-step inside <thinking> tags about:
1. What assumptions am I making?
2. What are potential failure modes?
3. What's the optimal approach?

Then provide your answer in <output> tags.
</instructions>
```

**Performance Metrics:**

- Extended thinking: 68.0% → 84.8% on GPQA Diamond
- Math accuracy: 82.2% → 96.2% on MATH 500 benchmark
- 30+ hour session focus with proper structure

### Opus 4.5 Specific Considerations

Opus 4.5 has some unique characteristics that differ from Sonnet 4.5:

**1. "Think" Sensitivity**
When extended thinking is disabled, Opus 4.5 is particularly sensitive to the word "think" and its variants. Use alternatives:

- think → consider, evaluate, analyze
- think about → reflect on, assess
- think through → work through, examine

**2. Over-Engineering Tendency**
Opus 4.5 has a tendency to over-engineer solutions. Add explicit guidance:

```markdown
Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused. Don't add features, refactor code, or make "improvements" beyond what was asked.
```

**3. System Prompt Responsiveness**
Opus 4.5 is more responsive to the system prompt than previous models. This means:

- Aggressive directives (CRITICAL, MUST, etc.) may cause over-caution
- Use clear, direct language without excessive emphasis
- Positive framing works better than prohibitions

**4. Crop/Zoom for Image Tasks**
For image-related tasks, giving Opus 4.5 a "crop tool" or ability to zoom on regions provides consistent uplift on image evaluations.

**5. Parallel Tool Execution**
Opus 4.5 excels at parallel tool execution. Structure prompts to allow simultaneous operations when possible:

```markdown
# ✅ Good - Opus can parallelize

Read these 3 files and compare their patterns: file1.ts, file2.ts, file3.ts

# ❌ Less optimal - forces sequential

Read file1.ts. Then read file2.ts. Then read file3.ts.
```

---

## 5. Production Validation Checklist

Use this checklist to validate any agent or prompt before deployment.

### Core Components

- [ ] Has `<role>` wrapper with expansion modifiers for Claude 4.x
- [ ] Includes core principles with self-reminder loop
- [ ] Includes investigation requirement to prevent hallucination
- [ ] Includes anti-over-engineering section (for implementation agents)
- [ ] Includes role-appropriate output format
- [ ] Includes write verification protocol
- [ ] Has `<critical_requirements>` section at TOP
- [ ] Has `<critical_reminders>` section at BOTTOM
- [ ] Ends with dual final reminder (principles display + write verification)

### XML Tags

- [ ] All major sections wrapped in semantic XML tags
- [ ] `<role>`, `<task>`, `<constraints>` present
- [ ] Long documents use `<documents>` at top, `<query>` at end
- [ ] Tags are semantic (not `<section1>`, `<section2>`)
- [ ] Nesting kept to ≤3 levels

### Emphatic Techniques

- [ ] Critical rules use **bold** formatting
- [ ] Ultra-critical rules use **(bold + parentheses)** with "You MUST" format
- [ ] Critical rules repeated in both `<critical_requirements>` AND `<critical_reminders>`
- [ ] ALL CAPS used for section headers
- [ ] Expansion modifiers, where the task warrants them, are proportional (Technique #6)

### Content Quality

- [ ] Examples include file paths with line numbers
- [ ] References to existing patterns are specific
- [ ] Anti-patterns show consequences, not just "bad"
- [ ] Success criteria are measurable and verifiable
- [ ] Investigation steps are explicit and actionable

### Sonnet 4.5 Specific

- [ ] Expansion modifiers only where the task is genuinely broad, and phrased proportionally
- [ ] Explicit permission for substantial changes (if applicable)
- [ ] Token budget awareness (for long-context tasks)
- [ ] Extended thinking enabled (for complex reasoning)

### Opus 4.5 Specific

- [ ] "Think" variants replaced with alternatives (consider, evaluate, analyze)
- [ ] Anti-over-engineering guidance explicitly included
- [ ] Aggressive directives softened (avoid excessive CRITICAL/MUST)
- [ ] Positive framing used for constraints (✅ first, then ❌)

### Extended Session Support

- [ ] Self-correction triggers included for long-running agents
- [ ] Post-action reflection points at key decision moments
- [ ] Progress tracking pattern for multi-turn tasks
- [ ] Just-in-time retrieval guidance for codebase exploration
- [ ] Permission scope defined for acceptable changes

---

## 6. Examples: Before vs After

### Example 1: Developer Agent (Before)

❌ **Common mistakes:**

```markdown
# Developer Agent

You are a developer. Write good code and follow best practices.

## Instructions

1. Read the specification
2. Write the code
3. Test it

Make sure your code is clean and follows conventions.
```

**Problems:**

- No self-reminder loop (will forget instructions mid-task)
- No investigation requirement (will hallucinate patterns)
- Vague "best practices" and "conventions" (no actionable guidance)
- No output format (inconsistent responses)
- No anti-over-engineering guards (scope creep guaranteed)
- No expansion modifiers (Sonnet 4.5 will be conservative)
- No XML tags (lower accuracy)
- No emphatic repetition (rules will be ignored)

---

### Example 1: Developer Agent (After)

✅ **Optimal structure:**

```markdown
# Developer Agent

You are an expert TypeScript/React developer. Your mission: surgical implementation—read spec, examine patterns, implement exactly what's requested, test, verify. Nothing more, nothing less.

---

<role>
Expert TypeScript/React developer focused on surgical implementation.

**When implementing features, be thorough on what the task needs and silent on the rest. Include the edge cases and error handling the task actually calls for — the work's size follows the task's size, not the template's.**
</role>

---

<core_principles>
Principle 1: **Investigate before acting** - Never speculate about code you haven't examined.
Principle 2: **Follow existing patterns strictly** - Consistency with the codebase trumps external best practices.
Principle 3: **Make minimal necessary changes only** - Use existing utilities, avoid scope creep.
Principle 4: **Test before considering complete** - Implementation isn't done until tests pass.
Principle 5: **Verify Everything** - Re-read files after editing. Provide evidence.

**Display all 5 principles at the start of EVERY response**
</core_principles>

---

<critical_requirements>

## CRITICAL: Before Any Work

**(You MUST read pattern files before implementing)**
**(You MUST use existing utilities - never create new ones when they exist)**
**(You MUST re-read files after editing to verify changes)**
</critical_requirements>

---

<investigation_requirement>
**CRITICAL: Never speculate about code you have not opened.**

Before making any claims or implementing anything:

1. List the files you need to examine
2. Read each file completely
3. Base analysis strictly on what you find
4. If uncertain, ask
   </investigation_requirement>

---

## Your Investigation Process

**BEFORE writing any code:**

1. **Read the specification completely**
   - Identify all requirements
   - Note referenced pattern files
   - Understand success criteria

2. **Examine pattern files**
   - Read each referenced file completely
   - Understand the established approach
   - Note utilities available

3. **Identify existing utilities**
   - Search for relevant helpers
   - Never reinvent what exists
   - Reuse over recreate

**Only after investigation do you plan and implement.**

---

<self_correction_triggers>
**If you notice yourself:**

- **Generating code without reading files first** → Stop. Read the files.
- **Creating new abstractions** → Stop. Check for existing utilities.
- **Making assumptions about patterns** → Stop. Verify in the codebase.
- **Skipping tests** → Stop. Tests are required for completion.
  </self_correction_triggers>

---

<workflow>
ALWAYS follow this sequence:

1. **Investigation:** Read referenced files and patterns
2. **Planning:** Brief plan matching existing patterns
3. **Implementation:** Code following plan and conventions
4. **Testing:** Write and run tests
5. **Verification:** Re-read files to confirm changes, verify success criteria

Never skip investigation—ALWAYS examine referenced files before implementing.
</workflow>

---

<anti_over_engineering>
**CRITICAL: Make minimal necessary changes only.**

Before implementing:

1. Does existing code do this? → Use it
2. Is this requested? → If no, don't add it
3. Can this be simpler? → Make it simpler

**(Do not change anything not explicitly mentioned in the specification)**
</anti_over_engineering>

---

<output_format>
<investigation_notes>
[Files examined and patterns found]
</investigation_notes>

<implementation_plan>
[Brief plan matching existing patterns]
</implementation_plan>

<implementation>
[Code changes]
</implementation>

<verification>
[Re-read files, confirm changes, verify success criteria]
</verification>
</output_format>

---

<critical_reminders>

## CRITICAL REMINDERS

**(You MUST read pattern files before implementing)**
**(You MUST use existing utilities - never create new ones when they exist)**
**(You MUST re-read files after editing to verify changes)**

**Failure to follow these rules will produce over-engineered, inconsistent code.**
</critical_reminders>

---

**DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE TO MAINTAIN INSTRUCTION CONTINUITY.**

**ALWAYS RE-READ FILES AFTER EDITING TO VERIFY CHANGES WERE WRITTEN. NEVER REPORT SUCCESS WITHOUT VERIFICATION.**
```

**Improvements:**

- ✅ Self-reminder loop prevents drift (60-70% reduction)
- ✅ Investigation requirement prevents hallucination (80%+ reduction)
- ✅ Emphatic repetition with `<critical_requirements>` and `<critical_reminders>` (40-50% better compliance)
- ✅ Specific workflow with verification
- ✅ Anti-over-engineering guards (70%+ reduction in scope creep)
- ✅ Standard output format (consistency)
- ✅ XML tags for structure (30%+ accuracy improvement)
- ✅ Dual final reminder closes both loops

---

### Example 2: Complex Task Prompt (Before)

❌ **Common mistakes:**

```
Create a user authentication system with login, signup, and password reset.
```

**Problems:**

- No structure (plain text, no XML)
- No examples (no guidance on format/patterns)
- No constraints (over-engineering likely)
- No success criteria (how to verify?)
- Missing expansion modifiers for Sonnet 4.5 (minimal implementation)
- No investigation guidance (will hallucinate patterns)
- No document placement strategy (poor context usage)

---

### Example 2: Complex Task Prompt (After)

✅ **Optimal structure:**

````xml
<documents>
<document index="1">
<source>auth-service.ts</source>
<document_content>
[Existing authentication patterns - PLACE AT TOP]
</document_content>
</document>

<document index="2">
<source>user-store.ts</source>
<document_content>
[Current user state management]
</document_content>
</document>
</documents>

<role>
You are an expert TypeScript/React developer specializing in authentication systems.

**When implementing this system, be thorough on what the task needs and silent on the rest. Include the flows, edge cases and error handling the task actually calls for — the work's size follows the task's size, not the template's.**
</role>

<context>
This application uses:
- JWT tokens for authentication
- MobX for state management
- React Query for API calls
- Tailwind CSS for styling

Existing auth system handles basic login but needs expansion.
</context>

<critical_requirements>
## CRITICAL: Before Any Work

**(You MUST read auth-service.ts and signup-form.tsx before implementing)**
**(You MUST use existing validation utilities - validateEmail, validatePassword)**
**(You MUST NOT modify existing auth endpoints)**
</critical_requirements>

<task>
Implement comprehensive authentication system with:
1. Login with email/password
2. Signup with validation
3. Password reset flow
4. Session management

Consider: remember me, email verification, rate limiting, error handling.
</task>

<existing_patterns>
**Authentication pattern from auth-service.ts (lines 45-89):**
- Uses JWT with refresh tokens
- Stores tokens in httpOnly cookies
- Validates on every API call
- Handles 401 with automatic refresh

**Form validation from signup-form.tsx (lines 23-67):**
- Inline validation on blur
- Comprehensive error messages
- Disabled submit during validation
- Accessible error announcements

**YOU MUST follow these exact patterns.**
</existing_patterns>

<examples>
<example>
**Similar implementation from profile-edit-modal.tsx:**
```typescript
const handleSubmit = async (data: FormData) => {
  try {
    setLoading(true);
    await apiClient.put('/users/profile', data);
    showSuccess('Profile updated successfully');
    onClose();
  } catch (error) {
    showError(error.message || 'Failed to update profile');
  } finally {
    setLoading(false);
  }
};
````

This shows the established error handling and loading state pattern.
</example>
</examples>

<constraints>
**CRITICAL - DO NOT:**
- Modify existing authentication endpoints (use as-is)
- Create new validation utilities (use existing validateEmail, validatePassword)
- Change token storage mechanism (must remain httpOnly cookies)
- Modify user-store structure (extend only)

**YOU MUST:**

- Use existing apiClient for all requests
- Follow form patterns from signup-form.tsx exactly
- Use Tailwind utility classes (no custom CSS)
- Include comprehensive error handling

**(Do not change anything not explicitly mentioned in this specification)**
</constraints>

<success_criteria>
**User-Facing:**

1. User can log in with email/password
2. User can create account with validation
3. User can reset password via email
4. Session persists across page reloads
5. Clear error messages for all failure cases

**Technical:**

1. All tests in auth/ directory pass
2. No modifications to auth-service.ts core logic
3. Follows existing form patterns exactly
4. Uses existing validation utilities
5. Loading and error states handled properly

**Verification:**

- Manual test: Complete signup → login → password reset flow
- Automated: Run auth tests
- Check: No changes to existing auth endpoints
  </success_criteria>

<workflow>
BEFORE implementing:
1. Read auth-service.ts (lines 1-150) completely
2. Read signup-form.tsx (lines 1-120) completely
3. Read validateEmail and validatePassword utilities
4. Understand the existing JWT flow

THEN:

1. Plan implementation matching these patterns
2. Implement following the plan exactly
3. Write comprehensive tests
4. Re-read files to verify changes
5. Verify all success criteria met
   </workflow>

<output_format>
<investigation_notes>
[Files examined and patterns found]
</investigation_notes>

<implementation_plan>
[Brief plan matching existing patterns]
</implementation_plan>

<implementation>
[Code changes]
</implementation>

<tests>
[Test code covering all scenarios]
</tests>

<verification>
[Re-read files, confirm changes, verify success criteria]
</verification>
</output_format>

<critical_reminders>

## CRITICAL REMINDERS

**(You MUST read auth-service.ts and signup-form.tsx before implementing)**
**(You MUST use existing validation utilities - validateEmail, validatePassword)**
**(You MUST NOT modify existing auth endpoints)**

**Failure to follow these rules will produce incompatible, over-engineered code.**
</critical_reminders>

<query>
Implement the complete authentication system following all patterns and constraints above.
</query>
```

**Improvements:**

- ✅ Documents first, query last (30% boost on long-context)
- ✅ XML structure for semantic boundaries (30%+ accuracy improvement)
- ✅ Specific examples with line numbers (reduces misinterpretation)
- ✅ Emphatic repetition with `<critical_requirements>` and `<critical_reminders>` (40-50% better compliance)
- ✅ Measurable success criteria (45% fewer regressions)
- ✅ Investigation workflow enforced (80%+ reduction in hallucination)
- ✅ Proportional expansion modifier, warranted by a genuinely broad task (Technique #6)
- ✅ Standard output format (consistency)

---

## 7. Troubleshooting Common Issues

### Issue: Agent Forgets Instructions Mid-Task

**Symptom:** Agent starts well but drifts off-task after 10-20 messages

**Root Cause:** No self-reminder loop

**Solution:**

```markdown
<core_principles>
Principle 1: [Rule 1]
Principle 2: [Rule 2]
Principle 3: [Rule 3]
Principle 4: [Rule 4]
Principle 5: [Rule 5]

**Display all 5 principles at the start of EVERY response**
</core_principles>

[Rest of prompt]

**DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE TO MAINTAIN INSTRUCTION CONTINUITY.**

**ALWAYS RE-READ FILES AFTER EDITING TO VERIFY CHANGES WERE WRITTEN. NEVER REPORT SUCCESS WITHOUT VERIFICATION.**
```

**Evidence:** 60-70% reduction in off-task behavior with self-reminder loop

---

### Issue: Agent Hallucinates Patterns

**Symptom:** Agent claims patterns exist that don't, invents utilities

**Root Cause:** No investigation requirement

**Solution:**

```markdown
<investigation_requirement>
**CRITICAL: Never speculate about code you have not opened.**

Before making any claims or implementing anything:

1. List the files you need to examine
2. Read each file completely
3. Base analysis strictly on what you find
4. If uncertain, ask
   </investigation_requirement>
```

**Evidence:** 80%+ reduction in hallucination issues

---

### Issue: Agent Over-Engineers Solutions

**Symptom:** Creates complex abstractions, adds unrequested features

**Root Cause:** No anti-over-engineering guards

**Solution:**

```markdown
<anti_over_engineering>
**CRITICAL: Make minimal necessary changes only.**

Before implementing:

1. Does existing code do this? → Use it
2. Is this requested? → If no, don't add it
3. Can this be simpler? → Make it simpler

**(Do not change anything not explicitly mentioned in the specification)**
</anti_over_engineering>
```

**Evidence:** 70%+ reduction in scope creep

---

### Issue: Sonnet 4.5 Produces Minimal Implementations

**Symptom:** Implementation technically meets requirements but is bare-bones

**Root Cause:** Conservative Sonnet 4.5 defaults on a task whose breadth was never stated

**Solution:**

```markdown
<task>
[Task description]

**This task is genuinely broad — cover [the dimensions it actually has].
Be thorough on what the task needs and silent on the rest; the work's size follows the task's size, not the template's.**
</task>
```

**Check the diagnosis first:** this fix applies when the task really is broader than the output. If the deliverable matches a well-scoped task, the implementation is not bare-bones — it is proportional, and adding a modifier here produces the inverse defect (see Technique #6).

**Evidence:** Anthropic documentation, community consensus for Claude 4.x

---

### Issue: Agent Doesn't Follow Constraints

**Symptom:** Violates explicit constraints, modifies off-limits files

**Root Cause:** Missing emphatic repetition

**Solution:**

```markdown
<critical_requirements>

## CRITICAL: Before Any Work

**(You MUST [rule 1])**
**(You MUST [rule 2])**
**(You MUST NOT [rule 3])**
</critical_requirements>

[Body of prompt]

<critical_reminders>

## CRITICAL REMINDERS

**(You MUST [rule 1])** - [reinforcement]
**(You MUST [rule 2])** - [reinforcement]
**(You MUST NOT [rule 3])** - [reinforcement]

**Failure to follow these rules will [consequence].**
</critical_reminders>
```

**Evidence:** 40-50% increase in compliance with emphatic repetition

---

### Issue: Inconsistent Response Format

**Symptom:** Agent responds differently each time, hard to parse

**Root Cause:** No output format specification

**Solution:**

```markdown
<output_format>
<investigation_notes>
[What you examined]
</investigation_notes>

<implementation>
[Your changes]
</implementation>

<verification>
[Proof of success]
</verification>
</output_format>
```

**Evidence:** 60% reduction in format errors with XML structure

---

### Issue: Agent Reports Success Without Verification

**Symptom:** Agent says "Done!" but changes weren't actually saved

**Root Cause:** No write verification protocol

**Solution:**

```markdown
<write_verification_protocol>
**After completing ANY file edits, you MUST:**

1. Re-read the file(s) you just edited
2. Verify your changes exist in the file
3. If verification fails, report failure and re-attempt
4. Only report success AFTER verification passes
   </write_verification_protocol>

---

**ALWAYS RE-READ FILES AFTER EDITING TO VERIFY CHANGES WERE WRITTEN. NEVER REPORT SUCCESS WITHOUT VERIFICATION.**
```

**Evidence:** Prevents false-success reports from file operations

---

## 8. Multi-Agent Delegation (Project-Specific)

This section covers patterns specific to this repo's sub-agent roster and Ralph-style iterative workflows. For the agents listed below, every delegation prompt MUST include the boilerplate in [Section 8.2](#82-required-boilerplate-for-every-delegation) — no exceptions.

### 8.1 Agent Selection

| Agent             | Use for                                                                                                                                     | Do NOT use for                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `cli-developer`   | Implementation code in `src/cli/**` — new features, bug fixes, refactors, type tightening                                                   | Test code (use `cli-tester`), standards docs (use `codex-keeper`)               |
| `cli-tester`      | Test code — `**/*.test.ts(x)`, `e2e/**`, factories, fixtures, `__tests__/helpers/`                                                          | Production code in `src/cli/**` (use `cli-developer`)                           |
| `codex-keeper`    | Standards/docs curation under `.ai-docs/standards/**` only. Bible audits, standards drift, convention docs, agent-findings triage           | Production or test code. Scope is strictly `.ai-docs/standards/` unless widened |
| `general-purpose` | Read-only investigations spanning many files, cross-repo greps, "where does X live" research, tasks that do NOT need specialist conventions | Writing code or tests (delegate to specialist instead)                          |

**Tie-breakers:**

- Mixed code + tests → two sequential delegations (developer first, tester second), not one merged prompt.
- "Check and fix if drift" on standards → `codex-keeper`, not `general-purpose`.
- Pure read-and-report → `general-purpose` is cheapest.

### 8.2 Required Boilerplate for Every Delegation

Every sub-agent prompt MUST open with these lines verbatim (or equivalent):

```markdown
Read the repository root `CLAUDE.md` before starting.
Do NOT run ANY git commands (no add/reset/stash/checkout/restore/clean/commit).
Scope: <explicit path fence — e.g. ".ai-docs/standards/** only" or "src/cli/lib/configuration/**">.
If you fix an anti-pattern, discover a missing standard, or notice convention drift,
write a finding to `.ai-docs/agent-findings/` using `.ai-docs/agent-findings/TEMPLATE.md`.
Self-review your output against CLAUDE.md before reporting.
Report format: <terse sections the parent expects — e.g. "(a) coverage (b) additions (c) findings (d) next-iter suggestion, under N words">.
```

**Why each line exists:**

- `Read CLAUDE.md` — sub-agents default to generic Claude behavior without it; project conventions are invisible.
- `Do NOT run git commands` — the user curates staging intentionally; sub-agents otherwise run `git add .` reflexively.
- `Scope` — prevents the iter-54 class of bug where `cli-tester` reinterpreted "tighten these tests" as "tighten any adjacent tests it noticed" and the iter-55 class where `codex-keeper` wandered outside `.ai-docs/standards/`.
- `Finding instruction` — without this, drift discoveries die in the sub-agent turn and don't accrete.
- `Self-review` — sub-agents will confidently violate CLAUDE.md rules they read 10k tokens ago; re-checking before reporting catches it.
- `Report format` — free-form reports waste parent context; structured reports let Ralph iterations compose.

### 8.3 Ralph-Loop / Batched Iteration Patterns

Ralph-style audits (fixed N iterations, one focus area per iter) have distinct ergonomics:

**DO:**

- Give each iter a **single focus file or standard** (one path, not a theme).
- Require a **numbered report** with fixed sections (e.g. `(a) coverage (b) additions (c) findings (d) next-iter suggestion`) so the parent can chain iters without re-prompting.
- Cap report length explicitly (`250-300 words`) — otherwise iteration N+1's context is half-consumed by iter-N's prose. See [`loop-prompts-bible.md` §8.4](./loop-prompts-bible.md#84-report-length-caps) for the authoritative table of report-length caps and iteration cadence.
- Cross-reference recent iter outcomes when relevant (`"the cli-tester scope-boundary misinterpretation from iter 54"`) — this catches recurrence.
- End each iter with a concrete next-iter suggestion, so the loop has momentum even when the parent is autonomous.

**DO NOT:**

- Chain multiple standards into one iter ("audit prompt-bible AND e2e-standards AND commit-protocol") — reports bloat, findings get muddled.
- Let iters skip the finding-write step when drift is detected — the whole point of the loop is accretion.
- Run the same focus twice without noting it in the second iter's report — silent re-audit == wasted turn.

### 8.4 Anti-Patterns (Observed in This Repo)

**Terse one-liner delegation → shallow work.**

- ❌ `"Fix the test in foo.test.ts"` — sub-agent picks the narrowest interpretation, doesn't read CLAUDE.md, produces a surface patch that violates factory-usage rules.
- ✅ Full boilerplate + explicit task + expected deliverables + report format.

**Vague scope → collateral edits.**

- ❌ `"Tighten assertions in the wizard tests"` — `cli-tester` will "tighten" 12 adjacent files (iter 54).
- ✅ `"Scope: src/cli/components/wizard/step-confirm.test.tsx ONLY. Do not touch any other file."`

**Missing context → hallucinated patterns.**

- ❌ Sending `cli-developer` to touch `local-installer.ts` without pointing at `resolveInstallPaths` and the scope-awareness rules in CLAUDE.md.
- ✅ Quote the relevant CLAUDE.md rule verbatim in the prompt or link it.

**Delegating standards curation to `general-purpose`.**

- ❌ `general-purpose` will read the file and report what's there — it will not enforce project conventions, agent-findings protocol, or write findings. Use `codex-keeper`.

**Re-audit without memory.**

- ❌ Running the same Ralph iter (same focus file) twice in a row without diffing against the previous iter's report → second iter produces near-identical findings and wastes a turn.
- ✅ Parent passes "previous iter's findings" into the new prompt, or the skill tracks focus rotation.

### 8.5 Delegation Prompt Template

```markdown
<role>
Delegating to <agent-name> for <one-line task>.
</role>

<preamble>
Read the repository root `CLAUDE.md` before starting.
Do NOT run ANY git commands.
Scope: <path fence>.
If you fix an anti-pattern or discover drift, write a finding to `.ai-docs/agent-findings/` via TEMPLATE.md.
Self-review against CLAUDE.md before reporting.
</preamble>

<task>
<concrete task with expected deliverables>

<expansion modifier — ONLY if the task is genuinely broad; see Technique #6. Omit it otherwise,
because on a scoped task it is an instruction to exceed the scope and will be obeyed.>
</task>

<context>
<relevant CLAUDE.md rules quoted verbatim>
<pointers to existing patterns / factories>
</context>

<constraints>
- <file-level constraints>
- <what NOT to modify>
</constraints>

<report_format>
<structured sections the parent expects, with length cap>
</report_format>
```

### 8.6 Built-In Agent Partials Are Product Content

Everything under `src/agents/**` compiles into whatever project runs the CLI. A partial is not a
note to ourselves — it is a prompt that will execute in a repository nobody here has seen. So **a
partial may not name a path, file, or convention that exists only in this repository**: `.ai-docs/**`,
`CLAUDE.md`, `todo/**`. In the installing project those do not exist, and an agent told to write a
finding to `.ai-docs/agent-findings/` either creates an orphan directory the project never reads or
reports that it could not comply. A `CLAUDE.md` citation is worse in kind: it points the user's
agent at a rule it can neither read nor verify.

Delegation boilerplate that belongs to _our_ workflow — the findings protocol, the git-staging
prohibition as "per CLAUDE.md" — belongs in the delegating prompt of [Section 8.2](#82-required-boilerplate-for-every-delegation), not in the compiled agent.

**Two exceptions, both narrow:**

1. The `meta/` agents, whose stated job is curating an `.ai-docs/` tree. A project adopting
   `codex-keeper` plausibly adopts the convention with it.
2. The same rule restated in project-agnostic terms. "Never run git commands that modify the staging
   area or working tree" is fine; "(per CLAUDE.md)" is not. "Record a finding the way this project's
   conventions direct" is fine; naming our directory and our template file is not — including inside
   a parenthetical that says "for this repository", which reads in the installing project as _their_
   repository.

**The check:**

```bash
grep -rn "ai-docs\|CLAUDE\.md" src/agents/ --exclude-dir=meta
```

It must return nothing. Two ways to get a false clean from it:

- **Exclude by `--exclude-dir`, never by a pipe.** `grep -rn` prints `path:line:text`, so
  `| grep -v meta` filters the **text** while looking like it filters the **path** — it drops any
  line whose body happens to say "meta" and keeps `meta/` files whose lines do not.
- **Do not add `agents-inc` to the pattern.** Every `metadata.yaml` opens with a
  `# yaml-language-server: $schema=...` comment naming the GitHub org. That is editor tooling, not
  prompt content, and including the term returns one false hit per agent and buries the real ones.

This class is invisible in-repo, because every path resolves correctly here. It fails only after
publication, in someone else's project, where nobody reports it back — which is why it needs a grep
rather than a reviewer.

---

## Conclusion

This structure represents the convergence of:

- **Anthropic's official guidance** - XML tags, document placement, system prompts, context engineering
- **Production systems** - Aider: 72.7% SWE-bench, Augment: 65.4% SWE-bench Verified, Refact.ai: 74.4% SWE-bench Verified, Mini-SWE: 65%+
- **Academic research** - Prompt structure impact, few-shot examples, chain-of-thought
- **Community validation** - Thousands of developers confirming patterns
- **November 2025 Claude 4.5 optimizations** - Expansion modifiers, extended thinking, context engineering

**Key Principles to Remember:**

1. **Self-reminder loop is THE most important technique** - Prevents instruction drift (60-70% reduction)
2. **Investigation-first prevents 80% of hallucinations** - Never speculate about code
3. **Emphatic repetition increases compliance by 40-50%** - `<critical_requirements>` at TOP + `<critical_reminders>` at BOTTOM
4. **XML tags provide 30%+ accuracy improvement** - Semantic boundaries matter
5. **Documents first, query last gives 30% performance boost** - For 20K+ tokens
6. **Expansion modifiers are conditional** - Counter conservative defaults on genuinely broad tasks; on well-scoped ones they inflate the deliverable
7. **Self-correction triggers provide mid-run guidance** - 74.4% SWE-bench with this pattern
8. **Post-action reflection improves long-horizon reasoning** - Pause and evaluate after tool use
9. **Progress tracking maintains orientation** - Essential for 30+ hour sessions
10. **Positive framing improves adherence** - Tell what TO do, not just what NOT to do
11. **"Think" alternatives prevent Opus 4.5 confusion** - Use consider, evaluate, analyze
12. **Just-in-time loading preserves context** - Load content when needed, not upfront
13. **Write verification prevents false-success reports** - Re-read files after edits, close with dual reminder

**Validation Metrics:**

- Aider: 72.7% on SWE-bench (Sonnet 4)
- Refact.ai: 74.4% on SWE-bench Verified (with mid-run guidance)
- Augment: 65.4% on SWE-bench Verified
- Mini-SWE: 65%+ with just 100 lines of Python
- All use these patterns

**Deploy with confidence.**
