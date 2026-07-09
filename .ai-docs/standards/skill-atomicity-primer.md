---
last_validated: 2026-04-21
---

# Skill Atomicity Primer

## What we're doing

Performing quality passes over every skill in the marketplace to ensure they are succinct, correct, and follow progressive disclosure.

**Important:** These skills were written by AI. None of the content is gospel — everything should be questioned and verified. Treat existing content as a first draft that needs critical review, not authoritative documentation.

## Standards to enforce

All skills must comply with two canonical documents:

- **`skill-atomicity-bible.md`** — A skill discusses ONLY its own domain. No cross-domain imports, no tool recommendations from other skills, no integration guides naming specific external tools. Violation categories, transformation framework, and the quality gate checklist are all defined there.
- **`prompt-bible.md`** — Skills are prompts. They must use XML semantic tags (`<critical_requirements>`, `<critical_reminders>`, `<patterns>`, etc.), emphatic repetition for critical rules (at top AND bottom), positive framing, and investigation-first structure. Read this before judging skill structure.

## Requirements per skill

The canonical structure for SKILL.md and the examples folder is defined in **`skill-atomicity-bible.md`** → "Skill Directory Structure". Follow it exactly.

Key reminders for iteration:

- **Question everything**: if a pattern seems wrong, over-engineered, or outdated, fix it — don't preserve it just because it was there
- Old monolithic example files should be deleted once content is moved to `core.md` + topic files — do not leave redirect stubs
- `examples/core.md` is ALWAYS required — rename the most fundamental example file if needed

### Learnings from Iteration 1

Common defects found across 99 skills — check for these first:

- **`NEXT_PUBLIC_*` env vars** (~25 skills) — replace with generic names (`API_URL`, not `NEXT_PUBLIC_API_URL`)
- **`@repo/*` workspace imports** (~15 skills) — replace with generic relative imports
- **Integration sections naming external tools** (nearly every skill) — remove or genericize
- **Template contamination** — `runInAction()` (MobX) appeared in vue-i18n, tRPC, and Remix skills. Read critical requirements carefully: do they actually relate to THIS technology?
- **Missing `core.md`** (~15 skills) — many had `setup.md` or technology-named files instead
- **Missing `<red_flags>` in SKILL.md** (~20 skills) — red flags existed only in reference.md
- **Wrong API signatures** — not just outdated, but fundamentally wrong (wrong package, wrong parameter shape). Verify the actual import path, not just the function name
- **Content duplicated in 2-3 files** (~30 skills) — SKILL.md, reference.md, and examples all had the same code. Each concept should live in ONE canonical location

### API verification

- Use the **Context7 MCP server** to look up current documentation
- Verify import paths, method signatures, config syntax, and CLI commands
- Update any deprecated APIs found — do not preserve incorrect examples just because they were there
- If Context7 has no results, use WebSearch against official docs

### Atomicity audit

- Check every skill for cross-domain violations per the atomicity bible
- Remove or genericize any imports from other domains
- Replace explicit tool recommendations ("use React Query for server data") with generic guidance
- Remove integration guides that name specific external tools
- Decision trees must not exit to another domain's tool by name

## What goes where

Each file has a single job — SKILL.md is the decision layer, example files own full implementations, reference.md owns lookup tables. Never duplicate content across files. See **`skill-atomicity-bible.md`** → "SKILL.md Content Standard" for the full ownership rules.

## What belongs in a skill

Skills are consumed by sub-agents that already carry Claude's full training knowledge. The baseline is high. **A skill should only contain what the agent doesn't already know.**

### Don't document the obvious

If it's covered in the first page of the official docs, or is common knowledge for any developer familiar with the technology, leave it out. It wastes context on every invocation.

Examples of what to cut:

- Explaining what `useState` is in a React skill
- Showing a basic `FROM node:20` Dockerfile
- Defining what a "hook" is
- Basic CRUD examples that any developer knows

### Don't document boilerplate or one-time setup configs

If content is (a) written once per project, (b) best produced by a CLI init command, or (c) primarily a version-specific schema — it doesn't belong as an example. The agent is better served by being told "run `pnpm init`" or "check the official docs" than by copying a stale YAML block verbatim.

**Exception:** when a config involves non-obvious, recurring decisions across projects (e.g. which Biome lint rules to enable, specific cache strategies in Nx), those _decisions_ can be documented — but as commentary and guidance, not as copy-paste blocks.

> **The test:** Ask "would a competent developer already know this, or would they look it up fresh each time?" If yes to either — cut it. Skills teach the thinking, not the boilerplate.

## Be surgical

**Only remove content that is genuinely wrong, outdated, or actively unhelpful.** Do not trim content just because it could theoretically be shorter. If something is correct and adds value — even a little — leave it. The cost of losing useful information permanently is higher than the cost of a few extra lines. When in doubt, keep it.

**Don't over-engineer the skill itself.** A simple technology gets a simple skill. Not every skill needs 6+ example files — if the technology is small, a `core.md` with everything in it is perfectly fine. Don't split into many files just to match a structure that only makes sense for large technologies like Firebase or MUI. Some skills will always be small, and that's correct.
