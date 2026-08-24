---
title: Commands
description: Every command in the agents-inc CLI — purpose, invocation model, flag semantics and current gaps.
sidebar:
  order: 1
---

Every command available in the `agents-inc` CLI. Run `agents-inc <command> --help` for flag help; this doc is the fuller picture: purpose, invocation model, flag semantics, and current gaps.

> **`--marketplace, -m <path|url>` belongs to `init` alone.** Naming a marketplace is an install-time decision, so `init` declares the flag and no other command accepts it — passing it elsewhere is a parse error. Every later command resolves the marketplace that install recorded: the project's `.claude-src/config.ts`, then the global one, then the default. `CC_MARKETPLACE` is the same choice made without typing it, and is read at install time only.

## Command matrix

| Command                  | Purpose                                                         | Interactive | Flags                                                           |
| ------------------------ | --------------------------------------------------------------- | ----------- | --------------------------------------------------------------- |
| `init`                   | First-time wizard: pick a stack, skills, agents, compile        | Yes         | `--marketplace/-m`, `--from <id>`, `--ui`                       |
| `edit`                   | Modify an existing installation via the wizard                  | Yes         | `--ui`, `--from <id>`                                           |
| `compile`                | Recompile agents from the current config                        | No          | `--verbose/-v`                                                  |
| `update`                 | Refresh the marketplaces this installation uses                 | No          | (none — no base)                                                |
| `search <query>`         | Read-only catalog search across all registered sources          | No          | (none — no base)                                                |
| `share`                  | Mint this installation as an id anyone can install              | No          | `--stdin`                                                       |
| `eject <type>`           | Export partials / templates / skills / all for customization    | No          | `--force/-f`, `--output/-o`                                     |
| `new marketplace <name>` | Scaffold a marketplace of your own into a new directory         | No          | (none)                                                          |
| `build plugins`          | Compile skills/agents into distributable plugin bundles         | No          | `--agents-dir/-a`, `--output-dir/-o`, `--skill`, `--verbose/-v` |
| `build marketplace`      | Generate `marketplace.json` from built plugins + `package.json` | No          | `--name`, `--plugins-dir/-p`, `--output/-o`, `--verbose/-v`     |
| `doctor`                 | Validate content, then diagnose installation, agents, orphans   | No          | (none — always verbose)                                         |
| `list` (alias `ls`)      | Show installation mode, source, skills, agents                  | No          | (none)                                                          |
| `uninstall`              | Remove CLI-managed files and the `.claude-src/` config manifest | Yes         | `--yes/-y`                                                      |

**This table is the roster, and it is checked.** `apps/www/scripts/check-cli-claims.ts` binds it to `packages/cli/src/cli/commands/**` — oclif's `commands.strategy` is `pattern`, so a module under that tree _is_ a command and a command is nothing else — and to each command's `static flags`. A row for a command that no longer exists, a command with no row, and a Flags cell that has fallen behind all fail the site's `test` script. The two stock oclif commands, `help` and `autocomplete`, come from plugins rather than from that tree and are deliberately out of scope here.

Interactive = renders an Ink UI. Two exceptions are not visible in that column: `init --from <id>` installs a shared configuration without opening the wizard, and `edit --ui` hands the installation to the browser instead of opening one. Neither renders anything, and neither needs a terminal.

---

## Core

### `init`

**File:** [`src/cli/commands/init.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/init.tsx)

Greenfield setup. Detects if already installed (shows dashboard), otherwise opens the wizard. Writes config and compiles agents.

**The six wizard steps, in order:** stack → domains → build → sources → agents → confirm. `WIZARD_STEP_ORDER` in `src/cli/stores/wizard-store.ts` is the single source for that order, and [Quickstart](/docs/quickstart) walks each step in prose. Taking a stack's defaults without customising skips the middle steps.

**Flags:** `--marketplace/-m` (the marketplace this installation is made from, and the only command that takes it), `--from <id>` (install a configuration shared from the web editor, without the wizard), `--ui` (build this project's configuration in the browser instead).

**When to use:** First run on a machine, or first run inside a project that needs a project-scoped config.

**`--from <id>` is the web editor's other half.** The editor cannot write to your `.claude/`, so it hands you a short id and this flag does the install: the CLI fetches that configuration, maps it onto the current catalogue, and runs the same install pipeline the wizard feeds. It is headless — no Ink UI and no TTY required, so it works over a pipe and in CI — and it is greenfield-only: in an already-installed directory it does not divert to the dashboard, it refuses to run and tells you to `uninstall` first, because a shared configuration replaces a stack wholesale — installing one is a fresh setup, not a merge. Three situations draw that refusal: the directory already carries an installation (refused before the configuration is even fetched); the directory is clean but the payload carries global-scoped entries and your home directory is already installed (run `uninstall` there first); and a payload that assigns a project-scoped skill to a sub-agent resting at global scope — an assignment the config has nowhere to write — which is refused with every such pair named, so a single re-share (each named agent pinned to the project, or each named skill moved to global scope) can fix them all. Skills or sub-agents this catalogue no longer knows are named and skipped rather than failing the run. Shipped in 0.149.0; see [CLI or web](/docs/cli-or-web).

**`--ui` opens the editor instead, and it opens on nothing.** `edit --ui` carries the installation in this directory across, because there is one; here there is not, so this is the bare address and the browser starts from the catalogue. The way back is the way back from anywhere — build a configuration, share it, and install the id with `init --from <id>`. It reads no installation at all, so a config too broken to load cannot stop you reaching the editor. The address is printed before any browser is opened, which is what keeps the flag usable over a pipe, in CI and on a machine with no desktop session; a browser that will not launch is a warning beside a link that still works. Passing `--ui` with `--from` opens **that id** rather than the catalogue — the same rule `edit` follows, and what turns a shared id into something you can look at before you install it. Nothing is minted and nothing is fetched on that path: the id already is a stored configuration, so this is only a link.

**Global entries are read-only from a project.** If a global installation already exists, `init` inside a project routes to the dashboard (and from there to `edit`), where globally installed skills and agents are locked — see `edit` below.

---

### `edit`

**File:** [`src/cli/commands/edit.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/edit.tsx)

Re-enters the wizard with the current selections pre-loaded. Diff is shown at the confirm step. On confirm: re-copies locals, installs/uninstalls plugins, re-writes config, recompiles agents.

**Flags:** `--ui`, `--from <id>`. **`--ui` opens whatever `--from` names** — so `edit --ui` opens the installation in this directory, and `edit --ui --from <id>` opens that shared id instead. They were mutually exclusive until 2026-08-24, on the reading that they were opposite directions of one round trip; opening an id is neither direction, and the pairing is what lets someone LOOK at a configuration before applying it. The paired form needs no installation here at all, because opening an id in a browser reads nothing local. There is no marketplace flag: the wizard opens on the catalogue the installation's config names, and `edit` cannot be pointed somewhere else, because a roster edited against one marketplace and recorded against another is the mixed-source state the config has no way to describe.

**`--ui` hands this installation to the browser.** It reads the installed skills, sub-agents and per-agent curation, mints them as a configuration the store holds — the same mint `share` performs, from the same reader, so the two commands give one directory one id — prints the id with both destinations, and then opens `agentsinc.sh/?fromId=<id>` if there is a terminal to have a browser. Nothing on disk is touched: a run that changed anything here would be editing the project on the way to offering to edit it. Over a pipe or in CI the link is printed and nothing is opened, which is why the print comes first.

**`--from <id>` applies one back, and is destructive.** Unlike `init --from`, this runs against an existing installation, and a shared configuration states a whole roster — so whatever it leaves out is removed. That is why it confirms before writing, with every removal named. Two things it will not silently drop are disclosed instead of acted on: a skill authored in this installation, which no configuration ever carried, and a skill this catalogue cannot place. Both are kept and reported, because an apply that quietly left them behind is how somebody ends up with a skill they never picked and no way to tell why.

**When to use:** Change skills, agents, scope, or mode after `init`.

**Global entries are read-only from a project.** Editing inside a project cannot remove a globally installed skill or agent — space is inert on those rows and the wizard shows `Global skills cannot be changed from project scope` (or `Global agents ...`). The global install is shared, so one project may not uninstall it for the others. Your options:

- **Don't hand the skill to this project's agents** — curate `stack` in `.claude-src/config.ts`. See [Editing Your Config](/docs/guides/editing-config).
- **Take project ownership** — press `s` on the row to add a project-scoped copy alongside the global install (the row shows `[P][G]`).
- **Really uninstall it** — run `npx agents-inc edit` from your home directory (`cd ~`), where the global config is the one being edited.

---

### `compile`

**File:** [`src/cli/commands/compile.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/compile.ts)

Re-runs the agent compiler using the persisted config. Non-interactive — safe in scripts and CI. Dual-pass (global + project) when both installations exist.

**Flags:** `--verbose/-v`. The source comes from the config being recompiled.

**When to use:** After hand-editing `config.ts`, after a skill update, or when agents feel stale.

---

### `update`

**File:** [`src/cli/commands/update.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/update.ts)

Wraps Claude's own update. It reads the marketplaces this installation's config actually names — the distinct non-`eject` `source` values on its active skill entries — and runs `claude plugin marketplace update` for each, in sequence. Nothing else happens: no source is loaded, no content is compared, no file is rewritten, and no agent is recompiled, because a sub-agent references a plugin skill by pointer rather than by inlining it.

**Ejected skills are never touched.** Eject means you own the copy and may have edited it, so overwriting it from the source would discard your work. The command says so in one line and moves on. An eject-only installation therefore succeeds, printing that line and a note that no plugin marketplaces are configured — it does not need the Claude CLI at all, and does not fail without it.

A configured marketplace does need the Claude CLI: without it the run stops with an error naming it. A marketplace the CLI cannot refresh is warned individually with its cause, and the run then exits non-zero naming every marketplace that failed.

**Args:** none. **Flags:** none — `static flags = {}`.

**When to use:** You want the marketplaces you install plugin skills from brought up to date.

---

### `search <query>`

**File:** [`src/cli/commands/search.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/search.ts)

Read-only catalog browse. Takes one required positional arg and zero flags. Searches every registered source (primary + extras) by `id`, `displayName`, `slug`, `description`, or `category`. Prints an `@oclif/table` with columns ID / Source / Category / Description.

**Flags:** none (`static flags = {}`).

**When to use:** See what skills are available before wiring them into config. To actually install one, open the wizard (`init` / `edit`) and select it from a registered source.

**Multi-source merge:** results include skills from the primary source (matrix) plus every registered extra (fetched via `giget`). Extras show their source name in the `Source` column so you can distinguish them at a glance.

---

### `share`

**File:** [`src/cli/commands/share.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/share.ts)

The other direction of the round trip [CLI or web](/docs/cli-or-web) describes. It reads the skills, sub-agents and per-agent curation installed here, publishes them to the `agentsinc.sh` store as one configuration, and prints the id it was given along with both things anyone can do with it: `init --from <id>` to install it elsewhere, and `agentsinc.sh/?fromId=<id>` to open it in the editor.

**Flags:** `--stdin` (share a configuration piped in on standard input instead of the one installed here).

**`--stdin` publishes a configuration you HOLD, and reads no installation.** It exists for a producer that is not this CLI — the `meta-config-stack-detect` skill walks a repository and emits a configuration it is forbidden to write or apply — and an id is the only way into the editor, which opens `?fromId=` and nothing else. The distinction from a bare `share` is not cosmetic: without the flag, `share` resolves an installation the way every command does, this project then the global one, so sharing a piped configuration from an empty directory would publish whatever the machine has installed. Everything that can fail locally fails before anything is published — an empty pipe, text that is not JSON, and JSON this store will not accept are three different mistakes and each says which. Publishing from the CLI rather than from the producer is what keeps the wire version, the API address and the caller's identity in the one place that owns them.

**The id is the configuration's own hash**, so sharing an unchanged installation returns the id it already had — running it twice does not mint two.

**A skill you wrote by hand into `.claude/skills/` does not travel, and is not refused either.** Ownership is decided by the `forkedFrom` key the CLI stamps into every directory it writes — an ejected catalogue skill, or one a payload carried inline. A directory that exists and carries no such key is somebody's own work, so it is simply outside the round trip, and the `stack` rows naming it go with it. `edit --from` reads the same judgement from the same place, which is why a payload that never mentioned your skill is not read as an instruction to delete it.

**Args:** none. **Flags:** none.

Everything that can fail locally fails before the write: an installation that cannot be read, or a selection the payload contract cannot express, stops the run without spending a write on a configuration nobody could install.

`share` and `edit --ui` mint identically — same reader, same mapping, same refusals — and differ only in the ending. `share` prints the id; `edit --ui` opens it.

**When to use:** You configured in the terminal and want to hand the result to someone else, to another machine, or to the editor.

---

## Customization

### `eject <type>`

**File:** [`src/cli/commands/eject.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/eject.ts)

Exports source material for user modification. Types: `agent-partials`, `templates`, `skills`, `all`.

**Flags:** `--force/-f`, `--output/-o` (default: `.claude/` in cwd). It copies out of whatever source the installation reads and records that source in the config it may invent.

---

## Build (distribution / authoring)

### `new marketplace <name>`

**File:** [`src/cli/commands/new/marketplace.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/new/marketplace.ts)

Writes a whole marketplace into a new directory named after the marketplace: a `package.json` carrying its identity, the three config files (`skill-categories.ts`, `skill-rules.ts`, `stacks.ts`), and one example skill already named in the marketplace's own namespace. What it emits passes the CLI's own loader, so `doctor` is clean in the new directory before you have written anything. It scaffolds only — `build plugins` and `build marketplace` are what publish it. See [Creating a marketplace](/docs/guides/creating-a-marketplace).

**Args:** `name` (required). Kebab-case, and it becomes three things at once: the directory, the `package.json` name, and the prefix every skill id in the marketplace must carry.

**Flags:** none — in particular there is no `--force`. Both name rules `build marketplace` enforces are enforced here instead, because failing at creation beats failing at publish when the name is already on every id; and a target directory that already holds files is refused rather than merged into or overwritten, because a scaffold writes a whole tree and a flag that overwrites an author's own files is the destructive half of a silent fallback. Both ways out — another name, or emptying that directory — are one step.

**Reserved names:** `agents-inc`, `external` and `local` are refused, the same three `build marketplace` refuses.

---

### `build plugins`

**File:** [`src/cli/commands/build/plugins.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/build/plugins.ts)

Compiles skills (and optionally agents) from a source tree into standalone Claude Code plugins. Used by marketplace authors. Skills dir is hardcoded to `src/skills/` (marketplace convention — no longer a flag).

**Flags:** `--agents-dir/-a`, `--output-dir/-o`, `--skill` (single-skill mode), `--verbose/-v`. No `--marketplace` (it produces plugins from a marketplace, it doesn't consume one).

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

**Flags:** `--name`, `--plugins-dir/-p`, `--output/-o`, `--verbose/-v`. No `--marketplace`.

`--name` overrides the marketplace name that would otherwise come from `package.json`'s `name`, and exists for one case: an npm scoped name like `@scope/pkg` is not a valid marketplace name. The override is checked for kebab-case and a bad value exits `INVALID_ARGS`. `version`, `description` and `author` still come from `package.json` either way.

**Exit codes:** non-zero when `package.json` is missing at cwd, required fields fail schema validation, `--name` is not kebab-case, or any plugin fails to manifest.

---

## Diagnostics

### `doctor`

**File:** [`src/cli/commands/doctor.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/doctor.ts)

The single "is everything OK?" command. It answers in two layers, and the order is the point: **content first**, then **operational state**. No flags — details are always emitted (diagnostic commands shouldn't have a "hide info" mode).

**Layer 1 — content checks.** Schema and file-level validation of what is on disk, each row carrying the file a reader has to open:

- **Marketplaces** — every registered _local_ marketplace via `validateSource`, plus the current directory when it is itself a marketplace repository (`isSourceRepo`) and no registered one already covers it. Remote marketplaces (`github:owner/repo`, `http(s)://…`) are recorded as `— skipped (remote)` rather than fetched, since the user is not their author.
- **Plugins** — `~/.claude/plugins/` and `<project>/.claude/plugins/` via `validatePlugin` / `validateAllPlugins`. Installs recorded in `installed_plugins.json` are validated at their recorded paths; the direct-children scan is the fallback.
- **Skills** — every directory under `~/.claude/skills/` and `<project>/.claude/skills/`, whether or not a config references it. Each needs `SKILL.md` plus a `metadata.yaml` that satisfies the strict schema. An over-length `cliDescription` is a warning, not an error.
- **Agents** — `~/.claude/agents/*.md` and `<project>/.claude/agents/*.md`: frontmatter parses, required fields present, `name` kebab-case.

**Layer 2 — operational checks**, run **only when the content layer is clean**: config parse, skills resolved, agents compiled, orphaned agent files, installed skill files, plugin installs, source reachable. On content errors the layer prints `Skipped — fix the content errors above first` and nothing else: an unresolved skill or an uncompiled agent on top of a broken `metadata.yaml` is that error's cascade, not a second finding.

**The orphan row when there is no configuration at all.** With a config, an orphan is a compiled agent file the config does not name, and it is a warning — the next `compile` prunes it. With no config on disk the question is settled rather than unanswerable: every installed skill directory and compiled agent file is unowned, so the row names each one and reports an **error**. Nothing repairs that state on its own — `compile` and `edit` refuse without a config, and `uninstall` removes the installed skills but leaves compiled agents it can no longer identify — so the row's tip says both, where the missing-config tip beside it speaks only about the file. A config that exists and cannot be read still skips the row: that is a content-layer finding, and it gates the whole operational layer.

**Marketplace-author context.** Run from a skills source repository with nothing installed, `doctor` validates the repository's own content and prints `Skipped — no installation here (skills source repository)` for the operational layer. One command, two contexts. The skip requires the _absence_ of `.claude-src/config.ts` — a config file that exists but fails to load is a finding, not an absence, so it still reaches the operational layer.

**One aggregated exit code:** `EXIT_CODES.ERROR` when any check in either layer failed, `EXIT_CODES.SUCCESS` otherwise. Warnings are reported and non-fatal.

**Per-check resilience:** each check runs inside a `safeCheck(kind, fn)` wrapper — a single throwing check produces a `status: "fail"` result with the error in `details`, rather than killing the whole run. Partial results always surface.

**`CheckKind` discriminator** (`"config" | "config-empty" | "skills" | "agents" | "orphans" | "orphans-unowned" | "installed" | "plugins" | "source" | "content-config" | "content-sources" | "content-plugins" | "content-skills" | "content-agents"`) tags every `CheckResult`. Two rows carry two kinds each, because one row can reach two states with different remedies: `config`/`config-empty`, and `orphans`/`orphans-unowned`. `formatTips()` keys remediation hints off `kind`, not message substring — renaming a message can't silently lose a tip.

**Check ordering within the operational layer:** the source reachability check runs first (its side effect populates the global matrix used by later checks). If the source fails, `checkSkillsResolved` is marked **skipped** rather than run against an empty matrix — avoids misleading "all skills missing" reports.

**Dedup:** when `cwd === $HOME` the global and project paths resolve to the same directory, so each installed-content directory is walked once instead of twice.

**Flags:** none (`static flags = {}`). Diagnostics run against the current project and the source it records.

**Sample output:**

```
Agents Inc Doctor

  Checking configuration health...

  Content checks
    Marketplaces            ✓  1 marketplace validated
                           - marketplace (/home/me/my-skills) — 152 skills
    Plugins             ✓  4 plugins validated
    Skills              ✗  12 skills: 1 error, 0 warnings
                           - [ERROR] ~/.claude/skills/web-framework-react: Missing metadata.yaml
    Agents              ✓  4 agents validated

  Operational checks
    Skipped — fix the content errors above first

  Summary: 3 passed, 0 warnings, 1 error
```

---

### `list` (alias `ls`)

**File:** [`src/cli/commands/list.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/list.tsx)

Prints the installation's mode, source, and a scope-grouped skill/agent summary. Ink component when TTY; plain text fallback otherwise.

**`ls` is the same command, not a shorthand for a subset.** It is declared as an oclif alias, so `agents-inc ls` and `agents-inc list` resolve to one class and take the same (empty) flags. It is the only alias in the CLI.

**Flags:** none.

---

### `uninstall`

**File:** [`src/cli/commands/uninstall.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/uninstall.tsx)

Removes CLI-managed plugins, CLI-installed skills (matched by `forked-from` metadata), compiled agents, and the `.claude-src/` config manifest (`config.ts` + `config-types.ts`). Manifest removal is unconditional — there is no flag gating it (the former `--all` flag is removed). Empty `.claude/` and `.claude-src/` directories are cleaned up afterwards; user-created content is preserved. Also deregisters the project from the global config's project registry (best-effort). A global uninstall (run from the home directory) additionally updates each registered project's `config.ts`/`config-types.ts` to drop the removed global-scoped entries (best-effort — unreachable projects are warned and skipped).

**Flags:** `--yes/-y` (skip confirm).

---

## Conventions across commands

- **Exit codes** from `EXIT_CODES`: `SUCCESS = 0`, `ERROR = 1`, `INVALID_ARGS = 2`, `NETWORK_ERROR = 3`, `CANCELLED = 4`. Every `this.error()` call passes an explicit code.
- **`--marketplace` is `init`'s flag and nobody else's.** Naming a marketplace is an install-time decision; every later command resolves the stored one (project config → global config → default). The same rule governs the `CC_MARKETPLACE` environment variable, which is read at install time only.
- **Interactive vs non-interactive TTY handling** — `list` degrades gracefully when `process.stdin.isTTY` is false. `init --from`, `update`, `share` and `new marketplace` never need a terminal at all. `edit --ui` prints its link first and only then asks whether there is a terminal, so the id survives a pipe even though the browser cannot be opened.
- **There is no `--refresh`.** Every load revalidates its cache against the remote, so there is nothing to force. `update` is a different operation entirely: it asks the Claude CLI to refresh a marketplace, and reads no skills source.
- **`--verbose/-v`** retained only on `compile`, `build plugins`, `build marketplace`. `doctor` always emits full detail (a diagnostic command shouldn't have a hide-info toggle). `search` prints a table, no verbosity levels.
