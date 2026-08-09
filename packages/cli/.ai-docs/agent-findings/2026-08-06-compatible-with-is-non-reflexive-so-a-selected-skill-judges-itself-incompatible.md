---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/matrix/matrix-resolver.ts
  - src/cli/lib/wizard/build-step-logic.ts
  - src/cli/components/wizard/category-grid.tsx
standards_docs:
  - .ai-docs/reference/features/skill-matrix.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: 'CLI-389 phase C deleted `compatibleWith` on the owner''s 2026-08-07 ruling, and the self-verdict went with it — the whitelist was the only predicate that was not either symmetric or about what the selection reaches, and a selected skill reaches itself. `web-ui-shadcn-ui` selected alone is a clean cell in every category, multi-select included. Pinned by `matrix-resolver.test.ts` → "a selection that excludes nothing" → "never judges a skill against itself", which asserts both the resolver''s own verdict and that the whole catalogue stays clear. The proposed standard is stated in `.ai-docs/reference/features/skills-and-matrix.md` → "Selection semantics: possibility, not presence".'
---

## What Was Wrong

`isIncompatibleByFramework` in `matrix-resolver.ts` asks whether any _current selection_ appears in
a skill's `compatibleWith` list, and the generated lists never name their own skill. A skill is
therefore incompatible with a selection consisting of itself:

```
selection [web-ui-shadcn-ui] → cell web-ui-shadcn-ui: incompatible
   "only compatible with React, Next.js, Remix"
selection [web-framework-react] → resolver verdict for web-framework-react: incompatible
   "only compatible with Motion, Next.js, Remix, … Angular, TanStack Form, Resend"
```

Two things hid it. In a pick-one category the blanket downgrade in `build-step-logic.ts` replaced
every incompatible verdict with `normal`, so the framework rows never showed it. In a multi-select
category nothing hides it — the verdict reaches the cell — but `category-grid.tsx` paints a
selected cell with the selected colour and returns early from `getCompatibilityLabel`, so it is
invisible on screen rather than absent from the data. `shadcn/ui` selected alone is an incompatible
cell today.

That matters beyond cosmetics because the verdict is data other surfaces can read: any consumer
that filters or counts on `advisoryState.status` inherits "the thing you just picked is
incompatible with your picks". The wizard's own `--dry-run`-style summaries and the editor's
contract runner both read cell verdicts, and the editor cannot reproduce this one — `derive.ts`
never disables a selected skill, which is the divergence `todo/editor.md` records as parked under
EDITOR-11 ("a SELECTED skill can be reported incompatible in the CLI but structurally never in the
editor").

## Fix Applied

None on the resolver — the parked question is the owner's to rule on, and the EDITOR-11 narrowing
this was found under was scoped to the downgrade.

The narrowing does keep it off the pick-one grid: a cell there is now judged against the selection
a click on it would produce (its category's own selections dropped), so a selected framework is
evaluated against a selection that no longer contains it and the self-verdict cannot arise. That is
a consequence of the swap rule, not a fix — the multi-select cells still carry the verdict, and the
resolver still produces it for any caller that asks directly.

## Proposed Standard

`isIncompatibleByFramework` should exclude the skill under test from the selections it judges
against — a whitelist answers "what can this sit beside", and a skill sitting beside itself is not
a question. The rule belongs in `.ai-docs/reference/features/skill-matrix.md` beside the
`compatibleWith` semantics, stated as: **relationship predicates evaluate a candidate against the
selection minus the candidate**; `hasDirectConflict` already behaves this way by accident (nothing
conflicts with itself), so the resolver would become consistent rather than newly special.

Until that lands, no new surface should key behaviour on `advisoryState.status` for a _selected_
skill without first deciding what that status means.
