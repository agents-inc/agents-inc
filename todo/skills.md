# Skills marketplace — build tracker

Outstanding work on [`agents-inc/skills`](https://github.com/agents-inc/skills), the marketplace
repository that authors the 229 skill packages this CLI compiles and installs. It is the one tracker
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

| ID                          | Task                                                                                                                                                    | Status        | Type     | Complexity |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ---------- |
| SKILLS-01 (new, 2026-08-05) | Framework-neutral skills catalog-wide (owner 2026-08-06): adapters + `binding:` metadata + derived pairing. [Plan](./plans/SKILLS-01-skill-adapters.md) | Ready for Dev | feature  | complex    |
| SKILLS-09 (new, 2026-08-06) | `api-observability-setup-axiom-pino-sentry` is Next-only in all but name — split a non-Next branch or rename it                                         | Investigate   | refactor | easy       |

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
