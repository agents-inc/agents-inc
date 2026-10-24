---
title: Config reference
description: Every field of every type that can appear in .agents-inc/claude/config.ts — ProjectConfig, SkillConfig, AgentScopeConfig, StackAgentConfig, BrandingConfig and SourceEntry — with what each one actually does.
sidebar:
  order: 2
---

This is the exhaustive list. Each type gets a table, and the fields whose behavior needs more than a table cell get a section below. If you're here to change something rather than to look it up, [Configuration](/docs/configuration) is the shorter path.

## Quick start

The smallest config that type-checks names itself and declares two empty arrays:

<!-- prettier-ignore -->
```typescript
import type { ProjectConfig } from './config-types'

export default {
  name: 'my-project',
  agents: [],
  skills: [],
} satisfies ProjectConfig
```

It declares nothing, so the CLI doesn't count it as an installation yet. Everything below is what you add to it.

## `ProjectConfig`

The default export. Three of its fields are required.

| Field             | Type                               | Required | What it does                                                                                                                                                               |
| ----------------- | ---------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`            | `string`                           | Yes      | The installation's name, which `list` prints. A project config never takes the global config's.                                                                            |
| `description`     | `string`                           | No       | Free text. Carried into a configuration you `share`; nothing in a compiled agent reads it.                                                                                 |
| `agents`          | `AgentScopeConfig[]`               | Yes      | The roster — which sub-agents this installation has, and at which scope. See [`AgentScopeConfig`](#agentscopeconfig).                                                      |
| `skills`          | `SkillConfig[]`                    | Yes      | The install manifest — which skills are installed, where, and how. See [`SkillConfig`](#skillconfig).                                                                      |
| `author`          | `string`                           | No       | Author handle, by convention `@handle`. Preserved across edits; nothing reads it back.                                                                                     |
| `stack`           | `Record<string, StackAgentConfig>` | No       | Which skills each sub-agent receives, keyed sub-agent → category. [The field you'll edit most](#stack-in-detail).                                                          |
| `marketplace`     | `string`                           | No       | The path or URL skills are fetched from. Defaults to `github:agents-inc/skills`. See [`marketplace` and its neighbor](#marketplace-and-its-neighbor).                      |
| `marketplaceName` | `string`                           | No       | The name that marketplace's own `marketplace.json` gives it. Plugin skills are registered under it.                                                                        |
| `selectedDomains` | `Domain[]`                         | No       | The domains this installation covers — derived from your skills by `init --from`. Omitted when empty.                                                                      |
| `branding`        | `BrandingConfig`                   | No       | The display name commands print. See [Models and effort](/docs/configuration/models-and-effort#branding).                                                                  |
| `skillsDir`       | `string`                           | No       | Where a **marketplace repository** keeps its skills. Default `src/skills`. See [Scopes and paths](/docs/configuration/scopes-and-paths#the-path-overrides).                |
| `stacksFile`      | `string`                           | No       | Where a **marketplace repository** keeps its stacks file. Default `config/stacks.ts`.                                                                                      |
| `categoriesFile`  | `string`                           | No       | Accepted, preserved, and never read. The categories file path is fixed.                                                                                                    |
| `rulesFile`       | `string`                           | No       | Accepted, preserved, and never read. The rules file path is fixed.                                                                                                         |
| `projects`        | `string[]`                         | No       | **Global config only.** The project directories the global installation propagates to. See [Scopes and paths](/docs/configuration/scopes-and-paths#the-projects-registry). |

**The loader is more forgiving than the table.** A config missing `name` gets the directory's name and a warning; one missing `skills` gets an empty array and a warning. A missing `agents` is defaulted to an empty array too, but silently. That leniency exists so a partly-written config still loads — it isn't an invitation to leave them out.

**Two renamed keys are refused rather than migrated.** A top-level `source` (now `marketplace`) or a skill entry's `source` (now `origin`) fails the load with the new name in the message. There's no fallback, and the CLI doesn't read the old key.

**There is no `provider` field, and there will not be one.** Which coding agent an installation is for is recorded by the folder this file sits in — `.agents-inc/claude/` or `.agents-inc/codex/` — and nowhere else. That is what lets one configuration, and one share id, install onto either provider. Copying a folder does not convert an installation, and a copied configuration that asks for a placement Codex does not offer is refused by name by `compile`, `edit`, `update` and `share`. See [Claude or Codex](/docs/configuration/providers).

## `SkillConfig`

One entry per installed skill. Emitted in the order `id, scope, origin, displayName, excluded`.

| Field         | Type                    | Required | What it does                                                                                                                       |
| ------------- | ----------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | `SkillId`               | Yes      | Which skill, e.g. `'web-framework-react'`. Also the directory name it installs into.                                               |
| `scope`       | `'project' \| 'global'` | Yes      | Which root it installs under — your project, or your home directory.                                                               |
| `origin`      | `string`                | Yes      | Where it came from. `'eject'` means a copy you own; anything else is a marketplace name. See [below](#origin-and-what-it-decides). |
| `displayName` | `string`                | No       | The name the skill's marketplace gave it when `init --from` or `edit --from` installed it.                                         |
| `excluded`    | `boolean`               | No       | A tombstone. See [`excluded`, and what a tombstone is](#excluded-and-what-a-tombstone-is).                                         |

## `AgentScopeConfig`

One entry per sub-agent in the roster. Emitted in the order `name, scope, model, codexModel, effort, excluded`.

| Field        | Type                                                                  | Required | What it does                                                                                                         |
| ------------ | --------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `name`       | `AgentName`                                                           | Yes      | Which sub-agent, e.g. `'web-developer'`. Also the compiled file's name.                                              |
| `scope`      | `'project' \| 'global'`                                               | Yes      | Which `.claude/agents/` directory the compiled Markdown lands in.                                                    |
| `model`      | `'sonnet' \| 'opus' \| 'haiku' \| 'fable' \| 'inherit'`               | No       | Overrides the model in the sub-agent's own metadata. See [Models and effort](/docs/configuration/models-and-effort). |
| `codexModel` | `'gpt-6-astra' \| 'gpt-5.6-sol' \| 'gpt-5.6-terra' \| 'gpt-5.6-luna'` | No       | The model a Codex role runs on; absent, the session's. Claude ignores it.                                            |
| `effort`     | `'low' \| 'medium' \| 'high' \| 'xhigh' \| 'max'`                     | No       | Overrides the reasoning effort in the sub-agent's own metadata.                                                      |
| `excluded`   | `boolean`                                                             | No       | A tombstone, exactly as on a skill. An excluded agent is filtered out before compilation.                            |

## `StackAgentConfig`

Not a field list — a record. One sub-agent's entry in `stack` maps category ids to the skills that sub-agent gets from each:

<!-- prettier-ignore -->
```typescript
'web-developer': {
  'web-framework': 'web-framework-react',
  'web-testing': ['web-testing-vitest', 'web-testing-react-testing-library'],
}
```

Each value is one or more **skill assignments**. An assignment is either a bare skill id or an object:

| Field       | Type      | Required                              | What it does                                                                                                     |
| ----------- | --------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`        | `SkillId` | Yes                                   | Which skill. The id is the identity; the category key is only where it's stored.                                 |
| `preloaded` | `boolean` | Required in the object form           | `true` lists the skill in the compiled agent's frontmatter `skills:`. Omit the object entirely and it's `false`. |
| `local`     | `boolean` | No, and the generated types reject it | Round-trips through the file. Nothing acts on it.                                                                |
| `path`      | `string`  | No, and the generated types reject it | Round-trips through the file. Nothing acts on it.                                                                |

The generated `config-types.ts` spells the assignment `S | { id: S; preloaded: boolean }` — so in the object form `preloaded` isn't optional, and `local` and `path` don't typecheck at all. The loader accepts all four; the type file is the narrower of the two.

## `BrandingConfig`

| Field  | Type     | Required | What it does                                                                                                                              |
| ------ | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `name` | `string` | No       | The name printed in command headers. Defaults to `Agents Inc.` — see [Models and effort](/docs/configuration/models-and-effort#branding). |

## `SourceEntry`

**Not a `ProjectConfig` field, and not something you write.** It's the shape the CLI mints internally when a command needs the marketplace as a described entry rather than a bare string — content validation, which `doctor` runs, is what reads it. Exactly one is ever minted, from whatever `marketplace` resolved to.

| Field         | Type     | Required | What it does                                     |
| ------------- | -------- | -------- | ------------------------------------------------ |
| `name`        | `string` | Yes      | Always the literal `marketplace`.                |
| `url`         | `string` | Yes      | The resolved marketplace path or URL.            |
| `description` | `string` | No       | Always the literal `Primary skills marketplace`. |
| `ref`         | `string` | No       | Declared on the type. Nothing populates it.      |

To change what a `SourceEntry` says, change `marketplace` on your config.

## `stack`, in detail

`stack` is keyed by sub-agent name, then by category id, and the leaf is one or more skill assignments. It's the only field that decides which skills a sub-agent actually receives — a skill in `skills` but absent from `stack` is installed and available, and no sub-agent is given it.

**Three write forms are accepted for a category's value.** A bare string, a single object, and an array all normalize to the same assignments on load:

<!-- prettier-ignore -->
```typescript
'web-framework': 'web-framework-react',                  // a bare id — the common case
'api-api': { id: 'api-framework-hono', preloaded: true }, // an object, when a flag is set
'web-testing': [                                         // an array, mixing the two
  'web-testing-vitest',
  { id: 'web-testing-react-testing-library', preloaded: true },
],
```

Write whichever reads best. What comes back out is normalized: an assignment carrying no flags is written back as a bare id, and `preloaded: false` is never emitted.

**Exclusive categories lose the array wrapper.** A category the catalog marks exclusive can hold only one skill, so it's written as the bare value rather than a one-element array — `'web-framework'` and `'api-api'` are exclusive; `'web-testing'` isn't. Putting two skills in an exclusive category fails the write rather than silently dropping one.

**The category key doesn't reach the compiled agent.** Each assignment becomes a line in the sub-agent's skill activation protocol, and the sentence on that line is the skill's own `usageGuidance` from its `metadata.yaml` — the words its author wrote about when to reach for it, not the key you filed it under. A locally written skill counts here too — its `metadata.yaml` is merged into the catalog on load, so the sentence you put in that field is the sentence the sub-agent reads. The key is read only where there's nothing to read: a skill that states no `usageGuidance` falls back to `Use when working with <category>.`

**Categories are re-keyed on load, and the id is what survives.** If a release moves a skill into a different category, your saved entry is moved with it rather than being orphaned — the id is identity, the category is storage. `compile --verbose` names the move: `Re-keyed stack entries to their live category`. A skill the catalog doesn't carry keeps whatever key you spelled.

## `origin`, and what it decides

`origin` is a skill's provenance, and it's the field that decides install mode:

| Value                              | What it means                                                               |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `'eject'`                          | The skill is a copy you own, in `.claude/skills/`.                          |
| anything else, e.g. `'agents-inc'` | The skill is installed as a Claude Code plugin under that marketplace name. |

The mode of the whole installation is derived from the set: all-eject is `eject`, all-plugin is `plugin`, a mix is `mixed`, and an empty `skills` array is `eject`. That derived mode is the one `npx agents-inc list` prints. Per skill, `origin` also decides how the compiled agent refers to it — a plugin skill is written as `<id>:<id>`, an ejected one as the bare id.

**Changing `origin` by hand doesn't move any files.** It relabels the manifest. Switch a skill between plugin and eject in the editor — `npx agents-inc edit` opens this installation there — and apply it with `npx agents-inc edit --from <id>`, which runs the install and removal. See [Install modes](/docs/concepts/install-modes).

## `excluded`, and what a tombstone is

`excluded: true` on a skill or agent entry is a tombstone: the entry stays in the file, and the thing it names is treated as not present. It exists for one case — a project masking a globally installed item that the project isn't allowed to uninstall. A `{ scope: 'global', excluded: true }` entry in a project config means "this project doesn't get it", while every other project keeps it.

**A tombstone is overruled by an active entry for the same id.** If a skill is tombstoned at global scope but also listed active at project scope, it isn't excluded — the project took its own copy.

For an agent, `excluded: true` removes it from compilation entirely.

## `marketplace` and its neighbor

Two fields sound alike and do different things:

| Field             | Holds                                           | Example                                       |
| ----------------- | ----------------------------------------------- | --------------------------------------------- |
| `marketplace`     | a **reference** — a path or a URL               | `github:agents-inc/skills`, `/home/me/skills` |
| `marketplaceName` | a **name** — what that marketplace calls itself | `agents-inc`                                  |

They can't be folded together: the name is only knowable once the marketplace has been fetched and its manifest read, so it's recorded separately after the fact. `marketplaceName` is what the plugin registry key is built from — `<skill-id>@<marketplace-name>` — which is why an install that never fetched a manifest doesn't have one.

**`marketplace` is resolved by precedence, not by this field alone**: `init --from` reads the `--marketplace` flag, then the marketplace the configuration names, then the `CC_MARKETPLACE` environment variable; every command then falls to the project config, the global config, and `github:agents-inc/skills`. A flag naming something that can't be a marketplace fails the run; a bad environment variable warns and falls through to the next rung.

**Accepted forms**: `github:`, `gh:`, `gitlab:`, `bitbucket:` and `sourcehut:` prefixes, `https://` and `http://` URLs, or a local directory path. Values are capped at 512 characters, and `..` traversal, private or reserved IP addresses, and URLs carrying a username or password are refused.

## Fields that are accepted but inert

These load, validate and survive a rewrite, and change nothing. They're listed here so you don't spend an afternoon on one:

| Field                               | Status                                                       |
| ----------------------------------- | ------------------------------------------------------------ |
| `categoriesFile`                    | Preserved and never read. The categories file path is fixed. |
| `rulesFile`                         | Preserved and never read. The rules file path is fixed.      |
| `author`                            | Preserved. Nothing reads it back.                            |
| `local` and `path` on an assignment | Round-trip only.                                             |

`description` is a near miss rather than a member: it has no effect on anything compiled, but it does travel with a configuration you `share`.
