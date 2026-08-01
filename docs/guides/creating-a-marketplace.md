# Creating a Marketplace

Build a personal or org-level marketplace with skills curated for your conventions.

## Getting Started

```bash
agents-inc new marketplace
```

Scaffolds a marketplace repository with the required structure and metadata.

## Workflow

1. Start with existing skills from the public marketplace or write your own
2. Iterate on skills using the `skill-summoner` subagent to align them with your project conventions
3. Build the marketplace index:

```bash
agents-inc build marketplace
```

This generates `marketplace.json`, the index that the CLI reads when installing from your marketplace.

4. Point projects at your marketplace by adding it as a custom source during `agents-inc init` or `agents-inc edit`

## Distribution

Marketplaces are Git repositories. Share them by giving your team access to the repo. Skills and stacks can also be packaged as Claude Code plugins:

```bash
agents-inc build plugins    # Package individual skills and agents
```
