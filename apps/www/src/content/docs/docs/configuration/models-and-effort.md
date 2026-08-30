---
title: Models and effort
description: The per-sub-agent model and effort overrides — their permitted values, where the default comes from, how config beats metadata, how to set them from the editor's roster, and what branding changes.
sidebar:
  order: 4
---

Two optional fields on a sub-agent's entry decide which model it runs on and how much reasoning effort it's given. Both are pure overrides — leave them out and the sub-agent keeps whatever its own definition names. `branding` is the third tuning knob on this page, and it changes what the CLI calls itself.

## Quick start

Add `model` and `effort` to the sub-agent's entry in the `agents` array:

<!-- prettier-ignore -->
```typescript
const agents: AgentScopeConfig[] = [
  { name: 'web-developer', scope: 'project' },
  { name: 'api-developer', scope: 'project', model: 'opus', effort: 'high' },
]
```

Then compile:

```bash
npx agents-inc compile
```

`.claude/agents/api-developer.md` now opens with `model: opus` and `effort: high` in its frontmatter, and `web-developer.md` is unchanged. Neither field touches skills, so nothing is installed or removed and no other agent is rewritten.

:::note[Doing this from the editor]
Both are words on the sub-agent's row in the roster, and clicking one cycles it. That's where you set them if you haven't installed yet — there's no `config.ts` to edit until the install runs, and the command the editor hands you carries both. [Setting it from the editor](#setting-it-from-the-editor) below has the two differences worth knowing.
:::

## The permitted values

| Field    | Values                                        |
| -------- | --------------------------------------------- |
| `model`  | `sonnet`, `opus`, `haiku`, `fable`, `inherit` |
| `effort` | `low`, `medium`, `high`, `xhigh`, `max`       |

Anything else fails the config load. The generated `config-types.ts` declares both unions verbatim, so your editor rejects a typo before the CLI ever sees it.

`inherit` is a real model value, not a way of writing "unset" — it tells Claude Code to use whatever model the parent session is running on. To mean "unset", leave the field out.

## Where the default comes from

Each sub-agent's own `metadata.yaml` names a model, and that's the value used when the config says nothing. Every sub-agent that ships names one, so an untouched roster compiles to real models rather than to a fallback.

Effort works the same way but has nothing to fall back to: no shipped sub-agent's metadata declares an `effort`. So unless you set one, the compiled agent carries no `effort:` line at all — the frontmatter omits it.

The one case where a default is invented is a model that neither side names, which the template writes as `model: inherit`.

## Precedence

**Config wins over metadata, silently.** The rule is one line: if the config names a `model`, it's used; otherwise the sub-agent's definition is. Effort resolves identically. There's no warning, because a value you wrote into `config.ts` on purpose isn't news on every compile.

| Config | Metadata | Compiled frontmatter |
| ------ | -------- | -------------------- |
| `opus` | `sonnet` | `model: opus`        |
| —      | `sonnet` | `model: sonnet`      |
| `opus` | —        | `model: opus`        |
| —      | —        | `model: inherit`     |

The override lives on the sub-agent, not on its skills — so a sub-agent with no `stack` entry at all still carries whatever model and effort you gave it.

## Setting it from the editor

The editor's roster shows each sub-agent's model and effort as words on its row. Click either one to cycle to the next value; there's no menu, because at four and five values a second click costs less than one. An effort you've moved off its resting value is drawn in the accent color, so a customized row is visible at a glance.

Two differences from hand-editing are worth knowing:

- **The editor offers four models** — `opus`, `fable`, `sonnet` and `haiku`. `inherit` isn't among them, because the shared-configuration format has no word for it.
- **Every sub-agent rests at `medium` effort** in the editor, since no sub-agent's metadata names one to rest on.

Install what you built with `npx agents-inc init --from <id>`, and the model and effort you set land on the matching `AgentScopeConfig` entries. See [Install and share](/docs/editor/install-and-share).

**On a directory that's already installed the command is `edit --from`, not `init --from`.** `init --from` refuses one and names the path — installing a shared configuration is a fresh setup rather than a merge. So the round trip for a setup you already have is `npx agents-inc edit --ui` out to the browser, which publishes this installation and opens it there, and `npx agents-inc edit --from <id>` back. The Install dialog only ever hands you the `init` form, because nothing in the browser knows whether you've installed.

**A config pinning `model: 'inherit'` can't be shared.** Both `npx agents-inc share` and `edit --ui` mint an id from the same reader, and both refuse it, naming the sub-agent: the shared format has no `inherit`, and dropping the field would say "keep the sub-agent's own metadata", which is a different instruction. Change the value or leave the field out.

## Branding

`branding` is one field — a name — and it white-labels the CLI:

<!-- prettier-ignore -->
```typescript
export default {
  name: 'my-project',
  agents,
  skills,
  branding: { name: 'Acme Dev Tools' },
} satisfies ProjectConfig
```

The default is `Agents Inc.`

**What it visibly changes**: the header `eject`, `doctor` and `uninstall` print; `uninstall`'s "not installed here" and "has been uninstalled" lines; and `init`'s success line and dashboard title.

**What it deliberately doesn't change**: the ASCII logo, and the first line of `--help`. The mark is the product's rather than the installation's, so it isn't brandable. That's a decision, not an omission.

**Branding resolves per field, not per file.** Every other setting — `marketplace`, `author` — resolves per file: if a project config exists at all, its values win and the global one isn't consulted. Branding doesn't work that way. A project that says nothing about branding inherits the global name, and only falls through to `Agents Inc.` when neither file names one. Read per file, a name you set globally would vanish the moment any project config existed, which is every installed project.

An unreadable config doesn't fail a command over branding — the name falls back to the default and the command's own config reader reports the fault where you can act on it.

**One catch worth knowing before you write it.** The `ProjectConfig` interface in the generated `config-types.ts` doesn't declare `branding`, so `satisfies ProjectConfig` reports it as an unexpected property even though the CLI reads and honors it. The error is the generated type file being narrower than the loader, not a refusal. The same applies to the five path overrides — see [Scopes and paths](/docs/configuration/scopes-and-paths#the-five-path-overrides).
