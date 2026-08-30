---
title: Run Agents Inc in CI
description: Which commands are safe headless, how --from installs a configuration without a terminal, and the four cases where the exit code alone doesn't tell you the run succeeded.
sidebar:
  order: 5
---

Most of the CLI runs headless. Three commands need a terminal, and off one they exit cleanly with nothing changed rather than hanging. This is what a pipeline can rely on, and what it has to check beyond the exit code.

## Quick start

Install a shared configuration into a clean checkout, then compile:

```bash
npx agents-inc init --from <id>
npx agents-inc compile
```

The id comes from the editor's install dialog, or from `npx agents-inc share` run against an installation you already have. `init --from <id>` opens no wizard and needs no terminal — that is most of why the flag exists. It's greenfield-only: in a directory that already carries an installation it refuses rather than merging.

## What runs headless

| Command                                                 | Headless | Worth knowing                                                                                              |
| ------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `init --from <id>`                                      | yes      | greenfield-only; every refusal fires with nothing written                                                  |
| `init --ui`, `edit --ui`                                | yes      | prints the link first; only tries a browser when stdin is a terminal                                       |
| `compile`                                               | yes      | exits 0 even when a configured skill couldn't be found                                                     |
| `doctor`                                                | yes      | exits 1 on any failed check; skips the operational ones in a marketplace repository with nothing installed |
| `list` / `ls`                                           | yes      | falls back to plain text off a TTY                                                                         |
| `search <query>`                                        | yes      | reaches the marketplace; exits 0 on no matches                                                             |
| `update`                                                | yes      | needs the `claude` binary only when a marketplace is configured                                            |
| `share`, `share --stdin`                                | yes      | `--stdin` refuses if standard input is a terminal                                                          |
| `eject <type>`                                          | yes      | exits 0 even when the whole copy was skipped                                                               |
| `uninstall --yes`                                       | yes      | prints the plan instead of prompting                                                                       |
| `new marketplace`, `build plugins`, `build marketplace` | yes      |                                                                                                            |
| `edit --from <id>`                                      | **no**   | exits **1**, not 4 — match on the message, not the code                                                    |
| `init`, `edit`, `uninstall` without `--yes`             | **no**   | exits 4 with nothing changed                                                                               |

The terminal-size gate never bites in CI. It reads `process.stdout.columns`, which is undefined when standard output isn't a terminal, so a piped run always clears the minimum.

## Exit codes

| Code | Means                                                                           |
| ---- | ------------------------------------------------------------------------------- |
| `0`  | the command completed                                                           |
| `1`  | it refused or aborted; nothing landed, and the run can be repeated              |
| `2`  | bad arguments or flags                                                          |
| `4`  | cancelled — a declined confirmation, or an interactive command with no terminal |
| `5`  | the run landed and part of it did not                                           |

**Code 5 is the one to special-case.** `init`, `edit` and `eject` raise it at the end of a run that completed. The output names each failure and the single command that finishes it, so repeating the whole thing is the wrong response:

```
Completed with 1 failure(s) — the changes above landed, these did not:
```

## Four places the exit code isn't enough

- **`compile` exits 0 with unresolved skills.** Grep standard error for `is configured but was not found`.
- **`eject` exits 0 when the copy was skipped** and still prints `✓ Eject complete!`. Grep for `already exist at`, or check the destination directory.
- **`search` exits 0 with no matches** — it's a warning, not a failure. Check standard output for `Found `.
- **`doctor` exits 1 for a missing config as well as a broken one.** If "not installed yet" is an acceptable state for your job, match on `.claude-src/config.ts not found` rather than on the code. The exception is a marketplace repository with nothing installed — the operational checks stand down, so that message never prints and a clean run exits 0.

`doctor` is otherwise the check worth running last: it validates content, then the installation, and exits 1 if any row failed — warnings alone still exit 0. [Commands](/docs/reference/commands) has the full matrix.

## Environment

| Variable                               | Read by                                                           |
| -------------------------------------- | ----------------------------------------------------------------- |
| `CC_MARKETPLACE`                       | `init` alone — the marketplace to install from                    |
| `GIGET_AUTH`                           | any command that fetches a private marketplace                    |
| `HTTPS_PROXY`, `FORCE_NODE_FETCH=true` | fetching from behind a corporate proxy                            |
| `AGENTS_INC_API_URL`                   | `share` and `--from`, to point at a different configuration store |

There's no refresh flag and no offline flag. Every load revalidates its cached copy of the marketplace against the remote with a five-second budget, and on failure uses the cache and warns:

```
Could not reach github:acme/skills — using the cached copy, which may be out of date.
```

A cold cache has no fallback, so the first run on a fresh runner needs the network.
