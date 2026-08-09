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
