---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/lib/config-gate/propagate.ts
  - src/cli/lib/seed/seed-to-wizard.ts
  - e2e/commands/init-from-scenarios-tuning.e2e.test.ts
standards_docs:
  - .ai-docs/reference/config/config-merger.md
  - .ai-docs/reference/features/model-and-effort.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  Owner ruling 2026-08-06 — `init --from` is greenfield-only, so the additive merge path is
  unreachable from it: a second id over an installed setup is refused with a message naming
  `uninstall`, rather than exiting 0 having silently discarded the incoming tuning. Neither
  candidate reading below was adopted; `mergeGlobalConfigs` is unchanged and still correct for the
  edit and propagation paths that keep using it.
---

## What Was Wrong

Installing a second shared configuration over a first cannot change a sub-agent's model or effort
once that sub-agent is globally scoped. The second `init --from` exits 0, reports an install, and
leaves the first configuration's tuning in place — in the compiled `.md` and in the config.

The mechanism is `mergeGlobalConfigs` in `src/cli/lib/config-gate/propagate.ts`. It is additive by
construction:

```
const newAgents = incomingActiveAgents.filter((a) => !existingAgentNames.has(a.name));
const mergedAgents = [...existing.agents, ...newAgents];
```

An agent whose name is already in the global config is filtered out of `newAgents` entirely, so
every field it carries — `model`, `effort`, and anything added later — is discarded with it. The
policy the code states for this is sound and load-bearing: "Project-context edits must NEVER remove
or overwrite global state; individual projects express their local view via tombstones in the
PROJECT config, not by rewriting the GLOBAL config." A project must not silently re-tune a
sub-agent on behalf of every other registered project.

The problem is not the policy. It is that `init --from` is a **replacement** gesture and reads as
one everywhere else: `init --from` deliberately overrides an existing installation rather than
diverting to the dashboard (`init-from-shared-config.e2e.test.ts`, "overrides an existing
installation rather than showing the dashboard"), and the tuning contract is documented as an
override. A user who shares a re-tuned configuration and installs it gets no tuning change and no
message saying why.

**Why this is newly reachable.** Before EDITOR-12 the decode defaulted a bare sub-agent to
`project`, so re-tuning went through the project config, which the write path does rewrite. With
the default now `DEFAULT_SELECTION_OPTIONS.scope` (`global`), the default shape of every shared
configuration lands in the additive-only half.

**How it was observed.** `e2e/commands/init-from-scenarios-tuning.e2e.test.ts`, "replaces a
sub-agent's tuning when a second id is installed over the first", failed with
`Expected agent frontmatter model to be "haiku" but got "sonnet"` after the second install, run
from a project directory against a fake HOME.

## Fix Applied

None on the product path — discovery only.

The spec was fixed by pinning `scope: "project"` on both payloads, with an inline note naming the
constraint, because re-tuning is only expressible at project scope today. The other four specs in
that file leave the scope unnamed and now assert against HOME, which is where the default puts
them.

## Proposed Standard

Decide, and write it into `.ai-docs/reference/features/model-and-effort.md`, whether a sub-agent's
tuning is global state under the never-overwrite rule or a per-selection value the installing
gesture owns. The two candidate readings differ in remedy:

- **Tuning is not "global state" in the sense the rule protects.** Skills and agent membership are
  what a sibling project would lose by an overwrite; `model` and `effort` are a property of the
  sub-agent, not of any project's selection. Under this reading `mergeGlobalConfigs` should update
  the tuning fields of an existing global agent row while still never removing the row — a narrow
  carve-out, stated as such.
- **Tuning is global state and the rule stands.** Then `init --from` must SAY so: a payload whose
  tuning differs from the installed global row should produce a named warning, in the same channel
  and for the same reason skipped ids are named rather than counted.

Whichever is chosen, `.ai-docs/reference/config/config-merger.md` should state the current
behaviour explicitly — that the additive rule silently discards every field of a same-named
incoming agent, not just its membership — because reading "never removes existing items" does not
tell you that an incoming override is dropped.

## Outcome (2026-08-06)

Neither reading was needed. The owner ruled `init --from` greenfield-only, which dissolves the
question rather than answering it: a second id never reaches `mergeGlobalConfigs`, because a
directory or a home that is already installed is refused before anything is merged. Re-tuning a
shared configuration is now `uninstall` then `init --from`, and the user is told so by name.

The tuning contract is therefore still an override — it is applied whole, on a fresh install, which
is the only way `--from` installs anything. `mergeGlobalConfigs` keeps its additive, never-overwrite
behaviour untouched, and the policy quoted above stands for the edit and propagation paths that
still call it. The `config-merger.md` note suggested above remains worth writing for THOSE callers,
and is not blocked by this ruling.

The spec that carried the red — `init-from-scenarios-tuning.e2e.test.ts`, "replaces a sub-agent's
tuning when a second id is installed over the first" — now pins the refusal instead, keeping the
same two-payload setup so a regression that reinstates merging fails where it used to pass.
