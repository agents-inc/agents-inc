---
title: Marketplaces in the editor
description: Pointing the grid at a catalogue other than the default, what a switch does to your current selection, and where a private marketplace's access token lives.
sidebar:
  order: 5
---

By default the editor's grid is the public catalogue at `agents-inc/skills`. Point it at another repository and the whole grid becomes that catalogue's skills — its domains, its categories, its relationships. This page covers loading one, switching between them, and what the editor can and can't tell you about a private one. To author a marketplace of your own, see [Creating a marketplace](/docs/guides/creating-a-marketplace).

## Quick start

1. Click **Marketplace** in the nav rail on the left.
2. Type the repository as `owner/repo`.
3. Press **Load**.

The rail then names the catalogue under the word **Marketplace**, as `github:owner/repo`. The public catalogue has no name there — nothing under the word means you're on it. Clear the field and press Load again to go back to the public one.

## What the editor reads

A marketplace publishes `catalog.json` in its `.claude-plugin/` directory, beside the `marketplace.json` the CLI installs from — `npx agents-inc build marketplace` writes both. The editor fetches that one file, straight from GitHub's contents API, and builds the grid out of it — the catalogue and any token it needed stay between your browser and GitHub.

The field accepts several spellings of one repository — a bare `owner/repo`, a `github:` or `gh:` prefix, a pasted `https://github.com/owner/repo` URL, and a `#branch` on the end for a catalogue not yet on the default branch. Whatever you type is normalized to the CLI's own form, `github:owner/repo`, because that's what `--marketplace` expects and what a shared payload has to carry so `--from` installs the skills your ids actually name.

## Each marketplace keeps its own configuration

This browser saves one configuration per marketplace. Loading a different marketplace opens the configuration saved with it — or a new, empty one if there is none — and the one on screen stays saved with its own marketplace, stack, skills, options and sub-agent choices intact. Loading that marketplace again reopens it as you left it. The marketplace you load becomes this browser's active one, so a reload continues where you left off. Only the loaded marketplace's skills are on the grid.

The dialog reads the target catalogue before it seats it, and asks first whenever something is selected:

> Switching to github:acme/skills opens the configuration saved with it, or a new one. This one stays saved with the public catalogue and reopens when you load it again. Nothing has changed yet — press Load again to switch.

The second press performs it. **With nothing selected, one press does both**, since a second would stand in front of nothing. Clearing the field is how you go back to the public catalogue, and it's another marketplace like any other.

A marketplace that stops loading — a token gone stale, a repository deleted — is no different. The dialog opens on it with the answer GitHub gave, and nothing is read from it until it loads; its configuration stays saved with it meanwhile. Loading it again, with a token if it needs one, reopens it. Loading any other marketplace opens that one's own and leaves it where it is.

**Applying a saved stack built on another marketplace is a load of that marketplace, then the stack.** The marketplace becomes the active one, so the stack's skills survive a reload, and the configuration on screen stays saved with its own marketplace.

## Loading the same marketplace again

Loading the marketplace that's already on screen re-reads its catalogue and keeps your selection, less any skill the catalogue no longer carries. Those are named before the second press:

> Switching to github:acme/skills will drop 1 of your 7 skills: Prisma. Nothing has changed yet — press Load again to switch.

They're dropped rather than hidden: a skill left in the configuration would still be in the install list and in every link you minted afterwards, under a marketplace ref that can't resolve it.

## Private marketplaces

The **Access token** field isn't on screen until it could help. It appears when an answer comes back that a token might change — a 401, 403 or 404 — or when this browser already holds one for the repository in the field. A public marketplace never sees a credential field at all.

**The token stays in this browser.** It's kept in local storage, filed under the marketplace it authorizes, and the catalogue is fetched browser-direct from GitHub precisely so it never transits an Agents Inc server. A token is only ever spent on the repository it's filed under, so a link somebody sends you — naming a marketplace you didn't choose — can't present your credential to a repository it was never issued for.

There's deliberately no control anywhere that forgets a token. A GitHub personal access token is shown once and can't be read back, so nothing in the editor is a door to destroying one.

### What the editor can tell you, and what it can't

**It can tell you** whether the catalogue is readable with what you've supplied, what a load does to your selection before it happens, and — once loaded — everything the catalogue offers, judged by that catalogue's own relationships rather than the public one's.

**It can't tell you whether you typed the name wrong.** GitHub answers 404 for a private repository whenever the caller isn't allowed to know it exists, so "not found" and "not yours" are the same answer. The editor says what it actually knows: _"`<name>` could not be read (404) — if it is private, a token with repo access will reach it."_

**It can't tell you a catalogue is publishable until it reads one.** A repository that isn't a repository is refused at the field before any request is made. A repository whose `catalog.json` won't parse is named along with the fields that failed, and no token is offered for it — the same bytes come back however the request is authorized, so what has to change is the author's build.

## Switching between saved marketplaces

Every marketplace loaded from the Marketplace dialog is remembered, along with the token that reached it. Once this browser holds more than one, the others are listed by their refs under **Marketplace** in the nav rail, one press each — with one saved there's nowhere to switch to, and the rail already names it.

Pressing one opens **Switch marketplace**, which fetches the target in order to describe it in the same words the Load flow uses, and offers **Cancel** or **Switch marketplace**. Switching opens that marketplace's configuration exactly as a load does. Reading is not switching: nothing is seated or stored until you press the CTA, so canceling costs you nothing but the fetch.

## Shared links and marketplaces

A payload is stamped with the marketplace it was minted against, so opening somebody's link seats their catalogue before it resolves a single id. If that catalogue can't be read — it's private and you have no token, or it's gone — nothing from the link is applied and a notice says so:

> This link's skills come from `<marketplace>`, which could not be loaded — nothing from it was applied. Load it from Marketplace to finish.

The Marketplace dialog then opens pre-filled with the repository that failed and the answer that explains why, so you start where the attempt got to. Loading it finishes the import that was waiting.

**A marketplace a link loads on its own isn't saved.**

**Loading a different marketplace while a link is open leaves the link.** The link's id leaves the address and the marketplace's own configuration opens, as from anywhere else. The link's configuration was never saved here, and its link still opens it; the configurations this browser saved are untouched, as the link's notice promises. On a link a bare `edit` made inside a project, the global entries it holds go with the link.

## Related

- [Creating a marketplace](/docs/guides/creating-a-marketplace) — the repository layout, the rules `build marketplace` enforces, and how to publish one.
- [Selecting skills](/docs/editor/selecting-skills) — adding a single external skill instead of swapping the whole catalogue.
