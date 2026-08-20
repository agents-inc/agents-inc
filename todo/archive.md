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
