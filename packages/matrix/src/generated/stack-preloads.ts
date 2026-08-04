// AUTO-GENERATED from packages/cli/src/cli/lib/configuration/default-stacks.ts in this repo.
// Do not edit manually — run `bun run generate` in packages/matrix.
//
// Why this file exists: the CLI's stack sources mark individual skills as preloaded
// (embedded in sub-agent front-matter rather than loaded on demand), but resolving a
// stack into BUILT_IN_MATRIX.suggestedStacks flattens SkillAssignment[] down to
// SkillId[] and drops the flag. Without this, applying a stack in the web UI would
// show every skill as not-preloaded and disagree with what the CLI installs.
//
// Granularity note: the CLI tracks preloading per (agent, skill) pair. The UI shows one
// Pre toggle per skill, so a skill preloaded by ANY agent in the stack is preloaded here.

import type { SkillId } from "../vendor/generated/source-types"

export const STACK_PRELOADS: Record<string, readonly SkillId[]> = {
  "nextjs-fullstack": ["api-database-drizzle","api-framework-hono","cli-framework-oclif-ink","meta-reviewing-cli-reviewing","meta-reviewing-reviewing","web-framework-react","web-meta-framework-nextjs"],
  "nextjs-t3-stack": ["api-database-prisma","meta-reviewing-reviewing","web-data-fetching-trpc","web-framework-react","web-meta-framework-nextjs"],
  "nextjs-supabase-fullstack": ["api-database-drizzle","api-framework-hono","cli-framework-oclif-ink","meta-reviewing-cli-reviewing","meta-reviewing-reviewing","web-framework-react","web-meta-framework-nextjs"],
  "nextjs-turborepo-fullstack": ["api-database-drizzle","api-framework-hono","cli-framework-oclif-ink","meta-reviewing-cli-reviewing","meta-reviewing-reviewing","web-framework-react","web-meta-framework-nextjs"],
  "react-old-school": ["meta-reviewing-reviewing","web-framework-react"],
  "react-hono-fullstack": ["api-database-drizzle","api-framework-hono","cli-framework-oclif-ink","meta-reviewing-cli-reviewing","meta-reviewing-reviewing","web-framework-react"],
  "remix-fullstack": ["api-database-drizzle","api-framework-hono","meta-reviewing-reviewing","web-framework-react","web-meta-framework-remix"],
  "sveltekit-fullstack": ["api-database-drizzle","api-framework-hono","meta-reviewing-reviewing","web-framework-svelte","web-meta-framework-sveltekit"],
  "solidjs-fullstack": ["api-database-drizzle","api-framework-hono","meta-reviewing-reviewing","web-framework-solidjs"],
  "astro-content-fullstack": ["api-database-drizzle","api-framework-hono","meta-reviewing-reviewing","web-meta-framework-astro"],
  "vue-modern-fullstack": ["api-database-drizzle","api-framework-hono","meta-reviewing-reviewing","web-framework-vue-composition-api"],
  "nuxt-fullstack": ["api-database-drizzle","api-framework-hono","meta-reviewing-reviewing","web-framework-vue-composition-api","web-meta-framework-nuxt"],
  "angular-modern-fullstack": ["api-database-drizzle","api-framework-hono","meta-reviewing-reviewing","web-framework-angular-standalone"],
  "nextjs-ai-saas": ["ai-orchestration-vercel-ai-sdk","ai-provider-anthropic-sdk","api-database-drizzle","api-framework-hono","cli-framework-oclif-ink","meta-reviewing-cli-reviewing","meta-reviewing-reviewing","web-framework-react","web-meta-framework-nextjs"],
  "nextjs-saas-starter": ["api-commerce-stripe","api-database-drizzle","api-framework-hono","cli-framework-oclif-ink","meta-reviewing-cli-reviewing","meta-reviewing-reviewing","web-framework-react","web-meta-framework-nextjs"],
  "expo-mobile-fullstack": ["api-database-drizzle","api-framework-hono","cli-framework-oclif-ink","meta-reviewing-cli-reviewing","meta-reviewing-reviewing","mobile-framework-expo","mobile-framework-react-native","web-framework-react"],
  "cli-ink-oclif": ["cli-framework-oclif-ink","meta-design-expressive-typescript","meta-reviewing-reviewing","web-forms-zod-validation","web-framework-react","web-state-zustand","web-testing-vitest"],
}
