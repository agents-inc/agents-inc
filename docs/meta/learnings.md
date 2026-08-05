# What building this taught me

Written by reading all 1,307 commits, 28 Jan 2026 to 4 Aug 2026. 218 releases, 0.1.0 to 0.150.0.

Ordered by when each lesson actually turned up, not by how important it is.

---

## 1. The first week (28 Jan – 4 Feb, ~130 commits)

**What the commits show.** The initial commit was already 172 files and 36,689 lines of AI-written agent templates. By day four the CLI framework had been swapped out entirely (Commander.js to oclif + Ink). On 31 January alone, ten commands landed: `uninstall`, `search`, `info`, `outdated`, `update`, `doctor`, `diff`, `new skill`, `new agent`, `eject`. Most of them were deleted or hidden later: `config`/`diff`/`outdated` on 30 March, `info` on 6 April, `build stack` on 14 April, the `new:*` commands put behind feature flags on 15 April.

**Learnings.**

- Starting from 36,000 generated lines means starting from a codebase nobody has read. Every decision after that was made without knowing what was already there.
- A framework chosen in week one, before a single feature has proven itself, gets re-chosen. The migration was correct but it happened before there was anything to migrate.
- Ten commands in one day is ten commands of surface area and zero days of learning. The right scope was: list the skills, let me pick between them, write the file. That is genuinely all it needed to be for months.
- Twelve years of front-end work never required living inside code I didn't understand. In front end, code I can't follow is usually just badly written. That instinct doesn't survive here: this got complicated faster than I could read it, and I had no habit for that.

## 2. The renaming era (Feb – Mar)

**What the commits show.** Skill IDs to kebab-case (2 Feb). `snake_case` to `camelCase` everywhere (18 Feb). Domain-prefixed subcategory keys (19 Feb). `cliName` to `displayName` (27 Feb). Subcategory to category (1 Mar). `displayName` to `slug` (7 Mar). Local mode to eject mode (28 Mar). One agent renamed `documentor` → `scribe` on 21 March and `scribe` → `codex-keeper` four days later.

**Learnings.**

- Constant renaming means the core nouns of the thing were never decided. I was discovering the domain by rewriting it.
- A rename is cheap for AI to execute and expensive for me to review. That asymmetry is the whole trap: the cost lands on the only part of the loop that doesn't scale.

## 3. Types were the first thing that actually worked (9 – 16 Feb)

**What the commits show.** Narrowed union types, Zod at the parse boundaries, AJV replaced by Zod, branded types with an explicit cast pattern at the edges, later type guards replacing the casts and generated types derived from the skills catalog.

**Learning.**

- This was the first change that measurably reduced bugs, and it worked for one reason: the compiler checks it without me. That is the shape of a good guardrail — it fails on its own, it does not need me to notice.

## 4. Tests that passed and proved nothing (16 Feb – 9 Apr, and honestly until the end)

**What the commits show.** This is the worst thread in the history.

- 16 Feb: `test: skip failing tests to unblock npm publish`.
- 26 Feb: the first harness that actually spawns the CLI in a real terminal. That is commit 502 of 1,307 — a full month and 500 commits in, nothing had ever run the real binary.
- 14 Mar: `test: fix fake E2E tests` — end-to-end files that never invoked the CLI at all. They were unit tests sitting in the e2e folder, reporting coverage that didn't exist.
- 9 Apr: a sweep across 133 files replacing weak assertions with strict equality.
- 1 Aug: 25 more files where output was captured and then thrown away without being asserted.
- 4 Aug, the last week: still fixing how the terminal frames get read in component tests.

**Learnings.**

- A green suite is not evidence. The only question that matters is: what would this test have to see in order to fail? For a lot of these, the answer was nothing.
- Not mounting the real CLI in a real terminal on day one is the single most expensive decision in this repo. The bug swamp, the constant regressions, the inability to trust anything — all of it traces back to that one gap.
- AI reliably writes tests that pass. It does not write tests that fail for the right reason unless the assertion is spelled out. Left alone it will assert that something was called, not that the right thing happened.
- I blamed the tests, and I was partly right, but the fix I kept applying was more tests. More tests on a harness that can't observe the program just adds confidence without adding truth.

## 5. The scope swamp (2 Mar – 30 Jul)

**What the commits show.** Skills and agents installable at global scope or project scope. 228 commits mention scope; 56 of those are bug fixes. On 6 April I shipped seven releases in one day, all of them fixes to the same feature. Then the repo went silent for two and a half months (22 April to 9 July).

**Learnings.**

- One feature that touches every other feature will eat the project. Scope reached config generation, install, uninstall, compile, doctor, the whole wizard, and every test.
- Cross-cutting features are the last thing you build, not the middle thing. This one was built on foundations that were still moving underneath it.
- The two-and-a-half month gap is data. Five months of chasing one class of bug is what burnout looks like in a commit log.

## 6. Documentation became its own project (Feb – Aug)

**What the commits show.** 232 documentation commits, more than the 193 feature commits. The AI reference docs grew to 235 files. The todo folder is 903 files and 7.8 MB. There is a commit recording a "15-pass validation history" on the reference docs, one fixing factual errors in a findings report, one filing a finding that line numbers quoted in the docs had drifted, and one closing 90 findings files at once. Task IDs run D-1 to D-310.

**Learnings.**

- Documentation that describes code goes stale the moment the code changes. Keeping it true cost more than writing the code did, and it was still wrong often enough to mislead.
- Having AI refine twenty to-do items into twenty plan files produces twenty files to maintain, not twenty solved problems. A plan is only worth writing down if it gets executed the same day it's written.
- Keep only what can't be regenerated: decisions and the reasons behind them. Everything else the code should be able to say itself — and if it can't, that's a code problem.
- A backlog of 310 items isn't a backlog. It's a record of everything that was ever left half-finished.

## 7. Making the code readable — far too late (25 Mar – 19 Jul)

**What the commits show.** An operations layer of 26 composable operations on 26 March; the single-use ones dissolved the very next day. A finding about declarative programming filed 25 March. The expressive-TypeScript pass landed 19 July: commit 1,196 of 1,307, so 92% of the way through the project. It touched 113 files and rewrote about 3,700 lines.

**Learnings.**

- The refactor that finally made the code understandable came last. It should have come first, because it's the thing that would have made every step before it cheaper.
- Imperative code is where bugs hide from review. When I can't hold a function in my head, I can't judge whether the AI's version of it is right — so I approve it, and the bug ships.
- Readability is not an aesthetic preference here. It's the mechanism by which I stay able to supervise AI at all. The moment I stopped understanding the code, I stopped being able to catch anything, and from then on I was negotiating with the codebase instead of directing it.

## 8. The method itself was the problem (visible across the whole log)

**What the commits show.** Config moved from YAML to a TypeScript file on 28 Feb, then gained generated types, then dropped its wrapper function in favour of `satisfies`. The end state — one package, one TypeScript config file, a catalog with generated types — is clean, and it was arrived at by roughly twelve rounds of restructuring.

**Learning.**

- My method was: what I have isn't great, how do I make it better. Repeat. It worked, in that it got me here. But it's the slowest possible route, because each round only sees one step ahead. The end state was designable up front. The question I never asked at the start was: _if I'm going to spend six months on this, what should it look like when it's done?_ — and then work backwards. I only get to skip the rewrites if I decide the destination first.

## 9. The refactoring bill (visible across the whole log)

**What the commits show.** Feature commits are 197 of 1,307 — 15% of the work. Refactoring, restyling and test rework together are 395, so exactly two to one against features. And the ratio gets worse as it goes: features were 35% of commits in the first week, 8% in the week of 11 March, 4 commits out of 60 and 4 out of 77 in mid-April. Three separate weeks shipped no feature commits at all.

**Learnings.**

- Continuing to refactor was the right call and it is the reason this project is still alive. Every one of those passes — types, tests, the operations layer, expressive TypeScript, the final collapse into one package — bought back ground that had already been lost. Nothing here argues for having stopped.
- But refactoring was the price of not having built a platform first, and I paid it in instalments for six months. Foundations built up front are cheap because nothing is standing on them yet. The same foundations retrofitted cost a rewrite of everything above them, every time, and I did that a dozen times.
- The visible symptom was weeks with nothing delivered. Not because the work was slow, but because the work was undoing earlier work. From the outside that looks like no progress; from the inside it feels like drowning.
- All of it traces back to the same root as everything else in this document: I started building before I had decided what I was building on. Every refactor after that was a payment on that one decision.

## 10. Far too loose on bugs (visible across the whole log)

**What the commits show.** The ratio of bug fixes to features inverts over the life of the project. January: 13 fixes to 30 features. February: 45 to 84. March: 52 to 51, parity. April: 28 to 19. July and August: two fixes for every feature. There are 68 patch releases, and 6 April alone shipped seven releases in one day, all of them fixes. At peak the CLI had 17 command surfaces; it has 13 now, and three of those are still behind feature flags.

**Learnings.**

- None of this reached a user — it wasn't actually released until two weeks ago. That's the only reason the bug count didn't matter, and it is not a defence. A bug rate this high pre-release is a statement about the process, not about the users I didn't have.
- The bugs were a signal about the system and I treated them as a queue of tasks. Fixing them one at a time meant fixing three hundred of them one at a time. The rising ratio was visible for months and I never once stopped to ask why it was rising.
- Constantly switching between building features and fixing bugs was the wrong mode and I stayed in it for five months. Both halves suffer: the features get built on top of known-broken behaviour, and the fixes never get to the cause because there's a feature waiting.
- Bad tests were one reason. The bigger one was unproven surface area. Seventeen commands went into a release on a test harness I already knew was unreliable — the fake E2E tests, the weak assertions, the CLI that had never been properly mounted. Every command was somewhere a bug could live that nothing was reliably checking.
- So the real rule: surface area you can't verify is surface area you can't ship. When the harness is known to be untrustworthy, that is an argument for fewer commands, not for more tests on top of it. I did the opposite — I kept the commands and kept adding tests.

## 11. Changelogs earned their keep (16 Feb onwards)

**What the commits show.** A single `CHANGELOG.md` split into one file per version on 16 February. There are 227 of them now. They were written at release time, by whoever made the change, while the change was still in hand.

**Learnings.**

- This is the one piece of documentation in the project that never went stale, and it's worth understanding exactly why: a changelog records _what changed_, which is a historical fact and stays true forever. Reference docs record _what is_, which stops being true the moment the next commit lands. Same effort, opposite half-lives. That distinction is the whole rule for what's worth writing down.
- They also turned out to be the only reliable way back into my own history. The 0.117.0 entry lists exactly what the April assertion sweep replaced — 305 `toBeDefined()` calls, 79 `toBeGreaterThan(0)`, 19 bare `toHaveBeenCalled()`. Without that file the "tests that proved nothing" problem would be a vague memory instead of a measurement.
- Cheap, permanent, and written at the only moment the information is free. Keep doing this.

## 12. Unit tests versus end-to-end — the verdict

**What the commits show.** 136 unit test files and 181 end-to-end files. Of the 167 test commits, 68 — about 40% — are reworking test infrastructure rather than testing anything new: shared helpers, fixtures, factories, mock-data folders, centralised registries, domain-scoped utility restructures, then all of it migrated again.

**My honest read, since you asked.**

- You're right that end-to-end has to be the primary source of truth. It is the only thing in this repo that ever observed the actual product. Everything else observed a model of the product that I wrote myself, which means it could only ever confirm what I already believed.
- I'd push back on "they cost almost nothing", though. Writing them is nearly free. _Carrying_ them is not. That 40% figure is the real price: every rename, every type change, every refactor dragged the whole unit suite behind it, and I paid that toll for six months. Cheap to write and expensive to own is exactly the trap that low-value tests set.
- Where they genuinely earn their place: pure functions with real logic and a big input space — the resolution rules, scope arithmetic, config merging, the diffing. End-to-end can only afford to walk two or three paths through those. A unit test can cover twenty for almost nothing. That role is real and nothing else fills it.
- Where they never earn it: wiring. "Was this called", "was this mocked module invoked", "is this defined". Those assert that the code is shaped the way the code is shaped. They pass forever, they catch nothing, and they are the ones that break on every refactor. That's what the 305 `toBeDefined()` calls were.
- And the structural limit: a unit test is only ever as trustworthy as the boundary it mocks. When the mock drifts from reality the test keeps passing. You cannot fix that from inside the unit test, which is precisely why they can't be the thing you rely on.
- So the question isn't how many unit tests. It's what they point at. Unit tests on pure logic, end-to-end on behaviour, nothing at all on wiring. Had I applied that rule from the start I'd have written maybe a third as many and trusted them considerably more.

## 13. The repository shape arrived last (4 Aug)

**What the commits show.** The CLI ran as a single-package repo for 1,290 commits. The web editor was built in a separate repository, started 26 July. On 4 August the CLI moved into `packages/cli`, absorbed the web monorepo, and gained `apps/www` for the landing page and docs — three commits, at 99% of the way through the history.

**Learnings.**

- The two repos only overlapped for nine days, and nine days was enough to grow coordination machinery. The web side vendored a copy of the catalog through its own generator script, and on 1 August I had to add a CI job notifying the other repository whenever the catalog moved, because otherwise it silently served a stale copy. My own words in that commit: "staleness that presents as working software is the failure mode this prevents." I built a mechanism to paper over a split I could have simply not made.
- The cost of splitting a repo isn't gradual, it's immediate. Anything shared across the boundary needs vendoring, syncing, and a way to detect drift, and all three arrive the moment there are two repos rather than growing slowly over time.
- The monorepo only got surfaced when the homepage and docs forced it, but the things that actually wanted sharing — the skills catalog, the TypeScript, ESLint and Prettier configs — were always going to be shared. That was knowable at the start. The shape of the repository is a platform decision, and it belongs with all the other platform decisions I deferred.

## 14. Code review is the part I still haven't solved (today)

**What the commits show.** Nothing, and that's the point. Review leaves no trace in a commit history, which is exactly why it's the thing that quietly ran out.

**Where I actually am.**

- Reading every line is a chore, it's boring, and I do less of it now than I did in February. That's the honest position.
- It may not be a problem. The code is better than it was, and the gates around it — types, the parse boundaries, ESLint, a real end-to-end harness — are better. Less of the review load is load-bearing than it used to be.
- What took me a long time to untangle is _why_ it felt like a failing. I'm a specialist front-end developer, and in that role the expectation is that you read every line, and that expectation will hold for a long time yet. I was applying that standard to a context it wasn't written for. In a full-stack startup — one that understands the risk it's taking — or on my own side projects, nobody would expect me to read every line, and I'd be wrong to. The rule I was measuring myself against was borrowed from a different job.
- So the answer is context-dependent, and I don't have it settled. I don't want to read all the code. I do want to know what it's doing — and I do know, but inefficiently, which is the actual complaint.
- Two things to try. Stacked diffs, so review happens in small units that can be judged on their own rather than as one large end-of-day blob. And a tool of my own that reduces each commit to a single line: what changed, what decisions were made inside it, and how to undo it. Then I know what happened without reading it, and the decisions — the only part that a diff genuinely can't tell you later — are the part that gets captured.
- The one thing I'd add for myself: what makes not reading every line safe isn't trusting the model. It's whether a mistake would be _caught_ and whether it would be _cheap to undo_. That's why the rollback half of the one-liner idea matters as much as the summary half, and it's why the loop below is what earns the right to skim in the first place.

---

## What I'd do differently, in order

1. Decide the appetite first. "Six months" and "a weekend" are different projects and deserve opposite methods. Only the long one earns a designed target.
2. Spend the first stretch on the platform, not on features. It feels like nothing is being delivered, and it is the only version of this where feature work is ever fast.
3. Pick three commands. Ship nothing else until they're boring.
4. Build the harness that runs the real thing, in the real terminal, before feature two.
5. Write the types and the parse boundaries early. They're the cheapest guardrail there is.
6. Refactor for readability continuously, not as a project. It's what keeps me in control.
7. Write down decisions, not plans. Delete anything that describes code.
8. Build the cross-cutting feature last, or not at all.
9. Treat a rising bug rate as a stop signal, not a backlog. When fixes start outnumbering features, the answer is to cut surface area or fix the harness, not to work through the list.
10. Decide the repository shape up front. Anything two projects will share is a reason to start in one repo, not a reason to build syncing between two.
11. If I've never built the kind of thing before, build a throwaway one first. This should probably have been a small proof of concept, or even a website, before it was a CLI.

## Rules for working with AI, as earned

- **How far you can push AI is exactly how good your guardrails are.** With types, a real test harness, and readable code, it can carry enormous amounts of work. Without them, it produces a codebase that looks finished and isn't, and it does it faster than you can read.
- **AI is optimistic in the same direction you are.** Ask for ten features and you get ten features, all plausible, none finished. It will never tell you the scope was the mistake.
- **The bottleneck is review, and review doesn't scale.** Everything that shifts cost onto review — big diffs, imperative code, sweeping renames, generated docs — is a bad trade even when each individual change looks fine.
- **Never accept a test you don't believe could fail.** This is the one rule that would have saved the most time.
- **Half-implemented features don't stay still.** The ten commands from day four survived a dozen global refactors without ever working properly, and every refactor had to carry them. Delete early, or don't start.

---

## The conclusion: the loop I should have used from commit one

Everything above is a symptom. This is the actual answer, and I only arrived at it in the last handful of commits out of 1,307.

Every feature goes through these steps, in this order, with AI doing the work at each one:

1. **AI writes the tests first**, from the spec, before any implementation exists.
2. **Run them. They must fail.** If a new test passes before the feature is built, the test is wrong — it is asserting something that was already true.
3. **AI builds the feature.**
4. **Run them again. They must pass — and the tests must not have been touched to get there.**
5. **Expressive-TypeScript pass** over the implementation.
6. **AI verifies its own work** against the spec.

**Why each step is load-bearing, and why the order is.**

- Tests first is what forces the behaviour to be decided before it's built. Write the implementation first and AI writes a test describing whatever it happened to build — which is how this repo ended up with 5,000 passing tests and a constant stream of bugs.
- The expected failure in step 2 is the single most important step, and it's the one I never had. It is the only proof that the test is capable of failing at all. Skip it and everything downstream is theatre. Nearly every bad test in this project would have been caught right here, in seconds.
- Step 4's second half is the rule that makes this work without strict TDD, and it should be stated explicitly because AI will break it silently and with a perfectly reasonable explanation: **once the tests are written and have failed, they are frozen. If a test doesn't pass, the implementation is wrong.** Editing the test to match the implementation converts the whole loop back into what I was doing before.
- Readability comes before verification because verifying code you can't read only tells you it does something, not that it does the right thing. Step 5 is what keeps step 6 — and me — able to judge anything.

**On the cost.** It's more tokens, because the tests actually get run, twice. That is the price of this being a development lifecycle rather than a code-generation step, and it is trivially cheap next to 166 fix commits, 68 patch releases, and five months of chasing the same class of bug.

**On when it applies.** Not just unfamiliar domains — that framing lets it off too easily. The loop earns its cost anywhere I can't tell whether the output is correct just by looking at it. Ordinary front-end work is the genuine exception, because the browser is the verification step. Everything else, including all of this, is the rule.

**And it's the answer to section 14.** The reason reading every line felt mandatory is that it was the only check I had. A test that was written first, watched to fail, and then frozen is a check that doesn't depend on my attention at all. That's what buys the right to stop reading everything — not trusting the model more, but needing to trust it less.
