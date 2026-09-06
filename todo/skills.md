# Skills marketplace — build tracker

Outstanding work on [`agents-inc/skills`](https://github.com/agents-inc/skills), the marketplace
repository that authors the 238 skill packages this CLI compiles and installs. It is the one tracker
whose diffs land in a different repository — it lives here because this repository is the entry
point for all operations and owns the schemas the marketplace validates against. Its sibling
trackers: the CLI is [`cli.md`](./cli.md), the configurator is [`editor.md`](./editor.md), the site
is [`www.md`](./www.md), the API worker is [`server.md`](./server.md), and everything about
deployment, naming and publishing this repository is [`repo.md`](./repo.md).

**An item is deleted when it lands rather than ticked off**, so everything below is still open.
There is no done column and nothing is struck through. Landed items get one line each in
[`archive.md`](./archive.md).

**Rows are one-liners.** Detail lives below the table under the item's ID. When an item grows a
CLI-side half — a schema field, a compiler change — that half gets its own `CLI-NNN` row in
[`cli.md`](./cli.md) linking back here, matching how the trackers split by where the diff lands
rather than by theme.

| ID                                                                 | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Status            | Type             | Complexity |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------- | ---------- |
| SKILLS-17 (new, 2026-09-04)                                        | **`web-server-state-react-query` is hollow, and the rewrite inverted its scope.** Pass 1 rescoped it from "React Query + hey-api" to React Query; measured, hey-api is 100% of the example corpus and the React Query branch is the orphan. `grep -c 'useMutation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | invalidateQueries | useInfiniteQuery | gcTime     | useSuspenseQuery | optimistic'`returns 5 in`SKILL.md`, 5 in `reference.md`and **0 across`examples/`** — so mutations, invalidation, infinite queries and the `staleTime`vs`gcTime` distinction its own Quick Guide calls central have no worked treatment anywhere. Create-sized. | Ready for Dev | feature | complex |
| SKILLS-18 (new, 2026-09-04)                                        | **Two skills document one major version and demonstrate another.** `web-tooling-storybook`: every example imports `@storybook/test` and `@storybook/blocks` and installs `@storybook/addon-essentials`/`addon-interactions` — all removed or relocated in SB9 — while `reference.md` carries a Storybook 10 section naming `@storybook/addon-vitest` and **no SB9 row at all**. `web-data-fetching-graphql-apollo`: `SKILL.md` documents v4 accurately (hooks at `@apollo/client/react`, `uri` gone, `rxjs` peer dep) and red-flags importing hooks from `@apollo/client` — which all seven example files then do. Both pre-date the doctrine programme; neither is a rewrite regression.                                                                                                                 | Ready for Dev     | fix              | medium     |
| SKILLS-19 (new, 2026-09-04)                                        | **Six compile-breaking defects in example code that pre-date the doctrine programme**, found by pass 3 and reported rather than fixed because each needs an authoring decision: `d3/examples/advanced.md` `renderForceGraph` calls `colorScale(d.group)` declared nowhere in scope; `pwa/examples/core.md` `TodoRepository implements DataRepository<Todo>` without the `query` its interface declares; `pwa/examples/sync.md` uses `ConflictResolver` as both a React component and a service type, and hardcodes `retryCount >= 4` where `core.md` declares `MAX_RETRY_ATTEMPTS = 5`; `result-types/examples/core.md` uses `User` in two signatures and never declares it; `nextjs/examples/server-actions.md` passes a `(prevState, formData)` action straight to `<form action={…}>` in two patterns. | Ready for Dev     | fix              | medium     |
| SKILLS-20 (new, 2026-09-04)                                        | **Three claims nobody could verify, each left standing deliberately rather than guessed at.** `web-i18n-next-intl/SKILL.md` says `t()` on a message containing markup "returns the tags as literal text" — the docs state the behaviour neither way. `web-forms-tanstack-form/examples/core.md` passes a bare string to `form.setErrorMap({ onSubmit: … })`, and `setErrorMap` is absent from the API reference. `web-accessibility` states the SC 2.5.8 spacing exception is measured "between the closest points of adjacent targets" in two files; the normative text is a 24px-diameter circle centred on each undersized target, and both worked examples happen to land the same either way. Each needs a source, not an edit.                                                                      | Ready for Dev     | fix              | simple     |
| SKILLS-16 (new, 2026-08-30, renumbered 2026-09-02 off a collision) | **Three of four testers have no testing skill to carry.** `*-testing-*` exists for web, mobile and desktop only — there is no `api-testing-*`, `cli-testing-*` or `ai-testing-*`, so `api-tester`, `cli-tester` and `ai-tester` preload a framework and no test runner. Surfaced by the assignment-model proposal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Ready for Dev     | feature          | moderate   |
| SKILLS-01 (new, 2026-08-05)                                        | Framework-neutral skills catalog-wide (owner 2026-08-06): adapters + `binding:` metadata + derived pairing. [Plan](./plans/SKILLS-01-skill-adapters.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Ready for Dev     | feature          | complex    |
| SKILLS-09 (new, 2026-08-06)                                        | `api-observability-setup-axiom-pino-sentry` is Next-only in all but name — split a non-Next branch or rename it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Investigate       | refactor         | easy       |

---

## Active items

#### SKILLS-01: Framework-neutral skills — adapters, declared bindings, derived pairing

Escalated by owner directive 2026-08-06: skills do not reference host frameworks in their core
bodies at all — a zod skill whose examples happen to be React is coupled; the mention is the
defect. Measured the same day: 160 of 204 non-framework skills carry at least one framework
mention. Every skill classifies as incidental (core goes neutral), bound-by-identity (a
`binding:` field in `metadata.yaml`, machine-first beside `category` — owner ruling), or
multi-binding (`adapters/<framework-slug>.md` per supported framework + a few-line router).

The support surface each skill declares (adapters dir, `binding:`, or neither = universal)
mechanically derives `requires`/`needsAny` into the existing incompatibility layer — a skill with
only a `nextjs` adapter cannot pair with plain React, enforced by the same machinery as every
other incompatibility (CLI-405 in cli.md). Marketplace CI lints the neutrality invariant.
Classification of all 204 skills rides CLI-389's audit fan-out — one read of the catalog, two
products. Adapters still ship everywhere; no trimming, no selection UI. Full design in the
[plan](./plans/SKILLS-01-skill-adapters.md); migration parked until the owner starts it.

---

#### SKILLS-09: The observability setup skill is Next-only in all but name

`api-observability-setup-axiom-pino-sentry` sits in the `api` domain but its whole body is
Next.js-specific (`next-axiom`, `@sentry/nextjs`, `instrumentation.ts`) with no other branch
offered. Owner decision deferred (2026-08-06): either the body gains a non-Next branch — which
under SKILLS-01 becomes adapter files — or the skill is renamed/declared Next-only. Split out of
SKILLS-01 so its migration pass does not block on this; SKILLS-01 migrates the skill's current
content as-is.

---
