# CLI — contributor documentation

This folder holds material for people working **on** the CLI. Documentation for people **using** it
lives on the documentation site — source of truth at
[`apps/www/src/content/docs/docs/`](../../apps/www/src/content/docs/docs/), published at
`agentsinc.sh/docs` once the site deploys (repo tracker REPO-04). The user guides and command
reference that used to be duplicated here were retired on 2026-08-06; the site's copies are the only
copies.

> **AI documentation** — reference and standards written for AI agents — is separate again:
> [`packages/cli/.ai-docs/DOCUMENTATION_MAP.md`](../../packages/cli/.ai-docs/DOCUMENTATION_MAP.md).
> Cross-cutting documents that span the CLI and the web apps live in [`docs/repo/`](../repo/).

## What is here

| Document                                                                   | Content                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [guides/agent-reminders.md](./guides/agent-reminders.md)                   | Contributor material on agent reminder blocks — deliberately not on the site    |
| [excluded-skills-design.md](./excluded-skills-design.md)                   | Historical design note, superseded — kept as design history, its header says so |
| [excluded-skills-edge-cases.md](./excluded-skills-edge-cases.md)           | Historical companion to the above                                               |
| [research/auto-version-check.md](./research/auto-version-check.md)         | Research: version-freshness features                                            |
| [research/user-defined-stacks.md](./research/user-defined-stacks.md)       | Research: user-defined stacks in consumer projects                              |
| [features/proposed/skill-consume.md](./features/proposed/skill-consume.md) | Proposed: AI-assisted skill merging (`agents-inc consume`) design               |

## Task tracking

Tracking lives in the repository-root [`todo/`](../../todo/) folder — one file per workspace, and an
item is deleted when it lands rather than ticked off. The CLI's file is
[`todo/cli.md`](../../todo/cli.md).
