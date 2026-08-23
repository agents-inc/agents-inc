---
type: standard-gap
severity: low
affected_files:
  - .ai-docs/standards/documentation-bible.md
  - scripts/check-symbol-citations.ts
  - scripts/check-symbol-citations.test.ts
  - e2e/fixtures/project-builder.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-22
reporting_agent: cli-developer
category: typescript
domain: infra
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  documentation-bible.md's non-resolving-forms table gained a fourth row (a name another module
  declares and this one does not import) and a paragraph saying that backticks do not neutralise a
  citation. Both are now gated by scripts/check-symbol-citations.ts, whose suite assembles its
  fixture citations at runtime so the test file cannot report itself.
---

## What Was Wrong

Two facts the compiler-API walk found on its first run that the catalogue of non-resolving forms did
not have, and the second is a trap the rule's own wording sets.

**A fourth form does not resolve: a bare name another module declares and this one does not import.**
`e2e/fixtures/project-builder.ts` cited `createPluginInstalledProject`, which is declared and
exported from `e2e/fixtures/plugin-install-state.ts` — a module that file already imports something
else from. A grep confirms the name instantly, ten call sites use it, and the jump the citation
promises still lands nowhere, because namepath resolution is lexical. The catalogued forms were a
type MEMBER cited from outside it, an `import(...)` namepath, and a bare module path; none of them
covers a plain identifier at module scope, and the table's remedies read as exhaustive.

**Backticking a citation does not make it prose.** The rule is written as _"`{@link X}` is the
citation and a backtick is prose"_, which invites the reading that wrapping a citation in backticks
demotes it. It does not — the JSDoc parser does not read backticks:

```
bun -e 'import ts from "typescript";
const f = ts.createSourceFile("p.ts", "/**\n * A backticked `{@link nowhere}`.\n */\nexport const a = 1;", ts.ScriptTarget.Latest, true);
const found = [];
const walk = (n) => { if (ts.isJSDocLink(n)) { found.push(n.name?.getText(f)); return; } for (const c of n.getChildren(f)) walk(c); };
walk(f); console.log(found);'
```

prints `[ "nowhere" ]`. The consequence is immediate and self-inflicted: the first draft of
`check-symbol-citations.ts` explained the rule with backticked examples in its own docblock and the
checker reported six citations in the file that exists to judge them.

## Fix Applied

The fourth row and the backtick paragraph are in `documentation-bible.md`, and the class is gated:
`scripts/check-symbol-citations.ts` resolves every `JSDocLink` node against the type checker over the
three tsconfig projects `typecheck` names. The `project-builder.ts` site was repaired by backticking
the name and stating its module, which is the table's own remedy for the neighbouring forms.

The suite assembles its fixture citations at runtime rather than writing them out, because a test
file is source: written literally, every fixture in it would be a citation in it, and the real-tree
assertion at the bottom would report its own test data.

## Proposed Standard

Both amendments are already in `documentation-bible.md` -> "Where this stops: in a source comment,
`{@link}` is the citation and a backtick is prose". Nothing further is proposed, and one thing is
deliberately NOT proposed: a rule forbidding citation-shaped text in a document about citations. The
checker reports such a site by file and line, which is cheaper than a rule nobody can apply without
running the checker anyway.

Cross-checked against CLAUDE.md's NEVER/ALWAYS rules; neither amendment conflicts with one.
