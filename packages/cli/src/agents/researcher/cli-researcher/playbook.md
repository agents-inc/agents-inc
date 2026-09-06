<workflow>

## Investigation

**Establish the framework first.** Read `package.json` for the framework dependency and the `bin`
entry, open the entry point it names, and note how that framework discovers commands —
file-per-command, explicit registration, a manifest, or plugin loading. Everything after this is
interpreted through it.

**Settle what the finding has to answer.** Which decision does the developer face, what would settle
it, and which existing command or flow solved it already — a search opened without those is a tour
of the codebase rather than an answer to it.

**Then locate with Glob, narrow with Grep, and read only the files that carry the answer.** Reading
an entire command directory to answer a question about one flag spends the context the flow it
belongs to still needs.

**Follow each claim from the entry point through the handler to the side effect.** A flag to its
declaration, an exit code to its numeric constant, a config key to the source that wins — a call
site shows one use rather than the contract.

</workflow>

---

## Research Modes

### Mode 1: Command Structure Discovery

**When asked:** "What commands exist?" or "How are commands registered?"

1. Read `package.json` — the `bin` map, the framework dependency, and any framework config block
2. Locate the entry point and determine how commands are discovered
3. Glob the command directory for the full inventory
4. Read the simplest and the most complex command files completely
5. Note subcommand nesting, aliases, hidden commands, and default-command behaviour
6. Note lifecycle hooks and where they live

**Catalogue per command:** name, invocation path, file location, summary, aliases, hidden flag,
arguments, flags, and whether it is interactive.

**Output focus:** command inventory with handler locations, nesting topology, and the registration
mechanism a new command must match

---

### Mode 2: Argument and Flag Parsing

**When asked:** "What flags does X take?" or "How is input validated?"

1. Read the flag and argument declarations on the target commands
2. Record each flag's type, default, alias, required-ness, and env-var backing
3. Find validation — parser callbacks, schema validation at the boundary, and manual guards
4. Note relationships between flags: mutual exclusion, dependency, implied values
5. Check positional handling: order, optionality, variadics, and `--` passthrough
6. Determine what invalid input produces — message, stream, and exit code

**Catalogue per flag:** name, short alias, type, default, required, env var, validation site, and
the error emitted when validation fails.

**Output focus:** flag tables per command, validation sites, and the invalid-input contract

---

### Mode 3: Interactive Prompt and Terminal UI

**When asked:** "How do the prompts work?" or "What terminal UI components exist?"

1. Identify the prompt or terminal UI library and its import sites
2. Catalogue the reusable components and prompt wrappers, reading their props from the definitions
3. Find keyboard handling: key handlers, focus management, navigation keys
4. Trace the cancellation contract — what Ctrl+C does, whether cancellation is a sentinel or an
   exception, and where it is checked
5. Note layout primitives, footers, and shared chrome a new screen is expected to reuse
6. Note how a non-interactive environment is detected, and what runs instead

**Catalogue per component:** name, location, props, the keys it handles, and the screens that render
it.

**Output focus:** component inventory with props, the keyboard map, and the cancellation contract

---

### Mode 4: Configuration Hierarchy

**When asked:** "How does config loading work?" or "Which value wins?"

1. Find the config loader and read it completely
2. Determine every source in the precedence chain and which one wins
3. Note file names, formats, and search locations, including home and XDG paths
4. Find whether resolution walks up parent directories, and where it stops
5. Find schema validation at the parse boundary, and what a malformed config produces
6. Determine merge semantics per key — replace, shallow, deep, or concatenate
7. Note which keys the CLI writes, and which path performs the write

**Output focus:** the ordered precedence chain, file locations, per-key merge semantics, and
validation behaviour

---

### Mode 5: Exit Codes and Error Handling

**When asked:** "What exit codes exist?" or "How are errors handled?"

1. Find the exit-code constants and read the full set with each meaning
2. Grep for exit calls and thrown errors, mapping each call site to the code it produces
3. Find the custom error classes and the shared handler that formats them
4. Determine the stdout-versus-stderr routing for errors and warnings
5. Find signal handlers and the teardown they perform — terminal restoration, temp cleanup,
   in-flight work
6. Note whether errors carry actionable remediation text, and where that text is built

**Catalogue per exit code:** numeric value, constant name, meaning, and representative call sites.

**Output focus:** exit-code table, error-class hierarchy, signal behaviour, and the error-output
convention

---

### Mode 6: Output Formatting

**When asked:** "How is terminal output styled?" or "Does this CLI support JSON output?"

1. Identify the colour library and any centralised colour or symbol constants
2. Find the table, list and box helpers, and read their options
3. Find spinner and progress usage — start, update, stop, and failure paths
4. Determine TTY detection, and whether output degrades for pipes, CI, or `NO_COLOR`
5. Catalogue the output-mode flags and which commands honour each
6. Note the logging helpers and the intended audience of each level

**Output focus:** formatting helper inventory, colour and symbol constants, TTY behaviour, and
output-mode coverage per command

---

### Mode 7: Interactive State Management

**When asked:** "How does the wizard hold state?" or "How do multi-step flows work?"

1. Find the store or state machine backing the flow
2. Catalogue the state shape, the actions that mutate it, and the derived selectors
3. Map the step sequence: entry step, transitions, back navigation, terminal steps
4. Determine what persists between runs, where, and when the write happens
5. Note the guards that block a transition, and what makes a step reachable
6. Find where the flow's result is handed to the non-interactive execution path

**Output focus:** state shape, action inventory, step-transition map, and persistence points

---

### Mode 8: Testing Seams

**When asked:** "How is this tested?" or "Where can I hook a test in?"

1. Locate the test directories, the runner, and any CLI-specific utilities
2. Find the command-invocation harness existing tests use
3. Find the terminal-render utility and how rendered frames are asserted
4. Determine how prompts and interactive input are driven or mocked
5. Find the fixture, factory and temp-directory helpers
6. Note seams that exist in production code specifically to enable tests — injected dependencies,
   exported pure helpers, environment overrides

**Output focus:** harness inventory, existing coverage for the target area, and the seams a new test
would use

---

<retrieval_strategy>

## Search Recipes

Starting points rather than a fixed sweep — adapt the pattern to the framework you identified.

```bash
# Entry point, framework dependency, declared binaries
Read("package.json")
Glob("**/commands/**/*.{ts,js}", "**/cli/**/*.{ts,js}")

# Command registration, framework-agnostic sweep
Grep("extends Command|program\\.command|\\.command\\(|yargs\\.command|defineCommand")

# Flag and argument declarations
Grep("static flags|static args|Flags\\.|Args\\.|\\.option\\(|\\.positional\\(")

# Exit codes and process termination
Grep("process\\.exit|EXIT_CODE|exitCode|this\\.error\\(")

# Signal handling and teardown
Grep("SIGINT|SIGTERM|process\\.on\\(")

# Interactive prompts and cancellation
Grep("prompt|confirm|select|isCancel|useInput|render\\(")

# Configuration loading and precedence
Grep("cosmiconfig|loadConfig|readConfig|homedir\\(|XDG_")
Glob("**/*.config.*", "**/.*rc*")

# Environment variable reads — the layer between a flag and a config file
Grep("process\\.env")

# Output formatting and TTY detection
Grep("isTTY|NO_COLOR|chalk|picocolors|kleur|ora|spinner")

# Machine-readable output modes
Grep("--json|jsonFlag|quiet|verbose")

# Interactive state stores and step machines
Grep("create\\(|useStore|currentStep|WizardStep")

# Test harnesses and seams
Glob("**/*.test.{ts,tsx}", "**/e2e/**")
Grep("runCommand|ink-testing-library|lastFrame|stdin\\.write")
```

</retrieval_strategy>
