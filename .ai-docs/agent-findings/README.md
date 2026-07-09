---
last_validated: 2026-04-21
---

# Standards Feedback Loop

Sub-agents capture anti-pattern findings during refactoring and review work. A `convention-keeper` agent synthesizes them into documentation updates.

## Pipeline

```
Sub-Agent Work → Structured Findings → Convention Keeper → Doc Updates
     (capture)      (accumulate)         (synthesize)        (apply)
```

### Stage 1: Capture

When a sub-agent (cli-developer, cli-tester, cli-reviewer, etc.) fixes an anti-pattern or discovers a gap in documented standards, it writes a finding here.

**Who writes findings:**

- Sub-agents write raw findings during work (they have the full context)
- The orchestrator writes findings when synthesizing across multiple agent results

**When to write a finding:**

- You fixed duplicated code/constants that should have been shared
- You found a missing or weak assertion pattern
- You discovered a convention that isn't documented
- You noticed drift between documented standards and actual practice
- You applied a fix that would benefit from a preventive rule

### Stage 2: Accumulate

Findings pile up in this directory across sessions. Each review/refactor session typically produces 3-8 findings. No processing needed — they're just markdown files.

### Stage 3: Synthesize

Invoke the `convention-keeper` agent to:

1. Read findings (`.md` files in this directory — filter open vs resolved by frontmatter `status:`, NOT by directory)
2. Group by theme (DRY, typescript, testing, complexity)
3. Cross-reference against `.ai-docs/standards/` and `CLAUDE.md`
4. Determine: existing rule violated (enforcement gap) or missing rule (documentation gap)?
5. Propose targeted additions to specific docs
6. Mark processed findings resolved in place (`status: resolved` + `resolved_by:`) — do NOT move files

## Finding Format

See `TEMPLATE.md` for the structure. Each finding is a small markdown file (~15-25 lines) with YAML frontmatter containing: `type` (anti-pattern, standard-gap, convention-drift, audit, missing-standard, architectural-drift), `severity` (high, medium, low), `affected_files`, `standards_docs`, `date`, `reporting_agent` (which sub-agent discovered the issue -- tells us whose instructions may need updating to prevent recurrence), `category` (dry, typescript, testing, complexity, performance, architecture), `domain` (e2e, cli, web, api, shared, infra), and `root_cause` (missing-rule, rule-not-visible, rule-not-specific-enough, convention-undocumented, enforcement-gap, scope-discipline-deferred).

### Resolution Model (authoritative)

Frontmatter IS the status. The `status:` field is an enum with four values:

- **`open`** (default when `status:` is absent) — the finding has not been acted on, or fix work is not yet underway.
- **`partial`** — proposed standard / docs-side landed, but the load-bearing code-side fix has not shipped. Requires a `partial_note:` field describing what's landed vs pending.
- **`resolved`** — the anti-pattern has been fixed or the standard has been fully updated. Requires a `resolved_by:` field (always paired with `status: resolved`).
- **`superseded`** — the finding has been replaced by a newer/authoritative one. Pair with `superseded_by:` pointing to the replacement finding's filename.

Without explicit `status: resolved` or `status: superseded`, the finding is open or partial — regardless of directory location.

- **Never move files** to mark resolution. Resolution is a frontmatter edit on the existing file, at its existing path. Cross-links from standards docs, other findings (`supersedes:` / `superseded_by:`), and commit messages reference findings by filename; moving a file breaks every such link silently.
- **No `done/` subdirectory workflow.** The directory-as-status model was never adopted (as of iter 83, 45 findings use `status: resolved`, 0 were ever moved). `done/` remains available as an OPTIONAL cold archive for very old resolved findings (e.g., >6 months) if volume ever makes the flat directory unwieldy — but using it is never required, and current practice does not use it.
- **Filter by frontmatter, not directory.** Consumers (convention-keeper, dashboards, greps) distinguish open/partial/resolved by reading `status:`, not by path.

### Optional Lifecycle Fields

- `status: partial` + `partial_note: <what's landed vs pending>` — set when the docs-side or standards-side change has landed but the code-side fix has not. Always pair the two fields. Intermediate state between `open` and `resolved`.
- `status: resolved` + `resolved_by: <short note>` — set on a finding once the anti-pattern has been fixed or the standard has been updated. Always pair the two fields. This is the authoritative resolution marker.
- `supersedes: <filename>` / `superseded_by: <filename>` — cross-link duplicate or re-scoped findings. The older/narrower finding gets `superseded_by:`; the authoritative one gets `supersedes:`. Preserves the discovery lineage without deleting context.
- `blocked_by: <filename>` — cross-link to an upstream finding whose unresolved code-side fix prevents this finding from being closed (or prevents the test/repro described in this finding from exercising the path it claims to cover). Use when the finding is `open` or `partial` and a separate tracked finding must resolve first.

`root_cause: scope-discipline-deferred` covers the case where an anti-pattern was consciously left in place to respect task-scope boundaries (distinct from `enforcement-gap`, which implies the rule should have caught it).

## File Naming

Use descriptive kebab-case names with date prefix:

- `2026-03-21-duplicated-skillspath-helper.md`
- `2026-03-21-toequal-vs-tostrictequal.md`
- `2026-03-21-missing-cleanup-in-smoke-tests.md`

**Preserving API identifiers in slugs:** when a slug references a specific exported function, type, or module name from `src/cli/` or `e2e/`, the identifier MAY retain its original casing (camelCase / PascalCase). Everything else must be kebab-case. Rationale: identifier legibility > strict lowercasing.

- Acceptable: `2026-04-21-toBeDefined-vs-toBe-assertion-drift.md`, `2026-04-21-mergeConfigs-mutates-input.md`, `2026-04-21-registerProjectPath-missing-scope-check.md`
- Not acceptable: `2026-04-21-Some-Rule-Name.md` (domain prose, not an API identifier)

## Audit Reports vs Findings

Two document classes coexist in this directory, distinguished by frontmatter `type:`.

- **Regular findings** — single issue, single root cause, proposed standard. The default shape described by `TEMPLATE.md`.
- **Audit reports** — sweeps across multiple files or findings that report outcomes (files changed, findings landed, follow-ups). Example: `2026-04-13-e2e-anti-pattern-audit-d168.md`. Audits use `type: audit` in frontmatter to mark the document class.

An optional `audits/` subdirectory MAY host future sweep reports if the flat directory becomes noisy. It is not mandatory — audits can live at the root as long as the `type: audit` marker is present. Consumers filter by frontmatter, not path.

## Pre-Flight Lint Check

`convention-keeper` / `codex-keeper` MUST verify every unprocessed finding has YAML frontmatter (opening `---` on line 1, fields per `TEMPLATE.md`) before accepting it into the pipeline. Findings using ad-hoc `**Date:**` body lines instead of frontmatter must be backfilled before synthesis — the frontmatter fields (`type`, `severity`, `category`, `domain`, `root_cause`) drive grouping.
