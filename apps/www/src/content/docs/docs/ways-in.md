---
title: Four ways in
description: Describe your project to the composer, let the stack-detection skill read it, click through the editor's grid, or answer the terminal wizard — the four routes to a selection, and which one suits where you are starting from.
---

Every setup is the same two moves: arrive at a selection of skills, then run one
command that writes it. **The second move never changes.** This page is about
the first, because there are four ways to make it and the right one depends
entirely on what you already have.

|                         | Where it runs            | Best when                                              |
| ----------------------- | ------------------------ | ------------------------------------------------------ |
| **Stack detection**     | Claude Code, in the repo | You are adding this to a codebase that already exists  |
| **The composer**        | The editor               | You are starting from nothing and can describe it      |
| **The grid**            | The editor               | You know what you want and would rather click it       |
| **The terminal wizard** | Your shell               | No browser, or you are already standing in the project |

Two of those four are the ones to reach for first, and they split on one
question: **does the code already exist?**

## Adding to a project you already have

**Use stack detection.** You have a repository full of decisions already made —
a framework, a test runner, a styling approach, a deploy target — and typing
them into a grid one at a time is transcription. The
`meta-config-stack-detect` skill reads them instead.

It is a Claude Code plugin rather than part of the CLI, so it installs without
Agents Inc being anywhere on the machine:

```bash
/plugin marketplace add agents-inc/skills
/plugin install meta-config-stack-detect
```

Then ask it to read the project. It walks manifests, lockfiles and framework
configs — one pass per workspace, so a monorepo is read as the several projects
it is — maps what it finds onto catalogue skill ids, and hands back a
configuration plus a written report of everything the configuration could not
carry. It writes nothing and installs nothing, by construction.

[Adding to an existing project](/docs/guides/adding-to-an-existing-project)
walks the whole route, including the two commands that turn its proposal into an
installation.

## Starting from nothing

**Use the composer.** It is the field at the foot of the editor's roster:
describe the project in a sentence, and it returns the skills for it as a
proposal you can read before anything is selected.

This is the route when there is no code to detect anything from — a project that
does not exist yet, or one you are about to start. You do not need to know the
catalogue, which is the whole point: naming Postgres and a React frontend is
enough to get a roster back, and the grid is still there to correct it.

It needs a GitHub sign-in, because it calls a model and the cost has to be
attributable to somebody. [The composer](/docs/editor/composer) covers what it
will and will not decide, and why applying a proposal can never reach a
configuration you could not have clicked to by hand.

## The two you already know

**The grid** is the editor with no shortcut — the whole catalogue on screen,
grouped by domain, and you click what you want. Reach for it when you know the
answer, when you are correcting what one of the two routes above proposed, or
when you want something neither of them offers: a sub-agent's model and
reasoning effort, which sub-agents carry which skill, or a skill from outside
the catalogue. [Selecting skills](/docs/editor/selecting-skills) is that page.

**The terminal wizard** is `npx agents-inc init` — the same catalogue as an Ink
UI in your shell. Reach for it when a browser is not available or not wanted,
or when you are already in the project and want this over with.
[CLI or web](/docs/cli-or-web) compares the two surfaces properly.

## They all end in the same place

None of the four installs anything. Three of them hand you a short id and the
command that installs it; the wizard skips the id because it is already standing
where the files go.

```bash
npx agents-inc init --from Ab3xY9_Q
```

That is not four pipelines with a shared ending — it is one pipeline with four
intakes. The catalogue is the same catalogue, the payload is the same payload,
and an id minted by the detection skill is the same kind of id the editor's
install dialog mints. So the routes mix: detect a stack, open the result in the
editor to correct it, and install from there.

:::note[Nothing is decided by a model that the tool can decide itself]
Both AI routes return **skill ids and nothing else**. Scope, install mode, which
sub-agents carry what and whether each copy is preloaded are all derived from
the same rules the CLI generates from — so a proposal cannot produce a
configuration the CLI would then contradict. What you are reviewing is a list of
skills, not a configuration somebody's model invented.
:::

## Where to go next

- [Adding to an existing project](/docs/guides/adding-to-an-existing-project) —
  stack detection end to end.
- [The composer](/docs/editor/composer) — the field, the proposal, and the
  four ways it can refuse.
- [Quickstart](/docs/quickstart) — the run itself, and every file it leaves on
  disk.
- [CLI or web](/docs/cli-or-web) — how a configuration travels between the two
  surfaces, in both directions.
