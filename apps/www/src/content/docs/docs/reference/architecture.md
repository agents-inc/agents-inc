---
title: Architecture
description: How the CLI is put together — technology stack, project structure, the data flow from command to compiled agent, and the conventions the codebase follows.
sidebar:
  order: 2
---

A rough overview of the Agents Inc. CLI codebase. For granular implementation details, see the verified documentation in [`.ai-docs/`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/.ai-docs/DOCUMENTATION_MAP.md).

---

## Overview

Agents Inc. CLI (`agents-inc`) is a TypeScript CLI that manages AI agent configurations for Claude Code. It loads skill definitions from a marketplace, lets users select technology stacks via an interactive terminal wizard, compiles agent prompts from Liquid templates with selected skills injected, and installs the results as Claude plugins or local files.

## Technology Stack

| Layer             | Library              | Purpose                                   |
| ----------------- | -------------------- | ----------------------------------------- |
| CLI Framework     | oclif                | Command parsing, flags, plugins, hooks    |
| Terminal UI       | Ink + React          | Interactive wizard, terminal rendering    |
| State Management  | Zustand              | Wizard step state and selections          |
| Schema Validation | Zod                  | Runtime validation at parse boundaries    |
| Template Engine   | LiquidJS             | Agent prompt compilation from partials    |
| Config Loader     | jiti                 | TypeScript config files loaded at runtime |
| YAML              | yaml                 | Metadata and matrix parsing               |
| Utilities         | Remeda               | Functional array/object transformations   |
| File System       | fs-extra + fast-glob | File operations and globbing              |
| Testing           | Vitest               | Unit, integration, command, and E2E tests |

## Project Structure

Paths below are relative to [`packages/cli/`](https://github.com/agents-inc/agents-inc/tree/main/packages/cli) in the repository.

```
src/
  agents/               # Agent source partials (YAML + markdown per agent)
  cli/
    commands/            # oclif command classes (build, import, new, + top-level)
    components/          # Ink React components
      common/            #   Shared UI (confirm, spinner, select-list)
      hooks/             #   React hooks for wizard behavior
      wizard/            #   Multi-step wizard components
    hooks/
      init.ts            #   oclif init hook (source resolution, dashboard)
    lib/                 # Core business logic (no UI)
      agents/            #   Agent fetching, compilation, recompilation
      configuration/     #   Config loading, merging, generation
      installation/      #   Install mode detection, local installer, scope-aware config splitting
      loading/           #   Source fetching, matrix loading, install-mode tagging
      matrix/            #   Matrix provider (skill lookups), relationship resolution
      plugins/           #   Plugin discovery, validation, manifest, versioning
      skills/            #   Skill fetching, copying, metadata, local-copy moves
      stacks/            #   Stack loading, resolution, compilation
      wizard/            #   Build step logic (pure functions, no UI)
      compiler.ts        #   Liquid template engine for agent compilation
      schemas.ts         #   All Zod schemas (30+)
      exit-codes.ts      #   Named exit code constants
    stores/
      wizard-store.ts    #   Zustand store for wizard state + actions
    types/               # TypeScript type definitions (agents, config, matrix, plugins, skills, stacks)
      generated/         #   Auto-generated union types and built-in matrix from skills source
    utils/               # Cross-cutting utilities (errors, exec, fs, logger, type-guards)
e2e/                     # End-to-end tests (commands, interactive, lifecycle, integration, smoke)
```

## Core Data Flow

```
1. User runs command (e.g., `agents-inc init`)

2. oclif init hook runs
   -> Extracts --marketplace from raw argv (for `init`, the one command that has it)
   -> resolveSource() determines skills source
   -> Attaches ResolvedConfig to oclif config object

3. Command loads skills matrix
   -> loadSkillsMatrixFromSource() fetches categories, rules, skills
   -> Returns SourceLoadResult (merged matrix + source config)

4. Wizard renders (Ink/React)
   -> Zustand store manages step-by-step state
   -> Steps: stack -> skills -> sources -> agents -> confirm
   -> Returns WizardResultV2 (selected skills, agent configs, scope settings)

5. Installation
   -> installPluginConfig()
   -> Copies skills to project, generates TypeScript config
   -> config-gate::writeScopedFromWizard() splits config into global + project scopes,
      fans the global change out to registered projects and recompiles their agents

6. Compilation
   -> Reads agent partials (intro.md, workflow.md, etc.)
   -> Builds template context from selected skills
   -> Sanitizes to prevent Liquid injection
   -> LiquidJS renders agent.liquid template
   -> Output: .claude/agents/{name}.md
```

## Key Architectural Patterns

- **BaseCommand**: All commands extend `BaseCommand`, which provides the `sourceConfig` getter (populated by the init hook), the terminal-size gate and error handling with named `EXIT_CODES`. It declares no flags — `--marketplace` belongs to `init` alone.

- **Init hook**: Runs before every command. Resolves the skills source and attaches config to oclif's config object. When no command is given and a project is already initialized, shows a dashboard.

- **Marketplace resolution precedence**: `--marketplace` flag > `CC_MARKETPLACE` env var > `.claude-src/config.ts` (project) > `~/.claude-src/config.ts` (global) > the default marketplace. The first two rungs are install-time only: `init` declares the flag and is the only caller `CC_MARKETPLACE` is read for, so every later command starts at the project config.

- **Install modes**: Skills can be installed as **Claude plugins** (managed by Claude's plugin system) or **locally** (copied to `.claude/skills/`). Agents are always written to `.claude/agents/`. Config is always at `.claude-src/config.ts`.

- **Liquid template compilation**: Agent prompts are compiled from partials using LiquidJS. Template root resolution checks project-level overrides first, then built-in templates.

- **Zod at boundaries**: All YAML/JSON parsing uses Zod schemas from `schemas.ts`. Lenient schemas (`.passthrough()`) at loading boundaries, strict schemas for validation. Bridge pattern (`z.ZodType<ExistingType>`) ensures runtime matches compile-time types.

- **Multi-source system**: Skills can come from multiple sources (public marketplace, private repos, local files). Each `ResolvedSkill` tracks all available sources and which is active. Users can mix public skills with private alternatives per-skill via the wizard's Sources step.

- **Generated types**: Union types (`SkillId`, `Domain`, `Category`, `AgentName`, etc.) are auto-generated from the skills source into `types/generated/`. Runtime type guards validate strings against these unions.

## Configuration

Source resolution follows a 5-tier precedence (flag > env > project > global > default). Project config is TypeScript loaded via jiti:

```typescript
// .claude-src/config.ts
import type { ProjectConfig } from "./config-types"

export default {
  skills: [
    { id: "web-framework-react", scope: "project" },
    { id: "web-styling-tailwind", scope: "global" },
  ],
  agents: [{ name: "web-developer", scope: "project", model: "sonnet" }],
} satisfies ProjectConfig
```

This is the shape the CLI writes, and `config-writer.test.ts` asserts it never writes any other. The
import is type-only, so it disappears at compile time and the config resolves without this package
being reachable at all — which is why it is the form to copy.

| Install Mode | Skills Location     | Agents Location   | Config                  |
| ------------ | ------------------- | ----------------- | ----------------------- |
| local        | `.claude/skills/`   | `.claude/agents/` | `.claude-src/config.ts` |
| plugin       | Claude plugin cache | `.claude/agents/` | `.claude-src/config.ts` |

## Agent Compilation

Agent prompts are assembled from partials (YAML frontmatter + markdown sections like `intro.md`, `workflow.md`, `skills.md`). The compiler reads agent definitions, builds a template context with all selected skills injected, sanitizes user-controlled fields to prevent Liquid injection (`{{`, `{%` stripped), and renders through LiquidJS. Output is one markdown file per agent in `.claude/agents/`.

## Test Infrastructure

| Layer       | Config Project         | Scope                                           |
| ----------- | ---------------------- | ----------------------------------------------- |
| Unit        | `unit`                 | Pure functions, isolated logic with mocked deps |
| Integration | `integration`          | Cross-module interactions, real file system     |
| Commands    | `commands`             | oclif command execution via `runCommand()`      |
| E2E         | `e2e/vitest.config.ts` | Full CLI flows with real terminal interaction   |

E2E tests cover 5 categories: commands, interactive wizards, lifecycle flows, integration scenarios, and smoke tests. Test data uses factories from `__tests__/factories/` and `__tests__/helpers/` and canonical fixtures from `__tests__/mock-data/`.

## Conventions

- **Strict TypeScript** with zero-`any` policy. No `@ts-ignore` without justification.
- **Named exports only** (no default exports). `.js` extensions on relative imports.
- **kebab-case** for all files and directories.
- **Zod at parse boundaries** for all external data (YAML, JSON, CLI args).
- **Remeda over imperative loops** for data transformations.
- **Domain-driven modules** in `lib/` with barrel `index.ts` exports.
- **Named constants** for exit codes, paths, colors, symbols, file size limits (no magic numbers).
- **Type guards** (`isCategory()`, `isDomain()`, etc.) instead of `as` casts for runtime narrowing.
