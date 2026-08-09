---
type: convention-drift
severity: low
affected_files:
  - packages/cli/.ai-docs/reference/boundary-map.md
  - packages/cli/.ai-docs/reference/leaf-exports.md
  - packages/cli/.ai-docs/reference/store-map.md
  - packages/cli/.ai-docs/reference/wizard/state-transitions.md
  - packages/cli/src/agents/reviewer/reviewer/output.md
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`npm run format:check` in `packages/cli` exits non-zero on ten markdown files that no current task
touched — five `.ai-docs/agent-findings/` entries dated 2026-08-06, four `.ai-docs/reference/` docs,
and `src/agents/reviewer/reviewer/output.md`. Every `.ts` and `.tsx` file in the package is clean.

This matters because of the asymmetry in what enforces what. `lint-staged` and the root `format`
script both scope to `{ts,tsx}` — the root script says so in an explicit `//format` note, and
widening it "is a separate decision". But `format:check` is bare `prettier --check .`, which reads
`.prettierignore` and nothing else, so it covers markdown. The result is a gate that no pre-commit
hook can keep green: a markdown file can only be formatted by someone running Prettier over it by
hand, and nothing prompts them to.

`prepublishOnly` runs `format:check` first, so this is a release blocker sitting in the tree, not a
cosmetic nit. `DOCUMENTATION_MAP.md`'s "Tooling Gates" section states that ESLint runs clean over
the whole package and that any problem you see is yours; it makes no equivalent claim for Prettier,
and right now it could not.

## Fix Applied

None — out of scope for this task, which changed four `.ts` files and the generated artefacts, all
of which format clean. Recorded rather than fixed so that the next agent running the gate does not
spend time deciding whether the ten warnings are theirs. They are not: none of the ten files is
touched by CLI-389 wave 3.

## Proposed Standard

Decide the scope question once and make the three surfaces agree. Either narrow `format:check` to
`{ts,tsx}` so it matches `lint-staged` and the root `format` script — in which case the markdown
drift is deliberate and unenforced, and should be said so — or widen `lint-staged` and the root
`format` glob to include markdown and format the ten files once. Whichever way it goes, record the
resulting claim in `DOCUMENTATION_MAP.md` beside the existing ESLint one, so "expect exit 0" is
stated for Prettier or explicitly withheld.
