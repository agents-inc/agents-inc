---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/components/wizard/category-grid.tsx
  - e2e/pages/steps/build-step.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-19
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: 'Seed focusedSkillId synchronously in the wizard store (seedFocusedSkillForActiveDomain) at build-step entry (hydrate + setStep("build")) and on every domain change (nextDomain/prevDomain/setCurrentDomainIndex); deleted CategoryGrid''s fire-once post-mount seed effect and the E2E FOCUS_EFFECT_FLUSH_MS blind delay. This is the D-233 ''Fix A''. The ensureMarketplace silent-catch diagnosability suggestions in the prior finding remain open.'
---

## What Was Wrong

Two sources of truth resolved the "currently focused skill" in the build step, and
they were populated on different clocks:

- **Space** (grid `onToggle`) resolved its target from CategoryGrid's _local_
  `focusedRow`/`focusedCol` state — correct and synchronous with what the frame renders.
- **`s`** (scope toggle in `wizard.tsx`) read `store.focusedSkillId`, which was seeded
  by a **post-mount `useEffect`** in CategoryGrid (`onFocusedSkillChange` fired once on
  mount). That effect runs _after_ the first frame paints.

Under load (parallel E2E workers driving the real binary through a PTY), a keystroke
could reach the `s` handler before the mount effect had flushed, so `s` read a stale or
null `focusedSkillId`. The E2E page object papered over this with a blind
`FOCUS_EFFECT_FLUSH_MS = 500` delay, which is insufficient under contention — the only
remaining flaky E2E class (dual-scope scope-toggle suites).

The root anti-pattern: **state that a synchronous input handler reads must not be seeded
asynchronously after mount.** A render-phase effect is not ordered against buffered
terminal input.

## Fix Applied

Added `seedFocusedSkillForActiveDomain()` to the wizard store. It derives the active
domain's first grid option the same way the grid does — via `buildCategoriesForDomain`
(reused, not re-implemented) — and writes it to `focusedSkillId` **synchronously**,
before any frame renders or input can be processed. It is invoked at every point where
the build grid mounts fresh at row 0 / col 0:

- `hydrateWizardStore` (both `hydrateForEdit` and `hydrateForInit`)
- `setStep("build")` (init `domains → build` entry, and any navigation into build)
- `nextDomain` / `prevDomain` / `setCurrentDomainIndex` (domain transitions remount the
  grid, so the seed must move with the domain)

CategoryGrid's fire-once post-mount seed effect (and its `useEffect`/`useRef` imports)
was deleted as redundant; navigation-driven updates (`handleFocusChange →
onFocusedSkillChange`) are unchanged. The E2E `FOCUS_EFFECT_FLUSH_MS` delay and its
`delay(...)` call were removed.

Root-cause mechanism confirmed: **(a)** the async post-mount seed racing buffered PTY
input. Mechanism (b) (mid-mount `categories` re-derivation remapping the same
row/col to a different skill without a navigation callback) is a narrow, pre-existing
theoretical desync not exercised by the flaky path and was left unchanged to keep the
fix surgical; the `use-category-grid-input` column-clamp effect already re-syncs
`focusedSkillId` whenever the focused column becomes invalid.

## Proposed Standard

Add to the wizard/Ink conventions (e.g. `.ai-docs` CLI/wizard section): _State that a
synchronous `useInput` handler reads must be initialized synchronously (in the store's
hydrate/transition actions), never seeded in a post-mount `useEffect`. Terminal input is
not ordered against render-phase effects._ When two handlers act on the "same" focused
element, they must resolve it from one source of truth, or that source must be written
before the first frame.
