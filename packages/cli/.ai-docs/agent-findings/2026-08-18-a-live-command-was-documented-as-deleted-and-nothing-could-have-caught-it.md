---
type: convention-drift
severity: high
affected_files:
  - .ai-docs/reference/commands/index.md
  - .ai-docs/reference/commands/edit.md
  - src/cli/commands/new/marketplace.ts
  - src/cli/commands/eject.ts
  - src/cli/commands/compile.ts
  - scripts/check-enumeration-drift.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The documentation side landed first — `reference/commands/index.md` carries `new marketplace`, the
  corrected eject destinations, the corrected search column heading and the `build marketplace`
  identity refusals, with five more of its exhaustive lists bound to source in the drift registry.
  The two code-side defects it named as outstanding then landed as well. `compile`'s no-skills
  refusal moved into `ERROR_MESSAGES.NO_SKILLS_TO_COMPILE` and now names `init`, pinned end to end
  by `e2e/commands/compile-no-skills-refusal.e2e.test.ts`, which invokes the command the refusal
  printed rather than a hardcoded one. `eject`'s `--output` description no longer promises a default
  the flag does not declare nor names one of three destinations, pinned by two specs in
  `eject.test.ts` reading the flag's own `description`; the page's "read the table, not the help
  text" warning is gone with the reason for it.
---

## What Was Wrong

**A live command was documented as deleted, in the document whose whole subject is the command
roster.** `reference/commands/index.md` carried a callout reading "Four commands were removed and
none has a replacement invocation. `import skill`, `new skill`, `new marketplace` and `new agent` no
longer parse — oclif exits `127` on each … **There is no `src/cli/commands/import/` or
`src/cli/commands/new/` directory**". Three of those four claims are true. The fourth is not:

- `src/cli/commands/new/marketplace.ts` exists, 127 lines, `export default class NewMarketplace`.
- `agents-inc new marketplace --help` exits `0` and prints its arg and description.
- `agents-inc --help` lists `new` as a topic, beside `build`.
- It has a dedicated E2E arc, `e2e/commands/new-marketplace.e2e.test.ts`, with three `describe`
  blocks, and `standards/e2e/user-journeys.md` calls it journey 35 and says outright that it is
  "NOT withdrawn: it is live".
- `reference/dependency-graph.md` lists it in two tables.

So four documents on disk knew, and the commands index — the one a reader opens to ask what commands
exist — asserted the opposite, along with a directory-does-not-exist claim that is checkable in one
`ls`. The command was also absent from the Commands Index table and from the Operations Layer Usage
table, so nothing else on the page contradicted the callout.

**Why nothing caught it.** Every mechanism guarding this page guards a list bound to an exported
symbol: `scripts/check-enumeration-drift.ts` names `(file, symbol)` or `(file, exports)` and
compares against a delimited document section. **A command roster is neither.** It is the membership
of a _directory_, `src/cli/commands/**`, which `oclif.commands.strategy: "pattern"` turns into the
command list at runtime. No registry row can express that, so the one claim on the page whose source
is a filesystem walk is the only one with no binding — and it is the claim that went wrong. The same
hole means a command _added_ tomorrow is undocumented by default and silently so.

**Four more false claims on the same page, all re-derivable in one read:**

| Claim as written                                                              | What the source does                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search` prints columns `ID`, `Name`, **`Source`**, `Category`, `Description` | The column's `key` is `source` and its rendered `name` is **`Origin`**. The doc named the key and called it the heading                                                                                       |
| `eject --output` "Output directory (default: `.claude/`)"                     | `resolveOutputBase` returns `.claude-src/`; `eject skills` ignores that base entirely and writes `LOCAL_SKILLS_PATH` (`.claude/skills`). Three eject types, three destinations, no `.claude/` root among them |
| `SHARED_CONFIG_APPLY` holds five members                                      | Seven. `GLOBAL_SKILLS_HEADING` and `GLOBAL_AGENTS_HEADING` were missing — and `commands/edit.md` had been naming both all along, so the two pages disagreed                                                   |
| `sharedConfigProjectScopeAtHome` is called from `init`                        | It is called from `base-command.ts`, and reached by **both** `init --from` and `edit --from`. (Repaired concurrently by a sibling agent mid-pass; recorded here because it is the same class as the rest)     |

`eject`'s three refusals (missing `type`, unknown `type`, `--output` resolving onto an existing
file — all `EXIT_CODES.INVALID_ARGS`), its `~` expansion, and `build marketplace`'s three
`package.json` identity refusals were documented nowhere.

**A second writable copy of one list.** The page restated the five `EXIT_CODES` members as a bullet
list. `reference/utilities.md` owns `lib/exit-codes.ts` per `DOCUMENTATION_MAP.md` and carries the
same five as a table — the exact "two writable copies" condition documentation-bible.md forbids,
sitting in plain sight because neither copy was registered.

**Two source-side defects found while re-deriving, both user-visible:**

- **`eject`'s `--output` help text names a directory the command does not use.** The flag declares
  `"Output directory (default: .claude/ in current directory)"`; `resolveOutputBase` returns
  `path.join(projectDir, CLAUDE_SRC_DIR)`.
- **`compile`'s no-skills refusal hands the user a command that does not exist.** It reads
  `No skills found. Add skills with '<bin> add <skill>' or create in .claude/skills/.` There is no
  `add` command and there never has been — `agents-inc add x` exits `127`. The message names an
  unusable invocation at the one moment the user needs a usable one; `init` or `edit` is the answer.

## Fix Applied

**Documentation (landed).** In `reference/commands/index.md`: `new marketplace` added to the
Commands Index and to the Operations Layer Usage table, given a full `## New Subcommands` section
(args, the deliberate absence of flags, both refusals with their exit codes, the five-step flow,
dependencies), and the removal callout rewritten to three commands with an explicit second paragraph
stating that `new marketplace` is live and naming the four independent pieces of evidence. `share`
added to the Operations Layer Usage table, where it had also been missing. The `search` column
heading corrected to `Origin` with the key/heading trap called out. The `eject` section given a
per-type destination table, its three refusals, and a note that the flag's own description is stale.
`build marketplace` given its three identity refusals. `SHARED_CONFIG_APPLY`'s membership repaired.
The `EXIT_CODES` bullet list replaced by a pointer to `reference/utilities.md`, which owns it.
`BaseCommand`'s narration table given the `refuseProjectScopedContentAtHome` row.

In `reference/commands/edit.md`: the `--from` inbound-half table now carries
`refuseProjectScopedContentAtHome` as its own step between the decode and the skip warnings — the
position the source puts it in and the reason it can be no earlier — with the following steps
renumbered and the step-4 cross-reference inside them updated; `base-command.ts`'s dependency list
now names it.

**Enforcement (landed).** Five registry rows added to `scripts/check-enumeration-drift.ts` —
`ERROR_MESSAGES`, `SUCCESS_MESSAGES`, `INFO_MESSAGES`, `UNINSTALL_PLAN` and `SHARED_CONFIG_APPLY` in
`reference/commands/index.md` — so all six constant objects of that one table are bound to source
rather than one of the six. The negative control: renaming `SHARED_CONFIG_APPLY.GLOBAL_SKILLS_HEADING`
to `GLOBAL_SKILL_HEADINGS` in the working tree made the new row report
`namedButAbsent: ['GLOBAL_SKILLS_HEADING'] | presentButUnnamed: ['GLOBAL_SKILL_HEADINGS']`, and
reverting returned the whole registry to clean.

**Source (landed later, by `cli-developer`).** Both defects above are fixed. `compile`'s refusal
became `ERROR_MESSAGES.NO_SKILLS_TO_COMPILE` — `No skills found. Run '<bin> init' to choose skills,
or add your own under .claude/skills/.` — naming `init` because the refusal is only reachable after
an installation was detected, which is the state `doctor` already reports as `config-empty` and
names `init` for. `eject`'s `--output` description became `Write everything into this directory
instead of each eject type's own destination`, which promises no default and names none of the three
destinations, so the reference page's "read the table, not the help text" warning went with it.

The proof is the shape the deletion callout above earns: `e2e/commands/compile-no-skills-refusal.e2e.test.ts`
drives `compile` to the refusal and then **invokes the command the refusal printed** — the same
constant, not a hardcoded name — asserting the binary answers it. That is the check a sentence about
what does not exist has to carry, run rather than read.

## Proposed Standard

**1. The command roster needs a binding, and it cannot be a registry row.**
`scripts/check-enumeration-drift.ts` reads exported symbols; a command roster is directory
membership. Two options, and the first is small:

- Widen `SourceEnumeration` with a third shape — `{ dir: string; as: "command-ids" }` — that globs
  `src/cli/commands/**/*.{ts,tsx}` (minus `.gitkeep` and specs), maps each path to its oclif id
  (`build/marketplace.ts` -> `build marketplace`), and compares against a `table-rows` section. It
  is the only enumeration on the page whose source is a filesystem walk, and it is the one that
  broke.
- Or assert it from the built CLI: one E2E case running `--help` and each topic's `--help`, diffed
  against the Commands Index table. `e2e/commands/help.e2e.test.ts` already runs
  `new marketplace --help`; it does not compare the roster to any document.

Either belongs in `standards/documentation-bible.md` § "A Count Lives in Exactly One Document",
which currently ends at "a new exhaustive claim adds a row to it rather than a promise in prose" —
true, and silent on the claims no row can express.

**2. Add to that section: name the claims that CANNOT be registered, and where each is verified
instead.** The registry's guards make some lists unregisterable by design — a spread or computed key
is a hard failure. `edit`'s `static flags` carries `[EDIT_PROJECT_SETUP_FLAG]`, a computed key, so
`keysOf` would throw `UNREADABLE_MEMBER`; and no command's `static flags` is reachable at all,
because `declarationOf` walks only top-level variable and type statements, not class members. A
reader who tries to register a flag list should find that written down instead of discovering it
from a thrown error.

**3. A deletion callout must be re-derived, not carried.** "X was removed" ages differently from
every other claim: it is _correct when written_ and becomes _actively misleading_ the moment the
thing returns, and unlike a stale count it gives a reader positive instruction to stop looking. The
callout here survived `new marketplace`'s return through at least one validation pass. Proposed rule
for `documentation-bible.md`: **a sentence asserting that something does not exist carries the check
that proves it** — a path, a command and its exit code, or a symbol name — and any pass touching the
document re-runs that check rather than reading the sentence.

**4. Two `.ai-docs/` documents now hold each of five message-constant lists.**
`reference/commands/index.md` and `reference/utilities.md` both enumerate `ERROR_MESSAGES`,
`SUCCESS_MESSAGES`, `STATUS_MESSAGES`, `INFO_MESSAGES`, `UNINSTALL_PLAN` and `SHARED_CONFIG_APPLY`.
Both are now registered, which is the sanctioned treatment the script's own comment gives the
message-builder pair — but the bible's rule says one writable copy, and the script's practice says
two-registered-is-acceptable. One of the two should give. Whoever owns `utilities.md` and whoever
owns `commands/index.md` cannot settle it separately, which is precisely why it is written here.
