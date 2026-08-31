---
title: Adding to an existing project
description: Let the stack-detection skill read a repository you already have, turn what it proposes into an id, and install it — without transcribing your own dependencies into a grid.
sidebar:
  order: 2
---

A project that already exists has already made its decisions. The framework is
chosen, the test runner is installed, the styling approach is settled — and
clicking through a catalogue to say so again is transcription rather than
configuration.

`meta-config-stack-detect` reads them instead. It walks the repository, maps
what it finds onto catalogue skills, and hands back a configuration for you to
confirm.

## Quick start

```bash
# In Claude Code, from the project:
/plugin marketplace add agents-inc/skills
/plugin install meta-config-stack-detect
```

Ask it to propose a configuration for the project. It writes a `SeedPayload`
— save it as `proposal.json` — and a report alongside it. Then:

```bash
cat proposal.json | npx agents-inc share --stdin
```

That prints an id and the two things you can do with it:

```
✓ Shared as Ab3xY9_Q
  Install it:  npx agents-inc init --from Ab3xY9_Q
  Open it:     https://agentsinc.sh/?fromId=Ab3xY9_Q
```

Install it if the proposal is right. Open it if you would rather look first.

## It installs without Agents Inc

The detection skill is a **Claude Code plugin**, published from the same
marketplace repository the catalogue itself comes from — so the two commands
above work on a machine that has never seen this tool. That is deliberate: a
skill whose whole job is to configure a project for the first time cannot
require the thing it is configuring.

It is also in the Agents Inc catalogue, under `shared-tooling`, so once you have
an installation it can travel with it like any other skill. That is the route
for the second project and the tenth; the plugin install above is the route for
the first.

## What it reads, and what it refuses to do

**Evidence, not coverage.** Declared dependencies settle which libraries a
workspace claims; the lockfile settles the real major version, which a manifest
range cannot; a framework's own config file settles whether that framework is
_wired_ rather than merely installed. Scripts, directory layout and the presence
of a `test/` directory only corroborate — a `test/` directory does not name a
test runner, and it is never allowed to originate a finding.

**One pass per workspace.** A monorepo is read as the several projects it is,
so a React app and a Hono worker in one repository do not merge into one
undifferentiated stack.

**Some things are deliberately ignored**: transitive dependencies no manifest
names, `@types/*` packages that merely mirror a runtime dependency, build and
coverage output, and fixture or example directories that exist to demonstrate
something the project does not necessarily use.

**It never writes, installs, or publishes.** The skill emits a proposal and
offers you the command that publishes it. It does not create config files, does
not run install commands, and does not report a configuration as applied. That
is the reason the round trip below has a step in it that looks redundant: the
producer of a configuration and the applier of one are kept apart on purpose.

## Two artifacts, and the second one is the honest half

You get a `SeedPayload` and a written report, always both.

The payload is schema-pure — it carries skill ids and the configuration built
from them, and nothing else, because that is all the schema has room for.
Everything worth saying that will not fit goes in the report:

- **Libraries with no catalogue skill.** Detected, real, and unrepresented. The
  payload has no field for "you use this and we have nothing for it", so a
  payload read on its own silently under-describes the project.
- **Major-version mismatches.** The skill configures and warns rather than
  refusing.
- **Unresolved conflicts.** Where two skills in an exclusive category both have
  evidence, both are named with their evidence and neither is picked. Resolving
  that silently would hide a real ambiguity about your project.
- **Assumptions it defaulted.**

Read the report. The payload is what installs; the report is what tells you
whether it should.

## Three ways to ask it

Detection is the headline, but the skill answers one question — which skills
should this configuration carry — from three qualities of evidence.

| You have                    | What it does                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| A repository                | Traverses it, as above.                                                  |
| A stack you can name        | Takes you at your word and maps it. No traversal.                        |
| Only what you want to build | Offers candidate built-in stacks, one line on why each is one, and waits |

The third is the weakest evidence by a wide margin, and it is the one where the
skill deliberately stops: intent names no library, so answering it means
choosing among the stacks the product already ships, and choosing is yours.
A recommendation you never asked for and cannot see is a decision wearing a
proposal's clothes. If you are in that third case and you would rather describe
it to something with the catalogue in front of it, that is
[the composer](/docs/editor/composer).

## Turning the proposal into an installation

`share --stdin` is the step that mints an id from a payload **you** hold, rather
than from an installation on disk.

```bash
cat proposal.json | npx agents-inc share --stdin
```

The flag is not cosmetic. Without it, `share` resolves an installation the way
every command does — this project, then the global one — so publishing a piped
configuration from a directory with nothing in it would publish whatever the
machine happens to have installed globally.

Everything that can fail locally fails before anything is published: an empty
pipe, text that is not JSON, and JSON the store will not accept are three
different mistakes and each says which. It also refuses to run if standard input
is a terminal, because that means nothing was piped.

Then either install it or open it:

```bash
npx agents-inc init --from Ab3xY9_Q     # write it to disk
npx agents-inc init --ui --from Ab3xY9_Q # open that id in the editor instead
```

**`init --from` is greenfield-only.** In a directory that already carries an
installation it refuses and names what it found, because installing a shared
configuration is a fresh setup rather than a merge. If this project is already
installed and you are re-running detection after the dependencies changed, the
command is `edit --from <id>` — that direction confirms first and names every
removal before writing.

:::note[Publishing and opening are two steps on purpose]
There is no `share --stdin --ui`. It was considered and declined: publishing a
configuration is a visibly separate act from opening one, and collapsing them
would hide a write behind a browser launch.
:::

## Run it again when the project moves

A proposal is an opening offer rather than a build step, and re-running it after
the repository's dependencies change is a supported use rather than a sign
something went wrong.

**Two runs over the same repository may propose slightly different sets**, and
that is not a defect to engineer away. Detection is judgment-shaped — a
deterministic detector would accumulate an unbounded matrix of monorepo
flavours and directory conventions, and each new architecture would become
something to test. Determinism is recovered at the boundary instead: a proposal
is only accepted if it survives the validation that already exists — schema
decoding, skill-existence checks, `requires` and conflict relations, and
one-selection-per-exclusive-category. A wrong guess is a checkbox you untick.
An invalid configuration cannot get through at all.

## Where to go next

- [Four ways in](/docs/ways-in) — the other three routes to a selection, and
  when each one is the right one.
- [Quickstart](/docs/quickstart) — what `init --from` actually writes to disk.
- [The composer](/docs/editor/composer) — the same job for a project that does
  not exist yet.
- [Share a setup with a teammate](/docs/recipes/share-with-a-teammate) — what
  travels with an id, and what stays behind.
