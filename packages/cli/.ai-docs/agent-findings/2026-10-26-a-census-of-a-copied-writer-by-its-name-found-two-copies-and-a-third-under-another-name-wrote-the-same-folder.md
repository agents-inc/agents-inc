---
type: convention-drift
severity: low
affected_files:
  - packages/cli/e2e/helpers/test-utils.ts
  - packages/cli/e2e/commands/old-claude-src-folder-is-named-as-ignored.e2e.test.ts
  - packages/cli/e2e/interactive/old-claude-src-folder-at-a-terminal.e2e.test.ts
  - packages/cli/e2e/commands/retired-source-folder.e2e.test.ts
standards_docs:
  - packages/cli/.ai-docs/standards/e2e/anti-patterns.md
date: 2026-10-26
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The copies are gone (CLI-981): writeRetiredSourceFolder in e2e/helpers/test-utils.ts is the one
  writer, all three spec files call it, and the shape census in the body returns no spec file. The
  Proposed Standard's sentence is not written into e2e/anti-patterns.md.
---

## What Was Wrong

`e2e/anti-patterns.md` sends a fixture writer used in two or more files to `test-utils.ts`. The
writer of an old `.claude-src/` folder (its config pair, plus an agent file the user wrote there) was
copied into three spec files. The CLI-931 and CLI-965 testers reported two copies, both named
`oldFolderIn`; the tracker row was written from that. A third, `retiredFolderIn` in
`retired-source-folder.e2e.test.ts`, wrote the same folder with a different config name and file
text, neither of which any assertion reads.

The two reports counted copies by the helper's name. A census by what the writer does finds all
three. From `packages/cli`:

```
grep -rln 'writeProjectConfigIn(' e2e --include='*.e2e.test.ts' | xargs grep -ln 'RETIRED_SOURCE'
```

Before this change it listed the three files above; afterwards it lists none.

Why the copies stayed: both reporting lanes stopped because `test-utils.ts` held another lane's
uncommitted edits. `2026-10-26-five-from-specs-each-declare-their-own-install-surface-snapshot-and-one-reads-a-fourth-folder`
records the same cause for another helper.

## Fix Applied

`writeRetiredSourceFolder(root)` in `e2e/helpers/test-utils.ts`, beside `writeConfigTypes` and
`writeCorruptConfig`, writes what the two `oldFolderIn` copies wrote. The three spec files call it and
lost their local constants and imports. The third file's fixture now carries the name `old-layout`
and the shared agent text. Its one spec asserts the doctor line and an unchanged tree, so neither
change reaches an assertion.

## Proposed Standard

One sentence for the writers bullet in `e2e/anti-patterns.md`: count copies of a writer by what it
writes (the folder or file it emits), not by its name. Conflicts with no CLAUDE.md rule.
