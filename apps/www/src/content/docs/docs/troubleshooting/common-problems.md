---
title: Common problems
description: The CLI's real error messages, indexed by the text you'd paste into a search box, each with why it happens and the command that fixes it.
sidebar:
  order: 2
---

Every message below is quoted as the CLI prints it, because that's how most people arrive here. Find your line in the table, follow it to its section, and run what's there. If you don't have a message yet, [Troubleshooting](/docs/troubleshooting) starts with `npx agents-inc doctor` instead.

## Quick start

| Message or symptom                                                         | Likely cause                                                  | Fix                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Config at '…' could not be loaded`                                        | `config.ts` doesn't parse                                     | [Recreate it](#a-config-that-will-not-parse) — there's no repair           |
| `ConfigLoadError: Config at '…' could not be loaded`                       | the same fault, from `list`, which prints no remedy           | [Recreate it](#a-config-that-will-not-parse)                               |
| `Repository not found:` / `Network error fetching:`                        | the marketplace can't be reached                              | [Check the ref, the token, the proxy](#a-marketplace-that-will-not-load)   |
| `Could not reach … — using the cached copy, which may be out of date.`     | offline, and a cached copy was used                           | Nothing — the run succeeded                                                |
| `0/1 skills found` / `- <id> (not found)`                                  | the catalogue doesn't carry that id                           | [Refresh, then fix the id](#a-skill-id-the-catalogue-no-longer-has)        |
| `Skill '<id>' is configured but was not found`                             | the same, at compile time — and `compile` still exits 0       | [Refresh, then fix the id](#a-skill-id-the-catalogue-no-longer-has)        |
| `No configuration found for id '…'`                                        | a shared id the store doesn't have                            | [Check the id](#a-shared-id-that-will-not-install)                         |
| `Configuration '…' is not in a format this version of the CLI can install` | the id predates or postdates this CLI                         |
| `The configuration on standard input is not one this store accepts`        | a piped configuration the store would refuse                  |
| `Sharing this configuration failed (HTTP 400). The store said: …`          | the store named what is wrong with it                         |
| `This CLI is out of date against the configuration store`                  | this CLI writes a contract version the store no longer serves | [Re-share it](#a-shared-id-that-will-not-install)                          |
| `An installation already exists at …`                                      | `init --from` is greenfield-only                              | [Uninstall first](#a-shared-id-that-will-not-install)                      |
| A sub-agent doesn't show up in Claude Code                                 | it was never compiled, or compiled at the other scope         | [Compile it](#sub-agents-that-never-appeared-in-claude-code)               |
| Your edits to `.claude/agents/*.md` keep vanishing                         | compiled agents are build outputs                             | [Edit the partials](#hand-edits-to-a-compiled-sub-agent-keep-disappearing) |
| `Global skills cannot be changed from project scope`                       | a global install is read-only from inside a project           | [Three ways out](#a-global-skill-you-cannot-remove-from-inside-a-project)  |
| `Failed to install N plugin skill(s).`                                     | the plugin install didn't happen                              | [Refresh or switch to eject](#a-plugin-install-that-failed)                |
| `Cannot install N skill(s) as plugins — no marketplace carries them`       | a skill that exists only here                                 | [Set it to Local](#a-plugin-install-that-failed)                           |
| `No skills found. Run 'npx agents-inc init' …`                             | `compile` found nothing installed under the config            | [Reinstall the skills](#compile-says-there-are-no-skills)                  |
| `Raw mode is not supported on the current process.stdin`                   | a wizard command with no terminal                             | [Use the headless flags](#a-wizard-command-in-a-pipeline)                  |
| `✓ Eject complete!` and nothing was copied                                 | the destination already existed                               | [Pass `--force`](#an-eject-that-reports-success-and-copies-nothing)        |
| The command prints one line and hangs                                      | the terminal is under 80×20                                   | [Resize it](#a-command-that-hangs-instead-of-starting)                     |
| `Completed with N failure(s) — the changes above landed, these did not:`   | the run finished and part of it didn't happen                 | [Do what the indented line says](#a-command-that-finished-with-failures)   |

## A config that will not parse

`.claude-src/config.ts` is evaluated, not merely read, so a syntax error stops every command that needs it. What you see depends on which command you ran.

`init` and `edit` name the file and then the way out:

```
Error: Config at '/home/me/project/.claude-src/config.ts' could not be loaded:
Failed to load config from '/home/me/project/.claude-src/config.ts': ParseError: Unexpected token, expected ","
There is no automatic repair for this — recreate the configuration:
'npx agents-inc uninstall' still works on a config it cannot read, then 'npx agents-inc init'.
Or build one at https://agentsinc.sh/editor and install it with 'npx agents-inc init --from <id>'.
'npx agents-inc doctor' reports the same file, alongside whatever else is wrong here.
```

`compile` and `update` print the first line alone. `list` prints it with the error class still attached — `ConfigLoadError: Config at '…'` — and no remedy at all; it's the same fault, and the instructions above apply.

**There are no versioned migrations, so an unreadable config is recreated rather than repaired.** `uninstall` deliberately keeps working on one — it identifies skill directories by their own `forkedFrom` metadata and compiled agents by the marker each carries, neither of which needs the config:

```bash
npx agents-inc uninstall   # warns that it can't read the config, and proceeds
npx agents-inc init
```

If the mistake is obvious, editing `config.ts` by hand and re-running is faster. `npx agents-inc doctor` reports the same file under its `Config` row, with the parse error and the line number. See [Editing your config](/docs/guides/editing-config) for the shape the file has to hold.

## A marketplace that will not load

`doctor` reports this as `Marketplace Reachable ✗ Failed to load marketplace`, with the loader's own message underneath. The messages are specific, and each names the environment variable it wants:

```
Repository not found: github:agents-inc/skills

This could mean:
  - The repository doesn't exist
  - The repository is private and you need to set authentication
  - There's a typo in the URL

For private repositories, set the GIGET_AUTH environment variable:
  export GIGET_AUTH=ghp_your_github_token
```

`Authentication required for: <source>` and `Access denied to: <source>` both point at the same token — the second means it exists and lacks the `repo` scope. `Network error fetching: <source>` asks for a proxy instead:

```bash
export HTTPS_PROXY=http://your-proxy:port
export FORCE_NODE_FETCH=true
```

**A local marketplace has its own message**, `Local marketplace not found: '<absolute path>'`, and **a repository with no manifest has a third**: `Marketplace not found at: <source>`, followed by `The .claude-plugin/marketplace.json file is missing from this repository.` A skills repository isn't a marketplace until that file exists — see [Creating a marketplace](/docs/guides/creating-a-marketplace).

**Being offline is not one of these.** Every load revalidates its cached copy against the remote with a five-second budget, and a failure there falls back to the cache with a warning rather than an error: `Could not reach <source> — using the cached copy, which may be out of date.` The run succeeds. When the remote has moved on, `Marketplace has newer content — fetching the update...` prints before the download, so the wait is announced.

**Retrying with a different marketplace isn't available outside `init`.** `--marketplace` is `init`'s flag and nobody else's; every later command reads the one the installation recorded, and `doctor` ignores `CC_MARKETPLACE` entirely. To change it, edit `marketplace` in `config.ts`.

## A skill id the catalogue no longer has

Two commands report this and they behave differently, which is worth knowing before you script either.

`doctor` fails the row and tells you where to look:

```
    Skills Resolved         ✗  0/1 skills found
                               - no-such-skill-id (not found)

  Tip: Check skill IDs in config match available skills
```

`compile` **warns and carries on**, exiting 0:

```
Warning: Skill 'no-such-skill-id' is configured but was not found — agents will be compiled without it.
```

That's deliberate — the other agents still compile — but it means a CI step that only checks `compile`'s exit code will pass over a sub-agent that quietly lost a skill. Grep stderr for `is configured but was not found` if that matters.

Applying a shared configuration reports it as a skip instead — `Skipped 2 skill(s) this catalog does not know: a, b` — and installs without them.

The remedy depends on why the id is missing. If the marketplace has moved on, refresh it and re-pick:

```bash
npx agents-inc update   # refreshes each configured marketplace through the Claude CLI
npx agents-inc edit     # re-select against what the catalogue carries now
```

If the id is a typo, fix it in `config.ts` and run `npx agents-inc compile`. If the skill is one you wrote, it belongs under `.claude/skills/` — see [Writing custom skills](/docs/guides/writing-custom-skills).

## A shared id that will not install

Ids minted by `share` or by the editor are content-addressed and are never migrated. The refusals name which mistake it is:

- `No configuration found for id '<id>'.` — the store returned 404. Check the id against the link you were sent.
- `Could not reach https://api.agentsinc.sh — check your connection.`
- `Fetching configuration failed (HTTP <status>).` and `The configuration store returned something that is not JSON.`
- `Configuration '<id>' is not in a format this version of the CLI can install. Shared ids are never migrated — re-share the configuration to mint a current one, or update the CLI if that id came from a newer version.`
- `An installation already exists at <path>. Run 'npx agents-inc uninstall' first — installing a shared configuration is a fresh setup, not a merge.`

**`init --from` is greenfield-only, and every one of its refusals fires before anything is written.** A configuration carrying global-scoped content refuses against an existing global install too, and one carrying project-scoped entries refuses to install at your home directory, naming each offender as `skill <id> (scope: project)`.

**`edit --from` is the destructive half**, because a payload states a whole roster and what it leaves out is removed. It needs a terminal to confirm that, and says so rather than applying silently:

```
Applying configuration '<id>' removes whatever it leaves out,
so it has to be confirmed — and there is no terminal here to confirm it at.
Run 'npx agents-inc edit --from <id>' from a terminal, or 'npx agents-inc init --from <id>'
in a clean directory, which installs without removing anything.
```

More on how an id moves between the two front doors is in [CLI or web](/docs/cli-or-web) and [Install and share](/docs/editor/install-and-share).

## A configuration that will not share

`share` refuses in two places, and which one it was tells you where to look.

**Refused locally, before anything is sent.** `share --stdin` holds a piped configuration to the same contract the store writes with, so a payload the store would reject costs no write and names every offending pair:

```
The configuration on standard input is not one this store accepts:
skills.<id>.assignments.<agent>: a project-scoped skill has nowhere to be
written on '<agent>', which rests at global scope
```

A project-scoped skill assigned to a sub-agent resting at global has nowhere to go — the skill installs under one project's `.claude`, the sub-agent's front matter is written to `~/.claude`, and from anywhere else it names something that does not exist. **An `agents` entry is optional and an absent one rests at global**, so "assign a skill and say nothing else" is already the unwritable pair. Fix it by giving the skill global scope, or by pinning the sub-agent to project. Only the first few pairs are named; the rest are counted.

**Refused by the store.** The status separates the causes, and the store's own sentence is quoted after it where there is one:

- `Sharing this configuration failed (HTTP 400). The store said: …` — the body reached the store and it named the problem. The sentence after the colon is the store's, not the CLI's.
- `This CLI is out of date against the configuration store: it writes a version of the sharing contract the store does not serve …` — a 409, and the version travels inside the CLI rather than with the configuration, so no change to what you are sharing can fix it. Re-run through `npx agents-inc@latest`.
- `Sharing this configuration failed (HTTP 503). The store said: Could not store this config` — the store was reached and would not write. Nothing was minted, so re-running is safe.
- `Sharing this configuration failed (HTTP 413).` / `(HTTP 429).` — too large, or too many writes in a minute. **These two render bare on purpose.** The store answers them in prose too, but its words only re-say the status — `Payload too large` for the 413, `Too many requests` for the 429 — so the CLI drops a body that adds nothing to the number printed beside it. A quote appears only where the store named a cause the status could not.

The same quoting happens on the way in: `Fetching configuration failed (HTTP <status>). The store said: …` when a refusal arrives as readable text.

In the editor the equivalent is the Share button's own word — `Scope conflict — fix marked rows`, which stays on screen because the marked rows are the fix. See [Install and share](/docs/editor/install-and-share).

## Sub-agents that never appeared in Claude Code

A sub-agent exists for Claude Code when its compiled `.md` file is in an agents directory it reads: `~/.claude/agents/` for a global-scoped sub-agent, `<project>/.claude/agents/` for a project-scoped one. `doctor` asks exactly that question:

```
    Agents Compiled         !  1 agent needs recompilation
                               - reviewer (missing)

  Tip: Run 'npx agents-inc compile' to generate missing agent files
```

```bash
npx agents-inc compile
```

**Check the scope before you re-run it.** A compile from a project directory writes the project's agents and nothing else, so a global sub-agent stays stale however many times you run it there. `compile` says so when it notices: `13 agents are global-scoped — run 'npx agents-inc compile' from your home directory, or edit from this project, to recompile them.` `npx agents-inc list` prints every directory that actually holds compiled agents, which settles where yours went.

**A file that exists and still doesn't load** is a frontmatter problem, and `doctor`'s `Agents` content row is where it shows: `Missing or invalid YAML frontmatter`, or `name must be kebab-case: "MyAgent"`. That row validates every `.md` in both agents directories, whoever wrote it.

## Hand edits to a compiled sub-agent keep disappearing

They're build outputs. Every file the compiler writes carries a marker on its first body line:

```
<!-- Generated by agents-inc — do not edit; compile rewrites this file -->
```

The next `compile` rewrites the file under it, and the marker is also how `uninstall` knows which agent files this CLI wrote — an agent without one is left alone.

To change a sub-agent for real, edit the layer it's compiled from:

```bash
npx agents-inc eject agent-partials   # every sub-agent's partials, into .claude-src/agents/
npx agents-inc compile                # rebuild from what you edited
```

**Two commands, not three.** `eject agent-partials` writes the shared templates alongside the partials, under `.claude-src/agents/_templates/`, so running `npx agents-inc eject templates` after it finds that directory already there and skips with a warning. Run `eject templates` on its own only when the templates are all you want.

[Customizing sub-agents](/docs/guides/customizing-subagents) covers what each partial does. To change only which skills a sub-agent receives, edit `stack` in `config.ts` instead — see [Editing your config](/docs/guides/editing-config).

## A global skill you cannot remove from inside a project

Inside a project, globally installed rows are inherited and locked, and the wizard shows it two ways. On the Sources step they carry a padlock and focus skips straight over them. On the Build and Agents steps they look like any other row, and pressing space on one raises a toast:

```
Global skills cannot be changed from project scope
```

Sub-agents get the matching line, `Global agents cannot be changed from project scope`. This is deliberate: one global install serves every project on the machine, so one project must not uninstall it for the others.

**Three ways out, in increasing order of reach.**

**Don't hand it to this project's agents.** The skill stays installed and isn't part of any prompt here — leave it out of the relevant agent's `stack` entry in `.claude-src/config.ts` and run `npx agents-inc compile`. This is the right answer nearly always.

**Take a project-scoped copy alongside it.** Press `s` on the row in the wizard; it then shows both `[P]` and `[G]`, and the global install is untouched.

**Edit at global scope.** The only way to actually remove it:

```bash
cd ~
npx agents-inc edit
```

[Global-first setup](/docs/guides/global-first-setup) explains why the default is global in the first place.

## A plugin install that failed

Plugin intent is never quietly downgraded to a local copy. If a plugin install fails, the command refuses **before any config is written**, so nothing is left half-installed:

```
Warning: Failed to install plugin web-framework-react: <reason>
Error: Failed to install 1 plugin skill(s). Plugin install intent could not be honored.
Verify the skill id matches the marketplace, run 'npx agents-inc update' to refresh the marketplace,
or switch affected skills to eject mode.
```

Work through those three in order. `npx agents-inc update` shells out to the Claude CLI once per configured marketplace, so it needs Claude Code on your path — without it you get `Claude CLI not found — 'npx agents-inc update' refreshes marketplaces through it. Install Claude Code first: https://claude.ai/code`.

**A skill no marketplace carries is refused earlier and differently**, because refreshing a marketplace is impossible advice for a skill you wrote yourself:

```
Cannot install 1 skill(s) as plugins — no marketplace carries them: my-own-skill.
A skill that exists only in this project can only be installed as a local copy.
Set it to Local on the Sources step, or publish it to a marketplace first.
```

**An install that succeeded and later stopped registering** shows in `doctor` as a warning with one line per skill: `44 skills not installed as plugins`, each `- <id> (no enabled plugin found)`. That reads the plugin registry rather than the disk. If the registry file itself is broken, the `Plugins` content row says so — `- [ERROR] ~/.claude/plugins/installed_plugins.json: Expected property name or '}' in JSON at position 1 (line 1 column 2)` — and `Plugins Installed` stands down rather than blaming every configured skill for one file.

## `compile` says there are no skills

```
Error: No skills found. Run 'npx agents-inc init' to choose skills, or add your own under .claude/skills/.
```

This is reached only after an installation was detected, so it means the config declares skills and none of them are installed under it. The usual cause is a plugin-mode install whose plugins are gone or disabled — nothing is on disk under `.claude/skills/`, and the registry has nothing either.

Run `npx agents-inc doctor` first: `Plugins Installed` and `Skills Installed` say which half is empty. Then `npx agents-inc edit` to reinstall the selection, or `npx agents-inc init` if the config declares nothing at all.

The neighboring message, `No installation found. Run 'npx agents-inc init' first to set up Agents Inc.`, means something different — there's no config here or at your home directory. It's fatal for `compile`, `edit` and `share`, and only a warning for `update`.

## A wizard command in a pipeline

`init` and `edit` mount a terminal UI, and so does `uninstall` without `--yes` — that flag is `uninstall`'s alone. With no TTY they print a React stack trace and exit 4:

```
  ERROR Raw mode is not supported on the current process.stdin, which Ink uses
        as input stream by default.
```

**Nothing is written when this happens** — the failed render is treated as a cancel, which is the correct outcome behind an alarming presentation. Exit 4 is `CANCELLED`, the same code you get for answering no.

The headless equivalents exist:

```bash
npx agents-inc init --from <id>   # installs a shared configuration, no wizard
npx agents-inc uninstall --yes    # prints the removal plan instead of prompting
```

`doctor`, `compile`, `list`, `search`, `update`, `share`, `share --stdin` and `eject` need no terminal at all. `edit --from` is the one that can't be made headless: it removes what the payload leaves out, and a confirmation nobody can answer must never become a yes.

## An eject that reports success and copies nothing

`eject` skips a destination that already exists, warns, and still prints its success line:

```
Agents Inc. Eject

Warning: Skills already exist at /home/me/project/.claude/skills. Use --force to overwrite.

✓ Eject complete!
```

**The exit code is 0 either way**, so a script can't tell "ejected" from "skipped" by status alone — grep stderr for `already exist at`, or check the destination. The other skip messages are `Agent partials already exist at <dir>. Use --force to overwrite.`, `Agent templates already exist at <dir>. Use --force to overwrite.`, `No skills found in the marketplace to eject.`, `No agent partials found in CLI.` and `No agent templates found in CLI.`

```bash
npx agents-inc eject skills --force
```

**The partials skip is narrower than it looks.** It fires only when the destination holds partial directories and no `_templates` beside them — so re-running `npx agents-inc eject agent-partials` after a full one re-copies the partials and warns `Agent templates already exist — skipping templates, only ejecting agent partials.` instead. Hand-edited partials are overwritten by that, and `--force` isn't what caused it.

Each eject type has its own destination — partials to `.claude-src/agents/`, templates to `.claude-src/agents/_templates/`, skills to `.claude/skills/` — and `--output/-o` replaces all three at once, writing directly into the directory you name with no nesting under it.

## A command that finished with failures

Exit code 5, and it means something no other code does: the run reached the end, the changes it reports landed, and part of it didn't happen.

```
Completed with 1 failure(s) — the changes above landed, these did not:
  2 sub-agent(s) did not compile: reviewer, web-developer
    Run 'npx agents-inc compile' — the compiled agents on disk are stale until you do.
```

**Do the indented line, not the command again.** Re-running would repeat work that already landed. Each failure is printed with the one command that finishes it, and the other two you'll see are `Run 'npx agents-inc doctor' to see what this installation is left holding.` and `Delete the file by hand — Claude Code loads a compiled sub-agent this project no longer configures.`

Only `init`, `edit` and `eject` end this way. Everything else either completes or refuses.

## A command that hangs instead of starting

```
Terminal too narrow (need 80). Please resize.
```

Below 80 columns or 20 rows, a command prints that line and **blocks** rather than exiting — it polls, and starts as soon as the window is big enough. `Terminal too short (need 20). Please resize.` is the same gate on the other axis. Resize the window and the command continues on its own; there's nothing to re-run.

This never fires when output is piped or redirected, so it can't affect CI.
