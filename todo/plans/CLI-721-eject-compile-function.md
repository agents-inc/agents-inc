# CLI-721: Eject a Standalone Compile Function for Sub-Agent Compilation

**Status:** Refinement
**Date:** 2026-02-26
**Related:** D-44 (eject templates), D-12 (eject full agents), CLI-716 (eject skills by domain)

---

## 1. Open Questions

These must be resolved before implementation begins.

### Q1: Delivery mechanism -- eject type vs npm export vs standalone file?

| Option                                                                 | Description                                          | Pros                                                         | Cons                                                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **A: New eject type** (`agentsinc eject compile`)                      | Writes a self-contained `.ts` file to the project    | Zero runtime dep on CLI; user owns the code; can customize   | Harder to update; must bundle or inline all deps; large output file                                   |
| **B: Public npm export** (`import { compile } from "@agents-inc/cli"`) | Export the function from the package's public API    | Easy to update; no code duplication; type-safe imports       | User takes full CLI as dep (oclif, Ink, Zustand, React all in node_modules); coupling to CLI releases |
| **C: Separate lightweight package** (`@agents-inc/compiler`)           | New package with just the compile pipeline           | Clean dependency boundary; small install; semver independent | Two packages to maintain; publish coordination; more infra                                            |
| **D: Both A and B**                                                    | Offer npm export AND eject for those who want a copy | Maximum flexibility                                          | Maintenance of two surfaces                                                                           |

**Recommendation:** Start with **Option B** (public npm export) as the minimal viable approach. It requires the least new infrastructure and gives users a programmatic API immediately. Option A (eject type) can be layered on later if users want zero-dependency standalone files.

### Q2: How should template resolution work outside the CLI?

The Liquid engine resolves templates from up to 3 directories (see `createLiquidEngine` in `compiler.ts:412-437`):

1. `{project}/.claude-src/agents/_templates/` (project-local overrides)
2. `{project}/.claude/templates/` (legacy)
3. `{CLI_ROOT}/src/agents/_templates/` (built-in -- the `agent.liquid` file)

For a standalone function, the caller must either:

- **Pass a template directory path** -- caller is responsible for pointing to templates
- **Embed the default template** -- the built-in `agent.liquid` is inlined as a string constant
- **Auto-resolve from CLI package** -- find `node_modules/@agents-inc/cli/src/agents/_templates/`

**Recommendation:** Accept an optional `templatesDir` parameter. If not provided, auto-resolve from the installed CLI package path. This keeps the default zero-config while allowing overrides.

### Q3: Should the function accept raw file contents or paths?

The current compiler reads agent files from disk (intro.md, workflow.md, etc.) and reads skill definitions from SKILL.md files. A standalone function could:

- **Accept paths** and do its own I/O (like today)
- **Accept pre-loaded content** (pure function, no I/O)
- **Accept both** via an options object

**Recommendation:** Accept paths (agent source directory, skills directory, output directory) because the content-based approach would require callers to replicate the entire file discovery logic. Provide a high-level orchestrator that does the I/O internally.

### Q4: Should it support both plugin mode and local mode?

The current compiler has two code paths:

- **Local mode** (`compileAgentForPlugin` with `installMode: "local"`): skill refs are plain skill IDs
- **Plugin mode** (`compileAgentForPlugin` with `installMode: "plugin"`): skill refs use `pluginRef` format (`skillId:skillId`)

**Recommendation:** Default to local mode. Accept an optional `installMode` parameter for users who need plugin-mode compilation.

---

## 2. Current State Analysis

### Compilation Pipeline Overview

The compilation pipeline has two main entry points:

1. **`recompileAgents()`** in `src/cli/lib/agents/agent-recompiler.ts:140` -- the high-level orchestrator used by `compile` command and `edit` flow
2. **`compileAllAgents()`** in `src/cli/lib/compiler.ts:234` -- lower-level, compiles all agents and writes to disk (used by the legacy `CompileContext` path)

Both eventually call the same core function: `compileAgentForPlugin()` in `src/cli/lib/stacks/stack-plugin-compiler.ts:69` (for plugin/recompile flows) or `compileAgent()` in `src/cli/lib/compiler.ts:208` (for the CompileContext flow).

### What the compiler actually does (per agent)

```
1. Read agent files from disk:
   - intro.md (required)
   - workflow.md (required)
   - examples.md (optional, has default)
   - critical-requirements.md (optional)
   - critical-reminders.md (optional)
   - output-format.md (optional, falls back to category dir)

2. Build template context (CompiledAgentData):
   - Split skills into preloaded vs dynamic
   - Attach agent config metadata

3. Sanitize all user-controlled fields (prevent Liquid injection)

4. Render through Liquid template engine (agent.liquid)

5. Validate output (XML tag balance, placeholder detection)

6. Write compiled .md file to output directory
```

### What `recompileAgents()` does (orchestration)

```
1. Load project config (config.yaml) from projectDir
2. Load agent definitions (agent.yaml files) from source + project
3. Resolve which agents to compile (from config, from args, or from existing files)
4. Discover skills (plugin skills + local skills, or use provided skills)
5. Build CompileConfig from agent names + stack config
6. Create Liquid engine with template root hierarchy
7. Resolve agents: map AgentDefinition + SkillReference -> AgentConfig
8. For each resolved agent: compile and write to disk
```

### CLI/UI Coupling Points

The compilation pipeline is already mostly decoupled from CLI/UI concerns:

| Component                         | CLI/UI dependency? | Notes                                                                              |
| --------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `compiler.ts`                     | **None**           | Pure lib code. Uses `log()`/`verbose()`/`warn()` (console-based logger), not oclif |
| `agent-recompiler.ts`             | **None**           | Pure lib code. Same logger pattern                                                 |
| `stack-plugin-compiler.ts`        | **None**           | Pure lib code                                                                      |
| `resolver.ts`                     | **None**           | Pure lib code                                                                      |
| `loading/loader.ts`               | **None**           | Pure lib code                                                                      |
| `configuration/project-config.ts` | **None**           | Pure lib code                                                                      |
| `commands/compile.ts`             | **Yes**            | oclif Command class, `this.log()`, `this.error()`, flags                           |
| `output-validator.ts`             | **Minimal**        | Uses `log()` from logger util                                                      |

**Key finding: The core compilation functions have NO dependency on oclif, Ink, Zustand, or React.** They use the simple `log()`/`verbose()`/`warn()` module-level logger. This means extraction is straightforward -- the functions are already library-grade code.

---

## 3. Dependency Analysis

### Direct dependencies of `recompileAgents()` (the best extraction candidate)

```
recompileAgents() (agent-recompiler.ts)
  |
  +-- loadProjectConfig()          <- configuration/project-config.ts
  |     +-- safeLoadYamlFile()     <- utils/yaml.ts
  |     +-- projectConfigLoaderSchema <- lib/schemas.ts (Zod)
  |     +-- normalizeStackRecord() <- stacks/stacks-loader.ts
  |
  +-- loadAllAgents()              <- loading/loader.ts
  |     +-- agentYamlConfigSchema  <- lib/schemas.ts (Zod)
  |     +-- glob, readFile         <- utils/fs.ts (fs-extra, fast-glob)
  |
  +-- loadProjectAgents()          <- loading/loader.ts
  |
  +-- discoverAllPluginSkills()    <- plugins/plugin-discovery.ts
  |     +-- glob, readFile         <- utils/fs.ts
  |     +-- parseFrontmatter()     <- loading/loader.ts (Zod)
  |
  +-- buildCompileConfig()         <- agent-recompiler.ts (local)
  |     +-- buildSkillRefsFromConfig() <- resolver.ts
  |
  +-- createLiquidEngine()         <- compiler.ts
  |     +-- Liquid                 <- liquidjs (npm)
  |     +-- directoryExists()      <- utils/fs.ts
  |
  +-- resolveAgents()              <- resolver.ts
  |     +-- resolveSkillReferences() <- resolver.ts
  |     +-- resolveAgentSkillRefs()  <- resolver.ts
  |
  +-- compileAgentForPlugin()      <- stacks/stack-plugin-compiler.ts
  |     +-- readFile, readFileOptional <- utils/fs.ts
  |     +-- sanitizeCompiledAgentData() <- compiler.ts
  |     +-- engine.renderFile()    <- liquidjs
  |
  +-- getPluginAgentsDir()         <- plugins/ (only for default output path)
  +-- writeFile, ensureDir, glob   <- utils/fs.ts
```

### External npm dependencies required

| Package     | Used for                                          | Size           | Required?                                       |
| ----------- | ------------------------------------------------- | -------------- | ----------------------------------------------- |
| `liquidjs`  | Template rendering                                | ~200KB         | **Yes** -- core of compilation                  |
| `yaml`      | Parsing config.yaml, agent.yaml, metadata.yaml    | ~150KB         | **Yes** -- reads all YAML configs               |
| `zod`       | Schema validation at parse boundaries             | ~60KB          | **Yes** -- validates all parsed data            |
| `fs-extra`  | File system operations                            | ~50KB          | **Yes** -- readFile, writeFile, ensureDir, copy |
| `fast-glob` | Glob pattern matching for file discovery          | ~40KB          | **Yes** -- finds SKILL.md, agent.yaml files     |
| `remeda`    | `unique`, `uniqueBy`, `pipe`, `flatMap`, `filter` | tree-shakeable | **Yes** -- used in compiler.ts, resolver.ts     |

### NOT required (CLI/UI only)

| Package           | Why not needed                                                  |
| ----------------- | --------------------------------------------------------------- |
| `@oclif/core`     | Command framework -- standalone function has no commands        |
| `ink`             | Terminal UI rendering                                           |
| `react`           | Ink dependency                                                  |
| `@inkjs/ui`       | Ink components                                                  |
| `zustand`         | Wizard state management                                         |
| `@oclif/plugin-*` | CLI plugins                                                     |
| `terminal-image`  | ASCII art                                                       |
| `execa`           | Child process execution                                         |
| `giget`           | Git repo fetching                                               |
| `gray-matter`     | Only used in skill-plugin-compiler.ts, not in core compile path |

---

## 4. Design Options

### Option A: Public npm export (RECOMMENDED for v1)

Add a new entry point to the existing package:

```
src/cli/lib/compile-api.ts  <- new file, thin orchestrator
```

Expose via `package.json` exports:

```json
{
  "exports": {
    ".": { "import": "./dist/index.js" },
    "./compile": { "import": "./dist/compile-api.js" }
  }
}
```

**Pros:** Minimal new code (thin wrapper around existing `recompileAgents`); automatically stays in sync; users get TypeScript types for free.

**Cons:** Importing from `@agents-inc/cli/compile` brings the full CLI package into `node_modules` (though tree-shaking may help if bundled).

### Option B: Eject type (`agentsinc eject compile`)

Write a self-contained `.ts` file to the user's project. This file would need to either:

- **Inline all dependencies** (bundled with esbuild into a single file) -- large but zero external deps
- **Import from `@agents-inc/cli`** -- defeats the "standalone" purpose
- **Require the user to install liquidjs, yaml, zod, etc.** -- adds friction

If we inline/bundle, the ejected file would be ~500KB+ of compiled JavaScript. This is viable but unusual for an "ejected" file.

### Option C: Separate `@agents-inc/compiler` package

Create a lean package with just:

- `compiler.ts`
- `resolver.ts`
- `loader.ts`
- `schemas.ts` (subset)
- `utils/fs.ts`, `utils/yaml.ts`, `utils/logger.ts`

**Pros:** Clean dependency boundary.
**Cons:** Major refactoring to extract shared code; dual maintenance; overkill for current stage.

### Recommendation

**Phase 1:** Option A (public npm export). Minimal work, immediate value.
**Phase 2 (optional):** Option B (eject type) for users who want zero CLI dependency. This can generate a bundled standalone file using esbuild.

---

## 5. API Design

### Phase 1: Public npm export

```typescript
// src/cli/lib/compile-api.ts

export type CompileOptions = {
  /** Directory containing agent source files (agent.yaml, intro.md, etc.) */
  agentSourcePath: string

  /** Directory containing skill files (SKILL.md, metadata.yaml) */
  skillsDir?: string

  /** Output directory for compiled agent .md files */
  outputDir: string

  /**
   * Project directory for config resolution, plugin discovery, and project-local agents.
   * If omitted, defaults to `process.cwd()`. This directory is used as BOTH the config
   * search root (for config.yaml) AND the plugin discovery root (for .claude/plugins/).
   * Pass explicitly when `outputDir` differs from the project root to avoid unexpected
   * plugin/config resolution behavior.
   */
  projectDir?: string

  /** Specific agent names to compile (default: all from config or all available) */
  agents?: string[]

  /** Pre-resolved skills map (bypasses skill discovery) */
  skills?: Record<string, { id: string; path: string; description: string }>

  /** Directory containing Liquid templates (default: auto-resolve from CLI package) */
  templatesDir?: string

  /** Install mode affects skill reference format in compiled output */
  installMode?: "local" | "plugin"

  /** Enable verbose logging to console */
  verbose?: boolean
}

export type CompileResult = {
  /** Successfully compiled agent names */
  compiled: string[]

  /** Agent names that failed to compile */
  failed: string[]

  /** Warning messages from compilation */
  warnings: string[]
}

/**
 * Compile agents from source files into rendered Markdown prompts.
 *
 * This is the programmatic equivalent of `agentsinc compile --output <dir>`.
 * No CLI framework, wizard, or interactive prompts -- just the compilation pipeline.
 */
export async function compile(options: CompileOptions): Promise<CompileResult>
```

### Usage example

```typescript
import { compile } from "@agents-inc/cli/compile"

const result = await compile({
  agentSourcePath: "./src/agents",
  outputDir: "./.claude/agents",
  projectDir: process.cwd(),
  agents: ["web-developer", "api-developer"],
  verbose: true,
})

console.log(`Compiled: ${result.compiled.join(", ")}`)
if (result.failed.length > 0) {
  console.error(`Failed: ${result.failed.join(", ")}`)
}
```

### Internal implementation sketch

```typescript
// compile-api.ts (internal)
import { AGENT_NAMES } from "../../consts" // or wherever the AgentName union values are enumerable

export async function compile(options: CompileOptions): Promise<CompileResult> {
  // Save verbose state and restore after compilation to avoid side effects for library consumers
  const previousVerbose = verboseMode // access module-level state from logger
  if (options.verbose) setVerbose(true)

  try {
    // Validate agent names at the public API boundary.
    // Invalid names are filtered out with a warning rather than causing a runtime cast error.
    let validatedAgents: AgentName[] | undefined
    if (options.agents) {
      const allAgentNames = new Set<string>(
        typedKeys<AgentName>(/* loaded agents */)
      )
      // Note: Since AgentName is a union type, we validate at runtime by loading
      // available agent definitions and checking names against them. Invalid names
      // are included as warnings in the result rather than silently ignored.
      // The boundary cast happens AFTER validation:
      validatedAgents = options.agents as AgentName[]
      // recompileAgents() already handles unknown agent names by adding them to
      // result.warnings ("Agent X not found in source definitions") -- so passing
      // unrecognized names is safe, they produce warnings rather than crashes.
    }

    // Delegate to existing recompileAgents() with mapped options
    const result = await recompileAgents({
      pluginDir: options.projectDir ?? process.cwd(),
      sourcePath: options.agentSourcePath,
      agents: validatedAgents,
      skills: options.skills as
        Partial<Record<SkillId, SkillDefinition>> | undefined,
      projectDir: options.projectDir,
      outputDir: options.outputDir,
    })

    return {
      compiled: result.compiled,
      failed: result.failed,
      warnings: result.warnings,
    }
  } finally {
    // Always restore previous verbose state, even if compilation throws
    setVerbose(previousVerbose)
  }
}
```

**Agent name validation strategy:** The `agents` parameter accepts `string[]` at the public boundary. Invalid agent names are NOT silently ignored -- `recompileAgents()` already handles them by adding `"Agent 'X' not found in source definitions"` to `result.warnings` (see `buildCompileConfig` in `agent-recompiler.ts:96-101`). This means invalid names surface as warnings in the `CompileResult`, which is the correct behavior for a library API (no crashes, clear feedback).

**Verbose state restoration:** The logger module (`utils/logger.ts`) exposes `setVerbose()` but not a getter. Implementation must either: (a) add a `getVerbose()` export to `logger.ts` that returns the module-level `verboseMode` boolean, or (b) read the module-level variable directly if `compile-api.ts` is co-located. **Recommended:** Add `getVerbose()` to `logger.ts` (1 line: `export function getVerbose(): boolean { return verboseMode; }`). Then the save/restore pattern becomes:

```typescript
const savedVerbose = getVerbose()
if (options.verbose) setVerbose(true)
try {
  /* ... */
} finally {
  setVerbose(savedVerbose)
}
```

The key insight is that `recompileAgents()` already accepts all the inputs we need. The `compile()` function is a thin, user-friendly wrapper that:

1. Maps user-facing option names to internal parameter names
2. Hides internal types (`AgentName`, `SkillId`) behind plain strings
3. Saves and restores verbose logging state around compilation
4. Returns a clean result type without internal types
5. Lets invalid agent names surface as warnings (no crashes)

---

## 6. Step-by-Step Implementation Plan

### Step 1: Create the public API module

**File:** `src/cli/lib/compile-api.ts`

- Define `CompileOptions` and `CompileResult` types (public-facing, no internal type references)
- Implement `compile()` function as a thin wrapper around `recompileAgents()`
- Handle `templatesDir` override (if provided, pass to `createLiquidEngine`)
- Handle `skillsDir` (if provided, discover skills from that directory)
- Handle `verbose` flag (call `setVerbose()`)
- Export everything as named exports

### Step 2: Add tsup entry point for compile-api (separate config, no shebang)

**File:** `tsup.config.ts`

The current tsup config applies `banner: { js: "#!/usr/bin/env node" }` globally to all entries. A library module (`compile-api.js`) must NOT have a shebang -- it would corrupt the module when imported by consumer code.

**Solution:** Export an array of two configs from `tsup.config.ts` instead of a single config. tsup natively supports this pattern:

```typescript
// tsup.config.ts
export default [
  // Config 1: CLI entries (with shebang)
  defineConfig({
    entry: [
      "src/cli/index.ts",
      "src/cli/commands/**/*.{ts,tsx}",
      "src/cli/hooks/**/*.ts",
      "src/cli/components/**/*.tsx",
      "src/cli/stores/**/*.ts",
    ],
    banner: { js: "#!/usr/bin/env node" },
    // ... (all other existing options unchanged)
  }),
  // Config 2: Library entry (NO shebang)
  defineConfig({
    entry: ["src/cli/lib/compile-api.ts"],
    format: ["esm"],
    platform: "node",
    target: "node18",
    sourcemap: true,
    shims: true,
    dts: false,
    outDir: "dist",
    // NO banner -- this is a library module, not a CLI entry
    // NO clean -- only the first config should clean dist/
  }),
]
```

This is the simplest approach: no post-build scripts, no conditional logic, just two standard tsup configs. The first config keeps `clean: true` and the shebang; the second omits both.

### Step 3: Add package.json export

**File:** `package.json`

- Add `"./compile"` export mapping to `dist/compile-api.js`
- Add `compile-api.ts` to `files` array if needed (tsup should handle this)

### Step 4: Handle template resolution for standalone use

**File:** `src/cli/lib/compiler.ts` (modify `createLiquidEngine`)

Currently `createLiquidEngine` always adds `PROJECT_ROOT/templates` (which resolves to the CLI install path). For standalone use, we need to ensure this still works when imported as a dependency.

- `PROJECT_ROOT` is computed from `__dirname` in `consts.ts` -- this already handles both dev and dist paths
- When installed as a dependency, `PROJECT_ROOT` points to `node_modules/@agents-inc/cli/` which includes `src/agents/_templates/` (in the `files` array)
- **No changes needed** -- the current `PROJECT_ROOT` resolution already works for npm consumers

### Step 5: Write tests

- Unit test for `compile()` with mocked filesystem
- Integration test that compiles a fixture agent directory
- Test error cases (missing agent files, missing skills)
- Test verbose logging toggle

### Step 6: Add TypeScript declarations (manual .d.ts file)

The current tsup config has `dts: false` globally. Enabling `dts: true` even for just the compile-api config would pull in type generation for all transitive internal types (oclif commands, Ink components, Zustand stores), which is slow and fragile.

**Concrete solution:** Write a manual `compile-api.d.ts` file that covers the small public surface. The public API is just two types (`CompileOptions`, `CompileResult`) and one function (`compile`). This is approximately 30 lines and requires no build pipeline changes.

**File:** `dist/compile-api.d.ts` (written by a post-build copy step, or committed as `src/cli/lib/compile-api.d.ts` and copied to dist)

```typescript
export type CompileOptions = {
  agentSourcePath: string
  skillsDir?: string
  outputDir: string
  projectDir?: string
  agents?: string[]
  skills?: Record<string, { id: string; path: string; description: string }>
  templatesDir?: string
  installMode?: "local" | "plugin"
  verbose?: boolean
}

export type CompileResult = {
  compiled: string[]
  failed: string[]
  warnings: string[]
}

export function compile(options: CompileOptions): Promise<CompileResult>
```

Add `"types"` field to the `"./compile"` export in `package.json`:

```json
"./compile": {
  "import": "./dist/compile-api.js",
  "types": "./dist/compile-api.d.ts"
}
```

**Why manual over generated:** The public surface is tiny (~30 lines), it never changes without updating the implementation, and it avoids any risk of exposing internal types to consumers. The `.d.ts` file is maintained alongside the implementation in `compile-api.ts` -- any signature change in the `.ts` file requires updating the `.d.ts` file.

### Step 7: Documentation

- Add a `docs/programmatic-compile.md` explaining the public API
- Add examples for CI/CD integration
- Update README if needed (separate task D-44-style)

---

## 7. Edge Cases

### Template resolution paths

- **CLI installed globally:** `PROJECT_ROOT` resolves to global install path. `src/agents/_templates/agent.liquid` must exist there. The `files` field in package.json already includes `src/agents/` so npm publish includes templates.
- **CLI installed as devDependency:** `PROJECT_ROOT` resolves to `node_modules/@agents-inc/cli/`. Same resolution works.
- **Ejected templates:** User has `.claude-src/agents/_templates/agent.liquid`. `createLiquidEngine` already checks this first.
- **No project dir:** If `projectDir` is not provided, only the built-in template is used. This is fine.

### Skill discovery without config

If no `config.yaml` exists and no `skills` map is passed:

- `loadProjectConfig` returns null
- `recompileAgents` falls back to `discoverAllPluginSkills()` which scans `.claude/plugins/*/skills/`
- If no plugins are installed, no skills are found
- Agents compile with zero skills (valid but probably not what the user wants)

**Mitigation:** Document that callers should either pass `skills` directly or ensure a `config.yaml` exists with skill assignments.

### Relative vs absolute paths

All path handling in the compiler uses `path.join()` and `path.resolve()`. The `compile()` function should document:

- `agentSourcePath` can be relative (resolved from cwd) or absolute
- `outputDir` can be relative or absolute
- `projectDir` should be absolute for consistent behavior

### Concurrent compilation

`recompileAgents()` processes agents sequentially (for-of loop). This is fine for typical use (5-20 agents). No concurrency issues.

### Logger side effects

`setVerbose()` is a module-level setter (`utils/logger.ts:6`). Calling `compile({ verbose: true })` would permanently enable verbose logging for all subsequent operations without the save/restore pattern.

**Concrete fix:** Add `getVerbose()` to `utils/logger.ts` (1 line), then in `compile()`:

1. Call `const savedVerbose = getVerbose()` before any work
2. Call `setVerbose(options.verbose ?? false)` to apply the caller's preference
3. Wrap the `recompileAgents()` call in `try/finally`
4. Call `setVerbose(savedVerbose)` in the `finally` block

This ensures verbose state is always restored, even if compilation throws an error.

---

## 8. External Tool Research

### If we later implement Option B (eject type with bundled file)

**esbuild** (recommended):

- Already used transitively by tsup (tsup wraps esbuild)
- Can bundle to a single `.mjs` file with all deps inlined
- `--external` flag to keep node builtins external
- `--bundle --platform=node --format=esm`
- Estimated bundle size: ~300-500KB (liquidjs is the largest dep)

**tsup**:

- Already in the project
- Could add a separate tsup config for the standalone bundle
- `noExternal: ["liquidjs", "yaml", "zod", "remeda", "fs-extra", "fast-glob"]`
- Would produce a self-contained file

**Approach for eject type:**

```typescript
// In eject command handler:
// 1. Read the pre-bundled compile function from CLI package assets
// 2. Write it to the user's project directory
// 3. Write a thin wrapper with the user's config baked in
```

The pre-bundled file could be generated at build time and included in the npm package under `assets/compile-standalone.mjs`.

**Deferring this to a future phase** -- the npm export (Option A) is sufficient for v1.

---

## 9. Test Plan

### Unit tests

**File:** `src/cli/lib/__tests__/compile-api.test.ts`

| Test                                          | What it verifies                                |
| --------------------------------------------- | ----------------------------------------------- |
| `compile() with valid agent source`           | Returns compiled agents in result               |
| `compile() writes .md files to outputDir`     | Files exist on disk after compile               |
| `compile() with specific agents list`         | Only compiles requested agents                  |
| `compile() with pre-provided skills`          | Uses provided skills, skips discovery           |
| `compile() with missing agent source`         | Returns failure with meaningful warning         |
| `compile() with missing required agent files` | Handles missing intro.md/workflow.md gracefully |
| `compile() verbose logging`                   | setVerbose called when verbose=true             |
| `compile() restores verbose state`            | Previous verbose setting preserved              |
| `compile() without projectDir`                | Falls back to cwd behavior                      |

### Integration tests

| Test                               | What it verifies                                                |
| ---------------------------------- | --------------------------------------------------------------- |
| Full compile with fixture agents   | End-to-end: agent.yaml + intro.md + workflow.md -> compiled .md |
| Compile with ejected templates     | Custom template directory overrides built-in                    |
| Compile with local + plugin skills | Skill merging works correctly                                   |

### Existing test compatibility

- Run `npm test` to verify no regressions
- Existing `compiler.test.ts` and `agent-recompiler.test.ts` tests should continue passing unchanged
- The new `compile()` function is additive -- no existing code is modified

---

## 10. Files Changed Summary

### New files

| File                                        | Purpose                                                           |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `src/cli/lib/compile-api.ts`                | Public compile function and types                                 |
| `src/cli/lib/compile-api.d.ts`              | Manual TypeScript declarations for public API surface (~30 lines) |
| `src/cli/lib/__tests__/compile-api.test.ts` | Tests for the public API                                          |

### Modified files

| File                      | Change                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `tsup.config.ts`          | Split into array of two configs: CLI entries (with shebang) and library entry (no shebang) |
| `package.json`            | Add `"./compile"` export path with `"types"` field pointing to manual `.d.ts`              |
| `src/cli/utils/logger.ts` | Add `getVerbose()` export (1 line) for verbose state save/restore                          |

### No changes needed

| File                  | Why                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `compiler.ts`         | Already decoupled from CLI. `createLiquidEngine` and `sanitizeCompiledAgentData` work as-is |
| `agent-recompiler.ts` | `recompileAgents()` already accepts all needed params. No changes                           |
| `resolver.ts`         | Pure function, no changes needed                                                            |
| `loading/loader.ts`   | Pure function, no changes needed                                                            |
| `consts.ts`           | `PROJECT_ROOT` resolution already works for npm consumers                                   |
| `commands/eject.ts`   | No new eject type in Phase 1                                                                |

### Estimated scope

- **New code:** ~80-120 lines (compile-api.ts) + ~30 lines (compile-api.d.ts)
- **Modified code:** ~20 lines (tsup.config.ts split into array, package.json exports, logger.ts getVerbose)
- **Test code:** ~150-200 lines
- **Complexity:** Low -- thin wrapper around existing well-tested code

---

## Appendix: Dependency Graph Visualization

```
compile() [NEW -- public API]
  |
  v
recompileAgents() [EXISTING -- unchanged]
  |
  +-- loadProjectConfig()
  +-- loadAllAgents()
  +-- loadProjectAgents()
  +-- discoverAllPluginSkills()
  +-- buildCompileConfig()
  +-- createLiquidEngine()
  +-- resolveAgents()
  +-- compileAgentForPlugin()
  +-- writeFile() / ensureDir()
```

The `compile()` function sits as a thin adapter layer on top of the existing pipeline. All actual compilation logic remains in its current location, untouched.
