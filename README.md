<p align="center">
  <img alt="Agents Inc" src="./assets/logo.svg" width="300">
</p>

# Agents Inc

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

An agent composition framework for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Compose specialized subagents from atomic skills:

1. Select a pre-built stack to customise or start from scratch
2. Select your skills from an interactive grid, organized by domain with compatibility filtering and global/local customising
3. Choose to eject these skills or install them as plugins ([install modes guide](docs/guides/install-modes.md))
4. Select your subagents to compile with these skills
5. Further customise skills and subagents in the generated `config.ts` ([editing config guide](docs/guides/editing-config.md))
6. Compile subagents with `npx @agents-inc/cli compile` after changes

See the [Guides](#guides) section below for more.

<br />

<p align="center">
  <video src="./assets/demo.mp4" width="700" controls muted loop playsinline>
    Your browser doesn't support embedded video — <a href="./assets/demo.mp4">watch demo.mp4</a>.
  </video>
</p>

## Getting Started

```bash
npx @agents-inc/cli init
```

| Stack                        | Technologies                                                 |
| ---------------------------- | ------------------------------------------------------------ |
| `nextjs-fullstack`           | Next.js + React + Hono + Drizzle + Better Auth + Zustand     |
| `nextjs-t3-stack`            | Next.js + tRPC + Prisma + NextAuth + Tailwind                |
| `nextjs-supabase-fullstack`  | Next.js + Supabase + Drizzle + Better Auth                   |
| `nextjs-turborepo-fullstack` | Next.js + Turborepo + pnpm Workspaces + Hono + Drizzle       |
| `nextjs-ai-saas`             | Next.js + Vercel AI + Anthropic + Drizzle + Pinecone         |
| `nextjs-saas-starter`        | Next.js + Better Auth + Stripe + Drizzle + Resend + PostHog  |
| `react-old-school`           | React + Redux Toolkit + SCSS Modules + Vite + Vitest         |
| `react-hono-fullstack`       | React + Vite + Hono + Drizzle + Better Auth                  |
| `remix-fullstack`            | Remix + Hono + Drizzle + Better Auth                         |
| `sveltekit-fullstack`        | SvelteKit + Hono + Drizzle + Better Auth                     |
| `solidjs-fullstack`          | SolidJS + Hono + Drizzle + Better Auth + Vitest              |
| `astro-content-fullstack`    | Astro + Hono + Drizzle                                       |
| `vue-modern-fullstack`       | Vue 3 + Pinia + Hono + Drizzle + Better Auth                 |
| `nuxt-fullstack`             | Nuxt + Hono + Drizzle + Better Auth                          |
| `angular-modern-fullstack`   | Angular + NgRx + Hono + Drizzle + Better Auth                |
| `expo-mobile-fullstack`      | Expo + React Native + Zustand + React Query + Hono + Drizzle |
| `cli-ink-oclif`              | oclif + Ink + Zustand + Vitest                               |

## Guides

| Guide                                                                       | Description                                                          |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [Global-first setup](docs/guides/global-first-setup.md)                     | Why global scope is the right default and when to use project scope  |
| [Install modes](docs/guides/install-modes.md)                               | Plugin vs local install, global vs project scope                     |
| [Editing your config](docs/guides/editing-config.md)                        | Skill mappings, preloaded vs dynamic loading, and config structure   |
| [Customizing subagents](docs/guides/customizing-subagents.md)               | Eject and modify partials, templates, and skills                     |
| [Writing custom skills and subagents](docs/guides/writing-custom-skills.md) | Author skills and subagents from scratch or iterate on existing ones |
| [Importing third-party skills](docs/guides/importing-skills.md)             | Install skills from external repositories                            |
| [Creating a marketplace](docs/guides/creating-a-marketplace.md)             | Build a personal or org-level marketplace with curated skills        |
| [Using the codex-keeper subagent](docs/guides/using-codex-keeper.md)        | Generate and maintain AI-focused reference documentation             |

## Skills

150+ skills across 8 domains:

**Web:** React, Vue, Angular, Svelte, SolidJS, Next.js, Remix, Nuxt, SvelteKit, Astro, Qwik, Tailwind, SCSS Modules, Zustand, Redux, Pinia, Vitest, Playwright, Storybook, and more
**API:** Hono, Express, Fastify, NestJS, Elysia, Drizzle, Prisma, PostgreSQL, MongoDB, Redis, Stripe, and more
**AI:** Anthropic SDK, OpenAI SDK, Vercel AI SDK, LangChain, LlamaIndex, Pinecone, ChromaDB, and more
**Mobile:** React Native, Expo
**CLI:** Commander, oclif + Ink
**Infra:** Docker, GitHub Actions, Cloudflare Workers
**Shared:** Turborepo, ESLint + Prettier, Code Reviewing, Auth Security, and more
**Meta:** Research Methodology, CLI Reviewing

Browse the full catalog on the [Plugin Marketplace](https://github.com/agents-inc/skills).

## Subagents

| Category         | Subagents                                                          |
| ---------------- | ------------------------------------------------------------------ |
| Developers       | `web-developer` `api-developer` `cli-developer` `web-architecture` |
| Reviewers        | `web-reviewer` `api-reviewer` `cli-reviewer`                       |
| Testers          | `web-tester` `cli-tester`                                          |
| Researchers      | `web-researcher` `api-researcher`                                  |
| Planning         | `web-pm`                                                           |
| Pattern Analysis | `pattern-scout` `web-pattern-critique`                             |
| Documentation    | `codex-keeper`                                                     |
| Meta             | `skill-summoner` `agent-summoner` `convention-keeper`              |

Each subagent is composed from modular partials (role, workflow, output format) plus its assigned skills. Everything is ejectable.

## Commands

### Core

| Command   | Description                                                                 |
| --------- | --------------------------------------------------------------------------- |
| `init`    | Interactive setup wizard: pick a stack, customize skills, compile subagents |
| `edit`    | Modify skill selection via the interactive wizard                           |
| `compile` | Recompile subagents after changes                                           |
| `update`  | Pull latest skills from source                                              |
| `search`  | Search skills across all sources                                            |

### Customization

| Command           | Description                                                                         |
| ----------------- | ----------------------------------------------------------------------------------- |
| `eject <type>`    | Export for customization (`agent-partials`, `templates`, `skills`, `all`)           |
| `import skill`    | Import a skill from an external GitHub repository                                   |
| `new skill`       | (FEATURE-GATED: `NEW_SKILL_COMMAND=false`) Scaffold a new local skill               |
| `new agent`       | (FEATURE-GATED: `NEW_AGENT_COMMAND=false`) Scaffold a new custom subagent           |
| `new marketplace` | (FEATURE-GATED: `NEW_MARKETPLACE_COMMAND=false`) Scaffold a new marketplace project |

### Build

| Command             | Description                                    |
| ------------------- | ---------------------------------------------- |
| `build marketplace` | Generate `marketplace.json` from source skills |
| `build plugins`     | Build skill and agent plugins for distribution |

### Diagnostics

| Command     | Description                         |
| ----------- | ----------------------------------- |
| `doctor`    | Diagnose setup issues               |
| `list`      | Show installed skills and agents    |
| `validate`  | Validate config and skill structure |
| `uninstall` | Remove Agents Inc from your project |

Run `@agents-inc/cli --help` for full usage, or see the [full commands reference](./docs/reference/commands.md).

## Links

- [Plugin Marketplace](https://github.com/agents-inc/skills): browse and discover skills
- [Architecture Reference](./docs/reference/architecture.md): full system documentation

## License

MIT
