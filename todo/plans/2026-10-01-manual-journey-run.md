# Manual journey run, 2026-10-01 (release 0.165.0)

Owner, 2026-10-01: _"run through manually the user journeys file. You need to do this yourself and not just
run tests. You need to actually mount the CLI, run through it yourself manually. And do the same with the
cross web flows."_

**How it was run.** Every row of
[`packages/cli/.ai-docs/standards/e2e/user-journeys.md`](../../packages/cli/.ai-docs/standards/e2e/user-journeys.md)
was performed by hand. That means the built CLI at commit `3ecb959a` (0.165.0), with its interactive wizard
driven key by key in tmux. The editor dev server and the local worker were used through a real browser
(Playwright's Chromium, one screenshot per step, each looked at before the next click). The pinned
`@openai/codex` 0.155.1 and the real Claude Code 2.1.287 were used where a journey reaches a host. Every run
used its own scratch HOME, and no test suite was run. Eight lanes ran in parallel. Each lane's full table, exact
reproductions and corrections are in [`2026-10-01-manual-journey-run/`](./2026-10-01-manual-journey-run/).
The screenshots stayed in the session scratchpad.

**Nothing was fixed.** Per the standing rule, sweep findings are compiled and root-caused with the owner before
anything is patched.

## Verdicts

68 rows. Journeys 10, 13, 21 and 24 were driven by two lanes each (CLI half and editor or host half), and each
counts once here.

| Verdict                            | Journeys                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **FAIL** (5)                       | 8, 23, 29, 30, 48                                                                                                       |
| **PARTIAL** (14)                   | 14, 18, 25, 26, 38, 39, 42, 52, 64, 66, 67, 68, 69, 79                                                                  |
| **PASS, signed-out half only** (2) | 49, 50. The signed-in half is BLOCKED at GitHub's login; no credential exists and no session was faked                  |
| **N/A** (1)                        | 47 (its subject is the test harness)                                                                                    |
| **PASS** (46)                      | Every other row. Journey 76 passes with one BLOCKED leg: whether a real model follows a role needs a Codex subscription |

| Lane        | Rows                                         | Result                                                          | Record                                                           |
| ----------- | -------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| wizard      | 1, 2, 3, 4, 6, 9, 12, 15, 16, 40, 41         | 11 PASS                                                         | [wizard.md](./2026-10-01-manual-journey-run/wizard.md)           |
| lifecycle   | 7, 8, 10, 11, 14, 19, 36–39, 42, 43, 52, 53  | 8 PASS, 5 PARTIAL, 1 FAIL                                       | [lifecycle.md](./2026-10-01-manual-journey-run/lifecycle.md)     |
| modes       | 5, 17, 10 (refresh), 21 (plugin), 79         | 4 PASS, 1 PARTIAL                                               | [modes.md](./2026-10-01-manual-journey-run/modes.md)             |
| marketplace | 18, 20, 21, 22, 26, 28, 28a, 33, 35, 47      | 7 PASS, 2 PARTIAL, 1 N/A                                        | [marketplace.md](./2026-10-01-manual-journey-run/marketplace.md) |
| share       | 13, 13a, 13b, 24, 29, 31, 32, 34, 45, 82, 83 | 10 PASS, 1 FAIL                                                 | [share.md](./2026-10-01-manual-journey-run/share.md)             |
| codex       | 64–69, 75, 76, 78                            | 4 PASS, 5 PARTIAL (one leg BLOCKED)                             | [codex.md](./2026-10-01-manual-journey-run/codex.md)             |
| crossweb    | 13, 23, 24, 25, 27, 30, 44, 46, 48           | 5 PASS, 1 PARTIAL, 3 FAIL                                       | [crossweb.md](./2026-10-01-manual-journey-run/crossweb.md)       |
| browser     | 49, 50, 51, plus the editor's everyday walk  | 3 PASS on the signed-out halves, 2 BLOCKED; walk 8 PASS, 3 FAIL | [browser.md](./2026-10-01-manual-journey-run/browser.md)         |

## Defects, grouped by root cause

Each item names the lane file and defect id that holds its exact reproduction.

**1. A project-run payload carries only the project's half.** This is the most serious finding. `share`
and `edit --ui` run from a project over a global installation mint a payload whose per-agent assignments name
only the project's sub-agents. The global sub-agents' skill lists live in the global `config.ts`, and the
payload builder reads only the project's. A reinstall compiles those sub-agents with no skills. `edit --from`
applied back strips a skill the user never touched from every agent, and its confirmation does not disclose
it. This is the editor's default flow, because the Install dialog tells users to run `init --from` inside a
project. Sharing from `$HOME` is correct. Journeys 23, 29 and 30. share #1, crossweb D5.

**2. A path resolved for project scope while running from HOME.** These are the CLI-895 class.

- CLI-901, confirmed: a global uninstall leaves the ejected skills in `$CODEX_HOME/skills`.
- A global Codex install from HOME writes a trust entry for HOME itself. codex D2.
- The global eject install reports `~/.agents/skills` where it wrote `~/.codex/skills`. codex D3.

**3. A Codex role file is not an `.md`.** This is the CLI-896 class, one surface over: `list` reports
`Agents: 0` on every Codex installation. codex D1.

**4. A project operation writes global state it should not.**

- Journey 8: a project edit dropping the project half of a `[P][G]` pair overwrites the global
  `~/.claude/skills/<id>/` with the project's copy, losing the user's global edits without a word. lifecycle D1.
- After `s` collapses a pair to global, the global row is left unlocked on the Sources step, so a project edit
  can switch the GLOBAL install to plugin mode. That ends at exit 5 with a stale ejected copy left behind, and
  `doctor` reports it clean. wizard D1.
- Observations for the owner to rule on (they contradict no row): a project-only `edit` adds a `marketplaceName`
  line to the global `config.ts` (modes), and a project install rewrites the global selected domains
  (marketplace O1).

**5. A config that cannot be read, or two layouts at once.**

- The settings reader treats an empty or schema-invalid `config.ts` as absent. `search` then answers from the
  public catalogue, and `eject templates` writes a project config and exits 0. lifecycle D3.
- `uninstall` is not refused when a scope holds both source folders. It deletes the live
  `.agents-inc/claude/` and leaves `.claude-src/` behind, which `list` then reports as an installation with 0
  agents. lifecycle D7, journey 52.
- Under a global install, `doctor` misreports a project whose `config.ts` was deleted. lifecycle D2, journey 14.
- Every rewrite drops `branding`. lifecycle D4, journey 42.

**6. Custom marketplaces.**

- An unbuilt custom marketplace is labelled "Agents Inc" by `search` and the confirm screen. marketplace D1.
- With no `marketplace.json`, the wizard preselects Plugin and then fails after confirm. marketplace D2.
- `init --marketplace Y` in a project over a global install is silently ignored. marketplace D3.
- `share` of an eject install from a custom marketplace omits the marketplace, so the id installs 0 skills.
  marketplace D4.
- Slugs are not namespaced, so two marketplaces collide on slug. Every scaffold ships `example-skill`, so this
  will be common. marketplace D5.
- A false "assigned to no sub-agent" warning. marketplace D6.
- Two refusal messages name remedies that don't apply. marketplace D7.

**7. The editor's preview is not the install (journey 48).**

- CLI-898 is not live: the published `catalog.json` was last built 2026-09-06 and needs the owner's rebuild.
- Skill order differs per agent.
- The preview omits the project `config.ts`/`config-types.ts` pair and an ejected skill's `metadata.yaml`.
- `SKILL.md` `name:`, `config-types.ts` grouping and `config.ts` field placement are drawn differently.

crossweb D1–D4. The journey's spec never runs the editor's preview code, which is why it reads COVERED.

**8. Codex, other.**

- A Codex uninstall deletes an empty `.claude/` it never made, and misjudges a Claude one. codex D4.
- With both installations in one scope, `doctor` checks only the Claude one and has no `--provider`.
  codex D5, journey 64.

**9. The Claude trust notice.** `edit` writes writing sub-agents into an untrusted project and prints no trust
line. That includes `init` routed to the dashboard under an existing global install. Only `init` (fresh
install) and `compile` print it. modes #1, journey 79.

**10. Editor UI.** browser D1–D9.

- Dark theme makes these unreadable: the Install button's counts, the Send hint, the output preview's code and
  the pinned placeholder.
- Keyboard focus lands on controls hidden under the docked composer.
- The Add skill dialog loses focus on close.
- The signed-out composer says "nothing was sent" after sending.
- The nav highlight drops when the URL carries a query.
- The blocked-Install label overflows.
- The install footer wraps the `edit` command.

**11. Minor.**

- A refused `compile` rewrites `config-types.ts` first. share #2.
- The startup band contradicts itself about a missing stack skill. lifecycle D5.
- A false "No agents found to recompile". lifecycle D6.
- `edit --ui --from` suggests an apply that refuses. crossweb D6.
- The CLI ignores `NO_COLOR`.
- The printed editor link is fixed to production, so ids minted on a local worker cannot be opened from it.

## Journey rows that do not describe the product

These are documentation corrections, owed to `user-journeys.md` by whoever takes this up.

- **Rows that read COVERED while their journey fails or is partial:** 8, 14, 29, 48 and 52. Each row's spec
  misses the defect above.
- **Blocked on CI only:** rows 5, 10 and 17 read as blocked. They drive fine on a machine with `claude`.
- **Row 17's "or a global edit that owns both scopes":** that route does not exist.
- **Row 31:** `edit --ui --from` is not refused.
- **Row 38:** `uninstall` deliberately carries on over an unreadable config.
- **Row 39:** that case reports on the startup band, not a toast.
- **Row 42:** `branding` does not survive a rewrite.
- **Row 45:** the update-check can write `~/.cache/agents-inc/version`.
- **Row 64:** `doctor` does not report every installation in the scope.
- **Row 67:** the global ejected-skill cleanup is CLI-901.
- **Row 69:** since CLI-893 the install does edit the user's global Codex config.
- **Row 16:** the empty partition is an omitted `stack` key, not `{}`.

## Environment notes for the next run

- The local worker has no skill index, so `GET /skills` answers 503. Journey 25's search was driven against
  production's published index served for that one request.
- The editor fetches `catalog.json` from GitHub directly.
- `tmux capture-pane` needs `-e` to see colour-only selection.
- A 60-row pane is too short for the full Web grid.
