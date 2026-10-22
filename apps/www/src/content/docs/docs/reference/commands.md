---
title: Commands
description: Every command in the agents-inc CLI — purpose, invocation model, flag semantics and current gaps.
sidebar:
  order: 1
---

Every command available in the `agents-inc` CLI. Run `agents-inc <command> --help` for flag help; this doc is the fuller picture: purpose, invocation model, flag semantics, and current gaps.

> **`--provider <claude|codex>` names an installation, and only where the disk cannot.** An installation belongs to one provider and the folder is what records it — `.agents-inc/claude/` or `.agents-inc/codex/` — so no command needs the flag to find out. Two cases survive that, and both are the absence of a folder rather than a doubt about one. `init --from <id> --provider codex` creates a folder that does not exist yet, which is the flag's whole purpose and why it is meaningless without `--from`: pass it alone and `init` exits `INVALID_ARGS`, naming `--from` and the editor. And when one scope holds an installation of **each** provider, `edit`, `uninstall`, `share`, `eject`, `compile` and `update` refuse rather than pick, naming both and asking for the flag. `doctor` reports the same state instead of refusing, because that is the state you most need to be able to look at, and `list` names both installations above the one it is showing. See [Claude or Codex](/docs/configuration/providers).

> **`--marketplace, -m <path|url>` belongs to `init` alone.** Naming a marketplace is an install-time decision, so `init` declares the flag and no other command accepts it — passing it elsewhere is a parse error. Every later command resolves the marketplace that install recorded: the project's `config.ts`, then the global one, then the default. `CC_MARKETPLACE` is the same choice made without typing it, and is read at install time only.

## Command matrix

| Command                  | Purpose                                                          | Interactive | Flags                                                           |
| ------------------------ | ---------------------------------------------------------------- | ----------- | --------------------------------------------------------------- |
| `init`                   | Open the editor, or install a configuration by id with `--from`  | Yes         | `--marketplace/-m`, `--from <id>`, `--ui`, `--provider`         |
| `edit`                   | Open this installation in the editor; `--from` applies an id     | Yes         | `--ui`, `--from <id>`, `--provider`                             |
| `compile`                | Recompile agents from the current config                         | No          | `--verbose/-v`, `--provider`                                    |
| `update`                 | Refresh the marketplaces this installation uses                  | No          | `--provider`                                                    |
| `search <query>`         | Read-only search of the marketplace and the local skills on disk | No          | (none — no base)                                                |
| `share`                  | Mint this installation as an id anyone can install               | No          | `--stdin`, `--provider`                                         |
| `eject <type>`           | Export partials / templates / skills / all for customization     | No          | `--force/-f`, `--output/-o`, `--provider`                       |
| `new marketplace <name>` | Scaffold a marketplace of your own into a new directory          | No          | (none)                                                          |
| `build plugins`          | Compile skills/agents into distributable plugin bundles          | No          | `--agents-dir/-a`, `--output-dir/-o`, `--skill`, `--verbose/-v` |
| `build marketplace`      | Generate `marketplace.json` from built plugins + `package.json`  | No          | `--name`, `--plugins-dir/-p`, `--output/-o`, `--verbose/-v`     |
| `doctor`                 | Validate content, then diagnose installation, agents, orphans    | No          | (none — always verbose)                                         |
| `list` (alias `ls`)      | Show installation mode, source, skills, agents                   | Yes         | `--provider`                                                    |
| `uninstall`              | Remove CLI-managed files and the source folder's config manifest | Yes         | `--yes/-y`, `--provider`                                        |

**This table is the roster, and it is checked.** `apps/www/scripts/check-cli-claims.ts` binds it to `packages/cli/src/cli/commands/**` — oclif's `commands.strategy` is `pattern`, so a module under that tree _is_ a command and a command is nothing else — and to each command's `static flags`. A row for a command that no longer exists, a command with no row, and a Flags cell that has fallen behind all fail the site's `test` script. The two stock oclif commands, `help` and `autocomplete`, come from plugins rather than from that tree and are deliberately out of scope here.

Interactive = renders an Ink UI.

---

## Core

### `init`

**File:** [`src/cli/commands/init.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/init.tsx)

A bare `init` opens agentsinc.sh/editor where nothing is installed, and over an installation shows its dashboard: Edit in the web editor, Compile, Doctor, List.

**Flags:** `--marketplace/-m` (beside `--from`, install from this marketplace instead of the one the configuration names; alone, open the editor and say how to add it there), `--from <id>` (install a configuration shared from the web editor), `--ui` (open the editor on the catalogue, or on the id `--from` names), `--provider <claude|codex>` (which provider this run installs for — only meaningful beside `--from`, and the default is Claude).

**`--provider` names a location, not a feature.** It decides one thing: which folder this run creates, and therefore which host's directories the install writes into, which renderer compiles the sub-agents, and which placements are offered. It writes nothing down — after the install, the folder is the record. `--provider claude` is the control that proves it: naming the default out loud installs byte-for-byte what no flag installs. `--provider codex` over an existing Claude installation creates a second installation beside it rather than being refused; from then on the commands that change something ask which one you mean. [Claude or Codex](/docs/configuration/providers) is what each provider can and cannot do.

**When to use:** First run on a machine, or first run inside a project that needs a project-scoped config.

**`--from <id>` is the web editor's other half.** The editor cannot write to your `.claude/`, so it hands you a short id and this flag does the install: the CLI fetches that configuration, maps it onto the current catalogue, lists what goes into the project and what into the global install, and asks before writing. It needs no terminal, so it works over a pipe and in CI, where it prints the same lists and carries on. It is greenfield-only: in an already-installed directory it does not divert to the dashboard, it refuses before fetching anything and tells you to `uninstall` first or apply the id with `edit --from`, because a shared configuration replaces a stack wholesale — installing one is a fresh setup, not a merge. A global installation above the project is not in the way: the run adds what it lacks and leaves what it holds. A payload that assigns a project-scoped skill to a sub-agent resting at global scope — an assignment the config has nowhere to write — is refused with every such pair named, so a single re-share (each named agent pinned to the project, or each named skill moved to global scope) can fix them all. Skills or sub-agents this catalogue no longer knows are named and skipped rather than failing the run. Shipped in 0.149.0; see [CLI or web](/docs/cli-or-web).

**`--ui` opens the editor on nothing** — what a bare `init` does where nothing is installed, without the dashboard where something is. `edit --ui` carries the installation in this directory across; this is the bare address, and the browser starts from the catalogue. The way back is the line printed under the link: `init --from <id>` installs what you build, or, where this directory already holds an installation, `edit --from <id>` applies it. A config too broken to load cannot stop you reaching the editor. The address is printed before any browser is opened, which is what keeps the flag usable over a pipe, in CI and on a machine with no desktop session; a browser that will not launch is a warning beside a link that still works. Passing `--ui` with `--from` opens **that id** rather than the catalogue — the same rule `edit` follows, and what turns a shared id into something you can look at before you install it. Nothing is minted and nothing is fetched on that path: the id already is a stored configuration, so this is only a link.

---

### `edit`

**File:** [`src/cli/commands/edit.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/edit.tsx)

A bare `edit` does what `edit --ui` does.

**Flags:** `--ui`, `--from <id>`, `--provider` (which installation to edit, where this scope holds one of each — it selects, it never converts). **`--ui` opens whatever `--from` names** — so `edit --ui` opens the installation in this directory, and `edit --ui --from <id>` opens that shared id instead. They were mutually exclusive until 2026-08-24, on the reading that they were opposite directions of one round trip; opening an id is neither direction, and the pairing is what lets someone LOOK at a configuration before applying it. The paired form needs no installation here at all, because opening an id in a browser reads nothing local. There is no marketplace flag: `edit` cannot be pointed somewhere else, because a roster edited against one marketplace and recorded against another is the mixed-source state the config has no way to describe.

**`--ui` hands this installation to the browser.** It reads the installed skills, sub-agents and per-agent curation, mints them as a configuration the store holds — the same mint `share` performs, from the same reader, so the two commands give one directory one id — prints the id with both destinations, and then opens `agentsinc.sh/editor/?fromId=<id>` if there is a terminal to have a browser. It refuses before minting if an installed skill's `metadata.yaml` is unusable, because the editor opens on what those files describe. Nothing on disk is touched: a run that changed anything here would be editing the project on the way to offering to edit it. Over a pipe or in CI the link is printed and nothing is opened, which is why the print comes first.

**`--from <id>` applies one back, and is destructive.** Unlike `init --from`, this runs against an existing installation, and a shared configuration states a whole roster — so whatever it leaves out is removed. That is why it confirms before writing, with every removal named, and refuses where there is no terminal to confirm at. Two things it will not silently drop are disclosed instead of acted on: a skill authored in this installation, which no configuration ever carried, and a skill this catalogue cannot place. Both are kept and reported, because an apply that quietly left them behind is how somebody ends up with a skill they never picked and no way to tell why.

**When to use:** Change skills, agents, scope, or mode after `init`.

**Global entries are read-only from a project.** Editing inside a project cannot remove a globally installed skill or agent. The global install is shared, so one project may not uninstall it for the others. Your options:

- **Don't hand the skill to this project's agents** — curate `stack` in `.agents-inc/claude/config.ts`. See [Editing Your Config](/docs/guides/editing-config).
- **Really uninstall it** — from your home directory (`cd ~`), where the global config is the one being edited: `npx agents-inc edit` opens it in the editor, and `npx agents-inc edit --from <id>` applies what you removed there.

---

### `compile`

**File:** [`src/cli/commands/compile.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/compile.ts)

Re-runs the agent compiler using the persisted config. Non-interactive — safe in scripts and CI. One scope per run: inside a project it compiles that project's sub-agents and no others, and the global pass is reached only where there's no project installation. To rebuild global sub-agents, run it from your home directory.

**Flags:** `--verbose/-v`, `--provider` (which installation to compile, where this scope holds one of each). The source comes from the config being recompiled.

**It refuses rather than guessing which installation it is about.** A scope can hold a Claude installation and a Codex one, and where it does, a run with no `--provider` raises the same refusal `edit`, `uninstall`, `share` and `eject` do — exit 2, naming both providers and the flag.

**When to use:** After hand-editing `config.ts`, after a skill update, or when agents feel stale.

---

### `update`

**File:** [`src/cli/commands/update.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/update.ts)

Wraps the provider's own marketplace refresh. It reads the marketplaces this installation's config actually names — the distinct non-`eject` `origin` values on its active skill entries — and runs `claude plugin marketplace update` for each, in sequence. On a Codex installation a git marketplace gets `codex plugin marketplace upgrade`, and a local one — which `upgrade` refuses — gets `codex plugin add` again over each plugin installed from it. Nothing else happens: no source is loaded, no content is compared, nothing in the installation is rewritten, and no agent is recompiled, because a sub-agent references a plugin skill by pointer rather than by inlining it.

**Ejected skills are never touched.** Eject means you own the copy and may have edited it, so overwriting it from the source would discard your work. The command says so in one line and moves on. An eject-only installation therefore succeeds, printing that line and a note that no plugin marketplaces are configured — it does not need the provider's CLI at all, and does not fail without it.

A configured marketplace does need the provider's CLI — `claude`, or `codex`: without it the run stops with an error naming it. A marketplace the CLI cannot refresh is warned individually with its cause, and the run then exits non-zero naming every marketplace that failed.

**Args:** none. **Flags:** `--provider` (which installation to refresh, where this scope holds one of each).

**It refuses rather than guessing which installation it is about**, for `compile`'s reason and in the same words: the marketplaces it refreshes are the ones one config names, and a scope holding two installations has two answers.

**When to use:** You want the marketplaces you install plugin skills from brought up to date.

---

### `search <query>`

**File:** [`src/cli/commands/search.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/search.ts)

Read-only catalog browse. Takes one required positional arg and zero flags. Searches the marketplace this installation reads, plus the local skills already on disk, by `id`, `displayName`, `slug`, `description`, or `category`. Prints an `@oclif/table` with columns ID / Name / Origin / Category / Description.

**Flags:** none (`static flags = {}`).

**When to use:** See what skills are available before wiring them into config.

---

### `share`

**File:** [`src/cli/commands/share.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/share.ts)

The other direction of the round trip [CLI or web](/docs/cli-or-web) describes. It reads the skills, sub-agents and per-agent curation installed here, publishes them to the `agentsinc.sh` store as one configuration, and prints the id it was given along with both things anyone can do with it: `init --from <id>` to install it elsewhere, and `agentsinc.sh/editor/?fromId=<id>` to open it in the editor.

**Flags:** `--stdin` (share a configuration piped in on standard input instead of the one installed here), `--provider` (which installation to read, where this scope holds one of each).

**`--stdin` publishes a configuration you HOLD, and reads no installation.** It exists for a producer that is not this CLI — the `meta-config-stack-detect` skill walks a repository and emits a configuration it is forbidden to write or apply — and an id is the only way into the editor, which opens `?fromId=` and nothing else. The distinction from a bare `share` is not cosmetic: without the flag, `share` resolves an installation the way every command does, this project then the global one, so sharing a piped configuration from an empty directory would publish whatever the machine has installed. Everything that can fail locally fails before anything is published — an empty pipe, text that is not JSON, and JSON this store will not accept are three different mistakes and each says which. Publishing from the CLI rather than from the producer is what keeps the wire version, the API address and the caller's identity in the one place that owns them.

**The id is the configuration's own hash**, so sharing an unchanged installation returns the id it already had — running it twice does not mint two.

**A skill you wrote by hand into `.claude/skills/` does not travel, and is not refused either.** Ownership is decided by the `forkedFrom` key the CLI stamps into every directory it writes. A directory that exists and carries no such key is somebody's own work, so it is simply outside the round trip, and the `stack` rows naming it go with it. `edit --from` reads the same judgement from the same place, which is why a payload that never mentioned your skill is not read as an instruction to delete it.

**Args:** none.

Everything that can fail locally fails before the write: an installation that cannot be read, one holding ejected skills — a share carries plugins only — or a selection the payload contract cannot express, stops the run without spending a write on a configuration nobody could install.

**When to use:** You want to hand this installation to someone else, to another machine, or to the editor.

---

## Customization

### `eject <type>`

**File:** [`src/cli/commands/eject.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/eject.ts)

Exports source material for user modification. Types: `agent-partials`, `templates`, `skills`, `all`.

**Flags:** `--force/-f`, `--output/-o`, `--provider` (which installation to eject from, where this scope holds one of each). Each type has its own destination — partials to `agents/` in the source folder the installation is on, templates to `agents/_templates/` under that, skills to the host's skills folder (`.claude/skills/`, or on Codex `.agents/skills/` in a project and `$CODEX_HOME/skills/` globally). The source folder is `.agents-inc/claude/` or `.agents-inc/codex/`. `--output` has no default: it writes all of them into the one directory it names instead. It copies out of whatever source the installation reads and records that source in the config it may invent.

---

## Build (distribution / authoring)

### `new marketplace <name>`

**File:** [`src/cli/commands/new/marketplace.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/new/marketplace.ts)

Writes a whole marketplace into a new directory named after the marketplace: a `package.json` carrying its identity, the three config files (`skill-categories.ts`, `skill-rules.ts`, `stacks.ts`), and one example skill already named in the marketplace's own namespace. What it emits passes the CLI's own loader, so `doctor` is clean in the new directory before you have written anything. It scaffolds only — `build plugins` and `build marketplace` are what publish it. See [Creating a marketplace](/docs/guides/creating-a-marketplace).

**Args:** `name` (required). Kebab-case, and it becomes three things at once: the directory, the `package.json` name, and the prefix every skill id in the marketplace must carry.

**Flags:** none — in particular there is no `--force`. Both name rules `build marketplace` enforces are enforced here instead, because failing at creation beats failing at publish when the name is already on every id; and a target directory that already holds files is refused rather than merged into or overwritten, because a scaffold writes a whole tree and a flag that overwrites an author's own files is the destructive half of a silent fallback. Both ways out — another name, or emptying that directory — are one step.

**Reserved names:** `agents-inc`, `external`, `local` and `eject` are refused, the same four `build marketplace` refuses.

---

### `build plugins`

**File:** [`src/cli/commands/build/plugins.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/build/plugins.ts)

Compiles skills (and optionally agents) from a source tree into standalone Claude Code plugins. Used by marketplace authors. Skills dir is hardcoded to `src/skills/` (marketplace convention — no longer a flag).

**Flags:** `--agents-dir/-a`, `--output-dir/-o`, `--skill` (single-skill mode), `--verbose/-v`. No `--marketplace` (it produces plugins from a marketplace, it doesn't consume one).

---

### `build marketplace`

**File:** [`src/cli/commands/build/marketplace.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/build/marketplace.ts)

Walks `--plugins-dir` and writes a `marketplace.json` describing every plugin. **Reads marketplace identity from `package.json` at cwd** — `name`, `version`, `description` and an `author` with a name are required.

The `author` field is parsed flexibly:

- String form `"Name <email>"` → `{ name, email }`
- String form `"Name <email> (url)"` (npm's official format, URL discarded) → `{ name, email }`
- String form `"Name"` (no brackets, warns) → `{ name }`
- Object form `{ name, email?, url? }` (URL discarded) → passed through

The `MarketplaceIdentity` type is derived from `z.infer<typeof packageJsonSchema>` via `Pick` rather than redeclared.

**Flags:** `--name`, `--plugins-dir/-p`, `--output/-o`, `--verbose/-v`. No `--marketplace`.

`--name` overrides the marketplace name that would otherwise come from `package.json`'s `name`, and exists for one case: an npm scoped name like `@scope/pkg` is not a valid marketplace name. The override is checked for kebab-case and a bad value exits `INVALID_ARGS`. `version`, `description` and `author` still come from `package.json` either way.

---

## Diagnostics

### `doctor`

**File:** [`src/cli/commands/doctor.ts`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/doctor.ts)

The single "is everything OK?" command. It answers in two layers, and the order is the point: **content first**, then **operational state**. No flags — details are always emitted (diagnostic commands shouldn't have a "hide info" mode).

**Layer 1 — content checks.** Schema and file-level validation of what is on disk, each row carrying the file a reader has to open:

- **Config** — the installation's `config.ts`, validated first and alone, because every other row is read against it. The rows below that need it to know what to validate stand down when it cannot be read.
- **Marketplaces** — every registered _local_ marketplace via `validateSource`, plus the current directory when it is itself a marketplace repository (`isSourceRepo`) and no registered one already covers it. Remote marketplaces (`github:owner/repo`, `http(s)://…`) are recorded as `— skipped (remote)` rather than fetched, since the user is not their author.
- **Plugins** — `~/.claude/plugins/` and `<project>/.claude/plugins/` via `validatePlugin` / `validateAllPlugins`. Installs recorded in `installed_plugins.json` are validated at their recorded paths; the direct-children scan is the fallback.
- **Skills** — every directory under `~/.claude/skills/` and `<project>/.claude/skills/` that this CLI installed or a config names. Any other directory there is listed as `not installed by this CLI and named by no configuration here: not validated`. Each validated one needs `SKILL.md` plus a `metadata.yaml` that satisfies the strict schema. An over-length `cliDescription` is a warning, not an error.
- **Agents** — `~/.claude/agents/*.md` and `<project>/.claude/agents/*.md`: frontmatter parses, required fields present, `name` kebab-case.

**Layer 2 — operational checks**, printed in this order: `Config Valid`, `Layout` (one row per scope in play), `Placements Offered`, `Skills Resolved`, `Agents Compiled`, `No Orphans`, `Skills Installed`, `Plugins Installed`, `Marketplace Reachable`. Where one scope holds two installations, an `Installations` row comes first and fails, naming both, and those rows then print once per installation under `The <provider> installation`.

**A content error stands down only the rows that read what it is about.** A broken skill `metadata.yaml` skips `Skills Resolved` with `Skipped — this row would only restate the skill errors above`, and every other row still answers: an unresolved skill on top of a broken `metadata.yaml` is that error's cascade, not a second finding. The whole layer stands down in two cases alone — a `config.ts` that cannot be read, which prints `Skipped — fix the content errors above first`, and a marketplace repository with nothing installed, below.

**The orphan row when there is no configuration at all.** With a config, an orphan is a compiled agent file the config does not name — the next `compile` prunes it — or a skill directory carrying `forkedFrom` that the config does not name, and either is a warning. With no config on disk the question is settled rather than unanswerable: every skill directory carrying `forkedFrom` and every agent file carrying the compiler's marker is unowned, so the row names each one and reports an **error**. A file with neither is somebody's own and is not listed. Nothing repairs that state on its own — `compile` and `edit` refuse without a config — so the row's tip names both ways out: `init --from <id>` writes a configuration that can own them again, and `uninstall` removes them, compiled agents included, because it reads the same marks. A project with no config of its own is judged the same way in its own folders, even where it inherits the global one. A config that exists and cannot be read still skips the row: that is a content-layer finding, and it gates the whole operational layer.

**Marketplace-author context.** Run from a skills source repository with nothing installed, `doctor` validates the repository's own content and prints `Skipped — no installation here (marketplace repository)` for the operational layer. One command, two contexts. The skip requires the _absence_ of this directory's `config.ts` — a config file that exists but fails to load is a finding, not an absence, so it still reaches the operational layer.

**One aggregated exit code:** `EXIT_CODES.ERROR` when any check in either layer failed, `EXIT_CODES.SUCCESS` otherwise. Warnings are reported and non-fatal.

**Per-check resilience:** each check runs inside a `safeCheck(kind, fn)` wrapper — a single throwing check produces a `status: "fail"` result with the error in `details`, rather than killing the whole run. Partial results always surface.

**A `CheckKind` discriminator** tags every `CheckResult`. Two rows carry two kinds each, because one row can reach two states with different remedies: `config`/`config-empty`, and `orphans`/`orphans-unowned`. `formatTips()` keys remediation hints off `kind`, not message substring — renaming a message can't silently lose a tip.

**Check ordering within the operational layer:** the source reachability check runs before `Skills Resolved` — after `Config Valid`, `Layout` and `Placements Offered` — because its side effect populates the global matrix the later checks read, and its row is printed last. If the source fails, `checkSkillsResolved` is marked **skipped** rather than run against an empty matrix — avoids misleading "all skills missing" reports.

**Dedup:** when `cwd === $HOME` the global and project paths resolve to the same directory, so each installed-content directory is walked once instead of twice.

**Flags:** none (`static flags = {}`). Diagnostics run against the current project and the source it records.

**Sample output:**

```
Agents Inc. Doctor

  Checking configuration health...

  Content checks
    Config                  ✓  1 config validated
    Marketplaces            ✓  1 marketplace validated
                               - marketplace (/home/me/my-skills) — 238 skills
    Plugins                 ✓  No plugins to validate
    Skills                  ✗  2 skills: 1 error, 0 warnings
                               - [ERROR] ~/project/.claude/skills/web-framework-react: Missing metadata.yaml
    Agents                  ✓  1 agent validated

  Operational checks
    Config Valid            ✓  .agents-inc/claude/config.ts is valid
    Layout                  ✓  This project is on .agents-inc/claude/
    Placements Offered      ✓  Every configured skill is placeable
    Skills Resolved         –  Skipped — this row would only restate the skill errors above
    Agents Compiled         ✓  1/1 agents compiled
    No Orphans              ✓  No orphaned skills or agent files
    Skills Installed        ✓  2/2 eject-mode skills installed
    Plugins Installed       ✓  No plugin-mode skills configured
    Marketplace Reachable   ✓  Connected to local: /home/me/my-skills
                               238 skills available
                               Read /home/me/my-skills from disk — named by this project's configuration

  Summary: 12 passed, 0 warnings, 1 error
```

---

### `list` (alias `ls`)

**File:** [`src/cli/commands/list.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/list.tsx)

Prints the installation's mode, source, and a scope-grouped skill/agent summary. Ink component when TTY; plain text fallback otherwise.

**Where the scope holds two installations it says so.** It reports one of them — the provider is resolved off the folder, which answers by roster order — and prints a line above the report naming both and the flag that shows the other. It reports rather than refusing, for `doctor`'s reason: a read-only command that refused would leave you unable to look at either.

**`ls` is the same command, not a shorthand for a subset.** It is declared as an oclif alias, so `agents-inc ls` and `agents-inc list` resolve to one class and take the same flags. It is the only alias in the CLI.

**Flags:** `--provider` (which installation to show, where this scope holds one of each).

---

### `uninstall`

**File:** [`src/cli/commands/uninstall.tsx`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/src/cli/commands/uninstall.tsx)

Removes CLI-managed plugins, CLI-installed skills (matched by the `forkedFrom` key in their `metadata.yaml`), compiled agents (named by the config, or carrying the compiler's marker), and the config manifest (`config.ts` + `config-types.ts`) in the source folder the installation is on — `.agents-inc/<provider>/`. Manifest removal is unconditional — there is no flag gating it. An emptied `.claude/` and an emptied source folder are cleaned up afterwards; user-created content is preserved. Also deregisters the project from the global config's project registry (best-effort). A global uninstall (run from the home directory) additionally updates each registered project's `config.ts`/`config-types.ts` to drop the removed global-scoped entries (best-effort — unreachable projects are warned and skipped).

**Flags:** `--yes/-y` (skip confirm), `--provider` (which installation to remove, where this scope holds one of each). Removal is per installation: a Codex uninstall leaves a Claude one beside it untouched, and the counts it reports come from what was actually removed rather than from what was asked for. The `.agents-inc/` parent goes only once the last provider folder under it is gone and nothing else is in it.

---

## Conventions across commands

- **Exit codes** from `EXIT_CODES`: `SUCCESS = 0`, `ERROR = 1`, `INVALID_ARGS = 2`, `NETWORK_ERROR = 3`, `CANCELLED = 4`, `COMPLETED_WITH_FAILURES = 5` (only `init`, `edit` and `eject` end with it). Every `this.error()` call passes an explicit code.
- **`--marketplace` is `init`'s flag and nobody else's.** Naming a marketplace is an install-time decision; every later command resolves the stored one (project config → global config → default). The same rule governs the `CC_MARKETPLACE` environment variable, which is read at install time only.
- **Interactive vs non-interactive TTY handling** — `list` degrades gracefully when `process.stdin.isTTY` is false. `init --from`, `update`, `share` and `new marketplace` never need a terminal at all. `edit --ui` prints its link first and only then asks whether there is a terminal, so the id survives a pipe even though the browser cannot be opened.
- **There is no `--refresh`.** Every load revalidates its cache against the remote, so there is nothing to force. `update` is a different operation entirely: it asks the provider's own CLI to refresh each marketplace, and reads no skills source.
- **`--verbose/-v`** retained only on `compile`, `build plugins`, `build marketplace`. `doctor` always emits full detail (a diagnostic command shouldn't have a hide-info toggle). `search` prints a table, no verbosity levels.
