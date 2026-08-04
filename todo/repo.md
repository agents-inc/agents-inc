# Repository — build tracker

Outstanding work on the repository itself: getting CI green again, deploying, tool versions,
external service names, and what this repository publishes. Its sibling trackers: the
configurator is [`editor.md`](./editor.md), the site is [`www.md`](./www.md), the API worker is
[`server.md`](./server.md), and the CLI is [`cli.md`](./cli.md).

**An item is deleted when it lands rather than ticked off**, so everything below is still open.
There is no done column and nothing is struck through. Landed items get one line each in
[`archive.md`](./archive.md).

**Rows are one-liners.** Detail lives below the table under the item's ID. Each ID permanently
carries the identifier the item had before this folder existed.

**Roughly ordered by what to do first.** CI has been green on all three jobs since 2026-08-04, so
nothing here is on fire. REPO-21 is the largest piece of work and the one everything else waits
behind. REPO-04 and REPO-05 are a pair — the site can deploy, and the Worker rename rides along
with that deploy. Nothing after REPO-05 depends on order.

| ID                                                                   | Task                                                                                      | Status           | Type     | Complexity |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------- | -------- | ---------- |
| REPO-21 (was the rename plan, 2026-08-04)                            | Collapse the two npm packages into one — `agents-inc` becomes the real CLI                | Ready for Dev    | refactor | easy       |
| REPO-22 (new, 2026-08-04)                                            | CI has no job timeout — a hung suite runs for six hours before GitHub stops it            | Ready for Dev    | bug      | easy       |
| REPO-23 (new, 2026-08-04)                                            | Revisit `retry: 2` and the e2e worker cap now that the CI hang is fixed                   | Investigate      | refactor | easy       |
| REPO-24 (new, 2026-08-04)                                            | Drop the `@agents-inc/cli/config` jiti alias once nobody is on the old package            | Investigate      | refactor | easy       |
| REPO-04 (was editor-todo item 13)                                    | Nothing is configured to deploy `apps/www` — no wrangler, route, deploy script or task    | Ready for Dev    | feature  | complex    |
| REPO-05 (was editor-todo item 18)                                    | Cloudflare, Sentry and PostHog are still registered as `agents-inc-web`                   | Ready for Dev    | refactor | complex    |
| REPO-06 (was monorepo-merge "Unify the tool versions")               | ESLint 10, TypeScript 6, React 19, Vitest 4 — and delete three split-only workarounds     | Ready for Dev    | refactor | complex    |
| REPO-07 (was monorepo-merge "Delete ~/dev/agents-inc-web-monorepo")  | Delete the old web monorepo once this repository is trusted                               | Needs Assistance | refactor | easy       |
| REPO-09 (was monorepo-merge "Decide what a local `.env` should say") | A local `.env` can ship a live site whose every request goes to your own machine          | Needs Assistance | bug      | easy       |
| REPO-10 (was monorepo-merge "Three gaps in the safety nets")         | Catalog check blind to new files, build scripts never typechecked, 1,179 md files rebuild | Ready for Dev    | bug      | complex    |
| REPO-11 (was monorepo-merge "16 compiled test files")                | The published package ships 16 compiled test files, 32 with their source maps             | Ready for Dev    | bug      | easy       |
| REPO-12 (was monorepo-merge "Two npm calls")                         | `generate:schemas` still runs `npx tsx` and `npm run` in a bun-only repo                  | Ready for Dev    | refactor | easy       |
| REPO-13 (was monorepo-merge "Small leftovers")                       | `files` names a `config/` folder that does not exist; a CI comment says 88 E2E specs      | Ready for Dev    | bug      | easy       |
| REPO-14 (was editor-todo item 15)                                    | `docs/cli/` and the site hold the same ten documents and nobody owns the source           | Needs Assistance | refactor | complex    |
| REPO-15 (was editor-todo item 16)                                    | The repository publishes `.ai-docs/` and `todo/` — leave them, or stop shipping them      | Needs Assistance | refactor | complex    |
| REPO-16 (was editor-todo item 17)                                    | `/home/vince/dev/skills` is in eight tracked files at `HEAD`                              | Needs Assistance | bug      | easy       |

---

## Active items

#### REPO-04: Nothing is configured to deploy `apps/www`

There is no `wrangler.jsonc`, no Cloudflare route, no deploy script and no `deploy` task for
`apps/www` — deployment was out of scope while it was being built. **The site cannot be deployed as
it stands.** Verified 2026-08-04: the workspace's scripts are `dev`, `build`, `preview`, `lint` and
`typecheck`, and there is no wrangler dependency.

**Why creating the workspace was not enough.** Turborepo needs no root changes — the `apps/*`
workspace glob and the root `build` / `deploy` / `dev` task definitions already cover a new app. But
a turbo task only runs where the workspace declares a script of that name, so CI's `turbo deploy`
fans out to workspaces carrying a `deploy` script, and `apps/www` carries none.

**Do this as one piece of work with REPO-05 and with [`www.md`](./www.md) WWW-03.** A Worker for the
site has to be created either way; WWW-03 has the apex Custom Domain going to this Astro build with
the editor moving to a Route at `agentsinc.sh/editor*`; and REPO-05 renames the editor's Worker. All
three touch the same two Workers and the same Custom Domain, so taken together the apex moves once
instead of three times.

---

#### REPO-05: Three external services still carry the old name

`agents-inc-web` is registered in three places outside this repository. The rename that swept the
word "configurator" out of the prose could not touch any of them, because none of them is a name this
repository owns — each is an identifier in somebody else's system that a line here merely points at.
**They are grouped because they share that shape, not because they share a fix: the cost is different
for each, and two of them break something if the steps are taken in the wrong order.**

**Cloudflare — a planned cutover, not an edit.** `apps/editor/wrangler.jsonc` declares
`"name": "agents-inc-web"` (line 14, verified 2026-08-04), and that is the deployed Worker's service
name. Changing the line does not rename the Worker. The next `wrangler deploy` reads the new name,
finds no Worker called that, and creates a **second** one — while the original keeps running and
keeps holding the Custom Domain on the apex. So the result of "just editing it" is two Workers, the
live site still served by the old one, and every subsequent deploy going quietly to a Worker no
visitor reaches. The file's own comment records the real sequence: rename in the Cloudflare
dashboard, move the Custom Domain across, delete the old Worker — and only then does the line in this
repository need to agree. **Renaming it on its own, ahead of REPO-04, buys nothing and spends the
risky part twice.**

**Sentry — the order is the whole item, and backwards it fails the build.**
`.github/workflows/ci.yml:127` sets `SENTRY_PROJECT: agents-inc-web`, which is a project slug in an
external Sentry account. **Rename the project in Sentry first, then update the workflow.** In that
order nothing ever points at a slug that does not exist. In the other order — workflow first — every
source-map upload targets a project Sentry has never heard of and fails, so CI fails, and it fails on
a line that reads like a typo rather than like a missing rename.

**The DSN is separate and does not change.** `VITE_SENTRY_DSN` is a secret carrying a numeric project
id rather than the slug, so renaming the project in Sentry leaves it valid. Nothing has to be
rotated, and builds already released keep reporting.

**PostHog — cosmetic, and safe at any time.** Checked rather than assumed: the only PostHog
identifiers anywhere in this repository are `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` — declared in
`apps/editor/src/env.schema.ts`, offered in `apps/editor/.env.example`, passed through
`.github/workflows/ci.yml` — and `posthog.init` in `apps/editor/src/lib/analytics/posthog.ts` is
given only the key and the host. **No PostHog project name appears anywhere.** A project key is not
derived from the project's name, so renaming it in the PostHog dashboard changes a label there and
nothing here. Do it whenever, or leave it.

**The smaller naming leftovers, none of them urgent.**

- **`apps/editor/src/features/configure/` was left alone, and it is a question rather than an
  oversight.** The word there is `configure`, not `configurator` — it names the screen the way
  `/editor` names the route, and it matches the CLI's own verb, `agents-inc edit`. Renaming it would
  be a code refactor rather than a rename: every import of the feature, the E2E page object
  `apps/editor/e2e/pages/configure-page.ts`, and several documents. Nobody has said the directory is
  wrong, so nothing was changed on the assumption that it is.
- **`Configurator v5` survives in `packages/ui/src/styles/globals.css` and
  `apps/www/src/styles/site.css`** because it names `.claude-design/design/Configurator v5.dc.html`,
  a file that exists on disk under that name. It is a citation, so it can only change if the design
  file is renamed with it.
- **Two layout tables now read `editor/` → "the editor"** — the root `README.md` and the merge notes.
  Accurate but tautological: that column exists to say what the directory is, and "the configurator"
  was doing that job. Whether it wants a better gloss is a copy decision rather than a naming one.

---

#### REPO-06: Unify the tool versions

Get everything onto **ESLint 10, TypeScript 6, React 19 and Vitest 4.** Today the CLI sits on the
older half of each pair (React 18, Vitest 4, TypeScript 5.7, ESLint 9) and the web code on the newer
(React 19, Vitest 3 in the worker, TypeScript 6, ESLint 10). Unifying them was deliberately kept out
of the merge so that if the CLI broke afterwards, the move was the only thing that could have caused
it.

**The hard part is React.** The CLI draws its wizard with Ink 5, which requires React 18. React 19
means Ink 6, and Ink 6 changed enough that **rewriting the wizard's tests is the real cost of the
whole exercise.** ESLint, TypeScript and Vitest are close to mechanical by comparison.

Leaving it costs nothing today, but every future dependency decision has to be made twice.

### The four workarounds that must be deleted with it

**This row is the only place these are recorded.** They exist solely to hold the version split
together, they are deliberately not documented as architecture anywhere, and leaving any of them in
place after the versions match would silently let the split come back.

1. **`packages/ui/tsconfig.json` — the `paths` entry.** After the merge, the root slot for React's
   type definitions went to React 18, because the CLI needs it for Ink. Every React 19 consumer then
   got a private copy. TypeScript treats two copies of the same version as two unrelated things, so
   passing a value from a Base UI component into a design-system component stopped compiling. The
   obvious fix — telling bun "React 19 for the browser half only" — is not possible: bun supports
   neither nested overrides nor scoped resolutions, and a blanket rule would force React 19 onto the
   CLI, which is the change the merge deliberately avoided. So this `paths` entry points at a single
   copy, with a fallback for the day React 19 does win the root slot.
2. **`apps/editor/tsconfig.app.json` — the same `paths` entry**, for the same reason. Without it the
   web app's build died before it started bundling. Nothing was ever wrong at runtime.
3. **`apps/server/vitest.config.ts` — the Vitest redirect.** `apps/server` pins Vitest 3 and runs it
   inside a simulated Cloudflare runtime; the CLI pins Vitest 4 and won the root slot. Vitest
   deliberately looks up its own internal pieces from the repository root rather than from whoever
   asked for them, so the worker's Vitest 3 was handed Vitest 4's internals and died on startup —
   **zero tests ran, not even a failure.** The config now redirects those internal lookups to the
   Vitest sitting next to it.
4. **The root `package.json` — `react` and `@types/react` at 18, imported by nothing.** Added
   2026-08-04 with REPO-21. Items 1 and 2 above say "the root slot for React's type definitions went
   to React 18, because the CLI needs it for Ink" — that was true, but it was never decided. It fell
   out of the workspace being named `@agents-inc/cli`, which bun resolved ahead of `editor` and
   `@workspace/ui`. Renaming the package to `agents-inc` moved it behind them and handed the slot to
   React 19. Ink declares React as a **peer** dependency, so it never gets a nested copy and always
   takes the hoisted one; the CLI's own files kept resolving their nested React 18. Two React
   instances in one tree, and **353 unit tests died on an error about React children that names
   nothing to do with any of this.** Declaring the pair at the root wins the slot deterministically,
   because the root workspace's own dependencies always sit at the root of `node_modules`. Nothing at
   the root imports React and nothing should.

All four carry their full explanation in a comment at the site. Items 1-3 were verified still
present on 2026-08-04.

**A fifth thing goes with them.** `.syncpackrc.cjs` carries two version groups: one suppresses
CLI-versus-web disagreements so `bun run deps:check` stays quiet, the other stops the root React pin
in item 4 being reported as drift. Both comments say to delete the group once the versions are
unified — leaving either in place afterwards would silently let the CLI drift again. **Those comments
name this row by ID**, and so do the syncpack labels beside them, so renaming or retiring REPO-06
means editing `.syncpackrc.cjs` with it.

---

#### REPO-07: Delete `~/dev/agents-inc-web-monorepo`

The old web repository is left on disk untouched. Nothing was moved out of it — everything was
copied, so it is still a complete working copy of the web half.

**That is the safety net, but it is also a second place the same code lives, and an easy one to edit
by mistake.** This item used to say "delete it after the merge is committed and CI has run once".

**Both of those have now happened, so here is what they said.** The merge is committed as six commits
and pushed — `main` and `origin/main` are both `d5fa4027`. CI ran on that push and **failed**, but it
failed twice on CI gaps rather than on the merge, both since fixed. It has since gone green on all
three jobs. **The job that covers the copied web code, `check-web`, passed in full from the start** — vendored-catalog check, typechecks, lint, unit suites and the
Playwright run.

So the question this item was waiting on is answered for the web half: it survived the move. Deleting
the old repository is now a judgement about how long you want the safety net, not a condition anyone
is still waiting on.

---

#### REPO-09: Decide what a local `.env` should say

The README tells you to copy `apps/editor/.env.example`, which points the app at
`http://localhost:8787`. That is right for development.

**But `bun run deploy` uploads whatever was built last without rebuilding**, so if you build locally
and then deploy by hand, you ship a live site whose every request goes to your own machine. This has
happened once already — a local `.env` made during the merge was deleted for exactly this reason, and
the setup step was written down instead.

CI is safe: it sets the real address explicitly.

**Options:** leave it and remember, or make the deploy script rebuild with the production value.

---

#### REPO-10: Three gaps in the safety nets

None of them is new, and none of them is caused by the merge.

1. **The catalog check cannot see a new file.** CI checks the vendored catalog by regenerating it and
   looking for changes, using a comparison that cannot see files that did not exist before — so if
   the generator ever starts emitting a new file, CI would pass while the catalog was incomplete.
2. **The build scripts are never typechecked in CI.** `packages/cli` has a command for typechecking
   them, but nothing in the task graph calls it.
3. **Editing one line of prose forces a full rebuild.** The CLI's build is treated as out of date
   whenever any file in the package changes, and the package contains 1,179 markdown files.

---

#### REPO-11: The published package ships 16 compiled test files

Sixteen compiled test files, 32 with their source maps.

**This predates the merge:** the build's file pattern picks up tests sitting next to the components
they test. Users download them and never run them.

**Recounted on 2026-08-04 from the published package rather than from the working tree.**
`npm pack @agents-inc/cli@0.149.1` in an empty directory gives 16 `dist/**/*.test.js` files and their
16 `.map` siblings. **The two figures above are right as they stand.**

**A recount can easily come out at 50, and 50 would be wrong.** Searching the tarball's `dist/` paths
for the letters "test" also matches 18 files under `dist/src/agents/tester/` — the tester agents'
own prompt material, which the package is supposed to ship. Match on the `.test.js` suffix, not on
the word.

---

#### REPO-12: Two npm calls left in a bun-only repo

In `packages/cli/package.json`, `generate:schemas` runs `npx tsx …` (line 86) and
`generate:schemas:check` runs `npm run …` (line 87). Both verified still present 2026-08-04.

Both still work and neither runs in CI. **Swapping `npx tsx` for bun would change how that script
executes TypeScript, so it wants a moment's thought rather than a blind replacement.**

---

#### REPO-13: Small leftovers

- **The CLI's `files` list still names a `config/` folder that does not exist** (line 22 of
  `packages/cli/package.json`). Harmless, and it never existed, so this is not merge damage.
- **A comment in the CI workflow says the web end-to-end suite has 88 specs** (`.github/workflows/ci.yml:55`).
  It has 177 tests across 17 files.

---

#### REPO-14: Two copies of the same ten documents, and nobody owns the source

Ten documents exist twice: the originals under `docs/cli/guides/` and `docs/cli/reference/`, and the
copies migrated into `apps/www/src/content/docs/docs/`. There are eleven originals — nine guides and
two reference documents — but only ten were migrated. The eleventh, `guides/agent-reminders.md`, was
deliberately left off the site because it is contributor material rather than something a reader of
the site needs, so it exists only in `docs/cli/` and has nothing to drift against. REPO-16 depends on
that original staying where it is.

The copies were edited on the way — the leading `# Heading` stripped from each, and every link
rewritten either to a site path or to a full GitHub URL. The originals were left exactly as they
were.

**Two copies of ten documents will drift, and the drift will be silent. Somebody has to decide which
one is the source.** The obvious answer is the site, with `docs/cli/` deleted, because the site is
what a reader sees — but that is a decision, not a cleanup, and `docs/cli/index.md` was not migrated
(it is a repository index rather than a page), so it would need somewhere to go.

**One file moved rather than duplicated:** `guides/install-modes.md` became
`concepts/install-modes.md` on the site, so the site's guide ordering has a gap at 2. Invisible to
readers.

**Two smaller things left alone deliberately, both flagged rather than fixed.**

- `reference/architecture.md` shows a config using `defineConfig`, while `guides/editing-config.md`
  shows the shape that ends in `satisfies ProjectConfig`. Both are real, and `defineConfig` is
  genuinely exported, but the config-writer tests assert that generated configs do **not** contain it
  — so architecture's example is a valid hand-authored form rather than what `init` writes, and that
  distinction is nowhere on the page.
- `install-modes` says plugins install "in `.claude/plugins/`" where `architecture.md` says "Claude
  plugin cache". The registry is `~/.claude/plugins/installed_plugins.json` and `validate` walks both
  the global and the project path, so the first is imprecise rather than wrong.

The four source-file accuracy defects inside `docs/cli/` are listed in [`www.md`](./www.md) WWW-01,
because they are the material the site is drawn from. Whoever answers this item should fix them or
retire the files they live in.

---

#### REPO-15: The repository publishes its own internal notes

**The fact, verified.** `github.com/agents-inc/agents-inc` already serves `.ai-docs/` and `todo/` from the
root of the repository, publicly, and has done for months. Checked directly: `main` and `origin/main`
are the same commit, that commit's tree carries `.ai-docs/` with 233 files and `todo/` with 2, the
first of them landed on 2026-02-25, and 246 of the repository's 1,290 commits touch them. The merge
does not change any of that — it relocates them, so after the push the same material is public at
`packages/cli/.ai-docs/` and `packages/cli/todo/` instead. **This folder — the root `todo/` — is one
more of the same shape.**

**Why this is worth writing down now.** A lot of care went into keeping internal engineering material
off the documentation site. That work is finished, and it was the right work: the site is where a
user actually lands, and a stranger reading a defect list on a documentation page concludes the
project is half-finished. But whatever the site does or does not carry, the same notes have been one
click away in the repository the whole time. Nobody had recorded that, so it has never been a
decision — only an accident nobody noticed.

**The choice, and it is yours.**

- **Leave them public.** Plenty of projects publish their working notes, and the reader who goes
  looking in a repository's dotfolders is a contributor, not a confused first-time user. The real
  problem was the documentation site surfacing them to people who did not ask, and that is already
  fixed. Cost: nothing.
- **Stop shipping them.** This is two separate pieces of work, and only the first is small. Adding
  `packages/cli/.ai-docs/` and `packages/cli/todo/` to `.gitignore` stops future commits — but the
  material is already pushed, so removing it means rewriting history across 246 commits and
  force-pushing over a repository that has stars, forks and clones. Every existing commit hash
  changes, anyone with a clone has to re-clone, and GitHub still serves the old objects by hash for a
  while afterwards. It also gives up whatever value the notes have to a contributor.

**Leaving them is far cheaper**, and it is cheaper by a wide margin rather than a narrow one: one is
free and the other is a force-pushed history rewrite of a public repository. That is a reason, not a
decision — the material is yours and the judgement about what should be visible is yours. Nothing
here is blocking, **and nothing here should be done by an agent.**

---

#### REPO-16: A personal home directory is published in the repository

The literal path `/home/vince/dev/skills` is in eight tracked files at `HEAD` — the same commit as
`origin/main`.

**Five sit inside `.ai-docs/` and `todo/`,** which is exactly the material REPO-15 already covers and
already recommends leaving alone. **The other three sit outside it and nothing records them:**
`CLAUDE.md`, `docs/guides/agent-reminders.md` and `e2e/FINDINGS.md` — after the merge,
`packages/cli/CLAUDE.md`, `docs/cli/guides/agent-reminders.md` and `packages/cli/e2e/FINDINGS.md`.

Dropping `agent-reminders.md` from the documentation site removed the path from what a reader
browsing the documentation sees. It did not remove it from the repository, and the original is
deliberately kept for contributors (REPO-14).

**This is REPO-15's decision on REPO-15's terms, and it does not change that item's answer.** The
path is already pushed, so editing the working tree stops it reaching new commits and leaves history
exactly as REPO-15 describes. Only the cheap half is smaller here: three files, one line each. Not a
bug, not blocking, and not an agent's call.

---

#### REPO-21: Collapse the two npm packages into one

**This replaces the rename plan, which is dead.** `agentsinc` on GitHub is an organisation called
AGENTS.inc, created 2013-08-13, ten followers, no public repos — dormant but twelve years old and not
a squatter by GitHub's definition, so a dispute would fail. Without the org the rename produces
_three_ names instead of today's two: npm and the marketplace saying `agentsinc`, GitHub saying
`agents-inc`. Worse than doing nothing.

And nothing is actually inconsistent today. The GitHub org, the npm scope, the unscoped package and
the marketplace id all say `agents-inc`. Only the domain differs, because `agents-inc.sh` reads
badly — a constraint of the domain, not a naming decision.

**What survives is the part that was never about the name.** Two packages are published where one
would do: `@agents-inc/cli` is the CLI, and `agents-inc` is a three-line shim that imports it so
`npx agents-inc init` works without the scope.

The shim is not free. Its own README explains why it must be republished at the same version on
every release: `npx` caches by package spec, so an unbumped `agents-inc` keeps serving whatever it
resolved to first. It is step 8 of the release checklist, and forgetting it hands users a stale CLI
with no error — a silent failure guarded by a manual step.

**Make the unscoped package the real one.** `agents-inc@0.150.0` ships the CLI instead of the shim;
`@agents-inc/cli` is deprecated pointing at it.

**Nothing breaks.** `npx agents-inc init` behaves exactly as now, minus a hop. `DEFAULT_PLUGIN_NAME`
does not move, so no existing install's `<skill>@agents-inc` refs are touched. The schema addresses
do not move. The GitHub org and repo do not move. Generated configs import from `./config-types`, a
relative path — verified — so no config file on disk references the package name at all.

**The work:** `packages/cli/package.json` name → `agents-inc` · delete `packages/cli/alias/` · delete
the lockstep rule from the release checklist in `.ai-docs/standards/commit-protocol.md` · the
`./config` subpath becomes `agents-inc/config`, so keep `config-loader.ts`'s jiti alias accepting
both spellings for anything hand-authored against the old one · `bin` already registers both
`agents-inc` and `agentsinc` and needs no change.

**Publish order:** `agents-inc@0.150.0` first, then `npm deprecate @agents-inc/cli` pointing at it.
Minor rather than patch — packaging changes, behaviour does not.

**Check after:** `npx agents-inc init` from a cleared `npx` cache · `@agents-inc/cli` still installs,
since deprecating does not remove · a config importing `@agents-inc/cli/config` still loads.

#### REPO-22: CI has no job timeout

Nothing stopped the run that hung for 49 minutes, and nothing would have stopped it at six hours —
that is GitHub's default and the only limit in play. Two runs burned roughly seventy minutes of
runner time producing no signal at all.

`timeout-minutes` on each job in `.github/workflows/ci.yml`. The end-to-end suite is the one that
needs a real number rather than a guess: it has never completed on a runner, so set it once a green
run gives an honest baseline, and until then set it generously — the point is to bound a hang, not
to police duration.

---

#### REPO-23: Revisit `retry: 2` and the worker cap

Both settings in `packages/cli/e2e/vitest.config.ts` were tuned against symptoms that are now partly
explained.

**`retry: 2`** exists to absorb pseudo-terminal flakiness. Some of that flakiness was very likely the
CI-detection bug fixed in `bd22dcac` — on any machine where `CI` happened to be set, Ink wrote no
frames and every wait timed out. Worth finding out how much of it survives the fix, because retries
currently triple the cost of a genuine failure and hide how long a failing run really takes.

**`maxWorkers`** was changed to `Math.min(16, availableParallelism())` in `f572b0eb` on a wrong
diagnosis of the hang. It stands on its own terms — 16 PTY-driven workers on a 4-core runner is
genuinely wrong — but it was never the cause, and the right value has still never been measured
against a working run.

Neither is urgent. Both want one green baseline first, and then a measurement rather than a guess.

---

#### REPO-24: Drop the old config import alias

`config-loader.ts` tells jiti how to resolve imports **inside a user's config file**. After REPO-21 it
carries two spellings: `agents-inc/config`, which is current, and `@agents-inc/cli/config`, which is
compatibility.

**Why the old one has to exist at all.** Anyone who hand-wrote a config following the documentation
imports from `@agents-inc/cli/config`. After the collapse they have `agents-inc` installed and
nothing under the old name in `node_modules`, so without the alias their config stops loading on
upgrade. Note this only affects hand-authored configs importing real data — `defaultStacks`,
`defaultCategories`, `defaultRules`. Everything `init` generates uses a relative type-only import and
never touches either spelling.

**Why it should not stay.** It is a live reference to a package name that will exist nowhere else in
the repository. Left indefinitely it reads as current rather than as a bridge, and the next person to
find it has to work out which.

**When to remove it.** When downloads of `@agents-inc/cli` are indistinguishable from bot traffic —
check `npm view @agents-inc/cli` against the deprecation date, or the npm downloads API. Given the
audience is a few dozen real users, that should be a short wait rather than a long one. Removing it
is deleting one key from a map; the risk is only that someone still on an old hand-written config
finds it stops loading, with an error naming the import, which is a recoverable failure rather than a
silent one.
