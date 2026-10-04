---
title: Architecture
description: How the CLI is put together — technology stack, project structure, the data flow from command to compiled agent, and the conventions the codebase follows.
sidebar:
  order: 2
---

A rough overview of the Agents Inc. CLI codebase. For granular implementation details, see the verified documentation in [`.ai-docs/`](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/.ai-docs/DOCUMENTATION_MAP.md).

---

## Overview

Agents Inc. CLI (`agents-inc`) is a TypeScript CLI that manages AI agent configurations for Claude Code — and for OpenAI Codex, which is not in a release yet. It loads skill definitions from a marketplace, lets users select technology stacks via an interactive terminal wizard, compiles agent prompts from Liquid templates with selected skills injected, and installs the results as Claude plugins or local files.

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
    commands/            # oclif command classes (build, new, + top-level)
    components/          # Ink React components
      common/            #   Shared UI (confirm, spinner, select-list)
      hooks/             #   React hooks for wizard behavior
      wizard/            #   Multi-step wizard components
    hooks/
      init.ts            #   oclif init hook (the dashboard, when no command is given)
    lib/                 # Core business logic (no UI)
      agents/            #   Agent fetching, compilation, recompilation
      config-gate/       #   Writes config by scope, fans a global change out to registered projects
      configuration/     #   Config loading, merging, generation
      hosts/             #   Claude Code and Codex behind one plugin-host contract (not in a release yet)
      installation/      #   Install mode detection, local installer, scope-aware config splitting
      loading/           #   Source fetching, matrix loading, install-mode tagging
      matrix/            #   Matrix provider (skill lookups), relationship resolution
      plugins/           #   Plugin discovery, validation, manifest, versioning
      skills/            #   Skill fetching, copying, metadata, local-copy moves
      stacks/            #   Stack loading, resolution, compilation
      wizard/            #   Build step logic (pure functions, no UI)
      compiler.ts        #   Liquid template engine for agent compilation
      schemas.ts         #   The Zod schemas every parse boundary uses
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
   -> the oclif init hook acts only when no command is given: it shows the dashboard

2. Command loads skills matrix
   -> loadSkillsMatrixFromSource() first calls resolveSource(), which picks the marketplace
      (`init`'s --marketplace flag > CC_MARKETPLACE for `init` > project config > global config > default)
   -> fetches categories, rules, skills
   -> Returns SourceLoadResult (merged matrix + resolved source config)

3. Wizard renders (Ink/React)
   -> Zustand store manages step-by-step state
   -> Steps: stack -> domains -> build -> sources -> agents -> confirm
   -> Returns WizardResultV2 (selected skills, agent configs, scope settings)

4. Installation
   -> Installs plugin skills, copies ejected ones
   -> writeProjectConfig() generates the TypeScript config
   -> config-gate's writeScopedFromWizard() splits it into global + project scopes,
      fans the global change out to registered projects and recompiles their agents

5. Compilation
   -> Reads agent partials (identity.md, playbook.md, output.md, etc.)
   -> Builds template context from selected skills
   -> Sanitizes to prevent Liquid injection
   -> LiquidJS renders agent.liquid template
   -> Output: .claude/agents/{name}.md
```

## Key Architectural Patterns

- **BaseCommand**: All commands extend `BaseCommand`, which provides the terminal-size gate (`ensureTerminalSize`), error handling with named `EXIT_CODES` (`handleError`) and the reporting helpers commands share. It declares no flags — `--marketplace` belongs to `init` alone.

- **Init hook**: Runs before every command and does one thing: when no command is given and a project is already initialized, it shows a dashboard. Each command resolves its own marketplace when it loads skills.

- **Marketplace resolution precedence**: `--marketplace` flag > `CC_MARKETPLACE` env var > the project's `config.ts` > the global `config.ts` > the default marketplace. The first two rungs are install-time only: `init` declares the flag and is the only caller `CC_MARKETPLACE` is read for, so every later command starts at the project config.

- **Install modes**: Skills can be installed as **Claude plugins** (managed by Claude's plugin system) or **locally** (copied to `.claude/skills/`). On Claude Code, agents are written to `.claude/agents/`. Config is at `.agents-inc/claude/config.ts`.

- **Liquid template compilation**: Agent prompts are compiled from partials using LiquidJS. Template root resolution checks project-level overrides first, then built-in templates.

- **Zod at boundaries**: YAML and JSON are parsed through Zod schemas — the CLI's in `schemas.ts`, the share payload's in `@workspace/matrix`. Lenient schemas (`.passthrough()`) at loading boundaries, strict schemas for validation. Bridge pattern (`z.ZodType<ExistingType>`) ensures runtime matches compile-time types.

- **One marketplace per installation**: An installation reads the one marketplace its config names, public or private, and the local skills already on disk are merged into that catalogue when it loads. The wizard's Sources step chooses each skill's install mode, not its marketplace.

- **Generated types**: Union types (`SkillId`, `Domain`, `Category`, `AgentName`, etc.) are auto-generated from the skills source into `types/generated/`. Runtime type guards validate strings against these unions.

## Configuration

Source resolution follows a 5-tier precedence (flag > env > project > global > default). Project config is TypeScript loaded via jiti; [The shape of `config.ts`](/docs/configuration#the-shape-of-configts) shows the file the CLI writes. Its one import is type-only, from the generated `./config-types` beside it, so it disappears at load time and the config resolves without this package being reachable at all.

| Install Mode | Skills Location     | Agents Location   | Config                         |
| ------------ | ------------------- | ----------------- | ------------------------------ |
| local        | `.claude/skills/`   | `.claude/agents/` | `.agents-inc/claude/config.ts` |
| plugin       | Claude plugin cache | `.claude/agents/` | `.agents-inc/claude/config.ts` |

## Agent Compilation

Agent prompts are assembled from partials — a `metadata.yaml` carrying the frontmatter, plus the markdown sections `identity.md`, `playbook.md`, `critical-requirements.md`, `critical-reminders.md` and `output.md`. The compiler reads agent definitions, builds a template context with all selected skills injected, sanitizes user-controlled fields to prevent Liquid injection (`{{`, `{%` stripped), and renders through LiquidJS. On Claude Code, output is one markdown file per agent in `.claude/agents/`.

The same pass writes each agent's completion gate into that frontmatter: the product's built-in typecheck gate, for every agent that can write files and whose definition declares no `Stop` hook of its own.

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
