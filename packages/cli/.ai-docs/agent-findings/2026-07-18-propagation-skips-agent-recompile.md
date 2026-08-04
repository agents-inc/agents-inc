---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-18
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: scope-discipline-deferred
status: open
---

## What Was Wrong

`propagateGlobalChangesToProjects` (`local-installer.ts`) updates each registered
project's `config.ts` (via `writeConfigFile`) and `config-types.ts` (via
`regenerateConfigTypes`) when a global skill/agent changes. It never recompiles the
project's agents. A registered project's compiled `.claude/agents/<name>.md` is only
regenerated when that project is edited/installed/compiled directly (via
`compileAndWriteAgents`, called from `installPluginConfig` / the eject path).

Consequence: now that the sibling finding's fix reconciles `projectSplit.stack` during
propagation (dropping a removed global skill from a project-scoped agent's stack), the
project's `config.ts` becomes correct immediately, but the already-compiled
`.claude/agents/<name>.md` on disk still embeds/references the removed skill until the
user next runs a command inside that project. The persisted config (source of truth) and
the compiled artifact drift until the next direct compile.

## Fix Applied

None — discovery only, deliberately deferred as out of scope for the surgical
stack-reconcile fix. Rationale for deferral (not a small, low-risk addition):

- `propagateGlobalChangesToProjects` is currently config-only. Its parameters are
  `(globalConfig, matrix, agents, currentProjectDir?)`.
- `compileAndWriteAgents` requires materially more context that propagation does not
  have in scope: a `SourceLoadResult` (`sourcePath`), each project's resolved
  `localSkills` (`Partial<Record<SkillId, LocalResolvedSkill>>`), a per-project Liquid
  engine (`createLiquidEngine(projectDir)`), a `CompileConfig` (`buildCompileAgents`),
  and an `agentScopeMap`. Wiring these would mean loading the marketplace source and
  each registered project's local skills, then running Liquid compilation per project,
  inside what is today a lightweight config rewrite loop.
- That is a per-project filesystem-and-compilation fan-out with its own failure modes
  (source unavailable, project-local skill drift, partial-write recovery). It is a
  larger, higher-risk change than the config reconcile and is not required to make the
  confirmed-red test green — that test asserts only on `config.ts` via
  `loadProjectConfigFromDir`, not on compiled `.md`.

## Proposed Standard

Follow-up (cli-developer, separate task): decide the intended contract for propagation —
either (a) recompile affected registered projects' agents during propagation by giving
the function the source/local-skill/engine context it needs, or (b) explicitly document
that propagation is config-only and compiled `.md` files are refreshed lazily on the
next in-project command, and ensure that lazy refresh is guaranteed to happen (e.g. a
compile-on-read/staleness check) so drift cannot persist silently.

**Decision (user, 2026-07-18): option (a).** Once the global installation changes, it
should recompile all registered projects. Tracked as `todo/TODO.md` D-240.

Add regression coverage once the contract is chosen: an E2E test that, after a global
skill removal propagates to a registered project, asserts the project's
`.claude/agents/<name>.md` no longer references the removed skill (option a) — or a
documented, tested lazy-refresh path (option b).

## Lineage — dropped `blocked_by:` key (recorded 2026-07-30)

This file previously carried, in its frontmatter:

```yaml
blocked_by: 2026-07-18-propagation-stack-reconcile-gap-reachable.md
```

**That target is not on disk and the key has been removed.** Recorded here so the
claim is not lost. Two independent reasons the key had to go, either sufficient:

1. **The target file no longer exists.** `changelogs/0.141.8.md` -> "Findings" lists
   `agent-findings/2026-07-18-propagation-stack-reconcile-gap-reachable.md (resolved)`
   on the line directly above this finding's own entry, so it existed and was a real
   sibling — not a typo. It was removed from disk afterwards, contrary to `README.md`'s
   "Never move files" rule. (The same changelog block lists a second removed sibling,
   `2026-07-18-propagation-selected-agents-not-pruned-on-agent-removal.md (resolved)`,
   also absent — so this is a batch removal of that release's resolved findings, not a
   one-off.)
2. **The block had already lifted.** `blocked_by:` means "an upstream open/partial
   finding must resolve before this one can close". The changelog marks the upstream
   **resolved**, and the "What Was Wrong" section above already describes its fix in the
   past tense — _"now that the sibling finding's fix reconciles `projectSplit.stack`
   during propagation"_. The upstream fix landing is precisely what created the drift
   window this finding reports, so the key was self-contradictory once that shipped.

**What the reference asserted.** That the `projectSplit.stack` reconcile during
propagation had to land before this finding's compiled-artifact drift could be
addressed. It did land, in 0.141.8.

**Status is unchanged and remains `open`** — not because anything blocks it, but because
the D-240 code-side work (recompiling registered projects' agents during propagation) has
not shipped. Tracked in `todo/TODO.md` as D-240, per the user decision recorded above.
