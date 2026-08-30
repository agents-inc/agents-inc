---
title: Troubleshooting
description: What to run first when something is wrong, how to read what doctor reports, how to tell a configuration fault from a marketplace fault from a compile fault, and what to gather before opening an issue.
sidebar:
  order: 1
---

Start with `npx agents-inc doctor`. It's the one command whose whole job is to say what state an installation is in. If you already have an error message in hand, [Common problems](/docs/troubleshooting/common-problems) indexes them by their text.

## Quick start

```bash
npx agents-inc doctor
```

No flags and no arguments — a diagnostic command has no reason to hide detail. It runs against the current directory and describes whichever installation that directory resolves to: this project's, or the global one when the project has none.

**It exits 1 if any row failed, and 0 otherwise.** Warnings are reported and don't change the exit code. One thing to know before wiring that into a script: a directory with nothing installed also exits 1, because `Config Valid` fails with `.claude-src/config.ts not found`. `doctor` answers "is this installation healthy", not "is anything installed here".

## What a healthy report looks like

```
Agents Inc. Doctor

  Checking configuration health...

  Content checks
    Config                  ✓  1 config validated
    Marketplaces            ✓  No marketplaces to validate
                               - marketplace (github:agents-inc/skills) — skipped (remote)
    Plugins                 ✓  56 plugins validated
    Skills                  ✓  No skills to validate
                               - ~/.claude/skills/context7-mcp — not installed by this CLI and named by no configuration here: not validated
    Agents                  ✓  13 agents validated

  Operational checks
    Config Valid            ✓  .claude-src/config.ts is valid
    Skills Resolved         ✓  44/44 skills found
    Agents Compiled         ✓  13/13 agents compiled
    No Orphans              ✓  No orphaned agent files
    Skills Installed        ✓  No eject-mode skills configured
    Plugins Installed       ✓  44/44 plugin-mode skills installed
    Marketplace Reachable   ✓  Connected to remote: /home/me/.cache/agents-inc/sources/github-agents-inc-skills-53f27da1d39533ac
                               Fetched github:agents-inc/skills over the network — named by the global configuration

  Summary: 12 passed, 0 warnings, 0 errors
```

Four glyphs, and they aren't interchangeable: `✓` passed, `✗` failed, `!` warned, `–` stood down without answering. Rows that stood down are **not** counted in the summary, so a report with twelve rows can end on a total of eleven — if the arithmetic doesn't add up, a row skipped.

Tips print under the summary, keyed to the row that earned them rather than matched on text. A run with no failures and no warnings prints none.

## The two layers

**Content checks** run first, and they validate what's on disk file by file: `Config`, `Marketplaces`, `Plugins`, `Skills`, `Agents`. `Config` runs alone and before the rest, because everything else is read against it.

**Operational checks** then ask whether the installation is coherent: `Config Valid`, `Skills Resolved`, `Agents Compiled`, `No Orphans`, `Skills Installed`, `Plugins Installed`, `Marketplace Reachable`.

The order is the point. A file that won't parse is one finding, and every row that reads it would report the same fault in its own words — so a row whose inputs are already known broken stands down instead of repeating them. That's what each skip means:

| Skip line                                                    | What happened                                                                                                                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Skipped — fix the content errors above first`               | `Config` failed. The whole operational layer stands down.                                                                                                              |
| `Skipped — no installation here (marketplace repository)`    | You're in a marketplace repository with nothing installed. Its content was validated; there's no install to describe.                                                  |
| `Skipped — the configuration that names them cannot be read` | A content row that needs `config.ts` to know what to validate.                                                                                                         |
| `Skipped — this row would only restate the … errors above`   | One row, blocked by a content pass it reads through. The gap names which one — `marketplace`, `skill` or `plugin`, and two of them joined by `and` when both failed.   |
| `Skipped (marketplace unreachable)`                          | `Skills Resolved` had no catalogue to resolve ids against.                                                                                                             |
| `Skipped (config invalid)`                                   | No config was loaded. **Also printed when the config is merely absent** — that wording is misleading and the row above it (`Config Valid`) is the one that says which. |

Only two findings stand the whole layer down: a config nobody can read, and a marketplace repository with nothing installed. Every other content error is scoped to the rows that read what it's about, and the rest print real verdicts — a broken plugin registry leaves six operational rows answering normally.

## Configuration, source, or compile

These faults look alike from the outside and have nothing in common as remedies. The row that failed tells you which kind you have.

| Row                                     | What it reads                                         | A failure here is |
| --------------------------------------- | ----------------------------------------------------- | ----------------- |
| `Config`, `Config Valid`                | `.claude-src/config.ts`                               | configuration     |
| `Marketplaces`, `Marketplace Reachable` | registered local marketplaces; the one this run reads | source            |
| `Skills Resolved`                       | the config's skill ids, against the loaded catalogue  | source, usually   |
| `Agents Compiled`, `No Orphans`         | `.claude/agents/`                                     | compile           |
| `Skills Installed`, `Plugins Installed` | `.claude/skills/` and the Claude plugin registry      | install           |

**Configuration faults block everything.** Nothing downstream is trustworthy until `config.ts` loads, and there's no automatic repair — see [a config that will not parse](/docs/troubleshooting/common-problems#a-config-that-will-not-parse).

**Source faults leave the config intact.** The catalogue isn't answering, or no longer carries an id the config names. Neither is repaired by recompiling.

**Compile faults mean the config and the catalogue agree and the disk hasn't caught up.** `npx agents-inc compile` is the remedy, and `doctor` says so in a tip.

**Install faults are the third thing again** — the config declares a skill, and the files or the plugin registration that back it aren't there. A plugin-mode skill has no files under `.claude/skills/` at all, so `Plugins Installed` and `Skills Installed` answer about different halves of a mixed install. See [Install modes](/docs/concepts/install-modes).

## What `list` tells you that `doctor` does not

```bash
npx agents-inc list
```

```
Installation: agents-inc
  Mode:    Plugin
  Skills:  44
  Agents:  13
  Config:  /home/me/.claude-src/config.ts
  Agents:  /home/me/.claude/agents
```

Three things here that `doctor` never prints. **`Mode`** is `Plugin`, `Mixed` or `Eject`, and it's derived from the config's skills every time rather than stored anywhere — a single ejected skill in an otherwise plugin install makes it `Mixed`. **`Config`** is the absolute path of the file actually in play, which is the fastest way to find out that a project you thought had its own config is reading the global one. And the second **`Agents`** line is a directory, printed once per scope that holds compiled agents.

The two numbers are counted from different places, which is what makes them useful together: `Skills` is what the config declares, deduplicated by id and excluding anything switched off; `Agents` is what's on disk. A `Skills` count that looks right beside an `Agents` count of 0 is a compile that never ran.

With a terminal and a config that loads, `list` renders a scope-grouped roster of skills and sub-agents instead. Piping it gives the plain block above. Full command detail is in the [command reference](/docs/reference/commands).

## Before you open an issue

Four things, and the first two are the ones most reports leave out.

```bash
npx agents-inc --version   # the exact version, platform and node build
npx agents-inc doctor      # the whole report, not the row that failed
```

`doctor`'s output is worth pasting whole. A row that failed often isn't the fault itself — it's the cascade of a finding two rows above it, and the layer headings and skip lines are what separate the two.

Then the command you actually ran, verbatim including flags, and **its exit code** — `echo $?` straight after. The exit code isn't cosmetic here: `1` means the command refused and nothing landed, `4` means it was cancelled, and `5` means it ran to the end and part of it didn't happen. Those three ask for different things from whoever reads the report, and re-running is the wrong response to the third.

Last, whether the installation is global or project — `list`'s `Config` line answers it — and whether the skills are plugin or eject mode. Issues go to [github.com/agents-inc/agents-inc](https://github.com/agents-inc/agents-inc/issues).

## Known rough edges

Reported here rather than left to be rediscovered.

- **`doctor` exits 1 in a directory with nothing installed.** `.claude-src/config.ts not found` is a failed row like any other. If "not installed yet" is an acceptable state for your script, match the message rather than the exit code.
- **`Skipped (config invalid)` also prints when the config is merely absent.** Read the `Config Valid` row above it, which distinguishes the two.
- **`Fetched … over the network` prints for a cache hit too.** The line reports whether the marketplace is local or remote, not whether this run actually downloaded anything.
- **A multi-line detail breaks the column layout.** Marketplace and loader errors carry newlines; only the first line is indented and the rest sit at the left margin. The text is intact — the alignment isn't.
- **The summary omits skipped rows,** so its total can be lower than the number of rows printed.
- **`Config Valid` prints a project-relative path for a file that may be global.** In a project with no config of its own it reports `.claude-src/config.ts is valid` about `~/.claude-src/config.ts`. The `Marketplace Reachable` detail line — `named by the global configuration` — is what tells the two apart, and `npx agents-inc list` prints the absolute path.
