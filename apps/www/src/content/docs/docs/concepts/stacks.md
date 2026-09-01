---
title: Stacks
description: A named selection of skills mapped to sub-agents — where pre-built stacks come from, and how they relate to the stack field in your config.
---

A **stack** is a named selection: which [skills](/docs/concepts/skills) each [sub-agent](/docs/concepts/sub-agents) receives, grouped by category.

## Quick start

Open the [editor](/editor) and click a stack in the grid at the top. Every pre-built stack is a cell there, alongside "Start from scratch". Picking one selects every skill that stack names and staffs the sub-agents it names, so the skills grid below it arrives with those choices already made, for you to keep or change.

:::note[From the terminal]
`npx agents-inc init` opens the wizard on the same stacks, as a list rather than a grid. Picking one pre-fills the wizard, so the Skills grid two steps later arrives already filled in. Press `A` there to take it exactly as it stands and go straight to the confirm screen.
:::

## Two places you meet the word

**A pre-built stack** is a starting point — `nextjs-fullstack`, `react-hono-fullstack`, `sveltekit-fullstack` and so on. The editor draws them as a grid and `npx agents-inc init` opens on a list of them; either way, picking one pre-fills your selection. You can also start from scratch.

**The `stack` field in your `config.ts`** is the result: the per-agent, per-category mapping that the compiler actually reads.

They are the same shape. Both are a map of agent name to category to skill assignment:

```typescript
"web-developer": {
  "web-framework": "web-framework-react",                                     // one skill
  "web-testing": ["web-testing-vitest", "web-testing-react-testing-library"], // several
  "api-api": { id: "api-framework-hono", preloaded: true },                   // preloaded
}
```

So a pre-built stack is not a mode you are locked into. It seeds your config, and from that moment it is just your config — edit it, recompile, and the pre-built stack has no further say.

## Why it is worth naming

The mapping is the interesting part of a setup, and it is the part worth sharing. A stack is what you hand to a teammate so their `web-developer` reasons about the same libraries yours does.

## Changing it

Three routes, same outcome:

- `npx agents-inc edit --ui` — reads this installation, mints an id for it and opens the editor on that id. Change what you like in the grid, then apply it with `npx agents-inc edit --from <id>`. That is the command to use, not the `init --from` the editor's install dialog hands you: `init` refuses a directory that already holds an installation, because installing a shared configuration is a fresh setup rather than a merge.
- `npx agents-inc edit` — the wizard, with your current selections pre-loaded.
- Edit `.claude-src/config.ts` by hand, then `npx agents-inc compile`. The generated `config-types.ts` gives you type checking while you do, so a mistyped skill ID is a compile error rather than a silent no-op.

See [Editing your config](/docs/guides/editing-config) for the full config shape, and the [config reference](/docs/configuration/config-reference) for every field the file accepts.
