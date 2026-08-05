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
