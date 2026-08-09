> **HISTORICAL DESIGN NOTE** — This was a pre-implementation plan. The feature has shipped, and its central premise has since been **superseded (D-277, 2026-07-30)**.
>
> This document assumes a user can opt out of a globally installed skill or agent by **deselecting** it in a project wizard, producing an excluded tombstone. That is no longer how it works: a globally installed item is **immutable from project scope** — the deselect is refused with a toast, and no removal path mints a tombstone. To keep a global skill out of a project, leave it out of the project's agent `stack`; to own a project copy, use the `s` scope toggle; to uninstall it, edit at global scope (`cd ~`).
>
> Excluded tombstones still exist, but only from two sources: the `s` scope toggle (G→P), which pairs the tombstone with an active project entry (`[P][G]`), and system-derived conflict masks written by the installer. Read the sections below as design history, not as behaviour.
>
> Current authoritative documentation: `.ai-docs/reference/concepts/tombstone-pattern.md`, `.ai-docs/reference/concepts/guard-pattern.md`, and `docs/guides/editing-config.md`.

# Excluded Skills — Scope Toggle Edge Cases

## The Core Problem

Scope toggling interacts with **source type** (eject vs plugin) in ways that can conflict. The dangerous case is always: **project-scoped eject skill being toggled to global when a global version already exists.**

---

## Scenario Matrix

### 1. Global eject → project plugin (SAFE)

User has React ejected globally (`~/.claude/skills/web-framework-react/`). In a project, they switch to the plugin source.

**What happens:**

- Global eject entry → `excluded: true` in project config
- New project entry: `{ id: "react", scope: "project", source: "agents-inc" }` (plugin)
- Plugin is installed via `claudePluginInstall`
- Global ejected files remain at `~/.claude/skills/` (untouched — other projects may use them)

**No conflict.** Global files are untouched, project uses plugin.

### 2. Global eject → project eject (SAFE)

User has React ejected globally. In a project, they want a project-scoped ejected copy (to customize).

**What happens:**

- Global eject entry → `excluded: true` in project config
- New project entry: `{ id: "react", scope: "project", source: "eject" }`
- Skill files copied from global `~/.claude/skills/` to `<project>/.claude/skills/`
- User can now modify the project copy independently

**No conflict.** Two independent copies on disk.

### 3. Global plugin → project eject (SAFE)

User has React as a global plugin. In a project, they eject it.

**What happens:**

- Global plugin entry → `excluded: true` in project config
- New project entry: `{ id: "react", scope: "project", source: "eject" }`
- Skill files copied from source to `<project>/.claude/skills/`
- Global plugin installation untouched

**No conflict.** Plugin and ejected copy are independent.

### 4. Global plugin → project plugin (SAFE)

User has React as a global plugin. In a project, they want a project-scoped plugin.

**What happens:**

- Global plugin entry → `excluded: true` in project config
- New project entry: `{ id: "react", scope: "project", source: "agents-inc" }` (plugin)
- Plugin installed at project scope

**No conflict.** Two independent plugin installations.

### 5. Project eject → global eject (DANGEROUS — when global eject already exists)

User has React ejected globally. In a project, they also have a project-scoped ejected copy that they've customized. Now they try to toggle it to global scope.

**The problem:**

- The global ejected version already exists at `~/.claude/skills/web-framework-react/`
- If we allow the toggle, should it:
  - (a) Overwrite the global version with the project version? → **Dangerous.** Other projects depend on the global version.
  - (b) Keep the global version and just change the scope? → **Confusing.** The user's customizations are lost.
  - (c) Error/warn and prevent the toggle? → **Safe.**

**Decision: DISALLOW this toggle.** Show a toast:

> "React already exists as an ejected skill at global scope. Remove or modify it there first."

The user must explicitly go to `cc edit` at global scope (`~/`) to manage the global ejected version.

### 6. Project eject → global eject (SAFE — when no global version exists)

User has React ejected at project scope. No global version exists. They toggle to global.

**What happens:**

- Skill files moved from `<project>/.claude/skills/` to `~/.claude/skills/`
- Config entry changes from `scope: "project"` to `scope: "global"`
- Project's excluded entry (if any) is removed

**No conflict.** The skill moves cleanly.

### 7. Project plugin → global (SAFE)

User has React as a project plugin. They toggle to global.

**What happens:**

- Plugin moves to global scope
- Config entry changes scope
- No file conflict (plugins are managed by Claude, not on disk as ejected files)

**No conflict** regardless of whether a global version exists — plugin installations are idempotent.

### 8. Project eject (customized) → global plugin (SAFE)

User has a customized ejected React at project scope. They switch install mode to plugin AND toggle to global.

**What happens:**

- Project ejected files can be cleaned up (or left as orphaned — `doctor` can warn)
- New global plugin entry created
- No file conflict

**No conflict.** The eject → plugin switch already handles file cleanup.

---

## Toggle Guard Rules

| From           | To             | Global version exists? | Allowed? | Reason                                                                         |
| -------------- | -------------- | ---------------------- | -------- | ------------------------------------------------------------------------------ |
| project eject  | global eject   | YES (eject)            | **NO**   | Would overwrite global ejected files, affecting other projects                 |
| project eject  | global eject   | NO                     | YES      | Clean move, no conflict                                                        |
| project eject  | global plugin  | YES or NO              | YES      | Plugin install is idempotent, no file conflict                                 |
| project plugin | global plugin  | YES or NO              | YES      | Plugin is idempotent                                                           |
| project plugin | global eject   | YES (eject)            | **NO**   | Same problem — would need to create files at global, conflicting with existing |
| project plugin | global eject   | NO                     | YES      | Clean creation at global scope                                                 |
| global eject   | project eject  | N/A                    | YES      | Copy files, no overwrite                                                       |
| global eject   | project plugin | N/A                    | YES      | Install plugin, no file conflict                                               |
| global plugin  | project eject  | N/A                    | YES      | Copy from source, no conflict                                                  |
| global plugin  | project plugin | N/A                    | YES      | Independent installation                                                       |

**Summary:** The only blocked case is: toggling TO global eject scope when a global ejected version already exists.

**Note:** Implicit exclusions from exclusive category selection (scenario 9-10 below) do not go through `toggleSkillScope` — they go through `toggleTechnology`'s `removed` set. The scope toggle guard does not apply there; instead the `removed` set filter must mark global skills as excluded.

---

## Implementation: Scope Toggle Guard

In `toggleSkillScope()` (wizard-store.ts), before allowing project → global:

```typescript
toggleSkillScope: (skillId) =>
  set((state) => {
    const config = state.skillConfigs.find((sc) => sc.id === skillId)
    if (!config) return state

    // Toggling from project → global
    if (config.scope === "project") {
      const globalConfig = state.globalPreselections?.find(
        (sc) => sc.id === skillId
      )
      const isGlobalEject = globalConfig && globalConfig.source === "eject"
      const isCurrentEject = config.source === "eject"

      // Block: can't push eject to global when global eject already exists
      if (isCurrentEject && isGlobalEject) {
        // Show toast: "Already exists as ejected skill at global scope"
        return state
      }
    }

    // ... proceed with toggle
  })
```

---

## Implicit Exclusion via Exclusive Categories

The scope toggle scenarios above cover **direct** user actions (pressing S to toggle scope). But exclusion also happens **implicitly** when a user selects a competing skill in an exclusive category.

### 9. Selecting Angular when React is global (IMPLICIT EXCLUSION)

User has React installed globally. In a project wizard, they select Angular in the `web-framework` exclusive category.

**What happens:**

- Angular is selected, React is auto-deselected via the `removed` set in `toggleTechnology`
- React is global → must be marked `excluded: true` (not removed from `skillConfigs`)
- Angular is added as a project skill: `{ id: "angular-...", scope: "project", source: "agents-inc" }`
- React entry becomes: `{ id: "react-...", scope: "global", source: "agents-inc", excluded: true }`

**No file conflict.** But the `toggleTechnology` filter at `wizard-store.ts:803` currently removes all entries in the `removed` set — it must be updated to mark global entries as excluded instead. See the main design doc's "Exclusive category auto-deselection" section.

### 10. Re-selecting React after implicit exclusion (REVERSAL)

User previously excluded React by selecting Angular. Now they switch back to React.

**What happens:**

- Angular is auto-deselected (project skill — removed normally)
- React's `excluded: true` flag is cleared
- Config returns to original state with React active at global scope

**No conflict.** The `excluded` flag is cleared on re-selection.

---

## Downstream Considerations

### `source-switcher.ts` / `migrateLocalSkillScope()`

When a scope toggle IS allowed (project eject → global eject, no existing global):

- `migrateLocalSkillScope()` moves files from `<project>/.claude/skills/` to `~/.claude/skills/`
- Must verify target doesn't exist before moving (defensive check, even with the guard above)

### `cc edit` at global scope

The toast for blocked toggles should guide the user: "Edit at global scope to modify the global version."
This means `cc edit` from `~/` must allow removing/modifying ejected skills normally (no exclusion concept at global scope).

### `edit.tsx` change detection with dual entries

When a scope toggle produces dual entries (excluded global + active project for the same skill ID), the `edit.tsx` change detection pipeline must handle them correctly:

- `detectConfigChanges` (`edit.tsx:562-598`) uses `indexBy` which loses one entry per duplicate ID. Must use a compound key (`${id}:${scope}`) or filter excluded entries before change detection.
- `applyScopeChanges` (`edit.tsx:355`) uses `.find()` which returns the first match — could be the excluded entry. Must filter excluded entries first.
- Excluded entries should flow through to config generation only, not to change detection or migration detection.

### `compile-agents.ts` operations layer

The operations layer at `compile-agents.ts:44-46` reads `config.agents` independently for scope filtering during `cc compile`. After a scope toggle that excludes an agent, this code path must also filter excluded agents — otherwise they leak into the compilation pass.

### What about agents?

Agents don't have the eject/plugin distinction — they're always compiled from templates. Scope toggling for agents is always safe: the agent.md is recompiled to the target directory. No file conflict possible.

Agent scope toggle guard: **not needed**. Only skills have the eject file conflict problem.
