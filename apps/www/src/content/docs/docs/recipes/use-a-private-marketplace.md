---
title: Use a private marketplace
description: Point an installation at your own catalogue instead of the public one — from the editor's marketplace dialog, from the CLI at init, and what each side needs from the repository.
sidebar:
  order: 4
---

Every installation reads one marketplace. The default is the public `github:agents-inc/skills`; naming your own swaps the whole catalogue the wizard and the grid offer. [Creating a marketplace](/docs/guides/creating-a-marketplace) covers building one — this is how you point at it once it exists.

## Quick start

The `Marketplace` button sits at the foot of the skills column. Open it, type `acme/skills` — the `github:` prefix and a github.com URL are both accepted and normalized — and press Load. The whole grid becomes that catalogue's skills: its domains, its categories, its relationships.

If the repository answers with anything a token could change, a credential field appears — paste a personal access token and load again. If the new catalogue doesn't carry something you've already picked, the dialog names what the switch would cost, and a second Load performs it.

The editor reads a catalogue straight from GitHub, never through the Agents Inc worker, so a private catalogue's contents and the token that reaches it stay between your browser and your repository. Both the ref and the token are kept in your browser's local storage.

The id the editor mints carries the marketplace it was pointed at, so the command it hands you needs no flag — `npx agents-inc init --from <id>` fetches those skills from that catalogue rather than from a stranger's same-named ones.

Two things the editor needs that the CLI doesn't:

- **GitHub only.** GitLab, Bitbucket, sourcehut and a path on your own disk all work from the CLI, and none of them work here.
- **A built catalogue.** The editor reads `.claude-plugin/catalog.json`, which `npx agents-inc build marketplace` writes beside `marketplace.json`. A repository that has never been built has nothing for the editor to load.

[Marketplaces in the editor](/docs/editor/marketplaces) covers the dialog in full, including what switching catalogues costs the selection you already have.

:::note[Doing this from the terminal]
`init` takes the marketplace as a flag, and it's the only command that does:

```bash
npx agents-inc init --marketplace github:acme/skills
```

For a private repository, give giget a token first:

```bash
export GIGET_AUTH=<your github token>
npx agents-inc init --marketplace github:acme/skills
```

The token needs the `repo` scope for a private repository, or `public_repo` for a public one.
:::

## Where the marketplace is decided

The first rung that names one wins:

| Rung                                                    | Reachable by                       |
| ------------------------------------------------------- | ---------------------------------- |
| `--marketplace/-m`                                      | `init` alone                       |
| the ref a shared configuration carries                  | `init --from` alone                |
| `CC_MARKETPLACE`                                        | `init` alone                       |
| `marketplace` in this project's `.claude-src/config.ts` | every command                      |
| `marketplace` in `~/.claude-src/config.ts`              | every command                      |
| `github:agents-inc/skills`                              | the default when nothing names one |

Naming one on the command line outranks the ref a `--from` id carries: the flag is an instruction about this install, while the payload's ref is a record of where the sharer's came from. A value passed to `--marketplace` that can't be a marketplace stops the run — somebody named it, so falling through would install from a place they didn't name. A bad `CC_MARKETPLACE` warns and falls through to the next rung instead, because it was already in the environment rather than typed at this command.

**Choosing a marketplace happens at `init`.** `edit` changes what you have installed, not where it comes from.

## What counts as a marketplace ref

A ref starting with `github:`, `gh:`, `gitlab:`, `bitbucket:`, `sourcehut:`, `https://` or `http://` is remote. Anything else is read as a path on your own disk, so a local checkout works too:

```bash
npx agents-inc init --marketplace ./acme-skills
```

Refs are capped at 512 characters. A remote ref may not contain `..`, may not point at a private or reserved IP address, and a shorthand one has to spell `owner/repo`; a local path may not be a Windows UNC network path.

## If it can't be reached

A private repository and a typo look identical to GitHub, so the 404 says both:

```
Repository not found: github:acme/skills

This could mean:
  - The repository doesn't exist
  - The repository is private and you need to set authentication
  - There's a typo in the URL

For private repositories, set the GIGET_AUTH environment variable:
  export GIGET_AUTH=ghp_your_github_token
```

`npx agents-inc doctor` reports the same marketplace, alongside whatever else is wrong. Once a marketplace has been fetched once, a later run that can't reach it falls back to the cached copy and warns rather than failing.
