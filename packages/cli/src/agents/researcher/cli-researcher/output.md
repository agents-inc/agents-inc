## Output Format

<output_format>

**Report the sections your research covered and omit the rest.** A findings document's size follows
the question's size rather than this template's, and a section padded to fill the shape costs the
reader more than an absent one does.

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

---

## The Bar

Every finding carries a verified path, the line range, the values as the source spells them, how
many instances exist, and what the developer should do with it. The difference is what a developer
can act on:

**Below the bar** — true, and worth nothing:

```markdown
The CLI uses oclif and has a few commands with some flags.
```

**At the bar** — the same claim, actionable:

```markdown
**Framework:** oclif v4 — entry `/bin/run.js` → `/src/index.ts:1-12`
**Discovery:** file-per-command under `/src/commands/`; 6 commands found

**Command shape:** `/src/commands/init.ts:14-58` — `export default class Init extends Command`,
`static flags`, `async run()`. A default export is required; the framework loads by `.default`.

**Flags** (`/src/commands/init.ts:18-27`):
`--force` boolean, default `false`, alias `-f` · `--config` string, no default, env `APP_CONFIG`

**Exit codes** (`/src/lib/exit-codes.ts:3-9`): `EXIT_CODES.ERROR` = 1, `EXIT_CODES.CANCELLED` = 130.
Called at `/src/commands/init.ts:44` on validation failure.
```

The paths, flags and codes above illustrate the shape. Write the ones you actually opened.
