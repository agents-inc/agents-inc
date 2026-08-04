---
type: anti-pattern
severity: medium
affected_files:
  - e2e/interactive/scenario-c-init-registers-project.e2e.test.ts
  - e2e/lifecycle/re-edit-cycles.e2e.test.ts
  - e2e/lifecycle/preloaded-preservation.e2e.test.ts
  - e2e/lifecycle/edit-remove-skill-stack-surgical.e2e.test.ts
  - e2e/lifecycle/edit-global-remove-dual-scope-partial.e2e.test.ts
  - e2e/lifecycle/edit-project-scope-last-skill-stack-cleanup.e2e.test.ts
  - e2e/lifecycle/dual-scope-same-source-plugin.e2e.test.ts
  - e2e/lifecycle/dual-scope-same-source-eject.e2e.test.ts
  - e2e/lifecycle/dual-scope-agent-badge-and-s-inert.e2e.test.ts
  - e2e/fixtures/dual-scope-helpers.ts
  - e2e/helpers/test-utils.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: "Shared asserting reader (loadConfigOrFail) landed in e2e/helpers/test-utils.ts; the ~18 spec-file call sites still carry the raw load + null-check ritual and are scheduled for the Pass 8 phase-2 spec sweep."
---

## What Was Wrong

E2E spec files load a scope's `config.ts` with `loadProjectConfigFromDir(dir)`,
which returns `LoadedProjectConfig | null`. Roughly 18 files then narrow that
`null` away with one of three rituals, two of which are CLAUDE.md violations:

1. Assert-then-escape (most common):

   ```ts
   const loaded = await loadProjectConfigFromDir(projectDir);
   expect(loaded, "project config.ts must exist").not.toBeNull();
   if (!loaded) return;
   const finalConfig = loaded.config;
   ```

   The `expect` does fail the test, so this one is merely noisy — but it trains
   the shape that the next two copy.

2. Empty-value fallback inside a helper — a silent fallback on data that must
   exist (`dual-scope-helpers.ts` `readSkillEntries`/`readAgentEntries`,
   `re-edit-cycles.e2e.test.ts`):

   ```ts
   if (!loaded) return { skillIds: [], agentNames: [], domains: [] };
   ```

   If the load ever fails for a reason the caller did not anticipate, the helper
   hands back a well-formed empty result. Any downstream `not.toContain(...)` or
   `toHaveLength(0)` assertion then passes vacuously.

3. Optional chaining on must-exist data
   (`scenario-c-init-registers-project.e2e.test.ts`,
   `preloaded-preservation.e2e.test.ts`):

   ```ts
   const afterGlobal = await loadProjectConfigFromDir(fakeHome);
   projectsAfterGlobalInit = afterGlobal?.config.projects;
   ```

   This is the exact pattern CLAUDE.md bans under "NEVER use optional chaining
   (`?.`) or null coalescing on data that must exist — silent fallbacks hide
   bugs." A missing config here surfaces later as a confusing `undefined`
   comparison rather than at the load site.

There is no shared asserting loader, so every file re-invents the narrowing and
each re-invention picks a slightly different (and sometimes unsafe) escape.

## Fix Applied

Added an asserting reader pair to `e2e/helpers/test-utils.ts`:

```ts
export async function loadConfigOrFail(dir: string): Promise<ProjectConfig>;
export async function readAgentEntriesFor(
  dir: string,
  agentName: AgentName,
): Promise<AgentScopeConfig[]>;
```

`loadConfigOrFail` throws when the config is absent or fails to parse — it never
substitutes an empty config — so the three rituals above collapse to a single
call that cannot silently succeed. `readAgentEntriesFor` layers the
"all entries for one agent name" filter on top (distinct from
`dual-scope-helpers.readAgentEntries(dir)`, which returns every agent entry).

Adoption at the ~18 spec-file call sites is deferred to the Pass 8 phase-2 sweep
(this pass is infra-only, and the spec files are owned by other concurrent
agents).

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md`, new section
"Reading config.ts in E2E tests":

> E2E tests must read a scope's config through `loadConfigOrFail(dir)` from
> `e2e/helpers/test-utils.ts`. Never call `loadProjectConfigFromDir` directly in
> a spec file.
>
> Banned narrowing patterns after a raw load:
>
> - `if (!loaded) return;` / `if (!loaded) return <empty value>;` — a missing
>   config is a test bug, not a branch to handle.
> - `loaded?.config.x` — optional chaining on data the test requires.
>
> Rationale: an absent config must fail loudly at the load site. Empty-array and
> `undefined` fallbacks let later assertions (`not.toContain`, `toHaveLength(0)`,
> `toBeUndefined`) pass for the wrong reason.

Also worth mirroring into the CLAUDE.md "Test Assertions" block, since the
existing "no silent fallbacks" rule is written for `src/` data-integrity code
and readers have not been generalizing it to test helpers.
