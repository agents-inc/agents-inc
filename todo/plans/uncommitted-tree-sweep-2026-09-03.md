# Sweep of the uncommitted tree — 2026-09-03

A read-only verification pass over everything uncommitted, dispatched as eight parallel lanes after
the carried-id collision fix landed. **Document-first**: every lane reports and nothing is patched
until the findings are compiled and root-caused with the owner.

## Why now

The tree carries 128 changed files — ~4,700 insertions against ~6,500 deletions — spanning the agent
template consolidation, the two summoner prompt rewrites, the frontmatter schema contract, the
compile/resolve/load path, the editor's output preview, and both documentation trees.

**Every repo gate was green when the lanes were dispatched**, which is the whole reason for the
sweep. Re-derive rather than trusting this list:

```
bun run test          # unit
bun run test:e2e      # e2e
bun run typecheck && bun run lint && bun run format:check
bun run generate:schemas:check && bun run generate:types:check
```

A green suite is the condition under which a weakened assertion, a lost instruction and a stale
document are all invisible. Each lane was briefed on what the gates cannot see rather than on the
diff as a whole.

## Lanes

| #   | Subject                                                                    | Primary files                                                                                                                                |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The carried-id collision guard that landed today                           | `src/cli/lib/seed/external-skills.*`, `e2e/commands/init-from-external-skills.e2e.test.ts`, the two `registerExternalSkillsOrFail` docblocks |
| 2   | Agent template consolidation — six methodology partials deleted, one added | `src/agents/_templates/**`, `packages/compile/src/agent-source.*`, `generated/corpus.ts`, the agent-template specs                           |
| 3   | The two summoner prompt rewrites                                           | `src/agents/meta/**`, `pm/playbook.md`, four changed `metadata.yaml`                                                                         |
| 4   | Frontmatter schema contract, types, vendored drift                         | `src/schemas/*.json`, `lib/schemas.ts`, `types/{agents,matrix}.ts`, `packages/matrix/src/**`                                                 |
| 5   | Compile / resolve / load pipeline                                          | `commands/compile.ts`, `lib/resolver.ts`, `lib/loading/loader.ts`, `lib/stacks/stacks-loader.ts`, `lib/agents/**`                            |
| 6   | Editor preview parity — journey 48                                         | `apps/editor/src/features/configure/lib/output-preview.*`                                                                                    |
| 7   | Documentation accuracy, public and internal                                | `packages/cli/.ai-docs/**`, `apps/www/src/content/docs/**`, `packages/cli/CLAUDE.md`                                                         |
| 8   | Test harness, fixtures and E2E specs                                       | `e2e/**`, `src/cli/lib/__tests__/**`, `scripts/**`                                                                                           |

Lanes are read-only, so the usual file-ownership rule is a de-duplication measure rather than a
write-conflict one. Where two lanes touch one file the brief names which owns it and tells the other
to report rather than investigate.

## Corrections, one line per lane as it lands

The required field of every report: what the brief claimed that the tree contradicted. Accumulated
here because the rate is a fact about a programme, and nothing turns a per-dispatch answer into one
unless it is written down as each lane lands.

| Lane                       | Correction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — collision guard        | **Two.** (a) "full E2E (254 files)" is off by three — `find e2e -name '*.e2e.test.ts' -o -name '*.smoke.test.ts' \| wc -l` returns **257**; the 254 figure was the `e2e` project alone, not the tree. The unit figure (227) held exactly. (b) The brief carried the finding's framing that reading the loaded matrix is the guard's one difference from `refuseCatalogueCollisions`. It is also its one **weakness** — `payload.marketplace` steers the load. That framing is what hid S1, and it is on disk in the finding and the archive entry.                                                                                                                                                                                                                                  |
| 2 — template consolidation | **Three.** (a) The brief's grep is not a partial census — most hits are retired _skill ids_ (`meta-methodology-anti-over-engineering` and siblings) in factories and bibles, retired long before this diff and unrelated to it. (b) The brief said two of the five markdown partials are optional; the template now guards **three** — `output` gained `{% if output != "" %}` in this diff and is not on `agent-partials.test.ts`'s `OPTIONAL_PARTIALS` roster. (c) "`agent.liquid` changed by ~152 lines" is the `--stat` churn figure; the file went 161 → 69 lines.                                                                                                                                                                                                             |
| 7 — documentation          | **Three.** (a) The brief called the frontmatter-schema finding open; it is **closed** in the working tree — both keys are in both JSON schemas. (b) The brief said to check the public docs against "the actual schemas (`src/schemas/`)"; those are **generated** from `agentYamlGenerationSchema`, not hand-written, so the lane checked both the JSON and the Zod source. (c) "~169 lines changed" in `sub-agent-anatomy.md` is the diffstat's combined figure against a 222-line file — closer to a rewrite than an edit; the lane read it whole rather than as a diff.                                                                                                                                                                                                         |
| 3 — summoner prompts       | **Three.** (a) The brief listed "four changed `metadata.yaml`" and then named five; five is right. (b) "lost ~1,609 and ~1,546 lines" are `--stat` _churn_ figures, not deletions — `--numstat` gives 1,398 deleted from each, against 211 / 148 added. (c) The focus list `src/agents/meta/**` does not cover the whole `src/agents` diff: `_templates/agent.liquid` and the six deleted partials are in it, and every structural claim in `agent-summoner/playbook.md` is a claim about that template.                                                                                                                                                                                                                                                                            |
| 8 — test harness           | **Four, one of them a hole in the brief's own method.** (a) The brief's `git diff HEAD --stat` command shows **none** of the five untracked files it then lists by name — `text-scans.{ts,test.ts}` and the three new rule specs are `??`. Running only the stated command would have reviewed none of them; `git status --porcelain` is the invocation that covers both. (b) "Five findings filed today record this class" — there are **13** dated 2026-09-03. (c) The focus list omits four in-scope files no exclusion covers, and two findings came from the first of them. (d) `element-at.ts` was listed as new-or-changed; it is changed (gained `entryAt`).                                                                                                                |
| 4 — schemas                | **Three.** (a) The brief and the finding both call this a **two-key** class; `agent.liquid` gained **three** conditional emissions — `isolation`, `experimental` and `hooks`. `hooks` was never emitted at HEAD and is the one the schema work did not reconsider, so the class re-opens one level down at value level. (b) The finding's `partial_note` is stale on its own residue: it says `AgentFrontmatter` declares no `experimental`, and it declares one at `types/agents.ts`. (c) `types/matrix.ts` claims a widened `AGENT_ISOLATIONS` would make "the compiler name every site" — reproduced as **zero** `tsc` errors, because `satisfies z.ZodType<T>` is covariant. The claim is vendored verbatim into `packages/matrix`, so correcting it obliges `generate:matrix`. |
| 5 — compile pipeline       | **One, plus a scope clarification.** Every figure in the brief held exactly. The brief's `git diff` file list excluded four modified test files (`resolver.test.ts`, `loader.test.ts`, `stacks-loader.test.ts`, `compiler.test.ts`) — all reviewed separately; `compiler.test.ts`'s `SHIPPED_TEMPLATE_SECTIONS` roster moved in this round too.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 6 — editor parity          | **Three, one of them load-bearing.** (a) The brief listed the mirrored spread set as four fields; the e2e docblock it pointed at names **five**, including `effort` — and `effort` is the one that is not mirrored. Reading the brief's list as the whole set would have missed the lane's only real defect. (b) The brief said the old usage line "used a derived sentence"; it was `` `when working with ${category}` `` — lowercase, no leading "Use", no full stop — so it differed from the CLI in three ways and dropped `usageGuidance` entirely. (c) The brief asked whether "the new imports" reach the eager graph; there is exactly one new **type** import, so the question had no runtime subject.                                                                     |

## Findings

Compiled after all eight land, ranked, root-caused, and taken to the owner before any patch.

### Confirmed by hand, blocking

**S1 — `payload.marketplace` steers the catalogue the collision guard measures against.**
`sharedConfigSourceFlags` in `commands/init.tsx` passes `payload.marketplace` to the loader, so the
payload chooses which matrix `claimingACatalogueId` asks. A payload naming any marketplace that does
not ship the id it is impersonating finds no incumbent and installs. **Reproduced 2026-09-03**: id
`T-KmG-cT`, `marketplace` set to a local custom marketplace and `external` keyed
`web-framework-react` — exit 0, and `~/.claude/skills/web-framework-react/SKILL.md` holds
`IMPOSTOR-SENTINEL`. This is the original repro with one extra field, so the guard as landed does
not close the defect it was written for. `refuseCatalogueCollisions` reads `BUILT_IN_MATRIX`
precisely because it is unforgeable; the incumbent set wants to be the union of the two, not either.

**S2 — the `local` carve-out exempts a hand-authored skill, and the install then claims it.**
`mergeLocalSkillsIntoMatrix` writes `local: true` on every skill it merges, so the exempt population
is three groups rather than one: a re-applied carried skill (intended), an ejected catalogue skill,
and the user's own hand-authored skill. **Reproduced 2026-09-03**: id `sFjCLifA` over a hand-written
`.claude/skills/my-house-style/` — exit 0, `SKILL.md` replaced with the payload's content, and
`metadata.yaml` stamped `forkedFrom: { source: github:acme/hijack }`. `forkedFrom` is the one signal
that says the CLI owns a directory, so the user's work is not merely overwritten but transferred to
the round trip, which `uninstall` may delete and `share` will carry. Contradicts journey 34.
**Pre-existing rather than a regression** — the guard only ever adds refusals — but it is the same
question the guard's carve-out turns on, so it belongs to the same ruling.

The precise discriminator for "a carried skill a previous apply wrote" already exists and is not
`local`: it is `forkedFrom.path`, written only by `registerSkillOnDisk` and read by
`readCarriedSkill` for this exact question. It is not on `ResolvedSkill` today, so using it needs
either a disk read in the guard or a provenance field on the merged entry — an owner call, and the
same one the finding's Open Question is already waiting on.

### Product defects — user-visible, ranked

**P1 — the collision guard is bypassable** (S1 above). Confirmed by hand, id `T-KmG-cT`.

**P2 — `compile` at home and `compile` in a project fight forever.** `usage` was a pure function of
the stack's category key and is now a function of the SEATED matrix, and the change seats one path.
`recompileRegisteredProjectAgents` inherits whatever the triggering command seated, so a global
`compile` rewrites every registered project's agents against the HOME matrix — degrading every
dynamic-skill line for a project on a non-default marketplace, and ping-ponging with the project's
own `compile`. The sibling hazard is already guarded one line away: `skills` is passed explicitly
there, with a docblock saying why.

**P3 — a failed matrix seat now writes wrong type unions and propagates them.** The load used to sit
inside `refreshConfigTypes`' `try`, so a failure warned and wrote nothing. `seatMatrixForPass` now
swallows it and the refresh proceeds against `BUILT_IN_MATRIX`, regenerating `config-types.ts`
without any marketplace-only category and fanning it into every registered project. A transient
network failure turns into a `config.ts`/`config-types.ts` pair that does not typecheck. **The
docblock claims the opposite**, and is right about the render half only.

**P4 — the CLI compiles an agent it then refuses, after silently deleting the user's hook.**
`agentYamlConfigSchema.hooks` is lenient and `agentFrontmatterValidationSchema.hooks` is strict, and
`agentHookDefinitionSchema` is a bare `z.object`, so a flat action list is stripped to `{}` with no
error, emitted, and then refused by `doctor` and by `compileAgentPlugin`. Latent for shipped agents;
live for a user's `.claude-src/agents/` and for a marketplace agent — the consumption direction.

**P5 — journey 48 is broken by one field.** The editor's `compileAgents` forwards `agent.effort`
without `resolveAgents`' `?? definition.effort` fallback, so a `metadata.yaml` carrying `effort`
renders on install and not in the preview. Fifth member of the set this diff was fixing.

**P6 — the reviewer is told to record findings with tools the same commit removed.** Confirmed by
census: it is the only agent in the tree lacking both write tools while carrying a findings
instruction. Its two available branches are to drop the finding or to shell it out through `Bash`,
which is the door the narrowed grant was opened to shut.

**P7 — `init --from` churn.** Confirmed: `compile` reports `1 global agents rewritten` immediately
after a clean install, no config change. Three definitions of one usage sentence are reachable in
one install.

### Owner rulings owed

1. The `external-` namespace question (CLI-885, already filed).
2. The carve-out's discriminator — `local` is a class the guard did not mean to exempt; the precise
   one is `forkedFrom.path`, which is not on `ResolvedSkill` today.
3. **"Never invent work to make the instruction true, and never quietly widen it"** — deleted from
   every compiled agent with no decision recorded, while every other cut in the pass is logged.
4. Verification-with-evidence (`state each criterion, how verified, evidence, PASS/FAIL`) left the
   baseline and survives in six of eighteen agents. Also unlogged.

### Test integrity — the green suite is hiding these

Each carries a mutation that should redden and does not: `generate:matrix:check` blind to all three
new field mappings; the loader roster declaring `experimental` and asserting six fields; the
narrowed presence roster leaving both conditional partial assertions to pass over an empty set;
`omitsWhenAbsent` asserting template TEXT so moving the guard inside the wrapper stays green; the
default-preserving model assertion still undiscriminating at the unit layer; `hooks` — the widest
blast radius of the three new keys — absent from the acceptance spec that names itself for them.

### Documentation

**Public (`apps/www`): no defects.** Every claim in `sub-agent-anatomy.md` re-derived and held,
including the 11 keys in emission order, the 13/4/1 agent split, and the `hooks:` line byte for
byte. The `usageGuidance` correction was swept completely.

**Internal:** `model-and-effort.md` justifies a test-design choice with a fact today reversed
(`api-tester` is no longer `sonnet`) — the highest-severity doc finding, because an agent reading it
preserves a fixture choice whose reason has evaporated. `core-types.md` rosters 8 of 11
`BaseAgentFields`. `DOCUMENTATION_MAP.md`'s counts fail their own census (447/199 vs 458/208).
`code-generation.md` quotes `localeCompare` as live, which the root `CLAUDE.md` bans.
`config-writer.md` keeps a retired-symbol sentence the same pass swept from three siblings.
`CLAUDE.md` says "five modules assemble a stack" where its own census returns eight.

### What held

The template consolidation is sound — no dangling `{% render %}`, no surviving reference to a
deleted partial anywhere in the repo, corpus faithful and byte-compared, optional-partial guards
intact. All three vendored type copies byte-identical, all four generator checks green, three
workspace typechecks clean. The share round trip still reproduces byte-identically.

## Queue — lanes still owed, in order

Serialized on `packages/cli/dist/`: `tsup` builds with `clean: true`, so exactly one CLI lane runs
at a time. Check liveness by the agent transcript's mtime, never by waiting for a notification.

| #   | Lane                                                                                                                                                           | State                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 4   | schemas — `hooks` asymmetry, `z.literal`→`z.enum`, `.strict()` placement, loader roster, four contradicting docblocks                                          | **in flight**                              |
| 4.5 | **CLI-888** — `propagateGlobalChangesToProjects` derives a project's `config-types.ts` unions from the TRIGGERING command's matrix, plus an E2E regression leg | **queued** (owner asked for it 2026-09-03) |
| 5   | prompts + test integrity — P6 reviewer playbook, summoner prompt items, F1/F3–F7                                                                               | queued                                     |
| 6   | docs follow-up — the six documents batch 3's fix invalidated, listed verbatim in its report                                                                    | queued                                     |

### Prep already done for lane 4.5, so it is not redone

Reproduced against the FIXED binary at `scratchpad/pingpong2`: a project holding a skill that is in
`config.skills` but in no agent's stack loses its category and domain from the project's own
`config-types.ts` on every global fan-out, and the project's next `compile` puts them back.

```
after GLOBAL compile:   export type Category = GlobalCategory | 'web-tooling'
after PROJECT compile:  export type Category = GlobalCategory | 'meta-methodology' | 'web-tooling'
after GLOBAL compile:   (byte-identical to the first — the two commands fight)
```

The subject file is `src/cli/lib/config-gate/propagate.ts` — `buildProjectTypesExtras(inlinedProjectView(...), matrix)`
feeding `deriveCategories` / `deriveDomains`, and the same matrix driving `reconcileProjectSplitAgainstGlobal`.
`pruneGlobalEntriesFromRegisteredProjects`, reached from `propagateGlobalRemoval` on a global
uninstall, has the identical shape and must be fixed or explicitly excluded with a reason.

**Why it is bigger than the fan-out seat that preceded it**, and why it was split out rather than
folded in: the same value also decides which project entries survive reconciliation, so it changes
what `init`, `edit` and `uninstall` propagate, not only `compile`.

**Where the E2E leg goes.** A new spec file fails `src/cli/lib/__tests__/spec-gates.test.ts`, which
requires every collected spec to be named on `.ai-docs/standards/e2e/user-journeys.md` — batch 3 hit
this and had to move its case. Four rostered candidates already exist, verified 2026-09-03:
`lifecycle/project-tracking-propagation`, `lifecycle/edit-global-propagates-to-every-registered-project`,
`lifecycle/edit-global-agent-removal-propagation`, `lifecycle/edit-project-source-migration-propagates`.
Three siblings are NOT named and are therefore in `SPECS_BELONGING_TO_NO_JOURNEY`, which may only
shrink — do not add to it.

The regression assertion is the one no config-level check can make: **`config-types.ts` byte-identical
across global → project → global**, which is the comparison that catches a difference consistent
within each installation.
