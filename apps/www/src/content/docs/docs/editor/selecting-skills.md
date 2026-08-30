---
title: Selecting skills
description: How the editor's grid is organized, what a click does when a category only allows one, what the filter bar narrows, and everything in a skill's own options panel.
sidebar:
  order: 2
---

The middle column is the catalogue, laid out in full. This page covers what you're looking at, what clicking a cell does, and the per-skill options behind the `•••` control. For what a skill _is_, see [Skills](/docs/concepts/skills).

## Quick start

Click a stack first. That selects a coherent set and hands each skill to the sub-agents that want it, which is a better starting point than an empty grid.

Then adjust:

- Type in the **search skills** field to narrow by name, slug or description.
- Click a domain chip — **Web**, **API**, **AI**, **Infra** or **Shared** — to narrow to one domain. Clicking the active chip clears it.
- Click **Selected** to see only what you've chosen, which is the review pass over your own setup.
- Click any cell to add or remove a skill.

Watch the right-hand column as you go. That's where a skill actually lands.

## The grid

Skills are grouped by **domain** — one heading each, pinned under the filter bar as you scroll — and within a domain by **category**. Each category header carries its name and one of two badges:

- **`one of`** — an exclusive category. Picking a skill here evicts its siblings.
- **`multi`** — pick as many as you like.

There's no accordion and nothing collapses: every skill in a category is on screen. The catalogue carries more domains than the filter bar has chips for; the ones without a chip still render as sections and are still reachable by search.

**A cell that's dimmed is ruled out by something you already picked.** Hover it and the reason reads `Conflicts with <name>`, `Needs <a> and <b>`, or `Needs one of <a>, <b>`. Clicking does nothing. Incompatibility carries through the chain — picking React rules out Nuxt because Nuxt needs Vue — so the reason names the nearest cause rather than the whole path.

Each selected cell carries a small right-aligned label reading `no agents`, `1 agent` or `N agents`. That's derived from the assignments underneath, not stored on the skill, and `no agents` means the skill would install and no sub-agent would receive it.

## Exclusive categories

**Picking a second skill in a `one of` category doesn't throw the first one away.** Its install mode, its scope and every sub-agent assignment you set are kept, so swapping back restores them exactly. Swapping between two ORMs while you make up your mind costs nothing.

The same memory covers a skill you configure _without_ selecting. The `•••` and the two badges configure a skill; they never select one. Set a skill to eject, walk away, select it a week later, and it comes back ejected.

## The two badges on a cell

Every cell carries two badges, and both are toggles.

| Badge        | Flips between        | Means                                                                                     |
| ------------ | -------------------- | ----------------------------------------------------------------------------------------- |
| Install mode | `plugin` ⇄ `eject`   | Whether the skill is registered as a Claude Code plugin or copied into `.claude/skills/`. |
| Scope        | `project` ⇄ `global` | Whether it installs into this project or into `~/.claude`.                                |

[Install modes](/docs/concepts/install-modes) explains both choices. On a skill you added yourself, the install badge is a statement rather than a control — there's no plugin form of it, so it always reads `eject`.

## The skill options panel

Hover a cell and a `•••` control appears at its top right. It opens a panel labelled **Skill options**, to the right of the cell or flipped to the left in the last column.

**Install mode** and **Install scope** are the same two decisions the badges carry, as segmented controls. The info glyph beside the scope label explains the one consequence that isn't self-evident: _"Determines where the skill is installed to. Project-level skills inherit global, but not vice versa."_

**Sub-agents** is a matrix — implementation domains down the side, roles across the top as `dev`, `res` and `test`. Each cell cycles through three states when clicked:

| State  | Reads       | Means                                               |
| ------ | ----------- | --------------------------------------------------- |
| Blank  | _(nothing)_ | This sub-agent doesn't get the skill.               |
| `lazy` | `lazy`      | The sub-agent loads it when it needs it.            |
| `pre`  | `pre`       | The skill is preloaded into the sub-agent's prompt. |

Under the matrix, a `＋` fold labelled **Meta** holds the sub-agents whose ids carry no domain prefix — `codex-keeper`, `reviewer` and the rest — as one labelled row each, cycling the same three ways. Between the matrix and the fold, every sub-agent there is can be reached by hand.

At the foot of the panel, **Source code ↗** opens the skill's own directory on GitHub, in the marketplace currently loaded.

**Model and thinking effort aren't here.** They belong to the sub-agent rather than to the skill, so they live on the roster's agent rows — see [The editor](/docs/editor).

## Filters are in the URL

The search text, the domain chip and the **Selected** chip are all URL search parameters, not component state. A filtered grid therefore has an address: narrow to the AI domain, copy the URL, and whoever opens it sees the same view.

Filters change what's drawn and never what's selected. Nothing you can't see is dropped, and the roster keeps reporting the whole configuration regardless of what the grid is showing.

## Adding a skill of your own

**＋ Add skill** in the filter bar opens a dialog titled **Add skill / from github**. It searches a pre-built index of external skills, matched on name and description, and each result row shows the skill's name, its description, its star count, the repository it came from, and a `＋ stage` chip. A skill too heavy to ride a shared link is still listed but can't be staged — the row prints its weight and the limit instead of the chip, because a result missing without explanation reads as the search failing.

Staging one puts a row above the search field where you **must** choose a category from a dropdown listing every category of the loaded catalogue as `web · framework`. Nothing is added without one — there's no guess and no "uncategorized" bucket, because where a skill belongs decides which sub-agents it reaches. If the resulting id is already taken you're told which skill holds it and asked to file this one elsewhere.

Confirming fetches each staged skill's whole directory, all or nothing, and seats them as real catalogue entries. From then on they render under a real domain, answer the domain chip, and are judged by the same selection rules as everything else. An added skill always installs by ejecting, and its `added` tag is a button that opens its files so you can read what you're about to install.

**An added skill is session-only.** It disappears on reload, and so does any selection that names it. That isn't an oversight: the skill's _bytes_ are resolved when you add it and live in memory or inside a payload, so an id surviving without them would name a skill this browser could neither describe nor install.

**Want to keep one?** Press **Save** or **Share** before you reload. Both write a payload, and a payload carries the bytes — see [Installing and sharing](/docs/editor/install-and-share).

## Related

- [Marketplaces in the editor](/docs/editor/marketplaces) — replacing the whole catalogue rather than adding one skill to it.
- [Writing custom skills](/docs/guides/writing-custom-skills) — authoring one properly, rather than pulling somebody else's.
