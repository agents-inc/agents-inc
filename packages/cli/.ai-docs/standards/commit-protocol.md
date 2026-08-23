---
last_validated: 2026-04-21
---

# Commit Protocol for AI Agents

Quick reference for AI agents making commits to this repository.

## Commit Standards

### Conventional Commits Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `style`, `perf`

**Examples:**

- `feat(wizard): add domain selection step`
- `fix(compile): ensure output directory exists before dry-run`
- `docs: update TODO with task progress`
- `test: refactor tests to use shared helpers`

### Co-Author Rules

- ❌ **NEVER add Claude as co-author**
- ❌ Do NOT include `Co-Authored-By: Claude` in commit messages

## Sequential Commits

When creating multiple commits in sequence:

1. ✅ Run tests on the **first commit** only
2. ✅ Run tests on the **last commit** only
3. ❌ Skip tests for intermediate commits (use `--no-verify`)

## Gates

**A gate an agent must run cannot depend on git state.** Every delegation prompt here forbids
sub-agents from running a git command that writes, and the agent that regenerated an artefact is
precisely the party who has to verify it. A check shaped as `<generator> && git diff --exit-code
<path>` fails that twice over: it is unrunnable under the rule, and on a curated working tree it
answers "does this differ from what is staged or committed" rather than "is this stale against its
source" — while reporting nothing at all for a path git has never seen, so a generator that starts
emitting a new file passes.

Write the check into the generator instead: emit into memory, compare against the bytes on disk,
name **every** drifted path, exit non-zero. `generate:types:check`, `generate:schemas:check` and
`generate:matrix:check` are all that shape, so `prepublishOnly` can be run by whoever changed the
generator.

### The one roster no gate covers

**A change to `AGENT_NAMES` updates the "Subagents" table in `packages/cli/README.md` in the same
commit.** Every other copy of that roster is bound to source by something: `check-enumeration-drift.ts`
holds `AGENT_NAMES` against `reference/type-system.md`, `agent-roster.test.ts` owns the grid-row
questions, and the type system reddens a stale constant that carries its `satisfies` clause. The
README's table is bound by nothing — no script reads `packages/cli/README.md`, and it is the file a
prospective user reads first, so a retired sub-agent survives there in public.

The two sides agree today at eighteen names in both directions, which is what makes the check cheap
to keep true:

```
comm -3 \
  <(sed -n '/^## Subagents/,/^Each subagent/p' README.md | grep -oP '`[a-z-]+`' | tr -d '`' | sort -u) \
  <(sed -n '/^export const AGENT_NAMES/,/^] as const/p' src/cli/types/generated/source-types.ts \
      | grep -oP '"[a-z-]+"' | tr -d '"' | sort -u)
```

Empty in both directions is the passing state. The glob-shaped entries in the table's Reviewer and
Planning rows (`meta-reviewing-*`, `meta-planning-*`) name skills rather than sub-agents and the
first command deliberately does not match them, because a `*` is not in its character class.

## Release Checklist

Every release MUST complete all steps. No exceptions.

- [ ] Bump version in `package.json`
- [ ] Create `changelogs/{version}.md` with full release notes
- [ ] Prepend brief summary to `CHANGELOG.md` with link to detailed file
- [ ] Release commit title uses em-dash (`—`, not `-`) separator: `chore(release): {version} — {summary}`
- [ ] Summary references every task ID shipped in the release (e.g. ``)
- [ ] Every ticket with a `### D-xxx` subheading in the detailed `changelogs/{version}.md` MUST have at least one corresponding bullet in the `CHANGELOG.md` summary block for that release. Zero tolerance for "cleanup tickets" that get folded into prose without their own bullet — if a ticket earned a detailed subheading, it earned a summary bullet. Mechanically checkable: grep `### D-` in the detailed file, grep `D-xxx` in the corresponding `CHANGELOG.md` block, diff the sets.
- [ ] Every `.ai-docs/agent-findings/*.md` path cited in the changelog must exist on disk
- [ ] Never edit old entries in `CHANGELOG.md` or old `changelogs/` files
- [ ] Publish: `npm publish` from `packages/cli`

### CHANGELOG.md Format (Summary)

```markdown
## [{version}] - {date}

**Brief one-line summary**

Key highlights (2-3 bullets max)

See [changelogs/{version}.md](./changelogs/{version}.md) for full details.
```

### changelogs/{version}.md Format (Detailed)

```markdown
# Release {version} ({date})

{One-line headline referencing all shipped task IDs in parentheses}

## Added

- Feature descriptions with context

## Changed

- Modification descriptions

## Fixed

- Bug fix descriptions (group under `### D-xxx — {title}` subheadings when a release bundles multiple tickets)

## Removed

- Removed feature descriptions
```

**Optional sections** (use when applicable; keep in this order after the core four):

- `## Backlog` — newly filed or deferred tickets spawned by this work, with plan-file paths
- `## Findings` — bullet list of `.ai-docs/agent-findings/*.md` paths written during this release cycle
- `## Proposed standards` — documentation/standards changes this release recommends but does not itself land

Every `### D-xxx —` subheading must correspond to a task ID listed in the release commit summary, and vice versa — no silent bundling.
