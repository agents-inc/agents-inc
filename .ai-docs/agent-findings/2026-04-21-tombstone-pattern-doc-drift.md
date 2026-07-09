---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/concepts/tombstone-pattern.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: rule-not-visible
status: resolved
resolved_by: "documentation-bible.md § Re-Validation Triggers (lines 183-191)"
---

## What Was Wrong

`.ai-docs/reference/concepts/tombstone-pattern.md` (last_validated 2026-04-13) had drifted from the shipped state of D-223, D-224, D-230, D-232 and did not yet know about D-233:

- **D-223 preservation missing.** The doc did not mention that `populateFromSkillIds` explicitly appends `savedConfigs.filter((sc) => sc.excluded)` to survive hydration. Without this, reopen-of-`[P][G]` state would collapse.
- **D-224 load-bearing invariant omitted.** The doc said P→G "removes the excluded tombstone" but did not state that the removal is **unconditional** (not gated on `wasInstalledGlobally`). The whole point of D-224 was that gating was the bug.
- **D-230 / D-232 renderer role entirely absent.** The doc never mentioned `skill-agent-summary.tsx`, slot-occupancy matching, first-class tombstone baseline entries, or the `removedSkills` / `prevSkillKeySet` interaction. These are load-bearing for the info-panel diff rendering.
- **Scope-split routing not surfaced.** The doc did not say tombstones route to the **project** split in `splitConfigByScope`, only cross-referenced generally.
- **Compound-key survival through `mergeConfigs` missing.** The doc did not explain how the dual-scope pair survives the merger (`${id}:${scope}:excluded` vs `${id}:${scope}`).
- **D-233 known gap not captured.** `applySkillRemoval` does not yet have a dual-scope branch — spacebar on `[P][G]` produces an orphan tombstone. The doc is the natural home for this documented gap.

Additionally, the "State Transition Summary" table did not distinguish "installed globally" from "not installed globally" for deselect operations, obscuring the `installedIds?.has(sc.id)` gate in `applySkillRemoval`.

## Fix Applied

Rewrote `tombstone-pattern.md` with:

- Definition section clarifying tombstones are always at `scope: "global"`, live in project config, and are slot occupants.
- Dual-scope semantics section pinning the `[P][G]` shape and its invariant.
- Lifecycle section split into Creation / Preservation / Cleanup with D-223 and D-224 invariants called out as load-bearing.
- Config pipeline section covering `mergeConfigs` compound keys, `splitConfigByScope` project-routing, `mergeGlobalConfigs` blindness to tombstones, and writer inlining.
- Dedicated "Role in the Info-Panel Diff (D-230 / D-232)" section explaining slot-occupancy matching with the actual code quoted.
- Known gap section for D-233.
- Anchors section listing function names (no line numbers) across all involved files.
- Findings-that-shaped-this-doc table.
- Updated keywords, `related`, and `last_validated` to 2026-04-21.
- Updated `DOCUMENTATION_MAP.md` entry date to 2026-04-21 with an iter11 re-validation note.

## Proposed Standard

When a concept doc's last_validated date predates multiple tasks that touched the concept (here: D-223, D-224, D-230, D-232 all shipped between the doc's validation and today), the doc should be scheduled for re-validation even if it hasn't hit its 14-day cadence. A rule for `.ai-docs/standards/documentation-bible.md`:

> **Rule addition (Re-validation Triggers):** A concept or reference doc should be re-validated whenever an `agent-findings/` entry or a changelog task ID lists it in `related:` or names the documented function in `anchors:` / `affected_files:` — even if the 14-day cadence has not elapsed. This prevents concept docs from drifting past 2-3 shipped task cycles before validation catches up.

Mechanism: the codex-keeper could grep `agent-findings/*.md` for `affected_files:` entries that match currently-indexed concept/reference docs and surface stale ones. That is out of scope for iter11; flagging for a future iteration.
