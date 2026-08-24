import type { SkillId, SkillSlug } from "../../types";

/**
 * Post-decision-2 vocabulary: conflict groups no longer exist as a mechanism, so a skill is
 * fenced by category exclusivity, by a `requires` rule, or not at all.
 */
export type AuditVerdict = "constrained-via-exclusivity-or-requires" | "universal";

/** The framework-adapter classification rides this manifest — one audit, two products. */
export type SkillClass = "A" | "B" | "C";

/** Worksheet batch that produced a verdict — provenance for the adversarial pass. */
export type BatchId =
  | "web-core"
  | "web-state"
  | "web-ui"
  | "web-platform"
  | "api-core"
  | "api-data"
  | "api-services"
  | "ai"
  | "mobile"
  | "desktop"
  | "infra-cli"
  | "shared-meta";

export type SkillAuditEntry = {
  /** ISO date the verdict was established or last re-confirmed. */
  audited: `${number}-${number}-${number}`;
  verdict: AuditVerdict;
  batch: BatchId;
  /**
   * Framework-adapter classification. Omitted for the framework skills themselves
   * (react, nextjs, react-native, electron, tauri, …) which are the binding targets.
   * class A → frameworks: []; class B → exactly one; class C → the adapter set.
   */
  classification?: { class: SkillClass; frameworks: SkillSlug[] };
  /** Cited sources — recorded wherever the entry changed a rule. */
  sources?: string[];
  /** Anything the current vocabulary cannot express, deferred rather than invented here. */
  deferredToD306?: string;
};

/**
 * Every catalog skill's audit verdict, one entry per skill.
 *
 * Total record, not `Partial`: the type checker enforces "every SkillId appears" at compile
 * time, so the "empty = unaudited, or nobody looked?" ambiguity is unrepresentable for
 * built-ins. Source-provided skills cannot be covered that way — `checkMatrixHealth` carries
 * the runtime assertion for those.
 *
 * Verdicts were recorded as of the audit, assuming the batches' category dispositions would
 * land; they have, so every row is backed by the live rules and
 * `auditVerdictsPendingApply` below — the exemption list for rows the tree has not caught up
 * with — is empty.
 */
export const skillAudit: Record<SkillId, SkillAuditEntry> = {
  // ── B1 — web core: frameworks, meta-frameworks, routing, server state (20) ──
  "web-framework-react": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
  },
  "web-framework-vue-composition-api": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
  },
  "web-framework-angular-standalone": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
  },
  "web-framework-solidjs": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
  },
  "web-framework-svelte": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
  },
  "web-meta-framework-nextjs": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
  },
  "web-meta-framework-remix": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
  },
  "web-meta-framework-nuxt": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
  },
  "web-meta-framework-sveltekit": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
  },
  "web-meta-framework-astro": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
  },
  "web-meta-framework-qwik": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
  },
  "web-meta-framework-docusaurus": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
    classification: { class: "A", frameworks: [] },
    sources: ["https://docusaurus.io"],
  },
  "web-meta-framework-vitepress": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
    classification: { class: "A", frameworks: [] },
    sources: ["https://github.com/honojs/website", "https://vitepress.dev"],
  },
  "web-routing-react-router": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
    classification: { class: "B", frameworks: ["react"] },
    sources: ["https://reactrouter.com"],
  },
  "web-routing-tanstack-router": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
    classification: { class: "B", frameworks: ["react"] },
    deferredToD306:
      "Solid trigger: widen to needsAny [react, solidjs] if Solid content lands in the body (the official @tanstack/solid-router adapter already shipped upstream).",
  },
  "web-server-state-react-query": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
    classification: { class: "B", frameworks: ["react"] },
    deferredToD306:
      "The hey-api MUST beside tRPC: the MUST reads literally (generated query options from hey-api — never write custom React Query hooks) and sits in tension beside tRPC-generated options in a hybrid stack; if that MUST is ever re-cut to claim ALL server data, the coexistence rationale reopens.",
  },
  "web-data-fetching-swr": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-data-fetching-trpc": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-data-fetching-graphql-apollo": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-data-fetching-graphql-urql": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-core",
    classification: {
      class: "C",
      frameworks: ["react", "vue-composition-api", "solidjs", "svelte"],
    },
  },

  // ── B2 — web state, forms, i18n, utilities (19) ──
  "web-state-jotai": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["react"] },
    deferredToD306:
      "Jotai beside a store library is a real pattern (atomic UI atoms beside a domain store) with an official bridge extension (jotai-zustand / atomWithStore) but no vendor-documented two-peers steady state; unrepresentable while the zustand skill's MUST is territorial. Reopen trigger: the zustand MUST being re-cut to store-shaped state.",
  },
  "web-state-mobx": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-state-redux-toolkit": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-state-zustand": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-state-pinia": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["vue-composition-api"] },
  },
  "web-state-ngrx-signalstore": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["angular-standalone"] },
  },
  "web-forms-react-hook-form": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-forms-tanstack-form": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: {
      class: "C",
      frameworks: ["react", "vue-composition-api", "angular-standalone", "solidjs"],
    },
    deferredToD306:
      "Svelte-widening trigger: widen the needsAny to svelte/sveltekit when Svelte content lands in the body (@tanstack/svelte-form is stable upstream; the skill claims React/Vue/Solid/Angular/Lit only).",
  },
  "web-forms-vee-validate": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["vue-composition-api"] },
  },
  "web-forms-zod-validation": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-state",
    classification: { class: "A", frameworks: [] },
    sources: ["https://zod.dev"],
  },
  "web-error-handling-error-boundaries": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-error-handling-result-types": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-state",
    classification: { class: "A", frameworks: [] },
  },
  "web-i18n-next-intl": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["nextjs"] },
  },
  "web-i18n-react-intl": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-i18n-vue-i18n": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["vue-composition-api"] },
  },
  "web-utilities-rxjs": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-state",
    classification: { class: "A", frameworks: [] },
  },
  "web-utilities-date-fns": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-state",
    classification: { class: "A", frameworks: [] },
  },
  "web-utilities-vueuse": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-state",
    classification: { class: "B", frameworks: ["vue-composition-api"] },
  },
  "web-utilities-native-js": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-state",
    classification: { class: "A", frameworks: [] },
  },

  // ── B3 — web UI, styling, animation, editors (22) ──
  "web-ui-shadcn-ui": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-ui-mui": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "C", frameworks: ["react", "nextjs"] },
  },
  "web-ui-chakra-ui": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-ui-mantine": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-ui-ant-design": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "C", frameworks: ["react", "nextjs"] },
  },
  "web-ui-vuetify": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "B", frameworks: ["vue-composition-api"] },
  },
  "web-ui-radix-ui": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-ui-headless-ui": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-ui-base-ui": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "B", frameworks: ["react"] },
    sources: ["https://base-ui.com"],
  },
  "web-ui-tanstack-table": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-styling-tailwind": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-ui",
    classification: { class: "C", frameworks: [] },
  },
  "web-styling-scss-modules": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-ui",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "tailwind <-> scss-modules coexistence is documented (Tailwind's own compatibility page allows but discourages it) — a discourages-shaped pair, no fence today.",
  },
  "web-styling-cva": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-ui",
    classification: { class: "A", frameworks: [] },
  },
  "web-styling-theming": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-ui",
    classification: { class: "A", frameworks: [] },
  },
  "web-styling-design-tokens": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-ui",
    classification: { class: "A", frameworks: [] },
  },
  "web-animation-framer-motion": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-animation-css-animations": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-ui",
    classification: { class: "A", frameworks: [] },
  },
  "web-animation-view-transitions": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-ui",
    classification: { class: "A", frameworks: [] },
  },
  "web-editor-lexical": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "B", frameworks: ["react"] },
    sources: ["https://lexical.dev"],
  },
  "web-editor-tiptap": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "C", frameworks: ["react", "vue-composition-api"] },
  },
  "web-3d-react-three-fiber": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "B", frameworks: ["react"] },
    sources: ["https://r3f.docs.pmnd.rs"],
  },
  "web-dnd-dnd-kit": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-ui",
    classification: { class: "B", frameworks: ["react"] },
    sources: [
      "skill body (DndContext/useDraggable/useDroppable/useSortable; every import a @dnd-kit/* React package)",
      'npm @dnd-kit/core ("a lightweight React library")',
    ],
  },

  // ── B4 — web platform, testing, tooling (23) ──
  "web-testing-playwright-e2e": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: { class: "A", frameworks: [] },
  },
  "web-testing-cypress-e2e": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "Cypress component testing beside Playwright E2E is unrepresentable — carried by the cy.mount slice; 2026 guidance keys the CT tool to the incumbent E2E runner, so the radio holds.",
  },
  "web-testing-react-testing-library": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-testing-vue-test-utils": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: { class: "B", frameworks: ["vue-composition-api"] },
  },
  "web-testing-vitest": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-platform",
    classification: { class: "A", frameworks: [] },
  },
  "web-testing-visual-regression": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-platform",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "Pairs with a capture harness (playwright / cypress / storybook) — advice only; enumerating the harnesses would misstate BackstopJS/Percy-class setups.",
  },
  "web-tooling-storybook": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: {
      class: "C",
      frameworks: [
        "react",
        "vue-composition-api",
        "angular-standalone",
        "solidjs",
        "svelte",
        "qwik",
      ],
    },
    sources: ["https://storybook.js.org/docs/configure/integration/frameworks"],
    deferredToD306:
      "A community Astro framework exists (storybook-astro.org) but is not official — astro stays fenced out today. Package-health watch: storybook-framework-qwik 0.6.1, personal repo, trails Storybook 10.x.",
  },
  "web-tooling-vite": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-platform",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "vite <-> nextjs and vite <-> docusaurus are dubious combos (discourages-shaped, advice not fence) — with the 6-of-15 vite-carrying default-stack rosters that also pin nextjs named as curation debt for the stack owner.",
  },
  "web-tooling-component-library": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: { class: "B", frameworks: ["react"] },
    sources: [
      'skill body (self-scope on all three surfaces; 3 of 5 MUSTs React/RSC-keyed; the "use client" contract)',
    ],
  },
  "web-realtime-websockets": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: { class: "C", frameworks: ["react"] },
  },
  "web-realtime-socket-io": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: { class: "C", frameworks: ["react"] },
    deferredToD306:
      "A native-WebSocket third-party feed beside Socket.IO-to-own-server (the external service dictates the protocol) is a scope split the radio cannot express.",
  },
  "web-realtime-sse": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-platform",
    classification: { class: "C", frameworks: ["react"] },
  },
  "web-pwa-service-workers": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-platform",
    classification: { class: "A", frameworks: [] },
  },
  "web-pwa-offline-first": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-platform",
    classification: { class: "C", frameworks: ["react"] },
  },
  "web-dataviz-d3": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-platform",
    classification: { class: "A", frameworks: [] },
  },
  "web-dataviz-recharts": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: { class: "B", frameworks: ["react"] },
    sources: ["https://recharts.org"],
  },
  "web-maps-leaflet": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: { class: "A", frameworks: [] },
  },
  "web-maps-mapbox": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "mapbox-gl-leaflet embedding (the Leaflet API drives a non-interactive GL layer, so half the mapbox skill applies and half must not be followed); Mapbox-as-tile-service needs no skill pairing at all.",
  },
  "web-mocks-msw": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-platform",
    classification: { class: "A", frameworks: [] },
  },
  "web-files-file-upload-patterns": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-files-image-handling": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "web-platform",
    classification: { class: "B", frameworks: ["react"] },
  },
  "web-performance-web-performance": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-platform",
    classification: { class: "C", frameworks: ["react"] },
  },
  "web-accessibility-web-accessibility": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "web-platform",
    classification: { class: "A", frameworks: [] },
  },

  // ── B5 — api core: frameworks, GraphQL, auth, cross-cutting (17) ──
  "api-framework-hono": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-core",
  },
  "api-framework-express": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-core",
  },
  "api-framework-fastify": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-core",
  },
  "api-framework-nestjs": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-core",
  },
  "api-framework-elysia": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-core",
  },
  "api-graphql-apollo-server": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-core",
    classification: { class: "C", frameworks: ["express", "fastify"] },
  },
  "api-graphql-yoga": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-core",
    classification: { class: "A", frameworks: [] },
  },
  "api-graphql-mercurius": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-core",
    classification: { class: "B", frameworks: ["fastify"] },
    sources: [
      'skill body ("When NOT to use: Not using Fastify (Mercurius is Fastify-only)")',
      "mercurius README (npm i fastify mercurius graphql; app.register(mercurius))",
    ],
  },
  "api-auth-better-auth-drizzle-hono": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-core",
    classification: { class: "B", frameworks: ["hono"] },
    sources: [
      'skill body (app.on(["POST","GET"], "/auth/*", …); createMiddleware<{ Variables: AuthVariables }>; c.req.raw)',
      "https://better-auth.com",
    ],
  },
  "api-auth-nextauth": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-core",
    classification: { class: "B", frameworks: ["nextjs"] },
    sources: ["https://authjs.dev"],
  },
  "api-auth-clerk": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-core",
    classification: { class: "B", frameworks: ["nextjs"] },
  },
  "api-specs-openapi": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "api-core",
    classification: { class: "A", frameworks: [] },
  },
  "api-messaging-webhooks": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "api-core",
    classification: { class: "A", frameworks: [] },
  },
  "api-caching-strategies": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "api-core",
    classification: { class: "A", frameworks: [] },
  },
  "api-queue-bullmq": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-core",
    classification: { class: "A", frameworks: [] },
    sources: [
      "https://docs.bullmq.io/guide/redis-tm-compatibility",
      "https://upstash.com/docs/redis/integrations/bullmq",
    ],
    deferredToD306:
      "BullMQ polls Redis even when idle, so Upstash's per-request Pay-As-You-Go pricing balloons (Upstash recommends a Fixed plan) — curation advice, not a fence.",
  },
  "api-performance-api-performance": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "api-core",
    classification: { class: "A", frameworks: [] },
  },
  "api-commerce-stripe": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "api-core",
    classification: { class: "A", frameworks: [] },
  },

  // ── B6 — api data: databases and BaaS (22) ──
  "api-database-postgresql": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-mysql": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-cockroachdb": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-drizzle": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-prisma": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "Prisma-on-Mongo overlaps mongoose as a full Mongo data layer; the pair is deliberately unfenced across the sql-engine/document radios (accepted over-permissiveness).",
  },
  "api-database-sequelize": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-typeorm": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-knex": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-mongodb": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-mongoose": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-edgedb": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-surrealdb": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-redis": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-upstash": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-database-vercel-kv": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "vercel-kv -> requires [vercel] deferred, not adopted: product-true (only provisionable on Vercel) but the product is discontinued (Dec 2024) and retirement is the better disposition.",
  },
  "api-database-vercel-postgres": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "vercel-postgres -> requires [vercel] deferred, not adopted: product-true but the product is discontinued (auto-migrated to Neon) and retirement is the better disposition.",
  },
  "api-baas-supabase": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-baas-firebase": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-baas-appwrite": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-baas-neon": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-baas-planetscale": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
  },
  "api-baas-turso": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-data",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "turso as an edge-replica secondary beside a primary Postgres host is a real minority pattern the api-db-host radio over-restricts — accepted.",
  },

  // ── B7 — api services: vector, search, CMS, analytics, observability, email (16) ──
  "api-vector-db-pinecone": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "A", frameworks: [] },
  },
  "api-vector-db-qdrant": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "A", frameworks: [] },
  },
  "api-vector-db-chroma": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "chroma <-> pinecone dev/prod graduation split is the one real minority pattern the vector-db radio blocks.",
  },
  "api-vector-db-weaviate": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "A", frameworks: [] },
  },
  "api-search-elasticsearch": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "Elasticsearch-for-logs beside Meilisearch-for-product-search is a real dual-role coexistence the api-search radio blocks.",
  },
  "api-search-meilisearch": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "A", frameworks: [] },
  },
  // Landed by external PR (agents-inc/skills#2) after the B7 batch closed; verdict follows
  // its api-search siblings — the category radio is the constraint, no rules of its own.
  "api-search-xquik": {
    audited: "2026-08-09",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "A", frameworks: [] },
  },
  "api-cms-payload": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "C", frameworks: ["nextjs"] },
    deferredToD306:
      "payload's full surface (admin panel, mounted REST/GraphQL) is Next-hosted today; the taught surface (config, collections, access control, hooks, Local API) is the documented headless mode and host-neutral — the nextjs pairing is recommends-shaped. Re-derive if the body grows Next mounting content, or when the 4.0 framework adapters land.",
  },
  "api-cms-sanity": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "C", frameworks: ["react"] },
  },
  "api-cms-strapi": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "A", frameworks: [] },
  },
  "api-analytics-setup-posthog": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "api-services",
    classification: { class: "C", frameworks: ["react"] },
  },
  "api-flags-posthog-flags": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "api-services",
    classification: { class: "C", frameworks: ["react"] },
  },
  "api-analytics-posthog-analytics": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "api-services",
    classification: { class: "C", frameworks: ["react"] },
  },
  "api-observability-setup-axiom-pino-sentry": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "C", frameworks: ["nextjs"] },
    sources: [
      "skill body (next-axiom, @sentry/nextjs, next.config.ts wrapped withAxiom(withSentryConfig(...)), instrumentation.ts, sentry.{client,server,edge}.config.ts)",
      'todo/skills.md — "Next-only in all but name"',
    ],
  },
  "api-observability-axiom-pino-sentry": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "api-services",
    classification: { class: "C", frameworks: ["react"] },
  },
  "api-email-setup-resend": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "B", frameworks: ["react"] },
    sources: ["https://react.email/docs"],
  },
  "api-email-resend-react-email": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "api-services",
    classification: { class: "B", frameworks: ["react"] },
    deferredToD306:
      "React-as-template-renderer is not React-as-app-framework: React Email runs in any Node backend, but because react sits in the exclusive web-framework radio the rule fences every Vue/Svelte/Angular project out of the catalog's only email-usage skill.",
  },

  // ── B8 — ai (20) ──
  "ai-provider-anthropic-sdk": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-provider-openai-sdk": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-provider-google-gemini-sdk": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-provider-mistral-sdk": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-provider-cohere-sdk": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-provider-elevenlabs": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-provider-claude-vision": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-provider-openai-whisper": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-infrastructure-huggingface-inference": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-infrastructure-together-ai": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-infrastructure-litellm": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "Wire-protocol reuse is not a skill dependency: litellm's TypeScript client literally is new OpenAI({ baseURL }), but the body carries its own complete client pointed away from OpenAI, so it derives no requires [openai-sdk].",
  },
  "ai-infrastructure-replicate": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-infrastructure-modal": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-infrastructure-ollama": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-orchestration-langchain": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-orchestration-llamaindex": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-orchestration-vercel-ai-sdk": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "C", frameworks: ["react"] },
  },
  "ai-observability-langfuse": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-observability-promptfoo": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },
  "ai-patterns-tool-use-patterns": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "ai",
    classification: { class: "A", frameworks: [] },
  },

  // ── B9 — mobile (24) ──
  "mobile-framework-react-native": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
  },
  "mobile-framework-expo": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
  },
  "mobile-navigation-react-navigation": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://reactnavigation.org"],
  },
  "mobile-navigation-expo-router": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["expo"] },
    sources: ["https://docs.expo.dev/router/installation/"],
  },
  "mobile-styling-nativewind": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://www.nativewind.dev"],
  },
  "mobile-styling-unistyles": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://www.unistyl.es"],
  },
  "mobile-testing-detox": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://github.com/wix/Detox"],
  },
  "mobile-testing-maestro": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "A", frameworks: [] },
    sources: ["https://docs.maestro.dev/get-started/supported-platform"],
    deferredToD306:
      "Needs an app Maestro can drive; the needsAny enumerates the catalog's current mobile-app producers (react-native, expo, tauri-mobile) — re-derive when that set changes.",
  },
  "mobile-ui-components-tamagui": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "C", frameworks: ["react-native", "react"] },
    sources: ["https://tamagui.dev/docs/intro/installation", "https://github.com/tamagui/tamagui"],
    deferredToD306:
      "Surfaces a mobile-domain UI kit in web-only stacks — a curation question for the web-ui-kit split (group #14), advice-level only.",
  },
  "mobile-ui-components-react-native-paper": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://callstack.github.io/react-native-paper/"],
  },
  "mobile-animation-reanimated": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://docs.swmansion.com/react-native-reanimated/"],
  },
  "mobile-animation-gesture-handler": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://docs.swmansion.com/react-native-gesture-handler/"],
  },
  "mobile-animation-skia": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://shopify.github.io/react-native-skia/"],
  },
  "mobile-storage-mmkv": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://github.com/mrousavy/react-native-mmkv"],
  },
  "mobile-storage-sqlite-powersync": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://docs.powersync.com/resources/supported-platforms"],
  },
  "mobile-storage-watermelondb": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://watermelondb.dev/docs/Implementation/DatabaseAdapters"],
    deferredToD306:
      "Upstream runs on React web via the LokiJS adapter; widen the binding if and only if the skill body ever covers it.",
  },
  "mobile-deployment-eas": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["expo"] },
    sources: ["https://docs.expo.dev/build/introduction/"],
  },
  "mobile-camera-vision-camera": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://react-native-vision-camera.com"],
  },
  "mobile-hardware-ble-nfc": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: [
      "https://github.com/dotintent/react-native-ble-plx",
      "https://github.com/revtel/react-native-nfc-manager",
    ],
  },
  "mobile-notifications-push": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: [
      "https://docs.expo.dev/push-notifications/overview/",
      "https://rnfirebase.io/messaging/usage",
    ],
  },
  "mobile-background-tasks": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: [
      "https://docs.expo.dev/versions/latest/sdk/background-task/",
      "https://github.com/transistorsoft/react-native-background-fetch",
    ],
  },
  "mobile-deep-linking-app-links": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: [
      "https://docs.expo.dev/linking/overview/",
      "https://reactnavigation.org/docs/deep-linking/",
    ],
  },
  "mobile-performance-react-native": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: ["https://reactnative.dev/docs/performance"],
  },
  "mobile-security-react-native": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "mobile",
    classification: { class: "B", frameworks: ["react-native"] },
    sources: [
      "https://docs.expo.dev/versions/latest/sdk/securestore/",
      "https://github.com/oblador/react-native-keychain",
    ],
  },

  // ── B10 — desktop (16) ──
  "desktop-framework-electron": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
  },
  "desktop-framework-tauri": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
  },
  "desktop-ipc-electron": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["electron"] },
    sources: ["https://www.electronjs.org/docs/latest/tutorial/ipc"],
  },
  "desktop-storage-electron": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["electron"] },
    sources: [
      "https://www.electronjs.org/docs/latest/api/safe-storage",
      "https://github.com/sindresorhus/electron-store",
    ],
  },
  "desktop-ui-electron": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["electron"] },
    sources: ["https://www.electronjs.org/docs/latest/api/tray"],
  },
  "desktop-testing-electron": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["electron"] },
    sources: ["https://playwright.dev/docs/api/class-electron"],
  },
  "desktop-updates-electron-updater": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["electron"] },
    sources: [
      "https://github.com/electron-userland/electron-builder",
      "https://www.electron.build/auto-update",
    ],
    deferredToD306:
      "Defaults to the electron-builder pipeline (reads app-update.yml, written only by electron-builder's PublishManager); Forge apps using the Squirrel maker use Electron's built-in autoUpdater instead; Forge without Squirrel, and custom distributions, can still run electron-updater with custom config / generic provider.",
  },
  "desktop-multiwindow-electron": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["electron"] },
    sources: ["https://www.electronjs.org/docs/latest/api/base-window"],
  },
  "desktop-security-electron": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["electron"] },
    sources: ["https://www.electronjs.org/docs/latest/tutorial/fuses"],
  },
  "desktop-packaging-electron-forge": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["electron"] },
    sources: ["https://www.electronforge.io"],
  },
  "desktop-backend-tauri": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["tauri"] },
    sources: ["https://v2.tauri.app/develop/calling-rust/"],
  },
  "desktop-packaging-tauri": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["tauri"] },
    sources: ["https://v2.tauri.app/distribute/"],
  },
  "desktop-plugins-tauri": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["tauri"] },
    sources: ["https://v2.tauri.app/plugin/"],
  },
  "desktop-multiwindow-tauri": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["tauri"] },
    sources: ["https://v2.tauri.app/develop/calling-frontend/"],
  },
  "desktop-security-tauri": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["tauri"] },
    sources: ["https://v2.tauri.app/security/capabilities/"],
  },
  "desktop-mobile-tauri": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "desktop",
    classification: { class: "B", frameworks: ["tauri"] },
    sources: [
      "https://v2.tauri.app/reference/cli",
      "https://v2.tauri.app/blog/roadmap-to-tauri-2-0",
    ],
  },

  // ── B11 — infra + CLI (15) ──
  "infra-ci-cd-github-actions": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "infra-cli",
    classification: { class: "A", frameworks: [] },
  },
  "infra-ci-cd-docker": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "infra-cli",
    classification: { class: "A", frameworks: [] },
  },
  "infra-ci-cd-turborepo-ci": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "infra-cli",
    classification: { class: "B", frameworks: ["turborepo"] },
    sources: ["https://turborepo.dev/docs"],
  },
  "infra-config-setup-env": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "infra-cli",
    classification: { class: "C", frameworks: ["nextjs", "vite"] },
  },
  "infra-containers-kubernetes": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "infra-cli",
    classification: { class: "A", frameworks: [] },
  },
  "infra-iac-terraform": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "infra-cli",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "Layered terraform + pulumi coexistence via Pulumi's RemoteStateReference (a Pulumi program consuming the outputs of a Terraform-managed layer) is real at org scope; the radio models one engine per project.",
  },
  "infra-iac-pulumi": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "infra-cli",
    classification: { class: "A", frameworks: [] },
  },
  "infra-iac-sst": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "infra-cli",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "sst's typical data plane is @aws-sdk/client-* — the sst skill's own handlers import it; the pairing is recommended, not required, and platform-boundness (SST needs AWS-the-platform, which has no catalog anchor) is unrepresentable in the current vocabulary.",
  },
  "infra-platform-vercel": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "infra-cli",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "vercel <-> netlify is a same-slot tension (one primary Git-centric host per app; monorepo split-hosting and migrations are the minority) and vercel <-> cloudflare-workers-as-host is the same shape — dubious combos, declined as fences.",
  },
  "infra-platform-netlify": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "infra-cli",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "Carries the same dubious-combo record as vercel: vercel <-> netlify is a same-slot tension declined as a fence.",
  },
  "infra-platform-cloudflare-workers": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "infra-cli",
    classification: { class: "A", frameworks: [] },
  },
  "infra-platform-aws-sdk": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "infra-cli",
    classification: { class: "A", frameworks: [] },
  },
  "cli-framework-cli-commander": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "infra-cli",
  },
  "cli-framework-oclif-ink": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "infra-cli",
  },
  "cli-prompts-clack": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "infra-cli",
    classification: { class: "A", frameworks: [] },
  },

  // ── B12 — shared + meta (23) ──
  "shared-monorepo-turborepo": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "shared-monorepo-nx": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "shared-monorepo-pnpm-workspaces": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "shared-tooling-biome": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
    deferredToD306:
      "The steady-state Biome-as-formatter plus bare-ESLint-for-plugin-gaps hybrid is real; it is unrepresentable while the catalog's ESLint skill bundles Prettier. A future bare eslint skill reopens this radio's rationale.",
  },
  "shared-tooling-eslint-prettier": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "shared-tooling-typescript-config": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "shared-tooling-git-hooks": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "shared-tooling-changesets": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "meta-config-stack-detect": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "shared-security-auth-security": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "meta-design-expressive-typescript": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "meta-design-composable-components": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "shared-meta",
    classification: { class: "B", frameworks: ["react"] },
    sources: [
      'skill body and all four example files (imports from "react"; @base-ui/react/use-render; @base-ui/react/merge-props; forwardRef; JSX-part composition)',
    ],
  },
  "meta-methodology-research-methodology": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "meta-planning-web-planning": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "meta-planning-api-planning": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "meta-planning-cli-planning": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "meta-planning-ai-planning": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "meta-reviewing-reviewing": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "meta-reviewing-web-reviewing": {
    audited: "2026-08-07",
    verdict: "constrained-via-exclusivity-or-requires",
    batch: "shared-meta",
    classification: { class: "B", frameworks: ["react"] },
    sources: [
      'skill body self-scope (description "Use when reviewing React components"; When-to-use ".tsx/.jsx with JSX"; "React PR review" auto-detection) plus a React-keyed majority (4 of 5 MUSTs, 6 of 7 patterns)',
    ],
  },
  "meta-reviewing-api-reviewing": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "meta-reviewing-cli-reviewing": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "meta-reviewing-ai-reviewing": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
  "meta-reviewing-infra-reviewing": {
    audited: "2026-08-07",
    verdict: "universal",
    batch: "shared-meta",
    classification: { class: "A", frameworks: [] },
  },
};

/**
 * Rows whose verdict was recorded ahead of the category disposition that backs it, with the
 * batch that owns the change. Both audit checks skip exactly these and nothing else, so any
 * other divergence between the manifest and the rules fails immediately.
 *
 * Empty since every disposition the fan-out ruled on landed: the live rules now back all 238
 * verdicts on their own. It stays as the mechanism for the next audit that runs ahead of its
 * taxonomy — add an entry with the batch that owns it, and delete it when that lands. The
 * consistency test asserts this set matches the live gap exactly, so a stale entry fails just
 * as loudly as a missing one.
 */
export const auditVerdictsPendingApply: Partial<Record<SkillId, string>> = {};
