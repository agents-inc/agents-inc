---
title: Stacks
description: A named selection of skills mapped to sub-agents — where pre-built stacks come from, and how they relate to the stack field in your config.
---

A **stack** is a named selection: which [skills](/docs/concepts/skills) each [sub-agent](/docs/concepts/sub-agents) receives, grouped by category.

## Two places you meet the word

**A pre-built stack** is a starting point. `npx agents-inc init` opens with a list of them — `nextjs-fullstack`, `react-hono-fullstack`, `sveltekit-fullstack` and so on — and picking one pre-fills the wizard. You can also start from scratch.

**The `stack` field in your `config.ts`** is the result: the per-agent, per-category mapping that the compiler actually reads.

They are the same shape. Both are a map of agent name to category to skill assignment:

```typescript
"web-developer": {
  "web-framework": "web-framework-react",                          // one skill
  "web-testing": ["web-testing-vitest", "web-testing-playwright"],  // several
  "api-api": { id: "api-framework-hono", preloaded: true },        // preloaded
}
```

So a pre-built stack is not a mode you are locked into. It seeds your config, and from that moment it is just your config — edit it, recompile, and the pre-built stack has no further say.

## Why it is worth naming

The mapping is the interesting part of a setup, and it is the part worth sharing. A stack is what you hand to a teammate so their `web-developer` reasons about the same libraries yours does.

## Changing it

Two routes, same outcome:

- `npx agents-inc edit` — the wizard, with your current selections pre-loaded.
- Edit `.claude-src/config.ts` by hand, then `npx agents-inc compile`. The generated `config-types.ts` gives you type checking while you do, so a mistyped skill ID is a compile error rather than a silent no-op.

See [Editing your config](/docs/guides/editing-config) for the full config shape.
