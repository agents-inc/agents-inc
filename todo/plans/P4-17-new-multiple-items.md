# P4-17: `agentsinc new` Supports Multiple Items

**Status:** Refinement Complete (decisions finalized)
**Priority:** M (Medium)
**Depends on:** None
**Related:** P4-18 (test coverage for multi-item creation)

---

## 1. Decisions (resolved from open questions)

### D1: Multiple names via variadic positional args (Option A)

```bash
agentsinc new skill react-patterns vue-patterns angular-patterns
agentsinc new agent db-migrator api-gateway
```

Space-separated positional args. Natural CLI feel matching `rm file1 file2 file3` convention. oclif supports `strict: false` on the command to accept additional args beyond the defined ones.

### D2: Continue-on-error for per-item failures (Option B)

When creating multiple items and one fails (e.g., directory already exists), continue creating the rest. Collect errors and report a summary at the end. Falls back to fail-fast (Option A) if implementation complexity is unreasonable -- but continue-on-error is preferred.

This matches the pattern in `compileAndWriteAgents()` (agent-recompiler.ts:121-138) where each agent is compiled independently and failures are collected.

### D3: `--force` applies uniformly to all items

`--force` skips confirmation and overwrites existing directories for all items. Without `--force`, existing items are skipped with a warning (not a hard error, per D2).

### D4: Both `new skill` AND `new agent` support multiple names

Both commands accept variadic positional args. Each item is created independently with sequential processing and clear visual separation.

### D5: Interactive wizard with description field replaces `--purpose`

**The `--purpose` flag is REMOVED.** The expected UX is interactive wizard-style: the user calls `new agent`, passes name(s) in, then enters an interactive wizard with a description field for each agent. The existing `PurposeInput` Ink component already provides this pattern -- it just gets invoked per agent when creating multiples.

For `new skill`, the existing flow already generates a scaffold with placeholder description text in SKILL.md. No interactive description prompt is needed for skills.

---

## 2. Current State Analysis

### `new skill` command (src/cli/commands/new/skill.ts)

**Argument handling:**

```typescript
static args = {
  name: Args.string({
    description: "Name of the skill to create (kebab-case)",
    required: true,
  }),
};
```

Single required `name` arg. The `run()` method uses `args.name` directly.

**Creation flow:**

1. Validate skill name (kebab-case check)
2. Resolve author (flag > project config > default)
3. Determine output path (--output > marketplace detection > local default)
4. Check if directory exists (error unless --force)
5. Generate `SKILL.md` content
6. Write `SKILL.md`
7. Compute content hash
8. Generate and write `metadata.yaml`
9. Log success

**Error handling:** Uses `this.error()` with `EXIT_CODES` for validation failures. Uses `this.handleError(error)` for filesystem errors. No per-item error collection since it's single-item.

**Exported utilities:**

- `validateSkillName(name)` -- returns error string or null
- `toTitleCase(kebabCase)` -- converts kebab to title case
- `generateSkillMd(name)` -- generates SKILL.md content
- `generateMetadataYaml(name, author, category, contentHash)` -- generates metadata.yaml content

These are already pure functions, making them easy to call in a loop.

### `new agent` command (src/cli/commands/new/agent.tsx)

**Argument handling:**

```typescript
static args = {
  name: Args.string({
    description: "Name of the agent to create",
    required: true,
  }),
};
```

Single required `name` arg.

**Flags (current):**

- `--purpose` / `-p` -- Purpose/description of the agent (TO BE REMOVED)
- `--non-interactive` / `-n` -- Run in non-interactive mode
- `--refresh` / `-r` -- Force refresh remote source

**Creation flow:**

1. Check Claude CLI is available
2. Get purpose (flag or interactive prompt via Ink `PurposeInput`)
3. Load agent-summoner meta-agent from source
4. Build prompt with agent name + purpose + output dir
5. Invoke Claude CLI with the meta-agent

**Key difference from `new skill`:** The agent creation is delegated to an AI agent (agent-summoner), not generated from templates. This means each agent requires a separate Claude CLI invocation.

### oclif variadic args

oclif does not natively support variadic positional args with `Args.string({ multiple: true })` in the same way as flags. The standard approach is either:

1. Use `strict: false` on the command and access `this.argv` for additional args
2. Use a single arg with the rest parsed from `argv`

Looking at oclif docs, the recommended pattern for "remaining args" is:

```typescript
static strict = false;

async run(): Promise<void> {
  const { argv } = await this.parse(MyCommand);
  // argv contains all positional args as string[]
}
```

However, since we have a defined first arg (`name`) and want additional args, the cleanest approach is to keep `name` as required and collect additional names from `argv`:

```typescript
static strict = false;

static args = {
  name: Args.string({ description: "Name(s) of items to create", required: true }),
};

async run(): Promise<void> {
  const { args, argv, flags } = await this.parse(NewSkill);
  // args.name is the first name
  // argv contains ALL positional args including the first
  const names = argv as string[];
}
```

---

## 3. Design

### Concept

Both `new skill` and `new agent` accept multiple names as positional arguments. Each item is created independently with continue-on-error semantics. Errors for individual items are collected and reported in a summary.

The `--purpose` flag is removed from `new agent`. Description/purpose is always collected interactively via the wizard's description field (one prompt per agent).

### User-Facing Behavior

```bash
# Single item (unchanged UX)
agentsinc new skill react-patterns

# Multiple skills
agentsinc new skill react-patterns vue-patterns angular-patterns

# Multiple skills with shared flags
agentsinc new skill react-patterns vue-patterns --author @myteam --category web-framework

# Force overwrite existing
agentsinc new skill react-patterns vue-patterns --force

# Multiple agents (interactive description prompt per agent)
agentsinc new agent db-migrator api-gateway
# -> Wizard prompts for db-migrator's description
# -> Creates db-migrator
# -> Wizard prompts for api-gateway's description
# -> Creates api-gateway

# Single agent with --force (skip overwrite confirmation)
agentsinc new agent db-migrator --force
```

### Output Format

**Multiple skills:**

```
Create New Skills

Creating 3 skills...

  [1/3] react-patterns
    Skill name: react-patterns
    Author: @myteam
    Category: web-framework
    Directory: .claude/skills/react-patterns
    Created SKILL.md
    Created metadata.yaml

  [2/3] vue-patterns
    Skill name: vue-patterns
    Author: @myteam
    Category: web-framework
    Directory: .claude/skills/vue-patterns
    Created SKILL.md
    Created metadata.yaml

  [3/3] angular-patterns
    Skipped: directory already exists (use --force to overwrite)

Summary: 2 created, 1 skipped
Run 'agentsinc compile' to include them in your agents.
```

**Multiple agents:**

```
Create New Agents

  [1/2] db-migrator
    What should this agent do?
    > Manages database migrations with rollback support

    Invoking agent-summoner...
    [Claude CLI output]
    Agent creation complete!

  [2/2] api-gateway
    What should this agent do?
    > Routes and validates API requests

    Invoking agent-summoner...
    [Claude CLI output]
    Agent creation complete!

Summary: 2 created, 0 failed
```

---

## 4. Step-by-Step Implementation Plan

### Step 1: Update `new skill` to accept multiple names

**File:** `src/cli/commands/new/skill.ts`

1. Add `static strict = false` to the class
2. Update arg description: `"Name(s) of skill(s) to create (kebab-case)"`
3. In `run()`, collect all names from `argv`:
   ```typescript
   const { flags, argv } = await this.parse(NewSkill)
   const names = argv as string[]
   ```
4. Validate all names upfront before creating any
5. Loop over names, creating each independently (continue-on-error)

### Step 2: Extract skill creation into a helper

**File:** `src/cli/commands/new/skill.ts`

Extract the single-skill creation logic into a method:

```typescript
private async createSingleSkill(
  name: string,
  skillsBasePath: string,
  author: string,
  category: CategoryPath,
  force: boolean,
  dryRun: boolean,
): Promise<"created" | "skipped" | "failed"> {
  // Existing creation logic, returning status instead of exiting on error
}
```

### Step 3: Add summary reporting for skills

**File:** `src/cli/commands/new/skill.ts`

After the loop, print a summary:

```typescript
const created = results.filter((r) => r === "created").length
const skipped = results.filter((r) => r === "skipped").length
const failed = results.filter((r) => r === "failed").length

this.log(`\nSummary: ${created} created, ${skipped} skipped, ${failed} failed`)
```

Only show the summary line when creating multiple items. Single-item creation retains the existing output format.

### Step 4: Update `new agent` to accept multiple names and remove `--purpose`

**File:** `src/cli/commands/new/agent.tsx`

1. Add `static strict = false` to the class
2. **Remove the `--purpose` flag entirely** from `static flags`
3. In `run()`, collect all names from `argv`
4. For each name, render the interactive `PurposeInput` to collect the description
5. After collecting description, invoke agent-summoner for that agent
6. Continue to next agent

### Step 5: Sequential agent creation with separation

**File:** `src/cli/commands/new/agent.tsx`

For multiple agents, process them sequentially with clear visual separation:

```typescript
for (let i = 0; i < names.length; i++) {
  this.log(`\n  [${i + 1}/${names.length}] ${names[i]}`)

  // Render PurposeInput for this agent's description
  // Invoke meta-agent
  // Collect result (created/failed)

  if (i < names.length - 1) {
    this.log("\n" + "-".repeat(60) + "\n")
  }
}
```

### Step 6: Add `--force` flag to `new agent`

**File:** `src/cli/commands/new/agent.tsx`

Add `--force` flag to agent command (skill command already has it). When `--force` is set, skip overwrite confirmation if agent directory already exists.

### Step 7: Update help text and examples

**Files:** Both `new/skill.ts` and `new/agent.tsx`

Update `static description` and add `static examples` to show multi-item usage:

```typescript
static examples = [
  "<%= config.bin %> <%= command.id %> react-patterns",
  "<%= config.bin %> <%= command.id %> react-patterns vue-patterns angular-patterns",
  "<%= config.bin %> <%= command.id %> my-skill --author @myteam --category web-framework",
];
```

---

## 5. Edge Cases

### Skill-specific edge cases

| Edge Case                                                        | Behavior                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Duplicate names in args (`new skill foo foo`)                    | Deduplicate; warn "Duplicate name 'foo' ignored"                          |
| Some names invalid, some valid (`new skill valid-name INVALID!`) | Validate all upfront; error listing all invalid names before creating any |
| All directories exist without `--force`                          | All skipped; summary shows "0 created, N skipped"                         |
| Mixed exist/new with `--force`                                   | Existing overwritten, new created                                         |
| `--dry-run` with multiple items                                  | Show "[DRY RUN]" per item; no files created                               |
| `--output` with multiple items                                   | All skills created in the same output directory                           |
| Single name (backward compatibility)                             | Behaves identically to current single-item flow                           |

### Agent-specific edge cases

| Edge Case                                                     | Behavior                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| User cancels (Escape) during description prompt for 2nd agent | Report first agent as created, second as cancelled; exit with summary                                        |
| Claude CLI fails for one agent                                | Report that agent as failed; continue to next (continue-on-error)                                            |
| Single name (backward compatibility)                          | Behaves identically to current single-item flow (interactive description prompt, then invoke agent-summoner) |
| `--force` with existing agent directory                       | Overwrite without confirmation                                                                               |
| `--non-interactive` with multiple names                       | Each agent still needs a description -- error unless a non-interactive description mechanism is added later  |

### General edge cases

| Edge Case                        | Behavior                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------- |
| Zero names provided              | oclif's `required: true` on the first arg handles this; error before `run()`    |
| Very large number of names (50+) | No artificial limit; process sequentially. Agent creation may take a long time. |

---

## 6. Test Plan

### Skill tests

**File:** `src/cli/lib/__tests__/commands/new-skill.test.ts` (or extend existing)

| Test                                                       | What it verifies                                   |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `should create single skill (backward compat)`             | Existing single-name behavior unchanged            |
| `should create multiple skills`                            | All skill directories created with correct content |
| `should validate all names before creating any`            | Invalid name prevents all creation                 |
| `should skip existing directories without --force`         | Existing dirs skipped, new dirs created            |
| `should overwrite existing directories with --force`       | All directories overwritten                        |
| `should deduplicate names`                                 | `new skill foo foo` creates only one skill         |
| `should apply shared flags to all items`                   | `--author` and `--category` used for each skill    |
| `should report summary with created/skipped/failed counts` | Output contains correct summary line               |
| `should handle --dry-run for all items`                    | No files created; each item shows dry-run message  |
| `should handle --output for all items`                     | All skills in the custom output directory          |
| `should continue on error and report summary`              | Filesystem error on one skill does not stop others |

### Agent tests

**File:** `src/cli/lib/__tests__/commands/new-agent.test.ts` (or extend existing)

| Test                                                    | What it verifies                                     |
| ------------------------------------------------------- | ---------------------------------------------------- |
| `should create single agent (backward compat)`          | Existing single-name behavior unchanged              |
| `should not have --purpose flag`                        | Flag is removed; command does not accept `--purpose` |
| `should prompt for description interactively per agent` | Each agent gets its own description prompt           |
| `should process multiple agents sequentially`           | Each agent gets its own invocation                   |
| `should report summary with created/failed counts`      | Output contains correct summary                      |
| `should handle cancellation during multi-agent flow`    | Partial results reported                             |
| `should overwrite existing agent with --force`          | Existing agent directory overwritten                 |
| `should continue on error when one agent fails`         | Other agents still created                           |

### Existing tests must continue passing

All existing `new skill` and `new agent` tests must pass unchanged. The single-name case is a subset of the multi-name case.

---

## 7. Files Changed Summary

### Modified files

| File                             | Change                                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/commands/new/skill.ts`  | Add `strict = false`, extract `createSingleSkill()`, loop over `argv`, add summary reporting, update help/examples                                                                 |
| `src/cli/commands/new/agent.tsx` | Add `strict = false`, **remove `--purpose` flag**, add `--force` flag, loop over `argv` with interactive description prompt per agent, add summary reporting, update help/examples |

### No new files

All changes fit within the existing command files. The creation logic is extracted into a private method on the same class, not a new module.

### Estimated scope

- **Skill command:** ~40-60 lines changed (extract helper, add loop, add summary)
- **Agent command:** ~40-60 lines changed (remove `--purpose`, add `--force`, add loop, summary)
- **Test code:** ~100-140 lines for new multi-item tests
- **Complexity:** Low-Medium -- the core creation logic is unchanged; the change is structural (loop + error collection + summary)

---

## 8. What This Does NOT Include

- **Batch configuration** (different flags per item) -- All items share the same `--author`, `--category`, `--force` flags. Per-item configuration is out of scope.
- **Parallel creation** -- Items are created sequentially. Parallel creation adds complexity (output interleaving, error handling) for minimal benefit.
- **Template selection per item** -- All items use the same scaffold template. Custom templates per item are a separate feature.
- **Interactive name input** -- If no names are provided, the command errors (oclif required arg). No interactive "add more names" prompt.
- **Undo/rollback on partial failure** -- If 2 of 3 skills are created and the 3rd fails, the first two remain. No cleanup of successfully created items.
- **Non-interactive description for agents** -- With `--purpose` removed, agent description is always interactive. A future `--description` flag for CI/scripting use cases is out of scope for this task.
