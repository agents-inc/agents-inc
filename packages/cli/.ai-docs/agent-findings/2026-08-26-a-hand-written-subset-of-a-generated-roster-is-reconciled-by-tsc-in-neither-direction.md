---
type: standard-gap
severity: high
affected_files:
  - apps/editor/src/features/configure/lib/agent-placement.ts
  - apps/editor/src/features/configure/lib/agent-placement.test.ts
  - apps/editor/src/features/configure/components/skill-options-panel.tsx
  - src/cli/lib/wizard/agent-roster.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-26
reporting_agent: web-developer
category: testing
domain: web
root_cause: rule-not-visible
status: partial
partial_note: >-
  The editor half landed — `ROLE_COLUMNS` gained its researcher column and
  `agent-placement.test.ts` now holds the panel's reach against
  `SUB_AGENT_GROUPS`, so the defect is fixed and pinned on the surface that had
  it. What is pending is the generalisation: the rule that a hand-written subset
  of a generated roster owes a membership assertion lives only in one CLI test's
  docblock, and nothing carries it to the next surface that writes one.
---

## What Was Wrong

**`ROLE_COLUMNS` in the editor's skill options panel named two of the roster's
three per-domain roles, so `web-researcher`, `api-researcher`, `ai-researcher`
and `cli-researcher` were hand-assignable nowhere in the editor** — 14 of 18
sub-agents placed, four unreachable. Census run against the live roster before
the fix:

```
IN GRID     : 8  web-developer, web-tester, api-developer, api-tester,
                 ai-developer, ai-tester, cli-developer, cli-tester
IN META FOLD: 6  agent-summoner, codex-keeper, convention-keeper, pm, reviewer,
                 skill-summoner
PLACED      : 14
UNREACHABLE : 4  ai-researcher, api-researcher, cli-researcher, web-researcher
```

**The shape that made it survive is worse than "an agent was missing": the four
were visibly present and silently uneditable.** The behavioural half of this was
fixed on 2026-08-06 — `default-assignments.ts` became data-driven, so a selected
web skill preloads onto `web-researcher` like any other web agent, and
`DOMAIN_REACH.web = 5` in `e2e/support/catalog.ts` counts it. The roster panel
draws the row, because `derive.ts` takes `SUB_AGENT_GROUPS` whole. So a user
could see a researcher carrying a skill, could switch it off in the roster, and
had no control anywhere that could put it back at a chosen load state. An absent
agent is a gap; an agent you can see and cannot reach is a broken control.

**`tsc` reconciles this list in NEITHER direction, and that is the specific
mechanism worth keeping.** The CLI's equivalent hazard is one-directional and its
own test says so: `src/cli/lib/wizard/agent-roster.test.ts` opens with

> "`tsc` reconciles them in one direction only. Deleting an agent directory takes
> its name out of the `AgentName` union, so a stale entry fails to compile —
> three retirements once produced 25 errors. ADDING one produces none, and six
> agents shipped in the package, documented, and unreachable through the wizard
> because nothing asked the other question."

The editor's list did not even have that half. `BUILT_IN_AGENT_GROUPS` holds
`AgentName` literals, so a deletion is a compile error there. `ROLE_COLUMNS`
holds role _suffixes_ — `"developer"`, `"tester"` — matched at runtime by
`roleOf` slicing `<domain>-` off an agent id and looked up through a
`Map<string, SubAgent>`. Nothing in the chain is typed to any union of roles.
Measured rather than argued: adding `{ id: "archaeologist", short: "arc" }`, a
role no agent in the roster has, leaves `bun run typecheck` (`tsc -b --noEmit`)
**exiting 0 with no output**. Adding an agent produces no error; naming a role
that does not exist produces no error either.

**Nothing else could notice.** The unit suite is `environment: "node"` and
`include: ["src/**/*.test.ts"]` by deliberate design — `packages/vitest-config`
says rendering is covered in a real browser instead — so no unit test rendered
the panel. The E2E suite locates matrix cells by ``getByRole("button", { name:
`${domain} ${role}` })``, an aria-label composed of a domain label and a column
short, which **cannot name an agent that has no column**: the four missing
agents had no locator that could have been written for them. 419 E2E specs and
452 unit tests were green throughout.

**The rule existed and was one workspace away.** `agent-roster.test.ts` is this
exact guard, written for this exact failure mode, three months earlier. It is
not referenced from `packages/cli/CLAUDE.md`, not from `apps/editor/e2e/README.md`,
and not from any `standards/` document — it is a docblock inside one test file,
findable only by someone already reading it. The nearest written rule,
`packages/cli/CLAUDE.md`'s "NEVER assert a directory listing, roster or generated
union by count alone", governs how to write such an assertion and is silent on
when one is owed at all, so nobody grepping the rules arrives here.

## Fix Applied

**Editor half, landed.**

`ROLE_COLUMNS` gained `{ id: "researcher", short: "res" }`. `res` is the design's
own abbreviation rule applied to the new role, not a guess: `MX_ROLES` in
`.claude-design/design/Configurator v5.dc.html` reads
`[['developer','dev'],['pm','pm'],['reviewer','rev'],['tester','test']]` — first
three letters unless the stem is already a word — so `reviewer → rev` gives
`researcher → res`. Width decides nothing and was measured to establish that:
in the shipped panel the role columns compute to **89.14px** and `res` inks
**16.98px**, identical to `dev`, with `scrollWidth === clientWidth` on every
header. Even `researcher` in full (56.61px) would have fitted.

The placement moved from the component to
`apps/editor/src/features/configure/lib/agent-placement.ts`. That was not a
preference: `react-refresh/only-export-components` fails the lint on any
non-component export from a `.tsx`, so a testable placement cannot live in the
panel file. The new module exports `PLACED_AGENT_IDS`, and
`agent-placement.test.ts` holds it against `SUB_AGENT_GROUPS` with
`toStrictEqual` on sorted arrays — the roster itself rather than a list of 18
names written in the test, because a hardcoded expectation has to be edited by
the same person adding the role, which is the edit that was missed. Arrays not
sets, so an agent reachable through _both_ routes fails too. A companion
assertion that the roster is non-empty guards the vacuum where two derived
empties satisfy the comparison for free.

Red phase earned twice — once with the export still on the panel, once from the
extracted module, each time naming the four researchers in the diff. After:
**18 placed, 0 unreachable**, confirmed through the panel's own export and
visually in Chromium (DEV / RES / TEST over WEB / API / AI / CLI, plus six rows
behind the Meta fold).

Two comment blocks that the change falsified were corrected rather than cut, per
the repository's preference for deleting a stale claim only when the reasoning is
not load-bearing: the `ROLE_COLUMNS` block said _"Auto-assignment reaches one
role more than the grid draws"_, and the `matrixGroups` note explained the
researchers' absence as a design-file constraint. A third clause was added that
no comment carried before — **`ROLE_COLUMNS.id` is an id SUFFIX, not a
`RoleFlavor`**, and the two coincide for all three current columns only by luck.
`todo/editor.md`'s EDITOR-10 row recommends deriving roles from `SubAgent.flavor`;
doing so would type-check today and be wrong for the first column whose two
spellings differ, which is exactly the `pm` / `planning` pair that row itself
flags.

**Class census, run rather than assumed.** Every editor module reading the
roster:

```
grep -rln "SUB_AGENT_GROUPS\|AGENT_NAMES\|SUB_AGENTS_BY_ID\|subAgentById" \
  apps/editor/src --include='*.ts' --include='*.tsx'
```

Nine files, of which four are tests. Every product consumer other than this one
takes the roster **whole** and can lose nobody: `derive.ts` (`allAgents()` is
`SUB_AGENT_GROUPS.flatMap`, `selectRosterGroups` is `SUB_AGENT_GROUPS.map`),
`output-preview.ts` (`[...AGENT_NAMES]`, twice), `persisted-schema.ts`
(`agentId in SUB_AGENTS_BY_ID`, `subAgentById`). `CORE_ROLES` in
`default-assignments.ts`, named as a second instance by EDITOR-10, **no longer
exists** — that half was made data-driven on 2026-08-06 and the file now defers
to the shared `resolveAssignment`. So the class had exactly one live member in
the editor and it is fixed. The CLI's member is covered by `agent-roster.test.ts`.

**What the new test does NOT catch, stated so it does not read as complete:** a
column naming a role no agent has. Such a column places nobody, so
`PLACED_AGENT_IDS` is unchanged and the assertion stays green while the grid
draws a fourth column of inert gaps. That is cosmetically visible where the
missing-agent case was not, which is why it is recorded rather than pinned.

## Proposed Standard

**One clause, for `packages/cli/CLAUDE.md` beside the existing "NEVER assert a
directory listing, roster or generated union by count alone" rule** — that rule
is about _how_ to write such an assertion and is the natural place to say _when
one is owed_:

> A surface that enumerates a hand-written SUBSET of a generated roster or union
> owes an assertion that its subset covers what it is meant to cover, held
> against the generated source rather than against a list restated in the test.
> `tsc` reconciles a subset in at most one direction — a removal from the union
> breaks a stale entry only when the entry is typed to that union — and in
> neither direction when the subset holds derived strings (a role suffix, a
> prefix, a slug) rather than union members. Ask both questions: what breaks if
> the union LOSES a member, and what breaks if it GAINS one. Where the answer to
> the second is "nothing", that is the assertion to write.
> `src/cli/lib/wizard/agent-roster.test.ts` and
> `apps/editor/src/features/configure/lib/agent-placement.test.ts` are the two
> live examples, and the second exists because the first was never carried across.

Cross-checked against CLAUDE.md's NEVER/ALWAYS rules: this **weakens nothing and
conflicts with nothing**. It is the missing antecedent of the existing count
rule, and it is consistent with "ALWAYS constrain a shared expected-value
constant to the generated union it mirrors" — which covers a constant that
_mirrors_ a union and is silent on one that deliberately holds a proper subset,
where a `satisfies` clause is not available as the answer.

**A checker is declined, and the reason is not effort.** The construct is not
lexical: a hand-written subset of a roster looks exactly like any other array of
object literals, and whether a given subset is _meant_ to be total is a fact
about the product rather than about the code. `ROLE_COLUMNS` is deliberately
partial — `pm` and `reviewer` are excluded on purpose and covered by the other
route — so a rule saying "this array must equal the union" would be false here.
The thing that is checkable is the one that landed: an assertion per surface,
written where the surface's own completeness claim lives.

**A second, smaller clause for `apps/editor/`, which has no CLAUDE.md of its
own.** The unit suite's `environment: "node"` is a deliberate and well-argued
choice, and its consequence is not written down anywhere a component author
would meet it: **a claim about a component that is not about its appearance —
reach, coverage, completeness over a generated set — has to be extracted to a
`lib/*.ts` module to be testable at all**, because `react-refresh/only-export-components`
forbids the export from the `.tsx` and the node suite cannot render. Both halves
of that were discovered by hitting them in this pass. Where such a claim exists
and neither suite can make it, the surface has no coverage of it whatsoever,
which is the state the skill options panel was in.
