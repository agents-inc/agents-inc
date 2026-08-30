---
title: Share a setup with a teammate
description: Mint a setup as an id — from the editor's Share button or from an installation on disk — hand it over, and know exactly what travels with it and what stays on your machine.
sidebar:
  order: 3
---

A setup travels as a short id the agentsinc.sh store holds. Mint one from the editor, or from an installation already on disk; your teammate installs that id, or opens it in the editor. [CLI or web](/docs/cli-or-web) covers the round trip; this is the short path through it.

## Quick start

If the setup is on screen in the editor, **Share** in the roster footer copies a link to it — `https://agentsinc.sh/?fromId=<id>`. The button says which ending happened rather than resting on one word: `Link copied`, `Link made, copy refused`, `Out of date — reload`, `Offline — try again`. It's disabled with nothing selected, and disabled while a sub-agent is still blocked on scope, because a link that fails on the recipient is worse than no link at all.

For a setup that's already installed on a machine, `share` mints an id from that directory:

```bash
npx agents-inc share
```

```
Sharing 12 skill(s) across 4 sub-agent(s)...
✓ Shared as <id>
  Install it:  npx agents-inc init --from <id>
  Open it:     https://agentsinc.sh/?fromId=<id>
```

Hand over the id. Your teammate runs `npx agents-inc init --from <id>` in a clean directory — no wizard, no terminal needed, so it works over a pipe and in CI.

The id is the configuration's own hash. Sharing an unchanged installation returns the id it already had.

## What travels

|                | Carried as                                                                |
| -------------- | ------------------------------------------------------------------------- |
| Plugin skills  | their ids, plus the marketplace ref the receiver fetches them from        |
| Ejected skills | their actual files, when the directory carries a `forkedFrom` block       |
| Sub-agents     | the roster, each one's scope, and its model and effort where you set them |
| Curation       | every skill-to-sub-agent assignment, with its preloaded or lazy state     |
| `description`  | the sentence itself                                                       |

A link minted in the editor carries the same fields, and a skill you added there from outside the catalogue travels as its files for the same reason an ejected one does — the receiver's catalogue has no id to resolve.

## What stays behind

**A skill you wrote by hand is not shared.** A directory in `.claude/skills/` with no `forkedFrom` block is your own work rather than something this CLI installed, so it's dropped from the payload along with every `stack` row naming it. Nothing is refused over it — it was never in scope. The same judgement runs on the way back in, which is why applying a shared configuration over your own work doesn't delete it:

```
Kept — written here rather than installed, so a shared configuration never carried them:
  skill my-house-style
Remove them with 'npx agents-inc edit'.
```

The `projects` registry, `author` and `branding` stay behind too. They describe your machine rather than the configuration, and the payload has no field for any of them.

## Three things that stop a share

`share` refuses rather than minting an id that installs something else. Everything that can fail locally fails before the store is written to, and all of it is named at once:

```
This installation cannot be shared as it stands — a shared configuration has no way to carry:
  ...
Sharing it anyway would mint an id that installs something else.
```

The three causes:

- **A skill from a marketplace this config can't name.** Its `origin` names a marketplace, but the config doesn't record where that marketplace is fetched from.
- **A sub-agent pinned to `inherit`.** The wire has four model words — `opus`, `fable`, `sonnet`, `haiku` — and leaving `inherit` out would say "keep the sub-agent's own default", which is a different instruction. See [Tune a sub-agent's model](/docs/recipes/tune-an-agents-model).
- **A project-scoped skill assigned to a global-scoped sub-agent.** Every offending pair is named, so one re-share fixes them all.

## On the receiving end

`init --from <id>` is greenfield-only. In a directory that already carries an installation it refuses before it even fetches the configuration:

```
An installation already exists at <path>. Run 'npx agents-inc uninstall' first — installing a shared configuration is a fresh setup, not a merge.
```

Skills or sub-agents the current catalogue no longer knows are named and skipped, and the install proceeds without them.

`edit --from <id>` applies a configuration to an installation you already have, and it removes whatever the configuration leaves out. It needs a terminal, because that has to be confirmed.

Opening `https://agentsinc.sh/?fromId=<id>` writes nothing anywhere. The id stays in the address, so a reload reopens the same configuration, and the nav rail's **Configure** link clears it and hands you back your own.

## Sharing something you hold rather than something installed

`--stdin` publishes a configuration piped in, for a producer that isn't this CLI:

```bash
cat proposal.json | npx agents-inc share --stdin
```

Without the flag, `share` resolves an installation the usual way — this project, then the global one — so piping a payload from an empty directory would publish whatever the machine has installed globally.
