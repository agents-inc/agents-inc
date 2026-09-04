---
last_validated: 2026-04-21
---

# The Definitive Guide to Optimal Prompt Structure for Claude

**Version:** 3.0
**Target Model:** the Claude 5 family (Opus 5, Sonnet 5, Fable 5.1)
**Paths and commands in this document are relative to `packages/cli`**, the workspace it documents
and the directory it lives under — run them from there. A compiled sub-agent, by contrast, runs from
whatever project invoked the CLI, so an agent's own prompt spells the same paths from that root.

**Purpose:** This document provides universal prompt engineering techniques that work for any Claude agent system. These techniques are validated by Anthropic research, production systems achieving 72.7%+ on SWE-bench, academic research, and community consensus.

---

## Performance Metrics at a Glance

| Practice                       | Impact                                                 | Evidence Source                       |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------- |
| Deterministic completion gates | A check that runs, rather than one asked for           | Claude Code hooks contract            |
| Investigation-first            | 80%+ ↓ hallucination                                   | Aider, SWE-agent, Community           |
| Critical rules stated once     | Adherence up; emphasis kept for the rule that needs it | Opus 4.5+ system-prompt guidance      |
| XML tags                       | 30%+ ↑ accuracy, 60% ↓ format errors                   | Anthropic training data               |
| Documents first, query last    | 30% ↑ performance                                      | Anthropic research (75K tokens)       |
| Expansion modifiers            | Full capability on genuinely broad tasks               | Conditional — counters a literal read |
| Self-correction triggers       | 74.4% SWE-bench with mid-run guidance                  | Refact.ai production                  |
| Post-action reflection         | Improved long-horizon reasoning                        | Anthropic context engineering         |
| Progress tracking              | 30+ hour session focus                                 | Anthropic experiments                 |
| Just-in-time loading           | Preserves context window                               | SWE-agent, Aider                      |
| Cache-stable prompt prefix\*   | The prefix survives releases and edits                 | Prompt caching                        |
| Write verification             | Prevents false-success reports                         | All agents (production use)           |

\* Every row but this one is a technique in §1. The cache-stable prefix is taught in §2's section
ordering and §5's Cache checklist instead, because it is a property of the whole prompt rather than
a block an author writes.

---

## Table of Contents

1. [The Essential Techniques](#1-the-essential-techniques)
2. [Optimal Prompt Structure & Ordering](#2-optimal-prompt-structure--ordering)
3. [XML Tag Standards](#3-xml-tag-standards)
4. [Choosing the Model and the Effort](#4-choosing-the-model-and-the-effort)
5. [Production Validation Checklist](#5-production-validation-checklist)
6. [Worked Examples](#6-worked-examples)
7. [Troubleshooting Common Issues](#7-troubleshooting-common-issues)
8. [Multi-Agent Delegation (Project-Specific)](#8-multi-agent-delegation-project-specific)

---

## 1. The Essential Techniques

### Technique #1: Deterministic Completion Gates

**The Pattern:**

A `Stop` hook on the agent's own frontmatter, running the checks that decide whether the work is
done:

```yaml
hooks: { "Stop": [{ "hooks": [{ "type": "command", "command": "<the project's gates>" }] }] }
```

The command exits 2 when a check fails. Exit 2 blocks the stop, and the command's output is
returned to the agent, so a failing typecheck comes back as the errors themselves and the agent
iterates on them.

**Why It Works:**

- A process that runs is a different kind of claim from a sentence asking the model to check its
  work. The first happens whether or not the model decided to; the second is advice.
- The feedback is the compiler's or the linter's own output, which is specific in a way a
  self-review is not.
- It costs no prompt bytes on any invocation, where a reminder costs its length on all of them.

**The forms it replaces are still on disk, which is the trap.** Agents not yet migrated carry
`**(You MUST ...)**` parentheticals, `→ STOP` checkpoints and `## CRITICAL` headings. They are not
current practice: emphasis spent on every rule is emphasis on none, and an instruction the model is
asked to restate costs its bytes on every invocation while no downstream step consumes the
restatement. Copying an agent that carries them reintroduces them, so take the shape and the voice
from an agent this roster does not name:

```bash
grep -rlE '\*\*\(You MUST|→ STOP|## CRITICAL|⚠️' src/agents --include='*.md'
```

**Application:**

**The compile composes the gate in; the author's job is to leave it alone or replace it
deliberately.** Any agent whose `tools` include `Write` or `Edit` gets a stop hook automatically,
with the command in `COMPLETION_GATE_COMMAND` (`../compile/src/agent-source.ts`) — already inert
where there is no npm, no `package.json`, or no such script. **Declaring `hooks:` in `metadata.yaml`
merges with that gate rather than displacing it: declaring a stop hook of your own replaces the
gate, and every other event is added beside it.** So an agent that writes and states a `PostToolUse`
formatter keeps its gate, and an agent that means to own its completion checks says so by declaring
`Stop` and nothing weaker. Where the project declares its own gates, the hook runs those; where it
declares none, the hook exits 0 and stays out of the way. Keep the gate's command inert when it
cannot be correct — an agent installed into a project with no such checks must still be able to
finish.

The emitted key is `Stop`, which Claude Code rewrites to `SubagentStop` when it registers a
sub-agent's frontmatter hooks; `Stop` also fires natively for an agent run as the main session
through `--agent`, where `SubagentStop` never would. Both spellings therefore count as declaring
your own gate. That contract, and the fact that a project-scope compiled agent's hooks are skipped
altogether in a project whose trust dialog was never accepted, are owned by
[`../reference/features/compilation-pipeline.md`](../reference/features/compilation-pipeline.md).

---

### Technique #2: Investigation-First

**The Pattern:**

The template renders this discipline into every compiled agent from
`src/agents/_templates/methodologies/operating-principles.liquid`, whose first two principles carry
it: **work from what you have read**, and **treat a specification as a claim** — every path, symbol
and count in it was measured against a tree that has since moved.

Read the partial for the wording rather than a copy of it here; a pasted copy goes stale the moment
the partial is edited.

**Why It Works:**

- Grounds every claim in something the agent actually opened, which is what separates a report from
  a guess about a plausible codebase.
- The second half is the one people leave out: the instruction an agent is following was also
  written against a tree, and re-deriving is what stops a stale brief becoming a stale change.

**Impact & Evidence:**

- **80%+ reduction in hallucination issues**
- Aider, SWE-agent, Cursor: all require file reading before action
- Anthropic guidance: "Always ground responses in provided context"

**Application:**

The baseline already carries it, so an agent's own files add only the reads particular to the role —
which two existing agents to open, which reference document governs, which command shows the current
state. Restating the general discipline in an agent's own prompt duplicates a rendered block, which
§5's checklist rules out.

---

### Technique #3: State Critical Rules Once, Plainly

**The Pattern:**

```markdown
<critical_requirements>

**Register the agent in `.claude-src/config.ts`.** One with source files and no config entry
compiles into nothing.

**Read the wizard's own store before changing a step.** `stores/wizard-store.ts` holds the guards,
and a step edited without them re-enables a transition the guards refuse.

</critical_requirements>
```

Both example rules name something only one role would reach for. **A rule that
`operating-principles.liquid` already renders belongs in no agent's own files** — check a candidate
against that partial's principles before writing it, because a rule true of every agent is one the
template states once for all eighteen.

Each rule opens with the action in bold, and gives its reason in the same breath. The rule is
stated once, in the place it applies.

**Why It Works:**

- An instruction that says what to do can be followed directly; one that says what to refrain from
  has to be inverted first, and the inversion is where the reader supplies their own answer.
- Emphasis is a budget. A prompt that shouts at every rule has no way left to mark the one rule
  that genuinely governs, and frontier models read a uniformly emphatic document as uniformly
  ordinary.
- A rule repeated verbatim at the top and the bottom doubles its cost on every invocation and adds
  no information the second time.

**What It Replaces:**

The `**(You MUST ...)**` convention, the `CRITICAL:` prefix, ALL-CAPS runs, and the practice of
repeating `<critical_requirements>` verbatim as `<critical_reminders>`. Also the closing
consequence line ("Failure to follow these rules will produce non-compliant agents") — fear framing
buys nothing from a model that was going to follow the rule anyway, and nothing from one that was
not.

`<critical_reminders>` stays useful when it adds something: the standing consideration a reader
should hold while working, rather than a copy of the block above.

**Formatting that Works:**

- **Bold** for the claim that opens a paragraph
- `code` for file names, commands and XML tags
- Plain sentences for everything else

**Application:**

Write each rule as the action to take. Where a prohibition has no positive form — a genuinely
forbidden operation, such as a git command that rewrites history — state it once, plainly, and say
what to do instead.

---

### Technique #4: XML Tags for Semantic Boundaries

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
- Confine changes to the profile feature; the authentication system stays as it is
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
- Creates semantic boundaries between sections, preventing instruction mixing
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
Wrap all major sections in semantic XML tags, and keep nesting to three levels or fewer.

---

### Technique #5: Documents First, Query Last

**The Pattern:**

```markdown
<documents>
<document index="1">
<source>filename.py</source>
<document_content>
[Full file content — place at the top]
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
- Lets Claude internalize the context before applying instructions, rather than juggling both

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

### Technique #6: Conditional Expansion Modifiers

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
- Only where the model demonstrably under-delivers — on an already-scoped task the modifier is an instruction to exceed the scope

**Why It Works:**

- The current models are trained for precise instruction following
- On a broad task it otherwise delivers the narrowest reading that technically complies
- A narrow reading of a broad brief is the failure this counters
- Naming the breadth the task actually has grants permission without asking for volume

**The Conditional Rule:**
Apply an expansion modifier where the model demonstrably under-delivers, and nowhere else. Literal instruction following cuts both ways: a broad task read narrowly is a real failure mode, and a narrow task carrying a volume modifier is an instruction to over-deliver that will be obeyed just as precisely. The modifier calibrates the deliverable to the task — it is not an ingredient every prompt needs.

**Additional Patterns:**

**Explicit Permission:**

```markdown
Feel free to refactor architecture if needed to achieve the goal.
You have permission to make substantial changes within [scope].
```

**Impact & Evidence:**

- Recovers full capability on genuinely broad tasks
- Counters a conservative reading of a broad brief
- Anthropic: a model asked for a narrow thing delivers a narrow thing
- Community: "Single most important change needed from 3.5 to 4.x"
- Solves the widespread "Claude 4 is less helpful than 3.5" complaint

**Case Study — What the Unconditional Form Cost:**
Applied to every prompt regardless of task breadth, these modifiers produce the inverse defect: the
reviewer agents carried them as a standing instruction and returned speculative refactors the owner
stopped using. They reached 25 agent prompts because this technique prescribed them — and the sweep
that retired the offending phrase verified itself with a zero-hit grep while the technique went on
prescribing the same volume in a second vocabulary. A phrase-level grep returning zero is evidence
about one wording, never about the rule that produced it — verify a mandate's removal by reading the
technique it came from.

**Key Modifiers That Work:**

- "Be thorough on what the task needs and silent on the rest — the work's size follows the task's size, not the template's"
- "This task is genuinely broad: cover [the dimensions it actually has]"
- "Include the edge cases and error handling the task actually calls for"
- "Feel free to refactor entire architecture if needed" (scoped permission, not a volume request)

**Modifiers That Backfire:**

- ❌ Anything asking for a maximum count of features or interactions
- ❌ Anything asking to go past the task's basics for its own sake
- ❌ Any standing pairing of "thorough" with "comprehensive"

These ask for volume rather than fit. They were retired from this bible and from the bundled agent prompts in the reviewer-restraint pass; the modifiers above are the replacements.

**Application:**
Add an expansion modifier when the task is genuinely broad and a literal reading would under-deliver. When unsure, state the breadth the task has rather than asking for more than it has.

---

### Technique #7: Self-Correction Triggers (Mid-Run Guidance)

**The Pattern:**

```markdown
<self_correction_triggers>

## Self-Correction Checkpoints

- [the observable moment, stated as the thing you notice yourself doing] → [the action that answers it]

</self_correction_triggers>
```

For wording, read the shipped blocks rather than a copy here —
`src/agents/meta/agent-summoner/critical-requirements.md` and
`src/agents/meta/skill-summoner/critical-requirements.md` each carry one trigger, which is what the
Application below leaves after the duplicates are removed.

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
Include the triggers particular to the agent's domain and no more. There is no floor: an agent whose
moments are all named elsewhere in its own prompt carries none.

**A trigger is not a duplicate of the workflow step it corresponds to, and the difference is what
earns it its bytes.** A workflow step says what to do at a point in the process; a trigger names the
observable moment before a mistake — noticing yourself reaching for a remembered pattern, noticing
that a file is about to be rewritten uncatalogued — and gives the action that answers it. The
workflow is read once at the start; the trigger is what the model re-reads mid-task. So a trigger
whose moment is already named elsewhere earns nothing, while one that compresses a workflow step
into the instant it applies is the technique working as intended.

The corrective is always the thing to do rather than a halt.

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

Carry the answers into the next step, and into your report.
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
Add reflection prompts after tool-use sections or at natural decision points. Each question names
something particular to the role, as `agent-summoner/critical-reminders.md` and
`skill-summoner/critical-reminders.md` do — the four in the block above are the shape, not the
content.

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
The template renders the report contract into every compiled agent from
`src/agents/_templates/methodologies/operating-principles.liquid` — the decisions made
and why, the gotchas hit, and the work deliberately left with what stopped it. A
`<progress_tracking>` block earns its bytes only where it adds something that baseline does not,
such as confidence levels on a role whose findings are graded.

---

### Technique #10: Just-in-Time Context Loading

**The Pattern:**

```markdown
<retrieval_strategy>
**Just-in-Time Loading:**

- Start with file paths and naming patterns
- Load detailed content when a step needs it
- This preserves context window for actual work
  </retrieval_strategy>
```

**Why It Works:**

- Preserves context window space, so what is loaded can be explored more deeply
- Matches how production agents (SWE-agent, Aider) operate

**Impact & Evidence:**

- Anthropic: "Maintain lightweight identifiers and dynamically load data at runtime"
- Context engineering principle: "smallest set of high-signal tokens"
- Production systems use glob/grep before full file reads

**Application:**
The baseline's "Work from what you have read" covers grounding, and which search to run is the
model's to choose. A `<retrieval_strategy>` block earns its bytes only where a role has a retrieval
rule its own domain imposes — a fixed order of sources, or a tree it must list before reading
anything in it.

---

### Technique #11: Write Verification

**Superseded by Technique #1.** An instruction to re-read a file after editing it is the explicit
verification the completion gate now performs mechanically — the gate runs the project's typecheck when the agent stops, and a failing check comes back as the tool's own output. A
prompt-text copy of that check is charged on every invocation of every agent and asks a frontier
model to do by hand what a hook does for free, so the baseline no longer carries one. What the
baseline keeps is the half no hook can settle: name the specific thing that would catch a
violation, or say plainly that nothing would.

The gap the gate leaves is a role whose output is files no build reads — documentation, for one.
That role's own `critical-requirements.md` is where a read-back belongs, stated once for that role
rather than for all eighteen.

---

## 2. Optimal Prompt Structure & Ordering

Based on convergent evidence from Anthropic, production systems, and academic research.

### The Canonical Structure

This is what `src/agents/_templates/agent.liquid` renders. The six source files an agent is authored
as map onto it: `metadata.yaml` becomes the frontmatter, `identity.md` becomes `<role>`,
`critical-requirements.md` and `critical-reminders.md` are wrapped by the template, and `playbook.md`
and `output.md` are inserted as written.

```markdown
---
name: agent-name
description: What it does, and when to invoke it
tools: Read, Grep, Glob, Bash, Skill
model: opus
permissionMode: default
hooks: { "Stop": [...] } # the completion gate, emitted for agents that write
skills:
  - preloaded-skill-id
---

<!-- Generated by agents-inc — do not edit; compile rewrites this file -->

# Agent Title

<role>
[Who this agent is, what it decides, and the boundary of its domain — including where work that
is not its own is handed off to]
</role>

---

<operating_principles>
[The shared discipline every agent carries. Rendered by the template from one partial; an agent
does not restate it]
</operating_principles>

---

<critical_requirements>
[The few rules specific to this role, each stated once as the action to take]
</critical_requirements>

---

[playbook.md — the process the agent follows]

---

<critical_reminders>
[Standing considerations to hold while working. Something the requirements block did not say]
</critical_reminders>

---

[output.md — the shape of what it emits, last of the stable blocks so it is read most recently]

---

<system-reminder>
[Everything assembled at compile time from the project's configuration: the compile version, and
the skills available to load. The template writes this block; an agent's source files do not]
</system-reminder>
```

### Section Ordering Rationale

The order is a cache decision before it is an editorial one.

**A compiled agent is its sub-agent's system prompt**, so the file's leading bytes are the cacheable
prefix of every invocation of it. Two things in a compiled agent change without the agent's role
changing: the release that compiled it, and the project's skill selection, which moves whenever a
user edits their stack. Both used to sit above the largest static blocks, so a patch release or a
stack edit invalidated the playbook and the output format beneath them.

So:

1. **Everything stable first** — identity, principles, requirements, process, reminders, output
   shape. This is the prefix, and it changes only when the role changes.
2. **Everything volatile last**, in one `<system-reminder>` block at the end — with one carve-out
   the format forces: the frontmatter keys Claude Code pins to the top of the file, of which
   `skills:` is the one assembled from the project's configuration. Everything else assembled at
   compile time goes in the trailing block.
3. **Nothing per-run, per-machine or per-user anywhere.** No timestamps, no absolute paths, no user
   details. The provenance marker carries no version for this reason — the release that compiled an
   agent is recorded in the trailing block, where a change to it costs nothing.

Within the stable half the order is ordinary: identity before rules, rules before process, process
before output shape. Front-loading matters less than it did — the reason to put the role first is
that a reader needs to know who they are before they can weigh anything else, not that a model
forgets what it read.

---

## 3. XML Tag Standards

### Required Tags in a Compiled Agent

```xml
<role>
[Agent's role definition]
</role>

<operating_principles>
[The shared discipline, rendered by the template from one partial — an agent does not write this]
</operating_principles>

<critical_requirements>
[The rules specific to this role, each stated once as the action to take]
</critical_requirements>

<output_format>
[Expected response structure]
</output_format>
```

`<critical_reminders>` is optional and belongs with the recommended tags below: it earns its place
only by adding a standing consideration the requirements block did not state.

### Required Tags in a Delegation Prompt

A delegation prompt is the one message an agent hands a sub-agent — written per invocation, never
compiled. It opens with the two the compiled prompt has no slot for, and §8.5's template is the
worked shape.

```xml
<task>
[What needs to be accomplished]
</task>

<constraints>
[The boundary of the change — what stays as it is, and where adjacent work hands off]
</constraints>
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
[Full file content — place at the top]
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
- `<critical_requirements>` (for rules at the top)
- `<critical_reminders>` (for a standing consideration the requirements block did not state)

**Name a tag for what it carries.** `<section1>`, `<part_a>`, `<info>` and `<content>` name a
position or a container rather than a role, so they carry nothing to the reader that the surrounding
text did not already say.

**Nesting Guidelines:**

- Keep nesting ≤3 levels deep
- Use flat structures when possible
- Semantic hierarchy over deep nesting

> **Skill files use a different tag set** — see [Skill-Content Tags (vs Agent-Prompt Tags)](#skill-content-tags-vs-agent-prompt-tags) below. The Required/Recommended tag lists in this section target agent and task prompts, not skill content files, which live at `src/skills/**/SKILL.md` in the `agents-inc/skills` marketplace repository rather than in this one.

### Skill-Content Tags (vs Agent-Prompt Tags)

Skill files — `src/skills/**/SKILL.md` in the `agents-inc/skills` marketplace repository, a separate repository from this one — are reference content loaded into a calling agent's context, not standalone agents. They use a stable, narrower tag vocabulary focused on teaching a single tool or domain. The marketplace's skills converge on the set below; a new skill matches it, and an audit flags drift. For the current count, run `find src/skills -name SKILL.md | wc -l` in that repository — a number stated here is correct on the day it is written and wrong within the week.

**Required tags (present in all skills):**

- `<critical_requirements>` — at the top, each rule stated once as the action to take (same semantics as agent prompts)
- `<patterns>` — the core pattern library, numbered (Pattern 1, Pattern 2, ...)
- `<red_flags>` — anti-patterns, gotchas, common mistakes with consequences

**Common optional tags (include when the domain warrants):**

- `<philosophy>` — why this tool, when to use it, the mental model it asks for
- `<critical_reminders>` — at the bottom, where it adds a standing consideration the requirements block did not state. A verbatim repeat of that block is loaded on every use of the skill and says nothing the second time, which is why this is optional rather than required
- `<decision_framework>` — comparative "pick X vs Y" guidance (e.g. Zustand vs Context, SWR vs React Query)
- `<performance>` — perf tuning section separate from the main patterns
- `<migration_notice>` — version-migration callout when a major version shift matters (e.g. Remix v2 → v3)

**Deliberately excluded from skills** (agent-prompt patterns that do not apply):

- `<integration>` — naming a sibling skill couples the two, which is the atomicity bible's Category 3. An adjacent concern belongs under **Handled elsewhere**, named as a capability rather than as the tool that provides it
- `<operating_principles>` — skills are context, not agents; the calling agent carries its own discipline
- Completion gates (Technique #1) — a gate belongs to the agent that stops, not to the knowledge it loaded
- `<role>`, `<task>`, `<constraints>`, `<output_format>` — skills describe a tool, not a job to execute
- `<investigation_requirement>`, `<self_correction_triggers>`, `<post_action_reflection>`, `<progress_tracking>` — agent-execution concerns

Reviewers auditing a skill against this bible should use the list above. A skill carries all three required tags; missing one is drift. A skill using tags outside the required + optional set (e.g. inventing `<guidelines>` or `<overview>`) is drift — either the tag should be added to this list (if genuinely reusable across ≥3 skills) or the skill should be refactored into the canonical vocabulary.

---

## 4. Choosing the Model and the Effort

Three keys on an agent's `metadata.yaml` are part of the prompt's design rather than separate from
it — a prompt written to compensate for an under-powered model is a prompt carrying work the model
should be doing.

`ModelName` is `"opus" | "sonnet" | "haiku" | "fable" | "inherit"`, and `EffortLevel` is
`"low" | "medium" | "high" | "xhigh" | "max"`. The axis is documented end to end in
[`reference/features/model-and-effort.md`](../reference/features/model-and-effort.md); what follows
is how to pick.

**Model.** Match it to the hardest judgement the role makes, not to the volume of work it does. A
role that decides — planning a change, reviewing a diff, designing an agent — earns the largest
model. A role whose work is mechanical once the decision is made can take a smaller one and run
more often for the same cost. `"inherit"` hands the choice to whoever invoked the agent, which is
right when the same role is sometimes trivial and sometimes not.

**This product's own agents do not vary the axis: all eighteen carry `model: opus`** (owner ruling,
2026-09-03). The paragraph above is how to choose for a consuming project's agents, where the cost
of a role is the project's to weigh. Here the answer was settled on simplicity — every shipped role
makes a judgement a smaller model would do worse, and a fleet with one answer needs no per-agent
justification to keep current. Do not "optimise" a shipped agent down a tier; that is the ruling,
not an oversight. Census: `grep -c "^model: opus" src/agents/*/*/metadata.yaml`.

**Effort.** This is the dial to reach for before reaching for a bigger model. A verification pass
that has to be adversarial wants `xhigh`; a mechanical sweep over many files wants `low` and more
of them. Omitting it inherits the session's level, which is usually correct.

**Cache lifetime.** `experimental.cacheTtl` decides how long the compiled prompt's cache lives.
Everything above the trailing `<system-reminder>` is byte-identical between invocations, so the TTL
is what decides whether a second invocation reuses the first one's cache or rebuilds it. `5m` is
Claude Code's default; `1h` holds it across longer gaps, bills cache writes at a higher rate, and is
ignored while a subscription runs on usage credits. Leave it unset unless the person paying has
asked for it — the trade depends on how often the agent is invoked rather than on what it does.

**Writing for a frontier model.** Three things follow from writing for the current generation, and
each removes prompt text rather than adding it:

- **State the goal and the constraints; leave the method open** where more than one method would
  do. A prompt that prescribes steps the model would have chosen anyway costs bytes and forecloses
  a better route.
- **Skip the reminders about being careful.** Instructions to avoid typos, write clean code, or
  double-check arithmetic are answered by the model's ordinary behaviour, and they dilute the rules
  that are genuinely specific to the role.
- **Say when a task is genuinely broad**, because the default is to answer what was asked. This is
  Technique #6, and it is worth stating in proportion to the task rather than as blanket
  encouragement.

**Extended thinking is enabled by default** in Claude Code. The `think` / `megathink` / `ultrathink`
trigger keywords are deprecated and have no effect, and the advice that once sat here — to spell
"think" as "consider" or "evaluate" in prompts — was written for a model generation that is no
longer the target. Write the word you mean.

---

## 5. Production Validation Checklist

Check an agent against this before shipping it.

### Structure

- [ ] `<role>` states who the agent is, what it decides, and where work outside its domain is handed off
- [ ] `<critical_requirements>` carries only rules specific to this role — the shared discipline is in the template's `<operating_principles>` and is not restated
- [ ] Each rule is stated once, as the action to take, with its reason in the same breath
- [ ] `<critical_reminders>` adds something the requirements block did not say, or is absent
- [ ] `playbook.md` is the process; `output.md` is the shape emitted. Neither repeats the other
- [ ] Major sections carry semantic XML tags, nested no more than three deep

### Weight

- [ ] The prompt carries what the role needs in order to decide, and no reference material it could look up
- [ ] Detail that is needed occasionally arrives through a skill the agent invokes, or a file it reads
- [ ] Inline examples appear only where they fix an exact output shape; anything else names a real file to read
- [ ] Nothing in the prompt duplicates what the template already renders

### Cache

- [ ] Nothing per-run, per-machine or per-user anywhere in the prompt — no timestamps, absolute paths or user details
- [ ] Everything assembled at compile time is in the trailing `<system-reminder>` block, apart from
      the `skills:` frontmatter key the file format pins to the top

### Frontmatter

- [ ] `tools` grants what the role uses. A reviewing role reports rather than repairs, so it holds no `Write` or `Edit`
- [ ] `experimental.cacheTtl` is unset unless the person paying asked for the longer window
- [ ] `isolation` left unset unless the project has asked for a worktree — this repository does not use them
- [ ] `model` and `effort` match the work; a mechanical role does not need the largest model
- [ ] The completion gate is present for any agent that writes, and inert where the project declares no checks

### Content Quality

- [ ] Every sentence earns its place — no clause restating the one before it, no sentence that only sets up the next, no hedges
- [ ] Where two sentences carry one idea, the shorter one survives
- [ ] References to existing patterns name a file and a symbol
- [ ] Anti-patterns state the consequence, not just that they are bad
- [ ] Success criteria are measurable, and each names what would catch a later violation

---

## 6. Worked Examples

The agents under `src/agents/` are the worked examples — this section used to carry two
long before/after pairs, and both drifted into demonstrating a template that no longer exists.

**Two of the eighteen are written in the voice this document now defines**, and they are the ones to
copy the phrasing from:

| To see                       | Read                              |
| ---------------------------- | --------------------------------- |
| An agent that authors agents | `src/agents/meta/agent-summoner/` |
| An agent that authors skills | `src/agents/meta/skill-summoner/` |

The other sixteen still carry the retired forms — `**(You MUST ...)**`, `→ STOP` checkpoints and
`## CRITICAL` headings — mostly in their `critical-requirements.md` and `critical-reminders.md`.
They are current about the product: their tools, their domain and their process are accurate, and
they are still the place to read what a role is. It is the voice that is stale. The census, which
shrinks as they are migrated:

```
grep -rlE '\*\*\(You MUST|→ STOP|## CRITICAL|⚠️' src/agents \
  --include='*.md' --exclude-dir=agent-summoner --exclude-dir=skill-summoner
```

Read by role from any of them — `developer/web-developer/` for an implementation agent,
`researcher/cli-researcher/` for a read-only one, `reviewer/reviewer/` for a reviewing agent whose
tools are narrowed — and take the phrasing from the two above.

Each agent is six files. Read `metadata.yaml` and `identity.md` first, since between them they carry
the whole of what the role is, then `playbook.md` for how the process is written down.

To see what any of them compiles into, run `npx agents-inc compile` and open the file it writes
under `.claude/agents/`.

---

## 7. Troubleshooting Common Issues

| Symptom                                       | Usually                                                        | Try                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Claims about code the agent never opened      | The prompt asks for analysis without asking for the read first | Technique #2 — name the files to read, and say that claims come from what was read                                                |
| Scope grows past what was asked               | The prompt states the goal and not the boundary                | Give the role a `<domain_scope>` with an explicit hand-off list, and say that the task's own scope is the deliverable             |
| New abstractions where existing ones would do | Nothing tells the agent the codebase already has the utility   | Name the directories to search before writing anything new                                                                        |
| Reports success on an edit that did not land  | No read-back                                                   | Technique #1 — the gate returns the failing check; where no gate reaches the file, the role's own requirements name the read-back |
| Output shape varies between runs              | The output format is described in prose                        | Put a filled-in skeleton in `output.md` — this is the one place an inline example earns its bytes                                 |
| A rule in the prompt is ignored               | It is one emphatic line among fifty                            | Technique #3 — if everything is critical, nothing is. Cut the others, or move the rule into a gate that runs                      |
| An agent's answers are thinner than expected  | The task is genuinely broad and the prompt does not say so     | Technique #6, phrased proportionally to the task rather than as blanket encouragement                                             |

Where a symptom keeps returning after a prompt change, prefer a mechanism over another sentence:
a completion gate, a narrower tool grant, or a skill that carries the knowledge the agent kept
missing.

---

## 8. Multi-Agent Delegation (Project-Specific)

This section covers patterns specific to this repo's sub-agent roster and Ralph-style iterative workflows. For the agents listed below, every delegation prompt opens with the boilerplate in [Section 8.2](#82-required-boilerplate-for-every-delegation).

### 8.1 Agent Selection

| Agent             | Use for                                                                                                                                         | Leave to                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `cli-developer`   | Implementation code in `src/cli/**` — new features, bug fixes, refactors, type tightening                                                       | Test code (use `cli-tester`), standards docs (use `codex-keeper`)               |
| `cli-tester`      | Test code — `**/*.test.ts(x)`, `e2e/**`, factories, fixtures, `__tests__/helpers/`                                                              | Production code in `src/cli/**` (use `cli-developer`)                           |
| `codex-keeper`    | Standards/docs curation under `.ai-docs/standards/**` only. Bible audits, standards drift, convention docs, agent-findings triage               | Production or test code. Scope is strictly `.ai-docs/standards/` unless widened |
| `general-purpose` | Read-only investigations spanning many files, cross-repo greps, "where does X live" research, tasks a specialist's conventions would not change | Writing code or tests (delegate to specialist instead)                          |

**Tie-breakers:**

- Mixed code + tests → two sequential delegations (developer first, tester second), not one merged prompt.
- Auditing a standard for drift → a read-only lane that reports with quotes and the command it ran.
  Repairing what the audit returned → `codex-keeper`, which owns `.ai-docs/**`, in a second
  dispatch. The verifier is never the fixer, so the two are never one lane.
- Pure read-and-report → `general-purpose` is cheapest.

### 8.2 Required Boilerplate for Every Delegation

Every sub-agent prompt opens with these lines, verbatim or in equivalent words:

```markdown
Read the repository root `CLAUDE.md` before starting.
Use git read-only — `status`, `log`, `show`, `diff`, `blame`, `stash list` — and leave every writing command to the user (`add`, `commit`, `reset`, `stash` push/pop/drop, `checkout`, `restore`, `clean`, `push`, `rebase`, `merge`, amend).
Scope: <explicit path fence — e.g. ".ai-docs/standards/** only" or "src/cli/lib/configuration/**">.
If you fix an anti-pattern, discover a missing standard, or notice convention drift,
write a finding to `.ai-docs/agent-findings/` using `.ai-docs/agent-findings/TEMPLATE.md`.
Run <the gate this lane can run — the project's gates for a writing lane, the §8.6 grep for an
agent-partials lane, §6's census for a voice migration> and report what it returned. Where the lane
has no runnable check, self-review your output against CLAUDE.md before reporting.
Report format: <terse sections the parent expects — e.g. "(a) coverage (b) additions (c) findings (d) next-iter suggestion, under N words">.
```

**Why each line exists:**

- `Read CLAUDE.md` — sub-agents default to generic Claude behavior without it; project conventions are invisible.
- The git rule, both halves — the user curates staging intentionally and sub-agents otherwise run `git add .` reflexively, while a reviewing agent still needs `git diff` to have anything to review.
- `Scope` — prevents the iter-54 class of bug where `cli-tester` reinterpreted "tighten these tests" as "tighten any adjacent tests it noticed" and the iter-55 class where `codex-keeper` wandered outside `.ai-docs/standards/`.
- `Finding instruction` — without this, drift discoveries die in the sub-agent turn and don't accrete.
- The gate first, self-review second — a check that runs happens whether or not the lane decided to, where re-checking is advice. Self-review stays for the lane that has no gate to run, because a sub-agent will confidently violate a rule it read 10k tokens ago.
- `Report format` — free-form reports waste parent context; structured reports let Ralph iterations compose.

### 8.3 Ralph-Loop / Batched Iteration Patterns

Ralph-style audits (fixed N iterations, one focus area per iter) have distinct ergonomics:

- Give each iter a **single focus file or standard** (one path, not a theme) — a chained iter ("audit prompt-bible AND e2e-standards AND commit-protocol") bloats its report and muddles its findings.
- Require a **numbered report** with fixed sections (e.g. `(a) coverage (b) additions (c) findings (d) next-iter suggestion`) so the parent can chain iters without re-prompting.
- Cap report length explicitly (`250-300 words`) — otherwise iteration N+1's context is half-consumed by iter-N's prose. See [`loop-prompts-bible.md` §8.4](./loop-prompts-bible.md#84-report-length-caps) for the authoritative table of report-length caps and iteration cadence.
- Cross-reference recent iter outcomes when relevant (`"the cli-tester scope-boundary misinterpretation from iter 54"`) — this catches recurrence.
- End each iter with a concrete next-iter suggestion, so the loop has momentum even when the parent is autonomous.
- Write the finding whenever drift is detected; accretion is the point of the loop.
- Name the previous iter's focus in this iter's report, so a silent re-audit is visible rather than a wasted turn.

### 8.4 Anti-Patterns (Observed in This Repo)

**Terse one-liner delegation → shallow work.**

- ❌ `"Fix the test in foo.test.ts"` — sub-agent picks the narrowest interpretation, doesn't read CLAUDE.md, produces a surface patch that violates factory-usage rules.
- ✅ Full boilerplate + explicit task + expected deliverables + report format.

**Vague scope → collateral edits.**

- ❌ `"Tighten assertions in the wizard tests"` — `cli-tester` will "tighten" 12 adjacent files (iter 54).
- ✅ `"Scope: src/cli/components/wizard/step-confirm.test.tsx — every other file stays as it is."`

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
Use git read-only — `status`, `log`, `show`, `diff`, `blame`, `stash list` — and leave every writing command to the user (`add`, `commit`, `reset`, `stash` push/pop/drop, `checkout`, `restore`, `clean`, `push`, `rebase`, `merge`, amend).
Scope: <path fence>.
If you fix an anti-pattern or discover drift, write a finding to `.ai-docs/agent-findings/` via TEMPLATE.md.
Self-review against CLAUDE.md before reporting.
</preamble>

<task>
<concrete task with expected deliverables>

<expansion modifier — only if the task is genuinely broad; see Technique #6. Omit it otherwise,
because on a scoped task it is an instruction to exceed the scope and will be obeyed.>
</task>

<context>
<relevant CLAUDE.md rules quoted verbatim>
<pointers to existing patterns / factories>
</context>

<constraints>
- <file-level constraints>
- <what stays as it is>
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
2. The same rule restated in project-agnostic terms. "Use git read-only — `status`, `log`, `show`,
   `diff`, `blame`, `stash list` — and leave every writing command to the user" is fine;
   "(per CLAUDE.md)" is not. "Record a finding the way this project's
   conventions direct" is fine; naming our directory and our template file is not — including inside
   a parenthetical that says "for this repository", which reads in the installing project as _their_
   repository.

**The check:**

```bash
grep -rn "ai-docs\|CLAUDE\.md\|todo/" src/agents/ --exclude-dir=meta
```

It must return nothing. Three ways to get a false clean from it:

- **Exclude by `--exclude-dir`, never by a pipe.** `grep -rn` prints `path:line:text`, so
  `| grep -v meta` filters the **text** while looking like it filters the **path** — it drops any
  line whose body happens to say "meta" and keeps `meta/` files whose lines do not.
- **Leave `agents-inc` out of the pattern.** Every `metadata.yaml` opens with a
  `# yaml-language-server: $schema=...` comment naming the GitHub org. That is editor tooling, not
  prompt content, so including the term returns one false hit per agent and buries the real ones.
- **Run it from `packages/cli`.** There is no `src/agents/` at the repository root, so from there
  grep writes `No such file or directory` to stderr, exits 2, and prints nothing on stdout — which
  reads as clean to anyone watching stdout, and to any wrapper checking output rather than status.
  This is the one of the three that a monorepo introduced: the check was written when this package
  was the repository.

This class is invisible in-repo, because every path resolves correctly here. It fails only after
publication, in someone else's project, where nobody reports it back — which is why it needs a grep
rather than a reviewer.

---

## Conclusion

**The techniques are the record.** §1's headings are the list, in the body's own words. A second
copy of them here would be a list nothing holds against the sections it names, and it would go on
reading as current after a section beneath it changed.

The figures behind these techniques are in the Performance Metrics table at the top, beside the
technique each one measures — which is the only place they can be checked against the claim they
support.
