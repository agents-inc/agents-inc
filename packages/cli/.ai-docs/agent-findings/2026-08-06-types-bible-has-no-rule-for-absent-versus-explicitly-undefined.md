---
type: missing-standard
severity: medium
affected_files:
  - packages/typescript-config/base.json
  - packages/matrix/src/read-model/stacks.ts
  - packages/matrix/src/read-model/sub-agents.ts
  - apps/editor/src/components/skill-icon.tsx
  - apps/editor/src/features/configure/lib/derive.ts
  - apps/editor/src/lib/api/github-skills.ts
  - apps/editor/src/lib/observability/sentry.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-06
reporting_agent: cli-developer
category: typescript
domain: shared
root_cause: missing-rule
status: resolved
resolved_by: >-
  CLI-421 (2026-08-07) added `typescript-types-bible.md` §4a "Absent vs Explicitly `undefined`",
  sited next to §4 as proposed and framed the same way — §4 rules on a missing map ENTRY, §4a on a
  missing PROPERTY. It carries the three-way decision verbatim (build-it-yourself → spread-
  conditional; handing a maybe-value to a type you do not own → spread-conditional, always; React
  prop whose body already conflates the two → `?: T | undefined`), states that the spread-conditional
  is the default and widening the exception, and bans both dodges: never `?? fallback` (the
  silent-fallback failure CLAUDE.md's Data Integrity rules already forbid) and never delete the `?`
  (that moves the lie rather than fixing it). The CLAUDE.md line this finding also suggested was not
  added — §4a states the `??` ban directly and cites the existing Data Integrity rule it derives
  from, so no second copy was created.
---

## What Was Wrong

CLI-396 turned on `exactOptionalPropertyTypes` repo-wide, which splits a single question into
two answers for every optional property: is the value **absent**, or is it **present and
`undefined`**? Every fix has the same fork —

```ts
// (a) keep absence real
...(stack.group !== undefined && { group: stack.group }),

// (b) say the property honestly holds undefined
slug?: string | undefined
```

— and `.ai-docs/standards/typescript-types-bible.md` says nothing about which to reach for.
§4 covers `Partial<Record<K, V>>` and asserting lookups, so the codebase has a rule for a
_missing map entry_ and none for a _missing property_. The two are the same question one level
down.

The gap is not academic: (b) applied by reflex is how you get a type that admits `undefined`
everywhere and an optional property that no longer means anything, which is the failure the flag
exists to prevent. There is also no rule saying which side of a boundary you are allowed to
change — three of the seven fixes here were against types this repo does not own (Sentry's
`Partial<ScopeContext>`, the DOM's `RequestInit`, Playwright's config), where (b) is not
available at all.

The convention already existed in code and nowhere else. `apps/editor/src/features/configure/lib/seed.ts`
and `apps/editor/src/stores/config-store.ts` were both written with the spread-conditional form
before the flag was on. Reading those two files is currently the only way to learn the house
style.

## Fix Applied

Both flags are on in `@workspace/typescript-config/base.json` with a decision comment. All ten
errors outside `packages/cli` were fixed by the rule below — three in `packages/matrix`, seven in
`apps/editor` — and both suites, the editor's Playwright run and `turbo typecheck` are green.

The rule I applied, in the absence of a documented one:

1. **We build the object and the field is genuinely sometimes absent → spread-conditional.**
   `CatalogStack.group` ("never set by the CLI today"), `SubAgent.model`,
   `SkillCellView.incompatibleReason`. Absence stays absence, so `?` keeps meaning what it says.
2. **We hand a maybe-value to a type we do not own → spread-conditional, always.** Widening is
   not on offer, and `?? null` / `?? {}` would be inventing a value their API did not ask for.
   `RequestInit.signal`, Sentry's `extra`, Playwright's `workers`, the three
   `sentryVitePlugin` env options.
3. **It is a React prop whose body already treats absent and `undefined` identically →
   `?: T | undefined`.** JSX has always read an undefined prop as an absent one, which is why
   `@types/react` writes every prop it owns that way, and why `title={view.incompatibleReason}`
   in `skill-cell.tsx` never errored while our own `SkillIcon` next to it did. A conditional
   spread in JSX buys nothing and costs a reader.

`packages/cli` is opted out of both flags with the debt recorded in its `tsconfig.json` — 597
errors over 129 files, against 3 and 7 in the two workspaces above. Nothing about that split is
this finding's subject; the rule is what is missing.

## Proposed Standard

A new section in `.ai-docs/standards/typescript-types-bible.md`, next to §4 (`Partial<Record<>>`),
carrying the three-way decision above verbatim — same shape as §4's rule for map entries, since
it is the same question about a property rather than a key. It should state:

- The default is the spread-conditional `...(v !== undefined && { x: v })`. Widening to
  `?: T | undefined` is the exception and needs the React-prop reason or an equivalent.
- Never `?? fallback` to dodge the flag: inventing `null`, `""` or `{}` where the caller had
  nothing is the same silent-fallback failure the Data Integrity rules already ban in CLAUDE.md.
- Never delete the `?`. Making a property required to satisfy the flag moves the lie rather than
  fixing it.

Worth a matching line under CLAUDE.md → "NEVER do this" → Data Integrity, since the `??`-to-dodge
case is that list's subject and the flag makes it newly tempting.
