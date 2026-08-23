# CLI-717: Improve Template Error Messages

**Status:** Refinement Complete
**Priority:** S (Small)
**Related:** D-18 (template system documentation)

---

## 1. Open Questions

### Q1: Should the error message include the full list of expected variables?

The Liquid template (`agent.liquid`) uses a fixed set of variables. When compilation fails, the user sees a generic LiquidJS error (e.g., `ENOENT: no such file or directory` for missing agent partials, or an opaque Liquid rendering error for missing variables).

| Option                                               | Description                                                                   | Pros                                                          | Cons                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| **A: Show only the missing variable(s)**             | Parse the Liquid error, extract which variable(s) caused the failure          | Focused; user sees only what is wrong                         | Requires parsing LiquidJS error messages, which may vary by version |
| **B: Show missing variable(s) + full expected list** | Show what failed and also list all expected variables with their source files | Educational; helps user understand the full template contract | More verbose; may overwhelm for a single missing file               |
| **C: Show missing variable(s) + suggested fix**      | Show what failed and suggest which file to create                             | Actionable; user can fix the issue immediately                | Requires mapping each variable to its source file                   |

**Recommendation:** Option C. The most useful output for a user is: what's wrong, and what to do about it. The template variable set is small and stable enough to maintain a variable-to-file mapping.

### Q2: Should `strictVariables` be enabled?

The Liquid engine is currently configured with `strictVariables: false` (compiler.ts:434). This means missing variables render as empty strings rather than throwing errors. This is intentional -- optional sections (examples, criticalRequirementsTop, etc.) default to empty strings when their source files don't exist, and the template uses `{% if criticalRequirementsTop != "" %}` guards.

**Resolution:** Keep `strictVariables: false`. The improvement is not about catching missing Liquid variables (those are handled by the empty-string defaults). It's about catching errors at the file-reading stage (`readAgentFiles()`) and the template rendering stage (`engine.renderFile()`), and providing better context when those fail.

### Q3: Should the error distinguish between "file missing" and "template rendering error"?

These are two different failure modes:

1. **File missing:** `readAgentFiles()` cannot find `intro.md` or `workflow.md` (required files)
2. **Template rendering error:** Liquid engine fails during rendering (e.g., custom template syntax error, filter not found)

**Recommendation:** Yes. Each mode should have a distinct error message format with specific remediation advice.

### Q4: Should this improvement also cover skill compilation errors?

Skill compilation (`compileAllSkills()`) has its own error handling (compiler.ts:331-336) that already shows the expected file path. The primary gap is in agent compilation.

**Recommendation:** No. Skill compilation errors are already adequate. Focus on agent compilation where the error messages are less helpful.

---

## 2. Current State Analysis

### Template Variables

The Liquid template at `src/agents/_templates/agent.liquid` expects these variables (from `CompiledAgentData`):

| Variable                  | Type      | Source                                        | Required?                                    |
| ------------------------- | --------- | --------------------------------------------- | -------------------------------------------- |
| `agent.name`              | string    | `agent.yaml` -> `AgentConfig.name`            | Yes                                          |
| `agent.title`             | string    | `agent.yaml` -> `AgentConfig.title`           | Yes                                          |
| `agent.description`       | string    | `agent.yaml` -> `AgentConfig.description`     | Yes                                          |
| `agent.tools`             | string[]  | `agent.yaml` -> `AgentConfig.tools`           | Yes                                          |
| `agent.disallowed_tools`  | string[]  | `agent.yaml` -> `AgentConfig.disallowedTools` | No                                           |
| `agent.model`             | string    | `agent.yaml` -> `AgentConfig.model`           | No (default: "inherit")                      |
| `agent.permission_mode`   | string    | `agent.yaml` -> `AgentConfig.permissionMode`  | No (default: "default")                      |
| `intro`                   | string    | `intro.md`                                    | Yes (readFile throws)                        |
| `workflow`                | string    | `workflow.md`                                 | Yes (readFile throws)                        |
| `examples`                | string    | `examples.md`                                 | No (default: "No examples defined.")         |
| `criticalRequirementsTop` | string    | `critical-requirements.md`                    | No (default: "")                             |
| `criticalReminders`       | string    | `critical-reminders.md`                       | No (default: "")                             |
| `outputFormat`            | string    | `output-format.md`                            | No (default: "", falls back to category dir) |
| `skills`                  | Skill[]   | Resolved via `resolver.ts`                    | Yes (can be empty)                           |
| `preloadedSkills`         | Skill[]   | Subset of skills                              | Yes (can be empty)                           |
| `dynamicSkills`           | Skill[]   | Subset of skills                              | Yes (can be empty)                           |
| `preloadedSkillIds`       | SkillId[] | Mapped from preloadedSkills                   | Yes (can be empty)                           |

### Current Error Handling

**Agent file reading (compiler.ts:126-167 `readAgentFiles()`):**

- `readFile()` throws on missing file -- no custom error wrapping at this level
- `readFileOptional()` returns a default for optional files -- these never fail

**Agent compilation (compiler.ts:255-261 `compileAllAgents()`):**

```typescript
} catch (error) {
  const errorMessage = getErrorMessage(error);
  warn(`Failed to compile '${name}': ${errorMessage}`);
  throw new Error(
    `Failed to compile agent '${name}': ${errorMessage}. Check that all required files exist in src/agents/${agent.path || name}/`,
  );
}
```

This message is generic. When `intro.md` is missing, the user sees something like:

```
Failed to compile agent 'web-developer': ENOENT: no such file or directory, open '/path/to/src/agents/dev/web-developer/intro.md'. Check that all required files exist in src/agents/web-developer/
```

**What's missing:**

1. No listing of which specific file(s) are missing vs which exist
2. No guidance on what each file should contain
3. No distinction between "required file missing" and "template rendering failed"
4. The path in the hint (`src/agents/${agent.path || name}/`) may not match the actual resolution path when `sourceRoot` or `agentBaseDir` overrides are active

### Recompiler error handling (agent-recompiler.ts:128-137)

```typescript
} catch (error) {
  result.failed.push(agentName);
  result.warnings.push(`Failed to compile ${agentName}: ${getErrorMessage(error)}`);
}
```

This catches compilation errors and adds them to the result. The warnings are surfaced to the user by the calling command. The same generic error message propagates here.

---

## 3. Design

### Approach: Enhanced Error Context in `compileAllAgents()`

Instead of catching a generic error and guessing what went wrong, probe the filesystem before throwing:

1. When compilation fails, check which required files exist and which are missing
2. Check which optional files exist (for informational display)
3. Show the actual resolved directory path (not the assumed one)
4. If all files exist but compilation still failed, show the Liquid engine error with context

### Error Message Format

**When required files are missing:**

```
Failed to compile agent 'web-developer':

  Missing required files:
    - intro.md       (agent introduction/role definition)
    - workflow.md    (agent workflow/process)

  Agent directory: /path/to/src/agents/dev/web-developer/

  To fix: Create the missing file(s) in the directory above.
  See existing agents (e.g., src/agents/dev/api-developer/) for reference.
```

**When template rendering fails (all files present):**

```
Failed to compile agent 'web-developer':

  Template rendering error: [Liquid error message]

  All required files are present in: /path/to/src/agents/dev/web-developer/

  This usually means a custom template override has a syntax error.
  Check: .claude-src/agents/_templates/agent.liquid (if it exists)
```

### Variable-to-File Mapping

Define a constant mapping in `compiler.ts`:

```typescript
const REQUIRED_AGENT_FILES = [
  {
    variable: "intro",
    file: STANDARD_FILES.INTRO_MD,
    description: "agent introduction/role definition",
  },
  {
    variable: "workflow",
    file: STANDARD_FILES.WORKFLOW_MD,
    description: "agent workflow/process",
  },
] as const

const OPTIONAL_AGENT_FILES = [
  {
    variable: "examples",
    file: STANDARD_FILES.EXAMPLES_MD,
    description: "usage examples",
  },
  {
    variable: "criticalRequirementsTop",
    file: STANDARD_FILES.CRITICAL_REQUIREMENTS_MD,
    description: "critical requirements (top of prompt)",
  },
  {
    variable: "criticalReminders",
    file: STANDARD_FILES.CRITICAL_REMINDERS_MD,
    description: "critical reminders (bottom of prompt)",
  },
  {
    variable: "outputFormat",
    file: STANDARD_FILES.OUTPUT_FORMAT_MD,
    description: "output format specification",
  },
] as const
```

---

## 4. Step-by-Step Implementation Plan

### Step 1: Add helper function for file existence checking

**File:** `src/cli/lib/compiler.ts`

Add a private helper that takes the resolved agent directory and checks which required/optional files exist:

```typescript
async function checkAgentFiles(agentDir: string): Promise<{
  missingRequired: (typeof REQUIRED_AGENT_FILES)[number][]
  presentOptional: string[]
}> {
  const missingRequired = []
  for (const entry of REQUIRED_AGENT_FILES) {
    if (!(await fileExists(path.join(agentDir, entry.file)))) {
      missingRequired.push(entry)
    }
  }
  const presentOptional = []
  for (const entry of OPTIONAL_AGENT_FILES) {
    if (await fileExists(path.join(agentDir, entry.file))) {
      presentOptional.push(entry.file)
    }
  }
  return { missingRequired, presentOptional }
}
```

### Step 2: Add error formatting helper

**File:** `src/cli/lib/compiler.ts`

Add a function that formats the enhanced error message:

```typescript
function formatAgentCompileError(
  name: AgentName,
  agentDir: string,
  missingRequired: (typeof REQUIRED_AGENT_FILES)[number][],
  originalError: string
): string {
  if (missingRequired.length > 0) {
    const fileList = missingRequired
      .map((f) => `    - ${f.file.padEnd(30)} (${f.description})`)
      .join("\n")
    return (
      `Failed to compile agent '${name}':\n\n` +
      `  Missing required files:\n${fileList}\n\n` +
      `  Agent directory: ${agentDir}\n\n` +
      `  To fix: Create the missing file(s) in the directory above.`
    )
  }

  return (
    `Failed to compile agent '${name}':\n\n` +
    `  Template rendering error: ${originalError}\n\n` +
    `  All required files are present in: ${agentDir}\n\n` +
    `  This usually means a custom template override has a syntax error.\n` +
    `  Check: .claude-src/agents/_templates/agent.liquid (if it exists)`
  )
}
```

### Step 3: Update error handling in `compileAllAgents()`

**File:** `src/cli/lib/compiler.ts`, catch block (lines 255-261)

Replace the generic catch with the enhanced error flow:

```typescript
} catch (error) {
  const errorMessage = getErrorMessage(error);
  const agentSourceRoot = agent.sourceRoot || ctx.projectRoot;
  const agentBaseDir = agent.agentBaseDir || DIRS.agents;
  const agentDir = path.join(agentSourceRoot, agentBaseDir, agent.path || name);

  const { missingRequired } = await checkAgentFiles(agentDir);
  const enhancedMessage = formatAgentCompileError(name, agentDir, missingRequired, errorMessage);

  warn(`Failed to compile '${name}': ${errorMessage}`);
  throw new Error(enhancedMessage);
}
```

### Step 4: No changes to `readAgentFiles()`

The `readAgentFiles()` function should NOT be modified. It correctly throws on missing required files, and the enhanced error handling in the caller (`compileAllAgents()`) provides the context. This keeps the change minimal and avoids changing the function's contract.

---

## 5. Edge Cases

| Edge Case                                            | Current Behavior                                     | Proposed Behavior                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Both required files missing (intro.md + workflow.md) | Throws on first missing file; second never checked   | Checks all files; reports both as missing                                           |
| Agent directory does not exist                       | ENOENT error for the first file read                 | Lists all required files as missing; shows the non-existent directory path          |
| Custom template override has syntax error            | Generic Liquid error                                 | "Template rendering error" path; suggests checking `.claude-src/agents/_templates/` |
| Agent uses `sourceRoot` override (remote source)     | Error shows wrong path                               | Uses `agent.sourceRoot` for correct resolved directory                              |
| Agent uses `agentBaseDir` override                   | Error shows wrong path                               | Uses `agent.agentBaseDir` for correct resolved directory                            |
| Optional file only exists in category fallback dir   | Not relevant (already handled by `readFileOptional`) | No change -- optional files use defaults                                            |
| Template filter not found (`strictFilters: true`)    | Liquid error about unknown filter                    | "Template rendering error" path with the filter name                                |

---

## 6. Test Plan

### Unit tests

**File:** `src/cli/lib/__tests__/compiler.test.ts` (extend existing or create)

| Test                                                                         | What it verifies                                                           |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `should list missing required files when intro.md is absent`                 | Error message contains "intro.md" and its description                      |
| `should list missing required files when workflow.md is absent`              | Error message contains "workflow.md" and its description                   |
| `should list both missing files when intro.md and workflow.md are absent`    | Error message contains both files                                          |
| `should show template rendering error when all files exist but Liquid fails` | Error message says "Template rendering error" and mentions custom template |
| `should show correct agent directory path with default config`               | Path matches `src/agents/{name}`                                           |
| `should show correct agent directory path with sourceRoot override`          | Path uses the override root                                                |
| `should show correct agent directory path with agentBaseDir override`        | Path uses the override base                                                |

### Existing tests must continue passing

All existing compiler tests must pass unchanged. The error messages change but the failure conditions are the same -- tests that assert on specific error messages may need updating to match the new format.

---

## 7. Files Changed Summary

### Modified files

| File                      | Change                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/lib/compiler.ts` | Add `REQUIRED_AGENT_FILES` and `OPTIONAL_AGENT_FILES` constants, `checkAgentFiles()` helper, `formatAgentCompileError()` helper, update catch block in `compileAllAgents()` |

### No new files

All changes fit within the existing compiler module. No new utility modules or abstractions.

### Estimated scope

- **Modified code:** ~40-60 lines added to `compiler.ts` (constants, two helpers, updated catch block)
- **Test code:** ~40-60 lines added to compiler tests
- **Complexity:** Low -- filesystem checks on a known, small set of files with formatted output

---

## 8. What This Does NOT Include

- **Changing `strictVariables` on the Liquid engine** -- Optional sections rely on empty-string defaults
- **Adding variable documentation to the template file itself** -- That's D-18 (template system documentation)
- **Improving skill compilation errors** -- Already adequate with file paths shown
- **Adding a `--validate` flag to the compile command** -- Out of scope; the output-validator already handles post-compilation validation
- **Changing `readAgentFiles()` signature or behavior** -- Keep the function simple; enhanced error handling is in the caller
