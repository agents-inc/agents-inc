# Archive

One line per item that has landed, appended as it lands. The trackers in this folder delete an item
when it lands rather than ticking it off, so this file is the only record that it existed.

- **2026-08-04 — REPO-01** (repo.md, was monorepo-merge "Commit it") — the staged merge is committed,
  as six commits rather than one, ending at `d5fa4027`.
- **2026-08-04 — REPO-02** (repo.md, was editor-todo item 13) — the merge is pushed, `main` and
  `origin/main` both at `d5fa4027`. The twenty `packages/cli/…` source links now resolve, checked by
  fetching `main/packages/cli/src/schemas/agent-frontmatter.schema.json` and getting `200`.
- **2026-08-04 — REPO-17** (repo.md, new, found while extracting) — a `CLAUDE.md` now exists at the
  repository root and is tracked.
- **2026-08-04 — REPO-18** (repo.md, new, found while extracting) — all four dangling references
  repaired: `README.md` now links `todo/repo.md`, both `.syncpackrc.cjs` sites now say REPO-06, and
  `packages/cli/e2e/helpers/test-utils.ts` now cites `harness-decisions.md` § 1.1. The three
  cite-by-item-number references it deliberately left alone survive in `www.md`, `cli.md` and
  `editor.md`.
- **REPO-19** — the CLI's unit suite needed a build no CI step ran; `packages/cli/turbo.json` now declares `test` dependsOn `build`, as `test:e2e` already did. 205 failures to zero.
- **REPO-20** — the deploy job had no Cloudflare credentials. Secrets added to the `production` environment; `deploy` green in 30s.
- **REPO-03** — `git remote` pointed at `claude-collective/cli`. The repository was renamed to `agents-inc/agents-inc` and the remote updated; the redirect warning on every push is gone.
- **REPO-08** — consider renaming the repository. Done: `agents-inc/cli` is now `agents-inc/agents-inc`. The org half is dead — `agentsinc` on GitHub is a dormant organisation from 2013, so a full rename would leave three names where there are now two.
- **REPO-21** — the two npm packages are one. `agents-inc@0.150.0` ships the CLI itself; `@agents-inc/cli` is deprecated at 0.149.2 and still installs. The alias, the lockstep republish rule and the stale-cache failure it guarded are all gone.
- **2026-08-05 — REPO-06** — the two halves of the repository ran different versions of four tools;
  they now run one each. React 18 → 19.2.8 and Ink 5 → 7.1.1 in the CLI, TypeScript 5.7 → 6.0.3,
  ESLint 9 → 10.8.0, and Vitest 3 → 4.1.10 across the web side. All four workarounds that existed
  only to hold the split together are deleted: two TypeScript `paths` entries collapsing duplicate
  React types, the Vitest internals redirect in the Worker's config, and the React pin at the root
  imported by nothing. Node's floor rose to 22 (Ink 7's requirement), is now declared in both
  `package.json` files, and is pinned in all three CI jobs — which previously installed no Node at
  all, despite the e2e harness launching the CLI with whatever `node` the runner shipped. Nothing
  regressed: the CLI's unit suite came out at its exact baseline of 5266, and e2e at 647 passing,
  zero failing. Three things fell out of it — ESLint 10 found eight places that caught an error and
  threw away the original, six e2e tests broke on a hard-coded compiler path that only existed
  because of the split, and `bun install` twice left old versions on disk while the manifest claimed
  new ones. The durable reasoning is in `packages/cli/.ai-docs/reference/monorepo-layout.md`; the
  leftovers are REPO-25 and REPO-26.
- **2026-08-05 — REPO-22** — every CI job now has a timeout, sized from three measured green runs
  (check-web 15, check-cli 40, deploy 10 minutes). A hang now dies in minutes, not six hours.
- **2026-08-05 — REPO-13** — the `files` entry naming a folder that never existed is gone, and the
  CI comment carries no test count any more, so it cannot go stale the same way twice.
- **2026-08-05 — REPO-12** — schema generation runs entirely under bun; both generators were run
  before and after and produce identical output. Found along the way: `deps:fix` called a syncpack
  command that no longer exists, and is now `syncpack fix`.
- **2026-08-05 — REPO-11** — the published package ships no compiled tests: the tsup entry globs
  now exclude test files, and a packaging test pins it — red on the old build, green on the new,
  `npm pack --dry-run` showing 515 files and zero `.test.js`. The same test asserts every `files`
  entry exists, which is the class of rot REPO-13 fixed.
- **2026-08-05 — REPO-10** — the catalog check now fails on generator output that is untracked, not
  just changed; the CLI's `typecheck` also compiles `scripts/` and `e2e/` (proven by planting an
  error and watching it caught); and the build's input hash excludes prose, changelogs, e2e and
  tests — editing one line of documentation no longer rebuilds dist, verified miss-then-hit.
- **2026-08-05 — REPO-26** — both syncpack version groups are deleted and the eight dependency
  drifts they were hiding are aligned; `deps:check` runs clean with no exemptions. The stale-install
  trap fired a third time on the way: the manifest said `@types/node` 24 while a nested 22 still
  won resolution until removed by hand.
- **2026-08-05 — REPO-25** — every Ink render now goes through one wrapper that trusts a real
  terminal over the CI guess, and the e2e harness stops stripping `CI` from the child environment —
  the spec that hung seven minutes under `CI=true` passes in 23 seconds, and every CI run now
  proves it. The unit-test half turned out not to be a CI workaround at all under Ink 7: the
  teardown frame is unconditional now, so the frames-join read stays, with its comment corrected
  and the CI variables deleted in vitest setup so unit runs cannot depend on them again.
- **2026-08-05 — REPO-23** — settled with measurements rather than guesses: the full e2e suite
  passes at retry 0 (647 tests, zero retries used) now the Ink CI-detection flake is fixed, so
  `retry` drops from 2 to 1 — kept at 1 only because runner contention cannot be measured locally,
  and a retry that fires is visible in vitest's flaky report. The worker cap formula stays, its
  comment now carrying the measured numbers on both environments.
- **2026-08-06 — REPO-15** — decided, not changed: the repository keeps publishing `.ai-docs/` and
  `todo/`. The owner's call; the row existed to force the question, and the answer is that openness
  wins.
- **2026-08-06 — REPO-14** — documentation ownership settled by the owner and executed: the site is
  the single source for user docs (ten duplicated originals deleted from `docs/cli/`), `docs/cli/`
  holds contributor material only, editor material moved to `docs/web/`, and `docs/repo/` is
  chartered for cross-cutting documents. All four source-file defects WWW-01 tracked died in the
  same pass — including the CLI README's stale counts and its five missing sub-agents.
- **2026-08-06 — REPO-27** — the AI docs describe the state, not the journey: 64,000 words of pass
  narration, validation history and dead task-ID citations removed (−21%), the map cut from 2,746
  lines to 206, the findings-impact rollup deleted outright, and twelve invariants that existed only
  inside history paragraphs restated as present-tense rules before their paragraphs died. The
  conventions were rewritten first so passes cannot re-accrete: one governing test — does an agent
  implementing a feature tomorrow need this to be correct? — and staleness reduced to one line of
  frontmatter. The last accretion, a stale April coverage checklist whose three TODO rows were all
  dead (two covered since, one describing a validation that never existed by design), was deleted
  with it.
- **2026-08-06 — CLI-365** — superseded by REPO-27: the findings-impact report it asked to
  regenerate was process-history by the new convention and was deleted rather than refreshed. The
  findings themselves remain the evidence, untouched.
- **2026-08-06 — REPO-16** — decided, not changed: `/home/vince/dev/skills` stays written out in
  full. The owner's call, and the reasoning is that an absolute path is simply clearer about which
  repository is meant — these are agent instructions and contributor notes read on the machine that
  has that checkout, not build inputs. Nothing resolves the path programmatically; the generator
  already defaults to the sibling `../skills` independently of any of these documents.
- **2026-08-06 — REPO-05** — all three external services settled. Cloudflare: the Worker was renamed
  `agents-inc-web` → `agents-inc-editor` in the dashboard, which is an in-place rename (deployment
  history and the apex custom domain travel with it, no second Worker), and `wrangler.jsonc` was
  updated to agree immediately — necessary, because a deploy naming a Worker that no longer exists
  would have created it fresh and left the live apex updating from nothing. Sentry: renamed to
  `agents-inc-editor` in the dashboard first, then `SENTRY_PROJECT` in the workflow. PostHog: there
  was never an old name — its display name was unset ("Default project") and is now
  "Agents Inc Editor", prose rather than a slug because nothing parses it.
  **Three naming leftovers were deliberately left, and are not defects:**
  `apps/editor/src/features/configure/` keeps its name (it says `configure`, matching the `/editor`
  route and the CLI's `edit` verb; renaming is a code refactor nobody has asked for);
  `Configurator v5` survives in two stylesheets because it cites a design file that exists on disk
  under that name; and two layout tables gloss `editor/` as "the editor", which is tautological but
  a copy decision rather than a naming one.
- **2026-08-06 — REPO-04** — `apps/www` can deploy: `wrangler.jsonc`, a `deploy` script and the
  wrangler dependency, so `turbo deploy` now fans out to it and CI deploys the site on every push.
  **It ships with no `routes` key on purpose** — `agentsinc.sh` is a Custom Domain on the editor's
  Worker and a hostname binds to one Worker at a time, so claiming it here would have taken the live
  site away the moment this first deployed. The site goes to its `workers.dev` subdomain, fully
  browsable, with production untouched. Splitting the apex is WWW-03 and stays a deliberate cutover,
  because the editor's `base`, its router `basepath` and the share-link prefix must all move in the
  same step.
- **2026-08-05 — CLI-351** (cli.md) — the sub-agent roster is unified: five roles (developer, pm,
  researcher, reviewer, tester) × web/api/ai/cli, Meta unchanged, `infra-reviewer` the lone infra
  agent (completion deferred as CLI-380). The three off-grid extras — `web-architecture`,
  `web-pattern-critique`, `pattern-scout` — were removed entirely (owner decision, superseding the
  earlier "retire or fold"), and researcher was promoted to a first-class role, reversing the plan
  to retire the two researchers. An alignment pass also fixed `api-researcher` (wrong handoffs,
  missing `<post_action_reflection>`) and `skill-summoner` (double-wrapped bookends, misplaced
  self-correction block).
- **2026-08-05 — CLI-368** (cli.md) — `ai-pm` created: six partials under
  `src/agents/planning/ai-pm/`, authored via agent-summoner against the prompt-bible and current
  platform docs (Context7), schema-validated and render-verified through `agent.liquid`.
- **2026-08-05 — CLI-369** (cli.md) — `ai-researcher` created: read-only AI research specialist
  under `src/agents/researcher/ai-researcher/`, same process and verification.
- **2026-08-05 — CLI-370** (cli.md) — `ai-tester` created: determinism-boundary AI test agent under
  `src/agents/tester/ai-tester/`, evals structurally separated from the CI gate.
- **2026-08-05 — CLI-371** (cli.md) — `cli-pm` created: CLI planning agent under
  `src/agents/planning/cli-pm/`, spec sections for command surface, flows, config precedence, exit
  codes, output modes.
- **2026-08-05 — CLI-372** (cli.md) — `cli-researcher` created: read-only CLI research specialist
  under `src/agents/researcher/cli-researcher/`, eight research modes keyed to framework detection.
- **2026-08-06 — SKILLS-02** (skills.md, was CLI-374) — `meta-design-composable-components`
  created: the Radix/Base UI component-API alignment skill (compound parts,
  controlled/uncontrolled, `asChild`/`render` polymorphism, `data-*` state, forwarding, structural
  a11y), SKILL.md + reference + four example files, facts verified against `@base-ui/react@1.7.0`.
- **2026-08-06 — SKILLS-03** (skills.md, was CLI-375) — `web-styling-design-tokens` created: token
  tiers, naming grammar, CSS-variable delivery, Tailwind v4 `@theme`/`@theme inline` bridge, DTCG
  2025.10 + Style Dictionary v5 pipeline; research corrected the draft to the object color form.
- **2026-08-06 — SKILLS-04** (skills.md, was CLI-376) — `web-styling-theming` created: dual-signal
  dark mode, FOUC-free boot, three-state preference, next-themes contract (verified against
  source), semantic token switching, multi-brand and nested scopes.
- **2026-08-06 — SKILLS-05** (skills.md, was CLI-377) — `web-testing-visual-regression` created:
  Playwright `toHaveScreenshot` vs Chromatic as a decision framework, determinism checklist,
  baseline lifecycle, CI wiring; current defaults verified (animations disabled, `'missing'`
  update mode, last-frame pause).
- **2026-08-06 — SKILLS-06** (skills.md, was CLI-378) — `web-ui-base-ui` created: anatomy,
  state-function styling, render-prop composition, `eventDetails.cancel()`, forms, positioning,
  Radix migration table; corrected the package to `@base-ui/react` (v1.7.0) during research.
- **2026-08-06 — SKILLS-07** (skills.md, was CLI-379) — `web-tooling-component-library` created:
  style delivery contract, `@layer`, `"use client"` preservation (with the Rolldown banner trap),
  peer-dependency contract, entry granularity — deliberately small, handing off to the monorepo,
  changesets and vite skills instead of restating them. All six passed a cross-skill consistency
  pass (tags, bookends byte-identical, categories verified against sibling metadata, examples
  convention enforced, 17 cross-references resolving, prettier clean).
- **2026-08-06 — CLI-387** (cli.md) — the six skills are registered: `SkillId`/slug unions
  222 → 228, `metadata.schema.json` slug enum at 228, `packages/matrix` regenerated (228 skills,
  17 stacks), gates green with zero production fixes and zero test fallout, and
  `validateSource` reports 0 errors on the marketplace checkout.
- **2026-08-05 — CLI-373** (cli.md) — the unified roster is registered everywhere: `AGENT_NAMES`
  23 → 25, `DOMAIN_AGENTS` four keys × five agents, `BUILT_IN_AGENT_GROUPS` 23 rows including the
  four built-ins that had been unreachable (`ai-developer`, `ai-reviewer`, `api-pm`, `api-tester`),
  47 stale stack blocks removed with `cli-ink-oclif` gaining the two new CLI roles,
  `packages/matrix` regenerated at 25 definitions, README roster updated, reference docs re-derived
  (`agent-system.md`, `built-in-catalogue.md` and five siblings), and gates green: `tsc` clean on
  all three configs, 4854 unit tests passing, targeted e2e passing.
- **2026-08-06 — EDITOR-04** (editor.md) — the install dialog no longer advertises `edit --ui`; it
  says `npx agents-inc edit` (real flags: `--refresh`, `--source`), and the www caution box that
  documented the lie is gone with it. Editor suites green after the change (unit 169/169, e2e
  177/177 — shared run with the researcher-assignment fix).
- **2026-08-06 — WWW-05** (www.md) — `reference/commands.md` rewritten from source; it was wrong
  six ways, not two: wizard step order (stack→domains→build→sources→agents→confirm), `init
--from` missing, `build marketplace --name` missing, exit codes (CANCELLED is 4, NETWORK_ERROR
  absent), a phantom `update --refresh`, and the `-v` alias. Every other flag claim verified.
- **2026-08-06 — WWW-09** (www.md) — the site's catalog counts now derive from
  `@workspace/matrix` at build time (`src/lib/catalog-counts.ts`; three prose pages converted to
  `.mdx`); rendered `dist/` asserted 228 ×4 and 25 ×1 with no `222` anywhere; code-comment counts
  made count-free, including the icon-generator template that would have re-stamped them.
  Exposed REPO-27 (lint-staged misses `mdx`) and WWW-10 (domains prose undercount).
- **2026-08-06 — D-239** (cli.md) — `packages/matrix` stays as the browser-safe data boundary, and
  the CLI is now the single writer of its generated surface: `generate:matrix` /
  `generate:matrix:check` (contract pinned by 14 tests written first; byte-identical acceptance;
  no module-scope writes) emit the seven vendor files plus `generated/agents.ts` —
  `AGENT_DEFINITIONS`, closing the item's original gap — and `generated/stack-preloads.ts`, whose
  omission from the plan the tests-first pass caught. `generate-from-cli.mjs` is deleted and CI's
  catalog check runs the new command from `packages/cli`. The seed schema has one home: the CLI
  imports `@workspace/matrix/seed` as a bundled workspace devDependency (inlining verified in
  `dist/`), and the vendored copy plus the CLI-352 drift guard are deleted. Gates: unit 4861,
  full e2e 660 passed / 0 unrelated failures, seed e2e on the built binary, reference docs
  re-derived. `bun.lock` changed and must ride the commit.
- **2026-08-06 — SKILLS-08** (skills.md) — `meta-config-stack-detect` authored, verified,
  registered (SkillId union 229) and proof-run against this monorepo: the emitted `SeedPayload`
  passed the real machinery untouched (schema parse, 22/22 skill ids, 9/9 agent ids, preload
  ceiling held at 3 of 4 with frameworks preloaded), and the React-vs-Astro exclusive near-miss
  surfaced as an unresolved conflict. The proof run's three content gaps were patched (the
  mechanical cross-category frontend rule, multi-use-library mapping, `matrixVersion` origin).
  Phases 4–5 (editor seeding path, hosted chat surface) deliberately unfiled — file as
  EDITOR/SERVER rows when picked up; they inherit the hosted-architecture questions (auth, rate
  limiting, server-side seed re-validation). CLI-388 (`search --json`) remains the catalog-access
  prerequisite.
- **2026-08-06 — D-215** (cli.md) — the emitted config is sparse: flag-less assignments emit as bare
  id strings, `preloaded: false` is never minted (in memory or in `default-stacks.ts`),
  `ProjectConfig.selectedAgents` is deleted (the emitted `SelectedAgentName` union and wizard
  hydration derive from active `agents[]` rows), and `domains` is renamed `selectedDomains`.
  Tests-first; full unit + E2E green; verified by hand on the real binary. Side discovery: edit-mode
  passthroughs are now genuine no-ops (the flat list used to fabricate a phantom agent diff).
- **2026-08-06 — CLI-390** (cli.md) — the preload-defaults mapping shipped: a hand-authored,
  twice-adversarially-verified 144-entry `PRELOAD_DEFAULTS` table in `packages/matrix`
  (sparse, keyed skill×role-flavor, absence = lazy) with one shared resolver
  (explicit curated flag → mapping → lazy) now feeding both the CLI's `config-generator` and the
  editor's default assignments — the two surfaces answer preloaded-vs-lazy identically for the
  first time. Non-stack selections can now preload. Seventeen data judgments flagged for owner
  sign-off; the stack-flag migration sub-decision became CLI-400; the stack-detect skill patch
  rides SKILLS-10.
- **2026-08-06 — EDITOR-12** (editor.md) — a fresh pick rests at global scope everywhere: the shared
  `DEFAULT_SELECTION_OPTIONS` constant in `packages/matrix` is read by the editor's resting
  defaults and the CLI's seed decode, replacing three divergent spellings (two said project).
  Tests-first on all three workspaces; the CLI e2e `init --from` family re-pinned with inverted or
  explicit geometry so every spec still discriminates. Surfaced two `init --from` hazards
  (CLI-401, CLI-402) and the routing-vs-selection distinction now named `UNROUTED_AGENT_SCOPE`.
- **2026-08-06 — EDITOR-13** (editor.md) — the editor's "recommended" surfacing is selection-aware
  with the CLI's advisory ranking (incompatible > discouraged > recommended > normal): the
  `SELECTION_SCENARIOS` contract gained a `recommended` field across all 20 scenarios, the CLI got
  its missing contract runner (20/20 green), and the editor's `rec` filter now ranks against the
  live cell verdict. Browser-verified: with Svelte selected the framework-bound recommendations
  drop. New CLI-side divergence recorded for a ruling: the exclusive-category downgrade erases
  recommendations along with incompatibility.
- **2026-08-06 — EDITOR-14** (editor.md) — a selected skill's default assignments broadcast to
  every non-meta roster agent (21 of 25), matching the CLI; load state per agent from the shared
  preload mapping. `defaultAssignmentsFor` stays pure — the enabled-state filter applies where
  assignments are consumed, since on-ness derives from assignments. Added skills assign again
  (always lazy), resolving their category-source regression. The mapping's meta-category rows,
  dead under the domain filter, became live as authored. Recorded strains: the base-agent state
  and pin-ON direction are now nearly unreachable for non-meta agents; the EDITOR-10 researcher
  gap widened to 4 undrawable cells; where-used/install-dialog density grew.
- **2026-08-06 — CLI-401** (cli.md) — `init --from` is greenfield-only. It refuses an installed
  project before it even fetches, and refuses a payload carrying global-scoped entries when HOME is
  already installed; both name `uninstall` as the way through. The decode refuses a third thing: a
  project-scoped skill assigned to a sub-agent that rests global, naming every such pair, since
  those stack rows had no section to be written into and were being dropped in silence. Two
  findings close with it — the silent stack-row drop (partial: one `scope-split.md` note still
  owed) and the second-`--from` re-tune, which dissolves. The tuning and shared-config e2e specs
  keep their two-run setups and pin the refusal instead of the merge.
- **2026-08-06 — CLI-353** (cli.md) — answered by the CLI-401 ruling rather than built: `init --from`
  never overrides an existing install; it is greenfield-only and refuses with an uninstall prompt.
- **2026-08-06 — CLI-406** (cli.md) — assignment is relevance-scoped on both surfaces: one shared
  `resolveAssignment` in `packages/matrix` (domain skills → own-domain agents, shared → all
  non-meta, meta → their authored flavor rows, unknown ids → nobody) and the preload verdict is
  domain-gated inside `resolveLoadState` so cross-domain role matches resolve lazy. No broadcast
  anywhere; D-220 curation preservation and explicit seed choices ride through verbatim. Landed
  tests-first across matrix/CLI/editor; every suite green; hand-verified on the built binary.
  Skill domain comes from the catalog, never the id prefix (one skill's prefix lies).
- **2026-08-06 — CLI-414** (cli.md) — the "comprehensive and thorough" volume mandate is softened at
  its source: the agent-summoner's identity, playbook mandate sites, template block and both output
  exemplars, plus the prompt-bible's worked example, all carry the proportionality voice ("thorough
  on what the task needs and silent on the rest"). The 20 other agents that still carry the old
  phrase are owned by CLI-398 and later passes.
- **2026-08-06 — CLI-415** (cli.md) — prompt-bible Technique #6 rewritten from unconditional
  expansion modifiers ("NOT optional") to a conditional tool for genuinely broad tasks, with a
  "Modifiers That Backfire" block, the reviewer over-engineering case study cited, ten
  cross-reference sites and the summoner's technique summary aligned. The insight (countering
  under-delivery) survives; the volume doctrine does not.
- **2026-08-06 — CLI-404** (cli.md) — "recommended" is removed from the product entirely: the
  26-entry recommends list, the types (Recommendation, isRecommended, the recommended OptionState,
  ValidationWarning), the resolver tier (advisory ranking is now incompatible > discouraged >
  normal), the wizard badge, the editor's rec filter and chip, the contract field in both runners,
  and every reference doc — grep-proven, with the byte-identity guard green. Recommendations never
  lived in the marketplace; re-adding starts from this repo's git history. The sources-step
  "recommended skills" wording is a different feature and awaits its own ruling.
- **2026-08-06 — CLI-397 + CLI-398** (cli.md) — the five domain reviewers are one `reviewer` agent
  whose prompt carries the restraint repairs (worked APPROVE-with-zero-issues example, cost gate
  before Should Fix, Don't Mention / APPROVE-when blocks, "a speculative refactor suggestion is as
  much a review failure as a missed bug"), with domain knowledge distilled into four new
  `meta-reviewing-*` marketplace skills (web/api/ai/infra beside the existing cli one) that load
  lazily per diff; `meta-reviewing-reviewing` stays preloaded. The shared resolver gained the
  domainless-reviewer rule (cross-domain reach, preloads per its flavor rows, meta-reviewing
  checklists reach it row-less). Roster 25→21; stacks' 39 reviewer blocks merged to 17; all name
  surfaces, tests and docs re-pinned; verified on the real binary from a scratch install. PM
  softening + the reviewing skill's cost gate landed earlier the same day under CLI-397.
- **2026-08-06 — reviewer-column thinning** (owner ruling, rode CLI-398) — the reviewer flavor
  keeps framework/meta-framework preloads and `meta-reviewing-reviewing` only; 46 rows demoted,
  3 reviewer-only rows removed (the cli checklist joins its siblings as lazy). Open question
  recorded: demoting a meta row removes the reviewer's REACH to it, not just eagerness
  (meta-design skills now absent from the reviewer, finding filed for a ruling).
- **2026-08-06 — CLI-399 (implementation)** (cli.md) — four `meta-planning-*` skills authored from
  the PM playbooks (cli/ai relocated near-verbatim, web/api distilled); the four PM prompts keep
  the planning process and JIT-load their domain skill; a meta-planning reach rule delivers them
  lazily to domain PMs; mapping rows absent (lazy by absence). Stack membership was reverted
  until the skills publish — built-in stacks may only reference published marketplace skills
  (rule now in default-stacks' header). Interrupted by an API limit mid-verification; the
  orchestrator re-ran every gate green (full unit, full e2e, matrix, editor, tsc, lint) and
  verified the lazy activation protocol on the real binary. The planning-column thinning is a
  PROPOSAL awaiting owner review (keep 35 breadth rows, demote 72 depth rows).
- **2026-08-06 — CLI-417** (cli.md) — ruled and closed without change: the sources step's "Use all
  recommended skills (verified)" wording stays; it is a different feature from the removed
  recommendation tier and the owner keeps its vocabulary.
- **2026-08-06 — CLI-416** (cli.md) — the reviewer reaches the meta-design skills lazily: the
  resolver's craft-reach exception grew from one category to two (`meta-reviewing`,
  `meta-design`), targeting only — eagerness stays with the mapping rows, so developers keep
  their preloads and the reviewer's copy is lazy for free. Tests-first; all suites green.
- **2026-08-06 — CLI-391** (cli.md) — verified: the agent-lock refusal at project scope was already
  loud ("Global agents cannot be changed from project scope", guard-before-state-change, parity
  with skills). The landing hardened the evidence: mutation-tested the guard both directions,
  added the missing project-scope counterweight test, and rebuilt the e2e on byte-identical
  config and content-based compiled-agent comparison.
- **2026-08-06 — EDITOR-11 downgrade narrowing** (owner go, same day) — pick-one cells are judged
  against the selection a click would produce: swap-resolvable verdicts stay silent, surviving
  causes render incompatible with their real reason ("Remix (incompatible)" beside Svelte, a
  label the old blanket downgrade could never paint). The retargeted contract scenario un-marked
  its editor it.fails; a new framework-constraint divergence was pinned (the editor never reads
  compatibleWith); and the non-reflexive-whitelist defect became CLI-419. EDITOR-11's step-2
  extraction remains open.
- **2026-08-06 — CLI-400** (cli.md) — the researched mapping decides preloading everywhere: all 135
  hand-written stack flags stripped (stacks say WHICH, the resolver says HOW), the stack overlay
  resolves loads before entering the generator's explicit tier (the flagless-reads-as-curated trap
  caught red-first), third-party YAML flags still honored, STACK_PRELOADS and its per-agent
  flattening loss retired for resolver-derived assignments. Divergence report:
  todo/plans/CLI-400-divergence-report.md — 1202 agreements, 43 demotions (38 = cli-ink-oclif's
  roster-wide React preloads), 307 promotions (frameworks onto their domain's PM/researcher/
  reviewer/tester). All suites green incl. turbo 6/6.
- **2026-08-06 — SKILLS-10** (skills.md) — `meta-config-stack-detect` gained its third entry mode:
  product intent → candidate built-in stacks with reasons, the user picks before any mapping runs,
  uncovered intent surfaces as gaps. The invented "3-4 preload budget" is gone from all ~14 sites —
  the skill defers load states to the product's preload mapping, `lazy` where it cannot be read.
  The worked example verified against the live catalog, stacks and mapping. Follow-ups filed:
  SKILLS-11 (old fixture names retired reviewers), CLI-388 widened (no run-time route to stacks or
  mapping exists), CLI-420 (seed loads cannot defer to the mapping).
- **2026-08-06 — CLI-394** (cli.md) — packages/cli extends `@workspace/typescript-config/node.json`:
  nine inline options became two + extends, DOM globals are out of scope in the Node CLI (probe
  proven both directions), verbatimModuleSyntax/isolatedModules/moduleDetection/
  noFallthroughCasesInSwitch newly enforced. Total fallout across 600 files: one `import type`
  fix. The dropped options are documented in-file so nobody re-adds them; the missing-enforcement
  gap became REPO-29.
- **2026-08-06 — CLI-392** (cli.md) — 32 sparse agent maps declared total became
  `Partial<Record<AgentName, …>>` (bible §4), including `CompileConfig.agents` and the
  `{} as Record` NEVER-violation in config-gate/deps. Zero production sites needed new
  undefined-handling — every guard already existed, proving the old types contributed nothing —
  and 53 test casts (two of them banned double-casts) were deleted rather than adjusted. Also
  healed pre-existing vendor drift (the D-215 rename had never been regenerated into
  packages/matrix's vendored config). Standards follow-up filed as CLI-421.
- **2026-08-06 — CLI-395** (cli.md) — the matrix schema validates every id against the generated
  enum tuples (the header's drop-or-rename-fails-loudly claim is now true), 11 read-model casts
  deleted, SubAgent.model/flavor and the three by-id maps narrowed to their real unions with
  typed lookups at the added-skill string boundary (a non-member id returns undefined instead of
  a prototype method typed as a skill). All six workspaces green; www astro check included.
- **2026-08-06 — CLI-396** (cli.md) — `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` are
  on in the shared base with documented-decisions comments; matrix/editor/ui/server/www fully
  compliant (the editor's audit-flagged guards produced zero fallout — the CLI-392/395 groundwork
  held), packages/cli opted out with a debt note naming the counts and clusters (CLI-422). The
  step-agents banned `!` assertions became asserting lookups regardless. The
  absent-vs-explicitly-undefined judgment rule the fixes needed is proposed for the types bible
  (rides CLI-421).
- **2026-08-07 — CLI-393** (cli.md) — type-aware lint is on in all six workspaces
  (recommendedTypeChecked + no-floating/misused-promises everywhere at zero cost; the two extras
  where noise allowed). The three audit catches fixed with argued postures: the server's typed
  route validates stored payloads (500 + structured log on store divergence), plugin-validator
  narrows before reading, the editor's share path schema-parses its own serializer output. 182
  reports fixed in packages/cli; the two optionality-reading rules are off there ONLY because
  they read the CLI-422-owned opted-out type graph — a correctness argument, not volume. Eleven
  disables, each with a live reason. Prompts-teach-rejected-pattern became CLI-423.
- **2026-08-07 — CLI-389 main phase + EDITOR-06** (cli.md, editor.md) — the relationship-coverage
  campaign: 12 research batches over all 237 skills, 7 adversarial verification passes
  (refute-to-survive; every flagged low-confidence call attacked, four overturned on evidence),
  three apply waves landing 48 new/edited requires rules (50→98) and 5 exclusivity corrections,
  two category restructures (task-runner/lint splits, the Elysia merge killing the duplicate
  header), two wrong meta-framework fences deleted, and the 237-row audit manifest
  (`skill-audit.ts`: compile-time totality, health-check cross-checks, a self-emptying
  pending-apply set). EDITOR-06's ask — "empty must provably mean audited, not unlooked-at" — is
  structurally closed: verdicts 162 constrained / 75 universal, classifications A 112 / B 80 /
  C 23 riding SKILLS-01 phase 4. Remaining under the CLI-389 row: the owner's taxonomy ruling
  (9 proposals, api-data URGENT — Better Auth + BullMQ currently unsatisfiable), the category
  apply, Phase B conflict-group cleanup, and Phase C (gated on EDITOR-11 step 2).
- **2026-08-07 — CLI-420** (cli.md) — ruled working-as-intended and closed without change: shared
  configs are SNAPSHOTS. The research mapping seeds each assignment's default in the editor, the
  user may override, and the state at share time is authoritative on install — no defer-to-mapping
  wire state. One advisory stands: a stack-detect proposal written where the mapping was
  unreachable freezes all-lazy, which the skill's own report discloses for review.
- **2026-08-07 — EDITOR-11** (editor.md) — selection semantics are unified: one shared, browser-safe
  `createSelectionSemantics` module in `packages/matrix` (requires-closure, conflict fixpoint,
  the narrowed exclusive-downgrade swap rule, structured verdict causes) consumed by both the
  editor (its ~130-line parallel implementation deleted) and the CLI (which gained true
  multi-hop closure). All four divergence goldens flipped green red-first; a third runner holds
  the shared module itself to the contract; `compatibleWith` is confined to one seam for Phase C;
  the DOMAIN_ORDER byte-duplicates folded in. The discourages golden stays red-on-data by design
  until the catalog authors its first rule; the selected-cell asymmetry stays parked as recorded.
- **2026-08-07 — CLI-424** (cli.md) — saved stack curation survives category moves: the config
  loader re-keys each agent's entries under their skill's live category at the one boundary where
  storage layout is reconciled (deliberately NOT the stacks-file normalizer, whose keys are
  authors' prose headings — distinction pinned and filed). Also closed a second unnamed loss
  (a moved-but-newly-added skill kept its entry but lost its preloaded flag) and the cosmetic
  wrong-category prompt line. Red-first through unit, load-boundary, round-trip and e2e layers.
- **2026-08-07 — planning-column thinning** (owner go, per the CLI-399 proposal) — the planning
  flavor keeps exactly the breadth (35 skills: frameworks/meta-frameworks + client/server-state,
  pinned as a bidirectional category invariant mirroring the reviewer rule) and 72 depth rows
  demoted to lazy. PM eager columns: web 41→24, api →5, cli →2, ai →0. Mutation-tested pins.
  Two owner questions recorded: research-methodology fell OFF the PMs (the meta-row reach edge,
  CLI-416's parity fix available) and ai-pm's empty eager column (no AI breadth category).
- **2026-08-07 — CLI-389 taxonomy apply** (owner go on all nine) — the catalog's incompatibility
  taxonomy is honest: 11 new categories (the api-data six killing the 16-member radio and its
  unsatisfiable pair, web-graphql-client, web-rpc, web-docs, web-form-library, web-ui-kit,
  web-e2e, web-streaming), 3 flag flips, docker rehomed; conflict groups 28→12, each deleted only
  after its replacing radio existed; categories 91→102; zero skill ids renamed (CLI-425 parks the
  alignment); saved curation survives every split via the CLI-424 re-key, spot-checked by hand;
  the audit manifest's pending-apply set self-emptied to {}. All gates green in both repos.
- **2026-08-07 — CLI-389 COMPLETE + CLI-419** (cli.md) — Phase C landed: `compatibleWith` deleted
  end to end (39 groups, both seams, 50 resolved arrays, the FILTER_INCOMPATIBLE re-key),
  grep-zero proven with lineage comments only. The three presence-semantics scenarios are now
  pinned CLI/editor AGREEMENTS — the last divergence class (`framework-constraint`) is retired —
  and the three whitelist absurdities died with the field (tailwind-alone's 50 red cells, the
  local-skill quirk, CLI-419's self-verdicts). The chosen-vs-possible semantic is recorded in
  skills-and-matrix.md as D-306's inheritance. With this, every phase of CLI-389 is landed:
  inventory, 12 verified research batches, three rule waves, the taxonomy, the audit manifest,
  Phase B group cleanup, Phase C. One incompatibility mechanism remains, shared by both surfaces,
  and every one of the 237 skills carries a compile-checked audit verdict.
- **2026-08-07 — SKILLS-11..14** (skills.md) — the marketplace quartet: stack-detect's fixture and
  normative table on the live 21-agent roster; mongodb rewritten as the native-driver skill
  (grep-zero mongoose) beside its ODM sibling; the clack/commander cancel-exit conflict resolved
  as value-vs-owner (the framework table owns the code, the prompt library owns never-zero, 130
  where no table exists — declining ≠ cancelling preserved); update-marketplace and the README's
  three dead `@agents-inc/cli` references point at the published `agents-inc`, proven by a clean
  237-plugin rebuild through the corrected script.
- **2026-08-07 — CLI-418 + CLI-421 + CLI-423, WWW-11/12, EDITOR-21** — the consolidation sweep: all
  nine staleness items (the owed scope-split invariant, six dead e2e comments, both count
  reconciliations, the probe-comment floor ruling, the domains type predicate, the schema enum
  re-derived 63→102, built-in-catalogue fully re-derived with 9 corrected counts, the commands/dist
  gotcha documented); the standards aligned with the landed types (§6.10's sanctioned cast gone,
  §12 fixed, new §4a absent-vs-undefined and §12a closed-keys-open-questions, the last_validated
  counts rule as documentation-bible rule 6); the four cli-tester prompts stopped teaching the
  awaited write; the public docs teach greenfield `--from` and the 21-agent roster; editor-spec
  describes the real shared resolver. Residual trickle filed as CLI-426.
- **2026-08-07 — REPO-28 + REPO-29** (repo.md) — a bare root vitest run (which executed 327 CLI
  files against the real ~/.claude, not the tracked 88) now refuses loudly naming `turbo test` —
  the delegating alternative was built, measured, and rejected because Vitest silently drops
  nested projects; and the shared-tsconfig enforcement check landed beside syncpack behind a new
  automatic `deps:check` gate (CI + a third additive pre-commit stage) — discovering syncpack
  itself had been running in no gate at all. Reasoned opt-out key (`//no-shared-tsconfig`) for the
  four config-only workspaces; 13 tests incl. the exit-code fixture.
- **2026-08-07 — CLI-422** (cli.md) — the strict-flags debt is paid: packages/cli inherits
  noUncheckedIndexedAccess + exactOptionalPropertyTypes (zero opt-outs remain anywhere), 604
  errors fixed with the §4a judgment rules applied per producer-ownership, the two coupled lint
  rules on (one had never actually been configured — its own finding), 42 reasoned disables in
  three documented false-positive classes, and three structural catches: zod's .exactOptional()
  replacing false ZodType claims (validation tightened — explicit-undefined keys in hand-written
  configs now error), the config loader supplying the fields its type promised (20 lying-type
  guards deleted), and the beforeAll teardown-guard class retired via cleanup helpers. Full e2e
  green.
- **2026-08-07 — README skill count** (cli.md, was part of CLI-426's open questions) — owner
  ruled the README states a floor, not a census: "Over 200 skills across 9 domains". Applied to
  packages/cli/README.md; the number no longer rots when the catalog moves. The domain table's
  7-of-9 rows gap remains CLI-426's.
- **2026-08-07 — CLI-347/348/349/350** (cli.md) — the four legacy integration/user-journey files
  are deleted with proof, not faith: all 80 tests classified individually (47 covered, 29 asserted
  more strongly elsewhere, 2 vacuous, 2 unique), the two unique assertions ported and
  mutation-checked red (forkedFrom provenance → skill-copier.test.ts; compiled frontmatter
  tools/model/permissionMode → edit-recompile.test.ts). The honest answer to "how can passing
  tests be outdated": they ran through a test-authored wizard assembly, not the product's.
- **2026-08-07 — CLI-345** (cli.md) — the stale build-pipeline chain was rebuilt as
  `e2e/lifecycle/install-update-source-drift.e2e.test.ts`, the only spec driving a REAL
  install→update handshake (every other update spec seeds hashes by hand) — and it immediately
  caught CLI-428: update rejects every skill installed under its own id as "local-only". Pinned
  with `it.fails` until the fix lands.
- **2026-08-07 — SERVER-04** (server.md) — the editor↔server contract is typed: the worker's three
  routes chain into one exported `AppType`, the editor's configs client is `hc<AppType>` with
  byte-identical behavior (encodeURIComponent kept — hc splices params verbatim; safeParse kept —
  deployed worker ≠ built-against worker). The editor consumes an emitted declaration, not source:
  consuming source would let Cloudflare's ambient types silently displace the editor's DOM globals
  (finding filed). turbo lint/typecheck gained ^build for the generated-type edge. 14/14 web gates
  green, 178 e2e, hand-verified against a real wrangler dev worker. github-skills.ts stays
  untyped by design — it calls api.github.com directly; typing it is SERVER-01's proxy.
- **2026-08-07 — D-210** (cli.md) — `validate` is gone and `doctor` is the one health command:
  content checks first (sources, plugins, skills, agents — with the cwd added as a source entry
  for marketplace authors), operational checks only when content is clean, one formatter and one
  aggregate exit code across both layers. Deleted with no alias per the pre-1.0 no-shims rule;
  `agents-inc validate` now 127s, pinned by a test. Merging validate in also killed a documented
  blind spot: a skill directory without metadata.yaml is now a finding, not a silence — two tests
  that asserted the silence as a guarantee now assert the finding. Nine fixtures that wrote
  uninstallable content (passing only because nothing looked) were corrected. Red-first evidence
  on all four new e2e specs; verified by hand on the real binary in four scenarios.
- **2026-08-07 — EDITOR-01** (editor.md) — packages/ui has its test suite: 47 Storybook stories
  across all 11 primitives running as real Vitest browser-mode tests, 14 simple play-function
  interaction tests on the five behavioral components. The harness was proven by mutating the
  COMPONENTS (13 mutations, every one caught, all restored byte-identical) — including the honest
  note that two focus assertions could only be trusted via mutation because waitFor retries make
  inverted focus checks pass vacuously. Stylesheet loading probed via computed style. Spawned
  EDITOR-23 (tokens fail WCAG AA contrast) and EDITOR-24 (two pointer-only components); the CI
  chromium-before-test ordering it caught was fixed the same day.
- **2026-08-07 — REPO-30 + SKILLS-15** (repo.md, skills.md) — the catalog can no longer drift
  silently: a merge to the skills repo's main dispatches to the monorepo, which regenerates
  types → schemas → matrix (three generators, not two — schemas bake the slug/category enums, and
  a two-generator PR would have turned main red one commit later) and opens/updates a single PR
  on a fixed branch. actionlint-verified with negative controls; the live handshake waits on the
  owner-created MONOREPO_DISPATCH_TOKEN and a merge to main (repository_dispatch only reads the
  default branch's workflow copy).
- **2026-08-07 — EDITOR-23** (editor.md) — closed by owner ruling, not by a fix: the contrast
  ratios are the design as intended ("it's my own project and I like the look"). The axe
  `color-contrast` holdout in packages/ui is now marked permanent, the settled-constraints list
  in www.md records the ruling, and structural a11y checks keep gating. EDITOR-24 (keyboard
  access) is unaffected and stays open.
- **2026-08-07 — REPO-32** (repo.md) — the hooks are two tiers: pre-commit runs lint + unit on
  changed packages plus dependents via turbo's `...[HEAD]` (staged changes ARE in its selection —
  proven from turbo 2.10.8's source, not the docs, which never say), pre-push runs the full
  side-scoped suites including e2e against `@{push}..HEAD` with a run-everything fallback when no
  upstream resolves. The old "please do not narrow it again" warning was retired the honest way:
  retold as the history that explains why the push backstop exists. Verified by sh -n plus a
  stubbed-git simulation of eight selection scenarios; four behaviors are one real commit/push
  away from final proof. Spawned REPO-33 (typecheck runs in no hook; docs claim otherwise).
- **2026-08-07 — REPO-31** (repo.md) — deps:check has its third axis: every workspace with a
  vitest suite must extend @workspace/vitest-config or carry a //no-shared-vitest-config key
  whose value is the reason, living in the workspace's own manifest (the tsconfig checker's
  exact convention). The check parses imports rather than matching text — packages/ui names the
  shared package four times in the comment explaining why it can't use it, and a substring match
  would have scored that compliant. First catch on arrival: apps/server, which restates
  nodeConfig by hand with no recorded reason.
- **2026-08-07 — REPO-31 residuals** (repo.md) — the third axis is green end to end: apps/server
  now extends nodeConfig (the pool proved inert to environment: "node" — read from the Workers
  pool's own source, then proven at runtime with Cloudflare-Workers globals live and 17/17
  before-and-after parity), the checker's expected-fail marker failed before removal (the
  cleanest proof the gap closed), both hooks now fire deps:check when a vitest config moves, and
  monorepo-layout.md says three checks in all six places. deps:check exits 0 repo-wide.
- **2026-08-07 — CLI-428** (cli.md) — `update` is what it was always supposed to be: it refreshes
  the config's active marketplaces through Claude's own `claude plugin marketplace update` and
  touches ejected skills not at all ("Ejected skills are yours to own"). The whole eject-update
  apparatus went with caller-check evidence per symbol — comparison, hash classification,
  per-skill targeting, recompile fan-out — while provenance stamping stays everywhere it
  belonged. The skill positional, --yes and --source are gone with it. The byte-identity guard
  was mutation-checked through the FIXTURE (the old bug also left files alone, so reverting src
  couldn't redden it) — technique recorded in the spec and as a finding. CLI-346 is moot: the
  machinery it worried about no longer exists. Hand-verified in five scratch-HOME scenarios;
  full unit + e2e green.
- **2026-08-07 — D-69** (cli.md) — a corrupt config is now refused honestly everywhere: `edit`
  and `init` stop at step 0 with the recreate guidance ("uninstall still works on a config it
  cannot read, then init") and the editor URL (EDITOR_URL = https://agentsinc.sh, a new
  constant read from the Worker's custom domain); `uninstall` already tolerated corruption and
  now has the spec proving it. The investigation found the old behavior was worse than filed:
  edit blamed "No installation found" for a file sitting on disk, and a corrupt GLOBAL config
  half-loaded — wizard mounted, skills copied, plugins installed, config never written — the
  exact state the ruling forbids. The doctor pointer was deliberately declined with evidence
  (doctor misreports the case; filed as CLI-430). Hand-verified in four scratch-HOME scenarios.
- **2026-08-07 — CLI-399** (cli.md) — the roster has one `pm`: four domain PM agents deleted,
  the prompt carries process only with domain frameworks arriving through lazily-reached
  meta-planning skills (unpublished, so no stack names them — verified against the live
  marketplace.json, 448 plugins, zero meta-planning entries), one craft rule replacing two in
  the resolver, AGENT_NAMES 21→18, the editor's pm column retired like the reviewer's before
  it, 17 stack blocks converged. Hand-verified through a real pty: the compiled pm.md preloads
  cross-domain breadth on one planner, which is the consolidation's whole point. It also proved
  CLI-381 live (stale agents in dist nearly polluted the verification) and exposed CLI-398's
  unfinished reviewer prose sweep (CLI-431).
- **2026-08-07 — CLI-381** (cli.md) — dist mirrors src: the tsup onSuccess copies now remove
  before copying, so retired agents can no longer survive incremental builds and publish. The
  red-first proof found the working tree already carrying the bug's evidence — five retired
  reviewer directories sat in dist because the earlier hand-cleanup cleared planning/ and missed
  reviewer/, which is the sharpest argument for the automation. Set-equality assertion (a subset
  check passes on exactly this failure) added to the packaging tests.
- **2026-08-07 — CLI-431** (cli.md) — the reviewer prose sweep is actually finished: 35 dangling
  domain-reviewer names in 20 partials (the prior finding undercounted at ~20/15), each rewritten
  in its file's own voice — including the one judgment call where a boundary example needed two
  distinct targets, so it now points at the two developers instead of collapsing to one reviewer.
  CLI-399's own PM sweep verified clean. New finding: affected_files lists must be pasted grep
  output, and the dangling-name gate belongs at src/, not src/agents/ (one dangler lived in a
  config-generator test comment).
- **2026-08-07 — CLI-364** (cli.md) — fully landed with the init half: the validation reporter
  both commands owed lives on BaseCommand, init's spine calls it for both producers (wizard and
  --from), and the parity is proven the strict way — one fixture through the production
  validator, toStrictEqual on both commands' full warn arrays, then byte-identical output on the
  real binary. The delta was real: a conflict or unmet requirement was reported or swallowed
  depending on which command reached the roster. Skills half landed 2026-08-07 (husks,
  descriptions, CI metadata validation). Spawned CLI-432 (--from trusts the editor while decode
  skips unknown ids) and CLI-433 (valid flag hardcoded true).
- **2026-08-08 — REPO-35** (repo.md) — the commit-plan skill exists at
  .claude/skills/commit-plan/SKILL.md: history-derived grouping rules, the release checklist
  instantiated with mechanical checks (bullet parity by grep set-diff, findings-paths-exist,
  pure-additions-only CHANGELOG hunk), phased git authorization (read-only until plan confirm,
  writes per plan, push/publish per per-release confirm, never delegated), lossless divergence
  handling, resumable plan file. Two load-bearing discoveries baked in: npm publish packs the
  WORKING TREE not HEAD, and --no-verify intermediates skip formatting that prepublishOnly then
  fails on — so formatting is checked at analysis. Its dry-run against the real 706-file
  backlog sketched 21 groups, two releases (0.153.0, 0.154.0), three hard stops, and caught the
  cross-sequence matrix entanglement (web groups must follow the CLI release, or pre-push runs
  the editor against a taxonomy matrix doesn't carry yet). Reviewed and tightened by the
  orchestrator: parity grep widened to every ID family, formatting check scoped to planned
  paths, hook description made read-at-run-time, publish moved into a subshell.
- **2026-08-08 — SERVER-02** (server.md) — the mock truth is single-sourced: packages/api-mocks
  holds MSW v2 handlers mirroring the worker's routes with its verbatim error bodies, an
  msw-free ./fixtures entry for the Playwright side, and runtime parity by construction — the
  canonical payload is seedPayloadSchema.parse'd at import, the same schema the worker and the
  client both validate with, so fixture drift throws in every consumer at import time. The
  AppType route was deliberately declined (MSW has no slot it could constrain; it would have
  bought only a build-order edge). The premise correction mattered: no editor unit test had
  ever stubbed the network because the configs client had zero unit coverage — five net-new
  tests now run against the handlers, with unhandled requests erroring suite-wide. Also fixed
  en route: the editor's vitest alias list omitted the matrix subpath entry, a latent
  prefix-match bug. Playwright interception untouched, fixtures re-pointed, no assertion
  weakened.
- **2026-08-08 — CLI-427** (cli.md) — the CLI's eslint config genuinely extends
  @workspace/eslint-config, proven by a --print-config diff across all 16 config zones: the
  entire delta was one inherited loosening. The proof method caught the trap a violation count
  cannot: ESLint does not merge two options objects for one rule, so extending alone would have
  silently DROPPED a shared option the CLI's own override shadows — the override now restates
  it, and the mechanic is a finding. deps:check gained its fourth axis (7 bound, 0 opted out);
  both hooks fire it when an eslint config moves. En route: the ESLint-9 rationale was verified
  dead and every stale statement of it rewritten.
- **2026-08-08 — REPO-33** (repo.md) — typecheck runs at pre-commit per the owner ruling: the
  turbo line is lint typecheck test, order proven irrelevant by the task graph, and the two doc
  sentences that had claimed this for months are now simply true — no wording change needed,
  though three neighbouring statements were corrected. Spawned REPO-36: ESLint 10 resolves flat
  config from the linted file, so the recorded reason eslint left lint-staged is false and
  moving it back is a live owner option.
- **2026-08-08 — CLI-426** (cli.md) — the accumulated staleness sweep, every count re-derived
  from disk: all five e2e directory lists now diff clean against ls, the README's domain table
  gained its missing Desktop and CLI rows, eleven docs (not the filed nine) re-pointed from the
  deleted validate to doctor's layered output, the batch files' generator claim corrected in
  five files, code-generation.md's 9→8 and its dead justification rewritten, the composite
  generate script added, and STEP_TEXT's enumeration rebuilt (94 members; docs listed 83). The
  headline catch was item 3: the hand-maintained JSON schema's id pattern named a phantom
  security domain and omitted desktop entirely — all 16 desktop skill ids failed validation at
  three sites, and the selectedDomains enum held 8 of 9. All four vocabularies now equal the
  DOMAINS tuple, 0 of 237 ids fail.
- **2026-08-08 — CLI-430** (cli.md) — doctor names the real state: an unreadable config is a
  content-layer finding ("exists but could not be loaded: <reason>") that skips Sources for a
  stated reason and suppresses the false not-found row through the existing gate; the five
  unstructured loader lines are gone, and the refuse-surface and report-surface now share one
  answer to "which configs are in play" (the helpers moved to project-config.ts). D-69's
  message gained its doctor pointer the same hour the pointer became true.
- **2026-08-08 — CLI-432** (cli.md) — init --from revalidates (owner: "Revalidate"): the
  production validator runs over the decoded selection, cause precedes effect on the spine
  (skip warning, then the requirement it broke), and the "editor already validated" comment is
  gone. The row's literal test shape proved unreachable (the loader drops unresolvable
  requirement targets), so the spec pins the reachable shape — finding records why.
- **2026-08-08 — CLI-433** (cli.md) — valid is derived (errors.length === 0), vendored copy
  byte-identical. The finding's "two specs" was a sample: seventeen assertions went red and
  every one now asserts what its scenario implies — the undercount is its own finding.
- **2026-08-08 — computeSourceHash** (owner ruling: confirm-then-remove) — zero production
  callers confirmed; function, tests and barrel entry deleted. The oracle assertion recomputes
  the expected hash from the source file with the same primitive the production path uses —
  exact-value strength kept, mutation-checked red, restoration verified with cmp.
- **2026-08-08 — REPO-34** (repo.md) — the axis ergonomics trio: the //no-shared-* convention is
  documented once (key/reader/users table + five rules, per-axis repetitions slimmed to
  pointers), the allowJs requirement is DELETED rather than documented — a node.d.ts beside the
  shared vitest config's entry, proven strictly better in five measured steps (not a silent any;
  zero fidelity lost; all three hand-copied workarounds removed) — and the bound-workspace pins
  landed with a lesson attached: no-suite/no-config is an exit, not an exemption, so a workspace
  leaves a checker by deleting its config and only a name pin notices. The eslint pin found
  packages/api-mocks missing from an "every workspace" enumeration neither author had in view.
  Spawned CLI-436 (ten findings carry unparseable frontmatter in their REQUIRED fields).
- **2026-08-08 — REPO-36** (repo.md) — ESLint is in lint-staged AND on the turbo line, because
  the row's verification clause earned its keep: 24 type-aware rules genuinely read the whole TS
  program (proven, not assumed — a per-file run honors an existing disable directive under
  reportUnusedDisableDirectives, so the type program loads), while the config-gate bans turned
  out to be per-file AST rules and no cross-file plugin exists anywhere. The shape shipped:
  staged files lint-and-fix in ~2-4s (fixable violations no longer fail the commit at all; real
  ones fail in seconds instead of 19), the workspace run stays as the type-aware backstop. The
  three lint-staged patterns were proven pairwise disjoint with exact-union coverage against the
  old key — two keys writing one file is a silent-discard race. Every stale comment rewritten.
- **2026-08-08 — EDITOR-24** (editor.md) — both components are keyboard-operable with semantics
  that tell the truth: CommandBlock's copyable mode carries role/tabIndex/keys with Enter and
  Space arriving at the CALLER's onClick via the element's own click() (one handler, no drift) —
  and the install dialog LOST code, because it had hand-rolled exactly these attributes at the
  call site and would have double-fired. Segmented became a radiogroup with roving tabindex
  after reading the data (one enum field per row = one exclusive choice, not two independent
  toggles), taking each row from N tab stops to one. Focus-visible copied from Button, the one
  component that marks it. Red-first: 6 new play tests failed against the old components; ui
  suite 52, editor Playwright 179, all green. Spawned EDITOR-25 (nothing says Button's focus
  ring is the rule; ui has no authoring doc) and EDITOR-26 (a repeated discarded-config warning
  under Playwright).
- **2026-08-08 — CLI-435** (cli.md) — the empty-but-valid config is a WARN, and the evidence
  made the call: init writes exactly that shape as the blank global pair on every project init,
  and a state the tool mints deliberately cannot be an error. Doctor now says "valid but
  declares no skills and no agents" with a nothing-configured tip, the five rows beneath run
  instead of skipping, and the one-file-two-verdicts contradiction is gone — reproduced
  verbatim by the new spec before the fix, hand-verified in three states after.
- **2026-08-08 — CLI-434** (cli.md) — closed by symbol, not by count: the masking-helpers
  correction was 11 sites (the finding's table said 5 — one row per doc hid multiples), the
  computeSourceHash residue was seven sites with the write/read symmetry section rewritten to
  the one-hasher truth (no read side ever existed — why deletion was safe), and the writers
  guard had THREE dead rows, each replaced by its live successor because deleting would have
  shrunk the guard. Import-verified, not grepped — two dead names grep to live shims. Spawned
  CLI-437 (the drift is wider than the list).
- **2026-08-08 — SERVER-01 v1** (server.md) — the add-skill search is skill-level end to end:
  the worker indexes three verified community repos (56 skills, install-proof, KV-cached,
  one-repo-per-request under the Workers subrequest cap, stale-if-error) and the dialog filters
  the index locally — same row shape, provenance badge + stars, states in the existing
  vocabulary, selection contract unchanged except ids keyed repo/path (repo alone collided).
  github-skills.ts and its repo-search path deleted with caller evidence. Registry adapters
  stay deferred with the manual-testing condition. Spawned SERVER-05 (CORS never exposes the
  freshness header — found by testing against the deployed shape, not just the mocks).
- **2026-08-08 — SERVER-05 + the badge** (server.md) — the freshness header reaches the browser
  (exposeHeaders via the shared constant; the honest red lived in the SERVER suite, because
  Playwright's route.fulfill answers in place of the worker and can never observe its CORS),
  the hiding stub stays as the regression guard for the only test reaching the unknown branch,
  the badge shows full owner/name, and editor-spec.md's three dead references are repointed.
- **2026-08-08 — SERVER-06** (server.md) — the crawl left the request path: a daily workflow
  crawls all repos in one authenticated pass (all-or-nothing — a failed repo publishes nothing
  and the last good index stands, which is what makes never-expiring KV safe; zero-skill
  publishes refused), writes one KV key the YAML never spells, and /skills is a pure read —
  200 with computed max-age, stale after three missed dailies, 503 only before the first run
  ever. The one-repo-per-request machinery is deleted with its five constants; the crawl kept
  its tests by moving verbatim into a pure module both the script and nothing else import.
  Hand-verified: real crawl (56 skills), real worker on seeded/doctored/deleted KV.
- **2026-08-08 — EDITOR-25** (editor.md) — one focus treatment, written and applied: Chip and
  MatrixGrid's interactive button carry Button's ring (on the element, never in a cva a passive
  span reuses), SegmentedItem's copy removed, both new play assertions red-first on computed
  boxShadow in real Chromium. packages/ui/CLAUDE.md exists — and writing the rule forced the
  audit that found five more ringless controls, so the finding honestly stays partial
  (EDITOR-27).
- **2026-08-08 — EDITOR-26** (editor.md) — the discarded-config warning was a production bug,
  not test noise: zustand's persist calls merge(undefined) on EVERY empty-storage load, so
  every first-time visitor was told their configuration was unreadable. Fixed at the cause
  (undefined returns current state, no warning); the warning now fires only for JSON that
  parsed and failed the schema. Red-first, measured with a storage probe; 186 Playwright
  passed with zero occurrences.
- **2026-08-08 — CLI-436** (cli.md) — 11 findings' frontmatter repaired (one joined the class
  after the count was taken — the re-run scan caught it, and later caught the repairing agent's
  own two dropped terminators, which is the check earning its keep the same day it was built);
  the parse check is now permanent and runs before the count-based scans. The crumbs landed
  with one honest correction: the "four outcomes" generalisation was false for the tsconfig
  axis, so each exit sentence was written from its own checker's verdict union. Config-less
  ruling: a config-less workspace WITH TypeScript must declare itself; vitest-config now does.
- **2026-08-08 — CLI-437** (cli.md) — the drift swept by symbol: 9 sites corrected including
  two beyond the finding's table, three grep-as-drift sites verified correct and left, and the
  writers-list import-verification is permanent beside the lists it guards — red-proven by
  planting a dead name.
- **2026-08-08 — CLI-438/442/443, the scope cluster** (cli.md) — two real causes fixed, one
  turned out to be a spec gap: compile derived its passes from which installs EXIST rather than
  which scope the run is IN (project compile now touches only the project — proven by mtime
  snapshots over $HOME and a second project); the [P][G] guard's third arm refused the pair as
  a unit and is narrowed to global-owned halves, with the one legitimate pair case surviving as
  blocksExclusiveSwap (a radio swap dropping the project half would unmask the global install);
  and the fresh-pick override was never broken — the s toggle worked on every driven path, so
  Failure 2's fix is the mutation-checked spec that now pins it. 18 tests rewritten from the
  regression, never deleted; all three report reproductions re-run PASS on the real binary.
  New open finding: eight specs pinned behaviors no ruling established — CLI-444's first input.
- **2026-08-08 — CLI-441** (cli.md) — the stack's roster wins: the domain preselect ran AFTER
  stack application on every fresh init and overwrote the declared list; one guard at the head
  of preselectAgentsFromDomains (skip when a stack is selected) restores authority without
  touching the from-scratch path or the user's agents-step freedom. The regression can't
  return: a config-generation binding test replays all 17 stacks through the real store in
  wizard order (33 of 35 cases red pre-fix, by name), plus two real-binary e2e exemplars. One
  spec had held the defect as its expected value with a docstring explaining the wrong roster
  as fact — rewritten to read the roster off the stack. Hand-verified: 12 declared agents
  install, none absent, none extra.
- **2026-08-08 — CLI-439 + CLI-440** (cli.md) — one narration, one honest count: plugin-op
  banners live on BaseCommand beside the validation reporter (three copies of the hard-error
  became one; the migration path reports through the same surface via a reshaped
  MigrationResult), and the recompile summary is write-if-changed truth — "N rewritten, M
  unchanged" everywhere including the fan-out line, with unchanged checkable by mtime. Red
  observed on both e2e specs pre-fix (the parity spec's init leg passed, so the failure WAS
  the divergence). En route: four commands each carried their own copy of the fan-out summary
  in two spellings — now one function. Hand-verified in four scratch-HOME scenarios.
- **2026-08-08 — CLI-444** (cli.md) — the e2e suite is audited and remediated: 209 rows
  classified over 193 files, a 34-journey map with the canonical user-journeys doc
  (standards/e2e/user-journeys.md, four mandated surfaces per journey), 39 stricter rows
  applied with mutation checks, 20 redundant clusters folded with coverage proof (five
  refusals where the named cover didn't hold — the rule working), seven cannot-fail
  assertions rewritten, and every remaining gap either parked by ruling (import, new-*) or
  compiled as an open product finding for the next root-cause batch: the init-then-edit-merge
  fixture redesign, the unreported --source crash, and edit reporting an unresolvable skill
  as removed while preserving it (three surfaces, three answers). Net suite: leaner by ~30
  tests and strictly harder to fool.
- **2026-08-08 — CLI-445** (cli.md) — malformed metadata.yaml hard-errors under compile: one
  shared judgment (readSkillMetadata beside parseFrontmatter, reused by compile, config-types
  and doctor — doctor's own parse block deleted in favor of it), the refusal names skill, file
  and reason unwrapped, and no agent files are written. Red-first on both specs; repaired file
  brings both passes into agreement. The parseable-but-incomplete half stays deliberately open
  as a filed finding: closing it fails 81 of 99 fixtures whose metadata no product path can
  produce — a fixture program awaiting its own ruling.
- **2026-08-09 — CLI-446** (cli.md) — incomplete metadata fails like unreadable metadata: one
  widened verdict (usable/unusable) feeds compile's refusal, config-types' skip and doctor's
  report, with missing fields named in plain words read off the raw fields rather than zod's
  message. The fixture-realism program paid for itself at the generator: 82 of 100 call sites
  healed free once renderMetadataYaml wrote what the product writes, the only way to author a
  broken fixture is now the explicitly-named renderIncompleteMetadataYaml, and the six e2e
  failures the change surfaced were all fixture-realism fallout (skills made "unresolvable" by
  metadata no product path produces) — repaired at the fixture, no product behavior bent, no
  stopped rows. A new test-data standard section records the rule.
- **2026-08-09 — the endgame chain** (owner orders of 2026-08-08) — third journey pass 17/0 with
  all four surfaces asserted (27 batteries clean), CLI-446's incomplete-metadata refusal +
  fixture realism, the expressive-TS alignment (40 modules: 35 conforming, 5 aligned, doctor.ts
  carrying the only written-rule drift), and the .ai-docs whole-corpus currency pass: 18 docs
  corrected, 5 verified clean, union counts 237/102/18 re-derived corpus-wide, six dates
  advanced on full re-derivation with eight left honestly stale per the bible's rule. All
  gates green everywhere; the tree is ready for the commit round.
- **2026-08-09 — CLI-447/448/449** (cli.md) — the invalid --source path refuses before any
  wizard mounts (one refusal through the fetcher both commands already shared; the old "red"
  those specs accepted turns out to have been Ink's raw-mode crash), the merge journey is
  finally drivable (one non-exclusive spare in the fixture; the apparent merge defect was a
  fourth fixture bug — a HOME mismatch between phases — the merge itself is sound, now
  asserted by id on config AND compiled agent), and the ~ symbol was already correct for mode
  switches — so the work was two mutation-verified pins, including one that survived its
  mutant on the first try by matching the wizard's own frames and was re-pointed at the
  post-clear summary buffer.
- **2026-08-09 — EDITOR-27 + the source-code link** (editor.md) — every focusable control draws
  the ring: Badge (interactive form only), the dialog ✕, Input (in the cva base — every render
  is an input, and focus-within on the wrapper would light the whole chip row), the
  LabelledAgentCell, the ••• button. migrateConfig reports what it discards — deliberately
  "another version", because newer blobs are discarded too and the suite proves it. The ••• menu
  gained SOURCE CODE ↗ with the mapping verified not assumed (237 ids ↔ 237 dirs, two real 200s
  and a 404 control; HEAD-based URLs; AddedSkill gained path; no skill class lacks a URL so the
  field is required). Red-first on all nine assertions; ui CLAUDE.md's exception list is empty.
  Spawned EDITOR-29: the sticky filter bar steals focus from tab-scrolls — a real measured bug.
- **2026-08-09 — CLI-450** (cli.md) — source switching is gone: the marketplace axis (already
  dead weight — configs it wrote, nothing read) deleted through five whole files, the loader's
  tagging phases, the extras array, the store's arbitrary-source verb (now setInstallMode — the
  UI can no longer hand over a source string), and the grid reshaped to a self-captioning
  two-state Local|Plugin control with the pinned header retired. Unresolvable entries are
  REMOVED and named with their reason (D-233 preservation deleted per ruling; the wizard's
  rejected-ids state kept and repointed to feed the report). eject --source removed. The 34
  bulk-mode specs passed unmodified without being opened. One incident: a step-7 rename
  overwrote the pre-existing install-mode.integration.test.ts — path freed, owner restores via
  git checkout; the renamed spec lives at install-mode-round-trip.
- **2026-08-09 — CLI-451** (cli.md) — no more silent stack substitution: one predicate
  (isDefaultSource, replacing the two places that spelled the identity) scopes the built-ins to
  the default public marketplace; a custom source offers its own stacks or none, and with none
  the wizard opens on Domains prepared as start-from-scratch (ESC made inert on empty history —
  it used to wipe selections in place). Red-first: the stackless spec caught all 17 built-ins
  painting. Two suites had depended on the substitution — including one literally named
  "renders real stacks" that was rendering the CLI's — both now drive their own skills.
  Noted, not changed: the tab bar still draws a completed Stack tab when skipped (owner UI
  call), and loadStackById's per-id fallback stays unscoped for saved configs and --from.
- **2026-08-09 — EDITOR-29** (editor.md) — sticking moves focus nowhere: the effect had exactly
  one reader and one writer (nothing legitimate to preserve), and its removal was proven from
  both sides — two specs that had pinned the grab rewritten to the ruling, three workarounds
  that had dodged it removed, the KNOWN-GAP ring spec restored to full strength, and the
  predicted flake caught live in the red run before dying with its cause. Five consecutive
  8-worker runs clean; the editor-spec's §6 paragraph now records the ruling instead of the
  removed behavior.
- **2026-08-09 — CLI-452** (cli.md) — four commands and a wizard feature are gone with
  per-symbol caller evidence: import skill (its schema/fixtures/consts freed and deleted, seven
  shared helpers kept), all three new commands (the generators module and two gate writers died
  with them; the marketplace-generator survived for build), the F filter (cascade stopped at
  isIncompatible, a matrix primitive with its own suite), and the INFO_PANEL flag (the panel is
  simply on). Zero flags remained, so the feature-flag module itself is deleted. Red-first via
  the help-surface specs; hand-run: all eight dead invocations exit 127, the footer reads
  D/S/I, F is a byte-identical no-op. Zero unconditional describe.skip remain in the suite. The
  stale-dist trap it caught (a deleted command looked tested) is CLI-457. Rows CLI-332/333/334
  and D-52 retired with it — they tracked un-skipping specs for, and expanding, commands the
  owner ruled deleted (new agent is not returning; new skill/marketplace return as CLI-453/454).
- **2026-08-09 — CLI-457** (cli.md) — a green unit run now means green against current source:
  pretest builds on the script path, and a 66ms globalSetup tripwire refuses a stale dist on
  EVERY vitest invocation path — globbing directories as well as files, because the case it
  exists for (a deleted source) leaves nothing to stat but a parent whose mtime moved. Turbo's
  cache semantics were verified before trusting mtimes (a FULL TURBO replay stamps current
  time, so cache hits cannot fake staleness). Red evidence was the finding's exact shape: four
  tests passing against a command whose source was gone, then the refusal. The bypass story is
  stated honestly — watch-session edits and non-src build inputs stay open, the biggest being
  packages/matrix (CLI-458).
- **2026-08-09 — CLI-455** (cli.md) — the tab bar is a function of the step flow (a run without
  a stack step has no Stack tab, and getStepProgress computes against the same flow, so tabs
  cannot advertise a step the run never has), and loadStackById's built-in fallback is scoped
  by the same isDefaultSource predicate as the step — a missing id under a custom source throws
  one message naming the id AND the source, replacing two reports that pointed at a file
  custom-source users don't have. Eight red tests first; hand-run PTY captures show the tab row
  with and without Stack. Spawned CLI-459 (the stack-plugin install chain has no production
  caller) and the .prettierignore now covers install artifacts from hand-runs.
- **2026-08-09 — CLI-456** (cli.md) — removal reasons tell the truth per entry class: a
  marketplace entry the source dropped is removed as before; a local skill whose files are gone
  is removed saying so; a local skill whose files EXIST but whose metadata is unusable refuses
  the run before the wizard mounts (entry untouched, compile's shared voice, doctor pointer) —
  a YAML typo can no longer cost a config entry. Two extra arms the hand-run forced: a
  directory not naming the id, and an unplaceable category, each with its own honest reason.
  init needs no guard — the dashboard diverts before its wizard can see a global roster
  (proven, and the dead call removed rather than shipped untestable). Best catch: an existing
  spec's unanchored toContain was satisfied by a warning six steps earlier and stayed green
  through the exact substitution it existed to catch — now anchored.
- **2026-08-09 — CLI-458** (cli.md) — half the ticket's premise was false and the agent proved
  it instead of building on it: turbo DOES hash a dependency's files even when it implements no
  build task (shown with real FULL-TURBO→rebuild transitions and a non-dependency control), so
  no turbo change shipped — the measurement is recorded where the wrong inference was born. The
  real half landed: the guard scans packages/matrix/src too (+0.3ms), refuses when a tree scans
  empty (a moved package must not silently stop being guarded), and the deleted-file case works
  through parent-dir mtimes. packaging.test's skipIf retired with its unreachability observed,
  not assumed. Spawned CLI-460 (the guard itself is checked by no tsc program and no eslint
  config) and the package-level .prettierignore now covers install artifacts.
- **2026-08-09 — the arc docs pass** (codex-keeper) — 16 reference docs corrected, 9 verified
  clean, every cited src path proven to resolve. Headliners: the removal-reason sentence became
  the five-class table it now is; STEP_TEXT reconciled name-for-name (three phantoms from the
  source-switching removal, six omissions); the guard registry gained its first refusing entry;
  a documented pair of divergent fan-out spellings turned out to be a comment's invention —
  no such strings exist in src, and the comment that seeded both docs is corrected too. The
  standards-side residuals (the second STEP_TEXT enumeration, one dead spec citation) closed
  by the orchestrator with programmatic name-for-name reconciliation.
- **2026-08-09 — CLI-460** (cli.md) — the staleness guard's logic lives in src
  (lib/testing/dist-staleness.ts, 14 unit tests red-first) with a three-statement hook at the
  root; every design point preserved verbatim. The gates now genuinely reach it — proven by
  observed reds, not assertion: a planted unused-var AND a type-aware-only lint error both
  fired in the new home while the old path still answers "file ignored", and a planted TS2322
  fired from the main program. The guard fires from src through vitest's own transform before
  any spec collects, no build involved. One pleasant recursion documented: the guard now sits
  inside the tree it scans, so editing the guard demands a rebuild — a refusal you didn't
  need rather than a green you shouldn't have had.
- **2026-08-09 — CLI-459** (cli.md) — the stack-as-one-plugin chain is gone: five files, the
  entry points, their types, a factory, and two second-order symbols whose only production
  caller was the compiler (generateStackPluginManifest, convertStackToCompileConfig — one live
  round-trip spec rebased onto the skill-plugin generator). Every keep has a named second
  caller; barrels carry no orphans; thirteen docs re-derived, including a dependency-graph row
  whose total had never added up because it silently omitted a consumer. Proof was the full
  gates on a guard-enforced fresh build. The tail it exposed but didn't own is CLI-461.
- **2026-08-09 — CLI-461** (cli.md) — the tail is gone: resolveStackSkills deleted with a
  monorepo-wide caller check; resolveAgents pruned to four arguments with the cascade followed
  per symbol (four died with it, one survived because the live path still reaches it — and the
  defending comment turned out to protect the return shape, not the parameter, so no STOP);
  SKILL_PLUGIN_PREFIX collapsed after the changelog proved its empty value was a deliberate
  landing, not a hook. Specs rewritten wherever their subject survived, deleted only where it
  didn't; a stale caller-count comment corrected in place with read-only git as evidence. Two
  adjacent finds (CompileConfig.stack has no reader; _projectRoot is reserved-unused) left for
  the knip baseline.
- **2026-08-09 — CLI-464** (cli.md) — knip is wired as the hand-run deps:dead script (explicitly
  not a gate) with per-workspace entry-point tuning iterated until findings were real (four
  config lines removed on knip's own hints; the editor's function-config threw at production
  mode and needed the plugin off). Baseline: 325 findings — 304 export-level (197 barrel lines
  nobody names, 53 needless export keywords, 35 zero-reference symbols), 11 unused devDeps, 3
  duplicates, 4 UNLISTED deps including the one real defect: chalk is production code in the
  published bundle resolving only off hoisting. The two CLI-461 finds confirmed dead by grep
  (knip structurally cannot see either — parameter and object-member deadness are outside its
  issue types). Report at todo/plans/CLI-464-dead-code-baseline-2026-08-09.md.
- **2026-08-09 — REPO-27** (repo.md) — lint-staged's markdown glob covers .mdx: one character
  class extended, so the www pages that skipped prettier at commit no longer do.
- **2026-08-09 — the chalk dependency** (from the CLI-464 baseline, owner: "fix the chalk dep
  now") — chalk ^5.6.2 is declared in packages/cli's dependencies instead of resolving off a
  hoisted transitive: tsup externalizes everything but matrix, so the published CLI genuinely
  requires it at runtime and an unrelated dependency change could have broken the shipped
  binary. Install unchanged, syncpack and all deps:check axes green. The remaining unlisted
  deps ride the deferred knip rounds (CLI-467).
- **2026-08-09 — CLI-465** (cli.md) — staleness is dead as a user concern: every remote source
  load asks one conditional HEAD (median 1.15s total on a warm cache, inside the owner's band;
  ETags proven stable across days, encodings pinned, offline capped at 2.5s instead of undici's
  10.5s) and answers with one of four verdicts — silent cache, "Marketplace has newer content —
  fetching the update...", silent record-establishing re-fetch, or an honest
  cached-copy-may-be-stale warning. The prove-first discipline earned its keep: giget's own
  ETag path re-extracts even on a hit (1.7s — calling it every load would have failed the bar),
  and the old warm path never touched the network at all. `--refresh` is deleted from every
  command with all its plumbing. Red evidence: the fixture's request log showed zero requests
  where the new contract demands one.
- **2026-08-09 — CLI-468** (cli.md) — the orphan check fires in the state that guarantees
  orphans: absent config + installed artifacts = a FAIL row naming every unowned path, with the
  way out stating honestly that uninstall clears the skills but the compiled agents outlive it
  (checked by running it, not assumed). The error-vs-warn verdict was argued from doctor's own
  table — every existing warn names a state some command repairs; nothing repairs a stranded
  install. The skip survives exactly where it was never wrong (nothing installed; unreadable
  config still gates the layer per CLI-430). Spawned CLI-470: uninstall's removal plan promises
  the agents directory and then can't touch it.
- **2026-08-09 — CLI-469 + the 5s cap** (cli.md) — buffered startup warnings render in the
  wizard: a StartupMessages band between the tabs and the step content, level-coloured in the
  existing vocabulary, with two measured budgets (3+count normally, 1+count on short terminals —
  the numbers forced by a fixture that emits 2384 warnings and a terminal where four rows left
  the confirm summary one row of viewport). The prop was proven genuinely dropped — the Static
  block two comments described has never existed; both corrected. The offline cap widened to 5s
  with its justification rewritten for the new number. Hand-run: the cached-copy warning visible
  above the stack list with the tarball server killed; a healthy install shows no band.
- **2026-08-09 — CLI-466** (cli.md) — --source is init's alone: BaseCommand carries no flags at
  all (NO_BASE_FLAGS deleted with its six opt-out sites — the one-definition shape inverted the
  question), CC_SOURCE is read only when the caller names itself init (threaded as a request
  parameter, not a global), and the chain gained the project rung compile had been skipping.
  The harness now clears the env var the CLI actually reads, EditWizard records its source into
  the config instead of passing a flag (142 launch sites untouched because of it), and the next
  Nonexistent-flag mistake costs one second, not 45 per wait. Full e2e exit 0. Spawned CLI-472
  (the built-in matrix names a skill the default marketplace does not ship — eject dies on it)
  and CLI-473 (sourceConfig has no readers).
- **2026-08-09 — CLI-471** (cli.md) — the row's premise was wrong and the agent proved it: the
  2384 warnings were the CLI's OWN defaultRules (176 public-catalog slugs) applied whole to
  every custom source — the fixture ships no rules file at all, so no fixture edit could reach
  zero. The fix narrows built-in rules to the slugs the loaded source's skills actually carry
  (source-authored rules never narrowed — a slug their author typed is their defect, pinned by
  the relationships specs), proven behavior-preserving relation-for-relation on both the
  fixture and the full catalog. 2384 → 0; every wizard frame sheds the noise band; zero spec
  rewrites needed because nothing had asserted the noise. The narrowing is the CLI-451 ruling
  one dataset over: built-ins serve the default catalog, custom sources get only what applies
  to them. Spawned CLI-477 (invariant 4 — built-in slug freshness — is enforced by nothing).

## 2026-08-10 — the pass-5 fix programme (16 rows, all landed UNCOMMITTED in the working tree)

Every row below was driven through the repository's full flow: tests written and watched RED first,
then the fix, then the meta-design-expressive-typescript skill over the changed code, then the real
binary hand-run under a scratch HOME, then an adversarial verifier that re-ran everything and checked
the red-then-green was genuine rather than a weakened assertion. Adjudications, evidence and the
honest diff against two earlier (wrong) rounds are in
[`plans/cli-flow-verification-fifth-pass-2026-08-10.md`](./plans/cli-flow-verification-fifth-pass-2026-08-10.md).

- **CLI-481** — a skill's `metadata.yaml` category now reaches the marketplace: threaded through
  `PluginManifest` → the strict schema → the manifest generator → the marketplace entry, so
  `build marketplace`'s breakdown stops reporting everything as `uncategorized`. The recorded
  `it.fails("carries a category on every plugin entry")` is green. Verified against the REAL Claude
  CLI (2.1.226): it accepts the extra `plugin.json` key, two live plugin installs, exit 0 — the
  fallback was never needed. Also regenerated `src/schemas/plugin.schema.json`, which
  `additionalProperties: false` would otherwise have failed at the next publish.
- **CLI-484** — `list` counted plugin skills from a single `settings.json`, so a plugin install
  reported `Skills: 0` from a project directory. It now merges the scopes it already computes, by id.
- **CLI-487** (with L-16) — revalidation memoised its verdict but not its side effects, so a moved
  source was torn down and re-downloaded on every later load in the same run (a full duplicate
  tarball for `github:` sources) and printed its notice twice. Seeded the memo after a successful
  re-fetch; moved the unreachable warning inside the memoised classification.
- **CLI-490** — `search`'s `ID` column rendered display names and its `Source` column the hardcoded
  string `"marketplace"` for every row, local skills included. Both now tell the truth.
- **CLI-470 leg 1** — the uninstall preview promised to remove compiled agents it then kept. Legs 2
  and 3 (the body-comment provenance marker and the marker-driven sweep) stay on hold.
- **CLI-488** — at the home root the resolver labelled the GLOBAL config "project", so `compile`,
  `edit` and `doctor` all said "project" for a global install; and `resolveSource` named a `--source`
  flag the running command refuses.
- **CLI-480** — emptied `.claude/skills` and `.claude/agents` survived a full collapse, and a
  project-only install pre-created an empty `~/.claude/agents/`. Emptiness is filesystem emptiness,
  so a hand-authored agent keeps its directory.
- **CLI-494** — uninstall computed its preview and its removal from two independent predicates kept
  in sync by a comment. One plan is now computed, rendered and executed, so the preview cannot lie.
- **CLI-495** — the "prune the parent when it empties" policy was a caller responsibility across six
  sites and `edit.tsx` had forgotten it. One operation owns compiled-agent removal and its directory.
- **CLI-478** — generated output orders itself: canonical stack category order in the generator, and
  `config.ts` field order canonical in both writers, so emission is a fixed point. Accepted cost,
  ruled: every installed config and compiled agent rewrites once on its next save.
- **CLI-483** — toggling a sub-agent global→project silently rebuilt its stack from relevance
  defaults and shrank its compiled catalogue 7 skills → 4. The curation carrier now reads the global
  config too, so a scope change moves where an agent lives, never what it knows.
- **CLI-482** — project configs carry the project directory's name. Landed in two parts: the
  hardcoded seed, then the residual its own verifier caught — a config loaded from the `$HOME`
  fallback was donating its `name` to the project through the merge.
- **CLI-485** — `init`'s closing block told the user to edit a config that carries no assignments and
  to compile from a directory whose pass recompiles nothing global.
- **CLI-486** — every refusal inside `edit`'s and `init`'s context load fired under a mounted
  spinner, so the error frame painted over a live spinner. `try`/`finally`, never `catch`.
- **CLI-489** — the plugin→eject direction returned `ejectedSkills` and reported nothing.
- **CLI-491** — the scope filter correctly drops a project skill from a global agent, and said
  nothing; both surfaces now name the skill and the pair.
- **CLI-479** — the Sources bulk hotkeys reached through the 🔒 lock: a project edit could flip an
  inherited global row's install mode, run a real `claude plugin install` and rewrite the global
  config. The docs' own "Known Gap". Keys withdrawn, the surviving `setInstallMode` gated
  slot-keyed against the hydration snapshot, and the two page objects re-pointed to a per-row walk so
  all 84 affected specs kept working. `edit-project-source-migration-propagates` was retired
  (`describe.skip`) with a header recording that its defect is closed by construction, not fixed —
  spawned CLI-496.

Also this day: **CLI-472** and **CLI-474** closed by the marketplace publish (`eject skills --force`
ejects 238 skills, exit 0); **F-1** and **F-2** from the fourth pass confirmed fixed at the source
(all 102 published category values are in the CLI's table; `doctor` exits 0, 12/0/0).

## 2026-08-12 — CLI-476 withdrawn: the global `marketplace` field is required, not a leak

The row said a project-scope switch to plugin mode writes `"marketplace"` into the GLOBAL
`config.ts` and never removes it on the reverse switch, filed as a one-field instance of the
CLI-438 containment class. It should never have been a row: the fourth pass recorded it under
**"Observations, not defects"**, called the write "Defensible", and closed the note with
"Recorded so a future containment assertion does not read it as a regression" — a guard against a
false positive, which filing it as a bug then defeated.

**The write is load-bearing.** `uninstall` builds the `<id>@<marketplace>` registry key from
`config.marketplace` (`getCliInstalledPluginKeys`, `uninstall.tsx`), because `skill.source` can
read `"eject"` where the plugin is registered under the marketplace name — without the field a
global uninstall owns nothing and leaves registered plugins behind. Carried deliberately since
`90bcffe3` (2026-07-20, "carry marketplace into global config").

**The stickiness is deliberate too.** `mergeGlobalConfigs` (`config-gate/propagate.ts`) takes
`existing.marketplace ?? incoming.marketplace` — fill-only. The merged global config is
multi-marketplace by construction (the merge never removes skills), so a second init from another
marketplace leaves plugins from both and either label orphans the other's registry key. Repointing
or clearing it from a project context would rewrite global state on behalf of every other
registered project (`403df46`). Pinned by three `mergeGlobalConfigs` unit tests in
`local-installer.test.ts`; changing global source identity stays an explicit global-scope `init`
that bypasses this merge.

The one half of the observation that WAS a defect — the write reordering the file's export keys —
landed separately as **CLI-478**. Nothing of the row survives it.

## 2026-08-16 — three rows retired without being built (owner rulings)

Each was outrun by a decision rather than fixed, so nothing is owed and nothing is deferred.

- **D-213** — custom agent lifecycle, `new agent` depending on a compiled agent-summoner. Retired
  because `new agent` is not returning (owner ruling 2026-08-09, recorded in ROADMAP.md's
  "Explicitly NOT in the program"). The row had stayed `Ready for Dev` for a command that was
  already cancelled. Its 15 skipped e2e specs in `e2e/commands/new-agent.e2e.test.ts` go with it —
  they were blocked on this row and now describe a command that does not exist.
- **CLI-410** — `cc import skill` writing no `slug`/`domain`/`custom`, so every imported skill was
  undiscoverable. Retired because `import skill` itself retired in `95738763`, and the archive
  records its schema, fixtures and consts deleted with it. The row targeted a command that no
  longer exists; the need it described — external skills arriving with real metadata — is now
  CLI-412 plus the leg-2 intake.
- **D-14** — import skills from third-party marketplaces. Retired: superseded by the editor's
  add-skill button plus EDITOR-30's marketplace loading (owner 2026-08-16). Third-party skills now
  arrive through the editor's intake, resolved to content and carried inline in the payload, rather
  than through a CLI import path.

## 2026-08-16 — CLI-501: the config fields say what they hold

Landed uncommitted in the working tree, driven through the repository's full flow: tests written and
watched RED first (26 across 9 files), then the implementation, then the
`meta-design-expressive-typescript` pass, then the real binary by hand.

`ProjectConfig.source` held a REF and `ProjectConfig.marketplace` held a NAME, so the flag that was
about to be called `--marketplace` would have written a key called `source`. Both moved, in the only
order that works — the name vacated `marketplace` before the ref took it: `marketplace` →
`marketplaceName`, `source` → `marketplace`, and `SkillConfig.source` → `origin`, that last one
because it holds `"eject"` half the time and is provenance rather than a marketplace. The internal
`Source*` type family, `MarketplacePlugin.source` and `ResolvedConfig` were deliberately left alone;
the mapping now reads on-disk `marketplace` → `result.source`, on-disk `marketplaceName` →
`result.marketplace`.

**The guard was the point, and the row's premise about it was wrong.** The row said the trap was
`.passthrough()` on both loader schemas. That is only the first layer: `loadSourceConfig` wrapped its
load in a catch that turned EVERY failure — schema rejection included — into `verbose()` + `null`, so
`resolveSource` saw "no config" and walked to `DEFAULT_SOURCE`. A schema-only fix would have produced
a correct-looking rejection and a still-silently-repointing resolve. Both layers landed: a
`refuseRenamedFields` refinement piped in FRONT of both schemas (it has to read the raw document —
the declared `skills` array strips a stale key on a skill entry before any refinement would see it),
and `loadConfig` now throws a named `ConfigSchemaError` that `loadSourceConfig` re-raises.

Two silent collisions found on the way, both object literals TypeScript does not excess-property
check: `wizard-store`'s `{ ...sc, source }` meant `setInstallMode` wrote a dead key, and `eject.ts`'s
spread would have put the marketplace NAME into the REF field.

Verified: unit 6325 passed / 26 new green; e2e 203 files, 696 passed, 0 failed — the exact
pre-change baseline; `tsc` ×3, `eslint`, `prettier` and `generate:matrix:check` all clean. By hand,
a stale config exits 1 naming both key pairs, and a renamed one loads and reads the ref from the new
key. 173 files changed, 33 of them production.

Three findings filed: the loader swallowing every failure into null, unit specs reading the ambient
config on disk, and the rename stopping at typed positions — the last one records that a field rename
has four surfaces and only two of them have a checker.

Two rows deliberately NOT done and left open: **CLI-499** (the 263-identifier internal tail) and
**CLI-500** (the 241-file docs pass), split out of CLI-463 by the audit.

## 2026-08-16 — CLI-463: the surface says marketplace, and one rename was withdrawn

Landed uncommitted, tests first and watched RED (50 across 7 files), then the implementation, then
the `meta-design-expressive-typescript` pass, then the real binary by hand.

`--source`/`-s` became `--marketplace`/`-m` on `init`, the only command that ever defined it;
`CC_SOURCE` became `CC_MARKETPLACE`; the init hook's raw-argv scan follows; and ~96 user-visible
strings across 29 files moved with them — config validation, `source-fetcher`, `messages.ts`,
doctor's rows (`Marketplace Reachable`, `Marketplaces`), `exec.ts`'s refusals, `list.tsx`'s label and
the remainder. The old spellings are REJECTED, not aliased: `Nonexistent flag: --source`, exit 2, on
every command including init. `CC_SOURCE` gets no deprecation warning — an unusable value in a
variable nothing reads is not the run's problem.

**The wizard tab rename was made and then withdrawn by the owner.** CLI-463 renamed the tab
`Sources` → `Origins` and its subtitle to match, reasoning from CLI-501's `SkillConfig.origin`. The
owner ruled the tab stays `Sources`. Both strings are back byte-for-byte, the JSDoc that justified
the rename was rewritten to describe the code rather than its history, and the two specs whose
negatives asserted the withdrawn rule were one inverted and one deleted — inverted where the
positive it implies was genuinely uncovered, deleted where the same positive was already asserted
twice in the file.

`e2e/fixtures/project-builder.ts`'s options were renamed with it: `marketplace` → `marketplaceName`
and `source` → `marketplace`, because after CLI-501 each option name pointed at the field it did NOT
write. 23 property renames across 14 files — `tsc` found eight more than a grep of the two factory
names did, via `editable`/`withCustomSkill`. The emitted config text is byte-identical by
construction; only type declarations, `@link` targets, local names and the right-hand side of option
reads moved.

**One instruction of mine created work.** The implementing agent was told not to run e2e, to keep
iteration fast. It could therefore only enumerate stale copy pins from UNIT failures, so five e2e
siblings stayed invisible until the full run — three in `compile.e2e.test.ts` pinning `Source:` and
two pinning `Local source not found:`. A predictable cost of that trade, recorded so the next
programme can price it.

Verified: unit 139 files / 6368 passed / 0 failed; e2e 203 files / 703 passed / 0 failed; `tsc` ×3,
`eslint`, `prettier` clean. By hand: `-m, --marketplace` on init, `--source` refused with exit 2,
`Marketplace from project config`, and the `dist/` artifact carrying all four renamed strings with
all four withdrawn ones absent.

Four findings, three of them about the same thing from different angles: a vocabulary negative
defeated by its own fixture name (two instances, unit and e2e, the second predicted by the first);
the screen-sentinel pair guarded in one direction only — product-moves-alone fails in a second,
mirror-moves-alone leaves the unit suite green and e2e slow-red; and a re-pointed copy pin that kept
its withdrawn NAME, which "grep for the old value" can never find because the value is the half that
was fixed. **CLI-499** (263 internal identifiers) and **CLI-500** (241 doc files) remain open in
Track B.

## 2026-08-16 — CLI-386 retired unbuilt: it was CLI-481 wearing a second row

Dispatched as a leg-1 go-live blocker, investigated, and closed with **no code change**, because the
defect it described was fixed on 2026-08-10 by **CLI-481** (`4885e5ae`) — an ancestor of HEAD.
`archive.md` already recorded that landing and named the spec. One defect had carried two tracker
rows; CLI-481's was deleted per repository law when it landed, CLI-386's was not, and the orphan was
later promoted into the roadmap as a blocker for the editor's catalog work.

The row's own evidence had gone stale in a way that reads as current: it cited "an `it.fails` spec
pins it", and `4885e5ae` had converted that spec to a plain `it` six days earlier.

**Proved rather than assumed.** A green test proves nothing by itself, so the emission was mutated
(the `category` spread neutralised in `marketplace-generator.ts`), rebuilt and re-run: exactly one
spec failed — `carries a category on every plugin entry` — and the mutation was reverted
byte-identically. Then by hand over the real skills source: `build plugins` → `build marketplace`
emitted **238 plugins, 0 without a category, 102 distinct categories**, against a row predicting
`uncategorized: <all>`. `marketplace.schema.json` already declared `category`, so no regen was owed.

Leg 1 loses a blocker it never had. Filed as
`.ai-docs/agent-findings/2026-08-16-a-landed-defect-kept-a-second-tracker-row-and-was-redispatched-as-a-go-live-blocker.md`,
whose proposed standard is the cheap half: a row citing a test as its evidence must NAME the file and
the marker, so a one-line grep at promotion time catches a row whose proof has already gone green.

## 2026-08-16 — CLI-475: one broken skill no longer blinds `doctor`

Tests first and watched RED (9 specs), then the fix, then the expressive-typescript pass, then the
real binary against the owner's own machine — which is where the row came from and where it paid off.

`doctor` skipped its ENTIRE operational block whenever any content error existed. The enumeration
that drove the fix found only TWO of seven rows genuinely cascade: `Skills Resolved`, because
`extractLocalSkill` DROPS a skill whose metadata is unusable so "not found" would be the content
finding re-worded, and `Plugins Installed`, because `resolvePluginInstallPaths` swallows an
unparseable registry and returns `[]`. Nothing depends on the AGENTS content pass at all — one row
asks whether a file exists, the other reads only its name, and neither opens it. **`Config` is the
one finding that cascades into all seven**, so the blanket banner was right there and only there;
that case is now a green control spec.

Modelled as DATA on the content check that produces the finding — `GatedContentCheck` gained a
`blocks` list — rather than conditionals at the rows, so adding a row or a cascade is a one-line
edit. The blanket constant was renamed `SKIP_AFTER_CONFIG_ERROR` (string unchanged, it is pinned)
because its old name asserted the rule that was just removed.

**What it exposed the moment it ran.** Before: `Skipped — fix the content errors above first`,
`Summary: 4 passed, 0 warnings, 1 error`. After, on the same machine, with the same single unrelated
error (`context7-mcp` missing its `metadata.yaml`): `Summary: 8 passed, 2 warnings, 1 error`, and two
real defects that had been suppressed — **`web-framework-react` is declared ejected in the global
config with no directory on disk**, and **three compiled agents are missing** (`api-reviewer`,
`cli-reviewer`, `web-reviewer`). The orphan/installed rows existed to report exactly that and could
not, for as long as any unrelated content error stood.

Verified: unit 140 files / 6394 passed / 0 failed; `tsc` ×3, `eslint` clean; `doctor-content` e2e 5
passed. The tester's finding stays `partial` — the code half landed, but its two proposed assertion
rules are still not written into `standards/e2e/assertions.md`.

## 2026-08-16 — CLI-354: the CLI can mint ids, and we learned what the wire cannot carry

Tests first and watched RED, then the implementation, then the expressive-typescript pass, then the
real binary by hand against a loopback stub. `agents-inc share` maps an installed `ProjectConfig` to
a `SeedPayload` and POSTs it, so ids are no longer web-only. `configToSeedPayload` is written as the
inverse of the existing `seed-to-wizard` decoder rather than a second shape, and a round-trip spec
pins that: a config mapped out and read back produces the same install.

**The module-absence red was not accepted as proof.** After green, the implementation was mutated
twice — `effort` dropped from the agent mapping, `isNameableOrigin` neutered — and both mutations
turned specs red before being restored. A "cannot find module" failure only proves a file is missing.

**The real deliverable is the list of what the v3 wire cannot express**, because it decides leg 3:

- **Which marketplace a plugin skill came from.** `SkillConfig.origin` holds a marketplace NAME;
  `seedSkillSchema.install` holds only `"plugin" | "eject"`. A payload from a private-marketplace
  config would install the DEFAULT marketplace's skill of the same id — different content, same name.
  Refused loudly rather than shared wrong.
- **`model: "inherit"`.** `MODEL_NAMES` has it, `seedModelSchema` does not — and `seed-contract.md`
  is WRONG about why: it claims absence "already means keep the metadata default", but `resolveAgents`
  is `agentConfig?.model ?? definition.model`, so absence keeps the sub-agent's OWN metadata model
  while `"inherit"` overrides it down to the parent. They differ for every sub-agent whose
  `metadata.yaml` names a model.
- **Locally-authored skills — the gap with no refusal available.** They carry `origin: "eject"`
  exactly like an ejected catalogue skill, so `share` cannot tell them apart from `ProjectConfig`
  alone; it would need the loaded matrix, which would make a pure config→wire mapping
  network-dependent. This is CLI-462's "local skills inline" requirement verbatim, and **it is why
  leg 3 needs v4.**

Deliberate drops, argued rather than silent: tombstones (presence is selection, and `--from` is
greenfield), stack rows naming things the config does not install (`compile` already drops them),
project identity and layout (a payload is a selection, not a project), `projects[]` (absolute machine
paths must never travel), `selectedDomains` (the decoder re-derives it) and `stackId` (a config records
a stack's expansion, never its id).

Scope ruling, which the row did not carry: `share` reads the project's own config or the global one it
inherits and shares BOTH scopes, each entry keeping its `scope` — the exact mirror of what `init --from`
writes back. Nothing installed refuses with exit 1 and no POST, diverging from `update`'s successful
no-op deliberately: `share`'s only product is an id, and the store's free tier is 1k writes/day against
100k reads, so a write spent on a dead link is the expensive mistake. The refusal set reuses
`isScopePairCompatible`, so `share` can never mint an id `init --from` would refuse.

Verified: unit 143 files / 6473 passed / 0 failed; `tsc` ×3, `eslint`, `prettier` clean; 33 e2e across
`share` and all six `init --from` specs. Filed
`.ai-docs/agent-findings/2026-08-16-the-seed-contract-cannot-carry-half-of-what-a-config-holds.md`.

## 2026-08-16 — CLI-470 legs 2 and 3: a compiled agent says who compiled it

Owner released the hold; tests first and watched RED in three passes, then the implementation, then
the expressive-typescript pass, then the real binary twice. Leg 1 (the honest configless message)
landed 2026-08-10 and is superseded by this.

**Leg 2 — the marker.** Every compiled agent now carries
`<!-- Generated by agents-inc v0.154.0 — do not edit; compile rewrites this file -->` on the line
after the frontmatter. Deliberately a body comment and not a frontmatter field, per the 2026-08-09
design: Claude Code's tolerance of unknown frontmatter keys is UNDOCUMENTED, so a stricter release
would break every install, while the body is free-form by contract.

**Version source and match strategy, both chosen against alternatives.** The version is read from
this package's own `package.json` via `PROJECT_ROOT` — the anchor the bundled agent partials already
resolve from — rather than threading oclif's `this.config.version` through four signatures for a
comment line. Recognition matches on SHAPE, not exact text: prefix + version + close. So an agent
compiled by ANY release is recognised by any other, and the wording can change without stranding
files. What is not loose is POSITION — only the line after the frontmatter counts, so an agent whose
body quotes the marker is never swept, and there is a test for exactly that.

**Idempotence proven three ways**, per CLI-478's fixed-point rule: `stamp(stamp(x, v), v)` is
`stamp(x, v)` and a version bump MOVES the line rather than stacking one; a render already carrying a
marker comes back with exactly one; and a second real `compile` reports `0 rewritten, 1 unchanged`
with a byte-identical file and exactly one marker occurrence.

**Leg 3 — the sweep.** With the config deleted, `uninstall` now removes the agents it stamped and
keeps the ones it did not, saying so in the plan AND in the summary — both read from one
`plan.kept`, with `keptStatements` subtracting the removal entry's own names so an agent can never
appear in both halves. That is CLI-494's one-plan rule, not two predicates kept in sync by a comment.
Hand-run: a hand-written `my-custom-agent.md` survives byte-identical while the compiled one goes.

No compat path for pre-marker agents was built, and none is owed: the CONFIG path still removes by
the configured roster, so an install predating the marker uninstalls cleanly; only the CONFIGLESS
path is marker-only. The one-time rewrite ripple on next compile is the accepted answer.

Also fixed, and it was the reverse of what it claimed: a comment in
`config-gate/__tests__/mutate-global.test.ts` asserted `os.homedir()` "ignores `process.env.HOME`".
It does not — Node reads `$HOME` on POSIX, proven by running it, and the repo's own
2026-08-06 finding depends on that being true, since its fix is `vi.stubEnv("HOME", …)`.

Verified: unit 144 files / 6496 passed / 0 failed; e2e 206 passed / 1 skipped / 723 passed / 0 failed;
`tsc` ×3, `eslint`, `prettier` clean.

## 2026-08-17 — CLI-498: two marketplaces can no longer name one skill

Six steps, each tests-first and watched RED, each through the expressive-typescript pass and a
hand-run of the real binary. Journey 26 is closed BY CONSTRUCTION rather than by a guard: a skill id
carries its marketplace's name as an author-time prefix, so a cross-marketplace `[P][G]` pair is
unrepresentable, and dual scope, tombstones, propagation and the scope toggles needed no changes at
all.

**Step 1 — the factory taxonomy fix — mattered beyond this row.** `createTestSkill`,
`createMockSkill` and `createMockExtractedSkill` derived domain, category and slug by splitting an id
on `-`, behind `as` casts that made every wrong answer silent. It was ALREADY WRONG on unprefixed
ids: 55 of 74 derived a slug outside the generated union, and SIX ids that are real catalogue skills
derived a value the catalogue contradicts — five of which already carried a per-call-site override.
The workaround was in the tree; the cause was not. `createMockExtractedSkill` also fabricated a
`directoryPath` for every id, in a shape no product path returns, while `createMockSkill` ten lines
above wrote a different path for the same skill. Sharpest of all: a caller stating domain, category
AND slug explicitly still got a derived `directoryPath` and `displayName`, because both were computed
before the `...overrides` spread.

**Steps 2-4** gave the fixture marketplace a stable identity (`e2e-test-fixture`, chosen by
experiment — `claude plugin marketplace add` under a taken name REPLACES rather than collides),
built the constants seam with zero ids moved, then prefixed the ids: 42 sites, not the 34 a grep
found, because eight reach the id through a local alias.

**Step 5 — `build marketplace` refuses** an id lacking its marketplace's prefix, and refuses the
reserved names `agents-inc`, `external` and `local`. **The build-side exemption is an ORDERED PAIR,
not a single check** — `validateSkillIdNamespace` exempts on a plain
`marketplace.name === DEFAULT_PUBLIC_SOURCE_NAME`, and that is sound only because
`validateMarketplaceName` runs FIRST and gates that name on `PUBLIC_CATALOGUE_PACKAGE`. Reorder or
split them and the prefix rule opens to anyone who types the catalogue's name into
`marketplace.json`. The LOAD side reads package identity directly. Verified against the real thing:
238 unprefixed plugins build exit 0; the same directories with `package.json` renamed to
`@evilcorp/skills` are refused and write no file.

**Step 6 — the load side refuses** a custom marketplace whose ids the catalogue already owns, a set
intersection with no transform, placed in `loadAndMergeFromBasePath` rather than beside the
merge — because `mergeMatrixWithSkills` is also what BUILDS `BUILT_IN_MATRIX`, so a
catalogue-comparison inside it would refuse the generator that produces the thing it compares
against. The exemption reads one promoted constant with step 5, since two definitions of "who the
catalogue is" would let a source be the catalogue to one guard and not the other. The division is
stated in the code: **build-time catches honest mistakes, load-time catches the rest** — and the
bypass is documented rather than denied, because taking it means renaming your package to the
catalogue's npm-scoped name, which is impersonation and not drift.

**Two things the row's own audit missed**, both found by the work rather than the plan: the audit
scoped E2E fixtures only, so the guard's first run turned **52 unit tests red** — the unit fixture
layer writes custom marketplaces through the same product path and was never counted. And a fixture
namespace must not spell the product's vocabulary: `test-marketplace` put "marketplace" into every
id, so `search`'s vocabulary negatives began failing on the fixture rather than the CLI's prose.
That is the third instance of a defect class this session filed twice already.

Also ruled and recorded so they are not re-litigated: agent ids are OUT of scope (marketplaces do not
ship sub-agents); marketplace-less skills take the `external-` namespace; eagerness stays LAZY BY
RULE for a skill the catalogue's tables do not carry, because reach is derivable from taxonomy and
eagerness is authored per id.

Verified: unit 144 files / 6501 passed / 0 failed; e2e 207 files / 726 passed / 0 failed; `tsc` ×3,
`eslint`, `prettier`, `generate:matrix:check` all clean. Both hand-runs pasted in the step reports —
a colliding marketplace refused with its ids named and the project directory untouched, a namespaced
one loading into the wizard.

## 2026-08-17 — CLI-454: `new marketplace` returns, and a scaffolded marketplace works end to end

A from-scratch re-add, not a flag flip — the command, its 14 e2e specs, its 401-line unit spec and
`feature-flags.ts` were deleted outright in `95738763`. The deleted specs were mined as a
REQUIREMENTS list via `git show` and deliberately not restored: they are written against the
pre-namespace id shape and the pre-rename vocabulary.

`agents-inc new marketplace <name>` writes `package.json`, the three `config/` files and one skill
under `src/skills/`, with the name as a required positional — the rule the surviving commands
follow is that the SUBJECT of a command is an arg and a modifier is a flag, and here the name is the
subject: it becomes the directory, the package name and the prefix on every id. Zero flags.

**The scaffold honours the guards A1 landed**, which is what the round-trip test proves: ids are
namespaced from birth (`acme-example-skill`), `config/skill-rules.ts` is `{ version: "1.0.0" }` and
nothing more per CLI-502, and reserved names are refused at scaffold time through the SAME
`validateMarketplaceName` the build calls rather than a second copy of the list. Hand-run end to end:
scaffold → `doctor` 5/0/0 → `build plugins` → `build marketplace` → `init --marketplace` through a
real pseudo-terminal in PLUGIN mode → skill installed and referenced by a compiled agent →
`doctor` 12/0/0.

**Deliberately not restored, each for a reason:** a `.claude-src/config.ts` (it made the marketplace
look like an installation, so `doctor` would run seven operational rows against an install that does
not exist); `--force` (an overwrite flag on a scaffolder is the destructive half of a silent
fallback); running the builds inside the scaffold (their artifacts are stale the moment a second
skill is written); a README; `.` for the current directory; and `LOCAL_DEFAULTS`' `dummy-category`
placeholder, which is CLI-411's open defect.

**Found by hand-running, and it is a live product defect the scaffold merely dodges:** omitting
`author` from `package.json` is not the neutral choice. `build marketplace` turns an absent author
into `owner: { name: "" }` and exits 0, but `marketplaceOwnerSchema` requires `name.min(1)`, so
`fetchMarketplace` throws on that same file and `resolveMarketplaceLabels` SWALLOWS the throw — the
built marketplace then loads as no marketplace, and a plugin install dies with "marketplace could not
be resolved", naming neither the file nor the field. The scaffold writes an author derived from the
name the author typed; the gap itself is filed.

**`catalog.json` is ruled onto `build marketplace`, not the scaffold**, and is blocked: a catalog
emitted at scaffold time is stale the moment a second skill is written, `build marketplace` already
walks the same data at the right moment, and the owner's own EDITOR-30 wording says "emitted by
`build marketplace`". The emission needs `matrixSchema` in `packages/matrix`, which is EDITOR-30's
piece (1) and does not exist — writing an emitter against it would be building the editor's fetch
side blind.

Verified: unit 146 files / 6527 passed / 0 failed; e2e 208 files / 749 passed / 0 failed; `tsc` ×3,
`eslint`, `prettier`, `generate:matrix:check` clean. A mutation check proved the namespace assertion
bites: dropping the prefix from the scaffold turned the spec red AND made `build marketplace` refuse
the scaffolded marketplace by hand.

## 2026-08-17 — CLI-407, CLI-408, CLI-409 and D-212's install half: a custom skill installs

Dispatched as one row because it was one defect with three faces, and the chain resolved in order.

**CLI-407 was two sites, not the one the investigation named.** `tagPrimarySourceSkills` marking the
marketplace primary on skills it does not carry is the root — but fixing it alone changes nothing,
because `createDefaultSkillConfig` reads `primarySourceName(skill) ?? DEFAULT_PUBLIC_SOURCE_NAME` and
the fallback puts the marketplace straight back. And the LIVE add path is not that function at all:
it is `buildSkillConfigForId`, whose JSDoc claimed it "degrades to exactly `createDefaultSkillConfig`'s
output" while holding its own independent copy of the fallback. **The comment was the only thing
keeping the two in agreement, and it was wrong.** Both now route through one `defaultOriginFor()`.

**That alone closed D-212.** With the custom skill defaulting to eject, `applyPluginChanges` computes
an empty added-plugin set and returns before `requireMarketplaceOrExit`, so the marketplace is never
asked about a skill it never had. The journey went from a 68-second hang-and-abort to 3.6 seconds
green.

**CLI-408 is two layers over ONE exported predicate.** The grid cannot render the impossible cell and
the pipeline refuses a caller that reaches past the grid, both reading `isLocalOnlySkill` — because a
surface that offers a choice and a surface that refuses it must never drift apart. The refusal is
keyed on TAGGED SOURCES, never on `custom`: a skill the tagging pass never reached carries no sources
and answers false, so absence of an answer is not treated as an answer.

**CLI-409's positive half already worked, and that was reported rather than hidden.** A custom skill
carrying a real domain and category already reaches its sub-agents — `taxonomyOrIdOf` builds a
`SkillTaxonomy` and `resolveAssignment` targets on domain. A test for the custom-skill case passed on
first run, RED-FREE. So all that remained was the `local` trapdoor, and CLI-412's own words for the
fix ("makes the scaffold/import flows incapable of producing a `local`-categorized skill") name flows
that no longer exist — `new skill` and `import skill` were both deleted in `95738763`. The only
surviving producer is a hand-written `metadata.yaml`, so `extractLocalSkill` now refuses one, naming
the file and the field. `LOCAL_PSEUDO_CATEGORY` was not otherwise touched and `local` was not made to
work; CLI-412's dropdown is unforeclosed.

Hand-run against the real public marketplace confirms the whole ruling stack in one artefact: the
custom skill sits beside the catalogue's own in a real category, its Sources row offers ONE cell, it
installs with no marketplace call, and it lands in the compiled agent's activation protocol — LAZY —
while React is eager in the frontmatter. That is CLI-498's "reach by taxonomy, arrive lazy" visible in
the product.

Verified: unit 147 files / 6542 passed / 0 failed; e2e 209 files / 750 passed / 0 failed; `tsc` ×3,
`eslint`, `prettier`, `generate:matrix:check` clean.

One ordering compromise, stated rather than hidden: CLI-408's refusal lives in the single seam both
commands share, which runs after `requireMarketplaceOrExit` — so when the marketplace ALSO fails to
resolve, the user meets the marketplace error first. Both are true and both are loud; the alternative
was duplicating the guard at two call sites.

## 2026-08-17 — CLI-411, CLI-413 and CLI-412's CLI half; `catalog.json` becomes deterministic

**CLI-413 retired without being built, on evidence.** `custom: true` never reaching `config.ts` is not
a defect: `origin` already carries provenance, every production reader of a skill's custom flag reads
it off the MATRIX and each one already holds a matrix, `getCustomSkillIds()` has zero callers
repo-wide, and under CLI-498 an `external-` prefix cannot occur in the catalogue so a config-only
consumer already has its tell. Adding the field would create a second hand-maintained copy of a fact
the matrix derives — one that can disagree, since nothing rewrites entries it is not touching. A pin
was written rather than a fix, and it passed RED-FREE; that was reported as evidence, not counted as
work.

**CLI-411 deleted rather than re-valued.** `LOCAL_DEFAULTS.CATEGORY` and `.DOMAIN` — the
`dummy-category` / `dummy` placeholders — have ZERO readers anywhere in `packages/**` or `apps/**`.
They were scaffold defaults for the two commands deleted in `95738763`; `AUTHOR` keeps its three real
readers. No red test was claimed: deleting an unread constant has no observable behaviour to fail on,
and the behaviour the row actually worried about is now pinned by CLI-412's refusal tests.

**CLI-412's CLI half landed, and the ruling is that the CLI needs no dropdown.** Nothing on the CLI
side creates a custom skill any more — a hand-written `metadata.yaml` is the only producer left, and
it has no prompt to hang a control on. So the CLI's job is accept-and-refuse: a `custom: true` skill
whose category no definition declares is refused at `mergeLocalSkillsIntoMatrix`, naming the skill,
the category and the file, and the auto-synthesis that used to invent a category is gone.
`validateCategoryField` is deleted outright, so `custom: true` no longer changes validation anywhere.

**The check deliberately does NOT live in a schema.** `categoryPathSchema` accepts any kebab-case
string on purpose, because a custom marketplace's categories are its own — tightening it to the
generated union would refuse every marketplace-declared category. Only the place that assembles the
declarations knows the real answer, and that is exactly where the synthesis being removed used to
live.

**`catalog.json` is now byte-stable across builds.** Exactly one field moved between two builds of an
unchanged marketplace — `generatedAt` — so the fix was a one-field pin rather than an ordering hunt.
It follows the vendored matrix's existing `"build"` sentinel, now named once as `GENERATED_AT_BUILD`
and shared by both emitters. Proven by sha256 over two consecutive real builds: identical, zero
differing bytes. This matters more for the catalog than for the vendored matrix, because EDITOR-30
fetches it browser-direct, so a byte that moves every build defeats its cache and writes a diff into
the marketplace's history.

**The last fabricated taxonomy in the tree went with it.** `project-builder.ts`'s `withCustomSkill`
wrote `domain: custom-e2e` / `category: web-custom-e2e` and a hand-written `config-types.ts`
declaring both — CLI-411's own defect living in an e2e fixture. Now `web` / `web-tooling`, with the
skill ID left outside the union, which was the fixture's actual stated purpose.

Verified: unit 148 files / 6563 passed / 0 failed; e2e 209 files / 751 passed / 0 failed; `tsc` ×3,
`eslint`, `prettier`, `generate:matrix:check` clean. Hand-runs captured both halves — two builds with
identical sha256, and `compile` refusing an invented category by name then accepting a real one
silently.

## 2026-08-17 — CLI-504: `build marketplace` emits the catalog the editor fetches

`matrixSchema` landed first and gates the vendored artefact on BOTH the check and write branches —
proven by corrupting one skill's `category` in the generated matrix and restoring it byte-identically.
Then the emission: `.claude-plugin/catalog.json` beside `marketplace.json`, the Matrix shape by
construction, so the editor maintains no transform.

**The orchestration was the whole engineering problem, and a previous pass refused all three
available routes** rather than ship one. The private `loadAndMergeFromBasePath` is the only correct
one; rebuilding it means duplicating the slug narrowing (measured: 176 unresolvedSlugs and 250
warnings where the correct route emits 0); and the public `loadSkillsMatrixFromSource` runs
`mergeDiscoveredLocalSkills(matrix, homeDir, "global")`, which would **bake the author's
`~/.claude/skills` into a published catalogue**. The fix is a one-line exported seam,
`loadMarketplaceMatrix`, so the local merge lives one layer up and a publisher cannot reach it — safe
by construction rather than by an option an author can omit. Pinned by a test that writes a skill into
a fake `$HOME` and asserts it is absent, red under mutation.

**Stacks, ruled by the owner: the built-ins stay in the CLI; a custom marketplace's stacks live in
its own `config/stacks.ts`.** The rule the product now follows is that the stack step appears iff
stacks exist for that marketplace — a custom marketplace offers its own or none, and only the public
catalogue gets the built-in stand-in. That is decided by one exported `offersBuiltInStacks`
(`isDefaultSource(source) || isPublicCatalogue(basePath)`), reading the same `PUBLIC_CATALOGUE_PACKAGE`
identity the two namespace guards use, so there is one definition of who the catalogue is rather than
a third.

**What nearly shipped broken:** `loadStackById` gated on `isDefaultSource` too, so fixing only
`resolveOfferedStacks` would have OFFERED the 17 stacks from a catalogue checkout and then thrown
`stackNotOfferedMessage` when the user picked one. Both callers now read the single predicate, pinned
as a pair.

The visible consequence, confirmed by the owner: `init --marketplace <catalogue-checkout>` now opens
on the stack step instead of skipping to Domains, and an e2e assertion pinning the old behaviour was
INVERTED rather than deleted. Stackless custom sources are unaffected and still launch onto Domains.

Real sizes, measured: full public catalogue 412.9 KB raw / **43.0 KB gzipped**; a one-skill
marketplace 27.8 KB. An earlier 279.4 KB figure was taken WITH the stacks bug — that catalog was
missing all 17. The stacks cost ~142 KB raw but only ~4 KB gzipped.

Verified: unit 148 files / 6554 passed / 0 failed; e2e 209 files / 751 passed / 0 failed; `tsc` ×3,
`eslint`, `prettier`, `generate:matrix:check` clean.

## 2026-08-17 — D-310: a global install refuses project-scoped content at the boundary

**The defect reproduced, and CLI-401 did not cover it.** Established before any enforcement was
written, by hand-running the built binary: `init --from <id>` at a clean `$HOME` with a
project-scoped payload exited **0** and wrote the _global_ config — `~/.claude-src/config.ts` — as
`{"id":"…-web-framework-react","scope":"project"}` plus `{"name":"web-developer","scope":"project"}`,
copying the skill into `~/.claude/skills/` and compiling the agent into `~/.claude/agents/`. A global
installation holding project-scoped content, in a file whose own location contradicts the label.

CLI-401 protects a bad state that already exists — the same payload into an _already-installed_
`$HOME` is refused, because `detectProjectInstallation($HOME)` reads what is in fact the global
config. It does not stop one being minted. The 2026-08-01 incident is closed only if that machine
already had a global install, which the plan itself said was unresolvable from surviving evidence.

**Why `--from` was the only unguarded route.** Both wizard producers already answer this —
`init.tsx` computes `isGlobalRoot = isHomeDirectory(projectDir)`, `createDefaultSkillConfig` mints
`scope: "global"`, and `toggleSkillScope`/`toggleAgentScope` short-circuit under that flag;
`edit.tsx` does the same from `cwd`. `selectionFromSharedConfig` computed nothing of the sort. The
fix is a third refusal there, after the decode, classifying through the codebase's own
`isActiveAt(entry, "project")` rather than a re-derived comparison.

**Ruled: the guard covers sub-agents as well as skills**, one step past the row's wording. Because
`isScopePairCompatible` forbids project-skill → global-agent, a skills-only guard is bypassed
outright by a payload whose only project-scoped entry is a bare sub-agent — pinned by a spec that
does exactly that. The written global config records the identical contradiction for agents, and
the sibling refusal `writesGlobalContent` already asks both questions.

**Ruled: the plan's second enforcement point is dead as written and subsumed by the first.** Its own
text forbids its only proposed implementation — a global install run from `$HOME` is the normal flow
and must keep working. Every layer it listed as unguarded already asks `isHomeDirectory`, as do
`reportSkillsCopied`, `reportAgentsCompiled` and `splitAgentScopes`. There was one consumer that
accepted the home directory as a project without asking, and it is now fixed. The machine cleanup
the plan also carried is moot: the stale `enabledPlugins` record is already gone.

The message names the location, not the payload, and deliberately does not mention `uninstall` —
unlike CLI-401's refusals, nothing here is wrong with the configuration being installed.

Verified: unit 148 files / 6564 passed / 0 failed; e2e 210 files / 756 passed / 0 failed;
`tsc` ×3, `eslint`, `prettier`, `generate:matrix:check` clean. Hand-run three ways — refused at the
home root, installs at `scope: "project"` inside a project, installs at `scope: "global"` from an
all-global payload at home.

## 2026-08-17 — EDITOR-30: the editor loads a marketplace in the browser (leg 1 complete)

A floating button opens a dialog taking a marketplace name and an optional token, both saved to
`localStorage`, and the marketplace's pre-generated `catalog.json` — the artefact CLI-504 taught
`build marketplace` to emit — is fetched **browser-direct**, `safeParse`d against `matrixSchema`, and
seated. No worker proxy, no `VITE_` token, no server-side credential: the token is relayed per
request and the dialog says so on screen.

**The provider-seat audit is the row's real finding: there were zero consumers behind a provider.**
15 production modules imported the vendored matrix directly, plus 7 test files. There was no seat to
swap — it had to be built, and that was the whole job while the dialog was the easy half.

The audit also **shrank** the work twice, and both shrinkages follow from rulings already made.
`SUB_AGENT_GROUPS` / `SUB_AGENTS_BY_ID` / `subAgentById` derive from `AGENT_DEFINITIONS` rather than
the matrix, so under the ruling that marketplaces ship no sub-agents the roster stays vendored;
`DOMAIN_LABELS` / `DOMAINS` / `compareDomains` are the **UI's** vocabulary, not a catalogue's. And
`createAssignmentResolver` needed no change at all — it was built for exactly this, and only
`default-assignments.ts` had to stop passing a bare id and start passing the taxonomy.

**Two module-scope bindings would have silently defeated the seat** — `catalogueCells` in
`stack-grid.tsx` and `CATALOG_POSITION` in `derive.ts`, each computed at _import_, which is the
vendored catalogue forever. A seat that is correct everywhere except at import time is not a seat.

**The seed payload already carried the field.** v4's optional top-level `marketplace` was used as-is;
no second field was added.

`Catalog`/`Stack` id types widen from the vendored unions to `string`, but **`Domain` deliberately
stays closed**: a marketplace may invent a category id and may not invent a domain, so a category
naming an unknown domain is dropped exactly as one naming no domain already was. Blast radius is
editor-only — the CLI imports none of these read models.

**The hand-run found a defect the tests had not:** one dialog submit cost two 400 KB fetches, because
storing the name moved the restore hook's dependency and it re-fetched to arrive where it already
was. Now 0 / 1 / 1, pinned by a new e2e test. The failure path was verified genuinely unstubbed —
`agents-inc/skills` really 404s on `catalog.json` today, and the token field appears only after that
failure.

Verified: editor unit 12 files / 251 passed; playwright **209 passed** (was 193, +16, zero
regressions); `packages/matrix` 278 passed; tsc, eslint, prettier clean across editor, matrix and
api-mocks; `packages/cli` unit 6564 passed / 0 failed and tsc exit 0, confirming the widened exports
reach nothing in the CLI.

**One gap left standing on purpose, and it is EDITOR-31's by name:** `config-store`'s persist
hydration runs at module import, before the marketplace fetch resolves, so on reload a selection made
against a marketplace prunes as unknown before its catalogue arrives. Not shimmed, and not silent —
`config-store`'s `merge` already reports the pruning through `reportIssue`. That is precisely the
catalog-first ordering EDITOR-31 owns.

## 2026-08-17 — EDITOR-03 + CLI-412 + EDITOR-15/16/17/18/19/20: added skills become real catalogue entries

**One change closed seven rows, and the mechanism is a deletion.** `catalog-store.ts` now keeps the
source `Matrix` rather than only the built `Catalog`, and an added skill is merged into it before
`buildCatalog` runs — so there is one derivation and one placement path. `added-skills-store.ts` is
gone, and with it `addedToGridSkill`, `groupAddedByCategory`, `toAddedSection`, `UNCATEGORIZED_ID`
and the `added` parameter on all four selectors. **The six defect rows are closed because there is no
second code path left to go wrong**, not because six fixes were applied.

| Row       | Verdict                              | Why                                                                                                                                                          |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EDITOR-15 | closed by construction, editor side  | `toSeedPayload` emits `external[id]` with the directory for every selected external skill                                                                    |
| EDITOR-16 | closed by construction               | `adoptSeedPayload` seats the payload's `external` map **before** `pruneUnknownIds` runs — the ordering is the whole reason it exists as a named orchestrator |
| EDITOR-17 | first clause done, second superseded | `categoriseRepo` deleted with its store; "the Added section becomes unconditional" is moot because there is no Added section                                 |
| EDITOR-18 | closed by construction               | `clearExclusiveSiblings` reads the skill's real `categoryId` and that category's `exclusive` flag — both now answer                                          |
| EDITOR-19 | closed by construction               | a real category under a real domain, so `isVisibleDomain` treats it identically                                                                              |
| EDITOR-20 | closed, and **strengthened**         | see below                                                                                                                                                    |

**EDITOR-20's ruling did not need the rethink it looked like it needed.** The 2026-08-09 reason for
eject-only was "we cannot write our metadata into their plugin". With content inline there is no
marketplace behind the skill at all — the payload **is** the source — so `plugin` has nothing to
install _from_. The rule gained a second and more basic reason rather than losing its first.

**Sizes, measured from real repositories rather than estimated.** A payload with one external skill
is 81.5 KB raw / 26.9 KB gzipped, against 1.9 KB / 209 B with none; all three test skills together
161.1 KB / 48.5 KB. `MAX_EXTERNAL_SKILL_BYTES` is 256 KiB per skill — 3× the largest real
documentation skill — and lives **in the shared schema**, so the editor, the worker and `--from` all
apply one limit. The server's `MAX_BODY_BYTES` went 32 KiB → 1 MiB, because the old cap refused a
single external skill; 1 MiB is 4% of KV's value limit and holds ~6 skills at the per-skill cap.

The cap is answered from the git tree's own sizes: refusing `anthropics/skills/skills/docx` (**1.1 MB
across 61 files**, almost all XML schemas) costs **one** request, not 61.

Also landed here: **CLI-412's editor half** — the category dropdown, with confirm disabled until every
staged skill has one — and **Journey 26's duplicate-id intake refusal**. CLI-412's CLI half was
already ruled unnecessary: nothing on the CLI side creates a custom skill.

**A confirmed category grants sub-agent reach.** Verified directly — an external skill filed under
`web-framework` reaches `web-developer`, `web-researcher`, `web-tester`, `pm` and `reviewer`, all
lazy. Reach follows the category through the taxonomy-aware `resolveAssignment`; eagerness is lazy by
rule. So choosing a category is a heavier decision than a placement — it decides which agents carry
the skill.

Verified: editor unit 12 files / 277 passed (was 251); playwright **221 passed** (was 209);
`packages/matrix` 292 passed; server 41 passed; tsc, eslint, prettier clean across editor, matrix,
server and api-mocks; `packages/cli` tsc clean and unit 6582 passed, confirming the `packages/matrix`
edits reach nothing in the CLI. Drive was against live `api.github.com` and `raw.githubusercontent.com`
with only our own worker stubbed — 10 real GitHub requests, one script bug found, zero product bugs.

**The EDITOR-32 seam is `activeExternalSkill(skillId)`** in `catalog-store.ts`, returning `files` as
`Record<relativePath, text>` beside `repo` and `path`. It answers for skills added this session _and_
for skills that arrived in a payload, because `adoptSeedPayload` seats the external map before
anything renders — one reader, both provenances. The preview is therefore pure rendering: no fetch,
no new store, no schema change.

## 2026-08-17 — EDITOR-32: the added-skill contents preview

A dialog showing what an external skill actually contains — the SKILL.md body left, the file tree
right — reachable from the grid cell's `added` badge and from the install dialog. **No fetch, no new
store, no schema change**: `activeExternalSkill(skillId)` was left as a seam by EDITOR-03 and it
answered as promised, for skills added this session and for skills that arrived in a payload alike.

**The rendering-safety decision is plain monospace `<pre>`, React-escaped — no markdown renderer, no
sanitiser, no `dangerouslySetInnerHTML` on the path.** Two reasons, both recorded in the component.
A renderer would be a new dependency whose escaping is the only thing between a stranger's repository
and this origin. And rendering **hides** things: a rendered `[label](javascript:…)` shows its label
and not its target, and rendered frontmatter disappears into a rule. What the CLI writes to disk is
exactly what is on screen, which is the whole point of the surface.

Proven on genuine untrusted markup rather than a fixture — the drive opened a real
`<!DOCTYPE html>` file carrying a `<link rel="stylesheet" href="https://fonts.googleapis.com/…">`
and a `<style>` block: **7058 characters, 0 child elements**, no stylesheet fetched, nothing executed.
The e2e locks it with `children.length === 0` plus frontmatter `---` surviving verbatim, so any
future switch to a renderer produces child elements and fails.

**SKILL.md opening first is expressed as list order, not a second `openPath` field**, so the two
cannot disagree — `files[0]` _is_ what opens. The trigger is the existing `added` badge rather than a
new control, and it carries no `incompatible` guard, unlike the ••• menu: reading is not configuring.

**The hand-drive caught three defects no assertion had.** `h-[26rem]` on a flex-grown pane was dead
code — `flex-1` is `flex: 1 1 0%`, so the flex algorithm decides the main size and `height` is never
consulted; measured 696px in an element declared 416px tall, under a comment asserting the behaviour
the code did not produce. Truncated file paths collapsed two distinct real files to the same string
in a list whose only purpose is picking between them. And the body wrapped every second line at the
install dialog's width, for a surface whose content is a document.

**Ruled: the preview covers the install dialog completely when stacked.** That is what every stacked
modal does, and the three properties that matter are verified — the sheet survives underneath,
Escape closes only the topmost, focus returns to the trigger inside Install. Widening to make the
one underneath visible made it worse, and a vertical offset would show a strip of header cut
mid-text.

Verified: editor unit 12 files / 284 passed (was 277); playwright **229 passed** (was 221); tsc,
eslint, prettier clean. Only `apps/editor` touched. Two findings filed — a `w-`/`h-` utility on a
flex-grown child is inert and invisible to tsc, ESLint, Prettier and every DOM assertion that does
not measure; and Base UI `aria-hidden`s the sheet under an open modal, so `getByRole` reports
"element(s) not found", indistinguishable from the bug the test exists to catch — an agent reading
only that error would have deleted the stacking.

## 2026-08-17 — CLI-507 + CLI-508: external skills install, and the round trip leaves what it does not own alone

**Leg 2's claim is now true: an external skill survives the trip from the editor into an install.**
Two seams in `src/cli/lib/seed/external-skills.ts`, both producers sharing them.
`registerExternalSkills` runs **before the decode** and seats each selected `external[id]` as a real
`ResolvedSkill` in the loaded matrix, from the payload's own taxonomy; `writeExternalSkills` writes
the directories afterwards, guarded by the copier's `validateSkillPath` because the keys come off the
wire. A category this catalogue does not declare is left unseated, so the id falls to the existing
skip-and-name path rather than inventing a home.

**Eject-only is a refusal, not a coercion.** Coercing would install a mode the sharer's own screen
still shows as `plugin`, and CLAUDE.md forbids silent fallbacks. It throws naming every offending id
at once, in the shape the unwritable-pair refusal already uses.

**Three things the row never mentioned, and the install does not work without any of them** — each
found by reading the loaders rather than by testing:

1. **The SKILL.md `name` is rewritten to the installed id.** Every loader derives a skill's id from
   `frontmatter.name`, and the compiled sub-agent references the _minted_ id. Left as the repository
   wrote it, `resolveSkillReference` drops the skill and the agent's frontmatter names something
   Claude Code knows by a different name. Only `name` changes; the rest of the block travels
   untouched. **Ratified** — it is a technical necessity, not a preference: the id is the key the
   whole system indexes on, and a carried skill has to answer to the id it was carried under.
2. **A `metadata.yaml` is written**, payload taxonomy over whatever the repo shipped. Without it
   every later load skips the directory and the config entry is unresolvable at the next `edit`.
3. **`forkedFrom` is stamped** through the existing single writer, with `source: github:<repo>` —
   which is what makes CLI-508's rule answerable.

**The hand-run caught a defect the tests missed.** The first pass omitted `usageGuidance`, so
`doctor` reported an error on the very `metadata.yaml` the CLI had just written — the CLI
disagreeing with itself about a file the user cannot fix, because its source is somebody else's
repository. Pinned by a spec asserting through `validateSkillMetadata`, then defaulted underneath
whatever the repository ships. `doctor` now reports 12 passed, 0 warnings, 0 errors on an install
carrying an external skill.

**CLI-508 lands in the one shared mapping**, so `share` and `edit --ui` cannot disagree about a
single project: `roundTripConfig` drops what the round trip does not own before
`configToSeedPayload` sees it. No refusal and no warning — per the ruling, a user-authored skill was
never in scope, so nothing about it is lossy.

**The asymmetry is resolved by making the external case answer the question.** An external skill has
no `forkedFrom` in the repository it came from, so the install _stamps_ one — an added skill is the
round trip's, and the install says so where that question is asked. "Absence of `forkedFrom` means
the user's own" is only true once the CLI has stamped everything it put there.

**And the exclusion fires only on positive evidence** — a directory that exists and carries no
provenance. A config entry with nothing on disk is evidence of nothing and travels as recorded.
Dropping on absence would have silently thinned `share` for anyone whose global skills sit under a
different `$HOME`.

Verified: unit 152 files / 6598 passed / 0 failed; e2e 212 files / 762 passed / 0 failed; tsc,
eslint, prettier, `generate:matrix:check` clean. `generate:schemas:check` is red from an unrelated
in-flight rename in the working tree, confirmed by `git status` predating this work.

**Left standing deliberately: an external skill in an exclusive category hard-errors at config
generation**, exactly as two catalogue skills in one exclusive category do. The editor's semantics
see the same categories, so the rule is consistent on both sides and needs no special case.

## 2026-08-17 — EDITOR-31: catalog-first ordering, and the recovery flow

**The row's bug and EDITOR-30's deliberately-unshimmed leftover were one bug through two doors.**
Reload reaches `pruneUnknownIds` through `config-store`'s persist `merge`; import reaches it through
`fromSeedPayload`. Both ask "is this id in the seated catalogue?" before the catalogue can have
arrived, because a `fetch` cannot resolve before module import, nor before an effect's first await.

So it is sequenced once, in the new `useCatalogFirst`: seat the saved catalogue → `readSavedConfig()`
→ seat the payload's catalogue → adopt. `use-saved-marketplace.ts` and `use-shared-import.ts` are
**deleted** and replaced by it. Keeping them apart would have needed a cross-hook promise gate so the
restore's rehydrate could not land after the import's `importConfig` — two orderings that must agree,
which is the shape to avoid. `adoptSeedPayload` was reused rather than replaced; it stays synchronous
and the seating went in the caller above it.

**Two mechanics turned out load-bearing.** Zustand's `hydrate()` uses the raw `set`, not the
persisting one — so a bad hydration corrupts memory _now_ and storage on the user's next click, which
delays the data loss by one interaction, long enough to look like it did not happen. And both seats
had to be made idempotent, plus `readSavedConfig` once-per-session via `persist.hasHydrated()`;
without that, navigating `/docs` → `/` re-ran the whole opening, costing a second 400 KB catalogue
fetch and dropping a selected added skill (a second hydration replaces memory with what `partialize`
deliberately never wrote).

All four recovery paths driven against a real worker with real KV and real share ids: **401/404** →
token focused, paste, recovers in two fetches; **stale token** → same route; **schema-invalid** →
the precise validation error, no token field, and `catalog fetches: 1` after 2.5s of sitting, which
is the proof there is no retry loop; **cancel** → parks visibly, and re-opening the dialog still
carries the marketplace and the error, so Load resumes the import. The 404 path was genuinely
unstubbed — no public repo publishes a `catalog.json` yet.

**The round trip closes, proven by identity rather than comparison:** after importing the acme
payload, Share re-mints the _same id it was imported from_, because the worker keys on content hash.

**Three things the drive caught that no assertion did.** A dialog opened by hand during an import
never took the recovery — empty field, no error, while the parked notice sat behind it (fixed with a
`key` on the form: React's own state reset, no effect). A pre-existing button collision, filed
separately. And deferred hydration is now visible for a marketplace user: on a 1.5 s catalogue, the
screen reads "0 sub-agents and 0 skills" for a moment before settling — strictly better than the old
behaviour of pruning permanently, but the window is now an _empty-looking_ screen rather than a wrong
one. Public-catalogue visitors are unaffected (one microtask).

Verified: editor unit 12 files / 289 passed (was 284); playwright **241 passed** (was 229, +12, zero
regressions); tsc and eslint clean. Nothing touched outside `apps/editor`.

Finding filed: a persisted store whose `merge` consults async-loaded reference data must not hydrate
at import — noting that `saved-stack-store` still carries the latent shape, dormant only because it
is applied on user action rather than at boot.

## 2026-08-17 — CLI-509 + CLI-510: carry-back closes the loop, and the stale-id refusal names the remedy

**The full loop is proven by hand, not by parts:** install from a payload → `share` → install the
minted id into a _different_ clean directory → the SKILL.md is byte-identical and the compiled agent
references it. Before this, that third step printed `Skipped 1 skill(s) this catalog does not know`
and copied nothing.

The missing half was an address. CLI-507's `metadata.yaml` recorded `source: github:<repo>` and **no
path**, so the producer could not rebuild an `external` entry from disk. `forkedFrom.path` closes it,
declared in `forkedFromSchema` **and** the read schema — the read schema strips undeclared keys, so
declaring it in one place would have made the field invisible to the very reader that needs it.

**Ratified: a recorded directory is the discriminator for "this skill's bytes are what install it".**
Not a flag bolted on to mean "external" — it is the property that _makes_ a skill external. A
marketplace resolves the ids it serves; a carried skill has no other address. Half an address is
refused: a directory recorded with no repository produces a named line in `unshareableConfigError`,
so no payload claims content it could not read.

`configToSeedPayload`'s second parameter is **required rather than defaulted**, because a default
would let the next producer silently forget the content — which is precisely this defect. And
`readCarriedSkills` validates through `seedExternalSkillSchema` itself, so `MAX_EXTERNAL_SKILL_BYTES`
and the SKILL.md requirement are inherited rather than restated.

Two smaller corrections fell out: `injectForkedFromMetadata`'s fourth argument became a bag rather
than a fifth positional string (two adjacent optional strings can be swapped silently), and `glob`
gained `{ dot }` — the old default was right for every existing caller, which all scan _for_
something, and wrong for the first that must reproduce a directory faithfully.

**A skill installed by a build between CLI-507 and this one travels as a bare id and is reported by
the receiver** — no shim, no migration. Such an install recorded a repository and no directory, which
is byte-for-byte what an ordinary ejected catalogue skill records, so nothing on disk separates them.
Re-adding the skill is the whole remedy. Loud today — **but it stops being loud when `edit --from`
lands**, because that path applies destructively and would delete a skill it had warned nothing
about on the way out. Filed as a finding for exactly that reason.

**CLI-510** replaces a sentence that named the opposite cause. v5 invalidates ids that are _older_,
and the message said the configuration "may have been created by a newer version" — while naming no
remedy, when one always exists. Code, both e2e assertions and the `seed-contract.md` paragraph moved
together, since the doc described the old wording as deliberate:

> `Configuration '<id>' is not in a format this version of the CLI can install. Shared ids are never
migrated — re-share the configuration to mint a current one, or update the CLI if that id came from
a newer version.`

Sharper than the filed proposal, too: _not in a format this version can install_ rather than _does
not match the expected format_ — a payload that fails one build's schema and passes another's is not
malformed, it is not this one's.

Verified: unit 152 files / 6608 passed / 0 failed; e2e 212 files / 763 passed / 0 failed; tsc ×3,
eslint, prettier, `generate:matrix:check` clean. `doctor` reports 12 passed / 0 warnings / 0 errors
in both ends of the loop — the trap CLI-507 fell into, checked for deliberately this time, because
the new field had to validate against the schema its own header points at.

## 2026-08-17 — CLI-462 (second half): `edit --from <id>`, destructive and interactive — LEG 3 COMPLETE

**The finding is that `authoritativeScope: "owned"` protects the config row and not the disk.** It is
enforced inside `mergeConfigs`, at the writer. What actually drives `uninstallPluginSkills`,
`deleteLocalSkill` and `removeCompiledAgents` is the **removal diff**. Every prior caller reached
that writer through the wizard store, which refuses to deselect a global entry at all, so `edit`'s
`removedSkills` had never once carried one — `edit --from` is the first producer that bypasses the
store, and therefore the first for which the merger's protection was the only thing between a global
install and a deletion. Unreconciled, a project-scope apply would have deleted a globally-installed
skill's directory while the global config went on declaring it.

So the merge work was already done and the **diff** work was not. `reconcileSharedConfig` puts back
what the run may not remove **into the result**, so the diff sees it — not into the writer's options.
Two reasons kept separate because they have different remedies: inherited-global (scope) and
authored-here (ownership). Each kept entry carries its installed stack rows and its domain back with
it: `assignedStack` _replaces_ the derived stack and `selectedDomains` is what the next wizard opens
on, so an entry kept without either is loaded by no sub-agent today and deleted by the run after next.

**The ownership half reads from `skillsAuthoredHere`, built from the same `judgeSkill` the producer
uses** — one definition serving both halves of the round trip, per the owner's ruling.

**The round trip is an identity, proven by hand.** `edit --ui` over an applied project posts a payload
with the hand-authored skill absent (correct — it was never in scope), and applying that id straight
back reports `No changes made.` with the skill still on disk. Without the reconcile it would have
been deleted.

The confirm reuses `uninstall`'s renderer, extracted verbatim as `RemovalPlanConfirm` and now shared
by both. The no-terminal refusal is answered **above the fetch and the catalogue load**, on
`init --from`'s own precedent, and names both ways forward — run it from a terminal, or use
`init --from` in a clean directory, which installs without removing anything.

**Ratified, three decisions the agent flagged:**

- **The confirm fires unconditionally, including when nothing is removed.** The command is
  destructive _by kind_; the plan is what tells you whether there is anything to destroy. Gating on
  "are there removals" reopens a hole — a payload carrying updated `external` bytes over an unchanged
  roster would land files with no approval.
- **`--ui` + `--from` together is refused.** Not asked for in the row; silently picking one direction
  of a round trip is worse than a one-line refusal.
- **The SKILL.md `name` rewrite and the recorded-directory discriminator** (CLI-507/509) both hold
  under a destructive consumer.

**A prediction in an earlier finding turned out to be wrong, and only the hand-run showed it.** The
carried-content finding said a CLI-507-era skill (repo recorded, directory not) "stops being loud"
once `edit --from` exists, because a round trip drops it and the destructive apply deletes it. Tested
directly by stripping `forkedFrom.path` from a real install: **it is not dropped.** It travels as a
bare id — only its `external` entry is missing — and the receiver resolves that id, because a skill in
`.claude/skills/` is merged into the loaded matrix. The cross-machine loss that finding documents is
real and unchanged; this row does not widen it.

Verified: unit 154 files / 6631 passed / 0 failed; e2e 214 files / 772 passed / 0 failed; tsc ×3,
eslint, prettier, `generate:matrix:check` clean. Hand-run covers non-TTY refusal, both-flags refusal,
unknown id, decline (exit 4, tree snapshot identical before and after), a destructive apply
disclosing a kept global entry and preserving a hand-authored skill in one run, a payload carrying
external content (`doctor`: 3/3 skills resolved, 1/1 agents compiled), and the round-trip identity.
Two ESLint errors fixed properly rather than suppressed — `typedEntries`/`typedKeys` removes the
condition rather than justifying it.

## 2026-08-17 — EDITOR-36 + EDITOR-37: a failed restore prompts, and a shared link is an address

Both land inside `use-catalog-first.ts`, the single sequencing point EDITOR-31 built — two openings,
`openOwn` and `openShared`, behind one branch. No third ordering was added.

**EDITOR-36.** `restoreSavedCatalog` returns the refusal instead of swallowing it, and `openOwn`
parks it through the _same_ `park()` the import path already used, so the dialog is pre-filled and
shown with the token focused and 401/404 already distinguished from schema-invalid. The continuation
is `readSavedConfig()` — so **the saved picks are not read at all until the catalogue arrives**,
rather than read against the wrong one. That is strictly stronger than what EDITOR-31 guaranteed,
which relied on zustand's `hydrate()` using the raw `set`: the picks did survive, but only until the
next click.

**EDITOR-37.** `?fromId=` is no longer stripped. A shared address seats the payload's catalogue
**without storing it**, detaches the config slot, and applies. A dead id falls back to `openOwn()`,
because there is no shared state to govern.

**Two of the new tests passed while red, and that is the finding.** The reload "worked" only because
the import had already overwritten the visitor's own slot — what came back was the sharer's
configuration read out of the visitor's storage. Right answer, destroyed data.

**The three design questions, decided with reasons:**

_The URL stays when the visitor edits a shared state._ The id is a content hash and an edited state
is not that id — but the URL addresses the configuration this view was opened _from_, the way a
document URL addresses a document rather than the unsaved buffer over it. Dropping to `/` on first
change breaks the ruling's own sentence after a single click, and cannot preserve the edit without
writing to the visitor's slot. The residual surprise is removed by saying so in the notice.

_A shared state writes nothing._ The config store is **detached** — its storage swapped for a
read-only copy for as long as the shared address is open. Suppressing the write at `importConfig`
alone leaves the guarantee one click deep, since the visitor's first toggle would persist the
sharer's config plus one edit; guarding every action is a rule the next action added will break.
Taking the pen away is one statement. And the opening no longer calls `remember()`, which was
already the rule `seatPublicCatalog` stated in its own comment — an arriving link may drop what is
seated and may not drop what is stored.

_A query parameter, decided on evidence._ A `/s/$id` route was drafted and abandoned:
`packages/cli/src/cli/consts.ts` mints `${EDITOR_URL}/?fromId=${id}`, which is what `share` prints
and `edit --ui` opens, pinned by CLI tests. A route would create two shapes for one thing across two
packages and force the CLI's URL to redirect into the real one. `?fromId=` was already a different
URL from the normal editor; the erasure was the bug. The documented exception dissolves too —
`search.ts` called `fromId` "the exception to view-state-only", and under this model it describes
what you are looking at, which is that file's own rule.

**Browser back/forward was driven although nothing asked for it, and it found a defect no assertion
covered.** The `opened` ref had to be keyed on the address rather than the mount: TanStack keeps the
screen mounted across a search-only change, so clicking Configure from a shared view would have
silently done nothing and left the sharer's configuration sitting at the normal URL.

Verified: editor unit 13 files / 293 passed (was 289); playwright **255 passed** (was 241); tsc and
eslint clean. Nothing outside `apps/editor` touched. Finding filed — a persisted store has no way to
hold state that is not this browser's; it is the write-side sibling of the hydration finding, same
store, opposite end, and `skipHydration` does nothing for it.

**Left deliberately:** cancelling a failed restore and then building a new configuration overwrites
the saved picks on the first click. Detaching there too would silently stop persisting anything until
the marketplace resolved — a new surprise nobody ruled on. The ruling required that the _failure_ not
delete the picks, and it no longer does.

## 2026-08-17 — CLI-506: the `FILES` enumeration is complete, and so are five others beside it

`standards/e2e/README.md`'s `FILES` list named 10 of 12, missing `CATALOG_JSON` and `PACKAGE_JSON`.
Fixed — but the row's own framing turned out to understate it. The same shape was found **five more
times** in the same sweep: `ADDED_MARKER`/`REMOVED_MARKER` documented as the diff markers when
`UNCHANGED_MARKER` is a third; seven exports of `constants.ts` named nowhere at all under a heading
that reads as complete; and in the sibling reference doc, eight `test-utils.ts` exports absent, the
`messages.ts` builder table listing 6 of 35, and four message-object counts wrong with three
carrying wrong membership.

The enumerations now close with explicit sentinels naming what else the file exports, and the
`STEP_TEXT` partition was **proved** rather than counted — every name extracted from the grouped
table and diffed against `Object.keys(STEP_TEXT)`: 165 both ways, no duplicates, nothing missing in
either direction.

The class is filed as a finding: nothing re-derives these lists, so they drift by construction, and a
table claiming exhaustiveness while omitting entries is worse than one making no claim — a reader who
trusts it stops searching.

## 2026-08-17 — EDITOR-34: the editor spec re-derived from source

Re-derived rather than patched, structure and voice kept. Two sections added because the surfaces
they describe had no home — the two-address opening (`useCatalogFirst`, `/` versus `/?fromId=`, the
seating order, `detachSavedConfig`, the parked recovery and its five notices) and marketplaces and
external skills (the load dialog and its failure kinds, category-at-add-time, the inline directory,
the contents preview and its plain-text decision, eject-only).

**The row named six false statements. There were twenty-six**, and the ones that would have misled a
reader worst were not the six:

- **The auto-assignment relevance rule was wrong three ways.** A domain skill reaches its whole
  domain group plus **both** cross-domain role agents — the doc had `pm` as per-domain and only
  `reviewer` as cross-domain. A `shared` skill reaches every agent whose _flavor_ is not `meta`,
  which includes `pm` and `reviewer` despite their sitting in the meta group. And **an added skill
  now gets default assignments** — it has a confirmed category, therefore a real domain, therefore
  that domain's five agents, lazy. The doc said it "reaches nobody, and finds a home through the •••
  panel instead."
- **`selectReachability` in `derive.ts` is not the rule** — `selection-semantics.ts` is, shared with
  the CLI's wizard, and `derive.ts` is the view layer. The third verdict, `discouraged`, was
  undocumented, and the shipped catalogue declares zero `discourages` pairs, which one `it.fails`
  exists to guard.
- **`compatibleWith` no longer exists**, and a table argued against a field that had been deleted.
- **18 sub-agents across five groups, not 23. Picking React strands 13 skills, not 14.** The •••
  matrix draws two columns, not four, and with the current roster there are **no gap cells at all**
  — a documented behaviour the app cannot presently reach.
- **`PERSIST_VERSION` is 8, not 7**, and `AgentEntry` carries a fourth field, `scope` — a third
  cycling control on every roster row, missing from the type block and the controls table.
- **There is no Share route and no Share nav item.** The rail is Configure · Docs · Settings, and the
  roster footer has three buttons, not two.
- **The add-skill dialog no longer searches GitHub**, so "unauthenticated search is 10 req/min, hence
  the 350ms debounce" was wrong twice over: the index arrives from the worker in one response and is
  filtered in the browser, and the 350ms is an analytics settle.
- **"The package validates once at its own boundary, so the app performs no second parse"** — the app
  now `safeParse`s a fetched `catalog.json`, seed payloads in both directions, every persisted slot
  and both worker responses.
- Test counts read 94 unit and 88 E2E; they are **294 in 13 files** and **255 in 22 files**.

Cut as history per the documentation bible: a "v5 supersedes v2" blockquote, a "Removed in v5" list,
a migration narration, and a changelog cell — each stating a diff rather than a fact.

**The honest boundary is recorded rather than papered over.** The design-comparison column was
carried forward except for three claims checked directly, because the prototype is a 1015-line file
and each row is a separate excavation; the seven screenshots were not opened; two measurements that
cannot be re-run were kept as stated; and the E2E suite was listed rather than run, because running
it writes report directories into a tree another agent was editing.

## 2026-08-17 — EDITOR-35 + EDITOR-33 + EDITOR-38's sibling

**EDITOR-35, and the measurement ruled out the obvious fix.** The floating marketplace button was
`fixed bottom-5 left-5`, and `position: fixed` resolves against the viewport while the page is
`mx-auto max-w-[105.25rem]` — so past 1852px the grid centres, every column slides right, and a fixed
offset stays put. Measured: at 1600 the rail is 0–167 and the button 22–136, on the rail; at 1920 the
rail is 34–201 and the button unchanged, still on it; at 2560 the rail is 354–521 and the button sits
out in the margin, detached from the page. **No constant `left` is right at all three.** The fix asks
the grid instead of guessing — `sticky bottom-5 w-fit` inside `<main>` — and the gap to the rail is
the 66px gutter at all three widths. `w-fit` keeps the box from swallowing clicks on a strip of cells.

The assertion reads **both bounding boxes live** and asserts the button clears the rail, at the pinned
viewport and again at 2560. No coordinate appears in the test; it asserts a relationship between two
elements on screen. It is asserted against the **rail**, not the GitHub link — the rail is `h-svh` at
the page's left edge, so vertical separation is impossible by construction and the whole question is
horizontal, which makes it cover the class "a floating control was dropped on the nav rail" rather
than one link. The 2560 run is the point: it is the width a constant `left` gets wrong, so the wrong
fix cannot pass.

**EDITOR-33.** A hostile SKILL.md now rides the fixture, and the RED had to be earned rather than
observed — a missing export only proves the fixture was missing. The same bytes were put through
`innerHTML` in a live browser and the spec's three questions asked of it: bytes survive verbatim
**false**, elements built **2**, sentinel on window **true**. All three flip, so the assertions
discriminate. Against the real preview: bytes identical, **0** elements, no sentinel, no console
errors.

**EDITOR-38's sibling**, and it needed a decision the row did not anticipate: whether taking a parked
recovery to the public catalogue _finishes_ it depends on where the waiting ids get their marketplace
from, and only the opening that parked them knows. A parked **restore** answers yes — its marketplace
is whatever the slot names, and clearing the field is how the slot comes to name none. A parked
**import** answers no, with a named no-op: its ids belong to the marketplace its payload names, so
continuing against the public catalogue is precisely the silent partial import the recovery exists to
prevent. The asymmetry is pinned by its own spec.

Verified: editor unit 13 files / 293 passed; playwright **259 passed** (was 255); tsc and eslint
clean. `packages/cli` ran green throughout at 6648 passed — and its premise was corrected in passing:
**`packages/cli` does not depend on `@workspace/api-mocks` at all**, the only consumer in the tree
being `apps/editor`.

Finding filed: two elements can both be visible and still cover each other. Visibility and
clickability are both true in every overlap defect, and Playwright clicks through overlays by
dispatching at the box — so a floating control needs a bounding-box assertion against the container
it must clear, and `position: fixed` is simply unavailable inside a centred max-width layout, because
the number was never the problem.

## 2026-08-17 — CLI-513 + CLI-503 + CLI-505: three validators that judged the wrong thing

**CLI-513, and the obvious fix was also wrong.** `validateTsConfig` reported "no default export" on a
`null` from `loadConfig`, on a JSDoc claim that a `null` meant exactly that. jiti documents
`import(f, { default: true })` as `mod?.default ?? mod`, so the option **destroys** the fact the
validator needs. Probed directly against jiti 2.4.2:

| module                          | ownKeys                       | `__esModule` | `default` |
| ------------------------------- | ----------------------------- | ------------ | --------- |
| `export const skillRules = {…}` | `["__esModule","skillRules"]` | true         | false     |
| `module.exports = {…}`          | `["version"]`                 | false        | false     |
| empty file                      | `[]`                          | false        | false     |
| `export default {…}`            | `["__esModule","default"]`    | true         | true      |

**A CommonJS config is indistinguishable from a named-only ESM one under a naive `"default" in ns`
test**, so that check would have refused a file that loads correctly today. `__esModule` is the
discriminator — which is why the fix had to move into `config-loader.ts`: the validator could only
have asked by evaluating the file a second time. `loadConfig` now orders three outcomes: exports
nothing → `null` (unchanged for every caller), ES module with no default → a new
`ConfigDefaultExportError`, otherwise the schema. **`loadSourceConfig` re-throws the new error beside
`ConfigSchemaError`; without that line a named-only `config.ts` becomes "no config" and silently
repoints the install at the default source** — the regression that function's own comment warns about.

**CLI-503, and `forkedFrom` alone would have made `doctor` worse.** The rule is: a skill directory is
this installation's when the configuration in play names its id **or** the directory carries
`forkedFrom`; anything else is named in a note and not judged. The marker lives _inside_
`metadata.yaml`, so a skill whose metadata is missing or unparseable can carry no marker — and that
is the plainest breakage `doctor` exists to report. The config claim carries those; the `forkedFrom`
claim carries skills a configuration has stopped naming or never named. Neither is sufficient alone,
and the union is not a fourth definition of ownership but the two existing ones applied together.

Because the pass now reads config, `doctor`'s `content-skills` row carries `readsConfig: true` and
stands down when the config cannot be read — the gate `Marketplaces` already used. Confirmed: without
the config, half the ownership test is missing, and judging anyway is exactly the over-reporting this
row exists to end. The no-config case has its own path.

Live result on the owner's machine, where `context7-mcp` was the sole remaining error:
`- ~/.claude/skills/context7-mcp — not installed by this CLI and named by no configuration here: not
validated` · **11 passed, 1 warning, 0 errors**. Both claims stay loud: a `forkedFrom`-marked skill
missing its SKILL.md and a config-named skill missing its metadata.yaml are still errors.

**Ten existing doctor fixtures were describing the defect rather than an install** — each wrote a
skill directory no config named and no marker claimed, then asserted `doctor` faulted it.
`writeValidInstalledSkill` now stamps `forkedFrom` as part of what an install _is_, matching the real
copy path; the fixtures whose metadata is deliberately absent are named in config instead.

**CLI-505's own row prescribed a fix that would have made it worse.** It said to keep
`extraCategoriesArr` as "the half that actually names categories no built-in declares".
`buildProjectTypesExtras` fills that with `deriveCategories(everyConfiguredSkill)` plus every stack
category — so on the project-standalone path, a normal project-only install, the row's fix would have
labelled the _entire_ Category union custom. **Ruled: custom means the loaded catalogue does not
declare it** (`matrix.categories[c] === undefined`), which fixes both paths.

Verified: unit 154 files / 6648 passed / 0 failed; e2e 216 files / 778 passed / 0 failed; tsc ×3,
eslint, prettier, `generate:matrix:check` clean. Four e2e failures seen mid-run all passed in
isolation — dist-rebuild races against a concurrent agent, not defects.

## 2026-08-17 — CLI-512 + CLI-511: the second producer inherits the first's refusals

**What the pre-fix hand-run showed is the D-310 defect fully realised in a destructive command.** At a
`$HOME` holding a global install, applying a configuration whose skill and sub-agent are both
`scope: "project"` announced a **global** install for removal, re-scoped a global entry to project at
the home root, and then crashed on an `fs-extra` copy of a directory onto itself — because at `$HOME`
both scopes resolve to one directory. The config survived only because the crash pre-empted the
write; the removal had already been announced.

`refuseProjectScopedContentAtHome` and `projectScopedContent` moved out of `init.tsx` and onto
`BaseCommand`, beside the refusals both commands already share — **moved rather than exported**,
because `edit.tsx` importing `init.tsx` would add a second command-to-command edge, and the one that
exists is recorded as explicitly outside the layer model.

**The ordering is forced by data dependency rather than chosen, and that is the interesting part.**
The terminal question is answerable with **zero inputs** — nothing in a payload can change it — so it
sits above the fetch. The location question needs the **most** inputs on the path: `cwd`, plus the
payload decoded _against this catalogue_. It cannot precede the fetch, because an all-global
configuration is exactly what a global installation is for and refusing every `edit --from` at
`$HOME` would be wrong. It cannot be asked of the raw payload either — a skipped id is not an
offender, and a bare sub-agent's resting scope is resolved by the decode. So it fires at the first
moment its input exists, which is the same point of the same value `init --from` uses. Placed above
the skip warnings, matching init's rule that a run about to be refused must not first narrate.

One consequence, stated rather than hidden: at `$HOME` with no terminal the user gets the terminal
refusal, which points at `init --from` — which then hits the same location refusal. Two refusals in
sequence, and no cheaper ordering exists. Because both now call one method, the second is the same
sentence rather than a new surprise.

**CLI-511's third kept-reason takes the decode's own `skippedSkillIds`, stated by the caller rather
than recomputed**, so it cannot disagree with the skips the same run reported.

**Ruled: where more than one reason covers an entry, the precedence is authored-here → unplaceable →
inherited-global.** Each statement carries its own remedy, so the reason named must be true of the
whole entry, and the order is by permanence: a global install can be removed today from another
directory; an unplaceable id is inert for as long as this installation reads this catalogue; a skill
nobody installed can never be removed by any shared configuration from anywhere.

The riskiest downstream path was hand-run although no test covers it — the same case with an
installed **stack row** for the unplaceable skill. The row is carried through verbatim with
`preloaded: true` intact, compile warns it cannot load it and leaves the agent unchanged, and a
second `edit --from` of the same id is a clean no-op, so the kept entry is not removed by the run
after this one.

Verified: unit 154 files / 6648 passed / 0 failed; tsc ×3, eslint, prettier,
`generate:matrix:check` clean. **The e2e flake was proved rather than assumed** — three consecutive
full runs failed a _different_ set each time, and all five files passed in isolation; two were 30s
timeouts and two were content-validation assertions in a concurrent agent's declared area against a
`dist/` being rebuilt underneath the run.

Finding filed: a second producer joining an existing apply sequence was checked against the first's
happy path, so it inherited neither the first's **refusals** nor a re-costing of the first's
**harmless outcomes** — a skip is free into a clean directory and is a deletion over an installation.
Both rows are one lesson.

## 2026-08-17 — CLI-514: the plugin suite stops writing into the machine that runs it

**`CLAUDE_CONFIG_DIR` isolates WRITES, not only reads** — measured against Claude Code 2.1.231 before
anything was designed. A `marketplace add` under an isolated config dir wrote all four surfaces
inside it (`settings.json`'s `extraKnownMarketplaces`, `plugins/known_marketplaces.json`,
`.claude.json`, `backups/`); a `plugin install` added `plugins/installed_plugins.json` and
`plugins/cache/`.

**And `CLAUDE_CONFIG_DIR` beats `HOME`.** With both set to different directories the fake HOME stayed
completely empty. That is the fact the design turns on: a suite that only fakes `HOME` is isolated
exactly until someone exports `CLAUDE_CONFIG_DIR`. Setting it explicitly is a defence rather than a
preference — it overrides a developer's exported value instead of competing with it.

**A parameter, not an ambient read — and an ambient read would have been a no-op.** `execCommand`
already spreads `{ ...process.env, ...options?.env }`, so an exported variable is forwarded with zero
code. The callers that actually leaked are **in-process**: vitest workers importing the helpers
directly, which have no spawned environment to inherit. The only ambient alternative is mutating the
worker's global `process.env`, which leaks across every spec in the file and is invisible at the call
site. Threaded through **all eight** config-touching helpers rather than four, because a `list`
reading the real config while `add` writes an isolated one is incoherent and any un-threaded member
falls back silently. `isClaudeCLIAvailable` is excluded — `claude --version` reads no config. Every
parameter optional, so no production call site changed.

**Two claims in the row were wrong and are corrected here.** `e2e/global-setup.ts` _does_ call
`marketplace remove` in teardown for names matching `e2e-test-`; the hole was narrower than stated —
a smoke test registered `e2e-smoke-test-marketplace`, which that `startsWith` never matches, and
smoke tests do not run under that globalSetup anyway. And **no gates were removed: all 47 stay**,
because the predicate _is_ binary availability. Without the guard, `spawn claude ENOENT` is
indistinguishable from the regression the spec exists to catch. The 11 skipped tests come from
`describe.skip` / `it.skip` / `it.todo`, not from these gates.

**A spec that was green only because it never did its job.** `plugin-install.smoke.test.ts`'s "should
add a marketplace from a local directory source" wrote an untyped `{ name, plugins: [] }` manifest
that the Claude CLI rejects outright. It had **never once added a marketplace**, and its only
assertion was `expect(typeof result.exitCode).toBe("number")`. Two accidents stacked: the fixture was
invalid _and_ the assertion could not see it — which is also why its un-sweepable marketplace name
never actually leaked. Fixed by typing the literal as `Marketplace`, so a missing required field is
now a compile error.

The rewritten `home-isolation.smoke.test.ts` was mutation-checked: with `configDirEnv` neutered, six
of seven specs go red — including the one the old file could never make, that the fixture leaks into
the ambient installation.

Cleanup is structural rather than procedural: the registry files live _inside_ the temp tree, so
removing the tree removes the registration.

Verified: unit 154 files / 6665 passed (+17, all new); e2e **identical** at 778 passed, so nothing
regressed and nothing newly ran; smoke 3 files / 20 passed; tsc ×3, eslint, prettier,
`generate:matrix:check` clean. **The owner's real `~/.claude/` was md5-compared before and after every
run and is identical to session start** — and after a full smoke run under a throwaway ambient config
dir, that dir held zero registered marketplaces and no `plugins/` directory at all.

## 2026-08-17 — CLI-519: a global skill is removable from a project, with the user's informed consent

**Three layers had to agree, and the brief named only two.** The removal DIFF drives
`uninstallPluginSkills` / `deleteLocalSkill` / `removeCompiledAgents`; the MERGER's
`authoritativeScope` protects the config row. But a project run writes the global config through
`writeScopedFromWizard`'s project branch → `resolveEffectiveGlobalConfig` → `mergeGlobalConfigs`,
which is **additive by construction and never removes**. Without that third layer the row would have
survived in `~/.claude-src/config.ts` while the diff deleted `~/.claude/skills/<id>` — config and
disk disagreeing, which is the failure this row existed to avoid.

**One word decides all of it, computed once.** `applyAuthority(producer, cwd)` returns `"all"` at
`$HOME` (unchanged), `"all"` for a **confirmed** shared apply in a project, and `"owned"` for the
wizard producer in a project (unchanged). It is computed in `run()` from what was actually confirmed
and handed to the writer rather than re-derived — and `reconcileSharedConfig` no longer takes an
authority option **at all**, so it cannot disagree with the word the writer got.

`resolveEffectiveGlobalConfig` gained a second resolution: `addSessionToGlobal` (the standing
additive one, verbatim, for every other caller) and `matchGlobalToSession`, which carries the
installation's identity, its stack fallback and its `projects[]` registry across — because a
project's split says nothing about who the global install is or which projects read it, and the
fan-out walks that registry.

**Deletion at the right scope already worked and needed no change**, which is precisely why the old
arrangement was dangerous: the disk half was ready and only the reconcile was holding it back.

**Ruled and confirmed, four:** `globallyInstalledKept` is **renamed** to `globallyInstalledRemoved`,
not reworded — a symbol saying _Kept_ for a message saying _removed everywhere_ is the drift the
naming rule targets. `RemovalPlanConfirm`'s `kept` prop becomes `statements`, because a blast-radius
line is not a kept statement and the prop would make the shared component's contract lie. The reach
statement names **other** registered projects, since the current one is registered too but is the one
being looked at, and propagation excludes it by the same reasoning. And `applyAuthority` returns
`"all"` for a confirmed shared apply unconditionally rather than only when something global was
actually removed — wider than the minimum, but when nothing global was removed the two words are
behaviourally identical, and one word decided once cannot disagree with what was confirmed.

**Propagation proved on a bystander.** With `project-a` and `project-b` both registered and
`project-b`'s own `web-developer` preloading the global skill, an `edit --from` confirmed in
`project-a` left `project-b` — never opened — with the skill gone from its compiled agent, and the
command said `Recompiled agents in 1 registered projects, 0 unchanged`.

The two paths are visibly different branches rather than one gate wording itself differently: at
`$HOME` the plan uses ordinary headings with no reach statement and no enumeration, and in a project
it names the global scope, the machine-wide consequence and the other affected projects. Decline
leaves all three scopes byte-identical, verified by comparing path, size and mtime across every
`.claude` and `.claude-src`.

Verified: unit 155 files / 6671 passed / 0 failed; e2e 217 files / 790 passed / 0 failed; tsc ×3,
eslint, prettier, `generate:matrix:check` clean. Two unit specs were retired deliberately — one
tested an authority axis that no longer exists, the other a kept sub-agent that can no longer occur.

## 2026-08-17 — CLI-517 + CLI-520: the two screens agree, and the smoke suite is finally run by something

**CLI-517.** `doctor` contradicted itself six lines apart — the content pass correctly stepped over
`context7-mcp` as "not installed by this CLI", and the `No Orphans` row then offered the same
directory for removal, which `uninstall` would refuse. The rule on the no-config path is now: a
directory is ours **iff it carries `forkedFrom`**, byte-for-byte `uninstall`'s own test. No fourth
judgement was written — the provenance half of the existing union was extracted as
`carriesOurProvenance`, and the config-present union now calls it too.

**The missing-metadata asymmetry was decided rather than defaulted.** A directory whose
`metadata.yaml` is absent or unparseable is **not** listed, because `readForkedFromMetadata` returns
`null` for both "cannot prove it is ours" and "is not ours", and `splitAgentsByProvenance` already
rules the same way for compiled agents — deciding differently would have the CLI apply opposite rules
to skills and agents on identical evidence. **Doctor does not go quiet, and that was verified rather
than assumed**: the content layer runs unconditionally, so every stepped-over directory is still
named as a note. Only the _offer_ narrowed. The counter-case — our own skill whose metadata was
deleted — becomes invisible to the orphan row, which is the correct trade, since `uninstall` would
refuse it too and listing it restores the contradiction.

Two fixtures were repaired and one deliberately left. `installContentWithoutConfig` **was encoding
the defect**: its stated intent is a skill stranded by a deleted config, and a real one always
carries `forkedFrom`. The check that mattered was `global-config-deleted-under-install`, which drives
a _real_ install so its skills carry genuine provenance — it stayed green, which is the evidence the
fix does not over-narrow.

**CLI-520.** `e2e/vitest.config.ts` now declares two named projects, `e2e` and `smoke`, mirroring the
shape the package-root config already uses — not a second config file, because the include is the
only thing that differs and every other option has to reach both. `test:e2e` gained `--project e2e`;
`test:smoke` is new, and one CI step runs it.

**The guard is generalised rather than a restatement.** `spec-gates.test.ts` asserts that every
`e2e/**/*.test.ts` on disk is claimed by some project's `include`, **and** that every project is
named by a package script. Either half alone is satisfiable by doing nothing — a config claiming a
file no script runs is as unrun as a file no config claims.

**What CI actually proves was measured, not asserted.** With `claude` removed from `PATH` the suite
reports `3 skipped (3) / 20 skipped (20)` in 1.12s — so on a runner it asserts **nothing** about the
Claude CLI and must not be reported as coverage of it. The value is that the three files collect,
import and resolve their helpers, which is exactly what rotted while nothing ran them. Both halves
are written into the script's own note and the CI step comment.

**`pom-framework.e2e.test.ts` is intended, not misfiled.** It exercises our own page objects rather
than a third-party binary, and two of its three blocks need no Claude CLI at all — so `smoke/` holds
two kinds of file and **the filename is the discriminator, not the directory**. Renaming it would
move three currently-running specs behind a gate two of them do not need.

Verified: unit 156 files / 6686 passed / 4 expected fail (the fourth is CLI-521's `it.fails` guard);
tsc ×3, eslint, prettier, `generate:matrix:check` clean. Four failures observed during the run were
a concurrent agent's in-flight rename in `config-types-writer.ts`, reproduced in isolation and
therefore not a `dist/` race.

## 2026-08-17 — EDITOR-39: a credential now has an identity

**The RED capture is a credential leak, and the single slot made it unavoidable.** A shared link
_chooses_ the marketplace, and `seatMarketplace` read `getState().token` — so anyone who could send a
URL could make a visitor's browser present its `acme/private-skills` PAT to a repository it was never
issued for:

```
a shared address › sends no token to a marketplace it holds none for
-   null,
+   "Bearer ghp_0000000000000000000000000000000000000"
```

Keyed, that request carries no `Authorization` header at all. A token stored without its identity is
spent on whoever asks next; filed as a finding under exactly that name.

A second leak surfaced during the drive: the dialog's token box persisted across an edit of the
marketplace field, so a PAT for one repository was submitted **and filed** under another.
`nameMarketplace` now re-reads the box from `tokenFor(the new name)`.

**The migration exists and a v1 blob survives it, proven in a real browser.** `migrateSavedMarketplaces`
lifts `{ marketplace, token }` into `{ current, saved: { [marketplace]: token } }`; the storage key
still names the slot while the persist `version` goes from an implicit 0 to 1. The private stub 404s
anyone without the token, so "the catalogue loaded" _is_ the proof the PAT came through. A blob that
cannot be carried is discarded **and reported** — the old code discarded silently, which is the whole
reason this row could have destroyed every stored PAT on deploy.

**`forget()` is gone**, split into `choose(marketplace)` and `choosePublic()`, both of which write
only `current`. **There is deliberately no verb that forgets a token** — nothing in the app asks to
destroy one, so there is no door to reach one through.

**The switch dialog names a computed consequence, and the consequence is real:**

> Switching to acme/private-skills will drop 2 of your 2 skills: Bigco Widgets, Bigco Gateway.

After confirming, the roster reads `INSTALL 0 SUB-AGENTS AND 0 SKILLS`. Without `pruneToCatalog()`
those two would have survived in the install list and in any shared link as bare ids, making the
dialog's own sentence false.

**The three notions of "marketplace" are now named**, at the top of the store: `catalog-store` holds
the **SEATED** one, `marketplace-store.current` the **CHOSEN** one, `marketplace-store.saved` the
**SAVED** credentials. The switcher lists the third and only ever what the visitor saved — EDITOR-37's
rule that a shared address seats without storing held throughout, and EDITOR-38's PAT case is now
impossible by construction, since `remember(named, token)` can only write the key in the field.

The e2e assertions were converted from `toContain(REF)` to parsed reads across all nine call sites, so
they can no longer pass against a wrong reshape — and the two hand-written legacy blobs now seed the
current shape, testing the migration where it is claimed rather than incidentally.

Verified: editor unit 14 files / 308 passed (was 293); playwright **272 passed** (was 259); tsc and
eslint clean. Two traps caught before shipping: a `react-hooks/set-state-in-effect` violation made
redundant by the component being keyed, and a Zustand v5 infinite loop from a selector returning
`Object.keys(...)`.

## 2026-08-17 — CLI-515 + CLI-516 + CLI-518 + CLI-521

**CLI-515 — renamed both rather than collapsed, because they are not one question.** They share a
kernel (`packageName === PUBLIC_CATALOGUE_PACKAGE`) but ask different questions from different
starting points, and one carries a conjunct the other cannot: the load side reads a **directory** and
asks whether the checkout is that repository, while the build side is handed a package name the
caller already parsed and asks whether the reserved **name** about to be published is the catalogue's
own — which is `marketplaceName === DEFAULT_PUBLIC_SOURCE_NAME` _and_ the package check. Collapsing
would have to drop that half or smuggle a directory into a build-time check that has none. Now
`isPublicCatalogueCheckout(basePath)` and `isCatalogueOwnReservedName(marketplaceName, packageName)`,
each naming the other in its JSDoc so a grep for either lands on both.

**CLI-516, and `collectCustomDomains`'s category half was provably dead, not merely unlikely.** It
walked `typedKeys(matrix.categories)` and asked `customCategorySet.has(key)` — but under the landed
rule a custom category is exactly one **absent** from that map, so the intersection is empty for
every input and `customOnlyDomains` was always `[]`. What remained was the `extraDomains` half, which
was the defect. Deleted; all four axes now read one rule.

One deliberate non-signal, recorded because it looks like an omission: **`local: true` is not read as
custom.** An ejected catalogue skill is copied into `.claude/skills/` and rediscovered as local, so
reading it would label the catalogue's own work as the user's — the same error inverted.

**Ruled: an id nothing declares is `// Custom`, not `// Marketplace`.** In a two-value vocabulary that
is the closest true statement, and it makes the writer's two branches agree — they previously
disagreed, because `writeScopeConfigTypes`'s home branch passes `extras` through while its project
branch defaults them from the config, so the same installation was labelled differently depending on
which branch wrote it. Filed as a finding: CLI-515's lesson in a second place.

**CLI-518.** `warn()` is for issues the user should know about; `verbose()` is for diagnostics, and a
matrix key sample is squarely the second. The two old lines are replaced by one per absent id —
_"Skill 'X' is not in this marketplace — it stays in the configuration and no sub-agent is given it.
Run `update` to refresh the marketplace, or remove it with `edit`."_ — with the sample kept behind
`--verbose`.

**The honest limit is recorded rather than glossed:** the warning could not be reached by hand,
because the wizard prunes an absent id during restore before the branch is reached, printing its own
statement. It is reachable only through the `--from` producers, which keep an unplaceable id
deliberately. That is itself the explanation for the row — until the kept-unplaceable path existed,
no sanctioned route reached the diagnostic at all.

**CLI-521 — both partitions, and the mirror was live.** A config whose every agent is global leaves
`projectStack` empty, so the project partition inherited the whole config's stack, exactly as the
global one did. Both are now `stack: <partition>` unconditional over the unconditional `...config`.

**Ruled `{}` over `undefined`, and the reason is already written in the same file:**
`buildStackForSelection` records that the merger trusts `{}` and drops the stale existing stack while
`undefined` resurrects it — the removed-last-skill bug. Emitting an absent stack here would
reintroduce that class through the split. No file gains a `stack: {}`, because `generateConfigSource`
already omits the variable when the object is empty.

Hand-run proof under the defect's own condition — every agent flipped to project scope:
`~/.claude-src/config.ts` holds 23 global skills, **no agents and no `stack` block at all**, while the
project config carries all 12 agents' rows. That is the file that would previously have held every
project agent's stack.

Verified: unit 156 files / 6688 passed / 3 expected fail (the `it.fails` guard flipped to a real
pass); e2e 219 files / 811 passed / 0 failed; tsc ×3, eslint, prettier, `generate:matrix:check`
clean. **No fixture encoded the defect on CLI-521** — checked before assuming, given the ten doctor
fixtures that did earlier the same day. One genuine failure was fixed at the fixture rather than the
assertion: a spec passed an empty agent-definition record while its config named an agent, so under
the new rule that agent was correctly "declared by nothing".

## 2026-08-18 — the hand-run harness, and a pass over the journeys

Step 4 of the lifecycle — run it by hand through the CLI — had no tooling, so each pass was
improvised in a shell and the interactive journeys were simply never walked. There is now
`e2e/handrun-journeys.ts`, `e2e/handrun-driver.ts` and `scripts/handrun.mjs`: it drives the real
binary and prints a transcript for a person to read, with a HOLDS/BROKEN line per claim.

**Almost all of it is other people's code, and the first attempt that was not is the lesson.** A
driver was written over the raw `TerminalSession` and it failed twice, both times silently: the
wizard's **tab bar renders every step's name on every screen**, so waiting for "Confirm" matches
instantly and the keystroke lands on step one; and `waitForText` polls the **whole output** rather
than the current screen, so a sentinel matches text from a frame already gone. Either one fires a
keypress into a handler that has not mounted, which no-ops rather than erroring. `e2e/pages/`
already solves both — `InitWizard`, `EditWizard`, `BaseStep.waitForWizardFooter` — and the driver
now uses them, along with `seed-config-store`, `createE2ESource`, `createE2EPluginSource`,
`initGlobalWithEject` and `setupDualScopeWithEject`. What remains of the bespoke driver is
transcript printing.

Three seams had to be got right before any of it ran. The bundle must land **beside the e2e
helpers**, because `CLI_ROOT` is derived from `import.meta.url` and a bundle elsewhere points the
spawned binary at the wrong tree. `@xterm/headless` is CommonJS and has to be bundled rather than
left external. And each journey is wrapped so a failure reports itself and the run continues —
without that, one bad fixture ends the pass.

**33 of 39 journeys walked, 17 claims, every one HOLDS.** Including three paths never hand-verified
before: plugin mode end to end against a marketplace registered with the real `claude` binary
(`Installed …@e2e-test-fixture`, registry and cache written into an isolated config); a
public-catalogue checkout read off a PATH reaching the built-in stacks, which had zero specs; and
the ownership boundary in both directions — a hand-authored skill is neither carried into a payload
nor removed by a destructive round trip.

**The CLI failed no journey.** Every BROKEN in the pass was the harness or the invocation:
`search` and `doctor` take no `--marketplace` (exit 2 is INVALID_ARGS), a namespace fixture that
never planted its bad id, a journey fetching an id it had not published, an external skill marked
project-scoped then installed at a home root — refused by another journey's own guard, which is two
journeys catching each other — and a stack pick that could not be deselected because the skill was
global and the edit was run from a project, which is the standing invariant working.

`CLAUDE_CONFIG_DIR` isolation was confirmed by hand against the real binary throughout: the
machine's `known_marketplaces.json` and `installed_plugins.json` are byte-identical before and
after, across real marketplace registrations and real plugin installs.

Left unwalked: journeys 25, 26 and 27, which are browser-side and cannot close a CLI row by the
page's own rule.

## 2026-08-18 — the hand-run verdicts were weak, and tightening them found four harness defects

The pass recorded above claimed 19 holding verdicts. **Most of them asserted presence rather than
content**, and one could not fail at all: `after.length >= 0 && before.length >= 0`, over array
lengths — the vacuous-assertion shape this repository has now filed three times, written into a
harness whose author had filed one of them the same day. Journeys 4 / 15 / 16 were reporting
"verified" while asserting nothing.

Against the four surfaces `user-journeys.md` defines, the first pass touched one. `config.ts` was
read for skill ids by regex; compiled agents were a directory listing; `config-types.ts` was
compared byte-for-byte in two journeys and otherwise ignored; and most journeys looked at one scope
and not the other, which is exactly where the scope defects live.

`e2e/handrun-surfaces.ts` now checks all four at a named scope, and every install-producing journey
runs it at **both**:

- **`config.ts`** — each ejected skill must sit at the scope its entry claims, compared against
  disk, and every entry must name an `origin`. Checking that `scope` is one of two values is
  tautological, because the loader has already narrowed it; the question worth asking is whether
  config and disk agree.
- **Compiled agents** — every agent at this scope is compiled here, **no other scope's agent leaks
  in**, nothing is compiled that the config does not declare, and no compiled agent references a
  skill this configuration does not carry.
- **`config-types.ts`** — the written `config.ts` must type-check against it **and** it must still
  reject a bogus id. Without that second half a union degraded to `string` type-checks cleanly while
  being worthless.

Tightening found **four defects in the harness**, three of which were concealing real behaviour: the
vacuous verdict; `os.homedir()` read in the driver's own process rather than the temp HOME the
install used, so every scope-vs-disk check looked in the wrong place; an agent check that expected a
project directory to compile the global scope's agents; and no model of a `[P][G]` pair, where one
agent name exists at both scopes and each side compiles its own half.

**64 strict verdicts, all holding**, against 19 loose ones before. Two of the four harness defects
were surfaced by the checks disagreeing with a correct dual-scope install rather than by reading the
code.

**Still unverified by hand: the editor.** Journeys 25, 26 and 27 have never been driven, and no
browser-side claim in this programme has been confirmed by a person.

## 2026-08-18 — the strictness was shared with the suite, and the check itself was hollow

The four-surface logic moved to `e2e/assertions/four-surfaces.ts`, beside the assertion helpers that
were already there. One core, two presentations — `inspectFourSurfaces` reports for the hand-run and
`expectFourSurfaces` throws for the specs — so a spec and a hand-run cannot drift on what "strict"
means, which is precisely what had happened: the hand-run asserted presence where the suite asserted
content, and neither noticed.

**And the narrowing check in it was hollow, which corrects the entry above.** It called
`probeConfigTypesNarrowing` with a skill ID where the function takes ALIAS NAMES, so the rendered
probe read `import type { some-skill-id } …` — unparseable — and tsc exited non-zero on TS1005 /
TS1351 / TS1128. The claim was written `exitCode !== 0`, so it held on a **syntax error**. Measured
four ways:

| `config-types.ts`      | probe argument | exit  | why                                                 |
| ---------------------- | -------------- | ----- | --------------------------------------------------- |
| narrow union           | the literal    | 2     | syntax                                              |
| **`SkillId = string`** | the literal    | **2** | syntax — the defect, indistinguishable from success |
| **`SkillId = string`** | alias names    | **0** | correctly caught as unnarrowed                      |
| narrow union           | alias names    | 2     | **TS2322**                                          |

So the earlier claim of "64 strict verdicts, all holding" was true of seven checks and empty of the
eighth — **the vacuous shape reintroduced while removing it.** Judged on `TS2322` now, and the fixed
check was proved able to fail at both scopes before being trusted.

**The suite was brought up to the same standard where it had from-scratch proof to strengthen.**
34 `expectFourSurfaces` calls across 17 tests in 9 files; journeys 3, 4, 13b, 15, 24 and 29 move
PARTIAL → COVERED, at both scopes wherever an install has two, with `expectEmpty` on the scope that
must own nothing. No product defect surfaced — all 34 passed first time against real installs, and
the checks were proved able to fail before that was believed.

**Journey 9 turned out to have no from-scratch proof at all.** Its three named specs each begin from
a fixture-written config, which the page's own vocabulary calls a variant. Strengthening them would
have closed nothing, so the row now says so rather than reading as one surface short.

## 2026-08-18 — the editor was hand-driven for the first time, and it is not clean

Journeys 25, 26 and 27 had never been driven by a person. They were run in a real browser against a
real Vite dev server, a real `wrangler dev` worker with real KV, the real 58-skill index crawled from
GitHub, real `api.github.com` and `raw.githubusercontent.com` reads, real `POST /configs` with
content-addressed ids, and the real CLI consuming what was minted. One substitution, stated rather
than glossed: **no repository on GitHub publishes `.claude-plugin/catalog.json` today** — a global
code search returns zero results — so two catalogues were built with the project's own toolchain and
served from a route that mirrors GitHub's verified semantics (404 unauthenticated on a private repo,
200 with a PAT, 401 on a bad PAT).

All three journeys hold on their mechanics. **Five defects were found, two of them HIGH**, and both
HIGH ones are silent: a payload that carries ids from two marketplaces under one `marketplace` ref,
so the link installs a subset and the sharer is never told; and a first-time visitor adopting a
shared configuration as their own, because `merge` answers an absent persisted slot by returning
`current` — right at startup where that is empty, wrong on a reattach where it is somebody else's.
Filed as EDITOR-41 to EDITOR-45.

**Nothing in either E2E suite has ever seen a real byte.** Both editor fixtures fulfil at the browser
boundary, so no spec has exercised a real `POST /configs`, a real content-addressed id, the real
index, or a real raw-CDN read — the 256 KB per-skill cap had only ever met a fixture. And **no spec
mints a payload after a catalogue change**, which is the entire blind spot the first HIGH defect
lives in.

Journey 26's "closed by construction" is too strong and the page should say what construction closed:
namespaced ids make a collision unrepresentable; they do nothing about one payload naming two
catalogues.

## 2026-08-18 — EDITOR-44: every surface naming the marketplace now reads the seated one

Two hardcoded strings. `install-dialog.tsx` wrote the literal `marketplace agents-inc` in its header,
so on a custom marketplace the dialog contradicted the button behind it and the payload it handed
over. `derive.ts`'s `const MARKETPLACE_REPO = "agents-inc/skills"` pointed every skill's source link
at the public repository — verified against live GitHub: the old link for a custom marketplace's
skill returns **404**, the new one returns **200**.

**Both read SEATED, and neither CHOSEN nor SAVED is defensible.** The install dialog describes what
`--from` will install and `toSeedPayload` stamps the payload with `activeMarketplace()`, so naming
the chosen marketplace would describe an install that is not the one about to happen — and on a
shared address a marketplace is seated that this browser never chose, while the command still
installs from it. The source links follow the seated catalogue because the grid draws its skills.

Two decisions taken deliberately: the public catalogue now reads **`agents-inc/skills`** rather than
`agents-inc`, because that is the repository a payload carrying no marketplace installs from and
`owner/repo` is the shape every other marketplace surface uses; and a catalogue fetched at a `#ref`
links to that ref rather than `HEAD`, since `parseMarketplaceRef` hands it over for free and `HEAD`
is a different branch's answer.

Also fixed here, from EDITOR-45: **clicking the `EJECT` badge on an added skill selected or
deselected it.** The badge is a non-interactive span for eject-only skills, so the click bubbled to
the cell — two different outcomes from a target that looks identical to the catalogue skill's badge,
which flips install mode without touching selection. Its RED was captured in both directions.

Verified: editor unit 14 files / 318 passed; playwright **288 passed** (was 272); tsc and eslint
clean. Concurrent interference was ruled out by timestamp rather than assumed — two failures came
from another agent's in-flight tree and passed once it settled.

**Left open as EDITOR-46**: the size half. The index does not carry sizes, but the crawl receives
them and discards them, so the fix is one field and a sum rather than any new request.

## 2026-08-18 — EDITOR-41 + EDITOR-42 + EDITOR-43: the doors that seat a catalogue, and the slot that was not the visitor's

**EDITOR-42's captured RED is worse than the row said.** After following the notice's own instruction
and clicking once, a visitor with an empty `localStorage` held:

```
"skills":{"web-framework-react":{…},"web-styling-tailwind":{…}},
"agents":{"web-developer":{"model":"haiku","effort":"max"},"api-developer":{"on":true}}
```

React is the sharer's, and so are both agent records — the visitor adopted **model and effort
overrides they never chose**, not merely a skill. Root cause as filed: `merge` answers an absent
persisted slot by returning `current`, which is right at startup where that is EMPTY and wrong on the
reattach where it is somebody else's configuration.

**EDITOR-41, and there was a THIRD door.** `MarketplaceForm.submit()` never pruned; only the switch
dialog did. `loadPublic()` — clearing the field, and the **only** route back to the public catalogue —
had the same gap and was found by looking rather than by the row. All three now go through one path,
with `PUBLIC_TARGET` carrying the vendored matrix so the public door needs no fetch.

**Ruled: the switcher's consequence extends to the dialog.** The same `switchConsequence` sentence,
verbatim — _"Switching to bigco/skills will drop 2 of your 2 skills: Acme Widgets, Acme Gateway.
Nothing has changed yet — press Load again to switch."_ — because loading a different catalogue **is**
a switch and one sentence at both doors is the strongest statement that they are one act. A new
`dropsSelection(target, selectedIds)` sits beside it so each door decides _whether_ there is a
consequence before naming one; reading the sentence back would make the doors agree by coincidence.
Nothing at stake means no second press, which covers every first load and every pre-existing spec.

**The drive found what the fix itself broke, and two pre-existing specs caught it.** The first
`pruneToCatalog()` call **destroyed saved configurations**: a parked restore leaves the store empty by
construction under `skipHydration`, and `set` under `persist` _is_ a write — so pruning an empty store
wrote emptiness over the very slot the recovery was about to read. The fix is in the action rather
than at its callers:

```ts
const pruned = pruneUnknownIds(get())
if (!droppedAnything(get(), pruned)) return
set(pruned)
```

`droppedAnything` is extracted from `reportPruning`, which already asked the same question — **and
this closes the identical latent defect in the switcher**, which runs the same prune-then-seat order.

One limitation stated rather than glossed: the `useInstallCommand` dependency-list correction is not
independently observable end to end once the prune lands, because `pruneUnknownIds` returns fresh
objects so the memo recomputes anyway. Fixed regardless — the declared dependencies were not the real
ones.

Verified: editor unit 14 files / 320 passed; playwright **289 passed** (was 272); tsc, eslint,
prettier clean.

## 2026-08-18 — CLI-522 + CLI-525 + CLI-526: the two screens agree on agents, the probe cannot be fooled, and the page is now checked

**CLI-522.** `listInstalledArtifacts` walks agents through a new `listAgentFilesWithOurProvenance`
calling `splitAgentsByProvenance` — no second judgement, matching the discipline the skills half
established. Hand-run: `doctor` offers `web-framework-react` and `web-developer.md`, `uninstall`
removes exactly those two and answers `Kept 1 agent … no agents-inc marker`, naming a file `doctor`
never offered.

The row's stale tip lost its false parenthetical. Worth recording _why_ no spec caught it:
`STEP_TEXT.DOCTOR_TIP_UNOWNED_INSTALL` matched the lead-in `"Nothing declares the files above"`,
which is true of any wording — so three specs asserted the constant and none could see the claim
behind it was wrong. The constant now points at the substantive half.

**CLI-525.** The parameter is `readonly GeneratedAlias[]` over all **six** aliases
`assembleConfigTypesSource` emits, not the three the row sketched. The guard is pinned against
`Parameters<typeof probeConfigTypesNarrowing>[1]` rather than the type's name, so widening it back to
`readonly string[]` fails too. The TS2322 rule went into `standards/e2e/README.md`.

**CLI-526, and the gate condemned four rows on its first run.** Two refinements were forced by real
data and both are load-bearing: **a mention is not a call** — a substring scan for `ProjectBuilder`
wrongly condemns journeys 19 and 20, which name it in a JSDoc explaining they deliberately do not use
it; and **judge on both lists**, because a file that seeds one leg and installs from nothing in
another still carries the proof, as `commands/share` does in 4 of its 5 specs.

**Journey 7 is the finding.** It read COVERED on all four surfaces for an arc no run has ever
performed end to end. Rows 9, 22 and 31 were condemned too but were already PARTIAL. All four now
read TO TEST; writing the runs is CLI-527.

**Ruled: journey 36's status edit was correct and not overreach.** It read _"Do not write a spec
asserting the agents half agrees; it does not"_ — after CLI-522 that instructs the next agent not to
write the spec that had just been written. A status sentence that has become an instruction to
preserve a defect is not a coverage marker.

Verified: unit 156 files / 6691 passed; e2e 217 files / 794 passed / 0 failed; tsc ×3 and
`generate:matrix:check` clean. The baseline carried one unrelated e2e failure — a plugin-mode install
waiting on the real `claude` binary — which passed on the post-change run.

## 2026-08-18 — CLI-523 + CLI-524: the harness stops handing the binary its own environment

**CLI-523.** `warn` gates on `process.env.VITEST`, and both runners forwarded it to the spawned
child, so every `suppressInTest` warning was invisible to the entire e2e suite. Proved before
implementing: the identical fixture and command run by hand printed the advisory **twice**, and the
suite saw it **zero** times.

**Ruled: clear `VITEST` for the child in both runners** rather than inventing a variable the runners
do not forward. `TerminalSession` spreads _all_ of `process.env`, so such a variable cannot exist
without changing the runner anyway; the product changes not at all; and it is not a new idea in the
file it lands in — `cli.ts` already clears `CC_MARKETPLACE` and pins `CLAUDE_CONFIG_DIR` on exactly
this principle. A harness variable that changes product behaviour must not reach a spawned binary.

**No spec was passing blind — and that is worse than it sounds.** The unit specs mock `warn` and
assert it was called, so they intercept above the gate and are sound. **No e2e spec asserts either
message because none could be written**, and `user-journeys.md` had already recorded that against
journey 31 as an ordinary coverage gap: _"A spec written without clearing it passes by not looking."_
The leak never corrupted an assertion; it stopped one from ever existing, and the tracker absorbed
the absence as if it were a choice.

Both suppressed messages are user-facing: the stack loader's _"not found in matrix"_ advisory, and
the config generator's _"it stays in the configuration and no sub-agent is given it"_.

The new spec drives both runners **and a control that re-injects `VITEST`**, so a green run proves
the runners stopped forwarding it rather than the suppression having been deleted.

**Ratified: the two runners clear it at different points** — `CLI.run` before the caller's `env`
spread, so a spec can deliberately re-inject it, and `TerminalSession` after, in the
harness-invariant block beside `NO_COLOR`. Each matches its own file's convention, and the
re-injection is what makes the control case possible.

**CLI-524, and the defect was not `STEP_TEXT`-shaped.** The count went 165 → **172** in both
documents, the two deleted members are gone, and the eight that had no home are placed at their
source positions — with both lists now matching `Object.keys(STEP_TEXT)` **element for element and in
source order**, which is a stronger property than agreeing on a total and makes the next diff a
one-liner.

But **three of the four defects were outside `STEP_TEXT`**, which is the finding: the Vitest
Configuration section still described one `include` and no projects; and **`e2e/assertions/four-surfaces.ts`
appeared in neither the `assertions/` tree nor the horizontal-layers row** — the module a new spec
should reach for, missing from both places a reader would look. A `STEP_TEXT`-shaped checker would
have caught one of four.

Every other enumeration in the file was diffed against source and found correct: `DIRS`, `FILES`,
`TIMEOUTS` (names _and_ values), `EXIT_CODES`, `SOURCE_PATHS`, `TERMINAL_SIZE`, the diff markers, both
tab-label lists, the loose-exports table and all six directory trees.

Verified: unit 156 files / 6691 passed; e2e 216 passed / 1 skipped with one pre-existing flake
(`init-wizard-default-source`, a real-marketplace plugin install, red at baseline with a
byte-identical signature); tsc ×3 clean. Three intermediate failures were attributed to a concurrent
agent by mtime rather than assumed — one spec was modified twenty-five seconds _into_ the run that
failed on it.

## 2026-08-18 — EDITOR-40: the editor spec re-derived, again, and six more false statements

Held deliberately until the editor work landed — re-deriving it before EDITOR-41 to 45 would have
guaranteed it drifted again within the hour, which is the row's own complaint. Doing it in the same
turn as the code is the point of step 5 of the lifecycle.

**Six false statements beyond the known list**, and the first is the instructive one:

- **The Marketplace button is sticky inside the skills column, not fixed to the viewport** — and
  **two independent sections both said the opposite**. Fixed positioning covered the nav rail's
  GitHub link, and the page grid centres past `105.25rem`, so no constant offset clears the rail at
  every width. A fix that landed in the code reached neither place that described it.
- The source-link row claimed `HEAD` "is the one thing neither source knows"; `marketplaceSourceUrl`
  passes a marketplace's `#ref` straight through, so only added skills and ref-less marketplaces get
  `HEAD`. The same row never said the link resolves against the **seated** marketplace.
- **Both test counts were yesterday's** — unit read 294 in 13 files against 321 in 14; e2e read 255
  in 22 against 289 in 23.
- "Four components hold a `useEffect`" is five, and the fifth sits in a hook rather than a component,
  which the document now says precisely.
- **Persistence attributed agent pruning to the loaded catalogue.** `pruneUnknownIds` checks skills
  and stacks against the seated catalogue but agents against the **vendored roster** — and
  `persisted-schema.ts` calls that a ruling rather than an oversight, because marketplaces ship no
  sub-agents. The old sentence would have led a reader to expect a marketplace's roster to matter.
- **The stated reason for not storing a link's marketplace was dead** — "the slot holds exactly one
  marketplace, PAT included" — a premise the keying removed. The behaviour survives for two different
  reasons, now written down: seating fetches and stores nothing, and `tokenFor(marketplace)` means a
  marketplace this browser holds nothing for is read with no `Authorization` header at all.

Structural gaps closed too: `pruneToCatalog` appeared nowhere, `marketplace-switch-dialog.tsx` was
absent from the tree, `alert-dialog.tsx` was described as backing one confirmation when it backs two,
and `skill-icons.ts` had no row despite two other sections depending on it.

**The honest boundary was kept rather than quietly upgraded**: the whole design-comparison column,
two point-in-time performance measurements, a bundle-composition claim and two third-party facts
remain carried forward unverified, and the document says so.

Adjacent finding, filed as EDITOR-47: `derive.ts`'s in-source comment claims a 1:1 mapping verified
"across all 237" skills; the matrix now holds 238.

## 2026-08-18 — CLI-529: three of the four escape shapes are judgement, and one is a selector

Eleven defects escaped two suites in two days. They escaped in **four shapes**, and the work was to
find which have a mechanical guard. **The answer was measured, not assumed**, and it is one of four.

**(a) Assert the departure — not checkable.** "Drives a transition" has no syntactic signature. Every
proxy is a hand-maintained list of page-object methods, and a spec using a method nobody added reads
as having no transition to answer for — the silent decline is the same defect one level up.

**(b) A sentinel must name the substantive claim — not checkable, and refused on numbers rather than
on instinct.** Two candidates were measured against all 172 `STEP_TEXT` members. Locating each
sentinel's message in `src/cli/` fails for **22 of 172**, because the product composes them around
counts — a check that cannot find its subject 13% of the time either declines silently or condemns
wrongly. Flagging a sentinel followed by a clause break fires on **90 of the 150 locatable**,
including row and group labels that are correct as they stand. The measurement table is written into
the rule so the rejected checks are not rebuilt.

**(c) Prove a gate-style assertion can fail — half checkable, and now a lint error.**

**Why `@typescript-eslint/no-unnecessary-condition` missed both live instances:** it asks whether a
value's TYPE settles a condition. `after.length` is `number` and `number >= 0` is an open `boolean`,
because **TypeScript has no non-negative numeric type for `.length` to narrow to**. Verified in place:
in the same file where it stays silent on `after.length >= 0`, `0 <= before.length` and
`exitCode === exitCode`, a plain `if (items)` one line away draws _"value is always truthy"_. And
`x === x` is core ESLint's `no-self-compare`, outside `js.configs.recommended` and never enabled.
Closed config-only: two `no-restricted-syntax` selectors plus `no-self-compare`.

**(d)** was already built and had already condemned four rows.

**The gate's own first mutation run found a defect in the gate.** `TEST_FILES` matches `**/e2e/**`
entire, so the spec and the e2e helper it lints were one zone while the CLI's own sources were
unnamed — green with the rule absent from the tree it mostly guards. Corrected, then five mutations
each produced a distinct correctly-named failure, including one for a selector broadened to catch
`> 0`: _"reports against a comparison the code can falsify — the rule has outgrown the shape."_

It **loads** the repo's ESLint config through `ESLint.lintText` rather than restating the selectors,
and **throws on a fixture that failed to parse** rather than counting it — because "eslint said
something" holds for a parse error exactly as `exitCode !== 0` held for the narrowing probe. That is
the same defect the row exists to prevent, guarded against in the guard itself.

Verified: unit 156 files / 6692 passed; e2e 217 passed / 1 skipped / 794 passed / 0 failed; tsc ×3
and `generate:matrix:check` clean. The eslint errors in `handrun.gen.mjs` were proved pre-existing by
linting it against `HEAD`'s own config, rather than assumed.

---

## 2026-08-18 — CLI-532: the vacuous-comparison rules reach every workspace, and the widening was measured

The two follow-ups CLI-529 named and deliberately left.

**`no-self-compare` moved to `packages/eslint-config/base.js`.** It is core ESLint, sits outside
`js.configs.recommended`, and `x === x` is not a mistake `packages/cli` has any special claim on —
stating it in one workspace left the other six accepting the shape. It takes no options, so it merges
across config blocks and reaches every workspace that extends the shared base. The selector half
cannot follow: `no-restricted-syntax` takes options, the last block naming it for a file owns all of
them, so those stay in `packages/cli/eslint.config.js` restated per zone.

**`VACUOUS_COMPARISONS` widened from `length` to `length|size|byteLength`, on the numbers rather than
on instinct** — the standard two candidate sentinel checks were refused against. The selector reaches
a property by NAME, so a domain object's own `size` field is condemned alongside `Map.prototype.size`,
and that is where a false positive would come from. Measured across all seven workspaces: **twelve**
comparisons of a `.size`, `.byteLength` or `.count` against a literal, **every one discriminating**
(`> 0`, `=== 0`), **none** in the vacuous direction. The widening condemns nothing that exists.
`count` was measured and left out — it names no builtin, so a `count` field is whatever its owner made
it and a signed one is not a contradiction.

**Both halves were watched fail before they landed.** `spec-gates.test.ts`'s mutation proof is now a
table of four `ESCAPE_SHAPES` — a length against zero, a zero against a length, a set's size against
zero, a value against itself — each lint-tested in each of the three separately-ruled zones in both
its vacuous and its discriminating form. A fifth gate lints under the shared base **and nothing else**,
which is the only way to tell a rule the base carries from one the package adds on top; the loaded
config cannot, because there the two are indistinguishable. It went red on exactly that assertion
before the rule moved.

That gate reaches the shared base by PATH, not by package specifier: `packages/eslint-config` ships
plain `.js` and declares in its own manifest that it holds no TypeScript, which
`check-shared-tsconfig.ts` reads — a `.d.ts` written to make a static import type-check would turn
that declaration false and take two cross-workspace checks with it.

Also here: `e2e/helpers/*.gen.mjs` joined the ESLint `globalIgnores`. The hand-run bundle is
gitignored but was still being linted, and it is mostly vendored third-party source, so
`reportUnusedDisableDirectives` was judging _its_ disable comments against _this_ config — six errors
that had been noted as pre-existing rather than fixed.

Hand-run against the live configs rather than only through the suite: `a === a` piped into
`apps/editor`'s ESLint reports `no-self-compare`, and `seen.size >= 0` piped into the CLI's reports
the widened selector. `eslint .` clean in all seven workspaces.

---

## 2026-08-18 — EDITOR-47: the count came out of the verification note

`derive.ts` carried "Verified 2026-08-09 against the public catalogue: the mapping is 1:1 across all
237 of them" beside `MARKETPLACE_SKILLS_DIR`. The catalogue holds **238**.

Re-derived rather than adjusted: every one of the 238 `SKILL_IDS` in
`packages/matrix/src/vendor/generated/source-types.ts` resolves to a `src/skills/<id>` directory in
the marketplace checkout, and every directory answers to an id — nothing unaccounted for on either
side. **The 1:1 claim holds; only the number was wrong.**

So the number is gone and the claim stays. Bumping 237 to 238 would have bought nine days: the same
shape as the exhaustive tables that went stale six times over, and the same shape CLI-531 exists to
make mechanical. A verification note carrying a stale count reads as freshly checked while being out
of date, and the claim that matters — that the mapping is total — survives the catalogue growing.

---

## 2026-08-18 — CLI-528: the gate that declined to judge, silently

The from-scratch gate had a hole the same shape as the defect it exists to catch. Its rule for
reading `user-journeys.md` was "a backticked name whose first segment is a spec directory is a spec;
everything else is not", and everything else was **dropped on the floor**. Five specs the page named
without their directory (`init-from-agent-scope`, the three `init-from-scenarios-*`,
`init-from-revalidation`) and one code symbol (journey 17's `skipIf`) were unjudged — on a page whose
whole job is to say what has been proved, and which therefore read as fully checked.

**The reader moved out of the spec into `src/cli/lib/__tests__/helpers/journey-page.ts` with its own
tests**, per CLAUDE.md's rule that a non-trivial parser must never live inline and untested in a test
file. A markdown-table reader is exactly that.

**Classification is now TOTAL, and the two ways a name can fail to be a spec are kept apart because
they mean opposite things.** `init-from-agent-scope` is a real spec the page named without saying
where it lives — a page defect. `skipIf` is a code symbol that never was one. The old reader treated
them identically, which is why neither could be reported.

Two new assertions on the back of that: no spec may be named without the directory it lives in (it
names the rewrite for each), and every non-spec backticked name must appear in
`RECOGNISED_NON_SPEC_NAMES` with the reason it is not one. A new unrecognised name now fails and has
to be justified rather than being skipped.

The hand-maintained `SPEC_DIRECTORIES` list is gone: the reader derives the directories from the spec
tree. That was the second half of the same silence — a spec tree that gained a directory would have
had every row naming it skipped, with nothing to say so.

Both guards moved with the reader and both are tested: it throws when zero rows parse (a page whose
table shape moved otherwise looks exactly like a page with nothing to answer for), and throws when a
name inside a spec directory answers to no file (a row cannot be proved by a gap). The parsing is
pure and the filesystem is one function at the edge, so classification is tested against a
three-element spec list rather than a fixture tree.

Watched fail before it landed — the unlocated-spec assertion went red naming all five with their
rewrites — and both new assertions were mutation-proved afterwards: one prefix taken back off the
page, one unrecognised name added, each reported alone. 16 tests across the two files.

The page itself: journey 13's five bare names prefixed with `commands/`. Marker, surfaces and prose
untouched. Journey 17's `skipIf` left as it stands — it is now explicitly classified rather than
skipped, which was the ask.

---

## 2026-08-18 — CLI-531: the enumeration-drift checker, filed five times in eighteen days, finally built

`scripts/check-enumeration-drift.ts` + 28 tests. A `(source symbol) → (document, section)` registry
that reads the symbol's real membership out of the TypeScript source and the document's claimed
membership out of a named section, and fails when they differ.

**Membership, not the total** — and the repository proved why on the first run. Both
`reference/commands/index.md` and `reference/utilities.md` claimed **32** message builders against
**33** exported. A count-only check says "off by one" and points at nothing. The real defect was
three names: `globallyInstalledKept` named and gone, `globallyInstalledRemoved` and `unplaceableKept`
present and unnamed. The symbol was RENAMED when a project-scope `edit --from` started removing
globally installed entries rather than keeping them, so a document naming it sends the reader
grepping for nothing.

**Not `STEP_TEXT`-shaped, which was the point.** The 2026-08-17 filing was a different document
family entirely, so a `STEP_TEXT`-specific checker would have caught one of five. Six registry rows
across four documents and two source shapes: const-object keys and a module's exported-symbol list,
stated in the documents as both code spans and table-row keys.

`reference/utilities.md` was registered although no filing named it — it writes the same builder list
out a second time with signatures, which is the two-writable-copies condition the bible already
forbids for counts, and it was stale in exactly the same way. Registering only one is how the
`STEP_TEXT` cluster kept recurring: one copy repaired, the other not.

`edit`'s `static flags` was deliberately left unseeded. It carries a computed key
(`[EDIT_PROJECT_SETUP_FLAG]`), so the source side cannot name all three members — and a row that
cannot name a member is a hard failure by design rather than something to work around.

**Every guard throws rather than skips**, because a checker that declines is indistinguishable from
one that passed: missing source file, symbol not exported, symbol enumerating nothing, a member the
reader cannot name (spread or computed key — silently dropping it under-reports by one, which is the
exact shape of all five filings), missing document, absent section opener, absent closer, **opener
appearing twice** (judging one arbitrary half is the same sin as skipping), and a section parsing to
zero members. Each refusal is prefixed with the registry row's claim, so the failure names the row to
repair.

**Failure-proved on the real repository by RENAME rather than by addition**, so both totals stayed
identical at 172 and 33 and only membership moved — the case a totals check passes and this one
catches. All four affected rows reported. Sources restored from byte-backups and verified with `cmp`.

`documentation-bible.md` § "A Count Lives in Exactly One Document" widened from count to membership.

Gate: `vitest.config.ts`'s `unit` project already includes `scripts/**/*.test.ts`, so it runs under
`npm test` and `prepublishOnly` — the same gate `check-findings-frontmatter.ts` sits in. No runner
wrapper: the `check-shared-*` trio has one only because root `deps:check` is a shell chain that
cannot import a TS module, and those are cross-workspace where this is a package-local scan.

The five findings were NOT merged. The repetition across three document families over eighteen days
is the evidence. A sixth is filed for four prose references to the withdrawn name that no registry
row can reach, because none of them claims to enumerate anything.

---

## 2026-08-18 — EDITOR-46: the size the producer already had

`skillIndexEntrySchema` gains a required `bytes` — the sum over a skill directory's blobs of the
sizes GitHub reported in the tree response the crawl was already making. **Zero extra requests**:
`crawl.ts` still issues four fetches, and the diff adds no call site. It and
`apps/editor/src/lib/api/skill-contents.ts` narrow the same endpoint, and the editor's half had kept
`size` all along — the producer had the number and dropped it.

`SKILL_INDEX_KEY` bumped to `skill-index:v2` per the ruling, rather than making the field optional.
The live index was built by the old crawl, so a required field makes `skillIndexSchema.safeParse`
reject it until the daily Action republishes; an optional one would be permanently optional and every
reader would carry the `undefined` branch forever. `skill-index.ts` already documented bumping the
key as the answer. That hazard is now a test: a whole `v1`-shaped index must fail `safeParse`.

**The five over-cap skills are refused where the visitor first meets them**, with the size and the
same phrasing the late refusal uses — one definition, exported as `isPastCarryLimit` /
`carryLimitRefusal`. Disabled rather than merely marked, on three arguments: `resolveStaged` is
all-or-nothing and returns the first failure, so staging four good skills plus `docx` loses all five
to one message naming only `docx`; a mark that does not block spends most of the funnel anyway; and
the index rebuilds daily, so a shrinking skill is wrong for one day with the late refusal still
authoritative. Not silently inert — `aria-disabled`, the reason as readable text, and the stage chip
absent rather than dead. The late refusal stays as the backstop.

A blob GitHub reports no size for counts as nothing, so an unweighable directory sums to **zero** —
published, addable, and still refused by the editor's own listing at confirm. Zero rather than a
third "unknown" state, because zero is exactly what `skill-contents.ts` computes from the same
response, and a producer disagreeing with its own backstop about a weight is worse than either.

**Proved against live GitHub rather than against the fixture**: a real crawl of 57 skills reports
`canvas-design` 5.55 MB, `pptx` 1.14 MB, `docx` 1.13 MB, `xlsx` 1.10 MB, `claude-api` 0.94 MB —
exactly the five the row named and no others, three matching to the digit and two drifted up on new
commits. Then hand-driven through the real dialog against that index: 57 rows listed, 5 refused on
sight, clicking a refused row leaves the footer at 0 staged and clicking an addable one takes it to 1.

Suites: matrix 298, server 47, editor unit 324, editor e2e 297.

**It also caught a spec asserting the wrong thing entirely** — see EDITOR-48. Giving `docx` its honest
weight made an e2e test fail by ADDING a small skill, which is how it came out that the test had been
reaching live GitHub and passing on the size refusal rather than the read failure it names.

---

## 2026-08-18 — EDITOR-45: the restore door names what the read cost

The last open half. The own-config restore door pruned the saved selection against whatever
catalogue was seated and said nothing, while the shared-link door two files away had been naming
every dropped id since EDITOR-16.

`unknownSavedIds(before, after)` joins the `countIds` / `droppedAnything` / `reportPruning` family in
`config-store.ts` and names the same three places `unknownPayloadIds` does. The answer travels in a
module-level `unknownOnLastRead` rather than in store state, and **that is the load-bearing
decision**: every route out of the store is a `set`, `persist` wraps `set`, so reporting the prune
_through_ the store would have written the pruned configuration into the slot as the price of
mentioning it — the exact loss `pruneToCatalog`'s early return exists to refuse. It travels beside
the store as `heldOpen` already does, and the guard is untouched.

**Both of the brief's premises were wrong, and the agent said so.** `onSeated` was assumed not to need
the notice because it restores against the marketplace the configuration was saved against — but
`finishRecovery` routes on `isPublic(target)`, not on whether the target is the PARKED marketplace,
and `nameMarketplace` lets the visitor type anything. Naming a different marketplace that loads calls
`onSeated`, `remember(named, token)` makes it the slot's marketplace, and ids drop there too. Since
`openOwn` gives both endings the same function, putting the report in `finishRestore` covers both with
no branch. And the ordinary no-park path needs it as well: a browser whose `marketplace-store.current`
is `""` seats the public catalogue, nothing parks, and `merge` prunes on the way in.

One thing that path forced: on `/?fromId=<dead id>`, `openShared` sets `refusedNotice` and then calls
`openOwn`. A plain `setNotice` would have deleted that explanation — trading this row's silence for a
different one. `withDropped` composes through the existing `sentences(...)` instead.

Mutation-proved in the direction that matters: making the notice report a count instead of the names
leaves the notice on screen and still fails, so the tests check NAMING rather than existence.
Hand-run in a real browser reading the actual sentences on all five paths, including the composed one.
Editor unit 324, Playwright 297.

**A finding came out of it that is worth more than the row.** The pre-existing spec at `:202` asserted
`toBeHidden()` on the very path the app was logging a six-id loss on — one line apart in the same CI
output. `reportIssue` was carrying the whole weight of "this was noticed" while the sibling door was
telling the visitor.

---

## 2026-08-18 — CLI-530: prose that asserted behaviour the code no longer had

Eight items. Two of them turned out differently from the filing, and both are recorded as found
rather than as filed.

**The `No Orphans` row named less than it claimed and `uninstall` needed no config.**
`listInstalledArtifacts` walks `listSkillDirsWithOurProvenance` (needs `forkedFrom` in
`metadata.yaml`) and `splitAgentsByProvenance(agentsDir).marked` — a hand-authored skill directory or
agent file is named by neither, so the row names what the CLI can prove it wrote. And
`identifiableAgents` falls back to `target.markedAgents` when no config declares any, so both axes
clear without one.

**`checkUnownedInstallation`'s comment contradicted the tip fifteen lines below it, and the TIP was
the correct half** — checked rather than assumed. The same falsehood was in two adjacent field
comments in `content-validator.ts` and went with it.

**The scope-split page described the right elision at the wrong layer.** `splitConfigByScope` assigns
`stack:` unconditionally, because the spread carries the undivided stack and a partition declining
its own key would inherit every row the other earned; `{}` means "derivation yielded nothing". The
elision is one layer later in `generateConfigSource`. A reader looking for `stack: undefined` in the
split will not find it, and the page now says so.

**Two rows in the filing were wrong.** `doctor.ts` had not moved — the path resolves, the orchestrator
guessed the wrong directory. And `skills-and-matrix.md` already said `loadAndMergeSkillsMatrix` has no
production callers; what was actually missing was any mention of `loadMarketplaceMatrix`. Documented
as dead rather than dropped, because the symbol is still exported through the barrel so a reader finds
it either way — dropping the entry deletes the only sentence telling them not to use it, which is the
under-reporting failure `check-enumeration-drift.ts` exists to catch.

**The renamed-builder inversion reached far past the four lines that were visible.**
`KeptFromRoundTrip` now has two fields where the docs quoted three; `reconcileSharedConfig` takes
`unplaceable` and no `authority` word; the confirm prop is `statements`, not `kept`; there are two
plans chosen by `isHomeDirectory`; and `withKeptEntries` no longer fixes up `selectedAgents`. Four
tables and a quoted type block were rebuilt rather than renamed, and `edit.md` now states outright
that a global entry IS removed from a project. Both documents say the opposite of what they said this
morning, which is the point. Nothing outside `agent-findings/` names `globallyInstalledKept`.

**The prettier failure was a class held by luck.** Root config is `semi: false`, `packages/cli` is
`semi: true`, and a finding quoting `apps/editor` code under `packages/cli/.ai-docs/` gets semicolons
added to a quotation — making it no longer match the file it cites. 35 findings reference
`apps/editor`; only one fails today because the rest paraphrase or happen to quote semicolon-terminated
code. Fixed with `<!-- prettier-ignore -->` and filed. Two mechanical gotchas recorded: the directive
must be exactly that string (a trailing explanation silently disables it) and no blank line may
separate it from the fence.

"Never let a gate filter its own subject" is now written into `standards/e2e/anti-patterns.md` §
Weak Assertions, beneath the `fileExists` rule and stating the relationship between them — one skips
an assertion, the other skips the subject.

`DOCUMENTATION_MAP.md` deliberately not touched and no `last_validated` bumped: these were partial
passes, and the map's own rule is that a partial pass leaves the document alone.

---

## 2026-08-18 — CLI-527: journey 7's arc actually run, and journey 9 closed with it

`e2e/lifecycle/edit-global-propagates-to-every-registered-project.e2e.test.ts` — four real binary runs
against empty trees. `InitWizard.launchInGlobal` installs the global scope, two empty projects
register against it through the dashboard, then `EditWizard.launchInGlobal` deselects the global
`web-developer`. No `buildProjectConfig`, no `writeProjectConfig`, no `ProjectBuilder`.
`expectFourSurfaces` at the global home and at BOTH projects with `{ globalHome }` — never
`os.homedir()`.

**Two registered projects rather than one is the load-bearing choice.** One project cannot separate a
fan-out that visits every entry of `projects[]` from one that stops after the first. Every surface is
compared across both with a single `toStrictEqual` over the whole collection, and each departure is
asserted BEFORE the edit as well, so no negative can hold for a project that never carried the
sub-agent.

**The first run was red, and the product was right and the expectation wrong.** The assertion wanted
"Recompiled agents in 2 registered projects"; the run said `0 registered projects, 2 unchanged`. The
leading number counts projects REWRITTEN, not reached — a project visited and left byte-identical
lands in `unchanged`, and both had been reached. The assertion was corrected to pin the whole
partition, which is narrower than what it replaced rather than broader.

**Mutation-proved by `break`** in `propagateGlobalChangesToProjects`: four assertions red, the
bystander ones unambiguous — the second project's `config-types.ts` came back `[false, true]`, still
carrying its pre-edit file. Reverted, rebuilt, byte-compared against the backup. The docs half was
proved too: removing the spec name from rows 7 and 9 makes the from-scratch gate condemn both, so
the markers are earned by the specs rather than asserted by hand.

**Journey 9 closed as well** — `e2e/lifecycle/edit-curates-a-freshly-installed-stack.e2e.test.ts`. The
stack is picked at a real `init`'s stack step and one `edit` does both halves: deselects the stack's
own `web-testing` pick and selects the fixture's spare in the SAME category, which makes the surviving
stack entry the discriminating surface. Surface 4 asserted, which the row also owed. It passed first
time, so it was mutation-checked rather than trusted: resurrecting the pre-edit stack took three
assertions red, `expectFourSurfaces` catching the dangling reference independently.

**Rows 22 and 31 left exactly as they stand, and the reasoning is the point.** Row 22 is reachable in
principle but not ADDITIVELY: its proof mechanism is the fixture's request log — exactly one HEAD and
no GET per run — and an install phase warms the cache with its own traffic, forcing every request-log
assertion to be re-derived. That is a redesign of the only spec holding revalidation, not a new run.
Row 31 has a legal from-scratch entry through `runInitFrom`, but the apply-that-removes-nothing
payload was not verified end to end, and a row is not marked on an unverified route.

A finding came with it: the fan-out summary's leading number counts rewrites rather than projects
reached, and both `PROPAGATED_RECOMPILE_ONE`'s value and its comment invite the misreading. The
dangerous direction is not the one that bit us — a spec asserting only the leading count cannot
separate "reached two, rewrote neither" from "reached one, rewrote it".

---

## 2026-08-18 — CLI-533: a documented gap that had been filled a day earlier

**Owner ruling: the refusal is correct and intended; the documentation was wrong.**

`edit --from` carries **three** refusals, not two — both flags at once, no terminal, and the
`$HOME` location refusal it inherits. `refuseProjectScopedContentAtHome` is one `protected` method on
`BaseCommand` with no override, and its own doc comment says why: _"Shared by `init --from` and
`edit --from` … an invariant enforced on one producer and not the other is enforced nowhere."_

**The same false claim was in five documents, not one.** `seed-contract.md`'s comparison table and its
Known Limitations, `scope-system.md`'s enforcement table, `commands/edit.md`'s flow step and exit-code
row, and the message-builder attribution in `utilities.md` and `commands/index.md`. All repaired.

**The worst of them invited someone to build what already exists.** `scope-system.md` called the
absence _"a gap rather than a rule"_. A reader acting on that would have implemented a refusal that
had been shared onto `BaseCommand` the day before.

The `run()` ordering paragraph turned out NOT to be wrong, and was not rewritten. The sequence already
named `producer`, and the refusal is a step of the producer rather than of `run()` — so it was hidden
inside a named step rather than missing from the order. The step was made honest
(`producer (decode → home-scope refusal)`) with a note on why it can be asked no earlier: it reads
the decoded selection, so the first possible moment is straight after `decodeSeedOrFail`, which is
exactly where `init --from` asks it.

One true limitation replaced the false one: the refusal is specced only through
`init-from-home-scope.e2e.test.ts`. `edit --from` reaches it by inheritance with **no spec of its
own** — verified against both its e2e and unit files.

**The finding is the durable part, and it names a limit of the checker built hours earlier.** A
document asserting an ABSENCE owns the one claim no source-derived checker can falsify.
`check-enumeration-drift.ts` judges membership, and filling a gap moves no name: `edit.tsx` gained no
import, because it inherits a protected method, so grepping for the symbol returns identical hits
before and after. Proposed rule — filling a gap includes grepping `.ai-docs/` for the gap's own
vocabulary (`declares no`, `no equivalent`, `is absent`, `is a gap`, `untested`), and an absence
should be written so it dates itself: _"no spec exercises it"_ is re-derivable, _"it declares none"_
can only be trusted.

---

## 2026-08-18 — the documentation was re-derived from source on the assumption that all of it was wrong

Seven parallel passes over **51 reference and standards documents**, each told that every claim on its
pages was false until re-derived and that functionality existed which no page documented. The premise
paid off repeatedly.

**A live command was documented as deleted.** `reference/commands/index.md` stated that
`new marketplace` "no longer parses" and that its directory does not exist. It runs, `--help` exits 0,
and it was absent from every table on the page — so nothing contradicted the callout.

**Nine symbols named across the config pages do not exist**, including `ProjectConfig.source` and
`SkillConfig.source`, which the loader **actively refuses by name** with a rename message. Five of the
nine had been named by a finding filed the day before, whose Proposed Standard pointed at that exact
document. Nobody acted on it — _a finding is a note, not a check_.

**A rename hid behind its own live twin.** `SkillConfig.source` → `origin` drifted through seven
documents because `SkillReference.source` and `Skill.source` are genuinely still named that, so a grep
returned live and dead hits indistinguishably.

**Two writable copies of the E2E rules had already contradicted each other** on spacebar over a
dual-scope row — an author reading the wrong one writes the wrong keystroke. `e2e-testing-bible.md`
was a superseded monolith (`anti-patterns.md` calls it "the original"); it is now a twelve-row pointer
with four inbound references repointed.

**A document would have broken five correct ones**: `model-and-effort.md` carried a "Known drift in
other docs" section whose eight rows had all been repaired — a dead defect list formatted identically
to a live one.

Also found: two entire undocumented modules, `RemovalPlanConfirm` on no page, four of six wizard
screens with no key bindings written down, all five `(N lines)` annotations stale, and a page object
for a search modal the wizard does not have (`BuildStep.openSearch()` presses `/`; nothing binds it).

**Two user-facing product defects fell out** and are CLI-534: `compile` refuses with _"Add skills with
`agents-inc add <skill>`"_ — there is no `add` command, it exits 127 — and `eject --output` documents
`.claude/` while the code uses `.claude-src/`.

---

## 2026-08-18 — two rules written into the bible, and the map re-derived

**"An Absence Names No Symbol"** (owner-approved). A document asserting an absence is the one claim no
source-derived checker can falsify: `check-enumeration-drift.ts` compares lists of names, and a
sentence saying "there is no X here" contains none. Proved live — a refusal moved onto `BaseCommand`,
`edit.tsx` gained **no import** because it inherits a protected method, so a grep returned identical
hits before and after, and five documents described the vanished gap for a day. The worst called it
"a gap rather than a rule", inviting someone to build what already worked. The rule has two halves:
grep the docs for the _vocabulary of absence_ when filling a gap, and phrase absences so they date
themselves — _"no spec exercises it"_ is re-derivable, _"it declares none"_ can only be trusted.

**Rule 3 tightened to "No task IDs, live or dead."** Its reasoning had been about dead IDs only, and
the Self-Correction Trigger read conditionally, so an agent was asked to arbitrate it. The evidence
settled it: `D-266` is a live open row whose ID appears in **no file** under `src/`, `e2e/` or
`scripts/` — nothing to grep — and `D-278` was renumbered after a collision, so one ID names two rows
and a JSDoc still cites the dangling one. A **third** site carrying the conditional reading was found
in the anti-pattern table and corrected in the same pass.

`DOCUMENTATION_MAP.md` re-derived: every coverage count wrong (`src/cli/` 380 files / 151 specs,
`e2e/` 266 / 223), a Covers cell claiming "feature-flag gating" that exists nowhere, and
`type-system.md` filed as a pointer while actually **owning** five union counts and the `AGENT_NAMES`
roster that nine documents cite it for.

**`check-enumeration-drift.ts` grew from 6 rows to 51**, every one proved able to fail by _rename_
rather than addition — the case where both totals stay identical and only membership moves.

---

## 2026-08-18 — the findings corpus was graded, re-audited and pruned

**382 findings read in full and graded**, then re-audited against a stricter bar with every proposed
change handed to an independent agent instructed to refute it. Result: **190 STRONG, 126 SOLID, 10
THIN, 53 STALE, 3 WRONG.**

**Seven findings prescribe an action current source contradicts**, and one had already done damage —
`edit.md` and `scope-system.md` carry an "Inherited global" kept-reason whose predicate exists nowhere
in `src/` and contradicts the same file eighty lines up, written _from_ an approved finding. Four
would overwrite a correct document with its inverse; three would reverse a deliberate ruling.

**The 66 THIN, STALE and WRONG findings were deleted** (owner instruction), leaving 316. All were
backed up first — seven were untracked and git could not have restored them.

**That deletion left 64 dangling citations across 39 files, and the link-integrity scan would have
caught one of them** — the single `supersedes:` key. 51 were body prose, 11 `affected_files:`, 2
`partial_note:`. All repaired: most citations were load-bearing, so the fact was written into the
citing sentence rather than unlinked, and **three citing sentences turned out to be false themselves**.
21 names from an _earlier_ batch deletion were found still dangling — this had happened before and
nobody noticed. CLI-544 carries the fix.

The graded ledger is `packages/cli/.ai-docs/agent-findings/INDEX.md`.

---

## 2026-08-18 — the accuracy worklist

All 316 surviving findings filtered to what is **wrong right now** or is a **mechanical consistency
win**, each verified against source (7 doc passes had already fixed many) and every "this doc is
wrong" claim adversarially re-checked. 139 passed, 3 refuted. Merged into 8 documentation groups and
20 mechanical ones in [`plans/accuracy-worklist.md`](./plans/accuracy-worklist.md), with a single
ordered sequence and honest effort estimates: **30–43 hours total, of which steps 1–8 are 8–10 hours
and carry most of the value.**

The two entries that matter most are recorded here because they outlive the plan:

- **Following the documentation produces a rejected config.** `SkillConfig.source` → `origin` never
  reached five reference pages, and `schemas.ts` refuses the documented field by name.
- **Fifteen `identity.md` files still open "be comprehensive and thorough"** — a mandate removed from
  both of its sources, with `prompt-bible.md` now stating the opposite. It is the instruction that
  makes every agent in this repository over-produce.

---

## 2026-08-18 — CLI-543 retired unbuilt: its subject was deleted before it was started

The row asked for the 53 stale finding statuses to be corrected — files reading `status: open` or
"Fix Applied: None" for fixes that had shipped. The owner then pruned every THIN, STALE and WRONG
finding, so all 53 are gone and there is nothing left to re-status.

**The mechanism it was sequenced behind still matters and stays open as CLI-541**: `TEMPLATE.md`
defines a lifecycle pairing (`resolved` needs `resolved_by`) that nothing enforces, and that is what
let the statuses go stale in the first place. Landing it now guards the 316 that survive rather than
the 53 that did not.

---

## 2026-08-19 — EDITOR-49: every custom-marketplace id the editor minted was uninstallable

Found by hand-running journey 27 end to end — real editor, real browser, real worker, real binary —
during the accuracy programme's Phase B. The add-marketplace dialog asked for `owner/repo`, stored it
verbatim, and minted it; the CLI reads a prefix-less ref as a **local path**, so `init --from <id>`
died with `Local marketplace not found: '<cwd>/acme/private-skills'` — **and the refusal recommended
`--marketplace github:…`, the exact form the editor's own field told the user not to type.**

**The contract reading was verified rather than assumed**, and the decisive evidence is the CLI's own
spec: `isLocalSource("my-skills")` is pinned `true` under _"should accept valid local paths"_. So
widening the CLI would redefine `my-skills/team`, a legal relative directory — the editor was minting
the wrong thing and the CLI was correct.

**Normalised at the three doors a ref ARRIVES through, not at the mint** — what a visitor types, an
arriving payload, and the stored slot — because mint-only normalisation leaves the storage key
ambiguous, which was the second consequence: naming one repository both ways left two slot entries and
**two copies of the PAT**, and the switcher offered to switch to the repository it was already on.

**The migration nearly ate the credentials.** Without a shape guard a v1 keyed slot would have fallen
to the single-slot parse and been discarded, marketplaces and PATs together. `PERSIST_VERSION` 1 → 2
so the re-keyed result is written back immediately rather than leaving an orphaned token in
`localStorage`. Proved in a browser: a v1 slot seeded, reloaded, and the **private** catalogue loads —
which only happens if the PAT came through.

**Why neither suite could see it:** each built payloads from a different _legal_ form —
`MARKETPLACE_REF = "acme/skills"` in the editor, an absolute directory in the CLI — and neither tested
the form that crosses. The two forms are now two named fixtures written out rather than derived, _so
the assertion is not the app agreeing with itself._

Journey 27's row no longer claims the form is right or that the CLI half proves it. The rule written
beside the counterpart-leg definition: **a payload field's FORM is part of the contract, and a
counterpart leg proves nothing about it unless the two suites carry the same value.**

Playwright 302 (297 baseline + 5), editor unit 341, tsc and eslint clean.

- **CLI-539** — the ten findings blocked on unwritten standards are fully discharged (2026-08-19). Nine landed as rules during the accuracy programme; the tenth's subject no longer exists — its snapshot procedure governed `findings-impact-report.md`, which `INDEX.md` replaced by refusing to write a count at all, so there is no longer a count that can go stale. The one live concern the row surfaced late — a census that AUTHORISES a batch of actions going stale mid-pass, which happened during the deletion batch itself — is written into the deletion protocol as a re-derive rule.

- **CLI-545 — the accuracy programme, complete 2026-08-19.** Three phases. **A:** D1–D8 and M1–M20 from the worklist, across sixteen briefs — every one of the sixteen executing agents corrected something in its own brief, which is the most useful measurement the programme produced. **B:** all 39 user journeys walked by hand (36 through the CLI harness, 2 in the browser, 1 closed by construction), finding two shipped defects that 6,777 unit, 810 e2e and 297 Playwright tests were all blind to — a `share` → `init --from` round trip producing an identical config but a different compiled agent, and every editor-minted custom-marketplace id being uninstallable (EDITOR-49). Both were invisible for the same reason: each suite built both ends of its comparison with the same producer. **C:** 294 findings triaged with 33 classifications refuted on re-check; fixes landed in seven groups; **all 131 DELETE findings removed** with their INDEX rows kept as the record; the rest parked as CLI-554 (51 features), EDITOR-50 (7) and CLI-555 (15 rulings). Final gates, whole monorepo: CLI unit 6,791 · CLI e2e 811 · scripts 160 · editor unit 340 · Playwright 304 · server 47 · ui 63 · matrix 298 — typecheck, eslint and prettier clean in all seven workspaces, and all three generator `:check` variants byte-identical.

- **The guards-are-not-features round, 2026-08-19.** The owner ruled that a new test, lint rule, checker, fixture capability or written standard is **not** a new feature, which returned **54 of 58 parked findings** to scope — 32 written rules, 14 test guards, 6 checker capabilities, and 2 real bugs that had been mis-parked. Eleven agents in two waves, plus five follow-ups. **Nine live defects were found and fixed along the way, none of them known when the round began**: a manual mock declaring 11 of 13 exports behind 11 specs that mock it; four harness environment leaks (the PTY runner never cleared `CC_MARKETPLACE`, and neither runner cleared `AGENTS_INC_API_URL`, `XDG_CACHE_HOME` or `GIGET_AUTH`); four more editor specs reaching live network, found by the guard the fifth one motivated; three no-op writes to persisted storage; a silent discard of a slot holding a PAT shown once; a marketplace written with no plugins; a skill copy aborting the whole run on one `ENOENT`; an empty `version` producing a manifest the CLI writes and then refuses to read; and **three sites joining a zod issue path over records keyed by a private marketplace's own ids** — routed, via Sentry's `tunnel`, through the very worker the catalogue fetch avoids on purpose. New capability: directory-membership enumeration, partitioned-table reading, command-roster binding, a fourth package-local checker, two frontmatter scans, a citation checker over `todo/`, and five new gates. The enumeration registry went **6 rows → 62 (re-measured 2026-08-19 by reading `REGISTRY.length` at runtime and corroborated by `grep -c '^    claim:'`; the 79 recorded here was wrong against both the working tree and HEAD, which holds 51)**. Final: CLI unit **6,929**, e2e **835**, scripts **229**, editor **354**, Playwright **304**, matrix 298, ui 63, server 47 — typecheck, eslint and prettier clean in all seven workspaces.

- **CLI-548** — `build marketplace` no longer writes a manifest its own loader refuses (2026-08-19). `noPluginsToPublish` guards the scan before `writeMarketplace`, beside the `owner.name` guard. **Four E2E runs were pinning the defect, not three**: only one had the zero-plugin success as its subject and became the refusal; the other three were asserting real things — `--output` honoured, the name read from `package.json`, object-form `author` parsed — and each was given a plugin rather than weakened. An empty `version` was found to be the same class and guarded in the same pass.
- **EDITOR-48** — the editor's Playwright suite now refuses the network by default (2026-08-19). The `page` fixture routes the worker and both GitHub origins, aborts, records, and asserts the recorded list empty at teardown. **Installing it found four more live instances the same day** — two in `install-dialog.spec.ts`, two in `skill-contents.spec.ts`, all reaching the config mint unstubbed and all green. The mechanism the original finding missed is the sibling describe: one block stubs the mint and its neighbour does not, and the neighbour's tests open the same dialog for a different reason, so nothing in them reads as a network test.

- **CLI-362 — closed by ruling, not by a fix (2026-08-19).** A newly-toggled sub-agent is added with `scope: "global"`, and `isScopePairCompatible` refuses a project-scoped skill to a global agent, so in a project-scoped install the new agent lands with an empty stack. The finding behind the row prescribed that new agents inherit the install's dominant PROJECT scope. **The owner rejected that: global is the correct default and an empty stack is the correct outcome**, consistent with the CLI-442 ruling that a fresh pick in a project edit defaults to global. The finding is graded WRONG in `INDEX.md` — acting on it would have introduced a defect — and deleted. `init` and `edit` already warn per skill, naming the skill that reached no agent and the agents whose scope blocked it.

- **CLI-558 — closed by ruling, no change needed (2026-08-19).** The row asked whether 59 `D-<single digit>` phase labels across six E2E files (`// D-1:` … `// D-7:` inside "Phase D: Assertions" blocks) should keep their prefix, since nothing distinguishes them from ticket ids to a grep. The owner ruled that tracker ids carry a shortened workspace word — `CLI`, `EDITOR`, `WWW`, `SERVER`, `REPO`, `SKILLS` — which makes the labels unambiguous **once `D-` stops being a ticket namespace**. It has not yet: 35 `D-NNN` rows are still live and 166 references sit in source. So the labels need no rename and the real work is the prefix migration, filed as **CLI-574**. Recorded because the row was briefly rewritten in place into that migration before being split back out — an id silently changing what it means is the defect the migration exists to retire.

- **CLI-577 — retracted the day it was filed (2026-08-19), because it was wrong.** It claimed no spec covers a sub-agent moving G→P as a genuine departure, on a report that every G→P case under `e2e/lifecycle/` starts from a persisted `[P][G]` pair. **`scope-toggle-combined.e2e.test.ts` toggles `web-developer` G→P in both its tests, and `web-developer` is global-only in `setupDualScopeWithEject`** — the fixture sends `api-developer` to project scope, not `web-developer`, and the spec's own comment says so. The framing was also wrong underneath the fact: **G→P is additive for a sub-agent**, so that direction has no departure to test, and the asymmetry is precisely what gives the P→G direction something to enforce. Row 16 now names both specs. Recorded because the row was filed on a second-hand claim without checking the spec it denied, which is the failure the accuracy programme exists to remove.

- **CLI-550 — the vendored schema rename, landed 2026-08-19.** `packages/matrix/src/schema.ts` → `built-in-matrix.ts`, `MatrixSchema` → `builtInMatrixSchema`, `ParsedMatrix` → `BuiltInMatrix`, with `./schema` replaced by `./built-in-matrix` in the package's `exports` map. The wire schema kept its unqualified names deliberately: the general name belongs to the general shape, and the vendored one is now anchored to `BUILT_IN_MATRIX`, the single constant it validates. **"Catalog" was ruled out** because `read-model/catalog.ts` already owns it as the model built FROM a matrix. The agent died mid-run on a connection error, having finished the code and reached the documentation — the tree still compiled, every suite passed, and the doc residue was two files, one a dated record. **Recorded also as a process miss**: the row sat `Ready for Dev` with the roadmap still sequencing it as "must not be interleaved" until a verifier noticed, which is step 6 skipped on the session's own work.

- **CLI-585 — the drift checker learned to read a table's values, landed 2026-08-19.** `check-enumeration-drift.ts` gained `table-pairs`, which emits `key = value` strings on both sides so the existing `string[]` comparison works unchanged and a SWAP is detectable — a values-only set could not catch one. Readers `valueOf` / `keyOf` / `pairOf` / `columnIndexOf`, with three named refusals (`UNREADABLE_VALUE`, `NO_COLUMN`, `AMBIGUOUS_COLUMN`) rather than a silent skip. Proved on the defect that raised the row: `E2E_SKILL_TITLES` in `reference/testing/e2e-infrastructure.md` had five wrong Display-title cells while the old key-only binding reported `agrees, clean: true`; the five values were corrected and the table registered. Follow-on survey of six further tables is CLI-588.

- **CLI-586 — a guard that the wizard frame fits the terminal, landed 2026-08-19, and it found a real defect the same hour.** `TerminalSession` gained `linesAboveViewport()`, and `BaseStep.waitForWizardFooter()` now asserts the painted wizard screen is wholly visible — so every interactive spec inherits the check at every keypress rather than one spec carrying it. The first invariant drafted for it was structurally blind (a _baseline_ on `viewportY` absorbs a constant overflow into the baseline); proved by mutation — `height={terminalHeight + 4}` left the baseline form green across all 13 tests and reddened the absolute form, which is the form that shipped. The guard immediately reddened nine specs across five files, all losing the same three lines: `absentFromSourceWarning` was raised from `resolveSkillForPopulation` **after** `drainBuffer()` had closed the startup band, so it went to stderr onto a cleared terminal and the next frame — exactly `terminalHeight` tall by construction — pushed it off the top. Height-independent: one failing spec runs at 60 rows and still lost exactly three lines. Reported by the owner from a real `init` run; my own probe across nine terminal sizes had missed it, because a fresh install has no skill that can be absent from the source. Fixed at the window rather than at the call — `run-wizard-session.tsx` now runs `hydrateWizardStore` inside a buffering window (`hydrateIntoStartupBand`, with a load-bearing `finally`, since buffer mode is process-wide) and concatenates the drained messages onto the load's own, so both `warn()` arms in that function and both `init` and `edit` are covered by construction. E2E back to 842 passed / 0 failed with the guard active and untouched.

- **CLI-565 — a document can now bind a module's re-export surface, landed 2026-08-19.** `check-enumeration-drift.ts` gained `reexports: "every-name"`, reading both forms the row said were unreachable: the re-exports carrying a `moduleSpecifier` and those in a bare `export { … }` block. The design question the row demanded a ruling on is ruled and written into the reader's own doc comment — a locally-imported-then-re-exported name resolves to **the export clause's own spelling, with nothing followed**. Two refusals rather than a silent skip: `WHOLE_MODULE_REEXPORT` and `REEXPORTS_A_DECLARATION`. All three `e2e/helpers/test-utils.ts` tables are registered and agree — constants, functions, and the re-export table at the exact 31 members the row named. **Verified independently 2026-08-19 by an agent that was not allowed to fix anything**, which also corrected the claim that first reported it: `reexports: "every-name"` binds exactly one registry row, and it is this one — the three barrel tables in CLI-535 are bound by the _directory_ reader instead, and that is the correct choice, because binding `factories/index.ts` through the barrel surface against its real table drifts 8 named-but-absent and 1 present-but-unnamed. **Not closed by this row**: the 2-declared-types table in `reference/testing/e2e-infrastructure.md` remains unbound, and the document itself argues against building a fifth reader for it. Say so out loud rather than leave it implied.

- **CLI-535 — four of its five gaps closed 2026-08-19; the row survives narrowed to the fifth.** Landed: the command roster as a filesystem walk (`directory` + `enumerates: "command-ids"`, agreeing over 13 members, which is the gap that had let a live command be documented as deleted); `unwrap()` reading through `satisfies` (one line, `ts.isSatisfiesExpression`, and it is load-bearing for three registry rows — proved by applying HEAD's `unwrap` and the working tree's to the same sources, where HEAD yields `SatisfiesExpression` and the tree yields the array literal underneath); the multi-table split (`partitioned-tables`, agreeing over the 34-schema partition the row named); and the three barrel tables, bound through the directory reader rather than through a barrel read — `exportedNames` still does not follow `export … from`, so the row's literal sentence stays true while the lists it blocked are all bound. One caveat recorded rather than buried: `SKILL_IDS` and `SKILL_SLUGS` are readable now but are still not registry rows, because no document enumerates their members — a documentation-side reason the checker cannot fix. Still open as CLI-535: `static` class members, so no command's flag list is registerable.

- **2026-08-20 — CLI-595** (cli.md, new, found while investigating a red CI run) — `focusSkill`
  looks at the screen before it presses, and confirms every Tab against the frame before the next
  one. The old walk pressed first and read after, inside a 50-press budget: against the default
  catalogue's 33-category web grid, a target in category 1 — the one focused on entry — cost a full
  lap to return to, and a repaint observed late let the walk pass its own target unseen, needing a
  second lap the budget could not fund. That is CI run 32338714325, where
  `edit-wizard-navigation.e2e.test.ts > should toggle focused skill scope with S key` lost both
  attempts; the arithmetic is exact, 50 presses from category 1 landing on category 18, which is the
  `Error Handling` header highlighted in the failure dump. **Not reproducible locally** across the
  test solo ×5, `CI=true`, Node 22 to match the runner's pin, the full 229-file suite pinned to the
  runner's 4 cores, the same under 8 CPU hogs, and `e2e/interactive` pinned to 2 — all green; a
  re-run of the same commit (32347127769) passed with that test still losing its first attempt, so
  `retry: 1` had been absorbing roughly a 3-in-4 failure rate. The walk now ends on having observed
  a category twice — a real lap, each category looked at once — and raises `CategoryWalkError`
  carrying what it walked, so a miss reads as a fact rather than a press count. `MAX_FOCUS_ATTEMPTS`
  is deleted; it was never the mechanism, only the thing that ran out. Pinned by
  `e2e/interactive/build-step-focus-walk-cost.e2e.test.ts`, which asserts what the helper SPENDS —
  the observable that did not exist, and the reason every existing focus assertion was blind to
  this. Finding: `.ai-docs/agent-findings/2026-08-20-focus-walk-presses-before-it-looks.md`.
  **Ruling half closed 2026-08-20 (owner):** the two proposed rules are adopted and written —
  `standards/e2e/page-objects.md` carries observe-before-press and lap-termination as the
  algorithm's two load-bearing properties, and `standards/e2e/anti-patterns.md` gained the
  press-budget anti-pattern (a walk length tuned to the catalogue size on the day it was
  written). The owner confirmed both halves were already implemented rather than pending, which
  is why this row closed on verification rather than on new work: `walkToCategoryContaining`
  terminates on a repeated category via a `walked` set, and `MAX_FOCUS_ATTEMPTS` survives only
  in the gitignored `e2e/helpers/handrun.gen.mjs` bundle, which regenerates away.

- **2026-08-20 — CLI-590** (cli.md, filed 2026-08-18) — the task-ID ban's scope, settled in two
  halves and closed on the owner's ruling for both. **Half one, landed:** `agent-suggestions/` is
  exempt consistently with `agent-findings/` — `documentation-bible.md` rule 3 now names both
  directories in its exemption clause and its census grep carries `--exclude-dir=agent-suggestions`.
  The earlier pass had been right to refuse to add the grep exclusion on its own, on the grounds
  that widening an exemption through a command rather than a ruling is worse than leaving the
  question visible; with the ruling in hand both halves landed together. **Half two, closed without
  work (owner, 2026-08-20):** whether ID-bearing SECTION HEADINGS are in scope — the question that
  drags in-repo anchor links with it, since a heading is also a link target. Ruled not worth
  pursuing: the surviving ids are namespaced enough to read as names rather than as noise, and they
  remain traceable to the changelogs. The live instances stay as they are, deliberately —
  `reference/config/scope-split.md`'s `## The D-220 Delta Pipeline` and the `D-220`/`D-223`
  frontmatter keywords beside it. Note the census greps still return non-empty after the exemption
  (195 source lines, 53 doc lines), so rule 3's "neither returns empty" remains true; that backlog
  is CLI-547 and is untouched by this.

- **2026-08-20 — CLI-538** (cli.md, filed 2026-08-18) — `splitConfigByScope`'s doc comment claimed the
  project partition CLEARS `selectedDomains`; the code has always copied it onto both. **Owner ruled
  the CODE right: a project owns its own domain selection rather than inheriting the global one.** So
  the comment was the defect, not a missing implementation. Three things went: the doc comment's
  claim, the inline "Project config inherits domains from global at runtime, so it gets none", and the
  global literal's conditional re-set — a no-op over its own spread that only read as meaningful
  because the comment asserted a clearing. **The field had ZERO test coverage**, which is exactly why
  the contradiction survived: both project writers recompute it before writing, so no emitted config
  could tell the two stories apart. A test now pins it on BOTH partitions, verified non-vacuous by
  mutation (clearing the project half reddens it with its own message). Documentation followed in
  `reference/config/scope-split.md` — whose table had described the vanished conditional as live, so
  it was factually wrong rather than merely stale — and in `reference/features/configuration.md`,
  which said the field survived "despite the function's own doc comment", false once the comment was
  fixed. Same decision as `plans/open-rulings-2026-08-19.md` § 3, which is this question from the
  other side.

- **2026-08-21 — CLI-601** (cli.md, filed and closed within a day) — the dual-scope contention flake,
  closed on the owner's ruling that recovering from a swallowed keypress is a good enough answer.
  **What actually fixed it:** `selectSkill` in `e2e/pages/steps/build-step.ts` now confirms the press
  landed by re-reading the cell's whole rendered text, and re-presses if it did not — the same
  closed-loop shape `advanceCategoryFocus` (Tab) and `retryEnterUntil` (Enter) already used, applied
  to the one key that had never had it. Space was the only key pressed without confirmation, and
  `use-category-grid-input.ts`'s comment names the space press as the one the race swallows. Full E2E
  ran three times identically afterwards, 0 failed.
  **Three candidates were closed off before that one was found**, and the reasoning is the part worth
  keeping: an `inputReady` footer sentinel was REJECTED (it would assert the wizard ROOT's handler is
  live while the race is in the STEP — a signal claiming what it cannot know); the userland
  stable-handler-ref sweep was ruled and executed to ZERO changes, because Ink 7 routes `useInput`
  through React 19's `useEffectEvent` and drops the handler from the registration effect's deps, so
  the pattern is supplied upstream (verified against `node_modules/ink/build/hooks/use-input.js`); and
  a fixed sleep was rejected as calibrated to the machine that writes it, which is this bug's exact
  signature. A probe also established that **no handler-identity fix could have worked**: a remount
  builds a new instance, so its refs are new too and the effect must still flush — the outgoing
  child's handler runs.
  **Closed as recovery rather than prevention, knowingly.** A keypress can still be swallowed; the
  harness notices and presses again. No user-facing behaviour was ever involved — this was test
  reliability throughout. Reopen only if the flake returns on CI.
  **`toggleFocusedSkill()` was deliberately left open-loop** and that is documented at the method: it
  cannot name its subject, and more decisively, specs press Space there precisely to assert a
  global-locked row is INERT, so "nothing moved" is a correct outcome as often as it is a lost
  keystroke and no observable separates them. `CLI-609` carries the two remaining closeable presses.

- **2026-08-21 — CLI-474 and CLI-472** (cli.md) — both closed by MEASUREMENT after the owner pointed
  out the premise was wrong: **there are no changes in the skills repo awaiting publication**, so
  "waiting on marketplace publish" was never going to resolve them. Measured instead: all **102**
  categories in `/home/vince/dev/skills` are accepted by the CLI's generated enum — every one checked
  individually, zero missing. `api-database` is present (252 occurrences, `api-database-drizzle` and
  `api-database-prisma` among them), so the 17 skills whose category the CLI once rejected are fine;
  `api-framework` is absent from BOTH sides, which is the taxonomy split landing rather than a gap.
  `meta-reviewing-infra-reviewing` exists in the marketplace and in the generated matrix. **The fixes
  arrived from the CLI side while the rows were parked waiting on the other side** — which is the
  lesson: a row whose status names an external event nobody scheduled will sit until someone
  re-measures it. CLI-472's recorded ruling still stands and is not affected: `eject` KEEPS hard-failing
  on an unreachable catalog skill; no skip-with-warning.

- **2026-08-21 — D-266** (cli.md) — the scroll-gate cliff, closed on the owner's ruling after a
  re-check they asked for. **The cause is still in the code** — `useRowScroll`/`useSectionScroll`
  disable clipping when the viewport falls below `SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS` (5) — but every
  route to it is closed and the height requirement is now explicit. Verified: the ASCII logo renders
  **only** on the stack step (`wizard-layout.tsx`: `shouldRenderLogo = !!logo && store.step === "stack"
&& terminalHasRoomForLogo`), so the owner is right that it never appears on the build step, and it is
  hidden entirely below `LOGO_MIN_TERMINAL_ROWS` (26). The build step is the binding constraint because
  it is the tallest, and `MIN_TERMINAL_SIZE.ROWS = 20` is measured against it, not guessed — 15/16/17
  corrupt, 18 the first clean render and the hard correctness floor (where `MIN_VIEWPORT_ROWS` starts
  being satisfied), 20 chosen for two rows of margin while staying under the common 24-row default.
  `BaseCommand.ensureTerminalSize()` and a `WizardLayout` guard both read it, so a terminal below the
  floor gets a resize prompt rather than a shredded frame — including on a mid-session resize.

- **2026-08-21 — D-212** (cli.md) — custom-skill lifecycle, retired as MOOT rather than completed. The
  install-pipeline half landed 2026-08-17 with CLI-407/408/409 and the journey works end to end: a
  hand-written custom skill installs through `edit` in 3.6s where it previously hung 68s and then
  aborted with marketplace advice impossible for a locally-created skill. Every leftover item — the
  misleading closing message, the `--install` flag, `cc list`'s "scaffolded but unconfigured" section —
  named `src/cli/commands/new/skill.ts`, **deleted in `95738763`**. Retired on the owner's ruling rather
  than carried: anything still wanted from it belongs to the editor intake (leg 2's EDITOR rows), which
  is where custom-skill authoring now lives.

- **2026-08-21 — CLI-363** (cli.md) — `edit` answered its own scope question six times and two answers disagreed. `resolveEditRoot` now returns one `EditRoot { dir, isGlobal, isProjectSetup }` that every layer takes instead of a path — `isHomeDirectory(`, `process.cwd()` and `os.homedir()` each appear EXACTLY ONCE in `edit.tsx`, verified. "Valid config at the root" is defined as whatever `detectProjectInstallation(dir)` already answers yes to, deliberately refusing a second definition: a seventh criterion IS the defect, and that includes a seventh criterion for what counts as a root. `--project-setup` is an instance, not an exception. **Two of the audit's six rows had rotted** — `runEditWizard` compared `isHomeDirectory(cwd)` at runtime rather than a module-load constant, and `discoverInstalledSkills` does NOT miss global plugins (its first two steps read both scopes). Class gate `edit-decides-scope-once.test.ts` holds three raw-source counts. Hand-run: bare `edit` from a bare directory offers no Scope key and leaves the directory byte-identical; `--project-setup` offers it and writes the pair. Journey 40, COVERED on all four surfaces.

- **2026-08-21 — CLI-496** (cli.md) — **Closed by watching a test PASS, not by writing code.** The row claimed `recordGlobalSourceMigrations` writes the global config raw, outside the fan-out. It routes through `mutateGlobal({ kind: "migrate-skill-sources" })`, which classifies the change as T1, writes the global half, fans out and recompiles — someone had fixed it and the row never caught up. Proved non-vacuous with two mutations: disabling the recorder reddens 8 of 10; returning from `mutateGlobal` before `applyConsequences` — the exact raw-write shape the row described — reddens 5, precisely the bystander and propagation assertions. **The real cost was the skip.** The only spec covering it sat `describe.skip` for weeks, reading like a passing file, so nobody knew the fix had landed. Revived, retargeted at the narrower path, and named as journey 7's fourth leg. Spawned CLI-616.

- **2026-08-21 — CLI-492** (cli.md) — Six producers of the sub-agent roster, two of them marketplace-aware, aligned on CLI-only. **The recorded MECHANISM was wrong and disproving it was the value.** The row claimed a marketplace agent could enter `SelectedAgentName`/`ProjectAgentName` from one path and never compile; it cannot, because both unions come from `config.agents` via `activeAgentNames`/`activeProjectAgentNames` on every path. What the roster decides is the LABEL — `isCustomAgent` sections the union under `// Custom` / `// Marketplace`, which also flips it from one line to one member per line — so **one installation emitted two DIFFERENT files depending on which command ran last**, measured on the real binary. The background loader turned out to have no production caller at all. Two producers in `local-installer.ts` deliberately left and rostered with their posture. JSDoc verdict: the wiring was the intent and "source overrides CLI" was a fossil, evidenced by `AGENT_NAMES` being generated from `src/agents/` alone. **Why nothing caught it: every fixture in both suites declares a roster that is a SUBSET of the CLI's own, so both loaders returned identical names AND identical custom flags — the divergence was unreachable, not untested.** Spawned CLI-615, CLI-617, CLI-618, CLI-619.

- **2026-08-21 — CLI-591** (cli.md) — Warnings are legible in the wizard startup band. `startupBand()` sorts warn/error ahead of info before applying the paint budget; the budget is UNCHANGED (3, or 1 below `LOGO_MIN_TERMINAL_ROWS`) and space is made by evicting info, never by growing the band — which `flexShrink={0}` inside a root sized to `terminalHeight` would not have permitted anyway. Warnings collapse last and the `... and N more` counter stays exact. `edit`'s two info lines were kept per the owner's ruling. Hand-run at 100×30, 100×20 and the 80×20 minimum: below `LOGO_MIN_TERMINAL_ROWS` the first warning is now readable where the slot previously went to `Loaded 10 skills`. Pinned by an 8-row table over both budgets driven with info FIRST — the adversarial order — so a future unconditional info line moves a number in the table before it moves anything a user sees. `component-patterns.md` corrected: it stated the old append rule, and now carries the level ordering, the no-growth bound, and that the budget counts MESSAGES not rows (a warning wraps to 4 rows at 80 columns).

- **2026-08-21 — CLI-592** (cli.md) — A warning raised after the wizard mounts reaches a toast instead of being lost. `showWarningsAsToast` reopens the logger buffer window around a post-mount change; applied at the two CALL SITES rather than inside the actions, because `startFromScratch` is not purely post-mount — `hydrateForInit` reaches it for stackless sources, where the startup band is the correct home. That distinction is pinned: moving the wrapper inside the action reddens the pre-mount control alone. The defect before the fix was one `console.warn` carrying the full warning while the frame was painted — exactly what `assertWizardScreenIsWhollyVisible` exists to catch. **The documented producer turned out to be unreachable**: `globalPreselections` is null on every path reaching the stack step, and the reachable trigger is a stack naming a skill its catalogue dropped (`STACK_CLAIMING_ABSENT_SKILL_MATRIX`). The first attempt at the channel test was VACUOUS — asserting a drained buffer is empty cannot fail, since `disableBuffering()` empties it regardless — and was replaced with a falsifiable frame assertion.

- **2026-08-21 — CLI-331** (cli.md) — The nine-site error-swallowing audit, fully discharged and verified site by site. Its headline — `edit` warns but keeps recompiling when the config write fails — had been stale for some time: that site is `this.error(..., EXIT_CODES.ERROR)` and fires BEFORE recompile is reached. All three PROMOTE items done (config write; `mode-migrator`'s eject copy and plugin install both hard-error at their callers via `reportEjectCopies` / `reportPluginInstalls`); both RESTRUCTURE items return structured results. A THIRD listed site was also already stale: `Failed to copy <id> for eject` is detail printed beside a refusal two statements later, not a warn-and-continue. The last live residue — structured failures reported while the command still exited 0 — closed with the completed-with-failures work. The `init` half survives as CLI-607.

- **2026-08-23 — CLI-773** (cli.md) — `branding.name` now reaches the interactive dashboard. **The visual shape was chosen from the repository's own stated rule rather than from taste**: `branding.name` **replaces** a heading everywhere else it is read — every configured leg of the sibling spec asserts the shipped name is ABSENT, and the fixture name is documented as sharing no substring with the default so neither half can satisfy the other. `ASCII_LOGO` spells `AGENTS INC`; **it is the shipped name as artwork**, so painting it above `Northwind` would leave the vendor's name at the most prominent surface the product has — exactly what the other five surfaces forbid in text. The other two shapes contradict the field's own rule. Default path untouched by construction, and **verified byte-identical to pre-fix by diff**. **The brief's geometry warning did not apply and the lane measured rather than accepted it**: the six-row gate governs the stack step, whose content scrolls; the dashboard renders its logo ungated with four fixed menu rows, occupying **11 rows at every height including the 20-row floor** — and a branded install gets _shorter_, 6 art rows becoming 1 text row, so it cannot regress any size. Failing test watched red first, then **re-verified against pre-fix code after a fixture refactor** by temporarily reverting the wiring line. The journey row now asserts **both** paths, and states why neither spec retires the other — the piped leg is the only one that can read the counts block. Spawned CLI-816 and CLI-817.
- **2026-08-23 — CLI-800, CLI-811** (cli.md) — **Two product defects found by driving the CLI, fixed, and each now failing a journey that would have caught it.** **The catalogue fix rested on evidence rather than on the ruling alone**: `BUILT_IN_MATRIX` has 102 categories and **all 102 hold at least one shipped skill — zero empty**, so _"a catalogue carries a category only where it ships a skill in it"_ was already an invariant of the one catalogue that existed, and `build marketplace` broke it for every other marketplace. The narrowing precedent was load-bearing next door — built-in **rules** were already narrowed to shipped slugs; built-in **categories** were the one inherited table that was not. And `packages/api-mocks`' `MARKETPLACE_CATALOG`, documented as _"faithful rather than a convenience"_, **already modelled the scoped shape**, so the cross-workspace contract assumed it. Scoped to categories the marketplace's own skills REFERENCE, not what it declares — the two disagree in both directions — and the discriminator the scaffold cannot make is pinned in a unit spec. **The `doctor` cause was not what I guessed:** not stray `verbose()` calls but `setVerbose(true)` called unconditionally in `run()`, switching the shared logger on for the whole process — arrived as the mechanical replacement when `--verbose` was removed, and documented as deliberate. **So there was no non-verbose run to leak into: every run was verbose.** 27 lines, not the 7 I reported. **The network fallback is deliberate and was kept** — the row is named Marketplace Reachable and reaching the marketplace IS the check — but it is no longer silent about which rung answered. **A correction that matters more than the count: I claimed both journeys were marked COVERED. False for `doctor`** — its spec belonged to **no journey at all**, sitting in the declared backlog. The page did not over-claim; it never claimed. Spawned CLI-812, CLI-813, CLI-814, CLI-815.
- **2026-08-23 — CLI-755, CLI-781, CLI-786** (cli.md) — **Outcome: KEEP, and the row's framing was the thing that turned out false.** The rows read as though the early door were redundant now that the per-test guard covers both suites. Measured on the real runner: **a throwing `beforeAll` skips every `beforeEach` under it**, so for the **62 of 248** spec files that reach the built binary from a `beforeAll`, the per-test guard is not merely later — **it is unreachable**. Reproduced with `dist/index.js` and `dist/commands` removed while leaving `dist/` newer than `src/`, which is exactly what a mid-run `tsup --clean` produces and keeps the run-level check passing: **door present, 924 ms and a message naming the build; door removed, 46 seconds ending in `timeout waiting for "Choose a stack"` over a screen reading `init is not a agents-inc command`.** The per-test guard fired in neither — its hook was never reached. **The bigger rot was one the brief never mentioned: the declaration's stated justification was FALSE**, resting entirely on the absence-vs-absence gap closed earlier the same day — so the file argued for its own redundancy, and the gate file repeated the claim. Anyone re-opening this row would have read both and retired a door that saves 45 seconds of misattribution. **CLI-786's stale census lived in two files, not one**: the old form returned 242, dropping three smoke files that do call it and counting bare imports; the corrected form returns 245 of 248. Three docblocks changed, no code. Spawned CLI-797, CLI-798, CLI-799.
- **2026-08-23 — CLI-792, CLI-794** (cli.md) — **The broken census now runs and returns 154 lines**, consistent with the prose above it saying "over 140 sites" — a lower bound with the command directly beneath it, so it was kept rather than converted to a count. **The defect was reproduced from the document itself rather than retyped**, and a brief correction worth keeping: the two shells fail _differently_ — zsh answers `unmatched "` and exits 1, bash answers `unexpected EOF while looking for matching` and exits 2 — so a reader grepping for the zsh string on a bash box finds nothing. **Both produce empty stdout, which is the whole defect.** The remedy was quoting only; no flag, dialect or regex semantics moved, which is why the earlier mechanical `-E`→`-P` sweep passed straight over it. **CLI-794's three figures were deleted rather than re-measured even though all three AGREED with the config they defer to** — the row is not a drift repair but the removal of a restatement from a block that says another file owns it, and the sentences carry their claims without the numbers.
- **2026-08-23 — CLI-758, CLI-777, CLI-787** (cli.md) — **CLI-758's stated blocker was false and the lane proved it with call sites**: _"`scripts/` imports nothing from `src/`"_ — two production checker scripts of exactly this class already do, plus four generators. So outcome 3 was unavailable, and the shared home was rejected on two **measured** grounds instead: every candidate home lands in a documented enumeration in another lane's file, so the move would create the unbound-and-now-wrong list that CLI-777 was closing four of in the same turn; and `CELL_SEPARATOR` is a `RegExp`, whose `lastIndex` is a mutable field invisible at every call site, so CLAUDE.md's by-identity ban turns "move two constants" into a factory plus a docblock plus a documentation row. **The gate was written instead, watched fail in both directions**, and `journey-page.ts` gained the reciprocal reference it never had — the row claimed each named the other; only one did. **CLI-777's four rows arrived GREEN and were then proved to BITE**, both directions measured and reverted, because green-on-arrival is not the same as biting. Binding four lists **falsified two of the document's own sentences** ("Nothing in this section is bound"), which had to be repaired in the same change. **CLI-787's survivors were each argued individually**, and the lane fixed a fourth numeral the row did not name because repairing one clause and leaving another wrong **in the same paragraph** was not coherent. It also caught two counts in its own new comments — the exact defect it was fixing — and dropped them before reporting. Spawned CLI-795 and CLI-796.
- **2026-08-23 — CLI-791, CLI-785, CLI-784, CLI-783** (cli.md) — **Six brief corrections, and the sweep row was wrong in the direction that matters: my enumeration command anchored `grep` to line start**, so it missed every grep inside a pipeline, a process substitution, a `for` body or inline prose. 35 sites became **44**, and a **fourth** protected line appeared — the bible reproduces the hazard inline in prose as well as in its three-command block, and converting that deletes the evidence too. The bible breaches its own rule **15** times, not eight. **Every one of 40 converted censuses was verified to return the same SET it returned before** — and the lane found why set equality is the only honest comparison: ugrep's line order is nondeterministic _within one dialect_, three consecutive identical runs giving three different hashes. A first verification attempt through a child shell **silently got GNU grep** and was discarded. **`monorepo-layout.md`'s figure was not "correct today" as I claimed — it was stale** (184 against 245) and was a restatement of a number another file explicitly owns. **CLI-785 took the deletion route with the sharper argument**: the document already routed the roster elsewhere; what it lacked was one sentence saying where an omitted object's KEYS live — the claim it was missing rather than the claim it got wrong. **And one count was deliberately left**: `all 12` is the literal `from` anchor of a registry row, so correcting it would redden a gate from another lane's file. Spawned CLI-792, CLI-793, CLI-794.
- **2026-08-23 — CLI-780, CLI-776, CLI-763** (cli.md) — **CLI-780's fix states what it can no longer detect, and pins that bound as a NAMED TEST rather than leaving it in prose**: a build-input file _deleted_ from a directory where a spec was _also_ written since the build. Those two events leave one reading between them — the directory's mtime — and nothing in it says which moved it. That is the whole of the loss; an added or edited build input still refuses, with a control test pinning it. **Two refusals nobody needed are gone** (adding a spec beside the code, and the rename-save itself) and deleting a spec still refuses. Verified on the real tree by reverse-applying the edit, because `git diff --stat HEAD` shows 281 and 165 uncommitted lines in the two guard files — **HEAD was useless as a before-state**. **CLI-776's name was chosen by a test the obvious candidate fails**: `readSkillMetadataForManifest` _contains the exported name as a substring_, so every grep and every prose mention would still return both — the exact failure the row exists to end. **CLI-763's arm-1 route was traced end to end** rather than assumed, and the sibling docblock it was copied from was correctly left alone, since there it labels one arm and is true. Spawned CLI-790 and CLI-791.
- **2026-08-23 — CLI-649** (cli.md) — `EDIT_RECOVERY` → `INCOMPLETE_WORK_RECOVERY`, nine files in one change. **Atomicity was proved rather than assumed**: the six source files were renamed first with the registry entry and both documents left behind, and the checker refused **word for word** as the row predicted — _"names a symbol its source file does not export"_. The three bindings do not separate. **The name was chosen from the vocabulary its consumers already speak** — `IncompleteWork`, `reportIncompleteWork`, `recordIncompleteWork`, `hasIncompleteWork`, `exitIfWorkIncomplete` — and two alternatives were rejected with reasons: `RECOVERY_STEPS` collides with "step" meaning _wizard step_ throughout this codebase, and `RECOVERY_MESSAGES` would join a family grouped by log severity, which these are not. **All four members were observed verbatim at a real terminal**, including one the first three hand-runs could not reach: a fourth run dropped a sub-agent with the agents directory at `0555` to force the delete-failure arm. **The census dropped by one site deliberately** — an assertion message hardcoded the constant's name as a string where its two siblings already interpolated the file's own constant, so the file now states the name once. **A brief correction worth keeping: the symbol does not exist at HEAD at all** — the whole incomplete-work mechanism is uncommitted, so "re-derive against `git show HEAD:`" had no subject and the working tree was the only reference. Spawned CLI-788 and CLI-789.
- **2026-08-23 — CLI-774, CLI-775, CLI-779** (cli.md) — **CLI-774's "already fixed" was half fixed, and that is the bible's own warning realised verbatim**: `utilities.md` carried the stale count at **two** granularities and the earlier pass repaired one, leaving the other reading as authoritative eight lines below a paragraph that contradicts it. _"When a count is found stale, the finding is not the number; it is every copy of that count at every granularity."_ Also corrected: the class is **three** prose copies of `STEP_TEXT`'s count, not two, and the third uses a different spelling that the obvious search misses. The count went from the unbound half along with its cross-document hand-reconcile instruction; the checker's section marker was preserved verbatim, and the green run is the proof it survived. **CLI-779 was deleted on a sharper argument than the brief's own test.** The brief asked whether the listing states something an `ls` does not — it does. **But a second place already answers and is gated**: `factories.md` tables all seven exports and a registry row binds it, which is why that document dropped the deleted symbol under gate pressure while this one kept it — **no registry row binds `infrastructure.md` at all.** An unbound copy of a bound roster is the drift, not the coverage. The sibling block was done too, because fixing one and leaving the other is exactly the failure that produced CLI-774's residual. **CLI-763's provenance was found**: the false phrase was copied from a docblock where it is CORRECT, because there it labels one arm specifically — it became false on arrival at a branch both arms reach. Spawned CLI-783 and CLI-784.
- **2026-08-23 — CLI-754, CLI-759, CLI-709** (cli.md) — **CLI-754's hole produced false GREENS as well as misattributed reds, and only the reds were filed.** Reproduction: `dist/` removed 10 s into a four-file run — the file that had already loaded refused loudly, the three that loaded _after_ the removal took absence as their baseline, compared `0 === 0` and said nothing. 27 tests failed naming unrelated specs, and **3 tests passed against a `dist/` that was not there.** Fixed with one named private predicate — `holdsTheGuardedBuild` — because `0 === 0` is not "the same build", which is a rule an expression cannot state. After: 0 AssertionErrors, all four files refused at `beforeEach` in 6–12 ms, both timestamp rows reading `not there`, which is itself the tell that the file started inside the window. **CLI-759's behaviour half was already closed** by a setup file that landed after the row was written; what nobody held was the two runners' `setupFiles` against each other, so dropping one would remove the hooks silently and stay green in any run nobody else was working in. Now gated, watched fail twice. **CLI-709 does not reproduce, and its breach rested on a category error**: `testTimeout` is per TEST, not per file. Measured worst case 8121 ms and 8061 ms against a 10 s budget, zero retries consumed across the full gate — the row read a 58-second file duration as a per-test overrun. The mechanism it names is real and the cause was pinned: `setupIsolatedHome` gives each test a fresh HOME, so the marketplace cache misses every time (cold 3.087 s, warm 0.991 s). **Both offered remedies were refused on evidence** — nothing to justify raising a budget, and stopping the network needs a shared cache, which is a workflow change. Spawned CLI-780, CLI-781, CLI-782.
- **2026-08-23 — CLI-670, CLI-687** (cli.md) — **CLI-670's headline claim was false and the real gap is narrower: `isScopePairCompatible` is already a one-line delegate to the wire contract, so there was ONE implementation, not two.** The drift its docstring warns about had already been ended. What was true: **the minting path validated with the READING schema** — `configToSeedPayload` ended in the lenient `seedPayloadSchema.parse` while the worker's POST route, the only consumer the CLI ever hands a payload to, declares the strict one. **The strict schema refuses nothing the CLI's rule permits, and cannot** — traced through both: the two checks read the same two maps, built from the same two filtered arrays, so the `superRefine` re-asks a question already answered with identical inputs. **So the value is entirely the new spec**, which stands the CLI's own rule down via a partial mock and asserts the mint still refuses on the schema's terms — before, it minted an uninstallable payload. The specific message is untouched and still what a sharer sees; the existing refusal spec was **strengthened to assert its wording**, because both messages name the same skill and sub-agent and a test happy with either could not say which reached the user. **CLI-687's parser was deleted rather than repaired**, its callers pointed at the tested one, and a **third defect the row never named** was found and closed with it: the whole-file scan returned the `Invoke:` line's ref form rather than the heading id, so a plugin-mode assertion could never match — and its negative form passed **vacuously** on an agent that carried the skill. Three deleted specs were triaged individually, not swept. Spawned CLI-778 and CLI-779.
- **2026-08-23 — CLI-676, CLI-672, CLI-710** (cli.md) — **All three had already landed in the uncommitted tree; the lane verified rather than re-implemented, and produced the evidence the rows were missing.** Its net diff is empty. **CLI-676's missing half was the mutation proof, and it is the sharpest of the round:** with the guard mutated to `return false` the refusal assertion goes red; with it mutated to `return true` — the guard eating its entire domain — **the refusal assertion stays GREEN and only the permitted case reddens.** That is precisely what a refusal-only pin cannot see, and why the pairing rule exists. The permitted case differs from the refusal in a **single field**, so the badge flip is attributable to that field rather than to a scope key that stopped working. **CLI-672 was already resolved by the comment route, and the reasoning against the alternative is worth keeping**: exporting one definition would have traded a two-token literal for an object handed to callers **by identity**, which is the exact trap `CLAUDE.md` bans — and the seven sites fail the same-reason-to-change test, each stating `"project"` so its own subject stays observable. **CLI-710 was closed and PROVED reached rather than assumed green**: `tsc --listFiles` lists all four configs, `eslint --print-config` shows type-aware rules at error level, and two planted defects — a type error and an unused import — were each caught by the right gate. Cost of closing the exemption: zero errors, zero reports. The asymmetry that settled it: `e2e/vitest.config.ts` was always covered, so the package exempted one vitest config and not the other purely on where it sat.
- **2026-08-23 — CLI-765, CLI-766, CLI-767** (cli.md) — **CLI-765's inventories were deleted rather than corrected, and the argument was rebuilt rather than borrowed.** The row named two rotted bullets; measured against source, the section was wrong in **every available direction** — a phantom constant in two lists, a stated 7 against 8 exports and a stated 12 against 17, a pure-glob bullet naming no member against 11 real exports (the exact form the bible forbids by example), and **24 live exports named nowhere**. **The borrowed "a list that size drifts" argument was explicitly rejected as the discriminator**: the smallest module in the directory, at three exports, still carried a wholly dead bullet. **Binding is the discriminator**; size only decides whether a correct list would be worth reading. Four lists were KEPT and verified member-for-member by two-way `comm`, because each states something an export name does not. **CLI-766** now names the module at every mention, and found a bonus defect in the sentence it rewrote — a claimed single consumer where two fields are read. **CLI-767** corrected a fixture contract that claimed four filled fields where three are filled, and deleted a bullet carrying four superseded counts as pass narration, replacing it with two censuses over the sanctioned producers. Spawned CLI-775, CLI-776, CLI-777.
- **2026-08-22 — the two documentation-gated reds from the branding wire-up** — Both green; **205 files / 7161 tests, zero failures.** The journey row was verified against the PARSER rather than by eye: re-split with the reader's own `/(?<!\\)\|/`, confirmed at five cells, and `journeyNumbersIn` checked to now return 42 with `readJourneyRows` agreeing — the exact gate the unescaped-pipe fault broke earlier this week. Its marker and surfaces phrasing were copied from a live precedent row rather than invented. **Three brief claims of mine were refuted, and the third matters most.** The draft row's stated reason for "surfaces 2 only" was false — the run DOES install and write; the true reason is stronger, that `branding.name` is written into **no artefact at all**, so three surfaces have no subject even though the run produces them. A bare COVERED would have read as three unclosed surfaces in this page's vocabulary; the page already had the right combination and it was used. **And the resolved name reaches `formatDashboardText` on the non-TTY path ONLY** — on a TTY the dashboard component is handed callbacks and never the data, so the screen a human sees does not follow branding, which the non-TTY e2e spec structurally cannot catch. `configuration.md` previously named **no reader at all** for this field — accurate until the wire-up and silently false after. It now carries the reader table and the two postures with the reason they differ. Spawned CLI-772, CLI-773, CLI-774.
- **2026-08-22 — CLI-702** (cli.md) — Branding wired up on the owner's ruling. **Seven sites across six commands' output**, and the substance of the change is the posture rather than the substitution. A standing owner ruling says a config that exists and cannot be evaluated is raised, never reported as absence, and **every call site chooses a posture and states it where it stands** — so no catch went inside `resolveBranding`, which would have handed every future caller a posture it never chose. Instead `BaseCommand.resolveBrandingName` **degrades** (catch, `verbose`, shipped default) because `doctor`, `uninstall` and `eject` must survive an unreadable config and three e2e specs exist to say so — **a throwing header would have aborted `uninstall` before it removed anything**, the exact regression those specs were written for. `getDashboardData` calls through **directly with no catch**, because abort is already in force there: a `loadProjectConfig` in the same `Promise.all` raises on the same file. **Generated artefacts were deliberately NOT branded** — `generateReadme` writes into plugin bundles published to third parties, and that line is a provenance claim about which tool wrote the file; "Generated by Northwind skill-plugin-compiler" in a stranger's checkout is a false attribution. **Two sites were left as findings rather than forced**, both because wiring them meant widening a call tree by one string — one of them reaching into a Result-builder library purely to compose an error that usually never prints. **The hand-run caught a regression the tests did not**: `doctor` sets verbose before its header, so resolving branding after it put a diagnostic line above the title. **Four brief corrections of mine**: two named sites had no runtime branding at all, two real sites were missing from my list, and the tagline has zero print sites anywhere. Spawned CLI-768, CLI-769, CLI-770, CLI-771.
- **2026-08-22 — CLI-685** (cli.md) — One of six methodology partials rendered by nothing. **Closed with a roster gate rather than a decision**: `agent-template-renders-its-partials.test.ts` asserts the `{% render %}` tags against the directory listing and accounts for **every** partial, with `improvement-protocol` in an explicit `UNRENDERED_METHODOLOGY_PARTIALS` exception whose comment states why — retiring it either way is a product decision, not a test change. So the gate flags the next partial that stops rendering while recording, in one findable place, that this one is deliberate. **No product change**: 5 render tags against 6 partials, unchanged. A second reference documented this twice and neither document acted on it; a gate would have flagged it on the day it stopped rendering, which is the argument the row made and the reason a fixture was the wrong shape.
- **2026-08-22 — CLI-764** (cli.md) — Nine documents brought back to the tree after the loader and dead-residue work. **Four brief corrections, and two change what the row was about.** The dead-constant list was eight, not four — both bullets were deletable whole rather than editable. `CopyLocalSkillsOptions` is gone **entirely**, not just its one field, so there were five sites rather than two. **The substantive item understated its own primary site and part of it predates today**: `skill-primitives.md`'s skip-rules table was already stale at HEAD, listing a `parseYaml`/`safeParse` level asymmetry that `git show HEAD:` proves had already been folded into one — so correcting the table meant deleting a paragraph built on the false asymmetry. And the placeholder refusal itself is older than today; what landed was its extraction to a shared predicate and its adoption by the second reader. **The most useful finding is why the divergence was invisible: nothing described it as a disagreement.** Both readers' tables simply had no placeholder row at all — each document was locally complete about its own reader, and the contradiction lived only in the gap between them. The invariant is now stated rather than the incident narrated: _neither pass can load what the other refuses, and that is the property to preserve when either is edited._ Spawned CLI-765, CLI-766, CLI-767.
- **2026-08-22 — CLI-751, CLI-752, CLI-674** (cli.md) — **CLI-752 needed no ruling: three independent readers already agreed the placeholder is not loadable, and only `loadSkillsFromDir` dissented by never reading `category` at all.** Evidence assembled rather than argued — the refusing loader, `classifySavedSkill`'s `unplaceable-category` explanation, nine category traversals that all skip it, the constant's own docblock, and zero production writers. One verdict now, `namesPlaceholderCategory`, called by both readers; the dissenter skips at `verbose` because the file is intact and the user-facing sentence already has an owner, so warning in both would print it twice. **CLI-751 was closed by making the census impossible rather than by fixing 48 sites**: `category` became REQUIRED on the metadata fixture type, which turned the search into a `tsc` error list — and caught a site the row's own grep could not, since `renderIncompleteMetadataYaml` reaches the same default under a different name. **47 of 47 fixtures moved nothing; one was green about the wrong classification of its own fixture** — a spec pinned its generated union under a `// Custom` heading, which means _the catalogue does not declare this id_, true only because the placeholder kept the skill out of the matrix entirely. **CLI-674: none of the four parts had decayed**, against my explicit expectation that at least one would. Its consequence was a gate rather than a rebuild — a documentation table binds the two directory constants to source. Spawned CLI-761, CLI-762, CLI-763, CLI-764.
- **2026-08-22 — CLI-756** (cli.md) — Two negative assertions that could no longer fail, repaired and **proved by two mutations**. The headline result is the danger stated exactly: with exclusive-category suppression **deleted outright**, the old spec passed **3/3, fully green**. Fixed, line 114 goes red. **One brief claim of mine was false and the lane disproved it by measurement**: I said both negatives pin suppression; line 139 does not and cannot be reddened by breaking it, because only the FOCUSED cell is annotated and in that test the focused cell is a different skill. It pins what its own comment says — a discouraged cell must not also read as ruled out — and needed a second mutation (annotations on every unselected cell) to redden. Both mutations reverted and verified byte-identical. **The positives were tightened rather than broadened**: one now composes from the same `DISCOURAGE_REASON` constant that AUTHORS the source's rule, so it pins the trip from source file to screen rather than a copy of a string. The page-object regex was verified by EXECUTING it against both old and new forms rather than reading it — it still strips correctly, and `Gel (EdgeDB)` correctly keeps its parentheses. Trap class closed: a repo-wide scan for the same shape returns only the two repaired sites plus one the originating lane had already fixed. Spawned CLI-759 and CLI-760.
- **2026-08-22 — CLI-706, CLI-707, CLI-753** (cli.md) — **The drift checker's naive cell split is fixed, and "latent" was confirmed two ways rather than assumed.** Empirically: `check()`'s full verdicts over the whole registry dumped before and after the change, **byte-identical**. Structurally: **41 rows across 17 registered documents DO carry an escaped pipe** — union types written `A \| B` — and every one sits in or after the last column its entry reads, so all 41 were being mis-split and none mis-read. Two tests watched fail first; the first reproduced the silent wrong-column read exactly, every row answering with the escape's tail while a correct document was reported as drifted. **The fix was copied verbatim from `journey-page.ts` rather than re-spelled**, and what was deliberately NOT copied is as considered — that helper's `.slice(1,-1)` and per-cell trim are its own contract, not the escape rule. **Two brief claims corrected**: `table-rows` is not unconditionally safe, since `firstCellOf` and `columnIndexOf` both go through `cellsOf`, so a pipe in the first cell or in a heading would shift everything — safe only because no symbol name holds one, which is a different claim; and the registration counts were 64 entries with 4 resolving positionally, not 7. **CLI-707 was worse than filed**: the second five-cell row was the DELIMITER row, so the header declared two columns and the delimiter five — the block was not a markdown table at all, and escaping the code span alone would not have fixed it. Spawned CLI-758.
- **2026-08-22 — CLI-703** (cli.md) — Advisory reasons computed and discarded. **Rendered, not deleted — and the decision was measured at every step.** Width was the stated risk: Ink does not truncate here, it grows the tag and wraps inside the border, proved by probing the EXISTING `unmetRequirementsReason` path with a 135-char annotation at 100 columns — 3-line box, text intact, no ellipsis. The wizard refuses below 80 columns, and a real-pty hand-run at 80 fits. **Deleting was rejected on a schema fact**: `reason` is REQUIRED on `conflicts`, `discourages` and `requires`, and `OptionState.reason` is the only destination a `discourages` rule's prose has — deleting it would make a required schema field provably decorative. The verdict word stays leading (`(incompatible: …)`) because it is the only carrier of the verdict under `NO_COLOR`, a discourage reason is free-form prose that need not identify itself, and the e2e page objects anchor cell parsing on that keyword. Two genuinely dead fields — `SkillOption.advisoryState` and `.alternatives` — were deleted with their producer, and their six assertions **relocated to `getCellState` rather than dropped**. Six tests watched fail first. **The lane overrode my gate scoping and was right to**: I scoped it component-and-types-only, it ran e2e anyway, and that is what caught a spec this change breaks. Spawned CLI-756 and CLI-757.

- **2026-08-22 — a bad intervention of mine, corrected by the lane it interrupted** — I told the CLI-703 lane mid-task that its row's premise was false, having read `advisoryAnnotation` in `category-grid.tsx` and concluded the reason was already rendered. **That function was code the lane had just written.** `git show HEAD:…category-grid.tsx | grep -c advisoryAnnotation` returns **0**, and HEAD line 75 returns the bare `"(incompatible)"` exactly as the row claimed. I read a working tree an agent was actively modifying and reported it back to that agent as evidence against its own work. **Reading the tree is not verification while a lane is writing to it — the only stable reference is `git show HEAD:`**, which is what the lane used to refute me and what I should have used before sending.
- **2026-08-22 — CLI-671, CLI-699** (cli.md) — A missing or stale `dist/` reading as an ordinary assertion failure in E2E. **The stale case was worse than the row said: it was not a misleading failure, it was a PASS** — the suite ran green over the previous build. Now `Error: dist/ is stale — packages/cli/src and packages/matrix/src changed since the last build`, with both readings and both reasons, refused before collection. **The brief's proposed home was the harmful one, and the lane measured why rather than accepting it.** I said `e2e/setup.ts`; `assertDistIsFresh` walks two source trees, so asked PER SPEC FILE it refuses every file that begins after any agent saves a source file — measured on a real run as **78 refusals, 123 of 243 files failed, 319 tests unrun**, none of it evidence about anything. Against a staged discriminator the same 21 files gave 4 failed / 7 skipped wide, versus **0 refusals** narrowed. **Staleness is a property of the moment a run STARTS**; a source edit mid-run does not invalidate the build the run is already executing out of. It went into `e2e/global-setup.ts`, already wired, so still no new config pattern. **`ensureBinaryExists` guarded the wrong artefact for a reason worth recording**: `bin/run.js` is present and starts fine — 127 is oclif's not-found code, so the check could never fire. Live proof on a real race: one spec that began inside another lane's `clean: true` empty window was refused **by name**, in exactly the hole the replacement guard is blind to. Spawned CLI-754 and CLI-755.
- **2026-08-22 — CLI-656, CLI-677, CLI-704** (cli.md) — Three small rows. **CLI-656 was ALIGNED rather than commented**, which is the stronger of the two remedies the row offered: both global-scope reads in `discover-skills.ts` now call `globalInstallRoot()`, so if that function ever learns an override, global plugins follow it instead of silently staying on the raw home. Behaviour identical by construction — `globalInstallRoot()` is `return os.homedir()`. **CLI-677 replaced a hand-rolled `tempHOME` with `EditWizard.launchInProject`**, and the proof it did not quietly move what the spec exercises is the spec's own `STEP_TEXT.SCOPE` assertion: that footer hotkey paints ONLY at genuine project scope, so its passing is the discriminator. 9/9 before and after. **CLI-704 was judged and declined, with the reasoning recorded.** No `search` mention was added: every command this codebase hands out is a way OUT of the state its message describes, each defended in its own docblock, and `search` is a read-only browse that is not a way out of any state currently reported. The closest candidate actively contradicts it — `unplaceableKept`'s docblock states that nothing the user does to the skill makes the instruction applicable. `search` is already discoverable as a registered non-hidden command with examples. Its second half decayed: `MAX_SKILL_NAME_LENGTH` no longer exists, deleted in the same hunk as its only enforcer — and the unbounded-name state it warned about is **long-standing rather than newly introduced**, since the live reader never carried the bound.

- **2026-08-22 — CLI-682** (cli.md) — **Withdrawn: neither half describes the tree.** (1) The `uninstall.tsx` docblock does not say what the row quotes — it reads _"Same posture as the `deregister-project` mutation's call site above"_, and that call site exists 263 lines above it, wrapped in the try/catch degrade posture the docblock claims. The comparison resolves. (2) The row named the wrong file and inverted the meaning: `loadConfigTypesDataInBackground` appears once in the repository, in `check-findings-frontmatter.test.ts`'s `UNDECLARED_SYMBOLS_ON_DISK` — a roster of symbols **nothing declares**, not a roster of producers with a posture. That pin **earns its place**: the spec asserts the list exhaustively, the symbol's status is now known to be deleted, and removing the pin would redden the file. Filed by me from a verifier's report without re-deriving either half.
- **2026-08-22 — CLI-693, CLI-694, CLI-688** (cli.md) — **CLI-693's fix was one line and its FINDING was that nothing moved.** All 18 call sites (not 19) behave identically before and after, because `minimal()` declares no `stack`, so no sub-agent is assigned the skill either way — proved by recompiling an already-built project and getting `0 agents rewritten, 2 unchanged`. What changed is confined to two places nothing asserted on: the refusal warning leaves the output, and `config-types.ts` goes from `Domain = never` / `Category = never` to real unions. The new spec pins the `Category` union. **CLI-694's widening cannot redden the gate**, which is exactly why it landed with four planted fixtures: one acceptance (the change's own red, watched fail then pass) and three refusals that must pass on both sides. **CLI-688's row was too strong and the lane said so**: template overriding IS covered end to end by two `eject-compile` specs; what had no coverage is the UNIT layer, `createLiquidEngine`'s root hierarchy — which is precisely what the dead fixture made look covered. The dead fixture was **re-homed rather than deleted**, because a shared setup writing it would shadow the shipped template for the whole describe — a hazard that file's docblock already warned about and that was unearned until now. Spawned CLI-751, CLI-752, CLI-753.

- **2026-08-22 — a stale generated package, found by a lane and fixed at the root** — `scripts/generate-matrix-package.test.ts` was red on three tests with `packages/matrix/src/generated/agents.ts` at committed state while the generator that writes it had been changed. `generate:matrix:check` confirmed the drift; `bun run generate:matrix` wrote 8 files and the gate went green. **The new dist-staleness guard then refused every subsequent run** — `dist/ is stale — packages/matrix/src changed since the last build` — which is the guard working: regenerating a dependency invalidates the build, and it said so by name instead of letting a suite run against the wrong tree.
- **2026-08-22 — CLI-744, CLI-745, CLI-747, CLI-748, CLI-749** (cli.md) — Five documentation rows, the first of which mattered most: **`packages/cli/CLAUDE.md`'s ALWAYS rule prescribed `getSkillBySlug`, deleted the same day**, so the file every session reads first told an agent to write code that would not compile. One symbol out of three sentences — the project CLAUDE.md, `clean-code-standards.md` 7.9 and `typescript-types-bible.md`, where removing it also made a plural singular. **A general sweep for the same shape found exactly one more**: the documentation bible's routing table named `lib/output-validator.ts`, deleted today with all five of its exports and no replacement. `CLAUDE.md` and `standards/` are otherwise clean of the day's 45 removed symbols and 4 removed modules — derived from `git diff -U0` rather than from a remembered list. **CLI-747 corrected the row that spawned it, twice**: there is only ONE entry point, not two (`copyEachSkill` has a single caller and `copySkill`/`copySkillFromSource` have zero), so the deleted invariant was wrong on that half as well; and the aggregation was not wholly undocumented — a trap already pointed at it, what was missing was the answer. New invariant 6 states what the source does, because the old invariant's "fails that skill" read as _that skill is skipped and the rest succeed_, the **opposite** of the aggregation. **CLI-748 and CLI-749 were both measured rather than reasoned**: `packages/cli/config/` has never existed in git history at all, and `clean: true` was tested in an isolated temp project against the repo's own tsup — it unlinks files matching `**/*`, leaves dotfiles and every directory shell standing, which turns out to be a REAL justification for the `fs.remove` calls the false comment was defending, since the packaging test compares with `onlyFiles: false, dot: true`. One consequential doc updated beyond the rows: `build-and-packaging.md` narrated the deleted step in five places, and it also claimed `config/` was listed in `files` — which it never was, and which the packaging spec would have caught had it been true.
- **2026-08-22 — CLI-708** (cli.md) — One lane's rebuild emptying `dist/` under another lane's running suite. **All three approaches I offered were rejected with measurements, and the fourth was taken: make it loud, because misattribution was the entire cost.** Rejected DROP `clean`, having measured what it protects: a working oclif command written to `dist/commands/` with **no source behind it** was listed by `--help` and ran — and `dist/` publishes wholesale via `files`, so without `clean` a deleted command ships and is invocable, silently. Rejected a BUILD LOCK because it does not fix this bug — the collision is not two builds interleaving but one build wiping `dist/` under a suite, so serialising would need the SUITE to hold the lock for its whole 70s–5min duration, and a killed process wedges the tree. Rejected PER-LANE `dist` because `oclif.commands.target` is a fixed string in a tracked `package.json`. **Reproduced before and after:** the race produced 21 failures across 5 files, **19 of them `AssertionError`s and zero mentioning a build**; after, the same amplified race gives **0 `AssertionError`s**, every failure naming the mechanism, printing both readings of `dist/index.js` and stating that the result is not evidence about the change under test. **Two design decisions worth keeping.** The guard is taken PER SPEC FILE, deliberately: a file whose `dist/` moved under it produced its result over two builds, while one that started after the rebuild finished ran against a complete build and is sound — voiding it would be a false positive. And detection lives in a hook rather than `globalSetup` teardown **because that was measured**: on vitest 4.1.10 a throw from a globalSetup teardown prints `error during close` and **the run still exits 0**. **No workflow change** — no lock file, no env var, no new script or flag; the only addition is a `setupFiles` entry the package-root config already uses. Three brief corrections: there are three `pretest` hooks, not two; `bin/run.js` does not resolve `dist/` by path at all; and `tsup.config.ts`'s claim that `clean` clears only its own outputs is false. One known consequence: `test:watch` alongside `dev` will now refuse continuously — that combination genuinely produces untrustworthy results, but it is a behaviour change. Spawned CLI-748, CLI-749, CLI-750.
- **2026-08-22 — CLI-705, CLI-711, CLI-712, CLI-713, CLI-741, CLI-743** (cli.md) — Six documentation rows batched. **CLI-743 was the one that mattered and it was settled from source rather than by picking the more confident sentence**: `buildAgentStack` chains `isScopeCompatible` → `shouldIncludeTriple` → `isPreservedOrRelevant`, and the third filter runs UNCONDITIONALLY, not gated on the opt-in — the source says so in `shouldIncludeTriple`'s own JSDoc (_"every scope-compatible skill passes THIS gate (the relevance filter still applies)"_). So `scope-split.md` was right and `agent-system.md`'s sentence was deleted. **Nine passages went wholesale**, including a 59-line `## skill-fetcher.ts` section for a module that no longer exists and a `Top-level describes` table where 6 of 8 rows named inner describes as top-level — replaced by the two grep commands that produce the answer. **Four brief figures of mine were wrong**: `deregisterProjectPath` is not deleted but demoted to a test-local helper; `propagate.ts` has nine exported FUNCTIONS but eleven exports (the doc's noun was right, only its number wrong); `leaf-exports.md` cited seven bare line ranges, not six; and two files carried the `D-223` keyword, not one. **One self-correction worth keeping:** the lane wrote _"`toggleTechnology` is the only mutator, and it moves the clicked id alone"_, verified it, found it FALSE — the exclusive branch is `newSelections = [technology]`, which drops the sibling — and replaced it with a claim it had checked. The verify-before-reporting rule caught a bad SENTENCE rather than a bad symbol, which is the harder case. Spawned CLI-744, CLI-745, CLI-746, CLI-747.
- **2026-08-22 — CLI-680** (cli.md) — Task ids in `.ai-docs/`, including two section headings. Census went **53 lines / 21 files / 28 ids → 36 / 15 / 26**; both headings replaced with what they describe, using the tree's OWN name for the second (`configuration.md` already routed to it as "the per-agent curation delta pipeline" and an e2e spec names the mechanism the same way) rather than an invented one. **The deferral reason was false and that is why it could run**: zero inbound anchors to either heading, confirmed case-insensitively across md/ts/tsx/mdx/json/astro — the only hit was the tracker row quoting the grep command. **The brief's own grep was defective in the way the governing standard already warns about**: `grep -v agent-findings` filters LINES not PATHS, so it silently dropped a seventh file whose prose mentions the directory — `config-merger.md`, found and fixed. The bible states that trap verbatim and its own census uses `--exclude-dir`; the correct form is `grep -vP '^\.ai-docs/agent-findings/'`. One structural change worth recording: a "Known Limitations" table in `plugin-system.md` had `Task` and `Status` columns whose only content was tracker state — that is `todo/`'s job and is not current-state, so the columns went and the row was renamed for the limitation itself. Spawned CLI-741, CLI-742, CLI-743.

- **2026-08-22 — a correction to CLI-574, caught by the lane behind it** — my rename destroyed the provenance it was written to preserve. The script annotated each row `(was D-276)` and then ran a final global substitution that rewrote **that annotation too**, giving `| CLI-738 | (was CLI-738)`. All 27 rows and every heading. Restored by reversing the id map — 45 annotations repaired, zero self-referential ones left, table still clean. **The bug is the ordering: a rename pass must not run a global substitution after writing text that contains the old id.** Caught only because a downstream lane read the file it had been told the rename had touched.
- **2026-08-22 — CLI-574** (cli.md) — The `D-NNN` tracker ids migrated to the workspace prefix. **27 live ids, not the 35 the row claimed** — all of them in `cli.md`, none in the other five trackers. Renamed to `CLI-714` … `CLI-740`, each row and detail heading carrying `(was D-NN)` in the established `(was UX-04)` form, so the archive link survives the rename. Ten `todo/plans/D-*` files renamed on disk with their `[Plan]` links and internal citations rewritten in the same pass; `ROADMAP.md` rewritten with them. Verified after: **zero** live `D-` row ids remain, zero broken plan links, table well-formed at 0 malformed rows. **Ten `D-` references were deliberately LEFT** — `D-214`, `D-220`, `D-278`, `D-212`, `D-14`, `D-310`, `D-235`, `D-223`, `D-215`, `D-213` — every one confirmed present in `archive.md`, so they are historical links to landed work and renaming them would break the only record that the work existed. **The `.ai-docs` half is not this row's**: the bible bans task ids there live or dead, so those citations are a deletion rather than a rename and belong to the task-id backlog. This row was the gate of the whole id cluster — the two rows behind it can now cite ids that will still exist when they run.
- **2026-08-22 — CLI-620, CLI-636, CLI-642, CLI-643, CLI-690, CLI-691, CLI-701** (cli.md) — Seven documentation rows batched, all verified against the tree first. **Two were closed by DELETING the claim rather than correcting it, and both arguments are worth keeping.** `factories.md`'s summary counts went entirely: they sat directly above three rosters that ARE gate-bound, so the two read alike while only one could go red — which is precisely what produced the 12-against-8 divergence — and the drift checker's own docblock makes the argument (_"Two lists can agree on a total and disagree on every name in it"_). `infrastructure.md`'s `helpers/` listing went the same way: at 46 files it had crossed the size the document itself already calls undriftable one section down, and the membership claim already has an ENFORCED home in `factories.md` bound to a directory walk, so a second unbound listing was a second claim that could disagree with the gated one. **CLI-642 clause 2 was deliberately NOT executed**: the staged move between two documents is not a contained edit — it forces renumbering four sections, a header count, frontmatter keywords and two back-references — and `leaf-exports.md`'s own disposition rule says an entry moves on a FULL validation pass, which this was not. The self-referential loop was cut instead, leaving a plan where plans belong. **CLI-701 surfaced a contradiction inside one document and resolved it by measuring rather than arguing**: `assertions.md` already sanctions `expect(error?.message).toContain(...)`, so an unqualified ban would have contradicted its own example — run, that form produces `the given combination of arguments (undefined and string) is invalid for this assertion`, so it fails loudly rather than vacuously, and the new section says exactly that. **One brief premise of mine was wrong**: I told the lane `buildConfigTypesBackgroundData` might have been deleted; it exists, is exported, and has three importers — the row held for a different reason, that a table headed "now in `config-gate/`" was labelling a `configuration/` export private. Spawned CLI-711, CLI-712, CLI-713.
- **2026-08-22 — CLI-686** (cli.md) — The unit suite's result depending on the developer's shell. **Fixed structurally — `chalk.level = 0` pinned in `vitest.setup.ts` — and the reasoning for structural over narrow is the part worth keeping.** Three reasons, in weight order. (1) `source-grid.test.tsx`'s three failures are **unrepairable narrowly**: they are whole-frame inline snapshots whose stated subject is LAYOUT — gutter width, column alignment, block separation — and there is no escape-tolerant form of a layout snapshot; the only narrow repair available is disabling colour for them, which is the structural fix applied piecemeal. (2) **The codebase already stated this policy and implemented half of it** — three `describe` blocks in that same file force truecolor deliberately and restore it, with a comment saying chalk disables itself on vitest's non-TTY stdout. So the opt-in was pinned and the default was **detection rather than a decision**, resting on stdout not being a TTY, which `FORCE_COLOR` overrides. (3) **The assertions are not the defect**: `step-confirm.test.tsx` proves it inside one `it` — line 121 fails and line 123 passes, because a single token lands inside one chalk span. Bolding a word in the component would flip a passing assertion red with no behaviour change. `chalk.level` was chosen over the env var because this harness is in-process and the assignment is order-independent, where an env var depends on `supports-color` not having been imported yet. Verified Ink and the setup file resolve **one** chalk instance. **Both ways now identical: 202 files / 7129 tests, `FORCE_COLOR=3` and `FORCE_COLOR=0`.** A brief correction worth keeping: 13 unit files render Ink, not 14 — the 14th is collected by the integration project, which the brief's own measurement command could not have reached. Spawned CLI-708, CLI-709, CLI-710.
- **2026-08-22 — CLI-696** (cli.md) — One unescaped pipe deleting a whole journey row. **Escaping it alone would NOT have fixed anything, and that is the finding.** `tableCells` split on a bare `"|"`, so `\|` still yields six cells — written the way the row described, the page would have been correct markdown and the new gate would have condemned it. The reader had to become escape-aware first: `const CELL_SEPARATOR = /(?<!\\)\|/` plus an unescape, so it agrees with every renderer of the same page about where a cell ends. **My framing was also wrong in a way that matters: the six specs read as UNJUDGED, not unclaimed.** The spec→row gate uses a raw page-text scan, so all six were claimed and none appeared in the backlog — what was broken is that the three ROW→SPEC gates never saw row 11 at all. Six specs named by the page and judged by nothing. Parsed rows 43 → 44. **The gate makes row classification total the way name classification already was**, and lives in `journey-page.ts` rather than the spec, per the no-parser-in-a-test-file rule: `journeyNumbersIn` reads the `#` column alone and is deliberately blind to everything else a row must satisfy, so **the difference between the two readings IS the silence**. Both go through one line scan so they cannot disagree about which lines are rows, and journey tables are identified by their HEADER cells rather than their width — the four-surfaces table numbers its rows 1–4 too, so discriminating by column count would condemn it while being blind to the subject. Red-first, then a planted `| 42 |` row reproduced the failure and named it. Each new unit assertion mutation-proved individually: one test red per mutation, never more. Spawned CLI-706 and CLI-707.

- **2026-08-22 — CLI-700** (cli.md) — **Withdrawn: the subject never existed.** The row said `interactive/init-wizard-discouraged-label` belonged to no journey and was missing from the backlog roster, leaving `spec-gates` red at 151 against an expected 150. Verified three ways: the file is not on disk, `git log -S 'discouraged-label' --all` returns nothing so it has never existed in history, and `spec-gates` was **green before anything was touched**. What the wizard-compatibility lane actually landed is a third `it` INSIDE an existing spec file, not a new file — and that host file is already on the backlog roster. **The lane stopped on the row and reported it rather than widening the roster to make an imagined red go away**, which is the behaviour the re-derive rule exists to produce. A verifier's own finding, filed by me without re-deriving it. The genuinely interesting residue: the host file sits in the backlog today despite driving the real binary through a PTY and asserting a rendered advisory a user reads — that belongs to CLI-613.
- **2026-08-22 — CLI-698** (cli.md) — The ugrep census hazard, rewritten to carry NO cause at all. **My third diagnosis was wrong too, and the lane refuted it in both directions rather than accepting the brief.** Not sufficient: a pattern holding `[^]]` matches perfectly. Not necessary: one holding no bracket character in any class returns 0 at exit 1 where GNU grep returns 1. So an author told to avoid `[^]]` writes `[^>]` and lands in the same failure — the identical shape of error as the two versions before it. **Three further corrections, all mine or the bible's.** `-P` is NOT a universal remedy: it repairs the silent hazard but errors identically to `-E` on the brace case, so `-F` is the only spelling covering both. The existing bible note was not merely insufficient but WRONG — an escaped brace under ERE works fine, and that failure is LOUD (exit 2, stderr), only becoming silent when a census pipes to `wc -l`. **And the shim is a shell function that does not cross into a child interpreter**: pasting the isolation into a script and running it under bash gives four clean matches, so anyone verifying from a script concludes the hazard is fictional. Nothing in `packages/cli` is exposed — no script, gate or spec shells out to grep. **The note now states the observable signature, four verbatim commands with outputs, the counter-examples that retire causes two and three, the shell-scope caveat, and one rule — a census is `-P` or `-F`, always — with an explicit instruction to the next author NOT to write down a cause.** Five findings repeating the old causes were reported and deliberately left, per the dated-records ruling. Every live census command in `.ai-docs/standards/` and both `CLAUDE.md` files was verified against GNU grep as an oracle: **none is currently silently broken.** No finding was written, deliberately — a finding would be a fourth dated record of a cause, working against the standard it documents.
- **2026-08-22 — CLI-695** (cli.md) — The tension between the findings index's deletion protocol and the new dated-records ruling. **Owner ruled: stale findings should still be removed — the protocol stands, and the row closes with no change to `INDEX.md`.** The two rules are separate acts and both survive: the reading rule governs a finding you are LOOKING at (its body describes the tree on its own date; do not rewrite it to match today's code, and do not open a tracker row against it for having been overtaken), while deleting a finding outright is CURATORIAL and stays permitted. The lane that found this deliberately wrote the reading rule and left the deletion protocol alone rather than reconciling them itself, which was the right call — the reconciliation was the owner's to make and it went the other way from the reading it flagged.
- **2026-08-22 — CLI-681** (cli.md) — Twenty-four exported symbols invoked only by tests. **Roster down from 23 to 3, on the owner's ruling: remove the function, then test what the product actually does for that job — E2E for a flow, unit for a pure function.** Verdicts: 4 were (a) dead-and-unwanted, 18 were (b) dead-but-the-job-is-real and had their specs repointed onto the live path, 1 was (c). **The four selection predicates were the point, and the finding under them is that the wizard does nothing about compatibility except RENDER it.** `toggleTechnology` consults no compatibility rule at all — its guards are about scope and about the last skill in a required exclusive category, and the exclusive arm is pure array arithmetic, so a user may select any incompatible combination they like. Compatibility is advisory and lives entirely in the grid. It was already covered at two layers — derivation in `build-step-logic.test.ts` and the scenario contract, rendering in `category-grid.test.tsx` — **with exactly one join missing: nothing connected a `discourages` rule in a source to the word `"(discouraged)"` a user reads.** That is the gap the six `isDiscouraged` specs read as covering. The new E2E was proved by mutation (discouraged arm returning `null` → red on the rendered text) and went into an existing file, because a new spec file would have needed a journey row in another lane's document. **Two brief claims refuted with evidence rather than worked around:** marketplace removal is not a shipped behaviour — no command removes a marketplace, and `claudePluginMarketplaceRemove`'s posture became `test utility` because the SUITE is the caller that creates marketplaces, so deleting it would have destroyed real harness capability; and `getCollectivePluginDir` composes a directory only test helpers build. Hand-run confirmed both repointings end to end at a real terminal — `│ Nuxt (incompatible) │` through `getCellState`, and `"projects": []` after an uninstall through `mutateGlobal`. Spawned CLI-702, CLI-703, CLI-704, CLI-705.
- **2026-08-22 — CLI-603, CLI-604, CLI-609, CLI-638** (cli.md) — Four green-for-the-wrong-reason rows verified DONE and deleted. **CLI-603**: all three uninstall cancellations now pin `toBe(EXIT_CODES.CANCELLED)` with a permitted `SUCCESS` control beside them — the row's "pick deliberately" was picked, and the file's docblock argues call-site pins over a funnel. **CLI-604**: renamed to what it proves; the old name survives only in a docblock explaining the change. **CLI-609 and CLI-638 were the same underlying work** and were closed together by `toggleListRowUntilRendered` — both page-object presses now carry `posture: "confirmed-on-row-text"` in the gate roster, and CLI-638's fix landed at the CALL SITE with the refusal sentinel rather than by widening a wait, exactly as its row required.

- **2026-08-22 — CLI-632** (cli.md) — `COMPILED_WITH_FAILURES` landed in `STEP_TEXT`, both bound documents carry it, drift check green, and it is consumed by a real spec. **The row's "one commit closes all three" was WRONG**: journey 37 is now covered, but 39 and 41 remain `TO TEST` for reasons that are not a missing sentinel — 39 has an unreachable toast producer, 41 has no specs at all. Deleted rather than rewritten; the residual belongs to those journey rows.

- **2026-08-22 — CLI-616** (cli.md) — The skipped-spec gate landed and is green, and the offender it was built against is fixed. Census residual verified thin rather than assumed: `it.todo` was ruled out by the gate's own docblock, and both `skipIf` families are **genuinely conditional** — `which claude` resolves and the skills source holds 238 entries on a normal machine, so the 48 + 2 conditional skips are real conditions rather than hidden skips. Three `it.todo`s remain in one spec and deserve their own row if anyone wants them.

- **2026-08-22 — CLI-683** (cli.md) — The self-defeating-checker note. Verified already written, in the place an author writing about the rule actually opens: `documentation-bible.md` carries _"Backticking a citation does not turn it into prose, and that is the one worth reading twice"_ plus the consequence — the checker's own test assembles its fixture citations at runtime for exactly this reason. Remedy satisfied verbatim; deleted on the DONE path.

- **2026-08-22 — CLI-640** (cli.md) — Folded into CLI-647 rather than rewritten. Its fix had landed (both `?? {}` deleted, both `it`s renamed from "no stack" to "an empty stack"); what remained was an untriaged census, which is CLI-647's whole subject. Keeping both would have invited a second lane to re-run the same scan. **The census is far larger than either row states — 522 hits for `expect\([^)]*(\?\?|\?\.)`, of which only the `??`-plus-falsy-literal subset has been triaged.**

- **2026-08-22 — CLI-625** (cli.md) — Deleted, superseded by CLI-698. **The row's measurement was wrong, and so was the replacement measurement recorded here when it was deleted — that correction is itself now retired.** Three causes have been stated for ugrep's silent zero and all three are false: "it does not match a literal parenthesis" (spread to four briefs), "a `)` inside a negated bracket expression" (spread to every brief of 2026-08-22), and "`]` as the first member of a negated class" (recorded in this entry). The third fails in BOTH directions: a pattern holding `[^]]` matches perfectly, while one holding no bracket character in any class returns 0 at exit 1 where GNU grep returns 1. **The standing rule now carries no cause at all: a census is `-P` or `-F`, always.** A cause invites the reader to judge their own pattern exempt, which is how each wrong version sent an author into the failure it warned about.
- **2026-08-22 — CLI-666, CLI-667, CLI-668** (cli.md) — All three closed by one owner ruling: **a finding is dated evidence, not a live claim.** Its body describes the tree on its own `date:` and stays as written however far the code has moved; a finding that no longer matches is neither stale nor a defect, and correcting its body destroys the only record of what was observed and replaces it with a fresh claim that rots on the same schedule. **The rule went into `agent-findings/README.md` as a `## Reading a Finding` section — not the three homes the brief proposed.** That file is the directory's actual front door (`DOCUMENTATION_MAP.md` routes readers there, `agent-suggestions/README.md` defers to it) and it already owns the authoritative definition of `status:`, which is exactly the boundary the new rule draws — splitting them would have created the disagreement the brief warned against. Four pointers, no restatement: `TEMPLATE.md` at the moment an editor has the destructive act available, `INDEX.md` before its grade table, `documentation-bible.md`, and `DOCUMENTATION_MAP.md`. **The rule half-existed and was loose in a way that mattered**: the bible already said findings are _"not maintained, not re-validated"_, which read literally covers `status:` too — the opposite of the truth. **`status:` was verified live rather than assumed**, from git: one finding carried `open` → `superseded` → `resolved` across five weeks against a body that never changed. `resolved_by:` and `affected_files:` are dated, not live — a distinction that matters because one of the three rows was a measurement sitting inside `resolved_by:`. Spawned CLI-695.

- **2026-08-22 — a correction worth keeping, from the same lane** — it reported the new metadata refusal as shipped without an assertion, on `grep -rn 'unknownMetadataSlugRefusal'` returning only the declaration. **False positive.** The refusal is pinned, by a refused/allowed pair in `source-validator.test.ts` asserting the message through `validateSource` — the author's own slug named, `custom: true` present, no catalogue slug dumped, plus the accepted case beside it. Asserting the behaviour through the real path is the BETTER pin than calling the function by name, and it is invisible to a grep for the symbol. Same class as grepping a proxy rather than the thing.
- **2026-08-22 — CLI-675** (cli.md) — The kebab-case rule stated twice in `schemas.ts` with the two spellings disagreeing. **Fixed as a side effect of the `custom: true` work, which is the right place for it** — `customMetadataValidationSchema.slug` is the check `custom: true` actually routes through, so a lane about to send every fixture skill down that path had to fix it first. `/^[a-z][a-z0-9-]*$/` now reads `KEBAB_CASE_PATTERN`, so `acme-` and `acme--skills` are refused by both spellings rather than admitted by one and declined by `build marketplace`. The pin that recorded it, `ACCEPTED_ONLY_BY_A_SECOND_SPELLING`, was retired in the same change — which is what the row asked for: fixing the product reddens the pin and retires it out loud rather than silently.

- **2026-08-22 — CLI-646** (cli.md) — **Closed as NOT A DEFECT, on the owner's dispute, and the dispute was right.** The row claimed a plugin uninstall left `enabledPlugins` populated. A real install→uninstall clears it to `{}`; only HAND-WRITTEN state survives, and the CLI never produces hand-written state. The finding had been measured on a fixture rather than on the product, so every write it examined was an e2e fixture's. No regression was introduced and none existed. The row sat in the tracker carrying its own "CLOSED — NOT A DEFECT" text for a day, which is the delete-on-land rule failing in the one direction that looks harmless: a row nobody will action still reads as outstanding work to anyone counting.
- **2026-08-22 — CLI-644** (cli.md) — The closed union's METADATA half, unblocked by the owner's ruling that `custom: true` is the documented mechanism rather than an escape hatch. `metadataValidationSchema.slug` was `z.enum(SKILL_SLUGS)` with Zod's default text, which **reports the ~250 options and never the input** — so an author saw a wall of slugs and not the one they wrote. The finding had recorded this half as deliberately unfixed _because the answer decided the message's shape_; the ruling supplied the answer, so the message now names the mechanism: the slug is held to the catalogue unless the skill declares it is not from it, `custom: true` beside it in the same `metadata.yaml`, and it is how a skill outside the vocabulary is carried rather than a way around a check. Pinned by a refused/allowed **pair**, with the no-dump assertion reading a real member off `SKILL_SLUGS`. **`metadataValidationSchema.category` was deliberately left alone**: `custom: true` relaxes its schema but `mergeLocalSkillsIntoMatrix` still refuses an undeclared category, so a message pointing at the flag there would teach a falsehood. Hand-run three ways against a real marketplace at a namespaced slug — refused without the flag naming the slug and the mechanism, `1 marketplace validated` with it, and validated again from inside the marketplace repo. **Correction that outlived the row: `validate` is not a command.** It exits `UNKNOWN_COMMAND` and a spec pins that it no longer resolves — both this row and my brief said the strict schema is reached through `validate` and `doctor`; it is `doctor` only, via `validateInstalledSkillMetadata` and `source-validator.validateSource`. **`custom: true` is documented NOWHERE** — zero occurrences across `apps/www`, both READMEs, and present in `.ai-docs/` only as internal schema reference. `creating-a-marketplace.md` has a section headed "Name your skills for your marketplace" that documents the id rule and says nothing about slug, so an author who follows it exactly writes a silent collision. Exact replacement prose is in the report; a docs pass is owed. Spawned CLI-692, CLI-693, CLI-694.
- **2026-08-22 — CLI-673** (cli.md) — `output-validator.ts` deleted entirely on the owner's ruling. **The module's two substantive checks were wrong for this codebase and the mechanism is worth keeping.** `checkXmlTagBalance` returns `valid: false` with five errors on the real installed `cli-developer.md`, where `grep -o` counts open == close for all five tags: its 10-character backtick window means `</write_verification_protocol>` sits three lines below a closing code fence whose last backtick falls inside the window, so the CLOSE is skipped and the tag reads unclosed — and `<critical_reminders>` is the exact inverse, the OPEN skipped and the close reported extra. **A proximity heuristic that skips tokens near a marker skips opens and closes asymmetrically, so it can never sit inside a balance count.** `checkTemplateArtifacts` matched the inner braces of `${{ … }}`, content `sanitizeCompiledAgentData` passes through deliberately. The two sound checks are covered — **but not by the matcher the brief named**: `toHaveCompiledAgent` only checks the file exists and starts with `---`; the frontmatter parse and the `name` comparison are `toHaveAgentFrontmatter`'s, at two call sites asserting it across the whole roster. Nine `.ai-docs/` sites reported for a following docs pass, none gate-blocking. **The generalisable lesson, and the reason this shipped:** the module had 66 green unit tests and had never once been run against a real compiled agent — every test used synthetic single-line strings, and one assertion against any file in `~/.claude/agents/` would have failed on day one.
- **2026-08-22 — CLI-651** (cli.md) — `moduleCache: false` in `config-loader.ts` kept, with the comment it never had. Owner ruled: do not keep the converted config. **The rationale was MEASURED rather than asserted, which the row had asked for and no prior pass had done.** Instrumenting `loadConfig` and `writeFile`: `compile` at project scope loads `config.ts` **8 times through 8 distinct stacks** — not the 4 the brief claimed — four direct and four arriving through libraries the command calls. And the half the rationale actually turns on: tracing `init-wizard-stack.e2e.test.ts` gives, per project directory, `WRITE read WRITE read read` on the same file. That is the staleness hazard directly. The comment states the decision rather than what `false` means, **carries no count** (a count in a comment rots the way a count in a brief does) and says the alternative's saving "has never been measured, and its ceiling is a few hundred milliseconds" rather than asserting a figure nobody has taken. Dated to the 2026-02-28 YAML→TypeScript migration, `false` in that commit's own diff — so the alternative had never been tried.
- **2026-08-22 — CLI-669** (cli.md) — `extractStack` moved out of its spec into `__tests__/helpers/compacted-stack.ts` with its own tests, on the owner's ruling (move it, rather than write an exception into the rule). **Half of it already existed and was built on rather than duplicated:** `extractNamedSection(source, "stack")` in `config-source-sections.ts` already slices the declaration out as text; nothing parsed it into data. **The brief's proposed mutation was wrong and the lane said so with evidence:** inverting `compareNamesInCodeUnitOrder` so `canonicalizeStackOrder` emits keys reversed left the spec at **3 passed** — it indexes the stack by key and asserts nothing about key order. What the spec actually guards is `compactAssignment`/`compactCategoryAssignments`, the bare-id and bare-exclusive-value forms; mutated there it gives **2 failed / 1 passed**, with byte-identical assertion messages before and after the move. That identity is the proof the move changed nothing. The helper's own 7 tests were mutation-proved too. A paragraph was added to the spec's JSDoc pointing at the helper, so the next reader does not "fix" it onto `loadConfigOrFail` and silently delete what the spec checks. Spawned CLI-690 and CLI-691.
- **2026-08-22 — CLI-623** (cli.md) — A gate flagging tracker rows that cite a symbol which no longer exists. **Dropped on the owner's ruling, and the measurements are why.** The row's PREMISE held — `check-finding-citations.ts` checks only finding basenames and nothing resolves symbol names, so the scoping rule genuinely fails. Its MECHANISM was refuted: the row said the useful signal is a symbol that USED to exist, _"which git can answer"_. Git answers a different question — `git log -S` and a patch scan match a name in **any removed line, anywhere, ever**. Measured across `todo/`: 1754 cited, 517 absent today, 117 git says existed; narrowed to live trackers, 258 cited, 20 absent, 17 flagged. Read by hand on the most favourable scope, **at most 4 of the 17 are the defect — ~24% precision.** And the misses land in exactly the class the scoping rule promised to spare: five flagged names are accessors a row ASKS SOMEONE TO WRITE, and the filter selects for documents whose job is recording a removal — `archive.md`, a source-switching removal map, and a row flagged by a sentence whose own words are _"a type that no longer exists"_. Two of the five dispatches the row cited as motivation flag whether their rows are right or **wrong**. No gate was built, deliberately: a 24%-precision check over `todo/` acquires an exclusion list in its first week and then measures nothing.
- **2026-08-22 — compiled-agent structural coverage** (owner-approved, plus CLI-684) — Two pieces of coverage the compile path never had, sharing one tested parser. **The partition check replaces a dangling-skill regex that was structurally blind:** `^\s*-\s+([a-z0-9-]+)\s*$` has no colon in its class, so across the ten real agents in `~/.claude/agents/` it matched **zero** plugin-mode preloads while false-matching prose bullets (`web-developer`, `api-developer`, `my-agent`) as skills. The replacement derives its expected value from the loaded config and reddens in all three directions — rendered-but-not-assigned, assigned-but-not-rendered, and on the plugin-mode preload the old one could not see. **Unit side asserts what nothing asserted before: dynamic membership AND ORDER**, the property the stack-ordering defect actually broke. Four mutations, each reddening exactly what it should — swapping two dynamic skills, moving one skill across the split, and two PRODUCT mutations rebuilt through the real template (changing the dynamic heading to the ref form, and moving a section). **The heading/invoke asymmetry held exactly as briefed** and is now proven three ways: a dynamic skill's heading is the bare id even in plugin mode, and only its `Invoke:` line carries the ref. `hasActivationProtocol` deleted (5 sites — it passed on `protocol OR note` where the template renders a strict if/else, so one is always present); `skillIds`/`noSkillIds` made structural, the fix `toHaveConfig` already had and this matcher did not. **The claimless spec got a real claim** rather than just a deletion: `compile.e2e.test.ts`'s fixture writes no stack, so its agents carry zero skills — it now pins that the one local skill the same run DISCOVERS is swept into neither list. Hand-run confirmed byte-identical compile output; the diff touches no production path. **A brief correction worth keeping: a `parseCompiledAgent` already existed** and I did not know — it is broken two ways against the shipped template and latent only because its one caller renders a mirror template. Spawned CLI-686, CLI-687, CLI-688, CLI-689.
- **2026-08-22 — CLI-658** (cli.md) — A gate for the exported symbol only tests invoke. **The brief's central premise was false and disproving it is the whole value: the tree is NOT clean of this class.** I wrote that CLI-657's deletions had closed it; the gate finds **25 instances — 24 live defects plus one by-design exception — with 25 of 25 surviving exact-grep verification and ZERO false positives.** The cause is the one my own brief named without following through: CLI-657's census counted **references rather than invocations**, `installEject` and `installPluginConfig` were caught by hand when a barrel re-export and a `{@link}` were noticed, and **the systematic re-scan was never redone**. 22 of the 24 were hidden that way the whole time. Reader is AST-based deliberately — that is what tells the three defect shapes apart, since a doc comment contributes no identifier, an export specifier is a different node from a reference, and a bare name in an argument list is an ordinary identifier. **Four plants run simultaneously**, so the two green shapes are proved in the presence of a working detector rather than against a gate that had stopped reading; both subject guards were also driven red on purpose. Run twice, before and after the expressive pass touched the traversal, with identical results. **The oversized exception table was weighed against the brief's own warning and correctly rejected as evidence the rule was wrong** — split by posture into one decision and 24 backlog rows, following `spec-gates.test.ts`'s precedent that a backlog is not a verdict. Nothing was deleted: delete-vs-wire is a per-symbol ruling, and CLI-657 is the evidence, where `installEject` differed from the live path in four ways. Six shapes deliberately left ungated with reasons, all erring toward false negatives. Spawned CLI-681, CLI-682, CLI-683.

- **2026-08-22 — full gate run after the eight-lane round** — All five unfiltered, one clean sequence on a freshly built `dist`: `typecheck` ✓ · `lint` ✓ · `format:check` ✓ · `test` **203 files / 7251 tests** ✓ · `test:e2e` **243 files / 896 passed, 7 expected-fail, 3 todo** ✓. Worth recording because **every per-lane gate run that day was taken while another lane was rebuilding `dist`**, and four lanes independently reported transient failures in files outside their own diffs — `exit 127`, `Warning: init is not a agents-inc command`, and a spec asserting on a directory another lane was writing. All cleared. The lesson is the one CLI-671 files: a stale or half-written binary is indistinguishable from a regression to the E2E runner, so a multi-lane round needs one clean serial run at the end and the per-lane runs are not it.
- **2026-08-22 — docs pass over the deleted symbols** (spawned by CLI-657) — **51 stale sites across 16 files, not the ~40 my brief estimated**, and the brief's symbol list was short by five: `writeConfigAndCompileAgents`, `compileAndWriteAgents`, `EjectInstallOptions`, `PluginConfigResult` and `compileAgent()` went with the twelve and carried 6 further sites the brief's regex could not see. Final census returns **agent-findings hits only**. Deletion was the default and three passages went wholesale — an entire _"Install-Tail Recompile Path"_ section documenting a second recompile surface that no longer exists in any form, a five-row table of test-only compiler primitives, and `boundary-map.md`'s Local Installer write table, since that module now imports no `fs` surface at all. **The validator claim was rewritten rather than deleted, deliberately**: `compilation-pipeline.md` now carries a section headed _"Compiled Output Is Not Validated"_, and the parallel claim in `agent-system.md` — which said validation _"runs only on the legacy `compileAllAgents` path"_ — was corrected the same way. A doc that quietly stopped mentioning validation would have read as though it were happening. **Two analyses got STRONGER rather than weaker:** `buildCompileAgents` and `writeScopedFromWizard` each now have exactly one production caller, and both docs say so. All 46 repointed symbols were re-verified as the last action before reporting, per the concurrent-deletion rule. `last_validated` was correctly left unmoved on all 17 files — a partial pass does not revalidate a document. **`formatStepLabel` had zero doc sites**, so one row of the brief was work that did not exist. Spawned CLI-679 (nothing gates a markdown symbol against source — the gap that let 51 sites accumulate) and CLI-680, and extended CLI-674 with four further orphans.
- **2026-08-22 — CLI-660** (cli.md) — Two store guards unreachable, two specs pinning them, and the reachable refusal asserted nowhere. **The mutation contrast is the finding, and it is now on record:** with the COMPONENT guard's early return deleted, the new E2E refusal goes RED (`timeout waiting for "Scope toggle unavailable in global context"`) while the two old store specs stay **GREEN** — because the store guard sitting behind the deleted component guard refuses identically. `getScopeBadgesForSkill` cannot see it either; only the toast can, and only the component guard emits it. **Both store specs deleted; the store GUARDS deliberately kept**, each now carrying a comment saying it is unreachable, why, and where the reachable refusal is asserted — so the next reader "restoring coverage" does not re-create the inverted pin. Deleting the guards would have been a product change the brief did not ask for. `STEP_TEXT.SCOPE_TOGGLE_BLOCKED` added, plus `toggleScopeOnFocusedSkillAwaiting` on `BuildStep` — unavoidable, because every press/wait primitive on `BaseStep` is `protected` and no `s`-key awaiting method existed. **The shared four-line body was deliberately NOT factored out** of the two `*Awaiting` methods: `page-object-space-presses.test.ts` attributes each press to its owning member by name, and collapsing them would move a press onto a helper and defeat that roster. **A cross-lane result neither lane staged:** the concurrent toast gate has a second half asserting every painted toast is named by some sentinel, so it was **already red** on this string before the constant existed — the constant retired a live failure rather than merely being picked up. Refusal paired with a permitted case in the same file, reading the same two observables. One judgement call recorded: neither half asserts config state, because neither completes the wizard, so an "unchanged config" pin could not redden for the guard's reason — the arity/absence anti-pattern, correctly declined.
- **2026-08-22 — CLI-661** (cli.md) — A spec asserting an end state without establishing the precondition it was named for. **Red demonstration, both shapes in one file:** with `toggleTechnology` mutated so a deselection silently never happens, the spec's shape BEFORE repair stays **GREEN** while the repaired spec goes **RED** — `selectSkill: the cell labelled "E2E React" still renders "…" after N Space press(es)`. Repaired at the assertion via the closed-loop `selectSkill`, not by widening a wait, per the CLI-638 ruling. Hand-run through a real PTY confirmed the three flows, including the empty-category case: `Framework count before: 1` → `after: 0`, Sources rendering `- E2E React` and the footer warning. **A harness detail worth keeping:** the mutated failure was initially illegible because the wait budget is `TIMEOUTS.WIZARD_LOAD` (45s) while the project's `testTimeout` is 30s, so the runner killed the wait before it could name the string it was waiting for. Fixed by widening the runner's patience on that `it` — **the wait budget itself is unchanged**, which is the distinction that keeps this from being the wait-widening the ruling forbids. Spawned CLI-677 and CLI-678.
- **2026-08-22 — CLI-663** (cli.md) — `TOAST_KEYS` hand-written as a subset of the toasts the product paints. **Replaced with a derivation from what the product actually paints**, rather than a corrected list — plus a second assertion holding the _unresolvable_ toast expressions against a stated roster, so a toast turned dynamic reddens instead of silently shrinking the population. **The roster was short by two, not one, and the second is a collaboration artefact worth recording rather than a census miss:** `SCOPE_TOGGLE_BLOCKED` is absent from HEAD and was created by the concurrent CLI-660 lane _during_ this one's run. The derived roster picked it up with no edit — which is the end-to-end proof the brief asked for and could not have been staged. Both planted probes reddened the fixed gate and neither could have under the old roster; the negative control matters too, since `STEP_TEXT.SCOPE` is a substring of the scope-toggle toast and exact matching is what keeps a step heading out.
- **2026-08-22 — CLI-664** (cli.md) — A gate for the hand-written roster of producers. **Landed as `producer-rosters-are-derived.test.ts` with an EMPTY exception table** and a docblock saying that is the state to keep it in. 447 specs scanned, 2 producer rosters found, both now derived. **The brief's proposed recogniser was wrong in the way the brief itself predicted and in one more:** keying on "no glob in the file" would have missed `toast-assertion-surface.test.ts`, and the wider census showed the enumeration grep returns ~110 constants across 25 files rather than the ~10 the brief claimed — about ten _files_ have producer agreement as their subject, but the grep does not select them. **`kebab-name-judges-agree.test.ts`'s false docblock was HONOURED rather than deleted, and that is what found CLI-675:** made to hold its roster against a behavioural scan, it immediately surfaced a fourth judge already in the tree with a hand-rolled regex. Preferring deletion is the default, not a rule — here the claim was worth making true. **One shape was deliberately left ungated, with measurements**: a hand-written subset of a declared enumeration returns 31 hits of which one is the defect, and narrowing to one-directional checks returns 6, one of which is _correctly_ one-directional by design. Ungated shapes are named in the report rather than written into an exception table, on the grounds that a table listing shapes the gate never reaches is a table nobody maintains. Every scanner lives under `__tests__/helpers/` with its own fixture tests; 21 permanent fixtures across the three readers. Spawned CLI-675 and CLI-676.
- **2026-08-22 — CLI-657** (cli.md) — Eleven exported symbols with test invocations and no production invocation, carrying 116 test calls. All twelve deleted — a **twelfth**, `buildEjectSkillsMap`, was orphaned by the first deletion since `installEject` was its only caller. `grep` for all twelve across `src`, `e2e` and `scripts` now returns **0**. **`installEject` was verdict (b): the live path genuinely DIFFERS**, in four ways — the agent roster (`loadMergedAgents(sourcePath)` vs the CLI-only `loadAgentDefs()`), the skills handed to compilation (`content: \"\"` stubs vs `discoverInstalledSkills`), the failure posture (throw on first failure vs report-and-prune), and `ensureBlankPair()` plus the `GateReport`, which `installEject` discarded entirely. Differences 1–3 were **inert or mocked into inertness** in the specs, which is why the config claims transferred intact and only four test claims moved; each is named in the report. Two tests were **relocated rather than deleted** — the `compileAgentForPlugin` plumbing pair now sits on the live forwarder in `write-compiled-agents.test.ts`. Four assertions were **strengthened** en route, per the count-vs-members rule: two `toHaveLength` roster checks became `toStrictEqual`, and both `hasKeptEntries` sites now pin the other half empty, which caught that a catalogue keep leaking into an authorship test satisfied the old assertions. A new shared helper `__tests__/helpers/install-through-operations.ts` landed with its own test and a docblock stating why it is not a second `installEject` — it exists only in the test tree, so it cannot become a production entry point. **Three gates the brief did not name went red and were fixed**: the vendored matrix copy, `check-enumeration-drift` over `factories.md`, and `config-types-agent-defs-agree`, whose roster carried a row justified by these symbols being dead. Hand-run through the real binary: `compile`, `doctor`, `list`, `eject skills` (237) and a 120-column `edit`. Spawned CLI-673, CLI-674 and a docs pass over ~40 sites. **Corrections: nothing in the brief proved false** — all eleven symbols verified, and both stated caveats (barrel re-export, `{@link}` reference) held exactly.
- **2026-08-22 — CLI-659** (cli.md) — Thirty-nine assertions reading their expected value out of the same table the component reads. **The mutation is the whole proof and it is unambiguous:** with `WIZARD_STEP_LABELS.build` mutated `\"Skills\"` → `\"Skillz\"`, the OLD assertions gave **25 passed — nothing detected**; the new ones gave **13 failed**. Among the 25 that stayed green were tests named _\"should render current step label\"_ and _\"should include step labels\"_. The failure message is the evidence a reader needs: `expected '┌───…' to contain 'Skills'` against a bar rendering `Skillz`. Remedy follows the `WEB_DOMAIN_AGENTS` precedent — a `WIZARD_TAB_LABEL` constant spelled out in the spec and `as const satisfies Record<WizardStep, string>`, so a change to the step union reddens the constant's own line rather than silently widening it. `formatStepLabel` deleted. Verified by hand at 120 columns: the tab bar paints `Stack  Domains  Skills  Sources  Agents  Confirm`, matching the literal table character for character.
- **2026-08-22 — CLI-662** (cli.md) — Two seed fixtures encoding a payload the product refuses to mint. **The briefed approach was refused with evidence and the alternative is better than either option offered.** Auto-pinning the `agents` map (my first candidate) would have DELETED the subject of four specs in `seed-to-wizard.test.ts` whose subject IS the sparse map — one comment reads _"api-developer has no entry at all: the map is sparse, and absence is the default too"_ — and in the global-skill cases those assertions would have kept **passing**, which is the exact green-for-nothing failure the round exists to remove. What landed instead: `buildSeedSkill` defaults `scope: DEFAULT_SELECTION_OPTIONS.scope` **read from the shared constant rather than written as `"global"`**, so a skill and a sub-agent both resting at the default are writable _for any value the default takes_ — structural rather than lucky. **Both instances were red first**, with the messages recorded. Cost: `scope: "project"` stated at 32 sites across 10 E2E specs that all already pinned their agents to project, several saying so in a comment — left alone they would have installed globally while most assertions still passed, including one spec literally named _"installs a payload with nothing global into a clean project"_. Refusal fixtures measured directly rather than assumed: both routes to the refusal survive, the resting one and the explicitly-global one, which is the distinction that spec exists to draw. Census moved from 44 to 78 of 84 `buildSeedSkill` calls stating a scope. **A brief correction worth keeping:** `PINNED_TO_PROJECT` is not a shared constant — 7 local declarations, 0 imports — and an earlier archive entry describing it as shared is what I carried into the brief. Spawned CLI-670, CLI-671, CLI-672. Standard already existed and had simply not been extended to the wire payload: `standards/e2e/test-data.md` § _"A Fixture Writes Content the Product Could Have Written"_.
- **2026-08-22 — CLI-598** (cli.md) — The census of sixteen `Status: Done` rows that were never deleted or archived. All sixteen now have verdicts and are gone: **eleven LANDED**, **three MOOT**, **two PARTIAL** and deleted anyway because their residuals have owners. **The row was more accurate than the brief I wrote from it, and that is the lesson.** CLI-598 already carried the three-state model including MOOT, already named CLI-352 and CLI-346 as appearing in `archive.md`, already had CLI-323 right, and flagged CLI-357 as UNVERIFIED rather than asserting a verdict. My dispatch asserted that **none** of the sixteen appeared in `archive.md` — flatly false, and false about exactly the two entries that settle CLI-352 and CLI-346, because my check matched only an item's OWN archive line and those two are named inside other items' entries. A verifier following the brief would have been sent past the strongest evidence in the pass. **Re-deriving is not a licence to discard what the row already established** — the correct move was to carry CLI-598's findings forward as claims to test, not to replace them with a fresh spot-check. Spawned CLI-669.
- **2026-08-22 — CLI-338, CLI-339, CLI-340, CLI-341, CLI-342, CLI-343, CLI-344** (cli.md) — Seven E2E rows on `build plugins` / `build marketplace` version bumping, verified individually rather than as the batch they were written as. The spec the rows name (`e2e/commands/plugin-build.e2e.test.ts`) no longer exists; its successor `plugin-build-versioning.e2e.test.ts` cites the range in its docblock and runs **13 passing tests**. Each row's specific assertion was matched to a covering `it`: initial `1.0.0` across all ten skills by `toStrictEqual`, the single-skill bump, the idempotent no-change run, the marketplace listing, the post-bump refresh, and the per-entry field set. **CLI-341 shares CLI-339's `it` deliberately** — the strict-equal runs over every `E2E_SKILL_ID`, so "only the modified one moved" is exactly what carries the red. **CLI-344's `category` half needed the adversarial look and passed it:** its docblock still describes the field as a live gap and says the assertion is _"expected-fail rather than deleted"_, but the `it` is a plain `it` and it passes — the gap closed in `4885e5ae` (`marketplace-generator.ts` emits `manifest.category`) and the `it.fails` was flipped back in the same commit. The stale docblock is the only residue.
- **2026-08-22 — CLI-355** (cli.md) — ESLint `reportUnusedDisableDirectives`. Landed at `eslint.config.js` as `linterOptions: { reportUnusedDisableDirectives: "error" }`. **"The setting exists" is not "the setting fires", so it was proved rather than read:** a planted unused directive run through `ESLint.lintText` against the real config reports at severity 2 in BOTH `src/` and `e2e/`, and `eslint .` exits 0 with no output — so the tree is clean under a rule that demonstrably reaches it.
- **2026-08-22 — CLI-356** (cli.md) — `eslint-plugin-react-hooks` for the CLI. Landed with `rules-of-hooks` and `exhaustive-deps` both at `error`. **The `files` list is narrow, so the blind spot was measured rather than assumed:** a planted conditional-hook plus stale-deps violation reports 4× in `src/cli/components/hooks/` and 4× in `src/cli/stores/`. `src/cli/hooks/` sits outside the list but holds only the oclif hook and uses no React hooks, so it is not a gap. The two `use-measured-height` effects the row predicted would be flagged were dealt with — `eslint .` exits 0.
- **2026-08-22 — CLI-358** (cli.md) — Code generators in a gate. **Predicted PARTIAL on a spot-check and verified LANDED.** Clause A (_"neither generator runs in any gate"_) is now false: both check-mode generators are in `prepublishOnly` and `generate:schemas:check` is in CI. `generate:types:check` is deliberately out of CI with the reason written at the workflow — it reads a sibling skills checkout the runner does not have. The write-mode scripts stay out of every gate, which is correct: a gate checks, it does not write. Clause B (_"`typecheck:scripts` is in no composite gate"_) is **literally true and now vacuous** — the composite `typecheck` inlines the identical `tsc -p tsconfig.scripts.json --noEmit`, and `typecheck` runs in the pre-commit hook, CI and `prepublishOnly`. The stated consequence, `scripts/` going untypechecked, is closed; the named script survives as an unreferenced convenience entry the build docs already record.
- **2026-08-22 — CLI-403** (cli.md) — The pre-commit dependency hole. **Closed by a different fix, on a different date, than the row describes.** The row's drafted `run_cli=yes` edit was never applied — `run_cli` no longer exists in the hook. The hole was closed by turbo's dependent-widening filter `--filter='...[HEAD]'`, dated 2026-08-07 in the hook's own comment rather than the 2026-08-06 the row claims. Proved empirically rather than by reading: `turbo run lint typecheck test --filter='...@workspace/matrix' --dry=text` selects `agents-inc#build`, `#lint`, `#test` and `#typecheck`, so a matrix-only change now runs the CLI suite. The row's second clause is unverifiable — the file it names is gone — and does not affect the verdict. Deleted rather than rewritten: it described a fix that does not exist and a date that is wrong.
- **2026-08-22 — CLI-357** (cli.md) — The task-ID lint guard. **PARTIAL, and deleted anyway because the residual has an owner.** The guard exists and reaches bare `it` / `describe` / `test` titles and the string form of an `expect` message. It does NOT reach `it.skip`, `it.only`, `it.each`, `describe.skipIf`, the tagged-template form, or the template-literal form of an assertion message — measured through `ESLint.lintText` against the real config. **The title half is covered in effect** by a second, widened in-process ESLint pass in `spec-filenames.test.ts` running over every spec. The assertion-message residual is latent rather than live (a census of the escaping shapes returns nothing) and is already carried by the open CLI-648, which names the shapes and the replacement selectors. **A method note worth keeping:** the spot-check that read this row as landed was `grep -c "no-restricted-syntax"` → 7, of which two are prose and two belong to unrelated blocks — a count that looks like evidence and is not, which is the very defect class this row was written against.
- **2026-08-22 — D-234** (cli.md) — E2E config inspection through a structural read instead of regex-on-`config.ts`. **PARTIAL by the row's literal text and complete in intent.** Four of the five named parsers are gone and their spec files migrated; the shared reader exists but is `loadConfigOrFail` wrapping `loadProjectConfigFromDir` (206 call sites across `e2e/`) rather than the `config-reader.ts` with four named accessors the row specified — none of those five names exists anywhere. **The fifth parser survives as a recorded decision rather than unfinished work:** `extractStack` in `stack-per-agent-curation.e2e.test.ts` carries a docblock saying it is _"deliberately NOT `loadConfigOrFail`: this file asserts on the writer's compaction contract, which the structural loader undoes"_ — the assertions are only observable in the `config.ts` text as written. Spawned CLI-669, because that exception is not written into the rule that forbids it.
- **2026-08-22 — CLI-323, CLI-352, CLI-346** (cli.md) — **MOOT rather than done, and the distinction is the whole reason they were verified individually.** In each case the subject was deleted from the tree under another item, so the work described can never be performed: filing them as landed would record work nobody did, and filing them as outstanding would put dead work back in the backlog. **CLI-323** (`FEATURE_FLAGS` readable from env) — `feature-flags.ts` and its test were deleted in `95738763`, along with BOTH test files the row's own migration plan named, so there is nothing to make env-readable and nothing to un-skip. **CLI-352** (drift guard on the vendored seed contract) — the vendored `seed-schema.ts` is gone and the CLI imports `@workspace/matrix/seed` directly, so there are no two things left to compare; D-239 records the deletion. **CLI-346** (`update` global vs project scope) — `globalResults` returns zero matches tree-wide, `update.tsx` is now a UI-less `update.ts` that only runs `claudePluginMarketplaceUpdate` per marketplace, and CLI-428 already recorded it moot. **The census that produced these 16 rows reported all three as landed-or-not; a fourth state was needed and the verifier supplied it.**
- **2026-08-22 — CLI-665** (cli.md) — A finding's `resolved_by` claiming _"every KNOWN GAP comment is gone"_ when six remain. **The clause was deleted, but the brief's reasoning for deleting it was INVERTED and the agent caught it.** I briefed that the frontmatter was wrong about the body, citing `selected-agent-name-excluded.e2e.test.ts`'s four comments as the counterexample. Measured: that file is **not in this finding's `affected_files` and is not its subject**, and the finding's own three affected specs carry **zero** `KNOWN GAP` comments. So the clause was narrowly ACCURATE about the four call sites it described, and it is the finding's BODY — _"Each carries a `KNOWN GAP` comment"_ — that fails against the tree. The deletion stands on the other ground: the clause is unbounded as written, the exact grep contradicts it globally, and a reader cannot tell the intended narrow scope from the written one. **Deleting removes the ambiguity without minting a replacement claim**, which is the 2026-08-19 prefer-deletion ruling working as intended. Every other frontmatter claim in the file was verified TRUE — eleven of them, individually, including that test 3 is the suite's only exercise of `ONLY_SKILL_IN_CATEGORY` and that it sits beside a permitted deselect in the same file. Spawned CLI-666 (the false body sentence, needing a general ruling on whether `Fix Applied` sections are historical records or live claims), CLI-667 and CLI-668. The sweep that produced those scanned all 161 findings and found **zero** citing a symbol that no longer exists.
- **2026-08-22 — CLI-655** (cli.md) — The owed census for mocks redirecting one half of a read/write pair came back a **clean negative, and by construction rather than by luck.** Enumerated all 20 test-level path/constant overrides in the tree (`Object.defineProperty(` ×0 remaining, `vi.mock(` ×4 on consts, `vi.spyOn(os, "homedir")` ×13, `resolveInstallPaths` ×2, `fs.realpathSync` ×1) and asked per site whether the code under test reaches the same fact through a symbol the override misses. **None does.** Every production reader of the home directory calls `os.homedir()` at call time — `installBaseDir`, `isHomeDirectory`, `globalPairPaths`, `globalInstallRoot()`, `cacheRoot()`, `loadProjectConfig`, `plugin-finder` and 30 more — so `vitest.setup.ts`'s per-test spy redirects all of them, and `home-dir-read-at-call-time.test.ts` refuses a frozen constant coming back by declaration shape across `src/cli/`. One plausible escape was checked and does not exist: `node:os` and `os` resolve to the **same namespace object**, and no production module imports `homedir` as a named binding. `PROJECT_ROOT` has one symbol; the CLI's `cacheRoot()` and giget's dir are two different facts and nothing writes the second. **Two near-misses recorded, shape without harm:** `copy-local-skills.test.ts:42-49` mocks `resolveInstallPaths` while the SUT takes the global base from the real `os.homedir()` — incoherent rather than vacuous, since both are checked separately, and one downstream assertion away from being the real thing; `load-agent-defs.test.ts:12-18` mocks `PROJECT_ROOT` and nothing reads the value. **No gate, and the census confirms the finding's reason from the other direction:** what removed the class was making the constants functions, and the gate that holds it is on the CAUSE. Every scan for the SYMPTOM is satisfied by a different override mechanism.
- **2026-08-21 — CLI-602** (cli.md) — `eject`'s `recordSource` read `(await loadProjectSourceConfig(dir)) ?? {}`, which on an unreadable config hands the writer an EMPTY partial — a scalar change rewriting the whole file under an invented name, exiting 0. **Corrected before closing: the path is real code but UNREACHABLE**, so it was never a shipped bug. `recordSource` has exactly one caller, inside `if (isHomeDirectory(projectDir))`, while `recordSource` itself opens with the same test and returns down the `mutateGlobal` branch. The fix (raise rather than fall back) still landed and is still right — it makes a dead branch honest instead of leaving a loaded gun for the first caller that changes the guard. **The spec pinning it was pinning unreachable behaviour**, the same class as CLI-608 and CLI-614. Class measured and bounded: the `(await <loader>(…)) ?? …` shape exists at 3 sites, and of 5 production `writeProjectPartial`/`mutateGlobal` call sites `recordSource` is the only read-modify-write.

- **2026-08-21 — EDITOR-08** (editor.md) — A project-scoped skill could be assigned to a global sub-agent. **The defect was worse than filed:** `seedToWizardResult` in the CLI THROWS on such a pair, so the editor was minting links `init --from` REFUSES — a payload the CLI cannot consume, which the root CLAUDE.md calls a real defect by its own consume-direction test. **Two designs, and the second is what shipped.** v1 made the assignment dormant; the owner ruled it too quiet — a dormant assignment installs a configuration that is not the one the user built and says so only via a dimmed cell. v2 makes the pair an ERROR gated on one count: `summarize(config).unscopedAgentCount`, counting distinct SUB-AGENTS rather than pairs, because that is the number of clicks to resolve (hand-verified: 5 sub-agents, 5 clicks). No rule registry, no error type, no severity, no panel — one rule, one count. Install AND Share disable while it is non-zero; `Save` stays enabled and now round-trips a project-scoped config exactly. The reason sits ON the Install button rather than in a tooltip, because a disabled button suppresses pointer events so a `title` never opens. Scope changes and assignment are never refused and nothing is ever dropped — every counting path reads `enabled` alone, since an unresolved pair IS configured. `packages/ui` ended up untouched. Found and fixed en route: `STORED_PAYLOAD` in `packages/api-mocks` — the canonical share fixture behind every sharing spec — encoded the defect while parsing cleanly. Spawned CLI-614 and EDITOR-51.

- **2026-08-21 — WWW-07** (www.md) — The landing page and the documentation now read as one product. Measured before: `/`'s `h2` rendered at **9.9px under 12.1px body copy** — a heading smaller than its own text — while the same role was 38.5px in the docs, with `packages/ui`'s `font-size: 110%` on `:root` (its own comment calls it "THE SIZING KNOB") inflating every rem. After: `h1` 32px, `h2` 24px, body 16px on both halves at a 100% root. Shared tokens deliberately NOT touched — adding prose sizes to `packages/ui` would push them into the editor, which has no prose. All four escapes closed: the sidebar's current page became an amber rule with ink text rather than an amber block, code blocks are frameless on an ink ramp, the meaningless `seti:plan` file-type icon became `puzzle`, and `404.astro` gained the header and the mark. **Caught en route: Expressive Code's `minSyntaxHighlightingColorContrast` defaults to 5.5 and was silently rewriting `#a06a1c` to `#8a5b18` in the built HTML — the owner's contrast ruling being overridden by a tool with nobody's name on the edit.** Guarded by `apps/www/scripts/check-type-scale.ts`, wired as the workspace's `test` script, asserting that a heading is larger than the text it heads and that both halves set a role at the same size; reinstated-defect verified. It checks no colour, since a contrast assertion would fail on purpose under the owner's ruling. Six new settled constraints recorded in `www.md`.

- **2026-08-21 — CLI-534** (cli.md) — Two commands printing wrong text — **already fixed before the row was dispatched, both halves.** `ERROR_MESSAGES.NO_SKILLS_TO_COMPILE` names `init`, not the non-existent `add`, fixed in `4ad1bab7` the day before; `eject --output` reads "Write everything into this directory instead of each eject type's own destination", with a source comment carrying the reasoning. The row's supporting claim was true — `agents-inc add react` does exit 127 — but the refusal stopped naming it. **The documentation had NOT caught up and that half was real:** `reference/commands/index.md` carried two pass-narration paragraphs ("It named 'add' until 2026-08-18…") which `documentation-bible.md` rule 1 forbids outright; cut and replaced with the forward-looking rule. Hardening already existed and is worth knowing about: `handed-out-invocations` scans every message for `${CLI_INVOKE_COMMAND} <words>`, holds the result against a stated roster, and **runs each entry against the real binary** — its docblock cites this defect as its reason.

- **2026-08-21 — D-307** (cli.md) — The wizard root stealing `s` from the add-source text input — **closed as unreachable: the entire surface is withdrawn from `src/`, not flag-gated.** The row described it as gated off behind a flag; `feature-flags.ts` and `FEATURE_FLAGS` no longer exist, and neither do `showSettings`, `toggleSettings`, `HOTKEY_SETTINGS`, `StepSettings`, nor a `settings` member of `WizardStep` — all five verified at zero occurrences. The row's own named repro spec is deleted. **There is no text input anywhere in the wizard** (`TextInput` survives only as an `@inkjs/ui` theme entry), so no keystroke is data rather than a command and the defect class has no reachable subject. The root `useInput` claims `s` only on the build and agents steps.

- **2026-08-21 — CLI-359** (cli.md) — `agent.liquid` read `agent.permission_mode` / `agent.disallowed_tools` while `AgentConfig` is camelCase, so both fields never emitted. **The template was the wrong side** — the emitted keys already matched `agent-frontmatter.schema.json` and the `AgentFrontmatter` type; only the model-side lookups were wrong. **The two fields failed in OPPOSITE directions, which is what kept the suite green.** The existing test could not fail: `expect(frontmatter).toHaveProperty("permissionMode")` is green with the bug AND without it, because the key is emitted unconditionally behind `| default: "default"` — so the new specs assert VALUES against a fixture that sets both. **Honest scope, stated rather than buried: `resolveAgents` names ten fields and carries neither of these, so no shipped install can produce a non-default value even now** — `compile` reports `0 rewritten, 10 unchanged` and the fix changes no byte of any shipped agent. The template was wrong and unreachably so, which is why it survived. Gate: `agent-template-reads-its-model.test.ts` holds every `agent.*` lookup in every shipped template against `Object.keys` of a literal typed `Required<AgentConfig>`, so the compiler owns the roster and adding or removing a field breaks `tsc` at that literal; proved by reintroducing the bug.

- **2026-08-21 — CLI-367** (cli.md) — `validateBuildStep` had no production caller AND returned `valid: true` on both branches — including the branch whose message says a required category is empty. **Fixed together, because wiring up a validator that always returns valid proves nothing.** Confirmed reachable: **six categories are marked required in the shipped catalogue** (`web-framework`, `web-styling`, `api-api`, `mobile-framework`, `cli-framework`, `desktop-framework`). **Decision: warn and allow**, taken after checking the wizard's other validation rather than by preference — `ValidationError` is typed "Advisory validation error (non-blocking)" and `reportValidationErrors` states that neither command's exit code turns on them, so blocking here would make the MILDEST constraint the only fatal one and strand anyone opening a domain to reach a skill in one of its optional categories. `BuildStepValidation` is now a discriminated union, which makes the always-valid defect **structurally unrepresentable** rather than merely fixed. Hand-run in a PTY: `Framework * (0 of 1)` toasts "No skills selected in Framework (required category)" and the wizard advances. Also corrected `CategoryDefinition.required`'s JSDoc, which claimed the user must select one before proceeding — false under any reading. **Worth recording: `leaf-exports.md` KNEW — it said "Zero production callers" in prose, under a heading, for months. A document knowing is not a gate.**

- **2026-08-21 — CLI-580** (cli.md) — The spawn-door environment leak — **the row had already shipped**; `runCLI` has cleared all five variables plus `NO_BACKGROUND_VERSION_CHECK` since `2b5c27d8`, `RUNNERS` has three entries, and the roster was already derived. **Re-verifying it found two real defects in the GATE, which is why the pass was not wasted.** (1) The per-runner check was `source.includes("<NAME>: undefined")`, so **a comment saying it satisfied the gate** — proved by replacing the clearing line with prose and watching the gate stay green while that door handed the harness's `VITEST` to every binary it spawned; four of the five variables had that prose-satisfiable scan as their only protection. (2) `identifiersIn` counted identifiers written as property KEYS as value references, so a door writing `NO_BACKGROUND_VERSION_CHECK: "1"` reported GUARDED while suppressing nothing — the real variable is `AGENTS_INC_SKIP_NEW_VERSION_CHECK`, which that constant holds as its key. Both now read the syntax tree rather than the text. **The derived roster immediately earned itself**, reddening on an untracked fourth door another agent had created minutes earlier that spread `process.env` wholesale. Spawned CLI-620, ruled deliberate and documented at the site.

- **2026-08-21 — WWW-04** (www.md) — Three pages telling readers to run withdrawn commands — **and the row's premise was inverted on the most important one.** `new marketplace` is NOT deleted: it was removed in `95738763` and **restored in `40488f5a` (2026-08-17) as CLI-454**, 127 lines plus 366 lines of new e2e specs, and `agents-inc new marketplace --help` works. The guide telling readers to run it was CORRECT and was left alone — applying the row as written would have deleted documentation of a working command. Two of the three named pages had already been fixed. Only **two** live instances existed, and the pass found **five more false CLI claims the row never named**: `reference/commands.md` omitted `share` and `new marketplace` and said `edit` takes no flags (it takes `--ui` and `--from`); `architecture.md` named a wizard step that does not exist and three sub-agent partials that do not exist, contradicting another page on the same site; `why.mdx` claimed "planners per domain" where one `pm` serves every domain. Each dead command got its own prose, since the three differ: `new agent` never returning, `new skill` deferred as CLI-453, `validate` deleted.

- **2026-08-21 — WWW-10** (www.md) — The docs claimed 7 domains against a true 9 — **closed by DERIVATION rather than correction.** `apps/www/src/lib/catalog-counts.ts` gained `DOMAIN_COUNT` and `DOMAIN_IDS`, generated at build time from `DOMAIN_ORDER`, so the number can no longer be typed by hand; both pages render the list rather than restating it. True figures measured by executing the modules: **9 domains, 238 skills, 102 categories, 18 sub-agents, 13 commands, 16 flags** — note the domains live in `types/generated/source-types.ts`, not the matrix module the brief pointed at. `ls` confirmed real (`static aliases = ["ls"]` in `list.tsx`, the CLI's only alias) and documented. Hardening: `apps/www/scripts/check-cli-claims.ts` binds the command matrix and each command's flags to `src/cli/commands/**` through the TypeScript AST, membership in both directions, wired as the workspace's `test` script — and **it was made to fail before it was trusted**, reporting all seven faces of the original bug in one run. **It also caught what would have silently defeated it:** `apps/www` does not depend on the CLI, so a CLI-only commit left every hashed input identical and turbo would have replayed the check from cache, reporting clean about a roster that had just changed. Fixed by naming the command tree in the task's `inputs`; measured 37 → 51 inputs, hash changed.

- **2026-08-21 — REPO-09** (repo.md) — the local `.env` that could ship a live site pointed at your own
  machine. **The row's stated cause was never true, and is corrected here rather than archived as
  written, because preserving a wrong diagnosis is worse than preserving nothing.** It said
  `bun run deploy` "uploads whatever was built last without rebuilding". It rebuilds, and always did:
  root `turbo.json` declares `deploy: { dependsOn: ["build"] }`, confirmed by `turbo deploy --dry=json`
  — and that dependency also already satisfied the server-before-editor build order.
  **The real mechanism: Vite loads `.env` in EVERY mode.** So the `http://localhost:8787` the README
  instructed you to write was read by `vite build` too, and rebuilding did not save you — it re-baked
  the localhost address every time. **`apps/editor/dist/` on disk, built 2026-08-08, carried
  `http://localhost:8787` as its live value**: a hand-deploy at any point in the fortnight before this
  fix would have shipped it. The loaded gun was in the working tree, not in the procedure.
  **Fixed structurally rather than procedurally:** `apps/editor/.env.production` is now committed
  (`.gitignore` gained `!.env.production`), and Vite ranks `.env.production` above `.env`, so a
  developer's file cannot reach a production build at all. The README's `cp .env.example .env` step —
  which WAS the hazard — is deleted rather than reworded, and `bun run build` now works on a fresh
  clone with no `.env` at all. `VITE_API_URL` was also REMOVED from the CI deploy step: a shell
  variable outranks `.env.production`, so leaving it would have been the second driftable mechanism the
  whole change exists to end. Missing value now fails the build loudly before a byte is emitted.
  **Guard: `apps/editor/scripts/check-deployable-bundle.ts`**, wired ahead of `wrangler deploy`, reading
  the actual bytes in `dist/`. The obvious check — refuse if the bundle contains `localhost` — was
  **rejected on evidence**: `env.schema.ts` ships `DEV_DEFAULTS` into the browser, so that literal is in
  every correct bundle and the check would have cried wolf on its first run and been switched off.
  Inverted instead — the bundle must contain the address `.env.production` declares, of which there is
  exactly one source. Made to fail red four times before being trusted, including once unprompted, when
  a concurrent agent's broken build left a wrong bundle on disk and the guard caught it. Two limits
  stated rather than hidden: it checks conformance to the declaration, not that the declaration is
  right; and running `wrangler deploy` directly inside `apps/editor` bypasses it.
  Same family as SERVER-04, hit the day before: a deployed artefact disagreeing with the source tree,
  with nothing checking that it agrees.

- **2026-08-21 — CLI-614** (cli.md) — The seed schema accepting payloads the CLI throws on. **Owner ruled the CLI and editor should share one schema; that ruling is honoured in SUBSTANCE, and the literal instruction — put the rule on `seedPayloadSchema` — was refused with measurements.** Two reasons, both measured rather than argued. **(1) The rule is catalogue-dependent and a wire schema has no catalogue.** `assignments: { X: "lazy" }` with `agents` silent is IDENTICAL BYTES whether X is a known sub-agent resting at global (refuse) or one this catalogue does not know (must skip) — only `on: false` is visible on the wire, and `seedToWizardResult` separates them using `KNOWN_AGENTS` from generated source types. A base-schema refusal conflates the two, and refusing the second case IS the retroactive-rename breakage the design deliberately avoids. **(2) A strict base schema would delete EDITOR-08's repair flow.** `GET /configs/:id` DOES re-validate through the same schema, so every stored bad id would become an unrecoverable 500; the editor reads links through it too, and `apps/editor/e2e/support/sharing.ts` builds four fixtures through `seedPayloadSchema.parse(...)`, so a strict base schema throws AT MODULE LOAD. EDITOR-08's own spec states the principle: _"it is an ERROR to resolve, not an action to prevent."* **What landed:** ONE definition on the wire contract — `isSeedScopePairWritable` plus a shared `seedAgentScope` reading `DEFAULT_SELECTION_OPTIONS` — with the CLI's `isScopePairCompatible` and the editor's now delegating to it, and a SECOND schema, `installableSeedPayloadSchema`, refusing at the worker's POST. So minting is blocked and reading stays lenient. **A THIRD copy nobody knew about was found and folded in**: `apps/editor/src/stores/persisted-schema.ts` carried its own verbatim predicate. The worker's own canonical `payload()` fixture turned out to BE an unwritable pair — the same defect `api-mocks`' `STORED_PAYLOAD` had. No `SEED_VERSION` bump: no field, enum or optionality moved, and under discard-don't-migrate a bump would stop exactly the ids the repair flow exists to open. The CLI keeps its throw deliberately — it is the only surface with a catalogue, and its message names the specific pair plus both remedies where a schema-level refusal could only say "re-share the configuration", which the RECIPIENT of a link cannot do.

- **2026-08-21 — CLI-608** (cli.md) — Four specs pressing Space at a toggle the product refuses. **Owner ruled: repoint them at skills that can be deselected. Two were, one was restructured, one could NOT be honestly repointed and that is reported rather than forced.** `scope-change-deselect-integrity` now drops the project half of a persisted `[P][G]` pair — a deselect the wizard performs — while KEEPING its hono test, because that is the suite's only exercise of `ONLY_SKILL_IN_CATEGORY`, and it now sits beside a permitted deselect in one file per CLAUDE.md's refusal-pairing rule. `agent-scope-toggle-agents-array` was repointed at the fixture spare **and surfaced a real defect**: the write path fired for the first time and hard-errored, because `createE2ESource` ships no marketplace manifest so the added skill's default plugin origin is an install the CLI correctly refuses — fixed with `setAllLocal()`, which all six sibling helpers already do, plus a proof-of-execution assertion. `init-global-preselection-confirm` **cannot be repointed at all**: `toggleTechnology` refuses ANY globally-active skill at project scope, so the deselect is unreachable for every skill rather than the one chosen — renamed to what it proves, with a permitted control added beside it. **One mutation result worth carrying forward:** Spec A's "global config unchanged" assertion stayed GREEN when the product was mutated — `isWithinSessionAuthority` governs the project merge, not the global file — and only a fixture mutation reddens it. Recorded in the spec's JSDoc so the next reader does not repeat the revert and conclude it is already covered.

- **2026-08-21 — CLI-552** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — `AgentSourcePaths` is now `{ agentsDir: string; sourcePath: string }` — src/cli/types/agents.ts:115-118. `templatesDir` is GONE from it. `git log -p -S 'templatesDir' -- packages/cli/src/cli/types/agents.ts` shows `- templatesDir: string;` removed in 71b25700 (2026-08-20, 'refactor(matrix): the vendored data says which matrix and which agents it is'). All 23 surviving `templatesDir` hits under src/ e2e/ scripts/ are unrelated LOCAL variables in test fixtures (resolver.test.ts, compiler.test.ts, **tests**/commands/eject.test.ts, **tests**/fixtures/create-test-source.ts) — none is a property of AgentSourcePaths. The row's named readers are gone too: no `verbose()` in compile.ts reads it and no `directoryExists` in agent-fetcher checks it.

- **2026-08-21 — CLI-553** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — The reword the row prescribes has landed verbatim. src/cli/types/matrix.ts:213-226 — `SkillRequirement.needsAny: boolean` now carries 'Always present. The absence this field could have carried is resolved one step upstream: `resolveRelationships` in `lib/matrix/skill-resolution.ts` writes `rule.needsAny ?? false` from the optional {@link RequireRule.needsAny}' and NO `@default` tag. `git log -S 'rule.needsAny ?? false' -- packages/cli/src/cli/types/matrix.ts` → 71b25700 (2026-08-20). The vendored copy is already in sync: packages/matrix/src/vendor/matrix.ts:222 carries the identical line, so the regenerate the row warns about was run. Row's residual count is also stale: it says 'the last of the five @default tags under src/cli/types/' — only TWO remain (matrix.ts:106 on the optional RequireRule.needsAny, skills.ts:50 on the optional SkillAssignment.preloaded), and the row itself calls both correct.

- **2026-08-21 — CLI-555** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — All six implementation items the row lists are in the tree. §1 completed-with-failures exit path: EXIT_CODES.COMPLETED_WITH_FAILURES = 5 (src/cli/lib/exit-codes.ts:19), reportIncompleteWork/recordIncompleteWork/exitIfWorkIncomplete in edit.tsx (:1541, :1554, :1567-1573), 'Agent recompilation failed' routed through it at :1499, completedWithFailures() message at utils/messages.ts:179, plus e2e/interactive/edit-completes-with-failures-exit-code.e2e.test.ts and src/cli/lib/**tests**/failure-reporting-classification.test.ts. §1b: `expectCancelledExit(exitCode, ...)` sits INSIDE both abortAndDestroy definitions — init-wizard.ts:365 and edit-wizard.ts:273 (the plan's own correction: two classes, no shared base). §6 kebab-case on LOAD: schemas.ts:492 `name: z.string().min(1).regex(KEBAB_CASE_PATTERN, { message: MARKETPLACE_NAME_REFUSAL })` with the legible refusal at :482. §8 rule 6.17a: clean-code-standards.md:361-370 'Every regeneration owes that full derivation, and the cheaper trigger is rejected' — escape hatch removed. §10: VOID per the plan's own banner, re-filed as CLI-601 and already CLOSED (archive.md:3539, 'filed and closed within a day'). §11 unreadable-config hard error: config.ts readSourceConfigOrRefuse (:107) throws unreadableSourceConfig (:141) → configUnreadableError, with a MISSING file still returning null. NOTE: ROADMAP.md:162 still describes CLI-555 as '(12 open rulings)' — stale, the roadmap half again.

- **2026-08-21 — CLI-559** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — Both warnings now name a remedy, and each is extracted into its own named builder with a JSDoc explaining why it cannot give a reason. src/cli/stores/wizard-store.ts:601 `absentFromSourceWarning` — '…It is left out of this session's selection. Run \'<CLI_INVOKE_COMMAND> update\' to refresh the marketplace if you expect it to still be carried there.' src/cli/stores/wizard-store.ts:618 `unplaceableCategoryWarning` — '…so the wizard has no screen to place the skill on. Declare it with a \'domain\' in the source's \'<SKILL_CATEGORIES_PATH>\', or run \'<CLI_INVOKE_COMMAND> update\' to refresh the marketplace.' Both are called from resolveSkillForPopulation (:627). The row's second half — that the removal ROW downstream carries a real reason the warning cannot — is now written into the code as the reason it offers a remedy instead: the JSDoc names `removalReason` in lib/skills/unresolved-skill-entries.ts and explains the classification is asynchronous and unreachable from a synchronous store function. Landed 4ad1bab7 (2026-08-20, 'fix(cli): the wizard's warnings reach the screen they were written for'). The docs already record the new strings verbatim: .ai-docs/reference/concepts/guard-pattern.md:246.

- **2026-08-21 — CLI-561** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — The gate exists and runs. packages/cli/scripts/check-spawn-doors.ts (exports `GUARD_CONSTANT = "NO_BACKGROUND_VERSION_CHECK"` at :74) plus packages/cli/scripts/check-spawn-doors.test.ts, landed 03f8c602 (2026-08-20, 'build(cli): five new gates…'). It is executed: vitest.config.ts's `unit` project includes 'scripts/**/*.test.ts'. Its header JSDoc restates the row almost word for word — the three doors, 'no shared seam beneath them', the rejected e2e/vitest.config.ts `test.env` and the handrun-journeys.ts miss — so it is unambiguously the work this row asked for. It went further than the row proposed on two counts the row could not have specified: judgement is per DOOR via a TypeScript AST variable walk rather than a String.includes (the PTY harness never names the constant inside the spawn call), and a door is recognised by the literal pieces of `bin/run.js` as well as by `BIN_RUN`. The three guarded doors are all still guarded: e2e/helpers/test-utils.ts:371, e2e/fixtures/cli.ts:69, e2e/helpers/terminal-session.ts:98. Only difference from the row: it lives in scripts/ beside check-screen-sentinels.ts and check-findings-frontmatter.ts, not in src/cli/lib/**tests**/spec-gates.test.ts as proposed — a placement improvement, not a gap.

- **2026-08-21 — CLI-624** (retired by the 112-row verification sweep, verdict **MISDIAGNOSED**) — The named document describes no VITE_API_URL delivery mechanism at all — old or new. Its 16 top-level headings (grep '^##') cover contracts, routes, headers, fan-out, persist stores, credentials, reportIssue; there is no environment or deploy section to make stale. Repo-wide grep for `cp .env.example` returns only todo/archive.md:3645 and the CLI-624 row itself — the step the row says needs deleting from the doc is not in the doc, and was already deleted from README.md. Grep -rln over .ai-docs for wrangler|.env.production|check-deployable-bundle returns 5 files, none of which document the mechanism (editor-and-worker.md's 2 hits are `wrangler dev` and `wrangler types`; utilities.md:602 is EDITOR_URL). **Successor scope, if anyone revisits:** There is nothing stale to correct. The real gap is an ABSENCE: no .ai-docs document covers the new mechanism at all — the committed apps/editor/.env.production, Vite's shell > .env.production > .env.local > .env precedence, the deliberate removal of VITE_API_URL from the ci.yml deploy step, or the pre-upload guard apps/editor/scripts/check-deployable-bundle.ts. README.md already carries the developer-facing half. So the task is ADD a build-and-deploy-environment section (editor-and-worker.md is a reasonable home, or a new reference page), not a codex-keeper correction pass. Also note the two supporting files are still UNTRACKED — .env.production and check-deployable-bundle.ts — so documenting them before they are committed documents something a fresh clone does not have.

- **2026-08-21 — D-01** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — The convention the row asks for is already the documented and the implemented one. skill-atomicity-bible.md line 46-60 prints the folder layout SKILL.md / metadata.yaml / reference.md / examples/{core.md,{topic}.md}, and Section 8 is the extraction rulebook for it. On disk in the skills marketplace repo: src/skills/web-framework-react/examples/{core,error-boundaries,hooks,react-19-hooks}.md — folder, not flat files. The rename is datable: `git log --diff-filter=D` in /home/vince/dev/skills shows 067ebb2 'refactor(skills/cli): update content and reorganize examples' deleting src/skills/cli-framework-oclif-ink/examples-advanced.md and examples-testing.md (earlier e54b8a5 did the same under .claude/skills/). Residue, trivial and not worth a row of its own: one stale prose mention of `examples-*.md` at packages/cli/.ai-docs/reference/features/seed-contract.md:381. The row's `patterns/testing.md` half was never adopted — the bible chose reference.md + examples/ instead, and no `patterns/` directory exists in either repo; that is a superseded design, not outstanding work.

- **2026-08-21 — D-138** (retired by the 112-row verification sweep, verdict **MISDIAGNOSED**) — The task is real and unstarted, but the row's roster and its file list are both wrong, and following it verbatim would send an agent hunting nine agents and four filenames that do not exist. Commit 97e7a806 'refactor(agents): one pm and one reviewer serve every domain' deleted all five *-reviewer directories and all four *-pm directories (git log --diff-filter=D --name-only over src/agents/reviewer/ lists ai-/api-/cli-/infra-reviewer file-by-file). The row's own closing paragraph still asserts '25 agents, five roles x web/api/ai/cli, plus Meta and infra-reviewer' — that count is now 18 and infra-reviewer is gone, which also bears on CLI-380. **Successor scope, if anyone revisits:** Same task, corrected inventory. 18 agents in packages/cli/src/agents: meta {agent-summoner, skill-summoner, codex-keeper, convention-keeper}, developer {web,api,ai,cli}, tester {web,api,ai,cli}, researcher {web,api,ai,cli}, plus ONE shared reviewer/reviewer and ONE shared planning/pm serving every domain (97e7a806). Per agent read the six files that actually exist — metadata.yaml, identity.md, playbook.md, critical-requirements.md, critical-reminders.md, output.md — not intro.md/workflow.md/output-format.md/examples.md, which are at zero. The consolidated reviewer and pm are the highest-value targets, since each now carries what five and four definitions used to. Rewrite the row's table before dispatch.

- **2026-08-21 — CLI-337** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — Row (cli.md:172, detail cli.md:907-908) names `e2e/interactive/init-wizard-sources-cancel-persists.e2e.test.ts` and `FEATURE_FLAGS.WIZARD_SETTINGS_OVERLAY`. The spec file does not exist (`find . -name 'init-wizard-sources-cancel-persists*'` → 0 hits); `git show --stat 60e13857` deleted it (161 lines) together with `init-wizard-sources-settings-hidden.e2e.test.ts` (84 lines). `FEATURE_FLAGS` has 0 hits under packages/cli/src (only changelogs + a finding doc); `feature-flags.ts` does not exist anywhere (deleted 95738763). `StepSettings`, `step-settings`, `HOTKEY_SETTINGS`: 0 hits in src/ and e2e/. All 53 remaining `.skip*` hits under e2e/ are `skipIf` environment guards. This is the exact D-307 shape: the whole subject was withdrawn, not fixed — the row should be deleted, not implemented.

- **2026-08-21 — CLI-360** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — Row (cli.md:240, detail cli.md:1316-1321) names `lib/skills/source-switcher.ts` and `lib/skills/generators.ts`. Neither file exists: `find . -name 'source-switcher*' -o -name 'generators*'` (excl. node_modules/.git) → 0 hits. `source-switcher.ts` was renamed `local-skill-mover.ts` in 02e4488e (CLI-450 step 7); `generators.ts` was deleted in 95738763 with the `new` commands. Both survivors are documented: skills-and-matrix.md:91 (table row) and :796 (`**File:** src/cli/lib/skills/local-skill-mover.ts`); skill-primitives.md:44-51 names skills-and-matrix.md as local-skill-mover's owner and states verbatim at :52 "**There is no `generators.ts`.**". Every module now in packages/cli/src/cli/lib/skills/ (skill-copier, skill-metadata, skill-fetcher, local-skill-loader, skill-plugin-compiler, unresolved-skill-entries) is owned by skill-primitives.md § Scope; local-skill-mover + versioning by skills-and-matrix.md. No undocumented lib/skills module remains.

- **2026-08-21 — CLI-361** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — Row (cli.md:242, detail cli.md:1326-1333) claims `generate()` runs at module scope with a hardcoded output dir and the script has zero tests. All three claims are false now. `packages/cli/scripts/generate-json-schemas.ts:267` reads `export async function generate({ schemasDir }: GeneratorRoots)` — exported, parameterised, and its file header says "nothing runs at module scope here, so importing this file writes no files." argv/exit-code/console live in `scripts/run-generate-json-schemas.ts` (SCHEMAS_DIR resolved there). `scripts/generate-json-schemas.test.ts` exists (7,193 bytes, 9 `it(`). Landed in 624764c1 "build(cli): the generators answer to a runner, and --check is the runner's job" (preceded by 1fe666cf). The row's doc citation is also discharged: `reference/features/code-generation.md` § Known gaps (lines 650-670) no longer lists this gap — its three items are the CI-coverage gap, dead `injectSubcategoryPropertyNames`, and an agent-system.md schema mismatch.

- **2026-08-21 — CLI-382** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — Row (cli.md:237, detail cli.md:1278-1287) says the two wizard roster constants are file-local so no test can bind them, and additions are caught by nothing. Both halves are false now. `BUILT_IN_AGENT_GROUPS` is exported from `src/cli/lib/wizard/agent-roster.ts:19` (landed 043c1951 "refactor(cli): the built-in agent roster is data the wizard reads"); `DOMAIN_AGENTS` is exported from `src/cli/stores/wizard-store.ts:580`. `src/cli/lib/wizard/agent-roster.test.ts` (landed 10206cb2) imports all three — `BUILT_IN_AGENT_GROUPS`, `DOMAIN_AGENTS`, `AGENT_NAMES` — and binds them with `toStrictEqual`, including the addition direction the row says nothing catches: "offers a grid row for every agent the catalogue holds" (`AGENT_NAMES.filter(name => !BUILT_IN_AGENT_IDS.has(name))` vs an explicit excuse list) and "preselects every agent the catalogue holds from some domain". 6 tests total; the excuse lists (`AGENTS_WITH_NO_GRID_ROW`, `AGENTS_NO_DOMAIN_PRESELECTS`) make each omission a recorded decision. The row's third surface — shared test expected-values — is settled by a written decision: `e2e/fixtures/expected-values.ts:48` states `WEB_DOMAIN_AGENTS` is deliberately spelled out rather than read off `DOMAIN_AGENTS`, because "an expectation derived from the mapping under test agrees with it however it changes". The identity-key export question the row calls "the decision" is therefore already ruled by the shipped code.

- **2026-08-21 — CLI-384** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — The detail block itself opens "**Closed 2026-08-19**" (cli.md:1301-1313) while the summary row (cli.md:239, status Investigate) and the block's own trailing "Decide:" sentence were never removed — the row contradicts itself. The closure is real and verified: prompt-bible.md § 8.6 "Built-In Agent Partials Are Product Content" exists (:1905), forbids `.ai-docs/**`, `CLAUDE.md`, `todo/**` in `src/agents/**`, carries two named exceptions (the `meta/` agents, and the same rule restated project-agnostically) and ships the grep. Ran that exact grep from packages/cli: `grep -rn "ai-docs\|CLAUDE\.md" src/agents/ --exclude-dir=meta` → exit 1, zero hits. The remaining 16 files with hits are all under `src/agents/meta/` (agent-summoner, codex-keeper, convention-keeper, skill-summoner), which § 8.6 exception 1 covers explicitly. § 8.6 landed in b4ea84aa. The row is not in archive.md — closed in place and never retired.

- **2026-08-21 — CLI-385** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — Row (cli.md:109, detail cli.md:1366-1377) says the 2026-08-05 roster unification is "complete in the working tree and green, but none of it is committed" and "what remains is exactly one thing: land it as one commit". It is committed. `git ls-files packages/cli/src/agents/` tracks all 19 agent directories plus `_templates/`; `git status --porcelain packages/cli/src/agents/` returns exactly one line, ` M _templates/agent.liquid` — unrelated to the roster. The five agents the row calls unpublished were added in 4d922819 "feat(agents): add ai-developer, api-tester, api-pm, ai-reviewer, infra-reviewer agents" (ancestor of HEAD, verified with `git merge-base --is-ancestor`), and the roster was restructured again afterwards in 97e7a806 "refactor(agents): one pm and one reviewer serve every domain" (2026-08-09) — which also makes the row's "25 definitions" snapshot stale: `AGENT_NAMES` now holds 18 and `packages/matrix/src/vendor/generated/source-types.ts` agrees at 18. The untracked `agent-findings` files the row wanted included are tracked (e.g. `2026-08-05-skill-summoner-partials-self-wrap-tags-the-template-already-adds.md`); zero untracked 2026-08-05 findings remain.

- **2026-08-21 — CLI-473** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — Row (cli.md:220, status "Ready for Dev — next session") says the init hook resolves a source for `BaseCommand.sourceConfig`, which has no readers, and asks to delete the stash plus the hook's dead half. Both are already deleted. `packages/cli/src/cli/base-command.ts` contains zero occurrences of `sourceConfig` — the getter is gone; `git show f2f9fd45 -- packages/cli/src/cli/base-command.ts` shows the removed lines verbatim: `-/** Narrow interface for the sourceConfig we attach to oclif's Config in the init hook. */`, `- sourceConfig?: ResolvedConfig;`, `- public get sourceConfig(): ResolvedConfig | undefined {` and the boundary cast beneath it. The same commit cut `src/cli/hooks/init.ts` by 64 lines; the file is now 15 lines and does one thing — `runDashboardFlow` when `options.id === undefined`. No stash helper survives (`storeSourceConfig|sourceConfigStash|stashSource|getStashedSource` → 0 hits). Commit f2f9fd45 "fix(cli): the remaining defects the accuracy programme found", 2026-08-20 — the day before the tracker was dispatched. Every remaining `sourceConfig` hit in the tree is the unrelated `SourceLoadResult.sourceConfig` field on `lib/loading/source-loader.ts:91`, which has many live readers (eject.ts:466/:512, skill-copier.ts:114/:239, local-installer.ts:272/:380, mode-migrator.ts:146).

- **2026-08-21 — CLI-567** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — `grep -rn 'pluginizedSkills\|failedPluginInstalls'` across the whole repo (excluding node_modules) returns ONE hit and it is todo/cli.md:102, the row itself. Fixed in b4ea84aa (2026-08-20, 'docs(ai): the reference and the standards re-derived from source'); its diff shows all four replacements — features/configuration.md (failedPluginInstalls -> pluginInstalls.failed) and features/plugin-system.md three times, including the Types list now reading `{ ejectCopies: EjectCopyResult; pluginInstalls: PluginInstallResult; warnings: string[] }` at plugin-system.md:748. Second half settled by reading: packages/cli/src/cli/lib/**tests**/factories/config-factories.ts:94 `source: EJECT_SOURCE` sits inside `buildPreRenameSkillEntryConfig(): Record<string, unknown>`, whose docblock states it is deliberately-invalid parse-boundary data carrying the pre-rename field name the loader must refuse — it is correct as written, nothing to change. Also worth recording: the row's own restatement of the source shape was itself wrong — the first field is `ejectCopies` (mode-migrator.ts:46), never `ejectedSkills`.

- **2026-08-21 — CLI-568** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — packages/cli/.ai-docs/standards/clean-code-standards.md:791 § 15.14 now reads 'It is enforced now on the write path at **two** sites, and naming only one is what lets the next reader take one of them for the whole guard:' followed by a two-row table naming `reconcileProjectSplitAgainstGlobal` (lib/config-gate/propagate.ts) and `compactCategoryAssignments` (lib/configuration/config-writer.ts) with what each does. The asymmetry paragraph the row also asked for is there verbatim, naming `use-build-step-props.ts`'s `cat?.exclusive ?? true` against the write path's `matrix.categories[category]?.exclusive === true`, and stating it is deliberate on both ends. Landed in b4ea84aa (2026-08-20) — `git log -S 'compactCategoryAssignments' -- clean-code-standards.md` returns that commit alone. Corroborated by CLI-582 (a different open row) whose text says it was 'Found 2026-08-19 while completing the § 15.14 enforcement list'.

- **2026-08-21 — CLI-569** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — `AgentDefinitionOptions` is at ZERO occurrences across packages/cli/src and packages/cli/e2e — the D-307 signal. Removed in f2f9fd45 (2026-08-20, 'fix(cli): the remaining defects the accuracy programme found'); its diff on agent-fetcher.ts deletes `export type AgentDefinitionOptions = FetchOptions & { projectDir?: string }` and both `options` parameters, and on load-agent-defs.ts changes `loadAgentDefs(options?: { projectDir?: string })` to `loadAgentDefs()`. Current signatures: `getAgentDefinitions(remoteSource?: string): Promise<AgentSourcePaths>` (agent-fetcher.ts:9), `getLocalAgentDefinitions(): Promise<AgentSourcePaths>` (agent-fetcher.ts:16), `loadAgentDefs(): Promise<AgentDefs>` (load-agent-defs.ts:36) calling `getAgentDefinitions()` with no args. Its docblock now states 'It takes no arguments because there is nothing here for a caller to vary'. None of the six sites the row names still passes `{ projectDir }`: the only `{ projectDir }` literals left in src are commands/eject.ts:169 (`loadSource`, unrelated) and three in config-merger.test.ts (unrelated).

- **2026-08-21 — CLI-570** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — All five hand-written entries of `VENDORED_TYPE_FILES` (generate-matrix-package.ts:44 — matrix.ts, skills.ts, agents.ts, config.ts, stacks.ts) now open with the identical three-line header: '// Vendored byte-for-byte into packages/matrix/src/vendor/ by scripts/generate-matrix-package.ts. // ANY edit here — a comment-only one included — obliges `bun run generate:matrix` in packages/cli; // `generate:matrix:check` is the gate.' Verified by `head -3` on each. The comment-only half the row calls the missed one is stated explicitly. Both commands exist (package.json:95-96). The remaining two list entries are `generated/matrix.ts` and `generated/source-types.ts`, which carry their own '// AUTO-GENERATED ... do not edit manually' header instead — correct, since they are never hand-edited. Landed in 71b25700 (2026-08-20). Live proof it works: the current working tree has a comment-only edit to src/cli/types/matrix.ts AND a matching regenerated packages/matrix/src/vendor/matrix.ts.

- **2026-08-21 — CLI-573** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — packages/cli/scripts/check-findings-frontmatter.ts now implements exactly this, in 03f8c602 (2026-08-20, 'build(cli): five new gates, and a drift registry that reads values as well as keys'). The mechanism: `inFlight: string[]` (line 169) populated by `changedSince(findingsDir, witnessed)` (line 200), built from a `FileWitness = { file, fingerprint }` (line 205) whose `fingerprintOf` is `${stats.size}:${stats.mtimeMs}` (line 231/235) taken before the read and re-taken after, so it names every file whose bytes moved UNDER the run rather than guessing. Second signal: `UNTERMINATED_FRONTMATTER = 'opens a --- frontmatter block nothing closes'` (line 135) reported apart from an absent block, for a writer that stalls longer than the scan. Third: every finding is read once per run. The docblock names the exact 2026-08-19 incident the row describes and explicitly considers and REFUSES both of the row's other two options — 'Tolerating a parse failure as unknown retires the whole check' and 'Skipping a file whose mtime is within a few seconds skips precisely the file the run is about' — with reasons.

- **2026-08-21 — CLI-321** (retired by the 112-row verification sweep, verdict **MISDIAGNOSED**) — Row = E2E coverage for multi-item `new skill`/`new agent` (blocks on CLI-320, plan todo/plans/P4-17-new-multiple-items.md). BOTH COMMANDS ARE GONE: `packages/cli/src/cli/commands/new/` contains only `marketplace.ts`. `git log --diff-filter=D -- '*commands/new/skill.ts' '*commands/new/agent.ts'` -> 95738763 (2026-08-09, 'feat(cli): import, new and validate retire, and the flags that hid them'). Every symbol the plan names is at ZERO occurrences repo-wide: validateSkillName, toTitleCase, generateSkillMd, generateMetadataYaml, PurposeInput. `e2e/commands/new-skill.e2e.test.ts` and `new-agent.e2e.test.ts` also do not exist (only new-marketplace.e2e.test.ts). Owner ruling already recorded in todo/archive.md:3628 — '`new agent` never returning, `new skill` deferred as CLI-453'. archive.md:3596 retired D-212 for the identical reason. **Successor scope, if anyone revisits:** Retire CLI-321 together with its dependency CLI-320 (cli.md:147, status 'Refined') and archive P4-17's plan as historical. Both rows describe variadic-arg support for `new skill` and `new agent`, retired 2026-08-09. `new agent` is ruled never returning; `new skill` re-add lives in CLI-453 (Deferred), which would own its own test coverage written against whatever intake flow the editor settles on — not against P4-17's `--purpose`/`PurposeInput` design, which no longer exists. Nothing to implement; this is a tracker deletion plus one archive line.

- **2026-08-21 — CLI-327** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — BOTH halves of the row are fixed in the working tree, uncommitted. `validateBuildStep` (packages/cli/src/cli/lib/wizard/build-step-logic.ts:37) now returns a discriminated union — `export type BuildStepValidation = { valid: true } | { valid: false; message: string }` — and the empty-required branch returns `{ valid: false, message: 'No skills selected in … (required category)' }`. The CLI-367 half is fixed too: `validateBuildStep` is called from production at src/cli/components/wizard/step-build.tsx:73 inside `handleContinue`, which sets a toast before `onContinue()`. CONTRAST WITH HEAD: `git show HEAD:…/build-step-logic.ts` still has `BuildStepValidation = { valid: boolean; message?: string }` returning `valid: true` on both branches, and `git show HEAD:…/step-build.tsx` has no `validateBuildStep` reference at all. `git status` shows ' M build-step-logic.ts', ' M build-step-logic.test.ts', ' M step-build.tsx', ' M step-build.test.tsx', ' M types/matrix.ts'. Landing is recorded at todo/archive.md:3624 — '2026-08-21 — CLI-367 … Fixed together … BuildStepValidation is now a discriminated union', including the warn-and-allow decision and a PTY hand-run. `validateSelection` (matrix-resolver.ts:455) derives `valid: errors.length === 0`, as the row's own re-measurement already said. **Successor scope, if anyone revisits:** Delete the CLI-327 row and append its archive line. The work landed with CLI-367 on 2026-08-21 but is NOT YET COMMITTED — it lives in the working tree alongside a concurrent session's ~150-file change set. Do not dispatch an implementer here: they would rewrite a fix that already exists and collide with that session on build-step-logic.ts, step-build.tsx and their two test files.

- **2026-08-21 — CLI-330** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — The cast the row is named after is gone. `grep -c 'as unknown as' packages/cli/src/cli/lib/__tests__/mock-data/mock-matrices.ts` -> 0, and `git show HEAD:…/mock-matrices.ts | grep 'as unknown as'` -> no hits, so it is committed, not just a working-tree change. `git log -S 'TEST_CATEGORIES as unknown as'` -> most recent 10206cb2 (2026-08-20, 'test(cli): the unit suites follow'). The key-shape mismatch the row says the cast was hiding has been resolved head-on rather than papered over: mock-matrices.ts:139-144 now does `categories: indexBy(Object.values(TEST_CATEGORIES), (category) => category.id)` under a comment stating exactly the row's diagnosis — 'TEST_CATEGORIES is keyed by fixture name (framework/clientState/…) for its callers' convenience; a matrix is keyed by Category id. Re-keying on each definition's own `id` is the whole of the difference.' Elsewhere the file spells category ids literally ('web-framework': TEST_CATEGORIES.framework, mock-matrices.ts:92-95, 197, 212, 224…), so both the fixture and the matrix shape are now honestly typed. **Successor scope, if anyone revisits:** Delete the row and append one archive line naming 10206cb2. No code change.

- **2026-08-21 — CLI-335** (retired by the 112-row verification sweep, verdict **MISDIAGNOSED**) — THE SPEC FILE DOES NOT EXIST. `ls packages/cli/e2e/interactive/init-wizard-filter-incompatible.e2e.test.ts` -> No such file; `find . -name '*filter-incompatible*'` returns only todo/plans/D-162-skill-olympics/test-cases/C01-toggle-filter-incompatible.ts. Deleted in 60e13857 (2026-08-09, 'test(e2e): the suite asserts journeys, not implementation') — not skipped, deleted. The gate the row names is gone too: `FEATURE_FLAGS` has 0 hits under packages/cli/src (module deleted in 95738763, 2026-08-09), and `FILTER_INCOMPATIBLE` survives only as prose — e2e/pages/constants.ts:38, changelogs/0.145.0.md:51, changelogs/0.152.0.md:17, and the generated e2e/helpers/handrun.gen.mjs:12886. The feature itself is WITHDRAWN, not dormant: e2e/pages/steps/build-step.ts:764 `pressFilterIncompatibleHotkey` documents 'the build step no longer binds [f] to anything — incompatible-skill filtering was withdrawn', and e2e/interactive/edit-wizard-navigation.e2e.test.ts:114 already asserts the key is inert ('nothing handles F, so the grid cannot move'). This is the same failure class as D-307. todo/cli.md:57 (CLI-599) independently reached this conclusion on 2026-08-20 and names CLI-335/336 as trace (2). **Successor scope, if anyone revisits:** Retire the row. There is no skipped spec to un-skip, no flag to flip, and no feature behind it — the F-key filter was withdrawn and the inert key already has a live assertion at e2e/interactive/edit-wizard-navigation.e2e.test.ts:114. The only real work in this area is CLI-599 (todo/cli.md:57, Ready for Dev), which owns removing the last false trace — the FEATURE_FLAGS sentence in e2e/pages/constants.ts:38 — and retiring these two rows. Fold CLI-335 into CLI-599 rather than dispatching it; dispatching it as written sends an agent to open a file that is not there.

- **2026-08-21 — CLI-336** (retired by the 112-row verification sweep, verdict **MISDIAGNOSED**) — Identical to CLI-335 and verified separately. `ls packages/cli/e2e/lifecycle/global-skill-filter-incompatible-guard.e2e.test.ts` -> No such file. `git log --diff-filter=D` on the path -> 60e13857 (2026-08-09, 'test(e2e): the suite asserts journeys, not implementation'). The 'same flag' it points at does not exist: FEATURE_FLAGS module deleted in 95738763 (2026-08-09), 0 hits under packages/cli/src. No global-scope filter-incompatible guard exists in src/ either — `filterIncompatible`/`FilterIncompatible` under src/ returns 0 hits; the only survivors are the e2e page-object method e2e/pages/steps/build-step.ts:764 and a cross-reference to it at e2e/pages/steps/sources-step.ts:61, both of which document the key as inert. **Successor scope, if anyone revisits:** Retire the row, together with CLI-335, under CLI-599 (todo/cli.md:57). Same reasoning: file deleted, flag module deleted, feature withdrawn. If anyone later wants coverage that a globally-scoped skill cannot be filtered out, that is a NEW spec against a NEW feature and needs an owner decision to re-add the filter first — it is not a resumable spec.

- **2026-08-21 — EDITOR-05** (retired by the 112-row verification sweep, verdict **MISDIAGNOSED**) — The GAP is real: /home/vince/dev/skills/src/skills/web-framework-react/metadata.yaml carries `cliDescription: React component patterns` — the skill, not 'JavaScript UI library'. Same shape throughout the generated catalogue (e.g. 'Access 200k+ models via Inference API and Endpoints', 'Unified LLM proxy — 100+ providers, OpenAI-compatible API'). But the row's fix location is WRONG, and it is the load-bearing half. Both catalogue files open with 'AUTO-GENERATED from skills source — do not edit manually / Run: bun run generate:types' — packages/matrix/src/vendor/generated/matrix.ts AND packages/cli/src/cli/types/generated/matrix.ts. The generator's own header says 'this generator reads a checkout OUTSIDE the repository', and scripts/run-generate-source-types.ts:19 sets `DEFAULT_SKILLS_SOURCE = path.resolve(CLI_ROOT, "../../../skills")` -> /home/vince/dev/skills. So the row's 'authoring the answer is an edit in packages/cli — the same repository, so nothing here waits on anything' is false: there is nothing in packages/cli to author. Separately, ROADMAP.md:309 states this item INVERTED ('descriptions describe the library, not the skill') — editor.md has it the right way round. **Successor scope, if anyone revisits:** The authoring surface is `cliDescription` in /home/vince/dev/skills/src/skills/<id>/metadata.yaml — 239 skill directories in the agents-inc/skills marketplace repo, a DIFFERENT repository whose diffs do not land here (root CLAUDE.md: todo/skills.md tracks it). This repo's part is downstream and mechanical: run `bun run generate` in packages/cli (generate:types -> generate:schemas -> generate:matrix) to regenerate packages/cli/src/cli/types/generated/matrix.ts and packages/matrix/src/vendor/generated/matrix.ts. So the row DOES wait on a cross-repo change, belongs on todo/skills.md rather than todo/editor.md, and needs an owner ruling on whether `cliDescription` becomes a library gloss or a new field is added beside it (the editor reads `description`, and `usageGuidance` already carries the skill-shaped text). Also fix the inverted restatement at ROADMAP.md:309.

- **2026-08-21 — CLI-600** (retired by the 112-row verification sweep, verdict **MISDIAGNOSED**) — The dead condition is real, but the row gets the mechanism, the consequence and therefore the prescribed action wrong. VERIFIED: `hasRequiredBy = option.selected && !!option.requiredBy` at `src/cli/components/wizard/category-grid.tsx:93`, feeding `isDimmed` (:95) and `showCompatibility` (:96). `getCompatibilityLabel` (:69-78) does return null at `if (option.selected) return null;` (:72) before reaching `if (option.requiredBy)` (:74). THE ROW STOPS ONE LEVEL TOO EARLY. `CategoryOption` has exactly one production producer — `buildCategoryRows` in `src/cli/lib/wizard/build-step-logic.ts:74` — and line 79 reads `const requiredBy = skill.selected ? undefined : getUnmetRequiredBy(skill.id, allSelections);`, with :95 spreading it only `...(requiredBy !== undefined && { requiredBy })`. So a SELECTED option never carries `requiredBy` at all, and `hasRequiredBy` is unsatisfiable upstream of the label function. Grep confirms no other assignment: `requiredBy` in non-test src/ appears only at category-grid.tsx:27 (type), :74, :93 and build-step-logic.ts:79, :95. The two adjacent absences ARE accurate as stated: `SkillOption.advisoryState` is declared at `src/cli/types/matrix.ts:290`, written at `matrix-resolver.ts:470,506`, and read ONLY by tests (matrix-resolver.test.ts, skill-resolution.integration.test.ts) — no production reader; the grid reads `getCellState` (`matrix-resolver.ts:291` → `build-step-logic.ts:84`). `getDependentSkills` (`matrix-resolver.ts:121`) has only its definition, the barrel re-export at `matrix/index.ts:11` and test callers; `getImpliedSkills` (`matrix-resolver.ts:307`) is not even in the barrel and has ZERO callers of any kind. **Successor scope, if anyone revisits:** What is actually wrong: `hasRequiredBy` is dead BY CONSTRUCTION at the producer, not merely label-null at the renderer. `build-step-logic.ts:79` sets `requiredBy` to `undefined` for every selected skill, so `option.selected && !!option.requiredBy` can never be true for any CategoryOption the product builds. Three corrections to the row: (1) the mechanism is the producer's ternary, not `getCompatibilityLabel`'s early return — the early return is a second, redundant guard on the same impossible state; (2) the row's claim that "deleting it is a rendering change, not a no-op" is FALSE — deleting `hasRequiredBy` and simplifying `isDimmed` to `hasUnmetDeps` and `showCompatibility` to `hasUnmetDeps || (showLabels && isFocused)` is behaviour-preserving in production, and a component test can pin that by feeding a hand-built option with selected+requiredBy and asserting no label renders today; (3) there is consequently NO owner decision to take — "should a selected required-by skill dim?" was already answered by the data model, which does not produce that state. Scope it as: delete the dead predicate, add the pinning component test in `category-grid.test.tsx` (which today covers neither `requiredBy` nor dimming), and keep the two adjacent absences as filed — they verified clean and `getImpliedSkills`/`getDependentSkills` at zero production callers remains the mechanical evidence for D-269.

- **2026-08-21 — CLI-575** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — `needsGlobalWrite` = 0 occurrences in packages/cli/{src,e2e,scripts}. Both named sites now cite the live symbol: src/cli/lib/config-gate/propagate.ts:184 reads "`resolveEffectiveGlobalConfig`'s `changed`" (fixed in f2f9fd45, 2026-08-20, `fix(cli): the remaining defects the accuracy programme found`), and src/cli/lib/installation/local-installer.test.ts:1851 reads the same (10206cb2, 2026-08-20, `test(cli): the unit suites follow`). The string survives only in two historical agent-findings (2026-04-21-registerProjectPath-sweep-observability-gap.md:45, 2026-07-20-config-merge-functions-disagree-on-source-identity.md:47), both narrating past state. CLI-581's own text already calls it "now fixed".

- **2026-08-21 — CLI-576** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — All four helpers are at zero occurrences in any .ts/.tsx. e2e/assertions/phase-assertions.ts now exports only `expectCancelledExit` and `expectPhaseSuccess` (`expectFullInstallation` removed in 2b5c27d8, 2026-08-20). src/cli/lib/**tests**/assertions/config-assertions.ts now exports only `expectConfigSkills`, `expectConfigAgents`, `expectSkillConfigs`, `expectAgentConfigs` (`expectFullConfig`/`expectConfigOnDisk`/`assertConfigIntegrity` removed in 10206cb2, 2026-08-20). The deletion is written up as a case study in .ai-docs/standards/e2e/anti-patterns.md:822-824, which distinguishes the never-called helper from the two that lost their callers — the row's "or find why they were written and left" half. Its follow-on is CLI-584.

- **2026-08-21 — CLI-583** (retired by the 112-row verification sweep, verdict **ALREADY-DONE**) — agent-system.md:345 now states `PropagatedRecompileSummary` as `rewrittenCount`, `unchangedCount`, `failedCount`, and :690 as `{ rewrittenCount, unchangedCount, failedCount, warnings }` — matching recompile-project-agents.ts:44 and the `NOTHING_RECOMPILED` literal at config-gate/recompile.ts:4-9. `recompiledCount` now appears in .ai-docs only as explicit negations: compilation-pipeline.md:611 ("There is no `recompiledCount`.") and configuration.md:811 ("there is no `recompiledCount` field"). CAVEAT: the fix is UNCOMMITTED — `git diff` on packages/cli/.ai-docs/reference/features/agent-system.md shows the `recompiledCount` → `rewrittenCount, unchangedCount` line rewrite in the working tree, not in any commit. Re-verify before dispatch if that tree is discarded.

- **2026-08-21 — CLI-566 and CLI-589** (cli.md) — the briefing contract and the orchestration-accuracy
  investigation, landed together because they are the same fix: the failure mode that produced this
  whole programme is briefs containing confident wrong statements. `.ai-docs/standards/briefing.md` now
  carries a 13-rule contract with what-a-brief-must-contain and what-a-report-must-return tables,
  restated in both `CLAUDE.md` files, and **`scripts/check-briefing-contract.ts` enforces the
  mechanisable part**. Both plan files were rewritten from plans into decision records with
  per-mechanism verdicts. **The residue this pass closed was the checker's own blind spot**, proposed
  by the lane's own finding and applied by the lane that owned the files: the link scan now iterates
  `linkingDocuments(bindingDocuments, briefingContract)`, so the contract's OWN links are read —
  proved by appending a dangling link to `briefing.md`, which the finding had measured as wholly
  green, and watching it redden and name the target. `BINDING_DOCUMENTS` was deliberately left
  untouched: merging the two would demand the contract link itself and fail immediately.
  **An unpredicted interaction, resolved rather than suppressed:** reading the contract as a link
  source collided with an existing refusal, because deleting the standards directory also deletes the
  contract inside it — so `NO_BINDING_DOCUMENT` fired where `NO_STANDARDS_DIRECTORY` was expected.
  Refusals are now ordered by how specific the repair they name is, so a missing directory does not
  send a reader to restore one file.
  **And the contract's own scope paragraph was rewritten because the fix falsified it** — it had said
  "the pointers in this file are not scanned". Leaving that would have been the premise-expired defect
  one layer up, i.e. the exact thing the contract exists to stop.
  Spawned CLI-625 (ugrep does not match a literal parenthesis, so paren-bearing censuses silently
  return zero) and CLI-626 (a docs-only change replays a stale green from the turbo cache).

- **2026-08-21 — CLI-619, CLI-366 (documentation half) and CLI-551** (cli.md) — landed together as the
  test-helper-truth lane. **CLI-619:** `parseSelectedAgentNameUnion`, a local regex extractor over
  generated `config-types.ts` text inside an e2e spec, is gone; the spec imports
  `readGeneratedUnionMembers` from `src/cli/lib/__tests__/helpers/generated-types.ts` — the only
  directory where such a helper's own test is actually collected. **CLI-551:**
  `d227-same-scope-tombstone-duplicate.test.ts` is renamed to
  `preselection-rebuild-one-entry-per-slot.test.ts`, byte-identical content, with the finding's
  `resolved_by:` reference updated and a new `spec-filenames.test.ts` gate holding every spec basename
  against tracker-ID shapes. **CLI-366:** the documentation half only; its other half — a mechanical
  gate distinguishing a re-derived snapshot from a rubber-stamped one — was re-derived as genuinely
  absent and remains an owner ruling.
  **The value of the second pass was a SURVIVING MUTANT.** `readGeneratedUnion` anchors on
  `` `export type ${alias} =` ``; replacing that with a bare `` `${alias} =` `` left **all eleven
  assertions green — including the one named "reads only the requested alias when another alias shares
  its suffix"**. The reason is declaration ORDER, not the names: `.exec` takes the first match and the
  fixture declared the short alias first, so both readers answered identically. Only the reversed order
  discriminates — and that is the order `assembleConfigTypesSource` never emits, which is why the gap
  was free and invisible at the same time. A `SUFFIX_SHARING_ALIAS_DECLARED_FIRST` fixture now states
  the emitted order and why the fixture states the other one. Six further mutations over the same suite
  killed 3, 7, 1, 2 and 4 assertions respectively; four over the filename gate killed 1, 2, 2 and 1.
  Same class as everything else this programme has found: an assertion named for a discrimination its
  fixture could not make.

- **2026-08-21 — CLI-587, CLI-588, CLI-562 and CLI-605** (cli.md) — the checker-gates lane, the highest
  risk-order lane in the programme on the principle that a broken guard makes every later verification
  untrustworthy. All four were implemented by an interrupted attempt and verified here against the tree
  rather than the row text. **CLI-587:** `scripts/refusal-expectations.ts` with `expectRefusal(run,
refusal, because?)` refusing `undefined`/`""` by name, plus `vacuousThrowAssertions()` scanning every
  `scripts/**/*.test.ts`; six suites converted. **CLI-588:** `STANDARD_DIRS` and `CLI_COLORS` registered
  as `table-pairs`. **CLI-562:** the escape-shape timeout is now derived from the work it does
  (`LINT_ZONES.length * ESCAPE_SHAPES.length * 2 * LINT_PASS_BUDGET_MS`) rather than the 10s default —
  proved by lowering the budget to 10ms and watching it time out at 240ms. **CLI-605:** landed by
  another lane.
  **CLI-588's count re-derived: 16, not the 11 the row claimed** — reproduced by building a fixture root
  from `git show HEAD:` plus live `consts.ts` and running the registered row, which reported
  `namedButAbsent: 16, presentButUnnamed: 16`. Eleven is not reachable from any reading.
  **A fifth site of the ordinal-in-a-comment class was repaired by deletion**, including one FALSE
  count: a docblock said `UI_SYMBOLS` has "three of its members" holding an identifier where the tree
  holds four.
  **The lane's own finding is the transferable part** and became CLI-627: the row's second proposed fix,
  `toThrow(new RegExp(CONSTANT))`, is exactly as vacuous as the bare form, because `new
RegExp(undefined)` is `/(?:)/` — the empty pattern. A fix that reads as the repair and is not one.
  Gates were run directly in `packages/cli` rather than through turbo, per CLI-626.

- **2026-08-21 — EDITOR-02 and SERVER-04** (editor.md, server.md) — landed together, and the honest
  result is that ONE of the two rows failed its own test. **EDITOR-02:** the bundle is now split into
  react / icons / observability / vendor / catalog groups with a 330 KB gzip first-paint budget
  enforced INSIDE `vite build`. **But the row's premise does not survive measurement.** Cold first
  paint went 303.8 KB → 304.4 KB gzip — 0.6 KB WORSE. Code splitting redistributes bytes; it cannot
  remove them. What improved by 90% is repeat-visit cost: re-download after a one-string deploy went
  295.2 KB → 28.8 KB, measured by changing one string, rebuilding both ways and diffing the emitted
  content hashes. Two further row claims were false: the 228 KB second chunk is `posthog-js`, already
  lazy and untouched by this work, NOT the catalogue — the catalogue was inside the 1.07 MB first
  chunk. Remaining cold-paint levers are all outside the row (icons 59.1 KB, catalogue 48.2 KB, Sentry
  27.8 KB — and Sentry's static import is a documented deliberate decision, argued against PostHog's
  dynamic one, so it must not be reversed silently).
  **SERVER-04:** the worker now answers a seed-version mismatch as **409** rather than a generic 400,
  and the editor turns that into `Out of date — reload` which does NOT decay, while every other ending
  still clears. **The interruption had shipped a live regression that this pass caught and fixed:** the
  hook computed the per-outcome label but `roster-panel.tsx` still narrated the coarse state from its
  own `SHARE_LABELS` map — while the `decays: false` half DID reach the screen. So a stale tab held
  "Sharing failed" PERMANENTLY, where before the work it cleared after two seconds. Hand-run in real
  Chromium against a real `wrangler dev` worker through a pass-through that decrements `v`, so the 409
  is the worker's own answer rather than a fixture: 201 → `Link copied`, 409 → `Out of date — reload`
  and it stays, 503 → `Sharing failed` then clears, abort → `Offline — try again` then clears.
  **The same defect had a second door**: `use-install-command.ts` gave three refusals one sentence, so
  a stale tab was told nothing about the reload that is its whole fix. Fixed the same way.
  `share_result` analytics widened from `{ ok: boolean }` to carry the outcome — the funnel had been
  counting a refused clipboard write as a failed share.

- **2026-08-21 — CLI-477, CLI-564 and REPO-24** (cli.md, repo.md) — the catalogue-truth lane.
  **CLI-564 was never a wrong-numbers row.** All five figures were re-derived by EVALUATING the
  modules rather than reading the document, and **every one was already correct**: 35 categories,
  53 skill ids, 61 `needsAny` of 98, 176 rule slugs all resolving in `slugToId`, and the 12/0/98/42
  rule counts. It was purely a nothing-holds-them row, and they are now held as MEMBERS
  (`as const satisfies readonly Category[]`) rather than as totals — so the document's number is the
  length of a list checked member-for-member and cannot be typed by hand and be wrong.
  **The finding worth carrying forward is the one figure that is correct and still misleading.**
  `Object.keys(stack.agents)` counts DECLARED sub-agents, and seven of `cli-tester`'s eight slots are
  `{}` — only `cli-ink-oclif` gives it a skill. So "the same 8" is 8 declared and 1 assigned. Every
  other agent's two readings agree, which is exactly why the single ambiguous figure sat invisible
  beside twelve unambiguous ones — and **re-deriving the number REPRODUCES the ambiguity rather than
  catching it**. Pinned by name in `EXPECTED_EMPTY_AGENT_SLOTS` beside an assertion that the one filled
  slot is filled. Whether a stack SHOULD declare a sub-agent it gives nothing to is left as an open
  product question, deliberately unanswered.
  Honest limits stated rather than papered over: derivation-over-checking is structurally unavailable
  here (nothing generates `.ai-docs/`, and the drift checker binds MEMBERSHIP to an enumerated section
  while these claims are TOTALS), and three items are prose only a human can judge.
  **REPO-24 confirmed free — but NOT for the reason the roadmap gave.** The roadmap said "no installed
  base"; the registry says `@agents-inc/cli` took 2427 downloads last month against `agents-inc`'s
  1985, i.e. the deprecated package OUT-DOWNLOADS its successor, which reads as a live base and would
  say do not delete. The discriminator is the per-version spread: 491 downloads spread near-flat across
  **all 126 published versions** (13 down to 4) is a crawler, where humans cluster on the newest — as
  `agents-inc`'s own 77 across 12 versions do. That satisfies the row's own stated condition verbatim.
  Hand-run confirms the failure is loud: the old spelling throws `Cannot find module
'@agents-inc/cli/config'`.
  Corrections: the row said "four numbers and a fifth" where the document enumerates six, and the
  document's own spec counts were stale (2986/13 against an actual 2991/13).

- **2026-08-21 — CLI-571** (cli.md) — stale comments naming the withdrawn `installPluginsStep`. **The row
  said "two stale comments"; the symbol was live in FOUR e2e specs and FIVE documents.** The live path is
  `handleInstallation` → `requireMarketplaceOrExit` → `installPluginSkillsReported` →
  `reportPluginInstalls`.
  **Two judgements make this worth reading rather than a rename.** First, the hits were split BY TENSE and
  only the present-tense ones fixed: a sentence saying "`installPluginsStep` hard-errors" is drift, while
  "Pre-fix: `installPluginsStep` emitted `this.warn()`" is a true historical record — five past-tense
  mentions were deliberately left. Second, **a one-word rename would have created a fresh FALSE sentence
  in two places**: a spec said the guard "lives in `edit.tsx::applyPluginChanges` and is byte-identical to
  the one in `init.tsx::installPluginsStep`; this test locks them so drift cannot slip past CI" — but
  there is no longer a duplicate to drift, the guard having been single-sourced into
  `BaseCommand.reportPluginInstalls`. Substituting the name would have preserved a claim about duplication
  that is now false. Same at `architecture-overview.md` and `configuration.md`.
  Eight sites changed, every one a comment or prose line — `git diff -U0` is all `*`/`//` lines, zero
  executable change. The four owned specs run 14/14 green. The instruction to DROP
  `init-dashboard-edit-plugin-install.e2e.test.ts` was confirmed correct: the file exists and contains
  zero hits.

- **2026-08-21 — CLI-607, CLI-612 and CLI-618** (cli.md) — the command-failure-reporting lane, closing the
  worst user-visible defects in the mechanical batch. **CLI-607:** `init` read `compileResult.compiled` and
  never `.failed` or `.warnings` (census confirmed at zero), so it printed a count of successes, then
  `initialized successfully!`, and exited 0 — a sub-agent that failed to compile during a user's FIRST
  install was invisible on every surface. `run()` is now two statements mirroring `edit`; a new
  `reportCompilation` qualifies the count and records off `failed` — deliberately never off `warnings`,
  which carries `No agents found to recompile` on every project-context run and would file phantom work.
  Hand-run: `Compiled 1 agents (1 failed)`, the compiler's own warning re-emitted, the remedy named, and
  `echo $?` → **5**; clean leg → 0. **CLI-612:** `eject` landed its templates then exited on a refusal —
  now catches, reports, withholds the tick and exits 5, with the refusal itself untouched. Mutation-checked
  by deleting the try/catch and watching `✓ Agent templates ejected to …` appear in the same output as
  `expected 1 to be 5`, which is the whole point of the row. **CLI-618:** `ConfigWriteOptions.agents` became
  `agentDefs?: AgentDefs`, so a caller can only hand over what `loadAgentDefs()` produced — the roster is
  now unrepresentable rather than merely discouraged, and the previously-refused one-line deletion was not
  repeated.
  **Hardening went beyond the rows:** the failure-site roster widened from 2 files to 4, plus a NEW gate the
  hoist made necessary — it globs `src/cli/commands/**` (derived, not listed) and refuses any command that
  records incomplete work without calling `exitIfWorkIncomplete()`, a failure mode that could not exist
  while the mechanism was private. It asserts the recording set first so it cannot pass vacuously.
  `reportPropagatedRecompile`'s warn-only reason was REWRITTEN rather than reused: two of its four callers
  answer for no recorded failure at all, so recording there would file work into a list they never read.
  **Corrections:** the row claimed `write-project-config.test.ts` used the option at three call sites — it
  is ONE, the other two being assertions on a downstream call; and `eject.ts` contained zero
  `EXIT_CODES.ERROR` occurrences, its 1 coming from a throw propagating to oclif, which changed HOW the fix
  was made rather than what. Spawned CLI-630, CLI-631 and CLI-632.

- **2026-08-21 — CLI-560** (cli.md) — task IDs in test bodies across five files outside the earlier
  sweep's trees, cleared 15 → 0. **Own counts, from two independent paren-free recognisers that agree:**
  `resolver.test.ts` 3, `local-installer.test.ts` 6, `config-merger.test.ts` 3,
  `write-project-partial.test.ts` 1, `wizard-store.test.ts` 2. The sequencing correction was right on all
  three points it named; it is the ROW that understates at ~10. **Meaning was preserved at every site
  rather than deleted** — `Since D-309 no pair-writer…` became `No pair-writer…`, `Per D-221 semantics,
newConfig is authoritative` became `The merge treats newConfig as authoritative`, `D-217: installMode is
gone` became `installMode is gone`. Unblocks CLI-547.
  **Two measurements worth more than the row.** First, CLI-547's stated blocker was disproved: its four
  task-ID section headings were said to move anchors that every inbound link must follow, and the inbound
  count is **zero, zero, and two-pointing-elsewhere** — renaming all four costs no link repair at all.
  Second, the hardening verdict, which is a measured no rather than an omission: `no-restricted-syntax`
  registers selectors as VISITOR KEYS, so it fires only on walked nodes, while comments are attached trivia
  reachable only through `getAllComments()` — the same position as a filename. The tree splits exactly
  along that line: **0 tracker-shaped ids in test titles across 432 specs, 97 lines in bodies**. The half a
  tool can hold is the half nobody breaks. A content gate red on 51 files would acquire an exclusion list,
  which is the snapshot-of-a-moment the whole class is about. Spawned CLI-633 with three design constraints
  already measured. The lane also caught a false positive in its OWN census (`skills-2026` inside a
  directory name), correcting 82 → 81, and fixed the finding rather than the report.

- **2026-08-21 — CLI-610, CLI-537, CLI-540, CLI-579, CLI-572, CLI-628, CLI-542 and CLI-493** (cli.md) —
  the documentation-accuracy lane. **Five of the eight rows did not describe the tree**, and in three cases
  a DIFFERENT live defect was found in the same neighbourhood, which is the argument for sending a lane
  rather than a patch.
  **CLI-610's own proposal was refuted by measurement** — see CLI-635. Three of its four cited instances
  were already fixed, and `superRefine` DOES exist in `src/` (`renamedFieldGuard`); only
  `validateCategoryField` is a phantom. The one live instance was in a file the row never named,
  `reference/skills/skill-primitives.md`, which described a `superRefine` relaxing fields for
  `custom: true` and pointed the reader at `zod-schemas.md`, which says the opposite.
  **CLI-537's row does not describe the tree** — `architecture-overview.md`'s `related:` names the bodies,
  not the stubs, and a census of every `related:` edge found all 5 pointer-naming edges target ONE file,
  `type-system.md`, which is not a pointer at all: `DOCUMENTATION_MAP.md` files it as a body,
  `documentation-bible.md` names it as owner of five union counts, and `check-enumeration-drift.ts` binds
  `AGENT_NAMES` to it. **Only the file itself said "Pointer"** — the CLI-610 class again, so the file was
  fixed rather than the chains. The lane also corrected its OWN first census, which used one of two stub
  spellings and missed four.
  **CLI-628's premise was wrong and BOTH figures are right.** The answer was already in the tree, on
  `FIRST_PAINT_BUDGET_BYTES`' docblock: _"304.4 KB under Bun, 311.5 KB under Node — the two zlib
  implementations disagree by about 2% on the same bytes"_. It reproduces on both ends: 311.5/304.4 =
  1.023 and 310.9/303.8 = 1.023. Neither hypothesis in the row held. **Nothing needed re-measuring.**
  **CLI-540's four named instances are all already clean** — `search-modal.ts` does not exist and
  `SearchModal`/`openSearch` return zero hits — so the e2e change the brief anticipated was not needed.
  **CLI-579's one "live" item is not live** (`loadAgentDefs` takes no parameter and the doc says so); the
  genuine fossil was in `compilation-pipeline.md`, carrying word-for-word the sentence
  `load-agent-defs.ts`'s docblock calls "the fossil".
  **CLI-493's `STEP_TEXT` leg is done** — the count is 180 and both documents already say 180; every
  figure in the row (139→149, 165, 167) is stale.
  **Twelve documents corrected.** The one worth naming: `reference/wizard/state-transitions.md` carried a
  "Known bug (OPEN)" proposing the remedy the 2026-08-19 owner ruling REJECTED, sourced to a finding that
  had been deleted for being wrong — telling the next agent that a deliberate design was a defect.
  `check-finding-citations` excludes `.ai-docs/` by design, so nothing could see it.
  A bonus specimen from the prototype: `commands/index.md` documented `loadGlobalConfigIfExists()` and a
  paragraph of its return semantics, twice, in the present tense. No such function exists and no config of
  any scope is read on that path — the paragraph's CONCLUSION was still true for a simpler reason, which
  is what now stands in its place.

- **2026-08-21 — CLI-627, CLI-626, CLI-544 and CLI-581** (cli.md) — the findings-and-citation-checkers
  lane. **CLI-627:** `isVacuous` in `scripts/refusal-expectations.ts` now condemns the wrapped
  `toThrow(new RegExp(CONSTANT))` shape, which is exactly as vacuous as the bare form because
  `new RegExp(undefined)` is `/(?:)/` — verified as `/(?:)/ true`. Landed in the ordering the row demanded
  (fixtures red → widen → package scan red naming all four sites → convert → 36/36 green), and it closed
  an escape the row did not name: the `RegExp(X)` form WITHOUT `new`, where one missing character would
  otherwise defeat the whole scan. Interpolation was deliberately left alone — `${undefined}` yields the
  literal text `undefined` and fails loudly.
  **CLI-626's central claim was FALSE and the real defect is larger.** `.ai-docs/` is NOT excluded from
  the turbo hash — it sits inside the package, so `$TURBO_DEFAULT$` already covers it, and 226 of its
  files are hashed. What is hashed by **nothing** is `todo/` (zero files) and the root `CLAUDE.md`, both
  outside every workspace — and those are precisely what `check-finding-citations.ts` and
  `check-briefing-contract.ts` READ. So the fix targets different trees than briefed: 1366 → 2315 files
  hashed. The new gate derives its required entries from the checkers' own exported paths and PARSES
  `turbo.json` rather than substring-matching, and was mutation-checked against the exact failure named —
  demoting the entries to a comment still reddens it.
  **CLI-581:** all nine `{@link}` sites repaired; the walk then measured 249 citations and **one**
  survivor, in a third form nobody had catalogued — spawned CLI-637. **CLI-544** was already complete in
  substance, the judgement living in the checker's own docblock; only a cross-reference from the standards
  side was missing.
  The lane also corrected its own first measurement, which had inflated a candidate list by ~50% by
  excluding `apps/`.

- **2026-08-21 — CLI-617, CLI-615, CLI-582, CLI-578, CLI-584 and CLI-536** (cli.md) — the
  config-writer-and-generated-types lane. **CLI-617:** all THREE producers of
  `ConfigTypesBackgroundData` closed onto one exported constructor beside the type, not two of three —
  the mixed-matcher shape a previous lane had declined to create. Its gate has two halves and the second
  carries the weight: a roster over the token union (whose posture column is prose a future author writes
  about their own module) PLUS one assertion reading the TREE — exactly one production module may contain
  `?.custom === true`, which is the derivation a second constructor cannot avoid writing. The roster walk
  found a fifth module on its first run.
  **CLI-615, and the hand-run is the point.** Pre-fix, against a real marketplace whose stack names
  `fixture-only-agent`: `Configuration saved (9 agents)` printed **two lines above** `Compiled 8 agents`,
  exit **0**, with `config.ts` recording the agent, `config-types.ts` emitting it into `SelectedAgentName`,
  and no `.md` compiled. Nothing treated the 9-vs-8 mismatch as an error. Fixed by narrowing with
  `isAgentName` and dropping the cast.
  **CLI-578's central claim is FALSE and disproving it found something better.** The empty partition was
  NOT untested — two specs covered it. They asserted `expect(result.global.stack ?? {}, …)`, and the
  `?? {}` collapses `undefined` and `{}` before the matcher sees either, so they could check "empty" and
  never "present". Measured on a mutated product: with the fallback 2 passed, without it 2 failed. Fixed by
  deleting the fallbacks. **The row's own proposed mechanism also cannot prove its subject** —
  `generateStandaloneConfig` omits an empty stack, so no emitted `config.ts` can distinguish `{}` from
  absent; the distinction is observable only in memory. Spawned CLI-640.
  **CLI-584 invariant (2) was closed by argument rather than by a spec:** it is structurally impossible to
  violate at the generator (`buildStackForSelection` iterates `agentList` and nothing else, and
  `resolveActiveAgentConfigs` throws on a selected agent with no config), and a writer-level spec would
  assert behaviour the writer does not have — passing without the writer doing the thing, which the
  briefing contract calls worse than no guard.
  **CLI-536's premise is a name-level grep of three files, and inverts when run over `.ai-docs/`:** nine of
  the ten ARE documented, elsewhere. So the work became pointers rather than ten duplicated sections — and
  placing them exposed that the existing `Marketplace*` WILDCARD row was itself a false cardinality claim,
  wrong in two of its members.

- **2026-08-21 — CLI-611 and CLI-502** (cli.md) — the marketplace-load-and-refusal lane.
  **CLI-611 described the tree exactly; nothing in it was wrong**, and it was reproduced by hand first
  against a manifest named `Acme_Skills`: `search` printed the refusal as a `Warning:` and exited **0**,
  and `doctor` printed the same warning then `Marketplaces ✓ 1 marketplace validated`, exit **0**.
  Fixed by adding a second error TYPE on the existing principle rather than by weakening the catch:
  `MarketplaceNameRefusedError`, selected by reading the **Zod issue's PATH** (`path[0] ===
MANIFEST_NAME_FIELD`, typed `keyof Marketplace`) and never its message, so the docblock's rule that
  nothing matches on a sentence still holds. `ManifestState` gains a fourth member and
  `resolveMarketplaceLabels`' exhaustive switch ABORTS on it, with the abort-vs-degrade decision written at
  the switch. **`doctor.ts` is unchanged** — the reconciliation happens where the verdict is computed, not
  in the renderer.
  **The scope is the NAME only, and that is deliberate rather than incidental:** making every schema
  refusal abort reddens two existing specs, and that mutation was run and watched. A manifest with an empty
  `owner.name` still installs; a name Claude Code will not register does not.
  After, by hand: `search` exits 1 naming the kebab rule; `doctor` reports
  `Marketplaces ✗ 1 marketplace: 1 error` and `Marketplace Reachable ✗`; `init --marketplace` refuses and
  leaves the project directory empty; renaming makes both tick — and `search`'s Origin column now reads the
  real marketplace name where it had read `agents-inc`, an incidental gain because the load could no longer
  proceed unnamed. Every refusal leg has its accepted-name twin **in the same file**, per the
  pin-refused-with-allowed rule. Spawned CLI-643, CLI-644.
  **CLI-502's remaining item landed and the row understates its own defect twice** — see CLI-644. The
  hardening verdict is worth keeping: no cheap honest gate exists for "a schema refusal swallowed between
  the schema and the user", because a scan can find the readers but cannot judge whether each CHOSE abort
  or degrade, and a scan for an `ABORT on…` comment is satisfied by the comment alone — the exact shape a
  2026-08-21 finding already records. What held here was a paired spec.

- **2026-08-21 — CLI-633, CLI-634, CLI-599, CLI-593, CLI-594, CLI-546 and D-235** (cli.md) — the
  small-refactors lane, and its value was in what it refused as much as what it built.
  **CLI-633's premise understated what already existed, and the correction is the durable part.**
  `eslint.config.js` has banned tracker ids in test titles since CLI-357 and the tree read clean — config
  declares the rule, lint green, census empty. Measured through `ESLint.lintText` against the REAL config:
  **`it.skip`, `it.only`, `it.each([…])(…)`, `describe.skipIf(…)(…)` and the tagged-template form all
  ESCAPE**, because the selectors key on a bare-identifier callee. So do `SKILLS-`, a hyphenless `d227`
  and a lowercase `cli-551`. **A census over a selector that cannot see the node is indistinguishable from
  a census over a working one** — spawned CLI-648. The new gate replaces the config rather than overriding
  it, because `no-restricted-syntax` takes options and does not merge across blocks, so an override would
  have silently dropped the config's own selectors.
  **It also corrected its own brief twice, against me:** the digit run must be `{2,4}` because the one
  `{1,4}` hit is `(D7 cross-scope safety)`, a PHASE LABEL that CLI-574 rules needs no rename; and my claim
  that the gate would condemn the file's own fixtures was FALSE for a title gate — those strings are array
  members, not titles.
  **D-235's stated expectation is not producible, and the spec says so.** `Domain = GlobalDomain | "api"`
  cannot be reached because `selectedDomains` is carried WHOLE into the global partition, so global always
  names every domain the run selected. The Category half diverges genuinely and is what the spec covers.
  A two-phase flow cannot help either — a second `cc init` inside a project with a global install opens
  the dashboard. Both facts are in the spec's docblock so no reader mistakes its reach.
  **CLI-546** now resolves the catalogue through `SKILLS_SOURCE ?? path.resolve(MONOREPO_ROOT,
"../skills")` — the same pair two existing specs use — with no machine-specific path left, proven by a
  hand-run of `real-marketplace` at 10 tests, none skipped. **CLI-594** re-derived at three geometries:
  `viewportY + rows === length` in all three, and no scroll API is called anywhere.

- **2026-08-21 — CLI-332, CLI-333, CLI-335, CLI-336 and CLI-337** (cli.md) — retired as PHANTOM rows, and
  the block heading them was factually inverted. It read _"These specs exist and are complete. They do not
  execute, so the behaviour they cover is unverified"_ — **four of its six rows name specs that do not
  exist at all.** Verified: `init-wizard-filter-incompatible`, `global-skill-filter-incompatible-guard`,
  `init-wizard-sources-cancel-persists`, `new-skill` and `new-agent` all return zero files under `e2e/`.
  Two describe themselves as gated on `FILTER_INCOMPATIBLE`, a flag whose module was deleted in
  `95738763`. And **CLI-335 was already retired to `archive.md` earlier the same day while remaining in
  `cli.md`** — the two documents disagreeing with each other, which is CLI-598's subject committed by the
  orchestrator on the same day it filed that row. No unconditional `.skip` exists anywhere in `e2e/` or
  `src/`, so the block's premise is dead in every direction.

- **2026-08-22 — CLI-639** (cli.md) — the concurrency-interference row, closed on the owner's ruling
  rather than by building the rule it asked for. The evidence stands and is worth keeping: five measured
  interference classes in one afternoon — two files edited under a lane mid-run; a **deadlock** where one
  lane's methods were red against a ledger gate the other lane owned, and neither could close it; three
  spec files appearing beneath a lane in ~20 minutes, reddening the same gate three times; a torn read of
  a half-saved edit (`step-agents.test.tsx` failing in a full run and passing in isolation); and an
  orchestrator diagnosis that was already stale on arrival, two of its three claims false.
  **The owner's ruling: they will not request parallelism, and the correct fix is worktrees rather than a
  rule about which trees tolerate it.** Note for whoever picks that up — `packages/cli/CLAUDE.md` currently
  carries an explicit _"NEVER use git worktrees"_ rule, so adopting them is a change to that document and
  not merely a workflow choice.
  **A correction the row deserves in its own record:** one of the five instances was itself wrong. The
  reported collision — press helpers appearing in `agents-step.ts` — was refuted by the accused lane:
  `pressSpaceForHandrun` and `pressDownForHandrun` **do not exist anywhere in the tree**, that lane never
  opened the file, and its whole change was two hunks elsewhere. The orchestrator relayed a phantom
  collision and asked a lane to resolve something that was not there. So the concurrency cost was real and
  the specific deadlock was not.

- **2026-08-22 — D-214** (cli.md) — the 22-item matrix-hardening row, RETIRED on the owner's ruling after a
  third and final verification. **Its framing was wrong twice and its item list did not survive
  independent re-checking.** Rescoped in August around `new marketplace` being deleted — the command
  returned the next day. Then kept open for one "load-bearing" item that a later pass disproved
  (`search.ts` does not read the matrix singleton; `grep -c "matrix-provider"` → 0). Then re-verified
  item by item, which reduced a claimed ~7 live to **two genuinely actionable, one cleanup and one
  ruling**. Successor: CLI-650, plus CLI-651 for the `moduleCache` decision.
  **Four corrections the final pass produced, two of them against the orchestrator:**
  (1) The instruction to _"un-skip `new/marketplace.test.ts`"_ was called inoperable because the file did
  not exist. **It exists** — verified, along with `e2e/commands/new-marketplace.e2e.test.ts` — and
  NEITHER is skipped; both already run. The conclusion held, the stated reason was wrong.
  (2) **Item 8's premise was false and had turned a MOOT item LIVE in the previous pass.** It claimed the
  local-skill half refuses an undeclared category; `categoryPathSchema` accepts **any kebab-case string**
  — verified at the source. There was no half-landed asymmetry to close, and `schemas.ts` carries a
  docblock ruling explicitly AGAINST what item 8 proposed: _"`custom` buys its category NOTHING here. It
  used to … the same field now answers to the same schema either way."_
  (3) Item 10 was half dead: one of the two callers it named, `loadConfigTypesDataInBackground`, has zero
  product callers — while the caller set it does not name has GROWN to four.
  (4) Items 13, 17 and 21 all describe code nothing reaches or that was never built (`idToSlug` has zero
  product readers; the one transitive `requires` walk is already cycle-safe by a visited set;
  `ForeignSkillId` is 0 occurrences, existing only in a changelog).
  **The residual singleton hazard was checked rather than assumed and is NOT reachable** — the design
  claim behind it is real and documented (_"absence of an answer is not an answer"_), all five
  `skipExtraSources: true` sites belong to non-wizard commands, and three further singleton readers in
  `wizard-store.ts` were enumerated and cleared. Even if reached, the degradation is benign: worse advice,
  not silent corruption.
  **The hardening verdict is the transferable half.** For items 13 and 17 no honest gate exists, and that
  IS the finding: a test proving `idToSlug` keeps a reverse entry, or that a `requires` cycle is detected,
  would guard a field nothing reads and a graph already guarded — satisfiable without the product doing
  anything a user can observe. The class-level gate that would have prevented four of the twenty-two items
  mechanically is CLI-623's, which was itself refuted; it would have caught `computeMatrix`,
  `ForeignSkillId`, `rawMetadataSchema` and `NEW_MARKETPLACE_COMMAND` on the day each symbol went, and
  would NOT have caught items 8, 13 or 17, whose symbols all still resolve.

- **2026-08-22 — CLI-629, CLI-637 and CLI-549** (cli.md) — the compiler-API checker and the seed
  description, both on owner rulings.
  **CLI-629:** `scripts/check-symbol-citations.ts` walks every `JSDocLink` node and asks
  `checker.getSymbolAtLocation`, once per tsconfig project. **273 citations examined, 0 unresolved, 0
  false positives** — against the rejected ESLint alternative's 4-of-9 with two false positives. Before
  repair: 271 examined, **2** unresolved, both genuine. One was CLI-637's bare module path. **The second
  was not in the brief and is a FOURTH non-resolving form:** `createPluginInstalledProject` cited in
  `e2e/fixtures/project-builder.ts` is declared and exported from a module that file already imports from
  — but is not imported HERE, so it _"resolves for a reader who greps and for nobody else."_ Two design
  points worth copying: the project roster is held against `package.json`'s `typecheck` script rather than
  a copy of itself, so a fourth project reddens by name; and the checker reports which trees it READ,
  because a count cannot tell a clean tree from an unread one.
  **CLI-549:** `description` now travels on the payload; `stackId` is untouched and still `null`;
  `SEED_VERSION` is still 5. Hand-run round trip read the actual bytes and the description survives. The
  no-bump reasoning was VERIFIED rather than inherited — `z.object` strips unknown keys (measured on zod
  4.4.3, and `superRefine` preserves that, so the installable schema behaves the same), so a consumer
  built before the field installs the identical configuration, which is today's state. Pinned in
  `seed.test.ts` through a key no build will ever know, so the test still says something once
  `description` is ordinary. Spawned CLI-654 for a consequence the analysis had not named.
  **Two corrections, one of which was circulating in briefs.** `ts.parseJsonConfigFileContent` does NOT
  silently ignore `extends` — measured on TypeScript 6.0.3, both entry points resolve the two-level chain
  and both yield 414 root files, agreeing on every compiler option checked. The "212 of 413" figure does
  not reproduce. **`documentation-bible.md` carried the same false claim and was corrected in place**,
  since briefs were quoting it. And the "249 citations, 1 unresolvable — do not re-derive" instruction was
  stale in both figures. Spawned CLI-652 (two further checks worth building, five judged not, each with
  its reason) and CLI-653.

- **2026-08-22 — CLI-645 and CLI-641** (cli.md) — the fake-home carrier and stack sub-agent validation.
  **CLI-645, and the carrier is WORSE than the row stated.** The row described `dist/` freezing to the
  first test's fake home. In the `src` graph `consts.ts` is imported at COLLECTION time, before any hook
  redirects `HOME` — so `GLOBAL_INSTALL_ROOT` and `CACHE_DIR` held **the developer's real home in every
  unit test that read them**. Probed against the unchanged tree: two consecutive tests under different fake
  homes both read `/home/vince`. Both are now call-time functions (`globalInstallRoot()`, `cacheRoot()` —
  named to avoid shadowing five local `cacheDir` bindings), three product reads updated (not the two the
  row named), and the `os.homedir` spy moved from `beforeAll` to `beforeEach` so it survives
  `vi.restoreAllMocks()`. **Gate:** a recogniser with its own 10 tests, run over `src/cli/**`, which reads
  a DECLARATION SHAPE and so cannot be satisfied by prose — planted constants named by file before it was
  trusted, including a multi-line form, with the regex deliberately stopping at the declaration's own
  semicolon.
  **CLI-641 posture: drop the unknown sub-agent with a NAMED WARNING, not refuse** — argued four ways in
  the code: refusing takes the valid sub-agents down with one typo in a marketplace the user may not own;
  `resolveStackAgentSkills` in the same function already drops unknown skill ids, and one function
  answering the same question two ways is worse than either answer; `refuseCatalogueCollisions` refuses
  because a colliding id is UNSAFE where an undeclared sub-agent is merely uncompilable; and CLI-611's
  requirement is met by making the drop AUDIBLE rather than by refusing. Hand-run on the real binary shows
  the band naming the stack and the agent, with the stack still offered.
  **CLI-597 did not become free** — cheaper (the seam, the message shape and the fixture route now exist)
  but the skill-id work is a separate filter and a second message, and the deferral's reasoning is
  untouched. Its row is also partly stale: `resolveStackAgentSkills` DOES filter the per-category map and
  DOES warn per unknown id; only `allSkillIds` is genuinely unvalidated.
  Spawned CLI-655 — a spec that was green about a state no run can produce — and CLI-656.

- **2026-08-23 — CLI-746, CLI-789, CLI-817, CLI-648** (cli.md) — **Four rows retired on
  re-derivation, none of them by work done for their own sake.** All four were closed as collateral
  by the 0.157.0 release and stayed open because nothing re-measured them; found by a read-only pass
  over the 43 rows of `plans/verified-mechanical-worklist.md`, of which these were the only stale
  ones. **CLI-746** — `grep -c 'D-220' src/cli/lib/configuration/config-generator.ts` returns **0**,
  while `shouldIncludeTriple` and `isScopePairCompatible` both still exist, so the id migration
  cleared the docblocks rather than the subject going away. **CLI-789** and **CLI-817** —
  `prettier --check` is clean on `reference/commands/index.md` and `standards/e2e/user-journeys.md`;
  the working-tree drift both rows measured never reached a commit, so the reflow cost they were
  filed to prevent was never paid by anyone. **CLI-648** — closed by exactly the remedy it proposed:
  `spec-filenames.test.ts` carries `TITLE_CALL`, four selectors covering the bare-identifier,
  `callee.object`, `callee.callee.object` and `callee.tag.object` shapes, with `TITLE_SHAPES`
  planting a fixture per shape and the prefixes composed from `TRACKER_ID_PREFIXES` so a seventh
  tracker cannot arrive unfixtured. `eslint.config.js`'s own selector is still bare-identifier-only
  and deliberately so — the gate is the in-process ESLint pass, not the config.
  **CLI-547's citation was repaired rather than left dangling**: it read "Same class as CLI-648" and
  now carries the fact instead — a pattern that cannot see the node reads exactly like one that
  works, so a clean census is not evidence.

- **2026-08-23 — CLI-742** (cli.md) — **Moot, and the row's own exemption is what makes it moot.**
  The row counted 14 unsanctioned `D-220` sites — 12 in `config-generator.ts`, 2 in
  `local-installer.ts` — and explicitly excluded two more in e2e FILE-LEVEL JSDoc as sanctioned,
  `packages/cli/CLAUDE.md` naming that the one permitted home for a task id. Measured 2026-08-23:
  both source files return **0**, and the only `D-220` left in the tree is those same two sanctioned
  file-level docblocks in `stack-per-agent-curation.e2e.test.ts` and
  `edit-remove-last-skill-stack-cleanup.e2e.test.ts`. So the census the row was filed on is now
  empty and the residue is the part it had already ruled out of scope. Cleared by CLI-574/CLI-680
  rather than by anything done for this row. Verify with
  `grep -rn 'D-220' src e2e scripts --include='*.ts' --include='*.tsx'`.

- **2026-08-23 — `plans/mechanical-backlog-2026-08-22.md` merged into
  `plans/verified-mechanical-worklist.md`** — two sequencing files for one backlog, and the older one
  was 77% spent. Of its 60 ids, **46 had landed** in 0.157.0 and the surviving 13 were **already rows
  in the worklist**, so the merge lost no work — measured by comparing its id set against the
  trackers' first-column rows rather than against prose, which double-counts cross-references. What
  it uniquely held was the per-row ordering, and that is what moved: `CLI-736` before `CLI-730` (the
  worklist's size ordering lists them the wrong way round), `CLI-596` and `CLI-692` as one lane over
  one schema file and 192 specs, `CLI-689` before `CLI-557`, `CLI-679` last among the documentation
  rows, `CLI-547` unblocked now `CLI-574` and `CLI-680` have landed, the runs-alone set, and
  `WWW-08`'s independence. Its SDLC restatement was deliberately NOT carried across — the root
  `CLAUDE.md` owns that and it drifted the last time it stood in two places. The file's own thesis is
  worth keeping in one line: **the previous attempts failed on ordering, not on effort.**

- **2026-08-23 — CLI-790** (cli.md) — **One unparseable `metadata.yaml` no longer kills `uninstall`
  before it deletes anything.** `readLocalSkillMetadata` and `injectForkedFromMetadata` in
  `skills/skill-metadata.ts` both had a `try`-less `parseYaml` sitting directly above a `safeParse`
  — the shape `clean-code-standards.md` § 7.3 names, and which reads as one guarded operation while
  catching only the schema half. Both now go through one `readYaml` returning a
  `{ parsed: true; value } | { parsed: false; reason }` union, the form § 7.3 nominates
  (`readSkillMetadata` in `loading/loader.ts`) shared rather than repeated, and
  `existingMetadataFields` collapses the two failure routes into the one warning the author
  actually needs. **Driven red first, and a pre-existing spec turned out to be pinning the defect:**
  `injectForkedFromMetadata` had a test asserting `.rejects.toThrow()` on unparseable YAML, directly
  contradicting the function's own docblock promise that _"if parsing fails, only `forkedFrom` is
  written (with a warning logged)"_. The contract stayed and the assertion changed — it now asserts
  the documented behaviour and says in a comment why it was reversed. **Hand-run against the real
  binary** with a project whose installed skill carried unreadable YAML: the run warns by name,
  classifies the skill as not-CLI-managed (unreadable metadata is no provenance), removes
  `.claude-src/`, keeps `.claude/`, exits 0. **No documentation changed and that is the finding** —
  the docblocks were already describing the fixed behaviour, so the code caught up to the docs
  rather than the reverse.
  **Three of the row's supporting claims did not describe the tree, and none affects the headline:**
  the _"two more unguarded sites in `lib/seed/`"_ are four `parseYaml` calls in
  `seed/external-skills.test.ts` parsing fixtures the test just wrote; `readPluginSkillMetadata`
  does not exist, so the "family of three" is two; and `readSkillMetadata` in `loading/loader.ts`
  was already guarded — it is the model the fix copies, not a site needing repair. A census of every
  remaining `parseYaml` in production found **all of them already inside a `try`**, so
  `skill-metadata.ts` held the last instance of the shape and there is nothing to file behind it.

- **2026-08-23 — CLI-814** (cli.md) — `doctor` no longer prints `1 skills available`. The count was
  built by hand at the one site in `checkSourceReachable` while `plural()` sat in the same file and
  served three others; it now goes through `plural()` like its neighbours. **Driven red first with
  the only input that can tell the two forms apart** — `createE2ESource({ withoutSkills:
E2E_SKILL_IDS.slice(1) })`, a marketplace shipping exactly one skill, since every other count in
  the suite is plural and satisfies the buggy form as readily as the fixed one. The expected string
  went into `STEP_TEXT.DOCTOR_ONE_SKILL_AVAILABLE` rather than the spec, per the rule against local
  text constants in E2E files. The assertion runs against `node bin/run.js` on a real generated
  marketplace, which is the same evidence a hand-run gives for a pure string change.
  **The documentation claim in this entry was wrong when written and the drift gate caught it**:
  no prose quotes the line, but `STEP_TEXT` is enumerated exhaustively in
  `standards/e2e/README.md` and `reference/testing/e2e-infrastructure.md`, so the new
  `DOCTOR_ONE_SKILL_AVAILABLE` constant drifted both until they were updated. Adding a member
  to a bound enumeration is a documentation change even when no sentence mentions it.

- **2026-08-23 — CLI-793, CLI-795** (cli.md) — Two defects one comment apart in
  `scripts/check-enumeration-drift.ts`. **CLI-795:** the config-area comment read _"Four modules,
  six rows, because two of the four are enumerated in TWO documents apiece"_; both numerals were
  wrong and are now seven and three, measured by
  `grep -oP 'source: \{ file: (CONFIG_WRITER|CONFIG_TYPES_WRITER|CONFIG_GENERATOR|SCOPE_PREDICATES)'`
  — `CONFIG_GENERATOR` appears once and the other three twice. **CLI-793:** the `FILES` row anchored
  on the literal `**Files (`FILES`)** — all 12:`, making a prose count load-bearing shell for a
  gate in another file — a 13th member reddens the members check, and correcting the prose then
  breaks the anchor and reddens a second row for an unrelated-looking reason. The count is gone from
  both the anchor and the sentence, with the reason recorded at the row: the members check is what
  states exhaustiveness and the sentence does not need to say it twice. **Proved non-vacuous in both
  directions** — removing `CATALOG_JSON` from the README still reddens the row as
  `presentButUnnamed`, and restoring it returns 76/76.

- **2026-08-23 — CLI-778** (cli.md) — Two dead surfaces on the agent assertion helpers, both gone.
  `expectCompiledAgents` had **zero call sites** across `src`, `e2e` and `scripts` — only its own
  definition and a barrel re-export — and `expectValidAgentMarkdown`'s `options` bag was
  unreachable: all **8** call sites pass two arguments and neither `hasCorePrinciples` nor
  `hasMethodologies` was ever supplied, so the flags existed as a signature promising a
  discrimination no caller made. Both sections are now checked unconditionally, with a note saying
  that an agent legitimately lacking one needs its own named assertion rather than a flag on this
  one. Neither symbol was on the `tested-exports-reach-production` roster, so nothing there moved.
  **The drift gate caught the documentation half rather than a reviewer:**
  `reference/testing/factories.md` enumerates the exported values of `__tests__/assertions/` and
  still named the deleted symbol in two places. Deleting an export from a bound directory is a
  documentation change; the gate is what says so.

- **2026-08-23 — CLI-796** (cli.md) — `TEST_CATEGORIES` in `reference/testing/mock-data.md` stays
  **deliberately unbound**, and the table now records why rather than reading as an omission beside
  four neighbours bound the same day. Not bindable as `table-pairs` — every value is a
  `createMockCategory(...)` call and the checker's value reader resolves string literals only,
  refusing it with _"names a symbol holding a member whose value no reader can name"_; teaching it
  to resolve a call's first argument is the "guessed at rather than looked up" that reader's own
  docblock refuses. Bindable keys-only as `table-rows` and **rejected on the repository's own
  precedent**: a sibling comment in the same file argues against that form for two-column tables
  because it holds the keys while letting every value drift, and the Phase C rules pass established
  that a rule ships without a check rather than with a bad one. Closed as a recorded decision, which
  is what the row asked for as its second option.

- **2026-08-23 — CLI-801, CLI-806** (cli.md) — Two journey rows in `standards/e2e/user-journeys.md`
  stating an environment-dependent fact as an absolute. **CLI-801:** row 32 claimed `edit --from`
  "refuses BEFORE the confirm" at `$HOME`. True on a real PTY; piped — which is how the spec runs —
  the no-terminal refusal fires first and the home-scope message never prints. Both exits are 1 and
  both orderings are correct, so the row now names both paths and says which one the spec can see.
  **CLI-806:** row 17 was marked TO TEST **(blocked)** on a `claude plugin install` dependency that
  resolves fine on a developer machine — it succeeded 23 times during verification — and is absent
  only on CI, so the named spec runs here rather than skipping. Re-marked "blocked on CI only", with
  the block read as _nobody has driven it_ rather than _nobody can_. Docs-only, so no test: both
  were verified by re-deriving the claim by hand, which is how they were filed. `spec-gates`
  green at 10/10 afterwards, since it reads this page.

- **2026-08-23 — CLI-807** (cli.md) — Three assertions true of every string, all three residue of a
  removal. `global-scope-lifecycle.e2e.test.ts` carried a bare `expect(stdout).toContain(``)` between
  a comment explaining why the old fragment assertion was dropped and the back-reference that
  replaced it — deleted, with the comment now saying the back-reference is the replacement.
  `install-mode-bulk.e2e.test.ts` asserted ``toContain(`to `)`` at two sites, a substring that
  appears in `Copying skills to local directory`, `Agents compiled to:` and `To customize`.
  **The count turned out not to be the subject and pinning it was wrong twice**: composing the full
  line as the constants' own note prescribes failed at 1, then at `E2E_SKILL_IDS.length` (10) —
  the run switches the 7 skills the install selected, not the catalogue. The assertion now pairs
  `SWITCHING_SKILLS_SUFFIX` with the mode description, which is count-free and carries the whole
  discrimination the constants describe: _a spec asserting only the verb cannot tell a switch TO
  plugin from a switch BACK_. **Mutation-proved** — swapping the two mode descriptions reddens both
  sites; restoring them returns green.

- **2026-08-23 — CLI-804** (cli.md) — Two journeys discharged their compiled-agent surface with
  `toBeGreaterThan(0)`, which no swap can redden. Both now assert members against a named roster,
  the shape `share-round-trip-compiled-bodies` already used. **Three things the row did not know,
  all found by making the change:** the second file is at `e2e/commands/marketplace-author-arc`, not
  `e2e/lifecycle/`; `readCompiledAgents` keys carry the `.md` extension, so the comparison maps
  through `path.basename(file, ".md")` and reads in sub-agent names rather than filenames; and
  `expectInstallSurfaces` is shared by **two variants with different rosters** — a stack install
  compiles the two the stack declares, a stackless source compiles all eight — so the helper now
  takes the roster as a parameter. A single shared expectation would have had to be loose enough to
  accept both, which is how the count got there in the first place. The eight-member constant is
  spelled out rather than derived from `AGENT_NAMES`, because deriving it would make the expectation
  agree with the product by construction. **Mutation-proved with a SWAP** — one member exchanged,
  length identical — which reddens where the old assertion could not. The sibling
  `listFiles(skillsPath(...)).length` count in the same helper is the same class and was left
  deliberately: the row's subject is surface 1, and widening it here would hide the change.

- **2026-08-23 — CLI-805, CLI-808, CLI-809** (cli.md) — Four cells in
  `standards/e2e/user-journeys.md` claiming more, or less, than their specs hold. **CLI-808 (row 5)
  UNDERSTATED itself**: surfaces read `2, 3` while surface 1 is asserted by all four named specs, so
  it is now `1, 2, 3` and only `config-types.ts` (surface 4) is genuinely untested — a grep for the
  four ways a spec reaches generated types returns nothing across all four. Its "blocked" marker is
  re-scoped to CI, since `claude` 2.1.240 was on PATH and the journey ran to completion here
  including real plugin installs. **CLI-809 (row 10)** rested its from-scratch claim on two specs
  when only one qualifies: `commands/update` builds every install from a hand-written config and
  hand-written generated types — a variant end to end — so the claim rests entirely on
  `lifecycle/install-update-source-drift`. A row one spec short of being a real hole is the shape
  the page exists to prevent. **CLI-805 (rows 28a and 29)** overstated two: `real-marketplace` calls
  `selectScratch()` and walks past the install, so the offer half is covered and only the install
  half is open; and no spec crosses `config.marketplace` on the share round trip, because both
  round-trip specs pass `--marketplace <sourceDir>` to the receiving end — the live divergence
  (origin a local path, rebuild the public ref) is `readMarketplace` as designed, not a defect.
  **`spec-gates` caught a mistake in the correction itself:** the first wording put
  `writeProjectConfig` and `writeConfigTypes` in the From-scratch column, which the gate reads as
  spec names and refused. The explanation moved to the status cell, where it is prose rather than a
  claim about which specs exist. 10/10 after.

- **2026-08-23 — CLI-803** (cli.md) — Three assertions that could not fail for the reason they
  named. **(1)** An entire `it` in `interactive/real-marketplace.e2e.test.ts`, named _"should have
  used the real marketplace for plugin installation"_, whose only assertion was
  `toContain("agents-inc")` — **this CLI's own binary name**, in the completion text and version
  banner of every run. Deleted; the two `<skill>@agents-inc` refs above it are the discriminating
  form of the same claim, now named as `INSTALLED_SKILL_REFS` so the later count has a subject.
  **(2)** `toMatch(/skills/i)` and `/agents/i` on `list` output: both are unconditional section
  labels. Replaced by the counts — and finding the right replacement corrected the row's implicit
  assumption that `list` prints a roster, when it prints a summary (`Skills: 2`, `Agents: 5`); the
  roster is asserted by name two tests above, so counts are what this one can honestly hold.
  **(3)** `expect(posted.external).toBeUndefined()` in `commands/share.e2e.test.ts`, proving _"a
  directory nothing forked is outside both halves of the round trip"_ — the fixture's two skills are
  CATALOGUE skills and `external` only ever carries ids no catalogue resolves, so it was undefined
  either way. Replaced by a comment naming the line above as the discriminating one and pointing at
  the sibling spec that posts a real `EXTERNAL_ID`. **Mutation-proved** — the skill count off by one
  reddens; restored, 9/9.

- **2026-08-23 — CLI-797** (cli.md) — Six documentation sites described `ensureBinaryExists()` as
  probing the committed `bin/run.js`, and one of them told the reader outright that it **cannot
  fail** and was findings Pattern V. **That was true when written and stopped being true when
  CLI-671 landed**: the guard now calls `assertDistIsPresent`, which stats `dist/index.js` — the
  file oclif resolves commands from — and refuses when it is absent. So the documentation was
  telling readers a working guard was theatre, which is worse than a stale claim: it invites
  deletion of the thing that works. All six corrected, and the `build-and-packaging.md` block keeps
  the Pattern V history explicitly as history, with a line telling the reader to read any surviving
  "unfailable" description the same way. `check-enumeration-drift` and `check-symbol-citations`
  green at 98/98 after.

- **2026-08-23 — CLI-770** (cli.md) — `flattenCliOutput` moved from `e2e/fixtures/seed-config-store.ts`
  to `src/cli/lib/__tests__/helpers/flatten-cli-output.ts` and re-exported through
  `e2e/helpers/test-utils.ts`, the single door `CLAUDE.md` names, with **21 importers repointed**.
  It now has the tests it never had — four, including one pinning that whitespace is COLLAPSED
  rather than stripped, which is the mutation that would pass every `toContain` on a fragment and
  fail only on the whole sentence this helper exists to assert. The tested home matters and is not
  interchangeable with the old one: no vitest project collects `*.test.ts` under `e2e/helpers/`, so
  a test written beside the helper would never run while looking like coverage. Verified with
  `tsc -p e2e/tsconfig.json`, `eslint e2e`, and the suites that reach it — 9/9 `commands/init-from`
  files and 100/100 `lifecycle/` files.

- **2026-08-23 — CLI-810** (cli.md) — `init-from-greenfield` proved its refusal negatives with
  `listFiles` comparisons, which cannot see a file REWRITTEN in place — the row claimed _"both
  proved byte-identical"_ when only one of the two was read as bytes. Both now use
  `readTreeSnapshot`, which already existed and carries content and mtime, so the page's own
  Negative form rule (_a refusal owes a tree snapshot, "not four separate absences"_) is actually
  met. **Its `{}`-for-absent behaviour is the trap the helper's own docblock warns about**, so the
  spec now asserts both snapshots are non-empty before comparing — an install that never happened
  would otherwise satisfy the comparison for free. **Mutation-proved against the exact blind spot:**
  rewriting one global skill file in place between the snapshots reddens the spec; the old listing
  comparison would have stayed green. The product was never at fault, which the row said — what
  changed is that the spec can now tell you so.

- **2026-08-23 — CLI-813** (cli.md) — The from-scratch classifier now has a word for the third
  shape. `holdsOnlyVariants` read two halves — seeds a config, installs from nothing — so a spec
  whose subject is what a command PRINTS over a directory was condemned as a variant if it wrote a
  config anywhere in the file, and that forced a file split earlier the same day for the wrong
  reason. `installsNothing` is the new first question, backed by `INSTALLING_CALLS`, a deliberate
  superset of `FROM_SCRATCH_INSTALLS` kept beside it so the two cannot drift about what an install
  is. **Three tests, and the third is the one that matters:** a spec that seeds and only edits is
  still a variant, without which the first two would be satisfied by a classifier answering `false`
  to everything. **Mutation-proved** — removing the new guard reddens exactly the new case and
  nothing else.

- **2026-08-23 — CLI-802** (cli.md) — Closed as the row's second option: **recorded rather than
  fixed**. Three journey legs cannot be driven by hand — the build-step advisory, the "apply that
  ADDS a skill" leg, and that arc's toast half — because reaching them needs `createE2ESource`'s
  exact shape and the workspace has **no TS runner** (re-verified by looking: neither `tsx` nor
  `ts-node` is installed, only `vitest`), so the fixture builder cannot be called outside a suite
  run. `standards/e2e/user-journeys.md` gains a _Legs that are suite-only by construction_ section
  saying so, naming the three and both ways out — a runner dependency or a compiled entry point —
  neither taken. The point of writing it down is that a hand-run can never independently confirm
  these three, so the suite is the only evidence there will be, and a reader should stop treating
  their empty hand-run column as an omission.

- **2026-08-23 — CLI-815** (cli.md) — The editor consequence of the scoped catalogue emission, run
  and now guarded. Both editor suites pass — **400 unit, 324 Playwright** — so the row's "run it" is
  answered, and the answer is that nothing had broken. **But nothing pinned it either**, which the
  running does not fix: every add-skill spec picks one category by name, which passes whether the
  dropdown offers five or a hundred. A new spec in `marketplace.spec.ts` loads the acme marketplace
  and asserts the placement dropdown then offers **that** catalogue's domain set (`api`, `web`)
  rather than the public nine. **Two corrections to my own first attempt, both found by running
  it:** I wrote the guard in `add-skill.spec.ts` against `DOMAINS` from `support/catalog.ts`, which
  names only the three domains those specs use rather than the whole seated set — the default page
  legitimately offers nine; and the default path is not the row's subject at all, since the
  narrowing only shows when a MARKETPLACE is seated. The guard belongs where one is loaded.
  **Mutation-proved:** skipping the marketplace load leaves the public catalogue seated and the
  assertion reddens.

- **2026-08-23 — CLI-761** (cli.md) — **MISDIAGNOSED in both halves, and the measurement is the
  deliverable.** (1) _"Three tables state the same fact"_ overstates it: `SKILL_IDENTITY_FIELDS`
  already reads `slug` and `displayName` from `E2E_SKILL` and duplicates **only `category`**, for
  ten of its twenty-four entries — the other fourteen are skills project-builder writes that no E2E
  source ships. `getCanonicalSkillTaxonomy` covers 80 unit-factory ids overlapping nine of the ten
  by raw name. Three tables, one partly-shared field. (2) _"`getCanonicalSkillTaxonomy` is not
  exported, which is the only reason a unit spec had to state a category inline"_ is **false**: the
  inline sites are not canonical-skill claims at all — `source-validator.test.ts` passes
  `category: "web-framework"` as raw snake_case payload under test, and `external-skills.test.ts`
  states one for an `EXTERNAL_ID` carrying `custom: true`, which by definition answers to no
  canonical table. Exporting it would have added an export with **no consumer**, which
  `packages/cli/CLAUDE.md` forbids outright. **What actually landed** is the correction the row was
  right about: `E2E_SKILLS`'s docblock called itself _"the SOLE definition of what a fixture
  ships"_, and it is not the only table stating a category for these skills. It now says so, names
  both siblings with their real counts, and records what closing the ten-skill overlap would take —
  giving `E2E_SKILL` a `category` derived from `E2E_SKILLS`. Not done here: it is a change to the
  shared identity map with no defect behind it.

- **2026-08-23 — CLI-771** (cli.md) — **The `dist/` race is fixed for the case that was actually
  fixable, and the prevention CLI-708 refused stays refused.** The row asked to prevent two AGENTS
  racing, which CLI-708 closed as detection-not-prevention with all three routes rejected. Rescoped
  after the real instance turned up in a single command: `turbo run test test:e2e` fired **three
  tsup builds** — measured, `grep -c '\$ tsup$'` — because `packages/cli/turbo.json` already ordered
  a build ahead of each task through `dependsOn` AND the npm `pretest`, `pretest:e2e` and
  `pretest:smoke` hooks each ran another, while turbo runs those tasks concurrently. `clean: true`
  meant the loser died with `ENOENT ... unlink dist/chunk-*.js`, which is what aborted a push with
  no legible error. The three hooks are gone; the same command now fires **one** build. A `//test`
  note in `package.json` records why, so nobody restores them.
  **Removing them made five statements false, and all five were corrected in the same change** —
  the guard's own `REBUILD_HINT` still told the reader `bun run test` builds first,
  `WHY_A_REBUILD_EMPTIES_DIST` named the three hooks as the danger, `assertDistIsFresh`'s docblock
  and `e2e/global-setup.ts` both credited the hooks, and `clean-code-standards.md` § 6.19 described
  a two-layer enforcement whose first layer had just been deleted. Two stale rows in
  `build-and-packaging.md` and `infrastructure.md` went with them. **The direct path was verified by
  moving `dist/` aside**: a bare `vitest run` refuses with `dist/ does not exist.` and now names a
  hint that is true. 206 files / 7180 tests green through turbo afterwards.

- **2026-08-23 — CLI-788** (cli.md) — `INCOMPLETE_WORK_RECOVERY.DELETE_AGENT_FILE` now has a spec
  that fails when the site stops working, rather than a roster entry pinning that some site names
  the member. `cleanupStaleAgentFiles` runs AFTER `writeConfigAndCompile`, so the two existing
  failure cases in that file walk straight past it — they sabotage the compile target, and a pass
  that fails to compile has nothing stale left to delete. The new case reaches the removal arm the
  way the hand-run did: a clean pass first so a compiled file exists to go stale, then the agents
  directory at `0555` so the unlink of the sub-agent the second pass drops fails. **Its control is
  the load-bearing half** — the first pass must really compile the file, or a removal that was never
  attempted satisfies everything after it for free. **Two corrections found by running it:**
  `buildProject()` leaves no compiled agents on disk, so the file only exists after a pass; and
  `AgentsStep.toggleAgent` navigates by the RENDERED title, so `E2E_AGENT[...].name` (`web-developer`)
  never focuses anything and `.display` (`Web Developer`) is what it wants. **Mutation-proved
  against the product**: deleting the `reportIncompleteWork` call from `cleanupStaleAgentFiles` and
  rebuilding reddens exactly the new test; restoring it returns 4/4.

- **2026-08-23 — CLI-647** (cli.md) — All five `??`-between-subject-and-matcher sites repaired, and
  **removing each fallback proved the row right by producing a different answer**. The two exact
  tells split: `local-installer.test.ts` really did hold `[]`, so its `?? []` was pure noise and the
  bare assertion now fails on an absent key; `scenario-c-init-registers-project` held **`undefined`**
  — a global install writes no `projects` KEY at all — so the fallback had been equating two states
  that mean different things, and it now asserts `toBeUndefined()`, which is the stronger claim and
  the one the test is named for. The three negative forms needed controls rather than rewrites,
  because `JSON.stringify(undefined ?? {})` is `"{}"` and contains no id however the run went: in
  `init-project-skill-reaching-no-agent` the project stack turned out to be **absent**, which is
  precisely what that journey is about, so it now asserts the absence directly and keeps the
  serialised negative only for the global stack, which really is populated. `uninstall-manifest-removal`
  needed only the fallback gone — vitest throws on `expect(undefined).not.toContain`, so an absent
  `projects` now fails where it used to be excused. **The row's own caveat that the `?? {}` sites
  "cannot simply have it deleted" was right about the mechanism and wrong about the remedy**: the
  answer is a control above the negative, not a fallback around the subject. The wider 522-hit `?.`
  census the row names is untouched and stays open under its own scope.

- **2026-08-23 — CLI-652** (cli.md) — Both proposed compiler-API checks built; the five the row
  argued against stay unbuilt and its reasons stand. **BUILD (1),
  `scripts/check-boundary-union-casts.ts`:** three exact predicates — source type is
  `TypeFlags.String`, target is a union of string literals, target's declaration lives under
  `types/generated/`. The previous lane was right that a grep cannot do this and wrong that nothing
  can: `as SkillId` reads identically whether the subject is a literal the compiler already knows
  or a `path.basename(...)` the filesystem just handed over, and only the second is the shape
  `CLAUDE.md` bans. **Measured 12 sites, not 13** — landed as a DECLARED BACKLOG keyed by module
  rather than a gate opening red, per the lesson that a gate arriving with a dozen violations gets
  deleted the first time it is inconvenient. Scoped by DIRECTORY through `PARSE_BOUNDARIES`, never
  by an on-site comment, as the row insisted. Proved by planting a thirteenth site, rebuilding, and
  watching the gate name it. **BUILD (2), `scripts/check-symbol-file-pairs.ts`:** CLI-635's parked
  subset, moving the predicate from _the identifier appears in file F_ to _file F DECLARES it_ — the
  distinction is load-bearing because a module that IMPORTS a moved symbol satisfies a grep, which
  is exactly the state a move leaves behind, and a test pins that case directly. **The first design
  was wrong and the checker said so rather than guessing**: resolving a bare `some-module.ts` by
  filename refused with _"names a module more than one file answers to: index.ts — 19 files"_, then
  again on `config-assertions.ts` at two. A bare module name is not an address; the SECTION HEADING
  is what scopes it, so that is what it now reads. It **arrives green** over `factories.md`'s
  100-odd rows, which is evidence the document is right rather than a repair wearing a gate's
  clothes, and mutation-proved by renaming one row's symbol.

- **2026-08-23 — CLI-812** (cli.md) — Both missing standards written into
  `clean-code-standards.md` § 15, where the neighbouring data-integrity rules live. **15.17: an
  artefact that ships to consumers narrows EVERY built-in table it inherits.** The tell recorded
  with it is the useful half — each side read correct alone, because `narrowToShippedSlugs` carried
  a docblock explaining exactly why narrowing the rules was right while the categories pass-through
  had no docblock at all, nobody having been asked the question. **15.18: a spec over a published
  artefact asserts every block it carries, not the subset that happens to be right**, with the
  instruction to enumerate the blocks from the artefact's own schema or writer so a fourth added
  later reddens the spec rather than joining the unasserted set. **Verified the defects behind them
  are actually fixed rather than only documented**: `loadMarketplaceMatrix` now returns
  `{ ...matrix, categories: categoriesTheseSkillsAreIn(matrix) }`, so an emitted catalogue no longer
  advertises 102 categories its marketplace has nothing in. The row was right that only the
  standards were outstanding — its lane was fenced to gate-demanded `.ai-docs/` rows and could not
  write them.

- **2026-08-23 — CLI-557** (cli.md) — **Overtaken by CLI-538, and closed by measuring rather than by
  writing the E2E it asked for.** The row was right when filed: `config-scope-integrity.e2e.test.ts`
  pins the WRITER's emission of `marketplace`, not `splitConfigByScope`'s spread, so the behaviour
  its filename claims had no guard. CLI-538 then landed the guard one level down —
  `config-generator.test.ts` -> _"carries selectedDomains onto both partitions, because a project
  owns its own domains"_. **Proved non-vacuous before closing:** deleting `...config` from the
  project partition and rebuilding reddens **two** tests in that file; restoring returns 91/91.
  **An E2E would be the worse home and was deliberately not written.** A unit test asks
  `splitConfigByScope` the question directly, where an end-to-end run can only observe the answer
  through a writer that supplies the same field by another route — which is precisely why the
  existing spec's assertions cannot see the spread, and why adding more of them would not have
  helped. The spec's JSDoc, which is where the next author looks, now names the real guard and says
  outright not to add an E2E on the strength of the old note.

- **2026-08-23 — CLI-679** (cli.md) — The gap between the two existing gates is closed, by the
  narrowing the row asked for rather than the naive rule it warned against.
  `scripts/check-symbol-file-pairs.ts` (built for CLI-652 and widened here) judges symbols **in a
  stated position** — a table whose second column claims an address — over
  `factories.md`, `boundary-map.md` and `skill-primitives.md`. `agent-findings/` is excluded by
  construction, since the checker takes a document rather than a tree.
  **Four false-positive classes were found by running it, and each narrowed the rule:**
  a **Consumer** column pairs the same two cells to state which module USES the symbol, true of a
  module that does not declare it — `computeScopeDiff | skill-agent-summary.tsx` is correct under
  that header and a first pass condemned it; a **constants table** pairs a name with a filename it
  HOLDS, often a file in a marketplace rather than this package; a **module-private** helper
  documented at its own module is correct, so the predicate is DECLARES and not exports — an
  exports-only version reported three `exec.ts` validators as stale; and a **bare module name** is
  not an address, `index.ts` answering to nineteen files.
  **The silent zero was real and is now impossible.** Four documents carrying 70 rows read as clean
  because their headings name no directory and every row was being skipped; the checker refuses a
  document stating no pairing it can read, so `wizard-flow.md` and `plugin-system.md` now say so
  loudly instead of passing. **One genuine stale site found and fixed**: `readPluginManifest()`
  filed under `marketplace-generator.ts` in `boundary-map.md` while living in
  `plugins/plugin-finder.ts` — a document that named the right module fifty lines earlier.

- **2026-08-23 — CLI-689** (cli.md) — **The row's remedy was wrong too, and the row had already
  corrected the remedy before it.** It re-measured the population right — 38 `expectFourSurfaces`
  call sites, 23 omitting `globalHome` — and rejected "require the parameter" because that reddens
  all 38. Its own replacement, _take the `ProjectHandle` and derive from it_, does not describe the
  tree either: the call sites pass bare directory strings (`projectDir`, `fakeHome`, `env.fakeHome`,
  `origin`, `rebuilt`), and most have no handle to pass. **The defect it identified is real and
  needed none of that**: `CLI.run` decides the HOME the spawned binary runs under and
  `expectFourSurfaces` decides the HOME it then reads, they must agree or the assertion inspects a
  tree the command never wrote, and they agreed only by both being written as the same fallback —
  agreement by coincidence across 23 sites. Now one definition, `globalHomeFor` in
  `__tests__/helpers/`, called by both, with **zero call-site changes**. Its spec pins the empty
  string as given rather than absent, so `??` cannot be tidied into `||`. **Mutation-proved across
  both callers**: breaking the fallback reddens 2 unit tests and 5 `lifecycle/dual-scope` specs.

- **2026-08-23 — WWW-08** (www.md) — Closed, and **its stated remedy was refused in writing by the
  site it targets.** The row asked for "a component in `packages/ui` shared with the editor";
  `apps/www/astro.config.ts` says _"NO REACT INTEGRATION, DELIBERATELY. Please do not 'fix' this by
  adding `@astrojs/react`"_ and states that the only thing this site takes from the design system is
  its tokens. A shared React component is unreachable here, so a token is what the two halves share.
  **Half the row had also closed itself:** the bordered `a-i` mark in `site-header.astro` and the one
  in the editor's `nav-rail.tsx` are **byte-identical class strings** today — compared
  programmatically, not by eye — so "the site and the editor still ship different logos" no longer
  describes the tree. What remained was real and is fixed: the docs `site-title` was
  `--text-body-sm` (14px) against the landing wordmark's `--text-11` (11px), the same three words in
  two sizes. Every property in that rule is now the wordmark's. Verified in the BUILT artefact
  rather than the source — `a.site-title{...font-size:var(--text-11)...}` in `dist/_astro/`, 19
  pages built — and the comment records why a component is not the fix, so the next reader does not
  re-propose it.

- **2026-08-23 — CLI-650** (cli.md) — Two of three items done; the third stays deferred on the row's
  own reasoning. **(1) A synthesized category's domain is no longer decided silently.** It is still
  taken from whichever skill the glob reached first — picking a winner needs a rule the catalogue
  does not state — but a second skill declaring a DIFFERENT domain for the same undeclared category
  now warns, naming both skills and the domain that won. The gate asserts the WARNING and never the
  resulting domain, because pinning the domain pins glob order. Its control asserts silence when the
  two agree, without which the first test is satisfied by a build that warns on every synthesis.
  **(2) `slugMap.idToSlug` deleted** — zero readers anywhere, every occurrence a write, and its
  removal retires D-214's duplicate-slug asymmetry outright since the field cannot disagree with the
  one that is read. `agentDefinedDomains` kept, as the row insisted.
  **`MergedSkillsMatrix.version` KEPT, against the row.** Its "zero product readers" holds inside
  `packages/cli` and is false across the repo: `matrixSchema` in `packages/matrix` requires
  `version: z.string()`, so every emitted `catalog.json` carries it, and the editor reads it —
  `payload.matrixVersion` comes from it and `catalog-store` carries it. Deleting it would have
  broken the published contract and the editor together.
  **Two mistakes of mine, both caught by the suite and worth recording.** Rewriting the synthesis
  loop I dropped the guard that skips ALREADY-DECLARED categories, so declared ones were overwritten
  by placeholders; 27 specs said so. Worse, I then regenerated while that build was live, which
  flattened every declared category in both generated matrices — `exclusive: true` became `false`
  across the catalogue. Rebuilt from the corrected source and regenerated again; the diff is now
  `idToSlug` and nothing else, and both `generate:*:check` gates agree. **(3) The singleton side
  effect is deferred**, as the row proposes: five callers, no user-visible symptom, and its
  `computeMatrix()` exists only in a changelog.

- **2026-08-23 — CLI-613** (cli.md) — **Already built, and built the way the row asked for.**
  `spec-gates.test.ts` carries `SPECS_BELONGING_TO_NO_JOURNEY`, a declared backlog of 149 entries
  whose own docblock states the row's argument back to it: _"a gate that opens by demanding a
  hundred and fifty rows is deleted the first time it is inconvenient… what it buys immediately is
  the NEXT spec"_, with the rule that a spec gaining a journey row leaves the list in the same
  commit, so the number can only fall. **Proved live and non-vacuous**: adding a spec belonging to
  no row reddens the gate, which names it (`commands/zz-probe-unclaimed`); removing it returns
  13/13. **The row's figure had moved a fourth time** — measured today through
  `readJourneyRows`/`specsNamedBy`, the only honest reader, it is **168 unclaimed of 247 spec
  files**, against the row's 144/235 and its own re-measurement of 175/244. That churn is exactly
  why the remedy was rewritten on 2026-08-23 to derive at gate time rather than freeze a count, and
  why nothing here needed building: the gate already derives.

- **2026-08-23 — CLI-547** (cli.md) — The task-ID backlog closed to its irreducible core, and it was
  **an eighth the size the row claimed**. Re-measured today: 62 source lines and 28 doc lines, not
  252 — CLI-574 and CLI-680 had cleared most of it. **Source: of 62, fifty-five are inside a
  file-level JSDoc, which `packages/cli/CLAUDE.md` permits outright.** Classified with the compiler
  rather than a pattern, and the first classifier was wrong in a way worth recording: it took the
  leading comments of the first NON-import statement, which misses every file whose docblock sits
  above the imports, and reported 60 to sweep instead of 8. Seven of the eight were swept — a
  provenance line in an audit's `sources`, three "the ruled behaviour for X" docblocks, a heading id,
  a dangling `todo/D-221-investigations/` link whose directory is gone, and an inline comment.
  **Docs: `.ai-docs/reference/` is now clear**; fourteen provenance citations went, each replaced by
  the fact rather than reworded, and seven more in `standards/`.
  **Six sites stay, deliberately, and each is a different exemption.** `D-266`, `D-278` and `D-279`
  in `documentation-bible.md` and the two quoted test names in `clean-code-standards.md` are the
  rules DEMONSTRATING themselves — a ban whose example is deleted stops teaching. `spec-filenames.test.ts`
  explains the ban the same way. `user-journeys.md`'s remaining id is a path component in a working
  link to `todo/plans/CLI-444-e2e-strictness-audit.md`, which still exists. The census can therefore
  never reach zero, and rule 3's "neither returns empty" stays true for a reason rather than a
  backlog. 209 files / 7206 tests green; eslint and tsc clean.

- **2026-08-23 — CLI-757** (cli.md) — `requires[].reason` reaches a reader, clipped to fit. The
  field is REQUIRED by `requireRuleSchema` and enforced across the built-ins, so every marketplace
  author writes it; nothing displayed it, and both siblings display theirs. It now reads
  `<what is missing> — <why it is needed>`, the author's half through the existing `truncateText` at
  a 60-character budget: the median shipped reason is 46 characters and untouched, 24 of 110 clip.
  **The budget is not tidiness — it is the whole reason the first attempt was reverted.** The grid
  cell WRAPS rather than elides, so an unbounded reason grows the tag, grows the frame, and pushes
  the top of the wizard off the terminal; `e2e/interactive/edit-wizard-pending-removal-row` failed
  exactly that way against the REAL catalogue, whose React Router reason is 143 characters. **No
  fixture spec could show it** — the E2E source's reasons are one clause long. Owner ruled truncate.
  The 13 assertions pinning the synthesised string stay EXACT via a `missingHalf()` split rather
  than loosening to `toContain`, and three tests cover render, empty-reason and clipping.

- **2026-08-23 — the copier left ejected skills unwritable** (no row; found under CLI-736) —
  `fs.copy` preserves mode and nothing normalised it, so a marketplace on a read-only mount, in a
  Nix store path, or written under a restrictive umask produced skills the user **could not edit
  after ejecting them**. The failure did not surface at the install: it appeared later, at an
  unrelated `edit` or mode switch, as `EACCES` on a file the user never made read-only. **Owner
  ruling: eject means you own it**, so `copy()` now grants the owner's write bit on everything it
  writes — every one of its seven callers is an install or an eject, so every destination is the
  user's. The bit is ADDED rather than the mode replaced, so a skill shipping an executable script
  still runs after ejecting; a test pins that. Found because a frozen test fixture propagated
  `r--r--r--` through the copier into 17 spec files' installed projects — the bug was never about
  the fixture, and only 2 of 312 `EACCES` were writes to the fixture itself.

- **2026-08-23 — CLI-736 (fixture half)** (cli.md) — The plugin-capable E2E source is built once in
  `globalSetup` and **frozen** (`chmod -R a-w`); 44 of 51 call sites share it, 2 opt out with
  `owned: true` and 5 more take options so build their own. The freeze is the point: a shared
  fixture one spec mutates is one every LATER spec sees mutated, and under `pool: "forks"` which
  spec trips over it depends on scheduling, so the failure moves between runs. Frozen, the mutating
  write fails at its own line, in its own file, every time — which is how the copier bug above was
  found. **The speed argument did NOT hold and the row should stop claiming it:** 51 × 1.65s of
  fixture building is real but already overlapped across up to 16 workers, so removing it left the
  suite at 323s against a 310–336s baseline. What the change buys is one fixture definition instead
  of 51 rebuilds, and a guarantee. **The launcher-ergonomics half — the row's actual subject — is
  untouched.**

- **2026-08-23 — CLI-596, CLI-692** (cli.md) — **Closed on the owner's ruling: the restriction is
  intended for now, so there is no work.** A rule may name only a slug the PUBLIC Agents Inc
  catalogue ships — `skillRefInRules` is `z.enum(SKILL_SLUGS)` — and that stays.
  **The boundary is narrower than the rows implied, which is what made the ruling easy:** shipping a
  custom skill already works, through `custom: true` and any slug, so a marketplace can publish
  `acme-widget` and people can install it. What it cannot do is declare a RULE about it —
  `acme-widget conflicts with react` is refused. Custom skills are supported; custom skills in
  relationship rules are not.
  **CLI-692 dissolves with it.** Its premise was that every relationship-rule spec tests "a
  configuration no real marketplace can be in", because the E2E fixture publishes the public
  catalogue's own slugs — verified, all ten of them (`react`, `hono`, `zustand`, `vitest`, `pinia`,
  `vue-composition-api`, `reviewing`, `cli-reviewing` and the rest) are in `SKILL_SLUGS`. Under this
  ruling that is not an unreachable configuration but **the only supported one**, so the fixture is
  representative and the 192 specs built on it are testing the real contract.
  **When it is reopened, the route is already traced and it is one line.** `skillRefInRules` in
  `lib/schemas.ts` is the only gate: a source's `config/skill-rules.ts` reaches it through
  `loadSkillRules` -> `skillRulesFileSchema`, so a custom slug is refused at LOAD. Relaxing it to a
  slug-shaped string costs no safety, because the reporting layer already exists and the code
  already says it should be the one used: `collectUnresolvedSlugs` gathers every rule slug no
  shipped skill carries onto `matrix.unresolvedSlugs`, and `checkUnresolvedRuleSlugs` turns each
  into a `doctor` finding. `narrowToShippedSlugs`'s own docblock states the intent — _"A source's
  OWN rules are never narrowed. A slug its author typed and its skills do not carry is that
  source's defect, and the warning is the only place it is reported"_ — which the closed union
  currently contradicts by refusing the file outright. The built-in rules lose nothing:
  `default-rules.ts` is typed `SkillRulesConfig`, so `tsc` still holds them to `SkillSlug`. The
  cost is `unknownSkillSlugRefusal` becoming dead and whatever asserts it moving from
  refused-at-load to reported-by-doctor. **Deferred 2026-08-23 by the owner as complexity not
  needed yet**, with custom skills in rules wanted eventually.

- **2026-08-23 — CLI-736** (cli.md) — **The launcher half, and the plan's premise turned out to be
  backwards.** The plan described a suite of plugin-mode specs paying fixture plumbing, and asked
  for a decision between option 1 (a shared `globalSetup` fixture) and option 4 (make
  `createE2ESource` build a marketplace by default). **Measured against the tree: of the 76 files
  carrying the dominant `source: { sourceDir, tempDir: sourceTempDir }` shape, 70 build a PLAIN
  `createE2ESource()`** — the marketplace-less tree the launcher already defaulted to. Option 4 is
  therefore ruled out outright: a marketplace makes every skill non-local, and `defaultOriginFor`
  in `stores/wizard-store.ts` would flip 70 files' worth of unstated origins from eject to plugin.
  **And there was no performance win left to find** — `createE2ESource()` measures at ~10ms, where
  the plugin build on top of it costs ~1.65s and was already shared by the fixture half. What
  remained was purely ergonomic, and that is what landed.
  - A second frozen fixture, `E2E_SOURCE`, beside the plugin one under the same root, same freeze,
    same teardown. `InitWizard` defaults to it; `EditWizard` deliberately does NOT, because `edit`
    takes no `--marketplace` and its launcher RECORDS the source into the install's config, where
    `recordInstallSource` refuses an install that has no config yet — a default there would turn
    "nothing to edit" into a throw from a fixture helper.
  - The 13 helpers in `e2e/fixtures/dual-scope-helpers.ts` take one `source: E2ESource` in place of
    a `(sourceDir, sourceTempDir)` pair, which shortens the 19 plugin-source call sites too.
  - **87 files lost the ceremony entirely** — two `let`s, a `beforeAll` that built the tree, and an
    `afterAll` that cleaned it up — and 18 `InitWizard` sites now name no source at all, which is
    the plan's own acceptance criterion. Net **1,608 insertions against 2,047 deletions** across
    191 files.
  - The shared root was renamed `agents-inc-e2e-shared-source` → `agents-inc-e2e-shared-fixtures`.
    A refusal names the path it could not resolve and `edit-plugin-hard-error.e2e.test.ts` asserts
    `/\bsources?\b/i` finds nothing in that whole message; the old name satisfied it, and only
    escaped because no plain-source spec sat on that root yet. It is the same constraint
    `createE2ESource` already documents over its own `fixture/` segment.
  - `config-scope-integrity.e2e.test.ts`'s third describe was moved back onto the plugin fixture
    after the sweep took it: its own docblock says a marketplace-less source makes that install
    refuse outright, which is exactly what `E2E_SOURCE` is.
  - **Gates:** full E2E 247 files / 912 passed, unit 210 files / 7,217 passed, `tsc` clean over all
    three projects, ESLint clean. `check-enumeration-drift` caught the docs debt the fixture half
    left — `shared-source.ts`'s four exports were absent from
    `.ai-docs/reference/testing/factories.md` — and that table now names them.
  - **Corrections to the row:** the plan's "172 call sites in 74 files; ~96% can drop the plumbing"
    was wrong twice over (374 launch sites in 159 files, and most of them are not plugin-mode); its
    "~5s per test file" setup cost is ~10ms for the plain tree; and `InitWizard.launch()` already
    defaulted to a fresh `createE2ESource()`, so what blocked the drop was never the default — it
    was that the source is shared with a setup helper and with a later `EditWizard.launch` that
    must record the same one.

- **2026-08-23 — CLI-730** (cli.md) — **The row named a real harm and prescribed the wrong cure; the
  harm is closed and the cure is documented as not implementable.** Re-derived at **168
  `writeProjectConfig`/`writeConfigTypes` sites across 68 files** (the row's original figure was 222
  in 73; the two local helpers it named, `createDualScopeInstallation` and
  `createLocalSkillWithForkedFrom`, no longer exist).
  - **The harm, in the row's own words, was "setups that break silently when the CLI's internal
    format changes" — and it was real and severe.** `writeProjectConfig` rendered its own
    pretty-printed JSON while the product's `config-writer.ts` emits typed named variables, an
    `import type`, `satisfies ProjectConfig`, canonical field order, space-free entry lines and a
    compacted stack. The two disagreed on all four things an assertion can see, so every assertion
    over a fixture config was pinned to the fixture rather than to the product — and
    `'"scope":"project"'`, which the suite asserts, does not even match the fixture's spacing.
    **Closed at one site for all 150: `writeProjectConfig` now calls `generateConfigSource`**, with
    the writer's own `ConfigSourceOptions` passed through for the project-extends-global shape. No
    `config-types.ts` is needed beside it — `import type` and `satisfies` are erased before the
    loader evaluates the module. Full E2E suite green on the swap, first run, no assertion changed.
  - **The prescribed cure — "E2E tests must only use CLI commands to create state" — cannot be
    applied, and the row's own Process anticipated that.** Classified all 168: **67** declare an
    installation with nothing installed (an agent so the project is DETECTED, `skills: []`, no skill
    on disk — the negation of what a wizard run produces, and the precondition `compile`'s
    no-skills refusals need); **42** populated installs, every sampled one built around something
    the CLI cannot author — a custom agent, a skill the source does not ship so the wizard drops it,
    a marketplace config on a machine with no `claude` binary; **22** stack shapes; **13**
    infrastructure (`e2e/fixtures/`, `e2e/helpers/` — the row's own exception); **13** corrupt
    neighbours (no CLI writes an unreadable config); **6** project-registration lists; **5**
    tombstone orderings. `ProjectBuilder`'s own docblocks already document several of these as
    UNREACHABLE by design and say why writing the files instead does not produce them.
  - **What replaced the cure is a round-trip audit, and it found something.** Rendering through the
    writer proves a fixture's FORM; reading it back and writing it again proves its CONTENT is
    reachable, because the loader normalises. `writeProjectConfig` now carries an env-gated
    diagnostic (`CONFIG_ROUNDTRIP_PROBE`) that reports any config failing that trip. **19 of 150
    fail, all one root cause, all in four files** — thirteen stack literals key `"web-testing"` for
    a skill the catalogue puts in `"web-e2e"`, derived from the id prefix. Three of the nineteen
    make the writer THROW, because `web-e2e` is exclusive and `ProjectBuilder.dualScope()` puts two
    of its skills in one agent's stack — so `dual-scope.e2e.test.ts` asserts a compiled sub-agent
    body no CLI-written configuration can produce.
  - **Filed rather than fixed**, per "the verifier is never the fixer": correcting the keys forces
    one fixture skill to change identity across five specs in two files, which changes what they
    cover. `CLI-819` carries it, with
    [the finding](../packages/cli/.ai-docs/agent-findings/2026-08-23-fixture-stack-categories-derived-from-id.md)
    behind it. The diagnostic stays in the tree as that finding's reproduction and becomes an
    always-on assertion once the four files are clean.
  - **Docs:** `.ai-docs/reference/testing/e2e-infrastructure.md` (three rows that named
    `renderConfigTs` as what writes an install's `config.ts`, plus the source-factory section and
    the lifecycle example) and `.ai-docs/standards/e2e/test-structure.md`'s `beforeAll` pattern.
  - **Gates:** full E2E 247 files / 912 passed, unit 210 files / 7,217 passed, `deps:check`, all
    three `tsc` projects, ESLint and `prettier --check` clean.

- **2026-08-24 — CLI-622, and `share --stdin` beside it** (cli.md) — **The browser is reachable
  from a cold start, and a configuration the caller HOLDS can become an id.** Two halves of one
  idea, designed in conversation and landed together.
  - **`init --ui`** opens the editor on nothing. `edit --ui` mints an id first because it has an
    installation to carry across; there is none here, so this is the bare address and the browser
    starts from the catalogue. It sits **above `ensureConfigReadable`** and reads no installation
    at all — deliberately, so a config too broken to load cannot block the other front door. The
    link is printed BEFORE any browser is opened, which is what keeps it usable over a pipe, in CI
    and where no desktop session exists; a failed launch is a warning beside a link that still
    works, and that warn site is rostered in `failure-reporting-classification.test.ts` with its
    reason.
  - **`init --ui --from` is REFUSED**, and NOT for `edit`'s reason. There the two are opposite ends
    of one round trip; here there is no installation to hand out, so the pair is UNBUILT rather
    than contradictory. `EDITOR_NEEDS_NO_ID` says which, so a silent choice between them is never
    read as the feature. Lifting it is CLI-621, which is now the only row left of the pair.
  - **`share --stdin`** publishes a payload piped in, reading no installation. The producer is not
    this CLI: `meta-config-stack-detect` walks a repository and emits a `SeedPayload` it is
    forbidden to write or apply, and an id is the only door into the editor, which reads `?fromId=`
    and nothing else. **Publishing from the CLI rather than from the skill is the whole design
    argument**, and it is four concrete things: `SEED_VERSION` is a `z.literal`, so a producer that
    hardcodes the wire shape emits refused payloads the day it moves; `AGENTS_INC_API_URL` exists
    so tests never touch the network and a hardcoded URL ignores it; the caller's user-agent is
    what SERVER-03 counts by; and a skill that POSTs has published before the user has confirmed
    anything, which its own top rule forbids. Hand-run proved the user-agent survives — the stub
    logged `ua=agents-inc-cli`.
  - **The flag's subject guard is the empty directory.** A bare `share` resolves an installation
    the way every command does, this project then the global one, so without the branch, sharing a
    piped payload from an empty directory would publish whatever the machine has installed
    globally. That is asserted, not assumed.
  - **Three refusals, pinned by the empty REQUEST LOG rather than by the exit code**, because the
    claim is that nothing was spent: an empty pipe, text that is not JSON, and JSON the contract
    refuses. The store's free tier allows a thousand writes a day against a hundred times that in
    reads, so a write is the scarce half and one spent on an unreadable payload buys a dead link.
  - **Corrections to the plan as discussed:** the first shape considered was `--from` accepting a
    payload PATH, dropped because stdin leaves no file behind — which was the owner's own reason.
    The second was the skill POSTing directly and printing the command, dropped for the four
    reasons above. And `share`'s output needed no change at all: `sharedConfigDestinations(id)`
    already prints both routes, so the piped path cannot describe an id differently from `share`
    or `edit --ui`.
  - **Gates:** E2E 249 files / 921 passed (two new specs, 9 assertions), unit 7,216 of 7,217 —
    the one red is CLI-820's working-tree scan, green on CI. Three gates caught this change's own
    debt and each was paid: the warn-site roster, `check-enumeration-drift` over the messages
    constants, and `spec-gates` demanding a journey per spec (journeys 44 and 45). `apps/www`'s
    `check-cli-claims` caught both undocumented flags; it now reports 13 commands and 18 flags, all
    documented.

- **2026-08-24 — CLI-621** (cli.md) — **A shared id can now be OPENED, not only applied**, and the
  ruling that unblocked it replaced a refusal with a rule. **`--ui` opens whatever `--from` names,
  and the command's own subject when `--from` is absent** (owner, 2026-08-24) — one rule across
  both commands.
  - `init --ui --from <id>` and `edit --ui --from <id>` open that id. `SHARED_CONFIG_ONE_DIRECTION`
    and `EDITOR_NEEDS_NO_ID` are both **deleted**: the first read the pair as opposite ends of one
    round trip, and under the ruling they are not opposite at all.
  - **Nothing is minted and nothing is fetched on that path.** `--ui` alone POSTs an installation
    to mint an id because an installation is not yet a configuration the store holds; an id already
    IS one. `edit-from.e2e.test.ts` pins it the only way a spec can — **the store sees no request
    at all** — which no unit test could observe.
  - **`edit --ui --from` needs no installation**, which is the owner's ruling rather than an
    oversight: opening an id in a browser reads no local state, so a directory's condition cannot
    decide whether you may look at somebody else's configuration. It sits above
    `ensureConfigReadable` AND above `edit`'s own installed-here requirement, and
    `commands/edit-ui-from.e2e.test.ts` says the exemption is deliberate, since `edit` refuses an
    empty directory on every other path.
  - **`share --stdin --ui` was considered and declined** (owner, 2026-08-24): publishing stays a
    visibly separate step from opening.
  - **The producer was updated, and it was already broken.** `meta-config-stack-detect` in
    `agents-inc/skills` snapshotted the wire contract at `SEED_VERSION = 3` while the live literal
    is **5** — `v: z.literal(SEED_VERSION)` — so **every payload it emitted was already being
    refused** by the editor's import path and by `init --from`, silently, for as long as the wire
    has been at 5. Snapshot corrected to v5 with `description`, `marketplace` and `external`; both
    worked examples and the counter-example moved with it; and its two CRITICAL requirements and
    its "Where it goes" section now name `agents-inc share --stdin` instead of "a surface the user
    confirms", with the four reasons it must not POST for itself. **This is the drift the design
    argument predicted, found already realised** — which is the strongest evidence for publishing
    from the CLI that could exist. Skills-repo gates pass: `format:check` clean, 238 skills
    validate.
  - **Gates:** unit 7,227 of 7,228 (the one red is CLI-820's working-tree scan, green on CI); the
    four affected e2e specs 17/17; `check-enumeration-drift` needed a re-anchor, because a registry
    boundary was anchored on a NEIGHBOURING row that this change deleted — a second row reddening
    for a reason unrelated to its own subject, now anchored on a stable neighbour and the reason
    recorded. Journeys 44 corrected and 46 added; the warn roster gained `edit`'s second `--ui`
    site, placed in source order beside its twin.

- **2026-08-24 — CLI-772** (cli.md) — **A docblock described a fallback the function did not
  perform, and the gap was a live user-visible defect.** `resolveBranding` read
  `loadEffectiveSourceConfig`, which answers with the project's config if that FILE exists and the
  global one otherwise — so a project config with no `branding` key resolved to the SHIPPED default
  and never consulted the global one. **Brand globally, then have any project config at all, and
  your name silently reverted**, which is every installed project. The docblock one line above had
  said "falling back to global then DEFAULT_BRANDING" throughout. Now per FIELD, which is what
  makes branding different from `marketplace`: a project's marketplace is its own and inheriting
  one would install from somewhere nobody named, while branding is presentation a user sets once.
  **The existing spec had pinned the defect as correct** — _"should return default branding when
  config has no branding section"_ — which is `CLAUDE.md`'s own prohibition on encoding a known gap
  in an assertion. Four tests replace it, two of them controls. Hand-run: `ACME Tools Doctor` where
  the shipped name used to come back, and `Project Brand Doctor` when the project overrides it.

- **2026-08-24 — CLI-597** (cli.md) — **Half of it had already landed, and the live half was the
  one that reaches a user.** The row said stack skill ids pass through unvalidated;
  `resolveStackAgentSkills` has filtered the per-category map against the matrix for some time, and
  its docblock says so. What was NOT filtered is `allSkillIds` — and that is the list that matters:
  `wizard.tsx:107` returns it verbatim as the selection when a stack is picked, and
  `packages/matrix/src/read-model/stacks.ts` counts and lists it for the editor. So the two
  disagreed, and a marketplace whose `stacks.ts` outlived one of its own skills selected an id
  nothing could resolve — exactly the symptom the row reported, reached by a mechanism it
  misdiagnosed. Now filtered at the same gate, with `withdrawnSkillsWarning` naming what it drops,
  as the sub-agent half already did. Mutation-proved: removing the filter reddens the spec.
  The test uses a REAL `SkillId` absent from the seeded matrix rather than a fabricated one, per
  `CLAUDE.md` — `tsc` refused the invented id, which is the rule enforcing itself.

- **2026-08-24 — CLI-820** (cli.md) — **The gate now answers about the repository rather than about
  the machine.** `declaredNamesUnder` walked the filesystem and skipped a hardcoded denylist that
  cannot track `.gitignore`, so three ignored locations still declaring two constants deleted on
  2026-08-22 made it answer 10 locally and 12 on a clean checkout — **CI was red on that assertion
  from the 0.157.0 push through 0.158.0 while every local run passed.** It asks git now. The
  obvious form, `check-ignore` per file, was correct and cost 5 seconds on this repository; one
  `ls-files --others --ignored --exclude-standard --directory` per root collapses whole ignored
  directories to one entry, so a prefix test answers everything beneath them — **2.1s against the
  6.4s that form cost**. Outside a working tree the command fails and nothing is ignored, which is
  exactly right for the temp trees this scan is unit-tested against and is why no test needs a
  repository of its own. Mutation-proved both ways. **The unit suite is now green locally for the
  first time in this cluster** — 7,238 of 7,238.

- **2026-08-24 — CLI-798** (cli.md) — **The dist door costs zero call sites.** It was
  `ensureBinaryExists` called from a `beforeAll` in **248 spec files**, per-file discipline with
  nothing gating it: forget the call and the reward is a 45-second timeout naming nothing, and no
  reader could tell a spec that omitted it correctly from one that forgot. `e2e/setup.ts` is a
  `setupFiles` entry, so a `beforeAll` there runs once before every spec file — the same door,
  unforgettable. **271 call lines and 250 imports removed**, and the helper deleted.
  `spec-gates.test.ts` now asserts the ABSENCE of the call, so the discipline cannot grow back, and
  `runners-refuse-a-mismatched-build.test.ts` was repointed at the harness, its scope claim intact.
  **Proved by mutation rather than by reasoning**: with `assertDistIsPresent` made to throw, a spec
  that never called it skips all five of its tests at `beforeAll`; restored, all five pass.

- **2026-08-24 — CLI-819** (cli.md) — **Fixed, and the fixture-identity question was answered by
  the fixture's own text.** Thirteen stack literals filed a skill under a category the catalogue
  contradicts — `"web-testing"` for ids the catalogue puts in `"web-e2e"` — derived from the id's
  prefix, which `CLAUDE.md` forbids in fixtures as much as in product code. Invisible because
  `normalizeStackRecord` relocates the assignment on LOAD, so nothing read the written key. Two
  relocations collided in an EXCLUSIVE category, which is why one spec asserted a compiled
  sub-agent body no CLI-written configuration can produce. **The fixture had written two DIFFERENT
  keys** — `web-testing` and `web-mocking` — for two ids the catalogue both puts in `web-e2e`, so
  its intent was never two e2e skills; the second slot took `web-mocks-msw`, which genuinely is
  `web-mocking`. Both skills, both categories, one agent, no spec lost its subject.
  **The diagnostic became a refusal the same day**: the whole suite reports zero round-trip
  failures, so `writeProjectConfig` now throws on any config the product would not have written.
  Measured at no cost — 318s either way — and stated as journey 47.

- **2026-08-24 — CLI-782** (cli.md) — **The row's alarm was false and its observation was true.**
  It read `spec-filenames.test.ts` at "8083 ms against a 10-second per-test budget — 81% of it".
  That test passes its OWN `TITLE_GATE_TIMEOUT_MS` of **60 seconds** as its third argument, so it
  was at 16% rather than 81%, and the constant's docblock had already provisioned that headroom in
  as many words: _"six agents working at once is exactly when a 4s gate becomes a 9s one, and a
  timeout there reads to whoever meets it as a regression the change caused rather than as a busy
  machine."_ **I repeated the row's error and escalated it**, reporting ~520ms of headroom from two
  measurements of 9,424ms and 9,478ms against the global 10s. Both were against the wrong budget.
  - **What was true is that the scan did four times the work it reads.** The gate took the shared
    base WHOLE — `js.configs.recommended`, `tseslint.configs.recommended` and this repository's own
    additions — and `reportsFor` then discarded everything that was not `no-restricted-syntax`.
    Every other rule ran over 466 spec files and was thrown away.
  - It takes the base's `languageOptions` and nothing else now, which is what its own docblock
    always said it wanted: _"the PARSER alone"_. **9,424ms → 5,786ms under full-suite contention,
    and 2,294ms solo**; measured in isolation the lint itself is 3,351ms → 1,996ms over the same
    466 files for the same verdict. A structural test pins it — the gate's config must declare
    exactly `["no-restricted-syntax"]` — and is mutation-proved: restoring the whole base reddens
    it.
  - `NonNullable<Linter.Config["languageOptions"]>` rather than a cast, and the whole block rather
    than the parser alone, so whatever the parser needs beside itself travels with it.

- **2026-08-24 — CLI-769** (cli.md) — **Ruled INTENDED by the owner: the ASCII mark is not
  brandable and is not meant to be.** The row read a white-labelled installation still drawing
  `AGENTS INC` in ASCII as unfinished branding, on the reasoning that `branding.name` had just
  reached six surfaces. It is the opposite — the mark is the PRODUCT's, not the installation's, and
  `branding.name` following the name everywhere while the logo does not is the distinction rather
  than a gap. `package.json`'s `description`, the first line of `--help` that oclif reads from
  package metadata, is the same class and the same answer. **Recorded at `ASCII_LOGO` in
  `consts.ts` rather than only here**, because a ruling that lives only in `archive.md` is one the
  next reader refiles: the constant now carries the decision beside the value it governs.

- **2026-08-24 — REPO-07** (repo.md) — The old web monorepo deleted from disk, 1.1G freed. The safety net had done its job: `origin/main` held every commit (nothing unpushed), and the only uncommitted work was a staged rewrite of `docs/configurator-todo.md` that is the direct ANCESTOR of this folder — its items 8, 9 and 10 are WWW-01, WWW-02 and WWW-03, and its item 7 is CLI-740's coverage bullet. The untracked `.claude-src/` was a CLI test install, regenerable in seconds. Both preserved anyway, outside either repository, at `~/dev/agents-inc-web-monorepo-uncommitted-2026-08-24.patch` with the HEAD sha beside it — the remote at `agents-inc/web` is untouched and re-clonable.

- **2026-08-24 — CLI-768** (cli.md) — `branding.tagline` deleted on the owner's ruling, at all five sites: the `BrandingConfig` type, the zod schema, `ResolvedBranding`, `DEFAULT_BRANDING.TAGLINE` and the hand-maintained `project-source-config.schema.json` — which `generate:schemas` does NOT own, a correction to my own first assumption that cost one regenerate to find. The field promised _"Custom tagline shown in wizard header"_ and no wizard header ever rendered it. **The test that carries the red is the drop, not the absence**: `brandingConfigSchema` is a bare `z.object`, so an unpublished key is stripped silently rather than refused, and a `name`-only assertion would pass either way — the pin is `toStrictEqual({ name })` over a config that also names a tagline. The published JSON schema is checked separately, because `additionalProperties: false` makes a leftover tagline an ERROR for an editor validating a user's config while the parser merely drops it. **The per-field branding block survived on one field**: its discriminator was never two fields but a project config that EXISTS and is silent about branding, which is exactly the per-file regression it was written for.

- **2026-08-24 — CLI-816** (cli.md) — The interactive dashboard carries the counts, on the owner's ruling. `formatDashboardText` printed skill count, agent count, install mode and marketplace; the `Dashboard` component printed a title and four menu rows — so the screen a person sat in front of was **less informative than the output they got by piping it**, with every assertion green throughout because each path was only ever compared against itself. One producer now, `dashboardCountLines`, rendered by both. **The parity test reads its expected lines out of that function rather than restating them**, so the two cannot drift again — and it ships with a control, because a `dashboardCountLines` returning `[]` satisfies a containment check for free. Mutation-proved in both directions: emptied, the control reddens alone and the parity pair stays green, which is the whole reason it is there.

- **2026-08-24 — CLI-328** (cli.md) — The `e2e/pages/constants.ts` duplication ruled ON rather than reversed, and the half that was missing built. Its "NO imports from src/cli" header read as a rule nobody applied — **233 imports from `src/` live across every other directory of the E2E tree**, spec directories included — but the duplication is right for the reason `check-screen-sentinels.ts` already argues: a spec that imported the constant it asserts on would move both sides at once and assert nothing. What was missing is a third party comparing the mirrors, and only the wizard's screen subtitles had one. `scripts/check-mirrored-constants.ts` is the other half — `EXIT_CODES`, `TERMINAL_SIZE.SHORT.rows` against `MIN_TERMINAL_SIZE.ROWS`, and `SOURCE_PATHS.PLUGINS_DIST` — and the record comparison runs **one-directionally on purpose**: `UNKNOWN_COMMAND: 127` is the shell's status, not the CLI's, so a mirror may hold codes the product never emits. `SHORT.cols` is deliberately NOT registered: 100 sits above the gate's 80 by design, and mirroring it would assert an equality nobody wants. Mutation-proved by moving `MIN_TERMINAL_SIZE.ROWS` to 22 — "mirror holds 20, product holds 22".

- **2026-08-24 — CLI-329** (cli.md) — One of its four items had a subject. **`step-settings` does not exist** and **`SOURCE_HEADER_NAMES` does not exist** — both were measured against a tree that has since moved, and neither is a gap to fill. `UI_SYMBOLS.CHECKBOX_CHECKED` was filed as a stale `[x]` the UI contradicts; it has **zero readers anywhere in `src` or `e2e`**, as does `CHECKBOX_UNCHECKED`, so the answer was deletion rather than correction. The live one was `doctor`: `formatStatus` returned the literals `"!"` and `"-"` while `UI_SYMBOLS.DISCOURAGED` and `UI_SYMBOLS.SKIPPED` existed for exactly those states — and `SKIPPED` is an EN-DASH, so a stood-down row printed a different character from the one declared for it, indistinguishable from `UI_SYMBOLS.REMOVED`, which is deliberately an ASCII hyphen and means the opposite. **Both e2e assertions moved together and one of them is a NEGATIVE** — a glyph change that updated only the positive would have left `not.toMatch` matching nothing and passing for a reason it does not state. The exhaustive `STEP_TEXT` list in two documents was already one short before this touched it: 185 claimed, 187 actual.

- **2026-08-24 — CLI-799** (cli.md) — The window closed, and the row's own premise refuted by measurement. It was filed as unclosable — "both mechanisms are blind ... **Moving the door earlier does not fix this**; it is inherent to a `beforeAll` that spans the window" — and marked worth work only if the race were observed. The first half is true and was re-measured: a throwing `beforeAll` really does skip every `beforeEach` and `afterEach` under it, and it is the SPEC's `beforeAll` that spawns, installs and waits, so this is most of what a lifecycle spec does rather than a narrow window. The second half is false. **Measured on vitest 4.1.10 against a standalone probe**: a setup file's `afterAll` runs even when the spec's `beforeAll` threw, and its throw is reported ALONGSIDE that error rather than in place of it. One line in `e2e/setup.ts`. The misleading failure still stands — nothing can undo it, the spec really did fail there — and the real cause is now printed beside it, which is all the reader was missing.

- **2026-08-25 — CLI-822** (cli.md) — **The required-category concept is gone from the product**, on the owner's ruling of 2026-08-24: _"it's very strange to force someone to add certain skills."_ This **reverses** the deliberate "warn and allow" decision archived under `2026-08-21 — CLI-367`, and goes further than that decision's own framing — the objection was to the concept, not to its severity. Deleted outright: `validateBuildStep`, `BuildStepValidation`, `TOAST_MESSAGES.ONLY_SKILL_IN_CATEGORY`, `STEP_TEXT.ONLY_SKILL_IN_CATEGORY`, `SYMBOL_REQUIRED`, the `exclusive && required` deselect guard in `toggleTechnology`, and the `required` field on `CategoryDefinition`, `CategoryRow`, `CatalogCategory` and three Zod schemas. **The reported symptom was never a block** — `handleContinue` called `onContinue()` unconditionally and a test pinned "continues anyway"; the toast merely read as a refusal, which is why the row's fix is a deletion rather than a guard change. Scope was wider than CLI-only: `required` was GENERATED data, so `bun run generate` rewrote `types/generated/matrix.ts` and both vendored copies in `packages/matrix`, behind the `generate:matrix:check` CI gate. **The editor reads none of it** (`grep -rn '\.required\b' apps/editor/src` → nothing), so no editor behaviour moved. Two defects outlived the "landed" report and were found by agents re-deriving their own briefs, not by review: `skillCategoriesModule()` in `lib/marketplace-scaffold.ts` was still teaching **new marketplace authors** to declare the dead field, found by a docs agent checking a count; and `getExclusiveCategorySelectedCount` in `e2e/pages/steps/build-step.ts` carried `\s*\*?\s*` — **an optional match for the deleted marker, green forever**, invisible to `tsc` and every test run. Both filed as findings. Programme record, including the per-dispatch correction log: [plans/CLI-822-823-required-and-skillcount-2026-08-24.md](./plans/CLI-822-823-required-and-skillcount-2026-08-24.md).

- **2026-08-25 — CLI-823** (cli.md) — **`Skills: N` counts what the configuration declares, on every install mode.** `countInstalledSkills` branched `if (installation.mode === "plugin")` and otherwise counted skill DIRECTORIES, so `"mixed"` fell to the eject-only arm and plugin skills were never counted: the published 0.159.0 binary printed `Mode: Mixed` above `Skills: 2` on an installation whose config declared 11. `countInstalledSkills`, `countPluginSkills`, `countDistinctSkillIds` and `sumOverScopes` collapse into one private `countManagedSkills` — non-excluded `config.skills` deduplicated by id — and **install mode is no longer consulted**. Owner ruling: the number counts only what the CLI manages, so a skill on disk but absent from the config (`context7-mcp`) is not counted; a second ruling settled that one skill at two scopes is one skill, preserving the `countDistinctSkillIds` docblock. **`commands/init.tsx` and `commands/list.tsx` needed no change** — and `list.tsx`'s interactive branch had **always** implemented the ruled behaviour, eleven lines above the piped branch that contradicted it, so the command shipped the rule and its negation with nothing comparing them (filed as a finding; the same class as `2026-08-24 — CLI-816`). What now prevents recurrence is the test shape rather than the fix: `init.test.ts` and `list.e2e.test.ts` each drive the dashboard **and** `list` over one fixture against one named constant.

- **2026-08-25 — the CLI-822 aftermath rename** (cli.md, filed as CLI-824 and half-landed the same day) — `e2e/interactive/edit-wizard-unique-skill-guard.e2e.test.ts` → `edit-wizard-skill-deselection.e2e.test.ts`, on the owner's ruling. **Triage reversed the obvious call**: the file is named for a guard CLI-822 deleted, but its two tests are the only PROJECT-scope coverage of "one of two selected skills removed, the other survives" and "an exclusive category emptied to zero" — `edit-remove-one-of-many-skills-stack-cleanup` and `edit-remove-last-skill-stack-cleanup` cover both at GLOBAL scope, and `edit-project-scope-last-skill-stack-cleanup` seeds one skill so covers neither. So it was renamed, not deleted, and **no assertion was touched**. The brief was wrong about the mechanism in a way worth recording: it said the spec had a row on `standards/e2e/user-journeys.md` to move, and it did not — it sat in `SPECS_BELONGING_TO_NO_JOURNEY` in `spec-gates.test.ts`. Since that list may only shrink, the only green path was to give the spec a real row, so it joined **journey 9** beside its two global-scope siblings and the backlog shrank by one. Unit held at 214/7248 and E2E at 255 files — the file count being the only place a rename that drops a file would show.

- **2026-08-25 — the scaffold shape is pinned as EMITTED, not as parsed** (owner ruling, answering "how do we prevent this in future" after the CLI-822 programme) — one test in `lib/marketplace-scaffold.test.ts`, `emits a category as exactly the fields it declares`, snapshotting the scaffolded `skill-categories.ts` whole. **The ruling was deliberately narrow: a pin, not a rule.** `packages/cli/CLAUDE.md` already carries 82 NEVER/ALWAYS rules across 5,954 words with individual rules running to ~250, so rule 83 was judged the weakest available instrument; the pattern copied instead is `built-in-matrix.test.ts`'s `ships a category as exactly the fields a read model indexes by`, whose comment already states the hazard — _"`z.object` strips what it does not name and says nothing about having stripped it"_. **The design constraint is the whole point:** the pre-existing sibling `writes categories the loader accepts` goes through `loadSkillCategories`, and that path PARSES, so it was structurally incapable of catching this class and always was — measured, not assumed, with a probe showing `loadSkillCategories` returns the category with the stray key simply gone. **Mutation-proved in both directions**: with `required: false` restored to the emitter the new test reddens naming the stray key on its own line, the loader-based sibling stays green, and the emitter is proven reverted by an md5 captured before the mutation and re-measured after. Three wider options were considered and NOT taken, each independent and still open: a removal standard under `.ai-docs/standards/` generalising to the three other classes `tsc` cannot see (untyped writers, optional matchers, prose); `.strict()` on `categoryDefinitionSchema`, which is a genuine product trade because `schemas.test.ts` deliberately asserts the retired flag is STRIPPED for marketplaces in the wild; and a CLAUDE.md rule.

- **2026-08-25 — the fixture writers are typed, so a removed field stops compiling** (owner ruling, class 1 of the three blind spots measured after CLI-822) — `generateMatrix` in `__tests__/fixtures/create-test-source.ts` emitted category and rules shapes through `Record<string, unknown>`, which is why a fixture kept declaring `required` after the type dropped it with every gate green. Now typed, and **mutation-proved**: re-adding `required: false` produces `TS2353 … 'required' does not exist in type 'TestCategoryDefinition'`, and the same holds for the rules half at its real caller in `e2e/helpers/create-e2e-source.ts`. **The load-bearing detail is not the variable's type**: `Object.fromEntries` launders literal freshness, and with `Record<string, TestCategoryDefinition>` alone plus a stale field `tsc` exits 0 — measured. What makes the entry a checked literal is the `: [string, TestCategoryDefinition]` return annotation on the `.map` callback, and a comment now says so. Two casts were refused rather than taken: fixtures deliberately name fictional categories, so instead of `as Category` / `as Domain` the type is `Omit<CategoryDefinition, "id" | "domain"> & { id: string; domain: string }`, widening exactly two fields with a reason and holding every other to the product type. Also deleted `renderCategoriesTs` (zero callers, already listed dead in `plans/CLI-464-dead-code-baseline-2026-08-09.md`) and typed `renderRulesTs`; `renderConfigTs` was deliberately LEFT `Record<string, unknown>` — it is a genuine generic serializer across 46 invocation sites including error-path fixtures, and narrowing it would break the fixtures that prove the product refuses bad input. **Three claims in the dispatching brief were wrong and were caught by re-derivation**: the `name` vs `displayName` "bug" is a correct field rename across an intermediate (`TestMatrix.categories` → `diskCategoriesMap`), the docblock said to be above `generateMatrix` was two declarations away and attributed to the wrong function, and the call-site count was 46 rather than ~47. Deleting `renderCategoriesTs` reddened `check-enumeration-drift` against `reference/testing/factories.md`, which was cleared in the same round.

- **2026-08-25 — 21 negative assertions bound to constants, so a retirement stops compiling** (owner ruling, class 2 of the three blind spots measured after CLI-822) — the failure this addresses: `expect(output).not.toContain("Cannot deselect the only skill in this category")` stayed green after both constants behind that string were deleted, because a negative assertion on a bare literal cannot fail once the product stops producing it. **The scope was cut from 242 sites to 37 on measurement, and that cut is the substance of the work.** Only 16 bare literals equalled a constant the codebase already defines; converting the remaining ~205 would have meant inventing single-use constants, which CLAUDE.md forbids outright. 21 landed: 3 in `e2e/` bound to `DIRS`/`STEP_TEXT`, and 18 naming skill ids or agent names bound to `SKILLS.*`, `AGENT_DEFS.*`, `E2E_SKILL` and `E2E_AGENT` — surfaces CLAUDE.md already mandates, so those sites were standing rule breaches rather than new work. **Mutation-proved once per group** and both reverted under hash check: renaming `STEP_TEXT.DOCTOR_NO_SKILLS_CONFIGURED` errors at the converted line, and deleting `SKILLS.vitest` errors at both of its converted lines. **The dispatching brief was wrong about eight sites in a way that would have introduced the defect it was removing** — `RESIZE_PROMPT`, `SCROLL_MORE_ABOVE`/`_BELOW`, `DOCTOR_UNOWNED_INSTALL`, `SCOPE`, `SCOPE_PROJECT`/`SCOPE_GLOBAL` exist ONLY in `e2e/pages/constants.ts`, the deliberate mirror; the product holds those strings inline, and `wizard-layout.test.tsx` says at the top of the file that an assertion importing the constant a component renders cannot fail when that constant changes. Two rules where the brief had one, now filed as CLI-829. **Also corrected: "nothing detects it" was too strong.** Under a simulated retirement those files are loud — `wizard-store.test.ts` 364 errors, `local-installer.test.ts` 213 — because neighbouring typed APIs bind the surrounding literals; what is never caught is the assertion LINE, so the real failure is a fixer clearing the errors, repointing the fixture, and leaving a `not.toContain` that now asserts about something out of play. Three files were wholly silent (`matrix-health-check.test.ts`, `config-source-sections.test.ts`, `generated-types.test.ts`), which made `matrix-health-check.test.ts` the highest-value single conversion. Suites held exactly: unit 214/7249, E2E 255 files / 953 passed.

- **2026-08-25 — CLI-827** (cli.md, verdict **REFUTED — the factory was already correct**) — the row said `buildSkillConfigs<Id extends string>` in `__tests__/helpers/wizard-simulation.ts` was an unconstrained generic breaching _"ALWAYS type factory function parameters with the narrowest union type"_. It is the rule's **exception**, and the rule's silence about that is what produced the row. Two documented design decisions forbid the narrowing: the factory's own docblock says the genericity exists BECAUSE fixture marketplaces record namespaced ids, and `e2eSkillId` in `e2e/pages/constants.ts` is deliberately typed `string` because "casting it into one would be a lie about the catalogue". The two escapes the brief offered are both closed — casting namespaced ids into `SkillId` is the forbidden act, and substituting catalogue ids makes `refuseCatalogueCollisions` in `lib/loading/source-loader.ts` refuse the fixture marketplace whole, killing the specs that assert `1/1 skills found`. **The row's own evidence was measured against one project only**: `npx tsc --noEmit` gives 6 errors in 1 file, `npx tsc -p e2e/tsconfig.json --noEmit` gives 83 across 31 — a figure the orchestrator propagated without re-measuring, and the reason the lane split could not have contained the change either (30 e2e files affected, 5 of them assigned). Also false in the row: the 6 src sites are **not** error-path tests — all six pass `testMarketplaceSkillId("web-framework-react")`, a valid namespaced id, and three assert successful resolution. **Counter-proved in both directions and reverted under hash check**: narrowed, a fabricated id errors; reverted to `string`, the same fabricated id produces zero errors — so the underlying gap (a literal typo at a catalogue call site is uncaught) is real and remains open, while this remedy is unavailable. The rule in `packages/cli/CLAUDE.md` now carries the exception, the docblock test for identifying one, and the instruction to measure against BOTH projects before filing.

- **2026-08-25 — CLI-829** (cli.md) — **The binding rule is in `packages/cli/CLAUDE.md`**, two halves and the separator between them. _Same value is not the same concept_: bind only to the constant that governs THIS test's data, because binding one that merely matches trades a stale-literal vacuum for a **diverged-constant** one and is strictly worse — it reads as rigorous while passing for free. _A rendering assertion keeps its literal_: importing the constant the product renders makes both sides move together, so the test can never fail — which is why `e2e/pages/constants.ts` MIRRORS rather than imports, and `wizard-layout.test.tsx` says so at the top of its own file. The separator: bind when the literal names a SYMBOL whose deletion should break the test; keep the literal when it is TEXT the product renders. **Written because it was learned by getting it wrong** — eight proposed conversions would have introduced the defect the pass was removing.

- **2026-08-25 — CLI-828** (cli.md) — **8 positives converted, 238 left, from a census of 246** — and the left-behind reasoning is the deliverable, not the conversions. 149 are text the product renders (rule 2), 35 are generated-source fragments, 30 have no constant to bind, and **20 were left under rule 1: the only same-valued constant does not govern that test's data**. The row was filed as explicitly cosmetic and stayed that way: a POSITIVE assertion on a stale literal fails loudly, so it cannot rot the way a negative one does, which is why the bar for converting was set higher rather than lower. **Its real value was catching that the earlier negative-binding pass had itself broken the rule** at nine sites across seven files — the assertion bound while the fixture kept a hardcoded literal. All nine resolved in two follow-ups, and the split is the lesson: `local-installer.test.ts` and `agent-recompiler.test.ts` took the **bind-the-data-too** outcome (one constant now drives mock, config, stack and assertion — the mutation proof errors at three lines per site), while `step-agents.test.tsx`, `wizard-store.test.ts`, `step-confirm.test.tsx`, `edit.test.ts` and `doctor.test.ts` took the **revert** outcome, because `buildSkillConfigs<Id extends string>` is generic over `string` so binding their data buys no compile error, and retirement already reddens at `createMockSkill(id: SkillId)`. **That is the same root cause CLI-827 was refuted on**, reached from the opposite direction. One genuinely vacuous assertion was fixed with proof rather than assertion: `toContain("web-styling")` sat beneath `toContain(SKILLS.tailwind.id)` and passed on the skill id alone — measured against a degraded message (old: true, new: false) and now reads `toContain("its category 'web-styling' is exclusive")`. Full suite re-run by the orchestrator across every project separately: unit 6596, integration 190, commands 463, **user-journeys 44**, e2e 933 + 9 xfail + 3 todo, smoke 20, matrix 330; typecheck across all three tsconfigs clean.

- **2026-08-25 — CLI-824** (cli.md) — the comment in `e2e/interactive/init-wizard-scratch.e2e.test.ts` claiming a Framework skill must be selected before advancing now says what the step does instead. **Verified false at source rather than taken on trust**: `StepBuild` handles Enter as `if (key.return) { onContinue(); }` — unconditional, with no selection count in scope — and `BuildStep.goBack` is a bare `pressEscape`, so neither direction depends on the selection. The census run while fixing it found the same false claim in three sites the row did not name, now **CLI-833**, and — the reason a mechanical sweep would have been wrong — a TRUE sibling in the very same file at line 79, describing what `passThroughScratchDomains()` does rather than asserting a constraint. It was judged and left.

- **2026-08-25 — CLI-826** (cli.md) — `TestMatrix`, `TestSourceOptions.matrix` and the `testMatrix` return member are gone from `__tests__/fixtures/create-test-source.ts`, along with what fell unreachable with them: `generateMatrix`'s `overrides?: Partial<TestMatrix>` parameter, the `testMatrix` local, and `skillsMap`, whose only reader was `testMatrix.skills`. `TestMatrix` was also `export`ed with no out-of-file consumer, so this cleared a "NEVER export constants only used within the same file" breach as a side effect. **All three claims re-derived, and the row's own greps were unsound in both directions** — a plain `TestMatrix` substring returns 20 lines of which 14 are unrelated identifiers (`writeTestMatrix`, `buildTestMatrix`, `stacksTestMatrix`), and `grep -A6` cannot see an options object longer than six lines. The claims held under a word-boundary grep and a paren-matched scan of all **46** `createTestSource(` call sites, **zero** of which pass `matrix:`. The rename the deletion now invites is **CLI-834**.

- **2026-08-25 — CLI-830** (cli.md, verdict **DOCUMENTED REFUSAL — no signature moved**) — the custom matchers keep `string`, and the reason is now written above `declare module "vitest"` in `e2e/matchers/setup.ts` so the row cannot be re-filed on a partial measurement. All five narrowings were measured against **both** TypeScript projects, which is the discipline CLI-827 was refuted for lacking: the skill matchers reproduce CLI-827 exactly — **0 errors in `src`, 83 across 33 files in `e2e`**, every one a fixture-marketplace id from `e2eSkillId`, typed `string` because "casting it into one would be a lie about the catalogue". **The agent matchers fail for a different reason and that asymmetry is the find**: agents genuinely are not namespaced, and narrowing leaves only **6 sites in one file**, all `"my-custom-agent"` — a USER-AUTHORED agent that `loadAgentsFromDir` accepts through the schema's `z.string()` base, in a spec asserting it compiles **successfully**. So it is neither a parse boundary nor error-path data, the cast is unlicensed, and `AgentName | string` collapses to `string`. **Mutation-proved in both directions and reverted under hash check**: four plausible-but-wrong values at live call sites — a slug, two display names, a one-letter typo — are met with complete `tsc` silence under `string` and all four error under the narrowing, so both the hole and the unavailability of the remedy rest on measurement. The row's call-site figure was low: **373**, not ~311. The one recorded instance of the hole biting is a JSDoc in `e2e/lifecycle/scope-aware-local-copy.e2e.test.ts` remembering a `not.toHaveSkillCopied(projectDir)` — a directory path where a skill id belongs, accepted silently. The agent-field half that CAN narrow became **CLI-835**.

- **2026-08-25 — three rules from a 167-finding census reach every compiled agent** (owner ruling, answering "what recurring failures could prompts have prevented") — the corpus carries a structured `root_cause` field, so the answer is countable rather than impressionistic: **enforcement-gap 65 (39%)**, rule-not-specific-enough 38, convention-undocumented 25, missing-rule 20, rule-not-visible 7, scope-discipline-deferred 6, premise-expired 6. **The largest cluster is the one prompts cannot touch** — a correct, specific, written rule that nothing mechanically checked — so only about a third of recorded failures are reachable by wording at all. Three rules were added on that basis, and a fourth partial was cut back. **`anti-over-engineering.liquid` gained "The Class Is the Unit of Repair"**, because a fix scoped to the file it was found in is the single most repeated failure in the corpus: `2026-08-19-five-class-fixes-were-scoped-to-the-file-the-defect-was-found-in` records five standing findings whose greps were run for the first time and **all five returned live hits**, and `2026-08-17-the-namespace-audit-scoped-e2e-and-left-the-unit-fixtures` cost 52 failing tests across 3 files. **It was the prompt's fault**: the only scope guidance an agent received said stay narrow, with no counterweight, so the new text qualifies rather than contradicts it — the class is what is broken and the instance is only where it was found, while an unrequested abstraction or capability is still out of scope. **`success-criteria.liquid`'s `<verification_process>` gained "Name What Would Catch It"** — state the test, type or check that would catch a violation of a rule you land, and say so in as many words when nothing would. Placed there rather than in `write-verification.liquid` on a distinction worth keeping: that partial is about whether an edit LANDED, a question closed once the bytes are on disk, whereas verification-process is about claim and evidence, and the new rule extends it along its own axis — verification proves a criterion holds NOW, enforcement is what keeps it holding LATER. **`investigation-requirements.liquid` gained "The Specification Is a Claim, Not a Fact"** — every path, symbol, signature and count in a specification was measured against a codebase that has since moved, so each is re-derived against the code in front of the reader; and **corrections are a required report field**, with "Corrections: nothing" written out explicitly, because a report that stays silent is indistinguishable from a specification that held. That is the rule which makes the briefing contract in the root `CLAUDE.md` binding on every agent this CLI compiles rather than only on the ones a human briefs. **And `context-management.liquid` was cut from 161 lines to 7** — "What Survives the Session" carries three things out of every task (decisions with their reason, gotchas, and work deliberately left) in the report rather than in files nobody asked for. **This entry recorded two rules until 2026-08-30**, when a documentation recertification diffed it against `17e3f594` and found the third rule and the rewrite missing — and the missing rule was the corrections one, so the record of the discipline that keeps error rates visible was itself under-reported. Nothing could have caught it: an archive line is prose, and no gate reads it. **The first two rules were applied to themselves on landing**: Rule 2 reports that nothing gates what it just added (four gates checked by name, including that `prettier --check` never MATCHES `.liquid` rather than approving it), and Rule 1 names its own class as every line of shipped partial text. Hand-compiled and read in the artefact; wrapper balance verified at both levels, zero Liquid leftovers, pure ASCII, no repo jargon. Gates after: typecheck clean, eslint 0, prettier clean, unit **214 files / 7249**.
- **EDITOR-10 — the agents grid gains a researcher row** (2026-08-26). The skill options panel's assignment grid drew two role columns, `dev` and `test`, and its `＋` fold held the six cross-domain agents — so the four researchers (`web`, `api`, `ai`, `cli`) fell through both routes and were **hand-assignable nowhere**, while still receiving skills from stacks and auto-assignment and still appearing in the roster. Measured: 14 of 18 placed. Now 18 of 18, via a third column labelled `res` — derived from the design's own `MX_ROLES` abbreviation rule (`reviewer → rev`), not chosen; width was measured and rules nothing out, since even `researcher` in full would fit. The row's stated blocker — "a fifth column diverges from a design file that draws four" — had expired: the code drew TWO, because the per-domain reviewer and PM were consolidated by CLI-398/CLI-399, so this moved the panel closer to the design rather than further. The design's own `AGENTS` array already listed researchers; only its `MX_ROLES` omitted the column. The placement moved to `lib/agent-placement.ts` because `react-refresh/only-export-components` fails lint on any non-component export from a `.tsx`, so a testable placement cannot live in the panel. Its test holds `PLACED_AGENT_IDS` against `SUB_AGENT_GROUPS` itself rather than a list of 18 names — a hardcoded expectation has to be edited by the same person adding the role, which is exactly the edit that was missed. **Finding filed**: `ROLE_COLUMNS` had zero compile-time reconciliation with the roster in either direction — a column naming a role no agent has still exits `tsc` 0 — and the CLI has carried a guard for this precise failure mode for months, referenced from no CLAUDE.md, so the editor never inherited it.
- **The emitted `config.ts` and `config-types.ts` are formatted at the source** (2026-08-26). Owner ruling: the two files an install writes must arrive already formatted. They are now a prettier fixed point under `semi: false, singleQuote: true, printWidth: 100, trailingComma: 'all'` — settings matching NEITHER repository config, deliberately, because these bytes land in a USER's project and `.claude-src/` is prettier-ignored here. **No runtime formatter**: prettier is a devDependency and tsup bundles those, so calling it from the renderer would have inlined the TypeScript parser into the published CLI and into the editor's preview chunk. Instead one printer — `packages/compile/src/installed-format.ts` — replaced three serialisation styles that had coexisted in one file (compact `JSON.stringify` per entry, `JSON.stringify(value, null, 2)` for the stack, hand-assembled template strings), and two member-count thresholds in the types half became one width rule. **The spec was a FIXED-POINT test, never a literal** — `expect(emitted).toBe(reformat(emitted))` — so it could not be satisfied by pasting whatever the emitter already did; 14 red across 6 scenarios × 2 files plus both blank emitters, and the tester corrected the brief by finding the second blank emitter. **A real defect the scenarios could not see** was found by probing after green: a string value too long to sit beside its key was not a fixed point, and the membership is not guessable — a string, `null`, an empty array and an empty record move below the key; a number and a boolean stay on the line however far past the width they run. A seventh scenario pins both sides of that edge. **Three test helpers turned out to PARSE the emitted config** and all three broke — one matched double-quoted literals only and would have returned `[]` for every union, passing vacuously. A guard already in the tree caught the change exactly as its author intended, its comment reading "a format change would satisfy the negative for free". **Found on the way: the published docs site told users to write `source:` where the CLI emits `origin:` and `marketplace:`** — not an ignored field but a hard parse refusal, since `renamedFieldGuard` pipes ahead of the shape check; it also documented `origin: "local"` where `EJECT_SOURCE` is `"eject"`. `preview-matches-install` stayed green UNEDITED, which is the proof the preview and the install still agree byte for byte. Gates: compile 47, CLI 7343 unit and 936 e2e, editor 453 + 31, typecheck/lint/prettier clean. Spawned CLI-844 (export-default-first, blocked on TDZ) and CLI-845; narrowed CLI-841 to two swapped lines.
- **EDITOR-52 — the output preview, and the shared renderer behind it** (2026-08-26). Phase B of the editor-v6 programme. The pure renderers came out of `packages/cli` into a new workspace, `packages/compile`, and **the CLI's own writers call it** — which was the acceptance criterion rather than a follow-up, because a shared package the editor imports and the CLI does not is client-side reconstruction with a `package.json`. Verified by imports rather than intent: `pair-writer.ts` reaches `generateConfigSource` through `config-writer.ts`, which is now a re-export facade over `@workspace/compile/config-source`, and `e2e/lifecycle/preview-matches-install.e2e.test.ts` proves it at runtime by byte-comparing a real PTY-driven `init` against the package's own renderers. The agent template corpus — 90 markdown partials and 7 Liquid templates — is **generated** into the package rather than copied, by a fourth generator with the same runner shape as the other three and its own CI drift step. The dialog draws two roots in one tree with no tab bar and no breadcrumb, and highlights through Shiki loaded lazily: the vendored corpus, the Liquid engine and all three grammars sit behind `import()` and land in the first-paint budget nowhere. An `eslint` `no-restricted-imports` group moved with the symbols so the old address cannot become a bypass. **Independently re-verified 2026-08-26** by a read-only lane that re-derived every claim: B1–B4 all hold. **Two things carried forward rather than closed** — the `first-paint-budget.ts` docblock records 331.6 KB against a re-measured 333.5 KB, so the margin it argues from is 2.5 KB rather than the 4.4 KB it claims (the gate itself is sound and green; the stale figure sits inside the very finding written to make budget margins honest), and nothing mechanically holds the editor's preview and the CLI's writers to the same answer — both were `diff`ed by hand against a real install, but neither suite can reach the other's fixtures. Found and fixed on the way out: the generator emitted `AGENT_CORPUS` as `as const satisfies`, which bound `typedValues` to the first agent's literal `identity` string and turned the repository typecheck red in a file `vitest` collected green — the only gate that could see it was `tsc`.
- **EDITOR-53 — the docked natural-language composer, UI only** (2026-08-26). One field, one button, two suggestion openers above it, and a proposal that always precedes any change. **Shipped in a shape the row never described**: it was filed as "three modes on a consequence axis" (`build` / `adjust` / `ask`), which the owner cut to two and then to none — `build` and `adjust` "essentially do the same thing", and the Phase D spec had hit the same wall from the other end, since the output schema had no field for the properties `adjust` was meant to edit. Intent now comes from the prompt text; the openers prefill the field and are a writing aid, not a mode — nothing records which was clicked, pinned in both directions by grep and by behaviour, because that is the thing most likely to drift back into a mode. Openers sit ABOVE the field for a structural reason rather than an aesthetic one: the band's bottom hairline is flush with the viewport edge because the band is the dock's last child, so a strip below it reads as a second band. The dock never draws three things because openers and a proposal are mutually exclusive by construction. **Nothing is persisted** — draft and proposal are local state, so `ui-store.ts` was never touched and the migration hazard had no subject. `Segmented` gained nothing: the reuse-with-a-`cva` decision existed only for the mode track. Both copy strings turned out byte-verifiable from the design's lab file rather than new; only the hint `nothing changes until you apply` is new copy. The `MarketplaceButton` collision was resolved by owner ruling — it floats, keeping its sticky-inside-the-column mechanism, since `position: fixed` was tried and rejected there (EDITOR-35); `marketplace.spec.ts` staying green UNMODIFIED is the proof. **One gap carried forward**: `build`'s old "cannot remove a skill, by construction" guarantee went with the mode, and one field invites "drop the ORM" — the always-proposal ruling replaces it and is stronger, but the removal ROW is undrawn, which is why the proposal now reuses the options panel's assignment matrix as a diff. Reviewed APPROVE with no blocking findings; e2e 380 → 419.
- **WWW-01 (three of five bullets) — the documentation site gains five sections** (2026-08-27). The site went from 19 pages to 37 and from five sidebar groups to nine: **Configuration** (index, the exhaustive `.claude-src/config.ts` field reference, scopes and paths, models and effort), **The editor** (index, selecting skills, installing and sharing, marketplaces), **Recipes** (an index plus six task pages), **Troubleshooting** (index, common problems), and `reference/sub-agent-anatomy.md`. Every page follows one shape the owner set — intro, then `## Quick start`, then advancing depth — so a reader who stops at the quick start still has something that runs. The four new groups are `autogenerate`, so a page added later joins the sidebar by existing; the five hand-listed groups above them were left alone. **The config gap this row called "the single largest in the whole site" is closed**: all seventeen `ProjectConfig` fields are documented, including the eight — `marketplaceName`, `agentsSource`, `branding`, `skillsDir`, `agentsDir`, `stacksFile`, `categoriesFile`, `rulesFile` — that appeared nowhere on the site before, and the three the CLI accepts but never reads are labelled as inert rather than described as working. **What made this land accurately was that the writers were not trusted**: an adversarial verifier per lane re-derived every claim against source and returned about forty findings, of which the worst was a page stating that `compile` runs both a global and a project pass when `buildCompilePasses` returns exactly one, always — a reader would have expected global sub-agents to rebuild from inside a project. Also caught: a `disallowedTools` frontmatter key that can never be emitted, an `agents/config.ts` path nothing writes, `--yes` attributed to `init` and `edit`, a three-command eject recipe that broke on its own second line, and `web-testing-playwright` — a skill id that does not exist, in a category it would not sit in, **pre-existing in `guides/editing-config.md` and `concepts/stacks.md`** rather than introduced here. A second pass re-verified the fixes and caught the fixer introducing a fresh false claim while closing one (`doctor` reporting a validation error it cannot reach, because it validates the loaded config after the loader has already defaulted the field). Gates: build 37 pages clean, `astro check` 0/0/0, all three site checks green (`cli claims: 13 commands and 18 flags, all documented`), prettier clean, 34/34 internal links resolve, no catalogue count written as a literal. **The row survives** for the two bullets that did not land — the reference staying per-group rather than per-command, and the absent Releases section — and one bullet was WITHDRAWN outright: see WWW-01's own withdrawal note for the owner's ruling that the older README-linked guides carry the correct voice, which is the reverse of what the row asserted.
- **The documentation site turns editor-first, and gains a capability matrix** (2026-08-27). Owner ruling: _"a user wants to install Agents Inc on their machine and the easiest way is to use the web editor and install it via CLI. The CLI is then only additive — the main way is the editor."_ Sixteen of thirty-five pages gave CLI instructions and never mentioned the editor, including `quickstart` at eight CLI mentions to zero — the page that sets a first reader's default. **The structural fact that decided the shape**, verified rather than assumed: the editor runs in a browser and cannot write to disk, so every editor user runs a CLI command. The two front doors are therefore SEQUENTIAL rather than alternative — select in the editor, install with the CLI, maintain with either — and a forked page tree would have promised an editor-only path that does not exist and stranded every reader at the install step. So one page per topic, always, with the divergence forked inside it: `<Tabs syncKey="tool">` where a reader is genuinely stuck without choosing, `:::note` where the CLI is a footnote. **The ratio is the deliverable**: two tab sets against seventeen asides, and the core install flow is not tabbed at all. Starlight persists the tab choice across page navigations, which is the "single fork point" the ruling asked for, delivered as a preference rather than a route. **A first pass got the balance wrong and was stopped before the writers ran** — it treated tabs as the primary mechanism, which is a parity claim, and the owner's follow-up ruling that the two are not on equal footing inverted it to asides-by-default. Also landed: `reference/capabilities.md`, 48 capability rows across seven grouped tables, whose last section renders `CLAUDE.md`'s consume-versus-author rule for a user so that a `no` in the CLI column reads as "by design" or "not yet" rather than as an unexplained blank — the ruling existed nowhere a user could see it. **The adversarial passes earned their place again.** The capability matrix claimed `share` refuses by name over `agentsSource`; it does not — `configToSeedPayload` builds its refusal list from four sources and never reads that field, so it is dropped silently, and the page also called it "the one place" a config cannot round-trip when there are four. It named a wizard step called "Build" in four cells, which is the internal `WizardStep` id — the tab a user sees reads `Skills`. It presented two gaps as settled that are `Deferred` in `todo/cli.md` (CLI-739 built-in stacks, CLI-453 `new skill`). The reshape's own verifier caught `concepts/install-modes` over-forking with an Editor tab that dead-ended: a reader flips the badge in the browser, runs the bare `npx agents-inc init` the page named, and silently loses the choice, because the page never named `--from` — converted to editor-first prose plus an aside, and the page went back to `.md`. It also caught `cli-or-web.md` stating that `--from` overrides an existing installation when `refuseInstalledProject` refuses it outright, and `edit --from` documented as exiting 4 off a TTY when it exits 1. **`commands.md` carried the same false dual-pass compile claim** an earlier lane had already fixed elsewhere on the site, and it is fixed there now without disturbing the `## Command matrix` markers. Gates: build 38 pages, `astro check` 0/0/0, all three site checks green, prettier clean, 35/35 internal links resolve, zero pages reachable only from the sidebar. Spawned WWW-12.
- **Concepts gains a scopes page, and three smaller documentation corrections** (2026-08-27). Four owner questions, four answers. **`concepts/scopes.md` is new** and `concepts/install-modes.md` is slimmed to modes: that page was titled "Install modes" while half its body was scope, so a reader hunting for project-versus-global could not find it by name, and scope had substantive coverage in three places — a guide (`global-first-setup.md`), a config reference (`scopes-and-paths.md`) and that mistitled page — with **no page owning the definition**. The new page's spine is the asymmetry, which the owner phrased better than either existing page: global reaches everywhere, so a project sub-agent carries a global skill, but a global sub-agent cannot carry a project one. Written from `isSeedScopePairWritable` in `packages/matrix/src/seed.ts` — `!(skillScope === "project" && agentScope === "global")` — which is the ONE definition the CLI, the editor and the seed contract all read rather than restating, and whose docblock supplies the reason the page gives: a global sub-agent's file lands in `~/.claude/agents/` where every project reads it, so a project-scoped skill it names exists from nowhere else. Concepts is a hand-listed sidebar group, so `astro.config.ts` gained the slug. **`guides/using-codex-keeper.md` → `guides/documenting-your-codebase.md`**, title "Documenting your codebase" — task-shaped like its siblings and findable by someone who has never heard of `codex-keeper`, whose name moved into the description so search still reaches it; both inbound links updated, `index.md` and the Guides table in `packages/cli/README.md`. **`init --ui` joined `quickstart.mdx` and `editor/index.md`**, which documented it nowhere while `reference/commands.md` covered it fully — a reader on the main path never learned the terminal could open the editor. Stated with its real limit rather than sold as a route: bare `init --ui` opens the empty catalogue and carries nothing, so its value is printing the address before opening a browser (SSH, no desktop session) and `--ui --from <id>` previewing a shared configuration before installing it. **One planned change was dropped after looking**: `guides/writing-custom-skills.md` was flagged as needing an editor aside on a count of zero asides, but the editor-first reshape had already put the editor in its lead paragraph — "If somebody has already written it, import it rather than writing it again" — which is stronger placement than an aside, so the aside count was the wrong metric and nothing was added. Gates: build 39 pages, `astro check` 0/0/0, all three site checks green, prettier clean, 36/36 links resolve, zero orphan pages.
- **The `.ai-docs` reference and the documentation site reconciled, and two false rows corrected** (2026-08-27). Diffed `packages/cli/.ai-docs/reference/` against `apps/www/src/content/docs/docs/` on every fact both trees state. **They agree on almost everything**: the 13-command roster matches exactly, the wizard's `["stack","domains","build","sources","agents","confirm"]` matches (the site renders `build` as its user-facing tab name, `Skills`), the scope rule matches, the five per-agent partials match, the six passthrough config fields match, and both name the same three retired commands. **Two claims in `reference/features/agent-system.md` were false, and both are now fixed.** (1) The template-data table called `preloadedSkills` _"Skills embedded in prompt"_. Nothing embeds it: enumerating every variable `agent.liquid` actually renders gives `preloadedSkillIds` (into the frontmatter `skills:` list) and `dynamicSkills` (into the body), never `preloadedSkills` — which is an intermediate in `packages/compile/src/agent-source.ts` with **no production reader at all**, referenced only by two test files. Now reads "Preloaded skills in full — unrendered". **The identical false claim sat on two documentation-site pages until earlier the same day**, so this file was the last place it survived. (2) The pruning table's row `compile` with `hasBoth` said _two passes_; `buildCompilePasses` returns a single-element array on both branches, and with `hasBoth` returns one Project pass carrying `scopeFilter: "project"`. Now reads "one filtered pass", with the `scopeFilter` cell corrected from `global / project` to `project`. **The document set had contradicted itself**: `reference/commands/index.md`, validated four weeks later, already said "the single pass this invocation owns". The neighbouring `compileAgentsAllScopes` rows were checked and deliberately left — that function genuinely does run both passes, global then project. **Everything else enumerable in that file was verified rather than assumed and all of it held**: 18 agents across 6 role directories, 1 main template and 6 methodology partials; 4/4/4/4 per role for developer, meta, researcher and tester; 16 `opus` against 2 `sonnet` (`convention-keeper`, `api-tester`) with all 18 declaring a model; four of the nine domains carrying a developer/researcher/tester triple; and the `output.md` fallback to the parent category directory (`compiler.ts:61-63`). The site side was re-checked in the same pass and holds — its anatomy page already states that `effort` is conditional and `disallowedTools` never appears, which matches all 13 compiled agents on disk (11 carry six frontmatter keys, and `codex-keeper` and `skill-summoner` carry five because neither has a preloaded skill). `last_validated` was deliberately not bumped, per `documentation-bible.md`: a pass that checks part of a document leaves the date alone. Gates: the six `.ai-docs` integrity guards 198 tests green, site build 39 pages, all three site checks green, prettier clean on both trees. Evidence appended to CLI-832, whose central claim — that nothing gates a prose table cell in this file — these two instances demonstrate.
- **The search modal reconciled with the design language** (2026-08-27). The one surface Starlight hands to somebody else's component, and the only one `site.css` had never reconciled. **The obvious diagnosis was wrong and is worth recording as such**: the colours were already right, because Starlight maps `--pagefind-ui-background`, `-border`, `-primary`, `-tag` and `-text` onto its own `--sl-color-*`, which this file had already pointed at the palette; radius was right too, since rule 1's universal reset reaches Pagefind's corners like everything else's. What was wrong was chrome and scale, neither of which any variable covers. **`--pagefind-ui-scale: .8` multiplied every size in the component**, so the modal rendered its input and result titles at 16.8px and its excerpts at 12.8px — measured in a browser — against a site whose body is 16px and whose smallest prose is 14px. Three sizes that appear nowhere else, and most of why the modal read as a different product; now 16/16/14. Beyond that: Pagefind drew each result as a bordered white card and faked its dividers with a `gap: 1px` letting the page show through, carried tree-branch connectors on nested rows and a document glyph on every title (this design ships no icon set beyond the GitHub mark), and gave the input a 2px border and a focus ring, making it the heaviest element on a site built from 1px warm hairlines. All replaced with hairline rows, the input drawn as the same box the design gives a command, and the matched term marked in amber ink with no fill — this design marks with colour rather than with surface. **One judgement call**: the page title now takes the mono-uppercase label treatment this file already gives the sidebar and table-of-contents headings, because it names where the hits came from rather than heading them — rule 3's own distinction. A page called `Skills` whose first hit is a heading called `Skills` is unreadable when both are 16px sans, and no weight difference on one typeface fixes it; two vocabularies do. **Worked visually rather than from the stylesheet**, through a throwaway Playwright harness serving `dist/` and reading computed style, across four iterations and all three modal states (results, no-results, empty). That is what found the white card sitting on `.pagefind-ui__result-title` behind a `padding-left: 60px` icon slot, and it caught one wrong fix in flight: Pagefind reuses `.pagefind-ui__result-title` for **both** the page label and each heading inside it, so the first attempt turned every row into a label — fixed by scoping to the direct-child forms. Gates: build 39 pages, `astro check` 0/0/0, all three site checks green including `type scale: 4 pages, 3 shared roles, all agree`, prettier clean, and every `var(--…)` in the new block resolves to a declared token. Spawned WWW-13 — nothing gates any of this, and the modal mounts at runtime so even a computed-style check cannot see it without opening the modal first.
- **The landing page gains its missing sections, and the page widens 20%** (2026-08-27). The 2026-08-02 research note — 24 sites surveyed, a section order, a named centrepiece and an anti-pattern list — had never been used. Its verdict on the page was that the minimum ship is nav → hero → what-it-is → **catalogue teaser** → free/community → footer, and what shipped was that list with the teaser missing, so **the page did not meet its own stated bar**. It now runs eleven blocks. **The catalogue teaser is the centrepiece and it is the editor's grid in miniature** — nine domain tabs, six categories each, four skills each, with a "+ N more" line and a count, all read from `CATALOG` at build time so none of it can drift from the catalogue. Its closing sentence carries the fact that distinguishes the product and appeared nowhere on the page before: most rows take one choice, which is what makes this a stack rather than a list. **The tabs ship no JavaScript**: nine radio inputs and generated CSS sibling selectors, the radios positioned off-screen rather than `hidden` so they keep their place in the focus order and arrow keys move between them the way a tab strip should. The rules are generated from the same array the markup renders, so a domain cannot appear in one and not the other. Also added: a stats strip (238/18/9, counted not typed — the note is explicit that round numbers read as invented where odd ones read as measured, and that an animated counter with no static fallback is how `warp.dev` serves "0K Active Developers"), how-it-works as three steps, write-your-own, and one final CTA. **"Two front doors" was deleted rather than moved.** Its closing words were "use whichever you prefer", which the owner overruled the same day — the two are not on equal footing and are not alternatives at all, since a browser cannot write to a filesystem. Three steps show the sequence where a comparison argued against it. The hero's editor CTA now leads the command block for the same reason, expressed as **position rather than colour**, because rule 4 reserves amber for what the user deliberately chose and neither CTA is a choice yet. **The width went 768 → 922px**, exactly +20%, as one `--container-page` token across the header, `main`, the footer and the 404 rather than four literals — and the 404 was included because it shares the header, so widening one without the other would have re-opened the drift its own comment warns about. Prose is deliberately not widened: a longer line is harder to read, and the extra width is for the blocks that are not prose. **Widening alone made the page worse and the two changes had to land together** — before the wide sections existed the only visible effect was more right margin. **Rule 5 nearly got broken**: the first design used hairlines to separate the tab strip from the grid, and this page's own rule is that whitespace separates content and a border only encloses something. Redrawn with space. **Three of the note's twelve blocks were DECLINED rather than deferred** and the reasons are recorded on the row: three pillars is a shape rather than a claim; a proof block has nothing true to put in it; a star count would render zero. Verified visually at 1440 and 390 through a throwaway Playwright harness — no horizontal overflow on a phone, the teaser stacks to one column, and the tab switch was confirmed by reading computed `display` before and after a click. Gates: build 39 pages, `astro check` 0/0/0, lint clean, all three site checks green, prettier clean on every file it can parse (`.astro` has no parser in this repo — the same error hits the unmodified file from HEAD).
- **The landing page settles at 1024px, and the prose stops wrapping early** (2026-08-27). Same-day revision of the 20% widening. 57.6rem was an arbitrary multiple; 64rem is the common step in this range — Tailwind's `5xl`, and a width readers are used to — so the header, `main`, the footer and the 404 all moved to it through the single `--container-page` token. The larger change is the second one: **prose was pinned at 36rem in twelve places across two files**, which measured 67 characters per line and left every paragraph 226px short of the catalogue grid beside it, so the page carried two ragged right edges once the wide sections landed. All fourteen pins now read one `--measure` token and run to the container. **The number is recorded rather than hidden**, in `site.css` and on WWW-02: full-width prose measures 105 characters per line against the 45–75 usually recommended, which is the owner's call and not an oversight — and because every paragraph now reads one token, pulling it back to 44rem (~82 characters) or 40rem (~74) is a one-line change rather than a fourteen-site edit. Verified at three widths on both pages: no horizontal overflow at 390, 768 or 1440. Gates: build 39 pages, `astro check` 0/0/0, all three site checks green including `type scale: 4 pages, 3 shared roles, all agree`, prettier clean on every file it can parse.
- **The landing page gains a frame — hatched gutter, content rails, tick ruler** (2026-08-27). Owner design, chosen from a lab rather than proposed: eleven treatments across three rounds, all rendered against the built stylesheet so they carried the site's real tokens and fonts. Round one was seven strips — gutter rails, measured rails, a padding band, crop marks, a hatched gutter, a tick ruler and a literal box-model legend; **crop marks died as too faint to register and the box-model legend as a diagram about a page rather than chrome on one.** Round two put the four survivors at page height, which is the only scale that discriminates. Round three combined them. The owner picked the hatched gutter plus the ruler-and-rails, and a fourth round tuned the hatch density against a full-height page: **10px pitch, because 7px vibrates over a page this tall and 12px stops reading as hatching.** Implemented as **two pseudo-elements on `body.framed` and no markup at all** — `::before` carries the hatch, which must be masked to the two gutters and therefore cannot share a layer, and `::after` carries the rails and ruler as plain backgrounds. Both absolute against a relative body, so the hatch runs the length of the document and scrolls with it rather than sticking to the viewport. **Drawing the gutter did not fix the complaint it was for.** Text still sat flush against the rails, which read as a box the content was crammed into; `--frame-inset` is the separate breathing room inside the rail, and it is what actually solved it. **Rule 5 is now a rule with an exception**, recorded in both places it needs to be — `index.astro`'s own comment where the rule is stated, and `todo/www.md` under settled constraints — because the rails comply as written (they enclose the content column) while the hatch and the ruler are vocabulary the rule does not cover. A later pass reading them as drift and stripping them is the specific failure that note prevents. **One self-inflicted bug, caught by the verification rather than by review**: the first attempt classed `<body>` by string replacement and hit the HTML comment that mentions `<body>` instead of the tag, so the comment shipped containing a stray `<body class="framed">` while the real tag stayed bare — visible only because the check asserted `document.body.classList` rather than grepping the source. Scope confirmed the same way: framed true on `/` and `/404.html`, false on `/docs/`, at both 390 and 1440. Gates: build 39 pages, `astro check` 0/0/0, lint clean, all three site checks green, prettier clean, no horizontal overflow on any of the three surfaces at 390, 768 or 1440.
- **The frame's hatching goes everywhere, and gets fainter** (2026-08-27). Same-day revision. Owner ruling: one colour and one weight for the diagonals everywhere, fainter than shipped, and filling the horizontal gaps between sections rather than the side gutters alone. Now `--color-divider` at 1px on a 10px pitch, uniform — and the uniformity is the ruling rather than a detail, because it is what makes the hatch read as one surface the content sits on instead of decoration around it. **Implemented as one unmasked layer with the content painting over it**, which is the only version that does not rot: every block carries the page's own colour, so the hatch surfaces exactly where nothing is — both gutters, the band between each pair of sections, and the page's head and foot. A per-gap treatment would have needed a rule per gap and would have drifted the first time somebody added a section. Sections bleed to the rail with a negative inline margin so the hatch cannot reappear in the inset — the reading is gutter, rail, content, not gutter, rail, more gutter. **One bug caught by measuring rather than by looking**: the same negative margin on the header and footer overrode the `auto` in their own `mx-auto max-w-page` and threw both to the viewport edge; they paint rail-to-rail with a gradient instead, which needs no margin. Verified by reading their computed widths at three breakpoints — 390/768/1024 against a 1440 viewport, matching `main` exactly, with the docs untouched at every one. Three lab variants were drawn before implementing (contained to the frame, full-bleed to the viewport, and tighter blocks); the contained one shipped, because full-bleed fills enormous areas on a wide monitor and makes the browser window part of the design. Gates: build 39 pages, `astro check` 0/0/0, lint clean, all three site checks green, prettier clean, no horizontal overflow on any surface at 390, 768 or 1440.
- **The frame loses its rails and the hatch band becomes the measure control** (2026-08-27). Owner ruling, third revision the same day: the vertical hairlines at the content edge came out — the hatch already marks where the page stops, and a rail beside it said the same thing twice — and the band widened so it pushes the text in rather than merely decorating the edge. **That reframes what the band is**: `--frame-gutter` went 3.75rem → 8.75rem because that is what pulls the prose from 99 characters to 80, so the band is now the knob that sets line length and `--measure` simply lets prose fill whatever the band leaves. Two things the widening broke and the verification caught, neither visible in a screenshot at one width: the three-column grids lost enough room that a category label wrapped, fixed by taking the column gaps from 60px to 40px; and applying the wide band at the existing 40rem breakpoint would have left a tablet 432px of content with 117px columns, so it is gated to `width >= 64rem` and a tablet keeps the old 3.75rem. Measured across four viewports afterwards — 390 gives 34 characters in a single column, 768 gives 69, and 1024 and 1440 both give 80 — with no horizontal overflow anywhere and `/docs/` unframed at every one. The settled-constraints note now carries five things that are easy to break and two structural traps, including that the band is a measure control rather than a margin, which is the part most likely to be "tidied" by someone who reads it as whitespace. Gates: build 39 pages, `astro check` 0/0/0, lint clean, all three site checks green, prettier clean.
- **The frame gains column guides and self-annotation** (2026-08-27). Four additions chosen by the owner from a brainstorm of ten, all in one vocabulary — drafting instrument rather than devtools, so no second hue and no JS. **The page now annotates itself in the band the hatch already occupies**: the ruler reads `0` and `1024`, and each section carries its real anchor beside it. The anchors are read off `aria-labelledby` with `attr()`, so they cannot drift from the id the heading actually carries and a reader can type one into the address bar — seven sections carry one, verified at four viewports. Both annotations are suppressed below 64rem, where there is no band to sit in and the figures would be false. **Inside the content, six column guides**, which puts the three-column sections on every other line; twelve was drawn and rejected as landing 57px apart and becoming a second texture competing with the hatch. **The baseline horizontals were built, rendered at 1:1 and rejected**, which is the part worth keeping: at 28px they turn the content into graph paper, and they disagree with the skill lists, which run at 1.7 line-height against the prose's 1.75 — so the lines fall between items rather than under them. The caution that a baseline would only "mostly agree" was stated before building and proved exactly right at the place predicted. **Two process failures, both self-inflicted and both caught by looking rather than by review.** A variant switch used a string that prettier had already reformatted across lines, so `str.replace` silently no-op'd and two consecutive "comparisons" rendered the same page — caught only because the crops were byte-identical when they should not have been. And the underlying cause was two `body.framed main > section` rules fighting over `background` versus `background-image`; they are now one declaration. Gates: build 39 pages, `astro check` 0/0/0, all three site checks green, prettier clean, no horizontal overflow on any of the three surfaces at 390, 768, 1024 or 1440, and `/docs/` unframed at every one.
- **The catalogue teaser gains the editor's accents, and the diagonals move to the background** (2026-08-27). Four owner rulings from a lab of ten catalogue designs. **The tab bar is now `packages/ui`'s Chip, `size: filter`, ported verbatim** — resting `--color-chip-border` on transparent, hover `--color-line-hover`, active `--color-brand-border` on `--color-wash` with `--color-brand-ink`, all read out of `chip.tsx` rather than matched by eye and verified in the browser as exactly those computed values. **That settles a rule I had got wrong**: the tabs were ink-on-active because I reasoned amber is reserved for what the user deliberately chose and a tab is a view rather than a choice — but the editor's own domain filter chip is amber when active, so amber tabs are the precedent, not an exception to it. **Category labels became sans semibold ink**, which fixes the defect the owner named: categories and tabs were both mono uppercase at nearly the same size, so a reader could not tell a tab bar from a group heading. Three tiers now, in three vocabularies — bordered mono chips, sans semibold ink categories, sans regular skills. **Section headings became their own anchors**: clicking one puts its id in the address bar, so any section is directly linkable, and the `#id` labels that sat in the margin were removed rather than kept alongside — the same reasoning that removed the vertical rails a few hours earlier. **The diagonals retreated to the background.** They had filled every void including the gaps between sections; `main` now paints one continuous white column band-to-band, so the hatch shows behind the page and nowhere between blocks, and sections carry no surface at all. The column guides moved onto the same declaration, sized to the content rather than the frame. Verified in the browser rather than by eye: the heading click sets `#the-catalogue`, the active chip computes to `rgb(247,238,218)` / `rgb(220,189,133)` / `rgb(160,106,28)` — `--color-wash`, `--color-brand-border`, `--color-brand-ink` — and the margin-id pseudo-element computes to `none`. Gates: build 39 pages, `astro check` 0/0/0, lint clean, all three site checks green, prettier clean.
- **The page background becomes a dot grid, and the instrument marks come off** (2026-08-27). Three owner rulings. The tick ruler along the top and the `0` / `1024` coordinate figures were removed — both were built earlier the same day, and the page now states its own width nowhere. The content column moved from `--color-page` to `--color-column` (`#fdfdfc`), which is the surface the editor gives its own middle column, so the two halves sit on the same ground. And the diagonal hatch became a **1px dot on a 12px grid**, chosen from ten patterns drawn in the band beside a real content column: crosshatch, square grid, single-direction rules, dot-on-grid, fine dots, diagonal dashes and the diagonal at several pitches. The reasoning recorded with it is about what a background is for — a rake of diagonals has direction, so it carries energy and the eye follows it, where a dot field is inert. **One bug, found by reading computed style rather than by looking**: the column-colour change was applied with a single string replace, and the header/footer gradient and `main`'s gradient share that exact substring — so the first match took it and `main` stayed pure white. Two surfaces disagreeing by one point of luminance is invisible by eye and unambiguous in `getComputedStyle`; all three now report `rgb(253, 253, 252)`. Gates: build 39 pages, `astro check` 0/0/0, lint clean, all three site checks green, prettier clean, no horizontal overflow on any of the three surfaces at 390, 768, 1024 or 1440.
- **The design system gets a visual baseline — Chromatic beside the story suite** (2026-08-28). Storybook needed nothing: it has been in `packages/ui` since the package existed, at v10 with the vitest and a11y addons, and all twelve components carry a `.stories.tsx`. What was missing was the instrument that reads the pictures. `vitest run` renders every story in a real Chromium and gates on axe, but **axe reads structure and a screenshot reads appearance, and neither can see the other's failure**: a button that loses its accessible name renders identically, and a component whose padding, border or colour moved passes every structural check there is. The `color-contrast` holdout of 2026-08-07 sharpens it — the palette is a taste decision no rule will ever gate, so a diff against an accepted baseline is the only thing left that can catch it moving. Chromatic CLI 18 in `packages/ui`, `chromatic.config.json` naming a new `build-storybook` script, and a `visual` job in CI that does not gate the deploy, on the same reasoning `check-cli` does not. **Three decisions worth more than the wiring.** `autoAcceptChanges` is deliberately unset: the usual `\"main\"` setting assumes a pull request already reviewed the change, and this repository commits straight to main, so on that setting Chromatic would accept every diff it ever found and report to nobody — an intentional redesign now turns CI red until somebody accepts it in Chromatic's UI, which is the tool working. TurboSnap is deliberately absent: it exists to avoid re-snapshotting unchanged stories, which is worth having at hundreds and not at twelve, and it would buy a `--stats-json` build, a `storybookBaseDir` because the git root and the Storybook root differ, and a new way for a run to snapshot nothing and still pass. And the job runs the CLI rather than `chromaui/action`, which would install its own Node and re-install a workspace the job already installed from the lockfile. The CI step is unguarded on purpose — without the token it fails loudly, because an `if: secrets…` guard turns a missing token into a green skip. **One defect found by running the gates rather than by review**: `storybook build` writes `storybook-static/`, which is gitignored, and untracked generated material is not inert — it joined `eslint .` and put 13 errors in Storybook's own minified manager bundle, one of them a missing-rule-definition error against a `@ts-` comment in a file with no TypeScript in it. Named in `packages/ui/eslint.config.js`'s `globalIgnores` and in both ignore files, the same shape as the `.scratch*` reservation. **Proven end to end the same day**: build 1 published, 12 components and **76 stories** — six times the figure this entry was first drafted with, because a component ships several stories and only the components had been counted — captured as 76 snapshots in 43 seconds and auto-accepted as the baseline, which is what a first build always does. The token is set as a repository secret and the project is linked to GitHub, so Chromatic posts its own check on each commit alongside the `visual` job. **The job still waits for the verdict rather than exiting on upload**, which Chromatic suggests once a project is linked: 43 seconds is cheap, and one red job beats a green job beside a red check somewhere else. `projectId` is recorded in `chromatic.config.json` — it is an identifier rather than a credential, and it is the only thing in the repository that says which project these baselines live in. Gates: `build-storybook` succeeds, ui lint clean, typecheck clean, 13 files / 95 tests green, prettier clean, `deps:check` green on all four.
- **The editor gains a visual baseline — Argos on the Playwright suite** (2026-08-28). The counterpart to the design system's Chromatic baselines, and the two ask the same question of different things: `packages/ui` covers components standing alone, this covers the assembled screen, and **a component that is correct in isolation and wrong in composition is invisible to the first and visible to the second**. Nothing in `check-web` could see either — the editor's 423 behavioural tests drive the app through the accessibility tree, and `getByRole` has no opinion about pixels, so a panel that loses its padding or a dialog that overlaps the sticky bar passes every one of them. `@argos-ci/playwright` 7 in `apps/editor`, twelve chosen states in `e2e/specs/visual.spec.ts`, and a `visual-editor` CI job that does not gate the deploy. **The states are chosen rather than swept**: scattering captures through the behavioural specs would make every one of their failures ambiguous and tie visual coverage to whatever happens to be tested functionally, so the file is the list and adding a screen means adding a `test` to it. Captures are viewport-sized because a full-page baseline of a grid that runs thousands of pixels down a generated catalogue would be mostly vendored content, and every regeneration of `packages/matrix` would read as a design change.

  **The finding is bigger than the feature: the E2E suite could not take a screenshot, and had not been able to for as long as it has existed.** Eleven of twelve captures failed against `vite dev` — "Execution context was destroyed", "Frame is currently attempting a navigation", Argos's injected `window.__ARGOS__` gone by the time it was read back. The same twelve passed against a production build served statically, with no navigation events at all. **Two explanations were built and discarded before that one**, and both are worth recording because both were plausible and both were wrong: Vite's dependency optimizer re-bundling the `import()`-only deps (shiki, liquidjs) and reloading every connected client, which `optimizeDeps.include` for all six did not change; and the HMR client, which `hmr: false` did not change either. Both edits were reverted rather than left in as harmless, because a comment claiming a fix that did not fix anything is worse than no comment. What survives is the plain statement that the dev server moves the page under a one-shot operation — **an auto-retrying `expect` never notices, and `page.screenshot` has no retry to hide it with**, which is exactly why this sat latent under 423 green tests. So the appearance suite has its own config, `playwright.visual.config.ts`, which builds the app and serves it; the behavioural suite is untouched and still drives the dev server.

  **Two details that are not incidental.** The build runs `--mode test` against a new committed `apps/editor/.env.test`, because a production build calls `https://api.agentsinc.sh` — an origin no stub claims, and one the fixtures' third-party guard does not watch either, so the captures would silently have been of whatever the live API returned; it writes to `dist-test/` so a visual run can never overwrite what `bun run deploy` uploads. And the chromium project takes `--disable-lcd-text` and `--font-render-hinting=none`, because subpixel antialiasing is resolved by the machine doing the rendering and every text-bearing capture would otherwise report as changed the first time a locally-taken baseline met a CI run. **Proven end to end the same day**: build 1 uploaded twelve screenshots and passed, and the token is set as a repository secret, so the `visual-editor` job runs from the next push. The upload path was exercised by forcing `CI=true` locally, which is the only switch that turns `uploadToArgos` on — worth knowing, because it means a local run is silent by design and a broken upload would first be seen on a runner. Also verified: the twelve captures passing three times running, and the 423-test behavioural suite still green with `visual.spec.ts` excluded from it. Gates: editor lint clean, typecheck clean, `test:e2e` 423 passed, `test:visual` 12 passed, prettier clean, `deps:check` green on all four.

- **Accounts and saved stacks — Better Auth on Cloudflare, and a worker that would not have booted** (2026-08-28). SERVER-04 and its editor half, chosen by the owner from three options and implemented in one pass. Sign in with GitHub, keep as many named stacks as you like, on any machine. **The design is why it is small: a saved stack is a name pointing at a payload that already exists.** `POST /configs` already mints an immutable content-addressed id for a whole configuration, so nothing here duplicates `seedPayloadSchema`, the size cap, the version gate or the corruption check — KV keeps the payloads untouched, and a new D1 holds Better Auth's four tables plus `saved_stacks(id, user_id, name, config_id, …)`. A saved stack and a share link are now the same bytes. **Anonymous use is unchanged and that is the first test in the file rather than the last**: the CLI resolves a share link with no account and always will.

  **The finding that matters most: 65 green worker tests and the worker did not start.** `better-auth` reaches for `node:crypto`, and without `nodejs_compat` in `wrangler.jsonc` the runtime dies with `No such module "node:crypto"` before serving a request — while the vitest pool tolerates the same import and reports a clean run. **A green suite is not evidence that the thing runs**, which is exactly what step 4 of the process exists to catch, and it caught it. Found by curling a real `wrangler dev`, not by reading. Two more only that run could show: Better Auth warned `Base URL is not set … callbacks and redirects may not work correctly` and then derives an origin from whatever arrives, so `AUTH_BASE_URL` is now a var in both blocks; and the sign-in route was verified to return a real `github.com/login/oauth/authorize` URL carrying the right client id, `state`, `read:user user:email`, and `redirect_uri=http://localhost:8787/api/auth/callback/github` — the exact callback the OAuth app was configured with.

  **Four more things the library did not do as documented.** Rate-limit counters had to move to D1: `better-auth-cloudflare` 0.3.1 peers on `better-auth` ^1.5 and its KV adapter implements no `increment`, which 1.7 requires, so the run fails outright — sessions stay in KV, only the counters moved. `better-auth-cloudflare`'s own README does not compile here, showing `drizzle(env.DATABASE, { schema })` where the field is typed `ReturnType<typeof drizzle>` with no generic; the schema goes through the adapter `options`, which is where Better Auth reads it from anyway. Declining geolocation is not done by omitting `cf` — the adapter throws without it whether or not the feature is on — and the flags had to sit on the env-less path too, because the CLI-only export calls in with no bindings at import time. And two copies of `KVNamespace` exist in this repository, one from `wrangler types` and one from the `@cloudflare/workers-types` the library peers on, which `tsc` refuses to unify over a single optional parameter of `get`.

  **Two defects the tests caught that review would not have.** Adoption of the local snapshot ran TWICE and uploaded the same stack twice — two overlapping refreshes each read an empty list and each acted on it, which happens for ordinary reasons (React double-invokes effects under StrictMode); the store now shares one in-flight refresh. And adding a session check to the nav rail broke **all 423 existing E2E specs at once**, because the fixture's default-refuse network guard saw a request nobody had stubbed; the fix is a signed-out default in `fixtures.ts`, which is also the honest baseline. That guard was added months earlier for an unrelated reason and paid for itself here.

  **Deliberate omissions, each written down where it will be read.** No `better-auth` client in the browser bundle — the editor makes three plain fetches instead, because `first-paint-budget.ts` fails the build past a fixed weight and a wrapper for three calls is not what that budget is for. An account's stacks REPLACE the local slot rather than sitting beside it, so there are never two lists of "your saved stacks" that can disagree; the local one is unshown, not deleted. And **the rate-limit gap is not closed** — Better Auth's limiter covers auth routes only, `POST /configs` still has none. **Signed in for real the same day**, and verified at the database rather than on screen: one user, one `github` account row with `issuer` populated and an access token stored at scope `read:user,user:email` — so the owner's keep-the-token ruling is live — and zero rows in `sessions`, which is correct because sessions are in KV and only the rate-limit counters moved to D1. **The callback found one more thing no test could**: `@better-auth/cli` tops out at 1.4.21 against a library at 1.7.2, so the generated `accounts` table had no `issuer` column and the first sign-in failed inside the library. That file is hand-maintained now, and `auth-schema.test.ts` asks the installed better-auth what columns it expects and compares — a guard proven by removing the column and watching it redden. **Still unexercised: production.** The cookie configuration takes the other branch there — `crossSubDomainCookies` enabled against `.agentsinc.sh`, `secure: true` — and nothing has run it; so is saving a stack while signed in. Gates: worker 65 tests / lint / typecheck, editor 430 E2E and 454 unit, visual 12, first-paint budget green, `deps:check` green on all four, prettier clean, all 8 workspaces typechecking.

- **Four things the session was asked to finish, and a rate limit that had been open all along** (2026-08-28). **`POST /configs` is rate-limited at last** — 20 writes a minute per address, via Cloudflare's own binding, checked BEFORE the body is read so a refusal is cheaper than the flood it refuses. It was an unauthenticated public write into KV with CORS as the only thing in front of it, and CORS is a browser convention `curl` ignores; EDITOR-54 had been naming the gap. Keyed on `cf-connecting-ip`, which Cloudflare's edge sets and a client cannot spoof; a missing address is let through rather than refused, because its absence means `wrangler dev` or a test rather than an attacker. Two tests, and **the first was proven by raising the limit to 100 and watching it redden** — a limit test that has never failed is a test that the endpoint answers. **It is deliberately not a quota**: it bounds one address, and does nothing about a thousand of them or about cost, which the comment says outright so the row cannot be read as more than it is.

  **axe now gates the assembled editor** (`e2e/specs/a11y.spec.ts`, eight states, the same ones the appearance suite captures — one list of states that matter is easier to keep honest than two). `packages/ui` has gated axe per component since 2026-08-07 and could see none of this. **It found three real defects on its first run**, filed as EDITOR-58 and held out of the gate rather than patched unreviewed: `nested-interactive` on ~250 skill cells (an interactive cell containing interactive children, so a screen reader cannot reach the inner controls), no `h1` anywhere, and a scrollable region no keyboard can reach. **Held out so the suite gates everything else from today** — left failing it would gate nothing and be ignored — with each line annotated as a pending fix, and `color-contrast` sitting in the same list as the thing it is not: a permanent ruling.

  **Two small ones with a bug between them.** `.dev.vars.example` exists now, because the real file is gitignored and a fresh clone had no way to learn the worker needs three values — it would start, then fail at the first sign-in. Writing it exposed that the `.dev.vars.*` rule added earlier the same day also swallowed the template; the `!.dev.vars.example` exception, and the comment that used to say an example file was deliberately not exempted, are both corrected. And Dependabot is configured for npm and github-actions, weekly and grouped, with minors and patches in one PR and majors on their own — **ungrouped daily updates on a monorepo this size open a queue nobody reads, and a queue nobody reads loses the security updates among the patch bumps**.

  **EDITOR-54 was revised rather than answered.** Its Turnstile requirement rested on "there is no auth, no rate limit and no quota in the worker" — and all three changed today. **Requiring sign-in for the composer is strictly stronger than Turnstile**, which proves a human was present once and says nothing about the hundredth request from the same one; sign-in gives a per-user identity to rate-limit and quota against. The gateway still earns its place for caching and analytics. The row now says to decide that before buying keys. Gates: worker 71 tests / lint / typecheck, editor 438 E2E / 454 unit / lint / typecheck, prettier clean.

- **The composer gets its model — EDITOR-54, Claude via the Hono worker** (2026-08-29). The producer behind the composer was a placeholder that set the string `No model is connected yet — nothing was sent and nothing changed.` and sent nothing anywhere; the component's own comment said Phase D would replace it, and this is that. `POST /compose` on the worker: a sentence in, **skill ids out, and almost nothing else** — no scope, no install mode, no agent placement, because `resolveAssignment` and `PRELOAD_DEFAULTS` already answer those and the CLI generates from the same rules, so a model with an opinion there would produce a configuration the CLI then contradicts. `claude-opus-5`, adaptive thinking at `effort: low` (a constrained selection from a list wholly in the prompt is not a problem to reason about), non-streaming, structured output through `zodOutputFormat`.

  **Verified against the real API rather than a stub, and this is the part worth keeping.** Three sentences: _"a react app with tailwind and vitest"_ returned exactly `web-framework-react, web-styling-tailwind, web-testing-vitest`; _"a hono api on cloudflare with drizzle and postgres"_ returned Hono, Cloudflare Workers, Drizzle and PostgreSQL; and **"I want to bake sourdough bread" returned an empty list** with the reason "the catalogue only covers software development skills" — the negative case, which is the one that says whether it invents. Zero hallucinated ids across all three. **The catalogue caches**: 8,227 cache-read tokens on the second and third calls against ~20 fresh input tokens, because the whole catalogue is the stable prefix and the sentence is the only thing that varies. That puts a call around half a cent.

  **Four boundaries the worker owns, all tested before the route existed.** Signed-in only — and that is the abuse control, which is why EDITOR-54's Turnstile requirement was re-derived the day before: every call spends real money, so what is worth having is an identity to rate-limit and quota against, where a CAPTCHA proves a human was present once and says nothing about their hundredth request. Ten calls a minute per USER (`COMPOSE_CALLS`), keyed by user rather than address because a person is the unit that gets billed for. A 600-character ceiling, because input tokens are billed and an unbounded prompt is an unbounded bill. And a blank sentence is refused **without reaching the model** — a blank prompt costing a token is the cheapest bug to have and the easiest never to notice. **The model's ids are not trusted either**: they are filtered against `CATALOG.skillsById` before the editor sees them, so a plausible near-miss is silently absent rather than a broken row.

  Editor side: `Apply` selects through **`toggleSkill`, the app's own verb** — the same call a click on a cell makes — so a proposal cannot reach a configuration a person could not have reached by hand, with the incompatibility rules, implied skills and exclusive-category swaps all running as they do for a click rather than being reimplemented for a second caller to get subtly wrong. An answer whose sentence has since been edited is dropped rather than drawn. **The existing composer specs went red and were right to**: they encoded "no model is connected", which stopped being true; they now assert the signed-out refusal, and the block's shape and zero-change footer claims survived unchanged, which is what says they were about the block rather than about the phase. The AI Gateway is supported and optional — `AI_GATEWAY_URL` empty means Anthropic directly, so the route works before one exists. Gates: worker 74 tests, editor 440 E2E / 454 unit, lint and typecheck clean both.

- **The design's palette moves one tier down, so a theme becomes possible at all** (2026-08-29). Step one of dark mode, and the half that needs no designer. The 57 design tokens were literal hexes inside `@theme inline` — and **that one word is why dark mode was not merely undesigned but unreachable**: `inline` substitutes a token's value into every utility it generates, so `bg-column` compiled to `background-color: #fdfdfc` and no `.dark` block could ever have re-pointed it. A dark palette would have had to be a second stylesheet rather than a second set of values. They now read `--color-column: var(--column)` with the hex in `:root`, which is the idiom the shadcn half of that same block has used all along; the design's own tokens simply match what they were sitting beside.

  **Found by measuring, not by reading.** A dump of all 88 `--color-*` names off a running page returned values for only 17 — the ones something referenced through `var()` somewhere — which is what a stylesheet whose tokens are baked into utilities looks like from the outside, and is not something the CSS reads as.

  **Behaviour-preserving, and proven rather than asserted**: what ten real elements paint — background, colour, border, outline — was captured before and after and diffed byte for byte. Identical. **And the claim the whole change exists for is now a test**: `design-tokens.spec.ts` redefines `--column` at the root and asserts the composer dock's painted background follows it. That test was proven by reverting the one token to its literal and watching it redden — before this change it could not have passed, which is the point.

  **There is deliberately no `.dark` block.** The palette is EDITOR-07 and has never been designed; inventing one would make the light-only holdout in `.storybook/preview.ts` look obsolete and let dark stories claim a coverage that does not exist. Three things recorded for whoever designs it: the `color-contrast` ruling does NOT transfer, because it was a ruling on measured ratios in one specific light palette; the visual baselines (76 Chromatic, 12 Argos) currently cover one theme and will need modes rather than a second full re-baseline; and the switch wants three states — light, dark and system — since the `dark` variant is `.dark *` and handles no system preference today. Gates: ui 95 tests, editor 440 E2E / 454 unit, visual 12, all clean.

- **The palette collapses to 42 colours and splits into core and semantic** (2026-08-29). Step two of dark mode. **Thirteen values removed**, chosen by CIEDE2000 ΔE below 2.3 — the just-noticeable difference for large flat areas — rather than by luminance, which says nothing about hue. **The grouping method mattered more than the threshold**: single-linkage let a chain of small steps merge colours obviously different at the ends (`#e4e0d4` swallowed eight values, ΔE 6.4 across the group), so it is complete-linkage — every pair inside a group clears the bar, not just neighbours. That one change is what stopped `--hairline` collapsing into `--band-ink`.

  **Three removals were found and reversed while executing, and they are the interesting part.** A perceptual merge cannot see what a hover state is FOR. `--cell-hover` would have become `--cell`, and `--track-hover` would have become `--track` — the two values are indistinguishable side by side, which is precisely the wrong test, because a hover is judged as a change over time on one element rather than as two patches next to each other. Merging them deletes the feedback, not a duplicate. **`--column` was the third**: it would have merged into `--page`, undoing an owner decision recorded on 2026-08-27 — the content column sits one point of luminance off the page on purpose, and that entry says outright that the difference is invisible by eye and unambiguous in `getComputedStyle`. All three are held out, detected by rule (a `-hover` token whose new value equals its own base) rather than spotted by reading. **Six more were never candidates**: any value used only by `--band-*` tokens is excluded outright, because those describe the one dark surface the system has designed and will take different values the day a theme lands.

  **Then the two tiers.** TIER 1 CORE holds all 42 colours named for what they are — `--warm-01` through `--warm-28`, `--amber-01` to `--amber-10`, four alphas — indexed by ramp position rather than on a 50–950 scale, because those imply a designed set of steps and this palette accreted. TIER 2 SEMANTIC holds all 87 names, each pointing at a core colour and holding no value. **The ratio is the point**: `#ffffff` answered to eight names, so darkening it meant finding all eight. **shadcn's names moved into tier 2 as well** — they were only ever separate because they arrived separately, and three of them (`secondary`, `muted`, `border`) were still being declared twice, the later literal silently winning over the new tier; caught because the verification checked all 87 rather than a sample. `--destructive` is the one colour no tier owns: shadcn's `oklch()` default, left out on the grounds that it is undesigned. **That was argued from a false premise** — it IS drawn, at `roster-panel.tsx` and `output-preview-dialog.tsx`, which is exactly what EDITOR-51 is about — and the consequence is worse than the tidiness it bought: being outside CORE, it is outside the dark set and outside the parity guard, so the editor's only error colour keeps its light value on a dark ground. Filed as part of EDITOR-51.

  **Verified exhaustively rather than by sampling**: every one of the 87 semantic tokens was read out of a running browser and compared to the core value it is meant to resolve to. Zero wrong. Four assertions across two specs went red for the right reason — they pinned hexes that no longer exist — and `design-tokens.spec.ts` gained the better test the tiers make possible: a semantic token must resolve to the same value as the core token it points at, which survives a re-cut of the ramp where a literal does not. **One casualty worth naming**: `--tree-border` was added weeks ago as one of five colours that "had no name", and its own comment justified being one hex digit from `--roster-band`; both are now `--warm-08`. The token survives, its separate value does not. Gates: ui 95, editor 442 E2E / 454 unit, lint and typecheck clean.

- **Terrazzo, and a dark theme for every token** (2026-08-29). The core palette is now `packages/ui/tokens/tokens.json` in DTCG, built to `src/styles/tokens.css` by Terrazzo. **Only the 42 core colours needed dark values — all 87 semantic names followed for free**, which is the tiering paying for itself the day after it landed. The dark ramp is the light one read backwards, with the three darkest warm steps and the brand amber pinned to the `--band-*` values the sticky filter bar had already proved on a dark ground; a first cut for the owner to iterate on, not a designed palette. Verified by setting `data-theme="dark"` in a real browser and reading what four elements paint.

  **The standing rule is enforced rather than remembered**: `scripts/check-token-parity.ts` fails when a core token has no `$extensions.mode.dark`, and it runs as part of `bun run test`. Proven by deleting one token's dark value and watching it fail. Terrazzo makes forgetting hard — both values sit on one token — but `mode.dark` is optional, and a token without one silently keeps its light value on a dark ground, which looks deliberate.

  **Three things the build fought.** Terrazzo 2 rejects hex strings and wants DTCG object colour (`colorSpace` + `components`), and its `mode` extension holds the colour object directly rather than a nested `$value`. Its CSS plugin emits `rgb(100% 100% 100%)`, which would make every hex-quoting comment in `globals.css` a translation exercise — the documented `transform` hook did not fire with any signature the docs describe, so `scripts/hexify-tokens.ts` rewrites the emitted file instead, which is deterministic and obvious when it breaks. And `@custom-variant dark` was still `.dark *` while the generated CSS switches on `[data-theme]` plus the media query; they now match, so a `dark:` utility and the token values cannot disagree about which theme is showing. **One flake fixed on the way**: the composer's two-route comparison read the block while it still said `Choosing skills…`, comparing a pending frame with a finished one — it waits for the settled text now. Gates: ui 95 + parity, editor 442 E2E, all clean.

- **The audit's sixteen follow-ups, and the twelve defects the follow-ups themselves had** (2026-08-29). Five file-disjoint lanes closed fifteen of sixteen — the sixteenth, a designed error colour, is EDITOR-51 and needs an eye rather than code. What the round is actually worth recording for is the second half: **an adversarial reviewer read every diff and found twelve real problems in work that had just gone green**, and the shape of them is the lesson. Two lanes answered the same question opposite ways — the composer ruled that "a round trip is a state the control is IN rather than an instant it passes through" and disabled Send, while the save path stayed live through TWO round trips, so a second click minted a second KV entry and a second row for one press. **File-disjoint lanes cannot disagree about a file; they can disagree about a principle**, and nothing in the partition catches that.

  **Three defects were introduced by the fixes.** An assertion that could not fail: `stubStackRefusal` was registered after `stubSignedIn`, and Playwright matches routes in REVERSE registration order, so the refusal handler shadowed the one filling the array the test then asserted was empty — it would have read empty either way. A live-region regression: the pending frame set `groups: []`, and the proposal header reads that as `no changes`, so every submit announced an answer through `role="status"` before anything had been asked and announced again when it arrived. And a `//db:generate` note claiming "The check is what CI runs" when nothing wired it to CI — now wired, into the check job beside the two existing regenerate-and-compare steps, because the point is to fail before the deploy applies schema that does not match the code.

  **Two fixes had no reader, which is the same defect one level up.** `AuthResult` was returned by `signIn`/`signOut` and discarded by the only caller — so the three refusal members, the mapping and the tests all existed while the person at the keyboard still saw a button that did nothing. The rail renders it now. And `FAKE_SECRETS` in `vitest.config.ts` was proved by a temporary file the lane deleted, so removing the constant reddened nothing; the permanent assertion is in `compose.test.ts` and was proved by changing the fake key and watching it fail. Without it the failure is invisible by construction — the suite would run against a developer's real `ANTHROPIC_API_KEY` from `.dev.vars`, bill a call the first time any test missed a stub, and stay green in CI where no such file exists.

  **Two things moved because of where they had to be imported from.** The 401 gate lived in `stacks.ts`, so `compose.ts` imported that module — and with it drizzle and the app schema — to get an auth wrapper for a route that reads no table; it is in `auth.ts` now. And `deleteStack` was deleted outright rather than kept: `DELETE /stacks/{id}` ships on the worker, nothing draws a control for it, and a client function with no caller is not a head start but an untested path the first person to wire a delete button will trust. `api/compose.ts` also gained the reporting the other three clients had — the one route that spends money per call was the one reporting nothing, with signed-out and rate-limited deliberately excluded as ordinary traffic.

  **What did not get done, and is filed rather than forgotten**: EDITOR-59 (applying an account stack still does not seat the catalogue its payload names, gated by an expected-failure spec), EDITOR-60 (a duplicate id in a proposal cancels itself), REPO-38 (axe audits crash under parallel load), REPO-39 (three real dependency defects knip found once its config could see them — `packages/compile` imports `remeda` and declares it nowhere), SERVER-05 (the authenticated half of `/stacks` is pinned by `tsc` alone). Gates: editor 466 E2E / 457 unit, server 75, ui 95, all 8 workspaces green.

- **EDITOR-51 settled — the editor has a designed error colour** (2026-08-29). Six candidates drawn on the two surfaces that actually paint `--destructive`, at their real sizes: the roster's scope mark at 12px stroked, and the preview dialog's error prose at 9.5px, each on both grounds. **The measurement is what reframed the row.** It had been filed as a hue problem — a red that does not belong in a warm palette — and the hue was never it: the palette's loudest colour is the brand amber at chroma 0.114, and shadcn's default sits at 0.239, **2.1× louder than anything else in the design**. That is why it read as somebody else's.

  Owner chose **candidate C, "one step louder"** — `#b94a40` light, `#e87c73` dark, chroma 0.145 and 41° from amber. One step above the accent rather than level with it, on the argument that an error is not a choice and may be the one thing allowed to outrank the colour that means "the user chose this". Every candidate was at least 36° from amber for that reason; amber could not be borrowed.

  **Drawing both surfaces together was the point rather than thoroughness.** They are opposite problems — 12px of stroked glyph disappears if the chroma is too low, a paragraph of prose shouts if it is too high — and EDITOR-51 had recorded exactly that, that a designer answering the row as first written would answer only half of what ships. Candidate E existed in the lab to show the failure: quieter than amber, and the mark is what fails first.

  It is in CORE now as `--red-01` with its dark complement, so the parity guard covers it (43 tokens) and the hand-written dark override in `globals.css` is gone along with the note explaining why no tier owned it. Declared in sRGB rather than oklch because Terrazzo round-trips oklch through another space and returns a different value — found when the earlier stopgap came back at `oklch(58.33% 0.2388 28.49)` from `0.577 0.245 27.325`. Verified in a browser in both themes. Gates: ui 95 + parity 43, editor green.

- **SERVER-02 — one client, and the coverage the second one was hiding** (2026-08-29). The editor reached the worker two ways: the older modules through the generated `hc<AppType>` client, the three signed-in ones through a hand-written `fetch` because `credentials: "include"` had not been configured on the client. It is one client now, `apps/editor/src/lib/api/client.ts`, stating the base URL and the session policy once. **A test asserting that every worker call carries `credentials: "include"` was written first and ran red on two of five rows** — `createSharedConfig` and `fetchSharedConfig` were both `same-origin`, which is to say the older half had the defect the newer half was written to avoid.

  **`packages/api` was NOT created, and the argument is the part worth keeping.** The row is titled after it, so this is a deviation. The evidence: the CLI does call the worker — `packages/cli/src/cli/lib/seed/fetch-seed.ts` does one `GET /configs/:id` — so the premise was not empty, but the drift a typed client removes is already removed for that call, because both sides validate against the same `@workspace/matrix/seed`. Against that, `packages/cli` publishes to npm and bundles private workspaces with tsup `noExternal`, so a shared client would put `hono/client` into the published bundle for one GET. A workspace for one browser consumer is overhead; the client lives in the editor.

  **`/api/auth/*` keeps a `fetch`, and that is the worker's decision rather than a leftover.** It is mounted with `app.on` outside the OpenAPI chain — describing Better Auth's dozen paths in `createRoute` would be transcribing somebody else's contract — so `AppType` does not describe it and `hc` never could have typed it. It is behind `authFetch` in the module that owns the base URL, which is as close to one client as the shape allows.

  **The mocks could not literally be merged and the brief said so wrongly.** `api-mocks` is MSW for the vitest suite; the Playwright suite uses `page.route` because MSW in a browser needs a service worker. Different runtimes. What was achievable was the fixtures, and the coverage underneath: `auth.ts`, `stacks.ts` and `compose.ts` had no unit tests at all, so every refusal path was proved by a browser round trip or not at all.

  **Three tests that could not fail were found by the review and are now `it.todo`.** All three sit in the worker suite, all three assert something about a request carrying no cookie, and all three pass because the 401 fires before the thing under test: the sentence-length guard, the empty-sentence guard, and — worst — "the GitHub token never leaves the worker", which compared `JSON.stringify(null)` against `/accessToken/i` and could never have matched whatever the worker did. That last one is the obligation the keep-the-token ruling carries, and it was being asserted by nothing. All three need a seeded session, which is SERVER-05.

  **And the build was red, which no CI job would have told you.** `check-web` does not run `build`; only `deploy` does, so a push would have gone green and then failed at the edge. First paint had reached exactly the 336 KB ceiling. The budget's own note asks whether the weight could be deferred before raising it, so that was tried and measured: moving the rail's account block behind `lazy()` put first paint UP by 0.3 KB, because the stack grid asks whether you are signed in in order to know which stacks to draw — the store is on the first-paint path from the grid whatever the nav rail does. Raised to 344 KB with that measurement and the same 8 KB headroom the previous raise left. Also declared `msw`, which four new test files had been resolving by hoisting. Gates: editor 466 E2E / 479 unit / build green, server 72 + 3 todo, all 8 workspaces green.

- **`packages/api` — one typed worker client, and what it cost** (2026-08-29). Owner ruling, overturning a lane's argument the day it was made: an earlier round declined to create the package because sharing it would put `hono/client` into the published CLI bundle for one GET, and the owner weighed that and decided the increase was small enough. **Measured rather than estimated, which is the point of recording it**: the CLI's published JS went 1,755,475 → 1,765,345 bytes, **+9,870 bytes, +0.562%**; the editor's first paint went up 85 bytes. Both numbers are re-derivable from commands written beside them rather than restated.

  The package owns the TRANSPORT and nothing else — `createApiClient({ baseUrl, headers?, credentials?, fetch? })` over `hc<AppType>`, plus `apiRequestInit` for the paths `AppType` does not describe. **Neither consumer's refusal copy moved into it**, deliberately: the editor's are union members a component renders, the CLI's are sentences a person reads in a terminal, and one of those is not a translation of the other.

  **`credentials` defaults to `"include"` and must be opted out of by name**, and the type is narrowed to `"include" | "omit"` rather than the platform's `RequestCredentials` — because `"same-origin"` is exactly the value that silently breaks a cross-origin session cookie, and leaving it reachable makes the failure a typo away. That was not theoretical: **`skill-index.ts` had built its own second `hc` client**, arguing that "two calls to `hc` are cheaper than a module every api file reaches through" — true about lines of code and wrong about what a client carries, since `GET /skills` was going out as `same-origin` while every other worker call carried the session. It uses the shared client now, and `grep -rn 'hc<AppType>' apps/editor/src` finds one.

  **A hazard in hono the package now encodes.** `hc` spreads its `init` option LAST over the request it built, so headers placed in `init` replace the whole `Headers` object — including the `Content-Type: application/json` it sets for a `$post({ json })`. Headers therefore go through hc's own merging option and `init` names `credentials` alone. Pinned by a test that reddens if the two are merged, and the two comments that overstated hc's call as `(fetch)(url, init)` now quote it exactly.

  **Three things a new workspace owed that nothing in `deps:check` asks for.** `check-shared-tsconfig.test.ts` compares an exhaustive workspace list with `toStrictEqual` precisely so an arriving workspace goes red rather than defaulting — it did, and that is the tripwire working. `dist-staleness.ts`'s `BUILD_INPUT_TREES` did not scan `packages/api/src`, so a `dist` built before an api change would have read as current; adding it immediately failed the CLI suite until a rebuild, which is the guard proving itself, and its fixture had to learn the new tree. And tsup's `noExternal` did not name the package: it was being inlined **incidentally**, and promoting it to `dependencies` would have silently externalised it and broken `init --from` in the published CLI — the exact failure the note beside that list already described for the other two.

  Gates, now including the CLI workspace which earlier rounds filtered out: 10/10 typecheck, 10/10 lint, 11/11 test, CLI 7,353 tests, editor 466 E2E / 493 unit / build green, `deps:check` green at 9/5/9.

- **The 2026-08-29 follow-up programme — ten rows closed, and the record of them written a day
  late** (2026-08-29). Everything the previous day's audits filed, done in one batch across seven
  lanes, each recertified by an agent that did not write it and that mutated source to prove the
  gate could actually go red. **EDITOR-59** — `seatCatalog` extracted to its own module and called
  from BOTH arms of `use-apply-stack-request.ts`, so a stack saved under a private marketplace is no
  longer silently pruned on another machine; `ui-store` gained `catalogueNotice` and
  `marketplaceRecovery` because neither existing channel was reachable from a path that is not an
  address change. **EDITOR-60** — `trustedIds` dedupes at the worker boundary, so a model that names
  one skill twice no longer produces a proposal reading "2 changes" that applies nothing.
  **SERVER-05** — the authenticated half of `/stacks` is pinned by a session seeded straight into D1
  through the test binding rather than by `tsc`, which also retired the three `it.todo`s that were
  waiting on it, including the one asserting the GitHub token never leaves the worker. **The 401
  shape** — `UNAUTHORIZED` is declared once in `auth.ts` and spread by five guarded routes, not the
  four the row named. **Dark baselines**, **REPO-38** (`a11y.spec.ts` is its own Playwright project
  at `workers: 1`), **REPO-39**, and the `db:generate` check wired into turbo and the pre-commit
  hook under the same `...[HEAD]` filter as lint and test.

  **EDITOR-58 closed two of its three and the third was found by probing rather than by reading.**
  `page-has-heading-one` and `nested-interactive` are fixed and each reddens `a11y.spec.ts` on
  reversion. `scrollable-region-focusable` is live: an audit with only `color-contrast` disabled
  fails on the **output-preview** state at node `.overflow-auto` — a property of a dialog rather
  than of the resting screen, which is why it outlived the other two and why the row now keeps
  exactly one clause. The `disableRules` list is down to two entries.

  **The one mock of the worker is now genuinely one.** `packages/api-mocks` was already shared by
  the editor's vitest suite and its Playwright suite through `answerFor`, and that seam is
  adversarially proved — inverting the CORS guard inside it reddens two named Playwright tests. What
  was not true was the "everywhere": six raw `page.route` calls still sat in specs, winning only
  because Playwright matches newest-first, and twenty-nine handlers were declared outside the
  package. All six are converted and the duplicates moved: `grep -rn 'page.route(' apps/editor/e2e/specs
| wc -l` → **0**. A dead connection is now expressed as `HttpResponse.error()` and turned into
  `route.abort("failed")` by the one bridge, rather than by a second convention. Twenty-three
  handlers remain outside and each is a request-capturing spy or a deliberately malformed body,
  which belong beside the test that asserts them — the shared package is not a dumping ground.
  **Two raw routes are permanent and now say so**: the per-origin interception itself (msw/node
  patches a process, Playwright drives a real browser, so something must catch the request), and the
  third-party guard, which must stay the OLDEST route or "you forgot a stub" stops being reportable.
  Moving the fixtures also fixed three things nobody was looking for: the e2e and unit copies of the
  502 compose refusal disagreed about whether it carries a body, the 503 store refusal was bodiless
  in e2e and carried the worker's real text in unit, and `BIGCO_CATALOG` was a cast where every
  sibling fixture is a `matrixSchema.parse`.

  **This entry is the programme's own largest correction, and it is about the orchestrator rather
  than the lanes.** All ten had landed before one line of the progress file existed. Six rows were
  still sitting in their trackers, no archive line recorded any of it, and the entry four above this
  one positively asserts that five of these ten are "what did not get done" — true when written,
  false within the day, and the only record a fresh session would have found. **Step 6 was skipped
  ten times out of ten.** CLAUDE.md says a finished task still in a tracker is indistinguishable
  from an unstarted one; this is what that looks like at scale, and it was surfaced by the owner
  asking whether the findings had been acted on rather than by any check.

  **Two things learned that outlive these rows.** A dependency fix cannot be gated by
  `deps:check` — deleting `remeda` from `packages/compile/package.json` leaves the gate fully green,
  because knip reads the manifest it is checking. And two verification lanes doing mutate-run-restore
  on one working tree caught each other mid-mutation: `playwright.config.ts` was briefly observed
  with its `workers: 1` cap missing while the comment above it described that exact state as the
  REPO-38 reproduction. Both restored correctly and the lane proved its own results uncontaminated
  by md5 rather than by diffstat, but the rule is earned: **a lane that mutates source to prove a
  test can fail must own its files exclusively, or run in a worktree.**

  **What this pass FOUND and filed rather than fixed**: EDITOR-61 (a ruled-out cell exposes its •••
  and both badges as enabled buttons that do nothing), EDITOR-62 (the proposal footer says "1
  changes" — unreachable until EDITOR-54 wired the model, and held shut only by a comment saying it
  was unreachable), EDITOR-63 (two literals standing where imports belong), REPO-40 (`api-mocks`
  reaches one workspace out of ten; `apps/server` and `packages/cli` each re-implement `/configs`,
  the second one three times over). Gates: 12/12 turbo tasks green — typecheck, lint, 218 test
  files, `deps:check` — editor 470 E2E / 493 unit + 1 expected fail, `packages/api-mocks` 7.

- **`packages/ui/CLAUDE.md` joins the repository it was written for** (2026-08-29, owner ruling).
  REPO-41, filed and closed the same day. The file is 12,324 bytes of authored design-system
  guidance — the focus-treatment rule, the semantics rule, the flex-basis rule, the `LatticeCell`
  division of affordance — and `git check-ignore -v` put it at `.gitignore:96`, the blanket
  `CLAUDE.md` rule. It had never been tracked, so **it existed on one machine for the whole of its
  life and no clone had any of it.** `!packages/ui/CLAUDE.md` now sits beside the other four
  exceptions. **Nothing failed, and that is the finding.** A doc nobody else can read does not break
  a build, redden a gate or trip a checker — it is simply not there, and the only reason this one
  surfaced is that two of the ten doc corrections made earlier the same day landed in it and an
  audit noticed they would not survive a clone. The un-ignore comment now says so, and says the rule
  it earns: a new workspace `CLAUDE.md` needs a line there on the day it is written, because the
  cost of forgetting is invisible. Census for the next time: `for f in $(find . -name CLAUDE.md -not
-path './node_modules/*'); do git check-ignore -q "$f" && echo "IGNORED $f"; done` — it now
  returns nothing.

- **One description of the worker, and the no-op it was hiding** (2026-08-30). The owner asked for
  the official binding and for every network mock to live in one package. `@msw/playwright` 0.6.7
  replaces the hand-rolled Playwright bridge — `grep -rn '\.route(' apps/editor/e2e` returns **0**,
  and the binding's own `onUnhandledRequest` replaces the hand-written third-party guard, so the
  Playwright suite is now configured identically to the Vitest one. `packages/cli` joined through
  `msw/node` for its unit suite and, for its e2e suite, through a real `node:http` server that
  resolves the same handlers via new `workerRequestFrom` + `answerFor` exports — **the CLI e2e
  spawns the binary as a subprocess, so nothing in-process can intercept it, and injecting
  `NODE_OPTIONS` into the child was ruled out rather than overlooked**: the suite deliberately hands
  a spawned `bin/run.js` a user's environment, and mocking the network away is the opposite of what
  an e2e that spawns a binary is for. `packages/api-mocks` gained `seedPayload()`,
  `defaultHandlers`, and `entry-points.test.ts`, which makes `msw` unloadable and asserts
  `./fixtures` still resolves — the msw-free entry point is now HELD rather than described.

  **The largest correction is one this session made against itself.** Twice it was stated, from the
  MSW docs and from `apps/server/vitest.config.ts`'s own comment, that msw cannot run in workerd and
  that `apps/server` could therefore only ever share fixtures. **It runs.** A probe inside the pool —
  `setupServer` + `server.listen` + a `fetch` returning the mocked body, with
  `typeof WebSocketPair === "function"` in the same file proving the runtime is genuinely workerd —
  passed, and was re-run independently before being believed. The lane that found it had been briefed
  on the false constraint, disproved it, and REPORTED that rather than acting outside its scope,
  which is the corrections field earning its place.

  **The migration introduced a defect that three lanes missed and a green suite could never show.**
  `stubWith` filtered against `network.listHandlers()`, which msw seeds with the fixture's INITIAL
  handlers; `fixtures.ts` seeds `authHandlers`, `stubSignedOut` passes those same instances, so the
  filter reduced them to an empty array and `use()` returned early. **`stubSignedOut` was a total
  no-op**, and its five call sites were passing on the fixture's signed-out default rather than on
  the helper they name. Fixed by filtering against the module's own record of what it installed —
  the baseline is precisely what `use()` exists to override, so it must never count as already
  installed. Proved load-bearing in both directions, with controls on each side: under the old
  filter only the new test fails and both controls pass; under the fix all three pass and
  `scope-reach.spec.ts`'s five — the tests the filter exists for — stay green. **The generalisable
  lesson is the verifier's**: all three lanes proved their guarantees by breaking something and
  watching a test go red, which is the right instrument and is why their claims held; none probed
  the opposite direction, whether a helper that should install something can silently install
  nothing. **A guard whose failure mode is silence needs a test that the guard fired.**

  Gates: 12/12 turbo tasks — typecheck, lint, `deps:check`, server 88, CLI 218 files / 7,353 tests,
  editor 493 unit + 1 expected fail — and **editor E2E 471**, the pre-work 470 plus the regression
  test. REPO-40 narrowed rather than closed: 34 handlers in 15 files remain outside the package and
  most should, being request-capturing spies; `crawl.test.ts`'s GitHub fake is the one worth moving,
  and `STORE_REFUSED_BODY` can still drift silently because the worker's 503 path has no test at all.

- **CLI-846 — the four meta sub-agents join the default assignment system** (2026-08-30, owner ruling). They were reachable by **nothing**: `metaSkillReach` admits an agent only when a `PRELOAD_DEFAULTS` row names its flavor or the skill is one of its craft categories, no row in the 140-row table named `meta`, and `CRAFT_CATEGORIES_BY_FLAVOR` had keys for `planning` and `reviewer` alone — so four of eighteen agents sat outside the defaults entirely and no pick could reach `agent-summoner`, `codex-keeper`, `convention-keeper` or `skill-summoner`. **Nothing was failing**, which is why it survived: the editor drew their column, the resolver returned no targets for it, and a grid with nothing lit reads as a grid nobody has filled in yet. Three edits close it — the `meta` flavor gains the design and methodology crafts, a `shared` skill returns the whole `ROSTER` rather than a non-meta subset (`NON_META_ROSTER` is deleted), and two rows gain `"meta"`. Reach re-derived rather than asserted: `shared-security-auth-security` 18 agents with the four lazy, both craft skills 9 agents with the four preloaded, `meta-reviewing-web-reviewing` and `meta-planning-web-planning` 1 each and neither reaching them — a diff checklist and a spec playbook are one role's material. **The owner ruled reading (a)** on the one ambiguity: "all skills to Admin and Meta" means the admin-tier and meta-tier skills, so core skills stay domain-scoped and the standing no-broadcast ruling survives. Detail in [`plans/CLI-846-default-assignment-model.md`](./plans/CLI-846-default-assignment-model.md). **The test that had pinned the defect is the find**: `never assigns a meta-flavor agent, whatever the skill` looped every catalog id to assert the exclusion, so the gap was not merely uncaught — it was held in place by a green assertion in both surfaces' suites. Twelve further assertions across three packages encoded the same exclusion and were rewritten to the rule that now holds. Gates: 24/24 turbo tasks, matrix 338, CLI 6700 unit, editor 494. Hand-verified against the SHIPPED bundle, which the src-only suites cannot see. **Proposal corrected on the way**: it listed `meta-config-stack-detect` as a meta-tier skill reaching nobody; it is catalogued `domain=shared, category=shared-tooling` and already reached fourteen agents. And a claimed tester-preload inversion was checked and withdrawn — all 38 tester rows hold, but the search that checked them found no `api-testing-*`, `cli-testing-*` or `ai-testing-*` in the catalog at all, so three of four testers have no test library to carry (SKILLS-10).

- **The journey register covers both front doors** (2026-08-30, owner ruling). `user-journeys.md` had said it
  "governs `packages/cli/e2e/` and nothing else" since it was written, and every one of its 48 rows carried a CLI leg —
  so the accounts, saved-stack, composer and chrome work that landed after 0.161.0 registered **nowhere**, because work
  that adds no CLI surface adds no CLI spec. The owner ruled the page covers both surfaces "as they work together and
  flows go to and from". Three rows added: **49** the account arc (sign in, save under a name, apply from any browser),
  **50** the composer (a sentence becomes a proposal, and nothing changes until it is applied), **51** the surface both
  are used on (sticky filter bar, folding stack grid). 49 and 50 are `TO TEST` on the CLI leg and the leg is the
  CROSSING rather than either end — a saved stack is a name and a pointer, the bytes sitting in KV under the id
  `POST /configs` minted, which is the id a share link carries and `init --from` resolves, so nothing new crosses the
  wire and no run anywhere carries an account-minted or model-proposed id into the binary. 51 takes a new marker,
  `COVERED, browser-side`, kept distinct from `TO TEST` because no run of the binary is owed. **The gate found a defect
  in the first draft**: `none` was written backticked in the From-scratch column, which `journey-page.ts` classifies as
  a named spec — journey 38's unbackticked `none; …` is the form, and `spec-gates.test.ts` failed until it matched.
  What the same commits changed and did NOT earn a row is recorded on the page as well, so nobody re-derives it:
  `feat(www)`, `feat(ui)` and `feat(api)` — the last a change of transport under journeys 23, 29 and 30, whose specs
  were unmodified by it. Gates: 16 spec-gates, 12 journey-page parser tests, prettier clean.

- **The marketplace ref crossing is held, and the hand-run can reach plugin mode** (2026-08-30). Three things, all
  found by actually running the journeys rather than the suites. **(1) The hand-run could not run journeys 5 / 17 at
  all.** `createE2EPluginSource()` with no options RETURNS the shared frozen fixture rather than building one — that is
  the whole point of it, and why 51 call sites stopped paying ~1.65s each — but only `e2e/global-setup.ts` builds that
  fixture and nothing outside vitest runs a `globalSetup`. So `node scripts/handrun.mjs` reached for a directory nobody
  had built and died on `Path does not exist: <tmp>/agents-inc-e2e-shared-fixtures/fixture`. **The failure was invisible
  in the shape that matters**: `attempt` catches it, prints COULD NOT RUN and the run still exits 0, so a hand-run
  reporting a clean sweep had silently never exercised plugin mode — the one install mode no other journey touches.
  `handrun-journeys.ts` now builds the two fixtures with the same two calls in the same order as `global-setup.ts` and
  removes them after. Hand-run before: 25 sections, 153 HOLDS, 1 COULD NOT RUN. After: 25 sections, **163 HOLDS, 0
  BROKE, 0 COULD NOT RUN**, journeys 5 / 17 registering against the real `claude` binary and holding all four surfaces.
  **(2) The canonical shared payload had EDITOR-49 in it again.** `MARKETPLACE_PAYLOAD` was built from
  `MARKETPLACE_REF` — the bare `acme/skills` the DIALOG accepts — rather than `MARKETPLACE_CANONICAL_REF`, the
  `github:acme/skills` the editor's marketplace store holds and mints. The CLI routes a ref on its protocol, so a bare
  one is a LOCAL DIRECTORY and a receiver looks for `<cwd>/acme/skills`, failing in the worst way available: by
  resolving to something rather than to nothing. **Nothing could see it** — `seedPayloadSchema` types `marketplace` as
  a string because all three spellings are legal, the editor's specs never install, and the CLI's own e2e specs build
  payloads with an absolute local directory, a legal ref taking the local branch. `marketplace-ref-crossing.test.ts`
  holds it now by asking the CLI's own router, `isLocalSource`, what the minted ref is — no browser, no PTY, no
  network, because the two forms differ precisely by which branch a receiver takes. It went red on three of four
  assertions before the fixture was repointed. **(3) Journeys 49 and 50 were overstating their own gap**, marked
  `TO TEST` on a CLI leg that is journey 27's single crossing rather than one hole per producer; both are now
  `COVERED, browser-side` and the marker's definition widened to cover a row whose CLI surface is another row's
  subject. **A full browser-to-binary run is deliberately still not owed**: one shared schema, one shared description
  of the worker in `@workspace/api-mocks`, and the router now asserted over the minted value say between them what such
  a run would say, for none of the harness. Gates: 7 workspaces green, CLI unit 7357, 102 editor Playwright specs over
  every fixture-reading suite, spec-gates 16.
- **2026-08-30 — EDITOR-09, Phase F** (editor.md; detail in
  [`plans/editor-v6/README.md`](./plans/editor-v6/README.md)) — the 2026-08-30 refresh of
  `.claude-design/`, all five owner-named changes, in one session with no dispatch. **Sign-in moved
  up the rail** out of the footer to under the nav words, borderless with a 70%-width rule above it
  and a hover-and-focus swap to `SIGN OUT`; **the theme toggle exists** as one glyph beside the
  GitHub mark, storing three states so `system` keeps following the machine, and it really repaints —
  the design says it "tracks state only" because ITS dark palette does not exist and this
  repository's does; **the domain titles are tabs**, every one on a strip under the search band with
  the current one in 25px Inter, clicking to filter and clicking again to release, and following the
  page when nothing is picked — which deleted the in-column sticky header outright, because a title
  cannot both arrive under the bar and always be on screen; **the filters left the search field**,
  domain chips gone entirely and `selected` plus a new `N skills selected ✕` at the strip's far end,
  keeping their resting treatment while the band above them goes dark; and **the composer was
  redrawn** — starter chips removed (a REVERSAL of Phase C, which had shipped them four days
  earlier), the hint out of the control row and into the accessible description alone, a rewritten
  placeholder, and the proposal notched into the grid as a full-bleed row with an Inter summary,
  `Skills · N added` and four columns. One core colour added, `green-01`, which the design's palette
  table introduces for the signed-in dot and nothing else. **Two corrections, both worth the space:**
  the plan file's own ruling 2 had been reversed by the refresh it was meant to describe, and the
  proposal's full-bleed margin bled twice because the dock it sits in already bleeds — 1234px against
  the band's 1102px, caught by a geometry assertion rather than by eye. Gates: 489 editor Playwright
  specs including every a11y audit, editor unit 495, repo-wide lint, typecheck and tests green, and
  a hand-run in a browser in both themes.

- **2026-08-31 — WWW-14** (www.md, new, found by the owner) — **clicking any link reflowed the whole
  page, and every gate was green.** Root cause is one header: Cloudflare's static-asset server sends
  `cache-control: public, max-age=0, must-revalidate` on EVERYTHING it has not been told otherwise
  about, content-hashed `/_astro/*` included. `prefetch: false` and no client router mean every
  navigation here is a full document load, so a browser revalidated all four webfonts on every click
  — measured as four 304s of 300 B each — and `font-display: swap` painted the fallback until they
  came back. The fallback is **25% narrower than IBM Plex Mono** (520px vs 416px on one probe
  string), which this design puts on the header nav, the buttons, the labels and every code block,
  so what the owner saw as a font flash was the page reflowing. Fixed with `public/_headers`
  (`/_astro/*` immutable for a year — safe because a changed file is a changed hash is a different
  URL; HTML deliberately keeps the revalidating default) plus preloads for the four latin subsets
  actually used, whose URLs are **imported rather than written** because Vite content-hashes them and
  a preload naming a file that is not served fails silently. Starlight's `Head` is overridden to
  place them first; `head:` in astro.config.ts could not be used, since that file runs before Vite has
  hashed anything. **The check was written first and was wrong first**: it counted Playwright
  `request` events, which fire for cache hits too, so it failed a fixed site — it now reads
  `transferSize` from the Resource Timing API, which is the only thing here that can tell a cache hit
  from a 304. `scripts/check-webfont-delivery.ts` is the fourth entry in this workspace's `test`
  script, proven in both directions: green with `public/_headers`, and back to naming all four files
  with it moved away.
- **2026-08-31 — WWW-15** (www.md, new, found by the owner) — **two of the four ways into this
  product were undocumented and the site told neither.** `meta-config-stack-detect` appeared nowhere
  in `apps/www/src` at all, and the composer had exactly one mention across the whole site — a
  subordinate clause in a paragraph about accounts on `editor/index.md`. What existed was the
  greenfield story only: open the editor, click a stack. Three pages added — `docs/ways-in.md`
  ("Four ways in", the router, placed between `why` and `quickstart` because "which door" is the
  question between "should I" and "walk me through one"), `guides/adding-to-an-existing-project.md`
  (the detection route end to end, including that the skill is a **Claude Code plugin** and so
  installs on a machine with no Agents Inc on it, which is the chicken-and-egg the owner asked
  about), and `editor/composer.md`. The owner's two rulings are the spine of all three: **stack
  detection is the easiest route into an existing codebase, the composer the easiest from scratch.**
  Six existing pages point at them — the docs hub, quickstart, `cli-or-web`, `editor/index`,
  `capabilities` (two new rows plus the `share --stdin` row now naming the producer it exists for),
  and the editor group's sidebar orders shifted to seat the composer at 3. 39 pages → 42, no build
  warnings, all 42 internal `/docs` links resolve.

- **2026-09-01 — REPO-41, the token half** (repo.md, new same day, narrowed rather than deleted) —
  **CI had deployed nothing for a week and said nothing about it.** `b97e3be4` (2026-08-30) added
  `wrangler d1 migrations apply` to the deploy job; the Actions `CLOUDFLARE_API_TOKEN` predated the
  D1 database entirely (created 2026-08-04, database added 2026-08-28) and returned
  `[code: 7403] The given account is not valid or is not authorized to access this service`. The
  step runs under `shell: bash -e` and sits BEFORE `bun run deploy`, so editor, site and worker all
  stopped shipping while `check-web`, `check-cli`, `visual-editor` and `visual-ui` stayed green on
  every run. **Diagnosed by elimination rather than by guessing at scopes**: the same token was
  proven to hold Workers KV Edit (build-skill-index.yml ran `kv key put` successfully that same
  morning) and Workers Scripts Edit (deploys worked through 2026-08-25), which left D1 alone, and
  ruled out account mis-scoping. `wrangler d1 migrations list --remote` reported **no migrations to
  apply**, so the step that blocked three pushes was a no-op failing on a permission check. Owner
  added D1 Write and, in the same visit, Workers Routes Write across all zones — the latter needed
  by WWW-03 and never once exercised, since the editor had only ever had a Custom Domain. Rerun of
  the failed job alone: **49 seconds, green**, and all three Workers deployed at 14:24 — 60 commits
  and two releases (0.160.0, 0.161.0) that had been sitting undeployed since 2026-08-25. Smoke-
  tested rather than assumed: apex still the editor, www Worker serving the new landing build, and
  `api.agentsinc.sh` answering a miss with a clean 404, which is the evidence the D1-backed worker
  booted with its bindings. **The row survives, narrowed**, because the fix was a token scope
  outside this repository and the thing that let it run for a week — no signal when a deploy fails
  under green checks — is untouched.

- **2026-09-01 — EDITOR-64** (editor.md, new and closed the same day, found by the owner) — **the
  grid's search and its domain tabs intersected, so a query silently hid every match outside the
  picked domain.** Reported as "i dont see the stack detect skill":
  `meta-config-stack-detect` sits in `shared` because domain comes from the CATEGORY
  (`shared-tooling`) and never from the id prefix, so a reader hunting a `meta-` skill was on the
  wrong tab and the search agreed with them. `selectDomainViews` filtered domains by the pick first
  and only then matched skills inside whatever survived. **The failure mode is the point**: an empty
  result reads as "no such skill", never as "not on this tab", so the catalogue looked like it was
  missing something it has. Fixed by having a non-empty query outrank the pick rather than compound
  with it — `searchesWholeCatalog` in `derive.ts`. **Nothing is lost by the override**: the pick is
  not cleared, so emptying the query returns the reader to their tab, and the strip's highlight
  needed no work because `filter-bar.tsx` already falls through to the scrolled domain when no pick
  is in force. Two specs, both watched failing first — one stating the property over any two
  domains, one naming the reported skill, which failed with `expected [] to include
'meta-config-stack-detect'`. Hand-run in a browser at `?domain=web&q=stack+detect` (visible) and
  `?domain=web` (correctly gone). `concepts/skills.mdx` moved with it: it had documented the
  intersecting behaviour accurately, which made it a true sentence that predicted the wrong
  experience. Gates: editor 496 unit + 476 e2e, typecheck and lint clean.

- **2026-09-01 — the `share --stdin` 400** (found by the owner on a second machine, root-caused and
  closed the same day; no tracker row ever existed, so this line is the only record) — **the CLI and
  the store validated a share against DIFFERENT schemas, and the CLI held the lenient one.** The
  worker validates `POST /configs` with `installableSeedPayloadSchema` and `GET /configs/:id` with
  the base `seedPayloadSchema` — write strict, read lenient, deliberately, so links already in the
  wild stay repairable in the editor. `read-piped-payload.ts` gated with the BASE schema, so the one
  rule the two differ by — a project-scoped skill assigned to a sub-agent resting at global has
  nowhere to be written — was the single payload that passed locally and failed at the edge, as a
  bare `HTTP 400`. **`--stdin` was the odd one out rather than the lenient-by-design one**:
  `config-to-seed.ts` had always minted with the strict schema, so a bare `share` and `edit --ui`
  were already strict. **The producer made it certain rather than occasional.**
  `meta-config-stack-detect`'s `SKILL.md` documented the agent-scope default INVERTED — "Absent
  means project" where `seedAgentScope` falls back to `DEFAULT_SELECTION_OPTIONS.scope`, which is
  `global` — and, on the strength of that, instructed emitting `scope: "project"` for every skill
  while keeping `agents` sparse. The two errors are SELF-CONSISTENT, which is why they survived
  review: if agents did default to project, project skills on project agents would be perfectly
  writable. Both worked examples the skill ships were verified to 400 as written and to 201 with the
  one field changed. **The `npx` in the report was a red herring**, chased first and eliminated by
  reproducing the exact command with a cold cache and no `--yes`: npx warns rather than prompts when
  stdin is a pipe. Fixed in four places — the skill emits `global` and its comment names the real
  default (`agents-inc/skills`); the local gate reads `installableSeedPayloadSchema`, which makes
  `read-piped-payload.ts`'s own promise that everything failing locally fails before a write true
  rather than nearly true; `publish-seed.ts` now quotes the store's own sentence beside the status,
  where it had rendered `HTTP ${status}` and binned a body that named the skill and the sub-agent;
  and the refusal is bounded — 2742 characters over 41 lines for 15 pairs became 781 over 11, by
  COUNT rather than by character, because a character cut over a joined list leaves a half-named
  sub-agent that reads as a real name and cannot say how many were elided. **Three assertions in
  this area were green on the defect and are now mutation-verified**: an e2e refusal with no
  same-file control (a gate that swallowed its whole domain left all six specs passing),
  `toContain("web-developer")` satisfied by the Zod PATH rather than the message, and a comment
  claiming three siblings where one exists. **Reviewer's verdict on the load-bearing question** —
  the strict gate over-refuses nothing: one production caller, write-only, and every read/repair
  path still on the base schema. **Two rows survived it at the time, and both have since landed — see their own entries below**: CLI-848 (`fetch-seed.ts`, the only sibling
  of the discarded-body class) and CLI-849 (the test doubles answer every POST 201, which is what
  let the divergence ship). Findings: two, both indexed. Gates: 219 files / 7366 tests, three `tsc`
  projects, lint, prettier, the `.ai-docs` guards 424 tests.

- **2026-09-01 — `meta-config-stack-detect`'s scope default** (skills.md, never filed; diffs land in
  `agents-inc/skills`) — the skill's `SKILL.md` said `// Absent means "project"` for a sub-agent's
  scope where the wire default is `global`, and instructed emitting `"plugin"` and `"project"`
  "consistently … as defaults the user can flip". `"plugin"` IS the product default;
  `"project"` is not, and it is precisely the value that makes every assignment to an unlisted
  sub-agent unwritable. Now emits `"global"`, the comment names the real default, and a new rule
  spells out what a run must do if it genuinely wants project-scoped installs — pin every assigned
  sub-agent with `{ "scope": "project" }`, the one case worth spending an `agents` entry on. Both
  worked examples corrected (19 occurrences) and verified 400 → 201 against the real worker; `dist/`
  regenerated through the local CLI, since it is tracked and carried a stale copy. Gates: 238 skills
  validate, prettier clean.

- **2026-09-01 — every compiled sub-agent was ordered to use a tool it had never been granted**
  (cli.md, CLI-837 — filed before this session and found again by the owner asking why the Skill tool was disabled; the row named the defect AND its fix, and neither the dispatch nor I looked for it) —
  `agent.liquid` emits a Skill Activation Protocol whenever an agent carries dynamic skills,
  telling it that it **"MUST invoke the Skill tool IMMEDIATELY"** and listing an `Invoke:` line per
  skill, while the same template wrote `tools:` straight from `metadata.yaml` — and **not one of
  the 18 definitions named `Skill`**. Four sub-agents hit this in a single session and each
  reported it as an environment quirk; it was shipped behaviour, and one process step
  (`meta-design-expressive-typescript`, step 3) went unperformed across several tasks because of
  it. **The non-obvious fact that let it survive**: a `tools:` key is an ALLOWLIST — omitting it
  inherits everything including `Skill`, so ENUMERATING is what opts an agent out — and declaring
  `skills:` preloads content without granting the tool, so all 18 definitions read as skill-aware
  while none could invoke a skill. Both confirmed against the official Claude Code docs and by
  experiment: a sub-agent with `Tools: *` invoked `Skill` successfully in the same session the
  compiled ones were refused. **Fixed in the RENDERER, not the 18 metadata files** — `SKILL_TOOL`
  and `withSkillTool` in `packages/compile/src/agent-source.ts`, applied in
  `buildAgentTemplateContext`, the single assembly point every render passes through, so a
  user-authored agent gets the grant on the same terms as a shipped one. Unconditional (an earlier
  conditional-on-dynamic-skills rule was withdrawn: skills are the product's atom and an agent that
  cannot invoke one cannot use what a user adds later), idempotent, and order-stable —
  `codex-keeper` keeps its unusual `Glob, Grep` order. The four read-only researchers receive it
  too; `Skill` loads instructions and grants no write access. Verified by a real compile against an
  ISOLATED staged installation rather than the live tree — the implementing agent refused to run
  `compile` against `$HOME` with unverified output, which would have rewritten 13 global agents
  mid-session — then run for real: 13 rewritten, second pass `0 rewritten, 13 unchanged` with an
  empty `diff -r`. The preloaded-only case was forced separately and holds. **Confirmed end to end, after one
  false alarm worth recording.** The first live check reported `v0.160.0` against `v0.161.1` on
  disk and was refused the tool, which looked like definitions being snapshotted at session start —
  a conclusion stated confidently and wrongly. A later agent of a different type, dispatched from
  the same session after the same recompile, HAD the tool and used it; re-running the identical
  check then returned `v0.161.1`, `tools: Read, Write, Edit, Bash, Skill`, and a skill loaded
  successfully. Definitions refresh within a session; the first failure was a stale dispatch, not a
  structural limit. **The lesson is the shape of the evidence rather than the answer**: one negative
  result was generalised into a mechanism, and it took a contradicting positive from an unrelated
  lane to catch it. `Grep` and `Glob` remain absent from every sub-agent whatever the frontmatter
  says — this harness does not provide them, so the compiled `tools:` line names them optimistically
  and they are dropped in silence. Gates: `packages/compile` 55 tests, CLI 219
  files / 7366 tests, root `turbo lint typecheck test --force` 25/25, `generate:compile:check`
  clean. One finding, indexed.

- **2026-09-01 — WWW-16** (www.md, filed and closed the same day) — **thirty references across
  twenty-one documentation pages went stale when the editor moved off the apex, and every gate
  stayed green.** `check-cli-claims.ts` binds the command roster and every flag to the CLI's source
  in both directions and says nothing about URLs, so nothing could see it — and the defect does not
  404: a reference that drops the `/editor` path serves the LANDING PAGE, so it fails as a reader's
  confusion, and confusion has no exit code. Closed by `apps/www/scripts/check-editor-address.ts`,
  fourth in the workspace's `test` script by measured cost (0.13s against check-cli-claims' 0.17s).
  **Everything is derived through the TypeScript AST, nothing transcribed**: `EDITOR_URL` and the
  literal span of `editorConfigUrl` are read out of `packages/cli/src/cli/consts.ts`, so the
  expected share-link shape — including the real slash before `?` — comes from the function that
  builds it. Four claims: the two constants agree; every address on this site's own host is the
  editor's; every share link is the shape `editorConfigUrl` builds; every link whose TEXT names the
  host writes the full address and targets it. **Made to fail before it was trusted**: 49 offences
  against the pre-split tree reconstructed from `afc4a26d^`, plus the trimmed-slash case (invisible
  to the address claim, caught by the share-link claim), plus a constant moved in the CLI only, plus
  every refusal path. Re-proved after the expressive-TypeScript pass so the refactor could not have
  disarmed it. **The turbo cache would otherwise have defeated it entirely** — `www#test` hashed 81
  inputs and `consts.ts` was not one, so a CLI-only commit moving the address would have replayed
  from cache and reported clean; declaring the input took it to 82 and moved the hash, and turbo
  hashes the file's CONTENT, verified byte-identical to `git hash-object`. **What it cannot see is
  written at the head of the script rather than left to be discovered**: a host used as a NAME
  rather than an address (`the agentsinc.sh store` is right, `opens it at agentsinc.sh` is wrong —
  same bytes, only English separates them), measured at 5 of the pre-split references. One false
  positive was found and removed before wiring in. **Correction to the row itself**: it said the
  share-link shape was hand-written in "six places"; measured, it is 9 address-shaped spots across
  5 files.

- **2026-09-01 — EDITOR-65** (editor.md, filed and closed the same day; **withdrawn by owner ruling
  rather than implemented**) — while a query outranks the domain pick, the picked chip still renders
  as active because `filter-bar.tsx` reads `search.domain ?? scrolledDomain ?? tabs[0]` and the pick
  survives, so the `??` short-circuits: the strip and the grid disagree on screen. **Owner ruled
  2026-09-01: leave it as-is.** The alternatives were dimming the chip while outranked (a new visual
  state) or clearing the pick on a query (which loses the tab the current behaviour deliberately
  preserves). **A future pass must not "fix" this** — the inconsistency is known, weighed and
  accepted, and EDITOR-64's docblock in `derive.ts` records it beside the code rather than leaving a
  reader to rediscover it. Recorded here because the archive is the only record the question was
  ever asked.

- **2026-09-01 — CLI-851** (cli.md, filed and closed the same day) — **the editor was a write client
  gating on the READ schema, and the row plus my brief were wrong about almost every particular
  except that.** What held: a payload the worker refuses reached the worker. What did not: the row
  said ONE write client, and `toSeedPayload` has five callers of which **four POST** —
  `use-share-link` (Share), `use-install-command` (install dialog), `roster-panel`'s signed-in Save
  and `account-store`'s `adoptLocalStack` on first sign-in — **the last two entirely ungated**, and
  `adoptLocalStack` is fed the local slot, the one payload EDITOR-08 deliberately permits to be
  unwritable. The row also called the Share button's `unscopedAgentCount` guard "a second,
  independent implementation of the scope-reach rule"; it is not — `summarize` reaches the shared
  `isSeedScopePairWritable` through `reachesAgent`/`isScopePairCompatible`, and only the TRAVERSAL
  is local. **And the fix the brief specified was the wrong one**: swapping the schema at the MINT
  breaks EDITOR-08's repair round trip, demonstrated rather than argued — the naive change reddened
  8 specs including the whole external-skills block. The mint is correctly lenient because it also
  serves the preview dialog and local Save. **Fixed at the write BOUNDARY instead**: a guard clause
  in `createSharedConfig` running `installableSeedPayloadSchema.safeParse`, returning a new
  `unwritable` `ShareRefusal` that reports the contract's own issue messages — so all four call
  sites are closed by one gate, where gating each button would have been three more copies of the
  mistake. The schema rather than `unwritableSeedAssignments`, deliberately, so a rule added to the
  write contract later is enforced without anyone remembering to come back. **The disabled button
  stays and keeps `unscopedAgentCount`**: it counts distinct SUB-AGENTS, which is how many clicks
  remain, where the contract counts PAIRS — and deriving it would mint a full payload on every
  roster render and let the button disagree with the notice above the grid. It is now an affordance
  rather than the protection. Read path untouched; `?fromId=` stays lenient. Hand-driven in a real
  browser: zero POSTs left the page and the button read `Scope conflict — fix marked rows`; with the
  gate neutered the same run wrote. Gates: editor 489 Playwright, unit suite green.

- **2026-09-01 — CLI-849** (cli.md, filed and closed the same day; **owner ruling: validate with the
  real schema**) — **the test doubles minted what the worker refuses, and that permissiveness is
  what let the CLI/worker schema divergence ship undetected for a week.** `packages/api-mocks`'s
  `createConfig` and `packages/cli/e2e/fixtures/seed-config-store.ts`'s `mintedHandler` both
  answered every `POST /configs` with `201 {id}`, while the worker gates that route with
  `installableSeedPayloadSchema`. No suite could see the divergence; a user found it. Both doubles
  now run the same schema and answer 400 with the worker's own envelope. **The deliverable was the
  demonstration rather than the diff**: `OUT_OF_SCOPE_PAYLOAD` — a project-scoped skill on an agent
  absent from `agents`, so resting at the `global` default — is refused where it previously minted.
  The owner accepted the stated risk that a validating double is a second implementation of the
  contract; the surface is minimised by importing the schema and restating no rule, and
  `seed-config-store.ts` asks the same question rather than answering it separately. All three
  opt-in handlers preserved. **Three comments encoding the wrong belief were corrected**, including
  `storeRefusedHandler`'s claim that KV refusal is "the one failure the POST has that no request can
  provoke, since the body was built from the contract's own schema" — false when written, because
  nothing enforced it, and true only now. **The lane caught its own regression**: its first spec
  placement under `e2e/fixtures/` flipped that directory into spec-bearing for `journey-page.ts`'s
  `classify()` and reddened four unrelated `spec-gates` tests through a symbolic journey reference;
  root-caused, relocated to `e2e/commands/`, and the placement documented in `user-journeys.md`.
  Gates: api-mocks 27, CLI 7372 unit and 940 e2e, editor 503 unit and 164 Playwright, server 88.
  Two findings filed and indexed.

- **2026-09-02 — CLI-853** (cli.md, filed 2026-09-01 as a flaky timeout; **the row, its correction
  and my brief were all wrong about the cause**) — **the unit suite was downloading
  `github:agents-inc/skills` from api.github.com once per test: 31 tarball fetches per unfiltered
  `npm test`.** The 10s timeout was the symptom. Because the dominant cost is gunzip plus ~500 file
  writes rather than the HTTP round trip, it stretched with machine load — which is exactly the
  "reddens on machine speed rather than on code" shape that made it read as a budget problem.
  **Every framing offered to that lane was false and it said so**: `runCliCommand` does NOT spawn a
  process (it calls oclif's `run()` in-process, so there is no process-start cost at all); the row's
  "process start plus oclif's load is most of that budget" is contradicted by measurement (warm
  ~55ms, fresh fake HOME ~2,400ms — the difference is a download); the named reproducer did not
  reproduce in 1/1 attempts and manufactured 20-way contention was required; and the claim that
  every `runCliCommand` spec shares the shape is false — 11 of 15 files have no test over 1s. The
  census is exact: **one download equals one slow test**, and what the four outliers do that their
  siblings do not is fall through to the DEFAULT REMOTE source instead of building a local one.
  Fixed by one shared checkout fetched once per machine in `globalSetup` and symlinked into each
  fake home's cache — `shared-source.ts`'s pattern applied one directory over. **The previous
  attempt at the obvious fix was deleted as part of it**: the tree already carried
  `COMMAND_TIMEOUT = 30_000` across 9 specs, which had not stopped the bug but moved it to whichever
  spec lost the next race. Measured: 130,447ms of test time to 44,519ms, `doctor.test.ts` 57,999ms
  to 917ms, 31 GitHub requests to 0, `npm test` 90.1s to 31.2s. Reproduction 2/2 red under 20 CPU
  burners (one run with 9 timeouts across exactly the three named files), 3/3 green after — and the
  lane stated plainly that three green runs is not proof for a timing fix and that the weight is
  carried by the removed mechanism rather than the run count. Gates: 220 files / 7,378 tests.

- **2026-09-01 — CLI-848 and CLI-852** (cli.md, both filed and closed the same day; **their rows were
  retired without an archive entry, and this line is the correction**) — one class, two boundaries,
  two DIFFERENT fixes, which is the point of them. **CLI-852**: `publish-seed.ts` rendered a
  contract-version refusal as a bare `HTTP 409`, the one refusal whose whole purpose is telling the
  user what to do. The worker answers it with `c.text("Reload the page: …")`, which is browser advice
  a CLI must not repeat — a CLI user has no page. So 409 got its own branch ahead of the envelope
  read (`CONTRACT_MISMATCH`, `OUT_OF_DATE_AGAINST_STORE`) saying the CLI is out of date against the
  store, that the version travels inside the binary rather than with the configuration, and to
  re-run through `npx agents-inc@latest`. No sub-command is named, deliberately: `publishSeedConfig`
  serves both `share` and `edit --ui`, and `handed-out-invocations.ts` matches the invocation
  followed by a SPACE, so anything after `@latest` is invisible to the gate that runs every
  handed-out command. **CLI-848**: `fetch-seed.ts` had the same discarded-body defect and needed a
  different fix — `getConfig` answers with `c.text` rather than a Zod envelope, so copying the
  parser would have been wrong. It gained `refusalMessage`/`refusalBody`/`arrivedAsText`/
  `explanationOf`, gating on the wire's CONTENT TYPE with its own `EXPLANATION_BUDGET` of 120.
  **The lane refused one row of its brief**: it was told `fetch-seed` needed a 409 branch too, and
  established that `refuseAnotherSeedVersion` is registered on `createConfigRoute` only — that route
  can never see a 409 — so it did not invent the work. **Two of its own new specs passed before
  implementation**, so it built a deliberately unguarded stage, watched them fail, then added the
  guards. Hand-run verbatim against a stub answering exactly what the worker answers, for every
  status changed. Residuals filed rather than absorbed: CLI-854 (no control-character stripping on a
  quoted remote body, at three boundaries) and CLI-855 (the write half still drops plain-text bodies
  for 413/429/503, so the two halves are now asymmetric). Gates: 219 files / 7372 tests.

- **2026-09-02 — CLI-859, CLI-860 and CLI-862** (cli.md, all three filed and closed the same day;
  **one subject, which is why they were fixed together**) — a family of test fixtures at fixed
  machine-wide `os.tmpdir()` paths with no rule about who may write them. **CLI-862 is the rule
  broken**: `shared-source.test.ts` is collected by the UNIT project and called `buildSharedSource`
  plus `removeSharedSource()` on the same real path 160 of 254 E2E specs read — reproduced by
  planting a marker file, running the one unit spec, and finding the fixture root gone.
  **CLI-859 is the family's second member repeating the first's silence a day after being copied
  from it**: `ensureSharedMarketplaceCheckout` published by `rename` and only then wrote its record,
  while its guard was `directoryExists` — so an interruption between two lines left a directory the
  guard accepted and a classification (`unrecorded`) that sent every run back to the network,
  silently restoring the defect CLI-853 had just removed. **CLI-860 is the pin the family had for
  its helper and not for its wiring**: deleting both `linkSharedCache` calls left the whole suite
  green, so the change that took the suite from 90s to 31s could be removed without a test noticing,
  and its symptom on return is a timeout that reads as flake. **The proposed one-line fix for
  CLI-859 was verified CORRECT and deliberately not taken** — moving the write above the rename is
  observable only by mocking `fs/promises` at the real shared path, which CLI-862 forbids, so a fix
  whose reversal nothing catches would have been CLI-860's own complaint one module over. The record
  write is unconditional instead: pinnable, and it repairs a checkout that lost its record for any
  reason including a `/tmp` reaper, at the cost of one small write and never a fetch. **The rule is
  now written down** — _a fixture at a machine-wide path is written by the runner that owns it and
  by nothing else_ — in `shared-source.ts`'s docblock, `package.json`'s `//test` note and
  `.husky/pre-push`, all three of which previously explained only the `dist/` tsup race. **And it is
  enforced**: `shared-fixture-writers.test.ts` holds each writer's invokers against a roster through
  the AST and fails in BOTH directions, a new caller and a renamed writer with no caller, proved by
  planting a violation. Every fix demonstrated rather than asserted: the interruption closed against
  an instrumented `fetch`, the pins reddened one per call site on deletion, the marker survived.
  **A correction that outlived the rows**: `.husky/pre-push` does NOT run `turbo run test test:e2e`
  — the suites left that hook on 2026-08-23 — so the concurrency hazard is real by other routes
  (two terminals, a bare `turbo run`) but not by the one named. Gates: 221 files / 7391 tests, e2e
  940 passed, prettier and deps:check clean.

- **2026-09-02 — CLI-861** (cli.md, filed and closed the same day) — **a third `POST /configs` double
  minted 201 for any body, so CLI-849's census was two-thirds of the class.**
  `apps/editor/e2e/support/sharing.ts`'s `captureCreateConfig` installed an unvalidating handler
  ahead of the now-validating shared ones, and it is the default success path for eight editor
  Playwright spec files. **The obvious fix was forbidden and the docblock said why**: making the
  double parse would strip unknown keys, and specs assert `model`/`effort` are ABSENT from the
  posted body — so a parsing double grants those assertions for free and turns real claims into
  vacuous ones. The shape taken is validate-then-forward-raw: the helper is now a spy that clones
  the request, records the raw body unconditionally, and answers through msw's own resolver against
  the validating handlers, restating no rule of its own. **The record is unconditional on purpose** —
  `posted` says what was SENT, and recording only accepted bodies would let `expect(posted)
.toStrictEqual([])` be satisfied by an app posting the very payload the guard exists to stop,
  which is a worse vacuity than the one being removed. Demonstrated with `OUT_OF_SCOPE_PAYLOAD`
  (201 before, 400 after) and a byte-identity case carrying `model`/`effort` through intact. **Every
  new assertion was proved able to fail by mutation**, including one that showed the docblock's own
  warning rather than restating it: recording a parsed body reddens the byte-identity test while
  `sharing.spec.ts`'s "posts the v2 shape" stays green. `scope-reach.spec.ts` gained the control its
  negative assertion lacked. **A correction that outlived the row**: the brief claimed that assertion
  needed strengthening "now that the double can refuse" — false, since it reads the REQUEST log and
  was never sensitive to the answer; it was strengthened for the real reason instead. Gates: editor
  503 unit, 494 e2e, 16/16 turbo tasks.

- **2026-09-02 — CLI-863** (cli.md, filed and closed the same day; **ruled twice, because the first
  ruling was made on my wrong numbers**) — nothing gated a push on the suites: `pre-push` ran
  `deps:check` and `lint` only, so a red suite pushed clean. The suites had left on 2026-08-23 for
  two recorded reasons and **both were dead**: the `dist/` race came from npm pre-hooks since
  deleted (10 runs gave exactly 1 `tsup` invocation each and zero `unlink dist/chunk-*`), and the
  shared-fixture collision was CLI-862, fixed hours earlier. **A third cause was found by measuring
  rather than assuming**: `summary-panel.test.tsx` fails about 1 run in 10 under CPU contention
  (CLI-865), 9/10 concurrent against 6/6 alone. The isolation cause recorded here was
  falsified on 2026-09-02 and struck; CLI-865 carries what is actually known.
  **Concurrency was then ruled out on arithmetic**: 376s against 392s, a 4% saving for a 1-in-10
  spurious red, because the e2e suite is 10x the unit suite and dominates. So the owner's first
  ruling ("concurrently") was withdrawn and re-made as **sequential, both sides, everything**.
  Implemented as separate `bunx turbo run` invocations ordered by `sh -e`, which changes nothing
  outside the hook — `--concurrency=1` was rejected because it serialises the whole graph including
  eight web workspaces that never had the problem, and a `dependsOn` edge because it would change
  what `bun run test:e2e` means in CI and for anyone running it alone. Fail-fast proved end to end
  rather than reasoned about. **My cost estimate was roughly double the truth**: I quoted ~19
  minutes for both sides against a measured **9m42s** — the 12m17s web figure is a CI number, since
  `playwright.config.ts` pins `workers: 2` under CI while a local run takes half the cores. Measured
  and now recorded in the hook: docs-only 0s, CLI-only 6m31s, web-only 2m58s, both 9m42s. **A
  browser finding worse than expected**: a fresh machine fails BOTH web lines, because
  `packages/ui`'s storybook vitest project renders every story in real Chromium — which is why
  `ci.yml` installs the browser before `test`, not before `test:e2e`. The hook names the one-time
  install rather than running it, since a push hook wanting `sudo` or the network is worse than one
  that fails. **The standing note was closed rather than rewritten**: two sections telling the
  reader to run the suites separately were about to sit above a hook that runs them, and twelve
  lines restating the fixture story became a pointer to the checker that now holds it.
  **Nothing mechanically reads `.husky/pre-push`** — collapsing the pairs back into one turbo run
  would stay green and bring the 1-in-10 red back; a "do not tidy" sentence in the header is the
  entire enforcement, and that gap is filed. Gates: 221 files / 7391 tests, CLI e2e 254 files twice,
  editor Playwright 494 twice.

## 2026-09-02 — the thirteen rows filed that day were scrutinised against the repository's own bar, and five were retired

Every row filed on 2026-09-01/02 was held against `packages/cli/.ai-docs/standards/briefing.md`,
`documentation-bible.md` and this file, on the question the owner asked: is this actually something
we want to incorporate. **Thirteen rows became eight, and five of the eight changed shape.**

**CLI-858 retired unbuilt — a refusal filed as work.** Its facts were true and truth is not the bar:
its central sentence is "It was deliberately not taken." The synthetic-checkout half is the option
CLI-853 refused and the offline half is an unrun experiment whose outcome changes nothing shipped.
It also carried a bare "463 assertions" with no invocation. The one durable sentence — that
replacing a real checkout with a synthetic one reads as a tidy-up and is not one — belongs in
`shared-marketplace-checkout.ts`'s docblock beside the fetch, where the rest of that reasoning
already lives, not in a 100-row tracker.

**CLI-864 retired: its `/stacks` half is unreachable and its `/compose` half merged into EDITOR-69.**
Re-derived rather than taken on the row's word: `grep -rn 'createStack' apps/editor/src` gives
exactly two production call sites, both passing the constant `SAVED_STACK_NAME`, and `renameStack`
returns nothing — so the one field the worker guards has no user-typed path at all. A validating
double asserting a constraint no caller can violate cannot be watched go red, which the e2e
anti-patterns rule against directly. It was also in the wrong tracker: the subject is
`packages/api-mocks` and `apps/editor/e2e/support`, neither of which is `packages/cli`.

**EDITOR-68 retired: EDITOR-55 already closes it, and three of its claims were false.** The
2026-08-25 design specifies `.app` at `min-width: 1240px`, and 1240 ≤ 1280 — **shipping EDITOR-55 as
designed already fits a 13-inch screen**. The row's "the editor has ZERO breakpoints today … which
is a design property, not an oversight" reads a true grep as a false inference, and it is the
damaging half: it puts responsive back in the design-gated bucket EDITOR-07 explicitly removed it
from. Two of its four "what the design must settle" questions are answered in that design file, and
its claimed desktop-only decision "in `playwright.config.ts` and the E2E standards" has no second
member — `grep -rni 'desktop' packages/cli/.ai-docs/standards/ apps/editor/e2e/` returns nothing on
the subject. What survived is genuinely new owner input and it CONTRADICTS the arrived design rather
than extending it — 3-across against the design's 4, a `Filters` dropdown against the design's
domain strip, a shrinking rail against the design's `--npad`-only change — so it is a named
design-revision leg on EDITOR-55, with one sentence owed from the owner: does the 1240px floor ship
now, or wait on the revision. Two rows for one change at contradicting statuses is the stale-claim
failure the bible names.

**CLI-866 moved to `todo/repo.md` as REPO-42 and deferred.** `.husky/pre-push` is a repository-root
file. Its own "no natural home in this repo's vitest projects" sentence is false — the root
`package.json` already runs three root-subject checkers out of `packages/cli/scripts/` under
`deps:check` — but the rule a checker would pin is contingent on CLI-865, which is now open.

**CLI-865's root cause was falsified, and it had already been copied into two other artefacts.** The
row diagnosed a shared-singleton isolation defect from a frame rendering `All skills ejected`.
`buildSkillConfigs` in `__tests__/helpers/wizard-simulation.ts` sets `origin: overrides?.origin ??
"eject"` unconditionally and never reads the matrix, so that label renders in the green runs too:
the frame treated as diagnostic is the normal frame. The claim was struck from the row, from
`.husky/pre-push`'s header and from the CLI-863 entry above. The candidate the row explicitly denied
— `use-panel-scroll.ts` converging `contentHeight` against a fixed `RENDER_DELAY_MS = 100` — is the
live one, and the row moved to `Investigate`.

**Three rows were UNDERSTATED and were raised.** EDITOR-69 is three defects rather than one — a
message blaming a model that was never called, a rate-limit token spent above the length guard, and
`reportIssue` firing on the route reserved for money-spending anomalies — and its fix is cheaper
than filed, since the worker already sends the discriminator. CLI-854's "three boundaries" was a
false cardinality claim: `commands/search.ts` and `lib/matrix/matrix-resolver.ts` are two more with
a MORE reachable source, and because `--marketplace` is a supported product input the vector is a
third-party skills repository rather than a MITM — the same threat class this file already recorded
a ruling on for the editor's skill-contents dialog, one surface over, and never for the CLI.
CLI-867 is two documents rather than one, and its live danger is not the self-contradiction it leads
with: `monorepo-layout.md` and `code-generation.md` both argue the suites do not belong in the hook
at all — REPO-42's larger feared regression, arriving with documentation telling someone to make it.
**Corrected 2026-09-02 after verification**: this entry first said the two documents instructed a
reader to re-collapse the pre-push pairs into one turbo run. They did not; that is a different and
narrower regression, and the mischaracterisation was propagated from the row into this file.

**Two rows were narrowed and one restated.** CLI-855 cut to the 429 alone, the only one of its three
statuses that tells a caller something the status code does not. CLI-856 dropped to `low`, its
exposure bounded to one directory by the gate's own `toStrictEqual`. CLI-857's premise was
backwards — `onUnhandledRequest: "error"` IS the gate and five `commands/` files install it — so the
row became "extend that install's reach" rather than "build a second refusal", and it carries the
warning that a naive `globalThis.fetch` guard would miss CLI-853's class anyway, since the mechanism
was `giget`.

**The framing the scrutiny began with was itself wrong, and that is worth recording.** The brief
told the judges to be suspicious of rows filed by a lane that had just been burned by the defect's
class. The repository's own rules say the opposite: `briefing.md` forbids widening past a row, and
this file records CLI-854/855 as "residuals filed rather than absorbed". **Filing an adjacent
finding is the sanctioned behaviour**; the rows that failed here failed on their own merits.

**All thirteen breached the one-liner convention — and the scrutiny's own account of the damage was
itself wrong, which is the last correction of the pass.** The adjudicator recorded that six long
rows had widened the Bugs table and dragged CLI-678 and CLI-750 out with them. A markdown table does
pad every cell to the widest, but the table was ALREADY 2,400 characters wide at `HEAD`, driven by a
2,346-character CLI-846 row that predates every filing here; today's rows took it to 2,465, a 65-
character increase rather than the cause. Every surviving row from this batch was still cut to a
headline with its detail moved below the table, which is where the convention has said it belongs
all along — but roughly a dozen older rows still breach it, and closing those is not this pass.

## 2026-09-02 — CLI-867: two reference documents stopped telling the next reader to undo CLI-863

`.husky/pre-push` runs the suites again as of CLI-863. `reference/monorepo-layout.md` and
`reference/features/code-generation.md` both still described the hook as lint-only — but the
self-contradiction was the harmless half. **Both carried standing arguments that the suites do not
belong in the hook at all**: "Running the suites is the pusher's job now … **separately**, because
running the two in one turbo invocation reproduces the same race", and "The suites left this hook on
2026-08-23". A reader acting on either removes the suites, which is REPO-42's larger feared
regression — the documentation was arguing for the very thing CLI-863 had just undone.

**This paragraph was corrected on 2026-09-02 by the verification pass, and the error is worth
keeping.** It first said both documents instructed a reader to _re-collapse the separate `turbo run`
invocations into one_ — a real but narrower regression, and not what either sentence says. The row
said it, the brief repeated it, this entry recorded it, and nothing between them could have caught
it, because every check available reads whether a citation resolves rather than whether a
characterisation is true. Both were deleted rather than rewritten, per the bible's rule,
and replaced with a statement of the live invariant that points at the hook's header instead of
restating its cost table.

**A fifth defect site the row did not name** was found in the `pre-commit` section, and **a sixth
was found to be a stale absence of exactly the class being repaired**: a paragraph asserting the
CLI's side-grep names two paths and that "nothing lints the CLI for it" had gone false when the grep
was widened in `9c2a613e`, independently of the hook change. It was deleted rather than used as the
corrective source; its claim that tsup bundles four workspaces was also wrong (`noExternal` names
three — `api-mocks` is bundled by nothing) and went with it.

**The brief was wrong about the file's own path** — `reference/architecture/monorepo-layout.md` does
not exist — which is the re-derive rule earning its place twice in one dispatch.

Finding:
`agent-findings/2026-09-02-a-justified-absence-reads-as-an-instruction-and-no-vocabulary-census-finds-it.md`,
and it carries two things worth more than this task. **The bible's absence-vocabulary census found
none of the four defect sites**: a passive absence ("there is no X") and a justified absence ("X is
not here, and here is why") share almost no vocabulary, and only the second reads as an instruction.
And `grep -nP 'left this hook'` exits 1 on a file that contains the phrase, because at
`proseWrap: preserve` it straddles a hand-wrapped line — so **no line-oriented phrase census over
`.ai-docs/` returns a trustworthy zero**, whatever its vocabulary. Gates: `check-findings-frontmatter`
45/45, and the four citation checkers 136/136.

## 2026-09-02 — EDITOR-69: an over-long sentence stopped being blamed on a model that was never called

Filed as "no warning on the composer". It was three defects meeting at one surface, and the report
corrected the row on the way through: **two causes, not one.** `apps/editor/src/lib/api/compose.ts`
read `response.status` where `/compose`'s discriminator is the BODY — the worker spends 400 on two
different guards and names which in the body — so a length refusal fell through to "The model did
not answer. Nothing changed." while the source's own comment says the guards run **before** the
model is reached, and `reportIssue` fired on that branch under a comment reserving it for the route
that spends money on every call. Independently, `COMPOSE_CALLS.limit()` was the handler's first
statement, **above** both guards, so eleven over-long pastes exhausted a ten-a-minute allowance on
requests that reached no model. A fix for either left the other standing, which is why the specs
landed in two suites.

**The field does nothing at the limit, and that is a ruling rather than an omission.** No
`maxLength`, no counter, no disabled Send. The brief framed blank-versus-long as an asymmetry to
resolve; re-derived, the two are not symmetric in the way that decides it — **blankness is a
predicate the client can evaluate on its own, a cap is a number only the worker owns.**
`apps/editor` has `server` as a devDependency exporting only its index, so importing `MAX_SENTENCE`
as a value would drag the Anthropic SDK, better-auth and drizzle into the browser bundle; a
client-side refusal would therefore be a verdict built on a number that can silently drift, and the
editor would start refusing sentences the worker accepts with nothing to redden. A disabled Send is
worse than the pre-refused `maxLength`, not better — 601 characters look exactly like 599 — and a
counter has nowhere to go, since `composer.tsx` records the design ruling that its control band
holds exactly two children. **What makes doing nothing correct is the limiter fix**: the round trip
is now free, reaches no model and returns in milliseconds, so the composer's existing mechanism for
saying why a submit produced nothing suffices. Two e2e tests pin it so the refused fixes cannot come
back — the draft keeps every character and Send stays enabled.

**Moving the limiter opens no exposure of consequence, and the censused contrast is the useful
half.** Every path to Anthropic still passes it, so spend is bounded exactly as before, and a spec
asserts the eleventh ordinary request still gets a 429 — that is what makes it a reordering rather
than a removal. The unmetered work ahead of it is unchanged: `authenticated` performs a D1 session
round trip and the zod validator has already parsed the body, both of which were always above the
limiter, so an attacker gains one `.length` comparison per request. The residual — no cap on request
VOLUME independent of spend — was already true and is the same gap `wrangler.jsonc` documents for
`POST /configs`. Both `.limit(` sites in the worker are now known to be right for **opposite**
reasons: `CONFIG_WRITES` is deliberately first because it meters request volume from anonymous
callers, `COMPOSE_CALLS` meters spend from an identified one. Same worker, three weeks apart, and
the difference is invisible from the binding name.

**The 400 double was built alongside the guard it holds** — the leg merged in from the retired
CLI-864. It is its own handler rather than an arm of `composeRefusalOf`, because keying a 400 double
on status alone would mint one answer for two guards and assert that the client read a discriminator
it never saw; `composeRefusedHandlerFor(400)` keeps its bodiless response and is now the **degrade**
control. That control was proved to be a real guard rather than a free pass: against a deliberately
careless `status === 400 ? "too-long"` implementation it goes red. `COMPOSE_TOO_LONG_BODY` was
reported as an owed cross-lane diff rather than made, and the orchestrator moved it to
`fixtures.ts` beside its two siblings — where the existing docblock had gone false, since it claimed
the client maps every unnamed status to one `refused`.

Finding:
`agent-findings/2026-09-02-a-rate-limiter-above-a-free-guard-charges-for-work-it-refused-to-do.md`.
Gates: the editor, server and api-mocks suites, the Playwright specs for this route, `tsc` and
`eslint`, all green at the time of landing. (Figures deleted 2026-09-02 rather than re-measured: a
full-suite count taken during a concurrent pass is load-dependent, and this repo's own rule is that a
record carries the command rather than its result.)

## 2026-09-02 — EDITOR-67: signing in stopped deleting the work it exists to preserve

**It reproduced exactly as filed**, which is the part worth recording — the row had been filed as a
product question and was restated as a bug the day before on the strength of reading alone. The
reproduction: park a configuration assigning a project-scoped skill to a sub-agent resting at
global, sign in, and the snapshot vanishes. `adoptLocalStack` mints the local slot to the account on
first sign-in; CLI-851 gave that mint a refusal; the guard receiving it was
`if (!minted.ok) return stacks`, and `stacks` is empty precisely because adoption only runs against
an empty list — so the grid drew neither list. The only trace anywhere was a console line naming the
scope conflict that no person ever sees, and `adoptLocalStack`'s own docblock says **WITHOUT THIS,
SIGNING IN LOOKS LIKE LOSING YOUR WORK**.

**The shape: keep the local slot on the grid when adoption was refused, and say why above it.** The
brief's second option — adopt in a marked state — turned out to be **structurally unavailable**
rather than merely undesirable: a `RemoteStack` carries a `configId` minted by `POST /configs`, so a
payload the worker refuses never gets an id and a marked row has nothing to point at. Refusing the
sign-in loudly was rejected for making a configuration problem block an identity operation while
still not returning the person their work. Two load-bearing choices inside the chosen shape: the
store holds the refusal and the grid owns the words, which is the repo's documented split and is why
the notice can say "apply it, then fix the marked rows" where the roster's own "fix marked rows"
would be wrong — those rows do not exist until the snapshot is applied; and `unadopted` is non-null
only while the account holds nothing of this browser's work, maintained in the store rather than as
a compound condition in the view, which is what structurally prevents the grid drawing two cells
both labelled `Saved stack`. All five endings get words rather than only `unwritable` — four retry
on the next load and one never will, and the sentences say which.

**The fix closes the path at sign-in and RE-OPENS it on the next unrelated Save — filed 2026-09-02
as EDITOR-73 and reproduced by execution.** `save` clears `unadopted` on any save, so the kept slot
and its notice vanish and a reload does not bring them back; the snapshot survives in `localStorage`,
unshown, which is word for word the shape this row fixed. Nothing below should be read as saying the
class is closed — only the sign-in moment is.

**The class was censused and has no siblings.** `grep -rn 'if (!\w*\.ok)' apps/editor/src` returns
28 consumer guards; every other one narrates onto a surface. Two adjacent cases were named and
deliberately not fixed: a failed account-stack fetch that does nothing on screen but loses nothing,
so it is an unresponsive control rather than data loss; and `listStacks` answering `[]` for a 500 as
well as a 401, which is pre-existing, needs a product decision, and was filed as **EDITOR-70**
rather than patched. **EDITOR-71** carries the two test-surface residues the lane flagged rather
than buried — a shared `importNotice` locator now one co-occurring state from a strict-mode
violation, and a new `role="alert"` state with no a11y audit.

Finding: `agent-findings/2026-09-02-a-replacement-that-fails-leaves-the-user-with-neither.md`, and
its rule generalises past this bug: **where a surface shows A in place of B, the condition that
hides B must be "A arrived", never "A was attempted"** — because the hiding and the producing live
in different modules, only one of them can see a refusal, and returning the prior value type-checks
perfectly. Gates: the Playwright and unit suites, `tsc -b`, eslint and prettier, all green at the time of
landing, plus a hand-run screenshot confirming the sentence renders without clipping. (Suite counts
deleted 2026-09-02 rather than re-measured — see the note in the EDITOR-69 entry.)

## 2026-09-02 — EDITOR-66: the write-boundary refusal CLI-851 added has now been watched failing

CLI-851's `createSharedConfig` guard refuses an unwritable configuration before the POST. It had
been verified by hand in a transient harness its own lane deleted, so **no spec had ever seen it
fail.** `scope-reach.spec.ts` gains a `"a signed-in save of the pair"` describe with two tests, and
`roster-panel.ts` gains one parameterised `saveNarrating(label)` — needed because `saveButton` is
`name: "Save"` and the button RENAMES itself on refusal, so the page object's own locator stops
matching the instant there is anything to assert.

**The empty-log assertion earned its place by a different argument than the one that briefed it.**
The brief claimed a guard that STRIPPED the offending assignment would leave the narration correct;
it would not — a stripped payload posts successfully, the button reads `Save`, and the narration
assertion fails on its own. The demonstrated justification is sharper: a `createSharedConfig` that
posts FIRST and maps the worker's 400 back to `unwritable` produces **identical words on the
button**, and only `expect(posted).toStrictEqual([])` separates it from a pre-POST refusal. That was
watched red as its own variant, printing the payload the guard was supposed to have stopped.

**The permitted-case control was measured rather than argued.** Against a deliberately swallowing
guard (`problems = [...writeContractProblems(payload), "swallowed"]`) the refusal test stays GREEN
and the control reddens — which is the pairing rule's whole claim, and the two tests differ by
exactly one action.

**A false sentence was deleted rather than reconciled**, per the standing ruling: _"Save is the local
snapshot, not an export — it never reaches the worker and never reaches the CLI, so parking a
half-finished configuration stays possible."_ Nothing was written in its place; the signed-in
behaviour it misdescribed is now stated by the two tests below it. The adjacent comment explaining
why the button stays enabled is still true and stayed.

**Share was confirmed as the harder path and deliberately not covered twice** — `blocked` disables
it, so the existing spec reaches it only with `click({ force: true })` and already asserts its empty
log; the button is unreachable to a user and the guard behind it is the same function.

Filed from this lane: **EDITOR-72**, a censused breach of the README's own locator rule — 55 sites
across 15 spec files — caused not by anyone breaking it but by page objects modelling only a
control's RESTING state, leaving lifecycle assertions nowhere else to go. Finding:
`agent-findings/2026-09-02-a-page-object-modelling-only-a-controls-resting-state-pushes-every-lifecycle-locator-into-the-specs.md`.
Gates: 18 passed for the file, 487 for the chromium project, `tsc -b`, eslint and prettier clean,
and `configs.ts` restored byte-identical after three working-copy mutations (SHA verified).

## 2026-09-02 — CLI-855: the store's one explanatory refusal reaches the terminal, and the row that named the wrong status was corrected on the way

**Two dispatches, and the first one refusing was the point.** The row was filed against the store's
429 body and narrowed by the 2026-09-02 scrutiny pass to "the 429 alone". Both were wrong.
`Too many requests` is the HTTP reason phrase for 429 verbatim, re-cased — the exact property the
narrowing had used to disqualify 413 — so the status the row named must NOT be quoted. And 503 was
dismissed on a non-sequitur: that `packages/api-mocks` mirrors its body in `STORE_REFUSED_BODY`,
which is a fact about a test fixture and says nothing about what a user sees. `Could not store this
config` against a reason phrase of `Service Unavailable` is the one body of the three that names a
cause. The first lane changed nothing, demonstrated the inversion against `node:http`'s
`STATUS_CODES`, and stopped — the briefing contract's rule earning its keep. **The error was in the
scrutiny narrowing, not in the original filing.**

**What landed on re-dispatch.** `refusalBody` returns raw text for every status rather than parsing
it as JSON; `explanationOf` tries the zod envelope first and falls back to `quotableProseIn`, which
gates on content type, drops a blank body, and drops one equal to its own status's reason phrase.
**No status number gates a read** — and the brief's instruction to that effect turned out to be
already non-absolute by design, since the route writes a fourth `c.text` body the analysis had
missed: 409's `Reload the page: …`, which `refusalMessage` branches on before any read for its own
documented reason. The reason-phrase suppression is what makes the rule general rather than a
hand-list of three statuses: **413 and 429 needed no special case, and neither will a fourth.**

**Both stages of red were watched.** Stage one, tests against the unchanged module: 1 failed / 15
passed, the 503 rendering bare. Stage two, against a deliberately unguarded implementation quoting
any non-envelope body: **7 failed / 9 passed**, every control firing — the two restating statuses,
an empty body, a captive portal's HTML, a foreign JSON document. Hand-run confirms it: a 503 renders
`The store said: Could not store this config`, a 429 and a 413 render the bare status.

**"The same shape as `fetch-seed.ts`" would have been wrong followed literally.** That file puts
`arrivedAsText` inside `refusalBody`, gating the READ; copying the placement here kills the envelope
arm, which arrives as `application/json`. Similar shape, different placement, and the docblock says
so. No shared helper: only `arrivedAsText` is one rule about the wire, while the budgets and the
discriminators are per-route measurements with documented reasons.

**A fixture in the lane's own file was faithful in content and false on the wire** — captive-portal
HTML sent with `HttpResponse.text`, so `content-type: text/plain`. Harmless while only the envelope
was quoted, and quotable the instant the prose arm existed. The general shape is worth keeping: **a
fixture only has to be faithful on the dimension the code under test discriminates on, and that
dimension can move under it.**

Filed from this lane: **CLI-868** — `check-finding-citations.ts` reads any dated name in `todo/` as a
finding, so a tracker link to a dated PLAN fails as a dangling citation. Reproduced when
`ROADMAP.md` linked this programme's run sheet; worked around by renaming that file to drop its date
prefix. Finding
`2026-09-02-a-refusal-body-that-restates-its-own-status-reason-phrase-explains-nothing.md` moved from
`open` to `resolved`, since the lane that wrote it was describing a gap its successor then closed.
Gates: `publish-seed.test.ts`, the `lib/seed/` suite and two e2e specs all green, as was the full
unit suite. (The full-suite figure was deleted 2026-09-02 rather than re-measured — it is
load-dependent and was taken during a concurrent pass.)

## 2026-09-02 - CLI-854: one sanitiser behind three chokepoints, and a census that was wrong three times

**The row said three boundaries. The dispatch corrected that to five. Both were wrong**, and the
correction is the most useful thing here: the right census is keyed on **which renderer foreign text
funnels through**, not on where it is printed.

```
grep -rn 'truncateText' packages/cli/src/cli --include='*.ts' --include='*.tsx' | grep -v __tests__
grep -rn 'formatZodIssue\|formatZodErrors' packages/cli/src/cli --include='*.ts' | grep -v '\.test\.'
```

`truncateText` turned out to be, de facto, the "bound foreign text" function - **all five of its
call sites are foreign** - so fixing it closed four of the row's five sites at once. The two that
mattered most appeared in no version of the row: `formatZodIssue`, whose own docblock calls it "one
place for the path-prefixed issue rendering shared by every Zod reporter" and whose every sentence
part comes from the refused document; and `getErrorMessage`, at 74 call sites.

**The sharpest find got past the lane's own first implementation**, and was caught only because a
spec asserted on the whole rendered message rather than a fragment: the stdin excerpt was sanitised
and the parse _reason_ was not, because the reason is a V8 `Error` and therefore looks like the
CLI's own text. `JSON.parse` writes the offending input into its message verbatim. **Provenance
follows the bytes, not the object** - "produced by trusted code" is not an argument that a string is
trusted. Eight sites of that class, all closed inside `getErrorMessage`.

**Strip first, then truncate, and the order is owned inside `truncateText`** rather than left to its
callers, because there is a wrong way round and exporting two functions invites it. A cut taken
first can land inside a sequence, and the fragment is worse than the whole - a terminal holds it
open and eats the ellipsis and the next line. That exact hazard was reproduced red: an expected
`abcde` ellipsis arriving as a dangling escape holding the ellipsis. **Newline and tab survive**;
everything else in C0, C1, DEL and every escape sequence goes. Newline because a multi-line zod
message is what the store really writes, and the strict direction of error mangles every honest body
to stop a rare hostile one. Carriage return is stripped, so a CRLF body keeps its line break and
loses its cursor move. Words are never removed - a forged sentence survives as visibly ordinary
text.

**The hand-run showed a third defect nobody had filed.** Rendering a hostile local skill through
`search` leaked `@oclif/table`'s own SGR reset AND collapsed the Description column with the border
jammed against it, because the column width had been computed over the escape bytes. Binary census
before and after: ESC and CR both present, then neither, with no control byte but newline.

Nineteen specs were watched red against a neutered sanitiser, with every permitted-case control
staying green - which is what shows they are not vacuous. `ResultRow`'s `id` and `category` were
widened from `SkillId` / `CategoryPath` to `string` rather than casting a sanitised string back into
a union it is no longer known to be in, which is what the docblock had already said those fields
were. The one `eslint-disable no-control-regex` was kept **inline rather than promoted to
`eslint.config.js`**, deliberately inverting the repo's usual rule: a package-wide override would
license control-character regexes everywhere, which is the opposite of one sanitiser.

Filed from this lane: **CLI-869**, the half it could not close - the wizard's Ink components
interpolate `displayName` directly, and the choice between sanitising once at `initializeMatrix`
(which also feeds `seatCatalog`, so compiled agent bodies change) and patching ~499 occurrences
across 19 files is a ruling rather than a size. Finding:
`agent-findings/2026-09-02-a-parsers-error-message-carries-the-input-that-broke-it.md`.

## 2026-09-02 - CLI-856: a directory's kind is stated rather than inferred from what happens to sit in it

`classify()` read a directory's KIND off whether it currently held any specs, so `e2e/fixtures/`
counted as a non-spec directory purely because it never had. The CLI-849 lane put one there and
broke four gates through `fixtures/dual-scope-helpers.initGlobalWithEject`, a symbolic reference
that had nothing to do with its change - **the failure named a journey row and a helper, neither of
which had moved.**

`SPEC_DIRECTORIES` is now a stated `readonly string[]` the reader consults. The old derivation
became the exported `specDirectoriesIn`, used **only** by a roster gate that holds the two against
each other with `toStrictEqual` - the reader must not consult it, or the coupling returns, and a
gate comparing a derivation against itself agrees whatever the tree does. **The module's docblock
had explicitly argued against a hand-kept list**, on the grounds that a new directory's rows would
go unjudged and nothing would say so; that objection is answered by the gate rather than ignored,
and the mutation check proves it - dropping `pages` produces one assertion naming the directory and
the side it is missing from.

**Both reds were watched, and the second is why the fix is trustworthy.** The pure reproduction
takes the spec list as a parameter, so the fragility reproduces with no fixture tree: two readings
of one page differing by a member no assertion mentions. But a pure test alone does not prove the
row's claim about `spec-gates.test.ts`, so a throwaway spec was written into `e2e/fixtures/` and the
gates run against the real tree both ways - **five reds with the derivation restored, one after**,
and that one is the correct self-explanatory "a spec belongs to no journey" a new spec should
produce.

**The exposure bound was measured rather than assumed**, and measured wider than the row claimed:
across the whole page rather than the From-scratch column, `fixtures` is the only spec-free
subdirectory the page uses as a prefix. `assertions` and `helpers` are the other two and the page
uses neither. A class census found one candidate sibling, `holdsTypeScript()` in
`check-shared-eslint-config.ts`, and correctly rejected it - **there the kind and the contents are
the same fact**, since a workspace gaining its first `.ts` genuinely does need an ESLint config,
where in `classify()` they were different facts that merely coincided.

Two alternatives were rejected with reasons: threading the recognised-names roster into `classify()`
is the existing finding's own proposal and would make the gate tautological, handing the reader the
roster it is then measured against; and documenting a pre-flight step was the pre-refused option.
The 2026-09-01 finding was marked `resolved` and its Residual - "the mechanism is unfixed" - closed.
`factories.md` reddened `check-enumeration-drift` for two unnamed exports; the lane verified the
diff, reverted it byte-exactly, and reported it rather than editing `.ai-docs`. Gates: the full unit suite green. (Figure deleted 2026-09-02 rather than re-measured.)

## 2026-09-02 - CLI-870 (was CLI-857): the one request leaving the unit suite is made by a process no mock can reach

**CLI-857's premise was measured false and the row was replaced.** It claimed `linkSharedCache`'s
reach was a hazard - that a spec pointing HOME itself could download a marketplace again.
Instrumenting every `fetch` and `http/https.request` across the whole suite found **zero** marketplace
requests and **zero** giget calls, with the instrument validated against a real `downloadTemplate`
first so a download could not have hidden from it. All three fixes that row proposed were work
against a measured payoff of nothing, and one of them would have been actively harmful: linking
`.cache` into more homes without closing the env door routes the update-check child's
`<home>/.cache/agents-inc/version` write into the machine-wide fixture at
`/tmp/agents-inc-unit-shared-cache`, masking the escape behind the plugin's throttle rather than
fixing it.

**Exactly one request left the process**, from `@oclif/plugin-warn-if-update-available`'s detached
child to `registry.npmjs.org`. `vitest.setup.ts` now pins `AGENTS_INC_SKIP_NEW_VERSION_CHECK`
process-wide, which is where a process-wide variable naming no home always belonged -
`isolated-home.ts` set it per fake home, which is exactly what left every spec building its own home
exposed.

|        | files | tests | off-machine requests |
| ------ | ----- | ----- | -------------------- |
| before | 222   | 7432  | **1**                |
| after  | 222   | 7432  | **0**                |

`commands/edit.test.ts` alone: 1 escape at 3/3 before, 0 at 3/3 after. `/tmp/vitest-home-*`
survivors after a run: 1 before, 0 after - the resurrection side of the same child, and the other
half of this suite's `ENOTEMPTY: rmdir` failures.

**The brief's attribution was wrong and the correction widened the row.** It named a describe block
that hand-rolls a fake home; a `child_process.spawn` stack trace puts the escape in
`describe("no installation found")`, **which sets up no fake home at all**. The named block could
not have been the source: it reaches oclif through `Edit.run(...)`, and `Command.run` never calls
`runHook("init")`. The door is oclif's top-level `run()`, which only `runCliCommand` reaches - so the
hole is **any `runCliCommand` outside a fake home**, not a hand-rolled home specifically.

**No in-process interceptor could ever have caught this**, which is a stronger reason than the one
CLI-857 gave for rejecting a `globalThis.fetch` guard: the request is made by a different process.
The spec asserts oclif's own `scopedEnvVarTrue("SKIP_NEW_VERSION_CHECK")` predicate rather than the
variable's spelling, so an `oclif.bin` rename reddens it instead of leaving it green over a dead
variable, and it pins the open door beside the closed one. Side effects were checked rather than
assumed: every reference to the update-check path in `src`, `e2e` and `scripts` exists to close it,
and nothing asserts the check runs.

The lane also reported, rather than made, a latent hazard its own change creates two files over:
`isolated-home.test.ts` deletes a variable that used to be naturally absent and is now a
process-wide pin, so those tests withdraw it and never restore it. Latent rather than live, and
closed separately. Gates: `turbo test`, `turbo lint`, typecheck across three projects and `deps:check`, all green at the
time of landing. (Task counts deleted 2026-09-02 — the package suite measured differently under
concurrent load.)

## 2026-09-03 - EDITOR-73: the kept snapshot survives the next save, and both proposed fixes were wrong

EDITOR-67 stopped signing in from deleting a scope-conflicted snapshot. **It closed the sign-in
moment and re-opened one Save later** - `save` cleared `unadopted` on ANY save, so
`keepsLocalSlot = !account || unadopted !== null` went false, and `adoptLocalStack` returned early on
`stacks.length > 0` so the reason was never recomputed. The snapshot stayed in `localStorage`,
unshown: word for word the shape EDITOR-67 fixed.

**The dispatch offered two candidate edits and the code refused both as written**, which is the
useful part of this entry.

_Clear `unadopted` only when the save is of the local slot itself_ is **unreachable in scope**. A
signed-in save never writes the local slot - `roster-panel.tsx` calls `saveStack(payload)` only in
the signed-out branch - so the snapshot is byte-identical after any signed-in save; and for the
`unwritable` refusal a local-slot save cannot succeed at all, because the mint is refused before
`save` is reached. `save(name, configId)` receives no payload and so cannot tell. **The fix is that
`save` stops writing `unadopted` at all: a writer that cannot know what it is asserting should not
assert it.**

_Recompute by re-attempting adoption_ would **upload a duplicate on every load** and redden the
shipped `leaves an account that already has stacks alone` spec. The shape that works is cheaper:
`unwritable` is decided LOCALLY, before any request, by `writeContractProblems`. So the branch asks
the write contract for free - `return { stacks, unadopted: writeContractRefusal(local) }`. Every
write the editor makes crosses that same gate, so a snapshot the contract refuses cannot be in the
account by any route. **"We did not try" and "it is in there" were being answered identically.**

**The notice is deliberately not dismissible, and the reasoning is now in the JSX.** A dismiss
control has two honest behaviours and both are worse than none: clear the notice and keep the cell,
recreating the unexplained-slot confusion EDITOR-67 closed; or clear both, which is this row's own
data loss with the user's finger on it. It is already dismissible by the route its own copy names -
repair the snapshot and save it. A "hide this" button could be labelled honestly only as "hide my
work".

**One pinned assertion changed shape and it was stated rather than quietly rewritten**: two cells
named "Saved stack" is now the ACCEPTED outcome rather than a case ruled out, because every
signed-in save carries `SAVED_STACK_NAME` and the old guarantee was never buying what it claimed.
Both false-invariant comments were corrected - a comment asserting an invariant is the most reliable
way to stop the next reader checking it.

Mutation-checked rather than assumed: reverting either half of the fix reddens its own spec while the
permitted twins stay green, which is what makes them controls. The `test.fail()` pin was confirmed as
an expected failure first, then converted to an ordinary passing test in the same change. A class
census over refusals held as state found three others, none in the class - the other two are
component-local with every writer in one file, and one is payload-keyed so it self-invalidates.

Filed from this lane: **EDITOR-74**. Gates: full editor E2E including a11y, the unit suites,
typecheck, lint and prettier, all green.

## 2026-09-03 - the ready-rows programme closed: ten lanes, a verification pass, and what the corrections measured

Eight rows were dispatched one lane at a time on owner instruction, each through the full SDLC. Two
were re-dispatched after their own lane refused them. A read-only verification pass then re-checked
every landing, and a docs lane closed step 5, which had been withheld from all ten lanes by design.
The run sheet at `plans/ready-rows-programme.md` was deleted when the second pass finished; this
entry is what survives it.

**Two rows were destroyed by the lanes sent to build them, and both refusals were right.** CLI-855
was filed against the store's 429 body and narrowed by a scrutiny pass to "the 429 alone"; `Too many
requests` is the HTTP reason phrase for 429 verbatim, so the status the row named must not be quoted
and the 503 it dismissed was the only one that qualified. CLI-857 claimed `linkSharedCache`'s reach
was a hazard; instrumenting every request across the suite found zero marketplace calls and exactly
one escape - oclif's detached update-check child - which became CLI-870. **In both cases the error
was in the narrowing, not the original filing.**

**The corrections ledger is the measurement worth keeping.** Ten dispatches produced roughly thirty
corrections. Two briefs named files that do not exist. One of those created a lane collision, because
the ownership map was built on a path that had never existed. Three briefs argued for a fix the code
then refused - a shape that was structurally unavailable, a placement that would have killed the arm
it was copying, and a recompute that would have posted a duplicate on every load. **The last brief of
the programme was the first with no corrections at all.**

**Three census claims were wrong in the same direction, and the third correction is the general
one.** CLI-854's row said three boundaries; the dispatch corrected it to five; the lane found the two
that mattered were in neither - `formatZodIssue` and `getErrorMessage`, at ninety-odd call sites
between them. **The right census is keyed on which RENDERER foreign text funnels through, not on
where it is printed.**

**What the verification pass caught that no gate could.** CLI-867's record named the wrong
regression - it said two documents instructed a reader to re-collapse the pre-push invocations, when
both argued the suites do not belong in the hook at all. The claim had propagated to five files,
including the finding whose own subject is that exact misreading. **Every check this repository owns
reads whether a citation resolves, never whether a characterisation is true.**

**Two rows shipped correct code that no test defended.** Renaming EDITOR-69's discriminator together
with its own assertion - the shape a rename actually takes - left every suite green while the editor
reverted to blaming a model that was never called. Tightening CLI-855's `.startsWith` to `===` left
the seed suite green while silencing the one refusal it exists to deliver. Both were caught by
mutants that SURVIVED, and both fixes were one or two test lines. The unifying thesis, now a finding:
**a double or harness that differs from production in exactly the dimension the code discriminates on
cannot test that dimension** - MSW's bare `text/plain` against hono's `charset=UTF-8`,
`runCliCommand` stripping ANSI before an assertion about ANSI.

**A fix that closed a defect at one moment and re-opened it at the next.** EDITOR-67 stopped sign-in
deleting a scope-conflicted snapshot; EDITOR-73 found the kept slot vanishing on the next unrelated
save. The repository's twin-pinning rule was obeyed exactly and could not reach it: **the rule
constrains what a refusal is paired with and says nothing about when either half is observed.**

**Process lessons, recorded because the run sheet carrying them is gone.** The briefing template used
for all ten dispatches said "do NOT touch `.ai-docs`" and "write a finding to `.ai-docs/agent-findings/`"
in the same brief; lanes silently resolved it by writing the finding until one refused and surfaced
the contradiction, which was the better behaviour. Concurrent mutation-verification contaminated three
lanes - one verifier preserved mtimes so its mutants slipped past the staleness guard, another
triggered `dist` rebuilds mid-run - so **a mutation pass needs one worktree per lane or a serialised
schedule**, and no full-suite figure taken during one is evidence. Five unreproducible gate counts
were deleted from this file rather than re-measured, on the repository's own rule that a record
carries the command and not its result.

Filed by these lanes and still open: CLI-865, CLI-868, CLI-869, EDITOR-70, EDITOR-71, EDITOR-72,
EDITOR-74 and REPO-42. EDITOR-55 was unblocked by an owner ruling on 2026-09-03 - the main column is
just wide enough to wrap three cards instead of four, which puts its floor at roughly 943px and gives
a card 1.8x the width it has at four across on the design's own 1240px floor.
