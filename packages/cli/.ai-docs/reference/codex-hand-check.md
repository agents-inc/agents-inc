---
scope: reference
area: codex
keywords:
  [
    codex,
    hand-check,
    subscription,
    spawn_agent,
    wait_agent,
    agent_type,
    developer_instructions,
    multi_agent_mode,
    trust_level,
    projects,
    refreshCodexMarketplace,
    upgradeGitMarketplace,
    trustCodexProject,
    AGENTS_INC_API_URL,
    AGENTS.md,
    model_reasoning_effort,
  ]
related:
  - reference/concepts/plugin-hosts.md
  - reference/concepts/source-folder-layout.md
  - reference/testing/hand-run.md
last_validated: 2026-09-26
---

# The Codex hand-check

**A checklist to work through once, on a machine with a real Codex subscription.** It assumes no
prior context: everything needed is on this page.

Everything this repository ships was verified against a pinned `@openai/codex@0.155.1` binary and a
scripted Responses mock. Registration, trust and payload shape are all proved there,
in `e2e/lifecycle/codex-*.e2e.test.ts` and `e2e/smoke/codex-*.smoke.test.ts`. **What no offline rig
can answer is whether a real model, on a real subscription, does the thing.** That is what is left,
and this page is the whole of it.

Nothing here is a test. There is no exit code to read and no assertion to run — each item is a
thing to **look at**, and every one of them has a "failure" line because most of these fail
silently.

**Last run 2026-09-26, by Codex itself** (codex-cli 0.157.1, ChatGPT login, the local build at 0.164.0),
given this page and a throwaway home. Each check carries its result. One of them found a bug, since
fixed: every role was written with a Claude model Codex refuses to start (check 4). **Codex can run
this page on its own** when it is told to keep to a throwaway `HOME` and `CODEX_HOME` and to judge
checks 2–4 from the evidence below rather than from the TUI.

## At a glance

Tick the boxes as you go. **Checks 2–4 need the subscription; the rest can be done on any machine**
with the CLI and the `codex` binary, and 7 is also held by the offline e2e suite now.

| #                                                           | Check                                                 | Needs a subscription?               | 2026-09-26                             |
| ----------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------- | -------------------------------------- |
| [2](#2-does-a-sub-agent-receive-its-role-whole)             | Does a sub-agent receive its role, whole?             | **Yes** — needs a spawned sub-agent | PASS — byte-identical                  |
| [3](#3-does-the-orchestrator-use-the-roster)                | Does the orchestrator use the roster at all?          | **Yes** — needs a model deciding    | Only with an `AGENTS.md`               |
| [4](#4-does-a-role-start-with-no-model-and-with-its-effort) | Does a role start, with no model and with its effort? | **Yes** — needs a spawned sub-agent | FAIL, fixed, then PASS                 |
| [6](#6-a-git-sourced-marketplace-refresh)                   | A git-sourced marketplace refresh                     | **No**                              | PASS                                   |
| [7](#7-a-project-install-and-its-trust-line)                | A project install, and its trust line                 | **No** — also in the e2e suite      | Not run on the subscription; e2e green |

---

## Step 0 — set the machine up

Do these in order. Every one is executable on a fresh machine; nothing here depends on the machine
this was developed on.

**1. Install the CLI.**

```bash
npm install -g agents-inc
npx agents-inc --version
```

Every command on this page is written `npx agents-inc …`, which is what the product tells users to
run. **To check work not yet released, use the local build instead**: `bun run build` in a checkout,
then `node <checkout>/packages/cli/dist/index.js` for `npx agents-inc` throughout.

**And a configuration made in the LOCAL editor lives on the local server**, not at agentsinc.sh, so
`init --from <id>` fails with `No configuration found for id '<id>'` unless the CLI is pointed at it:

```bash
export AGENTS_INC_API_URL=http://localhost:8787   # read in src/cli/lib/seed/fetch-seed.ts
curl -s -o /dev/null -w "%{http_code}" "$AGENTS_INC_API_URL/configs/<id>"   # PASS: 200
```

**2. Install Codex at the pinned version.**

```bash
npm install -g @openai/codex@0.155.1
codex --version
```

PASS: `codex-cli 0.155.1`. **Every measurement on this page is against that pin.** A different
version is not a failure, but it makes this page evidence about a binary you are not running — note
the version you actually used beside any result you record.

**3. Give this run its own `HOME` and `CODEX_HOME`.**

```bash
export SCRATCH=$(mktemp -d)
export HOME="$SCRATCH/home" CODEX_HOME="$SCRATCH/home/.codex"
mkdir -p "$CODEX_HOME"
```

**This is not caution, it is a measured contamination.** `--sandbox workspace-write` and
`--sandbox danger-full-access` make Codex **write** `[projects."<path>"] trust_level = "trusted"`
into the global `config.toml` itself. Several checks below are about whether that entry is there,
so a second run in the same home passes for a reason nobody set. A fresh home per attempt is the
only way the answers mean anything.

Expect `WARNING: proceeding, even though we could not create PATH aliases` on every run from a
`CODEX_HOME` under `/tmp`. Exit code is 0. **That warning is not a failure and is not evidence of
one.**

**4. Sign in.**

```bash
codex login
```

PASS: the browser flow completes and `codex login status` reports a logged-in account. This is the
step the whole page waits on — until it succeeds, only checks 6 and 7 can be done.

**Or carry an existing login into the throwaway home**, which is what an agent running this page
does: `cp /home/<you>/.codex/auth.json "$CODEX_HOME/" && chmod 600 "$CODEX_HOME/auth.json"`. Spell the
source path out — `~` now means the throwaway home.

**5. Get a real git project to install into.**

```bash
cd /path/to/a/real/git/project      # must be a git repository with at least one commit
git status                           # PASS: a clean or dirty tree, not "not a git repository"
```

**For check 3, commit an `AGENTS.md` that names the roles** and tells Codex to delegate to them. Without
one, Codex spawns none of them — see check 3.

**6. Install the subject.** Make TWO configurations in the editor: one with the sub-agents at
**global** scope (checks 2–4 and 6) and one with them at **project** scope (check 7). Each install
goes into its own throwaway home.

```bash
npx agents-inc init --provider codex --from <id>  # a configuration minted at agentsinc.sh
```

This is the only route: `--provider` without `--from` is refused, because the provider is chosen
in the editor.

**Read that run's output before going further** — check 7 is about a sentence it prints, and it
scrolls past.

**7. Project trust is the install's job now.** A project install writes
`[projects."<dir>"] trust_level = "trusted"` into the **global** `$CODEX_HOME/config.toml` and prints
what it wrote (CLI-893, 2026-09-26) — check 7 is about exactly that. A global install needs no project
trust at all. Do not add the line by hand: that would answer check 7 for the install.

---

## The checks

### 2. Does a sub-agent receive its role, whole?

- [ ] **Needs the subscription.**

Registration is proved offline — the compiled roles reach `spawn_agent`'s `agent_type` parameter
and are named there. **Delivery is not**: the mock's router refuses the `spawn_agent` call, so
nothing offline has ever seen a sub-agent's own context. The compiled bodies are long, and a
truncation would read as a sub-agent that is simply worse at its job.

|                     |                                                                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Run**             | Delegate to `web-developer` and ask it, as its first instruction, to quote back the **last** heading of its own instructions and say what stands above them.                                                                                                |
| **PASS**            | The **final** heading of the role body, matching the end of the `developer_instructions` value in `<project>/.codex/agents/web-developer.toml`. Plus an answer about where its instructions sit relative to Codex's own prompt, `AGENTS.md` and any skills. |
| **FAIL**            | It quotes an early heading (a truncation keeps the opening), or reports instructions it does not have.                                                                                                                                                      |
| **Why**             | `developer_instructions` is the only key carrying a sub-agent's identity on this host. If it truncates, every compiled role is a fraction of itself with nothing saying so.                                                                                 |
| **Direct evidence** | Extract what the child received from its session log under `$CODEX_HOME/sessions/` and compare it byte for byte with `developer_instructions` in the `.toml`. That settles it where the model's own answer cannot.                                          |

**2026-09-26: PASS.** Byte-identical, 18,681 bytes. The model quoted `## When to Include Each Section` as
its last heading — the last one above the trailing `<system-reminder>` skill block, which is a fair
reading rather than a truncation.

### 3. Does the orchestrator use the roster?

- [ ] **Needs the subscription.**

Codex's own system prompt carries `<multi_agent_mode>`: _"Do not spawn sub-agents unless the user or
applicable AGENTS.md/skill instructions explicitly ask for sub-agents, delegation, or parallel agent
work."_, and `spawn_agent`'s `agent_type` reads _"Omit unless explicitly asked."_ Every installed
role does nothing until something asks. **This is the measurement that would justify doing anything
about it**, and it is the one this product cannot fake.

|                     |                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Run**             | Give Codex a task that would obviously benefit from delegation — "add an endpoint, a test for it and a page that calls it" — and say **nothing** about sub-agents. Then repeat it with "use your sub-agents" added. |
| **PASS**            | Either answer is a result. Record which roles, if any, were spawned unprompted, and what changed when asked.                                                                                                        |
| **What it decides** | Whether the roster needs an instruction to be used at all, and where that instruction should live.                                                                                                                  |
| **Trap**            | `codex agents` is **not** a roster lister — it browses agent sessions on the shared local app-server daemon. The roster is visible only in `spawn_agent`'s parameter schema.                                        |
| **Count**           | Derive how many roles you installed rather than trusting a number: `ls <project>/.codex/agents/*.toml \| wc -l`.                                                                                                    |
| **Evidence**        | Count `spawn_agent` calls and their `agent_type` in the session logs under `$CODEX_HOME/sessions/`.                                                                                                                 |

**2026-09-26: the roster is used only when an `AGENTS.md` asks for it.** With none, Codex spawned no
role unprompted, and told "use your sub-agents" it picked its built-in `explorer`. With a committed
`AGENTS.md` naming the roles and telling it to delegate, the same kind of task — with no mention of
sub-agents — spawned `cli-developer` and `reviewer`. The install does not write an `AGENTS.md` yet
(owner, 2026-09-26: not yet).

### 4. Does a role start, with no model and with its effort?

- [ ] **Needs the subscription.**

**Answered 2026-09-26, and the answer changed the product.** On codex-cli 0.157.1 with a ChatGPT
login, every role compiled with `model = "opus"` registered and then refused to start: `The 'opus'
model is not supported when using Codex with a ChatGPT account.` Every model this product can name is
Claude's, so a role file now carries NO `model` and runs on the session's model, and the compile names
"Claude models" among what Codex cannot express. `model_reasoning_effort` was measured on the same
run and does resolve. This check now confirms the fix.

|            |                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Set up** | Compile an installation whose `web-developer` names a model and an effort, e.g. `opus` and `high`.                                                                    |
| **Look**   | `grep -n '^model' <roles dir>/*.toml` prints nothing; `web-developer.toml` holds `model_reasoning_effort = "high"`. The install lists "Claude models" as not carried. |
| **Run**    | Delegate to `web-developer` and ask it which model and reasoning effort it runs on.                                                                                   |
| **PASS**   | The sub-agent STARTS, on the session's model, and the child session log under `$CODEX_HOME/sessions/` records `reasoning_effort: high`.                               |
| **FAIL**   | Any `model = ` line in a role file, or a launch error naming a model.                                                                                                 |
| **Note**   | `effort` is an unknown field that drops the whole role file, so the renderer writes `model_reasoning_effort`. See [Traps](#traps).                                    |

### 6. A git-sourced marketplace refresh

- [ ] **No subscription needed.**

`refreshCodexMarketplace` branches on `marketplaceSource.sourceType`: a **local** marketplace is
refreshed by re-adding each of its installed plugins, a **git** one by
`codex plugin marketplace upgrade <name> --json`. The local branch runs in the e2e suite; the git
branch has its argv pinned in a unit spec against a fake `codex`.

**`update` refreshes the agents-inc marketplace and nothing else** — never a third party's. So the
subject is an install whose skills come from the git-sourced agents-inc marketplace
(`github:agents-inc/skills`, plugin + global). _Corrected 2026-09-26: this check had the tester add
somebody else's git marketplace, which `update` never touches, so its plugin staying put looked like
a failure._

|            |                                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Set up** | `codex plugin marketplace list --json` shows `agents-inc` with `"sourceType": "git"`. Put a wrapper named `codex` first on `PATH` that logs its argv and then runs the real one. |
| **Run**    | `npx agents-inc update`                                                                                                                                                          |
| **PASS**   | The wrapper logged `plugin marketplace upgrade agents-inc --json`, that call exited 0, and `update` printed `Updated marketplace agents-inc`.                                    |
| **FAIL**   | A non-zero exit from `marketplace upgrade`, or the local branch taken for a git source. `upgrade` exits 1 on a **local** source.                                                 |

**2026-09-26: PASS** — exactly that argv, exit 0.

### 7. A project install, and its trust line

- [ ] **No subscription for the first half.** Also held offline, against the pinned binary, by
      `e2e/lifecycle/codex-agent-roles-are-read-by-codex.e2e.test.ts`.

A role at `<project>/.codex/agents/<name>.toml` reaches the model **only** while the user's
**global** `$CODEX_HOME/config.toml` holds `[projects."<exact absolute path>"] trust_level =
"trusted"`. **The install writes that entry and prints what it wrote** (`trustCodexProject`,
CLI-893, 2026-09-26). _Until then it detected the missing entry and printed the line for the user to
add._ A `trust_level` the user already set for that directory — `"untrusted"` above all — is left
alone and reported.

|                        |                                                                                                                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Run**                | Install the **project-scoped** configuration into a fresh home, with no trust line of your own.                                                                                                                                                                                        |
| **PASS**               | `.codex/agents/*.toml` exists; the output says `Trusted this project in your Codex configuration, so Codex reads its sub-agents: added [projects."<dir>"] with trust_level = "trusted" to <file>`; that table is in the global file once, with every line you already had still there. |
| **Run (subscription)** | Ask Codex which sub-agents it can spawn.                                                                                                                                                                                                                                               |
| **PASS**               | Our `agent_type` values are offered, with no trust line added by hand.                                                                                                                                                                                                                 |
| **Control**            | A fresh home whose global file already says `trust_level = "untrusted"` for the project: the install leaves it, says `Left as you set it`, and Codex offers none of our roles.                                                                                                         |
| **Half-live**          | An untrusted Codex project install is **not** dead. Project skills at `.agents/skills` reach the model with no trust entry at all, while sub-agents, plugin enablement, MCP servers and hooks are ignored in total silence.                                                            |
| **Trap**               | Do not confirm this with a sandbox flag set — see [Traps](#traps).                                                                                                                                                                                                                     |

**2026-09-26:** not run on the subscription (no project-scoped configuration was supplied). The
offline e2e cases for all three rows are green, and red without the write.

---

## Traps

Each of these was measured under its own `HOME` and `CODEX_HOME` with the global `config.toml`
deleted first. Each one fails silently.

- **A project role file registers only with a global trust entry.** `<repo>/.codex/agents/*.toml`
  reaches the model only while `$CODEX_HOME/config.toml` holds
  `[projects."<abs path>"] trust_level = "trusted"`. Four kill switches each produce nothing with
  **no warning anywhere**: no `[projects]` entry at all; `trust_level = "untrusted"`; a trailing
  slash on the path key; and the entry declared in the project's own `.codex/config.toml`, which
  Codex refuses as self-authorisation.

- **A permissive sandbox flag masks whether trust was configured.** `--sandbox workspace-write` and
  `--sandbox danger-full-access` **write** the trust entry themselves. So a run under either flag
  cannot tell a trusted project from an untrusted one, and it silently trusts the project for every
  later run. This contradiction cost a 23-run tie-break to resolve. Never confirm a trust question
  with a sandbox flag set.

- **One unknown key drops the WHOLE role file, silently.** Not a slightly-wrong sub-agent — a
  sub-agent that does not exist, reported as a startup warning nothing in a normal run shows.
  Rejected keys measured one at a time: `reasoning_effort`, `effort`, `disallowed_tools`, `tools`,
  `permissionMode`, `isolation`, `experimental`. `tools = [...]` and `skills = ["a"]` fail on their
  value's shape rather than their name.

- **A role file must carry `name`, `description` and `developer_instructions`.** Missing `name`
  gives "must define a non-empty `name`"; missing `description` gives "agent role `p` must define a
  description". `CODEX_REQUIRED_ROLE_KEYS` in
  `packages/compile/src/providers/codex/agent-role-toml.ts` is the roster, and the renderer emits
  all three unconditionally.

- **`model_reasoning_effort` is accepted; `effort` is rejected.** A role carrying `effort = "high"`
  is dropped whole; the same role carrying `model_reasoning_effort = "high"` registers. All five
  levels this product expresses (`low medium high xhigh max`) registered. **Registering is not
  resolving** — the deserializer takes the value as a string and accepts one no vocabulary
  contains, which is what check 4 exists to settle.

- **The role id is the `name` key, not the filename.** A role in `anything.toml` naming itself
  `proj-role` reaches `spawn_agent` as `proj-role`.

---

## What this page is not

It does not re-check anything the suites already hold: registration, the three offered placements
and the refused fourth, the Claude installation staying byte-identical, uninstall's counts, the role
files, the two notices, or trust being written. Those are in `e2e/lifecycle/codex-*.e2e.test.ts` and
`e2e/smoke/codex-*.smoke.test.ts`, and a failure there is a bug rather than a question.
