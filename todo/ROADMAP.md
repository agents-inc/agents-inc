# Roadmap — the order of everything outstanding

A sequencing view over the six per-workspace trackers. **The trackers stay canonical** — rows
live there with their detail, land there, and archive there; this file only orders them and is
updated whenever a phase moves. IDs link back by grep.

## Phase 0 — status (updated 2026-08-10)

**Read [`SESSION-STATE-2026-08-10.md`](./SESSION-STATE-2026-08-10.md) first.** The pass-5 fix
programme landed 16 rows plus CLI-481, all UNCOMMITTED in the working tree; full unit and e2e suites
green. Remaining from that programme: **CLI-492**, **CLI-493** (docs), **CLI-496**, **CLI-497** — and
the commit round, which is the owner's.

## Phase 0 (original) — in flight

1. The fourth full journey pass (all 21 testable journeys on the real binary; findings compiled).
2. **CLI-471** — the e2e fixture's skill-rules reference only skills it ships (queued behind the pass).

## Phase 1 — owner-manual gates (any order, owner's hands)

- **Marketplace publish** — ships the missing meta-reviewing checklists; then verify
  `eject skills` succeeds and close **CLI-472** (residual ruled: eject keeps dying hard on a
  missing catalog skill — intended).
- **The commit round** — `/commit-plan` over both repos (~monorepo 900+, skills ~540 files).
  Gates everything below it.
- **Post-merge secrets** (owner 2026-08-09: both in their own separate sessions) —
  `MONOREPO_DISPATCH_TOKEN` in the skills repo (regen automation goes live);
  verify `CLOUDFLARE_API_TOKEN` carries KV Edit and hand-fire the first
  "Build skill index" Action run (until then, deployed `/skills` is 503).

## Phase 2 — next-session batch (small, owner-confirmed)

- **CLI-473** — delete the init hook's dead `sourceConfig` plumbing (no readers).
- **SERVER-03** — the share-link attribution route (CLI's user-agent half exists).
- **CLI-470** — uninstall honesty + the body-comment agent provenance marker (design settled,
  on hold — owner calls it).
- **CLI-467** — the knip deletion rounds (owner: later; baseline + category counts recorded).

## Phase 3 — end-game renames (only after the commit round)

- **D-118** — project/global → project/user.
- **CLI-425** — skill-id/category alignment renames (33+ sites; re-audit post-taxonomy first).
- **CLI-463** — source → marketplace on the user-facing surface (field-collision design noted).

## Phase 4 — the home stretch (go-live program, dependency order)

1. **EDITOR-30** — the editor loads a marketplace: floating button → dialog (name + optional
   token, localStorage), pre-generated `catalog.json` fetched browser-direct, matrixSchema at
   both boundaries, provider-seat audit.
2. **The custom-skills intake** — external skills persist and install: EDITOR-15–20, category
   confirm, generated metadata, universal eject, `--from` fetch-and-generate.
3. **CLI-462 + EDITOR-31** — `edit --ui` out, `edit --from` back; catalog-first import with the
   auto-opening pre-filled dialog. **Journey 26** (mixed sources across scopes) must be ruled
   before or during this leg — still to be decided.

## Deferred shelf (no order; each starts on an owner signal)

**SKILLS-01** + **CLI-405** (adapter migration, ~160 skills) · **D-280** (stack pruning) ·
registry adapters (manual-testing condition) · **EDITOR-28** (favorites) · **EDITOR-03/22**
(added-skill persistence fork, provenance filter — largely absorbed by the intake leg) ·
**CLI-453** (`new skill` — not part of go-live) · **CLI-454** (`new marketplace`, +
`catalog.json` emission for EDITOR-30) · **REPO-37** (dependency-graph assessment) ·
**D-237** (README GIF) · design-gated editor items (**EDITOR-07/09/10**) · small repo leftovers
(**REPO-24/07/09**) · **SKILLS-09**.
