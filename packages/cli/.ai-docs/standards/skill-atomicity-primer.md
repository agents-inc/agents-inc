---
last_validated: 2026-04-21
---

# Skill Atomicity Primer

> This primer outranks `skill-atomicity-bible.md` where the two differ.

## What we're doing

Performing quality passes over every skill in the marketplace to ensure they are succinct, correct, and follow progressive disclosure.

**Important:** These skills were written by AI. Treat existing content as a first draft to question and verify, not authoritative documentation.

## Standards to enforce

All skills must comply with two canonical documents:

- **`skill-atomicity-bible.md`** — A skill discusses only its own domain: every import comes from that domain, every recommendation names a capability rather than another skill's tool, and an adjacent concern appears under **Handled elsewhere**. Violation categories, transformation framework, and the quality gate checklist are all defined there.
- **`prompt-bible.md`** — Skills are prompts, carrying `<critical_requirements>`, `<patterns>` and `<red_flags>` as their three required tags. Read its Skill-Content Tags section before judging skill structure; it carries the full vocabulary and which tags are optional.

**Authoring and repair belong to `skill-summoner`.** An audit that reports and a repair that edits
are two dispatches, not one: the lane that reports quotes what it found and changes nothing, and the
lane that repairs works from those quotes. A lane that repairs what it found leaves no finding for
anyone else to read.

## Requirements per skill

The canonical structure for SKILL.md and the examples folder is defined in **`skill-atomicity-bible.md`** → "Skill Directory Structure". Follow it exactly.

Key reminders for iteration:

- **Question everything**: where a pattern is wrong, over-engineered or outdated, fix it; the reason to keep one is that it is right, not that it is already there
- `examples/core.md` is required in every skill — rename the most fundamental example file into it and leave no stub beside it

### Defect classes to check first

The classes the atomicity bible's §11 Full Audit Command most often returns, run across
`src/skills/` in the marketplace repository:

- **`NEXT_PUBLIC_*` env vars** — replace with generic names (`API_URL`, not `NEXT_PUBLIC_API_URL`)
- **`@repo/*` workspace imports** — replace with generic relative imports
- **Integration sections naming external tools** — remove or genericize
- **Template contamination** — a pattern from one technology's skill appearing in another's (`runInAction()` from MobX inside a vue-i18n skill). Read critical requirements carefully: do they relate to this technology?
- **Missing `core.md`** — a `setup.md` or technology-named file where the fundamental content belongs
- **Missing `<red_flags>` in SKILL.md** — red flags living only in reference.md
- **Wrong API signatures** — not just outdated, but fundamentally wrong (wrong package, wrong parameter shape). Verify the actual import path, not just the function name
- **Content duplicated in 2-3 files** — SKILL.md, reference.md, and examples carrying the same code. Each concept lives in one canonical location

### API verification

- Use the **Context7 MCP server** to look up current documentation
- Verify import paths, method signatures, config syntax, and CLI commands
- Update any deprecated APIs found — replace a deprecated API with its documented current form
- If Context7 has no results, use WebSearch against official docs

### Atomicity audit

- Check every skill for cross-domain violations per the atomicity bible
- Remove or genericize any imports from other domains
- Replace explicit tool recommendations ("use React Query for server data") with generic guidance
- Remove integration guides that name specific external tools
- End every decision tree inside this skill's own domain

## What goes where

Each file has a single job — SKILL.md is the decision layer, example files own full implementations, reference.md owns lookup tables. Each concept lives in one file. See **`skill-atomicity-bible.md`** → "SKILL.md Content Standard" for the full ownership rules.

## What belongs in a skill

Skills are consumed by sub-agents that already carry Claude's full training knowledge. The baseline is high. **A skill should only contain what the agent doesn't already know.**

### Document what the agent does not already know

If it's covered in the first page of the official docs, or is common knowledge for any developer familiar with the technology, leave it out. It wastes context on every invocation.

Examples of what to cut:

- Explaining what `useState` is in a React skill
- Showing a basic `FROM node:20` Dockerfile
- Defining what a "hook" is
- Basic CRUD examples that any developer knows

### Point at the init command rather than restating its output

If content is (a) written once per project, (b) best produced by a CLI init command, or (c) primarily a version-specific schema — it doesn't belong as an example. The agent is better served by being told "run `pnpm init`" or "check the official docs" than by copying a stale YAML block verbatim.

**Exception:** when a config involves non-obvious, recurring decisions across projects (e.g. which Biome lint rules to enable, specific cache strategies in Nx), those _decisions_ can be documented — but as commentary and guidance, not as copy-paste blocks.

> **The test:** Ask "would a competent developer already know this, or would they look it up fresh each time?" If yes to either — cut it. Skills teach the thinking, not the boilerplate.

## Be surgical

**Move what is correct; remove what is wrong.** Content that is right but settles no decision moves
to `examples/` or `reference.md`, and the report says where it went — nothing is lost by relocation,
which is what makes trimming safe. Content that is wrong, superseded, or already stated elsewhere
goes, and the report says which of the three applied.

**Trim the wording either way.** A skill loads whole, so every word is paid for by every task that
touches the technology. Cut the clause restating the one before it, the sentence that only sets up
the next, and the hedges.

**Match the skill's size to the technology.** A simple technology gets a simple skill. Not every skill needs 6+ example files — if the technology is small, a `core.md` with everything in it is perfectly fine. Split only where the technology's own topics call for it; a structure that suits Firebase or MUI suits a small library badly. Some skills will always be small, and that's correct.
