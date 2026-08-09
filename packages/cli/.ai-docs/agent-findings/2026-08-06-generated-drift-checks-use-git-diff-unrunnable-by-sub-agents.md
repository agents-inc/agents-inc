---
type: convention-drift
severity: medium
affected_files:
  - package.json
  - scripts/run-generate-matrix-package.ts
  - scripts/generate-matrix-package.ts
standards_docs:
  - .ai-docs/standards/commit-protocol.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Three generator drift-checks exist and two of them cannot be run by a sub-agent.

`generate:matrix:check` detects drift inside the generator itself — `check({ matrixRoot })`
in `scripts/generate-matrix-package.ts` compares emitted output against what is on disk and
returns `{ clean, drifted }`. No git, no working-tree dependency.

Its two siblings in `package.json` do the same job through git instead:

    "generate:types:check":   "bun run generate:types && git diff --exit-code src/cli/types/generated/"
    "generate:schemas:check": "bun run generate:schemas && git diff --exit-code src/schemas/"

Both CLAUDE.md files forbid sub-agents from running git commands, and every delegation prompt
repeats it verbatim ("Do NOT run any git commands"). So a sub-agent asked to regenerate types or
schemas — which is exactly who does that work, since the same rules forbid hand-editing generated
files — has no runnable way to verify its own regen. On this task the flag flips had to be verified
by reading the emitted files and diffing them by eye, while the matrix half of the identical
verification was one green command.

There is a second, git-independent problem the two scripts share, already noted from another angle
in `2026-08-06-skills-repo-never-validated-against-its-own-metadata-schema.md`: they regenerate
before comparing, so they report "did the committed output match" rather than "is the output
current", and they only detect drift for files git is already tracking. A newly emitted untracked
file passes `git diff --exit-code` silently. The in-generator check has neither weakness.

## Fix Applied

None — discovery only. The task's write scope was two `exclusive` flags in
`default-categories.ts` plus the generated artifacts downstream of them; `package.json` and the
generator scripts are outside it. Verification for this task was done by reading the emitted files
directly (`src/cli/types/generated/matrix.ts`, `packages/matrix/src/vendor/generated/matrix.ts`)
and by `generate:matrix:check`, which passed.

## Proposed Standard

Move the two git-based checks to the mechanism their sibling already uses, then record the rule.

1. **Give `generate-source-types.ts` and `generate-json-schemas.ts` a `--check` flag** that emits
   to memory, compares against disk, and exits non-zero naming the drifted files — mirroring
   `check()` in `scripts/generate-matrix-package.ts`, which is the working precedent and needs no
   design work. Repoint `generate:types:check` and `generate:schemas:check` at it. `prepublishOnly`
   keeps working and gains untracked-file coverage.

2. **A rule in `.ai-docs/standards/commit-protocol.md`, beside the release checklist that invokes
   these scripts:** a verification script must not depend on git state. Anything an agent is
   expected to run as a gate has to be runnable under the no-git rule that the same document's
   delegation guidance imposes — otherwise the gate exists only for humans, and the agent doing the
   regen is precisely the party that cannot check it.
