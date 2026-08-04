# Using the codex-keeper

`codex-keeper` creates AI-focused documentation for your codebase, structured for navigation by subagents.

## What it produces

`codex-keeper` writes to `.ai-docs/` and updates your project's `CLAUDE.md` with a `## Generated Documentation` section so other subagents know where to find the docs.

| Output                          | Purpose                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `.ai-docs/DOCUMENTATION_MAP.md` | Coverage index with staleness tracking and priority queue |
| `.ai-docs/reference/*.md`       | Architecture, type system, store maps, etc.               |

For complex codebases it generates a `features/` subfolder with docs by feature. Once they exist, you and your subagents can reference them by name:

```
@web-developer see X feature documentation to understand how X works, then implement Y
```

## Setting up a documentation repository

The recommended setup keeps `.ai-docs/` as a standalone repo symlinked into your project. This lets you version documentation independently, share it across team members, and separate doc history from code history.

## Keeping docs fresh

Docs drift quickly. Run `codex-keeper` weekly to catch areas that have changed.

## Modes

**New documentation**: Creates docs for undocumented areas. Start here for a fresh codebase.

```
@codex-keeper initialize documentation for this codebase
```

**Update**: Refreshes all or specific docs

```
@codex-keeper update any docs that are stale
```

```
@codex-keeper the batch processing feature changed significantly, update its docs
```
