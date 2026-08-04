import type { SkillRulesConfig } from "../../types";

/**
 * Built-in skill rules, equivalent to config/skill-rules.ts.
 * Source repos may override or extend these via their own config files.
 */
export const defaultRules: SkillRulesConfig = {
  version: "1.0.0",
  relationships: {
    conflicts: [
      {
        skills: ["react", "vue-composition-api", "angular-standalone", "solidjs", "svelte"],
        reason: "Base frameworks are mutually exclusive",
      },
      {
        skills: ["nextjs", "remix", "nuxt", "sveltekit", "astro", "qwik"],
        reason: "Meta-frameworks are mutually exclusive",
      },
      {
        skills: ["zustand", "redux-toolkit", "mobx", "jotai"],
        reason: "React state management libraries are mutually exclusive",
      },
      {
        skills: ["react-query", "swr"],
        reason: "Both solve server state caching",
      },
      {
        skills: ["graphql-apollo", "graphql-urql"],
        reason: "Both are GraphQL clients",
      },
      {
        skills: ["playwright-e2e", "cypress-e2e"],
        reason: "Both are E2E frameworks",
      },
      {
        skills: ["hono", "express", "fastify", "elysia", "nestjs"],
        reason: "API frameworks are mutually exclusive within a single service",
      },
      {
        skills: ["drizzle", "prisma", "sequelize", "typeorm", "knex"],
        reason: "SQL ORMs and query builders are mutually exclusive",
      },
      {
        skills: ["cli-commander", "oclif-ink"],
        reason: "CLI frameworks are mutually exclusive",
      },
      {
        skills: ["mongodb", "mongoose"],
        reason: "Raw MongoDB driver and Mongoose ODM are alternative approaches",
      },
      {
        skills: ["pinecone", "qdrant", "chroma", "weaviate"],
        reason: "Vector databases are mutually exclusive",
      },
      {
        skills: ["elasticsearch", "meilisearch"],
        reason: "Search engines are mutually exclusive",
      },
      {
        skills: ["payload", "sanity", "strapi"],
        reason: "CMS platforms are mutually exclusive",
      },
      {
        skills: ["shadcn-ui", "mui", "chakra-ui", "mantine", "ant-design"],
        reason: "React UI component libraries define competing design systems",
      },
      {
        skills: ["turborepo", "nx"],
        reason: "Monorepo build orchestrators are mutually exclusive",
      },
      {
        skills: ["biome", "eslint-prettier"],
        reason: "Linting and formatting tools are mutually exclusive",
      },
      {
        skills: ["react-router", "tanstack-router"],
        reason: "React client-side routers are mutually exclusive",
      },
      {
        skills: ["docusaurus", "vitepress"],
        reason: "Documentation frameworks are mutually exclusive",
      },
      {
        skills: ["electron", "tauri"],
        reason: "Desktop frameworks are mutually exclusive",
      },
      {
        skills: ["react-hook-form", "tanstack-form"],
        reason: "React form libraries are mutually exclusive",
      },
      {
        skills: ["supabase", "firebase", "appwrite"],
        reason: "Backend-as-a-Service platforms are mutually exclusive",
      },
      {
        skills: ["better-auth-drizzle-hono", "nextauth", "clerk"],
        reason: "Authentication solutions are mutually exclusive",
      },
      {
        skills: ["redis", "upstash", "vercel-kv"],
        reason: "Cache and KV store providers are mutually exclusive",
      },
      {
        skills: ["vee-validate", "tanstack-form"],
        reason: "Vue form libraries are mutually exclusive",
      },
      {
        skills: ["postgresql", "mysql"],
        reason: "SQL database engines are mutually exclusive",
      },
      {
        skills: ["neon", "vercel-postgres", "cockroachdb"],
        reason: "Managed PostgreSQL-compatible providers are mutually exclusive",
      },
      {
        skills: ["react-intl", "next-intl"],
        reason: "React internationalization libraries are mutually exclusive",
      },
      {
        skills: ["websockets", "socket-io"],
        reason: "Socket.IO replaces raw WebSocket usage with its own protocol",
      },
    ],
    discourages: [],
    compatibleWith: [
      // React ecosystem (includes Next.js, Remix as meta-frameworks)
      {
        skills: ["framer-motion", "react", "nextjs", "remix"],
        reason: "Motion (Framer Motion) is a React animation library",
      },
      {
        skills: ["error-boundaries", "react", "nextjs", "remix"],
        reason: "Error boundaries are a React concept",
      },
      {
        skills: ["file-upload-patterns", "react", "nextjs", "remix"],
        reason: "Skill teaches React-based file upload patterns",
      },
      {
        skills: ["image-handling", "react", "nextjs", "remix"],
        reason: "Skill teaches React-based image handling hooks",
      },
      {
        skills: ["react-hook-form", "react", "nextjs", "remix", "react-native"],
        reason: "React Hook Form is React only",
      },
      {
        skills: ["react-intl", "react", "nextjs", "remix"],
        reason: "React Intl (FormatJS) is React only",
      },
      {
        skills: ["react-query", "react", "nextjs", "remix", "react-native"],
        reason: "TanStack Query React adapter",
      },
      {
        skills: ["swr", "react", "nextjs", "remix", "react-native"],
        reason: "SWR is a React Hooks library",
      },
      {
        skills: ["trpc", "react", "nextjs", "remix"],
        reason: "tRPC skill teaches React Query integration",
      },
      {
        skills: ["jotai", "react", "nextjs", "remix", "react-native"],
        reason: "Jotai is a React atomic state library",
      },
      {
        skills: ["mobx", "react", "nextjs", "remix", "react-native"],
        reason: "Skill teaches MobX with mobx-react-lite",
      },
      {
        skills: ["redux-toolkit", "react", "nextjs", "remix", "react-native"],
        reason: "Redux Toolkit skill teaches React Redux patterns",
      },
      {
        skills: ["zustand", "react", "nextjs", "remix", "react-native"],
        reason: "Zustand skill teaches React patterns",
      },
      {
        skills: ["react-testing-library", "react", "nextjs", "remix"],
        reason: "React Testing Library is React only",
      },
      {
        skills: ["radix-ui", "react", "nextjs", "remix"],
        reason: "Radix UI primitives are React-specific",
      },
      {
        skills: ["shadcn-ui", "react", "nextjs", "remix"],
        reason: "shadcn/ui is built on React + Radix UI",
      },
      {
        skills: ["tanstack-table", "react", "nextjs", "remix"],
        reason: "Skill teaches @tanstack/react-table patterns only",
      },
      {
        skills: ["tanstack-router", "react"],
        reason: "TanStack Router is a React routing library",
      },
      {
        skills: ["graphql-apollo", "react", "nextjs", "remix"],
        reason: "Skill teaches React Apollo Client patterns",
      },
      // Next.js specific
      {
        skills: ["next-intl", "nextjs"],
        reason: "next-intl is Next.js only",
      },
      {
        skills: ["clerk", "nextjs"],
        reason: "Skill teaches @clerk/nextjs patterns",
      },
      // Vue ecosystem (includes Nuxt as meta-framework)
      {
        skills: ["vee-validate", "vue-composition-api", "nuxt"],
        reason: "VeeValidate is Vue only",
      },
      {
        skills: ["vue-i18n", "vue-composition-api", "nuxt"],
        reason: "vue-i18n is Vue 3 only",
      },
      {
        skills: ["pinia", "vue-composition-api", "nuxt"],
        reason: "Pinia is Vue only",
      },
      {
        skills: ["vue-test-utils", "vue-composition-api", "nuxt"],
        reason: "Vue Test Utils is Vue only",
      },
      // Angular ecosystem
      {
        skills: ["ngrx-signalstore", "angular-standalone"],
        reason: "NgRx SignalStore is Angular only",
      },
      // Multi-framework
      {
        skills: [
          "graphql-urql",
          "react",
          "vue-composition-api",
          "solidjs",
          "svelte",
          "nextjs",
          "remix",
          "nuxt",
          "sveltekit",
        ],
        reason: "URQL has bindings for React, Vue, Solid, and Svelte",
      },
      // React Router
      {
        skills: ["react-router", "react", "remix"],
        reason: "React Router is a React routing library",
      },
      // React UI component libraries
      {
        skills: ["chakra-ui", "react", "nextjs", "remix"],
        reason: "Chakra UI is a React component library",
      },
      {
        skills: ["mantine", "react", "nextjs", "remix"],
        reason: "Mantine is a React component library",
      },
      {
        skills: ["mui", "react", "nextjs", "remix"],
        reason: "MUI is a React component library",
      },
      {
        skills: ["ant-design", "react", "nextjs", "remix"],
        reason: "Ant Design is a React component library",
      },
      {
        skills: ["headless-ui", "react", "nextjs", "remix"],
        reason: "Headless UI v2 is React only",
      },
      // Vue ecosystem
      {
        skills: ["vueuse", "vue-composition-api", "nuxt"],
        reason: "VueUse composables require Vue 3",
      },
      // Mobile
      {
        skills: ["expo", "react-native"],
        reason: "Expo is a React Native framework",
      },
      // Cross-framework tools
      {
        skills: [
          "storybook",
          "react",
          "vue-composition-api",
          "angular-standalone",
          "solidjs",
          "svelte",
          "nextjs",
          "remix",
          "nuxt",
          "sveltekit",
        ],
        reason: "Storybook supports all major frameworks",
      },
      {
        skills: [
          "tanstack-form",
          "react",
          "vue-composition-api",
          "angular-standalone",
          "solidjs",
          "nextjs",
          "remix",
          "nuxt",
        ],
        reason: "TanStack Form supports React, Vue, Angular, and Solid",
      },
      {
        skills: ["vuetify", "vue-composition-api", "nuxt"],
        reason: "Vuetify is Vue only",
      },
      {
        skills: ["resend-react-email", "react", "nextjs", "remix"],
        reason: "React Email uses React for email templates",
      },
    ],
    recommends: [
      { skill: "zustand", reason: "Best-in-class React state management" },
      { skill: "react-query", reason: "Modern server state caching for React" },
      { skill: "vitest", reason: "Fast, modern test runner for all frameworks" },
      { skill: "react-hook-form", reason: "Best React form library" },
      { skill: "react-testing-library", reason: "Standard React component testing" },
      { skill: "shadcn-ui", reason: "Best-in-class React + Tailwind component library" },
      { skill: "zod-validation", reason: "Type-safe validation for forms and APIs" },
      { skill: "pinia", reason: "Vue community standard state management" },
      { skill: "vee-validate", reason: "Vue community standard form validation" },
      { skill: "vue-test-utils", reason: "Vue component testing library" },
      { skill: "ngrx-signalstore", reason: "Angular Signals-based state management" },
      { skill: "tailwind", reason: "Utility-first CSS framework" },
      { skill: "drizzle", reason: "Modern TypeScript-first ORM" },
      { skill: "better-auth-drizzle-hono", reason: "Full-featured auth solution" },
      { skill: "radix-ui", reason: "Accessible unstyled component primitives" },
      { skill: "cva", reason: "Type-safe variant management for Tailwind" },
      { skill: "msw", reason: "Network-level API mocking for tests" },
      { skill: "playwright-e2e", reason: "Cross-browser E2E testing" },
      { skill: "posthog-analytics", reason: "Product analytics and feature flags" },
      { skill: "prisma", reason: "Mature database ORM with great DX" },
      { skill: "vercel-ai-sdk", reason: "Provider-agnostic AI integration with streaming" },
      { skill: "anthropic-sdk", reason: "Direct Claude API access with tool use and vision" },
      { skill: "hono", reason: "Fast, lightweight API framework with edge support" },
      { skill: "pinecone", reason: "Managed vector database for AI applications" },
      { skill: "stripe", reason: "Industry-standard payment processing" },
      { skill: "expo", reason: "Best-in-class React Native development experience" },
    ],
    requires: [
      {
        skill: "tanstack-router",
        needs: ["react"],
        reason: "TanStack Router is a React routing library",
      },
      {
        skill: "nextjs",
        needs: ["react"],
        reason: "Next.js is built on React",
      },
      {
        skill: "remix",
        needs: ["react"],
        reason: "Remix is built on React",
      },
      {
        skill: "nuxt",
        needs: ["vue-composition-api"],
        reason: "Nuxt is built on Vue",
      },
      {
        skill: "sveltekit",
        needs: ["svelte"],
        reason: "SvelteKit is built on Svelte",
      },
      {
        skill: "zustand",
        needs: ["react", "nextjs", "remix", "react-native"],
        needsAny: true,
        reason: "Skill teaches React/React Native patterns",
      },
      {
        skill: "redux-toolkit",
        needs: ["react", "nextjs", "remix", "react-native"],
        needsAny: true,
        reason: "Skill teaches React/React Native patterns",
      },
      {
        skill: "mobx",
        needs: ["react", "nextjs", "remix", "react-native"],
        needsAny: true,
        reason: "Skill teaches React/React Native patterns",
      },
      {
        skill: "react-query",
        needs: ["react", "nextjs", "remix", "react-native"],
        needsAny: true,
        reason: "TanStack Query's React adapter",
      },
      {
        skill: "swr",
        needs: ["react", "nextjs", "remix", "react-native"],
        needsAny: true,
        reason: "SWR is a React Hooks library",
      },
      {
        skill: "react-hook-form",
        needs: ["react", "nextjs", "remix", "react-native"],
        needsAny: true,
        reason: "React Hook Form is React only",
      },
      {
        skill: "react-testing-library",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "React Testing Library is React only",
      },
      {
        skill: "pinia",
        needs: ["vue-composition-api", "nuxt"],
        needsAny: true,
        reason: "Pinia is Vue only",
      },
      {
        skill: "vee-validate",
        needs: ["vue-composition-api", "nuxt"],
        needsAny: true,
        reason: "VeeValidate is Vue only",
      },
      {
        skill: "vue-test-utils",
        needs: ["vue-composition-api", "nuxt"],
        needsAny: true,
        reason: "Vue Test Utils is Vue only",
      },
      {
        skill: "ngrx-signalstore",
        needs: ["angular-standalone"],
        reason: "NgRx SignalStore is Angular only",
      },
      {
        skill: "better-auth-drizzle-hono",
        needs: ["drizzle"],
        reason: "Skill teaches Better Auth with the Drizzle adapter",
      },
      {
        skill: "shadcn-ui",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "shadcn/ui requires a React-based framework",
      },
      {
        skill: "shadcn-ui",
        needs: ["tailwind"],
        reason: "shadcn/ui requires Tailwind CSS",
      },
      {
        skill: "graphql-apollo",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Skill teaches React Apollo Client patterns",
      },
      {
        skill: "graphql-urql",
        needs: [
          "react",
          "vue-composition-api",
          "solidjs",
          "svelte",
          "nextjs",
          "remix",
          "nuxt",
          "sveltekit",
        ],
        needsAny: true,
        reason: "URQL supports React, Vue, Solid, and Svelte",
      },
      {
        skill: "react-router",
        needs: ["react", "remix"],
        needsAny: true,
        reason: "React Router is a React routing library",
      },
      {
        skill: "chakra-ui",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Chakra UI is a React component library",
      },
      {
        skill: "mantine",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Mantine is a React component library",
      },
      {
        skill: "mui",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "MUI is a React component library",
      },
      {
        skill: "ant-design",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Ant Design is a React component library",
      },
      {
        skill: "headless-ui",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Headless UI v2 is React only",
      },
      {
        skill: "vueuse",
        needs: ["vue-composition-api", "nuxt"],
        needsAny: true,
        reason: "VueUse composables require Vue 3",
      },
      {
        skill: "expo",
        needs: ["react-native"],
        reason: "Expo is a React Native framework",
      },
      {
        skill: "react-native",
        needs: ["react"],
        reason: "React Native is built on React",
      },
      {
        skill: "claude-vision",
        needs: ["anthropic-sdk"],
        reason: "Claude Vision uses the Anthropic SDK",
      },
      {
        skill: "openai-whisper",
        needs: ["openai-sdk"],
        reason: "Whisper API uses the OpenAI SDK",
      },
      {
        skill: "next-intl",
        needs: ["nextjs"],
        reason: "next-intl is built specifically for Next.js",
      },
      {
        skill: "clerk",
        needs: ["nextjs"],
        reason: "Skill teaches @clerk/nextjs patterns",
      },
      {
        skill: "trpc",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Skill teaches React Query integration patterns",
      },
      {
        skill: "framer-motion",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Motion (Framer Motion) is a React animation library",
      },
      {
        skill: "error-boundaries",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Error boundaries are a React concept",
      },
      {
        skill: "file-upload-patterns",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Skill teaches React-based file upload patterns",
      },
      {
        skill: "image-handling",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Skill teaches React-based image handling hooks",
      },
      {
        skill: "react-intl",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "React Intl (FormatJS) is React only",
      },
      {
        skill: "tanstack-table",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Skill teaches @tanstack/react-table patterns",
      },
      {
        skill: "radix-ui",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Radix UI primitives are React-specific",
      },
      {
        skill: "jotai",
        needs: ["react", "nextjs", "remix", "react-native"],
        needsAny: true,
        reason: "Jotai is a React atomic state library",
      },
      {
        skill: "vue-i18n",
        needs: ["vue-composition-api", "nuxt"],
        needsAny: true,
        reason: "vue-i18n is Vue 3 only",
      },
      {
        skill: "storybook",
        needs: [
          "react",
          "vue-composition-api",
          "angular-standalone",
          "solidjs",
          "svelte",
          "nextjs",
          "remix",
          "nuxt",
          "sveltekit",
        ],
        needsAny: true,
        reason: "Storybook requires a UI framework",
      },
      {
        skill: "docusaurus",
        needs: ["react"],
        reason: "Docusaurus is built on React",
      },
      {
        skill: "vitepress",
        needs: ["vue-composition-api"],
        reason: "VitePress is built on Vue",
      },
      {
        skill: "vuetify",
        needs: ["vue-composition-api", "nuxt"],
        needsAny: true,
        reason: "Vuetify is Vue only",
      },
      {
        skill: "tanstack-form",
        needs: [
          "react",
          "vue-composition-api",
          "angular-standalone",
          "solidjs",
          "nextjs",
          "remix",
          "nuxt",
        ],
        needsAny: true,
        reason: "TanStack Form requires a UI framework",
      },
      {
        skill: "resend-react-email",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "React Email uses React for email templates",
      },
    ],
    alternatives: [
      {
        purpose: "Base Framework",
        skills: ["react", "vue-composition-api", "angular-standalone", "solidjs", "svelte"],
      },
      {
        purpose: "Meta-Framework",
        skills: ["nextjs", "remix", "nuxt", "sveltekit", "astro", "qwik"],
      },
      { purpose: "Routing (React)", skills: ["tanstack-router", "react-router"] },
      {
        purpose: "Styling",
        skills: ["scss-modules", "tailwind"],
      },
      {
        purpose: "Client State (React)",
        skills: ["zustand", "redux-toolkit", "mobx", "jotai"],
      },
      { purpose: "Client State (Vue)", skills: ["pinia"] },
      { purpose: "Client State (Angular)", skills: ["ngrx-signalstore"] },
      {
        purpose: "Server State / Data Fetching",
        skills: ["react-query", "swr", "trpc"],
      },
      {
        purpose: "GraphQL Client",
        skills: ["graphql-apollo", "graphql-urql"],
      },
      {
        purpose: "API Framework",
        skills: ["hono", "express", "fastify", "elysia", "nestjs"],
      },
      {
        purpose: "SQL ORM / Query Builder",
        skills: ["drizzle", "prisma", "sequelize", "typeorm", "knex"],
      },
      { purpose: "MongoDB", skills: ["mongodb", "mongoose"] },
      { purpose: "Forms (React)", skills: ["react-hook-form", "tanstack-form"] },
      { purpose: "Forms (Vue)", skills: ["vee-validate", "tanstack-form"] },
      { purpose: "Validation", skills: ["zod-validation"] },
      { purpose: "Unit Testing", skills: ["vitest"] },
      { purpose: "Component Testing (React)", skills: ["react-testing-library"] },
      { purpose: "Component Testing (Vue)", skills: ["vue-test-utils"] },
      {
        purpose: "E2E Testing",
        skills: ["playwright-e2e", "cypress-e2e"],
      },
      { purpose: "API Mocking", skills: ["msw"] },
      {
        purpose: "UI Components (React)",
        skills: ["shadcn-ui", "mui", "chakra-ui", "mantine", "ant-design"],
      },
      { purpose: "Mobile", skills: ["react-native", "expo"] },
      {
        purpose: "CLI Framework",
        skills: ["cli-commander", "oclif-ink"],
      },
      { purpose: "AI SDK", skills: ["vercel-ai-sdk", "langchain", "llamaindex"] },
      { purpose: "Backend as a Service", skills: ["supabase", "firebase", "appwrite"] },
      { purpose: "Auth", skills: ["better-auth-drizzle-hono", "nextauth", "clerk"] },
      {
        purpose: "AI Provider SDK",
        skills: [
          "anthropic-sdk",
          "openai-sdk",
          "google-gemini-sdk",
          "mistral-sdk",
          "cohere-sdk",
          "together-ai",
          "replicate",
          "huggingface-inference",
          "ollama",
          "litellm",
        ],
      },
      { purpose: "Vector Database", skills: ["pinecone", "qdrant", "chroma", "weaviate"] },
      { purpose: "Search Engine", skills: ["elasticsearch", "meilisearch"] },
      { purpose: "CMS", skills: ["payload", "sanity", "strapi"] },
      {
        purpose: "Managed Database",
        skills: ["neon", "planetscale", "turso", "vercel-postgres", "cockroachdb"],
      },
      { purpose: "Cache / KV Store", skills: ["redis", "upstash", "vercel-kv"] },
      { purpose: "Payment", skills: ["stripe"] },
      { purpose: "Realtime", skills: ["websockets", "socket-io", "sse"] },
      { purpose: "Animation", skills: ["framer-motion", "css-animations", "view-transitions"] },
      { purpose: "Monorepo Orchestrator", skills: ["turborepo", "nx"] },
      { purpose: "Linting / Formatting", skills: ["biome", "eslint-prettier"] },
      { purpose: "Documentation Framework", skills: ["docusaurus", "vitepress"] },
      { purpose: "Desktop Framework", skills: ["electron", "tauri"] },
      { purpose: "AI Evaluation / Observability", skills: ["langfuse", "promptfoo"] },
      { purpose: "SQL Database", skills: ["postgresql", "mysql"] },
      { purpose: "Internationalization (React)", skills: ["react-intl", "next-intl"] },
    ],
  },
};
