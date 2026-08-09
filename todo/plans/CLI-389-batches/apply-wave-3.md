# Apply manifest — CLI-389 wave 3 (B1 web-core + B3 web-ui + B4 web-platform + B7 api-services + B11 infra-cli), verified 2026-08-07

Everything below is settled and does NOT wait on any owner decision — this wave is **rule
deltas only**, in one file: `packages/cli/src/cli/lib/configuration/default-rules.ts`
(**13 changes: 9 `requires` additions, 2 rule edits, 2 `requires` deletions**). Every category
proposal from these batches waits on the owner instead (`OWNER-DECISIONS-taxonomy.md`).
Sources: the amended `B1-web-core.md`, `B3-web-ui.md`, `B4-web-platform.md`,
`B7-api-services.md`, `B11-infra-cli.md` — every row sustained or corrected by
`verify-B1-B2.md`, `verify-B3-B4-B8.md`, `verify-B7-B11.md`. B2 and B8 contribute **zero**
fence deltas (B2's product is category work — owner page; B8 is the zero-delta batch). B6
still contributes zero rules (owner decision pending). After the edits, run the generation
round (`generate:types` + `generate:matrix`; `generate:schemas` is untouched — no category
ids change in this wave).

Explicitly NOT in this wave: **payload → `requires [nextjs]` — OVERTURNED in verification
(verify-B7-B11 item 3); no rule, ever, on the current body** — payload's only fence is the
`api-cms` radio, which is an owner-page flip; ALL category changes (the six-way api-data
split, web-ui-kit, web-form-library, web-e2e, web-streaming, web-docs, web-graphql-client +
web-rpc, the three B7 exclusivity flips, the docker move — all on the owner page); deletion
of any conflict group (decision 2 Phase C); the `compatibleWith` deletions (decision 4a —
though two entries are _edited_ here, see rules 10-11); the requires-closure in
`packages/matrix` (EDITOR-11); B1's optional trpc `+ react-native` needsAny member (editorial
self-description only, zero reachability change — deferred to the owner's discretion);
skills-repo content fixes (lexical vanilla-bootstrap/self-scope, shadcn Base-UI re-weighting,
tanstack-form adapter examples, clack/cli-commander exit-code alignment, and the rest of the
batches' F-notes).

## Ordering constraints (hard)

1. **The nine additions are additive fences (tightening from nothing) — window-free**, any
   order, may land together or separately.
2. **The react-router edit (rule 10) narrows an existing rule and MUST shed remix from the
   parity `compatibleWith` group `{react-router, react, remix}` in the same change** (B1 M4) —
   or the group keeps advertising the co-selection the edit exists to stop. Knowing
   picker-level change, recorded in B1: pre-closure, remix-first intermediate selections may
   gray react-router — desirable (it stops advertising the incoherent pair).
3. **The storybook edit (rule 11) MUST touch the `requires` needsAny AND its parity
   `compatibleWith` group (:286-299) in the same change** (B4 F2) — otherwise the re-verified
   39/39 rule↔group set-identity behind decision 4a breaks before the deletion lands.
4. **The two doc-tool deletions (rules 12-13) are pure loosenings and land safely now** — the
   `{docusaurus, vitepress}` same-kind fence is still carried by the `web-meta-framework`
   radio + its conflict group. Two interactions to carry forward: (a) the fix they serve
   (Next + VitePress docs) completes only when the owner's `web-docs` move lands — the
   deletions alone remove the transitive block, not the radio block; (b) Phase C must NOT
   delete the `{docusaurus, vitepress}` conflict group before `web-docs` exists (B1's
   ordering constraint — same sentence for `{graphql-apollo, graphql-urql}` and
   `web-graphql-client`).
5. Consistency gate (house rule, checked): no rule's target sits in its subject's own
   category — react/nextjs/remix sit in exclusive `web-framework`/`web-meta-framework`;
   turborepo sits in `shared-task-runner` (post-wave-2); subjects sit in `web-ui-components`,
   `web-3d`, `web-dnd`, `web-editor`, `web-dataviz`, `web-tooling`, `api-email`,
   `api-observability`, `infra-ci-cd`, `web-routing`. All hold.
6. Verify each slug against the generated slug→id map before landing
   (`packages/cli/src/cli/types/generated/source-types.ts`). Reasons are drafted in house
   style — content is load-bearing, exact wording is not.
7. EDITOR-11 goldens are data and adapt (B3 M6): scenarios enumerating reach for base-ui /
   lexical / r3f / dnd-kit (`conflict-partners-are-not-blocked`,
   `closure-follows-one-requirement`) must be re-derived at apply; any scenario touching
   react-router or storybook reach re-checked.

## default-rules.ts — 9 additions

House shape (matches existing entries): multi-line object `{ skill, needs, needsAny?, reason }`.
One-line forms below carry the exact content; reformat to the file's multi-line style.

### B3 — web UI (4 rules)

| #   | addition (exact content)                                                                                                                                                                                          | source row                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `{ skill: "base-ui", needs: ["react", "nextjs", "remix"], needsAny: true, reason: "Base UI primitives are React-only (@base-ui/react)" }`                                                                         | B3 base-ui — worksheet-flagged, confirmed; sibling shape of radix-ui/headless-ui                                                                                                              |
| 2   | `{ skill: "react-three-fiber", needs: ["react", "nextjs", "remix"], needsAny: true, reason: "React Three Fiber is a React renderer for Three.js" }`                                                               | B3 react-three-fiber — worksheet-flagged, confirmed                                                                                                                                           |
| 3   | `{ skill: "dnd-kit", needs: ["react", "nextjs", "remix"], needsAny: true, reason: "The skill teaches DndContext/useDraggable/useDroppable/useSortable — @dnd-kit React packages throughout" }`                    | B3 dnd-kit — grounds are skill body + npm description (the dndkit.com "toolkit for React" citation is stale — site now claims framework-agnostic; on the F2 promotion-path list)              |
| 4   | `{ skill: "lexical", needs: ["react", "nextjs", "remix"], needsAny: true, reason: "The skill's only editor setup and plugin registration path is @lexical/react — LexicalComposer plus useEffect registration" }` | B3 lexical — binding rests solely on the unfollowable-remainder branch (zero setRootElement in 1,552 lines); a vanilla bootstrap section in the skills repo re-derives to class C no-requires |

### B4 — web platform (2 rules)

| #   | addition (exact content)                                                                                                                                                                                                           | source row                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | `{ skill: "recharts", needs: ["react", "nextjs", "remix"], needsAny: true, reason: "Recharts wraps D3 in composable React components" }`                                                                                           | B4 recharts — worksheet-flagged, confirmed; deliberately NO `requires [d3]` (package fact)                                                           |
| 6   | `{ skill: "component-library", needs: ["react", "nextjs", "remix"], needsAny: true, reason: "Packaging React components — react/react-dom peerDependencies and 'use client' preservation are the skill's critical requirements" }` | B4 component-library — bound on self-scope + MUST-majority (3/5) + active harm (amended grounds); class C if a neutral packaging core is ever re-cut |

### B7 — api services (2 rules; payload is NO rule)

| #   | addition (exact content)                                                                                                                                                                                                                | source row                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | `{ skill: "setup-resend", needs: ["react", "nextjs", "remix"], needsAny: true, reason: "Resend Email & React Email Setup — .tsx templates and the react: send prop are React Email surface" }`                                          | B7 setup-resend — mirror of the kept resend-react-email rule (F3 asymmetry); per the B9 rule, NO new `compatibleWith` is authored                                                                                                       |
| 8   | `{ skill: "setup-axiom-pino-sentry", needs: ["nextjs"], reason: "Every pattern is the Next.js wiring — next-axiom, @sentry/nextjs, next.config.ts wrapping, instrumentation.ts; strip the Next slice and nothing followable remains" }` | B7 setup-axiom-pino-sentry — the batch writes `needsAny [nextjs]`; a single-member list is semantically identical as plain `needs` — land in house style. Stays linked to SKILLS-09 (rule regenerates wider if a non-Next branch lands) |

### B11 — infra (1 rule)

| #   | addition (exact content)                                                                                                                                                            | source row                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | `{ skill: "turborepo-ci", needs: ["turborepo"], reason: "Turborepo CI patterns configure turbo.json and the turbo CLI — requires the Turborepo task runner (shared-task-runner)" }` | B11 turborepo-ci — the B12 handoff, adopted; target sits in `shared-task-runner` post-wave-2 (reach was valid under the pre-split shape too — no ordering dependency) |

## default-rules.ts — 2 edits

| #   | edit (exact content)                                                                                                                                                                                                                                                                                                                                | source row                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | **EDIT** react-router's rule at :250-253: `needsAny [react, remix]` → plain `needs: ["react"]`; reason → `"React Router v7 Data Mode SPA skill — createBrowserRouter/RouterProvider are framework-owned (wrong) inside a Remix framework-mode app"`. **Same change:** the parity `compatibleWith` group `{react-router, react, remix}` sheds remix. | B1 react-router — the active-harm exception to B2's do-not-simplify caution (recorded in the amended B1); validation-layer reachability unchanged; pre-closure picker graying is a knowing, desirable change                                                                                                                            |
| 11  | **EDIT** storybook's `needsAny` at :584-597: add member `qwik` (rule reads `[react, vue-composition-api, angular-standalone, solidjs, svelte, qwik, nextjs, remix, nuxt, sveltekit]` — the nine existing members plus qwik; preserve the file's member order). **Same change:** the parity `compatibleWith` group at :286-299 gains qwik.           | B4 storybook — grounds re-cut in verification: membership consistency (solidjs, same community tier, is already a member; the operative criterion is listing on Storybook's own frameworks page — admits qwik, keeps astro out). Pure loosening. D-306 package-health watch on `storybook-framework-qwik` rides as a record, not a rule |

## default-rules.ts — 2 deletions

| #   | deletion                                                                      | source row                                                                                                                 |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 12  | **DELETE** `docusaurus → requires needs ["react"]` (at :600-608 region)       | B1 doc-tools — separate-deployable rule (sanity-Studio/payload-admin precedents); React is internal to the docs deployable |
| 13  | **DELETE** `vitepress → requires needs ["vue-composition-api"]` (same region) | B1 doc-tools — same grounds; hono.dev is the live specimen ("Built with VitePress… Not using Hono :)")                     |

Phase-C bookkeeping note for both deletions: docusaurus and vitepress leave the worksheet §1
"requires but no compatibleWith" five-list; the Phase-C grep-zero check must still cover the
five base frameworks' _generated_ compatibleWith arrays (B1 anchors note).

## Reason-text rider (no fence change — may ride this wave)

- **next-intl** (B2 F1, verified item 21): re-cut the reason at default-rules.ts:517 from
  "next-intl is built specifically for Next.js" (false of the library — use-intl core is
  officially framework-agnostic) to taught-surface phrasing: `"Skill teaches next-intl's
Next.js App Router surface — middleware, routing.ts, setRequestLocale,
NextIntlClientProvider"`. Same defect class as B5's nextauth reason fix, which rode wave 2.

## Generation round (after ALL edits above)

`generate:types` + `generate:matrix` (both matrices + both `source-types.ts`). No
`generate:schemas` — no category ids change in this wave. Then the EDITOR-11 golden re-derives
per constraint 7.

## What this wave deliberately leaves fenced or unfenced (records, not code)

- payload: NO rule (overturn) — D-306 recommends-shaped line + re-derive triggers live in the
  amended B7.
- tiptap, visual-regression, setup-env, PostHog trio, vercel-ai-sdk, litellm, sst, vite,
  web-performance: no-derive calls all sustained — no rules.
- The D-306 lines named across the five batches (trpc↔swr, hey-api-MUST tension, vite⊥nextjs
  with the 6-of-15 default-roster curation debt, storybook qwik package-health,
  vercel↔netlify severity-tier, platform-anchor gap/F10, and the rest) ride as records with
  their batches.
