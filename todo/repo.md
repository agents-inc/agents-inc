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
nothing here is on fire. The version unification and its whole tail — the syncpack groups, the CI
workarounds Ink used to force, the safety-net gaps, the shipped test files and the stray npm calls —
all landed 2026-08-05; see `archive.md`. What remains is REPO-04 and REPO-05 as a pair — the site
can deploy, and the Worker rename rides along with that deploy — the items that need a decision. Nothing after REPO-05 depends on order.

| ID                                                                   | Task                                                                                   | Status           | Type     | Complexity |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------- | -------- | ---------- |
| REPO-24 (new, 2026-08-04)                                            | Drop the `@agents-inc/cli/config` jiti alias once nobody is on the old package         | Investigate      | refactor | easy       |
| REPO-27 (new, 2026-08-06)                                            | The AI docs accrete history — they must describe the current state, not the journey    | Ready for Dev    | refactor | complex    |
| REPO-04 (was editor-todo item 13)                                    | Nothing is configured to deploy `apps/www` — no wrangler, route, deploy script or task | Ready for Dev    | feature  | complex    |
| REPO-05 (was editor-todo item 18)                                    | Cloudflare, Sentry and PostHog are still registered as `agents-inc-web`                | Ready for Dev    | refactor | complex    |
| REPO-07 (was monorepo-merge "Delete ~/dev/agents-inc-web-monorepo")  | Delete the old web monorepo once this repository is trusted                            | Needs Assistance | refactor | easy       |
| REPO-09 (was monorepo-merge "Decide what a local `.env` should say") | A local `.env` can ship a live site whose every request goes to your own machine       | Needs Assistance | bug      | easy       |
| REPO-14 (was editor-todo item 15)                                    | `docs/cli/` and the site hold the same ten documents and nobody owns the source        | Needs Assistance | refactor | complex    |
| REPO-15 (was editor-todo item 16)                                    | The repository publishes `.ai-docs/` and `todo/` — leave them, or stop shipping them   | Needs Assistance | refactor | complex    |
| REPO-16 (was editor-todo item 17)                                    | `/home/vince/dev/skills` is in eight tracked files at `HEAD`                           | Needs Assistance | bug      | easy       |

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

#### REPO-24: Drop the old config import alias

`config-loader.ts` tells jiti how to resolve imports **inside a user's config file**. It carries two
spellings: `agents-inc/config`, which is current, and `@agents-inc/cli/config`, which is
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

---

#### REPO-27: The AI docs accrete history instead of describing the state

`packages/cli/.ai-docs/` exists for one purpose: an efficient source for an AI to retrieve the
**actual current state** of the app — its architecture, its invariants, where things live and what
rules they obey. That is not what the documentation passes have been producing. Each pass is
additive: it records what was done, which tasks closed, what a previous pass got wrong, when each
claim was last checked. `DOCUMENTATION_MAP.md` is the clearest case — large chunks of it are
validation history and done-work narration, which an agent looking for how the app works today has
to read past.

**The distinction to enforce.** An invariant of the system is state and belongs: "every Ink render
goes through `components/render.ts`" is architecture. The chronology of how it got that way — which
date it landed, which pass documented it, which task ID drove it — is history and does not. The test
for any paragraph: does an agent implementing a feature tomorrow need this to be correct, or is it a
record of somebody having been correct in the past?

**Decisions may deserve a home, but probably already have one.** If decision records turn out to be
worth keeping, they can get their own dedicated place — but the git history is likely the better
provider: this repository's commit messages already carry the why at the moment it was decided, and
they never go stale because they are frozen to their commit. Do not create a decision log just to
have somewhere to move the clutter; cut it, and let `git log` be the archive.

**The fix is the convention, not just the content.** Pruning the accreted history out of the
existing documents is half the work. The other half is changing what governs the passes —
`.ai-docs/standards/documentation-bible.md` and the validation-annotation conventions — so the next
pass does not re-accrete. Otherwise this is mowing, not weeding. The dated `agent-findings/` records
are a deliberate exception: they are point-in-time evidence by design and say so.

---
