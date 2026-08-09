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
        skills: ["hono", "express", "fastify", "elysia", "nestjs"],
        reason: "API frameworks are mutually exclusive within a single service",
      },
      {
        skills: ["cli-commander", "oclif-ink"],
        reason: "CLI frameworks are mutually exclusive",
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
        skills: ["electron", "tauri"],
        reason: "Desktop frameworks are mutually exclusive",
      },
      {
        skills: ["better-auth-drizzle-hono", "nextauth", "clerk"],
        reason: "Authentication solutions are mutually exclusive",
      },
      {
        skills: ["react-intl", "next-intl"],
        reason: "React internationalization libraries are mutually exclusive",
      },
    ],
    discourages: [],
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
        needs: ["drizzle", "hono"],
        reason:
          "Skill teaches Better Auth with the Drizzle adapter, mounted via Hono routes and typed Hono middleware",
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
        needs: ["react"],
        reason:
          "React Router v7 Data Mode SPA skill — createBrowserRouter/RouterProvider are framework-owned (wrong) inside a Remix framework-mode app",
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
        reason:
          "Skill teaches next-intl's Next.js App Router surface — middleware, routing.ts, setRequestLocale, NextIntlClientProvider",
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
          "qwik",
          "nextjs",
          "remix",
          "nuxt",
          "sveltekit",
        ],
        needsAny: true,
        reason: "Storybook requires a UI framework",
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
      {
        skill: "react-navigation",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "React Navigation targets React Native apps, bare or Expo",
      },
      {
        skill: "expo-router",
        needs: ["expo"],
        reason: "Expo Router is built on the Expo SDK",
      },
      {
        skill: "nativewind",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "NativeWind compiles Tailwind classes for React Native components",
      },
      {
        skill: "unistyles",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "Unistyles styles React Native via Nitro Modules",
      },
      {
        skill: "detox",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "Detox is gray-box E2E testing for React Native",
      },
      {
        skill: "maestro",
        needs: ["react-native", "expo", "tauri-mobile"],
        needsAny: true,
        reason: "Maestro drives a mobile app; these are the catalog's mobile-app producers",
      },
      {
        skill: "tamagui",
        needs: ["react-native", "expo", "react"],
        needsAny: true,
        reason: "Tamagui is universal React: native via RN or Expo, web via React alone",
      },
      {
        skill: "react-native-paper",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "React Native Paper is Material Design 3 for React Native",
      },
      {
        skill: "reanimated",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "Reanimated animates React Native via worklets",
      },
      {
        skill: "gesture-handler",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "Gesture Handler replaces React Native's gesture system",
      },
      {
        skill: "skia",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "@shopify/react-native-skia is a React Native renderer",
      },
      {
        skill: "mmkv",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "react-native-mmkv is a React Native storage package",
      },
      {
        skill: "sqlite-powersync",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "The skill teaches PowerSync's React Native SDK",
      },
      {
        skill: "watermelondb",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "WatermelonDB as taught targets offline-first React Native apps",
      },
      {
        skill: "eas",
        needs: ["expo"],
        reason: "EAS Build/Update workflows assume the Expo SDK",
      },
      {
        skill: "vision-camera",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "react-native-vision-camera depends on React Native's JSI",
      },
      {
        skill: "ble-nfc",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "Both taught libraries are React Native packages",
      },
      {
        skill: "push",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "Dual-path: expo-notifications or React Native Firebase messaging",
      },
      {
        skill: "tasks",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "Dual-path: Expo background tasks or react-native-background-fetch",
      },
      {
        skill: "app-links",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "Deep linking via expo-linking or React Navigation linking config",
      },
      {
        skill: "react-native-performance",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "React Native performance patterns: Hermes, threads, FlashList",
      },
      {
        skill: "react-native-security",
        needs: ["react-native", "expo"],
        needsAny: true,
        reason: "Dual-path secure storage: expo-secure-store or react-native-keychain",
      },
      {
        skill: "electron-ipc",
        needs: ["electron"],
        reason: "contextBridge/ipcMain are Electron core APIs",
      },
      {
        skill: "electron-storage",
        needs: ["electron"],
        reason: "electron-store and safeStorage are Electron-scoped",
      },
      {
        skill: "electron-ui",
        needs: ["electron"],
        reason: "Tray, Menu, and frameless windows are Electron core APIs",
      },
      {
        skill: "electron-testing",
        needs: ["electron"],
        reason: "Playwright's _electron driver automates Electron apps",
      },
      {
        skill: "electron-updater",
        needs: ["electron"],
        reason: "electron-updater updates packaged Electron apps",
      },
      {
        skill: "electron-multiwindow",
        needs: ["electron"],
        reason: "BaseWindow and WebContentsView are Electron core APIs",
      },
      {
        skill: "electron-security",
        needs: ["electron"],
        reason: "Fuses, ASAR integrity, and sandbox are Electron mechanisms",
      },
      {
        skill: "electron-forge",
        needs: ["electron"],
        reason: "Electron Forge packages Electron apps",
      },
      {
        skill: "tauri-backend",
        needs: ["tauri"],
        reason: "tauri::command and State are the tauri crate",
      },
      {
        skill: "tauri-bundling",
        needs: ["tauri"],
        reason: "Tauri bundler, signer, and updater configuration",
      },
      {
        skill: "tauri-plugins",
        needs: ["tauri"],
        reason: "tauri-plugin-* crates and the Tauri 2 ACL model",
      },
      {
        skill: "tauri-multiwindow",
        needs: ["tauri"],
        reason: "Tauri 2 event system and WebviewWindow APIs",
      },
      {
        skill: "tauri-security",
        needs: ["tauri"],
        reason: "Capabilities and permissions are the Tauri 2 security model",
      },
      {
        skill: "tauri-mobile",
        needs: ["tauri"],
        reason: "Tauri mobile targets are the same Tauri project",
      },
      {
        skill: "mercurius",
        needs: ["fastify"],
        reason: "Mercurius is a Fastify plugin — registered via app.register on a Fastify instance",
      },
      {
        skill: "nextauth",
        needs: ["nextjs"],
        reason:
          "Skill teaches the next-auth (Next.js) package — auth.ts, handlers, middleware, Server Components",
      },
      {
        skill: "bullmq",
        needs: ["redis", "upstash"],
        needsAny: true,
        reason:
          "BullMQ drives a Redis-compatible server over ioredis/TCP (blocking commands, Lua scripts, streams); Upstash documents BullMQ over its TCP endpoint — its REST client cannot drive BullMQ, and the skill carries its own ioredis connection factory",
      },
      {
        skill: "composable-components",
        needs: ["react"],
        reason:
          "Composition patterns are React surface — base-ui useRender/mergeProps, forwardRef, JSX parts",
      },
      {
        skill: "web-reviewing",
        needs: ["react"],
        reason:
          "Checklist self-scopes to React diffs — rules of hooks, dependency arrays, React.memo",
      },
      {
        skill: "base-ui",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Base UI primitives are React-only (@base-ui/react)",
      },
      {
        skill: "react-three-fiber",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "React Three Fiber is a React renderer for Three.js",
      },
      {
        skill: "dnd-kit",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason:
          "The skill teaches DndContext/useDraggable/useDroppable/useSortable — @dnd-kit React packages throughout",
      },
      {
        skill: "lexical",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason:
          "The skill's only editor setup and plugin registration path is @lexical/react — LexicalComposer plus useEffect registration",
      },
      {
        skill: "recharts",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason: "Recharts wraps D3 in composable React components",
      },
      {
        skill: "component-library",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason:
          "Packaging React components — react/react-dom peerDependencies and 'use client' preservation are the skill's critical requirements",
      },
      {
        skill: "setup-resend",
        needs: ["react", "nextjs", "remix"],
        needsAny: true,
        reason:
          "Resend Email & React Email Setup — .tsx templates and the react: send prop are React Email surface",
      },
      {
        skill: "setup-axiom-pino-sentry",
        needs: ["nextjs"],
        reason:
          "Every pattern is the Next.js wiring — next-axiom, @sentry/nextjs, next.config.ts wrapping, instrumentation.ts; strip the Next slice and nothing followable remains",
      },
      {
        skill: "turborepo-ci",
        needs: ["turborepo"],
        reason:
          "Turborepo CI patterns configure turbo.json and the turbo CLI — requires the Turborepo task runner (shared-task-runner)",
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
