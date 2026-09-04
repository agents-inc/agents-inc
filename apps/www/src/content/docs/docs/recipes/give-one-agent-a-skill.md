---
title: Give one sub-agent a skill
description: Route a skill to a single sub-agent so the others don't receive it — from the roster and the options matrix in the editor, or from the stack mapping in the config file.
sidebar:
  order: 1
---

The `stack` mapping decides which sub-agent receives which skill. Each sub-agent has its own entry, so handing a skill to one and not the others is a click in the editor, or an edit to one line in the config file. This is also how you keep a globally installed skill out of a project without deselecting it.

## Quick start

The editor writes this mapping for you, and there are two ways at it.

In the roster on the right, every sub-agent lists the skills it carries. Click a skill's row under one sub-agent to switch that copy off — the skill stays selected and every other sub-agent keeps it. A row carried by more than one sub-agent gains a count; hover it to see which ones. The word next to it, `pre` or `lazy`, is that copy's load behaviour and flips on click.

In the skill's `•••` options panel, the **Sub-agents** matrix is domain rows against role columns. Click a cell to cycle that one pairing through unassigned, `lazy` and `pre` — which is how you reach a sub-agent the skill's own domain would never have handed it to. A **Meta** fold at the foot of the matrix holds the meta agents.

Both write the same thing, and the install command carries it. [Selecting skills](/docs/editor/selecting-skills) covers the panel in full.

## The terminal route is a hand edit

**There is no wizard step for this.** `npx agents-inc edit` picks skills and sub-agents; the mapping between them comes from the stack you chose, and nothing in the wizard curates it. So the terminal route isn't the same job done differently — it's editing the file the editor would have written. Open `.claude-src/config.ts`, add the skill under the sub-agent that should have it, and recompile.

<!-- prettier-ignore -->
```typescript
const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'web-developer': {
    'web-testing': ['web-testing-vitest'],  // only this sub-agent gets Vitest
  },
  'api-developer': {
    'api-api': 'api-framework-hono',        // and this one doesn't
  },
}
```

```bash
npx agents-inc compile
```

`compile` rewrites the sub-agents that changed, regenerates `config-types.ts` from what it just read, and never rewrites `config.ts` — the file you edited survives.

## The stack routes skills, it doesn't install them

The skill has to already be installed — a plugin from a marketplace, or a directory under `.claude/skills/`. `compile` checks what it finds on disk rather than the config's `skills` array, so a skill you wrote by hand routes fine with no entry there. Name an id that isn't installed and `compile` warns and carries on:

```
Skill 'web-testing-vitest' is configured but was not found — agents will be compiled without it.
```

That's a warning, not a failure — `compile` still exits 0. To install a skill first, select it in the editor and run the command it hands you, or run `npx agents-inc edit` and select it there.

## Preloaded or dynamic

The write form decides how the compiled sub-agent gets the skill:

- **Bare id** (`'web-testing-vitest'`) — dynamic. The skill appears in the sub-agent's skill activation protocol, which tells it to load the skill with the Skill tool when the work calls for it. This is the default and the config never spells `preloaded: false`.
- **Object form** (`{ id: 'api-framework-hono', preloaded: true }`) — the id goes into the compiled sub-agent's frontmatter `skills:` list, which is Claude Code's own auto-load key, so it's loaded before the sub-agent starts.

[Editing your config](/docs/guides/editing-config) carries the full shape, including the array form for a category holding several skills.

:::note[The same two states in the editor]
The `pre` / `lazy` word on a roster skill row is this same choice, and it belongs to the pairing rather than to the skill — one skill can be `pre` on one sub-agent and `lazy` on another.
:::

## The category key is storage, not identity

The key a skill sits under is the category the catalogue puts it in. The id is what identifies the assignment, so a config naming a stale category for a catalogue skill is re-keyed to the live one when it loads — a category that moved between releases doesn't orphan your entry. A skill the catalogue doesn't carry keeps whatever key you wrote, because nothing has an opinion about it.

**The key isn't what tells the sub-agent when to use the skill.** That comes from the skill's own `usageGuidance` in its `metadata.yaml` — one sentence per dynamic skill in the compiled sub-agent's activation protocol, in the skill author's own words. If the skill is yours, that field is where the effort goes: it's the whole of what a sub-agent reads when deciding whether the work in front of it is this skill's. The key is read only where there's nothing to read — a skill stating no `usageGuidance` falls back to `Use when working with <category>.`

## One pair that can't be routed

A global-scoped sub-agent never carries a project-scoped skill. `compile` drops the pair, compiles the agent without it, and says so on every run — it doesn't rewrite `config.ts` to remove the line:

```
Sub-agent 'web-developer' cannot carry project-scoped skill 'web-testing-vitest' — global-scoped sub-agents only carry global-scoped skills.
```

Fix it by moving the skill to global scope, or by pinning the sub-agent to the project. [Global-first setup](/docs/guides/global-first-setup) covers which to reach for.
