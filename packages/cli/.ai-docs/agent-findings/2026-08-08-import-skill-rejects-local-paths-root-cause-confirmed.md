---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/commands/import/skill.ts
  - e2e/commands/import-skill.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-08
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: scope-discipline-deferred
status: open
---

## What Was Wrong

`import skill` cannot import from a local repository, and the five `it.fails` specs in
`commands/import-skill.e2e.test.ts` are the only record that the whole happy path is dark. The
command ships, is advertised in `--help`, and no E2E proves it can import anything.

**Root cause, confirmed by experiment rather than by reading.** `parseGitHubSource` in
`src/cli/commands/import/skill.ts` ends with a GitHub-shorthand branch:

```ts
if (source.includes("/") && !source.includes(":")) {
  return {
    gigetSource: `${GITHUB_SOURCE.GITHUB_PREFIX}${source}`,
    displaySource: `${GITHUB_SOURCE.HTTPS_PREFIX}${source}`,
  };
}
```

An absolute path matches it — `/tmp/repo` contains `/` and no `:` — so it is rewritten to
`github:/tmp/repo` and the fetch fails. `fetchFromSource` already handles local paths
(`isLocalSource` → `fetchFromLocalSource`), so nothing downstream is missing: the corruption
happens before it and is the whole defect.

**A second, separate gap the audit's one-liner did not name.** Even with the parse fixed, the five
existing specs would still fail: they point the command at `createE2ESource()`'s output, which
writes skills to `src/skills/` (the marketplace layout), while `import skill` reads
`DEFAULT_SKILLS_SUBDIR` — a top-level `skills/` — because that is a third-party GitHub repo's
layout. The specs need a repo fixture in the layout the command documents, not the marketplace
fixture. `createImportSource` in `src/cli/lib/__tests__/helpers/disk-writers.ts` already writes
exactly that layout for the unit tests.

**Both claims were verified end to end** before the work was parked: a one-line predicate
(`path.isAbsolute(source) || source.startsWith(".")`, guarded ahead of the shorthand branch so
`owner/repo` still normalises) plus a repo fixture in the documented layout turned all five
`it.fails` green against the real binary — `--list`, `--skill`, duplicate detection, `--force` and
`--all`. Disabling the predicate again turned exactly those five red and left the nine error-path
specs green, which is the mutation check the fix would have needed.

## Fix Applied

None — reverted. **Owner ruling, 2026-08-08:** `import skill` is parked alongside `new agent` /
`new skill` / `new marketplace` because its implementation is going to change, so greening these
specs is work that the rewrite would discard. The `it.fails` markers, their `// BUG:` comments and
`parseGitHubSource` are all back exactly as they were, and `.ai-docs/standards/e2e/user-journeys.md`
records the journey as PARKED rather than as a gap.

This finding exists so the next person to open the command does not have to re-derive the cause: it
is one predicate and one fixture layout, and both are described above.

## Proposed Standard

The parked-journey rule now lives in `.ai-docs/standards/e2e/user-journeys.md` → "Parked journeys".
The entry it should keep making is the one this finding turns on:

> A parked journey's specs pin the CURRENT broken behaviour. Do not "fix" them into passing, and do
> not delete them — the `it.fails` markers are the only standing evidence that the journey is dark.
> When the implementation lands, the specs are rewritten from the journey's four assertion surfaces,
> not repaired assertion by assertion.

Separately, `src/cli/commands/import/skill.ts`'s `source` arg description advertises only GitHub
forms (`github:owner/repo`, `https://…`, `owner/repo`). Whatever the rewrite decides about local
paths, the help text and the parser should agree — today the parser silently accepts a local path
shape and mangles it rather than rejecting it with a message.
