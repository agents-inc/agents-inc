# B12 — shared + meta (23 skills), researched 2026-08-07 — wave-2 verified 2026-08-07, amendments applied

Scope: worksheet §B12, §2b groups #15/#16, §4; relationship-coverage decisions 2 and 3. Skill
bodies read at `/home/vince/dev/skills/src/skills/` (`shared-monorepo-*`, `shared-tooling-*`,
`shared-security-auth-security`, `meta-config-stack-detect`, `meta-design-*`,
`meta-methodology-*`, `meta-planning-*`, `meta-reviewing-*`). Rules verified in
`packages/cli/src/cli/lib/configuration/default-rules.ts`: exactly two conflict groups touch this
batch — `{turborepo, nx}` at 67-70 and `{biome, eslint-prettier}` at 71-74 — plus the two
matching `alternatives` purpose groups ("Monorepo Orchestrator" at 722, "Linting / Formatting"
at 723). **Zero `requires` and zero `compatibleWith` rules touch any of the 23**, in either
direction. Categories verified in the generated matrix (`shared-monorepo` order 1,
`shared-tooling` order 2, `shared-security` order 3, all `exclusive: false`; the four meta
categories all `exclusive: false`). Roster correspondence verified against
`packages/cli/src/agents/` (21 agent directories) and the craft-reach implementation in
`packages/matrix/src/read-model/assignment-defaults.ts` + `preload-defaults.ts`. Coexistence
claims verified by web search 2026-08-07 (Nx/Turborepo migration guides, Biome migration docs,
Turborepo's Changesets recommendation).

**Headline: both splits confirmed, both cheap — category-only edits, zero id renames, zero new
`requires` from the shared side. The meta block is NOT 13/13 universal: two skills
(composable-components and — uncaught by the worksheet — web-reviewing) are React-bound and take
`requires [react]` (composable-components by content throughout; web-reviewing by self-scope +
React-keyed majority — grounds corrected in wave-2, verify item 17); the other 11 are recorded
universal. Roster correspondence
checks out exactly: 4 planning skills ↔ 4 PMs by slug rule, 6 reviewing skills ↔ 1 consolidated
reviewer by craft-category rule, both implemented and tested in `assignment-defaults.ts`.**

## Group #15 — monorepo orchestrators: fence REAL, split confirmed

### Is the fence real? Yes — steady-state exclusive, migration-window coexistence only.

- Both vendors publish **one-way migration guides, not coexistence guides**: Nx's "Migrating
  from Turborepo" (https://nx.dev/docs/guides/adopting-nx/from-turborepo — reads turbo.json,
  maps it to nx.json, then "remove turbo.json and turbo from your dependencies") and
  Turborepo's "Migrating from Nx" (https://turborepo.dev/docs/guides/migrating-from-nx).
- Community and Nx guidance on incremental adoption is explicit that config must not stay
  spread across both: the cache and the task graph are the product, and a repo runs on one of
  them. Two task runners double-hash the same outputs and disagree about staleness.
- The only real coexistence is the migration window — the identical shape B6 ruled on for
  drizzle+prisma (`api-orm`): _a skill picker models the steady state_. Radio right.
- Verified non-fence: **pnpm-workspaces composes with both.** Turborepo builds on the package
  manager's workspaces (any of npm/yarn/pnpm/bun); Nx runs over workspaces or standalone. The
  turborepo skill body itself teaches `workspace:*` protocol — the two skills' contents
  interlock rather than compete.

### Proposed shape

| id                         | displayName | exclusive | members (slugs) | replaces                                                                                 |
| -------------------------- | ----------- | --------- | --------------- | ---------------------------------------------------------------------------------------- |
| `shared-task-runner` (new) | Task Runner | **true**  | turborepo, nx   | conflict group `{turborepo, nx}` — becomes wholly-inside-exclusive, dies free in Phase C |
| `shared-monorepo` (kept)   | Monorepo    | false     | pnpm-workspaces | description re-cut to "Workspace management (pnpm workspaces)"                           |

Per verify-B6 finding 5.1, this is **category-`:`-edits only** — `shared-monorepo-turborepo`
and `shared-monorepo-nx` keep their ids and directories (precedents: `api-framework-*` skills
carrying `category: api-api`; `web-mocks-msw` carrying `category: web-mocking`; and this
batch's own F1 — `meta-config-stack-detect` carrying `category: shared-tooling`, with the
decoupling _deliberately pinned by tests_ in
`packages/matrix/src/read-model/assignment-defaults.test.ts` ("An id-prefix liar: named `meta-`
but catalogued under `shared-tooling`")). The alternative shape — flip `shared-monorepo`
exclusive and move pnpm-workspaces out — is one fewer metadata edit but produces a category
named "Monorepo" that _excludes_ a monorepo tool, the exact naming smell B6 rejected for
`api-database`. The `alternatives` purpose group "Monorepo Orchestrator" (default-rules.ts:722)
already names exactly `{turborepo, nx}` — the new category is pre-validated by the catalog's
own purpose grouping; "Monorepo Orchestrator" is an acceptable alternative displayName.

Derived `requires`: **none, all three.** `turborepo → needsAny [pnpm-workspaces]` was examined
and REJECTED — the workspace layer can be npm/yarn/bun workspaces, all outside the catalog
(same rejection pattern as B6's ORM→engine). Nx needs no workspace at all (standalone mode).
pnpm-workspaces stands alone trivially.

## Group #16 — lint/format: fence REAL as catalogued, split confirmed

### Does Biome's documented dual-running break the radio? No — argued on B6's own precedent.

Three coexistence patterns, each dispatched:

1. **Transitional dual-running (Biome's own migration docs).**
   https://biomejs.dev/guides/migrate-eslint-prettier/ describes `biome migrate eslint
--write` / `biome migrate prettier --write` and running both with overlapping rules disabled
   "until you have verified Biome catches everything — then remove ESLint entirely." This is
   the drizzle+prisma shape again: coexistence whose documented end state is deleting one side.
   B6's ruling transfers verbatim: _the picker models the steady state._ Transitional
   coexistence is acceptable radio semantics, not a counterexample.
2. **Steady-state hybrid: Biome as formatter + a bare ESLint for plugin gaps.** This one is
   real and durable (react-hooks, jsx-a11y, Vue/Svelte plugins — Biome v2's type-aware linting
   and GritQL plugins narrowed but did not close the gap;
   https://betterstack.com/community/guides/scaling-nodejs/biome-eslint/). **It still does not
   break this radio, because the catalog's second member is not "eslint" — it is the
   `eslint-prettier` bundle.** Selecting both skills as taught installs two formatters: biome's
   body mandates `biome check --write` (format+lint+organize in one pass) while
   eslint-prettier's body mandates Prettier + `eslint-config-prettier`. That pair is
   incoherent in one project. The hybrid pairs Biome with a Prettier-less ESLint config that no
   catalog skill teaches. This is the same disposition as verify-B6's redis↔upstash
   (dual-client-one-provider): radio KEPT, pattern recorded honestly as a CLI-740 line —
   "biome + bare-eslint hybrid is real; unrepresentable while the ESLint skill bundles
   Prettier" — rather than waved off as nonexistent.
3. **The skills' own bodies agree.** biome's when-NOT-to-use: "Projects requiring ESLint
   plugins with no Biome equivalent → ESLint + Prettier"; its decision tree is strictly
   either/or. Neither body teaches a hybrid.

### Proposed shape

| id                      | displayName   | exclusive | members (slugs)                                        | replaces                                                                                  |
| ----------------------- | ------------- | --------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `shared-lint` (new)     | Lint & Format | **true**  | biome, eslint-prettier                                 | conflict group `{biome, eslint-prettier}` — wholly-inside-exclusive, dies free in Phase C |
| `shared-tooling` (kept) | Build Tooling | false     | typescript-config, git-hooks, changesets, stack-detect | residue is genuinely additive (verified pairwise below)                                   |

Again category-`:`-edits only (2 metadata.yaml lines), ids unchanged. Residue composability
verified: git-hooks' lint-staged runs either lint tool (its examples currently hardcode
`eslint --fix`/`prettier --write` — content note F5 — while biome's body covers pre-commit via
`--staged`); typescript-config, changesets and stack-detect are tool-orthogonal. The
`shared-tooling` category description "ESLint, Prettier, TypeScript, Vite" needs a re-cut
either way — it names the two skills that _leave_, and Vite was never in this category (F4).

## The 13 meta skills — roster correspondence VERIFIED, then recorded

The worksheet ordered: don't assert universality before checking the roster/skill mapping. Done
against the live implementation, not the docs:

- **21 agents confirmed** under `packages/cli/src/agents/`: 4 developers, 4 PMs
  (`planning/{web,api,cli,ai}-pm`), 4 researchers, 4 testers, 4 meta agents (agent-summoner,
  codex-keeper, convention-keeper, skill-summoner), and a single consolidated
  `reviewer/reviewer`.
- **4 planning skills ↔ 4 PMs, exactly 1:1, by slug rule.** `assignment-defaults.ts`
  (`isPlanningCraftFor`): a `meta-planning` skill reaches the planning-flavor agent whose
  domain prefixes its slug — `web-planning` → web-pm and nobody else. All four carry **no
  PRELOAD_DEFAULTS row** → lazy by absence, by design (the file's own comment). No
  `infra-planning` skill and no infra PM — consistent on both sides.
- **6 reviewing skills ↔ 1 reviewer, by craft-category rule.** `REVIEWER_CRAFT_CATEGORIES =
["meta-reviewing", "meta-design"]`: every member reaches the cross-domain reviewer with or
  without a row. The generalist `meta-reviewing-reviewing` is the only one with a row
  (`["reviewer"]` → preloaded); the five domain checklists are row-less → reach the reviewer
  lazily, arriving per-diff — which `preload-defaults.ts`'s header documents as the owner's
  ruling. `infra-reviewing` reaching the reviewer despite zero infra agents existing is
  _correct_ under this rule (infra diffs are still reviewed; the checklist is the reviewer's,
  not an infra agent's). So 6-skills-vs-1-agent is not a mismatch — it is the design.
- **meta-design rows name `["developer"]`** — both design skills preload on all four
  developers and reach the reviewer lazily via the craft rule (owner's 2026-08-06 ruling,
  cited in the code comment). **meta-methodology row `["planning", "researcher"]`** — 4 PMs +
  4 researchers.
- Scope note for the manifest: the audit verdict (`universal` = no fence) and the craft-reach
  (which agents a pick lands on) are **orthogonal axes**. A `universal` verdict here claims
  only "selectable beside anything"; reach stays the assignment table's answer.

### The two that are NOT universal

- **composable-components — React-bound, high confidence.** The body's examples import
  `forwardRef`/`useState`/`useCallback`/`useRef` from `"react"` and `useRender`/`mergeProps`
  from `@base-ui/react/*`; the core mandate is JSX-part composition; zero Vue/Svelte/Angular
  content. Class B, `requires [react]`. The concept ports to other frameworks; this skill's
  content does not — and the audit's standing precedent (base-ui, recharts,
  react-three-fiber: "React-only and unbound — same defect") binds by content.
- **web-reviewing — React-bound, uncaught by the worksheet; grounds corrected in wave-2
  (verify item 17).** NOT because "the entire core checklist is React-specific" — that claim was
  refuted by direct read: Pattern 7 (Accessibility — semantic elements, labels, keyboard paths,
  focus management), one of the five critical-requirement MUSTs ("check every interactive
  element the diff adds for keyboard reachability and an accessible name"), and the
  "Accessibility is scoped to the diff" core principle are framework-neutral and substantive;
  Pattern 3 is half-neutral. The binding stands on the **eas precedent** instead: the skill
  _self-scopes_ to React in its own text (description "Use when reviewing React components";
  When-to-use "Reviewing diffs containing React components (`.tsx`/`.jsx` with JSX)";
  auto-detection "React PR review"), and its React-keyed share is the clear majority (4 of 5
  MUSTs, 6 of 7 patterns). A fence matching the skill's own self-scope is not a wrong fence; the
  Vue/Angular/Svelte loss is a content gap the fence _reports_ rather than creates. The
  universal-plus-rewrite-note alternative was weighed and fails on active-harm risk: "universal"
  puts unconditional React MUSTs (dependency-array demands) in front of every non-React web
  diff. Class B, `requires [react]`. The binding's real cost, stated so the owner sees it
  rather than discovers it: post-binding, non-React web stacks have **zero reviewer-reaching
  a11y coverage** — `web-accessibility-web-accessibility` sits in `web-accessibility`, outside
  `REVIEWER_CRAFT_CATEGORIES` (`["meta-reviewing", "meta-design"]`), so it never reaches the
  reviewer. The catalog-level fix (extract the neutral a11y core, rewrite framework-neutral, or
  author per-framework variants) is a skills-repo note (F3), not this audit's vocabulary.
- **cli-reviewing stays universal — deliberately asymmetric with web-reviewing; grounds
  corrected in wave-2 (verify item 18).** Self-scope cannot be the discriminator: cli-reviewing's
  description _also_ self-scopes ("built with Commander.js, @clack/prompts, picocolors"), so
  self-scope alone cannot separate the two calls. The honest discriminators: (a) **proportion** —
  bound checks are 2 of 5 MUSTs and a checklist minority here (`p.isCancel()` after every
  @clack/prompts call; Commander `parseAsync()`), versus web-reviewing's 4 of 5 MUSTs and
  6-of-7-pattern majority; the core — exit codes, SIGINT, error text, help quality, dry-run,
  config precedence — is portable to any CLI. (b) **The in-catalog victim** — `needsAny
[cli-commander, clack]` would strip ALL CLI review coverage from **oclif-ink** stacks, the
  catalog's other CLI framework, despite most checks applying to them verbatim (a wrong fence
  with a named victim), whereas the react binding's victims lose a checklist that was
  majority-inapplicable to them. Content note F6 records the bias; an oclif-ink reviewer
  skipping the clack items loses little.

## Manifest rows

Batch id `shared-meta`, audited `2026-08-07`. 23 skills: 21 class A, 2 class B.

| skill (current id)                                           | category (post-split)  | verdict                                 | class | frameworks | derived-requires                                             | sources                                                                                                                                                                                                                                                       | notes                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | ---------------------- | --------------------------------------- | ----- | ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| turborepo (shared-monorepo-turborepo)                        | shared-task-runner [X] | constrained-via-exclusivity-or-requires | A     | []         | none (workspace layer may be npm/yarn/bun — outside catalog) | skill body (turbo 2.x, `dependsOn`, `workspace:*`); https://turborepo.dev/docs; https://turborepo.dev/docs/guides/migrating-from-nx                                                                                                                           | Radio vs nx confirmed steady-state real.                                                                                                                                                                                                                             |
| nx (shared-monorepo-nx)                                      | shared-task-runner [X] | constrained-via-exclusivity-or-requires | A     | []         | none                                                         | skill body (Nx 22, Project Crystal, `nx affected`, `nx release`); https://nx.dev/docs/guides/adopting-nx/from-turborepo                                                                                                                                       | One-way migration guides both directions; no documented dual steady state.                                                                                                                                                                                           |
| pnpm-workspaces (shared-monorepo-pnpm-workspaces)            | shared-monorepo [o]    | universal                               | A     | []         | none                                                         | skill body (pnpm 10, `workspace:*`, `catalog:`); https://pnpm.io/workspaces                                                                                                                                                                                   | Composes with BOTH task runners — the reason the worksheet's split shape is right.                                                                                                                                                                                   |
| biome (shared-tooling-biome)                                 | shared-lint [X]        | constrained-via-exclusivity-or-requires | A     | []         | none                                                         | skill body (v2.4, `biome check --write`, `biome ci`); https://biomejs.dev/guides/migrate-eslint-prettier/                                                                                                                                                     | Radio vs eslint-prettier held; hybrid recorded for CLI-740, see disposition.                                                                                                                                                                                         |
| eslint-prettier (shared-tooling-eslint-prettier)             | shared-lint [X]        | constrained-via-exclusivity-or-requires | A     | []         | none                                                         | skill body (ESLint 9/10 flat config, eslint-config-prettier); https://eslint.org/docs/latest/use/configure/                                                                                                                                                   | The bundle-ness of this skill is what keeps the radio honest (two formatters otherwise).                                                                                                                                                                             |
| typescript-config (shared-tooling-typescript-config)         | shared-tooling [o]     | universal                               | A     | []         | none                                                         | skill body (strict flags, `module: "preserve"`, `${configDir}`); https://www.typescriptlang.org/tsconfig/                                                                                                                                                     | Framework-agnostic; react.json specialized config is an example, not a binding.                                                                                                                                                                                      |
| git-hooks (shared-tooling-git-hooks)                         | shared-tooling [o]     | universal                               | A     | []         | none                                                         | skill body (husky v9, lint-staged v16, commitlint); https://typicode.github.io/husky/                                                                                                                                                                         | Composes with either lint radio member; examples hardcode eslint/prettier — F5.                                                                                                                                                                                      |
| changesets (shared-tooling-changesets)                       | shared-tooling [o]     | universal                               | A     | []         | none                                                         | skill body (@changesets/cli, fixed/linked, pre-release); https://github.com/changesets/changesets; https://turborepo.dev/docs/guides/publishing-libraries                                                                                                     | Turborepo's own docs recommend it — composes with the task-runner radio, see handoffs.                                                                                                                                                                               |
| stack-detect (meta-config-stack-detect)                      | shared-tooling [o]     | universal                               | A     | []         | none                                                         | skill body (SeedPayload, proposal report; pure process)                                                                                                                                                                                                       | **F1: id says `meta-config`, category says `shared-tooling`, domain `shared`** — live, test-pinned precedent for id/category decoupling.                                                                                                                             |
| auth-security (shared-security-auth-security)                | shared-security [o]    | universal                               | A     | []         | none                                                         | skill body (secrets, XSS/CSRF, CSP, DOMPurify, CODEOWNERS)                                                                                                                                                                                                    | Cross-cutting patterns; PRELOAD row `["developer","planning","researcher"]`.                                                                                                                                                                                         |
| expressive-typescript (meta-design-expressive-typescript)    | meta-design [o]        | universal                               | A     | []         | none                                                         | skill body (orchestrators, pure functions, naming)                                                                                                                                                                                                            | Language-level, any TS project. Row `["developer"]`; reviewer gets it lazily via craft.                                                                                                                                                                              |
| composable-components (meta-design-composable-components)    | meta-design [o]        | constrained-via-exclusivity-or-requires | **B** | [react]    | **requires [react]**                                         | skill body + examples (`from "react"`, `@base-ui/react/use-render`, `@base-ui/react/merge-props`, forwardRef, JSX parts)                                                                                                                                      | **F2 — the worksheet's question answered: binding, not universal.** Row `["developer"]` reaches api/cli devs too — over-broad, F7.                                                                                                                                   |
| research-methodology (meta-methodology-research-methodology) | meta-methodology [o]   | universal                               | A     | []         | none                                                         | skill body (Glob→Grep→Read, evidence format)                                                                                                                                                                                                                  | Pure process. Row `["planning","researcher"]`.                                                                                                                                                                                                                       |
| web-planning (meta-planning-web-planning)                    | meta-planning [o]      | universal                               | A     | []         | none                                                         | skill body (UI-state completeness, component boundaries — framework-free)                                                                                                                                                                                     | Reaches web-pm alone via slug rule; lazy by absence.                                                                                                                                                                                                                 |
| api-planning (meta-planning-api-planning)                    | meta-planning [o]      | universal                               | A     | []         | none                                                         | skill body (endpoint contracts, schema, middleware ordering)                                                                                                                                                                                                  | Reaches api-pm alone.                                                                                                                                                                                                                                                |
| cli-planning (meta-planning-cli-planning)                    | meta-planning [o]      | universal                               | A     | []         | none                                                         | skill body (flag contracts, exit-code taxonomy, TTY modes)                                                                                                                                                                                                    | Reaches cli-pm alone.                                                                                                                                                                                                                                                |
| ai-planning (meta-planning-ai-planning)                      | meta-planning [o]      | universal                               | A     | []         | none                                                         | skill body (model choice, loop guards, evals — provider-free)                                                                                                                                                                                                 | Reaches ai-pm alone.                                                                                                                                                                                                                                                 |
| reviewing (meta-reviewing-reviewing)                         | meta-reviewing [o]     | universal                               | A     | []         | none                                                         | skill body (severity levels, feedback principles, self-correction)                                                                                                                                                                                            | The generalist; only reviewing skill with a row (`["reviewer"]` → preloaded).                                                                                                                                                                                        |
| web-reviewing (meta-reviewing-web-reviewing)                 | meta-reviewing [o]     | constrained-via-exclusivity-or-requires | **B** | [react]    | **requires [react]**                                         | skill body self-scope (description "Use when reviewing React components"; When-to-use `.tsx`/`.jsx` with JSX; "React PR review" auto-detection) + React-keyed majority (4/5 MUSTs, 6/7 patterns); the neutral remainder is the a11y core (Pattern 7 + 1 MUST) | **F3 — React-bound by self-scope + majority (eas precedent), uncaught by the worksheet; grounds corrected in wave-2 (verify item 17).** Universal alternative rejected on active harm (unconditional React MUSTs on non-React diffs). Binding's cost recorded in F3. |
| api-reviewing (meta-reviewing-api-reviewing)                 | meta-reviewing [o]     | universal                               | A     | []         | none                                                         | skill body (injection, authz coverage, error leakage — framework-free)                                                                                                                                                                                        | Lazy craft-reach to reviewer.                                                                                                                                                                                                                                        |
| cli-reviewing (meta-reviewing-cli-reviewing)                 | meta-reviewing [o]     | universal                               | A     | []         | none                                                         | skill body (exit codes, SIGINT, UX; two Commander/clack MUSTs)                                                                                                                                                                                                | **F6:** content bias noted, core portable — kept universal, asymmetry with web-reviewing argued above.                                                                                                                                                               |
| ai-reviewing (meta-reviewing-ai-reviewing)                   | meta-reviewing [o]     | universal                               | A     | []         | none                                                         | skill body (prompt-injection tracing, output validation, budgets — provider-free)                                                                                                                                                                             | Lazy craft-reach.                                                                                                                                                                                                                                                    |
| infra-reviewing (meta-reviewing-infra-reviewing)             | meta-reviewing [o]     | universal                               | A     | []         | none                                                         | skill body (supply-chain pinning, container hygiene, least-privilege)                                                                                                                                                                                         | Reaches the reviewer though no infra agents exist — correct under the craft rule.                                                                                                                                                                                    |

## Derived-requires candidates examined and rejected

| candidate                                              | verdict         | why                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| turborepo → needsAny [pnpm-workspaces]                 | REJECTED        | Workspace layer may be npm/yarn/bun workspaces — outside the catalog; the binding would block real stacks (B6's ORM→engine rejection pattern).                                                                                                                                                                                           |
| nx → anything                                          | REJECTED        | Standalone Nx needs no workspaces; nothing in-catalog is a dependency.                                                                                                                                                                                                                                                                   |
| changesets → needsAny [pnpm-workspaces, turborepo, nx] | REJECTED        | Changesets works in single-package repos and any-workspace monorepos; a monorepo binding over-fences.                                                                                                                                                                                                                                    |
| git-hooks → needsAny [biome, eslint-prettier]          | REJECTED        | lint-staged runs _any_ command (tests, typecheck, formatters); the lint pairing is typical, not required.                                                                                                                                                                                                                                |
| cli-reviewing → needsAny [cli-commander, clack]        | REJECTED (soft) | Proportion: bound checks are 2/5 MUSTs, a checklist minority (F6) — and the fence has an in-catalog victim: it would strip ALL CLI review coverage from oclif-ink stacks while most checks apply to them verbatim. Self-scope alone cannot discriminate (this skill self-scopes too). Revisit if the body grows more Commander-specific. |
| composable-components → requires [react]               | **ADOPTED**     | Literal `"react"` / `@base-ui/react` imports throughout body + all four example files.                                                                                                                                                                                                                                                   |
| web-reviewing → requires [react]                       | **ADOPTED**     | Self-scopes to React in its own text + React-keyed majority (4/5 MUSTs, 6/7 patterns) — the eas precedent; the neutral a11y remainder is real but minority (F3).                                                                                                                                                                         |

Two adopted — the batch's only new declarations, both on meta skills the worksheet expected to
be universal.

## Findings

- **F1 — stack-detect is a third live precedent for id/category decoupling.** Id/directory
  `meta-config-stack-detect`, `category: shared-tooling`, `domain: shared` — and
  `packages/matrix/src/read-model/assignment-defaults.test.ts` pins the behavior on purpose
  ("id-prefix liar … the shared rule — not the meta rule — is what places it"). Strengthens
  verify-B6 5.1: category moves in this batch need zero id renames, by established convention.
- **F2 — composable-components is a React skill filed under meta.** Binding adopted (see
  manifest). Skills-repo option if universality is ever wanted: split framework-specific
  examples out of the body.
- **F3 — web-reviewing is a React-scoped skill presented as the web domain's review checklist
  (grounds corrected in wave-2, verify item 17).** Binding adopted on self-scope + React-keyed
  majority, not on "zero other-framework content" — the body carries an extractable
  framework-neutral core: the a11y checklist (Pattern 7 — semantic elements, labels, keyboard
  paths, focus management — plus the "keyboard reachability and an accessible name" MUST and
  the "Accessibility is scoped to the diff" principle). The binding's cost, named: non-React
  web stacks lose their ONLY reviewer-reaching a11y coverage —
  `web-accessibility-web-accessibility` sits outside `REVIEWER_CRAFT_CATEGORIES`, so nothing
  else carries a11y to the reviewer. Skills-repo note: extract the neutral a11y core, rewrite
  framework-neutral (the api/ai/infra siblings prove the register exists), or author
  per-framework variants; until then Vue/Angular/Svelte projects honestly have no web review
  checklist.
- **F4 — `shared-tooling`'s category description is stale**: "ESLint, Prettier, TypeScript,
  Vite" — names the two members that leave under the split, and Vite (web-tooling) was never a
  member. Re-cut at apply time.
- **F5 — git-hooks' lint-staged examples hardcode `eslint --fix` + `prettier --write`.** Fine
  as the common case, but once `shared-lint` is a radio the examples silently assume one
  member. Skills-repo note: add the biome variant (`biome check --write --staged`).
- **F6 — cli-reviewing carries two Commander/clack-specific MUSTs** in an otherwise portable
  checklist. Content note only; no binding (argued above).
- **F7 — composable-components' PRELOAD row `["developer"]` preloads it on api/cli/ai
  developers**, who never design component APIs. Mostly mooted by the react binding (the skill
  disappears from non-React projects), but in a react project the cli-developer still preloads
  it. Assignment-table note, outside this audit's vocabulary — recorded, not fixed.
- **F8 — changesets ↔ `nx release` functional overlap.** The nx skill teaches `nx release`
  (versioning, changelogs, publishing) — the same job changesets does. They coexist without
  breakage (many Nx repos use changesets; both are opt-in), so no fence — but a stack that
  picks nx + changesets should know it has two versioning mechanisms on offer. Advisory note
  for CLI-740's "richer semantics" backlog (a `discourages`-shaped fact with no surviving
  vocabulary).

## Contradicts-the-worksheet

1. **"All 13 meta skills … expected verdict is `universal` across the board" — false for two
   of them.** composable-components (the worksheet's own flagged suspect — confirmed bound)
   and web-reviewing (unflagged — equally bound). 11/13 universal, not 13/13.
2. **The worksheet's §B12 roster note undersold the mechanism.** "The 10 planning/reviewing
   skills mirror the 21-agent roster" — they don't _mirror_ it; they are wired to it by two
   explicit rules in `assignment-defaults.ts` (slug-prefix for planning, craft-category for
   reviewing + design), both test-pinned. The 6-vs-1 reviewing asymmetry is designed, not
   drift; nothing for the audit to correct.
3. **Group #15's fence needed no concession at all** — the worksheet's "verify the fence is
   real" resolves cleanly: no documented steady-state coexistence exists anywhere in either
   vendor's docs; the only coexistence is the migration window B6 already ruled non-blocking.
4. **Group #16's radio survives Biome's dual-running docs, but not for free** — the honest
   record includes the steady-state Biome+bare-ESLint hybrid as a CLI-740 line
   (unrepresentable while the catalog's ESLint skill bundles Prettier), parallel to
   verify-B6's redis↔upstash amendment. A future bare `eslint` catalog skill would reopen
   this radio's rationale.
5. **Both §2b rows land cheaper than billed**: with the id/category decoupling (F1 + verify-B6
   5.1), each split is 2 metadata `category:` edits + 1 new category definition + regen — no
   directory renames, no skill-id churn, no `requires` re-keying (none exist here to re-key).

## Migration surfaces (named, NOT fixed here)

Far lighter than B6 — ids unchanged throughout.

- **M1 — skills repo**: 4 `metadata.yaml` `category:` edits (turborepo, nx → shared-task-runner;
  biome, eslint-prettier → shared-lint). Zero directory renames.
- **M2 — category definitions**: `default-categories.ts` — add `shared-task-runner` [X] and
  `shared-lint` [X]; re-cut `shared-monorepo` and `shared-tooling` descriptions (F4); shared
  domain orders renumber (currently 1/2/3).
- **M3 — stacks**: `default-stacks.ts` groups skills under category keys — **11
  `"shared-monorepo"` keys and 48 `"shared-tooling"` keys**; every stack containing
  turborepo/nx or biome/eslint-prettier needs its entry moved under the new key (skill-id
  values unchanged).
- **M4 — generated artifacts**: `generate:types` + `generate:matrix` + **`generate:schemas`**
  (per verify-B6 5.3 both JSON schemas enumerate category ids, but only
  `metadata.schema.json` is generated and gated by `generate:schemas:check` —
  `project-config.schema.json` is hand-maintained and its enum is a hand edit), plus the
  vendored `packages/matrix/src/vendor/generated/*` pair.
- **M5 — matrix package**: `PRELOAD_DEFAULTS` keys survive untouched (ids unchanged);
  category-id literals appear in `assignment-defaults.test.ts` / `preload-defaults.test.ts`
  (the stack-detect "id-prefix liar" tests reference `shared-tooling` semantics — re-read at
  apply time, likely unaffected since stack-detect stays in `shared-tooling`).
- **M6 — CLI tests/fixtures**: grep hits for the two category ids in `test-fixtures.ts`,
  `mock-matrices.ts`, `skill-factories.ts`, `default-categories.test.ts`,
  `consumer-stacks-matrix.integration.test.ts`, `marketplace-generator.test.ts`,
  `build-step-logic.test.ts`, `stack-plugin-compiler.test.ts`, `wizard-store.test.ts` — audit
  each for whether it names the category of a moving skill.
- **M7 — the two new `requires` rules** (composable-components, web-reviewing → react) go into
  `default-rules.ts`'s requires section with reasons, and both skills' verdict entries into the
  audit manifest; the consistency gate must confirm neither target sits in the subject's own
  category (they don't — react is `web-framework`).

## Cross-batch handoffs

- **→ B11 (infra-cli): turborepo-ci's binding is now load-bearing for #15's fence.**
  `infra-ci-cd-turborepo-ci` declares nothing today; post-split, `turborepo-ci → requires
[turborepo]` (B11's call to make) does double duty: it binds the CI skill to its tool AND
  transitively fences turborepo-ci↔nx via the `shared-task-runner` radio — the exact
  "reaches a conflict via requires" mechanism decision 2 re-keys onto. B11 should cite the
  new category in its reason string.
- **→ B11: changesets ↔ turborepo-ci compose** — Turborepo's own publishing guide recommends
  Changesets (`turbo run build lint test && changeset version && changeset publish`,
  https://turborepo.dev/docs/guides/publishing-libraries). No fence in either direction;
  recorded so neither batch invents one. The only changesets caution is F8 (nx release
  overlap), advisory only.
- **→ B1 (web-core): two new inbound `requires [react]` bindings** (composable-components,
  web-reviewing) join the anchor set pointing at the react slug — nothing for B1 to do beyond
  counting them when verifying anchor in-degree.
