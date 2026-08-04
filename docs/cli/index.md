# Agents Inc. CLI Documentation

> **AI Documentation:** For AI-consumed reference and standards docs, see [`.ai-docs/DOCUMENTATION_MAP.md`](../../packages/cli/.ai-docs/DOCUMENTATION_MAP.md).

## Documentation Index

### Reference

System documentation for understanding the codebase.

| Document                                       | Content                                              |
| ---------------------------------------------- | ---------------------------------------------------- |
| [architecture.md](./reference/architecture.md) | System architecture, data flow, module relationships |
| [commands.md](./reference/commands.md)         | CLI command reference with options and examples      |

### Guides

How-to documentation for common tasks.

| Document                                                        | Content                                   |
| --------------------------------------------------------------- | ----------------------------------------- |
| [creating-a-marketplace.md](./guides/creating-a-marketplace.md) | Manual and automated marketplace creation |

### Features

Feature development documentation organized by lifecycle stage.

#### Proposed (Research Only)

| Document                                                 | Content                                                 |
| -------------------------------------------------------- | ------------------------------------------------------- |
| [skill-consume.md](./features/proposed/skill-consume.md) | AI-assisted skill merging (`agents-inc consume`) design |

## Task Tracking

Tracking moved to the repository-root `todo/` folder on 2026-08-04. Active, deferred and refactoring
work now share one file per workspace, and an item is deleted when it lands rather than ticked off.

| Document                            | Content                                               |
| ----------------------------------- | ----------------------------------------------------- |
| [cli.md](../../todo/cli.md)         | Everything outstanding in `packages/cli`              |
| [repo.md](../../todo/repo.md)       | The repository itself — deploying, naming, publishing |
| [archive.md](../../todo/archive.md) | One line per item that has landed                     |
| [plans/](../../todo/plans/)         | The per-item plan files the trackers link to          |

## Quick Reference

### Installation Modes

1. **Plugin Mode** - Native Claude plugins via `claude plugin install`
2. **Eject Mode** - Copies to `.claude/skills/` and `.claude/agents/` for full customization

### Key Commands

```bash
# Initialize in a project
npx agents-inc init --source /path/to/marketplace

# Build stack for distribution
npx agents-inc build stack --stack nextjs-fullstack

# Generate marketplace.json
npx agents-inc build marketplace --plugins-dir dist/stacks

# Install via Claude CLI
claude plugin marketplace add /path/to/dist
claude plugin install stackname --scope project
```

### Three Main Use Cases

1. **End User** - Install pre-built stacks via plugin mode
2. **Team/Enterprise** - Create private marketplace, install via plugin or eject mode
3. **Contributor** - Eject templates, create custom skills/agents/stacks
