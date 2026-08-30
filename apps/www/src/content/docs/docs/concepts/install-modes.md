---
title: Install modes
description: Plugin versus eject — the per-skill choice that decides whether a skill's files are registered with Claude Code or copied into your project for you to own.
---

A skill installs one of two ways: as a Claude Code **plugin**, or **ejected** — copied into your project as files you own. It's a per-skill choice, so a mixed installation is normal, and it's independent of the skill's [scope](/docs/concepts/scopes). Set it wherever you pick your skills — the [editor](/docs/editor)'s grid, or the wizard.

## Quick start

Plugin is the default and needs no action — every skill installs as a Claude Code plugin unless you say otherwise. To own a skill's files instead, set that skill to eject before you install it.

In the editor, click the `plugin` badge on the skill's cell and it flips to `eject`. The same choice sits behind the cell's `•••` control as an **Install mode** pair, and the two stay in step because they write the same field. A skill added from outside the catalogue has no plugin form, so its badge states `eject` rather than flipping.

The choice travels in the id the Install dialog mints, so install with the command that dialog hands you and not a bare `init`:

```bash
npx agents-inc init --from Ab3xY9_Q
```

`npx agents-inc init` on its own starts the wizard from nothing — it's a valid command, it just doesn't carry what you configured in the browser.

:::note[From the terminal]
On the wizard's Sources step, `SPACE` on a row's `Local` cell is the same choice — `Local` is what that step calls eject. It's the only install-mode surface there: the step has no bulk keys, and `SPACE` is inert on a row inherited from a global install. To change a skill already installed, `npx agents-inc edit` and the same step; `npx agents-inc eject skills` copies the marketplace's skills into `.claude/skills/` in one go.
:::

`npx agents-inc list` prints which mode an installation is on: `Plugin`, `Eject` or `Mixed`. The mode isn't stored anywhere — it's read off the skills in your config, so an installation holding one local copy and the rest as plugins reports `Mixed`.

## Install Modes

**Plugin** (default) — Skills are installed as Claude Code plugins, registered in Claude's own plugin store (`~/.claude/plugins/` for global scope, your project's `.claude/plugins/` for project scope). No files are copied into your project source. Updates are pulled directly from the source.

**Eject** — Skills are copied into `.claude/skills/` in your project directory. Use this when you want full ownership of the skill files or need to modify them.

You can switch modes after initial install using `npx agents-inc edit`.

## Scope is the other choice, and it's separate

Install mode decides how a skill's files get there. Scope decides who can see them — this project, or every project on the machine. The two are set independently, so a skill can be an ejected copy at global scope, a plugin at project scope, or either of the other two combinations.

In the editor, scope is the second badge on a skill's cell; a sub-agent carries the same word on its roster row. In the wizard it's `S` on the focused row, on the Skills and Agents steps alike.

[Scopes](/docs/concepts/scopes) covers what each one means, why global is the default, and the one pairing the CLI refuses to write.

## Related

- [Scopes](/docs/concepts/scopes) — the other per-skill choice, including the one skill/sub-agent pairing that can't be written.
- [Global-first setup](/docs/guides/global-first-setup) — why global is the right default, and what happens to global entries when you edit from inside a project.
- [Customizing sub-agents](/docs/guides/customizing-subagents) — ejecting is not only for skills; partials and templates eject too.
- [Config reference](/docs/configuration/config-reference) — `origin` is the field that records the install mode, `scope` the one that records the scope.
- [Switch a skill to eject](/docs/recipes/switch-a-skill-to-eject) — the change worked end to end, on one skill.
