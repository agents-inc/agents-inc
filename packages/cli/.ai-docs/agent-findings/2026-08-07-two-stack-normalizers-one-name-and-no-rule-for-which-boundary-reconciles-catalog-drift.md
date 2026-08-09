---
type: missing-standard
severity: medium
affected_files:
  - src/cli/lib/stacks/stacks-loader.ts
  - src/cli/lib/configuration/project-config.ts
  - src/cli/lib/config-gate/index.ts
standards_docs:
  - .ai-docs/reference/boundary-map.md
  - .ai-docs/reference/features/configuration.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`stacks-loader.ts` exports two normalizers whose names read as a general/specific pair:

- `normalizeAgentConfig(agentConfig)` — one agent's block
- `normalizeStackRecord(rawStack)` — every agent's block, by calling the first

Nothing in either name, signature or doc comment says they serve **two different trust
boundaries**, and until this change they behaved identically, so the distinction had no witness:

| Entry point                                | Reached via            | What the category key IS                       |
| ------------------------------------------ | ---------------------- | ---------------------------------------------- |
| `loadStacks()` — a source's `stacks.ts`    | `normalizeAgentConfig` | the author's heading for the agent prompt      |
| `loadProjectConfigFromDir()` — user config | `normalizeStackRecord` | where the CLI stored the skill's live category |
| `writeProjectPartial()` — config gate      | `normalizeStackRecord` | same                                           |

Only the second and third are persisted user data that a later release can drift under, and only
they may be reconciled against the live catalog. The first must not be: the built-in stacks and
several fixtures deliberately group cross-category skills under one heading —
`meta-reviewing: [meta-methodology-research-methodology, meta-reviewing-reviewing,
meta-reviewing-cli-reviewing]` is three skills from two categories under one prompt heading, and
`resolveAgentConfigToSkills` turns that key into `usage: "when working with meta-reviewing"`.

The hazard is that the two look interchangeable. Applying the drift fix one call deeper — in
`normalizeAgentConfig`, which is the obvious place if you are reading names rather than callers —
compiles, type-checks, and silently rewrites every stack author's grouping. It is caught today
only because `stacks-loader.test.ts` now pins the authored grouping explicitly ("does not re-key a
source stack's authored grouping"); before this change nothing distinguished the two paths at all.

`boundary-map.md` lists "file parse" as one trust boundary. It is two here, with opposite rules.

## Fix Applied

The re-keying that reconciles catalog drift was placed in `normalizeStackRecord` only, with a doc
comment naming it "the PERSISTED-CONFIG boundary" and stating why the stacks-file path is excluded.
Both sides are pinned by test: the persisted path re-keys, the authored path does not.

No renaming was done — the pair's names are load-bearing at several call sites and renaming was
outside this task's scope. The distinction is currently carried by prose in one doc comment.

## Proposed Standard

Two places, one rule each.

1. **`reference/boundary-map.md` -> file parse.** Split the row: a source's authored files
   (`stacks.ts`, `SKILL.md`, `metadata.yaml`) and a user's persisted config (`.claude-src/config.ts`)
   are different boundaries. Authored data is read as written; persisted data is reconciled against
   the live catalog, because it was written by an older version of that catalog and the user cannot
   be asked to migrate it. State which normalizer owns which.

2. **`reference/features/configuration.md` -> Merge and consumption.** The rule the sibling finding
   (`2026-08-07-a-saved-stack-entry-is-dropped-when-its-skill-changes-category.md`) proposes, stated
   once for both: **a category id that appears inside persisted user data is a storage key, not
   identity — the skill id is identity, and any lookup keyed by category must be reconciled at load,
   never at each consumer.** A future change to the category vocabulary then has one place to
   satisfy rather than a list of consumers to audit.

A rename (`normalizeAuthoredAgentConfig` / `normalizePersistedStack`) would carry the distinction in
the type system's nearest equivalent — the name — instead of a comment. Worth doing if a third
caller ever appears; not worth churning the current three for on its own.
