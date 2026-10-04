// AUTO-GENERATED from skills source — do not edit manually
// Run: bun run generate:types

import type { SkillId } from "../skills";

export const ACTIVATION_DESCRIPTIONS: Readonly<Partial<Record<SkillId, string>>> = {
  "ai-infrastructure-huggingface-inference":
    "Hugging Face Inference SDK patterns for TypeScript/Node.js — InferenceClient setup, chat completion, text generation, streaming, embeddings, image generation, audio transcription, translation, summarization, and Inference Endpoints",
  "ai-infrastructure-litellm":
    "LiteLLM proxy server setup, TypeScript client patterns via OpenAI SDK, model routing, fallbacks, load balancing, spend tracking, virtual keys, and production deployment",
  "ai-infrastructure-modal":
    "Serverless GPU compute platform for AI model deployment — web endpoints, GPU functions, model serving, and TypeScript client patterns",
  "ai-infrastructure-ollama":
    "Local LLM inference with the Ollama JavaScript client -- chat, streaming, tool calling, vision, embeddings, structured output, model management, and OpenAI-compatible endpoint",
  "ai-infrastructure-replicate":
    "Replicate SDK patterns for TypeScript/Node.js -- client setup, predictions, streaming, webhooks, file handling, model versioning, deployments, and training",
  "ai-infrastructure-together-ai":
    "Together AI SDK patterns for TypeScript — client setup, chat completions, streaming, structured output, function calling, embeddings, image generation, fine-tuning, and OpenAI-compatible endpoints",
  "ai-observability-langfuse":
    "LLM observability with Langfuse — OpenTelemetry-based tracing, evaluations, prompt management, datasets, and production best practices",
  "ai-observability-promptfoo":
    "Testing and evaluation framework for LLM prompts and applications -- promptfooconfig.yaml, assertions, model-graded evals, red teaming, CI/CD integration, custom providers, and comparative evaluation",
  "ai-orchestration-langchain":
    "LangChain.js patterns for building LLM applications — chat models, LCEL chains, prompt templates, structured output, agents, tools, RAG, streaming, and LangSmith tracing",
  "ai-orchestration-llamaindex":
    "LlamaIndex.TS data framework for RAG, indexing, retrieval, query engines, chat engines, and agentic workflows in TypeScript",
  "ai-orchestration-vercel-ai-sdk":
    "Vercel AI SDK patterns - providers, text generation, streaming, structured output, tool calling, chat UI hooks, embeddings, and RAG",
  "ai-patterns-tool-use-patterns":
    "Provider-agnostic patterns for LLM function calling, tool loops, and agentic workflows",
  "ai-provider-anthropic-sdk":
    "Official Anthropic SDK patterns for TypeScript/Node.js — client setup, Messages API, streaming, tool use, vision, extended thinking, structured outputs, prompt caching, batch API, and production best practices",
  "ai-provider-claude-vision":
    "Image understanding and document analysis with Claude's multimodal capabilities -- image input formats, PDF processing, multi-image patterns, structured extraction, and token cost estimation",
  "ai-provider-cohere-sdk":
    "Official Cohere TypeScript SDK patterns -- CohereClientV2, chat, embeddings, rerank, RAG with citations, tool use, streaming, and model selection",
  "ai-provider-elevenlabs":
    "ElevenLabs voice AI SDK patterns for TypeScript/Node.js -- text-to-speech, streaming, voice cloning, speech-to-speech, pronunciation control, and conversational AI",
  "ai-provider-google-gemini-sdk":
    "Official TypeScript SDK for Google Gemini — client setup, text generation, multimodal input, function calling, structured output, streaming, embeddings, context caching, and chat sessions",
  "ai-provider-mistral-sdk":
    "Official Mistral AI TypeScript SDK patterns — client setup, chat completions, streaming, function calling, structured outputs, embeddings, vision, Codestral FIM, and production best practices",
  "ai-provider-openai-sdk":
    "Official OpenAI SDK patterns for TypeScript/Node.js — client setup, Chat Completions, Responses API, streaming, structured outputs, function calling, embeddings, vision, audio, and production best practices",
  "ai-provider-openai-whisper":
    "Speech-to-text transcription and translation via OpenAI Audio API -- models, response formats, timestamps, prompting, streaming, chunking, and diarization",
  "api-analytics-posthog-analytics":
    "PostHog event tracking, user identification, group analytics for B2B, GDPR consent patterns. Use when implementing product analytics, tracking user behavior, setting up funnels, or configuring privacy-compliant tracking.",
  "api-analytics-setup-posthog": "PostHog analytics and feature flags setup",
  "api-auth-better-auth-drizzle-hono": "Better Auth patterns, sessions, OAuth",
  "api-auth-clerk":
    "Clerk managed authentication - ClerkProvider, middleware, pre-built components, hooks, server-side auth, organizations, webhooks",
  "api-auth-nextauth":
    "Auth.js (NextAuth v5) authentication patterns - configuration, providers, session strategies, middleware, database adapters, role-based access, Edge compatibility",
  "api-baas-appwrite":
    "Appwrite backend-as-a-service — Auth, TablesDB, Storage, Functions, Realtime, permissions model, typed client",
  "api-baas-firebase":
    "Firebase backend-as-a-service — Firestore, Authentication, Cloud Functions v2, Storage, Hosting, Admin SDK, security rules, emulator suite",
  "api-baas-neon": "Serverless PostgreSQL with branching, autoscaling, and edge-compatible driver",
  "api-baas-planetscale":
    "Serverless MySQL platform with branching, deploy requests, and edge-compatible driver",
  "api-baas-supabase":
    "Supabase backend-as-a-service — Auth, Database, Realtime, Storage, Edge Functions, RLS policies, typed client",
  "api-baas-turso": "Edge-hosted SQLite database with libSQL driver and embedded replicas",
  "api-caching-strategies":
    "Application-level caching strategies, HTTP caching, cache invalidation, and stampede prevention",
  "api-cms-payload":
    "Payload CMS v3 — TypeScript-native headless CMS with code-first collections, hooks, access control, Local/REST/GraphQL APIs, admin panel, and database adapter pattern",
  "api-cms-sanity":
    "Structured content platform — GROQ queries, schema definitions, @sanity/client, Portable Text, image handling, real-time listeners, mutations, TypeGen",
  "api-cms-strapi":
    "Open-source headless CMS — content type schemas, REST API, Document Service API, custom controllers, lifecycle hooks, authentication, TypeScript",
  "api-commerce-stripe":
    "Stripe payment processing — Checkout Sessions, Payment Intents, subscriptions, webhooks, Connect, customer management, error handling",
  "api-database-cockroachdb":
    "CockroachDB distributed SQL -- transaction retries, multi-region, online schema changes, follower reads, PostgreSQL compatibility gaps",
  "api-database-drizzle": "Drizzle ORM, queries, migrations",
  "api-database-edgedb":
    "Graph-relational database with EdgeQL query language, code-first schema, link-based relations, computed properties, and fully typed TypeScript query builder",
  "api-database-knex":
    "SQL query builder for PostgreSQL, MySQL, SQLite, and MSSQL -- fluent queries, schema builder, migrations, seeds, transactions, raw queries",
  "api-database-mongodb":
    "Native MongoDB driver (the mongodb npm package) - MongoClient lifecycle, typed collections, CRUD result shapes, cursors, aggregation pipelines, index design, transactions",
  "api-database-mongoose":
    "MongoDB ODM with schemas, validation, middleware, and TypeScript support",
  "api-database-mysql":
    "Direct MySQL database access with mysql2 driver -- connection pools, prepared statements, transactions, streaming, typed queries, error handling",
  "api-database-postgresql":
    "Direct PostgreSQL access with node-postgres (pg) -- connection pools, parameterized queries, transactions, streaming, LISTEN/NOTIFY, error handling",
  "api-database-prisma": "Prisma ORM, type-safe queries, migrations, relations",
  "api-database-redis":
    "Redis in-memory data store patterns with ioredis and node-redis -- caching, sessions, rate limiting, pub/sub, streams, queues, transactions, cluster",
  "api-database-sequelize":
    "Sequelize ORM, model definitions, associations, queries, transactions, migrations",
  "api-database-surrealdb":
    "SurrealDB multi-model database - SurrealQL queries, record links, graph relations, live queries, schema definitions, authentication, TypeScript SDK",
  "api-database-typeorm":
    "Decorator-based ORM for TypeScript with Active Record and Data Mapper patterns",
  "api-database-upstash":
    "Upstash serverless Redis -- REST-based client, auto-serialization, pipelines, rate limiting, QStash, edge compatibility, global replication",
  "api-database-vercel-kv":
    "Serverless Redis-compatible key-value store via Upstash REST API -- edge-compatible, automatic JSON serialization, TTL-based caching",
  "api-database-vercel-postgres": "Serverless PostgreSQL on Vercel with edge-compatible SDK",
  "api-email-resend-react-email": "Resend + React Email templates",
  "api-email-setup-resend": "Resend email setup, domain verification",
  "api-flags-posthog-flags":
    "PostHog feature flags, rollouts, A/B testing. Use when implementing gradual rollouts, A/B tests, kill switches, remote configuration, beta features, or user targeting with PostHog.",
  "api-framework-elysia":
    "Bun-native HTTP framework — routing, TypeBox validation, Eden Treaty, plugins, lifecycle hooks",
  "api-framework-express":
    "Express.js routes, middleware, error handling, request/response patterns",
  "api-framework-fastify":
    "Fastify routes, JSON Schema validation, plugin system, TypeScript type providers",
  "api-framework-hono": "Hono routes, OpenAPI, Zod validation",
  "api-framework-nestjs":
    "NestJS backend framework - modules, controllers, services, DI, guards, pipes, interceptors, exception filters, middleware, DTOs with class-validator",
  "api-graphql-apollo-server":
    "GraphQL API server with Apollo Server — schema, resolvers, context, error handling, data sources, plugins",
  "api-graphql-mercurius":
    "GraphQL server for Fastify with Mercurius — loaders, subscriptions, federation, JIT compilation",
  "api-graphql-yoga": "GraphQL Yoga v5 server, Envelop plugins, subscriptions, error masking",
  "api-messaging-webhooks":
    "Webhook patterns — receiving, sending, signature verification, and retry logic",
  "api-observability-axiom-pino-sentry":
    "Pino logging, Sentry error tracking, Axiom - structured logging with correlation IDs, error boundaries, performance monitoring, alerting",
  "api-observability-setup-axiom-pino-sentry":
    "Pino, Axiom, Sentry installation - one-time project setup for logging and error tracking with source maps upload",
  "api-performance-api-performance":
    "Query optimization, caching, indexing, connection pooling, async patterns",
  "api-queue-bullmq": "Job queues, background processing, and task scheduling with BullMQ v5",
  "api-search-elasticsearch":
    "Elasticsearch patterns -- client setup, index management, search DSL, aggregations, vector search, bulk operations, deep pagination",
  "api-search-meilisearch":
    "Meilisearch search engine patterns -- client setup, indexing, search, filtering, facets, geo search, multi-tenancy, task management",
  "api-search-xquik":
    "Xquik REST API patterns for X post search, user and timeline reads, cursor pagination, media downloads, monitors, signed webhooks, and approval-gated X actions",
  "api-specs-openapi": "OpenAPI 3.1 specification, schema design, code generation",
  "api-vector-db-chroma":
    "Chroma vector database -- collection management, automatic embedding, metadata filtering, document storage, query patterns",
  "api-vector-db-pinecone":
    "Pinecone serverless vector database -- index management, vector operations, metadata filtering, namespaces, hybrid search, inference API",
  "api-vector-db-qdrant":
    "Qdrant vector database -- collection management, point operations, payload filtering, named vectors, quantization, recommendations, snapshots",
  "api-vector-db-weaviate":
    "Weaviate vector database patterns with weaviate-client v3 -- collection management, vectorizer modules, hybrid search, filtering, generative search (RAG), multi-tenancy, batch imports",
  "cli-framework-cli-commander":
    "Node.js CLI development with Commander.js and @clack/prompts - command structure, interactive prompts, wizard state machines, config hierarchies, exit codes, cancellation handling",
  "cli-framework-oclif-ink":
    "Modern CLI development combining oclif's command framework with Ink's React-based terminal rendering",
  "cli-prompts-clack":
    "Beautiful interactive CLI prompts with @clack/prompts and custom prompts with @clack/core",
  "desktop-backend-tauri":
    "Tauri 2.x Rust command patterns, state management, error handling, events, channels, testing",
  "desktop-framework-electron":
    "Electron process architecture, IPC patterns, preload security, native APIs, packaging and distribution",
  "desktop-framework-tauri":
    "Tauri 2.x commands, IPC bridge, permission system, plugins, window management, system tray, packaging",
  "desktop-ipc-electron":
    "Type-safe Electron IPC patterns with typed channels, electron-trpc, MessagePort, and utility process communication",
  "desktop-mobile-tauri":
    "Tauri 2.x mobile development - iOS via WKWebView, Android via Android WebView, mobile plugins, Swift/Kotlin native code, permissions, debugging",
  "desktop-multiwindow-electron":
    "Multi-window management, WebContentsView, BaseWindow, window lifecycle, inter-window communication, state persistence",
  "desktop-multiwindow-tauri":
    "Tauri 2.x multi-window creation, event system, window state persistence, parent/child and modal windows",
  "desktop-packaging-electron-forge":
    "Electron Forge build toolchain -- makers, publishers, code signing, fuses, hooks, CI/CD packaging",
  "desktop-packaging-tauri":
    "Tauri 2.x bundling, code signing, auto-updater, platform installers, CI/CD",
  "desktop-plugins-tauri":
    "Tauri 2.x official plugin ecosystem, plugin APIs, permissions, and custom plugin development",
  "desktop-security-electron":
    "Electron fuses, ASAR integrity, sandbox hardening, CSP, permission handling, navigation restrictions",
  "desktop-security-tauri":
    "Tauri 2.x deny-by-default security model, capabilities, permissions, scopes, ACL",
  "desktop-storage-electron":
    "Persistent storage, SQLite databases, and credential management in Electron apps",
  "desktop-testing-electron":
    "E2E testing with Playwright, main process unit testing, IPC testing, dialog/menu mocking, CI headless setup",
  "desktop-ui-electron":
    "Frameless windows, custom title bars, tray, menus, dock badges, vibrancy, kiosk mode, window state persistence",
  "desktop-updates-electron-updater":
    "Cross-platform auto-update patterns with electron-updater (electron-builder ecosystem)",
  "infra-ci-cd-docker":
    "Docker containerization patterns for Node.js/TypeScript development and production",
  "infra-ci-cd-github-actions": "GitHub Actions, pipelines, deployment",
  "infra-ci-cd-turborepo-ci": "Turborepo CI pipelines with remote caching and affected detection",
  "infra-config-setup-env": "Environment configuration, Zod validation",
  "infra-containers-kubernetes":
    "Kubernetes manifests, Helm charts, Kustomize overlays, and resource patterns",
  "infra-iac-pulumi": "TypeScript-native Infrastructure as Code with Pulumi",
  "infra-iac-sst":
    "SST (Ion) infrastructure-as-code — TypeScript-first serverless on AWS with Pulumi, resource linking, and live Lambda dev",
  "infra-iac-terraform": "Infrastructure as Code with HashiCorp Terraform",
  "infra-platform-aws-sdk":
    "AWS SDK v3 for TypeScript — modular clients, command pattern, S3, DynamoDB, SQS, Lambda, SNS, Secrets Manager",
  "infra-platform-cloudflare-workers":
    "Cloudflare Workers edge compute platform — Wrangler CLI, KV, D1, R2, Durable Objects, Queues, Workers AI",
  "infra-platform-netlify":
    "Netlify deployment platform — serverless functions, edge functions, redirects, forms, Blobs, build plugins",
  "infra-platform-vercel":
    "Vercel deployment platform — project configuration, serverless/edge functions, Routing Middleware, cron jobs, environment variables, monorepo setup",
  "meta-config-stack-detect":
    "Inspect a codebase, a stack the user describes, or a description of what they want to build; map what is there to agents-inc catalog skills — or intent to candidate built-in stacks the user picks from — and emit a SeedPayload plus a human-readable proposal report. Use when seeding a configuration for a project that has none.",
  "meta-design-composable-components": "Composable component APIs — parts, state, polymorphism",
  "meta-design-expressive-typescript":
    "Readable functional patterns — orchestrators, pure functions, named abstractions",
  "meta-methodology-research-methodology":
    "Investigation flow (Glob -> Grep -> Read), evidence-based research with file:line references, structured output format for AI consumption. Use for pattern discovery, implementation research, and codebase investigation.",
  "meta-planning-ai-planning":
    "AI specification planning frameworks. Use when a spec touches model calls, prompts, retrieval, tool calling, agentic loops, or evals. Covers approach selection, model and provider choice, structured output contracts, loop guards, budgets, failure modes, and eval design.",
  "meta-planning-api-planning":
    "Backend specification planning frameworks. Use when a spec touches API endpoints, database schema, middleware, or auth. Covers endpoint contracts with request/response shapes, error catalogs, auth per endpoint, schema design with constraints and indexes, migration strategy, and middleware pipeline ordering.",
  "meta-planning-cli-planning":
    "CLI specification planning frameworks. Use when a spec touches a command surface, an interactive flow, config precedence, exit codes, or output modes. Covers flag contracts, prompt flow design, precedence tables, exit-code taxonomy, TTY/piped/JSON output, error text, signals, and cross-platform concerns.",
  "meta-planning-web-planning":
    "Frontend specification planning frameworks. Use when a spec touches UI components, forms, client state, or user-facing flows. Covers UI-state completeness (loading, error, empty, success), component boundaries, form validation contracts, state ownership, and measurable UI success criteria.",
  "meta-reviewing-ai-reviewing":
    "AI integration review patterns. Use when reviewing model API calls, prompt construction, LLM output handling, RAG pipelines, and tool-calling code. Covers prompt-injection call-chain tracing, output validation, token budgets, retry/timeout handling, streaming, and key/PII exposure.",
  "meta-reviewing-api-reviewing":
    "Backend code review patterns. Use when reviewing API routes, database operations, auth middleware, and server utilities. Covers injection, boundary validation, authorization coverage, secret/PII exposure, error leakage, and query patterns.",
  "meta-reviewing-cli-reviewing":
    "CLI code review patterns. Use when reviewing CLI applications built with Commander.js, @clack/prompts, picocolors. Covers exit codes, signal handling, error messages, user experience, testing adequacy.",
  "meta-reviewing-infra-reviewing":
    "Infrastructure code review patterns. Use when reviewing CI/CD workflows, Dockerfiles, deployment configs, and IaC. Covers supply-chain pinning, secret exposure, container hygiene, least-privilege permissions, and deployment safety.",
  "meta-reviewing-reviewing":
    "Code review patterns, feedback principles. Use when reviewing PRs, implementations, or making approval/rejection decisions. Covers self-correction, progress tracking, feedback principles, severity levels.",
  "meta-reviewing-web-reviewing":
    "UI component review patterns. Use when reviewing React components, hooks, props, state, styling, and accessibility. Covers rules of hooks, effect cleanup, render performance, list keys, keyboard and ARIA patterns.",
  "mobile-animation-gesture-handler":
    "React Native Gesture Handler - gesture types, GestureDetector, gesture composition, state machine, platform-specific gestures, swipeable rows, hover gestures",
  "mobile-animation-reanimated":
    "React Native Reanimated 4 - shared values, animated styles, spring/timing/decay, layout animations, gesture integration, scroll-driven animations, interpolation, worklets, CSS animations",
  "mobile-animation-skia":
    "React Native Skia GPU-accelerated 2D graphics - Canvas, declarative drawing, shaders, image filters, Paragraph text, Atlas batch rendering, Reanimated animations",
  "mobile-background-tasks":
    "Background fetch, processing tasks, background location, headless JS, battery optimization - Expo and bare React Native",
  "mobile-camera-vision-camera":
    "VisionCamera v4+ - photo/video capture, QR/barcode scanning, real-time frame processors, zoom/focus/exposure, HDR, location metadata, format selection",
  "mobile-deep-linking-app-links":
    "Deep linking patterns - Universal Links (iOS), App Links (Android), URI schemes, expo-linking API, React Navigation linking config, Expo Router automatic linking, AASA/assetlinks.json setup, deferred deep links, testing",
  "mobile-deployment-eas": "EAS Build, Update, Submit deployment patterns",
  "mobile-framework-expo": "Expo managed workflow",
  "mobile-framework-react-native":
    "React Native mobile development patterns - New Architecture (Fabric, TurboModules, JSI), component architecture, React Navigation 7+, FlashList v2 optimization, gestures with Reanimated 4, platform-specific code, React 19 features",
  "mobile-hardware-ble-nfc":
    "BLE scanning/connecting/GATT operations with react-native-ble-plx, NFC tag reading/writing with react-native-nfc-manager, permissions, background mode, battery-efficient patterns",
  "mobile-navigation-expo-router": "File-based routing and navigation for Expo/React Native",
  "mobile-navigation-react-navigation":
    "React Navigation 7+ patterns - static and dynamic APIs, type-safe navigation, stack/tab/drawer navigators, deep linking, authentication flows, screen preloading, header customization",
  "mobile-notifications-push":
    "Push notification patterns - expo-notifications (Expo) and @react-native-firebase/messaging (bare RN), permission handling, token management, foreground/background/tap listeners, local scheduling, Android channels, notification categories and actions, badge management, rich notifications",
  "mobile-performance-react-native":
    "React Native performance profiling, optimization, and monitoring - JS/UI thread analysis, re-render prevention, list optimization, image performance, bundle size, startup time, memory leaks, React Compiler, New Architecture benefits",
  "mobile-security-react-native":
    "Secure storage, certificate pinning, biometric auth, jailbreak detection, code obfuscation, network security, screenshot prevention for React Native",
  "mobile-storage-mmkv":
    "MMKV high-performance key-value storage for React Native - synchronous JSI-based reads/writes, encryption, typed hooks, multiple instances, listeners, persistence middleware adapters",
  "mobile-storage-sqlite-powersync":
    "PowerSync offline-first sync engine on SQLite for React Native - schema definition, watched queries, CRUD operations, backend connectors, sync rules, conflict resolution, attachments",
  "mobile-storage-watermelondb":
    "WatermelonDB reactive local database for React Native - schema, models, decorators, reactive queries, relations, writers/readers, batch operations, migrations, sync",
  "mobile-styling-nativewind":
    "NativeWind v4+ - Tailwind CSS utility classes for React Native, className prop, CSS variables, dark mode, platform prefixes, animations, theming, third-party component integration",
  "mobile-styling-unistyles":
    "Unistyles 3.0 styling - C++ powered StyleSheet superset with zero re-renders, theming, breakpoints, variants, dynamic functions, runtime values",
  "mobile-testing-detox":
    "Detox E2E gray-box testing for React Native - matchers, actions, expectations, waitFor, device API, synchronization, mocking, artifacts, CI integration",
  "mobile-testing-maestro":
    "Maestro mobile E2E testing - YAML flows, selectors, flow control, environment variables, JavaScript expressions, device interactions, Maestro Studio, Maestro Cloud CI, tags, test suites",
  "mobile-ui-components-react-native-paper":
    "React Native Paper v5+ - Material Design 3 theming, PaperProvider, key components, dynamic color, accessibility, tree-shaking, custom fonts, navigation integration",
  "mobile-ui-components-tamagui":
    "Tamagui universal UI - styled(), tokens, themes, optimizing compiler, responsive media queries, animations, Sheet/Dialog components",
  "shared-monorepo-nx":
    "Nx monorepo build system — workspace configuration, project graph, task pipelines, caching, generators, plugins, and release management",
  "shared-monorepo-pnpm-workspaces":
    "pnpm workspace protocol, filtering, catalogs, shared dependencies, publishing, and CI/CD for monorepo management",
  "shared-monorepo-turborepo":
    "Turborepo, workspaces, package architecture, @repo/* naming, exports, tree-shaking",
  "shared-security-auth-security":
    "Secrets management, XSS prevention, CSRF protection, dependency scanning, DOMPurify sanitization, CSP headers, CODEOWNERS, HttpOnly cookies",
  "shared-tooling-biome":
    "Biome v2 unified linter, formatter, and import organizer — single Rust-powered tool replacing ESLint + Prettier with 97% Prettier compatibility and 20x faster performance",
  "shared-tooling-changesets":
    "Versioning and changelog management with @changesets/cli — adding changesets, version bumping, changelog generation, monorepo publishing, pre-release modes, and CI automation",
  "shared-tooling-eslint-prettier":
    "ESLint 9/10 flat config with defineConfig(), Prettier v3.0+ shared config, eslint-config-prettier integration, typescript-eslint v8+ projectService",
  "shared-tooling-git-hooks":
    "Husky v9 setup, lint-staged v16 patterns, commitlint with conventional commits, CI/production handling, monorepo setup, migration from v8",
  "shared-tooling-typescript-config":
    "TypeScript strict mode configs, TS 5.x+ options (verbatimModuleSyntax, module preserve, moduleDetection force, configDir), path alias sync, specialized configs",
  "web-3d-react-three-fiber":
    "React Three Fiber (R3F) 3D rendering — Canvas, meshes, materials, lights, cameras, animations, events, physics, post-processing, performance",
  "web-accessibility-web-accessibility": "WCAG, ARIA, keyboard navigation",
  "web-animation-css-animations":
    "CSS animation patterns - transitions, keyframes, scroll-driven timelines, @property, compositor-friendly properties, prefers-reduced-motion",
  "web-animation-framer-motion":
    "Motion (formerly Framer Motion) patterns - motion components, variants, AnimatePresence, gestures, layout animations, scroll-linked motion, reduced-motion handling",
  "web-animation-view-transitions":
    "View Transitions API patterns - same-document transitions, cross-document navigation, shared element animations, pseudo-element styling, transition types, reduced-motion handling",
  "web-data-fetching-graphql-apollo":
    "Apollo Client GraphQL patterns — normalized cache and type policies, queries, mutations with optimistic updates, pagination, fragments, subscriptions, and Suspense hooks",
  "web-data-fetching-graphql-urql":
    "URQL GraphQL client patterns — the exchange pipeline, document and normalized caching, queries, mutations, subscriptions, and authentication",
  "web-data-fetching-swr":
    "SWR data fetching patterns — keys and fetchers, isLoading vs isValidating, revalidation strategy, useSWRMutation, useSWRInfinite, conditional fetching",
  "web-data-fetching-trpc":
    "tRPC type-safe API patterns — routers and procedures, input validation, context and middleware, TRPCError, and the typed client bridge",
  "web-dataviz-d3":
    "D3.js data visualization — selections, data joins, scales, axes, shapes, transitions, force layouts, geo projections, framework integration",
  "web-dataviz-recharts":
    "Recharts composable chart components - LineChart, BarChart, AreaChart, PieChart, ComposedChart, responsive sizing, custom tooltips, animations",
  "web-dnd-dnd-kit":
    "Drag and drop with @dnd-kit - draggable, droppable, sortable, collision detection, sensors, accessibility",
  "web-editor-lexical":
    "Extensible text editor framework by Meta. Use when building a rich text editor on Lexical — editor setup, custom nodes, commands, transforms, and serialization.",
  "web-editor-tiptap":
    "Headless rich text editor framework built on ProseMirror. Use when building an editor with TipTap — setup, extensions, custom nodes and marks, menus, node views, serialization.",
  "web-error-handling-error-boundaries":
    "Error boundary patterns, fallback UI, reset/retry, react-error-boundary library, React 19 createRoot error hooks",
  "web-error-handling-result-types":
    "TypeScript Result/Either types for type-safe error handling, railway-oriented programming patterns, error as values",
  "web-files-file-upload-patterns":
    "File upload patterns - drag-drop dropzones, chunked and resumable uploads, presigned URL flows, file validation (MIME type, magic bytes), progress tracking, accessibility (ARIA)",
  "web-files-image-handling":
    "Client-side image handling - preview generation, Canvas API resizing, compression, EXIF orientation, format conversion, memory management with object URL cleanup",
  "web-forms-react-hook-form":
    "React Hook Form patterns - useForm, Controller, useFieldArray, validation resolver, performance optimization",
  "web-forms-tanstack-form":
    "TanStack Form patterns - useForm, form.Field, validators, arrays, linked fields, createFormHook, type safety",
  "web-forms-vee-validate":
    "VeeValidate v4 patterns - useForm, useField, defineField, useFieldArray, schema validation with Composition API",
  "web-forms-zod-validation":
    "Zod schema validation patterns for TypeScript - schema definitions, type inference, refinements, transforms, discriminated unions",
  "web-framework-angular-standalone":
    "Angular 17–19 standalone components, signals, built-in control flow, inject() DI, the resource API. Load when writing or migrating Angular components.",
  "web-framework-react":
    "Component architecture, hooks and React 19 patterns. Load when building or refactoring React components, custom hooks, forms, or async UI.",
  "web-framework-solidjs":
    "SolidJS fine-grained reactivity — signals, effects, memos, stores, resources, control-flow components. Load when writing Solid components or reactive state.",
  "web-framework-svelte":
    "Svelte 5 runes — $state, $derived, $effect, $props, $bindable, snippets, callback props, context. Load when writing Svelte 5 components or reactive modules.",
  "web-framework-vue-composition-api":
    "Vue 3 Composition API — reactivity primitives, composables, lifecycle, the 3.4+ and 3.5+ macros. Load when writing Vue 3 components or composables.",
  "web-i18n-next-intl":
    "Type-safe i18n for the App Router — locale routing, message rendering, formatting and static generation. Load when a project imports next-intl.",
  "web-i18n-react-intl":
    "ICU message format internationalization for React — FormattedMessage, useIntl, defineMessages, and the FormatJS extraction workflow. Load when a project imports react-intl.",
  "web-i18n-vue-i18n":
    "Type-safe i18n for Vue 3 Composition API — useI18n, pipe-syntax plurals, i18n-t/d/n components, lazy-loaded locales. Load when a project imports vue-i18n.",
  "web-maps-leaflet":
    "Leaflet interactive maps. Use when building a 2D map with tile layers, markers, popups, GeoJSON, layer control, custom controls or marker clustering.",
  "web-maps-mapbox":
    "Mapbox GL JS interactive vector maps. Use when building a map with sources and layers, expressions, clustering, 3D terrain, geocoding or directions.",
  "web-meta-framework-astro":
    "Astro content-first framework - islands architecture, content collections, file-based routing, SSR/SSG hybrid rendering, View Transitions, server islands, multi-framework component support",
  "web-meta-framework-docusaurus":
    "Docusaurus 3.x documentation framework — site configuration, docs/blog plugins, sidebars, versioning, MDX, swizzling, and deployment",
  "web-meta-framework-nextjs":
    "Next.js App Router patterns (15-16) - file-based routing, Server/Client Components, streaming, Suspense, metadata API, parallel routes, Server Actions, mutations, revalidation, Cache Components",
  "web-meta-framework-nuxt":
    "Nuxt patterns - file-based routing, data fetching (useFetch/useAsyncData), useState, server routes, middleware, auto-imports, layouts, SEO",
  "web-meta-framework-qwik":
    "Qwik resumable framework - zero hydration, $ lazy boundaries, signals, Qwik City file-based routing, routeLoader$, routeAction$, server$ RPC, serialization rules",
  "web-meta-framework-remix":
    "File-based routing, loaders, actions, defer streaming, useFetcher, error boundaries, progressive enhancement",
  "web-meta-framework-sveltekit":
    "SvelteKit full-stack framework - file-based routing, load functions, form actions, server hooks, SSR/SSG, API routes, streaming, progressive enhancement",
  "web-meta-framework-vitepress":
    "VitePress 1.x — Vue-powered static site generator for documentation sites, built on Vite",
  "web-mocks-msw":
    "MSW handlers, browser/server workers, test data. Use when setting up API mocking for development or testing, creating mock handlers with variants, or sharing mocks between browser and Node environments.",
  "web-performance-web-performance": "Bundle optimization, render performance, Core Web Vitals",
  "web-pwa-offline-first": "Local-first architecture with sync queues",
  "web-pwa-service-workers":
    "Service Worker lifecycle, caching strategies, offline patterns, update handling, precaching, runtime caching",
  "web-realtime-socket-io":
    "Socket.IO v4.x client patterns, connection lifecycle, reconnection, authentication, rooms, namespaces, acknowledgments, binary data, TypeScript integration",
  "web-realtime-sse":
    "Server-Sent Events for unidirectional server-to-client streaming, EventSource API, fetch streaming, reconnection patterns, message parsing",
  "web-realtime-websockets":
    "Native WebSocket API patterns, connection lifecycle, reconnection strategies, heartbeat, message typing, binary data, custom hooks",
  "web-routing-react-router":
    "Client-side routing with data APIs — loaders, actions, error boundaries, search params, nested layouts, and code splitting",
  "web-routing-tanstack-router":
    "Type-safe client-side routing for React with file-based routes, search params validation, loaders, and code splitting",
  "web-server-state-react-query":
    "React Query server state — query keys and query options, caching policy, error handling, and typed clients generated from an API schema",
  "web-state-jotai": "Atomic state management with auto-dependency tracking",
  "web-state-mobx":
    "MobX observable state management patterns with mobx-react-lite. Use when implementing reactive client state with observables, computed values, actions, and the observer HOC.",
  "web-state-ngrx-signalstore":
    "NgRx SignalStore patterns for Angular state management. Use when managing client state with Angular Signals, composing store features, handling entities, or integrating RxJS effects.",
  "web-state-pinia":
    "Pinia stores, Vue 3 state patterns. Use when managing client state in Vue applications, choosing between Options/Setup stores, composing stores, or implementing persistence.",
  "web-state-redux-toolkit":
    "Redux Toolkit patterns for complex client state. Use when managing enterprise-scale state, needing DevTools, entity normalization, or RTK Query for data fetching.",
  "web-state-zustand":
    "Zustand stores, client state patterns. Use when deciding between Zustand vs useState, managing global state, or avoiding Context misuse.",
  "web-styling-cva":
    "Class Variance Authority - type-safe component variant styling with cva(), compound variants, and VariantProps",
  "web-styling-design-tokens":
    "Design token architecture - primitive/semantic/component tiers, naming grammar, CSS custom property delivery, and DTCG build pipelines",
  "web-styling-scss-modules":
    "SCSS Modules - locally scoped component stylesheets, cascade layers, the Sass module system, mixins, and build-time versus runtime values",
  "web-styling-tailwind":
    "Tailwind CSS v4 - utility-first CSS framework with CSS-first configuration",
  "web-styling-theming": "Runtime theming - applying a theme system to a live app without flash",
  "web-testing-cypress-e2e":
    "Cypress E2E testing patterns - test structure, data-cy selectors, cy.intercept() mocking, custom commands, fixtures, component testing, accessibility testing with cypress-axe, and CI/CD integration",
  "web-testing-playwright-e2e":
    "Playwright E2E testing patterns - test structure, Page Object Model, locator strategies, assertions, network mocking, visual regression, parallel execution, fixtures, and configuration",
  "web-testing-react-testing-library":
    "React Testing Library — query hierarchy, userEvent, async utilities, renderHook, custom render with providers. Load when writing or reviewing tests that render React components or hooks.",
  "web-testing-visual-regression":
    "Visual regression testing — screenshot baselines, determinism, diff review, baseline custody and CI wiring. Load when adding, reviewing or debugging tests that compare a rendered subject against an approved image.",
  "web-testing-vitest":
    "Vitest test runner - configuration, assertions, mocking (vi.fn, vi.mock, vi.spyOn), fake timers, snapshot testing, coverage, workspace projects",
  "web-testing-vue-test-utils":
    "Vue Test Utils — mount vs shallowMount, the wrapper API, awaiting DOM updates, flushPromises, testing composables, and the global mounting options. Load when writing or reviewing tests that mount Vue components.",
  "web-tooling-component-library":
    'Packaging React components as a consumable library — style delivery contracts, sideEffects, cascade layers, "use client" preservation, peer dependency ranges, server-safe vs client entries',
  "web-tooling-storybook":
    "Storybook patterns - CSF 3.0, args, controls, autodocs, play functions, interaction testing, visual testing, addons configuration",
  "web-tooling-vite":
    "Vite config, path aliases, vendor chunk splitting, environment-specific builds, Rolldown codeSplitting, Sass modern API, build targets, module preload",
  "web-ui-ant-design": "Ant Design enterprise UI library for React",
  "web-ui-base-ui": "Unstyled accessible React component primitives",
  "web-ui-chakra-ui": "Accessible React component library with style props and theming",
  "web-ui-headless-ui": "Unstyled accessible UI components by Tailwind Labs",
  "web-ui-mantine": "Mantine v7 component library — theming, styling, hooks, forms, notifications",
  "web-ui-mui": "Material UI component library patterns for React",
  "web-ui-radix-ui": "Unstyled accessible UI primitives",
  "web-ui-shadcn-ui": "shadcn/ui component library patterns, CLI usage, theming, customization",
  "web-ui-tanstack-table":
    "TanStack Table v8 patterns - useReactTable, column definitions, sorting, filtering, pagination, row selection, virtual scrolling, server-side data",
  "web-ui-vuetify": "Material Design component library for Vue 3",
  "web-utilities-date-fns":
    "date-fns patterns for TypeScript - formatting, parsing, manipulation, comparison, timezone handling, and internationalization",
  "web-utilities-native-js":
    "Modern native JavaScript (ES2022-ES2025) utility patterns that replace lodash",
  "web-utilities-rxjs":
    "Reactive programming with RxJS - Observables, operators, Subjects, error handling, and memory leak prevention",
  "web-utilities-vueuse":
    "VueUse composable utility collection for Vue 3 - browser, sensor, network, state, animation, and component utilities",
};
