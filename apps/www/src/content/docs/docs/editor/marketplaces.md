---
title: Marketplaces in the editor
description: Pointing the grid at a catalogue other than the default, what a switch costs your current selection, and where a private marketplace's access token lives.
sidebar:
  order: 4
---

By default the editor's grid is the public catalogue at `agents-inc/skills`. Point it at another repository and the whole grid becomes that catalogue's skills — its domains, its categories, its relationships. This page covers loading one, switching between them, and what the editor can and can't tell you about a private one. To author a marketplace of your own, see [Creating a marketplace](/docs/guides/creating-a-marketplace).

## Quick start

1. Click the **Marketplace** button floating at the foot of the middle column.
2. Type the repository as `owner/repo`.
3. Press **Load**.

The button then reads `Marketplace · github:owner/repo`, which is the only place on screen that names the catalogue you're looking at. Clear the field and press Load again to go back to the public one.

## What the editor reads

A marketplace publishes `catalog.json` in its `.claude-plugin/` directory, beside the `marketplace.json` the CLI installs from — `npx agents-inc build marketplace` writes both. The editor fetches that one file, straight from GitHub's contents API, and builds the grid out of it — the catalogue and any token it needed stay between your browser and GitHub.

The field accepts several spellings of one repository — a bare `owner/repo`, a `github:` or `gh:` prefix, a pasted `https://github.com/owner/repo` URL, and a `#branch` on the end for a catalogue not yet on the default branch. Whatever you type is normalized to the CLI's own form, `github:owner/repo`, because that's what `--marketplace` expects and what a shared payload has to carry so `--from` installs the skills your ids actually name.

## Loading takes two presses when it costs something

The dialog reads the target catalogue before it seats it, so it can name what a switch would do rather than warn that something might happen:

> Switching to github:acme/skills will drop 3 of your 7 skills: Prisma, Drizzle, Hono. Nothing has changed yet — press Load again to switch.

The second press performs it. **A load that costs your selection nothing does both at once** — that's every first load of a session, and every load onto a catalogue that carries what you already picked, where a second press would stand in front of nothing.

Clearing the field is how you go back to the public catalogue. It's read and described exactly like naming a repository, because it costs the selection exactly as much.

## What happens to your selection

Skills the incoming catalogue doesn't carry are **dropped**, and they're precisely the skills the sentence just named. Everything else survives with its install mode, its scope and its sub-agent assignments intact.

A skill hidden from the grid but left in the configuration would still be in the install list and in every link you minted afterwards, under a marketplace ref that can't resolve it — so the link would install a subset and you'd never be told.

**The sub-agent roster is the same whatever catalogue is loaded.** A marketplace publishes skills, categories and stacks — never sub-agents — so every per-agent decision you made survives a switch untouched. Your saved stack survives too; it's a snapshot in its own slot rather than part of the configuration. What doesn't survive is the stack you're _on_, if the incoming catalogue doesn't carry it: that clears back to no stack, and your selection stays as it was.

## Private marketplaces

The **Access token** field isn't on screen until it could help. It appears when an answer comes back that a token might change — a 401, 403 or 404 — or when this browser already holds one for the repository in the field. A public marketplace never sees a credential field at all.

**The token stays in this browser.** It's kept in local storage, filed under the marketplace it authorizes, and the catalogue is fetched browser-direct from GitHub precisely so it never transits an Agents Inc server. A token is only ever spent on the repository it's filed under, so a link somebody sends you — naming a marketplace you didn't choose — can't present your credential to a repository it was never issued for.

There's deliberately no control anywhere that forgets a token. A GitHub personal access token is shown once and can't be read back, so nothing in the editor is a door to destroying one.

### What the editor can tell you, and what it can't

**It can tell you** whether the catalogue is readable with what you've supplied, exactly which of your selected skills a switch would drop, and — once loaded — everything the catalogue offers, judged by that catalogue's own relationships rather than the public one's.

**It can't tell you whether you typed the name wrong.** GitHub answers 404 for a private repository whenever the caller isn't allowed to know it exists, so "not found" and "not yours" are the same answer. The editor says what it actually knows: _"`<name>` could not be read (404) — if it is private, a token with repo access will reach it."_

**It can't tell you a catalogue is publishable until it reads one.** A repository that isn't a repository is refused at the field before any request is made. A repository whose `catalog.json` won't parse is named along with the fields that failed, and no token is offered for it — the same bytes come back however the request is authorized, so what has to change is the author's build.

## Switching between saved marketplaces

Every marketplace a load has succeeded against is remembered, along with the token that reached it. Once this browser holds more than one, `Switch to <ref>` buttons appear beside the Marketplace button — with one saved there's nowhere to switch to, and the button already names it.

Pressing one opens **Switch marketplace**, which fetches the target in order to describe it in the same words the Load flow uses, and offers **Cancel** or **Switch marketplace**. Reading is not switching: nothing is seated, stored or dropped until you press the CTA, so canceling costs you nothing but the fetch.

## Shared links and marketplaces

A payload is stamped with the marketplace it was minted against, so opening somebody's link seats their catalogue before it resolves a single id. If that catalogue can't be read — it's private and you have no token, or it's gone — nothing from the link is applied and a notice says so:

> This link's skills come from `<marketplace>`, which could not be loaded — nothing from it was applied. Load it from Marketplace to finish.

The Marketplace dialog then opens pre-filled with the repository that failed and the answer that explains why, so you start where the attempt got to. Loading it finishes the import that was waiting.

**A marketplace a link brought is never saved.** Only one you typed into the field yourself reaches the saved list, so the switcher only ever offers catalogues you chose.

## Related

- [Creating a marketplace](/docs/guides/creating-a-marketplace) — the repository layout, the rules `build marketplace` enforces, and how to publish one.
- [Selecting skills](/docs/editor/selecting-skills) — adding a single external skill instead of swapping the whole catalogue.
