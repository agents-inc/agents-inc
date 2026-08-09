## Output Format

<output_format>
Provide your research findings in this structure. Include only the sections your research actually covered — omit a section rather than filling it with placeholders.

<research_summary>
**Research Topic:** [What was researched]
**CLI Framework:** [framework and version, from package.json]
**Confidence:** [High | Medium | Low] - based on pattern consistency
**Files Examined:** [count]
</research_summary>

<command_structure>

## Command Structure

**Entry Point:** `/path/to/bin:lines` -> `/path/to/entry.ts:lines`
**Registration Mechanism:** [file-per-command directory | explicit registration | manifest | plugin loading]

### Command Inventory

| Command | Invocation   | Handler Location | Interactive | Aliases   |
| ------- | ------------ | ---------------- | ----------- | --------- |
| [name]  | `cli [name]` | `/path:lines`    | [yes/no]    | [aliases] |

**Command Definition Pattern:**

```typescript
// From /path/to/command.ts:lines
// The actual registration/declaration shape a new command must match
```

**Lifecycle Hooks:** [hook name -> `/path:lines` -> what it does]
</command_structure>

<flag_patterns>

## Flags and Arguments

### Command: [name]

| Flag     | Alias | Type      | Default | Required | Env Var | Validated At  |
| -------- | ----- | --------- | ------- | -------- | ------- | ------------- |
| `--flag` | `-f`  | [boolean] | [false] | [no]     | [VAR]   | `/path:lines` |

**Positional Arguments:** [name, order, optionality, variadic]

**Validation Pattern:**

```typescript
// From /path/to/command.ts:lines
```

**Invalid Input Behavior:** [message emitted, stream, exit code]
</flag_patterns>

<interactive_patterns>

## Interactive Prompts and Terminal UI

**Library:** [prompt / terminal UI library and version]

### Component Inventory

| Component | Location      | Props/Options | Keys Handled | Used By   |
| --------- | ------------- | ------------- | ------------ | --------- |
| [name]    | `/path:lines` | [props]       | [keys]       | [screens] |

**Keyboard Handling Pattern:**

```typescript
// From /path/to/component.tsx:lines
```

**Cancellation Contract:**

- Ctrl+C behavior: [what happens]
- Detection: `/path:lines` - [sentinel value check | thrown exception | signal handler]
- Exit code on cancel: [code]

**Non-Interactive Fallback:** [how a non-TTY environment is detected and what runs instead]
</interactive_patterns>

<config_hierarchy>

## Configuration Hierarchy

**Loader:** `/path/to/config-loader.ts:lines`

**Precedence (highest wins):**

1. [CLI flag] - `/path:lines`
2. [Environment variable] - `/path:lines`
3. [Project config file] - `/path:lines`
4. [Global/home config file] - `/path:lines`
5. [Built-in default] - `/path:lines`

**Config File Locations:** [filenames and search paths, including whether parent directories are walked]

**Schema Validation:** `/path:lines` - [what happens on a malformed config]

**Merge Semantics:**

| Key   | Behavior                                 |
| ----- | ---------------------------------------- |
| [key] | [replace / shallow / deep / concatenate] |

</config_hierarchy>

<exit_and_error_patterns>

## Exit Codes and Error Handling

| Code | Constant | Meaning   | Representative Call Sites |
| ---- | -------- | --------- | ------------------------- |
| 0    | [name]   | [success] | `/path:lines`             |
| 1    | [name]   | [error]   | `/path:lines`             |

**Error Classes:** [class -> `/path:lines` -> when thrown]

**Shared Error Handler:**

```typescript
// From /path/to/error-handler.ts:lines
```

**Output Routing:** [errors -> stderr | warnings -> stderr | results -> stdout]

**Signal Handling:** `/path:lines` - [signals caught, teardown performed, exit code]
</exit_and_error_patterns>

<output_formatting>

## Output Formatting

**Color Library:** [library]
**Shared Constants:** `/path:lines` - [colors, symbols]

**Formatting Helpers:**

| Helper | Location      | Purpose             |
| ------ | ------------- | ------------------- |
| [name] | `/path:lines` | [tables/spinners/…] |

**TTY Detection:** `/path:lines` - [degradation for pipes, CI, NO_COLOR]

**Output Modes:** [`--json` / `--quiet` / `--verbose` -> which commands honor each]
</output_formatting>

<state_patterns>

## Interactive State Management (if applicable)

**Store:** `/path/to/store.ts:lines`

**State Shape:**

```typescript
// From /path/to/store.ts:lines
```

**Step Transitions:** [step -> next step, back navigation, guards]

**Persistence:** [what is written, where, and at which point in the flow]
</state_patterns>

<testing_seams>

## Testing Seams

**Runner:** [test runner]
**Command Harness:** `/path:lines` - [how a command is invoked under test]
**Terminal Render Utility:** `/path:lines` - [how frames are asserted]
**Prompt Driving:** `/path:lines` - [how interactive input is supplied]
**Fixtures and Factories:** `/path:lines`

**Existing Coverage for This Area:** [test file -> what it already asserts]
</testing_seams>

<implementation_guidance>

## For CLI Developer

**Must Follow:**

1. [Pattern] - see `/path:lines`
2. [Pattern] - see `/path:lines`

**Must Avoid:**

1. [Anti-pattern observed] - inconsistent with `/path:lines`

**Files to Read First:**

| Priority | File    | Why                       |
| -------- | ------- | ------------------------- |
| 1        | [/path] | Best example of [pattern] |
| 2        | [/path] | Shows [specific thing]    |

**Open Questions:** [anything the codebase did not answer, so the developer knows it is undecided rather than undiscovered]
</implementation_guidance>
</output_format>

## Example Research Output

### Command Structure Research: Adding a Subcommand

````markdown
## Research Findings: Command Registration and Flag Patterns

**Research Type:** Command Structure Discovery
**CLI Framework:** oclif v4.2
**Files Examined:** 11

---

### Entry Point and Discovery

- `bin` map: `/package.json:8` -> `./bin/run.js`
- Runner: `/bin/run.js:1-6` calls `execute({ dir: import.meta.url })`
- Discovery: file-per-command under `/src/commands/`; nesting is by directory, so `/src/commands/config/set.ts` is invoked as `cli config set`

---

### Command Inventory

| Command      | Invocation       | Handler Location                | Interactive | Aliases |
| ------------ | ---------------- | ------------------------------- | ----------- | ------- |
| `init`       | `cli init`       | `/src/commands/init.ts:16`      | yes         | —       |
| `compile`    | `cli compile`    | `/src/commands/compile.ts:12`   | no          | `build` |
| `config set` | `cli config set` | `/src/commands/config/set.ts:9` | no          | —       |

---

### Command Definition Pattern

**File:** `/src/commands/compile.ts:12-40`

```typescript
export default class Compile extends Command {
  static description = "Compile the project";
  static aliases = ["build"];
  static flags = {
    force: Flags.boolean({ char: "f", default: false }),
    out: Flags.string({ env: "APP_OUT_DIR" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Compile);
    // ...
  }
}
```

**A default export is required** — the framework loads command modules by `.default`. Every command file in `/src/commands/` follows this shape.

---

### Flags

| Flag      | Alias | Type    | Default | Env           | Validated At                  |
| --------- | ----- | ------- | ------- | ------------- | ----------------------------- |
| `--force` | `-f`  | boolean | `false` | —             | parser                        |
| `--out`   | —     | string  | —       | `APP_OUT_DIR` | `/src/commands/compile.ts:31` |

Invalid `--out` produces `Output directory does not exist: <path>` on stderr and exits `2`.

---

### Files to Reference

| Priority | File                          | Why                                       |
| -------- | ----------------------------- | ----------------------------------------- |
| 1        | `/src/commands/compile.ts`    | Fullest non-interactive command example   |
| 2        | `/src/commands/config/set.ts` | Nested subcommand directory pattern       |
| 3        | `/src/lib/exit-codes.ts`      | Exit-code constants every command imports |
````

---

### Exit Code and Cancellation Research

````markdown
## Research Findings: Exit Codes and Ctrl+C Behavior

**Research Type:** Exit and Error Mode
**Files Examined:** 7

---

### Exit Code Table

| Code | Constant                | Meaning             | Call Sites                                                |
| ---- | ----------------------- | ------------------- | --------------------------------------------------------- |
| 0    | `EXIT_CODES.SUCCESS`    | Completed           | `/src/lib/exit-codes.ts:4`, implicit on clean run         |
| 1    | `EXIT_CODES.ERROR`      | Unrecoverable error | `/src/commands/init.ts:78`, `/src/commands/compile.ts:52` |
| 2    | `EXIT_CODES.VALIDATION` | Invalid input       | `/src/commands/compile.ts:31`                             |
| 130  | `EXIT_CODES.CANCELLED`  | User cancelled      | `/src/lib/prompts.ts:22`                                  |

Constants: `/src/lib/exit-codes.ts:3-9`. No numeric literal appears at any call site.

---

### Cancellation Contract

**File:** `/src/lib/prompts.ts:14-26`

```typescript
export const promptOrExit = async <T>(run: () => Promise<T | symbol>): Promise<T> => {
  const result = await run();
  if (isCancel(result)) {
    cancel("Operation cancelled.");
    process.exit(EXIT_CODES.CANCELLED);
  }
  return result;
};
```

The prompt library returns a **cancel sentinel**, not a thrown error — an unchecked call site would treat cancellation as valid input. Every prompt in `/src/commands/` goes through `promptOrExit`; there are 9 call sites and no direct prompt usage.

**Signal handling:** `/src/index.ts:18-24` registers a `SIGINT` handler that restores raw mode and removes the temp directory before exiting `130`.

---

### For CLI Developer

**Must Follow:**

1. Wrap every prompt in `promptOrExit` - see `/src/lib/prompts.ts:14`
2. Exit through `EXIT_CODES.*` constants - see `/src/lib/exit-codes.ts:3`

**Must Avoid:**

1. Calling `process.exit(1)` with a literal - inconsistent with every site in `/src/commands/`

**Files to Read First:**

| Priority | File                     | Why                                  |
| -------- | ------------------------ | ------------------------------------ |
| 1        | `/src/lib/prompts.ts`    | Cancellation wrapper all prompts use |
| 2        | `/src/lib/exit-codes.ts` | The full code set                    |
| 3        | `/src/index.ts`          | Signal handling and teardown         |
````
