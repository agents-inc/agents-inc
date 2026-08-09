---
type: standard-gap
severity: low
affected_files:
  - .prettierignore
standards_docs:
  - .ai-docs/standards/commit-protocol.md
date: 2026-08-09
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Found

`bun run format:check` in `packages/cli` reports a second file it cannot be clean about:

```
[warn] .claude-src/config.ts
```

`.claude-src/` is the CLI's own installed state — the directory `init` writes. It is git-ignored
(root `.gitignore:44`), so nothing in it is ever committed, and its `config.ts` is written by the
CLI's config writer, whose canonical form is not Prettier's (`"source":` and `"name":` come out
quoted, `skills`/`agents` do not).

`packages/cli/.prettierignore` lists `dist/`, `node_modules/`, caches, `*.js.map`,
`.claude_backup/`, `CLAUDE.md`, `V2.md` and `todo/*` — but not `.claude-src/`. Its own header
explains why that list exists at all: Prettier reads only the `.gitignore` in its working
directory, and the rules moved to the root `.gitignore` when this package stopped being the
repository root, so the entries were restated here "to keep `prettier --check .` agreeing with git
from either place". `.claude-src` was missed in that restatement.

The consequence is that the format gate is red for anyone who has ever run the CLI against this
package directory — a hand-run of `init` from `packages/cli`, which is exactly what step 5 of the
repository's own implementation process asks for ("run it by hand through the CLI"). The gate then
fails for a reason unrelated to the diff under test, and the only ways out are deleting a directory
the CLI legitimately owns or formatting a file the CLI will rewrite.

## Why It Was Not Fixed Here

Adding one line to `.prettierignore` is not in CLI-455's scope, and the ruling for it is not
obvious from outside: `.claude-src/config.ts` could equally be argued to belong to the config
writer's own canonical-form spec (make the writer emit Prettier-clean output) rather than to
Prettier's ignore list.

## Recommendation

Pick one and record it:

- **Ignore it** — add `.claude-src/` to `packages/cli/.prettierignore`, alongside the other
  restated `.gitignore` entries. Cheapest, and consistent with the file's stated purpose: git
  ignores it, so Prettier should too.
- **Or make it clean** — have `config-writer.ts` emit unquoted keys so a written config is already
  Prettier-shaped. Larger, and it makes a generated file's formatting a product requirement.
