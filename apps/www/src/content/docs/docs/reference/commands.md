---
title: Commands
description: Every command in the agents-inc CLI — purpose, invocation model, flag semantics and current gaps.
sidebar:
  order: 1
---

Every command available in the `agents-inc` CLI. Run `agents-inc <command> --help` for flag help; this doc is the fuller picture: purpose, invocation model, flag semantics, and current gaps.

> **Base flag (most commands):** `--source, -s <path|url>` — Skills source path or URL. Defined on `BaseCommand.baseFlags` and inherited by every command that doesn't override it. **Seven commands override `baseFlags` to `{}`** because `--source` has no meaning there: `doctor`, `build plugins`, `build marketplace`, `new skill`, `import skill`, `search`, `validate`.

## Command matrix

| Command                     | Purpose                                                                  | Interactive | Flags (excl. base)                                                                        |
| --------------------------- | ------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------- |
| `init`                      | First-time wizard: pick a stack, skills, agents, compile                 | Yes         | `--refresh`                                                                               |
| `edit`                      | Modify an existing installation via the wizard                           | Yes         | `--refresh`                                                                               |
| `compile`                   | Recompile agents from the current config                                 | No          | `--verbose`                                                                               |
| `update [skill]`            | Pull latest skill content from source (optionally one skill)             | Hybrid      | `--yes/-y`                                                                                |
| `search <query>`            | Read-only catalog search across all registered sources                   | No          | (none — no base)                                                                          |
| `eject <type>`              | Export partials / templates / skills / all for customization             | No          | `--force/-f`, `--output/-o`, `--refresh`                                                  |
| `new skill <name>` ⚠️       | Scaffold a local skill — **currently disabled** (feature flag)           | No          | `--author/-a`, `--category/-c`, `--domain/-d`, `--force/-f` _(no base)_                   |
| `new agent <name>` ⚠️       | Scaffold a local agent — **currently disabled** (feature flag)           | Yes         | `--purpose/-p`, `--force/-f`                                                              |
| `new marketplace <name>` ⚠️ | Scaffold a new skill marketplace — **currently disabled** (feature flag) | No          | `--force/-f`                                                                              |
| `import skill <source>`     | Import skills from a third-party GitHub repo                             | No          | `--skill/-n`, `--all/-a`, `--list/-l`, `--force/-f` _(no base)_                           |
| `build plugins`             | Compile skills/agents into distributable plugin bundles                  | No          | `--agents-dir/-a`, `--output-dir/-o`, `--skill`, `--verbose/-v` _(no base)_               |
| `build marketplace`         | Generate `marketplace.json` from built plugins + `package.json`          | No          | `--plugins-dir/-p`, `--output/-o`, `--verbose/-v` _(no base; reads id from package.json)_ |
| `doctor`                    | Diagnose installation, skills, agents, orphans                           | No          | (none — always verbose, no base)                                                          |
| `list`                      | Show installation mode, source, skills, agents                           | No          | (base only)                                                                               |
| `validate`                  | Validate registered sources, installed plugins, skills, agents           | No          | (none — no base)                                                                          |
| `uninstall`                 | Remove CLI-managed files and the `.claude-src/` config manifest          | Yes         | `--yes/-y`                                                                                |

Interactive = renders an Ink UI. Hybrid = interactive only when prompting for confirmation (`update`).

---

## Core

### `init`

**File:** [`src/cli/commands/init.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/init.tsx)

Greenfield setup. Detects if already installed (shows dashboard), otherwise opens the wizard: stack → sources → build → agents → confirm. Writes config and compiles agents.

**Flags:** `--refresh` (force remote source re-fetch), `--source` (override skills source).

**When to use:** First run on a machine, or first run inside a project that needs a project-scoped config.

**Global entries are read-only from a project.** If a global installation already exists, `init` inside a project routes to the dashboard (and from there to `edit`), where globally installed skills and agents are locked — see `edit` below.

---

### `edit`

**File:** [`src/cli/commands/edit.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/edit.tsx)

Re-enters the wizard with the current selections pre-loaded. Diff is shown at the confirm step. On confirm: re-copies locals, installs/uninstalls plugins, re-writes config, recompiles agents.

**Flags:** `--refresh`, `--source`.

**When to use:** Change skills, agents, scope, or mode after `init`.

**Global entries are read-only from a project.** Editing inside a project cannot remove a globally installed skill or agent — space is inert on those rows and the wizard shows `Global skills cannot be changed from project scope` (or `Global agents ...`). The global install is shared, so one project may not uninstall it for the others. Your options:

- **Don't hand the skill to this project's agents** — curate `stack` in `.claude-src/config.ts`. See [Editing Your Config](/docs/guides/editing-config).
- **Take project ownership** — press `s` on the row to add a project-scoped copy alongside the global install (the row shows `[P][G]`).
- **Really uninstall it** — run `npx agents-inc edit` from your home directory (`cd ~`), where the global config is the one being edited.

---

### `compile`

**File:** [`src/cli/commands/compile.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/compile.ts)

Re-runs the agent compiler using the persisted config. Non-interactive — safe in scripts and CI. Dual-pass (global + project) when both installations exist.

**Flags:** `--verbose`, `--source`.

**When to use:** After hand-editing `config.ts`, after a skill update, or when agents feel stale.

---

### `update [skill]`

**File:** [`src/cli/commands/update.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/update.tsx)

Pulls the latest skill content from the configured source. With no argument, updates every out-of-date skill after showing a diff and prompting for confirmation. With an argument, updates that one skill only. Always recompiles agents afterward (auto-recompile is the sensible default — users who want finer control can run `cc compile` separately).

After recompiling where it ran, it also recompiles the agents of every **other** registered project, printing `Recompiled agents in N registered projects`. Those projects' compiled agents were built from the same skill directories this command just rewrote, so without it they keep quoting content the source no longer has. Unreachable projects are warned and skipped; nothing here can fail the update.

**Flags:** `--yes/-y` (skip confirmation), `--source`.

**When to use:** Source marketplace has newer skill revisions than what's on disk.

---

### `search <query>`

**File:** [`src/cli/commands/search.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/search.ts)

Read-only catalog browse. Takes one required positional arg and zero flags. Searches every registered source (primary + extras) by `id`, `displayName`, `slug`, `description`, or `category`. Prints an `@oclif/table` with columns ID / Source / Category / Description.

**Flags:** (none — `static flags = {}`, `baseFlags = {}`).

**When to use:** See what skills are available before wiring them into config. For actually installing a skill, use `import skill` (ad-hoc GitHub repo) or the wizard (`init`/`edit`) to add it to your registered sources.

**Multi-source merge:** results include skills from the primary source (matrix) plus every registered extra (fetched via `giget`). Extras show their source name in the `Source` column so you can distinguish them at a glance.

---

## Customization

### `eject <type>`

**File:** [`src/cli/commands/eject.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/eject.ts)

Exports source material for user modification. Types: `agent-partials`, `templates`, `skills`, `all`.

**Flags:** `--force/-f`, `--output/-o` (default: `.claude/` in cwd), `--refresh`, `--source`.

---

### `new skill <name>` ⚠️ disabled

**File:** [`src/cli/commands/new/skill.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/new/skill.ts)

**Currently disabled behind `FEATURE_FLAGS.NEW_SKILL_COMMAND` (default `false`)** while it is being improved. Running it exits non-zero with the message: The `new skill` command is currently disabled while being improved. The `scaffoldSkillFiles` library function is NOT gated — `new marketplace` still calls it internally to create its starter skill.

**Why disabled:** post-install the custom skill tries to install as a marketplace plugin and fails (marketplace lookup 404s), config-types regresses from the extend-global shape to a flat listing, and the scaffold command's completion message incorrectly tells users to run `cc compile` (which is a no-op for newly scaffolded skills).

**Behavior when the flag is flipped back on:** scaffolds a `SKILL.md` + `metadata.yaml` in the detected local marketplace (or `.claude/skills/` when not in one). Always sets `custom: true`. Core logic lives in the exported `scaffoldSkillFiles` function, which is also called directly by `new marketplace` for its starter skill. Author resolves via `resolveAuthorOrDefault` (checks user config).

**Flags (when enabled):** `--author/-a`, `--category/-c`, `--domain/-d`, `--force/-f`. Does not inherit `--source` (scaffolding doesn't consume a source).

---

### `new agent <name>` ⚠️ disabled

**File:** [`src/cli/commands/new/agent.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/new/agent.tsx)

**Currently disabled behind `FEATURE_FLAGS.NEW_AGENT_COMMAND` (default `false`)** while it is being improved. Running it exits non-zero with the message: The `new agent` command is currently disabled while being improved.

**Why disabled:** the command fails immediately for any user whose install doesn't pre-include the `agent-summoner` meta-agent. `new agent` drives Claude via that meta-agent, and the lookup falls back only to a user-registered source. If neither place has it, the command errors with a misleading `"Run 'compile' first"` hint. The remaining gaps are the bundled fallback, the output path, install wiring, and a config-types regression.

**Behavior when the flag is flipped back on:** scaffolds a custom agent under `<projectDir>/.claude/agents/_custom/`. Prompts interactively for purpose unless `--purpose` is provided, then drives Claude (via the `claude` CLI) to draft the agent's identity/playbook/output partials.

**Flags (when enabled):** `--purpose/-p`, `--force/-f`, `--source` (inherited).

**Requires (when enabled):** Anthropic's `claude` CLI on `$PATH` **and** `agent-summoner` resolvable either locally (in `<projectDir>/.claude/agents/`) or in the registered source.

---

### `new marketplace <name>` ⚠️ disabled

**File:** [`src/cli/commands/new/marketplace.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/new/marketplace.ts)

**Currently disabled behind `FEATURE_FLAGS.NEW_MARKETPLACE_COMMAND` (default `false`)** while it is being improved. Running it exits non-zero with the message: The `new marketplace` command is currently disabled while being improved. The scaffold itself works; the problem is what happens when the scaffolded marketplace is later consumed via `cc init --source <that-marketplace>` — matrix composition has ~20 hardening gaps that make consumption unreliable (silent ID overwrites, orphaned custom skills, extras can't participate in relationships, schema drift, etc.). Scaffolding a marketplace today creates infrastructure built on a shaky foundation.

**Behavior when the flag is flipped back on:** creates a fresh marketplace directory with the three config TS files (`config/skill-categories.ts`, `config/skill-rules.ts`, `config/stacks.ts`), a `package.json`, a README, and a starter skill. The starter skill is scaffolded by calling `scaffoldSkillFiles` directly (not via `runCommand`) — author resolves via `resolveAuthorOrDefault(undefined, parentDir)`, consistent with `new skill`. `build marketplace` is then invoked automatically at the end to produce the initial `marketplace.json`.

**Flags (when enabled):** `--force/-f`, `--source` (inherited).

---

### `import skill <source>`

**File:** [`src/cli/commands/import/skill.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/import/skill.ts)

Imports skills from a GitHub repo (`github:owner/repo`, `owner/repo`, or URL). Skills dir is hardcoded to `skills/` (no longer a flag). Source fetches go through `giget` with default caching.

**Flags:** `--skill/-n`, `--all/-a`, `--list/-l`, `--force/-f`. Does not inherit `--source` (the positional arg is the source).

**Modes:** `--list` prints available skills; `--skill <name>` imports one; `--all` imports every skill in the repo. At least one must be provided.

---

## Build (distribution / authoring)

### `build plugins`

**File:** [`src/cli/commands/build/plugins.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/build/plugins.ts)

Compiles skills (and optionally agents) from a source tree into standalone Claude Code plugins. Used by marketplace authors. Skills dir is hardcoded to `src/skills/` (marketplace convention — no longer a flag).

**Flags:** `--agents-dir/-a`, `--output-dir/-o`, `--skill` (single-skill mode), `--verbose/-v`. Does not inherit `--source` (produces plugins from a source, doesn't consume one).

---

### `build marketplace`

**File:** [`src/cli/commands/build/marketplace.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/build/marketplace.ts)

Walks `--plugins-dir` and writes a `marketplace.json` describing every plugin. **Reads marketplace identity from `package.json` at cwd** — `name`, `version`, `description` are required fields; `author` is optional (warns when missing but continues).

The `author` field is parsed flexibly:

- String form `"Name <email>"` → `{ name, email }`
- String form `"Name <email> (url)"` (npm's official format, URL discarded) → `{ name, email }`
- String form `"<email>"` (email only, warns) → `{ name: "", email }`
- String form `"Name"` (no brackets, warns) → `{ name }`
- Object form `{ name, email?, url? }` (URL discarded) → passed through

The `MarketplaceIdentity` type is derived from `z.infer<typeof packageJsonSchema>` via `Pick` rather than redeclared.

**Flags:** `--plugins-dir/-p`, `--output/-o`, `--verbose/-v`. Does not inherit `--source`.

**Exit codes:** non-zero when `package.json` is missing at cwd, required fields fail schema validation, or any plugin fails to manifest.

---

## Diagnostics

### `doctor`

**File:** [`src/cli/commands/doctor.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/doctor.ts)

Runs health checks: config parse, skills resolved, agents compiled, orphans, installed skill files, source reachable. Exits non-zero if any check fails. No flags — details are always emitted (diagnostic commands shouldn't have a "hide info" mode).

**Per-check resilience:** each check runs inside a `safeCheck(kind, fn)` wrapper — a single throwing check produces a `status: "fail"` result with the error in `details`, rather than killing the whole run. Partial results always surface.

**`CheckKind` discriminator** (`"config" | "skills" | "agents" | "orphans" | "installed" | "source"`) tags every `CheckResult`. `formatTips()` keys remediation hints off `kind`, not message substring — renaming a message can't silently lose a tip.

**Check ordering:** the source reachability check runs first (its side effect populates the global matrix used by later checks). If the source fails, `checkSkillsResolved` is marked **skipped** rather than run against an empty matrix — avoids misleading "all skills missing" reports.

**Flags:** (none — `static flags = {}`). `doctor` overrides `baseFlags` to `{}`, so it does not accept `--source`.

---

### `list`

**File:** [`src/cli/commands/list.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/list.tsx)

Prints the installation's mode, source, and a scope-grouped skill/agent summary. Ink component when TTY; plain text fallback otherwise.

**Flags:** `--source` (base only).

---

### `validate`

**File:** [`src/cli/commands/validate.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/validate.ts)

Takes no arguments. Runs four validation passes over everything the CLI knows about, aggregates the results into one summary line, and exits non-zero if any pass produced an error.

**Passes (in order):**

1. **Sources** — every source from `resolveAllSources(projectDir)` (primary + extras). Uses `validateSource`, which internally runs six sub-passes over a source tree:
   - **Skills** (`src/skills/**/metadata.yaml` + `SKILL.md`) — schema + pairing + displayName/dirname consistency + snake_case detection
   - **Matrix cross-references** — `checkMatrixHealth` confirms `requires` / `conflictsWith` IDs resolve. Unresolved slugs (a skill's relationship references a slug not in the same source) emit via `warn()` → stderr, always visible.
   - **Stacks** — `src/stacks/*/config.yaml` against `stackConfigValidationSchema`, plus `src/stacks/**/skills/**/metadata.yaml` against `metadataValidationSchema`
   - **Source-side agents** — `src/agents/**/metadata.yaml` against `agentYamlGenerationSchema`
   - **TS config exports** — runtime-loads `config/skill-categories.ts`, `skill-rules.ts`, `stacks.ts` via `loadConfig` and Zod-checks each default export
   - Each sub-pass skips absent targets without error (source shape is flexible — a skills-only source is valid).

   **Remote sources** (`github:owner/repo`, `http(s)://…`, etc.) are skipped with a `— skipped (remote source)` row; only local paths are walked, since the user isn't the author of remote ones.

2. **Plugins** — `~/.claude/plugins/` and `<project>/.claude/plugins/`. Uses `validatePlugin` / `validateAllPlugins`.
3. **Installed skills** — `~/.claude/skills/` and `<project>/.claude/skills/`. Checks each skill has `SKILL.md` + valid `metadata.yaml` against the strict schema (`customMetadataValidationSchema` for `custom: true` entries).
4. **Installed agents** — `~/.claude/agents/*.md` and `<project>/.claude/agents/*.md`. Checks frontmatter parses and required fields are present; enforces kebab-case on `name`.

**Dedup:** when `cwd === $HOME`, the global and project paths resolve to the same directory; the project pass is skipped across **all three** installed-directory passes (plugins, skills, agents) to avoid double-validation. `inHome` is computed once via `fs.realpathSync` on both sides, so macOS symlinked `$HOME` no longer misses the collision.

**Flags:** (none — `static flags = {}`, `static baseFlags = {}`). Zero-arg, zero-flag.

**Exit codes:** `EXIT_CODES.ERROR` if any pass produced an error; `EXIT_CODES.SUCCESS` otherwise. Warnings are reported but non-fatal.

**Sample output:**

```
Validating sources
  primary                        github:agents-inc/skills                 — skipped (remote source)
  extras/local-marketplace       /home/me/my-skills                       152 skill(s), 0 error(s), 0 warning(s)

Validating plugins
  ~/.claude/plugins                                                       4 plugin(s), 0 invalid
  ~/project/.claude/plugins                                               — not present

Validating skills
  ~/.claude/skills                                                        12 skill(s), 0 invalid
  ~/project/.claude/skills                                                — none

Validating agents
  ~/.claude/agents                                                        4 agent(s), 0 invalid
  ~/project/.claude/agents                                                — not present

Result: 0 error(s), 0 warning(s)
```

**Constants (file-local, in `validate.ts`):** `COL_NAME_WIDTH`, `COL_URL_WIDTH`, `COL_PATH_WIDTH` for row alignment; `VALIDATE_STATUS.{SKIPPED_REMOTE, NOT_PRESENT, EMPTY, NO_PLUGINS}` for the dashed status markers. `displayDir()` renders absolute paths as `~/...` uniformly across all three installed-directory passes.

> Not to be confused with `doctor`, which validates the **installed state** coherence (orphans, config parse). `validate` is for checking content — sources, plugin bundles, and installed skill/agent files the CLI already knows about.

---

### `uninstall`

**File:** [`src/cli/commands/uninstall.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/uninstall.tsx)

Removes CLI-managed plugins, CLI-installed skills (matched by `forked-from` metadata), compiled agents, and the `.claude-src/` config manifest (`config.ts` + `config-types.ts`). Manifest removal is unconditional — there is no flag gating it (the former `--all` flag is removed). Empty `.claude/` and `.claude-src/` directories are cleaned up afterwards; user-created content is preserved. Also deregisters the project from the global config's project registry (best-effort). A global uninstall (run from the home directory) additionally updates each registered project's `config.ts`/`config-types.ts` to drop the removed global-scoped entries (best-effort — unreachable projects are warned and skipped).

**Flags:** `--yes/-y` (skip confirm), `--source` (base).

---

## Conventions across commands

- **Exit codes** from `EXIT_CODES`: `SUCCESS = 0`, `ERROR = 1`, `CANCELLED = 2`, `INVALID_ARGS = 2`. Every `this.error()` call passes an explicit code.
- **Base flag `--source`** is inherited by commands that consume a skills source. Seven commands override `baseFlags` to `{}`: `doctor`, `build plugins`, `build marketplace`, `new skill`, `import skill`, `search`, `validate`.
- **Interactive vs non-interactive TTY handling** — `update`, `list`, `new agent` degrade gracefully when `process.stdin.isTTY` is false.
- **`--refresh`** consistently means "ignore cache and fetch from remote". Used only by commands that legitimately re-fetch a source (`init`, `edit`, `update`, `eject`).
- **`--force/-f`** normalized to `"Overwrite existing {noun}"` across scaffolding commands (`new skill`, `new agent`, `new marketplace`, `import skill`).
- **`--verbose/-v`** retained only on `compile`, `build plugins`, `build marketplace`. `doctor` and `validate` always emit full detail (diagnostic commands shouldn't have a hide-info toggle). `search` prints a table, no verbosity levels.

