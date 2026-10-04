---
title: Share a setup with a teammate
description: Mint a setup as an id — from the editor's Share button or from an installation on disk — hand it over, and know exactly what travels with it and what stays on your machine.
sidebar:
  order: 3
---

A setup travels as a short id the agentsinc.sh store holds. Mint one from the editor, or from an installation already on disk; your teammate installs that id, or opens it in the editor. [CLI or web](/docs/cli-or-web) covers the round trip; this is the short path through it.

## Quick start

If the setup is on screen in the editor, **Share** in the roster footer copies a link to it — `https://agentsinc.sh/editor/?fromId=<id>`. The button says which ending happened rather than resting on one word: `Link copied`, `Link made, copy refused`, `Out of date — reload`, `Offline — try again`. It's disabled with nothing selected, and disabled while a sub-agent is still blocked on scope, because a link that fails on the recipient is worse than no link at all.

For a setup that's already installed on a machine, `share` mints an id from that directory:

```bash
npx agents-inc share
```

```
Sharing 12 skill(s) across 4 sub-agent(s)...
✓ Shared as <id>
  Install it:  npx agents-inc init --from <id>
  Open it:     https://agentsinc.sh/editor/?fromId=<id>
```

Hand over the id. Your teammate runs `npx agents-inc init --from <id>` in a clean directory — no wizard, no terminal needed, so it works over a pipe and in CI.

The id is the configuration's own hash. Sharing an unchanged installation returns the id it already had.

## What travels

|                                   | Carried as                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Plugin skills                     | their ids, plus the marketplace ref the receiver fetches them from                                                       |
| Ejected catalogue skills          | their ids, marked eject — the receiver copies a fresh one from the catalogue, so edits you made to your copy stay behind |
| Skills from outside the catalogue | their actual files, when the directory carries the `forkedFrom` block that says where they came from                     |
| Sub-agents                        | the roster, each one's scope, and its model and effort where you set them                                                |
| Curation                          | every skill-to-sub-agent assignment, with its preloaded or lazy state                                                    |
| `description`                     | the sentence itself                                                                                                      |

A link minted in the editor carries the same fields, and a skill you added there from outside the catalogue travels as its files for the same reason — the receiver's catalogue has no id to resolve.

## What stays behind

**A skill you wrote by hand is not shared.** A directory in `.claude/skills/` with no `forkedFrom` block is your own work rather than something this CLI installed, so it's dropped from the payload along with every `stack` row naming it. Nothing is refused over it — it was never in scope. The same judgement runs on the way back in, which is why applying a shared configuration over your own work doesn't delete it:

```
Kept — written here rather than installed, so a shared configuration never carried them:
  skill my-house-style
Remove them with 'npx agents-inc edit'.
```

The `projects` registry, `author` and `branding` stay behind too. They describe your machine rather than the configuration, and the payload has no field for any of them.

**The provider stays behind as well, and that is the point of it.** An id carries no record of whether it was minted from a Claude installation or a Codex one, so your teammate installs the same id with `init --from <id>` or `init --from <id> --provider codex` as their own machine requires. Codex is not in a release yet — see [Claude or Codex](/docs/configuration/providers). Two consequences to expect:

- A configuration minted on Claude can name a skill as `plugin` at **project** scope, which a Codex install does not offer. The recipient's install refuses it by name, before anything is written, and names the three placements Codex does offer.
- A payload keeps `agent-summoner` and `skill-summoner` wherever the configuration names them — every shipped stack does — even one minted from a Codex installation, which never compiled them. A Codex install drops both and says so once, which is what lets a later release restore them without anyone re-minting an id.

## What stops a share

`share` refuses rather than minting an id that installs something else. Everything that can fail locally fails before the store is written to, and everything the payload has no way to carry is named at once:

```
This installation cannot be shared as it stands — a shared configuration has no way to carry:
  ...
Sharing it anyway would mint an id that installs something else.
```

The causes:

- **A skill from a marketplace this config can't name.** Its `origin` names a marketplace, but the config doesn't record where that marketplace is fetched from.
- **A sub-agent pinned to `inherit`.** The wire has four model words — `opus`, `fable`, `sonnet`, `haiku` — and leaving `inherit` out would say "keep the sub-agent's own default", which is a different instruction. See [Tune a sub-agent's model](/docs/recipes/tune-an-agents-model).
- **A project-scoped skill assigned to a global-scoped sub-agent.** Every offending pair is named, so one re-share fixes them all.
- **A copied skill whose files can't travel** — one this CLI installed from outside the catalogue, where the installation doesn't record the repository it came from or its files no longer make a skill.

## On the receiving end

`init --from <id>` is greenfield-only. In a directory that already carries an installation it refuses before it even fetches the configuration:

```
An installation already exists at <path>. Run 'npx agents-inc uninstall' first — installing a shared configuration is a fresh setup, not a merge. To apply it here instead, run 'npx agents-inc edit --from <id>'.
```

Skills or sub-agents the current catalogue no longer knows are named and skipped, and the install proceeds without them.

`edit --from <id>` applies a configuration to an installation you already have, and it removes whatever the configuration leaves out. It needs a terminal, because that has to be confirmed.

Opening `https://agentsinc.sh/editor/?fromId=<id>` writes nothing anywhere. The id stays in the address, so a reload reopens the same configuration, and the nav rail's **Editor** link clears it and hands you back your own.

## Sharing something you hold rather than something installed

`--stdin` publishes a configuration piped in, for a producer that isn't this CLI:

```bash
cat proposal.json | npx agents-inc share --stdin
```

Without the flag, `share` resolves an installation the usual way — this project, then the global one — so piping a payload from an empty directory would publish whatever the machine has installed globally.
