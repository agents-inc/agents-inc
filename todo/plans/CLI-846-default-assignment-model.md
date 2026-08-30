# Proposal — the default assignment model, in three tiers

**Status: proposal, nothing implemented.** Owner asked on 2026-08-30 for which sub-agents should get
which skills by default, and which arrive preloaded rather than lazy.

## What is actually there today, because "static" is only half right

The behaviour is **three layers**, not one, and only the third is hand-authored:

| Layer         | Where                                              | What it decides                                 |
| ------------- | -------------------------------------------------- | ----------------------------------------------- |
| **Reach**     | `targetsOf` in `read-model/assignment-defaults.ts` | which agents a skill lands on at all            |
| **Craft**     | `CRAFT_CATEGORIES_BY_FLAVOR` in the same file      | categories a role reaches with or without a row |
| **Eagerness** | `PRELOAD_DEFAULTS` + `hasDomainAffinity`           | preloaded or lazy, per pair                     |

Reach is already rule-driven: an implementation-domain skill reaches its own domain's agents plus
the two domainless role agents (`pm`, `reviewer`); `shared` reaches every non-meta agent; `meta`
reaches the flavors its row names, plus craft.

**The static part is the eagerness table — 140 hand-written rows over 238 skills.** A skill with no
row is lazy everywhere, which is the correct default and not the problem.

### The actual defect, and it is bigger than staleness

```bash
sed -n '/^export const PRELOAD_DEFAULTS/,/^}/p' packages/matrix/src/read-model/preload-defaults.ts | grep -c '"meta"'
```

**Zero.** No row names the `meta` flavor, and `CRAFT_CATEGORIES_BY_FLAVOR` has keys for `planning`
and `reviewer` only. `metaSkillReach` gives an agent a skill only when a row names its flavor or the
skill is one of its craft categories — so:

> **`agent-summoner`, `codex-keeper`, `convention-keeper` and `skill-summoner` receive nothing from
> any pick. Not preloaded, not lazy — they are not targets at all.**

Four of eighteen agents are outside the default system entirely. `meta-config-stack-detect` reaches
nobody for the same reason: meta domain, no row, no craft.

## The tiers

**Agents — 8 / 6 / 4.**

| Tier      | Agents                                                                  |
| --------- | ----------------------------------------------------------------------- |
| **Core**  | `{web,api,cli,ai}-developer`, `{web,api,cli,ai}-tester`                 |
| **Admin** | `{web,api,cli,ai}-researcher`, `pm`, `reviewer`                         |
| **Meta**  | `agent-summoner`, `codex-keeper`, `convention-keeper`, `skill-summoner` |

**Skills — the split already exists in the category prefix, which is what makes this mechanical
rather than a second hand-written table.**

| Tier      | Categories                                                                 | Count |
| --------- | -------------------------------------------------------------------------- | ----- |
| **Core**  | `web-*` `api-*` `cli-*` `ai-*` `mobile-*` `desktop-*` `infra-*` `shared-*` | 224   |
| **Admin** | `meta-reviewing-*` `meta-planning-*` `meta-methodology-*`                  | 11    |
| **Meta**  | `meta-design-*` `meta-config-*`                                            | 3     |

## The four rules

### Rule 1 — an admin skill is role-scoped by its own category

The catalog already names the role in the slug, so nothing needs authoring:

| Category                                | Reaches                 | Preloaded?                                              |
| --------------------------------------- | ----------------------- | ------------------------------------------------------- |
| `meta-reviewing-reviewing`              | `reviewer`              | **preloaded** — the process is every review's material  |
| `meta-reviewing-<domain>-*`             | `reviewer`              | lazy — one diff's material, per the activation protocol |
| `meta-planning-<domain>-*`              | `pm`                    | lazy — one spec's material                              |
| `meta-methodology-research-methodology` | the 4 researchers, `pm` | **preloaded** — how evidence is gathered, every session |

This is what the craft map already does for `pm` and `reviewer`. The change is stating it as the
rule rather than as an exception, and **removing `meta-design` from the reviewer's craft** — see
rule 2, which gives the reviewer those skills by a wider route.

### Rule 2 — a meta skill reaches every tier, because it is about how code reads

`meta-design-expressive-typescript` and `meta-design-composable-components` are not role material.
They say how code is meant to read, which is a developer's instruction, a reviewer's yardstick, a
convention-keeper's subject and a skill-summoner's house style.

| Skill                               | Reaches      | Preloaded on                                     |
| ----------------------------------- | ------------ | ------------------------------------------------ |
| `meta-design-expressive-typescript` | all 18       | Core developers, `reviewer`, `convention-keeper` |
| `meta-design-composable-components` | all 18       | `web-developer`, `reviewer`, `convention-keeper` |
| `meta-config-stack-detect`          | Admin + Meta | nobody — it is a one-session tool                |

`meta-config-stack-detect` reaching nobody today is a straight bug; it is exactly the skill a
`codex-keeper` or `pm` arriving at an unfamiliar repository wants.

### Rule 3 — core skills stay domain-scoped, and the researchers stay with their domain

Unchanged from today, and deliberately so:

- an implementation-domain skill reaches its own domain's Core agents, its own domain's researcher,
  and the two domainless role agents (`pm`, `reviewer`)
- `shared-*` reaches every Core and Admin agent — **and now the Meta agents too**, which is the
  second gap: `shared-tooling-eslint-prettier`, `shared-tooling-typescript-config` and
  `shared-lint` are `convention-keeper`'s literal subject and it cannot see them

**See the open question below** — this is the one place I have read your instruction narrowly.

### Rule 4 — the Meta agents get a floor instead of nothing

| Agent               | Preloaded                                                                                                 | Reaches lazily               |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `convention-keeper` | both `meta-design-*`, `shared-lint`, `shared-tooling-eslint-prettier`, `shared-tooling-typescript-config` | all `shared-*`, all `meta-*` |
| `codex-keeper`      | `meta-methodology-research-methodology`                                                                   | all `meta-*`, all `shared-*` |
| `skill-summoner`    | `meta-methodology-research-methodology`, `meta-design-expressive-typescript`                              | all `meta-*`, all `shared-*` |
| `agent-summoner`    | nothing                                                                                                   | all `meta-*`, all `shared-*` |

`agent-summoner` preloads nothing on purpose: it composes rosters, and every skill it reasons about
is a subject to look up rather than a habit to carry.

## Preloaded versus lazy — the principle, unchanged

The existing rule is good and I am not proposing to replace it:

> Preload what the role reaches for in **most** of its sessions. A skill that matters occasionally is
> worth loading when it does, not in every prompt. Setup skills are absent by rule — setting a
> project up is one session, never most of them.

Applied per tier:

| Tier      | Preload                                                                                      | Lazy                                                      |
| --------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Core**  | the domain's framework / meta-framework, the state kind, `meta-design-expressive-typescript` | every library, tool, and concern beneath them             |
| **Admin** | the framework (so the role knows what the project _is_), the role's own process skill        | the per-diff and per-spec playbooks, every depth question |
| **Meta**  | the one or two skills that are the agent's own craft                                         | everything else it can reach                              |

### What the eagerness table gets right, and the gap it exposes instead

I expected the tester rows to be inverted and they are not. All 38 tester rows check out, and **every
`*-testing-*` and `*-mocks-*` skill in the catalog already carries one**:

```bash
for s in $(grep -E '^(web|api|cli|ai|mobile|desktop)-(testing|mocks)-' <skill-ids>); do
  grep -q "\"$s\":.*tester" packages/matrix/src/read-model/preload-defaults.ts || echo "MISSING $s"
done
```

Empty. The table is doing its job.

**What that search exposes is a catalog gap, not a table gap.** Testing skills exist for `web`,
`mobile` and `desktop` only — there is no `api-testing-*`, no `cli-testing-*`, no `ai-testing-*`. So
of the four testers:

| Agent        | Preloads                                             |
| ------------ | ---------------------------------------------------- |
| `web-tester` | its framework **and six test libraries**             |
| `api-tester` | its framework and GraphQL — no test library exists   |
| `cli-tester` | its framework and `cli-prompts-clack` — none exists  |
| `ai-tester`  | two observability skills — no framework, none exists |

**Three of four testers have no testing skill to carry.** No assignment rule fixes that; it is work
for the skills marketplace, and it is worth a row there. The model below cannot improve those three
agents until the skills exist.

## What this changes, mechanically

| Change                                                                 | Where                                   |
| ---------------------------------------------------------------------- | --------------------------------------- |
| `CRAFT_CATEGORIES_BY_FLAVOR` gains a `meta` key                        | `assignment-defaults.ts`                |
| `NON_META_ROSTER` stops excluding meta agents for `shared-*`           | `assignment-defaults.ts`                |
| `meta-design-*` moves off the reviewer craft and onto a broadcast rule | `assignment-defaults.ts`                |
| ~11 admin-skill rows become derivable from the category prefix         | `preload-defaults.ts` — rows deleted    |
| tester rows invert: test library preloads, framework goes lazy         | `preload-defaults.ts` — ~20 rows edited |

**Nothing here needs a new table.** Rules 1 and 2 are derivable from the category prefix the catalog
already carries, which means they cannot drift out of step with the skills the way 140 hand-written
rows can.

## Owner ruling, 2026-08-30 — reading (a)

"All skills apply to all Admin and Meta sub-agents" means the **Admin-tier and Meta-tier skills**,
not all 238. Core skills stay domain-scoped: `web-framework-react` reaches `web-researcher` and not
`api-researcher`. The rules above are written on this reading and stand as proposed.

This keeps the standing relevance ruling in `assignment-defaults.ts` intact — _"No broadcast, not
even lazy: a sub-agent carries only skills it would reasonably use"_ — which reading (b) would have
overturned.

**Tracker row: CLI-846.**

## Not proposed, deliberately

- **No change to `hasDomainAffinity`.** It is what stops an api developer preloading a web skill and
  it is doing its job.
- **No new "admin" flavor.** `ROLE_FLAVORS` already carries `planning`, `researcher` and `reviewer`
  separately, which is what makes rule 1 mechanical. Collapsing them into one `admin` flavor would
  lose exactly the distinction rule 1 needs.
