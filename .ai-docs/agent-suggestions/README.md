---
last_validated: 2026-04-21
---

# Agent Suggestions

Forward-looking proposals raised by sub-agents (or the orchestrator) that MAY or MAY NOT land. Distinct from `agent-findings/` — a finding documents an anti-pattern or gap already observed in the code/docs; a suggestion proposes a new pattern, restructure, or standard whose adoption is still a judgment call.

## Purpose

- Capture "we could do X" before the design has been decided.
- Preserve the proposal author's reasoning even if the idea is later rejected, deferred, or only informally absorbed.
- Keep a discoverable paper trail for ideas that bleed into standards without a single landing commit.

## Lifecycle

```
Proposer drafts → status: proposal → review → status: <terminal> + resolution_date + resolution_note
```

Frontmatter IS the status. A suggestion is resolved iff its frontmatter contains a terminal `status:` plus `resolution_date` + `resolution_note`. Without those, it is still open — regardless of directory location.

- **Never move files** to mark resolution. Edit frontmatter in place. Cross-links from standards docs, commit messages, and other findings/suggestions reference files by filename.
- **Filter by frontmatter, not directory.** Consumers distinguish open from resolved by reading `status:`.

## Status Enum

| Status                | Meaning                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `proposal`            | Drafted, awaiting review. Initial state.                                                                                                   |
| `approved`            | Accepted for implementation; work not yet started.                                                                                         |
| `in-progress`         | Being worked on. Paired with pointer to tracking issue / TODO / branch where useful.                                                       |
| `mostly-completed`    | Majority of the proposal landed; a named residual remains. Resolution note MUST enumerate what's left.                                     |
| `absorbed-informally` | Core idea is present in the codebase/standards but not as the explicit named section/pattern the proposal described. Note MUST cite where. |
| `absorbed`            | Fully landed as proposed (or a clean superset). Note cites the authoritative doc/section/commit.                                           |
| `rejected`            | Deliberately not adopted. Note MUST explain why (so the proposal doesn't get re-raised by a different agent).                              |
| `superseded`          | Replaced by a newer suggestion/finding. Pair with `superseded_by: <filename>`.                                                             |

Terminal statuses (require `resolution_date` + `resolution_note`): `absorbed`, `absorbed-informally`, `mostly-completed`, `rejected`, `superseded`.

Non-terminal statuses (no resolution fields): `proposal`, `approved`, `in-progress`.

## Frontmatter Schema

Required on every suggestion:

- `date: YYYY-MM-DD` — date the proposal was drafted.
- `status: <enum>` — see table above.
- `proposer: <agent-type>` — which agent (or `orchestrator`) drafted it.

Required when `status` is terminal:

- `resolution_date: YYYY-MM-DD`
- `resolution_note: |` — multi-line block explaining mechanism of resolution (cite doc section, commit, superseding file, or reason for rejection). For `mostly-completed` / `absorbed-informally`, MUST enumerate residuals.

Optional:

- `affected_files:` / `standards_docs:` — same semantics as findings.
- `supersedes: <filename>` / `superseded_by: <filename>` — cross-link lineage.
- `category:` / `domain:` — same enums as findings when applicable.

## File Naming

`YYYY-MM-DD-<slug>.md` — same convention as `agent-findings/`. Kebab-case slug; API identifiers MAY retain original casing (see `agent-findings/README.md` rationale).

- Acceptable: `2026-04-13-documentation-restructure-proposal.md`, `2026-03-25-declarative-programming-no-context-required.md`
- Not acceptable: `2026-04-13-Some-Proposal.md`

## Template

See `TEMPLATE.md`.
