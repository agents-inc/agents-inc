# CLI-400 divergence report — hand-written stack flags vs the resolver's verdict

Measured 2026-08-06, against `packages/cli/src/cli/lib/configuration/default-stacks.ts` **as
authored** (before the strip) and `resolveLoadState` bound to `PRELOAD_DEFAULTS` in
`packages/matrix/src/read-model/preload-defaults.ts`.

One row per `(stack, sub-agent, category, skill)` triple the built-in stacks carry. `old` is the
hand-written flag — `preloaded: true` present, or absent and therefore lazy. `new` is what the
shared mapping answers for the same pair, through the same guard the config generator uses: a skill
id or agent name outside the generated unions resolves to lazy rather than being put to the table.

The direction was already ruled by the owner: the mapping decides. This is the audit trail for
what that ruling changed, not a request to approve it.

## Totals

| Measure                                 | Count |
| --------------------------------------- | ----- |
| Built-in stacks                         | 17    |
| Triples across all stacks               | 1552  |
| Agreements (old verdict == new verdict) | 1202  |
| — of those, both say preloaded          | 92    |
| — of those, both say lazy               | 1110  |
| Divergences: old preloaded, now lazy    | 43    |
| Divergences: old lazy, now preloaded    | 307   |
| Preloaded triples before                | 135   |
| Preloaded triples after                 | 399   |

The net direction is more eager, not less: the hand-written flags preloaded a framework on the one
or two agents whose stack rows named it, while the mapping preloads it on every role that reasonably
works in it — its own domain's developer, PM, researcher, reviewer and tester — and nowhere else.

## Old preloaded → now lazy (43 triples)

By stack: nextjs-ai-saas: 2, nextjs-saas-starter: 1, expo-mobile-fullstack: 2, cli-ink-oclif: 38.

Two shapes, and both are the domain-affinity gate doing its job:

- **`cli-ink-oclif` (38 of the 43)** hand-marked its whole toolchain preloaded on every agent it
  names — React, Zustand, Zod, Vitest and the expressive-TypeScript craft on the CLI roster, the
  summoners and the reviewer alike. The mapping preloads a web framework on web agents; a CLI
  developer reaching for React occasionally gets it lazily.
- **`nextjs-ai-saas`, `nextjs-saas-starter`, `expo-mobile-fullstack` (5)** marked a cross-domain
  skill preloaded on an agent of another domain — the AI SDKs and Stripe on `api-developer`, React
  Native and Expo on `web-developer`.

Distinct `(skill → sub-agent)` pairs behind these rows:

- `ai-orchestration-vercel-ai-sdk -> api-developer`
- `ai-provider-anthropic-sdk -> api-developer`
- `api-commerce-stripe -> api-developer`
- `cli-framework-oclif-ink -> agent-summoner`
- `cli-framework-oclif-ink -> codex-keeper`
- `cli-framework-oclif-ink -> skill-summoner`
- `cli-framework-oclif-ink -> web-pm`
- `cli-framework-oclif-ink -> web-researcher`
- `meta-design-expressive-typescript -> agent-summoner`
- `meta-design-expressive-typescript -> cli-pm`
- `meta-design-expressive-typescript -> cli-researcher`
- `meta-design-expressive-typescript -> cli-tester`
- `meta-design-expressive-typescript -> codex-keeper`
- `meta-design-expressive-typescript -> reviewer`
- `meta-design-expressive-typescript -> skill-summoner`
- `meta-design-expressive-typescript -> web-pm`
- `meta-design-expressive-typescript -> web-researcher`
- `mobile-framework-expo -> web-developer`
- `mobile-framework-react-native -> web-developer`
- `web-forms-zod-validation -> agent-summoner`
- `web-forms-zod-validation -> cli-developer`
- `web-forms-zod-validation -> cli-pm`
- `web-forms-zod-validation -> cli-researcher`
- `web-forms-zod-validation -> cli-tester`
- `web-forms-zod-validation -> codex-keeper`
- `web-forms-zod-validation -> reviewer`
- `web-forms-zod-validation -> skill-summoner`
- `web-framework-react -> agent-summoner`
- `web-framework-react -> cli-developer`
- `web-framework-react -> cli-pm`
- `web-framework-react -> cli-researcher`
- `web-framework-react -> cli-tester`
- `web-framework-react -> codex-keeper`
- `web-framework-react -> skill-summoner`
- `web-state-zustand -> agent-summoner`
- `web-state-zustand -> cli-developer`
- `web-state-zustand -> cli-pm`
- `web-state-zustand -> cli-researcher`
- `web-state-zustand -> cli-tester`
- `web-state-zustand -> codex-keeper`
- `web-state-zustand -> reviewer`
- `web-state-zustand -> skill-summoner`
- `web-testing-vitest -> cli-tester`

Full table:

| Stack                   | Sub-agent        | Category           | Skill                               |
| ----------------------- | ---------------- | ------------------ | ----------------------------------- |
| `nextjs-ai-saas`        | `api-developer`  | `ai-orchestration` | `ai-orchestration-vercel-ai-sdk`    |
| `nextjs-ai-saas`        | `api-developer`  | `ai-provider`      | `ai-provider-anthropic-sdk`         |
| `nextjs-saas-starter`   | `api-developer`  | `api-commerce`     | `api-commerce-stripe`               |
| `expo-mobile-fullstack` | `web-developer`  | `mobile-framework` | `mobile-framework-expo`             |
| `expo-mobile-fullstack` | `web-developer`  | `mobile-framework` | `mobile-framework-react-native`     |
| `cli-ink-oclif`         | `cli-developer`  | `web-framework`    | `web-framework-react`               |
| `cli-ink-oclif`         | `cli-developer`  | `web-forms`        | `web-forms-zod-validation`          |
| `cli-ink-oclif`         | `cli-developer`  | `web-client-state` | `web-state-zustand`                 |
| `cli-ink-oclif`         | `reviewer`       | `web-forms`        | `web-forms-zod-validation`          |
| `cli-ink-oclif`         | `reviewer`       | `web-client-state` | `web-state-zustand`                 |
| `cli-ink-oclif`         | `reviewer`       | `meta-design`      | `meta-design-expressive-typescript` |
| `cli-ink-oclif`         | `cli-tester`     | `web-framework`    | `web-framework-react`               |
| `cli-ink-oclif`         | `cli-tester`     | `web-forms`        | `web-forms-zod-validation`          |
| `cli-ink-oclif`         | `cli-tester`     | `web-client-state` | `web-state-zustand`                 |
| `cli-ink-oclif`         | `cli-tester`     | `web-testing`      | `web-testing-vitest`                |
| `cli-ink-oclif`         | `cli-tester`     | `meta-design`      | `meta-design-expressive-typescript` |
| `cli-ink-oclif`         | `cli-pm`         | `web-framework`    | `web-framework-react`               |
| `cli-ink-oclif`         | `cli-pm`         | `web-forms`        | `web-forms-zod-validation`          |
| `cli-ink-oclif`         | `cli-pm`         | `web-client-state` | `web-state-zustand`                 |
| `cli-ink-oclif`         | `cli-pm`         | `meta-design`      | `meta-design-expressive-typescript` |
| `cli-ink-oclif`         | `cli-researcher` | `web-framework`    | `web-framework-react`               |
| `cli-ink-oclif`         | `cli-researcher` | `web-forms`        | `web-forms-zod-validation`          |
| `cli-ink-oclif`         | `cli-researcher` | `web-client-state` | `web-state-zustand`                 |
| `cli-ink-oclif`         | `cli-researcher` | `meta-design`      | `meta-design-expressive-typescript` |
| `cli-ink-oclif`         | `web-pm`         | `cli-framework`    | `cli-framework-oclif-ink`           |
| `cli-ink-oclif`         | `web-pm`         | `meta-design`      | `meta-design-expressive-typescript` |
| `cli-ink-oclif`         | `web-researcher` | `cli-framework`    | `cli-framework-oclif-ink`           |
| `cli-ink-oclif`         | `web-researcher` | `meta-design`      | `meta-design-expressive-typescript` |
| `cli-ink-oclif`         | `agent-summoner` | `cli-framework`    | `cli-framework-oclif-ink`           |
| `cli-ink-oclif`         | `agent-summoner` | `web-framework`    | `web-framework-react`               |
| `cli-ink-oclif`         | `agent-summoner` | `web-forms`        | `web-forms-zod-validation`          |
| `cli-ink-oclif`         | `agent-summoner` | `web-client-state` | `web-state-zustand`                 |
| `cli-ink-oclif`         | `agent-summoner` | `meta-design`      | `meta-design-expressive-typescript` |
| `cli-ink-oclif`         | `skill-summoner` | `cli-framework`    | `cli-framework-oclif-ink`           |
| `cli-ink-oclif`         | `skill-summoner` | `web-framework`    | `web-framework-react`               |
| `cli-ink-oclif`         | `skill-summoner` | `web-forms`        | `web-forms-zod-validation`          |
| `cli-ink-oclif`         | `skill-summoner` | `web-client-state` | `web-state-zustand`                 |
| `cli-ink-oclif`         | `skill-summoner` | `meta-design`      | `meta-design-expressive-typescript` |
| `cli-ink-oclif`         | `codex-keeper`   | `cli-framework`    | `cli-framework-oclif-ink`           |
| `cli-ink-oclif`         | `codex-keeper`   | `web-framework`    | `web-framework-react`               |
| `cli-ink-oclif`         | `codex-keeper`   | `web-forms`        | `web-forms-zod-validation`          |
| `cli-ink-oclif`         | `codex-keeper`   | `web-client-state` | `web-state-zustand`                 |
| `cli-ink-oclif`         | `codex-keeper`   | `meta-design`      | `meta-design-expressive-typescript` |

## Old lazy → now preloaded (307 triples)

By stack: nextjs-fullstack: 28, nextjs-t3-stack: 15, nextjs-supabase-fullstack: 30, nextjs-turborepo-fullstack: 28, react-old-school: 12, react-hono-fullstack: 25, remix-fullstack: 14, sveltekit-fullstack: 14, solidjs-fullstack: 11, astro-content-fullstack: 9, vue-modern-fullstack: 14, nuxt-fullstack: 17, angular-modern-fullstack: 14, nextjs-ai-saas: 28, nextjs-saas-starter: 28, expo-mobile-fullstack: 20.

Every stack gains rows here. The pattern is uniform: a stack marked its framework preloaded on the
implementing developer only, and left the same framework lazy on that domain's PM, researcher,
reviewer and tester, who all carry it. The mapping's rows say those roles read the framework in most
of their sessions, so they now preload it. The same holds for the state, styling and server-state
skills a stack picked, and for the testers' `web-testing-*` and `web-mocks-msw`.

Distinct `(skill → sub-agent)` pairs behind these rows (73):

- `api-auth-better-auth-drizzle-hono -> api-developer`
- `api-auth-better-auth-drizzle-hono -> api-researcher`
- `api-auth-nextauth -> api-developer`
- `api-baas-supabase -> api-developer`
- `api-baas-supabase -> api-researcher`
- `api-database-drizzle -> api-researcher`
- `api-database-prisma -> api-researcher`
- `api-framework-hono -> api-researcher`
- `api-framework-hono -> reviewer`
- `api-observability-axiom-pino-sentry -> api-developer`
- `cli-framework-oclif-ink -> reviewer`
- `mobile-framework-expo -> reviewer`
- `mobile-framework-react-native -> reviewer`
- `web-accessibility-web-accessibility -> web-developer`
- `web-accessibility-web-accessibility -> web-pm`
- `web-accessibility-web-accessibility -> web-researcher`
- `web-data-fetching-trpc -> web-pm`
- `web-data-fetching-trpc -> web-researcher`
- `web-framework-angular-standalone -> reviewer`
- `web-framework-angular-standalone -> web-pm`
- `web-framework-angular-standalone -> web-researcher`
- `web-framework-react -> reviewer`
- `web-framework-react -> web-pm`
- `web-framework-react -> web-researcher`
- `web-framework-solidjs -> reviewer`
- `web-framework-solidjs -> web-pm`
- `web-framework-solidjs -> web-researcher`
- `web-framework-svelte -> reviewer`
- `web-framework-svelte -> web-pm`
- `web-framework-svelte -> web-researcher`
- `web-framework-vue-composition-api -> reviewer`
- `web-framework-vue-composition-api -> web-pm`
- `web-framework-vue-composition-api -> web-researcher`
- `web-meta-framework-astro -> reviewer`
- `web-meta-framework-astro -> web-pm`
- `web-meta-framework-astro -> web-researcher`
- `web-meta-framework-nextjs -> reviewer`
- `web-meta-framework-nextjs -> web-pm`
- `web-meta-framework-nextjs -> web-researcher`
- `web-meta-framework-nuxt -> reviewer`
- `web-meta-framework-nuxt -> web-pm`
- `web-meta-framework-nuxt -> web-researcher`
- `web-meta-framework-remix -> reviewer`
- `web-meta-framework-remix -> web-pm`
- `web-meta-framework-remix -> web-researcher`
- `web-meta-framework-sveltekit -> reviewer`
- `web-meta-framework-sveltekit -> web-pm`
- `web-meta-framework-sveltekit -> web-researcher`
- `web-mocks-msw -> web-tester`
- `web-routing-react-router -> web-developer`
- `web-server-state-react-query -> web-developer`
- `web-server-state-react-query -> web-pm`
- `web-server-state-react-query -> web-researcher`
- `web-state-ngrx-signalstore -> web-developer`
- `web-state-ngrx-signalstore -> web-pm`
- `web-state-ngrx-signalstore -> web-researcher`
- `web-state-pinia -> web-developer`
- `web-state-pinia -> web-pm`
- `web-state-pinia -> web-researcher`
- `web-state-redux-toolkit -> web-developer`
- `web-state-redux-toolkit -> web-pm`
- `web-state-redux-toolkit -> web-researcher`
- `web-state-zustand -> web-developer`
- `web-state-zustand -> web-pm`
- `web-state-zustand -> web-researcher`
- `web-styling-scss-modules -> web-developer`
- `web-styling-scss-modules -> web-pm`
- `web-styling-scss-modules -> web-researcher`
- `web-styling-tailwind -> web-developer`
- `web-styling-tailwind -> web-pm`
- `web-styling-tailwind -> web-researcher`
- `web-testing-playwright-e2e -> web-tester`
- `web-testing-vitest -> web-tester`

Full table:

| Stack                        | Sub-agent        | Category             | Skill                                 |
| ---------------------------- | ---------------- | -------------------- | ------------------------------------- |
| `nextjs-fullstack`           | `web-developer`  | `web-styling`        | `web-styling-scss-modules`            |
| `nextjs-fullstack`           | `web-developer`  | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-fullstack`           | `web-developer`  | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-fullstack`           | `web-developer`  | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-fullstack`           | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `nextjs-fullstack`           | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `nextjs-fullstack`           | `reviewer`       | `web-framework`      | `web-framework-react`                 |
| `nextjs-fullstack`           | `reviewer`       | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-fullstack`           | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `nextjs-fullstack`           | `reviewer`       | `cli-framework`      | `cli-framework-oclif-ink`             |
| `nextjs-fullstack`           | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `nextjs-fullstack`           | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `nextjs-fullstack`           | `web-tester`     | `web-mocking`        | `web-mocks-msw`                       |
| `nextjs-fullstack`           | `web-pm`         | `web-framework`      | `web-framework-react`                 |
| `nextjs-fullstack`           | `web-pm`         | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-fullstack`           | `web-pm`         | `web-styling`        | `web-styling-scss-modules`            |
| `nextjs-fullstack`           | `web-pm`         | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-fullstack`           | `web-pm`         | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-fullstack`           | `web-pm`         | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-fullstack`           | `web-researcher` | `web-framework`      | `web-framework-react`                 |
| `nextjs-fullstack`           | `web-researcher` | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-fullstack`           | `web-researcher` | `web-styling`        | `web-styling-scss-modules`            |
| `nextjs-fullstack`           | `web-researcher` | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-fullstack`           | `web-researcher` | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-fullstack`           | `web-researcher` | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-fullstack`           | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `nextjs-fullstack`           | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `nextjs-fullstack`           | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `nextjs-t3-stack`            | `web-developer`  | `web-styling`        | `web-styling-tailwind`                |
| `nextjs-t3-stack`            | `api-developer`  | `api-auth`           | `api-auth-nextauth`                   |
| `nextjs-t3-stack`            | `reviewer`       | `web-framework`      | `web-framework-react`                 |
| `nextjs-t3-stack`            | `reviewer`       | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-t3-stack`            | `web-pm`         | `web-framework`      | `web-framework-react`                 |
| `nextjs-t3-stack`            | `web-pm`         | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-t3-stack`            | `web-pm`         | `web-styling`        | `web-styling-tailwind`                |
| `nextjs-t3-stack`            | `web-pm`         | `web-server-state`   | `web-data-fetching-trpc`              |
| `nextjs-t3-stack`            | `web-researcher` | `web-framework`      | `web-framework-react`                 |
| `nextjs-t3-stack`            | `web-researcher` | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-t3-stack`            | `web-researcher` | `web-styling`        | `web-styling-tailwind`                |
| `nextjs-t3-stack`            | `web-researcher` | `web-server-state`   | `web-data-fetching-trpc`              |
| `nextjs-t3-stack`            | `api-researcher` | `api-database`       | `api-database-prisma`                 |
| `nextjs-t3-stack`            | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `nextjs-t3-stack`            | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `nextjs-supabase-fullstack`  | `web-developer`  | `web-styling`        | `web-styling-scss-modules`            |
| `nextjs-supabase-fullstack`  | `web-developer`  | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-supabase-fullstack`  | `web-developer`  | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-supabase-fullstack`  | `web-developer`  | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-supabase-fullstack`  | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `nextjs-supabase-fullstack`  | `api-developer`  | `api-baas`           | `api-baas-supabase`                   |
| `nextjs-supabase-fullstack`  | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `nextjs-supabase-fullstack`  | `reviewer`       | `web-framework`      | `web-framework-react`                 |
| `nextjs-supabase-fullstack`  | `reviewer`       | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-supabase-fullstack`  | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `nextjs-supabase-fullstack`  | `reviewer`       | `cli-framework`      | `cli-framework-oclif-ink`             |
| `nextjs-supabase-fullstack`  | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `nextjs-supabase-fullstack`  | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `nextjs-supabase-fullstack`  | `web-tester`     | `web-mocking`        | `web-mocks-msw`                       |
| `nextjs-supabase-fullstack`  | `web-pm`         | `web-framework`      | `web-framework-react`                 |
| `nextjs-supabase-fullstack`  | `web-pm`         | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-supabase-fullstack`  | `web-pm`         | `web-styling`        | `web-styling-scss-modules`            |
| `nextjs-supabase-fullstack`  | `web-pm`         | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-supabase-fullstack`  | `web-pm`         | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-supabase-fullstack`  | `web-pm`         | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-supabase-fullstack`  | `web-researcher` | `web-framework`      | `web-framework-react`                 |
| `nextjs-supabase-fullstack`  | `web-researcher` | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-supabase-fullstack`  | `web-researcher` | `web-styling`        | `web-styling-scss-modules`            |
| `nextjs-supabase-fullstack`  | `web-researcher` | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-supabase-fullstack`  | `web-researcher` | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-supabase-fullstack`  | `web-researcher` | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-supabase-fullstack`  | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `nextjs-supabase-fullstack`  | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `nextjs-supabase-fullstack`  | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `nextjs-supabase-fullstack`  | `api-researcher` | `api-baas`           | `api-baas-supabase`                   |
| `nextjs-turborepo-fullstack` | `web-developer`  | `web-styling`        | `web-styling-scss-modules`            |
| `nextjs-turborepo-fullstack` | `web-developer`  | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-turborepo-fullstack` | `web-developer`  | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-turborepo-fullstack` | `web-developer`  | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-turborepo-fullstack` | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `nextjs-turborepo-fullstack` | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `nextjs-turborepo-fullstack` | `reviewer`       | `web-framework`      | `web-framework-react`                 |
| `nextjs-turborepo-fullstack` | `reviewer`       | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-turborepo-fullstack` | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `nextjs-turborepo-fullstack` | `reviewer`       | `cli-framework`      | `cli-framework-oclif-ink`             |
| `nextjs-turborepo-fullstack` | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `nextjs-turborepo-fullstack` | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `nextjs-turborepo-fullstack` | `web-tester`     | `web-mocking`        | `web-mocks-msw`                       |
| `nextjs-turborepo-fullstack` | `web-pm`         | `web-framework`      | `web-framework-react`                 |
| `nextjs-turborepo-fullstack` | `web-pm`         | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-turborepo-fullstack` | `web-pm`         | `web-styling`        | `web-styling-scss-modules`            |
| `nextjs-turborepo-fullstack` | `web-pm`         | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-turborepo-fullstack` | `web-pm`         | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-turborepo-fullstack` | `web-pm`         | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-turborepo-fullstack` | `web-researcher` | `web-framework`      | `web-framework-react`                 |
| `nextjs-turborepo-fullstack` | `web-researcher` | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-turborepo-fullstack` | `web-researcher` | `web-styling`        | `web-styling-scss-modules`            |
| `nextjs-turborepo-fullstack` | `web-researcher` | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-turborepo-fullstack` | `web-researcher` | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-turborepo-fullstack` | `web-researcher` | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-turborepo-fullstack` | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `nextjs-turborepo-fullstack` | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `nextjs-turborepo-fullstack` | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `react-old-school`           | `web-developer`  | `web-client-state`   | `web-state-redux-toolkit`             |
| `react-old-school`           | `web-developer`  | `web-styling`        | `web-styling-scss-modules`            |
| `react-old-school`           | `web-developer`  | `web-routing`        | `web-routing-react-router`            |
| `react-old-school`           | `reviewer`       | `web-framework`      | `web-framework-react`                 |
| `react-old-school`           | `web-pm`         | `web-framework`      | `web-framework-react`                 |
| `react-old-school`           | `web-pm`         | `web-client-state`   | `web-state-redux-toolkit`             |
| `react-old-school`           | `web-pm`         | `web-styling`        | `web-styling-scss-modules`            |
| `react-old-school`           | `web-researcher` | `web-framework`      | `web-framework-react`                 |
| `react-old-school`           | `web-researcher` | `web-client-state`   | `web-state-redux-toolkit`             |
| `react-old-school`           | `web-researcher` | `web-styling`        | `web-styling-scss-modules`            |
| `react-old-school`           | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `react-old-school`           | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `react-hono-fullstack`       | `web-developer`  | `web-styling`        | `web-styling-scss-modules`            |
| `react-hono-fullstack`       | `web-developer`  | `web-client-state`   | `web-state-zustand`                   |
| `react-hono-fullstack`       | `web-developer`  | `web-server-state`   | `web-server-state-react-query`        |
| `react-hono-fullstack`       | `web-developer`  | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `react-hono-fullstack`       | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `react-hono-fullstack`       | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `react-hono-fullstack`       | `reviewer`       | `web-framework`      | `web-framework-react`                 |
| `react-hono-fullstack`       | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `react-hono-fullstack`       | `reviewer`       | `cli-framework`      | `cli-framework-oclif-ink`             |
| `react-hono-fullstack`       | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `react-hono-fullstack`       | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `react-hono-fullstack`       | `web-tester`     | `web-mocking`        | `web-mocks-msw`                       |
| `react-hono-fullstack`       | `web-pm`         | `web-framework`      | `web-framework-react`                 |
| `react-hono-fullstack`       | `web-pm`         | `web-styling`        | `web-styling-scss-modules`            |
| `react-hono-fullstack`       | `web-pm`         | `web-client-state`   | `web-state-zustand`                   |
| `react-hono-fullstack`       | `web-pm`         | `web-server-state`   | `web-server-state-react-query`        |
| `react-hono-fullstack`       | `web-pm`         | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `react-hono-fullstack`       | `web-researcher` | `web-framework`      | `web-framework-react`                 |
| `react-hono-fullstack`       | `web-researcher` | `web-styling`        | `web-styling-scss-modules`            |
| `react-hono-fullstack`       | `web-researcher` | `web-client-state`   | `web-state-zustand`                   |
| `react-hono-fullstack`       | `web-researcher` | `web-server-state`   | `web-server-state-react-query`        |
| `react-hono-fullstack`       | `web-researcher` | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `react-hono-fullstack`       | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `react-hono-fullstack`       | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `react-hono-fullstack`       | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `remix-fullstack`            | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `remix-fullstack`            | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `remix-fullstack`            | `reviewer`       | `web-framework`      | `web-framework-react`                 |
| `remix-fullstack`            | `reviewer`       | `web-meta-framework` | `web-meta-framework-remix`            |
| `remix-fullstack`            | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `remix-fullstack`            | `web-pm`         | `web-framework`      | `web-framework-react`                 |
| `remix-fullstack`            | `web-pm`         | `web-meta-framework` | `web-meta-framework-remix`            |
| `remix-fullstack`            | `web-researcher` | `web-framework`      | `web-framework-react`                 |
| `remix-fullstack`            | `web-researcher` | `web-meta-framework` | `web-meta-framework-remix`            |
| `remix-fullstack`            | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `remix-fullstack`            | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `remix-fullstack`            | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `remix-fullstack`            | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `remix-fullstack`            | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `sveltekit-fullstack`        | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `sveltekit-fullstack`        | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `sveltekit-fullstack`        | `reviewer`       | `web-framework`      | `web-framework-svelte`                |
| `sveltekit-fullstack`        | `reviewer`       | `web-meta-framework` | `web-meta-framework-sveltekit`        |
| `sveltekit-fullstack`        | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `sveltekit-fullstack`        | `web-pm`         | `web-framework`      | `web-framework-svelte`                |
| `sveltekit-fullstack`        | `web-pm`         | `web-meta-framework` | `web-meta-framework-sveltekit`        |
| `sveltekit-fullstack`        | `web-researcher` | `web-framework`      | `web-framework-svelte`                |
| `sveltekit-fullstack`        | `web-researcher` | `web-meta-framework` | `web-meta-framework-sveltekit`        |
| `sveltekit-fullstack`        | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `sveltekit-fullstack`        | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `sveltekit-fullstack`        | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `sveltekit-fullstack`        | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `sveltekit-fullstack`        | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `solidjs-fullstack`          | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `solidjs-fullstack`          | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `solidjs-fullstack`          | `reviewer`       | `web-framework`      | `web-framework-solidjs`               |
| `solidjs-fullstack`          | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `solidjs-fullstack`          | `web-pm`         | `web-framework`      | `web-framework-solidjs`               |
| `solidjs-fullstack`          | `web-researcher` | `web-framework`      | `web-framework-solidjs`               |
| `solidjs-fullstack`          | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `solidjs-fullstack`          | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `solidjs-fullstack`          | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `solidjs-fullstack`          | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `solidjs-fullstack`          | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `astro-content-fullstack`    | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `astro-content-fullstack`    | `reviewer`       | `web-meta-framework` | `web-meta-framework-astro`            |
| `astro-content-fullstack`    | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `astro-content-fullstack`    | `web-pm`         | `web-meta-framework` | `web-meta-framework-astro`            |
| `astro-content-fullstack`    | `web-researcher` | `web-meta-framework` | `web-meta-framework-astro`            |
| `astro-content-fullstack`    | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `astro-content-fullstack`    | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `astro-content-fullstack`    | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `astro-content-fullstack`    | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `vue-modern-fullstack`       | `web-developer`  | `web-client-state`   | `web-state-pinia`                     |
| `vue-modern-fullstack`       | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `vue-modern-fullstack`       | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `vue-modern-fullstack`       | `reviewer`       | `web-framework`      | `web-framework-vue-composition-api`   |
| `vue-modern-fullstack`       | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `vue-modern-fullstack`       | `web-pm`         | `web-framework`      | `web-framework-vue-composition-api`   |
| `vue-modern-fullstack`       | `web-pm`         | `web-client-state`   | `web-state-pinia`                     |
| `vue-modern-fullstack`       | `web-researcher` | `web-framework`      | `web-framework-vue-composition-api`   |
| `vue-modern-fullstack`       | `web-researcher` | `web-client-state`   | `web-state-pinia`                     |
| `vue-modern-fullstack`       | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `vue-modern-fullstack`       | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `vue-modern-fullstack`       | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `vue-modern-fullstack`       | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `vue-modern-fullstack`       | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `nuxt-fullstack`             | `web-developer`  | `web-client-state`   | `web-state-pinia`                     |
| `nuxt-fullstack`             | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `nuxt-fullstack`             | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `nuxt-fullstack`             | `reviewer`       | `web-framework`      | `web-framework-vue-composition-api`   |
| `nuxt-fullstack`             | `reviewer`       | `web-meta-framework` | `web-meta-framework-nuxt`             |
| `nuxt-fullstack`             | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `nuxt-fullstack`             | `web-pm`         | `web-framework`      | `web-framework-vue-composition-api`   |
| `nuxt-fullstack`             | `web-pm`         | `web-meta-framework` | `web-meta-framework-nuxt`             |
| `nuxt-fullstack`             | `web-pm`         | `web-client-state`   | `web-state-pinia`                     |
| `nuxt-fullstack`             | `web-researcher` | `web-framework`      | `web-framework-vue-composition-api`   |
| `nuxt-fullstack`             | `web-researcher` | `web-meta-framework` | `web-meta-framework-nuxt`             |
| `nuxt-fullstack`             | `web-researcher` | `web-client-state`   | `web-state-pinia`                     |
| `nuxt-fullstack`             | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `nuxt-fullstack`             | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `nuxt-fullstack`             | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `nuxt-fullstack`             | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `nuxt-fullstack`             | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `angular-modern-fullstack`   | `web-developer`  | `web-client-state`   | `web-state-ngrx-signalstore`          |
| `angular-modern-fullstack`   | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `angular-modern-fullstack`   | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `angular-modern-fullstack`   | `reviewer`       | `web-framework`      | `web-framework-angular-standalone`    |
| `angular-modern-fullstack`   | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `angular-modern-fullstack`   | `web-pm`         | `web-framework`      | `web-framework-angular-standalone`    |
| `angular-modern-fullstack`   | `web-pm`         | `web-client-state`   | `web-state-ngrx-signalstore`          |
| `angular-modern-fullstack`   | `web-researcher` | `web-framework`      | `web-framework-angular-standalone`    |
| `angular-modern-fullstack`   | `web-researcher` | `web-client-state`   | `web-state-ngrx-signalstore`          |
| `angular-modern-fullstack`   | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `angular-modern-fullstack`   | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `angular-modern-fullstack`   | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `angular-modern-fullstack`   | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `angular-modern-fullstack`   | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `nextjs-ai-saas`             | `web-developer`  | `web-styling`        | `web-styling-tailwind`                |
| `nextjs-ai-saas`             | `web-developer`  | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-ai-saas`             | `web-developer`  | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-ai-saas`             | `web-developer`  | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-ai-saas`             | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `nextjs-ai-saas`             | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `nextjs-ai-saas`             | `reviewer`       | `web-framework`      | `web-framework-react`                 |
| `nextjs-ai-saas`             | `reviewer`       | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-ai-saas`             | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `nextjs-ai-saas`             | `reviewer`       | `cli-framework`      | `cli-framework-oclif-ink`             |
| `nextjs-ai-saas`             | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `nextjs-ai-saas`             | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `nextjs-ai-saas`             | `web-tester`     | `web-mocking`        | `web-mocks-msw`                       |
| `nextjs-ai-saas`             | `web-pm`         | `web-framework`      | `web-framework-react`                 |
| `nextjs-ai-saas`             | `web-pm`         | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-ai-saas`             | `web-pm`         | `web-styling`        | `web-styling-tailwind`                |
| `nextjs-ai-saas`             | `web-pm`         | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-ai-saas`             | `web-pm`         | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-ai-saas`             | `web-pm`         | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-ai-saas`             | `web-researcher` | `web-framework`      | `web-framework-react`                 |
| `nextjs-ai-saas`             | `web-researcher` | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-ai-saas`             | `web-researcher` | `web-styling`        | `web-styling-tailwind`                |
| `nextjs-ai-saas`             | `web-researcher` | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-ai-saas`             | `web-researcher` | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-ai-saas`             | `web-researcher` | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-ai-saas`             | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `nextjs-ai-saas`             | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `nextjs-ai-saas`             | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `nextjs-saas-starter`        | `web-developer`  | `web-styling`        | `web-styling-tailwind`                |
| `nextjs-saas-starter`        | `web-developer`  | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-saas-starter`        | `web-developer`  | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-saas-starter`        | `web-developer`  | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-saas-starter`        | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `nextjs-saas-starter`        | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `nextjs-saas-starter`        | `reviewer`       | `web-framework`      | `web-framework-react`                 |
| `nextjs-saas-starter`        | `reviewer`       | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-saas-starter`        | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `nextjs-saas-starter`        | `reviewer`       | `cli-framework`      | `cli-framework-oclif-ink`             |
| `nextjs-saas-starter`        | `web-tester`     | `web-testing`        | `web-testing-playwright-e2e`          |
| `nextjs-saas-starter`        | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `nextjs-saas-starter`        | `web-tester`     | `web-mocking`        | `web-mocks-msw`                       |
| `nextjs-saas-starter`        | `web-pm`         | `web-framework`      | `web-framework-react`                 |
| `nextjs-saas-starter`        | `web-pm`         | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-saas-starter`        | `web-pm`         | `web-styling`        | `web-styling-tailwind`                |
| `nextjs-saas-starter`        | `web-pm`         | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-saas-starter`        | `web-pm`         | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-saas-starter`        | `web-pm`         | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-saas-starter`        | `web-researcher` | `web-framework`      | `web-framework-react`                 |
| `nextjs-saas-starter`        | `web-researcher` | `web-meta-framework` | `web-meta-framework-nextjs`           |
| `nextjs-saas-starter`        | `web-researcher` | `web-styling`        | `web-styling-tailwind`                |
| `nextjs-saas-starter`        | `web-researcher` | `web-client-state`   | `web-state-zustand`                   |
| `nextjs-saas-starter`        | `web-researcher` | `web-server-state`   | `web-server-state-react-query`        |
| `nextjs-saas-starter`        | `web-researcher` | `web-accessibility`  | `web-accessibility-web-accessibility` |
| `nextjs-saas-starter`        | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `nextjs-saas-starter`        | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `nextjs-saas-starter`        | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `expo-mobile-fullstack`      | `web-developer`  | `web-client-state`   | `web-state-zustand`                   |
| `expo-mobile-fullstack`      | `web-developer`  | `web-server-state`   | `web-server-state-react-query`        |
| `expo-mobile-fullstack`      | `api-developer`  | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
| `expo-mobile-fullstack`      | `api-developer`  | `api-observability`  | `api-observability-axiom-pino-sentry` |
| `expo-mobile-fullstack`      | `reviewer`       | `web-framework`      | `web-framework-react`                 |
| `expo-mobile-fullstack`      | `reviewer`       | `mobile-framework`   | `mobile-framework-expo`               |
| `expo-mobile-fullstack`      | `reviewer`       | `mobile-framework`   | `mobile-framework-react-native`       |
| `expo-mobile-fullstack`      | `reviewer`       | `api-api`            | `api-framework-hono`                  |
| `expo-mobile-fullstack`      | `reviewer`       | `cli-framework`      | `cli-framework-oclif-ink`             |
| `expo-mobile-fullstack`      | `web-tester`     | `web-testing`        | `web-testing-vitest`                  |
| `expo-mobile-fullstack`      | `web-tester`     | `web-mocking`        | `web-mocks-msw`                       |
| `expo-mobile-fullstack`      | `web-pm`         | `web-framework`      | `web-framework-react`                 |
| `expo-mobile-fullstack`      | `web-pm`         | `web-client-state`   | `web-state-zustand`                   |
| `expo-mobile-fullstack`      | `web-pm`         | `web-server-state`   | `web-server-state-react-query`        |
| `expo-mobile-fullstack`      | `web-researcher` | `web-framework`      | `web-framework-react`                 |
| `expo-mobile-fullstack`      | `web-researcher` | `web-client-state`   | `web-state-zustand`                   |
| `expo-mobile-fullstack`      | `web-researcher` | `web-server-state`   | `web-server-state-react-query`        |
| `expo-mobile-fullstack`      | `api-researcher` | `api-api`            | `api-framework-hono`                  |
| `expo-mobile-fullstack`      | `api-researcher` | `api-database`       | `api-database-drizzle`                |
| `expo-mobile-fullstack`      | `api-researcher` | `api-auth`           | `api-auth-better-auth-drizzle-hono`   |
