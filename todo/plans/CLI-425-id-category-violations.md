# CLI-425 — skill ids that omit their category prefix (audited 2026-08-07, PARKED)

Owner ruling 2026-08-07: the invariant stands ("skills should always include their category in
their id") but every rename is PARKED until the very end — after the taxonomy apply and all
CLI-389 phases. The list below predates the taxonomy apply and must be re-audited then (the new
categories will add members). Per-cluster fix directions and costs are in the session record;
category renames are the cheap direction, skill-id renames the expensive one.

violations: 33 of 237
api-flags-posthog-flags → category: api-analytics
api-framework-elysia → category: api-api
api-framework-express → category: api-api
api-framework-fastify → category: api-api
api-framework-hono → category: api-api
api-framework-nestjs → category: api-api
shared-tooling-biome → category: shared-lint
shared-tooling-eslint-prettier → category: shared-lint
shared-monorepo-nx → category: shared-task-runner
shared-monorepo-turborepo → category: shared-task-runner
meta-config-stack-detect → category: shared-tooling
web-state-jotai → category: web-client-state
web-state-mobx → category: web-client-state
web-state-ngrx-signalstore → category: web-client-state
web-state-pinia → category: web-client-state
web-state-redux-toolkit → category: web-client-state
web-state-zustand → category: web-client-state
web-files-file-upload-patterns → category: web-file-upload
web-mocks-msw → category: web-mocking
web-data-fetching-graphql-apollo → category: web-server-state
web-data-fetching-graphql-urql → category: web-server-state
web-data-fetching-swr → category: web-server-state
web-data-fetching-trpc → category: web-server-state
web-ui-ant-design → category: web-ui-components
web-ui-base-ui → category: web-ui-components
web-ui-chakra-ui → category: web-ui-components
web-ui-headless-ui → category: web-ui-components
web-ui-mantine → category: web-ui-components
web-ui-mui → category: web-ui-components
web-ui-radix-ui → category: web-ui-components
web-ui-shadcn-ui → category: web-ui-components
web-ui-tanstack-table → category: web-ui-components
web-ui-vuetify → category: web-ui-components
