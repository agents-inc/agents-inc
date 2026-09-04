---
title: Tune a sub-agent's model
description: Set the model and thinking effort for one sub-agent, see where the default it was already running on came from, and know which value can't be shared.
sidebar:
  order: 6
---

Every sub-agent runs on a model, and every shipped one names `opus`. Choosing differently for one of them — a cheaper model on a routine job, a faster one on a job you run constantly — is a click in the editor, or one field on that sub-agent's entry in `.claude-src/config.ts` where `effort` sits beside it.

## Quick start

On the roster, each sub-agent's row carries its model and its effort as words you click to cycle. The model cycles `opus → fable → sonnet → haiku` and wraps; the effort cycles `low → medium → high → xhigh → max` and wraps, and turns amber the moment it leaves that sub-agent's resting value. There's no menu — the word is the control.

The editor offers those four models and no more, so `inherit` isn't reachable there. Effort rests at `medium` for every sub-agent, since the shipped metadata carries none to read, and a sub-agent whose metadata names a model outside the four rests on `sonnet`. See [The editor](/docs/editor).

## The terminal route is a hand edit

**There is no wizard step for either value.** `npx agents-inc edit` won't offer you a model, so the terminal route isn't the same job done differently — it's editing the file the editor would have written. Add `model`, `effort`, or both to the agent's entry, then recompile.

<!-- prettier-ignore -->
```typescript
const agents: AgentScopeConfig[] = [
  { name: 'web-developer', scope: 'project', model: 'sonnet', effort: 'high' },
  { name: 'api-developer', scope: 'project' },  // stays on its own default
]
```

```bash
npx agents-inc compile
```

Both land in the compiled sub-agent's frontmatter. `model` is always written; `effort` appears only when you set one.

The values are `sonnet`, `opus`, `haiku`, `fable` and `inherit` for the model, and `low`, `medium`, `high`, `xhigh` and `max` for the effort — [Models and effort](/docs/configuration/models-and-effort) says what each one buys.

## Where the default came from

Each sub-agent ships with a `metadata.yaml` naming the model it runs on, and every shipped one names `opus`. That's the value you see in a compiled agent you've never touched — so the question this page answers isn't "which of them is on the cheap model", it's "which of them do you want somewhere else".

Your config wins over it, and does so silently — a setting somebody made on purpose doesn't earn a warning on every compile. With neither present, the frontmatter renders `model: inherit`, which hands the choice back to whatever session invokes the sub-agent.

No shipped sub-agent names an `effort`, so effort is absent from a compiled agent until you set one.

## `inherit` doesn't travel

A shared configuration has four model words and `inherit` isn't one of them. Leaving it out would say "keep the sub-agent's own default", which is a different instruction, so `share` refuses instead and names the sub-agent:

```
This installation cannot be shared as it stands — a shared configuration has no way to carry:
  web-developer pins model 'inherit', which this contract has no word for — leaving it out would say "keep the sub-agent's own metadata", which is a different instruction
Sharing it anyway would mint an id that installs something else.
```

Drop the field to get the same behaviour back — an entry with no `model` is exactly what "use the sub-agent's own default" means — then share again. [Share a setup with a teammate](/docs/recipes/share-with-a-teammate) covers the other two refusals.

## Deeper customization

Model and effort tune a sub-agent. Changing what it _does_ means editing the partials it's composed from — see [Customizing sub-agents](/docs/guides/customizing-subagents).
