# Custom / added skills — investigation, 2026-08-06

Read-only investigation ordered by the owner ahead of any re-enable work. Feeds rows CLI-407 to
CLI-413 and EDITOR-15 to EDITOR-21. No code was changed.

## The premise correction

The editor's add-skill UI is NOT flag-guarded — the `＋ Add skill` button renders unconditionally
(`filter-bar.tsx`, dialog mounted in `configure-screen.tsx`, 11 green Playwright specs). It is
live in production. The flag-guarded feature is the CLI's `cc new skill`
(`FEATURE_FLAGS.NEW_SKILL_COMMAND`, default false, env-overridable via
`AGENTSINC_FLAG_NEW_SKILL_COMMAND=1`).

They are two distinct features sharing a name and no code:

|            | Editor "added skill"                        | CLI "custom skill"                                                         |
| ---------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| What it is | A GitHub repo REFERENCE staged in a session | A local skill folder with SKILL.md + metadata.yaml carrying `custom: true` |
| Identity   | `github:owner/name`                         | A real SkillId from frontmatter                                            |
| Content    | None fetched — name/description/stars only  | Full body, content-hashed                                                  |
| Lives in   | Zustand, session-only                       | `.claude/skills/<name>/`, merged into the matrix                           |

An editor-added skill can never become a CLI custom skill — the editor never obtains content.

> **Superseded 2026-08-16 — this line was wrong, and it shaped the design for two months.** "The
> editor never obtains content" described the build as it stood, not a constraint on it: the GitHub
> contents API is CORS-enabled and reachable from the seam the editor already owns. The owner ruled
> that the editor DOES resolve the content and carries it inline in the seed payload, which makes the
> shared id self-contained and removes the install-time dependency on a third-party repo. Everything
> below that reasons from "no content is available" should be read against that. See EDITOR-03 in
> `todo/editor.md` and Journey 26 in `.ai-docs/standards/e2e/user-journeys.md`.

## Verdicts

**Editor:** structurally acceptable base (store shape, grid plumbing, id-agnostic ••• panel all
reusable) — but the feature it implements (GitHub repo references) is not the feature the owner
wants. `addedSkillId`/`categoriseRepo`/`monogramFor` compensate for having no real content and
become dead weight under a real custom-skill concept.

**CLI:** acceptable base, extend not rework — with ONE structural exception:
`tagPrimarySourceSkills` marks the marketplace as `primary: true` on custom/local skills, so
`createDefaultSkillConfig` defaults a custom skill to the marketplace source. That is D-212's
real root cause (deeper than D-212 states). Also: `custom: true` currently changes exactly one
behavior (category-field validation leniency); `getCustomSkillIds()` has zero production callers;
and since D-229 the plugin-install failure is a HARD ABORT of `cc edit` with marketplace-flavored
advice that is impossible for a locally-created skill.

**The `local` pseudo-category is a trapdoor, not a category:** `extractCategoryFromPath` returns
undefined for it and the null-filter in `config-generator.ts` silently drops the skill from every
agent stack. A `custom` category must NOT be modelled on it.

## Edge-case inventory

Editor: E1 no flag exists (premise); E2 added skills ride the seed payload but every consumer
drops them — the install dialog promises what `--from` won't deliver (EDITOR-15); E3 session-only
(EDITOR-03); E4 share-import silently drops your own added skills (EDITOR-16); E5 `categoriseRepo`
multi-tier fallback, banned pattern (EDITOR-17); E6 exclusive-category swap ignores added skills
(EDITOR-18); E7 domain-chip filter erases the Added section (EDITOR-19); E8 auto-assign broadcast
vs CLI-406 ruling (CLI-406); E9 GitHub 10 req/min (SERVER-01); E10 added skills default
`install: "plugin"` — the forbidden mode (EDITOR-20); E11 editor-spec.md auto-assignment stale
(EDITOR-21); E12 no component tests (EDITOR-01).

CLI: C1 primary-source tagging (CLI-407); C2 sources step offers marketplace for custom (D-212,
still true); C3 `installPluginSkills` never checks custom (CLI-408); C4 D-212's symptom is now a
hard abort (D-229) — write-up stale; C5 `new skill` closer says `cc compile` (D-212, still true);
C6 `cc list` blind to scaffolded skills (D-212, still true); C7 config-types regression FIXED by
D-228 — remove from D-212; C8 custom slugs never in slugMap (D-214 item 3, still true); C9 the
`"imported" as CategoryPath` cast moved to `IMPORT_DEFAULTS.CATEGORY`, and
`LOCAL_DEFAULTS.CATEGORY = "dummy-category"` is a second instance (D-214 item 5 amendment); C10
category auto-synthesis unscoped in TWO places (D-214 item 8 amendment); C11 `local`-categorized
skills silently dropped from all stacks (CLI-409); C12 `seedToWizardResult` skips domain-less
categories — custom skills can't arrive via `--from` (rides CLI-409/412); C13 `dummy-*` scaffold
defaults fabricate a domain with no agents (CLI-411); C14 `cc import skill` writes no
slug/domain/custom → silently undiscoverable (CLI-410); C15 `getCustomSkillIds()` uncalled
(CLI-408); C16 loader-schema validation asymmetry (D-214 item 11, adjacent); C17 `custom: true`
never reaches config.ts (CLI-413); C18 shares the scaffolded-but-not-wired pattern with
D-213/D-214.

## Staged re-enable path (owner constraints: alongside built-ins, assignable, eject-only with

hard error, own custom category)

- **Stage 0 (prerequisite):** make `custom: true` mean something — stop the primary-source
  tagging (CLI-407); eject-only enforced twice, neither a fallback: the sources grid cannot
  express plugin for custom skills, and `installPluginSkills` THROWS naming the skill (CLI-408);
  fix the `new skill` closing message. Deferrable: `cc list` section, `--install` flag.
- **Stage 1:** make a custom skill reach a sub-agent — category at scaffold time (never `local`),
  slugMap maintenance (D-214 item 3), synthesis scoped to custom (item 8, both places), real
  scaffold defaults (CLI-411).
- **Stage 2 (after CLI-406 lands):** reconcile editor "added" with CLI "custom". Decide EDITOR-03
  first — (a) keep session-only but stop lying (cheapest: honest install dialog, strip or loudly
  skip in payloads, delete categoriseRepo); (b) editor emits a scaffold instruction
  (`new skill <name> --from-repo <owner/name>`), CLI owns creation; (c) editor persists real
  catalog entries (needs a marketplace concept; do not attempt before a or b). Force eject +
  lock the control in the editor (EDITOR-20).
- **Stage 3 — the `custom` category fork (CLI-412):** Fork A: a real generated category in the
  skills source — needs a domain; `shared` is the honest choice (already means "carried across
  implementation domains"; `IMPORT_DEFAULTS.DOMAIN` uses it); everything downstream works with
  no special-casing. Fork B: a second pseudo-category beside `local` — cheap, but inherits every
  trapdoor; requires auditing all 17 `LOCAL_PSEUDO_CATEGORY` call sites, and an ASSIGNABLE
  pseudo-category is a different animal from `local`, which is a pseudo-category precisely
  because it is not assignable. Recommendation: Fork A with domain `shared`.

## SUPERSEDED: Stage 3's fork — owner ruling, same day

Neither fork. **There is no `custom` category.** Custom skills are assigned a real domain +
category at add time — AI suggests, the user confirms — and appear alongside related skills.
`custom: true` becomes a provenance filter (editor row EDITOR-22, deferred) and never a place.
Typing tightens: the `validateCategoryField` custom leniency and category auto-synthesis for
custom skills are deleted rather than scoped. Install mode: eject-only where nothing backs the
skill; plugin/eject choice where a registered marketplace does. Full ruling in todo/cli.md
CLI-412.

## Owner rulings 2026-08-08 — the add-skill search

- The search field lives on the add-skills dialog. It searches **skills, not repositories**.
- **Own-catalog results are excluded** — the grid already presents the catalog; the dialog exists
  for what the catalog lacks.
- Sources: allowlisted skills repos indexed and validated server-side (the `import skill`
  discovery rules — `skills/*/SKILL.md` present, metadata parses — applied before a result is
  offered) as the reliable core; community registries (skills.sh, Skills Directory, etc.) as
  adapters where a real API exists; no HTML scraping. One normalized result shape, cached,
  served from the SERVER-01 proxy (API keys and rate limits live server-side).
- Results carry provenance badges; external installs go through this plan's intake: eject-only,
  AI-suggested + user-confirmed category, provenance filter.
- Registry adapters (2026-08-08, confirmed): out of v1 entirely. When added, each adapter ships
  only after manual testing against the live registry confirms real results, rate limits and
  failure shapes — automated mocks alone do not clear an adapter for inclusion.
- Multi-marketplace (2026-08-09, owner musing recorded with the analysis): wholesale adoption of
  FOREIGN marketplaces cannot work — no metadata.yaml, categories unknowable — so foreign skills
  stay per-skill through the AI-suggest-confirm intake. Format-compliant marketplaces (metadata
  present, validator-passing) are the composition candidates if multi-marketplace ever lands —
  the `extends:` shape from the CLI-450-era investigation. Two lanes, neither bulk-imports
  uncategorizable content. Nothing filed; deferred with the rest of this stack.
- Third-party skills are ALWAYS eject — permanent, not a v1 stopgap (owner ruling 2026-08-09,
  sharpened same day): a plugin install serves the third party's content as-is, and we cannot
  write our generated metadata.yaml into their plugin — so a third-party skill can never be
  grid-native in plugin form. Eject is the only mode that lets the intake attach the confirmed
  category and generated metadata. There is no convert-to-plugin upgrade path for third-party
  skills; the earlier "unless marketplace-backed" door is closed for good. (Trust, layout and
  disappearance concerns stand as additional reasons.)
