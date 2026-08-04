# D-41: Create `agents-inc` Configuration Skill

## Refinement Document

**Status:** Ready for implementation
**Priority:** Medium
**Type:** Skill creation (SKILL.md + metadata.yaml, no TypeScript)
**Estimated effort:** Medium (single session)

## Implementation Overview

Create the `agents-inc` skill — a configuration knowledge skill that gives Claude deep expertise in the Agents Inc CLI's YAML config system. Unlike the original sub-agent design, this is a **skill** (SKILL.md + metadata.yaml), not an agent. This means:

- **Full interactivity** — the skill loads into the main Claude conversation, enabling natural back-and-forth with the user ("Which category should this be?" / "Want me to add it to the stack too?")
- **No orchestration needed** — no Task tool delegation, no fire-and-forget. Claude just _knows_ config.
- **Natural invocation** — the user says "use Agents Inc to register my skill" and Claude uses the knowledge directly
- **Zero context cost when not in use** — loaded on demand via Skill tool, not always embedded

The skill contains the full knowledge base: 38 category values, 18 agent names, SkillId format, all YAML schemas and field constraints, validation rules, and concrete examples.

**Absorbs D-40 (skill registration):** Instead of a flags-only `agentsinc register` CLI command, the user tells Claude to register a skill conversationally — Claude reads the SKILL.md, asks clarifying questions if the category is ambiguous, generates `metadata.yaml`, and wires the skill into `config.yaml`.

---

## 1. Why a Skill, Not an Agent

The original D-41 spec proposed a `config-manager` sub-agent. During refinement, we identified a fundamental UX problem: **sub-agents launched via the Task tool are not interactive**. They receive a prompt, run autonomously, and return a single result. No back-and-forth.

Config tasks frequently need clarification:

- "This skill could be `api-analytics` or `api-observability` — which fits?"
- "The stack already has a framework skill. Replace it or add alongside?"
- "This metadata is missing `usageGuidance`. What does this skill help with?"

A skill solves this naturally. It loads into the main Claude conversation, giving Claude the config expertise while preserving full interactivity with the user.

|                           | Sub-Agent (old design)       | Skill (new design)                |
| ------------------------- | ---------------------------- | --------------------------------- |
| User interactivity        | None                         | Full                              |
| Context cost when idle    | Zero                         | Zero (loaded on demand)           |
| Invocation                | `Task: config-manager "..."` | User: "Use Agents Inc to..."      |
| Clarification flow        | Impossible                   | Natural conversation              |
| Agent-to-agent delegation | Task tool                    | Parent loads skill via Skill tool |
| Knowledge base size limit | Unlimited (own context)      | Shares main context (~600 lines)  |

---

## 2. Open Questions

### SkillId Naming

| Question             | Proposed Answer          | Rationale                                                                                                                                                              |
| -------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What SkillId to use? | `meta-config-agents-inc` | Must follow the `${prefix}-${string}-${string}` format (3+ segments). `meta` prefix for shared/tooling skills, `config` as category segment, `agents-inc` as the name. |
| What category?       | `shared-tooling`         | Configuration management is tooling. Fits alongside other shared infrastructure concerns.                                                                              |
| What display name?   | `Agents Inc`             | Clean, matches how users naturally refer to it: "use Agents Inc to..."                                                                                                 |
| What model?          | Not specified (inherit)  | The skill provides knowledge, not a persona. The agent using it already has a model.                                                                                   |

### Scope Boundaries

| Question                                               | Answer                                                                                                                                                               | Rationale                                                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Does this skill teach how to CREATE skill directories? | No. It can REGISTER existing skills — read SKILL.md, infer category, generate metadata.yaml, wire into config.yaml. The skill-summoner creates actual skill content. | Separation of concerns — this skill handles YAML plumbing, skill-summoner handles content creation. |
| Does it teach compilation?                             | No. It advises to run `agentsinc compile` after changes.                                                                                                             | Compilation is a separate command. This skill is purely about config file structure.                |
| Does it handle agent-mappings.yaml?                    | No. `agent-mappings.yaml` was removed in D-43.                                                                                                                       | Stacks provide fine-grained skill-to-agent mapping now.                                             |
| Does it cover `.claude-src/config.yaml`?               | Yes, both `ProjectSourceConfig` and `ProjectConfig` fields.                                                                                                          | Same physical file serves dual purpose.                                                             |
| Where does the skill live?                             | `/home/vince/dev/skills/src/skills/meta-config-agents-inc/`                                                                                                          | Skills repo, following the standard skill directory pattern.                                        |

### Out of Scope

These are explicitly NOT covered by this skill:

- Writing SKILL.md content (skill-summoner handles this)
- Writing agent prompt files (agent-summoner handles this)
- Running CLI commands like `agentsinc compile`
- Creating TypeScript code
- Modifying JSON schemas (generated from Zod via `scripts/generate-json-schemas.ts`)

---

## 3. Skill Scope

### What the Skill Teaches Claude to Do

| Task                                     | Config Files Touched                       | Example                                                                               |
| ---------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Create metadata.yaml for a new skill     | `metadata.yaml`                            | Given skill name "posthog-flags" in category "api-analytics", generate valid metadata |
| Register an existing skill               | `metadata.yaml`, `.claude-src/config.yaml` | Read SKILL.md, infer category/description, generate metadata, wire into config        |
| Update metadata.yaml fields              | `metadata.yaml`                            | Add `compatibleWith` entries, update tags                                             |
| Add a new stack to stacks.yaml           | `config/stacks.yaml`                       | Add a "vue-fullstack" stack with Vue + Pinia + Vitest                                 |
| Update an existing stack                 | `config/stacks.yaml`                       | Add a new agent to an existing stack, change skill assignments                        |
| Add a new category to skills-matrix.yaml | `config/skills-matrix.yaml`                | Add "web-cms" category with proper fields                                             |
| Add/update relationship rules            | `config/skills-matrix.yaml`                | Add conflict between two skills, add recommendation                                   |
| Add/update skillAliases                  | `config/skills-matrix.yaml`                | Map display name "tanstack-router" to full skill ID                                   |
| Update .claude-src/config.yaml           | `.claude-src/config.yaml`                  | Add a new agent to the agents list, update stack mappings, add skills                 |
| Validate config files                    | Any of the above                           | Check a metadata.yaml against the JSON schema, report issues                          |

### What It Does NOT Cover

| Task                        | Who Handles It | Why                                        |
| --------------------------- | -------------- | ------------------------------------------ |
| Writing SKILL.md content    | skill-summoner | Config skill does YAML, not prompt content |
| Writing agent prompt files  | agent-summoner | Config vs content separation               |
| Running `agentsinc compile` | User / CLI     | Skill advises the user to run it           |
| Creating TypeScript types   | cli-developer  | Not a code skill                           |
| Updating JSON schemas       | cli-developer  | Generated from Zod via script              |
| Creating skill directories  | skill-summoner | Config skill writes into existing files    |

---

## 4. Skill File Structure

### Directory Layout

```
/home/vince/dev/skills/src/skills/meta-config-agents-inc/
  SKILL.md          # Full config knowledge base + workflow guidance
  metadata.yaml     # Skill catalog metadata
```

### SKILL.md

The SKILL.md contains everything that was split across 7 files in the agent design. Structure:

```markdown
---
name: meta-config-agents-inc
description: Agents Inc CLI configuration expertise — creates and validates metadata.yaml, stacks.yaml, skills-matrix.yaml, and config.yaml with correct schemas and enum values
---

# Agents Inc Configuration

> **Quick Guide:** Use this skill when creating, updating, or validating Agents Inc CLI configuration files.

**Auto-detection:** metadata.yaml, stacks.yaml, skills-matrix.yaml, config.yaml, skill registration, stack creation
**When to use:** Creating/updating any Agents Inc YAML config file, registering skills, adding stacks, validating config
**When NOT to use:** Writing SKILL.md content (use skill-summoner), writing agent prompts (use agent-summoner), TypeScript code changes

## Critical Requirements

[Non-negotiable constraints — equivalent to critical-requirements.md]

## Configuration Reference

### Valid Category Values (38)

[Full list from Section 5.1]

### Valid Domain Values (5)

[From Section 5.2]

### Valid Agent Names (18)

[From Section 5.3]

### SkillId Format

[From Section 5.4]

### metadata.yaml Schema

[From Section 5.5]

### stacks.yaml Schema

[From Section 5.6]

### skills-matrix.yaml Schema

[From Section 5.7 + 5.8]

### config.yaml Schema

[From Section 5.9]

### Schema Comment URLs

[From Section 5.10]

## Workflow

### Investigation First

[Read existing files before changes — equivalent to workflow.md investigation section]

### File-Specific Workflows

[Per-file creation/update procedures]

### Validation Checklist

[Post-write verification steps]

## Examples

[Concrete examples — equivalent to examples.md]

## Reminders

[Self-correction triggers and emphatic constraints — equivalent to critical-reminders.md]
```

### metadata.yaml

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/agents-inc/cli/main/packages/cli/src/schemas/metadata.schema.json
category: shared-tooling
author: "@vince"
displayName: Agents Inc
cliDescription: CLI configuration expertise
usageGuidance: Use when creating, updating, or validating Agents Inc CLI config files (metadata.yaml, stacks.yaml, skills-matrix.yaml, config.yaml). Also use for skill registration and stack creation.
tags:
  - configuration
  - yaml
  - schema
  - validation
  - tooling
  - registration
```

---

## 5. Knowledge Base

The SKILL.md must embed the following knowledge so Claude can generate valid configs without hallucinating values.

### 5.1 Valid Category Values (38 values)

Source: `src/cli/lib/schemas.ts` lines 70-109 (`SUBCATEGORY_VALUES`)

```
web-framework, web-styling, web-client-state, web-server-state, web-forms,
web-testing, web-ui-components, web-mocking, web-error-handling, web-i18n,
web-file-upload, web-files, web-utilities, web-realtime, web-animation,
web-pwa, web-accessibility, web-performance, web-base-framework,
api-api, api-database, api-auth, api-observability, api-analytics,
api-email, api-performance,
mobile-framework, mobile-platform,
shared-monorepo, shared-tooling, shared-security, shared-methodology,
shared-research, shared-reviewing, shared-ci-cd,
cli-framework, cli-prompts, cli-testing
```

### 5.2 Valid Domain Values (5 values)

Source: `src/cli/lib/schemas.ts` line 50 (`DOMAIN_VALUES`)

```
web, api, cli, mobile, shared
```

### 5.3 Valid Agent Names (18 values)

Source: `src/cli/lib/schemas.ts` lines 114-133

```
web-developer, api-developer, cli-developer, web-architecture,
agent-summoner, codex-keeper, convention-keeper, skill-summoner, cli-migrator,
pattern-scout, web-pattern-critique, web-pm, api-researcher,
web-researcher, api-reviewer, cli-reviewer, web-reviewer,
cli-tester, web-tester
```

### 5.4 SkillId Format

Pattern: `^(web|api|cli|mobile|infra|meta|security)-.+-.+$`
Minimum 3 dash-separated segments. Examples:

- `web-framework-react`
- `api-database-drizzle`
- `meta-methodology-anti-over-engineering`

### 5.5 metadata.yaml Required Fields

Source: `src/schemas/metadata.schema.json`

| Field               | Type     | Constraints                                                       | Required |
| ------------------- | -------- | ----------------------------------------------------------------- | -------- |
| `category`          | string   | Must be a valid Category (domain-prefixed, e.g., `web-framework`) | Yes      |
| `author`            | string   | Pattern: `^@[a-z][a-z0-9-]*$` (e.g., `@vince`)                    | Yes      |
| `displayName`       | string   | 1-30 chars                                                        | Yes      |
| `cliDescription`    | string   | 1-60 chars                                                        | Yes      |
| `usageGuidance`     | string   | Min 10 chars                                                      | Yes      |
| `categoryExclusive` | boolean  | Whether only one skill per category                               | No       |
| `tags`              | string[] | Each tag: `^[a-z][a-z0-9-]*$`                                     | No       |
| `requires`          | string[] | Skill IDs this skill depends on                                   | No       |
| `compatibleWith`    | string[] | Framework skill IDs this works with                               | No       |
| `conflictsWith`     | string[] | Skill IDs that cannot coexist                                     | No       |
| `requiresSetup`     | string[] | Setup skill IDs needed first                                      | No       |
| `providesSetupFor`  | string[] | Skills this setup skill configures                                | No       |
| `contentHash`       | string   | `^[a-f0-9]{7}$` (7-char hex)                                      | No       |
| `updated`           | string   | ISO date                                                          | No       |
| `domain`            | string   | Override domain inference                                         | No       |
| `custom`            | boolean  | True for non-built-in skills                                      | No       |

### 5.6 stacks.yaml Structure

Source: `src/schemas/stacks.schema.json`, `src/cli/lib/schemas.ts` lines 683-697

```yaml
stacks:
  - id: kebab-case-stack-id # Required
    name: Human-Readable Name # Required
    description: Brief description # Required
    agents: # Required - maps agent names to category skill assignments
      agent-name:
        category-key: skill-id-string # Bare string format
        category-key: # Object format
          id: skill-id-string
          preloaded: true
        category-key: # Array format (multiple skills)
          - id: skill-id-string
            preloaded: true
          - id: another-skill-id
    philosophy: Optional guiding philosophy text
```

**Three skill assignment formats** (all valid for the same category key):

1. Bare string: `web-framework: web-framework-react`
2. Object: `web-framework: { id: web-framework-react, preloaded: true }`
3. Array: `web-framework: [{ id: web-framework-react, preloaded: true }, { id: web-framework-nextjs-app-router }]`

### 5.7 skills-matrix.yaml Category Structure

Source: `src/schemas/skills-matrix.schema.json`

```yaml
categories:
  category-key: # Key must be a valid Category
    id: category-key # Must match the key
    displayName: Human Name
    description: Brief description
    domain: web # Optional, valid Domain value
    exclusive: true # Required boolean
    required: false # Required boolean
    order: 1 # Required number (display order within domain)
    icon: optional-icon # Optional string
    custom: false # Optional boolean
```

### 5.8 skills-matrix.yaml Relationship Types

```yaml
relationships:
  conflicts:
    - skills: [alias1, alias2] # Min 2. Uses display names (resolved to IDs at load time)
      reason: "Why they conflict"
  discourages:
    - skills: [alias1, alias2] # Min 2
      reason: "Why they're discouraged together"
  recommends:
    - when: alias1 # Single trigger skill
      suggest: [alias2, alias3] # Min 1 suggestion
      reason: "Why recommended"
  requires:
    - skill: alias1 # The skill that has the dependency
      needs: [alias2] # Min 1. Skills that must be selected first
      needsAny: false # Optional. true = OR logic, false/omitted = AND logic
      reason: "Why required"
  alternatives:
    - purpose: "Server state caching"
      skills: [alias1, alias2] # Min 1. Interchangeable skills
```

### 5.9 .claude-src/config.yaml Structure

This file serves two purposes:

**ProjectSourceConfig fields** (marketplace-level config):

```yaml
source: github:agents-inc/skills
author: "@vince"
marketplace: my-company
agentsSource: github:my-org/agents
sources:
  - name: source-name
    url: github:org/repo
    description: Optional description
    ref: optional-branch
boundSkills:
  - id: skill-id
    sourceUrl: github:org/repo
    sourceName: display-name
    boundTo: alias
branding:
  name: Custom CLI Name
  tagline: Custom tagline
skillsDir: src/skills
agentsDir: src/agents
stacksFile: config/stacks.yaml
matrixFile: config/skills-matrix.yaml
```

**ProjectConfig fields** (project-level config, same physical file):

```yaml
name: project-name # kebab-case
agents: # Agent IDs to compile
  - web-developer
  - api-developer
skills: # Flat list of all skill IDs
  - web-framework-react
  - web-state-zustand
installMode: local # "local" or "plugin"
expertMode: true # Optional boolean
domains: # Selected domains
  - web
  - api
selectedAgents: # From wizard
  - web-developer
stack: # Per-agent skill assignments (same format as stacks.yaml agents)
  web-developer:
    web-framework: web-framework-react
    web-styling: web-styling-scss-modules
source: github:agents-inc/skills
```

### 5.10 JSON Schema References

Generated YAML files should include `$schema` comments:

| File                  | Schema URL                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| metadata.yaml         | `https://raw.githubusercontent.com/agents-inc/cli/main/packages/cli/src/schemas/metadata.schema.json`              |
| stacks.yaml           | `https://raw.githubusercontent.com/agents-inc/cli/main/packages/cli/src/schemas/stacks.schema.json`                |
| skills-matrix.yaml    | `https://raw.githubusercontent.com/agents-inc/cli/main/packages/cli/src/schemas/skills-matrix.schema.json`         |
| config.yaml (project) | `https://raw.githubusercontent.com/agents-inc/cli/main/packages/cli/src/schemas/project-config.schema.json`        |
| config.yaml (source)  | `https://raw.githubusercontent.com/agents-inc/cli/main/packages/cli/src/schemas/project-source-config.schema.json` |
| agent.yaml            | `https://raw.githubusercontent.com/agents-inc/cli/main/packages/cli/src/schemas/agent.schema.json`                 |

Format: `# yaml-language-server: $schema={url}` as the first line.

### 5.11 STANDARD_FILES and STANDARD_DIRS

From `src/cli/consts.ts`:

| Constant                            | Value                       |
| ----------------------------------- | --------------------------- |
| `STANDARD_FILES.SKILL_MD`           | `SKILL.md`                  |
| `STANDARD_FILES.METADATA_YAML`      | `metadata.yaml`             |
| `STANDARD_FILES.CONFIG_YAML`        | `config.yaml`               |
| `STANDARD_FILES.SKILLS_MATRIX_YAML` | `skills-matrix.yaml`        |
| `STANDARD_FILES.AGENT_YAML`         | `agent.yaml`                |
| `SKILLS_MATRIX_PATH`                | `config/skills-matrix.yaml` |
| `STACKS_FILE_PATH`                  | `config/stacks.yaml`        |
| `CLAUDE_SRC_DIR`                    | `.claude-src`               |

---

## 6. Step-by-Step Implementation Plan

### Step 1: Create Skill Directory

```bash
mkdir -p /home/vince/dev/skills/src/skills/meta-config-agents-inc/
```

### Step 2: Write SKILL.md

Create the SKILL.md with:

1. **Frontmatter** — `name: meta-config-agents-inc`, description
2. **Quick Guide** — when to use, auto-detection triggers, when NOT to use
3. **Critical Requirements** — non-negotiable constraints (domain-prefixed categories, schema comments, required fields, read-before-write, SkillId format, verify-after-write)
4. **Configuration Reference** — the full knowledge base from Section 5 (categories, domains, agents, SkillId format, metadata schema, stacks schema, matrix schema, config schema, schema URLs)
5. **Workflow** — investigation-first process, file-specific creation/update procedures, validation checklist
6. **Examples** — creating metadata.yaml, adding a stack, adding a category, updating config.yaml, validating files, registering a skill (the absorbed D-40 flow)
7. **Reminders** — self-correction triggers (emphatic repetition of critical constraints)

**Note on knowledge drift:** The SKILL.md should instruct Claude to **always Grep for `SUBCATEGORY_VALUES` and `agentNameSchema` in the actual source code** before generating config, rather than relying solely on the embedded lists. The embedded lists serve as a fast reference; the source code is the ground truth.

### Step 3: Write metadata.yaml

Create metadata.yaml with the definition from Section 4 above.

### Step 4: Register in Skills Marketplace

Add `meta-config-agents-inc` to the appropriate places:

1. Add the skill to `config/skills-matrix.yaml` in the `shared-tooling` category (if not auto-discovered)
2. Add the skill's `displayName` alias to `skillAliases` if needed
3. Add the skill to relevant stacks in `config/stacks.yaml` — this skill should be available to all developer agents that might do config work

### Step 5: Register in CLI Project

In `/home/vince/dev/cli/.claude-src/config.yaml`:

1. Add `meta-config-agents-inc` to the `skills` list
2. Add it to the `stack` section for relevant agents (e.g., `agent-summoner`, `skill-summoner`, `cli-developer`)

### Step 6: Compile and Verify

```bash
agentsinc compile
```

Verify:

- Skill is listed in compiled output
- Agents that have it assigned can load it via the Skill tool
- The SKILL.md content is accessible when invoked

---

## 7. Integration Points

### How Users Invoke It

Users invoke naturally in conversation with Claude:

```
User: "Use Agents Inc to register my posthog skill"
Claude: [loads the skill] "I'll read your SKILL.md to understand what it does..."
Claude: "This looks like an analytics skill. I'd categorize it as `api-analytics`. Sound right?"
User: "yeah"
Claude: [creates metadata.yaml, updates config.yaml]
Claude: "Done. Run `agentsinc compile` to pick up the changes."
```

```
User: "Use Agents Inc to add a vue-fullstack stack"
Claude: [loads the skill] "What agents should this stack include? Here's what I'd suggest..."
```

```
User: "Use Agents Inc to validate my metadata.yaml"
Claude: [loads the skill, reads the file] "Found 2 issues: category 'framework' should be 'web-framework', and usageGuidance is only 8 chars (minimum 10)."
```

### How Other Agents Use It

Agents that have this skill assigned can load it via the Skill tool when they need config knowledge:

```
Skill: "meta-config-agents-inc"
```

This loads the config knowledge into the agent's context, giving it the same expertise. The key difference from the sub-agent design: the **parent agent** (in the main conversation) can also load this skill and do config work interactively.

### Delegation Patterns

| Caller                     | How They Use It                           | Example                                             |
| -------------------------- | ----------------------------------------- | --------------------------------------------------- |
| User directly              | Natural language: "Use Agents Inc to..."  | "Use Agents Inc to register my posthog skill"       |
| agent-summoner             | Loads skill, then creates config files    | After creating agent files, generates metadata.yaml |
| skill-summoner             | Loads skill, then creates metadata        | After creating SKILL.md, generates metadata.yaml    |
| Claude (main conversation) | Loads on demand when config task detected | User asks about config — Claude loads skill         |

---

## 8. Validation Strategy

### Schema Validation Approach

The skill embeds schema knowledge directly in its SKILL.md content. When Claude loads it, Claude gains:

1. **Required field checklists** for each file type
2. **Valid enum value lists** (categories, domains, agent names)
3. **Format patterns** (SkillId regex, author format, tag format)
4. **Structural rules** (stacks need at least one agent, categories need id matching key, etc.)

### Post-Write Verification

The skill instructs Claude to verify after every write:

1. Re-read the file using the Read tool
2. Check that all required fields are present
3. Check that enum values match the known valid sets
4. Check that the yaml-language-server schema comment is present
5. Report any validation issues found

### Interactive Advantage Over Sub-Agent

Unlike the sub-agent design, if validation finds an issue, Claude can immediately ask the user how to fix it rather than just reporting the error in a returned message.

### Limitation

Claude cannot run `agentsinc validate` or execute Zod schema validation directly unless it has Bash access. The skill instructs Claude to advise the user:

> "I've created the metadata.yaml. To verify against the full JSON schema, run: `agentsinc validate`"

---

## 9. Test Plan

### Manual Testing

Since this is a skill (SKILL.md + metadata.yaml), testing is manual:

1. **Load test**: Invoke `Skill: "meta-config-agents-inc"` and verify the content loads
2. **Metadata creation test**: Ask Claude to create a metadata.yaml for a hypothetical skill. Verify:
   - yaml-language-server schema comment present
   - All 5 required fields present and valid
   - Category is domain-prefixed
   - Author format is `@handle`
3. **Stacks update test**: Ask Claude to add a stack entry. Verify:
   - Valid structure with id, name, description, agents
   - Category keys are valid Category values
   - Skill IDs follow the 3-segment format
4. **Matrix category test**: Ask Claude to add a category. Verify:
   - All required fields present (id, displayName, description, exclusive, required, order)
   - Domain is valid
   - Key matches id field
5. **Validation test**: Give Claude an invalid metadata.yaml and ask it to validate. Verify:
   - It catches missing required fields
   - It catches invalid category values
   - It catches invalid author format
6. **Interactive test**: Ask Claude to register a skill with an ambiguous category. Verify:
   - Claude asks for clarification rather than guessing
   - Claude incorporates the user's answer into the generated config
7. **Refusal test**: Ask Claude to write SKILL.md content while using this skill. Verify it defers to skill-summoner.

### Acceptance Criteria

- [ ] Can create a valid `metadata.yaml` from a skill name and category
- [ ] Can register an existing skill interactively: read SKILL.md, ask clarifying questions, generate metadata.yaml, wire into config.yaml (replaces D-40)
- [ ] Can add a new stack to `stacks.yaml` with correct agent/category/skill structure
- [ ] Can add a new category to `skills-matrix.yaml` with proper schema
- [ ] Validates all output against schema rules (embedded knowledge)
- [ ] Refuses to use bare category names (enforces domain-prefix)
- [ ] Advises the user to verify with `agentsinc compile` after changes
- [ ] Loads correctly via Skill tool for both users and other agents

### Removed Acceptance Criteria (from agent design)

- ~~"Other agents can delegate config tasks to it via the Task tool"~~ — replaced by Skill tool loading

---

## 10. Files Created/Modified Summary

**New files (skills repo):**

| File                                                     | Purpose                                          | Estimated Size |
| -------------------------------------------------------- | ------------------------------------------------ | -------------- |
| `skills/src/skills/meta-config-agents-inc/SKILL.md`      | Full config knowledge base + workflow + examples | ~500-600 lines |
| `skills/src/skills/meta-config-agents-inc/metadata.yaml` | Skill catalog metadata                           | ~15 lines      |

**Modified files (skills repo):**

| File                        | Change                                                                        |
| --------------------------- | ----------------------------------------------------------------------------- |
| `config/skills-matrix.yaml` | Ensure `shared-tooling` category includes this skill (if not auto-discovered) |
| `config/stacks.yaml`        | Add skill to relevant stacks                                                  |

**Modified files (CLI repo):**

| File                      | Change                                                                     |
| ------------------------- | -------------------------------------------------------------------------- |
| `.claude-src/config.yaml` | Add `meta-config-agents-inc` to `skills` list and relevant `stack` entries |

**No TypeScript changes needed.** Unlike the agent design, a skill requires no schema changes, no new `AgentName` enum value, no type updates.

---

## 11. Notes for Implementer

### Key Difference from Agent Design

The agent design required 7 files (metadata.yaml, intro.md, workflow.md, critical-requirements.md, critical-reminders.md, output-format.md, examples.md) plus TypeScript schema changes. The skill design requires 2 files (SKILL.md, metadata.yaml) and zero TypeScript changes.

All content that was split across those 7 agent files is consolidated into a single SKILL.md. The structure within SKILL.md mirrors the agent file separation (critical requirements section, workflow section, examples section, reminders section).

### The Biggest Risk

Same as the agent design: **knowledge drift**. The embedded category values, agent names, etc. will change as the codebase evolves. Mitigation:

1. The SKILL.md should instruct Claude to **Grep for `SUBCATEGORY_VALUES` and `agentNameSchema` in source code** before generating config
2. The embedded lists serve as a **fast reference** but source code is ground truth
3. When the skill is updated, the `contentHash` in metadata.yaml tracks staleness

### agent-mappings.yaml Is Gone

The original D-41 TODO spec mentions `agent-mappings.yaml`. This file was removed in D-43. All skills are now assigned to all selected agents; stacks provide fine-grained mapping.

### Stack Entries in config.yaml

The `.claude-src/config.yaml` `stack` section uses the SAME format as `stacks.yaml` agent entries. The skill should document that these are the same schema.

### Schema Comment Convention

Every generated YAML file must start with:

```yaml
# yaml-language-server: $schema={schema-url}
```

### Content Size Consideration

At ~500-600 lines, the SKILL.md is large for a skill. This is acceptable because:

1. It's loaded on demand (not preloaded), so it only uses context when needed
2. Config tasks are infrequent — load once, do the work, move on
3. The alternative (a sub-agent) couldn't do interactive config work at all
4. The knowledge base IS the value — trimming it would reduce accuracy

---

## 12. Comparison with Original Design

| Aspect             | Original (agent)                                   | Updated (skill)                                          |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------- |
| Files to create    | 7 (metadata.yaml + 6 markdown)                     | 2 (SKILL.md + metadata.yaml)                             |
| TypeScript changes | 3 files (schemas.ts, types/agents.ts, config.yaml) | 0 files                                                  |
| Location           | `src/agents/meta/config-manager/`                  | `skills/src/skills/meta-config-agents-inc/`              |
| Interactivity      | None (sub-agent)                                   | Full (main conversation)                                 |
| User invocation    | `/task config-manager "..."`                       | "Use Agents Inc to..."                                   |
| Agent-to-agent use | Task tool delegation                               | Skill tool loading                                       |
| Knowledge delivery | Own context window                                 | Shared context (on demand)                               |
| Compilation        | Compiled to `.claude/agents/`                      | Compiled to `.claude/plugins/skills/` or loaded directly |
