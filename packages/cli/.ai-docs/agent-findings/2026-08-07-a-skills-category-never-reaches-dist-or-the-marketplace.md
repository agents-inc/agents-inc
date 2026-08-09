---
type: audit
severity: low
affected_files:
  - src/cli/commands/build/plugins.ts
  - src/cli/commands/build/marketplace.ts
  - scripts/generate-source-types.ts
standards_docs:
  - .ai-docs/reference/features/plugin-system.md
  - .ai-docs/reference/features/code-generation.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Nothing is broken — but a plausible-sounding verification step is unsatisfiable, and it is worth
writing down before someone else spends the same twenty minutes on it.

A wave that edits `category:` in the skills repo's `metadata.yaml` files invites the check "confirm
the new categories reached `dist`". They cannot. `bun run update-marketplace` in the skills repo
runs `build plugins` then `build marketplace`, and **neither carries `category` through**:

- `dist/plugins/*/` holds `README.md`, `.claude-plugin/plugin.json`, `.claude-plugin/.content-hash`
  and the skill body. `metadata.yaml` is not copied — `find dist -name metadata.yaml` returns zero
  across all 237 plugins.
- `plugin.json` carries `name, version, skills, description, author`. No category.
- `.claude-plugin/marketplace.json` carries no `category` on any of its 237 entries, and the
  generator's own summary says so out loud: `Category breakdown: uncategorized: 237`.

The `Marketplace` type does have an optional `category?: string` field — that is what
`getMarketplaceStats` counts — but the built-in generator never populates it. The field is for
third-party marketplace authors, not for this repo's output.

The category's actual route to a consumer is the other one: `scripts/generate-source-types.ts`
reads `<skills>/src/skills/*/metadata.yaml` directly, and the category lands in the CLI's
`src/cli/types/generated/{source-types,matrix}.ts`, which then get vendored into
`packages/matrix`. `dist/` is not on that path at all.

So for a category-only change the skills-repo rebuild is a **no-op on the diff and still worth
running** — it proves the five edited files still parse and still build — but the verification that
the change landed belongs entirely on the CLI side.

## Fix Applied

None — discovery only. `bun run update-marketplace` was run (via the locally-built CLI rather than
the published `@agents-inc/cli` the script names — see below) and completed cleanly for all 237
plugins; the five moved skills' `plugin.json` files are intact and unchanged. Category membership
was verified where it actually lives, in `SKILL_IDS_BY_CATEGORY` in the regenerated matrix.

Incidental: the skills repo's `update-marketplace` script still invokes `npx @agents-inc/cli`. This
package publishes as `agents-inc` — the `@agents-inc/cli` alias was folded into it in 0.150.0 —
so the script names a package this repo no longer publishes.

## Proposed Standard

Two lines, in two places:

1. `.ai-docs/reference/features/plugin-system.md` should state plainly that **the built plugin and
   the marketplace entry carry no category**, and that `Marketplace.plugins[].category` exists for
   third-party marketplaces only. Right now a reader of that document has no way to know.

2. `.ai-docs/reference/features/code-generation.md` already explains that `generate:types` reads a
   sibling skills checkout. It should add the corollary: **`metadata.yaml` is a generator input, not
   a shipped artefact** — the only fields that reach a consumer's disk are the ones `build plugins`
   copies.

Separately, the skills repo's `update-marketplace` script should be re-pointed at `agents-inc`.
That is a one-word edit in a file this wave had no mandate to touch.
