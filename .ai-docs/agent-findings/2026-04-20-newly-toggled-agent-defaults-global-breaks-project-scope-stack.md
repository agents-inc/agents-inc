---
type: anti-pattern
severity: high
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/configuration/config-generator.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`toggleAgent` in `wizard-store.ts` hard-codes `scope: "global"` for every newly-added agent (`applyAgentToggle`, else-branch). There is no consideration of the surrounding project's scope convention. In an edit flow where the project is entirely project-scoped (skills + existing agents), toggling on a NEW agent produces a global-scoped agent in a project-scoped world.

Downstream, `config-generator.ts::isScopeCompatible` enforces "project skills never reach global agents". A newly-selected agent therefore receives ZERO stack assignments, so `buildAgentStack` returns undefined and `stack[newAgent]` is never emitted. This breaks the explicit D-220 contract (test E2E `stack-per-agent-curation.e2e.test.ts`) that a newly-selected agent must seed from ownership defaults.

Separately, there is no wizard-store unit test asserting `toggleAgent` scope selection when `installedAgentConfigs` or existing skills are project-scoped — the gap that allowed this regression in.

## Fix Applied

None — investigation only.

## Proposed Standard

Two complementary rules belong in a new "Wizard scope defaults" section (add to `.ai-docs/standards/cli/wizard-conventions.md`, or analogous CLI standards doc):

1. **Newly-toggled agents must inherit scope from the dominant scope of existing non-excluded `agentConfigs`.** Specifically: if every existing active entry has `scope: "project"`, new agents should default to `"project"`; otherwise `"global"`. A fresh init with zero agents continues to default to `"global"`.

2. **When skill configs are entirely project-scoped in edit mode, new agents must not be global-scoped.** Equivalent to rule 1 expressed against skills — pick whichever side is more natural to maintain.

Wizard-store unit tests must cover: (a) toggleAgent ON in edit mode with existing project-scoped `agentConfigs`; (b) toggleAgent ON in edit mode with only project-scoped `installedSkillConfigs`. Assertion target: the new agent's `scope` in `agentConfigs`.

Config-generator should also emit a `verbose` log when `buildAgentStack` returns undefined due to 100% scope-incompat filtering — that would have flagged this during development.

## Docs Landed — 2026-04-21

A **"Known bug — newly-toggled agents default to global scope"** note
was added to `.ai-docs/reference/wizard/state-transitions.md`
immediately under the `toggleAgent` / `preselectAgentsFromDomains`
rows. The note describes the `isScopeCompatible` downstream effect,
cross-links the E2E that catches the regression, and states the
proposed rule (new agents inherit dominant scope from existing
`agentConfigs` / `skillConfigs`; fresh init with zero agents stays
`"global"`). The two existing row descriptions now carry inline
`(see known bug below)` markers.

The dangling cross-ref to the superseded finding
(`2026-04-20-new-agent-toggle-defaults-global-scope.md`) in
`.ai-docs/reference/features/agent-system.md` § "Related Findings"
was retargeted to this authoritative finding.

Two separate `wizard-conventions.md` standards doc was NOT created —
the single known-bug note in the existing state-transitions reference
is more discoverable (it sits next to the buggy actions themselves)
and avoids a thin doc. Finding status stays `open` until the
`applyAgentToggle` scope-defaulting fix lands plus the two unit tests
listed above.

## Lineage — dropped `supersedes:` key (recorded 2026-07-30)

This file previously carried, in its frontmatter:

```yaml
supersedes: 2026-04-20-new-agent-toggle-defaults-global-scope.md
```

**That target is not on disk and the key has been removed.** The claim is recorded
here so the lineage is not lost, because the target's absence is a rule violation
rather than a mistyped reference — the key was correct when written.

**What the reference asserted.** A second finding covering this same defect was filed
the same day (2026-04-20) as a free-form narrative file with **no YAML frontmatter**.
This file is the properly-formatted sibling, and the `supersedes:` key marked it as
the authoritative one of the pair. Both described the same `toggleAgent` /
`applyAgentToggle` hard-coded `scope: "global"` defect in the same `affected_files`.

**Evidence the target existed** (it was not a typo and not a rename):

| Source                                                  | What it records                                                                                                                                                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changelogs/0.137.0.md` -> "Findings"                   | Lists `agent-findings/2026-04-20-new-agent-toggle-defaults-global-scope.md` on its own line, immediately above this file                                                                                                            |
| `2026-04-21-agent-findings-frontmatter-drift-iter45.md` | Names it first in `affected_files:`; its "Fix Applied" reads _"Added proper YAML frontmatter to ... with a `superseded_by:` key pointing at its authoritative sibling"_ — frontmatter cannot be added to a file that does not exist |
| This file's "Docs Landed — 2026-04-21" section above    | Calls it "the superseded finding" and retargets an `agent-system.md` cross-ref away from it                                                                                                                                         |

**It was removed from disk after 2026-04-21**, contrary to `README.md`'s
"Never move files" rule ("moving a file breaks every such link silently"). No file on
disk is a rename of it: the only surviving finding covering this defect is this one,
and `iter45` describes the two as distinct siblings rather than one file under two
names.

**Nothing is lost by dropping the key.** The removed file was the _narrative duplicate_;
this file is the authoritative record its `superseded_by:` pointed at, and its content
is preserved in full above.
