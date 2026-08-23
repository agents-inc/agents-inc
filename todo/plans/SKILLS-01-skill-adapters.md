# SKILLS-01: Framework-neutral skills — adapters, declared bindings, and derived pairing rules

**Status:** Design settled (owner, 2026-08-06); migration parked until the owner starts it
**Repository:** [`agents-inc/skills`](https://github.com/agents-inc/skills) for content and CI;
the derived-rules half lands in this repo under its own row (CLI-405)
**Complexity:** catalog-wide — 160 of 204 non-framework skills mention at least one framework
somewhere in their bodies (measured 2026-08-06)

## The invariant (owner directive, 2026-08-06)

**Skills do not reference host frameworks in their core bodies. At all.** A zod skill whose
examples happen to be written in React is coupled — the mention itself is the defect, not just
heavy branching. Framework material lives in exactly one of two declared places: an adapter file,
or a metadata binding. Everything else is neutral.

This supersedes the earlier, narrower boundary ("extract only skills with heavy inline
branching"). The earlier settled points stand: adapters ship everywhere in every distribution
(unread files are disk, not tokens), no compile-time trimming, no adapter selection UI, no
separate skills per adapter. Rejected alternatives stay rejected — recorded in the git history of
this file.

## The three classes

Every non-framework skill is exactly one of these, and the class decides where its framework
material lives:

| Class                     | Test                                                                                                   | Where framework material lives                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — incidental**        | The library is framework-neutral; mentions are example-flavor (zod, prettier, redis)                   | Nowhere. Core rewritten neutral; per-framework wiring examples, if worth keeping, become adapters (promoting the skill to class C)                                                                                          |
| **B — bound by identity** | The framework is the library's nature (react-hook-form, reanimated, vue-i18n)                          | **`metadata.yaml`: a `binding:` field naming the framework skill's slug, machine-first beside `category` (owner ruling).** The body may then speak the framework's language freely — the coupling is declared, not smuggled |
| **C — multi-binding**     | Same library, same docs site, different host wiring (TanStack Query, Sentry, Tailwind, PostHog, Biome) | `adapters/<framework-slug>.md`, one per supported framework; core neutral + a few-line router section                                                                                                                       |

The class test is applied per skill during the classification pass (below), not guessed from
grep hits.

## The framework-support surface, and what it derives

Each skill's supported-framework set becomes machine-readable:

- class C → the `adapters/` directory listing (filenames are framework skill slugs)
- class B → the `binding:` field in `metadata.yaml`
- class A → neither present = universal

From that surface the CLI **generates** `requires` + `needsAny` bindings into the existing
incompatibility layer — no new rule semantics. **Derivation is CONDITIONAL (adjudicated by the
CLI-389 verification passes, 2026-08-07): it never reads the adapter list — it reads what remains
when the adapter slices are deleted. A followable framework-neutral remainder derives NOTHING
(setup-env, the PostHog trio, payload); an unfollowable remainder derives `needsAny` over the
catalog's host enumeration (setup-axiom-pino-sentry, turborepo-ci, class-B skills). The test runs
on demonstrated content, never the upstream install story and never the class letter. Metadata
must therefore distinguish "optional wiring for" from "runs only inside".** Known design input
for CLI-405: the platform-anchor gap — couplings to hosts that are not anchor skills (sst→AWS,
vercel-kv→Vercel) are currently inexpressible and need a decision (host anchors, or a new
advisory vocabulary via CLI-740). This is the owner's validation requirement made
real: a skill whose only adapter is `nextjs` AND whose remaining body is unfollowable without it
derives `requires needsAny [nextjs]`, so pairing it with plain React (no Next.js) is surfaced by
the same machinery that handles every other incompatibility, in the wizard, the editor and
`validate` alike. It also mechanically closes
EDITOR-06's framework-bound half for every classified skill. CLI-side work is **CLI-405**.

## Validation (marketplace CI)

- Core-body neutrality lint: no framework names in SKILL.md/examples outside the router section
  (framework-name list derived from the catalog's framework skills, not hand-maintained).
- Adapter filenames must be real framework skill slugs; `binding:` must name one.
- A skill may not carry both `binding:` and `adapters/` (classes are exclusive).
- Router-size constraint on SKILL.md (preloaded skills inline the whole body).

## Phases

1. **Convention docs** (`docs/contributing/` in the skills repo): the invariant, the three
   classes and their test, the `binding:` metadata field, the adapter directory shape, the
   router-size constraint, the slug rule, the CI checks.
2. **Proving cases:** migrate `infra-config-setup-env`, `web-ui-mui`,
   `api-observability-setup-axiom-pino-sentry` (as-is; its non-Next branch question stays
   SKILLS-09) — class C exemplars — plus one class-B declaration (react-hook-form) and one
   class-A neutralization (a zod-family skill) so all three classes have a reference migration.
3. **`skill-summoner` authoring rules:** new skills are born classified; inline branches and
   undeclared mentions never enter the catalog again.
4. **Classification pass over all 204 non-framework skills — RIDES CLI-389's fan-out.** The
   relationship audit already reads every skill; its per-skill manifest gains the class verdict
   and the support surface. One audit, two products.
5. **Migration sweep** per the classification — parked until the owner starts it.
6. **CLI-405** (this repo): support-surface parser, `requires`/`needsAny` generation, matrix
   health check, `validate` surfacing. Worthless before phase 2 produces declared skills; row
   filed now so the dependency is visible.

## Out of scope

Compile-time router resolution (rewriting "detect your framework" into "this project uses
Next.js" at eject/compile) — unchanged from the original plan; own row if picked up after
adapters exist.
