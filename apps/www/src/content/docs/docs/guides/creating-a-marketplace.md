---
title: Creating a marketplace
description: Build a personal or org-level marketplace of skills curated for your own conventions, and distribute it to your team.
sidebar:
  order: 7
---

Build a personal or org-level marketplace with skills curated for your conventions. Authoring one is
a terminal job start to finish — a marketplace is a Git repository the CLI scaffolds, packages and
indexes, and the [editor](https://agentsinc.sh) reads catalogues rather than building them.
Distributing one is the other way round, and that section is at the foot of this page.

## Quick start

```bash
npx agents-inc new marketplace acme   # scaffold a marketplace the CLI already accepts
cd acme                               # replace the placeholder author, then the example skill
npx agents-inc build plugins          # package each skill and agent
npx agents-inc build marketplace      # write marketplace.json, the index an install reads
```

Point a project at it with `npx agents-inc init --marketplace github:acme/skills`. The rest of
this page is what each of those steps expects of the directory, and what `build marketplace`
refuses to publish.

## Getting Started

The fastest way to start is to scaffold one:

```bash
npx agents-inc new marketplace acme
```

That writes a marketplace the CLI already accepts — its skill ids are namespaced for you, its rules
file loads, and `doctor` passes in the new directory. You can also build one by hand; four things
make a directory a marketplace the CLI can read:

```
package.json                  # name, version, description and author — all four required
config/skill-categories.ts    # the categories your skills fall into
config/skill-rules.ts         # relationships — see the note below
config/stacks.ts              # the stacks the wizard offers
src/skills/{skill-name}/      # at least one skill — SKILL.md + metadata.yaml
```

**A note on `config/skill-rules.ts`.** Relationship rules — conflicts, requires, alternatives —
currently name skills from the **public catalogue only**. Your own skills cannot be named there yet,
and a rule that names one will fail to load. The file itself is still required, so ship it with a
version and no relationships:

```typescript
export default { version: "1.0.0" }
```

Your marketplace works fully without them: skills install, reach their sub-agents and compile. What
you lose is the wizard's incompatibility hints between your own skills. Generating those
automatically is planned.

Copy the shapes of those four config files from the public marketplace at
[agents-inc/skills](https://github.com/agents-inc/skills), which is the reference implementation of
every one of them. `npx agents-inc doctor` reads a marketplace and reports what is missing or
malformed, so run it against your directory before pointing a project at it.

## Name your skills for your marketplace

**Every skill id in your marketplace must begin with your marketplace's name.** If your
`package.json` names the marketplace `acme`, its skills are `acme-web-frontend`,
`acme-api-database`, and so on — never a bare `web-frontend`.

This is what lets your marketplace coexist with the public one and with any other. A skill id is the
name of the directory it installs into, and a machine can hold installs at two scopes — one in your
home directory, one in a project. Two marketplaces both shipping a bare `web-frontend` would put two
different skills under one name, and whichever landed second would quietly win. Prefixing makes every
id unique, so the two simply never meet.

### Three names you cannot use

`agents-inc`, `external` and `local` are reserved, and `build marketplace` refuses them.

`agents-inc` is the public marketplace's own namespace — its skills are unprefixed, so the bare
`web-frontend` and everything like it already belong to it. `external` and `local` hold the skills
that belong to no marketplace at all: one you added from a repository, one you wrote yourself.
Publishing under any of the three would claim ids that are not yours.

Pick anything else. Your `package.json` name is the default, and `--name` overrides it when that name
is npm-scoped.

### What the build checks

`build marketplace` refuses to write a `marketplace.json` if either rule is broken:

```
Marketplace 'acme' ships 2 skill id(s) outside its own namespace.
Every skill id must begin with the marketplace's name:
  api-framework-hono -> acme-api-framework-hono
  web-framework-react -> acme-web-framework-react
Rename each skill directory and the id in its metadata, re-run 'build
plugins', then build the marketplace again.
```

A refused build writes nothing, so a marketplace that would break on someone else's machine never
gets published in the first place.

## Workflow

1. Start with existing skills from the public marketplace or write your own
2. Iterate on skills using the `skill-summoner` subagent to align them with your project conventions
3. Build the marketplace index:

```bash
npx agents-inc build marketplace
```

This generates `marketplace.json`, the index that the CLI reads when installing from your marketplace.

4. Point a project at your marketplace when you install it:

```bash
npx agents-inc init --marketplace github:acme/skills
```

Choosing a marketplace happens at `init` — that is the moment an install decides where its skills
come from. `edit` changes what you have installed, not where it comes from.

## Distribution

Marketplaces are Git repositories. Share them by giving your team access to the repo, and the route
in from there is the [editor](https://agentsinc.sh)'s **Marketplace** button: `owner/repo`, plus a
token for a private one. That fetch goes straight to GitHub from the browser, so the token stays
there and reaches nothing else. The id the editor hands out afterwards carries the marketplace it
read, so a teammate running `init --from <id>` resolves your skills against your repository without
having to name it. See [Marketplaces in the editor](/docs/editor/marketplaces), and
[Use a private marketplace](/docs/recipes/use-a-private-marketplace) for the consumer's whole side
of it.

:::note[Doing this from the terminal]
`npx agents-inc init --marketplace github:acme/skills` names it at install time. The flag outranks
whatever a `--from` payload carries — naming one is an instruction about this install, where the
payload's ref is only a record of where the sharer's came from.
:::

Skills and stacks can also be packaged as Claude Code plugins:

```bash
npx agents-inc build plugins    # Package individual skills and agents
```
