---
type: anti-pattern
severity: medium
affected_files:
  - ../skills/src/skills/web-ui-ant-design/examples/layout.md
  - ../skills/src/skills/web-ui-ant-design/examples/pro-components.md
  - ../skills/src/skills/web-state-redux-toolkit/examples/testing.md
  - ../skills/src/skills/web-i18n-next-intl/examples/markup.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
date: 2026-09-04
reporting_agent: skill-summoner
category: typescript
domain: web
root_cause: missing-rule
status: open
---

## What Was Wrong

Skill example files are prose documents containing fenced code, and **nothing in the toolchain
compiles what is inside a fence**. Prettier parses a fence to reformat it, which catches a syntax
error and nothing else — an identifier that is never declared, never imported and never marked as a
placeholder reformats cleanly and reads as finished code.

Four instances, found by reading fourteen files rather than by a grep, so this is a **sample and not
a census**. Each is in the `agents-inc/skills` repository, not in this one:

- `web-ui-ant-design/examples/layout.md` — `ResponsiveGrid` renders `<Card title="Panel 1" />`
  three times; the block imports `{ Row, Col }` from `antd` and never `Card`. The nearest thing to
  a reader's check is that the sibling `data-display.md` block does import it.
- `web-ui-ant-design/examples/pro-components.md` — the ProTable CRUD block called `handleEdit`,
  `fetchProducts`, `createProduct` and `deleteProduct`, none of them declared anywhere in the file.
  `handleEdit` is the sharpest of the four because it reads as a local handler the reader has
  simply not scrolled to.
- `web-state-redux-toolkit/examples/testing.md` — `global.fetch = mockFn()...` twice, with a
  comment saying "using your test runner's mock API" that never binds `mockFn` to anything.
- `web-i18n-next-intl/examples/markup.md` — `sanitize(userContent)` in the block whose entire
  subject is not shipping an XSS hole.

The shape is consistent: the undeclared symbol is always a **data-layer or tooling call**, i.e.
exactly the part of an example an author considers out of scope and elides. That is what makes it
survive review — the elision is deliberate and the reader agrees with it. What the reader cannot do
is tell an intended elision from an omission, because the two are spelled identically.

This is the near neighbour of the defect the 2026-08/09 skill-rewrite programme rated its worst: a
tidy-up that produced `queryUsers(DATABASE_SECRET)`, a call that resolved and was false. An
undeclared identifier is the same failure with the sign flipped — it does not resolve, and nothing
says so either.

## Fix Applied

Repaired in all four files, without changing what any example teaches:

- `Card` added to the `antd` import.
- The three product API calls given one `import { fetchProducts, createProduct, deleteProduct }
  from "./product-api";` under a `// Your own data layer` comment, and `handleEdit` turned into an
  `onEdit` prop on `ProductManagementProps` — so the edit surface is owned by a caller rather than
  by a function that does not exist.
- `mockFn` bound by the block's header comment: "`mockFn` stands for its mock factory - vi.fn,
  jest.fn, mock.fn".
- `sanitize` given an `import { sanitize } from "./sanitize";` under a comment naming DOMPurify as
  the kind of thing meant.

Two placeholder styles are in play there deliberately. A **local module import** is right where the
reader is expected to have their own implementation (`./product-api`, `./sanitize`). A **named
comment** is right where the symbol stands for whichever tool the reader already runs (`mockFn`),
because an import would name a test runner the skill is deliberately agnostic about.

## Proposed Standard

Add to `.ai-docs/standards/skill-atomicity-bible.md`, in the section governing `examples/` content
(alongside the existing rules on codebase-specific imports and cross-domain leaks):

> **Every identifier a fenced example uses is declared in the fence, imported in the fence, or
> bound by a comment that names what it stands for.** A fence is never type-checked, so an
> undeclared symbol is indistinguishable from an intended elision — and a reader who pastes the
> block gets an error naming a symbol the skill never mentioned again. Where the elided thing is
> the reader's own module, import it from a plainly-local path (`./product-api`). Where it stands
> for a tool the skill is agnostic about, bind it in a comment (`` `mockFn` stands for your
> runner's mock factory ``). Where it is a real package, import it properly.

I have checked this against `CLAUDE.md`'s NEVER/ALWAYS rules and it conflicts with none of them.
The nearest is the ban on codebase-specific imports in skills (`@repo/ui`, `@/lib/db`), which this
sits beside rather than against: `./product-api` is a relative path with a generic name, which is
the form that rule already prescribes.

**No checker is proposed, and the reason is worth recording.** The obvious one — extract each
fence, run `tsc` — fails on the majority of fences by design, because a skill example is a fragment
whose surrounding types live in the reader's project. A checker that reports every fragment reports
nothing. The enforceable half is narrower and may be worth a follow-up: for a fence that carries at
least one `import` statement, every free identifier in call position resolves to an import, a local
declaration, a known global, or a comment in the fence naming it. The four hits above all sit in
fences that do import something, so that narrower rule would have caught all four.
