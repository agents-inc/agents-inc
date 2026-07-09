# Agents Inc. CLI - Refactoring Tasks

> Refactoring tasks from [TODO.md](./TODO.md) are tracked here separately.

---

## R-01: `FEATURE_FLAGS` gates in command `run()` bodies are unmockable from tests

Surfaced during D-212 while adding `NEW_SKILL_COMMAND: false` to gate `cc new skill`. When a test invokes a command via `runCliCommand` (which calls `oclif.run({ root: CLI_ROOT })` → loads from `./dist/commands/`), the feature-flag constants are **inlined by tsup during the bundle step**. There is no live `import` of `feature-flags.js` in the compiled chunk — the boolean is baked into the output. Consequence:

- `vi.mock("../../../feature-flags.js", ...)` cannot intercept a constant that no longer exists in the execution graph
- Every test that exercises a `run()`-gated code path has to be `describe.skip`ed until the flag flips in source
- Coverage for the gated logic drops to zero while the flag is off — regressions can slip in

## The fix — env-var override

Make `feature-flags.ts` read from `process.env` at call time so tests (and local dev) can enable features without editing source:

```ts
// src/cli/lib/feature-flags.ts
const envFlag = (name: string, defaultValue: boolean): boolean => {
  const v = process.env[`AGENTSINC_FLAG_${name}`];
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return defaultValue;
};

export const FEATURE_FLAGS = {
  SOURCE_SEARCH: envFlag("SOURCE_SEARCH", false),
  SOURCE_CHOICE: envFlag("SOURCE_CHOICE", false),
  INFO_PANEL: envFlag("INFO_PANEL", true),
  NEW_SKILL_COMMAND: envFlag("NEW_SKILL_COMMAND", false),
  NEW_AGENT_COMMAND: envFlag("NEW_AGENT_COMMAND", false),
  NEW_MARKETPLACE_COMMAND: envFlag("NEW_MARKETPLACE_COMMAND", false),
} as const;
```

Tests set the env var in `beforeAll` / `beforeEach`:

```ts
beforeAll(() => { process.env.AGENTSINC_FLAG_NEW_SKILL_COMMAND = "1"; });
afterAll(() => { delete process.env.AGENTSINC_FLAG_NEW_SKILL_COMMAND; });
```

Since `feature-flags.ts` is re-evaluated on every process spawn (or every module load in Vitest workers), this works for both unit tests (same process, careful of module cache) and E2E tests (child process via `execa`, inherits env).

## Migration

1. Update `src/cli/lib/feature-flags.ts` with the `envFlag` helper
2. Un-skip the `describe.skip` blocks in:
   - `src/cli/lib/__tests__/commands/new/skill.test.ts` (18 tests)
   - `e2e/commands/new-skill.e2e.test.ts` (14 tests)
3. Add `beforeAll` hooks that set `AGENTSINC_FLAG_NEW_SKILL_COMMAND=1`
4. For E2E, update the harness (`e2e/fixtures/cli.ts` or `runCLI`) to pass through `AGENTSINC_FLAG_*` env vars so individual tests don't have to
5. Verify all 32 previously-skipped tests pass

## Consequences

- **Pro:** any future `FEATURE_FLAGS` gate gets free test coverage
- **Pro:** local dev can enable experimental features without editing source (`AGENTSINC_FLAG_SOURCE_SEARCH=1 cc init`)
- **Con:** flags are now process-env-coupled; CI must not leak env vars between test suites (use explicit `afterAll` cleanup)
- **Con:** tsup can no longer dead-code-eliminate the "disabled" branches, since values are runtime. Bundle size barely changes in practice — single boolean reads

## Priority

**Low for now.** The NEW_SKILL_COMMAND gate is the first real use of this pattern and only affects one command. If another flag-gated command is added before D-212 resolves, bump this to blocker status.

---
